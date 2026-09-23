#!/usr/bin/env node
// OKKY 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-18 에 실제로 받은 okky.kr 글에서 ld+json 스크립트 태그를
// **원문 그대로** 꺼내 최소 셸에 끼운 것이다(값을 손으로 고친 것은 5번 하나뿐).
//   article-with-comments.html   1564214 — commentCount 6 = 최상위 2 + 대댓글 4
//   article-no-comments.html     1564213 — commentCount 0, comment 키 없음 (정상)
//   article-deleted-comment.html 1564218 — commentCount 1, comment 키 없음 (삭제 댓글)
//   article-missing-ld.html      1564206 — @type 이 Article (스폰서 글) = 실패
//   article-foreign-comment.html 1564214 에서 댓글 1건의 url 만 다른 글로 바꿈
//
// ⚠️ 이 파일이 지키는 핵심 4개. 각각 과거 사고 하나에 대응한다.
//
//   1) 마커−파싱 차액을 가짜 실패로 찍지 않는다 (에펨 사건 · CLAUDE.md §7.1)
//      OKKY 의 commentCount 는 **대댓글까지 합친 총합**이다. 최상위만 세면
//      6 vs 2 로 어긋나 "실패 4건"이 찍힌다. 재귀 평탄화로 대조한다.
//      반대로 **정상적으로 어긋나는 경우도 실측했다** — 삭제/블라인드된 댓글이
//      카운터에만 남는다(1564218). 그건 실패로 세지 않는다.
//   2) 지문 중복 적재를 막는다 (텀블벅 사건 · SP-031)
//      다른 글의 댓글이 섞여 오면 filtered 로 버린다. 안 거르면 같은 댓글이
//      타깃마다 새 행이 된다(identity_key 에 productRef 가 들어간다).
//   3) 안전장치가 아니라 구조로 종료한다 (다나와 사건 · §7.2)
//      1글=1요청이라 요청 1건 뒤 exhausted 다. MAX_PAGES_PER_TARGET(20)에
//      기대지 않는다는 것을 러너를 실제로 돌려 확인한다.
//   4) 집계 숫자만 보고 통과시키지 않는다 (§7.1 탈잉 사건)
//      본문·댓글 텍스트의 **실제 내용**을 문자열로 대조한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { okkyAdapter, parseProductRef, HOST, DELETED_COMMENT_TOLERANCE, __internal } from '../lib/review/adapters/okky.ts'
import { runCollection, MAX_PAGES_PER_TARGET } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'okky', n), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const PATH = '/articles/1564214'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'okky',
  productRef: REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (over = {}) => ({ productRef: REF, cursor: null, ...over })

// ── product_ref 파싱 — 여기가 SSRF 경계다 ─────────────────────────
t('ref: url:<경로> 를 경로로 읽는다', parseProductRef(REF), PATH)
t('ref: 앞뒤 공백 허용', parseProductRef(`  ${REF}  `), PATH)
t('ref: URL: 대문자 접두도 허용', parseProductRef(`URL:${PATH}`), PATH)
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/articles/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/articles/1'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/articles@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/articles/1'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/articles/1 2'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/articles\\evil'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)
// robots 금지 경로는 애초에 형태가 안 맞아 탈락한다(화이트리스트).
t('ref: /api/ 는 null (robots Disallow: /api/)', parseProductRef('url:/api/v1/articles/1'), null)
t('ref: /users/*/articles 는 null (robots 금지)', parseProductRef('url:/users/1/articles'), null)
t('ref: 목록 경로는 null', parseProductRef('url:/articles'), null)
// robots 는 열지만 **실측하지 않은** 경로다. 파서를 안 보고 넓히지 않는다.
t('ref: /questions/<번호> 는 아직 받지 않는다 (미실측)', parseProductRef('url:/questions/1234'), null)
t('ref: 쿼리가 붙으면 null (경로형만)', parseProductRef('url:/articles/1?page=2'), null)
t('ref: 번호가 11자리면 null', parseProductRef('url:/articles/12345678901'), null)
t('ref: 번호가 아니면 null', parseProductRef('url:/articles/abc'), null)

