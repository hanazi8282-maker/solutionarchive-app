#!/usr/bin/env node
// Hacker News 어댑터 셀프테스트 — 실제 응답 픽스처로 검증한다. 네트워크 없음.
//
// 픽스처는 2026-09-10 에 hn.algolia.com 에서 실제로 받은 응답이다:
//   page1.json       — query=notion&tags=comment&hitsPerPage=50&page=0, 50건
//   page-empty.json  — 아무것도 안 걸리는 질의. HTTP 200 인데 hits 가 []
//   page-broken.json — 위 응답에서 10건만 남기고 본문 5건을 죽인 것
//                      (null 3 / '' 1 / 공백만 1)
//
// ⚠️ **가짜 어댑터를 쓰지 않는다.** 러너 통합 구간도 실제 hackernewsAdapter 를
//    넣고 돌린다. 부품 테스트를 통합의 근거로 쓰면 경계면 버그를 못 잡는다 —
//    이 리포에서 실제로 러너 테스트가 가짜 어댑터만 써서 버그 2건을 놓쳤다
//    (CLAUDE.md §7.1 사례 5번).

import fs from 'node:fs'
import {
  hackernewsAdapter,
  parseProductRef,
  htmlStrip,
  HITS_PER_PAGE,
  MAX_PAGE,
} from '../lib/review/adapters/hackernews.ts'
import { runCollection, STALE_STREAK_TO_STOP } from '../lib/review/runner.ts'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (Object.is(actual, expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const page1 = fs.readFileSync('fixtures/hackernews/page1.json', 'utf8')
const pageEmpty = fs.readFileSync('fixtures/hackernews/page-empty.json', 'utf8')
const pageBroken = fs.readFileSync('fixtures/hackernews/page-broken.json', 'utf8')

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'hackernews',
  productRef: 'q:notion',
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})

