#!/usr/bin/env node
// notion-status-log.mjs 네트워크 없는 검사. fetch 를 가짜로 바꿔 프로브 종료 코드 경로까지 본다.
//   node scripts/notion-status-log-selftest.mjs

import assert from 'node:assert/strict'
import { buildStatusLogProperties, clip, parseCliArgs, runProbe, SCHEMA } from './notion-status-log.mjs'

// 1) 8개 속성 · 이름 · 타입
const long = '가'.repeat(5000)
const p = buildStatusLogProperties({ date: '2026-09-14', track: 'CMO', done: long, blocked: '', next: '내일', needsHuman: true, note: null })
assert.deepEqual(Object.keys(p).sort(), Object.keys(SCHEMA).sort())
for (const [k, type] of Object.entries(SCHEMA)) assert.ok(type in p[k], `${k} 는 ${type}`)
assert.equal(p.제목.title[0].text.content, '2026-09-14-CMO')
assert.equal(p.날짜.date.start, '2026-09-14')
assert.equal(p.트랙.select.name, 'CMO')
assert.equal(p.사람판단필요.checkbox, true)
assert.equal(buildStatusLogProperties({ date: '2026-09-14', track: 'CTO', needsHuman: 'yes' }).사람판단필요.checkbox, false)
assert.deepEqual(p.막힌것.rich_text, [])
assert.deepEqual(p.비고.rich_text, [])
// 알림완료는 Cowork 알림 전용 — CC 코드는 쓰지 않는다
assert.ok(!('알림완료' in p))
assert.ok(!('알림완료' in SCHEMA))

// 2) 2000자 자르기 (서로게이트 쌍을 쪼개지 않음)
assert.equal(p.한일.rich_text[0].text.content.length, 2000)
assert.ok(p.한일.rich_text[0].text.content.endsWith('…'))
assert.equal(clip('abc'), 'abc')
const emoji = clip('a'.repeat(1997) + '😀'.repeat(10))
assert.ok(emoji.length <= 2000 && !/[\ud800-\udbff]…$/.test(emoji))

// 3) 잘못된 입력은 throw
assert.throws(() => buildStatusLogProperties({ date: '2026-09-14', track: 'cmo' }))
assert.throws(() => buildStatusLogProperties({ date: '9/14', track: 'CMO' }))

// 3b) CLI 인자 — 기록 모드 · 기본 날짜 KST (UTC 15:30 = KST 다음날 00:30)
const cli = parseCliArgs(['--track', '기타', '--done', '세션 정리', '--needs-human'], new Date('2026-09-14T15:30:00Z'))
assert.deepEqual(cli.entry, { date: '2026-09-15', track: '기타', done: '세션 정리', blocked: undefined, next: undefined, needsHuman: true, note: undefined, title: undefined })
assert.equal(buildStatusLogProperties(cli.entry).트랙.select.name, '기타')
assert.throws(() => buildStatusLogProperties(parseCliArgs(['--track', 'CEO']).entry))
assert.deepEqual(parseCliArgs(['--probe']), { probe: true })
assert.throws(() => parseCliArgs(['--unknown']))

// 4) 프로브 종료 코드 — 가짜 fetch
const ID = 'f57ae10b-4cc0-433b-9db6-20785216aebe'
function fakeNotion({ createStatus = 200, propTypes = SCHEMA } = {}) {
  let title = ''
  let archived = false
  return async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null
    const json = (status, data) => ({ ok: status < 300, status, json: async () => data })
    if (init.method === 'POST') {
      if (createStatus !== 200) return json(createStatus, { code: 'x', message: 'fake' })
      title = body.properties.제목.title[0].text.content
      return json(200, { id: 'page-1', url: 'https://notion.so/page-1' })
    }
    if (init.method === 'PATCH') { archived = body.archived; return json(200, {}) }
    const properties = Object.fromEntries(Object.entries(propTypes).map(([k, type]) => [k, { type }]))
    properties.제목.title = [{ plain_text: title }]
    properties.알림완료 = { type: 'checkbox', checkbox: true } // 재확인이 이 값에 흔들리면 안 된다
    return json(200, { id: 'page-1', archived, parent: { database_id: ID.replace(/-/g, '') }, properties })
  }
}
const quiet = () => {}
const realFetch = globalThis.fetch
try {
  globalThis.fetch = fakeNotion()
  assert.equal(await runProbe({ token: 't', dbId: ID, log: quiet }), 0)
  globalThis.fetch = fakeNotion({ createStatus: 404 })
  assert.equal(await runProbe({ token: 't', dbId: ID, log: quiet }), 2)
  globalThis.fetch = fakeNotion({ createStatus: 403 })
  assert.equal(await runProbe({ token: 't', dbId: ID, log: quiet }), 2)
  globalThis.fetch = fakeNotion({ createStatus: 400 })
  assert.equal(await runProbe({ token: 't', dbId: ID, log: quiet }), 3)
  globalThis.fetch = fakeNotion({ createStatus: 401 })
  assert.equal(await runProbe({ token: 't', dbId: ID, log: quiet }), 1)
  globalThis.fetch = fakeNotion({ propTypes: { ...SCHEMA, 트랙: 'multi_select' } })
  assert.equal(await runProbe({ token: 't', dbId: ID, log: quiet }), 3)
  globalThis.fetch = async () => { throw new Error('offline') }
  assert.equal(await runProbe({ token: 't', dbId: ID, log: quiet }), 1)
  globalThis.fetch = () => { throw new Error('토큰 없으면 호출하면 안 된다') }
  assert.equal(await runProbe({ token: '', dbId: ID, log: quiet }), 1)
} finally {
  globalThis.fetch = realFetch
}

console.log('✅ notion-status-log-selftest: 통과')
