#!/usr/bin/env node
// extract 하루 건수 자동 조정(남헌 v36 §2) 셀프테스트 — lib/analysis/extract-autotune.ts + scripts/extract-auto.mjs 배선.
// 네트워크·실 DB·LLM 없음. 통합 케이스는 로컬 가짜 PostgREST(node:http)에 extract-auto.mjs 를 자식 프로세스로 붙여 실제로 돌린다.
//   node scripts/extract-autotune-selftest.mjs
//
// 왜 있나: 자동 조정이 조용히 틀리면 (1) 스위치 off 인데 슬롯·하루 상한이 바뀌거나, (2) 소프트 한도로 멈춘 run 을 근거로
// 처리량을 깎거나, (3) 쉬는 날·비용 모르는 run 으로 올린다. 셋 다 로그는 정상처럼 보인다(§7.1·§7.2).

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  AUTOTUNE, autotuneOn, capBindingOf, carriedD, clampD, decideAutotune, isScheduledKey, runUsedPct, slotMaxOf, stepOf, weeklySafety,
} from '../lib/analysis/extract-autotune.ts'
import { backlogOf, decideSlot, EXTRACT_SLOTS, pickAutoTargets, slotStateOf } from '../lib/analysis/extract-auto.ts'
import { kstDate } from './notion-status-log.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// ── 1. 스위치 ─────────────────────────────────────────────────
t('스위치 미설정 = off', autotuneOn(undefined) === false)
for (const v of ['', 'off', 'false', '0', 'OFF', 'yes']) t(`스위치 '${v}' = off`, autotuneOn(v) === false)
for (const v of ['on', 'ON', ' true ']) t(`스위치 '${v}' = on`, autotuneOn(v) === true)

// ── 2. 스텝·클램프·슬롯 상한 ───────────────────────────────────
t('시작 48 · 범위 24~72 · 슬롯 상한 24 = 72÷3', AUTOTUNE.start === 48 && AUTOTUNE.min === 24 && AUTOTUNE.max === 72 && AUTOTUNE.slotCeil === 24 && AUTOTUNE.max / 3 === AUTOTUNE.slotCeil)
t('스텝 = round(20%): 48→10(9.6) · 24→5(4.8) · 72→14(14.4) · 58→12(11.6)', stepOf(48) === 10 && stepOf(24) === 5 && stepOf(72) === 14 && stepOf(58) === 12)
t('스텝 최소 1: round(2×0.2)=0 → 1', stepOf(2) === 1 && stepOf(1) === 1)
t('클램프는 정수·범위 안', clampD(84) === 72 && clampD(19) === 24 && clampD(47.6) === 48 && Number.isInteger(clampD(50.4)))
t('슬롯 상한 = ceil(D÷3), ≤24', slotMaxOf(48) === 16 && slotMaxOf(58) === 20 && slotMaxOf(24) === 8 && slotMaxOf(25) === 9 && slotMaxOf(72) === 24 && slotMaxOf(100) === 24)

// ── 3. cap_binding ────────────────────────────────────────────
t('슬롯 상한에 걸림(남은 대상 있음, max=슬롯) = slot', capBindingOf({ decision: 'run', stopReason: null, remaining: 3, gateMax: 16, slotMax: 16 }) === 'slot')
t('하루 남은 몫이 슬롯보다 작아 걸림 = daily', capBindingOf({ decision: 'run', stopReason: null, remaining: 3, gateMax: 5, slotMax: 16 }) === 'daily')
t('대기 소진 = none', capBindingOf({ decision: 'run', stopReason: null, remaining: 0, gateMax: 16, slotMax: 16 }) === 'none')
t('소프트 한도 = cost', capBindingOf({ decision: 'run', stopReason: 'session_cap', remaining: 0 }) === 'cost')
t('비용 확인 불가 정지도 cost(소프트 가드)', capBindingOf({ decision: 'run', stopReason: 'cost_unknown' }) === 'cost')
t('하드 캡 = hard', capBindingOf({ decision: 'run', stopReason: 'hard_cap', remaining: 5, gateMax: 16, slotMax: 16 }) === 'hard')
t('구독 한도·주간 스위치·설정 깨짐 = null(다섯 밖, stop_reason 이 이유)', ['quota', 'weekly_stop', 'guard_config'].every(s => capBindingOf({ decision: 'run', stopReason: s }) === null))
t('하루 상한으로 쉼 = daily', capBindingOf({ decision: 'skip', skipCap: 'daily', skipWarn: false }) === 'daily')
t('문턱 미만으로 쉼 = none', capBindingOf({ decision: 'skip', skipWarn: false }) === 'none')
t('쿨다운·확인 불가로 쉼 = null', capBindingOf({ decision: 'skip', skipWarn: true }) === null)
{
  const st = { prevRan: false, doneToday: 24, cooldownUntil: null, cooldownFromReset: false, consecutiveBlocked: 0 }
  const g = decideSlot({ slot: 's3', backlog: { B: 9, S: 0, Bw: 20 }, state: st, dailyMax: 24, slotMax: 10, now: new Date() })
  t('decideSlot 하루 상한 쉼에 cap=daily 가 붙는다', g.run === false && g.cap === 'daily')
  const g2 = decideSlot({ slot: 's2', backlog: { B: 1, S: 0, Bw: 1 }, state: { ...st, doneToday: 0 }, dailyMax: 24, slotMax: 10, now: new Date() })
  t('문턱 쉼에는 cap 이 없다', g2.run === false && g2.cap === undefined)
}

