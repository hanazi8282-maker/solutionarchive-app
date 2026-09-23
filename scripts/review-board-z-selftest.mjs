#!/usr/bin/env node
// 게시판 순회 모드 셀프테스트 (Z 몫: velog · damoang) — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 실측 근거는 2026-09-24, 호스트당 3요청·간격 5초 이상으로 쟀다.
//   velog.io    ① /policy/terms  ② /tags/생산성  ③ /@papapat/…micuq9o1
//   damoang.net ① /free  ② /free/7341567  ③ /feed
//
// 픽스처
//   fixtures/review/velog/board-tag.html                — /tags/생산성 목록.
//        RSC 플라이트 조각을 **원문 그대로** 옮겼다(글 10건). `url_slug`·
//        `user.username`·`released_at` 은 파서가 읽는 값이라 손대지 않았고,
//        `display_name`·`short_bio`·프로필 이미지 URL 은 마스킹했다.
//        (username 은 닉네임이 아니라 공개 URL 의 구성요소다.)
//   fixtures/review/velog/board-tag-missing-posts.html  — 같은 응답에서 목록
//        컨테이너 키 이름만 바꾼 것. **"글 0건"이 아니라 "구조 변경"이다.**
//   fixtures/review/velog/post.html                     — 글 1건 + 최상위 댓글 6건
//        (기존 픽스처를 그대로 쓴다. 댓글 확장의 근거가 여기 있다.)
//   fixtures/review/damoang/board-list-cloudflare-403.html — damoang 목록 403 실물.
//
// ⚠️ 이 파일이 지키는 것 5개.
//
//   1) **컨테이너 없음 = 파싱 실패다. 0건이 아니다.**(CLAUDE.md §7.1 사례 1)
//      목록 키가 사라졌을 때 큐를 비우고 "오늘은 새 글이 없네"로 넘어가면
//      벨로그가 구조를 바꿔도 몇 주 동안 초록불이다.
//   2) **큐 값은 원격 데이터다 = SSRF 경계다.**
//      목록이 준 문자열로 URL 을 만들기 전에 글 ref 화이트리스트를 통과시킨다.
//      큐에 넣을 때와 요청을 만들 때 두 번 본다(커서는 DB 를 거쳐 온다).
//   3) **댓글 마커를 `comments_count` 로 되돌리지 않는다.**
//      마커는 `Post.comments` 의 **참조 배열 길이**다. 실측에서 전자는 화해되지
//      않고(11 ≠ 6+4) 후자는 정확히 화해된다(참조 6 → 해소 6).
//   4) **`last` 가 살아서 같은 글을 매일 다시 받지 않는다.**
//      날짜가 아니라 원본 ISO 로 비교한다 — 날짜로 뭉개면 같은 날 글을 매 실행 다시 받는다.
//   5) **damoang 게시판 모드는 없다. robots 가 아니라 서버가 막았다.**
//      그 구분이 사라지면 다음 사람이 robots 를 다시 읽는 헛일을 한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  velogAdapter,
  parseBoardRef,
  readBoardCursor,
  readBoardList,
  parseRefParts,
  HOST as VELOG_HOST,
  __internal as velogInternal,
} from '../lib/review/adapters/velog.ts'
import { damoangAdapter, parseProductRef as parseDamoangRef } from '../lib/review/adapters/damoang.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'
import { MAX_PAGES_PER_TARGET, PRODUCT_TOKEN, runCollection } from '../lib/review/runner.ts'
import { looksLikeMarkup, parseRobots, robotsVerdict } from '../lib/review/robots.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (site, n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', site, n), 'utf8')

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

/**
 * 합성 글 페이지(Apollo 블롭).
 *
 * ⚠️ 저장한 픽스처를 대체하려고 만든 게 아니다. **필드 구성은 실측 픽스처
 *    (post.html)에서 그대로 베꼈고**, 이건 "글마다 다른 응답"이 필요한 자리에만
 *    쓴다 — 러너 통합 테스트에서 큐의 글 10개에 같은 본문을 주면 스코프 필터가
 *    9건을 거르는 게 정상이라, 적재 경로를 아예 못 본다(§7.1 사례 5).
 */
function blobPage({ username, slug, comments = [], releasedAt = '2026-09-20T15:00:00.000Z', body = '본문입니다' }) {
  const state = {
    'Post:p1': {
      id: 'p1',
      title: `제목 ${slug}`,
      url_slug: slug,
      released_at: releasedAt,
      body,
      user: { type: 'id', generated: false, id: 'User:u1', typename: 'User' },
      comments: comments.map((c) => ({ type: 'id', generated: false, id: `Comment:${c.id}`, typename: 'Comment' })),
      comments_count: comments.length + 99, // 일부러 화해되지 않게 둔다 — 마커로 쓰면 안 되는 값이다
      __typename: 'Post',
    },
    'User:u1': { id: 'u1', username, __typename: 'User' },
  }
  for (const c of comments) {
    state[`Comment:${c.id}`] = {
      id: c.id,
      text: c.text,
      created_at: c.createdAt ?? '2026-09-21T01:00:00.000Z',
      level: 0,
      replies_count: 0,
      deleted: c.deleted ?? false,
      __typename: 'Comment',
    }
  }
  return `<html><body><script>window.__APOLLO_STATE__=${JSON.stringify(state)}</script></body></html>`
}

