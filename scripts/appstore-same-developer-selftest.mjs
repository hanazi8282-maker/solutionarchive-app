#!/usr/bin/env node
// v71ad §5(e) 같은 개발사 앱 → 후보 생성기 입력 셀프테스트. 네트워크·DB 없음(가짜 fetch).
// 보는 것: 앵커 추출 · 후보 거름(자기 자신·장르·평점) · robots 재확인(루트 lookup 만 허용, 못 읽으면 0요청) ·
//          403/429/HTML → 즉시 중단 · 요청 상한 · 간격 · 경계면(실제 filterCandidates 에 넣어 통과·중복 거름).

import { filterCandidates, pickDaily } from '../lib/discovery/candidate-generator.ts'
import { LOOKUP_INTERVAL_MS, anchorsFrom, appLookupUrl, candidatesFrom, collectSameDeveloper, developerLookupUrl } from '../lib/review/appstore-same-developer.ts'
import { PRODUCT_TOKEN } from '../lib/review/runner.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

// 2026-10-17 실측 itunes.apple.com/robots.txt 의 * 그룹(요약 아님 — 해당 줄 그대로).
const ROBOTS = ['User-agent: *', 'Disallow: /WebObjects/*', 'Disallow: /search*', 'Disallow: /*/rss/*', 'Disallow: /*/lookup?', ''].join('\n')

const targets = [
  { source_key: 'appstore', product_ref: 'us:897446215', label: '3:us|canva' },
  { source_key: 'appstore', product_ref: 'gb:897446215', label: '3:gb|canva' }, // 같은 앱 다른 국가 → 앵커 1개
  { source_key: 'appstore', product_ref: 'kr:111', label: 'out-consumer:kr|x' }, // 영역 밖
  { source_key: 'googleplay', product_ref: 'kr:com.x', label: '1:kr|x' },
  { source_key: 'appstore', product_ref: 'kr:222', label: '1:kr|clova-note' },
]
const anchors = anchorsFrom(targets)
t('앵커: 앱 id 당 1개 · 영역 ①~⑤ · appstore 만', anchors.map((a) => `${a.country}:${a.appId}:${a.area}`), ['us:897446215:3', 'kr:222:1'])
t('URL: 루트 lookup(국가는 파라미터) — /<cc>/lookup? 꼴이 아니다', [appLookupUrl('1', 'kr'), developerLookupUrl(9, 'kr')], ['https://itunes.apple.com/lookup?id=1&country=kr', 'https://itunes.apple.com/lookup?id=9&entity=software&country=kr&limit=200'])

const devItems = [
  { wrapperType: 'artist', artistId: 897446218 },
  { wrapperType: 'software', trackId: 897446215, trackName: 'Canva AI Photo & Video Editor', primaryGenreName: 'Photo & Video', userRatingCount: 3575781 },
  { wrapperType: 'software', trackId: 6757455363, trackName: 'Canva Create', primaryGenreName: 'Business', userRatingCount: 400 },
  { wrapperType: 'software', trackId: 6458650335, trackName: 'Canva Configurator', primaryGenreName: 'Developer Tools', userRatingCount: 900 },
  { wrapperType: 'software', trackId: 7, trackName: 'Canva Tiny', primaryGenreName: 'Photo & Video', userRatingCount: 3 },
  { wrapperType: 'software', trackName: 'no id' },
]
{
  const r = candidatesFrom(anchors[0], 'Photo & Video', devItems)
  t('후보: 자기 자신 제외 · 업무 장르 Business 통과 · Developer Tools 제외 · 평점 3 제외 · 깨진 행 1', [r.candidates.map((c) => c.product_ref), r.skipped], [['us:6757455363'], { genre: 1, low_ratings: 1, malformed: 1 }])
  t('후보: Candidate 모양(similar_app · 라벨 영역 상속 · 기대 = 평점×5%)', [r.candidates[0].generator, r.candidates[0].source_key, r.candidates[0].label, r.candidates[0].expected_yield], ['similar_app', 'appstore', '3:us|canva-create', 20])
}

