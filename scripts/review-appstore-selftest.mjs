#!/usr/bin/env node
// App Store RSS 어댑터 셀프테스트 — 실제 응답 픽스처로 검증한다. 네트워크 없음.
//
// 픽스처는 2026-09-02 에 실제로 받은 응답이다(fixtures/appstore/).
//   page1.json      — Slack(kr, id=1459969523) 1페이지, 리뷰 35건
//   page-empty.json — 그 다음 페이지. HTTP 200 인데 feed.entry 가 없다
//
// ⚠️ 다나와에서 잡힌 두 버그를 같은 형태로 막는다:
//    1) 커서 비대칭 — nextRequest 는 cursor+1 인데 parse 가 cursor 를 그대로
//       돌려줘 2페이지 이후를 영영 못 읽었다. 값을 검사한다(null 여부가 아니라)
//    2) 제목만 읽고 정상 보고 — 본문 컨테이너가 사라져도 통과했다.
//       본문·리뷰ID 가 없으면 파싱 실패로 세는지 검사한다

import fs from 'node:fs'
import { appstoreAdapter, parseProductRef, MAX_PAGE } from '../lib/review/adapters/appstore.ts'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (Object.is(actual, expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}

const page1 = fs.readFileSync('fixtures/appstore/page1.json', 'utf8')
const pageEmpty = fs.readFileSync('fixtures/appstore/page-empty.json', 'utf8')

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'appstore',
  productRef: 'kr:1459969523',
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})

