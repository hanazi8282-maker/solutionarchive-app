#!/usr/bin/env node
// v71ba P0-2 셀프테스트 — 이름→앱 ID 해소 경로 ③홈페이지 메타·④Search 연결·/30 드라이런. 네트워크·DB 없음(가짜 fetch).
// 보는 것: 근거 글 주소만 홈페이지 후보(이름으로 도메인 안 지음·스토어/커뮤니티 호스트 제외), robots 먼저(못 읽음·HTML·금지 = 페이지 요청 0),
//          403/429 즉시 중단, 다른 호스트 리다이렉트 안 읽음, Search 는 1~3번으로 못 정한 후보만·403 1건이면 그 뒤 0, 워크플로 배선.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { homepageCandidates } from '../lib/discovery/mention-loop.ts'
import { homepageAnchors, main as mentionLoop } from './mention-loop.mjs'
import { makeGuard } from './anchor-verify.mjs'
import { pickTop } from './mention-resolve-dryrun.mjs'

let pass = 0
const t = async (name, fn) => {
  try {
    await fn()
    pass++
  } catch (e) {
    console.error(`❌ ${name}`)
    throw e
  }
}
const res = (status, body, url) => ({ status, url, text: async () => body, json: async () => JSON.parse(body), headers: { get: (k) => (k === 'content-type' ? (body.trim().startsWith('{') ? 'application/json' : 'text/html') : null) } })
const nk = (s) => s.toLowerCase().replace(/[\s\-._]/g, '')

await t('홈페이지 후보: 글 속 주소만·호스트 토막 일치·스토어/커뮤니티 제외·대장 homepage_url', () => {
  const raw = new Map([
    ['p1', 'I moved to Raindrop (https://raindrop.io/pricing) from Pocket'],
    ['p2', 'see https://github.com/raindropio/app and https://app.raindrop.io/x and https://apps.apple.com/app/id123456'],
    ['p3', 'nothing here raindropapp.com'],
  ])
  assert.deepEqual(homepageCandidates({ key: 'raindrop', posts: ['p1', 'p2', 'p3'] }, raw), ['https://raindrop.io/', 'https://app.raindrop.io/'])
  assert.deepEqual(homepageCandidates({ key: 'pocket', posts: ['p1'] }, raw), [])
  assert.deepEqual(homepageCandidates({ key: 'tasklane', posts: [] }, raw, [{ name: 'Tasklane', homepage_url: 'https://tasklane.app/about', verdict: 'rejected' }], nk), ['https://tasklane.app/'])
})

await t('홈페이지 읽기: robots 먼저, 못 읽음·HTML·금지면 페이지 0, 메타 → ID, 다른 호스트 안 읽음, 429 즉시 중단', async () => {
  const calls = []
  const site = {
    'https://ok.io/robots.txt': res(200, 'User-agent: *\nAllow: /\n'),
    'https://ok.io/': res(200, '<meta name="apple-itunes-app" content="app-id=1234567890"><a href="https://play.google.com/store/apps/details?id=io.ok.app">', 'https://www.ok.io/'),
    'https://nor.io/robots.txt': res(404, '<html>nope</html>'),
    'https://html.io/robots.txt': res(200, '<!doctype html><html><body>soft 404</body></html>'),
    'https://no.io/robots.txt': res(200, 'User-agent: *\nDisallow: /\n'),
    'https://hop.io/robots.txt': res(200, 'User-agent: *\nAllow: /\n'),
    'https://hop.io/': res(200, '<meta name="apple-itunes-app" content="app-id=999999">', 'https://elsewhere.com/'),
    'https://lim.io/robots.txt': res(200, 'User-agent: *\nAllow: /\n'),
    'https://lim.io/': res(429, ''),
    'https://after.io/robots.txt': res(200, ''),
  }
  const fetchFn = async (u) => (calls.push(u), site[u] ?? res(500, ''))
  const r = await homepageAnchors(['https://ok.io/', 'https://nor.io/', 'https://html.io/', 'https://no.io/', 'https://hop.io/', 'https://lim.io/', 'https://after.io/'], { fetchFn, gapMs: 0, log: () => {} })
  assert.deepEqual(r.out.get('https://ok.io/'), { state: 'read', appstore_id: '1234567890', play_pkg: 'io.ok.app' })
  assert.deepEqual(['https://nor.io/', 'https://html.io/', 'https://no.io/'].map((u) => r.out.get(u).state), ['robots_unverified', 'robots_unverified', 'robots_disallowed'])
  assert.ok(!calls.includes('https://nor.io/') && !calls.includes('https://html.io/') && !calls.includes('https://no.io/'), '금지·확인 불가 페이지는 요청 0')
  assert.equal(r.out.get('https://hop.io/').state, 'other_host')
  assert.equal(r.stopped, 'lim.io 429')
  assert.ok(!calls.some((u) => u.startsWith('https://after.io')), '중단 뒤 요청 0')
  assert.equal(r.requests, calls.length)
})

