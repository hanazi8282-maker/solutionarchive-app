#!/usr/bin/env node
// lib/review/target-supply.ts · scripts/target-supply.mjs · scripts/target-revive.mjs 셀프테스트 — 네트워크·DB 없음(메모리 가짜 포트).
// 보는 것: 설계 §2 표의 값(hackernews over/visits · googleplay over/budget · appstore short + r<1 폴백 · kakao short · clien),
//          3상태(unverified 를 short 로 접지 않음) · excluded · 30% 게이트·googleplay 80 동결 · D6 발굴 건수 ·
//          되살리기 대상 조건·상한·롤백 SQL · --dry 쓰기 0 · --run 은 --expect 필수·롤백 파일 먼저·부분 갱신 시 롤백 재작성.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  computeSupply, discoveryCount, gateHeadroom, planRevive, rollbackSql, shareHeadroom, supplyLine,
} from '../lib/review/target-supply.ts'
import { main as supplyMain } from './target-supply.mjs'
import { main as reviveMain } from './target-revive.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

const NOW = new Date('2026-10-07T17:13:00Z')
const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let seq = 0

// ── 스냅샷(2026-10-07)을 닮은 합성 DB ─────────────────────────────
const src = (key, cap, extra = {}) => ({ key, enabled: true, daily_request_cap: cap, robots_status: 'allowed', tos_status: null, override: null, ...extra })
const SOURCES = [
  src('hackernews', 600), src('googleplay', 40, { robots_status: 'disallowed', tos_status: 'forbids_automation', override: 'owner_2026-10-06' }),
  src('appstore', 200, { robots_status: 'disallowed', override: 'owner_2026-10-05' }), src('clien', 462), src('velog', 300),
  src('bobaedream', 336), src('disquiet', 52, { tos_status: 'forbids_automation' }), src('indiehackers', 52, { tos_status: 'prohibited' }), src('okky', 300),
  src('kakao_blog', 200, { robots_status: 'not_applicable', tos_status: 'prohibited', override: 'owner_2026-10-06' }),
  src('danawa', 30), src('producthunt', 100), src('todayhumor', 100, { enabled: false }),
]
const tg = (source_key, n, ref, status = 'active', ce = 0, label = null) =>
  Array.from({ length: n }, () => ({ id: u(++seq), source_key, status, product_ref: typeof ref === 'function' ? ref(seq) : ref, label, consecutive_empty: ce }))
function targets() {
  seq = 0
  return [
    ...tg('hackernews', 37, (i) => `q:kw${i}`), ...tg('hackernews', 5, (i) => `q:old${i}`, 'exhausted', 0),
    ...tg('googleplay', 80, (i) => `kr:ko:com.app${i}`, 'active', 0, '1:x'), ...tg('googleplay', 2, (i) => `kr:ko:com.gone${i}`, 'exhausted', 0),
    ...tg('appstore', 46, (i) => `kr:${i}`), ...tg('appstore', 30, (i) => `kr:${i}`, 'exhausted', 2),
    ...tg('clien', 2, (i) => `board:cm_app${i}`), ...tg('clien', 15, (i) => `url:/service/board/park/${i}`, 'exhausted', 0), ...tg('clien', 4, (i) => `url:/service/board/park/${i}`, 'exhausted', 3),
    ...tg('velog', 5, (i) => `url:/@a/${i}`), ...tg('bobaedream', 2, (i) => `url:/view?no=${i}`), ...tg('disquiet', 1, 'board:makerlog'),
    ...tg('indiehackers', 1, 'board:posts'), ...tg('okky', 1, 'board:community'),
    ...tg('producthunt', 3, (i) => `post:p${i}`, 'exhausted', 0), ...tg('danawa', 4, (i) => `${1000 + i}`, 'exhausted', 0),
    ...tg('todayhumor', 2, (i) => `url:/board/view.php?no=${i}`, 'exhausted', 0),
  ]
}
const run = (source_key, requests, targets_visited, new_reviews, extra = {}) => ({
  source_key, requests, targets_visited, new_reviews, blocked_responses: 0, status: 'ok', dry_run: false, started_at: '2026-10-01T05:37:00Z', ...extra,
})
const RUNS = [
  run('hackernews', 1212, 270, 13857), run('googleplay', 30, 15, 427), run('appstore', 63, 270, 1545), run('clien', 194, 50, 484),
  run('hackernews', 9999, 1, 0, { dry_run: true }), run('hackernews', 9999, 1, 0, { status: 'failed' }),
]

