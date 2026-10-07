#!/usr/bin/env node
// 수집 스케줄러 셀프테스트(남헌 v30 §2) — lib/review/ramp.ts planSchedule·slot*·plannedSourcesForSlot·stepPctRamps·collectWithRamp,
// lib/review/runner.ts maxRequestsThisRun, scripts/review-collect.mjs 배선, nightly-review-collect.yml 슬롯. 네트워크·DB·env 없음.
//
// 고정하는 것:
//   1) P = min(시간 몫, P_safe, 활성 타깃 × 타깃당 평균) · R = ceil(B/P) ≤ 6 · 하루 1회로 되면 R=1 · 병목 판정(타깃 부족 = 'targets')
//   2) 슬롯 나눔: 창의 첫 슬롯만 돈다 · 누적 허용량으로 지연·누락을 따라잡고 B 를 넘지 않는다
//   3) 실제 러너 + 실제 어댑터 경계: 회당 상한·누적 허용·자동 타깃 수가 러너 요청 수를 정말로 바꾼다
//   4) cap_base 없음·칸 없음·제외 소스 → 예산·타깃 수가 지금과 같다 + 3상태 줄
//   5) 하루 판정이 계획을 쓴다(칸 없으면 빼고 쓰고 ⚠️) · 추가 슬롯 소스 선정 · 확인 불가는 안 도는 쪽
//   6) 워크플로 cron = COLLECT_SLOTS(1:1) · 기존 2슬롯 그대로 · 하루 1~2회 전제 스텝은 기존 슬롯에서만

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COLLECT_SLOTS, LEGACY_SLOTS, MAX_RUNS_PER_DAY, P_SAFE_DEFAULT, RUN_TIME_SEC, collectWithRamp, loadSourceRamp, planSchedule,
  plannedSourcesForSlot, slotAllowance, slotIndexOf, slotRuns, stepPctRamps,
} from '../lib/review/ramp.ts'
import { fmkoreaAdapter } from '../lib/review/adapters/fmkorea.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${w}\n   실제 ${g}`) }
}

// ── 1) planSchedule ──────────────────────────────────────────────
const P = (o) => planSchedule({ budget: 300, timeCap: 1800, safeCap: 162, activeTargets: 37, avgReqPerTarget: 45, ...o })
t('하루 1회로 되면 R=1(모두 수집)', [P({ budget: 100 }).runsPerDay, P({ budget: 100 }).perRun, P({ budget: 100 }).bottleneck], [1, 100, null])
t('B 300 · P 162(P_safe) → R 2 · 회당 150', [P().runsPerDay, P().perRun, P().perRunCap, P().bottleneck], [2, 150, 162, null])
t('B=0 → R 1', P({ budget: 0 }).runsPerDay, 1)
{
  const s = P({ activeTargets: 2, avgReqPerTarget: 10 }) // 타깃 항 20 → need 15
  t('타깃 부족: R 6 상한 · 병목 targets · 회당 50', [s.runsPerDay, s.perRun, s.bottleneck, s.terms.targets], [6, 50, 'targets', 20])
  t('타깃 부족: 1회 타깃 = 활성 타깃 수를 넘지 않는다', s.targetsPerRun, 2)
}
t('P_safe 가 묶음 → safe', P({ budget: 2000, activeTargets: 1000 }).bottleneck, 'safe')
t('시간 몫이 묶음 → time', P({ budget: 2000, timeCap: 100, activeTargets: 1000 }).bottleneck, 'time')
t('정확히 6회면 병목 아님', P({ budget: 162 * 6, activeTargets: 1000 }).bottleneck, null)
{
  const z = P({ activeTargets: 0 })
  t('활성 타깃 0 → R 1 · targets · 타깃 수 null', [z.runsPerDay, z.bottleneck, z.targetsPerRun, z.terms.targets], [1, 'targets', null, 0])
  const u = P({ budget: 2000, avgReqPerTarget: null })
  t('평균 측정 없음 → 타깃 항 null(0 으로 접지 않음) · 병목은 targets 가 아님', [u.terms.targets, u.bottleneck, u.targetsPerRun], [null, 'safe', null])
}
t('1회 타깃: B 150·평균 4 → P 148 · R 2 · 회당 75 → ceil(75/4)=19', [P({ budget: 150, avgReqPerTarget: 4 }).runsPerDay, P({ budget: 150, avgReqPerTarget: 4 }).targetsPerRun], [2, 19])
t('1회 타깃: 평균 45·회당 150 → 4', P().targetsPerRun, 4)
t('P_safe 잠정 기본값 162(스냅샷 근거)', P_SAFE_DEFAULT, 162)

