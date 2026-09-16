#!/usr/bin/env node
// 네이버 블로그 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-17 에 실제로 받은
// blog.naver.com/PostView.naver?blogId=naverofficial&logNo=224367462657 에서
// 깎은 것이다(마크업 원본 그대로, 본문 문단만 8개로 줄였다).
//   postview.html              정상 — 본문 + 발행일 + og:title
//   postview-missing-body.html se-main-container 가 없음 (구조 변경 = 실패)
//   pretty-url-shell.html      예쁜 URL 응답 **원본 그대로**(2,817 bytes)
//
// ⚠️ 이 파일의 핵심은 **"HTTP 200"과 "내용이 왔다"를 가르는 것**이다(§7.1).
//    예쁜 URL 은 200 을 주면서 내용이 0 이다. 그게 `pretty-url-shell.html` 이고,
//    아래 두 겹으로 막는다: (1) parseProductRef 가 그 주소를 아예 거부한다
//    (2) 그래도 그 본문이 들어오면 parse 가 실패로 센다.
//
// ⚠️ 댓글 관련 단정문이 하나도 없는 것은 실수가 아니다. 댓글은 다른 호스트
//    (apis.naver.com/commentBox/cbox9)의 XHR 이라 이 어댑터가 받지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { naverBlogAdapter, parseProductRef, HOST } from '../lib/review/adapters/naver-blog.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'naver-blog', n), 'utf8')

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

