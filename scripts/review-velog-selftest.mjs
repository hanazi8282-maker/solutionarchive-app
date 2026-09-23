#!/usr/bin/env node
// 벨로그 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-18 에 실제로 받은 velog.io 글의 `__APOLLO_STATE__` 블롭을
// 그대로 옮긴 것이다(본문만 1,200자로 잘라 가볍게 했고, 나머지 필드는 원문).
//   post.html               /@doondoony/mechanical-keyboards
//                           — linked_posts 2건 + Comment 6건이 같은 블롭에 온다
//                           — released_at 2019-06-16T15:23:43.864Z (KST 로는 06-17!)
//   post-slug-mismatch.html 본문 글의 url_slug 만 다른 값으로 바꿈 (스코프 필터)
//   post-empty-body.html    title·body 가 둘 다 빈 문자열 (필드명 변경 = 실패)
//   post-no-date.html       released_at 이 null
//   post-missing-state.html 블롭이 아예 없음 (SPA 껍데기 = 실패)
//
// ⚠️ 이 파일이 지키는 핵심 4개. 각각 과거 사고 하나에 대응한다.
//
//   1) 마커−파싱 차액을 가짜 실패로 찍지 않는다 (에펨 사건 · §7.1)
//      벨로그는 **개수 마커를 쓰지 않는다.** `comments_count` 가 최상위+대댓글과
//      화해되지 않기 때문이다(실측 3건 중 1건 어긋남). 그래서 "본문 전용"이고
//      댓글 0건은 고장이 아니다. 이 파일은 그 결정이 되돌아가지 않았는지 —
//      즉 comments_count 를 마커로 쓰기 시작하지 않았는지 — 를 고정한다.
//   2) 지문 중복 적재를 막는다 (텀블벅 사건 · SP-031)
//      블롭에 Post 키가 여러 개 온다(이전/다음 글). url_slug·username 을
//      대조해 이 타깃 글만 받는다. 안 거르면 남의 글이 이 project_id 로 들어간다.
//   3) 안전장치가 아니라 구조로 종료한다 (다나와 사건 · §7.2)
//      1글=1요청이라 요청 1건 뒤 exhausted 다. MAX_PAGES_PER_TARGET(20)에
//      기대지 않는다는 것을 러너를 실제로 돌려 확인한다.
//   4) 집계 숫자만 보고 통과시키지 않는다 (§7.1 탈잉 사건)
//      본문 텍스트의 **실제 내용**을 문자열로 대조하고 길이도 본다.
//
// ⚠️ 그리고 이 소스에만 있는 함정 하나 — **released_at 은 UTC 다.**
//    앞 10자를 그냥 쓰면 KST 날짜가 하루 어긋나고 증분 종료가 9시간 밀린다.
//    변환 검사를 아래 "KST" 블록에 넣었다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { velogAdapter, parseProductRef, parseRefParts, kstDate, HOST, __internal } from '../lib/review/adapters/velog.ts'
import { runCollection, MAX_PAGES_PER_TARGET } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'velog', n), 'utf8')

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

const PATH = '/@doondoony/mechanical-keyboards'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'velog',
  productRef: REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (over = {}) => ({ productRef: REF, cursor: null, ...over })