// ── 2) 슬롯 ──────────────────────────────────────────────────────
t('슬롯 6개 = 하루 최대 run', COLLECT_SLOTS.length, MAX_RUNS_PER_DAY)
const hm = (c) => c.split(' ').slice(0, 2).map(Number)
t('슬롯은 UTC 시각 순', COLLECT_SLOTS.map((c) => hm(c)[1] * 60 + hm(c)[0]).every((v, i, a) => i === 0 || v > a[i - 1]), true)
// 기존 2슬롯(37분)은 그대로 두고, 추가 4슬롯의 분은 서로·기존과 다르게. 정각·30분 없음.
t('추가 슬롯 분이 서로·기존과 다르고 정각·30분 없음(같은 시각 집중 금지)',
  new Set(COLLECT_SLOTS.map((c) => hm(c)[0])).size === COLLECT_SLOTS.length - LEGACY_SLOTS.size + 1 && COLLECT_SLOTS.every((c) => ![0, 30].includes(hm(c)[0])), true)
t('마지막 슬롯 + 3시간 지연 < UTC 자정', hm(COLLECT_SLOTS.at(-1))[1] * 60 + hm(COLLECT_SLOTS.at(-1))[0] + 180 < 1440, true)
t('기존 2슬롯 유지', [...LEGACY_SLOTS].every((c) => COLLECT_SLOTS.includes(c)) && LEGACY_SLOTS.size === 2, true)
t('slotIndexOf: 슬롯·수동·모름', [slotIndexOf('37 5 * * *'), slotIndexOf(' 43 1 * * * '), slotIndexOf(null), slotIndexOf('0 0 * * *')], [1, 0, null, null])
const runsAt = (R) => COLLECT_SLOTS.map((_, i) => i).filter((i) => slotRuns(R, i))
t('R별 추가 슬롯 차례', [1, 2, 3, 4, 5, 6].map(runsAt), [[0], [0, 3], [0, 2, 4], [0, 2, 3, 5], [0, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5]])
t('누적 허용 R=2 B=101', COLLECT_SLOTS.map((_, i) => slotAllowance(101, 2, i)), [51, 51, 51, 101, 101, 101])
t('누적 허용 R=1 → 어느 슬롯이든 B', COLLECT_SLOTS.map((_, i) => slotAllowance(80, 1, i)), [80, 80, 80, 80, 80, 80])
t('누적 허용 R=6 → 마지막 = B', slotAllowance(100, 6, 5), 100)
{
  // 하루 모의: 실행되는 슬롯(추가=차례인 것 + 기존 2) 에서 러너처럼 min(허용−사용, 회당 상한, 역량) 만큼 쓴다.
  const sim = (B, R, cap, skipped = [], capacity = Infinity) => {
    let used = 0
    const per = []
    for (let i = 0; i < 6; i++) {
      const runs = !skipped.includes(i) && (LEGACY_SLOTS.has(COLLECT_SLOTS[i]) || slotRuns(R, i))
      const n = runs ? Math.max(0, Math.min(slotAllowance(B, R, i) - used, cap, capacity)) : 0
      used += n
      per.push(n)
    }
    return { used, per }
  }
  t('모의 R=3 B=300 상한 100 → 100×3, 같은 창 재실행 0', sim(300, 3, 100).per, [100, 0, 100, 0, 100, 0])
  t('모의 슬롯 0 누락 → 기존 슬롯 1 이 따라잡음', sim(300, 3, 100, [0]).per, [0, 100, 100, 0, 100, 0])
  t('모의 슬롯 4 누락 → 마지막 창을 못 채움(B 초과 없음)', sim(300, 3, 100, [4]).used, 200)
  t('모의 어떤 경우에도 B 를 넘지 않는다', [sim(300, 1, 1000), sim(300, 6, 1000), sim(7, 6, 1)].every((s, k) => s.used <= [300, 300, 7][k]), true)
  t('모의 R=6 B=600 상한 100 → 6회 각 100', sim(600, 6, 100).per, [100, 100, 100, 100, 100, 100])
  t('모의 타깃 부족(역량 20) → 6회 × 20 = 120 < B', sim(600, 6, 100, [], 20).used, 120)
}