const PATH = '/PostView.naver?blogId=naverofficial&logNo=224367462657'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'naver_blog_post',
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
t('ref: 경로가 / 로 시작하지 않으면 null', parseProductRef('url:PostView.naver?blogId=a&logNo=1'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/../PostView.naver?blogId=a&logNo=1'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/x'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/PostView.naver?blogId=a@evil.example&logNo=1'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/PostView.naver?blogId=a&logNo=1'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/PostView.naver?blogId=a b&logNo=1'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/PostView.naver\\x?blogId=a&logNo=1'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── 경로를 /PostView.naver 하나로 한정하는 가드 ───────────────────
//
// (1) 예쁜 URL = HTTP 200 짜리 빈 껍데기(실측 2,817 bytes). 허용하면
//     "200인데 내용 0"을 조용히 수집한다.
t('가드: 예쁜 URL 은 거부한다 (빈 iframe 껍데기)', parseProductRef('url:/naverofficial/224367462657'), null)
t('가드: 블로그 홈도 거부', parseProductRef('url:/naverofficial'), null)
// (2) robots 가 금지한 경로가 구조적으로 못 들어온다.
t('가드: robots 금지 /PostList.naver', parseProductRef('url:/PostList.naver?blogId=a&logNo=1'), null)
t('가드: robots 금지 /PostPrint.naver', parseProductRef('url:/PostPrint.naver?blogId=a&logNo=1'), null)
t('가드: robots 금지 /PostPreview.naver', parseProductRef('url:/PostPreview.naver?blogId=a&logNo=1'), null)
t('가드: robots 금지 /NBlogPostPreview.naver', parseProductRef('url:/NBlogPostPreview.naver?blogId=a&logNo=1'), null)
t('가드: robots 금지 /BlogInfo.naver', parseProductRef('url:/BlogInfo.naver?blogId=a&logNo=1'), null)
t('가드: robots 금지 /prologue/', parseProductRef('url:/prologue/PrologueList.naver?blogId=a&logNo=1'), null)
t('가드: 댓글 경로(cbox 프록시)도 못 들어온다', parseProductRef('url:/CommentList.naver?blogId=a&logNo=1'), null)
// (3) 파라미터가 하나라도 없으면 거부
t('가드: blogId 가 없으면 null', parseProductRef('url:/PostView.naver?logNo=1'), null)
t('가드: logNo 가 없으면 null', parseProductRef('url:/PostView.naver?blogId=a'), null)
t('가드: 쿼리가 아예 없으면 null', parseProductRef('url:/PostView.naver'), null)
t('가드: logNo 가 숫자가 아니면 null', parseProductRef('url:/PostView.naver?blogId=a&logNo=abc'), null)
t('가드: blogId 에 기호가 섞이면 null', parseProductRef('url:/PostView.naver?blogId=a-b&logNo=1'), null)
// (4) 정규화 — 같은 글이 두 externalId 로 쌓이지 않게
t('정규화: 파라미터 순서를 맞춘다', parseProductRef('url:/PostView.naver?logNo=224367462657&blogId=naverofficial'), PATH)
t('정규화: 군더더기 파라미터는 떨어진다', parseProductRef(`url:${PATH}&from=search&redirect=Dlog`), PATH)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', naverBlogAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 blog.naver.com 과 정확히 일치', new URL(naverBlogAdapter.nextRequest(target()).url).host, 'blog.naver.com')
t('URL: 잘못된 ref 면 요청하지 않는다', naverBlogAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 예쁜 URL ref 로는 요청하지 않는다', naverBlogAdapter.nextRequest(target({ productRef: 'url:/naverofficial/224367462657' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', naverBlogAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', naverBlogAdapter.nextRequest(target({ cursor: '1' })), null)
ok('URL: page 쿼리를 만들지 않는다', !/[?&]page=/.test(naverBlogAdapter.nextRequest(target()).url))
ok('URL: 글을 가리키는 쿼리는 살아 있다', /[?&]blogId=naverofficial/.test(naverBlogAdapter.nextRequest(target()).url) && /[?&]logNo=224367462657/.test(naverBlogAdapter.nextRequest(target()).url))
t('URL: 어느 호스트로도 apis.naver.com 을 때리지 않는다', naverBlogAdapter.nextRequest(target()).url.includes('apis.naver.com'), false)

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = naverBlogAdapter.parse(fx('postview.html'), ctx())

  t('정상: 본문 1건', r.reviews.length, 1)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post] = r.reviews
  t('본문: externalId 는 <blogId>:<logNo>', post.externalId, 'naverofficial:224367462657')
  t('본문: storyId 는 null (댓글을 안 받는다)', post.storyId, null)
  t('본문: 실측 발행일과 일치', post.writtenAt, '2026-08-04')
  ok('본문: 제목이 들어 있다', post.text.includes('네이버 메이트 인터뷰'))
  ok('본문: 실제 본문이 들어 있다', post.text.includes('MJ의후다닥레시피'))
  // 비탐욕 정규식으로 잘랐다면 첫 문단에서 끊겨 여기가 깨진다.
  // (픽스처는 문단 8개로 줄였다. 실제 응답 전문은 7,105자로 읽히는 것을
  //  라이브 프로브에서 확인했다 — docs/review-source-findings.md)
  ok('본문: 중첩 div 뒤쪽 문단까지 읽는다', post.text.includes('님을 만났습니다'))
  ok('본문: 첫 문단에서 끊기지 않는다', post.text.length > 200)
  // 스마트에디터가 넣는 제로폭 공백이 남으면 본문이 읽을 수 없게 된다.
  ok('본문: 제로폭 공백이 제거된다', !post.text.includes('​'))
  ok('본문: HTML 엔티티가 풀린다', !post.text.includes('&#x27;') && !post.text.includes('&nbsp;'))
  ok('본문: 태그가 남지 않는다', !/<[a-z]/i.test(post.text))

  t('전건: rating 은 항상 null', post.rating, null)
  t('전건: seller 는 항상 null', post.seller, null)
  t('전건: authorMasked 는 항상 null', post.authorMasked, null)
  ok('전건: externalId 를 확보했다 (composite 폴백 없음)', Boolean(post.externalId))
}

// ── 본문 컨테이너 소실 — 실패다 ───────────────────────────────────
{
  const r = naverBlogAdapter.parse(fx('postview-missing-body.html'), ctx())
  t('본문소실: 리뷰 0건', r.reviews.length, 0)
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
}