// 태그 `생산성` — 2026-09-24 실측 10건 중 8건이 AI·SaaS 도구 후기였다.
const TAG = '%EC%83%9D%EC%82%B0%EC%84%B1'
const BOARD_REF = `board:tag:${TAG}`
const LIST_URL = `${VELOG_HOST}/tags/${TAG}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'velog',
  productRef: BOARD_REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})

// ══ robots — 실측 원문으로 코드 판정을 돌린다 ═══════════════════════
//
// ⚠️ 여기서 검사하는 것은 "우리 코드가 이 robots 를 어떻게 읽나"다. 사이트가
//    허가했는지가 아니다. 그 구분은 아래 사유 문장으로 고정한다.
{
  // 2026-09-24 실측 · 57바이트 · `*` 그룹은 있고 규칙이 0개다.
  const velogRobots = '# https://www.robotstxt.org/robotstxt.html\nUser-agent: *\n'
  const groups = parseRobots(velogRobots)
  ok('robots(velog): 본문이 마크업이 아니다 (소프트 404 아님)', !looksLikeMarkup(velogRobots))
  t('robots(velog): 그룹 1개', groups.length, 1)
  t('robots(velog): 규칙 0개', groups[0].rules.length, 0)

  const list = robotsVerdict(groups, '/tags/%EC%83%9D%EC%82%B0%EC%84%B1', PRODUCT_TOKEN)
  t('robots(velog): 목록 경로 allowed', list.state, 'allowed')
  // ⚠️ 이 문장이 사라지면 다음 사람이 "robots 가 허용해 줬다"를 채택 근거로 쓴다.
  //    실제 채택 근거는 약관이다(velog.ts 헤더 · 2026-09-24 재확인 4,193자 동일).
  ok('robots(velog): 사유가 "초대는 아니다"를 남긴다', list.reason.includes('초대는 아니다'))
  t('robots(velog): 글 경로도 allowed', robotsVerdict(groups, '/@papapat/x', PRODUCT_TOKEN).state, 'allowed')
  t('robots(velog): Crawl-delay 선언 없음', groups[0].crawlDelay, null)
}
{
  // 2026-09-24 실측 damoang `*` 그룹(발췌 — 판정에 쓰이는 줄만).
  const damoangRobots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /bbs/link.php',
    'Disallow: /plugin/',
    'Disallow: /*?page=',
    'Disallow: /*&page=',
  ].join('\n')
  const groups = parseRobots(damoangRobots)

  // ⚠️ **robots 는 목록을 허용한다.** 막은 것은 서버(Cloudflare 챌린지)다.
  //    이 둘을 같은 문장으로 접으면 다음 사람이 robots 를 다시 읽는 헛일을 한다.
  t('robots(damoang): 목록 /free 는 allowed — robots 가 막은 게 아니다', robotsVerdict(groups, '/free', PRODUCT_TOKEN).state, 'allowed')
  t('robots(damoang): /feed 도 allowed', robotsVerdict(groups, '/feed', PRODUCT_TOKEN).state, 'allowed')
  t('robots(damoang): 글 경로 allowed', robotsVerdict(groups, '/free/7341567', PRODUCT_TOKEN).state, 'allowed')
  t('robots(damoang): /api/ 는 disallowed', robotsVerdict(groups, '/api/x', PRODUCT_TOKEN).state, 'disallowed')
  t('robots(damoang): /plugin/ 은 disallowed', robotsVerdict(groups, '/plugin/x', PRODUCT_TOKEN).state, 'disallowed')
  // ⚠️ SP-026 — 러너는 robots 판정에 쿼리를 넘기지 않으므로(`u.pathname` 만)
  //    이 규칙은 실행 경로에서 **안 걸린다.** 규칙 자체는 여기서 확인해 두고,
  //    그래서 우리가 `?page=` 를 만들지 않는 것이 유일한 방어선이다.
  t('robots(damoang): ?page= 는 규칙상 disallowed (러너는 못 본다 — SP-026)', robotsVerdict(groups, '/free?page=2', PRODUCT_TOKEN).state, 'disallowed')
}

// ══ 지킬 것 5: damoang 게시판 모드는 없다 ══════════════════════════
{
  const body = fx('damoang', 'board-list-cloudflare-403.html')
  // 응답 실물이 목록이 아니라 챌린지다. 200 이 아니라 403 이었다 — 상태 코드가
  // 아니라 본문 표지로도 확인한다(§7.1: 상태 코드로 성공을 판정하지 마라).
  ok('damoang: 목록 응답이 Cloudflare 챌린지다', body.includes('Just a moment...'))
  ok('damoang: challenges.cloudflare.com 이 들어 있다', body.includes('challenges.cloudflare.com'))
  ok('damoang: 글 링크가 0건이다 (파싱할 목록이 아니다)', !/href="\/free\/\d+"/.test(body))

  // 어댑터가 `board:` 를 아예 안 받는다. 받아 두면 0요청 타깃이 조용히 생긴다.
  t('damoang: board: ref 는 파싱되지 않는다', parseDamoangRef('board:free'), null)
  t('damoang: board: 타깃은 요청을 만들지 않는다', damoangAdapter.nextRequest({ ...target({ sourceKey: 'damoang', productRef: 'board:free' }) }), null)
  t('damoang: 등록 빌더도 거절한다', buildProductRef('damoang', 'board:free').ok, false)
  t('damoang: 목록 URL 등록도 거절한다 (글 경로가 아니다)', buildProductRef('damoang', 'https://damoang.net/free').ok, false)
  // 기존 글 경로는 멀쩡하다 — 게시판 모드를 못 만든 것이 소스 전체의 문제가 아니다.
  t('damoang: 글 ref 는 그대로 동작한다', parseDamoangRef('url:/free/7341567'), '/free/7341567')
}

// ══ 지킬 것 2: board ref 파싱 = SSRF 경계 ══════════════════════════
{
  const b = parseBoardRef(BOARD_REF)
  t('boardref: token 은 인코딩된 그대로', b.token, TAG)
  t('boardref: tag 는 디코딩해서 둔다', b.tag, '생산성')
  t('boardref: 목록 경로', b.path, `/tags/${TAG}`)
  t('boardref: 대문자 접두도 허용', parseBoardRef(`BOARD:TAG:${TAG}`).token, TAG)
  t('boardref: 앞뒤 공백 허용', parseBoardRef(`  ${BOARD_REF}  `).token, TAG)
}
for (const bad of [
  'board:tag:',
  'board:tag:a/b',
  'board:tag:a%2fb',
  'board:tag:%2e%2e',
  'board:tag:a b',
  'board:tag:a?x=1',
  'board:tag:a#b',
  'board:tag:a\\b',
  'board:tag:https://evil.example/x',
  'board:trending', // 미구현 — 실측하지 않았다
  'board:free',
  'board:',
  'url:/tags/x',
  'tag:x',
  '',
]) {
  t(`boardref: 거절 — ${JSON.stringify(bad)}`, parseBoardRef(bad), null)
}
t('boardref: 깨진 퍼센트 시퀀스는 null', parseBoardRef('board:tag:a%zz'), null)
t('boardref: 120자를 넘으면 null', parseBoardRef(`board:tag:${'a'.repeat(121)}`), null)

// ── 등록 빌더가 어댑터와 같은 규칙인가 ────────────────────────────
t('빌더: 태그 목록 URL 을 board ref 로 바꾼다', buildProductRef('velog', `${VELOG_HOST}/tags/생산성`).productRef, BOARD_REF)
t('빌더: board: 값을 그대로 넣어도 된다', buildProductRef('velog', BOARD_REF).productRef, BOARD_REF)
t('빌더: 남의 호스트 /tags/ 는 거절', buildProductRef('velog', 'https://evil.example/tags/x').ok, false)
t('빌더: 태그가 비면 거절', buildProductRef('velog', `${VELOG_HOST}/tags/`).ok, false)
// ⚠️ 저장값을 어댑터가 되읽지 못하면 그 타깃은 매일 밤 0요청으로 끝난다(아무 에러도 없다).
ok('빌더: 저장값을 어댑터가 되읽는다', parseBoardRef(buildProductRef('velog', `${VELOG_HOST}/tags/생산성`).productRef) !== null)
// 글 ref 경로는 그대로 살아 있다 — 한 소스가 두 형태를 받는다.
t('빌더: 글 URL 은 여전히 url: 로 간다', buildProductRef('velog', `${VELOG_HOST}/@doondoony/mechanical-keyboards`).productRef, 'url:/@doondoony/mechanical-keyboards')

// ══ 슬러그 길이 상한 — 실측으로 올린 값이다 ════════════════════════
{
  // 2026-09-24 목록 10건 중 1건이 예전 상한(300)에 걸려 탈락했다.
  const longSlug = encodeURIComponent('노션-템플릿-공유-막학기생이-정착한-대학생-노션-템플릿-대학생-강의과제일정-관리-템플릿')
  ok('슬러그: 실측 슬러그가 인코딩 300자를 넘는다', longSlug.length > 300)
  t('슬러그: 실측 길이 344', longSlug.length, 344)
  ok('슬러그: 지금 상한(600)은 이걸 받는다', parseRefParts(`url:/@ah_yo_ninde_yo/${longSlug}`) !== null)
  // 상한을 올려도 방어선은 문자 집합·앵커다.
  t('슬러그: 상한을 넘기면 여전히 null', parseRefParts(`url:/@a/${'b'.repeat(601)}`), null)
  t('슬러그: 길어도 / 가 들어가면 null', parseRefParts(`url:/@a/${'b'.repeat(400)}/c`), null)
}

// ══ 커서 규약 ══════════════════════════════════════════════════════
{
  t('커서: null 은 빈 큐', readBoardCursor(null).q.length, 0)
  t('커서: null 은 last 없음', readBoardCursor(null).last, null)
  const c = readBoardCursor('{"q":["/@a/b","/@c/d"],"last":"2026-09-22T08:15:11.419Z"}')
  t('커서: 큐 2건', c.q.length, 2)
  t('커서: last 를 그대로 읽는다', c.last, '2026-09-22T08:15:11.419Z')
  // 쓰레기 커서에 throw 하지 않는다. 러너가 그 타깃 하나 때문에 죽으면 안 된다.
  for (const bad of ['', 'not json', '[]', '{}', 'null', '{"q":"x"}', '{"q":[1,2]}', '{"last":"어제"}', '{"last":"2026-09-22"}']) {
    let threw = false
    let got = null
    try {
      got = readBoardCursor(bad)
    } catch {
      threw = true
    }
    t(`커서: 쓰레기(${JSON.stringify(bad)}) throw 안 함`, threw, false)
    ok(`커서: 쓰레기(${JSON.stringify(bad)}) 는 빈 큐`, got && got.q.length === 0)
  }
  // ⚠️ 날짜만 온 last 를 받아 주면 ISO 비교가 어긋난다 — 형식을 추정하지 않는다.
  t('커서: 날짜만 온 last 는 버린다', readBoardCursor('{"last":"2026-09-22"}').last, null)
}

// ══ 목록 파싱 ══════════════════════════════════════════════════════
{
  const body = fx('velog', 'board-tag.html')
  const got = readBoardList(body)
  t('목록: 글 10건', got.items.length, 10)
  t('목록: 못 읽은 항목 0건', got.unreadable, 0)
  t('목록: 최신이 맨 앞 (목록 순서 그대로)', got.items[0].releasedAt, '2026-09-22T08:15:11.419Z')
  ok('목록: 내림차순이다', got.items.every((x, i) => i === 0 || got.items[i - 1].releasedAt >= x.releasedAt))
  ok('목록: 경로가 전부 /@ 로 시작한다', got.items.every((x) => x.path.startsWith('/@')))
  // 지킬 것 2 — 목록이 준 경로가 전부 글 ref 화이트리스트를 통과한다.
  ok('목록: 경로가 전부 글 ref 로 되읽힌다', got.items.every((x) => parseRefParts(`url:${x.path}`) !== null))
  ok('목록: 쿼리스트링이 없다', got.items.every((x) => !x.path.includes('?')))
  // 마스킹 확인 — 픽스처에 실명 표시가 남지 않았다.
  ok('픽스처: display_name 이 마스킹돼 있다', body.includes('display_name\\":\\"m****'))
}
{
  // 플라이트가 여러 조각으로 쪼개져도 이어 붙인다. 실측 페이지는 조각 10개였고
  // 목록은 한 조각 안에 있었지만, 경계가 어디에 오는지는 보장되지 않는다.
  const split =
    '<script>self.__next_f.push([1,"x:{\\"data\\":{\\"po"])</script>' +
    '<script>self.__next_f.push([1,"sts\\":[{\\"url_slug\\":\\"ab\\",\\"released_at\\":\\"2026-09-01T00:00:00.000Z\\",\\"user\\":{\\"username\\":\\"u1\\"}}]}}"])</script>'
  ok('플라이트: 조각 경계를 이어 붙인다', velogInternal.readFlight(split).includes('"posts":['))
  const got = readBoardList(split)
  t('플라이트: 쪼개진 목록도 읽는다', got.items.length, 1)
  t('플라이트: 경로를 조립한다', got.items[0].path, '/@u1/ab')
}
{
  // 지킬 것 1 — 컨테이너 없음은 "0건"이 아니다.
  const r = velogAdapter.parse(fx('velog', 'board-tag-missing-posts.html'), { productRef: BOARD_REF, cursor: null, page: 0 })
  t('컨테이너소실: readBoardList 가 null', readBoardList(fx('velog', 'board-tag-missing-posts.html')), null)
  t('컨테이너소실: parseFailures 1', r.parseFailures, 1)
  t('컨테이너소실: 적재 0건', r.reviews.length, 0)
  // ⚠️ **커서를 지우지 않는다.** 지우면 다음 실행이 목록 전체를 다시 큐에 넣는다.
  const keep = JSON.stringify({ q: ['/@a/b'], last: '2026-09-01T00:00:00.000Z' })
  const r2 = velogAdapter.parse(fx('velog', 'board-tag-missing-posts.html'), { productRef: BOARD_REF, cursor: keep, page: 0 })
  t('컨테이너소실: 큐를 유지한다', readBoardCursor(r2.nextCursor).q.length, 1)
  t('컨테이너소실: last 를 유지한다', readBoardCursor(r2.nextCursor).last, '2026-09-01T00:00:00.000Z')
}
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 뿐', '<html><body>hi</body></html>'],
  ['플라이트 마커만', '<script>self.__next_f.push([1,"x"])</script>'],
  ['깨진 JSON', '<script>self.__next_f.push([1,"{\\"posts\\":[{ broken"])</script>'],
]) {
  let threw = false
  let r = null
  try {
    r = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: null, page: 0 })
  } catch {
    threw = true
  }
  t(`쓰레기목록(${name}): throw 안 함`, threw, false)
  ok(`쓰레기목록(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
  ok(`쓰레기목록(${name}): 적재 0건`, r && r.reviews.length === 0)
}