// ── 4. 사용률 ─────────────────────────────────────────────────
const sess = (usd, unknown = 0, calls = 5) => ({ spent_usd: usd, cost_unknown_calls: unknown, claude_calls: calls })
t('사용률 = spent_usd ÷ 0.43(분모는 세션 100%)', runUsedPct({ run_key: 'x', status: 'ok', summary: { session: sess(2.15) } }, 0.43) === 5)
t('비용 못 읽은 호출이 있으면 null(0 으로 접지 않음)', runUsedPct({ run_key: 'x', status: 'ok', summary: { session: sess(1, 1) } }, 0.43) === null)
t('session 블록 없음 = null', runUsedPct({ run_key: 'x', status: 'ok', summary: { cost_usd: 1 } }, 0.43) === null)
t('계수 없음 = null', runUsedPct({ run_key: 'x', status: 'ok', summary: { session: sess(1) } }, null) === null)

// ── 5. 주간 안전선 ─────────────────────────────────────────────
t('N null = disabled(평가 안 함, 확인 불가로 접지 않음)', weeklySafety(null, null, null).state === 'disabled')
t('N 설정·계수 없음 = unknown', weeklySafety(50, null, 10).state === 'unknown')
t('N 설정·이력 없음 = unknown', weeklySafety(50, 1.3, null).state === 'unknown')
t('주간 초과 = over', weeklySafety(50, 1, 60).state === 'over' && weeklySafety(50, 1, 50).state === 'ok')

// ── 6. decideAutotune ─────────────────────────────────────────
const NOW = new Date('2026-10-10T00:00:00Z') // KST 2026-10-10 09:00
const TODAY = '2026-10-10'
const H = 3_600_000
const iso = (hAgo) => new Date(NOW.getTime() - hAgo * H).toISOString()
let seq = 0
const run = (key, hAgo, s = {}, status = 'ok') => ({
  run_key: `extract-auto-${key}`, status, started_at: iso(hAgo),
  summary: { decision: 'run', cap_binding: 'slot', session: sess(1.0), autotune: { evaluated: false }, ...s }, _seq: seq++,
})
const good3 = () => [run('2026-10-09-s3', 20), run('2026-10-09-s2', 26), run('2026-10-09-s1', 33)] // 1.0/0.43 = 2.33%
const WD = weeklySafety(null, null, null)
const dec = (rows, o = {}) => decideAutotune({ rows, runKey: 'extract-auto-2026-10-10-s1', today: TODAY, now: NOW, pending: 3, slotRuns: true, usdPerPct: 0.43, weekly: WD, ...o })

