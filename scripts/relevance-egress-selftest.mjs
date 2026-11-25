#!/usr/bin/env node
// 판정 대기열의 DB egress 절감 경로(v71ek) 셀프테스트 — 나눠 읽기(anti-join)·정확 수 세기가 예전 방식과 같은 결과를 내고,
// 못 쓰는 서버에서는 예전 방식으로 후퇴하는가. 네트워크·DB 없음(가짜 supabase 가 PostgREST 임베드를 흉내낸다 — 실제 서버 확인은 아니다).
//   node scripts/relevance-egress-selftest.mjs
import { createPendingFor } from '../lib/analysis/relevance-pending.ts'
import { loadAreaContext } from '../lib/analysis/area-priority.ts'
import { loadPrefilterConfig } from '../lib/analysis/prefilter.ts'
import { isDeepStrictEqual } from 'node:util'

let pass = 0, fail = 0
const t = (name, ok) => { if (ok) pass++; else { fail++; console.log(`✗ ${name}`) } }

/** modern=false 면 limit·gt·in 이 없는 서버(= 새 경로를 못 쓴다). ignoreNull=true 면 anti-join 의 is.null 을 무시하는 서버. */
function fakeDb(tables, { modern = true, ignoreNull = false } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const q = { table, cols: '', where: [], embed: null, embedWhere: [], antiJoin: false, order: null, from: 0, to: 999, count: false }
      const b = {
        select(c, o) {
          q.count = o?.count === 'exact'
          const m = /, v:review_relevance_verdicts!(left|inner)\(input_id\)$/.exec(c)
          if (m) { q.embed = m[1]; c = c.slice(0, m.index) }
          q.cols = c.split(',').map((x) => x.trim()); return b
        },
        eq(c, v) { if (c.startsWith('v.')) q.embedWhere.push((r) => r[c.slice(2)] === v); else q.where.push((r) => r[c] === v); return b },
        is(c, v) { if (c === 'v') q.antiJoin = true; else q.where.push((r) => r[c] === v); return b },
        order(c) { q.order = c; return b },
        range(a, z) { q.from = a; q.to = z; return b },
        then(res, rej) {
          let rows = (tables[table] ?? []).filter((r) => q.where.every((f) => f(r)))
          if (q.order) rows = [...rows].sort((a, z) => (a[q.order] < z[q.order] ? -1 : 1))
          if (q.embed) {
            rows = rows.flatMap((r) => {
              const hit = tables.review_relevance_verdicts.find((v) => v.input_id === r.id && q.embedWhere.every((f) => f(v)))
              if ((q.embed === 'inner' && !hit) || (q.antiJoin && hit && !ignoreNull)) return []
              return [{ ...r, v: hit ? { input_id: hit.input_id } : null }]
            })
          }
          const total = rows.length
          const data = rows.slice(q.from, q.to + 1).map((r) => Object.fromEntries([...q.cols, ...(q.embed ? ['v'] : [])].filter((k) => k in r).map((k) => [k, r[k]])))
          calls.push({ table, embed: q.embed, cols: q.cols.join(), ids: data.map((r) => r.id ?? r.input_id), n: data.length })
          return Promise.resolve({ data, error: null, count: q.count ? total : null }).then(res, rej)
        },
      }
      if (modern) {
        b.limit = (n) => { q.to = q.from + n - 1; return b }
        b.gt = (c, v) => { q.where.push((r) => r[c] > v); return b }
        b.in = (c, vs) => { q.where.push((r) => vs.includes(r[c])); return b }
      }
      b.not = (c) => { q.where.push((r) => r[c] != null); return b }
      return b
    },
  }
}