// ── 3·4) 실제 러너 + 실제 어댑터 + collectWithRamp ───────────────────
const html = fs.readFileSync(path.join(root, 'fixtures', 'review', 'fmkorea', 'post-with-comments.html'), 'utf8')
const robots = 'User-agent: *\nDisallow: /\nAllow: /$\nAllow: /best\n'
const harness = ({ requestsToday = 0, cap = 1000 } = {}) => {
  const asked = []
  let clock = Date.parse('2026-10-08T01:50:00Z')
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url) { clock += 10; return url.endsWith('/robots.txt') ? { status: 200, body: robots } : { status: 200, body: html } },
    store: {
      async loadSource() { return { key: 'fmkorea', enabled: true, minIntervalMs: 3000, dailyRequestCap: cap, requestsToday } },
      async listDueTargets(_k, limit) {
        asked.push(limit)
        return Array.from({ length: limit }, (_, i) => ({
          id: `t${i}`, projectId: 'p', sourceKey: 'fmkorea', productRef: `url:/best/${10342734564 + i}`, cursor: null, lastReviewAt: null, consecutiveEmpty: 0,
        }))
      },
      async saveTargetProgress() {},
      async recordFingerprint() { return 'new' },
      async appendInput() { return 'in' },
      async linkFingerprint() {},
    },
  }
  return { ports, asked }
}

// 상태 가진 가짜 DB(PostgREST 흉내: 칸 없음 select 42703, update PGRST204, 테이블 없음 PGRST205).
const memDb = ({ ramp = [], sources = [], targets = [], runs = [], planCol = true, rampError = null } = {}) => {
  const T = { review_source_ramp: ramp, review_source_ramp_log: [], review_sources: sources, review_targets: targets, review_collection_runs: runs }
  const ops = []
  const match = (r, f) => f.every(([op, c, v]) => (op === 'eq' ? r[c] === v : op === 'not' ? r[c] != null : op === 'gte' ? r[c] >= v : r[c] < v))
  const resolve = ({ table, op, payload, opts, f, single }) => {
    ops.push([table, op, payload])
    if (table === 'review_source_ramp' && rampError) return { data: null, error: rampError }
    if (table === 'review_source_ramp' && !planCol) {
      if (op === 'select' && /schedule_plan/.test(payload)) return { data: null, error: { code: '42703', message: 'column review_source_ramp.schedule_plan does not exist' } }
      if (op === 'update' && 'schedule_plan' in payload) return { error: { code: 'PGRST204', message: "Could not find the 'schedule_plan' column" } }
    }
    if (op === 'insert') { T[table].push(payload); return { error: null } }
    const rows = T[table].filter((r) => match(r, f))
    if (op === 'update') { for (const r of rows) Object.assign(r, payload); return { error: null } }
    if (opts?.head) return { count: rows.length, error: null }
    return { data: single ? (rows[0] ?? null) : rows.map((r) => ({ ...r })), error: null }
  }
  return {
    T, ops,
    from(table) {
      const q = (op, payload, opts) => {
        const f = []
        const run = (single) => Promise.resolve(resolve({ table, op, payload, opts, f, single }))
        const b = {
          eq: (c, v) => (f.push(['eq', c, v]), b), not: (c) => (f.push(['not', c]), b),
          gte: (c, v) => (f.push(['gte', c, v]), b), lt: (c, v) => (f.push(['lt', c, v]), b),
          maybeSingle: () => run(true), then: (res, rej) => run(false).then(res, rej),
        }
        return b
      }
      return { select: (c, o) => q('select', c, o), insert: (p) => q('insert', p), update: (p) => q('update', p) }
    },
  }
}
const rampRow = (o = {}) => ({
  source_key: 'fmkorea', level: 0, targets_per_run: 10, frozen_until: null, changed_at: 't', reason: 'r',
  pct_step: 50, cap_base: 200, daily_request_target: 100, consecutive_ok_days: 0, last_evaluated_date: '2026-10-08',
  block_line: null, blocks_at_step: 0, supply_state: null, schedule_plan: null, ...o,
})
const plan = (o = {}) => ({
  date: '2026-10-08', budget: 100, runsPerDay: 4, perRun: 25, perRunCap: 7, targetsPerRun: 20, bottleneck: null,
  terms: { time: 1800, safe: 162, targets: 200, activeTargets: 20, avgReqPerTarget: 10 }, ...o,
})
const go = (sb, h, o = {}) => collectWithRamp({ sb, adapter: fmkoreaAdapter, dryRun: false, explicitTargets: null, ports: h.ports, ...o })
const last = (r) => r.notes.at(-1)