// ── 등록 경로(REF_BUILDERS)가 어댑터와 같은 규칙인가 ──────────────
// ⚠️ 빌더가 없으면 이 소스는 타깃을 한 건도 등록할 수 없다 — 코드만 있고
//    수집은 0건인 상태가 된다(target-ref.ts 머리말).
t('빌더: 전체 URL 을 경로형 ref 로 바꾼다', buildProductRef('okky', `${HOST}${PATH}`).productRef, REF)
t('빌더: url: 값을 그대로 넣어도 된다', buildProductRef('okky', REF).productRef, REF)
t('빌더: 남의 호스트는 거절', buildProductRef('okky', 'https://evil.example/articles/1').ok, false)
t('빌더: 목록 URL 은 거절', buildProductRef('okky', `${HOST}/articles`).ok, false)
t('빌더: /questions 는 거절', buildProductRef('okky', `${HOST}/questions/1234`).ok, false)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', okkyAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 okky.kr 과 정확히 일치', new URL(okkyAdapter.nextRequest(target()).url).host, 'okky.kr')
t('URL: 잘못된 ref 면 요청하지 않는다', okkyAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', okkyAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
// 1글=1요청. 커서가 있다는 건 이미 한 번 받았다는 뜻이라 다시 가지 않는다.
t('URL: 커서가 있으면 더 요청하지 않는다', okkyAdapter.nextRequest(target({ cursor: '1' })), null)
ok('URL: 쿼리스트링을 만들지 않는다', !okkyAdapter.nextRequest(target()).url.includes('?'))
ok('URL: /api/ 를 만들지 않는다 (robots 금지)', !okkyAdapter.nextRequest(target()).url.includes('/api/'))

// ── 정상 글 — 사고 4: 집계가 아니라 내용을 본다 ───────────────────
{
  const r = okkyAdapter.parse(fx('article-with-comments.html'), ctx())

  t('정상: 본문 1 + 댓글 6 = 7건', r.reviews.length, 7)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: filtered 0', r.filtered, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)

  const [post, ...comments] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  t('본문: 실측 작성일과 일치 (KST 오프셋 ISO 앞 10자)', post.writtenAt, '2026-09-17')
  // 사고 4 — 숫자가 아니라 본문 텍스트를 확인한다.
  ok('본문: 제목이 들어 있다', post.text.includes('[피드백 요청] 내 과거를 검색하는 앱'))
  ok('본문: 본문 앞부분이 들어 있다', post.text.includes('스마트폰에 이미 쌓이는 위치·사진·운동·캘린더 데이터'))
  ok('본문: 본문 실물이 들어 있다', post.text.includes('memory-landing-stylemap.vercel.app'))
  ok('본문: 제목과 본문이 빈 줄로 나뉜다', post.text.includes('\n\n'))

  t('댓글: 6건', comments.length, 6)
  ok('댓글: externalId 가 <글경로>#note- 로 시작', comments.every((c) => c.externalId.startsWith(`${PATH}#note-`)))
  t('댓글: externalId 중복 없음', new Set(r.reviews.map((x) => x.externalId)).size, 7)
  ok('댓글: storyId 가 글 경로', comments.every((c) => c.storyId === PATH))
  ok('댓글: writtenAt 이 전 건 YYYY-MM-DD (damoang 과 달리 추정이 필요 없다)', comments.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.writtenAt)))
  // 사고 4 — 최상위 댓글과 **대댓글** 실물이 둘 다 들어왔는지 문자열로 본다.
  ok('댓글: 최상위 댓글 실물이 읽힌다', comments.some((c) => c.text.includes('구글 지도 앱에서 “타임라인”')))
  ok('댓글: 대댓글 실물도 읽힌다 (중첩을 평탄화했다)', comments.some((c) => c.text.startsWith('@월급은나의빛 맞아요!')))
  ok('댓글: 두 번째 대댓글도 읽힌다', comments.some((c) => c.text.startsWith('@값이이상해요')))
  t('댓글: note id 가 실측값과 일치', comments[0].externalId, `${PATH}#note-2086327`)

  ok('전건: rating 은 항상 null', r.reviews.every((x) => x.rating === null))
  ok('전건: seller 는 항상 null', r.reviews.every((x) => x.seller === null))
  ok('전건: authorMasked 는 항상 null (작성자 정보를 담지 않는다)', r.reviews.every((x) => x.authorMasked === null))
  ok('전건: 본문이 비어 있지 않다', r.reviews.every((x) => x.text.length > 0))
}