// ── product_ref 파싱 — 여기가 SSRF 경계다 ─────────────────────────
// ⚠️ 공용 parseUrlRef 를 못 쓴다(`@` 금지에 항상 걸린다). 그래서 이 블록이
//    브런치와 마찬가지로 **유일한 방어선**이다. 넓히지 마라.
t('ref: url:<경로> 를 경로로 읽는다', parseProductRef(REF), PATH)
t('ref: 앞뒤 공백 허용', parseProductRef(`  ${REF}  `), PATH)
t('ref: URL: 대문자 접두도 허용', parseProductRef(`URL:${PATH}`), PATH)
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: @ 없는 경로는 null', parseProductRef('url:/doondoony/mechanical-keyboards'), null)
t('ref: 세그먼트가 하나면 null', parseProductRef('url:/@doondoony'), null)
t('ref: 세그먼트가 셋이면 null', parseProductRef('url:/@doondoony/a/b'), null)
t('ref: .. 는 null', parseProductRef('url:/@doondoony/..'), null)
t('ref: 상위 탈출 조합은 null', parseProductRef('url:/@doondoony/../../etc'), null)
// 퍼센트 인코딩으로 세그먼트를 늘리는 우회를 막는다 — 디코딩 후 다시 센다.
t('ref: %2f 로 세그먼트를 늘리면 null', parseProductRef('url:/@doondoony/a%2fb'), null)
t('ref: %2F(대문자)도 null', parseProductRef('url:/@doondoony/a%2Fb'), null)
t('ref: %2e%2e 도 null', parseProductRef('url:/@doondoony/%2e%2e'), null)
t('ref: 깨진 퍼센트 시퀀스는 null', parseProductRef('url:/@doondoony/a%zz'), null)
t('ref: // 로 시작하면 null', parseProductRef('url://evil.example/@a/b'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/@a/b'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/@doondoony/a b'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/@doondoony/a\\b'), null)
t('ref: 쿼리가 붙으면 null', parseProductRef('url:/@doondoony/a?x=1'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)
t('ref: @@ 는 null', parseProductRef('url:/@@a/b'), null)

// ── 한글 슬러그는 퍼센트 인코딩된 형태로 받는다 ───────────────────
{
  // 실측 글 하나가 이 형태다: /@taehyongi/velog-글-작성은-최고네요
  const enc = '/@taehyongi/velog-%EA%B8%80-%EC%9E%91%EC%84%B1%EC%9D%80-%EC%B5%9C%EA%B3%A0%EB%84%A4%EC%9A%94'
  const parts = parseRefParts(`url:${enc}`)
  ok('한글슬러그: 인코딩된 경로를 받는다', parts !== null)
  t('한글슬러그: path 는 인코딩된 그대로 (요청에 쓴다)', parts.path, enc)
  t('한글슬러그: username 을 뗀다', parts.username, 'taehyongi')
  // ⚠️ 블롭의 url_slug 는 **디코딩된 한글**이다. 대조하려면 디코딩해야 한다.
  t('한글슬러그: slug 은 디코딩해서 둔다 (블롭 url_slug 와 대조용)', parts.slug, 'velog-글-작성은-최고네요')
}
{
  const parts = parseRefParts(REF)
  t('parts: path', parts.path, PATH)
  t('parts: username', parts.username, 'doondoony')
  t('parts: slug', parts.slug, 'mechanical-keyboards')
}

// ── 등록 경로(REF_BUILDERS)가 어댑터와 같은 규칙인가 ──────────────
t('빌더: 전체 URL 을 경로형 ref 로 바꾼다', buildProductRef('velog', `${HOST}${PATH}`).productRef, REF)
t('빌더: url: 값을 그대로 넣어도 된다', buildProductRef('velog', REF).productRef, REF)
t('빌더: 남의 호스트는 거절', buildProductRef('velog', 'https://evil.example/@a/b').ok, false)
t('빌더: 목록 URL 은 거절', buildProductRef('velog', `${HOST}/@doondoony`).ok, false)
{
  // 사람이 한글 URL 을 브라우저에서 복사해 넣는 경우 — pathname 이 인코딩된다.
  const built = buildProductRef('velog', 'https://velog.io/@taehyongi/velog-글-작성은-최고네요')
  ok('빌더: 한글 URL 을 받아 인코딩해 저장한다', built.ok)
  ok('빌더: 저장값이 퍼센트 인코딩 형태다', built.productRef.includes('%EA%B8%80'))
  // ⚠️ 저장값을 다시 어댑터가 읽을 수 있어야 한다. 여기가 어긋나면 그 타깃은
  //    매일 밤 요청 0건으로 끝난다(아무 에러도 안 난다 — target-ref.ts 머리말).
  ok('빌더: 저장값을 어댑터가 되읽는다', parseProductRef(built.productRef) !== null)
}

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', velogAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 velog.io 와 정확히 일치', new URL(velogAdapter.nextRequest(target()).url).host, 'velog.io')
t('URL: 잘못된 ref 면 요청하지 않는다', velogAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', velogAdapter.nextRequest(target({ productRef: 'url:https://evil.example/@a/b' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', velogAdapter.nextRequest(target({ cursor: '1' })), null)
ok('URL: 쿼리스트링을 만들지 않는다', !velogAdapter.nextRequest(target()).url.includes('?'))
ok('URL: /graphql 을 만들지 않는다 (POST 는 러너 계약 밖)', !velogAdapter.nextRequest(target()).url.includes('graphql'))

// ── 사고 4: 집계가 아니라 내용을 본다 ─────────────────────────────
{
  const r = velogAdapter.parse(fx('post.html'), ctx())

  t('정상: 리뷰 1건 — 본문 전용', r.reviews.length, 1)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)

  const [post] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  t('본문: rating null', post.rating, null)
  t('본문: seller null', post.seller, null)
  t('본문: authorMasked null (작성자 정보를 담지 않는다)', post.authorMasked, null)
  // 사고 4 — 숫자가 아니라 본문 텍스트를 확인한다.
  ok('본문: 제목이 들어 있다', post.text.includes('대단히 주관적인 기계식 키보드 사용 후기'))
  ok('본문: 제목과 본문이 빈 줄로 나뉜다', post.text.includes('\n\n'))
  ok('본문: 본문 실물이 들어 있다', post.text.includes('로지텍 K310'))
  ok('본문: 원문 마크다운 그대로다 (## 헤딩이 남아 있다)', post.text.includes('## ☕️ 기계식 키보드를 왜 쓰게 되었나'))
  ok('본문: 줄바꿈이 보존된다', post.text.split('\n').length > 3)
  ok('본문: 길이가 1,000자를 넘는다 (픽스처는 1,200자로 자른 것)', post.text.length > 1000)
}

// ── KST 변환 — 이 소스에만 있는 함정 ──────────────────────────────
// ⛔ released_at 은 UTC ISO 다. 앞 10자를 쓰면 하루 어긋난다.
t('KST: 15:23Z → 다음 날 (실측 mechanical-keyboards)', kstDate('2019-06-16T15:23:43.864Z'), '2019-06-17')
t('KST: 23:22Z → 다음 날 (실측 velog-글-작성은-최고네요)', kstDate('2018-10-20T23:22:30.801Z'), '2018-10-21')
t('KST: 14:40Z → 같은 날 (실측 veltrends-dev-review)', kstDate('2022-10-23T14:40:32.306Z'), '2022-10-23')
t('KST: 14:59:59Z 는 같은 날 (경계 바로 앞)', kstDate('2020-01-01T14:59:59.000Z'), '2020-01-01')
t('KST: 15:00:00Z 는 다음 날 (경계)', kstDate('2020-01-01T15:00:00.000Z'), '2020-01-02')
t('KST: 연말 경계 — 12/31 15:00Z 는 다음 해다', kstDate('2020-12-31T15:00:00.000Z'), '2021-01-01')
t('KST: null 은 null', kstDate(null), null)
t('KST: 빈 문자열은 null', kstDate(''), null)
t('KST: 날짜만 오면 null (형식을 추정하지 않는다)', kstDate('2020-01-01'), null)
t('KST: 쓰레기는 null', kstDate('어제'), null)
t('KST: 형식은 맞지만 값이 이상하면 null', kstDate('2020-99-99T00:00:00Z'), null)
t('KST: 숫자는 null', kstDate(1600000000000), null)
{
  const r = velogAdapter.parse(fx('post.html'), ctx())
  // 이게 이 블록의 존재 이유다. UTC 앞 10자(2019-06-16)로 나오면 안 된다.
  t('KST: 적재값이 KST 날짜다', r.reviews[0].writtenAt, '2019-06-17')
  ok('KST: UTC 앞 10자를 그대로 쓰지 않았다', r.reviews[0].writtenAt !== '2019-06-16')
}
{
  const r = velogAdapter.parse(fx('post-no-date.html'), ctx())
  t('KST: released_at 이 null 이면 writtenAt 도 null (추정 금지)', r.reviews[0].writtenAt, null)
  t('KST: 날짜가 없어도 본문은 적재한다', r.reviews.length, 1)
  t('KST: 날짜 없음은 파싱 실패가 아니다', r.parseFailures, 0)
}

// ── 사고 2: 블롭에 Post 가 여러 개 온다 ───────────────────────────
{
  const state = __internal.readState(fx('post.html'))
  const postKeys = Object.keys(state).filter((k) => k.startsWith('Post:'))
  t('블롭: Post 키가 3개다 (본문 1 + linked_posts 2)', postKeys.length, 3)
  // body 키가 없는 Post 는 후보에서 빠진다 — 그게 이전/다음 글이다.
  t('블롭: body 를 가진 Post 는 1개뿐', __internal.readPosts(state).length, 1)
  t('블롭: 그 1개의 슬러그가 타깃과 같다', __internal.readPosts(state)[0].slug, 'mechanical-keyboards')
  t('블롭: username 을 정규화 캐시에서 되짚는다', __internal.readPosts(state)[0].username, 'doondoony')
}
{
  // 응답이 **다른 글**이면 한 건도 적재하지 않는다. 그 글을 이 타깃의
  // project_id 로 넣으면 텀블벅 사고가 재현된다(SP-031).
  const r = velogAdapter.parse(fx('post.html'), { productRef: 'url:/@doondoony/posix-eol', cursor: null })
  t('스코프: 슬러그가 다르면 적재 0건', r.reviews.length, 0)
  t('스코프: 남의 글 1건을 filtered 로 센다', r.filtered, 1)
  ok('스코프: 조용히 0건으로 지나가지 않는다 (실패로 보고한다)', r.parseFailures > 0)
}
{
  // 같은 슬러그인데 **작성자가 다르면** 받지 않는다.
  const r = velogAdapter.parse(fx('post.html'), { productRef: 'url:/@someoneelse/mechanical-keyboards', cursor: null })
  t('스코프: username 이 다르면 적재 0건', r.reviews.length, 0)
  ok('스코프: username 불일치도 실패로 보고한다', r.parseFailures > 0)
}
{
  const r = velogAdapter.parse(fx('post-slug-mismatch.html'), ctx())
  t('스코프: 블롭 슬러그가 바뀌면 적재 0건', r.reviews.length, 0)
  t('스코프: filtered 1', r.filtered, 1)
  ok('스코프: 실패로 보고한다', r.parseFailures > 0)
}

// ── 사고 1: 개수 마커를 쓰지 않는다는 결정이 살아 있는가 ──────────
{
  const state = __internal.readState(fx('post.html'))
  const key = Object.keys(state).find((k) => k.startsWith('Post:') && 'body' in state[k])
  const comments = Object.keys(state).filter((k) => k.startsWith('Comment:'))
  // 실측: comments_count 11 인데 루트 Comment 는 6건(전부 level 0)이고
  // replies_count 합은 4다 → 6+4=10 ≠ 11. 어느 쪽으로도 화해되지 않는다.
  t('마커: comments_count 는 11 (실측)', state[key].comments_count, 11)
  t('마커: 블롭의 최상위 Comment 는 6건', comments.length, 6)
  t('마커: 전부 level 0 — 대댓글은 오지 않는다', comments.filter((k) => state[k].level === 0).length, 6)
  t('마커: replies_count 합은 4', comments.reduce((s, k) => s + (state[k].replies_count ?? 0), 0), 4)
  ok('마커: 최상위+대댓글(10)이 comments_count(11)와 화해되지 않는다', 6 + 4 !== state[key].comments_count)

  // ⇒ 그래서 본문 전용이다. **댓글 0건은 고장이 아니다.**
  const r = velogAdapter.parse(fx('post.html'), ctx())
  t('마커: 댓글을 적재하지 않는다 — 본문 1건뿐', r.reviews.length, 1)
  t('마커: 그리고 그것을 실패로 세지 않는다', r.parseFailures, 0)
  ok('마커: storyId 를 쓰지 않는다 (댓글 개념이 없다)', r.reviews.every((x) => x.storyId === null))
}

// ── 블롭·본문 소실 — 실패다 ───────────────────────────────────────
{
  const r = velogAdapter.parse(fx('post-missing-state.html'), ctx())
  ok('블롭소실: parseFailures > 0', r.parseFailures > 0)
  t('블롭소실: 적재 0건', r.reviews.length, 0)
  t('블롭소실: 커서 없음', r.nextCursor, null)
}
{
  const r = velogAdapter.parse(fx('post-empty-body.html'), ctx())
  ok('본문공백: parseFailures > 0', r.parseFailures > 0)
  t('본문공백: 적재 0건 — 빈 글을 적재하지 않는다', r.reviews.length, 0)
}

// ── 중괄호 세기 — 비탐욕 정규식이면 항상 깨지는 자리 ──────────────
t('슬라이스: 중첩 객체를 끝까지 센다', __internal.sliceJson('x={"a":{"b":1}}', 2), '{"a":{"b":1}}')
t('슬라이스: 문자열 안의 } 를 건너뛴다', __internal.sliceJson('={"a":"}"}', 1), '{"a":"}"}')
t('슬라이스: 이스케이프된 따옴표를 건너뛴다', __internal.sliceJson('={"a":"\\""}', 1), '{"a":"\\""}')
t('슬라이스: 짝이 안 맞으면 null', __internal.sliceJson('={"a":1', 1), null)

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['마커만 있고 JSON 이 없음', '<script>window.__APOLLO_STATE__=</script>'],
  ['깨진 JSON', '<script>window.__APOLLO_STATE__={ this is not json }</script>'],
  ['빈 객체', '<script>window.__APOLLO_STATE__={};</script>'],
  ['Post 키가 없음', '<script>window.__APOLLO_STATE__={"ROOT_QUERY":{}};</script>'],
]) {
  let threw = false
  let r = null
  try {
    r = velogAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
  ok(`쓰레기(${name}): 적재 0건`, r && r.reviews.length === 0)
}

// ── 사고 3: 안전장치가 아니라 구조로 종료한다 ─────────────────────
{
  const html = fx('post.html')
  // 실측 robots — `User-agent: *` 한 줄뿐이고 규칙이 0개다.
  const robots = '# https://www.robotstxt.org/robotstxt.html\nUser-agent: *\n'
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
        return { key: 'velog', enabled: true, minIntervalMs: 4000, dailyRequestCap: 100, requestsToday: 0 }
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

  const r = await runCollection(velogAdapter, { dryRun: false, targetLimit: 1 }, ports)

  t('종료: 글 요청은 정확히 1건', urls.length, 1)
  t('종료: 러너가 센 요청도 1건', r.requests, 1)
  t('종료: 페이지 1장', r.pagesFetched, 1)
  // ⚠️ 여기가 핵심이다. '페이지 상한 …' 이면 안전장치가 끊은 것이다(§7.2).
  ok('종료: outcome 이 "끝까지 읽음"', r.perTarget[0].outcome.startsWith('끝까지 읽음'))
  ok('종료: outcome 에 "페이지 상한" 이 없다', !r.perTarget[0].outcome.includes('페이지 상한'))
  ok('종료: 요청 수가 안전판보다 훨씬 작다', r.requests < MAX_PAGES_PER_TARGET)
  // 남헌 2026-09-23 Q3(a) 이후 닫지 않는다 — 글에 댓글이 더 달리면 다음 실행이 받는다.
  // 닫히면 listDueTargets(status='active')가 영영 다시 안 집는다.
  ok('종료: 마지막 저장이 active (incrementalOnly)', saves.at(-1).status === 'active')
  ok('종료: 커서를 남기지 않는다', saves.at(-1).cursor === null)
  t('종료: robots 금지로 건너뛴 요청 0건 (규칙 0개)', r.robotsSkips, 0)
  t('종료: 1건 적재', inputs.length, 1)
  t('종료: health ok', r.health.health, 'ok')

  const before = inputs.length
  await runCollection(velogAdapter, { dryRun: false, targetLimit: 1 }, ports)
  t('재실행: 새로 적재된 것 0건 (지문 중복)', inputs.length - before, 0)
}

// ── 사고 2(계속): 두 타깃이 같은 글을 두 번 적재하지 않는가 ───────
{
  const html = fx('post.html')
  const robots = 'User-agent: *\n'
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
        return { key: 'velog', enabled: true, minIntervalMs: 4000, dailyRequestCap: 100, requestsToday: 0 }
      },
      async listDueTargets() {
        // 같은 글을 두 프로젝트로 등록 + 그 블롭에 딸려 온 이전 글도 타깃으로 등록.
        // 후자는 이 응답에서 0건이어야 한다 — 그게 스코프 필터의 값이다.
        return [
          target({ id: 'a', projectId: 'p1' }),
          target({ id: 'b', projectId: 'p2' }),
          target({ id: 'c', projectId: 'p3', productRef: 'url:/@doondoony/posix-eol' }),
        ]
      },
      async saveTargetProgress() {},
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
  const r = await runCollection(velogAdapter, { dryRun: false, targetLimit: 3 }, ports)
  t('타깃간중복: 합계 1건 적재 (2건이면 중복이다)', inputs.length, 1)
  t('타깃간중복: 지문도 1개', seenFp.size, 1)
  t('타깃간중복: 이전 글 타깃은 남의 글을 받지 않았다', r.stats.relevanceFiltered, 1)
  t('타깃간중복: 슬러그 불일치 1건이 실패로 잡힌다 (조용한 0건 금지)', r.stats.parseFailures, 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('벨로그 파서가 틀렸다.')
  process.exit(1)
}
console.log('벨로그 파서 정상 — 본문 전용이고, released_at 을 KST 로 변환하며, 블롭의 남의 글을 거른다.')
