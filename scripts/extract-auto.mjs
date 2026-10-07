#!/usr/bin/env node
// 야간 자동 extract (GitHub Actions 진입점) — 신규 리뷰가 충분히 쌓인 프로젝트만 골라 추출한다.
//
// 남헌 2026-09-23 확정: "신규 리뷰 100건 이상 프로젝트만, 일 $5 상한 안에서, Gemini 429 면 다음 날로."
// 배경·근거: reports/2026-09-23/data-velocity-plan.md §1 Q1 · §6.
//
// 왜 Vercel cron 이 아니라 Actions 인가(2026-09-23 판단):
//   1. extract 1건이 함수 상한(maxDuration 300초)에 가깝다. 한 번의 cron 호출로 N건(기본 3)을
//      돌 수 없어 "1건만 트리거" 구조가 되는데, 그러면 하루 1건이다.
//   2. Vercel cron 라우트를 새로 열려면 `lib/auth/policy.ts` PUBLIC_PREFIXES 에 `/api/cron` 을
//      추가해야 한다 = 인증 경계 확장(CLAUDE.md §10.2 사람 판단 예외). 여기서는 안 건드린다.
//   3. 운영 CLI(`scripts/analyze-extract-run.mjs`)·야간 수집 워크플로와 같은 패턴을 그대로 쓴다.
//   대가: GEMINI_API_KEY 를 GitHub Secrets 에 등록하는 것이 사람 몫으로 남는다. 없으면
//   이 스크립트는 **아무것도 하지 않고 멈춘다**(조용히 도는 것보다 시끄럽게 닫힌다).
//
// 사용:
//   node scripts/extract-auto.mjs --dry      # 대상 선정만. LLM·DB 쓰기 없음
//   node scripts/extract-auto.mjs            # 실제 추출 (LLM 비용 발생)
//
// 적응형 슬롯(남헌 2026-09-28, reports/2026-09-28/extract-adaptive-frequency-design.md): 하루 3슬롯이 각각 먼저
//   백로그(Bw)·하루 상한·한도 쿨다운을 보고(decideSlot) 쉴지 정한다. 쉼도 agent_runs 에 gate 스텝 skipped 로 남긴다.
//   --dry 는 게이트 판정까지 찍는다(agent_runs 읽기만). 수동 실행은 EXTRACT_SLOT_INPUT=s1|s2|s3 로 그 슬롯 문턱을 시험한다.
//
// 세션 한도 가드(남헌 v30 §5 → v32, lib/analysis/session-guard.ts): 한 실행이 쓰는 claude-cli 명목 비용이 소프트 캡
//   (config/session-guard.json, 15% × $0.43/%p = $6.45)에 닿으면 새 프로젝트를 시작하지 않고 남은 프로젝트는 다음 슬롯으로 넘긴다 —
//   status='blocked' · summary.stop_reason='session_cap' · processed/not_started · session(사용 $·%p·5시간 창 합산).
//
// v32: 소프트 캡(15%)은 프로젝트 경계에서 새 시작만 막고 진행 중 프로젝트는 마친다. 하드 캡(30%)은 llm.ts 가 매 호출 시작 전에 본다.
//   한도 오류가 난 프로젝트는 summary.retry_queue 에 넣어 4시간(또는 리셋 시각) 뒤 먼저 다시 돈다(프로젝트당 최대 2회).
//
// 종료코드: 0 정상(대상 0건·쉼·한도·세션 상한·주간 스위치 도달 포함) · 1 한도 blocked 가 연속 3슬롯 또는 프로젝트 재시도 2회 소진(사람이 볼 것) · 2 설정/조회 실패(가드 설정 포함) · 3 추출 실패 1건 이상
//   한도(429/예산)로 멈춘 것은 실패가 아니라 **확인 대상**이라 0 으로 끝내되
//   `::warning::` 애노테이션과 agent_runs.status='blocked' 로 남긴다(CLAUDE.md §7.2).

