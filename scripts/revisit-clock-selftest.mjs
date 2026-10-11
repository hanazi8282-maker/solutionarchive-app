#!/usr/bin/env node
// 재방문 시계(남헌 v48 §2-A) 셀프테스트 — 네트워크·DB 없음.
//
// 보는 것
//   A. revisitDays 공식(하한 3 · 상한 14 · 빈 재점검 2배 · 속도 모름 → 14 · 증분형 null)
//   B. planRevive --auto 상한(소스별 실행당 6 · tpr − active · 사유 코드) · 106개(kr 84·us 22) 백로그가 6슬롯에 나뉘어 약 3일에 흡수
//   C. **경계면** — 실제 App Store 어댑터 + 실제 lib/review/store.ts(가짜 PostgREST, review_fingerprints UNIQUE 흉내) +
//      실제 scripts/target-revive.mjs --auto 를 한 DB 위에서 잇는다(§7.1 5번: 가짜 어댑터만으로 통합 근거를 삼지 않는다).
//      첫 통독 → 간격 전 되살림 0 → 간격 뒤 되살림(롤백 파일이 UPDATE 보다 먼저) → 재점검이 첫 페이지만 읽고 지문 5연속으로 다시 닫음(중복 0)
//      → 새 리뷰 7건은 적재 → 403 이면 기존 중단 규칙 그대로.
//   D. 배선(정적) — 워크플로 pre-step 이 수집 앞·continue-on-error·새 시크릿 없음·permissions/concurrency 유지 · build-check 등록 · CLAUDE.md 한 줄.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appstoreAdapter } from '../lib/review/adapters/appstore.ts'
import { RECHECK_SEEN_STREAK, isRecheck, runCollection } from '../lib/review/runner.ts'
import { createReviewStore } from '../lib/review/store.ts'
import {
  REVIVE_PER_RUN, REVISIT_MAX_DAYS, REVISIT_MIN_DAYS, computeSupply, planRevive, revisitDays,
} from '../lib/review/target-supply.ts'
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
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DAY = 86_400_000
const iso = (ms) => new Date(ms).toISOString()
const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// ── A. 공식 ──────────────────────────────────────────────────────
{
  const L = Date.parse('2026-10-10T00:00:00Z')
  const d = (o) => revisitDays({ source_key: 'appstore', last_run_at: iso(L), created_at: iso(L - 30 * DAY), ...o })
  t('인기(600건/30일, 최신 리뷰 = 방문 시각) → 하한 3', d({ total_collected: 600, last_review_at: iso(L) }).days, REVISIT_MIN_DAYS)
  t('중간(60건/30일 → λ 2/일) → 10÷2 = 5일', d({ total_collected: 60, last_review_at: iso(L) }).days, 5)
  t('중간 + 빈 재점검 1회 → 10일 · 2회 → 상한 14', [d({ total_collected: 60, consecutive_empty: 1 }).days, d({ total_collected: 60, consecutive_empty: 2 }).days], [10, 14])
  t('적재 많아도 최신 리뷰가 45일 묵었으면 λ ≤ 1/45 → 상한 14', d({ total_collected: 600, last_review_at: iso(L - 45 * DAY) }).days, REVISIT_MAX_DAYS)
  t('적재 0 → 14', d({ total_collected: 0 }).days, 14)
  t('속도 재료 없음(created_at·last_review_at 없음) → 14 · 근거 표기', revisitDays({ source_key: 'youtube', last_run_at: iso(L) }), { days: 14, basis: 'velocity_unknown→max' })
  t('증분형은 간격 규칙 없음', [revisitDays({ source_key: 'clien' }), revisitDays({ source_key: 'googleplay' })], [null, null])
  t('하한 3 ≤ 결과 ≤ 상한 14(극단값)', [d({ total_collected: 1e9 }).days, d({ total_collected: 1 }).days], [3, 14])
}

