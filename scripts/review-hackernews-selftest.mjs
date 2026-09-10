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
  isRelevant,
  hnThreadUrl,
  extractStoryIdFromText,
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
//
// ⚠️ page1.json 은 실제 `query=notion` 응답이다. Algolia 의 느슨한 매칭 때문에
//    50건 중 "notion" 이 제목·본문 어디에도 없는 잡음이 42건 섞여 있다.
//    관련도 필터(Task 1)가 그 42건을 걷어낸다 — 이건 파서 버그가 아니라
//    소스가 무관한 결과를 준 것이고, filtered 로 따로 센다.
{
  const hits = JSON.parse(page1).hits
  const relevant = hits.filter((h) => isRelevant('notion', h))
  t('픽스처 전제: 50건 중 관련 8건', relevant.length, 8)

  const r = hackernewsAdapter.parse(page1, { productRef: 'q:notion', cursor: null })
  t('파싱: 관련 댓글만 남는다', r.reviews.length, relevant.length)
  t('파싱: 실패 0건', r.parseFailures, 0)
  t('파싱: 관련없음 42건 제외', r.filtered, hits.length - relevant.length)

  // 이 항등식이 이 파서의 핵심 계약이다. 조용히 버리는 hit 이 있으면 깨진다.
  // 이제 세 갈래다: 읽힘 / 못 읽음 / 관련없음. 셋을 더하면 hits 다.
  t('파싱: reviews + 실패 + 관련없음 = hits', r.reviews.length + r.parseFailures + r.filtered, hits.length)

  const first = r.reviews[0]
  t('리뷰: externalId 는 objectID', first.externalId, relevant[0].objectID)
  t('리뷰: 작성자는 author', first.authorMasked, relevant[0].author)
  t('리뷰: 날짜는 YYYY-MM-DD', first.writtenAt, relevant[0].created_at.slice(0, 10))
  t('리뷰: HN 에는 별점이 없다', first.rating, null)
  t('리뷰: HN 에는 판매처가 없다', first.seller, null)
  t('리뷰: storyId 는 story_id(문자열)', first.storyId, String(relevant[0].story_id))
  t(
    '리뷰: 본문 머리에 제목 + 스레드 URL',
    first.text.startsWith(`[HN: ${relevant[0].story_title} · news.ycombinator.com/item?id=${relevant[0].story_id}] `),
    true,
  )
  ok('리뷰: 전부 스레드 URL 을 담는다', r.reviews.every((x) => /news\.ycombinator\.com\/item\?id=\d+/.test(x.text)))

  ok('리뷰: 전부 externalId 있음', r.reviews.every((x) => x.externalId))
  ok('리뷰: 전부 본문 있음', r.reviews.every((x) => x.text.length > 0))
  ok('리뷰: 전부 YYYY-MM-DD', r.reviews.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.writtenAt)))
  ok('리뷰: 전부 [HN: 으로 시작', r.reviews.every((x) => x.text.startsWith('[HN: ')))
  // 관련도 필터가 걸렸으면 남은 건 전부 "notion" 을 담고 있어야 한다.
  ok(
    '리뷰: 남은 건 전부 질의어를 담고 있다',
    r.reviews.every((x) => x.text.toLowerCase().includes('notion')),
  )
  // 평문이어야 한다 — 태그가 남으면 분석 단계가 마크업을 의견으로 읽는다.
  ok('리뷰: 본문에 HTML 태그가 남지 않는다', r.reviews.every((x) => !/<[a-z/][^>]*>/i.test(x.text)))
  ok('리뷰: 본문에 엔티티가 남지 않는다', r.reviews.every((x) => !/&#x[0-9a-f]+;|&quot;|&lt;br&gt;/i.test(x.text)))

  // ⚠️ 커서는 관련도 필터와 무관하게 전진해야 한다. 한 페이지가 전부
  //    잡음이어도 다음 페이지를 읽어야 관련 결과에 닿는다.
  t('커서: 첫 페이지 뒤 nextCursor 는 "1"', r.nextCursor, '1')
}

// ── 관련도 필터 (Task 1) ─────────────────────────────────────────
//
// search_by_date 는 시간 역순이라 러너 증분 종료가 성립하지만 관련도 매칭이
// 느슨하다. search 로 바꾸면 정렬이 깨져 러너(다나와·appstore 공유)가
// 오작동한다 — 그래서 엔드포인트는 그대로 두고 parse 에서 거른다.
{
  const hit = (over = {}) => ({
    objectID: 'x1',
    comment_text: 'nothing to see here',
    story_title: 'Some unrelated thread',
    created_at: '2026-09-10T00:00:00Z',
    author: 'a',
    ...over,
  })
  t('필터: 본문에 질의어가 있으면 관련', isRelevant('notion', hit({ comment_text: 'I moved off Notion last year' })), true)
  t('필터: 제목에만 있어도 관련', isRelevant('notion', hit({ story_title: 'Ask HN: Notion alternatives?' })), true)
  t('필터: 어디에도 없으면 무관', isRelevant('notion', hit()), false)
  t('필터: 대소문자 무시', isRelevant('NOTION', hit({ comment_text: 'switched to notion' })), true)
  t('필터: 여러 단어는 전부 있어야 관련', isRelevant('notion app', hit({ comment_text: 'the notion app is slow' })), true)
  t('필터: 여러 단어 중 하나만 있으면 무관', isRelevant('notion app', hit({ comment_text: 'I like notion' })), false)
  t('필터: 2글자 이상 토큰이 없으면 통짜 문자열 매칭', isRelevant('x', hit({ comment_text: 'the x factor' })), true)
  t('필터: 통짜 문자열도 없으면 무관', isRelevant('x', hit({ comment_text: 'nothing here', story_title: 'none' })), false)
  t('필터: 질의어를 못 구하면 거르지 않는다(전부 통과)', isRelevant('', hit()), true)
  // 부분문자열이라 apple 이 app 에도 걸린다 — 관련 쪽으로 느슨한 건 의도한 것.
  t('필터: 부분문자열 매칭(app ⊂ apple)', isRelevant('app', hit({ comment_text: 'I ate an apple' })), true)

  // parse 레벨: productRef 에서 질의어를 못 뽑으면 필터가 통째로 꺼진다.
  const noFilter = hackernewsAdapter.parse(page1, { productRef: '', cursor: null })
  t('필터: q: 접두사 없는 ref 면 필터 꺼짐 — 50건 전부', noFilter.reviews.length, 50)
  t('필터: 꺼졌을 때 filtered 0', noFilter.filtered, 0)
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
//
// ⚠️ 이 블록은 **파싱 실패 집계**만 본다. 관련도 필터가 섞이면 "본문이 없어서
//    버렸는지 / 무관해서 버렸는지" 가 흐려진다 — productRef 를 q: 없이 넘겨
//    필터를 꺼 둔다(parseProductRef 가 null → 필터 skip).
{
  const r = hackernewsAdapter.parse(pageBroken, { productRef: '', cursor: null })
  const hits = JSON.parse(pageBroken).hits
  t('깨진 페이지: 정상 5건', r.reviews.length, 5)
  t('깨진 페이지: 실패 5건', r.parseFailures, 5)
  t('깨진 페이지: 관련없음 0건 (필터 꺼짐)', r.filtered, 0)
  t('깨진 페이지: reviews + 실패 = hits', r.reviews.length + r.parseFailures, hits.length)
  ok('깨진 페이지: 남은 리뷰는 전부 본문이 있다', r.reviews.every((x) => x.text.replace(/^\[HN:[^\]]*\]\s*/, '').length > 0))
}
{
  // objectID 가 없으면 지문이 폴백으로 새므로 실패로 센다.
  const doc = JSON.parse(page1)
  doc.hits = doc.hits.slice(0, 3)
  delete doc.hits[1].objectID
  const r = hackernewsAdapter.parse(JSON.stringify(doc), { productRef: '', cursor: null })
  t('objectID 없는 hit 은 파싱 실패', r.parseFailures, 1)
  t('objectID 없는 hit 은 리뷰에 안 들어간다', r.reviews.length, 2)
}
{
  // 태그만 있고 알맹이가 없는 본문도 본문 없음이다.
  const doc = JSON.parse(page1)
  doc.hits = doc.hits.slice(0, 2)
  doc.hits[0].comment_text = '<p><i></i>'
  const r = hackernewsAdapter.parse(JSON.stringify(doc), { productRef: '', cursor: null })
  t('태그뿐인 본문은 파싱 실패', r.parseFailures, 1)
}

// ── 스레드 URL 심기 / 도로 뽑기 (Task 2 enrich 의 배치 키) ────────
t('threadUrl: story_id 로 HN 스레드 URL', hnThreadUrl('49624394'), 'news.ycombinator.com/item?id=49624394')
t('extract: 본문에서 story_id 를 뽑는다', extractStoryIdFromText('[HN: X · news.ycombinator.com/item?id=42] 본문'), '42')
t('extract: URL 이 없으면 null(예전 형식)', extractStoryIdFromText('[HN: X] 본문'), null)
t('extract: 빈 문자열도 null', extractStoryIdFromText(''), null)
{
  // story_id 가 없는 hit(구조 변경 등)은 예전 형식으로 떨어진다 — 깨지지 않는다.
  const doc = JSON.parse(page1)
  doc.hits = doc.hits.slice(0, 1)
  delete doc.hits[0].story_id
  const r = hackernewsAdapter.parse(JSON.stringify(doc), { productRef: '', cursor: null })
  t('story_id 없음: 리뷰는 나온다', r.reviews.length, 1)
  t('story_id 없음: storyId null', r.reviews[0].storyId, null)
  t('story_id 없음: 예전 형식 [HN: 제목]', r.reviews[0].text.startsWith(`[HN: ${doc.hits[0].story_title}] `), true)
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
  //
  // ⚠️ 두 페이지 다 질의어("notion")를 심어 관련도 필터를 통과시킨다. 이 블록은
  //    커서 전진·중복 판정을 보는 것이지 필터를 보는 게 아니다. 필터는 아래
  //    전용 블록에서 본다.
  const relevantize = (raw, tag) => {
    const d = JSON.parse(raw)
    d.hits = d.hits.map((h, i) => ({
      ...h,
      objectID: `${tag}-${i}`,
      comment_text: `${tag} 댓글 ${i} — notion 이야기`,
    }))
    return JSON.stringify(d)
  }
  const doc1 = relevantize(page1, 'p1')
  const doc2 = relevantize(page1, 'p2')
  const h = makeHarness({ 0: doc1, 1: doc2, 2: pageEmpty })

  const res = await runCollection(hackernewsAdapter, { dryRun: false, targetLimit: 1 }, h.ports)

  const pages = h.log.fetched.filter((u) => !u.endsWith('/robots.txt'))
  t('러너: robots 를 한 번만 묻는다', h.log.fetched.filter((u) => u.endsWith('/robots.txt')).length, 1)
  ok('러너: 요청이 2건 이상', pages.length >= 2)
  // ⚠️ 같은 URL 이 두 번 나오면 커서가 제자리인 것이다 — 다나와 사고.
  t('러너: 같은 URL 을 두 번 요청하지 않는다', new Set(pages).size, pages.length)
  t('러너: page 파라미터가 0,1,2 로 전진', pages.map((u) => new URL(u).searchParams.get('page')).join(','), '0,1,2')
  t('러너: robots 로 막힌 요청 0건', res.robotsSkips, 0)
  t('러너: 파싱 실패 0건', res.stats.parseFailures, 0)
  t('러너: 관련없음 0건 (두 페이지 다 질의어 포함)', res.stats.relevanceFiltered, 0)
  t('러너: 신규 100건(2페이지 × 50)', res.stats.newReviews, 100)
  t('러너: analysis_inputs 100건', h.log.inputs.length, 100)
  ok('러너: 적재 본문이 [HN: 으로 시작', h.log.inputs.every((i) => i.text.startsWith('[HN: ')))
  ok('러너: source_key 가 hackernews', h.log.inputs.every((i) => i.sourceKey === 'hackernews'))

  // 같은 픽스처로 다시 돌리면 신규 0건이어야 한다(지문 중복 판정).
  const h2 = makeHarness({ 0: doc1, 1: doc2, 2: pageEmpty })
  h2.seen = h.seen
  h2.ports.store.recordFingerprint = h.ports.store.recordFingerprint
  const res2 = await runCollection(hackernewsAdapter, { dryRun: false, targetLimit: 1 }, h2.ports)
  t('러너: 재실행하면 신규 0건', res2.stats.newReviews, 0)
  t('러너: 재실행해도 적재 0건', h2.log.inputs.length, 0)
}

{
  // 러너 통합: 관련도 필터가 실제로 걸린다. 한 페이지에 관련 20 / 무관 30 을
  // 섞어 주면 신규는 20, relevanceFiltered 는 30 이어야 한다. 무관 30건은
  // parseFailures 로 새면 안 된다(건강도가 broken 을 띄운다).
  const d = JSON.parse(page1)
  d.hits = d.hits.slice(0, 50).map((h, i) => ({
    ...h,
    objectID: `mix-${i}`,
    comment_text: i < 20 ? `notion 관련 댓글 ${i}` : `전혀 무관한 댓글 ${i}`,
    story_title: 'unrelated',
  }))
  const h = makeHarness({ 0: JSON.stringify(d), 1: pageEmpty })
  const res = await runCollection(hackernewsAdapter, { dryRun: false, targetLimit: 1 }, h.ports)
  t('러너 필터: 신규는 관련 20건만', res.stats.newReviews, 20)
  t('러너 필터: relevanceFiltered 30건', res.stats.relevanceFiltered, 30)
  t('러너 필터: parseFailures 0 (무관은 실패가 아니다)', res.stats.parseFailures, 0)
  t('러너 필터: 적재도 20건', h.log.inputs.length, 20)
  t('러너 필터: health 는 broken 이 아니다', res.health.health === 'broken', false)
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
