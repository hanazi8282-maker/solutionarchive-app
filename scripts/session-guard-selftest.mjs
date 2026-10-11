#!/usr/bin/env node
// 세션 한도 가드(남헌 v30 §5) 셀프테스트 — DB·LLM 없이 순수 로직 + 워크플로/스크립트 배선을 본다.
//   node scripts/session-guard-selftest.mjs     (종료코드 0 = 전부 통과)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  GUARDED_RUN_PREFIXES, RELEVANCE_SLOTS, capReached, capUsdOf, hardCapUsdOf, loadGuardConfig, nextRetryQueue, orderWithQueue, parseGuardConfig, pctOf,
  relevanceRetryDecision, relevanceRunSuffix, retryQueueOf, runCostUsd, sessionBlock, sessionLine, spendForCap, usageSince, weeklyGate,
} from '../lib/analysis/session-guard.ts'
import { BLOCKED_ALARM_STREAK, QUOTA_COOLDOWN_MS, decideSlot, isQuotaBlocked, slotStateOf } from '../lib/analysis/extract-auto.ts'
import { ClaudeCliError, CliHardCapError, callLlmWithModel, cliSpent, isQuotaFailure, setCliHardCap, tallyCli } from '../lib/analysis/llm.ts'
import { runExtraction } from '../lib/analysis/extract-run.ts'