const id = (p, i) => `${p}-${String(i).padStart(5, '0')}`
const at = (i) => new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString()
const row = (p, i, raw_text, source_key = 'hackernews') => ({ id: id(p, i), project_id: p, purged_at: null, raw_text, created_at: at(i), collected_at: null, source_key, rating: null })
const LONG = '배터리가 너무 빨리 닳아서 불편합니다 정말로요 지난달부터 계속 그렇고 환불도 알아보고 있어요'
const inputs = [
  // mix: 1,150 판정 + 1,150 미판정(두 갈래 모두 1,000행을 넘는다) · 판정/미판정 사이 중복 본문
  ...Array.from({ length: 2300 }, (_, i) => row('mix', i, i % 500 === 0 ? LONG : `${LONG} #${i}`, i % 3 ? 'appstore' : 'danawa')),
  // res: 미판정은 HN 저가치(짧고 키워드 없음)뿐 → 표본 0
  ...Array.from({ length: 50 }, (_, i) => row('res', i, i < 40 ? `${LONG} #${i}` : `Nice post ${i}`)),
]
const verdicts = [
  ...inputs.filter((r, i) => r.project_id === 'mix' && i % 2 === 0).map((r) => ({ input_id: r.id, project_id: 'mix' })),
  ...inputs.filter((r) => r.project_id === 'res').slice(0, 40).map((r) => ({ input_id: r.id, project_id: 'res' })),
  { input_id: id('mix', 1), project_id: 'other' }, // 다른 project_id 의 판정 행 — 예전 정의대로 mix 에선 미판정
]
const tables = {
  analysis_inputs: inputs, review_relevance_verdicts: verdicts, consumer_material_tags: [], content_quality_flags: [],
  analysis_projects: [{ id: 'mix', area_code: '1' }, { id: 'res', area_code: '2' }, { id: 'other', area_code: null }], review_targets: [],
}
const cfg = loadPrefilterConfig(undefined, {}).cfg
const make = (db) => createPendingFor({ supabase: db, sampleSize: 300, highRatingShare: 0.2, prefilterCfg: cfg, log: () => {}, warn: () => {}, excludedSources: [], allowIds: new Set() })

const oldDb = fakeDb(tables, { modern: false }), newDb = fakeDb(tables)
const o = make(oldDb), n = make(newDb)
for (const p of ['mix', 'res']) {
  const [a, b] = [await o.countFor({ id: p }), await n.countFor({ id: p })]
  t(`${p}: countFor 수 동일`, isDeepStrictEqual({ ...a, sources: 0 }, { ...b, sources: 0 }) && b.unjudged > 0)
}
t('countFor: 판정 id 를 따로 읽지 않는다', !newDb.calls.some((c) => c.table === 'review_relevance_verdicts') && oldDb.calls.some((c) => c.table === 'review_relevance_verdicts'))
newDb.calls.length = 0
for (const p of ['mix', 'res']) {
  const [a, b] = [await o.pendingFor({ id: p }), await n.pendingFor({ id: p })]
  t(`${p}: pendingFor 결과 동일(순서·본문)`, isDeepStrictEqual(a, b))
  if (p === 'mix') t('mix: 대상이면 사전필터 기록(전체 요약·중복)도 동일', b.reviews.length === 300 && isDeepStrictEqual(o.prefilterByProject.mix, n.prefilterByProject.mix) && n.prefilterByProject.mix.project_all.total === 2300)
}
const raw = (p) => newDb.calls.filter((c) => c.table === 'analysis_inputs' && c.ids.some((x) => x.startsWith(p))).flatMap((c) => c.ids)
t('res(표본 0): 미판정 원문 10건만 받는다', raw('res').length === 10)
t('mix: 원문은 행마다 한 번씩만 받는다', raw('mix').length === 2300 && new Set(raw('mix')).size === 2300)

// is.null 을 무시하는 서버 → 응답 모양 검사에 걸려 예전 방식으로 후퇴(같은 결과)
const bad = make(fakeDb(tables, { ignoreNull: true }))
t('anti-join 이 안 먹는 서버: 후퇴해서 같은 결과', isDeepStrictEqual(await bad.pendingFor({ id: 'mix' }), await make(fakeDb(tables, { modern: false })).pendingFor({ id: 'mix' })))

// 예전 방식 고정 목록: 목록의 프로젝트는 나눠 읽기를 하지 않는다(임베드 조회 0번), 결과는 같다.
const pinDb = fakeDb(tables)
const pinned = createPendingFor({ supabase: pinDb, sampleSize: 300, highRatingShare: 0.2, prefilterCfg: cfg, log: () => {}, warn: () => {}, excludedSources: [], allowIds: new Set(), legacyReadProjects: ['mix'] })
t('고정 프로젝트: 결과 동일', isDeepStrictEqual(await pinned.countFor({ id: 'mix' }), await make(fakeDb(tables, { modern: false })).countFor({ id: 'mix' })))
t('고정 프로젝트: 나눠 읽기 조회 0번', !pinDb.calls.some((c) => c.embed))

const a1 = fakeDb(tables, { modern: false }), a2 = fakeDb(tables)
const area = async (db) => (await loadAreaContext(db, () => {})).judged
t('영역 판정 수: 서버 정확 수 = 행 세기', isDeepStrictEqual(await area(a1), await area(a2)) && (await area(a2))['1'] === 1150)
t('영역 판정 수: 판정 행을 통째로 받지 않는다', a2.calls.filter((c) => c.table === 'review_relevance_verdicts').every((c) => c.n <= 1))

console.log(`relevance-egress-selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
