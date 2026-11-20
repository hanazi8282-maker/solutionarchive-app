#!/usr/bin/env node
// product-discover-v2 셀프테스트 — 네트워크·DB 0. 핵심: 일반 명사 후보 0건.
import { extractMentions } from '../lib/discovery/mention-loop.ts'
import { aggregateMentions, capPerArea, headName, isGenericName, looksLikeProductName, matchStoreApp, pickChart, shouldStop, slugOf } from '../lib/discovery/product-discover-shared.mjs'
import { normKey } from './product-name-candidates.mjs'
import { probeMentions } from './product-discover-v2.mjs'

let pass = 0, fail = 0
const eq = (n, a, b) => { JSON.stringify(a) === JSON.stringify(b) ? pass++ : (fail++, console.log(`❌ ${n}\n  기대 ${JSON.stringify(b)}\n  실제 ${JSON.stringify(a)}`)) }

// 일반 명사·인프라 이름 — 전부 true 여야 한다
for (const w of ['table', 'Data', 'production', 'S3', 'OpenAI', 'Calendar', 'invoice', '서비스', '데이터', 'Online Booking Form', 'x', '2024']) eq(`generic ${w}`, isGenericName(w), true)
for (const w of ['Calendly', 'FreshBooks', 'Notion', 'Zoho CRM', '토스']) eq(`not generic ${w}`, isGenericName(w), false)
eq('소문자 평범한 단어만 쓰인 이름은 제품 아님', looksLikeProductName(new Set(['pipeline'])), false)
eq('대문자로 쓰인 표면이 있으면 통과', looksLikeProductName(new Set(['pipeline', 'Pipedrive'])), true)

// 집계: 서로 다른 글 3개 미만 제외, 일반어 제외, 0건 규칙
const mk = (id, t) => ({ id, raw_text: t })
const posts = [
  mk('a', 'We switched from Wave to Calendly last month'), mk('b', 'I moved from Wave to Calendly too'), mk('c', 'switched to Calendly, alternatives to Wave are fine'),
  mk('d', 'switching from table to Notion'), mk('e', 'moved from table to Notion'), mk('f', 'switched from table to Notion'),
  mk('g', 'migrated to production last week'), mk('h', 'migrated to production'), mk('i', 'moved to production'),
  mk('j', 'moved from OpenAI to Gemini'), mk('k', 'switched from OpenAI to Gemini'), mk('l', 'migrated from OpenAI to Gemini'),
]
const { cands } = aggregateMentions(posts, extractMentions)
const keys = cands.map((c) => c.key)
for (const bad of ['table', 'production', 'openai', 's3', 'data']) eq(`후보에 ${bad} 없음`, keys.includes(bad), false)
eq('Calendly 는 후보', keys.includes('calendly'), true)
eq('글 2개짜리는 제외', aggregateMentions(posts.slice(0, 2), extractMentions).cands.length, 0)

// 시험: 스토어에 같은 이름 앱 + 평가 50+ + 분야 일치만 통과
const app = (name, n, desc = 'online appointment booking scheduling') => ({ trackId: 1, trackName: name, userRatingCount: n, description: desc, sellerUrl: 'https://x.example' })
eq('headName', headName('Calendly - Booking App'), 'Calendly')
eq('이름 불일치 → null', matchStoreApp('calendly', [app('Other Tool', 999)]), null)
eq('평가 부족 → null', matchStoreApp('calendly', [app('Calendly', 10)]), null)
eq('일반어 앱 이름 → null(이중 방어)', matchStoreApp('table', [app('Table', 999)]), null)
eq('일치 통과', matchStoreApp('calendly', [app('Calendly: Booking', 500)])?.userRatingCount, 500)
eq('slugOf 예약', slugOf('Calendly appointment booking', ''), 'booking_scheduling_forms')
eq('slugOf 분야 밖 → null', slugOf('Photo Filter', 'fun'), null)

const resp = (status, body) => ({ status, ok: status === 200, json: async () => body })
const run = (fetchFn, cs) => probeMentions(cs, { fetchFn, sleep: async () => {}, maxReq: 40 })
const c1 = { key: 'calendly', surface: 'Calendly', ids: ['a', 'b', 'c'], surfaces: ['Calendly'] }
let r = await run(async () => resp(200, { results: [app('Calendly: Appointment Booking', 300)] }), [c1])
eq('시험 통과 1건', [r.accepted.length, r.stopped], [1, null])
r = await run(async () => resp(429, {}), [c1, c1])
eq('429 즉시 중단·0건', [r.accepted.length, r.requests, !!r.stopped], [0, 1, true])
r = await run(async () => resp(200, { results: [] }), Array.from({ length: 15 }, (_, i) => ({ ...c1, key: `k${i}`, surface: `K${i}` })))
eq('실패 80%↑ → 10건째에 중단', [r.probed, !!r.stopped], [10, true])
eq('shouldStop 10건 미만은 안 멈춤', shouldStop(5, 5), false)

// 차트: 장르·평가·분야·일반어·등록분 거름
const lk = new Map([
  ['1', { trackId: 1, trackName: 'FreshBooks Invoicing', primaryGenreName: 'Business', userRatingCount: 900, description: 'accounting invoice bookkeeping' }],
  ['2', { trackId: 2, trackName: 'Table', primaryGenreName: 'Business', userRatingCount: 900, description: 'invoice accounting' }],
  ['3', { trackId: 3, trackName: 'Cool Game', primaryGenreName: 'Games', userRatingCount: 900, description: 'invoice' }],
  ['4', { trackId: 4, trackName: 'Tiny Invoice', primaryGenreName: 'Finance', userRatingCount: 5, description: 'invoice' }],
  ['5', { trackId: 5, trackName: 'Zeta Notes', primaryGenreName: 'Productivity', userRatingCount: 900, description: 'write' }],
  ['6', { trackId: 6, trackName: 'Known Invoice App', primaryGenreName: 'Business', userRatingCount: 900, description: 'invoice accounting' }],
])
const ch = pickChart([1, 2, 3, 4, 5, 6].map((i) => ({ id: String(i), country: 'us' })), lk, new Set(['6']))
eq('차트 후보는 FreshBooks 하나', ch.cands.map((c) => c.id), ['1'])
eq('차트 일반어 1·분야 밖 1', [ch.rejectedGeneric, ch.outOfArea], [1, 1])
eq('분야당 10·전체 30 상한', capPerArea(Array.from({ length: 50 }, (_, i) => ({ slug: ['a', 'b', 'c', 'd'][i % 4] }))).length, 30)
eq('분야당 10 상한', capPerArea(Array.from({ length: 50 }, () => ({ slug: 'a' }))).length, 10)
eq('normKey 사용 확인', normKey('Calendly'), 'calendly')

console.log(`product-discover-v2 selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