// ── B. --auto 상한·사유 코드·분산 ─────────────────────────────────
const NOW = Date.parse('2026-10-12T05:00:00Z')
const rep = (sources) => ({ generated_at: iso(NOW), sources })
const S = (source_key, o = {}) => ({ source_key, state: 'short', gap: 500, gate_headroom: 500, tpr: 10, active: 0, ...o })
const appTargets = () =>
  Array.from({ length: 106 }, (_, i) => ({
    id: u(i + 1), source_key: 'appstore', status: 'exhausted', product_ref: `${i < 84 ? 'kr' : 'us'}:${1000 + i}`, consecutive_empty: i % 3,
    last_run_at: iso(NOW - 20 * DAY), created_at: iso(NOW - 40 * DAY), total_collected: 30, last_review_at: iso(NOW - 25 * DAY),
  }))
{
  const p = planRevive(appTargets(), rep([S('appstore')]), { perRunCap: REVIVE_PER_RUN, clockOnly: true })
  t('106개 전부 후보(ce 0·1·2 섞여도) · 실행당 6 · 나머지 run_cap', [p.bySource.appstore.candidates, p.revive.length, p.bySource.appstore.skipped], [106, 6, { run_cap: 100 }])
  const q = planRevive(appTargets(), rep([S('appstore', { active: 7 })]), { perRunCap: REVIVE_PER_RUN, clockOnly: true })
  t('tpr 10 − active 7 = 3 만 연다(queue_full)', [q.revive.length, q.bySource.appstore.skipped.queue_full], [3, 103])
  const manual = planRevive(appTargets(), rep([S('appstore')]))
  t('수동 경로(옵션 없음)는 실행당 상한 없음 — gap·게이트만', manual.revive.length, 106)

  const mixed = [
    ...appTargets().slice(0, 2),
    { id: u(900), source_key: 'appstore', status: 'exhausted', product_ref: 'kr:9', consecutive_empty: 0, last_run_at: iso(NOW - DAY), created_at: iso(NOW - 40 * DAY), total_collected: 30, last_review_at: iso(NOW - 25 * DAY) },
    { id: u(901), source_key: 'danawa', status: 'exhausted', product_ref: '123', consecutive_empty: 0, last_run_at: iso(NOW - 30 * DAY) },
    { id: u(902), source_key: 'youtube', status: 'exhausted', product_ref: 'v:aaaaaaaaaaa', consecutive_empty: 0, last_run_at: iso(NOW - 30 * DAY) },
    { id: u(903), source_key: 'clien', status: 'exhausted', product_ref: 'url:/a/1', consecutive_empty: 0, last_run_at: iso(NOW - 30 * DAY) },
    { id: u(904), source_key: 'naver_blog_post', status: 'exhausted', product_ref: 'q:x', consecutive_empty: 0, last_run_at: iso(NOW - 30 * DAY) },
    { id: u(905), source_key: 'appstore', status: 'active', product_ref: 'kr:10', consecutive_empty: 0, last_run_at: iso(NOW - 30 * DAY) },
  ]
  const r = planRevive(mixed, rep([S('appstore'), S('danawa', { state: 'excluded' }), S('youtube', { robots_blocked: true }), S('clien'), S('naver_blog_post', { gap: 0 })]), { perRunCap: REVIVE_PER_RUN, clockOnly: true })
  t('사유 코드: revisit_not_due · source_excluded · robots_disallowed · manual_only · no_gap · source_disabled_or_missing',
    [r.bySource.appstore.skipped, r.bySource.danawa.skipped, r.bySource.youtube.skipped, r.bySource.clien.skipped, r.bySource.naver_blog_post.skipped],
    [{ revisit_not_due: 1 }, { source_excluded: 1 }, { robots_disallowed: 1 }, { manual_only: 1 }, { no_gap: 1 }])
  t('active 타깃은 후보가 아니다 · 되살림 = 간격 지난 appstore 2건', r.revive.map((x) => x.id), [u(1), u(2)])
  const gone = planRevive(mixed, rep([S('appstore')]), { perRunCap: REVIVE_PER_RUN, clockOnly: true })
  t('꺼진(=supply 에 없는) 소스는 source_disabled_or_missing', gone.bySource.youtube.skipped, { source_disabled_or_missing: 1 })

  // computeSupply 가 robots_blocked 를 만든다: disallowed ∧ 소유자 예외 없음만. appstore(owner_2026-10-05) 는 아님.
  const sup = computeSupply({
    now: new Date(NOW),
    sources: [
      { key: 'appstore', enabled: true, daily_request_cap: 200, robots_status: 'disallowed', override: 'owner_2026-10-05' },
      { key: 'youtube', enabled: true, daily_request_cap: 200, robots_status: 'disallowed', override: null },
      { key: 'clien', enabled: true, daily_request_cap: 200, robots_status: 'allowed', override: null },
      { key: 'naver_blog_post', enabled: true, daily_request_cap: 200, robots_status: 'disallowed', override: 'owner_typo' },
    ],
    ramps: [], targets: [], runs: [],
  })
  t('robots_blocked: 소유자 예외 appstore 아님 · youtube·오타 override 막힘 · allowed 아님',
    sup.sources.map((s) => [s.source_key, s.robots_blocked]), [['appstore', false], ['youtube', true], ['clien', false], ['naver_blog_post', true]])

  // 분산: 6슬롯/일, 슬롯마다 되살린 것은 그 슬롯 수집이 소비(재점검 → 다시 exhausted, last_run_at = 그 시각, 빈 재점검이면 ce+1).
  const ts = appTargets()
  const visits = new Map()
  const SLOTS_H = [1.72, 5.62, 9.48, 13.32, 17.62, 20.78] // COLLECT_SLOTS(UTC) 근사
  let maxPerRun = 0
  for (let day = 0; day < 6; day++) {
    for (const h of SLOTS_H) {
      const at = Date.parse('2026-10-12T00:00:00Z') + day * DAY + h * 3600_000
      const p = planRevive(ts, { generated_at: iso(at), sources: [S('appstore')] }, { perRunCap: REVIVE_PER_RUN, clockOnly: true })
      maxPerRun = Math.max(maxPerRun, p.revive.length)
      for (const x of p.revive) {
        const row = ts.find((y) => y.id === x.id)
        ;(visits.get(x.id) ?? visits.set(x.id, []).get(x.id)).push(at)
        row.last_run_at = iso(at)
        row.consecutive_empty += 1 // 조용한 앱스토어 — 재점검마다 신규 0
      }
    }
  }
  const firstVisit = Math.max(...[...visits.values()].map((v) => v[0]))
  const minGapDays = Math.min(...[...visits.values()].flatMap((v) => v.slice(1).map((x, i) => (x - v[i]) / DAY)), Infinity)
  t('분산: 실행당 최대 6 · 106개 전부 3일 안에 첫 재점검', [maxPerRun, visits.size, (firstVisit - Date.parse('2026-10-12T00:00:00Z')) / DAY < 3], [6, 106, true])
  t('분산: 같은 타깃 재방문 간격 ≥ 하한 3일', minGapDays === Infinity || minGapDays >= REVISIT_MIN_DAYS, true)
}

