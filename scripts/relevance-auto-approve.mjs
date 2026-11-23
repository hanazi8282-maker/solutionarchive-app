#!/usr/bin/env node
// T2 완전 동의 자동 승인(rr-v2) — 1차(verdict)·2차(second_verdict)가 둘 다 relevant 이고 정보 있음(product_informative·
// second_product_informative)이 둘 다 true 인 판정 행에 auto_approved_at 을 찍는다. 마이그 000027·000031 이 전제다.
//
// ⛔ 기본 꺼짐. 리포 변수 AUTO_APPROVAL_ENABLED=true 와 AUTO_APPROVAL_SINCE=<YYYY-MM-DD> 가 둘 다 있어야 돈다.
//    켜는 조건(CLAUDE.md §10.1 예외 조건 2): docs/t2-relevance-criteria.md 기준 통일 + SaaS 100건 재시험 90% 이상.
//    SINCE 는 통일 기준이 main 에 들어간 날(KST) — 그 전에 판정된 1차 행은 옛 기준이라 대상이 아니다.
//
// 하는 것: 게이트(플래그 → 시행일 → 킬스위치, lib/analysis/auto-approval.ts) → 대상 조회 → 조건부 UPDATE.
// 안 하는 것: verdict·human_verdict·라벨을 쓰지 않는다. 케이스(case_studies/case_moves)·등급·발행을 건드리지 않는다(조건 5).
// 킬스위치가 걸리면: 승인 0건 + agent_runs step blocked + Notion 일일 상태 로그(사람판단필요=true). 다시 켜는 것은 사람이다 —
//   기계는 끄기만 한다. 감사가 쌓여 창이 좋아지면 다음 실행에서 자연히 다시 열리지만, 꺼진 동안엔 새 승인이 없어 감사 대상도
//   늘지 않으므로 사실상 사람이 감사를 채워야 풀린다(설계 §5).
//
//   node --env-file=.env.local scripts/relevance-auto-approve.mjs --dry
//   node --env-file=.env.local scripts/relevance-auto-approve.mjs --gradual-dry   (점진 해제 1~5단계 드라이런 — DB 쓰기 0, 게이트 열림 가정)
//
// 점진 해제(v71dc, lib/analysis/gradual-release.ts): 게이트가 열려도 GRADUAL_RELEASE_ENABLED≠true 면 승인 0건(안전 기본값).
//   켜져 있으면 단계(GRADUAL_RELEASE_STAGE·_SINCE, 사람만 바꾼다)의 하루 상한 − 오늘 이미 승인한 수까지만, 최신 우선·소스 라운드 로빈으로 고른다.
// 종료코드: 0 정상(꺼짐·킬스위치 포함 — 사유는 로그·Notion) · 2 설정/조회 실패 · 3 저장 실패

import { createClient } from '../lib/supabase/server.ts'
import { AUTO_APPROVAL_RULE, autoApprovalGate, parseSince } from '../lib/analysis/auto-approval.ts'
import { countBySource, decideRelease, isEnabled, kstDayRange, loadApprovalPool, loadGuardedAuditWindow, loadReleaseContext, parseStage, parseStageSince, remainingToday, selectRelease, stageCap } from '../lib/analysis/gradual-release.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate, recordStatusLog } from './notion-status-log.mjs'
import { relevanceRunSuffixFromEnv } from '../lib/analysis/session-guard.ts'