{
  const d = dec(good3())
  t('d 기록 없는 on 시절 run 뿐이면 시작 48 에서 평가', d.source === 'initial' && d.prev === 48)
  t('올리기: 평균 2.33% < 8% · slot×3 · 대기 3 → 48→58', d.action === 'up' && d.next === 58 && d.d === 58 && d.slot_max === 20 && d.evaluated === true)
  t('근거가 남는다(윈도 run_key·사용률·cap_binding·대기·주간)', d.window.length === 3 && d.window[0].run_key === 'extract-auto-2026-10-09-s3' && d.window[0].used_pct === 2.33 && d.avg_pct === 2.33 && d.pending === 3 && d.weekly.state === 'disabled')
  t('cap_binding daily/none 도 올리기 허용', dec([run('2026-10-09-s3', 20, { cap_binding: 'daily' }), run('2026-10-09-s2', 26, { cap_binding: 'none' }), run('2026-10-09-s1', 33)]).action === 'up')
}
t('평균 ≥ 8% 면 무변경', dec([run('2026-10-09-s3', 20, { session: sess(5) }), run('2026-10-09-s2', 26, { session: sess(5) }), run('2026-10-09-s1', 33, { session: sess(1) })]).action === 'hold')
t('평균 8% 정확히 = 무변경(< 8 만 올림)', dec([run('2026-10-09-s3', 20, { session: sess(3.44) }), run('2026-10-09-s2', 26, { session: sess(3.44) }), run('2026-10-09-s1', 33, { session: sess(3.44) })]).action === 'hold')
t('대기 0 이면 올리지 않는다', dec(good3(), { pending: 0 }).action === 'hold')
{
  const d = dec(good3(), { slotRuns: false })
  t('이 슬롯이 쉬는 날(백로그 문턱 미만)은 올리지 않는다', d.action === 'hold' && /쉰다/.test(d.reason))
}
{
  // cost 로 멈춘 run(소프트 한도) — 윈도 안에선 올리기를 막고, 내리기 근거는 아니다.
  const costRun = run('2026-10-09-s3', 20, { cap_binding: 'cost', stop_reason: 'session_cap', session: sess(6.6) }, 'blocked')
  const d = dec([costRun, run('2026-10-09-s2', 26), run('2026-10-09-s1', 33)])
  t('cost 로 멈춘 run 은 내리기 근거에서 제외(blocked 여도)', d.action === 'hold' && d.down_signals.length === 0)
  t('cost 로 멈춘 run 이 윈도에 있으면 올리지 않는다', /cap_binding/.test(d.reason))
  // 옛 행(cap_binding 없음, stop_reason=session_cap)도 같은 취급
  const old = { run_key: 'extract-auto-2026-10-09-s3', status: 'blocked', started_at: iso(20), summary: { decision: 'run', stop_reason: 'session_cap', session: sess(6.6) } }
  t('옛 session_cap 행도 내리기 근거가 아니다', dec([old, ...good3().slice(1)]).action !== 'down')
}
{
  const d = dec([run('2026-10-09-s3', 20, { cap_binding: 'hard', stop_reason: 'hard_cap' }, 'blocked'), ...good3().slice(1)])
  t('hard 캡 → 48→38(−10)', d.action === 'down' && d.next === 38 && d.down_signals[0] === 'extract-auto-2026-10-09-s3')
  const q = dec([run('2026-10-09-m1', 10, { cap_binding: null, stop_reason: 'quota' }, 'blocked'), ...good3()])
  t('세션 한도 오류(quota)난 날 → −20%', q.action === 'down' && q.next === 38)
  const m = dec([run('2026-10-09-m123', 10, { cap_binding: null, stop_reason: 'quota' }, 'blocked'), ...good3()])
  t('한도 오류는 수동 run 이어도 내리기 근거(구독 전체 사건)', m.action === 'down')
  const oldQ = { run_key: 'extract-auto-2026-10-09-m2', status: 'blocked', started_at: iso(10), summary: { decision: 'run' } }
  t('stop_reason 없는 옛 blocked 행은 한도로 본다(isQuotaBlocked 와 같은 규칙)', dec([oldQ, ...good3()]).action === 'down')
  t('내리기 우선 — 올리기 조건이 맞아도 hard 가 있으면 내린다', dec([...good3(), run('2026-10-09-m9', 5, { cap_binding: 'hard', stop_reason: 'hard_cap' }, 'blocked')]).action === 'down')
}
{
  const over = weeklySafety(50, 1, 70)
  const d = dec(good3(), { weekly: over })
  t('주간 사용률 > 안전선 → 내리기', d.action === 'down' && /주간 70% > 안전선 50%/.test(d.reason))
  t('주간 unknown → 올리지 않는다(내리지도 않는다)', dec(good3(), { weekly: weeklySafety(50, null, 10) }).action === 'hold')
}
{
  // 비용 미상 run 은 윈도에서 빠지고 다음(더 오래된) run 으로 채운다
  const rows = [run('2026-10-09-s3', 20, { session: sess(0.5, 2) }), ...good3().slice(1), run('2026-10-08-s3', 44)]
  const d = dec(rows)
  t('비용 미상 run 제외 → 다음 run 으로 윈도 3', d.window.length === 3 && !d.window.some(w => w.run_key.endsWith('10-09-s3')) && d.action === 'up')
  const d2 = dec([run('2026-10-09-s3', 20, { session: sess(0.5, 2) }), ...good3().slice(1)])
  t('비용 미상 run 을 빼면 2건 → 윈도 부족 무변경', d2.action === 'hold' && d2.window.length === 2 && /윈도 부족 2\/3/.test(d2.reason))
}
t('수동 m* 는 윈도 제외 → 부족', dec([run('2026-10-09-m777', 2), ...good3().slice(1)]).window.length === 2)
t('쉼 행(decision=skip)은 윈도 제외', dec([run('2026-10-09-s3', 20, { decision: 'skip' }), ...good3().slice(1)]).window.length === 2)
t('진행 중(running) 행은 윈도 제외', dec([run('2026-10-09-s3', 20, {}, 'running'), ...good3().slice(1)]).window.length === 2)
t('cap_binding 없는 옛 행은 윈도 제외(모르는 것을 통과로 접지 않음)', dec([{ ...run('2026-10-09-s3', 20), summary: { decision: 'run', session: sess(1), autotune: { d: 48 } } }, ...good3().slice(1)]).window.length === 2)
t('7일 넘은 run 은 윈도 제외', dec([...good3().slice(0, 2), run('2026-10-02-s1', 8 * 24)]).window.length === 2)
{
  // 마지막 조정 이후만: 조정 run(그 run 은 새 D 로 돌았으니 포함) 이전 run 은 빠진다
  const adj = run('2026-10-09-s1', 33, { autotune: { d: 58, evaluated: true, action: 'up' } })
  const d = dec([run('2026-10-09-s3', 20), run('2026-10-09-s2', 26), adj, run('2026-10-08-s3', 44), run('2026-10-08-s2', 50)])
  t('체인: 직전 기록 D 58 을 이어받는다', d.prev === 58 && d.source === 'chain')
  t('마지막 조정 이후 윈도(조정 run 포함) → 58→70', d.window.map(w => w.run_key.slice(-8)).join() === '10-09-s3,10-09-s2,10-09-s1' && d.next === 70)
  const d2 = dec([run('2026-10-09-s3', 20), adj, run('2026-10-08-s3', 44), run('2026-10-08-s2', 50)])
  t('조정 이전 run 은 윈도에 안 들어간다 → 2건 부족', d2.action === 'hold' && d2.window.length === 2)
}
{
  // 하루 1회: 오늘 s1 이 이미 평가했으면 s2 는 평가하지 않고 D 만 잇는다
  const s1 = run(`${TODAY}-s1`, 3, { autotune: { d: 58, evaluated: true, action: 'up' } })
  const d = dec([s1, ...good3()], { runKey: `extract-auto-${TODAY}-s2` })
  t('하루 1회 — 오늘 이미 평가함 → 평가 안 함, D 58 유지', d.evaluated === false && d.action === null && d.d === 58 && d.slot_max === 20)
  const hold = run(`${TODAY}-s1`, 3, { autotune: { d: 48, evaluated: true, action: 'hold' } })
  t('hold 로 평가한 날도 하루 1회에 센다', dec([hold, ...good3()], { runKey: `extract-auto-${TODAY}-s3` }).evaluated === false)
  const manualEval = run(`${TODAY}-m55`, 3, { autotune: { d: 48, evaluated: true, action: 'hold' } })
  t('수동 행의 evaluated 는 오늘 평가로 치지 않는다(스케줄만)', dec([manualEval, ...good3()]).evaluated === true)
}
{
  const d = dec(good3(), { runKey: `extract-auto-${TODAY}-m999` })
  t('수동 실행은 평가 안 함(run_key m*) — 입력 slot=s1 이어도', d.evaluated === false && d.d === 48 && isScheduledKey(`extract-auto-${TODAY}-m999`) === false)
  t('로컬 실행도 평가 안 함', dec(good3(), { runKey: `extract-auto-${TODAY}-local` }).evaluated === false)
}
{
  const d = dec(null)
  t('이력 확인 불가 → 하한 24 로 돈다(올리는 쪽으로 접지 않음)·평가 안 함', d.d === 24 && d.slot_max === 8 && d.evaluated === false && d.source === 'unreadable')
}
{
  // 경계: 상한·하한 클램프와 hold
  const at = (d0, extra) => [run('2026-10-09-s1', 34, { autotune: { d: d0, evaluated: true, action: 'up' } }), ...extra]
  const top = dec([run('2026-10-09-s3', 20), run('2026-10-09-s2', 26), ...at(72, [])])
  t('72 에서 올리기 = 상한이라 hold(정수 72 유지)', top.action === 'hold' && top.d === 72 && /상한 72/.test(top.reason))
  const near = dec([run('2026-10-09-s3', 20), run('2026-10-09-s2', 26), ...at(70, [])])
  t('70 + 14 = 84 → 72 로 클램프', near.action === 'up' && near.next === 72 && near.slot_max === 24)
  const low = dec([run('2026-10-09-s3', 20, { cap_binding: 'hard', stop_reason: 'hard_cap' }, 'blocked'), ...at(26, [])])
  t('26 − 5 = 21 → 24 로 클램프', low.action === 'down' && low.next === 24)
  const floor = dec([run('2026-10-09-s3', 20, { cap_binding: 'hard', stop_reason: 'hard_cap' }, 'blocked'), ...at(24, [])])
  t('24 에서 내리기 = 하한이라 hold', floor.action === 'hold' && floor.d === 24)
  const bad = carriedD([{ run_key: 'extract-auto-x-s1', status: 'ok', started_at: iso(1), summary: { autotune: { d: 999 } } }])
  t('기록된 D 가 범위 밖이면 클램프해서 잇는다', bad.d === 72)
}
{
  // 내리기 근거 범위: 지난 평가 이후만 — 이미 반영된 어제의 한도 오류로 두 번 깎지 않는다
  const evalRun = run('2026-10-09-s1', 33, { autotune: { d: 38, evaluated: true, action: 'down' } })
  const q = run('2026-10-08-s2', 50, { cap_binding: null, stop_reason: 'quota' }, 'blocked')
  const d = dec([run('2026-10-09-s3', 20), run('2026-10-09-s2', 26), evalRun, q])
  t('지난 평가 이전의 한도 오류는 다시 세지 않는다', d.action !== 'down' && d.prev === 38)
}

