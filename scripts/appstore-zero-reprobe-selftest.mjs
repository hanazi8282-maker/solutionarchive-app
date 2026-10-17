#!/usr/bin/env node
// appstore-zero-reprobe 셀프테스트 — 가짜 fetch 만(네트워크·DB 없음).
//   node scripts/appstore-zero-reprobe-selftest.mjs

import fs from 'node:fs'
import { feedUrl } from '../lib/review/adapters/appstore.ts'
import { parseTargets, countEntries, reprobe, renderReport, MIN_INTERVAL_MS, MAX_REQUESTS } from './appstore-zero-reprobe.mjs'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}`) } }

const feed = (n) => JSON.stringify({ feed: n === null ? { author: {} } : { entry: Array.from({ length: n }, (_, i) => ({ id: { label: String(i) } })) } })
const fake = (map) => {
  const calls = []
  return { calls, fetchText: async (url) => { calls.push(url); return map(url) } }
}
const sleeps = []
const sleep = async (ms) => { sleeps.push(ms) }

// 1) 입력 파일 — 커밋한 목록이 70개, 형식 오류 0
{
  const { refs, bad } = parseTargets(fs.readFileSync(new URL('../reports/2026-10-17/appstore-zero-targets.txt', import.meta.url), 'utf8'))
  t('입력: 70개 · 오류 0', refs.length === 70 && bad.length === 0)
  t('입력: 상한 80 이하', refs.length <= MAX_REQUESTS)
  const p = parseTargets('kr:1 kr:1  us:x 123 zzz:5\nau:9')
  t('입력: 중복 제거·국가 없는 토큰·비숫자 거부', p.refs.join() === 'kr:1,au:9' && p.bad.join() === 'us:x,123,zzz:5')
}

// 2) entry 세기
t('entry: 배열', countEntries(feed(3)) === 3)
t('entry: 키 없음 = 0', countEntries(feed(null)) === 0)
t('entry: 객체 1건 = 1', countEntries(JSON.stringify({ feed: { entry: { id: {} } } })) === 1)
t('entry: 비JSON = null', countEntries('<html>') === null)
t('entry: feed 없음 = null', countEntries('{"x":1}') === null)

// 3) 정상 흐름 — URL 은 어댑터 feedUrl 1페이지와 같고, 요청 사이 3초 대기
{
  const f = fake((url) => ({ status: 200, body: url.includes('id=2/') ? feed(0) : feed(50) }))
  sleeps.length = 0
  const r = await reprobe(['kr:1', 'us:2', 'au:3'], { fetchText: f.fetchText, sleep })
  t('정상: URL = 어댑터 feedUrl', f.calls[0] === feedUrl('kr', '1', 1) && f.calls[1] === feedUrl('us', '2', 1))
  t('정상: 요청 3·중단 없음', r.requests === 3 && r.aborted === null)
  t('정상: 대기 2회·각 3초 이상', sleeps.length === 2 && sleeps.every((ms) => ms >= MIN_INTERVAL_MS))
  const s = renderReport(r, 3)
  t('요약: entry>0 2개 / 0 1개', s.includes('entry>0 인 앱 2개 / 0인 앱 1개'))
  t('표: 행마다 타깃', s.includes('| kr:1 | 200 | 50 |') && s.includes('| us:2 | 200 | 0 |'))
}

// 4) 더 짧은 간격을 줘도 3초로 올린다
{
  sleeps.length = 0
  await reprobe(['kr:1', 'kr:2'], { fetchText: async () => ({ status: 200, body: feed(1) }), sleep, intervalMs: 10 })
  t('간격 하한: 3초', sleeps[0] === MIN_INTERVAL_MS)
}

// 5) 중단 신호 — 1건이면 그 자리에서 멈추고 다음 요청을 보내지 않는다
for (const [name, res] of [
  ['403', { status: 403, body: '' }],
  ['404', { status: 404, body: 'x' }],
  ['429', { status: 429, body: '' }],
  ['5xx', { status: 503, body: 'x' }],
  ['네트워크 오류', { status: null, body: '', error: 'ETIMEDOUT' }],
  ['빈 본문', { status: 200, body: '  ' }],
  ['캡차', { status: 200, body: '<div class="g-recaptcha"></div>' }],
  ['비JSON', { status: 200, body: '<html><body>hi</body></html>' }],
]) {
  const f = fake((url) => (url.includes('id=2/') ? res : { status: 200, body: feed(5) }))
  const r = await reprobe(['kr:1', 'kr:2', 'kr:3'], { fetchText: f.fetchText, sleep })
  t(`중단(${name}): 2번째에서 멈춤·3번째 안 보냄`, r.aborted !== null && f.calls.length === 2 && r.rows.length === 1)
  t(`중단(${name}): 요약에 중단 표시·못 본 수`, renderReport(r, 3).includes('중단:') && renderReport(r, 3).includes('못 본 2개'))
}

// 6) 요청 상한
{
  const f = fake(() => ({ status: 200, body: feed(1) }))
  const r = await reprobe(['kr:1', 'kr:2', 'kr:3'], { fetchText: f.fetchText, sleep, maxRequests: 2 })
  t('상한: 2회에서 멈춤', f.calls.length === 2 && /상한/.test(r.aborted ?? ''))
}

// 7) 워크플로 — 수동 실행만, cron 없음, 읽기 권한만, DB 시크릿 없음
{
  const y = fs.readFileSync(new URL('../.github/workflows/appstore-zero-reprobe.yml', import.meta.url), 'utf8')
  t('워크플로: workflow_dispatch', /\n {2}workflow_dispatch:/.test(y))
  t('워크플로: schedule/cron/push 없음', !/^\s*(schedule|push|pull_request):/m.test(y) && !/^\s*-\s*cron:/m.test(y))
  t('워크플로: permissions contents: read', /permissions:\s*\n\s+contents: read/.test(y))
  t('워크플로: 시크릿 안 씀', !y.includes('secrets.'))
  t('워크플로: 스크립트 호출', y.includes('node scripts/appstore-zero-reprobe.mjs'))
}

console.log(`appstore-zero-reprobe-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