// ══ 지킬 것 4: last 가 살아서 같은 글을 다시 받지 않는다 ═══════════
{
  const body = fx('velog', 'board-tag.html')
  const first = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: null, page: 0 })
  const c1 = readBoardCursor(first.nextCursor)
  t('증분: 첫 실행은 10건 전부 큐에 넣는다', c1.q.length, 10)
  t('증분: last 는 목록의 가장 최근 released_at', c1.last, '2026-09-22T08:15:11.419Z')
  t('증분: 목록 페이지는 리뷰를 내지 않는다', first.reviews.length, 0)

  // 같은 목록을 다시 받으면 새 글이 0건이다.
  const second = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: JSON.stringify({ q: [], last: c1.last }), page: 0 })
  t('증분: 두 번째 실행은 0건', readBoardCursor(second.nextCursor).q.length, 0)
  t('증분: last 는 그대로', readBoardCursor(second.nextCursor).last, c1.last)
  t('증분: 그리고 그것을 실패로 세지 않는다', second.parseFailures, 0)

  // last 가 목록 중간(09-08 09:02)이면 그보다 새것만 = 09-22 · 09-13 · 09-11.
  const mid = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: JSON.stringify({ q: [], last: '2026-09-08T09:02:06.743Z' }), page: 0 })
  t('증분: last 중간 → 그보다 새 글 3건', readBoardCursor(mid.nextCursor).q.length, 3)
  // ⚠️ **날짜가 아니라 원본 ISO 로 비교한다.** 같은 날 09:02 에 올라온 글이 있어서
  //    last 를 그날 00:00 으로 두면 4건이 된다(위와 1건 차이). 날짜 단위로 뭉개면
  //    이 1건을 매 실행 다시 받거나(>=) 영영 놓친다(>).
  const sameDay = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: JSON.stringify({ q: [], last: '2026-09-08T00:00:00.000Z' }), page: 0 })
  t('증분: 같은 날 더 늦은 글은 새 글이다 (3건 → 4건)', readBoardCursor(sameDay.nextCursor).q.length, 4)

  // 이미 큐에 있는 경로를 두 번 넣지 않는다.
  const dup = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: JSON.stringify({ q: [c1.q[0]], last: null }), page: 0 })
  t('증분: 큐 중복을 만들지 않는다', readBoardCursor(dup.nextCursor).q.length, 10)
}