// ── 사고 1: 마커 대조. 중첩 평탄화가 곧 분모다 ────────────────────
{
  const node = __internal.readJsonLd(fx('article-with-comments.html'))
  t('마커: commentCount 가 6 (실측)', node.commentCount, 6)
  t('마커: 최상위 comment[] 는 2건뿐이다', node.comment.length, 2)
  t('마커: 재귀 평탄화하면 6건 — 마커와 일치', __internal.flattenComments(node.comment).length, 6)
  // 이게 이 블록의 존재 이유다. 최상위만 셌다면 6 vs 2 로 어긋나 실패 4건이 찍혔다.
  ok('마커: 평탄화 없이는 어긋난다 (가짜 실패의 근원)', node.commentCount !== node.comment.length)
}

// ── 댓글 0건 — 정상이다 ───────────────────────────────────────────
{
  const c = { productRef: 'url:/articles/1564213', cursor: null }
  const r = okkyAdapter.parse(fx('article-no-comments.html'), c)
  t('댓글0: 본문 1건만', r.reviews.length, 1)
  t('댓글0: 실패 0 — 댓글이 없는 것은 고장이 아니다', r.parseFailures, 0)
  t('댓글0: 커서 없음', r.nextCursor, null)
  ok('댓글0: 본문 실물이 읽힌다', r.reviews[0].text.includes('닌텐도'))
}

// ── 사고 1의 반대 방향: 정상적으로 어긋나는 경우 ──────────────────
// 실측 1564218 — commentCount 1 인데 comment 키가 없고, 렌더 <ul> 도 비어 있다.
// 삭제/블라인드된 댓글이 카운터에만 남은 상태다. **실패가 아니다.**
{
  const c = { productRef: 'url:/articles/1564218', cursor: null }
  const r = okkyAdapter.parse(fx('article-deleted-comment.html'), c)
  const node = __internal.readJsonLd(fx('article-deleted-comment.html'))
  t('삭제댓글: 마커는 1이다', node.commentCount, 1)
  t('삭제댓글: 평탄화 결과는 0건이다', __internal.flattenComments(node.comment).length, 0)
  t('삭제댓글: 그래도 실패로 세지 않는다 (허용치 1)', r.parseFailures, 0)
  t('삭제댓글: 본문은 그대로 읽는다', r.reviews.length, 1)
  ok('삭제댓글: 본문 실물', r.reviews[0].text.includes('다음은 뭐가 나오려나'))
  t('허용치가 1이라는 사실을 고정한다', DELETED_COMMENT_TOLERANCE, 1)
}

// ── 허용치를 넘는 부족분은 실패다 (구조 변경 신호) ────────────────
{
  // 마커만 6 → 8 로 올린다. 평탄화 6건이라 부족분 2, 허용치 1 을 빼면 실패 1.
  const broken = fx('article-with-comments.html').replace('"commentCount":6', '"commentCount":8')
  const r = okkyAdapter.parse(broken, ctx())
  t('마커불일치: 부족분 2 − 허용치 1 = 실패 1', r.parseFailures, 1)
  t('마커불일치: 읽은 댓글은 그대로 남는다', r.reviews.length, 7)
}
{
  // comment[] 가 통째로 사라진 경우(필드명 변경). 마커 6 − 0 − 1 = 실패 5.
  const node = __internal.readJsonLd(fx('article-with-comments.html'))
  const stripped = JSON.stringify({ '@type': 'DiscussionForumPosting', headline: node.headline, text: node.text, datePublished: node.datePublished, url: node.url, commentCount: node.commentCount })
  const r = okkyAdapter.parse(`<script type="application/ld+json">${stripped}</script>`, ctx())
  t('댓글배열소실: 실패 5건 (6 − 0 − 허용치 1)', r.parseFailures, 5)
  t('댓글배열소실: 본문은 그래도 읽는다', r.reviews.length, 1)
}
{
  // 마커가 파싱 건수보다 **작은** 경우는 데이터를 잃은 게 아니다 — 실패 아님.
  const r = okkyAdapter.parse(fx('article-with-comments.html').replace('"commentCount":6', '"commentCount":2'), ctx())
  t('마커과소: 실패로 세지 않는다', r.parseFailures, 0)
  t('마커과소: 6건 다 받는다', r.reviews.length, 7)
}