let pass = 0
let fail = 0
const t = (name, ok) => { if (ok) pass += 1; else { fail += 1; console.log(`✗ ${name}`) } }
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── 비용 못 읽은 호출 — callClaudeCli 실제 경로(가짜 바이너리 = node 자신) ──
// 독립 검토 차단 1: timeout SIGKILL·봉투 없음이 상한 판정에서 $0 이 되던 구멍. tallyCli 직접 호출이 아니라 llm.ts 를 통과시킨다.
{
  t('누적기는 0 에서 시작', cliSpent().calls === 0)
  const saved = { path: process.env.CLAUDE_CLI_PATH, to: process.env.LLM_CLAUDE_CLI_TIMEOUT_MS }
  process.env.CLAUDE_CLI_PATH = process.execPath // node 는 claude 인자(-p --output-format …)를 못 알아듣고 봉투 없이 죽는다
  let e1 = null
  try { await callLlmWithModel('claude-cli', 'sys', 'user', 'selftest-noenv') } catch (e) { e1 = e }
  t('봉투 없음 → ClaudeCliError 로 실패', e1 instanceof ClaudeCliError && !e1.timedOut)
  t('봉투 없음 → 비용 모름 1건으로 센다($0 아님)', cliSpent().unknown === 1 && cliSpent().usd === 0)
  t('비교할 호출이 없으면 상한 판정 지출 = null(확인 불가 → 멈춤)', spendForCap(cliSpent()) === null)
  process.env.LLM_CLAUDE_CLI_TIMEOUT_MS = '1' // 시작하자마자 SIGKILL
  let e2 = null
  try { await callLlmWithModel('claude-cli', 'sys', 'user', 'selftest-timeout') } catch (e) { e2 = e }
  t('timeout → timedOut ClaudeCliError', e2 instanceof ClaudeCliError && e2.timedOut === true)
  t('timeout 도 비용 모름으로 센다', cliSpent().unknown === 2 && cliSpent().calls === 2)
  for (const [k, v] of [['CLAUDE_CLI_PATH', saved.path], ['LLM_CLAUDE_CLI_TIMEOUT_MS', saved.to]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  tallyCli({ total_cost_usd: 0.3 }) // 읽은 호출 1건이 생기면 그 최대값으로 모르는 호출을 추정한다
  t('비용 모름 2건 × 본 호출 최대 $0.3 을 더한다', Math.abs(spendForCap(cliSpent()) - 0.9) < 1e-9 && cliSpent().maxCallUsd === 0.3)
  t('추정 지출로 소프트 캡 판정 — $6.2 + 모름 1건×$0.31 은 $6.45 에 닿아 새 시작 중지', capReached(spendForCap({ usd: 6.2, unknown: 1, maxCallUsd: 0.31 }), 6.45) === true)
  t('비용 모름이 없으면 읽은 합 그대로', spendForCap({ usd: 1.5, unknown: 0, maxCallUsd: 0 }) === 1.5)
  // 재검토 [권고] 3: 첫 본 호출이 timeout 이라 근거가 없을 때만 설정 폴백($0.67)으로 센다 — 0 으로 접지 않고, 슬롯 전체를 세우지도 않는다.
  t('근거 없음 + 폴백 $0.67 → 모름 1건 = $0.67', spendForCap({ usd: 0, unknown: 1, maxCallUsd: 0 }, 0.67) === 0.67)
  t('근거가 있으면 폴백보다 본 호출 최대값 우선', spendForCap({ usd: 1, unknown: 2, maxCallUsd: 0.2 }, 0.67) === 1.4)
  t('근거·폴백 둘 다 없으면 null(확인 불가)', spendForCap({ usd: 0, unknown: 1, maxCallUsd: 0 }, null) === null)
  t('폴백으로 첫 timeout 뒤에도 소프트 캡 아래면 다음 프로젝트 시작', capReached(spendForCap({ usd: 0, unknown: 1, maxCallUsd: 0 }, 0.67), 6.45) === false)

  // 하드 캡(v32 30%) — llm.ts 가 claude -p 를 **시작하기 전에** 막는다(바이너리를 부르지도 않는다). 한도 오류(quota)로 읽지 않는다.
  process.env.CLAUDE_CLI_PATH = path.join(os.tmpdir(), 'no-such-claude-binary') // 막히지 않고 넘어가면 "파일 없음" 오류로 갈린다
  setCliHardCap(0.5) // 지금 추정 지출 $0.9 ≥ $0.5
  let e3 = null
  const callsBefore = cliSpent().calls
  try { await callLlmWithModel('claude-cli', 'sys', 'user', 'selftest-hardcap') } catch (e) { e3 = e }
  t('하드 캡 이상이면 CliHardCapError 로 시작 전 차단', e3 instanceof CliHardCapError && /하드 캡/.test(e3.message))
  t('하드 캡 차단은 호출로 세지 않는다(바이너리 미실행)', cliSpent().calls === callsBefore)
  t('하드 캡은 한도 오류가 아니다(쿨다운·재시도 큐 안 탄다)', isQuotaFailure(e3) === false)
  setCliHardCap(null)
  if (saved.path === undefined) delete process.env.CLAUDE_CLI_PATH; else process.env.CLAUDE_CLI_PATH = saved.path
}

// ── 설정 ──
const real = loadGuardConfig()
t('리포 설정 파일을 읽는다', real.error === null)
t('v32: 소프트 15% × $0.43/%p = $6.45', real.cfg.capPct === 15 && real.cfg.usdPerPct === 0.43 && Math.abs(capUsdOf(real.cfg) - 6.45) < 1e-9)
t('폴백 설정값 $0.67', real.cfg.unitCostFallbackUsd === 0.67)
t('v32: 하드 30% × $0.43/%p = $12.9', real.cfg.hardCapPct === 30 && Math.abs(hardCapUsdOf(real.cfg) - 12.9) < 1e-9)
t('하드 캡 % 가 없으면 하드 캡 null', hardCapUsdOf(parseGuardConfig({ session_cap_pct: 15, usd_per_session_pct: 0.43 })) === null)
t('주간 스위치는 기본 비활성(null)', real.cfg.weeklyStopPct === null)
// v40 §2 임시값: 자동 조정 주간 안전선 75% · 주간 1% = $1.29. 계수가 들어가도 weekly_stop_pct 가 null 이라 주간 중단 스위치는 계속 꺼져 있다.
t('v40 §2: autotune_weekly_safe_pct 75 · usd_per_weekly_pct 1.29', real.cfg.autotuneWeeklySafePct === 75 && real.cfg.usdPerWeeklyPct === 1.29)
t('v40 §2: 계수가 들어가도 주간 중단 스위치는 비활성 그대로', weeklyGate(real.cfg, 1000).stop === false && /비활성/.test(weeklyGate(real.cfg, 1000).reason))
const missing = loadGuardConfig(path.join(os.tmpdir(), 'no-such-session-guard.json'))
t('설정 파일이 없으면 error + 상한 null(가드 확인 불가 → 닫힘)', missing.error !== null && capUsdOf(missing.cfg) === null)
t('0·음수·문자열은 값 없음으로', parseGuardConfig({ session_cap_pct: 0, usd_per_session_pct: '0.3' }).capPct === null && parseGuardConfig({ usd_per_session_pct: '0.3' }).usdPerPct === null)
t('계수 하나만 없어도 상한 null', capUsdOf(parseGuardConfig({ session_cap_pct: 15 })) === null)
t('pct 환산, 계수 없으면 null', pctOf(0.87, 0.3) === 2.9 && pctOf(1, null) === null)

// ── 소프트 캡 판정(v32: 닿으면 새 시작 안 함, 진행 중은 마침) ──
t('0 은 통과', capReached(0, 6.45) === false)
t('소프트 캡 미만이면 새 프로젝트 시작', capReached(6.44, 6.45) === false)
t('소프트 캡에 닿으면 새 프로젝트 시작 안 함', capReached(6.45, 6.45) === true)
// 루프 시뮬레이션 — extract 1건 ≈ $0.22(10-07 실측 $1.091/5건, 입력 많으면 $0.3+). 경계에서만 막으므로 마지막 1건만큼 넘을 수 있고
// 그 넘침은 하드 캡($12.9) 안이다.
{
  const costs = Array.from({ length: 40 }, (_, i) => [0.22, 0.31, 0.18, 0.27][i % 4])
  let spent = 0; let processed = 0
  for (const c of costs) { if (capReached(spent, 6.45)) break; spent += c; processed += 1 }
  t(`시뮬: 40건 중 ${processed}건 처리, 사용 $${spent.toFixed(2)} — 소프트 캡 이상에서 멈추고 넘침은 1건 이내`, spent >= 6.45 && spent - 6.45 < 0.31 && processed < costs.length)
  t('시뮬: 넘침은 하드 캡 안', spent < 12.9)
}

// ── 사용량 합산 ──
const NOW = new Date('2026-10-08T03:00:00Z')
const H = 3_600_000
const iso = (ms) => new Date(ms).toISOString()
const rows = [
  { run_key: 'extract-auto-2026-10-08-s1', status: 'ok', summary: { cost_usd: 1.2 }, started_at: iso(NOW - 4 * H), finished_at: iso(NOW - 3 * H) }, // 옛 형식
  { run_key: 'relevance-judge-2026-10-08', status: 'ok', summary: { session: { spent_usd: 0.4 } }, started_at: iso(NOW - 3 * H), finished_at: iso(NOW - 2 * H) },
  { run_key: 'relevance-translate-2026-10-07', status: 'ok', summary: { session: { spent_usd: 0.5 } }, started_at: iso(NOW - 30 * H), finished_at: iso(NOW - 29 * H) },
  { run_key: 'extract-auto-2026-10-08-s2', status: 'ok', summary: { decision: 'skip' }, started_at: iso(NOW - H), finished_at: iso(NOW - H) }, // 쉼 — 비용 없음, 모름 아님
  { run_key: 'extract-auto-2026-10-08-m9', status: 'running', summary: {}, started_at: iso(NOW - 0.5 * H) }, // 진행 중 → 모름
  { run_key: 'cmo-2026-10-08-01', status: 'ok', summary: { cost_usd: 9 }, started_at: iso(NOW - H), finished_at: iso(NOW - H) }, // 대상 아님
]
const w5 = usageSince(rows, NOW - 5 * H)
t('5시간 창 = extract 1.2 + T2 0.4, 대상 밖·창 밖 제외', w5.usd === 1.6 && w5.runs === 2)
t('진행 중 실행은 비용 모름으로 따로 센다(0 으로 접지 않는다)', w5.unknownRuns === 1)
t('7일 합에는 번역도 들어간다', usageSince(rows, NOW - 7 * 24 * H).usd === 2.1)
t('runCostUsd: session 우선, 없으면 cost_usd, 둘 다 없으면 null', runCostUsd(rows[1]) === 0.4 && runCostUsd(rows[0]) === 1.2 && runCostUsd(rows[3]) === null)
t('가드 대상 접두 3종', GUARDED_RUN_PREFIXES.length === 3)

// ── 주간 스위치 ──
const wc = (o) => parseGuardConfig({ session_cap_pct: 15, usd_per_session_pct: 0.3, ...o })
t('N 미설정 → 비활성', weeklyGate(wc({}), 100).stop === false)
t('N 설정·계수 없음 → 확인 불가라 멈춤', weeklyGate(wc({ weekly_stop_pct: 50 }), 1).stop === true)
t('N 설정·이력 조회 실패 → 멈춤', weeklyGate(wc({ weekly_stop_pct: 50, usd_per_weekly_pct: 2 }), null).stop === true)
t('하한 사용률 < N → 진행', weeklyGate(wc({ weekly_stop_pct: 50, usd_per_weekly_pct: 2 }), 98).stop === false)
t('하한 사용률 ≥ N → 멈춤', (() => { const g = weeklyGate(wc({ weekly_stop_pct: 50, usd_per_weekly_pct: 2 }), 100); return g.stop && g.pct === 50 })())

// ── session 블록 ──
const sb = sessionBlock({ job: 't2', cfg: real.cfg, spentUsd: 0.6, calls: 10, costUnknownCalls: 1, window5h: w5, weekUsd: 2.1, capped: false })
t('작업별 사용액·사용률($0.6 ÷ $0.43 = 1.4%p)', sb.spent_usd === 0.6 && sb.used_pct === 1.4 && sb.cap_usd === 6.45 && sb.cap_pct === 15 && sb.hard_cap_usd === 12.9)
t('5시간 창 합산 = 다른 실행 + 이번', sb.window5h_usd === 2.2 && sb.window5h_pct === 5.12 && sb.window5h_other_runs === 2)
t('창 조회 실패면 null(0 아님)', sessionBlock({ job: 'extract', cfg: real.cfg, spentUsd: 1, calls: 1, costUnknownCalls: 0, window5h: null, weekUsd: null, capped: true }).window5h_usd === null)
t('번역은 상한 없음(기록만) — 소프트·하드 둘 다', (() => { const b = sessionBlock({ job: 'translate', cfg: real.cfg, spentUsd: 1, calls: 1, costUnknownCalls: 0, window5h: null, weekUsd: null, capped: false }); return b.cap_usd === null && b.hard_cap_usd === null })())
t('로그 줄에 상한 도달 표시', /상한 도달로 멈춤/.test(sessionLine({ ...sb, capped: true })))

// ── claude-cli 누적 ──
{
  const before = cliSpent()
  tallyCli({ total_cost_usd: 0.05 }); tallyCli({ is_error: true, total_cost_usd: 0.01 }); tallyCli(null)
  const after = cliSpent()
  t('실패 봉투 비용도 더하고, 봉투 없음은 unknown', Math.abs(after.usd - before.usd - 0.06) < 1e-9 && after.calls - before.calls === 3 && after.unknown - before.unknown === 1)
}

// ── 한도 정지 분류 · extract 쿨다운/재시도 ──
t('stop_reason 없는 옛 blocked = 한도', isQuotaBlocked({ status: 'blocked', summary: {} }) === true)
t('session_cap·weekly_stop·save_failed 는 한도 아님', ['session_cap', 'weekly_stop', 'save_failed'].every(r => !isQuotaBlocked({ status: 'blocked', summary: { stop_reason: r } })))
t('쿨다운 폴백 4시간', QUOTA_COOLDOWN_MS === 4 * H)
{
  const capRow = { run_key: 'extract-auto-2026-10-08-s1', status: 'blocked', summary: { decision: 'run', stop_reason: 'session_cap' }, started_at: iso(NOW - 2 * H), finished_at: iso(NOW - H) }
  const s = slotStateOf([capRow], { today: '2026-10-08', slot: 's2' })
  t('세션 상한 정지는 쿨다운·연속 blocked 를 만들지 않는다', s.cooldownUntil === null && s.consecutiveBlocked === 0)
  const q = (k, h) => ({ run_key: `extract-auto-${k}`, status: 'blocked', summary: { decision: 'run', stop_reason: 'quota' }, started_at: iso(NOW - h * H), finished_at: iso(NOW - (h - 0.1) * H) })
  const three = slotStateOf([q('2026-10-07-s3', 20), q('2026-10-08-s1', 15), q('2026-10-07-s2', 26)], { today: '2026-10-08', slot: 's2' })
  t('한도 3연속(원래 1 + 재시도 2) 집계', three.consecutiveBlocked === BLOCKED_ALARM_STREAK)
  const dd = (slot) => decideSlot({ slot, backlog: { B: 50, S: 0, Bw: 50 }, state: three, dailyMax: 24, slotMax: 10, now: NOW })
  t('재시도 2회 소진 뒤 추가 슬롯(s2)은 쉰다', dd('s2').run === false && /재시도 2회 소진/.test(dd('s2').reason))
  t('s1 은 하루 1번 풀렸는지 확인하러 돈다', dd('s1').run === true)
}

// ── T2 재시도 슬롯 ──
{
  const today = '2026-10-08'
  const o = { today, now: NOW, cooldownMs: QUOTA_COOLDOWN_MS, maxRetries: BLOCKED_ALARM_STREAK - 1 }
  const main = (status, summary, finH) => ({ run_key: `relevance-judge-${today}`, status, summary, started_at: iso(NOW - (finH + 1) * H), finished_at: iso(NOW - finH * H) })
  t('정규 실행 기록 없으면 쉰다', relevanceRetryDecision([], o).run === false)
  t('정규 실행이 ok 면 쉰다', relevanceRetryDecision([main('ok', {}, 5)], o).run === false)
  t('세션 상한 정지는 재시도 안 한다', relevanceRetryDecision([main('blocked', { stop_reason: 'session_cap' }, 5)], o).run === false)
  t('한도 정지 3시간 뒤 = 아직 이르다', (() => { const r = relevanceRetryDecision([main('blocked', { stop_reason: 'quota' }, 3)], o); return !r.run && /아직 이르다/.test(r.reason) })())
  t('한도 정지 4시간 뒤 = 재시도 1/2', (() => { const r = relevanceRetryDecision([main('blocked', { stop_reason: 'quota' }, 4)], o); return r.run && r.retriesDone === 0 })())
  t('리셋 시각이 있으면 그 시각이 우선(4시간 지나도 리셋 전이면 쉼)', relevanceRetryDecision([main('blocked', { stop_reason: 'quota', quota_reset_at: iso(NOW.getTime() + H) }, 6)], o).run === false)
  t('리셋 시각이 지났으면 4시간 전이어도 돈다', relevanceRetryDecision([main('blocked', { stop_reason: 'quota', quota_reset_at: iso(NOW - 60_000) }, 1)], o).run === true)
  const r1 = { run_key: `relevance-judge-${today}-r1`, status: 'blocked', summary: { stop_reason: 'quota' }, started_at: iso(NOW - 4.5 * H), finished_at: iso(NOW - 4.2 * H) }
  t('r1 도 한도면 r2 가 재시도 2/2', (() => { const r = relevanceRetryDecision([main('blocked', { stop_reason: 'quota' }, 9), r1], o); return r.run && r.retriesDone === 1 })())
  const r2 = { ...r1, run_key: `relevance-judge-${today}-r2`, started_at: iso(NOW - 0.5 * H), finished_at: iso(NOW - 0.4 * H) }
  t('재시도 2회 소진이면 쉰다', (() => { const r = relevanceRetryDecision([main('blocked', { stop_reason: 'quota' }, 9), r1, r2], { ...o, now: new Date(NOW.getTime() + 5 * H) }); return !r.run && /소진/.test(r.reason) })())
  const manual = { run_key: `relevance-judge-${today}-m123`, status: 'ok', summary: {}, started_at: iso(NOW - 0.2 * H), finished_at: iso(NOW - 0.1 * H) }
  t('수동 실행은 판정·횟수에 안 들어간다', relevanceRetryDecision([main('blocked', { stop_reason: 'quota' }, 5), manual], o).run === true)
  t('어제 행은 안 본다', relevanceRetryDecision([{ ...main('blocked', { stop_reason: 'quota' }, 5), run_key: 'relevance-judge-2026-10-07' }], o).run === false)
}

// ── r2 경보 근거(quotaPending) · run_key 접미사 ──
{
  const today = '2026-10-08'
  const o = { today, now: NOW, cooldownMs: QUOTA_COOLDOWN_MS, maxRetries: 2 }
  const blocked = { run_key: `relevance-judge-${today}`, status: 'blocked', summary: { stop_reason: 'quota' }, started_at: iso(NOW - 3 * H), finished_at: iso(NOW - 2 * H) }
  t('한도 정지가 남은 채 쉬면 quotaPending=true(r2 면 경보)', (() => { const r = relevanceRetryDecision([blocked], o); return !r.run && r.quotaPending === true })())
  t('정규가 ok 면 quotaPending=false(경보 없음)', relevanceRetryDecision([{ ...blocked, status: 'ok', summary: {} }], o).quotaPending === false)
  t('기록 없음도 quotaPending=false', relevanceRetryDecision([], o).quotaPending === false)
  t('접미사: 정규 ""', relevanceRunSuffix({ eventName: 'schedule', slotCron: '3 19 * * *' }) === '')
  t('접미사: 재시도 -r1/-r2', relevanceRunSuffix({ eventName: 'schedule', slotCron: '3 2 * * *' }) === '-r1' && relevanceRunSuffix({ eventName: 'schedule', slotCron: '3 6 * * *' }) === '-r2')
  t('접미사: 수동 -m<run_id>, 로컬 -local', relevanceRunSuffix({ eventName: 'workflow_dispatch', runId: '42', actions: 'true' }) === '-m42' && relevanceRunSuffix({}) === '-local')
  t('접미사: 표에 없는 크론은 throw', (() => { try { relevanceRunSuffix({ eventName: 'schedule', slotCron: '0 0 * * *' }); return false } catch { return true } })())
}

// ── 프로젝트 단위 재시도 큐(v32 #4) ──
{
  const now = new Date('2026-10-08T10:00:00Z')
  const o = { now, cooldownMs: QUOTA_COOLDOWN_MS, maxRetries: BLOCKED_ALARM_STREAK - 1 }
  const first = nextRetryQueue([], { ...o, touched: ['a', 'b'], quota: 'b', resetAt: null })
  t('한도 난 그 프로젝트만 큐에 — 4시간 뒤, 재시도 0회 소진', first.queue.length === 1 && first.queue[0].project_id === 'b' && first.queue[0].retries === 0 && first.queue[0].due_at === '2026-10-08T14:00:00.000Z' && first.giveUp === null)
  t('리셋 시각이 있으면 그 시각', nextRetryQueue([], { ...o, touched: ['b'], quota: 'b', resetAt: '2026-10-08T12:30:00.000Z' }).queue[0].due_at === '2026-10-08T12:30:00.000Z')
  const second = nextRetryQueue(first.queue, { ...o, touched: ['b'], quota: 'b', resetAt: null })
  t('재시도 1에서 또 한도 → 재시도 1회 소진으로 남는다', second.queue.length === 1 && second.queue[0].retries === 1 && second.giveUp === null)
  const third = nextRetryQueue(second.queue, { ...o, touched: ['b'], quota: 'b', resetAt: null })
  t('재시도 2에서 또 한도 → 큐에서 빼고 포기(최대 2회)', third.queue.length === 0 && third.giveUp?.project_id === 'b' && third.giveUp.retries === 2)
  t('재시도에서 성공(손댐·한도 아님) → 큐에서 빠진다', nextRetryQueue(second.queue, { ...o, touched: ['b'], quota: null, resetAt: null }).queue.length === 0)
  t('이번에 손 안 댄 큐 항목은 그대로 이어진다', nextRetryQueue(first.queue, { ...o, touched: ['c'], quota: null, resetAt: null }).queue[0]?.project_id === 'b')
  const tg = ['x', 'y', 'b', 'z'].map((projectId) => ({ projectId }))
  t('때가 된 큐 항목이 맨 앞', orderWithQueue(tg, [{ project_id: 'b', retries: 0, due_at: '2026-10-08T09:00:00Z' }], now).map((x) => x.projectId).join() === 'b,x,y,z')
  t('때가 안 된 큐 항목은 이번에 고르지 않는다', orderWithQueue(tg, [{ project_id: 'b', retries: 0, due_at: '2026-10-08T11:00:00Z' }], now).map((x) => x.projectId).join() === 'x,y,z')
  const rows = [
    { run_key: 'extract-auto-2026-10-08-s2', status: 'ok', summary: { decision: 'skip' }, started_at: '2026-10-08T05:00:00Z' }, // 쉼 행 — 큐 없음
    { run_key: 'extract-auto-2026-10-08-s1', status: 'blocked', summary: { retry_queue: first.queue }, started_at: '2026-10-07T20:00:00Z' },
    { run_key: 'extract-auto-2026-10-07-s3', status: 'ok', summary: { retry_queue: [] }, started_at: '2026-10-07T12:00:00Z' },
  ]
  t('큐는 retry_queue 를 가진 가장 최근 행에서 읽는다(쉼 행 건너뜀)', retryQueueOf(rows).length === 1 && retryQueueOf(rows)[0].project_id === 'b')
  t('큐가 없으면 []', retryQueueOf([]).length === 0)
}

// ── 프로젝트 저장 원자성(v32 #3) — runExtraction 실경로를 가짜 Supabase 로 ──
// 교체 순서: 새 행 insert → 옛 행(새 id 제외) delete → 프로젝트 update. delete 가 실패하면 새 행을 걷어 이전 상태로 되돌린다.
{
  const makeDb = ({ failDelete = null, failInsert = null, failUndo = null, insertReturn } = {}) => {
    const ops = []
    const db = {
      ops,
      from(table) {
        const st = { table, op: 'select', filters: [], payload: null }
        const b = {
          select() { return b }, insert(p) { st.op = 'insert'; st.payload = p; return b }, update(p) { st.op = 'update'; st.payload = p; return b },
          delete() { st.op = 'delete'; return b }, upsert(p) { st.op = 'upsert'; st.payload = p; return b },
          eq(c, v) { st.filters.push(['eq', c, v]); return b }, is(c, v) { st.filters.push(['is', c, v]); return b },
          in(c, v) { st.filters.push(['in', c, v]); return b }, not(c, o2, v) { st.filters.push(['not', c, v]); return b },
          order() { return b }, limit() { return b }, gte() { return b }, single() { st.single = true; return b }, maybeSingle() { st.single = true; return b },
          then(res, rej) { ops.push(st); return Promise.resolve(answer(st)).then(res, rej) },
        }
        return b
      },
    }
    const answer = (st) => {
      if (st.table === 'analysis_projects' && st.op === 'select') return { data: { id: 'p1', competitor_url: null, product_elevator_pitch: '노트앱', purpose: 'x', seller_own_guess: null }, error: null }
      if (st.table === 'analysis_inputs') return { data: [{ id: 'i1', source_type: 'review', source_key: 'appstore', raw_text: '동기화가 자주 끊겨서 불편하다. 가격은 괜찮다.', created_at: '2026-10-01T00:00:00Z', collected_at: null }], error: null }
      if (st.table === 'analysis_aspects' && st.op === 'insert') {
        if (failInsert) return { data: null, error: failInsert }
        if (insertReturn !== undefined) return { data: typeof insertReturn === 'function' ? insertReturn(st.payload) : insertReturn, error: null }
        return { data: st.payload.map((_, i) => ({ id: `new${i}` })), error: null }
      }
      if (st.table === 'analysis_aspects' && st.op === 'delete') {
        const undo = st.filters.some((f) => f[0] === 'in')
        if (undo) return { error: failUndo }
        return { error: failDelete }
      }
      return { data: [], error: null }
    }
    return db
  }
  const restore = { status: 'extracted', finishedAt: '2026-10-01T00:00:00Z' }
  const quiet = async (fn) => { const l = console.log; const e = console.error; const w = console.warn; console.log = console.error = console.warn = () => {}; try { return await fn() } finally { console.log = l; console.error = e; console.warn = w } }

  const okDb = makeDb()
  const ok = await quiet(() => runExtraction(okDb, 'p1', 'mock', restore, 3))
  const aOps = okDb.ops.filter((x) => x.table === 'analysis_aspects' && x.op !== 'select')
  t('정상: insert → (새 id 제외) delete 순서', ok.ok === true && aOps[0]?.op === 'insert' && aOps[1]?.op === 'delete' && aOps[1].filters.some((f) => f[0] === 'not' && /new0/.test(f[2])))
  t('정상: 그 뒤 프로젝트 extracted', okDb.ops.some((x) => x.table === 'analysis_projects' && x.op === 'update' && x.payload.status === 'extracted'))

  const fkDb = makeDb({ failDelete: { code: '23503', message: 'fk' } })
  const fk = await quiet(() => runExtraction(fkDb, 'p1', 'mock', restore, 3))
  const undo = fkDb.ops.find((x) => x.table === 'analysis_aspects' && x.op === 'delete' && x.filters.some((f) => f[0] === 'in'))
  const fkUpd = fkDb.ops.filter((x) => x.table === 'analysis_projects' && x.op === 'update').at(-1)
  t('옛 행 지우기 실패 → 새 행을 걷어낸다(보상)', fk.ok === false && !!undo && undo.filters.some((f) => f[0] === 'in' && f[2].includes('new0')))
  t('옛 행 지우기 실패 → 재추출은 이전 상태(extracted·직전 완료 시각)로 되돌린다', fkUpd?.payload.status === 'extracted' && fkUpd.payload.extract_finished_at === restore.finishedAt)
  t('일반 실패는 시도 수를 되돌리지 않는다', !('extract_attempts' in (fkUpd?.payload ?? {})))

  const insDb = makeDb({ failInsert: { code: 'X', message: 'insert boom' } })
  const ins = await quiet(() => runExtraction(insDb, 'p1', 'mock', restore, 3))
  t('새 행 넣기 실패 → 아무것도 안 지우고 이전 상태로', ins.ok === false && !insDb.ops.some((x) => x.table === 'analysis_aspects' && x.op === 'delete') && insDb.ops.filter((x) => x.op === 'update').at(-1)?.payload.status === 'extracted')

  const bothDb = makeDb({ failDelete: { code: 'X', message: 'del boom' }, failUndo: { message: 'undo boom' } })
  const both = await quiet(() => runExtraction(bothDb, 'p1', 'mock', restore, 3))
  t('보상까지 실패 → extracted 로 되돌리지 않고 failed + 오류에 "중복 남음"', both.ok === false && /중복 남음/.test(both.error) && bothDb.ops.filter((x) => x.op === 'update').at(-1)?.payload.status === 'failed')

  // 재검토 [꼭] 1: insert 가 성공 응답인데 id 를 돌려주지 않으면(null·빈 배열·일부만) "새 id 제외" 없이 delete 하면 방금 넣은 행까지 지운다.
  for (const [label, ret] of [['null', null], ['빈 배열', []], ['일부만', (p) => p.slice(0, Math.max(0, p.length - 1)).map((_, i) => ({ id: `new${i}` }))]]) {
    const db = makeDb({ insertReturn: ret })
    const r = await quiet(() => runExtraction(db, 'p1', 'mock', restore, 3))
    const delOld = db.ops.some((x) => x.table === 'analysis_aspects' && x.op === 'delete' && x.filters.some((f) => f[0] === 'eq' && f[1] === 'human_confirmed'))
    const last = db.ops.filter((x) => x.op === 'update').at(-1)
    t(`insert 응답 id ${label} → 옛 속성 delete 안 함 · failed(이전 상태라 장담 못 함)`, r.ok === false && !delOld && last?.payload.status === 'failed' && /돌려받은 id/.test(r.error))
  }
  {
    const db = makeDb({ insertReturn: (p) => p.slice(0, Math.max(0, p.length - 1)).map((_, i) => ({ id: `new${i}` })) })
    await quiet(() => runExtraction(db, 'p1', 'mock', restore, 3))
    const undoIds = db.ops.find((x) => x.table === 'analysis_aspects' && x.op === 'delete' && x.filters.some((f) => f[0] === 'in'))
    const insertedCount = db.ops.find((x) => x.op === 'insert')?.payload.length ?? 0
    const undone = undoIds?.filters.find((f) => f[0] === 'in')?.[2] ?? []
    t(`insert 응답 일부만(넣음 ${insertedCount} · 받음 ${insertedCount - 1}) → 받은 id 만 걷어 낸다`, insertedCount >= 2 && undone.length === insertedCount - 1)
  }

  // 하드 캡이 본 호출 전에 걸리면: 속성 쓰기 0건 · 이전 상태 · 시도 수 되돌림(claim 이 올린 3 → 2)
  const hcDb = makeDb()
  setCliHardCap(0) // 이미 쓴 돈 ≥ 0 → 첫 claude -p 부터 막힌다
  const hc = await quiet(() => runExtraction(hcDb, 'p1', 'claude-cli', restore, 3))
  setCliHardCap(null)
  const hcUpd = hcDb.ops.filter((x) => x.op === 'update').at(-1)
  t('하드 캡(본 호출 전) → 미완료: 속성 쓰기 0건', hc.ok === false && hc.hardCap === true && !hcDb.ops.some((x) => x.table === 'analysis_aspects' && x.op !== 'select'))
  t('하드 캡 → 이전 상태 보존 + 시도 수 되돌림(3→2)', hcUpd?.payload.status === 'extracted' && hcUpd.payload.extract_attempts === 2)
}

// ── 수집 경로는 토큰을 안 쓴다(v32 #5) — nightly-review-collect 가 부르는 스크립트의 import 그래프 전체에 LLM 경로가 없다 ──
{
  const LLM = /(analysis|insight)\/llm\.ts$|insight\/claude-cli\.ts$|@anthropic-ai\//
  const seen = new Set()
  const hits = []
  const walk = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+'([^']+)'|import\('([^']+)'\)/g)) {
      const spec = m[1] ?? m[2]
      if (LLM.test(spec)) { hits.push(`${path.relative(process.cwd(), file)} → ${spec}`); continue }
      if (!spec.startsWith('.')) continue
      const next = path.resolve(path.dirname(file), spec)
      if (/\.(ts|mjs|js)$/.test(next) && fs.existsSync(next)) walk(next)
    }
    if (/runClaude\(|callLlm\w*\(|claude -p/.test(src.replace(/\/\/.*$/gm, ''))) hits.push(`${path.relative(process.cwd(), file)} 본문에 LLM 호출`)
  }
  const wfc = read('.github/workflows/nightly-review-collect.yml')
  const entries = [...new Set([...wfc.matchAll(/node (scripts\/[\w.-]+\.mjs)/g)].map((m) => m[1]))]
  for (const e of entries) walk(path.join(process.cwd(), e))
  t(`수집 워크플로 진입점 ${entries.length}개(review-collect 포함) · 파일 ${seen.size}개에 LLM 경로 0`, entries.includes('scripts/review-collect.mjs') && seen.size > 20 && hits.length === 0)
  if (hits.length) console.log(hits.join('\n'))
  t('수집 워크플로에 구독·API 키가 없다', !/CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY|GEMINI_API_KEY/.test(wfc))
}