// ── C. 경계면: 실제 어댑터 + 실제 store + 실제 target-revive ──────────
const UNIQUE = { code: '23505', message: 'duplicate key value violates unique constraint' }
function fakePg(tables, hooks = {}) {
  let seq = 0
  const from = (name) => {
    const rows = (tables[name] ??= [])
    const filters = []
    let op = 'select'
    let payload = null
    let lim = null
    let rng = null
    let single = null
    let ret = false
    const fin = (out) =>
      single === 'maybe' ? { data: out[0] ?? null, error: null }
        : single === 'one' ? (out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: `single: ${out.length}행` } })
          : { data: out, error: null }
    const exec = () => {
      if (op === 'insert') {
        const out = []
        for (const p of Array.isArray(payload) ? payload : [payload]) {
          if (name === 'review_fingerprints' && rows.some((r) => r.source_key === p.source_key && r.identity_key === p.identity_key)) return { data: null, error: UNIQUE }
          const row = { id: `${name}-${++seq}`, ...p }
          rows.push(row)
          out.push(row)
        }
        return fin(out)
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        hooks.beforeUpdate?.(name, payload)
        for (const r of hit) Object.assign(r, payload)
        return { data: ret ? hit.map((r) => ({ id: r.id })) : null, error: null }
      }
      let out = hit
      if (rng) out = out.slice(rng[0], rng[1] + 1)
      if (lim !== null) out = out.slice(0, lim)
      return fin(out)
    }
    const q = {
      select: () => ((ret = op !== 'select'), q),
      insert: (p) => ((op = 'insert'), (payload = p), q),
      update: (p) => ((op = 'update'), (payload = p), q),
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), q),
      gte: (c, v) => (filters.push((r) => r[c] >= v), q),
      not: (c, o, v) => (filters.push((r) => !(o === 'is' && v === null ? r[c] == null : r[c] === v)), q),
      order: () => q,
      limit: (n) => ((lim = n), q),
      range: async (a, b) => ((rng = [a, b]), exec()),
      maybeSingle: async () => ((single = 'maybe'), exec()),
      single: async () => ((single = 'one'), exec()),
      then: (res, rej) => Promise.resolve().then(exec).then(res, rej),
    }
    return q
  }
  return { from }
}