import { createClient } from '../lib/supabase/server.ts'
import { cliSpent, requiredKeyFor, resolveProvider, setCliHardCap } from '../lib/analysis/llm.ts'
import {
  capReached, capUsdOf, hardCapUsdOf, loadGuardConfig, loadRecentRuns, nextRetryQueue, orderWithQueue, retryQueueOf,
  sessionBlock, sessionLine, spendForCap, usageSince, weeklyGate,
} from '../lib/analysis/session-guard.ts'
import { withLlmBudget, DAILY_BUDGET_USD, dailySpent } from '../lib/analysis/budget.ts'
import { claimExtraction, runExtraction } from '../lib/analysis/extract-run.ts'
import {
  BLOCKED_ALARM_STREAK,
  QUOTA_COOLDOWN_MS,
  autoDailyMax,
  autoMaxProjects,
  autoMinNew,
  backlogOf,
  blockedAlarm,
  decideSlot,
  describePick,
  extractRunKey,
  needsForce,
  newInputsSince,
  parseQuotaResetAt,
  pickAutoTargets,
  resolveSlot,
  slotStateOf,
} from '../lib/analysis/extract-auto.ts'
// 어느 상태가 후보인지는 extract-gate 가 정본이다(claimExtraction 이 같은 canStart 를 본다).
import { AUTO_EXTRACT_STATUSES } from '../lib/analysis/extract-gate.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const minNew = autoMinNew()
const max = autoMaxProjects()
const dailyMax = autoDailyMax()
const today = kstDate()
// 하루 3슬롯(KST 03:33 · 12:33 · 18:33)이 같은 KST 날짜라 run_key 에 슬롯을 붙인다(설계 F3). 표에 없는 크론이면 exit 2.
let runKey
let slot
try {
  const slotEnv = {
    eventName: process.env.GITHUB_EVENT_NAME,
    slotCron: process.env.EXTRACT_SLOT_CRON,
    slotInput: process.env.EXTRACT_SLOT_INPUT,
    runId: process.env.GITHUB_RUN_ID,
  }
  runKey = extractRunKey(today, slotEnv)
  slot = resolveSlot(slotEnv)
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(2)
}

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => {
  // GitHub 이 제공하는 세 번째 상태. 빨간 X(실패)도 초록(정상)도 아닌 것을 그대로 표시한다.
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`)
  log(`⚠️ ${m}`)
}

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (!dry && requiredKey && !process.env[requiredKey]) {
  console.error(`✗ ${requiredKey} 가 없다(provider=${provider}). 추출을 시작하지 않는다 — 시크릿을 등록하라.`)
  process.exit(2)
}

const supabase = await createClient()
if (!supabase) {
  console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  process.exit(2)
}

// claude-cli 는 달러 예산 밖이다(llm.ts UNMETERED) — 상한은 슬롯·하루 건수, 실측 명목값은 봉투 cost_usd 로만 본다.
const budgetNote = provider === 'claude-cli' ? '달러 예산 미적용(구독)' : `일 예산 $${DAILY_BUDGET_USD}`
log(`야간 자동 extract ${dry ? '(--dry: 대상 선정·게이트 판정만)' : ''} — run_key=${runKey} · 슬롯 ${slot} · provider=${provider} · 신규 기준 ${minNew}건 · 슬롯 상한 ${max}건 · 하루 상한 ${dailyMax}건 · ${budgetNote}`)

// ── 1. 후보 = status='collecting' + 재추출 가능 상태(extracted) ──
// 남헌 2026-09-23 Q4(a). extracted 도 후보다 — 마지막 추출 이후 신규 ≥ minNew 면 force 로 다시 돈다.
// 신규 수 계산이 이미 extract_finished_at 기준이라 "다시 돌 때가 됐는가"를 그 조건이 정한다.
//
// failed 도 후보다(2026-09-27) — 단 extract_attempts < AUTO_RETRY_MAX_ATTEMPTS 인 것만(pickAutoTargets).
// 전에는 뺐는데, Gemini 503 한 번이 프로젝트를 영구 제외시키는 경로가 실제로 돌았다. 첫 추출 취급(force 없음).
// 검수 이후(reviewed/angled/done)는 AUTO_EXTRACT_STATUSES 에 없으므로 여기서도 빠진다.
const { data: projects, error: projectsError } = await supabase
  .from('analysis_projects')
  // business_model 은 대상 **순서**를 가른다 — SaaS 가 먼저다(pickAutoTargets, 남헌 2026-09-23).
  // status 도 순서를 가른다 — 첫 추출이 재추출보다 먼저다.
  .select('id, status, extract_finished_at, extract_attempts, product_elevator_pitch, business_model')
  .in('status', AUTO_EXTRACT_STATUSES)

if (projectsError) {
  console.error(`✗ 프로젝트 조회 실패: ${projectsError.message}`)
  process.exit(2)
}

// ── 2. 프로젝트별 "마지막 추출 이후 신규 입력" 수 ────────────────
const candidates = []
for (const p of projects ?? []) {
  let q = supabase
    .from('analysis_inputs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', p.id)
    .is('purged_at', null)
  // 한 번도 안 돌린 프로젝트(extract_finished_at null)·failed 는 전체가 신규다(newInputsSince).
  const since = newInputsSince(p)
  if (since) q = q.gt('created_at', since)
  const { count, error } = await q
  const base = { projectId: p.id, label: p.product_elevator_pitch, businessModel: p.business_model, status: p.status, attempts: p.extract_attempts }
  if (error) {
    // 조회 실패를 "신규 0건" 으로 접지 않는다(§7.1). null 로 넘겨 따로 센다.
    console.error(`⚠️ 신규 입력 수 확인 불가 project=${p.id}: ${error.message}`)
    candidates.push({ ...base, newInputs: null })
    continue
  }
  candidates.push({ ...base, newInputs: count ?? 0 })
}

// ── 3. 슬롯 게이트 (설계 §3·§4, 남헌 2026-09-28 D1~D8) ────────────
// 백로그 = 상한 없이 고른 eligible 전체. 상태 = agent_runs(extract-auto-* 만 — D8: 다른 잡의 한도 정지는 안 본다).
const full = pickAutoTargets(candidates, { minNew, max: Infinity })
const backlog = backlogOf(full)
let state = null
let extractRows = null // 재시도 큐(summary.retry_queue)도 이 행들에서 읽는다
{
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('agent_runs')
    .select('run_key, status, summary, started_at, finished_at')
    .like('run_key', 'extract-auto-%')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(100)
  // 조회 실패를 "이력 없음"으로 접지 않는다(§7.1) — null 이면 추가 슬롯은 쉰다.
  if (error) warn(`실행 이력(agent_runs) 조회 실패 — ${error.code ?? ''} ${error.message}`)
  else {
    extractRows = data ?? []
    state = slotStateOf(extractRows, { today, slot })
  }
}
const gate = decideSlot({ slot, backlog, state, dailyMax, slotMax: max, now: new Date() })
const gateFields = {
  decision: gate.run ? 'run' : 'skip',
  reason: gate.reason,
  slot,
  B: backlog.B,
  S: backlog.S,
  Bw: backlog.Bw,
  threshold: gate.threshold,
  prev_ran: state?.prevRan ?? null,
  done_today: state?.doneToday ?? null,
  daily_max: dailyMax,
  max_this_run: gate.max,
  quota_cooldown_until: state?.cooldownUntil ?? null,
  prior_blocked_streak: state?.consecutiveBlocked ?? null,
  unknown: full.unknown,
}
const gateLine =
  `슬롯 ${slot} ${gate.run ? '실행' : '쉼'} — ${gate.reason} · B ${backlog.B}(SaaS ${backlog.S}) · Bw ${backlog.Bw} · ` +
  `오늘 처리 ${state ? `${state.doneToday}/${dailyMax}` : '확인 불가'} · ` +
  `한도 쿨다운 ${state?.cooldownUntil ? `~${state.cooldownUntil}` : state ? '없음' : '확인 불가'}`
if (gate.warn) warn(gateLine)
else {
  if (process.env.GITHUB_ACTIONS) console.log(`::notice::${gateLine}`)
  log(gateLine)
}

const trackerOpts = {
  runKey,
  dept: 'cto',
  trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'cron' : process.env.GITHUB_ACTIONS ? 'manual' : 'local',
  dryRun: false,
  gitSha: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
}
const raiseAlarm = (thisStatus) => {
  const on = blockedAlarm(state?.consecutiveBlocked ?? 0, thisStatus)
  if (on) {
    const m = `extract 가 연속 ${(state?.consecutiveBlocked ?? 0) + (thisStatus === 'blocked' ? 1 : 0)}번 한도(blocked)로 멈췄다 — 한도가 풀리지 않는다. 사람이 볼 것(설계 §4.1)`
    if (process.env.GITHUB_ACTIONS) console.log(`::error::${m}`)
    console.error(`✗ ${m}`)
  }
  return on
}

if (!gate.run) {
  if (dry) {
    log('--dry: 쉼 판정. 여기서 끝낸다. DB 쓰기 없음.')
    process.exit(0)
  }
  // 쉼도 기록한다(§4.2) — 안 남기면 "어젯밤 왜 아무것도 안 바뀌었나"에 답을 못 한다.
  const t = await createTracker(trackerOpts)
  await t.step({ stepKey: 'gate', label: '슬롯 게이트', status: 'skipped', counts: { B: backlog.B, S: backlog.S }, detail: gateFields })
  await t.finish({ status: 'ok', summary: { ...gateFields, targets: 0, done: 0, failed: 0 } })
  if (!t.dbOk) warn('쉼 기록을 agent_runs 에 남기지 못했다 — ops/state 폴백')
  process.exit(raiseAlarm('skip') ? 1 : 0)
}

// 프로젝트 단위 재시도 큐(v32 #4): 때가 된 한도 정지 프로젝트가 먼저, 때가 안 된 것은 이번에 고르지 않는다.
const retryQueue = extractRows ? retryQueueOf(extractRows) : []
if (!extractRows) warn('실행 이력을 못 읽어 재시도 큐도 확인 불가 — 이번 실행은 큐 없이 고른다(때가 안 된 한도 정지 프로젝트가 일찍 돌 수 있다)')
const ordered = orderWithQueue(full.targets, retryQueue, new Date())
const pick = { ...full, targets: ordered.slice(0, Math.max(0, gate.max)), remaining: Math.max(0, ordered.length - gate.max) }
const queuedIds = new Set(retryQueue.map((e) => e.project_id))
log(`후보 ${candidates.length}건(${AUTO_EXTRACT_STATUSES.join('/')}) →${describePick(pick, minNew, gate.max)} (순서: 재시도 큐 → SaaS 우선 → 첫 추출 우선 → 신규 많은 순)`)
if (retryQueue.length) log(`재시도 큐 ${retryQueue.length}건: ${retryQueue.map((e) => `${e.project_id}(재시도 ${e.retries}회 소진·~${e.due_at})`).join(', ')}`)
for (const t of pick.targets) {
  log(`  · ${t.projectId} [${t.businessModel ?? '미기재'}] ${needsForce(t) ? '재추출(force)' : '첫 추출'}${queuedIds.has(t.projectId) ? ' · 한도 재시도' : ''} · 신규 ${t.newInputs}건 — ${t.label ?? '(소개 없음)'}`)
}
if (pick.unknown > 0) warn(`신규 입력 수를 세지 못한 프로젝트 ${pick.unknown}건 — 대상 판정에서 빠졌다(0건이라는 뜻이 아니다)`)

// ── 3.5 세션 한도 가드(남헌 v30 §5) — 이 슬롯 1회의 상한($) · 주간 중단 스위치 · 5시간 창 합산(기록만) ──
const guard = loadGuardConfig()
const capUsd = capUsdOf(guard.cfg)
const hardCapUsd = hardCapUsdOf(guard.cfg)
// 하드 캡(v32 30%)은 llm.ts 가 매 claude -p 시작 전에 본다 — 진행 중 프로젝트의 중간 호출도 여기서만 막힌다.
setCliHardCap(hardCapUsd, guard.cfg.unitCostFallbackUsd)
const guardNow = new Date()
const recentRuns = await loadRecentRuns(supabase, guardNow)
if (!recentRuns) warn('가드 대상 실행 이력(agent_runs) 조회 실패 — 5시간 창·주간 합산 확인 불가')
const window5h = recentRuns ? usageSince(recentRuns, guardNow.getTime() - 5 * 3_600_000) : null
const weekUsd = recentRuns ? usageSince(recentRuns, guardNow.getTime() - 7 * 86_400_000).usd : null
const weekly = weeklyGate(guard.cfg, weekUsd)
log(`세션 가드 — 소프트 캡 ${capUsd == null ? `확인 불가(${guard.error ?? 'session_cap_pct·usd_per_session_pct 없음'})` : `$${capUsd.toFixed(2)}(${guard.cfg.capPct}% × $${guard.cfg.usdPerPct}/%p)`} · 하드 캡 ${hardCapUsd == null ? '없음' : `$${hardCapUsd.toFixed(2)}(${guard.cfg.hardCapPct}%)`} · ${weekly.reason} · 직전 5시간 다른 실행 ${window5h ? `$${window5h.usd.toFixed(2)}(${window5h.runs}건)` : '확인 불가'}`)

if (dry) {
  log('--dry: 여기서 끝낸다. 잠금·LLM 호출·DB 쓰기 없음.')
  process.exit(0)
}

// ── 4. 실행 상태 기록 (기존 헬퍼 재사용: agent_runs / agent_run_steps) ──
const tracker = await createTracker(trackerOpts)

// 상한을 모르면(설정 깨짐) 돌지 않는다 — 가드 없이 도는 것을 "정상"으로 접지 않는다(§7.1). 주간 스위치도 여기서 멈춘다.
// 둘 다 stop_reason 이 quota 가 아니라 쿨다운·연속 경보를 걸지 않는다(extract-auto.ts isQuotaBlocked).
if (capUsd == null || weekly.stop) {
  const stopReason = capUsd == null ? 'guard_config' : 'weekly_stop'
  const why = capUsd == null ? `세션 상한 설정 확인 불가 — ${guard.error ?? 'config/session-guard.json 의 session_cap_pct·usd_per_session_pct 가 없다'}` : weekly.reason
  warn(`${why} — 추출 0건으로 멈춘다(대상 ${pick.targets.length}건은 다음 실행)`)
  await tracker.step({ stepKey: 'guard', label: '세션 한도 가드', status: 'blocked', blocker: why, detail: { stop_reason: stopReason, weekly_pct: weekly.pct, cap_usd: capUsd } })
  await tracker.finish({ status: 'blocked', summary: { ...gateFields, targets: pick.targets.length, done: 0, failed: 0, remaining: pick.eligible, blocker: why, stop_reason: stopReason } })
  process.exit(capUsd == null ? 2 : 0)
}

await tracker.step({
  stepKey: 'select',
  label: '대상 선정',
  status: 'ok',
  counts: { candidates: candidates.length, eligible: pick.eligible, targets: pick.targets.length, remaining: pick.remaining, unknown: pick.unknown },
  detail: { min_new: minNew, max_projects: max, ...gateFields },
})

// ── 5. 순차 추출. 한도에 걸리면 그 자리에서 멈춘다(다음 슬롯이 쿨다운을 본다) ────
let done = 0
let failed = 0
let blocker = null
let quotaResetAt = null
let costUsd = 0
let costKnown = 0
let seq = 1
// 세션 가드: 'quota'(구독 한도 오류) | 'session_cap'(소프트 캡 — 새 프로젝트 시작 안 함) | 'hard_cap'(하드 캡 — 진행 중 호출 차단)
//   | 'cost_unknown'(비용 모름 호출이 있는데 추정 근거·폴백(unit_cost_fallback_usd) 없음) | null
let stopReason = null
let processed = 0
const touched = [] // 이번에 잠그고 돌린 프로젝트(재시도 큐 갱신용)
let quotaProject = null // 추출 본 호출이 한도로 멈춘 프로젝트 — 그것만 재시도 큐에 넣는다(v32 #4)

for (const target of pick.targets) {
  seq += 1
  // 소프트 캡(v32): 프로젝트 **경계에서만** 본다 — 닿았으면 새 프로젝트를 시작하지 않는다. 진행 중 프로젝트는 끝까지 마치고 저장한다.
  // 확인은 claim **전**이라 건너뛴 프로젝트는 잠그지도 extract_attempts 를 태우지도 않는다.
  // 비용 못 읽은 호출(timeout·출력 상한·봉투 없음)은 spendForCap 이 추정해 더한다. 추정 근거가 없으면 null — 새 시작을 막는다(§7.1).
  const spentNow = spendForCap(cliSpent(), guard.cfg.unitCostFallbackUsd)
  if (spentNow == null || capReached(spentNow, capUsd)) {
    stopReason = spentNow == null ? 'cost_unknown' : 'session_cap'
    blocker = spentNow == null
      ? `세션 사용액 확인 불가 — 비용을 못 읽은 호출 ${cliSpent().unknown}건(timeout·출력 상한·봉투 없음), 추정 근거·폴백(unit_cost_fallback_usd) 없음 · 대상 ${pick.targets.length}건 중 ${processed}건 처리 뒤 새 시작 중지`
      : `소프트 캡 도달 — 대상 ${pick.targets.length}건 중 ${processed}건 처리 뒤 새 시작 중지 · 사용 $${spentNow.toFixed(3)} / 소프트 캡 $${capUsd.toFixed(2)}`
    warn(`${blocker}. 남은 ${pick.targets.length - processed}건은 다음 슬롯에서 돈다(정상 종료가 아니다 — §7.2 확인 대상).`)
    await tracker.step({ stepKey: 'session-cap', label: '세션 소프트 캡', status: 'blocked', seq, blocker, detail: { processed, of: pick.targets.length, spent_usd: spentNow == null ? null : Number(spentNow.toFixed(4)), cost_unknown_calls: cliSpent().unknown, cap_usd: capUsd, hard_cap_usd: hardCapUsd } })
    break
  }
  // 재추출은 force 가 필요하다. force 여도 실행 중(fresh processing)은 extract-gate 가 막는다.
  const force = needsForce(target)
  const claim = await claimExtraction(supabase, target.projectId, force)
  if (!claim.ok) {
    // 다른 실행이 잡았거나 상태가 바뀐 것. 실패로 세지 않는다.
    log(`- ${target.projectId} 건너뜀(${claim.httpStatus}): ${claim.error}`)
    await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'skipped', seq, detail: { reason: claim.error, http: claim.httpStatus } })
    continue
  }

  const t0 = Date.now()
  // 재추출 실패면 claim.restore 로 extracted 를 되돌린다 — 503 한 번이 멀쩡한 프로젝트를 failed 로 떨어뜨리지 않게.
  // claim.attempts 를 넘기면 한도·하드 캡 실패에서 extract_attempts 를 1 되돌린다(그 프로젝트 잘못이 아니다 — v32).
  const out = await withLlmBudget(() => runExtraction(supabase, target.projectId, provider, claim.restore, claim.attempts))
  const secs = Math.round((Date.now() - t0) / 1000)
  processed += 1
  // 하드 캡이 본 호출 전에 막은 프로젝트는 실제로 돌지 않았다 — 재시도 큐 항목이면 우선순위를 그대로 남긴다(touched 에 넣지 않는다).
  if (!(out.ok === false && out.hardCap)) touched.push(target.projectId)
  // 하드 캡(v32 30%): 진행 중 프로젝트의 다음 claude -p 가 막혔으면(llm.ts CliHardCapError) 여기서 실행 전체를 멈춘다.
  // 저장(속성 교체·상태 갱신) 사이에는 LLM 호출이 없어 하드 캡이 저장을 가르지 않는다 — 막히는 것은 저장 전 본 호출(→ 이전 상태 보존)
  // 또는 저장 뒤 보강 단계(인용 번역·처방 판정·경쟁사 프로필 → 그 단계만 미완료)다.
  const spentAfter = spendForCap(cliSpent(), guard.cfg.unitCostFallbackUsd)
  const hardHit = out.ok === false ? out.hardCap === true : hardCapUsd != null && spentAfter != null && spentAfter >= hardCapUsd

  if (out.ok) {
    done += 1
    if (out.costUsd != null) { costUsd += out.costUsd; costKnown += 1 }
    log(`✓ ${target.projectId} ${secs}s ${force ? '(재추출)' : ''} — 속성 ${out.aspects}개(사람 확인 보존 ${out.keptAspects}개) · 입력 ${out.inputs}건 · 선별 밖 ${out.droppedInputs}건 · 목적 무관 제외 ${out.droppedIrrelevant}건 · model=${out.model}`)
    await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'ok', seq, counts: { aspects: out.aspects, kept: out.keptAspects, inputs: out.inputs, dropped: out.droppedInputs, irrelevant: out.droppedIrrelevant }, detail: { model: out.model, seconds: secs, force, cost_usd: out.costUsd } })
    // 경쟁사 프로필(extract-run 9단계) — extract 스텝과 같은 단위(seconds·cost_usd)로 따로 남긴다: "프로필을 붙인 뒤
    // extract 처리량이 달라졌나"를 주간 점검에서 이 두 스텝을 나란히 놓고 센다. seq 는 100 뒤로 밀어 추출 스텝 뒤에 정렬된다.
    // 프로필이 없으면(예외로 못 돎) 그것도 남긴다 — 행이 없는 것과 "안 돌았다"를 가른다(§7.1).
    const p = out.profile
    await tracker.step({
      stepKey: `profile-${target.projectId}`, label: `경쟁사 프로필 ${target.projectId}`, seq: 100 + seq,
      status: !p ? 'failed' : p.status === 'failed' ? 'failed' : p.status === 'skipped' ? 'skipped' : 'ok',
      counts: p ? { claims: p.claims, dropped: p.droppedClaims, inputs: p.inputs } : {},
      detail: p
        ? { profile_status: p.status, reason: p.reason, snapshot_id: p.snapshotId, model: p.model, seconds: Math.round(p.durationMs / 1000), cost_usd: p.costUsd }
        : { reason: '프로필 단계가 돌지 않았다(extract-run 로그 확인)' },
    })
    if (p?.quotaExhausted) {
      // 추출은 끝났고 프로필에서 한도에 걸렸다 — 다음 프로젝트의 추출도 같은 한도에 걸리므로 여기서 멈춘다(extract_attempts 를 태우지 않게).
      blocker = `LLM 한도/예산 소진(프로필 단계) — ${p.reason}`
      stopReason = 'quota'
      quotaResetAt = parseQuotaResetAt(p.reason ?? '', new Date())
      warn(`${target.projectId} 프로필 단계에서 한도에 걸려 이번 실행을 멈춘다. 남은 대상 ${pick.targets.length - seq + 1}건은 쿨다운 뒤 슬롯에서 돈다.`)
      break
    }
    if (hardHit) {
      stopReason = 'hard_cap'
      blocker = `하드 캡 도달 — ${target.projectId} 저장은 끝났고 보강 단계(인용 번역·처방 판정·프로필) 일부가 막혔을 수 있다 · 대상 ${pick.targets.length}건 중 ${processed}건째 · 사용 $${spentAfter.toFixed(3)} / 하드 캡 $${hardCapUsd.toFixed(2)}`
      warn(`${blocker}. 즉시 멈춘다.`)
      break
    }
    continue
  }

  if (out.hardCap) {
    // 본 호출 전에 막혔다 — 속성은 손대지 않았고(재추출은 이전 상태로 되돌림) 시도 수도 되돌렸다. 미완료로 다음 실행에 남긴다.
    stopReason = 'hard_cap'
    blocker = `하드 캡 도달 — ${target.projectId} 추출 본 호출 전 차단(미완료, 이전 상태 보존) · 대상 ${pick.targets.length}건 중 ${processed}건째 · ${out.error}`
    warn(`${blocker}. 즉시 멈춘다.`)
    await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'blocked', seq, blocker, detail: { seconds: secs, hard_cap_usd: hardCapUsd } })
    break
  }

  if (out.quotaExhausted) {
    blocker = `LLM 한도/예산 소진 — ${out.error}`
    stopReason = 'quota'
    quotaProject = target.projectId
    // D6: CLI 문구에서 리셋 시각을 뽑으면 다음 슬롯 쿨다운이 그걸 쓴다. 못 뽑으면 null → 4시간 폴백(v30 §5).
    quotaResetAt = parseQuotaResetAt(out.error, new Date())
    warn(`${target.projectId} 에서 한도에 걸려 이번 실행을 멈춘다. 남은 대상 ${pick.targets.length - seq + 1}건은 쿨다운(${quotaResetAt ? `리셋 ${quotaResetAt}` : '4시간'}) 뒤 슬롯에서 돈다. (${out.error})`)
    await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'blocked', seq, blocker, detail: { seconds: secs, quota_reset_at: quotaResetAt } })
    break
  }

  failed += 1
  console.error(`✗ ${target.projectId} ${secs}s 추출 실패: ${out.error} — ${force ? '재추출이라 이전 상태로 되돌림(속성 삭제 전 실패일 때)' : 'analysis_projects.status=failed 로 기록됨'}`)
  await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'failed', seq, detail: { error: out.error, seconds: secs } })
}

const spent = dailySpent()
const status = blocker ? 'blocked' : failed > 0 ? (done > 0 ? 'partial' : 'failed') : 'ok'
const cli = cliSpent()
const session = sessionBlock({ job: 'extract', cfg: guard.cfg, spentUsd: cli.usd, spentForCapUsd: spendForCap(cli, guard.cfg.unitCostFallbackUsd), calls: cli.calls, costUnknownCalls: cli.unknown, window5h, weekUsd, capped: stopReason === 'session_cap' || stopReason === 'hard_cap' })
log(sessionLine(session))
// 재시도 큐 갱신(v32 #4). 큐를 못 읽었으면(extractRows null) 이전 큐를 모르니 이번 결과만으로 만든다.
const rq = nextRetryQueue(retryQueue, { touched, quota: quotaProject, resetAt: quotaResetAt, now: new Date(), cooldownMs: QUOTA_COOLDOWN_MS, maxRetries: BLOCKED_ALARM_STREAK - 1 })
if (rq.queue.length) log(`재시도 큐(다음 실행) ${rq.queue.length}건: ${rq.queue.map((e) => `${e.project_id}(재시도 ${e.retries}회 소진·~${e.due_at})`).join(', ')}`)
if (rq.giveUp) {
  const m = `${rq.giveUp.project_id} 가 한도 정지 뒤 재시도 ${BLOCKED_ALARM_STREAK - 1}회까지 전부 한도로 멈췄다 — 큐에서 뺀다(일반 순서로 돌아간다). 사람이 볼 것`
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${m}`)
  console.error(`✗ ${m}`)
}
await tracker.finish({
  status,
  summary: {
    ...gateFields,
    targets: pick.targets.length, done, failed, remaining: pick.remaining, blocker, quota_reset_at: quotaResetAt,
    // 상한·한도로 멈췄으면 몇 건째였는지(§7.2). remaining 은 슬롯 상한 밖 수, not_started 는 이번 실행이 고르고도 못 돈 수.
    stop_reason: stopReason, processed, not_started: pick.targets.length - processed, session,
    retry_queue: rq.queue, retry_given_up: rq.giveUp,
    est_usd: Number(spent.spentUsd.toFixed(4)), llm_calls: spent.calls,
    // 성공 건 중 봉투에서 비용을 읽은 것만 합한다. 0건이면 null(0 달러로 접지 않는다).
    cost_usd: costKnown > 0 ? Number(costUsd.toFixed(4)) : null, cost_known: costKnown,
  },
})

const spentNote = provider === 'claude-cli' ? `실측 명목 $${costKnown > 0 ? costUsd.toFixed(3) : '확인 불가'}(${costKnown}/${done}건)` : `추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD})`
log(`끝 — 추출 ${done}건 · 실패 ${failed}건 · 남은 대상 ${pick.remaining}건 · 이번 실행 ${spentNote} · 상태 ${status}`)
if (!tracker.dbOk) warn('실행 상태를 agent_runs 에 남기지 못했다 — ops/state 폴백. 이 실행의 기록은 "DB 확인 불가"다')

// 세션 상한·비용 확인 불가 정지는 한도 오류가 아니다 — 연속 blocked 경보에 넣지 않는다(blocked 상태·::warning:: 로는 남는다).
const alarm = raiseAlarm(stopReason && stopReason !== 'quota' ? 'capped' : status)
// 프로젝트 재시도 소진도 exit 1 → cron-watchdog 가 Notion 일일 상태 로그로 올린다.
process.exit(failed > 0 ? 3 : alarm || rq.giveUp ? 1 : 0)