const input = (over = {}) => ({ now: NOW, sources: SOURCES, ramps: [], targets: targets(), runs: RUNS, ...over })
const rep = computeSupply(input())
const S = (k, r = rep) => r.sources.find((s) => s.source_key === k)

// ── 설계 §2 표 ────────────────────────────────────────────────────
t('합계: enabled 활성 175', rep.totals.active, 175)
{
  const h = S('hackernews')
  t('hackernews: B 300(daily_request_cap 임시) · r 4.49 실측(dry·failed 제외)', [h.B, h.cap_basis, h.r, h.r_basis], [300, 'daily_request_cap(임시)', 4.49, 'measured_14d'])
  t('hackernews: N_budget 66 · N_visit 20 → N 20 visits 묶임 · over', [h.N_budget, h.N_visit, h.N, h.bound, h.state, h.gap], [66, 20, 20, 'visits', 'over', -17])
  t('hackernews: over 면 처방 없음', h.remedies, [])
}
{
  const g = S('googleplay')
  t('googleplay: B 20 · r 2 · v 1/7 → N_budget 70 · N_visit 140 → N 70 budget · over', [g.B, g.r, g.v, g.N_budget, g.N_visit, g.N, g.bound, g.state], [20, 2, 0.143, 70, 140, 70, 'budget', 'over'])
  t('googleplay: 게이트 여유 0(45.7% · 80 동결)', [g.share_active_pct, g.gate_headroom], [45.7, 0])
  t('googleplay: override 있는 약관 금지는 플래그 아님', g.tos_flag, false)
}
{
  const a = S('appstore')
  t('appstore: 실측 r 0.23 < 1 → 폴백 1', [a.r, a.r_basis], [1, 'fallback_measured_lt1(0.23)'])
  t('appstore: N_budget 700 · N_visit 140 → N 140 visits · short(−94)', [a.N_budget, a.N_visit, a.N, a.bound, a.state, a.gap], [700, 140, 140, 'visits', 'short', 94])
  t('appstore: consecutive_empty>0 exhausted 는 되살리기 아님 → 처방 dictionary', [a.inactive, a.remedies], [{ exhausted: 30, failed: 0, zero_empty_exhausted: 0 }, ['dictionary']])
  t('appstore: 게이트 여유 = floor((52.5−46)/0.7) = 9', a.gate_headroom, 9)
}
{
  const k = S('kakao_blog')
  t('kakao_blog: 타깃 0 · r 폴백 1 · v 1 → N 20 visits · short(−20) · 처방 dictionary', [k.r_basis, k.N_budget, k.N, k.bound, k.state, k.gap, k.remedies], ['fallback_post', 100, 20, 'visits', 'short', 20, ['dictionary']])
}
{
  const c = S('clien')
  t('clien: r 3.88 · v 2 → N_budget 29 · N_visit 10 → N 10 · short(−8)', [c.r, c.N_budget, c.N_visit, c.N, c.state, c.gap], [3.88, 29, 10, 10, 'short', 8])
  t('clien: ce=0 exhausted 15 → reactivate 먼저, board: 활성 있음 → board_register 없음', [c.inactive.zero_empty_exhausted, c.remedies], [15, ['reactivate']])
  const v = S('velog')
  t('velog: url: 만 활성 → board_register', v.remedies.includes('board_register'), true)
}
t('danawa·producthunt excluded · todayhumor(꺼짐) 행 없음', [S('danawa').state, S('producthunt').state, S('todayhumor') === undefined], ['excluded', 'excluded', true])
t('약관 플래그: override 없는 prohibited·forbids_automation', ['disquiet', 'indiehackers', 'kakao_blog', 'hackernews'].map((k) => S(k).tos_flag), [true, true, false, false])
t('14일 신규 비중: dry 제외 · hackernews 57.8%', rep.share_new_reviews_14d.hackernews, Math.round((13857 / (13857 + 427 + 1545 + 484)) * 1000) / 10)
t('영역: unmapped ≥ 50% → unverified(R4)', rep.areas['5'].state, 'unverified')
t('googleplay 확대: 동결(단계 70 · 30% 52)', [rep.googleplay.stage_cap, rep.googleplay.share_cap, rep.googleplay.expand_ready], [70, 52, false])
t('한 줄 요약', supplyLine(S('hackernews')).startsWith('hackernews · over(+17) · visits 묶임 · N 20 / active 37'), true)