// ── 6b. 독립 검토(PR #457) 반영 ─────────────────────────────────
{
  // 1) 이력 조회 실패 1회가 D 를 24 로 굳히지 않는다
  const r72 = run('2026-10-08-s1', 60, { autotune: { d: 72, evaluated: true, action: 'up', source: 'chain' } })
  const unread = { run_key: 'extract-auto-2026-10-09-s1', status: 'ok', started_at: iso(33), summary: { decision: 'run', cap_binding: 'none', session: sess(1), autotune: { d: 24, evaluated: false, action: null, source: 'unreadable' } } }
  t('72 → unreadable 1회 → 다음 run 도 72 를 잇는다(carriedD)', carriedD([unread, r72]).d === 72)
  const d = dec([unread, r72])
  t('72 → unreadable 1회 → 다음 평가의 prev 도 72', d.prev === 72 && d.d >= 72 - stepOf(72))
  t('unreadable 행 자체는 평가 기록이 아니다(evaluated=false)', dec(null).evaluated === false && dec(null).source === 'unreadable')
}
{
  // 2) off 시절 run(summary.autotune 없음)은 올리기 근거가 아니다 — 켠 직후 첫 평가는 윈도 부족 무변경
  const offEra = good3().map(r => { const { autotune, ...rest } = r.summary; return { ...r, summary: rest } })
  const d = dec(offEra)
  t('켠 직후 첫 평가: off 시절 run 3건만 있으면 윈도 0 → 무변경', d.action === 'hold' && d.window.length === 0 && /윈도 부족 0\/3/.test(d.reason))
  t('켠 직후 D 는 코드 상수 48(변수 EXTRACT_AUTO_DAILY_MAX 아님) · 슬롯 16', d.d === 48 && d.slot_max === 16 && d.source === 'initial')
  const mixed = dec([...good3().slice(0, 2), ...offEra.slice(2)])
  t('on 시절 2건 + off 시절 1건 → 2건(부족)', mixed.window.length === 2 && mixed.action === 'hold')
  const offHard = dec([{ ...offEra[0], status: 'blocked', summary: { ...offEra[0].summary, cap_binding: 'hard', stop_reason: 'hard_cap' } }], { now: new Date(NOW.getTime() - 4 * H) })
  t('내리기 근거는 off 시절 run 도 센다(지난 평가 이후 사건)', offHard.action === 'down')
}
{
  // 3) claude 호출 0회 run 은 윈도에서 빠진다
  t('호출 0회 run 의 사용률 = null', runUsedPct({ run_key: 'x', status: 'ok', summary: { session: sess(0, 0, 0) } }, 0.43) === null)
  t('claude_calls 없는 옛 session 블록 = null', runUsedPct({ run_key: 'x', status: 'ok', summary: { session: { spent_usd: 1, cost_unknown_calls: 0 } } }, 0.43) === null)
  const d = dec([run('2026-10-09-s3', 18, { session: sess(0, 0, 0) }), ...good3().slice(1)])
  t('호출 0회 run 이 끼면 윈도 2건 → 무변경(0% 로 평균을 끌어내리지 않음)', d.window.length === 2 && d.action === 'hold')
}
{
  // 4) timeout 으로 'running' 에 남은 스케줄 run 이 직전 3개 안에 있으면 올리지 않는다
  const dead = { run_key: 'extract-auto-2026-10-09-s3', status: 'running', started_at: iso(10), summary: null }
  const d = dec([dead, run('2026-10-09-s2', 20), run('2026-10-09-s1', 26), run('2026-10-08-s3', 44)])
  t('직전 스케줄 3개 중 running → 올리기 보류', d.action === 'hold' && /running/.test(d.reason) && d.window.length === 3)
  const old = { ...dead, run_key: 'extract-auto-2026-10-08-s1', started_at: iso(60) }
  t('running 이 직전 3개 밖이면 막지 않는다', dec([...good3(), old]).action === 'up')
}

