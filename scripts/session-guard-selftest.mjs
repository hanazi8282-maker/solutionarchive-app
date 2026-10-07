#!/usr/bin/env node
// 세션 한도 가드(남헌 v30 §5) 셀프테스트 — DB·LLM 없이 순수 로직 + 워크플로/스크립트 배선을 본다.
//   node scripts/session-guard-selftest.mjs     (종료코드 0 = 전부 통과)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  GUARDED_RUN_PREFIXES, RELEVANCE_SLOTS, capReached, capUsdOf, loadGuardConfig, parseGuardConfig, pctOf,
  relevanceRetryDecision, runCostUsd, sessionBlock, sessionLine, usageSince, weeklyGate,
} from '../lib/analysis/session-guard.ts'
import { BLOCKED_ALARM_STREAK, QUOTA_COOLDOWN_MS, decideSlot, isQuotaBlocked, slotStateOf } from '../lib/analysis/extract-auto.ts'
import { cliSpent, tallyCli } from '../lib/analysis/llm.ts'

let pass = 0
let fail = 0
const t = (name, ok) => { if (ok) pass += 1; else { fail += 1; console.log(`✗ ${name}`) } }
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── 설정 ──
const real = loadGuardConfig()
t('리포 설정 파일을 읽는다', real.error === null)
t('시작값: 15% × $0.3/%p = $4.5', real.cfg.capPct === 15 && real.cfg.usdPerPct === 0.3 && Math.abs(capUsdOf(real.cfg) - 4.5) < 1e-9)
t('주간 스위치는 기본 비활성(null)', real.cfg.weeklyStopPct === null)
const missing = loadGuardConfig(path.join(os.tmpdir(), 'no-such-session-guard.json'))
t('설정 파일이 없으면 error + 상한 null(가드 확인 불가 → 닫힘)', missing.error !== null && capUsdOf(missing.cfg) === null)
t('0·음수·문자열은 값 없음으로', parseGuardConfig({ session_cap_pct: 0, usd_per_session_pct: '0.3' }).capPct === null && parseGuardConfig({ usd_per_session_pct: '0.3' }).usdPerPct === null)
t('계수 하나만 없어도 상한 null', capUsdOf(parseGuardConfig({ session_cap_pct: 15 })) === null)
t('pct 환산, 계수 없으면 null', pctOf(0.87, 0.3) === 2.9 && pctOf(1, null) === null)

// ── 상한 판정 ──
t('첫 단위 전(0/0)은 통과', capReached(0, 0, 4.5) === false)
t('쓴 돈이 상한 이상이면 멈춤', capReached(4.5, 0, 4.5) === true)
t('다음 단위가 넘길 것 같으면 미리 멈춤', capReached(4.3, 0.31, 4.5) === true)
t('다음 단위가 들어가면 진행', capReached(4.1, 0.31, 4.5) === false)
// 루프 시뮬레이션 — extract 1건 $0.13~0.31(실측). 상한을 넘기지 않고, 남은 건은 손대지 않는다.
{
  const costs = [0.13, 0.31, 0.26, 0.2, 0.31, 0.29, 0.3, 0.31, 0.27, 0.31, 0.3, 0.29, 0.31, 0.31, 0.31, 0.3, 0.3, 0.31, 0.31, 0.31]
  let spent = 0; let maxUnit = 0; let processed = 0
  for (const c of costs) { if (capReached(spent, maxUnit, 4.5)) break; spent += c; maxUnit = Math.max(maxUnit, c); processed += 1 }
  t(`시뮬: 20건 중 ${processed}건 처리, 사용 $${spent.toFixed(2)} ≤ 상한 $4.5`, spent <= 4.5 && processed > 10 && processed < costs.length)
  t('시뮬: 상한과의 남은 틈은 단위 1개 미만', 4.5 - spent < maxUnit)
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
t('작업별 사용액·사용률', sb.spent_usd === 0.6 && sb.used_pct === 2 && sb.cap_usd === 4.5 && sb.cap_pct === 15)
t('5시간 창 합산 = 다른 실행 + 이번', sb.window5h_usd === 2.2 && sb.window5h_pct === 7.33 && sb.window5h_other_runs === 2)
t('창 조회 실패면 null(0 아님)', sessionBlock({ job: 'extract', cfg: real.cfg, spentUsd: 1, calls: 1, costUnknownCalls: 0, window5h: null, weekUsd: null, capped: true }).window5h_usd === null)
t('번역은 상한 없음(기록만)', sessionBlock({ job: 'translate', cfg: real.cfg, spentUsd: 1, calls: 1, costUnknownCalls: 0, window5h: null, weekUsd: null, capped: false }).cap_usd === null)
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
t('T2: 묶음마다 상한 확인', /capReached\(before, maxBatchUsd, capUsd\)/.test(rj))
t('T2: 마지막 재시도 한도면 exit 1(watchdog → Notion)', /retriesExhausted \? 1 : 0/.test(rj))
t('번역: 기록만(capReached 없음)', !/capReached/.test(read('scripts/relevance-translate.mjs')) && /job: 'translate'/.test(read('scripts/relevance-translate.mjs')))
t('측정 절차 문서가 있다(로컬 claude -p 금지 명시)', /workflow_dispatch/.test(read('docs/session-limit-guard.md')) && /로컬 `claude -p`/.test(read('docs/session-limit-guard.md')))

console.log(`\n${fail === 0 ? '✅' : '❌'} 세션 한도 가드 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