// ── cap_base·스케줄 계획·3상태 ────────────────────────────────────
{
  const plan = { date: '2026-10-07', budget: 420, runsPerDay: 6, perRun: 70, perRunCap: 70, targetsPerRun: 15, bottleneck: null, terms: {} }
  const r = computeSupply(input({ ramps: [{ source_key: 'hackernews', targets_per_run: 10, cap_base: 600, pct_step: 70, schedule_plan: plan }] }))
  const h = S('hackernews', r)
  t('cap_base 있으면 B = cap_base × pct (420)', [h.B, h.cap_basis], [420, 'cap_base'])
  t('오늘 계획 → R 6 × tpr 15 → N_visit 90', [h.runs_per_day, h.tpr, h.N_visit, h.runs_basis], [6, 15, 90, 'schedule_plan'])
  const stale = computeSupply(input({ ramps: [{ source_key: 'hackernews', targets_per_run: 15, cap_base: null, schedule_plan: { ...plan, date: '2026-10-06' } }] }))
  t('어제 계획은 안 쓴다 → 기존 2슬롯 · 계단 tpr 15', [S('hackernews', stale).runs_per_day, S('hackernews', stale).tpr, S('hackernews', stale).N_visit], [2, 15, 30])
  const un = computeSupply(input({ ramps: null, sources: SOURCES.map((s) => (s.key === 'clien' ? { ...s, daily_request_cap: null } : s)) }))
  t('B 못 읽으면 unverified(short 로 접지 않음) · 처방 없음', [S('clien', un).state, S('clien', un).remedies], ['unverified', []])
  t('ramp 못 읽음 표기', [un.ramp_read, S('hackernews', un).cap_basis], ['unavailable', 'daily_request_cap(임시)·⚠️ramp_unavailable'])
}

// ── 게이트 ───────────────────────────────────────────────────────
t('shareHeadroom: (a+k)/(T+k) ≤ 0.3 의 최대 k', [shareHeadroom(0, 175), shareHeadroom(46, 175), shareHeadroom(80, 175), shareHeadroom(0, 0)], [75, 9, 0, 0])
t('googleplay 동결: 70 이면 80 까지 10, 30% 여유가 더 작으면 그것', [gateHeadroom('googleplay', 70, 1000), gateHeadroom('googleplay', 70, 240)], [10, 2])
{
  // 여유 k 를 넣고 나면 정확히 30% 이하
  const k = shareHeadroom(46, 175)
  t('게이트 경계: k 는 통과 · k+1 은 초과', [(46 + k) / (175 + k) <= 0.3, (46 + k + 1) / (175 + k + 1) <= 0.3], [true, false])
}

// ── D6 발굴 건수 ─────────────────────────────────────────────────
t('발굴: supply 없음 → 고정', discoveryCount(null, 'hackernews', 2).count, 2)
t('발굴: over → 0', discoveryCount(rep, 'hackernews', 2).count, 0)
t('발굴: excluded(danawa) → 고정(줄이지 않음)', discoveryCount(rep, 'danawa', 2).count, 2)
{
  const mk = (over) => ({ sources: [{ source_key: 'hackernews', state: 'short', gap: 30, gate_headroom: 50, remedies: ['discovery'], r_basis: 'measured_14d', N: 60, active: 30, ...over }] })
  t('발굴: short → min(gap, 5)', discoveryCount(mk({}), 'hackernews', 2).count, 5)
  t('발굴: gap 3 → 3', discoveryCount(mk({ gap: 3 }), 'hackernews', 2).count, 3)
  t('발굴: 게이트 여유 2 → 2', discoveryCount(mk({ gate_headroom: 2 }), 'hackernews', 2).count, 2)
  t('발굴: 추정 r → 1', discoveryCount(mk({ r_basis: 'fallback_post' }), 'hackernews', 2).count, 1)
  t('발굴: 추정 r 이어도 게이트 여유 0 이면 0', discoveryCount(mk({ r_basis: 'fallback_post', gate_headroom: 0 }), 'hackernews', 2).count, 0)
  t('발굴: unverified → 고정', discoveryCount(mk({ state: 'unverified', gap: null }), 'hackernews', 2).count, 2)
}