// ══ nextRequest — 페이지 0 = 목록, 1~ = 큐 ═════════════════════════
{
  t('요청: page 0 은 목록', velogAdapter.nextRequest(target(), 0).url, LIST_URL)
  // 큐가 남아 있어도 page 0 이면 목록을 다시 받는다(실행당 1회). 새 글을 받는 통로다.
  const withQ = JSON.stringify({ q: ['/@a/b'], last: null })
  t('요청: 큐가 있어도 page 0 은 목록', velogAdapter.nextRequest(target({ cursor: withQ }), 0).url, LIST_URL)
  t('요청: page 1 은 큐의 맨 앞', velogAdapter.nextRequest(target({ cursor: withQ }), 1).url, `${VELOG_HOST}/@a/b`)
  t('요청: 큐가 비면 요청 없음 = 이번 실행 끝', velogAdapter.nextRequest(target({ cursor: '{"q":[],"last":null}' }), 1), null)
  ok('요청: 쿼리스트링을 만들지 않는다', !velogAdapter.nextRequest(target(), 0).url.includes('?'))
  ok('요청: /graphql 을 만들지 않는다 (POST 는 러너 GET 계약 밖)', !velogAdapter.nextRequest(target(), 0).url.includes('graphql'))
  t('요청: 호스트가 velog.io 와 정확히 일치', new URL(velogAdapter.nextRequest(target(), 0).url).host, 'velog.io')

  // 지킬 것 2 — 커서는 DB 를 거쳐 오므로 요청을 만들 때 한 번 더 본다.
  for (const evil of ['//evil.example/x', 'https://evil.example/@a/b', '/@a/../../etc', '/@a/b?x=1', '/free/1', '/@a/b c']) {
    t(`요청: 오염된 큐 값 거절 — ${evil}`, velogAdapter.nextRequest(target({ cursor: JSON.stringify({ q: [evil], last: null }) }), 1), null)
  }

  // page 를 안 넘기는 지금 러너 폴백 — 커서 null 이면 목록, 아니면 큐.
  t('폴백: page 없음 + 커서 null → 목록', velogAdapter.nextRequest(target()).url, LIST_URL)
  t('폴백: page 없음 + 큐 있음 → 큐', velogAdapter.nextRequest(target({ cursor: withQ })).url, `${VELOG_HOST}/@a/b`)
  t('폴백: page 없음 + 큐 빔 → 요청 없음 (목록을 20번 다시 받지 않는다)', velogAdapter.nextRequest(target({ cursor: '{"q":[],"last":null}' })), null)
}