{
  const page1 = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'appstore', 'page1.json'), 'utf8'))
  const pageEmpty = fs.readFileSync(path.join(root, 'fixtures', 'appstore', 'page-empty.json'), 'utf8')
  const REF = 'kr:1459969523'
  const T1 = u(4242)
  const real = Date.now()
  const db = {
    review_sources: [
      { key: 'appstore', enabled: true, min_interval_ms: 0, daily_request_cap: 200, robots_status: 'disallowed', tos_status: null, override: 'owner_2026-10-05' },
      { key: 'clien', enabled: true, min_interval_ms: 0, daily_request_cap: 200, robots_status: 'allowed', tos_status: null, override: null },
    ],
    review_source_ramp: [
      { source_key: 'appstore', targets_per_run: 10, cap_base: 200, pct_step: 50, last_evaluated_date: null, schedule_plan: null },
      { source_key: 'clien', targets_per_run: 10, cap_base: 200, pct_step: 50, last_evaluated_date: null, schedule_plan: null },
    ],
    review_targets: [
      { id: T1, project_id: 'p1', source_key: 'appstore', product_ref: REF, label: null, status: 'active', cursor: null, last_review_at: null, consecutive_empty: 0, total_collected: 0, created_at: iso(real - 30 * DAY), last_run_at: null },
      // 30% 게이트 분모 — 다른 소스 활성 50
      ...Array.from({ length: 50 }, (_, i) => ({ id: u(7000 + i), project_id: 'p2', source_key: 'clien', product_ref: `board:b${i}`, label: null, status: 'active', cursor: null, last_review_at: null, consecutive_empty: 0, total_collected: 0, created_at: iso(real - DAY), last_run_at: null })),
    ],
    review_collection_runs: [],
    review_fingerprints: [],
    analysis_inputs: [],
  }
  const hooks = {}
  const sb = fakePg(db, hooks)
  let page1Body = JSON.stringify(page1)
  let page1Status = 200
  const asked = []
  const ports = {
    now: () => new Date(),
    sleep: async () => {},
    fetchText: async (url) => {
      asked.push(url)
      if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nDisallow: /\n' }
      if (url.includes('/page=1/')) return { status: page1Status, body: page1Status === 200 ? page1Body : '' }
      if (url.includes('/page=2/')) return { status: 200, body: pageEmpty }
      return { status: 404, body: '' }
    },
    store: createReviewStore(sb),
  }
  const row = () => db.review_targets.find((x) => x.id === T1)
  const collect = async () => {
    asked.length = 0
    return runCollection(appstoreAdapter, { dryRun: false, targetLimit: 10 }, { ...ports, store: createReviewStore(sb) })
  }
  const quiet = async (fn) => {
    const o = console.log
    const lines = []
    console.log = (m) => lines.push(String(m))
    try { return { r: await fn(), lines } } finally { console.log = o }
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revisit-clock-'))

  // 1) 첫 통독 — 재점검 아님(커서 null 이지만 읽은 흔적 없음). 끝(빈 페이지)까지 읽고 exhausted.
  t('첫 방문은 재점검 아님', isRecheck(appstoreAdapter, { cursor: null, lastReviewAt: null, totalCollected: 0 }), false)
  const r1 = await collect()
  const first = db.analysis_inputs.length
  t('첫 통독: 35건 적재 · 2페이지(빈 페이지)까지 읽음 · exhausted · 커서 null', [first, asked.filter((x) => /page=2/.test(x)).length, row().status, row().cursor, row().total_collected], [35, 1, 'exhausted', null, 35])
  t('첫 통독: 지문 35행(UNIQUE)', db.review_fingerprints.length, 35)

  // 2) 간격 전 — 되살림 0, 사유 revisit_not_due(최신 리뷰가 방문 시각보다 오래 묵음 → 조용 → 14일)
  const early = await quiet(() => reviveMain(['--auto', `--rollback-out=${path.join(tmp, 'early.sql')}`], { db: sb, now: new Date(real + DAY) }))
  t('간격 전: 0건 · revisit_not_due · 파일 안 씀', [early.r.n, early.r.plan.bySource.appstore.skipped, fs.existsSync(path.join(tmp, 'early.sql'))], [0, { revisit_not_due: 1 }, false])
  t('요약에 소스별 revived/skipped 사유 코드', early.lines.some((l) => /appstore: 후보 1 · revived 0 · skipped\(revisit_not_due 1\)/.test(l)), true)

  // 3) 간격 뒤 — 롤백 파일이 UPDATE 보다 먼저 있다
  const rb = path.join(tmp, 'late.sql')
  let fileBeforeUpdate = null
  hooks.beforeUpdate = (name, patch) => { if (name === 'review_targets' && patch.status === 'active') fileBeforeUpdate = fs.existsSync(rb) }
  const late = await quiet(() => reviveMain(['--auto', `--rollback-out=${rb}`], { db: sb, now: new Date(real + 15 * DAY) }))
  hooks.beforeUpdate = null
  t('간격 뒤: 1건 active · 롤백 파일이 UPDATE 전에 있었다 · 롤백에 이전 값(exhausted, ce)', [late.r.applied.updated, row().status, fileBeforeUpdate, fs.readFileSync(rb, 'utf8').includes(`('${T1}'::uuid, 'exhausted', 0)`)], [1, 'active', true, true])
  t('되살린 행 = 재점검 모양(커서 null · 읽은 흔적)', isRecheck(appstoreAdapter, { cursor: row().cursor, lastReviewAt: row().last_review_at, totalCollected: row().total_collected }), true)

  // 4) 재점검 — 같은 피드: 첫 페이지만, 지문 5연속에서 종료, 중복 0, 다시 exhausted, 빈 재점검이라 ce 1
  const r2 = await collect()
  t('재점검: 2페이지 요청 안 함 · 적재 0 · 지문 행 그대로',
    [asked.filter((x) => /page=2/.test(x)).length, asked.filter((x) => /page=1/.test(x)).length, db.analysis_inputs.length - first, db.review_fingerprints.length], [0, 1, 0, 35])
  t('재점검: 중복으로 셌다(seenDuplicates 35 · newReviews 0)', [r2.stats.seenDuplicates, r2.stats.newReviews], [35, 0])
  t('재점검: 다시 exhausted · 커서 null · ce 1 · 사유가 로그에', [row().status, row().cursor, row().consecutive_empty, new RegExp(`재점검 종료 — 이미 본 지문 연속 \\d+건`).test(r2.perTarget[0].outcome)], ['exhausted', null, 1, true])
  t(`종료 조건 상수 = ${RECHECK_SEEN_STREAK}`, RECHECK_SEEN_STREAK, 5)

  // 5) 새 리뷰 7건이 앞에 붙은 피드 — 7건 적재 후 아는 구간에서 종료
  const fresh = page1.feed.entry.slice(0, 7).map((e, i) => ({ ...e, id: { label: `99900000${i}` }, content: { label: `새 리뷰 본문 ${i} — 재방문 시계 셀프테스트용 충분히 긴 텍스트입니다.` } }))
  page1Body = JSON.stringify({ ...page1, feed: { ...page1.feed, entry: [...fresh, ...page1.feed.entry] } })
  await quiet(() => reviveMain(['--auto', `--rollback-out=${path.join(tmp, 'r3.sql')}`], { db: sb, now: new Date(real + 40 * DAY) }))
  t('재점검 2회차 되살림(ce 1 이어도 후보)', row().status, 'active')
  const r3 = await collect()
  t('새 리뷰 7건만 적재 · 첫 페이지만 · ce 0 으로', [r3.stats.newReviews, db.analysis_inputs.length - first, asked.filter((x) => /page=2/.test(x)).length, row().consecutive_empty, row().status], [7, 7, 0, 0, 'exhausted'])

  // 6) 403 — 기존 중단 규칙 그대로(우회 없음): 요청 1건 뒤 멈춤, active 유지, 차단으로 셈
  page1Status = 403
  await quiet(() => reviveMain(['--auto', `--rollback-out=${path.join(tmp, 'r4.sql')}`], { db: sb, now: new Date(real + 80 * DAY) }))
  const r4 = await collect()
  t('403: 페이지 요청 1건 · 차단 1 · active 유지 · 적재 없음', [asked.filter((x) => /page=/.test(x)).length, r4.stats.blockedResponses, row().status, db.analysis_inputs.length - first], [1, 1, 'active', 7])
  page1Status = 200

  // 7) dry-run 재점검은 첫 페이지만(지문을 안 본다)
  row().status = 'active'
  const r5 = await (async () => { asked.length = 0; return runCollection(appstoreAdapter, { dryRun: true, targetLimit: 10 }, { ...ports, store: createReviewStore(sb) }) })()
  t('dry-run 재점검: 첫 페이지만 · 쓰기 없음', [asked.filter((x) => /page=/.test(x)).length, /재점검 종료 — .* · 1페이지째/.test(r5.perTarget[0].outcome)], [1, true])
  fs.rmSync(tmp, { recursive: true, force: true })
  void r1
}