// ── 되살리기 계획 ────────────────────────────────────────────────
{
  const ts = targets()
  const p = planRevive(ts, rep)
  t('되살리기: clien 은 gap 8 까지만', [p.bySource.clien.candidates, p.bySource.clien.revive, p.bySource.clien.skipped], [15, 8, { over_headroom: 7 }])
  t('되살리기: ce>0 은 후보도 아님(appstore·clien 4건)', [p.bySource.appstore, p.revive.some((r) => r.prev_consecutive_empty !== 0)], [undefined, false])
  t('되살리기: over 소스(hackernews·googleplay)는 no_gap', [p.bySource.hackernews.skipped, p.bySource.googleplay.skipped], [{ no_gap: 5 }, { no_gap: 2 }])
  t('되살리기: producthunt·danawa excluded · 꺼진 todayhumor 제외', [p.bySource.producthunt.skipped, p.bySource.danawa.skipped, p.bySource.todayhumor.skipped],
    [{ source_excluded: 3 }, { source_excluded: 4 }, { source_disabled_or_missing: 2 }])
  t('되살리기: 합계 8', p.revive.length, 8)
  const sql = rollbackSql(p.revive, 'T')
  t('롤백 SQL: id·이전 status·ce 를 담고 active 만 되돌린다', [sql.includes(`('${p.revive[0].id}'::uuid, 'exhausted', 0)`), sql.includes("t.status = 'active'"), (sql.match(/::uuid/g) ?? []).length], [true, true, 8])
  let threw = false
  try { rollbackSql([{ ...p.revive[0], id: "x'; DROP TABLE y; --" }], 'T') } catch { threw = true }
  t('롤백 SQL: id 형식이 아니면 던진다(SQL 주입 차단)', threw, true)
  t('롤백 SQL: 0행이면 실행문 없음', rollbackSql([], 'T').includes('BEGIN'), false)
  // board: 를 먼저 고른다
  const b = planRevive([...tg('velog', 2, (i) => `url:/@a/${i}`, 'exhausted', 0), ...tg('velog', 1, 'board:tag:ai', 'exhausted', 0)], { sources: [{ source_key: 'velog', state: 'short', gap: 1, gate_headroom: 9 }] })
  t('되살리기: 상한 1 이면 board: 먼저', b.revive.map((r) => r.product_ref), ['board:tag:ai'])
}

// ── 메모리 Supabase(체인 쿼리 최소 구현) ──────────────────────────
function fakeSb(tables, { failRamp = false, dropUpdateId = null } = {}) {
  const sb = { updates: 0 }
  sb.from = (name) => {
    const filters = []
    let patch = null
    const exec = (a = 0, b = Infinity) => {
      if (name === 'review_source_ramp' && failRamp) return { data: null, error: { message: 'relation does not exist' } }
      const rows = (tables[name] ?? []).filter((r) => filters.every((f) => f(r)))
      if (patch) {
        const hit = rows.filter((r) => r.id !== dropUpdateId)
        for (const r of hit) Object.assign(r, patch)
        sb.updates += hit.length
        return { data: hit.map((r) => ({ id: r.id })), error: null }
      }
      return { data: rows.slice(a, b + 1), error: null }
    }
    const q = {
      select: () => q, order: () => q,
      gte: (c, v) => (filters.push((r) => r[c] >= v), q),
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), q),
      update: (p) => ((patch = p), q),
      range: async (a, b) => exec(a, b),
      then: (res, rej) => Promise.resolve(exec()).then(res, rej),
    }
    return q
  }
  return sb
}
const quiet = async (fn) => {
  const o = console.log
  const lines = []
  console.log = (m) => lines.push(String(m))
  try { return { r: await fn(), lines } } finally { console.log = o }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'target-supply-'))