// ── 배선(정적) ──
const wf = read('.github/workflows/nightly-relevance.yml')
const crons = [...wf.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map(m => m[1])
t('nightly-relevance 크론 = RELEVANCE_SLOTS 키(1:1)', crons.length === 3 && crons.every(c => c in RELEVANCE_SLOTS) && Object.keys(RELEVANCE_SLOTS).length === 3)
t('모든 크론이 일일 형식(cron-watchdog 가 감시 가능)', crons.every(c => /^\d{1,2} \d{1,2} \* \* \*$/.test(c)))
t('판정 스텝 id=judge + 슬롯 크론 env', /id: judge/.test(wf) && /RELEVANCE_SLOT_CRON: \$\{\{ github\.event\.schedule \}\}/.test(wf))
t('뒤 스텝 4개 전부 ran=false 면 건너뜀', (wf.match(/steps\.judge\.outputs\.ran != 'false'/g) ?? []).length === 4)
t('workflow permissions 는 contents: read 그대로', /permissions:\s*\n\s*contents: read\s*\n/.test(wf) && !/actions: write/.test(wf))
const ex = read('scripts/extract-auto.mjs')
t('extract: 상한 확인이 claimExtraction 보다 앞(건너뛴 건 extract_attempts 안 태움)', ex.indexOf('capReached(spentNow') > 0 && ex.indexOf('capReached(spentNow') < ex.indexOf('await claimExtraction('))
t('extract: summary 에 stop_reason·processed·session', /stop_reason: stopReason, processed, not_started/.test(ex))
const rj = read('scripts/relevance-judge-auto.mjs')
t('T2: 소프트 캡은 프로젝트 경계(묶음 루프 밖), 하드 캡은 묶음마다', rj.indexOf('capReached(spentNow, capUsd)') > 0 && rj.indexOf('capReached(spentNow, capUsd)') < rj.indexOf('for (const batch of batches)') && /before >= hardCapUsd/.test(rj))
t('extract: 소프트 캡은 경계에서만(진행 중 프로젝트 안에서는 안 봄), 하드 캡은 llm.ts 에 건다', /setCliHardCap\(hardCapUsd, /.test(ex) && (ex.match(/capReached\(/g) ?? []).length === 1)
t('extract: 한도·하드 캡 실패에서 시도 수를 되돌리게 claim.attempts 를 넘긴다', /runExtraction\(supabase, target\.projectId, provider, claim\.restore, claim\.attempts\)/.test(ex))
t('extract: 하드 캡에 막힌(안 돈) 프로젝트는 touched 에 안 넣는다 — 큐 우선순위 유지', /if \(!\(out\.ok === false && out\.hardCap\)\) touched\.push/.test(ex) && !/\n  touched\.push\(target\.projectId\)/.test(ex))
t('extract·T2: 모든 spendForCap 호출이 폴백 설정을 넘긴다', !/spendForCap\(cli(Spent\(\))?\)/.test(ex) && !/spendForCap\(cli(Spent\(\))?\)/.test(rj) && /setCliHardCap\(hardCapUsd, guard\.cfg\.unitCostFallbackUsd\)/.test(ex))
t('T2: batchesDone 은 저장 성공 뒤에 센다', rj.indexOf('batchesDone += 1') > rj.indexOf('judgedTotal += rows.length'))
t('extract: 재시도 큐를 summary 에 남기고 소진이면 exit 1', /retry_queue: rq\.queue/.test(ex) && /alarm \|\| rq\.giveUp \? 1 : 0/.test(ex))
t('T2: 마지막 재시도 한도면 exit 1(watchdog → Notion)', /retriesExhausted \? 1 : 0/.test(rj))
t('번역: 기록만(capReached 없음)', !/capReached/.test(read('scripts/relevance-translate.mjs')) && /job: 'translate'/.test(read('scripts/relevance-translate.mjs')))
t('extract·T2 상한 판정이 spendForCap(비용 모름 추정)을 쓴다', /spendForCap\(cliSpent\(\), /.test(ex) && /spendForCap\(cliSpent\(\), /.test(rj) && !/cliSpent\(\)\.usd\s*\n?\s*if \(.*capReached/.test(ex))
t('T2: r2 가 한도 정지인 채 쉬면 exit 1', /slot === 'r2' && retry\.quotaPending !== false/.test(rj))
for (const [f, k] of [['scripts/relevance-second-judge-auto.mjs', 'relevance-second-'], ['scripts/relevance-auto-approve.mjs', 'relevance-auto-approve-'], ['scripts/case-auto-approve.mjs', 'case-auto-approve-'], ['scripts/relevance-judge-auto.mjs', 'relevance-judge-']]) {
  t(`${f}: run_key 에 슬롯 접미사(정규 행 보존)`, read(f).includes(`runKey: \`${k}\${kstDate()}\${relevanceRunSuffixFromEnv()}\``) || (k === 'relevance-judge-' && /relevanceRunSuffixFromEnv\(\)/.test(read(f)) && read(f).includes('`relevance-judge-${today}${suffix}`')))
}
t('RELEVANCE_SLOT_CRON 은 job env(모든 스텝이 같은 접미사)', /^    env:\r?\n(?:      #.*\r?\n)*      RELEVANCE_SLOT_CRON: \$\{\{ github\.event\.schedule \}\}/m.test(wf))
t('build-check 가 이 셀프테스트를 돈다', /- run: node scripts\/session-guard-selftest\.mjs/.test(read('.github/workflows/build-check.yml')))
t('측정 절차 문서가 있다(로컬 claude -p 금지 명시)', /workflow_dispatch/.test(read('docs/session-limit-guard.md')) && /로컬 `claude -p`/.test(read('docs/session-limit-guard.md')))

console.log(`\n${fail === 0 ? '✅' : '❌'} 세션 한도 가드 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
