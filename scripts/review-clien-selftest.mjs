#!/usr/bin/env node
// 클리앙(clien) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-17 에 실제로 받은
// https://www.clien.net/service/board/park/19264755 에서 깎았다
// (파싱 대상 영역은 마크업 원본 그대로, 광고·네비만 줄였다).
//   post-with-comments.html    본문 + 댓글 3건, 마커도 3
//   post-no-comments.html      마커 [0] + 항목 0 (정상 — 실패 아님)
//   post-missing-comments.html 마커 [3] + 항목 0 (못 읽음 = 실패)
//   post-missing-body.html     post_article 이 없음 (구조 변경 = 실패)
//
// ⚠️ **이 파일의 절반은 robots 가드다.** 클리앙은 우리 UA 에게 robots.txt 를
//    404 로 준다(SP-027). 러너는 4xx 를 "허용"으로 읽으므로, 사이트가 실제로
//    건 규칙을 지키는 장치가 parseProductRef 하나뿐이다. 그래서 여기서
//    robots 원문의 Disallow 를 하나하나 단정한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clienAdapter, parseProductRef, HOST } from '../lib/review/adapters/clien.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'clien', n), 'utf8')

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

const PATH = '/service/board/park/19264755'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'clien',
  productRef: REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (over = {}) => ({ productRef: REF, cursor: null, ...over })

// ── product_ref 파싱 — SSRF 경계 ──────────────────────────────────
t('ref: url:<경로> 를 경로로 읽는다', parseProductRef(REF), PATH)
t('ref: 앞뒤 공백 허용', parseProductRef(`  ${REF}  `), PATH)
t('ref: URL: 대문자 접두도 허용', parseProductRef(`URL:${PATH}`), PATH)
t('ref: 다른 게시판도 통과', parseProductRef('url:/service/board/news/19264504'), '/service/board/news/19264504')
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/service/board/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/service/board/park/1'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/service/board/park@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/service/board/park/1'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/service/board\\evil'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/service/board/park/1 2'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)