const dry = process.argv.includes('--dry')
const gradualDry = process.argv.includes('--gradual-dry')
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => { if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`); log(`⚠️ ${m}`) }
const now = new Date()

// 플래그가 꺼져 있으면 DB 도 열지 않는다 — 꺼진 기능이 실패를 만들지 않게.
// --gradual-dry 는 "게이트가 열렸다고 가정"하는 읽기 전용 계산이라 이 플래그와 무관하게 돈다(쓰기 경로에 닿지 않는다).
if (!gradualDry && String(process.env.AUTO_APPROVAL_ENABLED ?? '').trim().toLowerCase() !== 'true') {
  log('자동 승인 꺼짐(AUTO_APPROVAL_ENABLED≠true) — 아무것도 하지 않는다.')
  process.exit(0)
}

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }

// 감사 창 = 이 규칙(rr-v2)으로 자동 승인됐고 사람 채점이 있는 행. rr-v1 승인은 섞지 않는다(태그별 창, 설계 §6).
// 정보 열이 빈 행은 scoreApproval 이 창에서 뺀다. 조회 실패는 null 로 넘겨 게이트가 끄게 한다(§7.1).
// 2026-11-14: PostgREST 기본 1000행 상한에 안 걸리게 끝까지 읽는다(loadGuardedAuditWindow 안).
// v71dl 가: 승인 가드(applyApprovalGuard — 영역 밖·소비재 태그·github_issues·60자 미만)가 지금 승인하지 않을 행은 창에서 뺀 뒤
//   최근 50건을 잰다. 가드 조건은 대상 풀과 같은 함수에서 온다(복사본 없음). 가드 표를 못 읽으면 감사 조회 실패와 같다.
const aw = await loadGuardedAuditWindow(sb)
if (!aw.ok && (aw.code === '42703' || aw.code === 'PGRST204')) {
  console.error(`✗ 자동 승인 컬럼이 없다(${aw.code}) — 마이그 20260930000027·20260930000031 미적용인데 플래그가 켜져 있다. 켜기 전에 적용하라.`)
  process.exit(2)
}
if (!aw.ok) warn(aw.error)
else log(`감사 창 입력: 사람 채점 rr-v2 ${aw.read}건 − 가드 밖 ${aw.read - aw.audits.length}건 ${JSON.stringify(aw.excluded)} = ${aw.audits.length}건`)

const gate = autoApprovalGate({ enabled: process.env.AUTO_APPROVAL_ENABLED, since: process.env.AUTO_APPROVAL_SINCE, now, audits: aw.ok ? aw.audits : null })
log(`게이트: ${gate.on ? '열림' : '닫힘'} — ${gate.reason}`)

// ── 점진 해제 드라이런: DB 에 쓰지 않는다(tracker·Notion·UPDATE 전에 끝난다). 대상 풀은 실제 승인과 같은 loadApprovalPool.
if (gradualDry) {
  const since = gate.since ?? parseSince(process.env.AUTO_APPROVAL_SINCE)
  if (!since) { console.error('✗ AUTO_APPROVAL_SINCE 가 없거나 날짜가 아니다 — 대상 풀을 계산할 수 없다'); process.exit(2) }
  const today = kstDate(now)
  const { start, end } = kstDayRange(today)
  let approvedToday = 0
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('review_relevance_verdicts').select('input_id').eq('auto_approval_rule', AUTO_APPROVAL_RULE)
      .gte('auto_approved_at', start.toISOString()).lt('auto_approved_at', end.toISOString()).order('input_id').range(from, from + 999)
    if (error) { console.error(`✗ 오늘 승인 수 조회 실패: ${error.message}`); process.exit(2) }
    approvedToday += data.length
    if (data.length < 1000) break
  }
  const pool = await loadApprovalPool(sb, since, process.env.AUTO_APPROVAL_SOURCES)
  if (!pool.ok) { console.error(`✗ ${pool.error}`); process.exit(2) }
  const fmt = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'
  console.log(`\n# 점진 해제 드라이런 — ${today} KST (⚠️ 게이트가 열렸다고 가정한 계산이다. 실제 게이트: ${gate.on ? '열림' : '닫힘'} — ${gate.reason})`)
  console.log('DB 에 쓰지 않는다. 킬스위치 재걸림·단계 내 멈춤은 반영하지 않은 "단계 상한만" 계산이다.\n')
  console.log(`풀(쿼리) ${pool.queried} → 완전 동의 ${pool.agreed} → 영역·소비재 제외 ${fmt(pool.scopeExcluded)} → 내용 가드 탈락 github_issues ${pool.guardDrop.github_issues} · 60자 미만 ${pool.guardDrop.short} · 본문 없음 ${pool.guardDrop.missing} → 허용 목록 밖 ${pool.guardDrop['source-not-allowed']} → 개발자 대상 ${pool.guardDrop['dev-audience']} ${JSON.stringify(pool.devAudience)} → 가드 통과 ${pool.targets.length}`)
  if (pool.entryRule) console.log(`입구 규칙 ${pool.entryRule.version} (${pool.entryRule.mode}): 검사 ${pool.entryRule.checked} · 막힘 ${pool.entryRule.blocked} ${JSON.stringify(pool.entryRule.blockedBySource)}${pool.entryRule.error ? ` · ⚠️ ${pool.entryRule.error}` : ''}`)
  console.log(`소스 허용 목록(AUTO_APPROVAL_SOURCES):${pool.allow ? [...pool.allow].join(', ') : '없음(제한 없음)'}`)
  console.log(`가드 통과 소스 분포: ${fmt(countBySource(pool.targets))}`)
  console.log(`오늘(KST) 이미 rr-v2 승인: ${approvedToday}\n`)
  console.log('| 단계 | 상한 | 오늘 남은 한도 | 승인 | 승인 후 남는 풀 | 소스 분포 |')
  console.log('|---|---|---|---|---|---|')
  for (const st of [1, 2, 3, 4, 5]) {
    const cap = stageCap(st)
    const left = remainingToday(cap, approvedToday)
    const picked = selectRelease(pool.targets, left)
    console.log(`| ${st} | ${cap === Infinity ? '없음' : cap} | ${left === Infinity ? '무제한' : left} | ${picked.length} | ${pool.targets.length - picked.length} | ${fmt(countBySource(picked))} |`)
  }
  process.exit(0)
}