// ── ④ Search 연결(언급 루프 본체) ──
const FIX = 'fixtures/discovery/mention-loop-input.json'
const fix = JSON.parse(fs.readFileSync(FIX, 'utf8'))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-'))
const lf = path.join(tmp, 'l.json')
fs.writeFileSync(lf, JSON.stringify(fix._lookups))
const sf = path.join(tmp, 's.json')
fs.writeFileSync(sf, JSON.stringify(fix._searched)) // 시프트잇 = 이미 검색 결과 있음 → 다시 안 부른다
const ledger = path.join(tmp, 'ledger.json')
const quiet = { log: () => {}, fileRegistry: { dictionary: [{ name: 'Evernote', slug: 'evernote' }], areaMapSlugs: [] }, cfg: { exclude: { company_only: ['google'], person_name: ['maciej'] } } }
const runLoop = async (searchFetch) => {
  fs.writeFileSync(ledger, JSON.stringify({ entries: {} }))
  const searches = []
  const fetchFn = async (u) => {
    if (u.includes('/search?')) return (searches.push(u), searchFetch(u))
    throw new Error(`예상 밖 네트워크: ${u}`)
  }
  const out = await mentionLoop([`--input=${FIX}`, `--lookups=${lf}`, `--searched=${sf}`, `--ledger=${ledger}`, '--search'], { ...quiet, fetchFn, searchGuard: makeGuard({ logFile: null, intervalMs: 0 }) })
  return { out, searches }
}

await t('Search: 1~3번으로 못 정한 후보만(픽스처 driftly 1건), 이미 anchored 인 후보는 안 부름', async () => {
  const { out, searches } = await runLoop(() => res(200, JSON.stringify({ results: [{ trackId: 7777777777, trackName: 'Driftly', sellerName: 'Driftly Inc', userRatingCount: 500 }] })))
  assert.equal(searches.length, 1)
  assert.match(searches[0], /term=[Dd]riftly/)
  assert.equal(out.paths.search_calls, 1)
  assert.equal(out.rows.find((r) => r.key === 'driftly').verify.state, 'anchored')
})
await t('Search: 403 1건이면 그 실행 중단(그 뒤 0), lookup_failed 로 남김(no_match 로 안 접음)', async () => {
  const { out, searches } = await runLoop(() => res(403, ''))
  assert.equal(searches.length, 1)
  assert.match(out.paths.search_stopped, /HTTP 403/)
  assert.equal(out.rows.find((r) => r.key === 'driftly').verify.state, 'lookup_failed')
})
await t('--search 없으면 /search 0', async () => {
  fs.writeFileSync(ledger, JSON.stringify({ entries: {} }))
  let n = 0
  await mentionLoop([`--input=${FIX}`, `--lookups=${lf}`, `--ledger=${ledger}`], { ...quiet, fetchFn: async () => (n++, res(500, '')) })
  assert.equal(n, 0)
})

await t('/30 표본: 3글로 모자라면 기준을 내려 채운다', () => {
  const mk = (key, posts) => ({ key, name: key, mentions: posts, posts: Array.from({ length: posts }, (_, i) => `${key}${i}`), sources: ['s'], areas: { 1: posts }, roles: { from: 0, to: posts, alt: 0, compare: 0 }, alt_seek_posts: 0, ko_posts: 0, app_ids: [], play_pkgs: [], reject: null })
  const rows = [mk('alpha', 4), mk('bravo', 2), mk('charlie', 2), mk('delta', 1)]
  const r = pickTop(rows, new Map(), { n: 3, minPosts: 2 })
  assert.deepEqual([r.k, r.sample.map((j) => j.key)], [2, ['alpha', 'bravo', 'charlie']])
  assert.equal(pickTop(rows, new Map(), { n: 1, minPosts: 2 }).k, 3)
})

await t('워크플로 배선: 언급 루프가 --lookup --homepage --search 로 돌고 Search 로그·드라이런 결과를 올린다', () => {
  const wf = fs.readFileSync('.github/workflows/mention-loop-nightly.yml', 'utf8')
  assert.match(wf, /node scripts\/mention-loop\.mjs [^\n]*--lookup --homepage --search/)
  assert.match(wf, /node scripts\/mention-resolve-dryrun\.mjs/)
  assert.match(wf, /reports\/\*\/itunes-search-log\.jsonl/)
  assert.match(wf, /reports\/\*\/mention-resolve-dryrun\.json/)
  assert.match(wf, /^permissions:\r?\n {2}contents: read/m)
})

console.log(`mention-resolve selftest: ${pass} pass · 0 fail`)