// ══ 지킬 것 3: 댓글 마커 ═══════════════════════════════════════════
{
  const body = fx('velog', 'post.html')
  const state = velogInternal.readState(body)
  const postKey = Object.keys(state).find((k) => k.startsWith('Post:') && 'body' in state[k])
  const post = velogInternal.readPosts(state)[0]

  // 예전 마커 — 화해되지 않는다. 그래서 쓰지 않는다.
  t('마커: comments_count 는 11 (실측)', state[postKey].comments_count, 11)
  const roots = Object.keys(state).filter((k) => k.startsWith('Comment:'))
  t('마커: 루트 Comment 는 6건', roots.length, 6)
  t('마커: replies_count 합은 4', roots.reduce((s, k) => s + (state[k].replies_count ?? 0), 0), 4)
  ok('마커: 6+4=10 은 comments_count(11)와 화해되지 않는다', 6 + 4 !== state[postKey].comments_count)

  // 지금 마커 — 참조 배열 길이. 정확히 화해된다.
  t('마커: Post.comments 참조는 6개', post.commentRefs.length, 6)
  ok('마커: 참조가 전부 Comment: 키다', post.commentRefs.every((r) => r.startsWith('Comment:')))

  const r = velogAdapter.parse(body, { productRef: 'url:/@doondoony/mechanical-keyboards', cursor: null })
  t('댓글: 본문 1 + 댓글 6 = 7건', r.reviews.length, 7)
  // ⚠️ 여기가 핵심이다. comments_count 로 되돌아가면 11−10=1 이 매 실행 가짜 실패로 찍힌다.
  t('댓글: parseFailures 0 — 차액을 가짜 실패로 세지 않는다', r.parseFailures, 0)
  t('댓글: 본문의 storyId 는 null', r.reviews[0].storyId, null)
  ok('댓글: 댓글의 storyId 는 글 경로다', r.reviews.slice(1).every((x) => x.storyId === '/@doondoony/mechanical-keyboards'))
  ok('댓글: externalId 가 <글경로>#<uuid> 다', r.reviews.slice(1).every((x) => /^\/@doondoony\/mechanical-keyboards#[0-9a-f-]{36}$/.test(x.externalId)))
  ok('댓글: externalId 가 전부 다르다', new Set(r.reviews.map((x) => x.externalId)).size, 7)
  // 집계가 아니라 내용을 본다(§7.1 사례 4).
  ok('댓글: 실제 댓글 본문이 들어 있다', r.reviews.some((x) => x.text.includes('글작성은 노션으로 하신건가요?')))
  ok('댓글: 줄바꿈이 보존된다', r.reviews.some((x) => x.storyId && x.text.includes('\n')))
  // ⚠️ created_at 도 UTC ISO 다. 앞 10자를 쓰면 하루 어긋난다.
  const c0 = r.reviews.find((x) => x.text.startsWith('저는 회사에선 로지텍'))
  t('댓글: created_at 을 KST 로 변환한다 (2019-06-17T01:03Z → 06-17)', c0.writtenAt, '2019-06-17')
  const cLate = r.reviews.find((x) => x.text.startsWith('매직키보드는 나비식이'))
  t('댓글: 15:44Z 는 다음 날이다', cLate.writtenAt, '2020-08-02')

  // 참조가 풀리지 않으면 그게 "보이는데 못 읽은 수"다.
  const broken = body.replace('"Comment:bdcd4db0-909b-11e9-a381-cdb19866bede":', '"Cmt:bdcd4db0-909b-11e9-a381-cdb19866bede":')
  const rb = velogAdapter.parse(broken, { productRef: 'url:/@doondoony/mechanical-keyboards', cursor: null })
  t('댓글: 참조 미해소 1건을 실패로 센다', rb.parseFailures, 1)
  t('댓글: 나머지는 그대로 적재한다', rb.reviews.length, 6)
}
{
  // 댓글 0건은 고장이 아니다. 실측 /@papapat/…micuq9o1 이 `comments_count: 0` ·
  // `comments: []` · 루트 Comment 키 0개였다(2026-09-24 요청 ③).
  const body = blobPage({ username: 'papapat', slug: 'zero', comments: [] })
  const r = velogAdapter.parse(body, { productRef: 'url:/@papapat/zero', cursor: null })
  t('댓글0건: 본문만 적재', r.reviews.length, 1)
  t('댓글0건: 실패가 아니다', r.parseFailures, 0)
  // 반대쪽 — 참조는 있는데 루트가 통째로 없으면 실패다(0건과 다른 사건).
  const gone = blobPage({ username: 'papapat', slug: 'zero', comments: [{ id: 'x1', text: 'hi' }] }).replace(
    '"Comment:x1":',
    '"Cmt:x1":',
  )
  const rg = velogAdapter.parse(gone, { productRef: 'url:/@papapat/zero', cursor: null })
  t('댓글0건: 참조만 남고 루트가 없으면 실패', rg.parseFailures, 1)
  t('댓글0건: 그때도 본문은 적재한다', rg.reviews.length, 1)
}

// ══ 게시판 모드 글 페이지 ══════════════════════════════════════════
{
  const body = fx('velog', 'post.html')
  const cursor = JSON.stringify({ q: ['/@doondoony/mechanical-keyboards', '/@a/b'], last: '2026-09-01T00:00:00.000Z' })
  const r = velogAdapter.parse(body, { productRef: BOARD_REF, cursor, page: 1 })
  t('글페이지: 본문 1 + 댓글 6', r.reviews.length, 7)
  t('글페이지: 큐에서 하나 뺀다', readBoardCursor(r.nextCursor).q.length, 1)
  t('글페이지: 남은 것은 다음 글', readBoardCursor(r.nextCursor).q[0], '/@a/b')
  t('글페이지: last 는 건드리지 않는다', readBoardCursor(r.nextCursor).last, '2026-09-01T00:00:00.000Z')
  t('글페이지: externalId 는 큐의 경로다', r.reviews[0].externalId, '/@doondoony/mechanical-keyboards')

  // 스코프 — 큐의 글과 응답의 글이 다르면 한 건도 적재하지 않는다(SP-031).
  const wrong = JSON.stringify({ q: ['/@doondoony/posix-eol'], last: null })
  const rw = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: wrong, page: 1 })
  t('글페이지: 다른 글이 오면 적재 0건', rw.reviews.length, 0)
  ok('글페이지: 조용히 넘어가지 않는다', rw.parseFailures > 0)
  t('글페이지: 그래도 큐는 전진한다 (같은 글에 갇히지 않는다)', readBoardCursor(rw.nextCursor).q.length, 0)

  // 큐가 빈데 글 본문이 왔다 = 러너와 어긋났다.
  const empty = velogAdapter.parse(body, { productRef: BOARD_REF, cursor: '{"q":[],"last":null}', page: 1 })
  t('글페이지: 큐가 비었으면 적재 0건', empty.reviews.length, 0)
  t('글페이지: 그것을 실패로 보고한다', empty.parseFailures, 1)
}

