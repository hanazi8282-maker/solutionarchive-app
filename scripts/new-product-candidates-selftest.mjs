#!/usr/bin/env node
// new-product-candidates.mjs 셀프테스트 — 네트워크 0.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BATCH, DAILY_CAP, areaHint, lookupBatches, pickDaily, registeredIds, toCandidate, unregistered } from './new-product-candidates.mjs'

let pass = 0, fail = 0
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log(`❌ ${name}\n   기대 ${JSON.stringify(b)}\n   실제 ${JSON.stringify(a)}`)) }

const areas = { 1: { ko: ['회의록'], en: ['meeting notes'] }, 2: { ko: [], en: ['sales crm'] }, design: { ko: [], en: ['design tool'] } }
eq('registeredIds 국가 접두 제거', [...registeredIds(['kr:123', 'us:123', '456', 'x:abc'])].sort(), ['123', '456'])
eq('registeredIds 비배열', registeredIds(null).size, 0)

const dict = { a: [{ id: '1', name: 'A', country: 'kr' }], b: [{ id: '1', name: 'A', country: 'us' }, { id: '2', name: 'B', country: 'us' }], c: [{ id: '3', name: 'C', country: 'kr' }] }
eq('unregistered 중복·등록 제외', unregistered(dict, new Set(['3'])).map((e) => e.id), ['1', '2'])

eq('areaHint 영어', areaHint('Great Meeting Notes app', areas), '1')
eq('areaHint design 은 후보 영역 아님', areaHint('design tool', areas), null)
eq('areaHint 없음', areaHint('photo filter', areas), null)

const e = { id: '9', name: 'N', artist: 'Dev', country: 'us' }
eq('toCandidate 장르 밖 제외', toCandidate(e, { primaryGenreName: 'Games', userRatingCount: 99999 }, areas), null)
eq('toCandidate 평점 부족 제외', toCandidate(e, { primaryGenreName: 'Business', userRatingCount: 10 }, areas), null)
eq('toCandidate lookup 없음 제외(확인 불가를 통과로 접지 않는다)', toCandidate(e, undefined, areas), null)
const c = toCandidate(e, { trackName: 'Notes', primaryGenreName: 'Productivity', userRatingCount: 800, sellerName: 'S', description: 'AI meeting notes' }, areas)
eq('toCandidate 정상', [c.area, c.appstore_id, c.rating_count, c.developer], ['1', '9', 800, 'S'])

const many = Array.from({ length: 60 }, (_, i) => ({ appstore_id: String(i), rating_count: 1000 + i, area: '1' })).concat([{ appstore_id: 'z', rating_count: 9e9, area: null }])
const pd = pickDaily(many)
eq('pickDaily 상한·큰 순', [pd.picked.length, pd.picked[0].appstore_id, pd.hold.length], [DAILY_CAP, '59', 1])

// lookupBatches: robots → 요청 → 묶음, 차단이면 멈춤
const mk = (handler) => { const calls = []; return { calls, fetchFn: async (u) => { calls.push(u); return handler(u) } } }
const res = (status, body) => ({ status, text: async () => body })
const entries = Array.from({ length: BATCH + 1 }, (_, i) => ({ id: String(1000 + i), country: 'us' }))
{
  const m = mk((u) => (u.endsWith('/robots.txt') ? res(200, 'User-agent: *\nDisallow: /search*\n') : res(200, JSON.stringify({ results: [{ trackId: 1000 }] }))))
  const r = await lookupBatches(entries, { fetchFn: m.fetchFn, sleep: async () => {} })
  eq('두 묶음 2요청 + robots 1', [r.requests, m.calls.filter((u) => u.includes('/lookup?')).length, r.blocked], [2, 2, false])
  eq('search 경로는 부르지 않는다', m.calls.some((u) => u.includes('/search')), false)
}
{
  const m = mk((u) => (u.endsWith('/robots.txt') ? res(200, 'User-agent: *\nDisallow: /search*\n') : res(429, '')))
  const r = await lookupBatches(entries, { fetchFn: m.fetchFn, sleep: async () => {} })
  eq('429 는 첫 요청에서 멈춘다', [r.requests, r.blocked], [1, true])
}
{
  const m = mk((u) => (u.endsWith('/robots.txt') ? res(200, 'User-agent: *\nDisallow: /lookup\n') : res(200, '{}')))
  const r = await lookupBatches(entries, { fetchFn: m.fetchFn, sleep: async () => {} })
  eq('robots 가 lookup 금지면 요청 0', [r.requests, r.blocked], [0, true])
}
{
  const m = mk((u) => (u.endsWith('/robots.txt') ? res(200, 'User-agent: *\nDisallow: /search*\n') : res(200, '')))
  const r = await lookupBatches(entries, { fetchFn: m.fetchFn, sleep: async () => {} })
  eq('빈 본문은 차단 신호', r.blocked, true)
}

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'new-product-candidates.mjs'), 'utf8').replace(/\/\/.*$/gm, '')
eq('DB 접근 없음', /supabase|createClient|SERVICE_ROLE/i.test(src), false)
eq('search URL 호출 없음', /itunes\.apple\.com\/search/.test(src), false)

console.log(`new-product-candidates selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