// ── product_ref 파싱 ──────────────────────────────────────────────
//
// 다나와 pcode·앱스토어 앱ID 와 달리 **질의 자체**가 대상이다. 검색해서
// 후보를 고르는 단계가 없다 — 사람이 정한 질의를 그대로 쓴다.
t('ref: q: 접두사를 벗긴다', parseProductRef('q:notion'), 'notion')
t('ref: 공백을 정리한다', parseProductRef('  q: notion  '), 'notion')
t('ref: 여러 단어 질의', parseProductRef('q:project management'), 'project management')
t('ref: 대문자 접두사도 받는다', parseProductRef('Q:notion'), 'notion')
t('ref: 접두사가 없으면 null', parseProductRef('notion'), null)
t('ref: 키워드가 비면 null', parseProductRef('q:'), null)
t('ref: 공백뿐이면 null', parseProductRef('q:   '), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: pcode 를 잘못 넣으면 null', parseProductRef('252495223'), null)

// ── nextRequest (AC-A2) ───────────────────────────────────────────
//
// ⚠️ `search` 가 아니라 `search_by_date` 다. 러너의 증분 종료가 시간 역순
//    정렬을 전제한다. 관련도순을 쓰면 조기 종료하거나 끝없이 훑는다.
t(
  'URL: 첫 요청은 page=0 · search_by_date',
  hackernewsAdapter.nextRequest(target()).url,
  'https://hn.algolia.com/api/v1/search_by_date?query=notion&tags=comment&hitsPerPage=50&page=0',
)
t('URL: cursor 1 이면 page=1', hackernewsAdapter.nextRequest(target({ cursor: '1' })).url.endsWith('&page=1'), true)
t('URL: 정렬은 시간순이어야 한다', hackernewsAdapter.nextRequest(target()).url.includes('/search_by_date?'), true)
t('URL: 관련도순 엔드포인트를 쓰지 않는다', hackernewsAdapter.nextRequest(target()).url.includes('/search?'), false)
t('URL: 댓글만 받는다', hackernewsAdapter.nextRequest(target()).url.includes('tags=comment'), true)
t(
  'URL: 질의를 URL 인코딩한다',
  hackernewsAdapter.nextRequest(target({ productRef: 'q:project management' })).url.includes('query=project%20management'),
  true,
)
t('URL: 잘못된 ref 면 요청하지 않는다', hackernewsAdapter.nextRequest(target({ productRef: 'notion' })), null)

// ⚠️ Algolia 공개 인덱스는 paginationLimitedTo=1000 이다. 넘겨 요청하면 400 이
//    온다. 애플 RSS 11페이지 사건과 같은 형태 — 정상적인 경계를 'failed' 로
//    기록하지 않으려면 어댑터가 먼저 멈춰야 한다(CLAUDE.md §7.2).
t(`URL: ${MAX_PAGE - 1}페이지까지는 간다`, hackernewsAdapter.nextRequest(target({ cursor: String(MAX_PAGE - 1) })) !== null, true)
t(`URL: ${MAX_PAGE}페이지(=${MAX_PAGE * HITS_PER_PAGE}건)부터는 멈춘다`, hackernewsAdapter.nextRequest(target({ cursor: String(MAX_PAGE) })), null)
t('URL: 상한을 한참 넘겨도 멈춘다', hackernewsAdapter.nextRequest(target({ cursor: '999' })), null)

// ── htmlStrip (순수) ──────────────────────────────────────────────
t('strip: 태그를 지운다', htmlStrip('<i>use</i>'), 'use')
t('strip: 수치 엔티티를 푼다', htmlStrip('I&#x27;m'), "I'm")
t('strip: 10진 엔티티를 푼다', htmlStrip('I&#39;m'), "I'm")
t('strip: 슬래시 엔티티', htmlStrip('https:&#x2F;&#x2F;a.com'), 'https://a.com')
t('strip: p 는 문단으로 끊는다', htmlStrip('끝<p>시작'), '끝\n\n시작')
t('strip: 링크 텍스트는 남는다', htmlStrip('<a href="http://x">보이는 글자</a>'), '보이는 글자')
// ⚠️ 태그를 먼저 지우고 엔티티를 나중에 푼다. 순서를 바꾸면 사람이 실제로 쓴
//    `&lt;div&gt;` 가 태그로 오인돼 삭제된다. 코드 이야기가 오가는 게시판이다.
t('strip: 사람이 쓴 <div> 는 살아남는다', htmlStrip('use &lt;div&gt; here'), 'use <div> here')
// ⚠️ &amp; 를 먼저 풀면 &amp;lt; 가 < 까지 이중 해제된다.
t('strip: 이중 해제하지 않는다', htmlStrip('&amp;lt;'), '&lt;')
t('strip: 앰퍼샌드', htmlStrip('A &amp; B'), 'A & B')

// ── parse: 실제 응답 (AC-A3) ──────────────────────────────────────
{
  const r = hackernewsAdapter.parse(page1, { productRef: 'q:notion', cursor: null })
  t('파싱: 댓글 50건', r.reviews.length, 50)
  t('파싱: 실패 0건', r.parseFailures, 0)

  const hits = JSON.parse(page1).hits
  // 이 항등식이 이 파서의 핵심 계약이다. 조용히 버리는 hit 이 있으면 깨진다.
  t('파싱: reviews + 실패 = hits', r.reviews.length + r.parseFailures, hits.length)

  const first = r.reviews[0]
  t('리뷰: externalId 는 objectID', first.externalId, hits[0].objectID)
  t('리뷰: 작성자는 author', first.authorMasked, hits[0].author)
  t('리뷰: 날짜는 YYYY-MM-DD', first.writtenAt, hits[0].created_at.slice(0, 10))
  t('리뷰: HN 에는 별점이 없다', first.rating, null)
  t('리뷰: HN 에는 판매처가 없다', first.seller, null)
  t('리뷰: 본문은 [HN: 제목] 으로 시작', first.text.startsWith(`[HN: ${hits[0].story_title}] `), true)

  ok('리뷰: 전부 externalId 있음', r.reviews.every((x) => x.externalId))
  ok('리뷰: 전부 본문 있음', r.reviews.every((x) => x.text.length > 0))
  ok('리뷰: 전부 YYYY-MM-DD', r.reviews.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.writtenAt)))
  ok('리뷰: 전부 [HN: 으로 시작', r.reviews.every((x) => x.text.startsWith('[HN: ')))
  // 평문이어야 한다 — 태그가 남으면 분석 단계가 마크업을 의견으로 읽는다.
  ok('리뷰: 본문에 HTML 태그가 남지 않는다', r.reviews.every((x) => !/<[a-z/][^>]*>/i.test(x.text)))
  ok('리뷰: 본문에 엔티티가 남지 않는다', r.reviews.every((x) => !/&#x[0-9a-f]+;|&quot;|&lt;br&gt;/i.test(x.text)))

  t('커서: 첫 페이지 뒤 nextCursor 는 "1"', r.nextCursor, '1')
}

// ── 커서 전진 — 다나와 사고의 재발 방지 ───────────────────────────
//
// ⚠️ parse 가 ctx.cursor 를 그대로 돌려주면 nextRequest 가 같은 페이지를
//    영원히 다시 요청한다. 다나와에서 실제로 나서 페이지 전진이 1,2,2,2 가
//    됐고, 증분 종료와 페이지 상한이 폭주를 막아준 탓에 로그에는 "정상 종료"로
//    찍혔다(§7.2). `nextCursor !== null` 만 보면 이 버그를 못 잡는다 — 값을 본다.
{
  const seen = []
  let cursor = null
  for (let i = 0; i < 4; i++) {
    const req = hackernewsAdapter.nextRequest(target({ cursor }))
    seen.push(Number(new URL(req.url).searchParams.get('page')))
    cursor = hackernewsAdapter.parse(page1, { productRef: 'q:notion', cursor }).nextCursor
  }
  t('커서: 페이지가 0,1,2,3 으로 전진한다', seen.join(','), '0,1,2,3')
}
{
  // 마지막 페이지(nbPages=20)를 읽었으면 그 다음은 없다.
  const r = hackernewsAdapter.parse(page1, { productRef: 'q:notion', cursor: String(MAX_PAGE - 1) })
  t(`커서: ${MAX_PAGE - 1}페이지를 읽었으면 끝이다`, r.nextCursor, null)
}

// ── 빈 결과 vs 구조 파괴 (AC-A4) ──────────────────────────────────
//
// "0건"과 "못 읽었다"는 다른 사건이다. 합치면 건강도가 구조 변경을 못 본다(§7.1).
{
  const r = hackernewsAdapter.parse(pageEmpty, { productRef: 'q:x', cursor: null })
  t('빈 결과: 리뷰 0건', r.reviews.length, 0)
  t('빈 결과: nextCursor null', r.nextCursor, null)
  t('빈 결과: 파싱 실패가 아니다', r.parseFailures, 0)
}
{
  // 에러 HTML 페이지가 오는 경우 — 200 인데 JSON 이 아니다.
  const html = '<!doctype html><html><title>404 Not Found</title></html>'
  const r = hackernewsAdapter.parse(html, { productRef: 'q:x', cursor: null })
  t('구조 파괴: 실패 1건', r.parseFailures, 1)
  t('구조 파괴: 리뷰 0건', r.reviews.length, 0)
  t('구조 파괴: nextCursor null', r.nextCursor, null)
}
t('구조 파괴: hits 키가 없으면 실패 1건', hackernewsAdapter.parse('{"x":1}', { productRef: 'q:x', cursor: null }).parseFailures, 1)
t('구조 파괴: hits 가 배열이 아니면 실패 1건', hackernewsAdapter.parse('{"hits":{}}', { productRef: 'q:x', cursor: null }).parseFailures, 1)

// ── 본문 없는 hit 은 조용히 버리지 않는다 (AC-A5) ─────────────────
{
  const r = hackernewsAdapter.parse(pageBroken, { productRef: 'q:notion', cursor: null })
  const hits = JSON.parse(pageBroken).hits
  t('깨진 페이지: 정상 5건', r.reviews.length, 5)
  t('깨진 페이지: 실패 5건', r.parseFailures, 5)
  t('깨진 페이지: reviews + 실패 = hits', r.reviews.length + r.parseFailures, hits.length)
  ok('깨진 페이지: 남은 리뷰는 전부 본문이 있다', r.reviews.every((x) => x.text.replace(/^\[HN:[^\]]*\]\s*/, '').length > 0))
}
{
  // objectID 가 없으면 지문이 폴백으로 새므로 실패로 센다.
  const doc = JSON.parse(page1)
  doc.hits = doc.hits.slice(0, 3)
  delete doc.hits[1].objectID
  const r = hackernewsAdapter.parse(JSON.stringify(doc), { productRef: 'q:x', cursor: null })
  t('objectID 없는 hit 은 파싱 실패', r.parseFailures, 1)
  t('objectID 없는 hit 은 리뷰에 안 들어간다', r.reviews.length, 2)
}
{
  // 태그만 있고 알맹이가 없는 본문도 본문 없음이다.
  const doc = JSON.parse(page1)
  doc.hits = doc.hits.slice(0, 2)
  doc.hits[0].comment_text = '<p><i></i>'
  const r = hackernewsAdapter.parse(JSON.stringify(doc), { productRef: 'q:x', cursor: null })
  t('태그뿐인 본문은 파싱 실패', r.parseFailures, 1)
}