const tracker = dry ? null : await createTracker({
  // 재시도(-r1/-r2)·수동(-m<run_id>) 실행이 같은 날 정규 행(감사 흔적)을 덮지 않게 판정 스텝과 같은 접미사(v30 §5).
  runKey: `relevance-auto-approve-${kstDate()}${relevanceRunSuffixFromEnv()}`,
  dept: 'cto',
  trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'cron' : process.env.GITHUB_ACTIONS ? 'manual' : 'local',
  gitSha: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
})

if (!gate.on) {
  warn(`자동 승인 정지 — ${gate.reason}`)
  if (tracker) {
    await tracker.step({ stepKey: 'gate', label: '자동 승인 게이트', status: 'blocked', seq: 1, blocker: gate.reason, counts: gate.kill ? { audited: gate.kill.n, errors: gate.kill.errors, recent: gate.kill.recent } : {} })
    await tracker.finish({ status: 'blocked', summary: { approved: 0, reason: gate.reason } })
    // 킬스위치는 사람이 알아야 한다 — 기계가 꺼진 채로 조용히 있으면 감사도 멈춘다.
    const w = await recordStatusLog({
      date: kstDate(now), track: 'CTO',
      done: 'T2 자동 승인 킬스위치 작동 — 오늘 자동 승인 0건',
      blocked: gate.reason,
      next: '자동 승인된 행 감사 표본을 채점(relevance-grading-sample.mjs --audit)하고, 원인(모델·기준·소스 변화)을 확인한 뒤 다시 켤지 판단',
      needsHuman: true, // v19 §10.2 예외 8번: 다시 여는 감사 채점은 남헌만 줄 수 있는 입력
      note: `relevance-auto-approve · rule ${AUTO_APPROVAL_RULE}`,
    })
    log(w.ok ? `Notion 기록: ${w.title}` : `Notion 기록 실패 — ${w.stage}: ${w.error}`)
  }
  process.exit(0)
}

// ── 점진 해제(v71dc) — 게이트가 열린 뒤, 대상 조회·DB 쓰기 **전에** 한도를 정한다.
// ⛔ 안전 기본값: GRADUAL_RELEASE_ENABLED≠true 면 게이트가 열려도 승인 0건(종료코드 0). 상한 없는 일괄 승인 경로는 없다.
const todayKst = kstDate(now)
const gradualOn = isEnabled(process.env.GRADUAL_RELEASE_ENABLED)
const stageSinceOk = gradualOn ? parseStageSince(process.env.GRADUAL_RELEASE_STAGE_SINCE, todayKst, now) : null
const ctx = gradualOn && parseStage(process.env.GRADUAL_RELEASE_STAGE) !== null && stageSinceOk
  ? await loadReleaseContext(sb, { stageSince: stageSinceOk, todayKst })
  : null
const release = decideRelease({ enabled: process.env.GRADUAL_RELEASE_ENABLED, gateOn: gate.on, stage: process.env.GRADUAL_RELEASE_STAGE, stageSince: process.env.GRADUAL_RELEASE_STAGE_SINCE, todayKst, now, ctx })
const releaseCounts = { stage: release.stage, effective_stage: release.effectiveStage, approved_today_before: release.approvedToday, cap: release.cap === Infinity ? -1 : release.cap, limit: release.limit === Infinity ? -1 : release.limit, stage_errors: release.stageErrors }
log(`점진 해제: ${release.reason} — ${JSON.stringify(releaseCounts)}`)
if (release.limit === 0) {
  warn(`승인 0건 — ${release.reason}`)
  if (tracker) {
    // stepKey 는 'gate' 가 아니다 — 'gate'∧blocked 는 킬스위치 재걸림 신호라 여기서 쓰면 단계가 1로 떨어진다.
    await tracker.step({ stepKey: 'gradual', label: '점진 해제 한도', status: 'skipped', seq: 2, counts: { approved: 0, ...releaseCounts }, detail: { rule: AUTO_APPROVAL_RULE, gate: gate.reason, reason: release.reason, enabled: release.enabled } })
    await tracker.finish({ status: 'ok', summary: { approved: 0, reason: release.reason } })
  }
  process.exit(0)
}