// ── 7. 배선(소스 대조): off 면 상한 변수를 건드리는 줄이 전부 스위치 블록 안 ──
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'extract-auto.mjs'), 'utf8').replace(/\r\n/g, '\n')
{
  const block = /if \(tuneOn\) \{\n([\s\S]*?)\n\}\n/.exec(src)?.[1] ?? ''
  const outside = src.replace(block, '')
  t('dailyMax = tune.d 는 if (tuneOn) 블록 안에만', block.includes('dailyMax = tune.d') && !/dailyMax = tune/.test(outside))
  t('max = tune.slot_max 는 스케줄 run 에만, 블록 안에만', /if \(scheduled\) max = tune\.slot_max/.test(block) && !/max = tune\.slot_max/.test(outside))
  t('off 면 7일 이력은 기존 자리(3.5)에서 읽는다', src.includes('if (!tuneOn) recentRuns = await loadRecentRuns(supabase, guardNow)'))
  t('세 finish 자리 전부 cap_binding 을 남긴다', (src.match(/cap_binding: capBindingOf\(/g) ?? []).length === 2 && src.includes('cap_binding: capBinding,'))
  t('세 finish 자리 전부 autotune 블록·Notion 미러', (src.match(/\.\.\.tuneFields\(\)/g) ?? []).length === 3 && (src.match(/await mirrorTune\(/g) ?? []).length === 3)
  t('Notion 미러는 기존 upsertStatusLog 재사용(새 시크릿·새 경로 없음)', src.includes("upsertStatusLog(") && src.includes("marker: 'extract-autotune'"))
}

// ── 8. 워크플로: timeout 180 · 스위치는 vars(시크릿 아님) · 새 시크릿 없음 ──
{
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'nightly-extract.yml'), 'utf8').replace(/\r\n/g, '\n')
  t('timeout-minutes 180(슬롯 24건)', /^\s+timeout-minutes: 180\b/m.test(yml) && !/timeout-minutes: 120\b/.test(yml))
  t('EXTRACT_AUTOTUNE 은 리포 변수에서, 기본 off', /EXTRACT_AUTOTUNE: \$\{\{ vars\.EXTRACT_AUTOTUNE \|\| 'off' \}\}/.test(yml))
  const secrets = [...yml.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]).sort().join(',')
  t('시크릿은 기존 3개뿐(NOTION_API_TOKEN 등 추가 없음)', secrets === 'CLAUDE_CODE_OAUTH_TOKEN,NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY')
  t('permissions 는 contents: read 그대로', /permissions:\n  contents: read\n\n/.test(yml))
}