t('어댑터 키', hackernewsAdapter.key, 'hackernews')
t('quotaMarkers 미선언 — 403/429 는 차단으로 본다', hackernewsAdapter.quotaMarkers, undefined)

// ══ 러너 통합 — 실제 어댑터를 넣고 돌린다 (AC-A9) ══════════════════
//
// 여기가 이 파일의 핵심이다. 위의 파서 단위 테스트가 전부 통과해도 러너와
// 붙였을 때 페이지가 안 넘어가는 버그는 여기서만 잡힌다.
function makeHarness(pagesByNumber) {
  const log = { fetched: [], inputs: [] }
  const seen = new Map()
  let clock = 1_000_000

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      // ⚠️ hn.algolia.com/robots.txt 는 실제로 404 다(실측 2026-09-10).
      //    RFC 9309 §2.3.1.3 = 규칙 없음 = 허용. 러너도 4xx 를 허용으로 읽는다.
      //    이 경로를 테스트에서 재현해 둔다 — 여기가 막히면 수집이 통째로 0건이다.
      if (url.endsWith('/robots.txt')) return { status: 404, body: 'Not Found' }
      const page = new URL(url).searchParams.get('page')
      return { status: 200, body: pagesByNumber[page] ?? pagesByNumber.default ?? '' }
    },
    store: {
      async loadSource() {
        return {
          key: 'hackernews',
          enabled: true,
          minIntervalMs: 2000,
          dailyRequestCap: 200,
          requestsToday: 0,
        }
      },
      async listDueTargets() {
        return [target()]
      },
      async saveTargetProgress() {},
      async recordFingerprint(fp) {
        const prev = seen.get(fp.identityKey)
        if (prev === undefined) {
          seen.set(fp.identityKey, fp.contentHash)
          return 'new'
        }
        return prev === fp.contentHash ? 'duplicate' : 'revised'
      },
      async appendInput(i) {
        log.inputs.push(i)
        return `in${log.inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }
  return { ports, log, seen }
}

{
  // 2페이지를 서로 다른 내용으로 준다. page1 을 두 번 주면 전부 중복이라
  // "전진했는지"와 "중복이라 0건인지"가 구별되지 않는다.
  const doc2 = JSON.parse(page1)
  doc2.hits = doc2.hits.map((h, i) => ({ ...h, objectID: `p2-${i}`, comment_text: `두번째 페이지 댓글 ${i}` }))
  const h = makeHarness({ 0: page1, 1: JSON.stringify(doc2), 2: pageEmpty })

  const res = await runCollection(hackernewsAdapter, { dryRun: false, targetLimit: 1 }, h.ports)

  const pages = h.log.fetched.filter((u) => !u.endsWith('/robots.txt'))
  t('러너: robots 를 한 번만 묻는다', h.log.fetched.filter((u) => u.endsWith('/robots.txt')).length, 1)
  ok('러너: 요청이 2건 이상', pages.length >= 2)
  // ⚠️ 같은 URL 이 두 번 나오면 커서가 제자리인 것이다 — 다나와 사고.
  t('러너: 같은 URL 을 두 번 요청하지 않는다', new Set(pages).size, pages.length)
  t('러너: page 파라미터가 0,1,2 로 전진', pages.map((u) => new URL(u).searchParams.get('page')).join(','), '0,1,2')
  t('러너: robots 로 막힌 요청 0건', res.robotsSkips, 0)
  t('러너: 파싱 실패 0건', res.stats.parseFailures, 0)
  t('러너: 신규 100건(2페이지 × 50)', res.stats.newReviews, 100)
  t('러너: analysis_inputs 100건', h.log.inputs.length, 100)
  ok('러너: 적재 본문이 [HN: 으로 시작', h.log.inputs.every((i) => i.text.startsWith('[HN: ')))
  ok('러너: source_key 가 hackernews', h.log.inputs.every((i) => i.sourceKey === 'hackernews'))

  // 같은 픽스처로 다시 돌리면 신규 0건이어야 한다(지문 중복 판정).
  const h2 = makeHarness({ 0: page1, 1: JSON.stringify(doc2), 2: pageEmpty })
  h2.seen = h.seen
  h2.ports.store.recordFingerprint = h.ports.store.recordFingerprint
  const res2 = await runCollection(hackernewsAdapter, { dryRun: false, targetLimit: 1 }, h2.ports)
  t('러너: 재실행하면 신규 0건', res2.stats.newReviews, 0)
  t('러너: 재실행해도 적재 0건', h2.log.inputs.length, 0)
}

{
  // 지문이 seq(objectID) 로 잡히는지 — composite 로 새면 같은 사람이 같은 날
  // 쓴 두 댓글 중 하나를 잃는다.
  const h = makeHarness({ 0: page1, 1: pageEmpty })
  const kinds = []
  const orig = h.ports.store.recordFingerprint
  h.ports.store.recordFingerprint = async (fp) => {
    kinds.push(fp.kind)
    return orig(fp)
  }
  await runCollection(hackernewsAdapter, { dryRun: false, targetLimit: 1 }, h.ports)
  ok('지문: 전부 seq (폴백 없음)', kinds.length > 0 && kinds.every((k) => k === 'seq'))
}

{
  // robots.txt 를 못 읽으면(5xx) 요청하지 않는다 — 404 와 다른 사건이다(§7.1).
  const h = makeHarness({ 0: page1 })
  h.ports.fetchText = async (url) => {
    if (url.endsWith('/robots.txt')) return { status: 503, body: '' }
    throw new Error('robots 를 못 읽었는데 요청을 보냈다')
  }
  const res = await runCollection(hackernewsAdapter, { dryRun: false, targetLimit: 1 }, h.ports)
  t('robots 5xx: 요청하지 않는다', res.requests, 0)
  t('robots 5xx: robotsSkips 1건', res.robotsSkips, 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('HN 어댑터가 틀렸다. 이 상태로 수집하면 빈 표 위에서 분석이 돈다.')
  process.exitCode = 1
} else {
  console.log(`HN 어댑터 정상 — 커서 전진·종료 신호·구조 변경 감지·러너 통합(증분 종료 임계 ${STALE_STREAK_TO_STOP}) 확인.`)
}