// ── robots 를 코드로 내재화한 가드 (SP-027) ───────────────────────
// 클리앙 robots 의 `User-agent: *` 원문을 그대로 옮겨 단정한다.
// 이게 깨지면 = 우리가 사이트가 막은 경로를 긁고 있다는 뜻이다.
t('robots: `Disallow: /*?*` — 쿼리가 붙으면 null', parseProductRef('url:/service/board/park/1?po=2'), null)
t('robots: 쿼리가 비어 있어도 `?` 면 null', parseProductRef('url:/service/board/park/1?'), null)
t('robots: 정렬 쿼리도 null', parseProductRef('url:/service/board/park?&od=T33'), null)
t('robots: `Allow:/service/board/` 밖은 null — /service/group/', parseProductRef('url:/service/group/community'), null)
t('robots: `/service/mypage/` 는 null', parseProductRef('url:/service/mypage/1'), null)
t('robots: `/service/message/` 는 null', parseProductRef('url:/service/message/1'), null)
t('robots: `/service/search/` 는 null', parseProductRef('url:/service/search/x'), null)
t('robots: `/service/cs/` 는 null', parseProductRef('url:/service/cs/1'), null)
t('robots: `/service/recommend` 는 null', parseProductRef('url:/service/recommend'), null)
t('robots: `/service/popup/` 는 null', parseProductRef('url:/service/popup/1'), null)
// 허용 접두 **안쪽**에서 다시 막히는 둘. 접두 검사만 하면 여기서 샌다.
t('robots: `Disallow:/service/board/sold/` — 중고장터는 null', parseProductRef('url:/service/board/sold/19264755'), null)
t('robots: `Disallow:/service/board/hongbo/` — 직접홍보는 null', parseProductRef('url:/service/board/hongbo/19264755'), null)
t('robots: 게시판 이름이 sold 로 시작만 해도 되는 건 통과', parseProductRef('url:/service/board/soldier/1'), '/service/board/soldier/1')
t('robots: 서비스 밖 경로는 null', parseProductRef('url:/admin/1'), null)
t('robots: 루트는 null', parseProductRef('url:/'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', clienAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 www.clien.net 과 정확히 일치', new URL(clienAdapter.nextRequest(target()).url).host, 'www.clien.net')
// apex 는 robots 도 404 고 글 주소가 www 로 리다이렉트된다. 애초에 www 로 간다.
ok('URL: apex(clien.net)로 가지 않는다', new URL(clienAdapter.nextRequest(target()).url).host.startsWith('www.'))
ok('URL: https 로만 간다', clienAdapter.nextRequest(target()).url.startsWith('https://'))
ok('URL: 쿼리스트링을 만들지 않는다', !clienAdapter.nextRequest(target()).url.includes('?'))
t('URL: 잘못된 ref 면 요청하지 않는다', clienAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 쿼리형 ref 면 요청하지 않는다', clienAdapter.nextRequest(target({ productRef: 'url:/service/board/park/1?po=2' })), null)
t('URL: 금지 게시판이면 요청하지 않는다', clienAdapter.nextRequest(target({ productRef: 'url:/service/board/sold/1' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', clienAdapter.nextRequest(target({ cursor: '1' })), null)

// ── 정상 글 + 댓글 ────────────────────────────────────────────────
{
  const r = clienAdapter.parse(fx('post-with-comments.html'), ctx())

  t('정상: 본문 1 + 댓글 3 = 4건', r.reviews.length, 4)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)

  const [post, ...comments] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  t('본문: 실측 작성일과 일치', post.writtenAt, '2026-09-16')
  ok('본문: 제목이 들어 있다', post.text.includes('프로토타이핑'))
  ok('본문: 본문 텍스트가 들어 있다', post.text.includes('발표하고 사흘 만에'))
  // post_article 안에 <html><body> 가 통째로 들어 있다. 비탐욕 정규식으로
  // 자르면 여기서 앞부분만 남고 조용히 데이터가 상한다.
  ok('본문: 중첩 div 뒤의 내용까지 읽는다', post.text.includes('앞에서 잘리면 안 된다'))
  ok('본문: 댓글을 본문에 섞지 않는다', !post.text.includes('정책 입안자가 무능해서'))
  ok('본문: HTML 엔티티를 푼다', post.text.includes('모르겠습니다'))

  t('댓글: 3건', comments.length, 3)
  t('댓글: externalId 는 <경로>#<앵커id>', comments[0].externalId, `${PATH}#152397724`)
  t('댓글: storyId 가 글 경로', comments[0].storyId, PATH)
  ok('댓글: 본문이 들어 있다', comments[0].text.includes('정책 입안자가 무능해서'))
  ok('댓글: <br> 이 줄바꿈이 된다', comments[0].text.includes('\n다른 이유가 없어요'))
  // 수정용 hidden input 에 같은 텍스트가 한 번 더 들어 있다. 안 지우면 두 번 적힌다.
  t('댓글: hidden input 때문에 본문이 두 번 적히지 않는다', comments[0].text.split('정책 입안자').length - 1, 1)
  // 다모앙과 다른 점. 클리앙 댓글에는 4자리 연도가 붙은 절대시각이 있다.
  t('댓글: 절대시각에서 작성일을 읽는다', comments[0].writtenAt, '2026-09-16')
  ok('댓글: 전건 writtenAt 이 YYYY-MM-DD', comments.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.writtenAt)))
  ok('댓글: 앵커별로 다른 id 를 쓴다', new Set(comments.map((c) => c.externalId)).size === 3)
  ok('댓글: 엔티티를 푼다', comments[2].text.includes('<공지>') && comments[2].text.includes('&'))
  // 각 댓글이 다음 앵커 전까지만 잘려야 한다. 안 그러면 뒤 댓글을 삼킨다.
  ok('댓글: 뒤 댓글을 삼키지 않는다', !comments[0].text.includes('이번 건은 진짜'))

  ok('전건: rating 은 항상 null', r.reviews.every((x) => x.rating === null))
  ok('전건: seller 는 항상 null', r.reviews.every((x) => x.seller === null))
  ok('전건: authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))
}

// ── 댓글 0건 — 실패가 아니다 ──────────────────────────────────────
{
  const html = fx('post-no-comments.html')
  ok('0건: 마커가 [0] 으로 남아 있다', /댓글 • \[<strong>0<\/strong>\]/.test(html))

  const r = clienAdapter.parse(html, ctx())
  t('0건: 본문 1건만', r.reviews.length, 1)
  // 여기가 §7.1 의 핵심이다. "0건"과 "못 읽음"을 마커로 가른다.
  t('0건: 실패로 세지 않는다', r.parseFailures, 0)
}

// ── 마커는 있는데 항목이 없다 — 실패다 ────────────────────────────
{
  const r = clienAdapter.parse(fx('post-missing-comments.html'), ctx())
  t('댓글소실: 본문 1건은 살린다', r.reviews.length, 1)
  // 3건 보인다는데 0건 읽혔다. 0건 파싱과 **다른 사건**이다.
  t('댓글소실: 못 읽은 3건을 실패로 센다', r.parseFailures, 3)
}

// ── 본문 컨테이너 소실 — 실패다 ───────────────────────────────────
{
  const r = clienAdapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  // 댓글은 읽히므로 "수집은 되는데 글이 없는" 상태가 된다. 그걸 실패로 찍는다.
  ok('본문소실: 댓글 3건은 그대로 읽는다', r.reviews.length === 3)
  ok('본문소실: 글 본문 리뷰가 없다', r.reviews.every((x) => x.storyId !== null))
}

// ── 댓글 본문 컨테이너 클래스가 바뀌면 실패다 ─────────────────────
{
  const html = fx('post-with-comments.html').replaceAll('class="comment_view"', 'class="cmt_view_v2"')
  const r = clienAdapter.parse(html, ctx())
  t('클래스변경: 본문 1건만 남는다', r.reviews.length, 1)
  t('클래스변경: 댓글 3건을 실패로 센다', r.parseFailures, 3)
}

// ── 댓글 페이저가 생기면 조용히 누락되지 않는다 ───────────────────
{
  // 클리앙은 지금 한 페이지에 전부 내려준다(실측 0·7·17건). 나중에 바뀌면
  // 마커 > 앵커가 되어 여기서 터진다 — 그게 의도다.
  const html = fx('post-with-comments.html').replace('[<strong>3</strong>]', '[<strong>60</strong>]')
  const r = clienAdapter.parse(html, ctx())
  t('페이저(가정): 못 읽은 57건이 실패로 잡힌다', r.parseFailures, 57)
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['제목만 있고 본문 없음', '<h3 class="post_subject" data-role="x"><span>제목</span></h3>'],
]) {
  let threw = false
  let r = null
  try {
    r = clienAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  // 본문 소실 1 + 댓글영역 소실 1 = 최소 2.
  ok(`쓰레기(${name}): parseFailures >= 2`, r && r.parseFailures >= 2)
  ok(`쓰레기(${name}): 리뷰 0건`, r && r.reviews.length === 0)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('클리앙 파서가 틀렸다. robots 가드는 이 파일이 유일한 방어선이다.')
  process.exit(1)
}
console.log('클리앙 파서 정상 — robots 를 코드로 지키고, 댓글 0건과 구조 소실을 가른다.')
