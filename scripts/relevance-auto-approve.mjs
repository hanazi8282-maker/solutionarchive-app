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
// 종료코드: 0 정상(꺼짐·킬스위치 포함 — 사유는 로그·Notion) · 2 설정/조회 실패 · 3 저장 실패

import { createClient } from '../lib/supabase/server.ts'
import { AUTO_APPROVAL_RULE, autoApprovalGate, isFullAgreement } from '../lib/analysis/auto-approval.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate, recordStatusLog } from './notion-status-log.mjs'

const dry = process.argv.includes('--dry')
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => { if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`); log(`⚠️ ${m}`) }
const now = new Date()

// 플래그가 꺼져 있으면 DB 도 열지 않는다 — 꺼진 기능이 실패를 만들지 않게.
if (String(process.env.AUTO_APPROVAL_ENABLED ?? '').trim().toLowerCase() !== 'true') {
  log('자동 승인 꺼짐(AUTO_APPROVAL_ENABLED≠true) — 아무것도 하지 않는다.')
  process.exit(0)
}

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }

// 감사 창 = 이 규칙(rr-v2)으로 자동 승인됐고 사람 채점이 있는 행. rr-v1 승인은 섞지 않는다(태그별 창, 설계 §6).
// 정보 열이 빈 행은 scoreApproval 이 창에서 뺀다. 조회 실패는 null 로 넘겨 게이트가 끄게 한다(§7.1).
const { data: audits, error: auditErr } = await sb
  .from('review_relevance_verdicts')
  .select('human_verdict, human_product_informative, human_graded_at')
  .not('auto_approved_at', 'is', null)
  .eq('auto_approval_rule', AUTO_APPROVAL_RULE)
  .not('human_verdict', 'is', null)
if (auditErr && (auditErr.code === '42703' || auditErr.code === 'PGRST204')) {
  console.error(`✗ 자동 승인 컬럼이 없다(${auditErr.code}) — 마이그 20260930000027·20260930000031 미적용인데 플래그가 켜져 있다. 켜기 전에 적용하라.`)
  process.exit(2)
}
if (auditErr) warn(`감사 창 조회 실패: ${auditErr.message}`)

const gate = autoApprovalGate({ enabled: process.env.AUTO_APPROVAL_ENABLED, since: process.env.AUTO_APPROVAL_SINCE, now, audits: auditErr ? null : audits })
log(`게이트: ${gate.on ? '열림' : '닫힘'} — ${gate.reason}`)

const tracker = dry ? null : await createTracker({
  runKey: `relevance-auto-approve-${kstDate()}`,
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
      needsHuman: true, // v17: 다시 여는 감사 채점은 사람만 줄 수 있는 입력
      note: `relevance-auto-approve · rule ${AUTO_APPROVAL_RULE}`,
    })
    log(w.ok ? `Notion 기록: ${w.title}` : `Notion 기록 실패 — ${w.stage}: ${w.error}`)
  }
  process.exit(0)
}

// 대상 — 조건은 DB 쿼리와 isFullAgreement 두 번 건다(쿼리를 잘못 고쳐도 순수 함수가 막는다).
const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('review_relevance_verdicts')
    .select('input_id, verdict, second_verdict, product_informative, second_product_informative, human_verdict, judged_at, auto_approved_at')
    .eq('verdict', 'relevant').eq('second_verdict', 'relevant')
    .eq('product_informative', true).eq('second_product_informative', true)
    .is('human_verdict', null).is('auto_approved_at', null)
    .gte('judged_at', gate.since.toISOString())
    .order('input_id').range(from, from + 999)
  if (error) { console.error(`✗ 대상 조회 실패: ${error.code ?? ''} ${error.message}`); process.exit(2) }
  rows.push(...data)
  if (data.length < 1000) break
}
const targets = rows.filter((r) => isFullAgreement(r, gate.since))
log(`대상 ${targets.length}건 (쿼리 ${rows.length}건)`)
if (dry) { log('--dry: 쓰지 않는다.'); process.exit(0) }

let approved = 0, raced = 0, failed = 0
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
  raced += ids.length - data.length
}

await tracker.step({ stepKey: 'approve', label: '완전 동의 자동 승인', status: failed ? 'failed' : 'ok', seq: 2, counts: { approved, raced, failed }, detail: { rule: AUTO_APPROVAL_RULE, gate: gate.reason } })
await tracker.finish({ status: failed ? 'partial' : 'ok', summary: { approved, raced, failed } })
log(`끝 — 승인 ${approved} · 그사이 바뀌어 건너뜀 ${raced} · 실패 ${failed} · 게이트 ${gate.reason}`)
process.exit(failed ? 3 : 0)