// ── 사고 2: 남의 글 댓글이 섞이면 버린다 (지문 중복 방지) ─────────
{
  const r = okkyAdapter.parse(fx('article-foreign-comment.html'), ctx())
  t('스코프: 이 글 댓글 5건만 남는다', r.reviews.length, 6)
  t('스코프: 남의 글 댓글 1건은 filtered', r.filtered, 1)
  t('스코프: filtered 는 파싱 실패가 아니다', r.parseFailures, 0)
  ok('스코프: 남의 글 note id 가 섞이지 않았다', r.reviews.every((x) => !x.externalId.includes('note-9999999')))
  ok('스코프: externalId 전부 이 글 경로다', r.reviews.every((x) => x.externalId === PATH || x.externalId.startsWith(`${PATH}#note-`)))
}
{
  // 응답이 **다른 글**이면(리다이렉트·canonical 변경) 통째로 실패다.
  // 그 글 내용을 이 타깃의 project_id 로 적재하면 안 된다.
  const r = okkyAdapter.parse(fx('article-with-comments.html'), { productRef: 'url:/articles/1560000', cursor: null })
  t('다른글응답: 실패 1', r.parseFailures, 1)
  t('다른글응답: 한 건도 적재하지 않는다', r.reviews.length, 0)
}

// ── JSON-LD 자체가 없는 글 — 실패다 ──────────────────────────────
{
  // 실측 1564206: HTTP 200 · 113KB 인데 @type 이 Article 인 스폰서 글이다.
  const c = { productRef: 'url:/articles/1564206', cursor: null }
  const r = okkyAdapter.parse(fx('article-missing-ld.html'), c)
  ok('LD소실: parseFailures > 0', r.parseFailures > 0)
  t('LD소실: 적재 0건', r.reviews.length, 0)
  t('LD소실: 커서 없음', r.nextCursor, null)
  ok('LD소실: Article 블록을 DiscussionForumPosting 으로 착각하지 않는다', __internal.readJsonLd(fx('article-missing-ld.html')) === null)
}