{
  // 4) 회귀 금지 — 기준선 = 행 없음(오늘 실측: review_source_ramp 0행)
  const h0 = harness()
  const base = await go(memDb(), h0, { slot: '43 1 * * *' })
  t('행 없음 → 타깃 10 · 요청 10 · 3상태 줄', [h0.asked, base.result.requests, last(base)], [[10], 10, '예산: 램프 행 없음 → 기존 예산(daily_request_cap)'])
  const hn = harness()
  const nul = await go(memDb({ ramp: [rampRow({ cap_base: null, daily_request_target: null })] }), hn, { slot: '43 1 * * *' })
  t('cap_base NULL → 지금과 같음(타깃 10 · 요청 10) + "cap_base 없음 → 기존 예산"', [hn.asked, nul.result.requests, last(nul)], [[10], 10, '예산: cap_base 없음 → 기존 예산(daily_request_cap)'])
  const ex = await collectWithRamp({ sb: memDb({ ramp: [rampRow({ source_key: 'danawa', schedule_plan: plan({ perRunCap: 1 }) })] }), adapter: { ...fmkoreaAdapter, key: 'danawa' }, dryRun: false, explicitTargets: null, ports: harness().ports, slot: '43 1 * * *' })
  t('제외 소스(danawa) → 계획 무시 · 요청 10', [ex.result.requests, last(ex)], [10, '예산: 램프 제외 소스 → 기존 예산(daily_request_cap)'])
  const un = await go(memDb({ rampError: { code: '08006', message: 'conn' } }), harness())
  t('램프 확인 불가 → 기존 예산 + ⚠️', [un.result.requests, last(un).startsWith('⚠️')], [10, true])
  const noPlan = await go(memDb({ ramp: [rampRow({ daily_request_target: 5 })] }), harness())
  t('퍼센트만 있고 계획 없음 → 퍼센트 목표만(요청 5)', [noPlan.result.requests, last(noPlan)], [5, '예산: 스케줄 계획 없음 → 퍼센트 목표만(기존 2슬롯)'])
}
{
  // 3) 계획 적용
  const h = harness()
  const r = await go(memDb({ ramp: [rampRow({ schedule_plan: plan() })] }), h, { slot: '43 1 * * *' })
  t('계획: 1회 타깃 20(자동 산정) → listDueTargets(20)', h.asked, [20])
  t('계획: 회당 상한 7 에서 멈춘다(실제 러너)', r.result.requests, 7)
  t('계획: 멈춘 타깃 문구 "이번 실행 몫 도달"', r.result.perTarget.some((p) => p.outcome === '이번 실행 몫 도달'), true)
  t('계획: 3상태 줄에 R·슬롯·누적 허용', /스케줄 계획 적용.*R 4\/일.*#0 누적 허용 25/.test(last(r)), true)

  const h2 = harness({ requestsToday: 20 })
  const r2 = await go(memDb({ ramp: [rampRow({ schedule_plan: plan({ perRunCap: 100 }) })] }), h2, { slot: '43 1 * * *' })
  t('누적 허용 25 − 오늘 20 = 5 에서 멈춤 · "오늘 램프 목표 도달"', [r2.result.requests, r2.result.perTarget.some((p) => p.outcome === '오늘 램프 목표 도달')], [5, true])
  const r3 = await go(memDb({ ramp: [rampRow({ schedule_plan: plan({ perRunCap: 100 }) })] }), harness({ requestsToday: 20 }), { slot: '19 13 * * *' })
  t('슬롯 3(창 2) → 허용 75 − 20, 타깃 20개가 먼저 끝남', r3.result.requests, 20)
  const r4 = await go(memDb({ ramp: [rampRow({ schedule_plan: plan({ perRunCap: 100 }) })] }), harness({ requestsToday: 20 }), { slot: null })
  t('수동 실행(슬롯 없음) → 하루 목표 전체(100−20), 타깃 20개가 먼저 끝남', [r4.result.requests, /수동/.test(last(r4))], [20, true])
  const h5 = harness()
  await go(memDb({ ramp: [rampRow({ schedule_plan: plan() })] }), h5, { explicitTargets: 3 })
  t('--targets 수동 지정이 자동 타깃 수보다 앞선다', h5.asked, [3])
  const r6 = await go(memDb({ ramp: [rampRow({ schedule_plan: plan({ targetsPerRun: null }) })] }), harness(), { slot: '43 1 * * *' })
  t('평균 측정 없음(타깃 수 null) → 계단 targets_per_run 10 그대로', r6.targetLimit, 10)
  const h7 = harness({ requestsToday: 0, cap: 3 })
  const r7 = await go(memDb({ ramp: [rampRow({ schedule_plan: plan({ perRunCap: 100 }) })] }), h7, { slot: '47 20 * * *' })
  t('daily_request_cap 은 여전히 하드 상한(3)', [r7.result.requests, r7.result.perTarget.some((p) => p.outcome === '일일 상한 도달')], [3, true])
}
{
  // schedule_plan 칸 없음(마이그 000030 미적용) → 퍼센트 칸까지만 다시 읽는다
  const db = memDb({ ramp: [rampRow({ daily_request_target: 5 })], planCol: false })
  const l = await loadSourceRamp(db, 'fmkorea')
  t('칸 없음 → 퍼센트는 살아 있고 계획 null', [l.state, l.ramp.pctReady, l.ramp.pct?.capBase, l.ramp.pct?.plan], ['ramp', true, 200, null])
  t('칸 없음 → select 2번(계획 포함 → 퍼센트까지)', db.ops.filter(([tb, op]) => tb === 'review_source_ramp' && op === 'select').length, 2)
}

// ── 5) 하루 판정이 계획을 쓴다 ─────────────────────────────────────
{
  const mk = (active, o = {}) => memDb({
    ramp: [rampRow({ last_evaluated_date: null, daily_request_target: null })],
    sources: [{ key: 'fmkorea', enabled: true, min_interval_ms: 3000, daily_request_cap: 400 }],
    targets: Array.from({ length: active }, () => ({ source_key: 'fmkorea', status: 'active' })),
    runs: [{ source_key: 'fmkorea', dry_run: false, started_at: '2026-10-07T05:40:00.000Z', requests: 30, targets_visited: 3, status: 'ok' }],
    ...o,
  })
  const now = new Date('2026-10-08T01:50:00Z')
  const db = mk(2)
  const notes = await stepPctRamps(db, now, false)
  const sp = db.T.review_source_ramp[0].schedule_plan
  // B=100(200×50%) · 시간 몫 5400s/3s=1800(200×3s=600s 라 안 깎임) · 안전 162 · 타깃 2×10=20 → P 20 → R 5 · 회당 20 · 타깃 2
  t('판정: 계획 기록', [sp.date, sp.budget, sp.runsPerDay, sp.perRun, sp.perRunCap, sp.targetsPerRun, sp.bottleneck, sp.terms.time, sp.terms.targets], ['2026-10-08', 100, 5, 20, 162, 2, null, RUN_TIME_SEC * 1000 / 3000, 20])
  t('판정: 요약 줄', notes.some((n) => /fmkorea: 스케줄 B 100 .* R 5\/일/.test(n)), true)
  const short = mk(1)
  await stepPctRamps(short, now, false)
  t('판정: 타깃 1개 × 10 → R 6 · 병목 targets(공급 자동화 신호)', [short.T.review_source_ramp[0].schedule_plan.runsPerDay, short.T.review_source_ramp[0].schedule_plan.bottleneck], [6, 'targets'])
  t('판정: supply_state 의미는 그대로(계획이 덮어쓰지 않는다)', short.T.review_source_ramp[0].supply_state, null)
  const nc = mk(2, { planCol: false })
  const ncNotes = await stepPctRamps(nc, now, false)
  t('판정: 칸 없음 → 칸만 빼고 갱신 + ⚠️', [nc.T.review_source_ramp[0].daily_request_target, nc.T.review_source_ramp[0].schedule_plan, ncNotes.some((n) => /schedule_plan 칸 없음.*20261007000030/.test(n))], [100, null, true])
  const dd = mk(2)
  const dn = await stepPctRamps(dd, now, true)
  t('판정 dry-run → 쓰기 0 · 계획 줄은 보인다', [dd.ops.filter(([, op]) => op !== 'select').length, dn.some((n) => n.startsWith('dry-run — fmkorea: 스케줄'))], [0, true])
  const off = mk(2, { sources: [] })
  await stepPctRamps(off, now, false)
  t('판정: 꺼진 소스(재료 없음) → 계획 null', off.T.review_source_ramp[0].schedule_plan, null)
}
{
  const db = memDb({ ramp: [
    rampRow({ source_key: 'a', schedule_plan: plan({ runsPerDay: 1 }) }),
    rampRow({ source_key: 'b', schedule_plan: plan({ runsPerDay: 6 }) }),
    rampRow({ source_key: 'danawa', schedule_plan: plan({ runsPerDay: 6 }) }),
    rampRow({ source_key: 'c', schedule_plan: null }),
    rampRow({ source_key: 'd', cap_base: null, schedule_plan: plan({ runsPerDay: 6 }) }),
  ] })
  t('추가 슬롯 0 → R1·R6 (제외·계획 없음·cap_base 없음 빠짐)', (await plannedSourcesForSlot(db, 0)).keys, ['a', 'b'])
  t('추가 슬롯 2 → R6 만', (await plannedSourcesForSlot(db, 2)).keys, ['b'])
  const bad = await plannedSourcesForSlot(memDb({ planCol: false }), 2)
  t('칸 없음 → 빈 목록 + ⚠️(안 도는 쪽)', [bad.keys, /^⚠️.*20261007000030/.test(bad.note)], [[], true])
}

// ── 6) 배선 · 워크플로 · 마이그 ───────────────────────────────────
{
  const collect = fs.readFileSync(path.join(root, 'scripts', 'review-collect.mjs'), 'utf8')
  const iStep = collect.indexOf('await stepPctRamps(')
  const iPlan = collect.indexOf('await plannedSourcesForSlot(')
  const iLoop = collect.indexOf('for (const sourceKey of sourceKeys)')
  t('collect: 판정 → 추가 슬롯 선정 → 소스 루프 순서', iStep > 0 && iStep < iPlan && iPlan < iLoop, true)
  t('collect: COLLECT_SLOT 을 읽어 collectWithRamp 에 slot 을 넘긴다', /process\.env\.COLLECT_SLOT/.test(collect) && /explicitTargets,\s*slot,/.test(collect), true)
  t('collect: 추가 슬롯은 Notion 상태 로그를 쓰지 않는다', /if \(extraSlot\) \{[\s\S]{0,200}생략[\s\S]{0,60}\} else if \(!dryRun\) \{/.test(collect), true)

  const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'nightly-review-collect.yml'), 'utf8')
  const crons = [...wf.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1])
  t('워크플로 cron = COLLECT_SLOTS(1:1)', [...crons].sort(), [...COLLECT_SLOTS].sort())
  t('워크플로 timeout = RUN_TIME_SEC', new RegExp(`timeout-minutes: ${RUN_TIME_SEC / 60}\\b`).test(wf), true)
  t('워크플로: COLLECT_SLOT = github.event.schedule', /COLLECT_SLOT: \$\{\{ github\.event\.schedule \}\}/.test(wf), true)
  const legacyExpr = wf.match(/LEGACY_SLOT: \$\{\{ (.+) \}\}/)?.[1] ?? ''
  t('워크플로: LEGACY_SLOT 식 = 수동 실행 + 기존 2슬롯', [/github\.event_name != 'schedule'/.test(legacyExpr), ...[...LEGACY_SLOTS].map((c) => legacyExpr.includes(`'${c}'`))], [true, true, true])
  const steps = wf.split(/\r?\n\s+- name: /).slice(1)
  const ifOf = (name) => (steps.find((s) => s.startsWith(name)) ?? '').match(/^\s+if: (.+)$/m)?.[1]
  t('하루 1~2회 전제 스텝은 기존 슬롯에서만', ['Autocalc request cap', 'Purge expired raw text', 'Idea angle distribution check'].map(ifOf),
    ["env.LEGACY_SLOT == 'true'", "always() && env.LEGACY_SLOT == 'true'", "always() && env.LEGACY_SLOT == 'true'"])
  t('워크플로: 수집 스텝은 조건 없이 돈다', ifOf('Collect reviews'), undefined)
  t('워크플로: permissions 는 contents: read 그대로', /^permissions:\s*\r?\n\s+contents: read\s*$/m.test(wf), true)

  const mig = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261007000030_review_source_ramp_schedule_plan.sql'), 'utf8')
  t('마이그: ADD COLUMN 만(DROP·UPDATE·INSERT·DELETE 없음)', /\b(DROP|UPDATE|INSERT INTO|DELETE)\b/.test(mig.replace(/^--.*$/gm, '')), false)
  t('마이그: 롤백 파일 있음', fs.existsSync(path.join(root, 'supabase', 'migrations', '20261007000030_review_source_ramp_schedule_plan_rollback.sql')), true)
}

console.log(`review-collect-scheduler-selftest: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
