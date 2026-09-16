#!/usr/bin/env node
// 더쿠(theqoo) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-16 에 실제로 받은 https://theqoo.net/square/4347529638 에서
// 깎은 것이다(파싱 대상 영역은 마크업 원본 그대로, 광고·스크립트만 줄였다).
//   post-with-body.html    제목 + 본문 + 작성일 + AJAX 댓글 껍데기
//   post-image-only.html   본문 컨테이너는 멀쩡하고 텍스트만 없음 (정상)
//   post-missing-body.html <article itemprop="articleBody"> 가 없음 (구조 변경 = 실패)
//   post-empty.html        제목도 본문도 없음 (구조 변경 = 실패)
//
// ⚠️ **이 소스는 본문 전용이다.** 댓글이 정적 HTML 에 없다(loadReply AJAX).
//    그래서 "댓글 0건"은 여기서 실패가 아니라 **설계된 결과**다. 대신 §7.1 의
//    "0건 vs 못 읽음" 구분은 본문에 걸어 둔다 — 컨테이너가 사라지면 실패다.
//    픽스처에 댓글 껍데기(`댓글 <b>7</b>개` + 빈 #cmtPosition)를 남겨 둔 건,
//    나중에 더쿠가 댓글을 정적으로 내려주기 시작하면 아래 트립와이어가
//    깨져서 사람이 알아채게 하려는 것이다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { theqooAdapter, parseProductRef, HOST } from '../lib/review/adapters/theqoo.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'theqoo', n), 'utf8')

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

const PATH = '/square/4347529638'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'theqoo',
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
t('ref: 경로가 / 로 시작하지 않으면 null', parseProductRef('url:square/1'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/square/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/x'), null)
t('ref: 경로 중간의 // 도 null', parseProductRef('url:/square//evil'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/square@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/square/1'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/square/1 2'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/square\\evil'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', theqooAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 theqoo.net 과 정확히 일치', new URL(theqooAdapter.nextRequest(target()).url).host, 'theqoo.net')
// www 는 301 로 루트에 떨어진다(실측). 애초에 루트로 간다 — 리다이렉트를 타지 않는다.
ok('URL: www 를 쓰지 않는다', !theqooAdapter.nextRequest(target()).url.includes('www.'))
ok('URL: https 로만 간다', theqooAdapter.nextRequest(target()).url.startsWith('https://'))
t('URL: 잘못된 ref 면 요청하지 않는다', theqooAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', theqooAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', theqooAdapter.nextRequest(target({ cursor: '1' })), null)
ok('URL: 쿼리스트링을 만들지 않는다', !theqooAdapter.nextRequest(target()).url.includes('?'))

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = theqooAdapter.parse(fx('post-with-body.html'), ctx())

  t('정상: 본문 1건', r.reviews.length, 1)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  t('본문: 실측 작성일과 일치', post.writtenAt, '2026-09-16')
  ok('본문: writtenAt 이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(post.writtenAt))
  ok('본문: 제목이 들어 있다', post.text.includes('이게 찐 마리오지'))
  ok('본문: `더쿠 - ` 접두를 떼고 담는다', !post.text.startsWith('더쿠 -'))
  ok('본문: 본문 텍스트가 들어 있다', post.text.includes('이 줄기 타는걸 까먹었다고'))
  // 글 아래에 게시판 목록이 통째로 붙어 온다. 본문 슬라이스가 거기까지
  // 삼키면 옆 글 제목이 리뷰 텍스트로 섞인다.
  ok('본문: 아래 게시판 목록을 삼키지 않는다', !post.text.includes('스퀘어 공지'))
  ok('본문: 작성자 닉네임을 본문에 섞지 않는다', !post.text.includes('무명의 더쿠'))

  t('전건: rating 은 항상 null', post.rating, null)
  t('전건: seller 는 항상 null', post.seller, null)
  t('전건: authorMasked 는 항상 null', post.authorMasked, null)
}

// ── 댓글은 정적 HTML 에 없다 (트립와이어) ─────────────────────────
{
  const html = fx('post-with-body.html')
  // 이게 깨지면 = 더쿠가 댓글을 정적으로 내려주기 시작했다 = 어댑터를 넓힐 때다.
  ok('댓글: 개수 마커는 있다 (`댓글 <b>N</b>개`)', /댓글 <b>\d+<\/b>개/.test(html))
  ok('댓글: 그런데 항목 앵커는 0개다 (loadReply 가 AJAX 로 채운다)', !/id="comment_\d+"/.test(html))
  ok('댓글: loadReply 호출이 남아 있다', /loadReply\(\d+,/.test(html))

  const r = theqooAdapter.parse(html, ctx())
  // 댓글 7개짜리 글인데 1건만 나온다. **의도한 결과**다 — 못 읽은 게 아니라
  // 애초에 응답에 없다. 실패로 세면 매일 밤 가짜 경보가 뜬다.
  t('댓글: 수집하지 않는다 (본문 1건만)', r.reviews.length, 1)
  t('댓글: 미수집을 실패로 세지 않는다', r.parseFailures, 0)
}

// ── 사진만 있는 글 — 실패가 아니다 ────────────────────────────────
{
  const r = theqooAdapter.parse(fx('post-image-only.html'), ctx())
  t('사진만: 1건 남는다 (제목)', r.reviews.length, 1)
  t('사진만: 실패로 세지 않는다', r.parseFailures, 0)
  ok('사진만: 제목이 텍스트가 된다', r.reviews[0].text.includes('이게 찐 마리오지'))
}

// ── 본문 컨테이너 소실 — 실패다 ───────────────────────────────────
{
  const r = theqooAdapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  // 여기가 이 파일의 존재 이유다. 제목은 남아 있지만 그걸로 "정상 수집"을
  // 만들지 않는다(CLAUDE.md §7.1 사례 1).
  t('본문소실: 제목이 있어도 리뷰를 만들지 않는다', r.reviews.length, 0)
  ok('본문소실: 사진만 있는 글과 다른 값이다', r.parseFailures !== 0)
}

// ── 제목도 본문도 없음 — 실패다 ───────────────────────────────────
{
  const r = theqooAdapter.parse(fx('post-empty.html'), ctx())
  ok('전부빔: parseFailures > 0', r.parseFailures > 0)
  t('전부빔: 리뷰 0건', r.reviews.length, 0)
}

// ── 중첩 article 이 생겨도 앞에서 잘리지 않는다 ───────────────────
{
  // </article> 로 자르므로 본문 안에 <article> 이 중첩되면 앞에서 끊긴다.
  // 실측 페이지에는 article 이 1개뿐이지만, 끊겼을 때 "조용히 상한 데이터"가
  // 되지 않는지 확인해 둔다 — 최소한 앞부분은 살아 있어야 한다.
  const html = fx('post-with-body.html').replace('<p>트위터에서', '<article><p>트위터에서')
  const r = theqooAdapter.parse(html, ctx())
  t('중첩article: throw 하지 않는다', r.reviews.length, 1)
  ok('중첩article: 제목은 그대로 살아 있다', r.reviews[0].text.includes('이게 찐 마리오지'))
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['제목만 있고 본문 없음', '<title>더쿠 - x</title>'],
]) {
  let threw = false
  let r = null
  try {
    r = theqooAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
  ok(`쓰레기(${name}): 리뷰 0건`, r && r.reviews.length === 0)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('더쿠 파서가 틀렸다.')
  process.exit(1)
}
console.log('더쿠 파서 정상 — 본문 전용이고, 컨테이너 소실을 실패로 센다.')