// ══ 러너와 붙여 실제로 돌린다 (§7.1 사례 5: 부품 테스트로 끝내지 않는다) ══
{
  const listBody = fx('velog', 'board-tag.html')
  const robots = '# https://www.robotstxt.org/robotstxt.html\nUser-agent: *\n'
  let clock = Date.parse('2026-09-24T02:00:00+09:00')
  const urls = []
  const inputs = []
  const seenFp = new Map()
  const gaps = []

  // ⚠️ 스토어를 **상태를 가진 것으로** 만든다. 매번 새 타깃을 돌려주는 가짜
  //    스토어는 "다음 실행이 커서를 이어받는다"를 절대 못 본다 — 실행 간 규약이
  //    바로 이 트랙의 핵심인데 그게 테스트에서 통째로 빠진다(§7.1 사례 5).
  const row = { ...target() }

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      clock += 10
      if (url.endsWith('/robots.txt')) return { status: 200, body: robots }
      urls.push(url)
      if (url.includes('/tags/')) return { status: 200, body: listBody }
      // 글마다 자기 글을 돌려준다. 실제 사이트가 그렇게 동작한다.
      const p = decodeURIComponent(new URL(url).pathname)
      const [, handle, slug] = p.split('/')
      return {
        status: 200,
        body: blobPage({
          username: handle.slice(1),
          slug,
          comments: [
            { id: `${slug.slice(0, 6)}-c1`, text: `${slug} 에 달린 댓글 1` },
            { id: `${slug.slice(0, 6)}-c2`, text: `${slug} 에 달린 댓글 2` },
          ],
        }),
      }
    },
    store: {
      async loadSource() {
        return { key: 'velog', enabled: true, minIntervalMs: 5000, dailyRequestCap: 100, requestsToday: 0 }
      },
      async listDueTargets() {
        // 러너는 active 만 집는다(store.ts listDueTargets). 그 조건을 그대로 흉내낸다 —
        // 안 그러면 "닫혀서 다시 안 돈다"는 사고를 테스트가 못 본다.
        return row.status === undefined || row.status === 'active' ? [{ ...row }] : []
      },
      async saveTargetProgress(p) {
        row.cursor = p.cursor
        row.lastReviewAt = p.lastReviewAt
        row.consecutiveEmpty = p.consecutiveEmpty
        row.status = p.status
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

  // 실행당 목록 1 + 글 ≤19. 지금 러너는 page 를 안 넘기므로 폴백 경로로 돈다:
  // 커서 null → 목록 1회 → 큐 10건 → 글 10회. 합 11요청.
  t('러너: 요청 11건 (목록 1 + 글 10)', urls.length, 11)
  t('러너: 첫 요청이 목록', urls[0], LIST_URL)
  t('러너: 목록 요청은 1회뿐', urls.filter((u) => u.includes('/tags/')).length, 1)
  ok('러너: 나머지는 전부 글 경로', urls.slice(1).every((u) => u.startsWith(`${VELOG_HOST}/@`)))
  ok('러너: 전부 velog.io', urls.every((u) => new URL(u).host === 'velog.io'))
  ok('러너: 쿼리스트링 0건', urls.every((u) => !u.includes('?')))
  ok('러너: 요청 수가 페이지 상한 안이다', urls.length <= MAX_PAGES_PER_TARGET)
  // 요청 간격이 실제로 벌어졌는가 — velog 는 실행당 목록 1회·간격 5초로 묶는다.
  ok('러너: 간격 5초가 실제로 적용됐다', clock - Date.parse('2026-09-24T02:00:00+09:00') >= 5000 * 10)
  // ⚠️ §7.2 — 상한에 걸려 끝난 것을 정상으로 읽지 않는다.
  ok('러너: 페이지 상한으로 잘린 게 아니다', !r.perTarget[0].outcome.includes('페이지 상한'))
  t('러너: robots 로 건너뛴 요청 0건', r.robotsSkips, 0)
  t('러너: 파싱 실패 0', r.stats.parseFailures, 0)
  t('러너: health ok', r.health.health, 'ok')
  // 글 10건 × (본문 1 + 댓글 2) = 30건.
  t('러너: 30건 적재 (글 10 × 본문1+댓글2)', inputs.length, 30)
  t('러너: 지문도 30개', seenFp.size, 30)
  t('러너: 큐를 다 비웠다', readBoardCursor(row.cursor).q.length, 0)
  t('러너: last 가 남았다', readBoardCursor(row.cursor).last, '2026-09-22T08:15:11.419Z')

  // 재실행 — 같은 목록이면 새로 적재할 것이 없다.
  const before = inputs.length
  urls.length = 0
  const r2 = await runCollection(velogAdapter, { dryRun: false, targetLimit: 1 }, ports)
  t('러너: 재실행에서 새로 적재된 것 0건', inputs.length - before, 0)

  // ── 여기부터는 **러너 쪽 미비**를 고정한다(에이전트 X 몫) ──────────
  //
  // ⛔ 아래 두 줄은 **X 의 러너 변경이 머지되면 실패해야 한다. 그게 신호다.**
  //    "둘 다 허용"으로 느슨하게 쓰면 규약이 바뀐 것을 아무도 모른다(§7.1).
  if (row.status === 'exhausted') {
    gaps.push(
      'runner.ts `if (!req)` 가 status 를 literal `exhausted` 로 박는다(`cursor===null` 분기만 endStatus 를 쓴다). ' +
        '게시판 타깃은 커서를 계속 들고 있어 항상 이 분기로 끝나므로 incrementalOnly 가 무력화된다 → `status = endStatus` 로 바꿔야 한다',
    )
  }
  t('러너미비①: 지금은 exhausted 로 닫힌다 (X 머지 후 active 여야 한다)', row.status, 'exhausted')
  if (r2.targetsVisited === 0) {
    gaps.push(
      'nextRequest(target, page) · ParseContext.page 가 없어 "실행 시작(목록을 받아야 한다)"과 "큐 소진(이번 실행 끝)"을 ' +
        '구분할 수 없다(둘 다 큐가 비어 있다). 위 ① 를 고쳐 active 로 남겨도 두 번째 실행이 0요청으로 끝난다',
    )
  }
  t('러너미비②: 닫혀서 두 번째 실행은 타깃을 집지도 못한다', r2.targetsVisited, 0)
  t('러너미비②: 그래서 요청이 0건이다', urls.length, 0)

  console.log('')
  for (const g of gaps) console.log(`⚠️  러너 변경 필요(에이전트 X): ${g}`)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('게시판 모드가 틀렸다.')
  process.exit(1)
}
console.log('게시판 모드 정상 — velog 태그 순회는 큐/last 로 증분하고, damoang 목록은 서버가 막아 만들지 않았다.')