// ── D. 배선(정적) ────────────────────────────────────────────────
{
  const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'nightly-review-collect.yml'), 'utf8').replace(/\r\n/g, '\n')
  const revive = wf.indexOf('scripts/target-revive.mjs --auto')
  const collectStep = wf.indexOf('- name: Collect reviews')
  t('워크플로: --auto pre-step 이 수집 단계 앞', revive > 0 && revive < collectStep, true)
  const step = wf.slice(wf.lastIndexOf('- name:', revive), revive)
  t('pre-step: continue-on-error(실패해도 수집은 돈다) · dry_run 수동 실행은 --dry', [/continue-on-error: true/.test(step), /inputs\.dry_run\) && '--dry'/.test(wf.slice(revive, revive + 200))], [true, true])
  const secrets = [...new Set([...wf.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]))].sort()
  t('새 시크릿 없음(기존 목록 그대로)', secrets, [
    'BOT_APP_ID', 'BOT_APP_PRIVATE_KEY', 'KAKAO_REST_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NOTION_API_TOKEN', 'PRODUCT_HUNT_API_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'YOUTUBE_API_KEY',
  ])
  t('permissions contents: read · concurrency review-collect 유지', [/\npermissions:\n {2}contents: read\n/.test(wf), /group: review-collect\n {2}cancel-in-progress: false/.test(wf)], [true, true])
  t('롤백 파일이 아티팩트로 올라가고 push 잡이 reports/ 에 커밋', [/name: target-revive-rollback/.test(wf), /git add -- reports/.test(wf)], [true, true])
  const bc = fs.readFileSync(path.join(root, '.github', 'workflows', 'build-check.yml'), 'utf8')
  t('build-check 에 등록', /node scripts\/revisit-clock-selftest\.mjs/.test(bc), true)
  const cm = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')
  t('CLAUDE.md §10.1 허용 한 줄(v48 · status·consecutive_empty · exhausted→active)', /재방문 시계 되살리기.*남헌 v48.*`status`·`consecutive_empty`.*`exhausted`→`active`/.test(cm), true)
}

console.log(`revisit-clock selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