// ── 9. 통합: 가짜 PostgREST + extract-auto.mjs 자식 프로세스 ────────
// 실제 스크립트가 실제 supabase-js 로 실제 HTTP 를 친다. 바꿔 끼운 건 서버 하나 — 부품 테스트를 통합 근거로 쓰지 않는다(§7.1-5).
const DAY = 86_400_000
const realNow = Date.now()
const kAgo = (h) => new Date(realNow - h * H)
const keyAt = (h, s) => `extract-auto-${kstDate(kAgo(h))}-${s}`
// 오늘(KST) 행이 생기지 않게 26시간 이상 전으로 둔다
const history = [
  { run_key: keyAt(26, 's3'), status: 'ok', started_at: kAgo(26).toISOString(), finished_at: kAgo(25).toISOString(), summary: { decision: 'run', cap_binding: 'slot', done: 10, failed: 0, session: sess(1.2), autotune: { d: 48, evaluated: false, action: null, source: 'chain' } } },
  { run_key: keyAt(32, 's2'), status: 'ok', started_at: kAgo(32).toISOString(), finished_at: kAgo(31).toISOString(), summary: { decision: 'run', cap_binding: 'slot', done: 10, failed: 0, session: sess(0.9), autotune: { d: 48, evaluated: false, action: null, source: 'chain' } } },
  { run_key: keyAt(41, 's1'), status: 'ok', started_at: kAgo(41).toISOString(), finished_at: kAgo(40).toISOString(), summary: { decision: 'run', cap_binding: 'none', done: 4, failed: 0, session: sess(0.8), autotune: { d: 48, evaluated: false, action: null, source: 'chain' } } },
]
const projects = [{ id: 'p-saas', status: 'collecting', extract_finished_at: null, extract_attempts: 0, product_elevator_pitch: 'fake', business_model: 'SAAS' }]
const NEW_INPUTS = 150