// ── 엔티티 디코딩 — &amp; 를 마지막에 푸는 순서 ──────────────────
t('엔티티: &amp; 를 푼다', __internal.decodeEntities('a&amp;b'), 'a&b')
t('엔티티: &quot; 를 푼다', __internal.decodeEntities('&quot;x&quot;'), '"x"')
// 먼저 &amp; 를 풀면 &amp;lt; 가 &lt; 를 거쳐 '<' 가 된다. 그 순서 사고를 고정한다.
t('엔티티: &amp;lt; 는 &lt; 로만 풀린다', __internal.decodeEntities('&amp;lt;'), '&lt;')
{
  // 실측 1564220 의 본문에 &quot; 가 26개 있었다.
  const r = okkyAdapter.parse(fx('article-with-comments.html'), ctx())
  ok('엔티티: 적재 텍스트에 &amp; 가 남지 않는다', r.reviews.every((x) => !x.text.includes('&amp;')))
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['깨진 JSON-LD', '<script type="application/ld+json">{ this is not json </script>'],
  ['빈 태그뿐', '<html><body></body></html>'],
]) {
  let threw = false
  let r = null
  try {
    r = okkyAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
}
{
  // 깨진 블록 하나가 뒤의 멀쩡한 블록까지 버리게 두지 않는다.
  const r = okkyAdapter.parse('<script type="application/ld+json">{oops</script>' + fx('article-with-comments.html'), ctx())
  t('깨진블록: 뒤의 정상 블록을 읽는다', r.reviews.length, 7)
}

// ── 사고 3: 안전장치가 아니라 구조로 종료한다 ─────────────────────
// 러너를 실제로 돌린다. 1글=1요청이라 요청 1건 뒤 exhausted 여야 하고,
// MAX_PAGES_PER_TARGET(20) 안전판에는 닿지 않아야 한다.
{
  const html = fx('article-with-comments.html')
  const robots = 'User-Agent: *\nDisallow: /api/\nDisallow: /users/*/articles\n'
  let clock = Date.parse('2026-09-18T02:00:00+09:00')
  const urls = []
  const saves = []
  const inputs = []
  const seenFp = new Map()

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      clock += 10
      if (url.endsWith('/robots.txt')) return { status: 200, body: robots }
      urls.push(url)
      return { status: 200, body: html }
    },
    store: {
      async loadSource() {
        return { key: 'okky', enabled: true, minIntervalMs: 4000, dailyRequestCap: 100, requestsToday: 0 }
      },
      async listDueTargets() {
        return [target()]
      },
      async saveTargetProgress(p) {
        saves.push(p)
      },
      async recordFingerprint(fp) {
        if (seenFp.has(fp.identityKey)) {
          return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
        }
        seenFp.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) {
        inputs.push(i)
        return `in${inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }

  const r = await runCollection(okkyAdapter, { dryRun: false, targetLimit: 1 }, ports)

  t('종료: 글 요청은 정확히 1건', urls.length, 1)
  t('종료: 러너가 센 요청도 1건', r.requests, 1)
  t('종료: 페이지 1장', r.pagesFetched, 1)
  // ⚠️ 여기가 핵심이다. outcome 이 '페이지 상한 …' 이면 안전장치가 끊은 것이고,
  //    그걸 정상 종료로 읽으면 다나와 사건이 재현된다(§7.2).
  ok('종료: outcome 이 "끝까지 읽음"', r.perTarget[0].outcome.startsWith('끝까지 읽음'))
  ok('종료: outcome 에 "페이지 상한" 이 없다 — 안전장치가 끊은 게 아니다', !r.perTarget[0].outcome.includes('페이지 상한'))
  ok('종료: 요청 수가 안전판보다 훨씬 작다', r.requests < MAX_PAGES_PER_TARGET)
  // 남헌 2026-09-23 Q3(a) 이후 닫지 않는다 — 글에 댓글이 더 달리면 다음 실행이 받는다.
  // 닫히면 listDueTargets(status='active')가 영영 다시 안 집는다.
  ok('종료: 마지막 저장이 active (incrementalOnly)', saves.at(-1).status === 'active')
  ok('종료: 커서를 남기지 않는다', saves.at(-1).cursor === null)
  t('종료: robots 금지로 건너뛴 요청 0건', r.robotsSkips, 0)
  t('종료: 7건 적재', inputs.length, 7)
  t('종료: health ok', r.health.health, 'ok')

  // 재실행 — 커서가 없어도 다시 가지만(exhausted 라 러너가 안 부른다) 지문이 막는다.
  const before = inputs.length
  await runCollection(okkyAdapter, { dryRun: false, targetLimit: 1 }, ports)
  t('재실행: 새로 적재된 것 0건 (지문 중복)', inputs.length - before, 0)
}

// ── 사고 2(계속): 두 타깃이 같은 댓글을 두 번 적재하지 않는가 ─────
// 같은 창작자/글 묶음을 여러 타깃으로 등록했을 때 텀블벅에서 났던 사고다.
// OKKY 는 글 1건 = 타깃 1건이라 같은 응답이 두 타깃에 걸릴 일이 없지만,
// 그 가정이 깨지는 순간(같은 글을 두 번 등록)에도 중복이 안 나야 한다.
{
  const html = fx('article-with-comments.html')
  const robots = 'User-Agent: *\nDisallow: /api/\n'
  let clock = Date.parse('2026-09-18T02:00:00+09:00')
  const inputs = []
  const seenFp = new Map()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      clock += 10
      return { status: 200, body: url.endsWith('/robots.txt') ? robots : html }
    },
    store: {
      async loadSource() {
        return { key: 'okky', enabled: true, minIntervalMs: 4000, dailyRequestCap: 100, requestsToday: 0 }
      },
      async listDueTargets() {
        // 같은 글을 서로 다른 프로젝트로 두 번 등록한 상황.
        return [target({ id: 'a', projectId: 'p1' }), target({ id: 'b', projectId: 'p2' })]
      },
      async saveTargetProgress() {},
      async recordFingerprint(fp) {
        // store.ts 와 같은 판정: identity_key UNIQUE 로만 가른다.
        if (seenFp.has(fp.identityKey)) {
          return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
        }
        seenFp.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) {
        inputs.push(i)
        return `in${inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }
  const r = await runCollection(okkyAdapter, { dryRun: false, targetLimit: 2 }, ports)
  t('타깃간중복: 합계 7건 적재 (14건이면 중복이다)', inputs.length, 7)
  t('타깃간중복: 지문도 7개', seenFp.size, 7)
  t('타깃간중복: 본문 중복 0건', new Set(inputs.map((i) => i.text)).size, 7)
  t('타깃간중복: 파싱 실패 0', r.stats.parseFailures, 0)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('OKKY 파서가 틀렸다.')
  process.exit(1)
}
console.log('OKKY 파서 정상 — 중첩 댓글을 평탄화해 마커와 대조하고, 삭제 댓글은 실패로 세지 않는다.')
