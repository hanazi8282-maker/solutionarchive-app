#!/usr/bin/env node
// notion-status-log.mjs 네트워크 없는 검사. fetch 를 가짜로 바꿔 프로브 종료 코드 경로까지 본다.
//   node scripts/notion-status-log-selftest.mjs

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildStatusLogProperties, clip, nextTitle, parseCliArgs, recordStatusLog, runProbe, SCHEMA } from './notion-status-log.mjs'
import { buildReviewCollectEntry } from './review-collect-status.mjs'

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
function fakeNotion({ createStatus = 200, propTypes = SCHEMA, existing = [], queryStatus = 200 } = {}) {
  let title = ''
  let archived = false
  const fn = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null
    const json = (status, data) => ({ ok: status < 300, status, json: async () => data })
    if (init.method === 'POST' && url.includes('/databases/')) {
      fn.query = body
      if (queryStatus !== 200) return json(queryStatus, { code: 'x', message: 'fake query' })
      return json(200, { results: existing.map((t) => ({ properties: { 제목: { title: [{ plain_text: t }] } } })), has_more: false })
    }
    if (init.method === 'POST') {
      fn.created = body
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
  return fn
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

  // 5) 제목 번호 (§11: 같은 날·같은 트랙 두 번째부터 -2)
  assert.equal(nextTitle('2026-09-14-CMO', []), '2026-09-14-CMO')
  assert.equal(nextTitle('2026-09-14-CMO', ['2026-09-14-CMO']), '2026-09-14-CMO-2')
  assert.equal(nextTitle('2026-09-14-CMO', ['2026-09-14-CMO', '2026-09-14-CMO-3']), '2026-09-14-CMO-4')
  assert.equal(nextTitle('2026-09-14-CMO', ['2026-09-14-CMO-extra', '2026-09-14-CTO']), '2026-09-14-CMO')
  assert.equal(nextTitle('2026-09-14-기타', ['2026-09-14-기타']), '2026-09-14-기타-2')

  // 6) recordStatusLog — 번호 · 번호 확인 불가 · 폴백 파일
  const entry = { date: '2026-09-14', track: 'CMO', done: '한 일 본문', blocked: '없음', next: '다음', needsHuman: false, note: 'run_key x' }
  let f = fakeNotion({ existing: ['2026-09-14-CMO'] })
  globalThis.fetch = f
  let r = await recordStatusLog(entry, { token: 't', dbId: ID })
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.title, '2026-09-14-CMO-2')
  assert.equal(f.created.properties.제목.title[0].text.content, '2026-09-14-CMO-2')
  assert.equal(f.query.filter.property, '제목')
  assert.ok(!('알림완료' in f.created.properties))

  f = fakeNotion({ queryStatus: 500 })
  globalThis.fetch = f
  r = await recordStatusLog(entry, { token: 't', dbId: ID })
  assert.ok(r.ok)
  assert.equal(r.title, '2026-09-14-CMO')
  assert.match(f.created.properties.비고.rich_text[0].text.content, /번호 확인 불가/)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'status-log-'))
  try {
    globalThis.fetch = fakeNotion()
    r = await recordStatusLog(entry, { token: 't', dbId: ID, pendingDir: tmp })
    assert.ok(r.ok && !r.pendingPath, '성공이면 폴백 파일을 안 쓴다')
    assert.equal(fs.readdirSync(tmp).length, 0)

    globalThis.fetch = fakeNotion({ createStatus: 404 })
    r = await recordStatusLog(entry, { token: 't', dbId: ID, pendingDir: tmp })
    assert.equal(r.ok, false)
    assert.equal(r.code, 2)
    assert.equal(path.basename(r.pendingPath), '2026-09-14-CMO.md')
    const md = fs.readFileSync(r.pendingPath, 'utf-8')
    assert.ok(md.includes('# 2026-09-14-CMO') && md.includes('## 한일') && md.includes('한 일 본문') && /404/.test(md))

    globalThis.fetch = () => { throw new Error('토큰 없으면 호출하면 안 된다') }
    r = await recordStatusLog(entry, { token: '', dbId: ID, pendingDir: tmp })
    assert.equal(r.stage, 'env')
    assert.equal(path.basename(r.pendingPath), '2026-09-14-CMO-2.md', '로컬 파일끼리도 번호가 겹치지 않는다')

    r = await recordStatusLog({ ...entry, track: 'CEO' }, { token: '', dbId: ID, pendingDir: tmp })
    assert.equal(r.stage, 'build')
    assert.equal(fs.readdirSync(tmp).length, 2, '잘못된 입력은 폴백 파일도 안 쓴다')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
} finally {
  globalThis.fetch = realFetch
}

// 7) CTO 행 — 리뷰 수집 요약 (결정적)
{
  const lines = (s) => s.split('\n').length
  const busy = buildReviewCollectEntry({
    date: '2026-09-14',
    sources: [
      { key: 'danawa', stats: { newReviews: 3, reviewsParsed: 10, parseFailures: 1, blockedResponses: 0 }, warnings: [] },
      { key: 'appstore', fatal: 'timeout' },
      { key: 'hackernews', skipped: true, skipReason: '타깃 없음' },
    ],
    failures: ['appstore'], topProject: { id: 'p1', n: 40 }, runUrl: 'https://github.com/o/r/actions/runs/1',
  })
  assert.equal(busy.track, 'CTO')
  assert.ok(busy.done.startsWith('리뷰 수집 3개 소스 — 신규 3건 · 파싱 10건(실패 1)'), busy.done)
  assert.ok(busy.blocked.includes('appstore: timeout'))
  assert.ok(busy.next.includes('appstore') && busy.next.includes('p1 40건'))
  assert.equal(busy.needsHuman, true)
  assert.ok(busy.note.includes('actions/runs/1'))
  for (const k of ['done', 'blocked', 'next']) assert.ok(lines(busy[k]) <= 5, k)
  buildStatusLogProperties(busy)

  const calm = buildReviewCollectEntry({ date: '2026-09-14', sources: [{ key: 'danawa', stats: { newReviews: 0, reviewsParsed: 5, parseFailures: 0 } }] })
  assert.equal(calm.needsHuman, false)
  assert.equal(calm.blocked, '없음')
  assert.ok(calm.next.startsWith('사람 할 일 없음'))

  const noisy = buildReviewCollectEntry({ date: '2026-09-14', sources: [{ key: 'danawa', stats: {}, warnings: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'] }] })
  assert.equal(lines(noisy.blocked), 5)
  assert.match(noisy.blocked.split('\n')[4], /^외 3건/)
  assert.equal(noisy.needsHuman, true)
}

console.log('✅ notion-status-log-selftest: 통과')