function fakeDb() {
  const patches = []
  const unexpected = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const u = new URL(req.url, 'http://x')
      const table = u.pathname.replace('/rest/v1/', '')
      const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json', connection: 'close' }); res.end(obj === undefined ? '' : JSON.stringify(obj)) }
      if (table === 'analysis_projects' && req.method === 'GET') {
        // claimExtraction 의 단건 조회(id=eq.) 는 "없음" — 잠그지 않고 건너뛰게(LLM·쓰기 경로를 타지 않는다)
        if (u.searchParams.get('id')) return json(406, { code: 'PGRST116', message: 'no rows', details: null, hint: null })
        return json(200, projects)
      }
      if (table === 'analysis_inputs' && req.method === 'HEAD') { res.writeHead(200, { 'content-range': `*/${NEW_INPUTS}`, connection: 'close' }); return res.end() }
      if (table === 'agent_runs' && req.method === 'GET') return json(200, history)
      if (table === 'agent_runs' && req.method === 'POST') return json(201, { id: 'run-fake' })
      if (table === 'agent_run_steps' && req.method === 'POST') return json(201)
      if (table === 'agent_runs' && req.method === 'PATCH') { patches.push(JSON.parse(body)); return json(204) }
      unexpected.push(`${req.method} ${u.pathname}${u.search}`)
      return json(404, { code: 'X', message: 'unexpected' })
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, patches, unexpected, url: `http://127.0.0.1:${server.address().port}` })))
}

// Windows 로컬 Node 24 는 fetch 핸들이 남은 채 process.exit 하면 libuv 단언으로 죽는다(종료코드가 0 이 아니게 된다 — 스크립트 결함이 아님).
// 그 경우만 종료코드를 "확인 불가"로 보고 기록(PATCH 본문)으로 판정한다. CI(ubuntu)는 종료코드 0 을 그대로 단언한다.
const exitOk = (r) => r.code === 0 || (process.platform === 'win32' && /UV_HANDLE_CLOSING/.test(r.out))

function runChild(env, cwd) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(EXTRACT_|NOTION_|GITHUB_|LLM_|SUPABASE_|NEXT_PUBLIC_SUPABASE|CLAUDE_)/.test(k)))
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 'extract-auto.mjs')], { cwd, env: { ...clean, ...env } })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    const timer = setTimeout(() => p.kill(), 60_000)
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out }) })
  })
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-autotune-'))
fs.mkdirSync(path.join(tmp, 'config'))
fs.copyFileSync(path.join(ROOT, 'config', 'session-guard.json'), path.join(tmp, 'config', 'session-guard.json'))
const cronOf = (slot) => Object.entries(EXTRACT_SLOTS).find(([, s]) => s === slot)[0]
const baseEnv = (url, slot) => ({
  NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'fake-key', LLM_PROVIDER: 'mock',
  GITHUB_EVENT_NAME: 'schedule', EXTRACT_SLOT_CRON: cronOf(slot), EXTRACT_AUTO_MAX_PROJECTS: '10', EXTRACT_AUTO_DAILY_MAX: '24',
})