const pool = await loadApprovalPool(sb, gate.since, process.env.AUTO_APPROVAL_SOURCES)
if (!pool.ok) { console.error(`✗ ${pool.error}`); process.exit(2) }
log(`내용 가드 제외 ${pool.guardDrop.github_issues + pool.guardDrop.short + pool.guardDrop.missing}건 (github_issues·60자 미만·본문 없음)`)
log(`소스 허용 목록 ${pool.allow ? [...pool.allow].join(',') : '없음(제한 없음)'} — 목록 밖 ${pool.guardDrop['source-not-allowed']}건 · 개발자 대상 ${pool.guardDrop['dev-audience']}건 ${JSON.stringify(pool.devAudience)} (승인 안 함, 사람 확인 대기)`)
// v71dx 입구 규칙 — ENTRY_RULES_ENABLED=true 일 때만 pool.entryRule 이 있다(꺼짐이면 이 줄도 안 찍힌다). shadow = 기록만, 승인 불변.
if (pool.entryRule) log(`입구 규칙 ${pool.entryRule.version} (${pool.entryRule.mode === 'shadow' ? '그림자 — 승인 안 바꿈' : '적용 — 막힌 글은 사람 확인 대기'}) 검사 ${pool.entryRule.checked}건 · 막힘 ${pool.entryRule.blocked}건 ${JSON.stringify(pool.entryRule.blockedBySource)}${pool.entryRule.error ? ` · ⚠️ ${pool.entryRule.error}` : ''}`)
const excludedN = Object.values(pool.scopeExcluded).reduce((x, y) => x + y, 0)
log(`대상 ${pool.targets.length}건 (쿼리 ${pool.queried}건 · 완전 동의 ${pool.agreed}건 · 영역 외/소비재 태그 제외 ${excludedN}건 ${JSON.stringify(pool.scopeExcluded)})`)
const targets = selectRelease(pool.targets, release.limit)
const sourceOf = new Map(targets.map((r) => [r.input_id, r.source_key]))
log(`점진 해제 선택 ${targets.length}건 (한도 ${release.limit === Infinity ? '무제한' : release.limit}) 소스 분포 ${JSON.stringify(countBySource(targets))}`)
// 이중 확인 — 선택이 한도를 넘으면 쓰지 않는다(selectRelease 가 깨져도 상한이 지켜지게).
if (!(targets.length <= release.limit)) { console.error(`✗ 선택 ${targets.length}건이 한도 ${release.limit} 를 넘는다 — 승인하지 않는다`); process.exit(2) }
if (dry) { log('--dry: 쓰지 않는다.'); process.exit(0) }

let approved = 0, raced = 0, failed = 0
const approvedIds = []
const stamp = now.toISOString()
for (let i = 0; i < targets.length; i += 200) {
  const ids = targets.slice(i, i + 200).map((r) => r.input_id)
  // WHERE 에 조건을 다시 건다 — 그사이 사람이 채점했거나 2차가 바뀐 행은 덮지 않는다.
  const { data, error } = await sb
    .from('review_relevance_verdicts')
    .update({ auto_approved_at: stamp, auto_approval_rule: AUTO_APPROVAL_RULE })
    .in('input_id', ids)
    .eq('verdict', 'relevant').eq('second_verdict', 'relevant')
    .eq('product_informative', true).eq('second_product_informative', true)
    .is('human_verdict', null).is('auto_approved_at', null)
    .select('input_id')
  if (error) { failed += ids.length; console.error(`✗ 저장 실패(${i + 1}~${i + ids.length}): ${error.message}`); continue }
  approved += data.length
  approvedIds.push(...data.map((x) => x.input_id))
  raced += ids.length - data.length
}

await tracker.step({ stepKey: 'approve', label: '완전 동의 자동 승인', status: failed ? 'failed' : 'ok', seq: 2, counts: { approved, raced, failed, ...releaseCounts }, detail: { rule: AUTO_APPROVAL_RULE, gate: gate.reason, gradual: release.reason, by_source: countBySource(approvedIds.map((id) => ({ source_key: sourceOf.get(id) ?? '?' }))), ...(pool.entryRule ? { entry_rule: pool.entryRule } : {}) } })
await tracker.finish({ status: failed ? 'partial' : 'ok', summary: { approved, raced, failed } })
log(`끝 — 승인 ${approved} · 그사이 바뀌어 건너뜀 ${raced} · 실패 ${failed} · 게이트 ${gate.reason}`)
process.exit(failed ? 3 : 0)