{
  const db = { review_sources: SOURCES, review_source_ramp: [], review_targets: targets(), review_collection_runs: RUNS }
  const out = path.join(tmp, 'supply.json')
  const { r } = await quiet(() => supplyMain([`--out=${out}`], { db: fakeSb(db) }))
  t('target-supply main: --out 파일 = 반환값', JSON.parse(fs.readFileSync(out, 'utf8')).sources.length, r.sources.length)
  t('target-supply main: 포트 경유 값이 순수 계산과 같다', S('hackernews', r).N, 20)
  const { r: r2 } = await quiet(() => supplyMain([], { db: fakeSb(db, { failRamp: true }) }))
  t('target-supply main: ramp 테이블 없음 → unavailable 표기', r2.ramp_read, 'unavailable')
  t('target-supply 는 쓰지 않는다', fakeSb(db).updates, 0)
}
{
  const db = { review_sources: SOURCES, review_source_ramp: [], review_targets: targets(), review_collection_runs: RUNS }
  const sb = fakeSb(db)
  const out = path.join(tmp, 'rb-dry.sql')
  const { r, lines } = await quiet(() => reviveMain([`--rollback-out=${out}`], { db: sb, now: NOW }))
  t('revive --dry: 대상 8 · 쓰기 0 · 파일 안 씀', [r.n, sb.updates, fs.existsSync(out)], [8, 0, false])
  t('revive --dry: 롤백 SQL 을 출력', lines.some((l) => l.includes('::uuid')), true)
  let err = null
  try { await quiet(() => reviveMain(['--run'], { db: sb, now: NOW })) } catch (e) { err = e.message }
  t('revive --run: --expect 없으면 거부', /--expect/.test(err ?? ''), true)
  err = null
  try { await quiet(() => reviveMain(['--run', '--expect=7', `--rollback-out=${out}`], { db: sb, now: NOW })) } catch (e) { err = e.message }
  t('revive --run: 건수가 다르면 거부 · 쓰기 0', [/드라이런/.test(err ?? ''), sb.updates, fs.existsSync(out)], [true, 0, false])
  const ran = await quiet(() => reviveMain(['--run', '--expect=8', `--rollback-out=${out}`], { db: sb, now: NOW }))
  t('revive --run: 8건 active · 롤백 파일에 8 id', [ran.r.applied.updated, sb.updates, (fs.readFileSync(out, 'utf8').match(/::uuid/g) ?? []).length], [8, 8, 8])
  t('revive --run: 실제로 바뀐 행 = 계획 행', db.review_targets.filter((x) => x.source_key === 'clien' && x.status === 'active').length, 2 + 8)
  const again = await quiet(() => reviveMain([], { db: sb, now: NOW }))
  t('revive: 되살린 뒤 다시 드라이런하면 clien 은 met → 0', again.r.plan.bySource.clien.revive, 0)
}
{
  // UPDATE 직전에 한 행이 바뀌었다(다른 세션) — 롤백 파일은 실제 바뀐 행만 담아야 한다.
  const db = { review_sources: SOURCES, review_source_ramp: [], review_targets: targets(), review_collection_runs: RUNS }
  const first = planRevive(db.review_targets, computeSupply({ now: NOW, sources: SOURCES, ramps: [], targets: db.review_targets, runs: RUNS })).revive[0].id
  const sb = fakeSb(db, { dropUpdateId: first })
  const out = path.join(tmp, 'rb-partial.sql')
  const ran = await quiet(() => reviveMain(['--run', '--expect=8', `--rollback-out=${out}`], { db: sb, now: NOW }))
  const body = fs.readFileSync(out, 'utf8')
  t('revive 부분 갱신: 7건 · 롤백에서 안 바뀐 id 제외', [ran.r.applied.updated, body.includes(first), (body.match(/::uuid/g) ?? []).length], [7, false, 7])
}
fs.rmSync(tmp, { recursive: true, force: true })

console.log(`target-supply selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