function fake(routes) {
  const log = { urls: [], slept: [] }
  return {
    log,
    io: {
      productToken: PRODUCT_TOKEN,
      async sleep(ms) { log.slept.push(ms) },
      async fetchText(url) {
        log.urls.push(url)
        for (const [re, res] of routes) if (re.test(url)) return typeof res === 'function' ? res(url) : res
        return { status: 404, body: '' }
      },
    },
  }
}
const ok = (o) => ({ status: 200, body: JSON.stringify(o) })
const appRes = (url) => ok({ resultCount: 1, results: [{ wrapperType: 'software', trackId: Number(new URL(url).searchParams.get('id')), artistId: 897446218, primaryGenreName: 'Photo & Video' }] })
const routes = [
  [/robots\.txt$/, { status: 200, body: ROBOTS }],
  [/entity=software/, ok({ resultCount: devItems.length, results: devItems })],
  [/lookup\?id=/, appRes],
]
{
  const f = fake(routes)
  const r = await collectSameDeveloper(anchors, f.io)
  t('실행: 앵커 2 × 2요청 = 4 · 중단 없음 · 간격 3번(첫 요청 제외)', [r.requests, r.stopped, f.log.slept], [4, null, [LOOKUP_INTERVAL_MS, LOOKUP_INTERVAL_MS, LOOKUP_INTERVAL_MS]])
  t('실행: 국가 경로 lookup·search 를 한 번도 부르지 않는다', f.log.urls.some((u) => /itunes\.apple\.com\/[a-z]{2}\/lookup|\/search/.test(u)), false)
  // 경계면: 실제 candidate-generator 필터에 넣는다 — appstore 소스는 robots disallowed + 소유자 예외(owner_2026-10-05).
  const sources = [{ key: 'appstore', enabled: true, robots_status: 'disallowed', tos_status: null, override: 'owner_2026-10-05' }]
  const fc = filterCandidates(r.candidates, { targets: [...targets, { source_key: 'appstore', product_ref: 'kr:6757455363' }], sources })
  t('경계면: filterCandidates — 새 앱 통과(kr 앵커의 개발사 앱 kr:897446215 포함) · 이미 등록된 kr:6757455363 은 duplicate', [fc.passed.map((c) => c.product_ref), fc.rejected], [['us:6757455363', 'kr:897446215'], { duplicate: 1 }])
  t('경계면: pickDaily 가 받는다', pickDaily(fc.passed).map((c) => c.product_ref), ['kr:897446215', 'us:6757455363'])
}
{
  const f = fake([[/robots\.txt$/, { status: 503, body: '' }]])
  const r = await collectSameDeveloper(anchors, f.io)
  t('robots 503 → 0요청(확인 불가는 허용 아님)', [r.requests, /확인 불가/.test(r.stopped)], [0, true])
  const g = fake([[/robots\.txt$/, { status: 200, body: 'User-agent: *\nDisallow: /lookup\n' }]])
  const r2 = await collectSameDeveloper(anchors, g.io)
  t('robots 가 /lookup 을 막으면 → 0요청', [r2.requests, /disallowed/.test(r2.stopped)], [0, true])
}
for (const [status, body, name] of [[429, '', '429'], [403, '', '403'], [200, '<html>maintenance</html>', '200 HTML']]) {
  const f = fake([[/robots\.txt$/, { status: 200, body: ROBOTS }], [/lookup/, { status, body }]])
  const r = await collectSameDeveloper(anchors, f.io)
  t(`${name} → 요청 1건 뒤 중단 · 후보 0`, [r.requests, r.stopped !== null, r.candidates.length], [1, true, 0])
}
{
  const many = Array.from({ length: 30 }, (_, i) => ({ country: 'us', appId: String(1000 + i), area: '1', label: '1:us|x' }))
  const r = await collectSameDeveloper(many, fake(routes).io, { maxRequests: 7 })
  t('요청 상한 7 → 앵커 3개(6요청)에서 멈춤', r.requests, 6)
}

console.log(`appstore-same-developer selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