try {
  // (a) off — 기존 결정과 같은가: 같은 이력·백로그를 in-process 로 decideSlot 에 넣은 값과 자식의 기록을 대조한다.
  {
    const db = await fakeDb()
    const r = await runChild(baseEnv(db.url, 's1'), tmp)
    db.server.close()
    const s = db.patches.at(-1)?.summary ?? {}
    const full = pickAutoTargets(projects.map(p => ({ projectId: p.id, newInputs: NEW_INPUTS, businessModel: p.business_model, status: p.status, attempts: 0 })), { minNew: 100, max: Infinity })
    const expect = decideSlot({ slot: 's1', backlog: backlogOf(full), state: slotStateOf(history, { today: kstDate(), slot: 's1' }), dailyMax: 24, slotMax: 10, now: new Date() })
    t('[통합 off] 종료코드 0', exitOk(r))
    t('[통합 off] 기존과 같은 결정(run·reason·max·threshold)', s.decision === (expect.run ? 'run' : 'skip') && s.reason === expect.reason && s.max_this_run === expect.max && s.threshold === expect.threshold)
    t('[통합 off] 변수값 그대로: 슬롯 10 · 하루 24', s.slot_max === 10 && s.daily_max === 24 && s.max_this_run === 10)
    t('[통합 off] autotune 블록 없음', !('autotune' in s))
    t('[통합 off] cap_binding 은 스위치와 무관하게 기록(대기 소진 = none)', s.cap_binding === 'none')
    t('[통합 off] 예상 밖 요청 0', db.unexpected.length === 0)
    if (!exitOk(r) || db.unexpected.length) console.log(r.out, db.unexpected)
  }
  // (b) on, s1 — 이력 3건(평균 ≈ 2.25%, slot/slot/none) · 대기 1 → 48→58, 슬롯 20
  {
    const db = await fakeDb()
    const r = await runChild({ ...baseEnv(db.url, 's1'), EXTRACT_AUTOTUNE: 'on' }, tmp)
    db.server.close()
    const s = db.patches.at(-1)?.summary ?? {}
    t('[통합 on] 종료코드 0(Notion 실패는 경고뿐)', exitOk(r))
    t('[통합 on] 올리기 48→58 기록', s.autotune?.action === 'up' && s.autotune?.prev === 48 && s.autotune?.next === 58 && s.autotune?.evaluated === true)
    t('[통합 on] 이번 run 이 유효 D 를 쓴다: 하루 58 · 슬롯 20', s.daily_max === 58 && s.slot_max === 20 && s.max_this_run === 20 && s.autotune?.d === 58)
    t('[통합 on] 근거: 윈도 3 run_key · 대기 1 · 주간 disabled', s.autotune?.window?.length === 3 && s.autotune?.pending === 1 && s.autotune?.weekly?.state === 'disabled')
    t('[통합 on] cap_binding 기록', s.cap_binding === 'none')
    t('[통합 on] Notion 토큰 없음 → 경고로만 남는다(조정은 진행)', /자동 조정 Notion 기록 실패.*env/.test(r.out))
    t('[통합 on] 예상 밖 요청 0', db.unexpected.length === 0)
    if (!exitOk(r) || db.unexpected.length) console.log(r.out, db.unexpected)
  }
  // (c) on, s3 — 백로그 Bw 2 < OFF 6(직전 s3 실행함)으로 슬롯이 쉬는 날: 평가는 하되 올리지 않는다(대기 1건이 있어도)
  {
    const db = await fakeDb()
    const r = await runChild({ ...baseEnv(db.url, 's3'), EXTRACT_AUTOTUNE: 'on' }, tmp)
    db.server.close()
    const s = db.patches.at(-1)?.summary ?? {}
    t('[통합 on·쉼] 슬롯은 쉰다', exitOk(r) && s.decision === 'skip' && /Bw 2 < OFF 6/.test(String(s.reason)))
    t('[통합 on·쉼] 평가는 했고 올리지 않았다(hold · 쉰다 사유)', s.autotune?.evaluated === true && s.autotune?.action === 'hold' && /쉰다/.test(s.autotune?.reason) && s.autotune?.d === 48)
    t('[통합 on·쉼] 쉼 행도 cap_binding(문턱 쉼 = none)', s.cap_binding === 'none')
    t('[통합 on·쉼] 조정이 없으면 Notion 을 부르지 않는다', !/Notion/.test(r.out))
    if (!exitOk(r)) console.log(r.out)
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${fail ? '❌' : '✅'} extract 자동 조정 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
