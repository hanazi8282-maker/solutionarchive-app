import assert from 'node:assert/strict'
import { parseFeed, buildDictionary, collect } from './appstore-chart-dictionary.mjs'

const feed = { feed: { results: [{ id: '1', name: 'Notion: Notes, Docs, Tasks', artistName: 'Notion Labs' }, { id: '2', name: 'Notion: Notes, Docs, Tasks' }, { name: 'no id' }] } }
assert.equal(parseFeed(feed, 'us').length, 2, '이름·ID 없는 항목은 거른다')
assert.throws(() => parseFeed({ feed: {} }, 'us'), /results 없음/, '못 읽은 것을 빈 배열로 접지 않는다')
assert.equal(parseFeed({ feed: { results: [] } }, 'us').length, 0)
const d = buildDictionary([...parseFeed(feed, 'us'), ...parseFeed(feed, 'us')])
assert.equal(Object.values(d).flat().length, 2, '같은 id·나라는 한 번만')

const ok = async () => ({ status: 200, json: async () => feed })
const sleep = async () => {}
const quiet = () => {}
let r = await collect({ fetchFn: ok, sleep, log: quiet })
assert.equal(r.entries.length, 8, '4피드 × 2항목')
let n = 0
r = await collect({ fetchFn: async () => (++n === 1 ? { status: 429 } : ok()), sleep, log: quiet })
assert.ok(r.stopped && n === 1 && r.entries.length === 0, '429 한 번이면 즉시 중단·우회 없음')
n = 0
r = await collect({ fetchFn: async () => (++n <= 2 ? { status: 500 } : ok()), sleep, log: quiet })
assert.equal(r.skipped.length, 1, '5xx 는 한 번 재시도 뒤 그 피드만 건너뜀')
assert.equal(r.entries.length, 6)
console.log('appstore-chart-dictionary selftest: pass')