// ── product_ref 파싱 ──────────────────────────────────────────────
t('ref: 국가:앱ID', JSON.stringify(parseProductRef('kr:1459969523')), '{"country":"kr","appId":"1459969523"}')
t('ref: 국가 생략은 kr', JSON.stringify(parseProductRef('1459969523')), '{"country":"kr","appId":"1459969523"}')
t('ref: 대문자 국가는 소문자로', parseProductRef('US:123').country, 'us')
t('ref: 공백 허용', parseProductRef(' kr : 123 ').appId, '123')
t('ref: 앱ID 가 숫자가 아니면 null', parseProductRef('kr:abc'), null)
t('ref: URL 을 넣으면 null', parseProductRef('https://apps.apple.com/kr/app/id123'), null)
t('ref: 국가코드가 2자가 아니면 null', parseProductRef('kor:123'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)

// ── nextRequest ───────────────────────────────────────────────────
t(
  'URL: 첫 요청은 page=1',
  appstoreAdapter.nextRequest(target()).url,
  'https://itunes.apple.com/kr/rss/customerreviews/id=1459969523/sortBy=mostRecent/page=1/json',
)
t('URL: cursor 1 이면 page=2', appstoreAdapter.nextRequest(target({ cursor: '1' })).url.includes('/page=2/'), true)
t('URL: 국가가 반영된다', appstoreAdapter.nextRequest(target({ productRef: 'us:99' })).url.includes('/us/rss/'), true)
t('URL: 잘못된 ref 면 요청하지 않는다', appstoreAdapter.nextRequest(target({ productRef: 'bad' })), null)

// ⚠️ 애플은 11페이지부터 HTTP 400 이다(실측). 러너 상한(20)보다 낮으므로
//    어댑터가 먼저 멈춰야 한다. 안 그러면 정상적인 경계가 'failed' 로 찍힌다.
t(`URL: ${MAX_PAGE}페이지까지는 간다`, appstoreAdapter.nextRequest(target({ cursor: String(MAX_PAGE - 1) })) !== null, true)
t(`URL: ${MAX_PAGE}페이지를 넘으면 멈춘다`, appstoreAdapter.nextRequest(target({ cursor: String(MAX_PAGE) })), null)

// ── parse: 실제 응답 ──────────────────────────────────────────────
{
  const r = appstoreAdapter.parse(page1, { productRef: 'kr:1459969523', cursor: null })
  t('파싱: 리뷰 35건', r.reviews.length, 35)
  t('파싱: 실패 0건', r.parseFailures, 0)

  const first = r.reviews[0]
  t('리뷰: externalId 가 있다(지문 폴백 방지)', first.externalId, '14482290645')
  t('리뷰: 평점 0~5', first.rating, 1)
  t('리뷰: 날짜는 YYYY-MM-DD', first.writtenAt, '2026-08-28')
  t('리뷰: 작성자', first.authorMasked, 'Solidhoon')
  t('리뷰: 판매처 개념이 없다', first.seller, null)
  t('리뷰: 본문에 제목이 붙는다', first.text.startsWith('[Warning]'), true)
  t('리뷰: 본문에 앱 버전이 붙는다', first.text.includes('(v6.53.1)'), true)
  t('리뷰: 본문이 실려 있다', first.text.includes('payment process'), true)

  // 모든 리뷰가 필수 필드를 갖췄는지 — 하나라도 비면 지문이 폴백으로 샌다
  t('리뷰: 전부 externalId 있음', r.reviews.every((x) => x.externalId), true)
  t('리뷰: 전부 본문 있음', r.reviews.every((x) => x.text.length > 0), true)
  t('리뷰: 평점은 전부 0~5 또는 null', r.reviews.every((x) => x.rating === null || (x.rating >= 0 && x.rating <= 5)), true)
}

// ── 커서 대칭성 — 다나와 버그 1의 재발 방지 ───────────────────────
//
// parse 는 **방금 읽은 페이지**를 돌려줘야 하고, nextRequest 는 거기에 +1 해야
// 한다. 비대칭이면 페이지 전진이 1,2,2,2… 가 되어 2페이지 이후를 영영 못 읽는다.
// 값을 검사한다 — `nextCursor !== null` 만 보면 이 버그를 못 잡는다.
{
  const r1 = appstoreAdapter.parse(page1, { productRef: 'kr:1', cursor: null })
  t('커서: 첫 페이지 뒤 nextCursor 는 "1"', r1.nextCursor, '1')

  const seen = []
  let cursor = null
  for (let i = 0; i < 4; i++) {
    const req = appstoreAdapter.nextRequest(target({ cursor }))
    seen.push(Number(new URL(req.url).pathname.match(/page=(\d+)/)[1]))
    cursor = appstoreAdapter.parse(page1, { productRef: 'kr:1', cursor }).nextCursor
  }
  t('커서: 페이지가 1,2,3,4 로 전진한다', seen.join(','), '1,2,3,4')
}
{
  const r = appstoreAdapter.parse(page1, { productRef: 'kr:1', cursor: String(MAX_PAGE) })
  t(`커서: ${MAX_PAGE}페이지를 읽었으면 끝이다`, r.nextCursor, null)
}

// ── 종료 신호 — feed.entry 부재 ───────────────────────────────────
//
// `link[rel=last]` 를 쓰지 않는 이유: 실측에서 entry 35건짜리 1페이지가
// 자기를 last 라고 하면서 동시에 next 로 2페이지를 가리켰다. 서로 모순이다.
{
  const r = appstoreAdapter.parse(pageEmpty, { productRef: 'kr:1', cursor: '1' })
  t('종료: entry 없으면 리뷰 0건', r.reviews.length, 0)
  t('종료: entry 없으면 nextCursor null', r.nextCursor, null)
  t('종료: entry 없는 것은 파싱 실패가 아니다', r.parseFailures, 0)
}

// ── 구조가 바뀌면 0건이 아니라 실패로 센다 ────────────────────────
//
// "0건 파싱"과 "항목은 보이는데 0건"은 다른 사건이다. 합치면 건강도 판정이
// 구조 변경을 못 본다(§7.1).
t('깨진 JSON 은 실패 1건', appstoreAdapter.parse('not json', { productRef: 'k', cursor: null }).parseFailures, 1)
t('깨진 JSON 은 리뷰 0건', appstoreAdapter.parse('not json', { productRef: 'k', cursor: null }).reviews.length, 0)
t('feed 없으면 실패 1건', appstoreAdapter.parse('{"x":1}', { productRef: 'k', cursor: null }).parseFailures, 1)

{
  // 본문이 사라진 엔트리 — 제목만 읽고 통과하면 안 된다(다나와 버그 2)
  const doc = JSON.parse(page1)
  doc.feed.entry = doc.feed.entry.slice(0, 3)
  delete doc.feed.entry[1].content
  const r = appstoreAdapter.parse(JSON.stringify(doc), { productRef: 'k', cursor: null })
  t('본문 없는 엔트리는 파싱 실패로 센다', r.parseFailures, 1)
  t('본문 없는 엔트리는 리뷰에 안 들어간다', r.reviews.length, 2)
}
{
  const doc = JSON.parse(page1)
  doc.feed.entry = doc.feed.entry.slice(0, 2)
  delete doc.feed.entry[0].id
  const r = appstoreAdapter.parse(JSON.stringify(doc), { productRef: 'k', cursor: null })
  t('리뷰ID 없는 엔트리는 파싱 실패로 센다', r.parseFailures, 1)
}

// ── 리뷰가 1건일 때 배열이 아닐 수 있다 ───────────────────────────
{
  const doc = JSON.parse(page1)
  doc.feed.entry = doc.feed.entry[0] // 배열이 아니라 객체
  const r = appstoreAdapter.parse(JSON.stringify(doc), { productRef: 'k', cursor: null })
  t('단일 엔트리가 객체로 와도 읽는다', r.reviews.length, 1)
}

// ── 쿼터 표지를 선언하지 않는다 ───────────────────────────────────
// 애플 RSS 는 쿼터 개념이 없다. 403 이 오면 그건 진짜 차단이다.
t('quotaMarkers 미선언', appstoreAdapter.quotaMarkers, undefined)
t('어댑터 키', appstoreAdapter.key, 'appstore')

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('App Store 어댑터가 틀렸다. 이 상태로 수집하면 빈 표 위에서 분석이 돈다.')
  process.exitCode = 1
} else {
  console.log('App Store 어댑터 정상 — 커서 대칭·종료 신호·구조 변경 감지 확인.')
}