// ── 예쁜 URL 껍데기 — HTTP 200 인데 내용 0 ────────────────────────
//
// 이 블록이 이 파일의 존재 이유다. 상태 코드로 판정하면 이걸 정상으로 적는다.
{
  const shell = fx('pretty-url-shell.html')
  const r = naverBlogAdapter.parse(shell, ctx())
  t('껍데기: 리뷰 0건', r.reviews.length, 0)
  ok('껍데기: parseFailures >= 1', r.parseFailures >= 1)
  // 정상 글과 **다른 값**이어야 한다. 같아지면 구분이 사라진다.
  const good = naverBlogAdapter.parse(fx('postview.html'), ctx())
  ok('껍데기: 정상 글과 다른 판정이다', r.parseFailures !== good.parseFailures)
  // 껍데기의 실체 — 마커가 없고 크기가 3KB 미만이다.
  ok('껍데기: se-main-container 가 없다', !shell.includes('se-main-container'))
  ok('껍데기: 3KB 미만이다 (실측 2,817 bytes)', shell.length < 3000)
  ok('껍데기: iframe 프레임셋이다', shell.includes('mainFrame'))
}

// ── 댓글을 수집하지 않는다는 것을 고정한다 ────────────────────────
//
// cbox 설정값은 페이지에 있지만 댓글 **텍스트**는 없다(실측 u_cbox_contents 0개).
// 나중에 누가 댓글을 붙이려 하면 이 단정문이 먼저 깨져서 SP-030 을 보게 된다.
{
  const html = fx('postview.html')
  ok('댓글: 픽스처에 cbox 설정값은 있다', html.includes('commentBox/cbox9'))
  ok('댓글: 그런데 댓글 텍스트 마커는 0개다', !html.includes('u_cbox_contents'))
  const r = naverBlogAdapter.parse(html, ctx())
  t('댓글: 그래서 수집 결과는 본문 1건뿐이다', r.reviews.length, 1)
  ok('댓글: storyId 를 쓰는 항목이 없다', r.reviews.every((x) => x.storyId === null))
}

// ── 발행일 마커가 없으면 추정하지 않는다 ──────────────────────────
{
  const noDate = fx('postview.html').replace(/<span class="se_publishDate[^>]*>[^<]*<\/span>/, '')
  const r = naverBlogAdapter.parse(noDate, ctx())
  t('무날짜: writtenAt 은 null (추정 금지)', r.reviews[0].writtenAt, null)
  t('무날짜: 실패로 세지 않는다 — 본문은 읽었다', r.parseFailures, 0)
}

// ── 한 자리 월/일도 0 을 채운다 ───────────────────────────────────
{
  const html = '<meta property="og:title" content="t"/>' +
    '<span class="se_publishDate pcol2">2026. 1. 2. 9:05</span>' +
    '<div class="se-main-container"><p>본문</p></div>'
  const r = naverBlogAdapter.parse(html, ctx())
  t('한자리날짜: 2026-01-02 로 채운다', r.reviews[0].writtenAt, '2026-01-02')
}

// ── 중첩 div 가 있어도 본문이 앞에서 잘리지 않는다 ────────────────
{
  const html = '<meta property="og:title" content="t"/>' +
    '<div class="se-main-container"><div class="se-component"><p>앞</p></div>' +
    '<div class="se-component"><div class="se-section"><p>뒤</p></div></div></div>'
  const r = naverBlogAdapter.parse(html, ctx())
  ok('중첩div: 앞부분이 있다', r.reviews[0].text.includes('앞'))
  ok('중첩div: 뒷부분도 있다 — 비탐욕 정규식이면 여기가 깨진다', r.reviews[0].text.includes('뒤'))
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['컨테이너가 안 닫힘', '<div class="se-main-container"><p>본문'],
  ['제목만 있고 본문 없음', '<meta property="og:title" content="제목만"/>'],
]) {
  let threw = false
  let r = null
  try {
    r = naverBlogAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('네이버 블로그 파서가 틀렸다.')
  process.exit(1)
}
console.log('네이버 블로그 파서 정상 — 200 껍데기와 실제 본문을 가른다.')
