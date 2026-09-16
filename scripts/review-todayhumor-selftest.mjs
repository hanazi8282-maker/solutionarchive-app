#!/usr/bin/env node
// 오늘의유머(todayhumor) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-16 에 실제로 받은 두 글에서 깎은 것이다
// (파싱 대상 영역은 마크업 원본 그대로, 광고·스크립트만 줄였다):
//   post-with-body.html    bestofbest_483825 — 제목 + 본문 + 원글작성시간
//   post-image-only.html   humordata_2060038 — 사진만, 원글작성시간 칸이 빔 (정상)
//   post-missing-body.html viewContent 컨테이너가 없음 (구조 변경 = 실패)
//   post-empty.html        제목도 본문도 없음 (구조 변경 = 실패)
//
// ⚠️ **이 소스는 본문 전용이다.** 댓글이 정적 HTML 에 없다(memoContainerDiv 가
//    빈 div, AJAX 로 채운다). "댓글 0건"은 실패가 아니라 설계된 결과다.
//    §7.1 의 "0건 vs 못 읽음" 구분은 본문에 걸어 둔다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { todayhumorAdapter, parseProductRef, HOST } from '../lib/review/adapters/todayhumor.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'todayhumor', n), 'utf8')

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

const PATH = '/board/view.php?table=bestofbest&no=483825'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'todayhumor',
  productRef: REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (over = {}) => ({ productRef: REF, cursor: null, ...over })

// ── product_ref 파싱 — 여기가 SSRF 경계다 ─────────────────────────
t('ref: 쿼리형 경로를 그대로 읽는다', parseProductRef(REF), PATH)
ok('ref: & 가 든 쿼리가 통과한다 (82cook 선례)', parseProductRef(REF).includes('&'))
t('ref: 앞뒤 공백 허용', parseProductRef(`  ${REF}  `), PATH)
t('ref: URL: 대문자 접두도 허용', parseProductRef(`URL:${PATH}`), PATH)
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: 경로가 / 로 시작하지 않으면 null', parseProductRef('url:board/view.php?no=1'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/board/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/x'), null)
t('ref: 경로 중간의 // 도 null', parseProductRef('url:/board//evil'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/board@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/board/view.php'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/board/view.php?no=1 2'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/board\\evil'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', todayhumorAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 www.todayhumor.co.kr 과 정확히 일치', new URL(todayhumorAdapter.nextRequest(target()).url).host, 'www.todayhumor.co.kr')
// ⚠️ 이 두 줄이 이 어댑터에서 제일 중요한 검사다.
//    무www 오리진은 **https → http 로 내려가는** 리다이렉트를 준다(실측).
//    러너는 redirect:'follow' 라 그걸 조용히 따라가고, 그때부터 평문이다.
ok('URL: www 오리진을 쓴다 (무www 는 http 로 다운그레이드된다)', todayhumorAdapter.nextRequest(target()).url.startsWith('https://www.'))
ok('URL: http 로 시작하지 않는다', !/^http:\/\//.test(todayhumorAdapter.nextRequest(target()).url))
t('URL: 잘못된 ref 면 요청하지 않는다', todayhumorAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', todayhumorAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', todayhumorAdapter.nextRequest(target({ cursor: '1' })), null)

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-with-body.html'), ctx())

  t('정상: 본문 1건', r.reviews.length, 1)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  // ⚠️ 등록시간(2026-09-16, 베오베로 올라온 날)이 아니라 원글작성시간이다.
  //    여기가 틀리면 전부 "오늘 쓴 글"로 적재된다.
  t('본문: 원글작성시간을 쓴다 (등록시간이 아니다)', post.writtenAt, '2026-09-10')
  ok('본문: writtenAt 이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(post.writtenAt))
  ok('본문: 제목이 들어 있다', post.text.includes('조국 원장 페북글입니다'))
  ok('본문: 본문 텍스트가 들어 있다', post.text.includes('계속 혁신당이 쇄빙선 역할로'))
  ok('본문: &nbsp; 가 공백으로 풀린다', !post.text.includes('&nbsp;'))
  // writerInfoContents 가 본문 바로 위에 있다. 슬라이스 시작점이 밀리면
  // 작성자 닉네임·IP·조회수가 리뷰 텍스트로 들어간다.
  ok('본문: 작성자 정보를 삼키지 않는다', !post.text.includes('아리나케이져'))
  ok('본문: IP 를 삼키지 않는다', !post.text.includes('125.185'))
  ok('본문: 게시물ID 줄을 삼키지 않는다', !post.text.includes('게시물ID'))

  t('전건: rating 은 항상 null', post.rating, null)
  t('전건: seller 는 항상 null', post.seller, null)
  t('전건: authorMasked 는 항상 null', post.authorMasked, null)
}

// ── 댓글은 정적 HTML 에 없다 (트립와이어) ─────────────────────────
{
  const html = fx('post-with-body.html')
  ok('댓글: 개수 마커는 있다 (`댓글 : N개`)', /<div>댓글 : \d+개<\/div>/.test(html))
  // 이게 깨지면 = 댓글이 정적으로 내려오기 시작했다 = 어댑터를 넓힐 때다.
  ok('댓글: memoContainerDiv 가 비어 있다', /<div id='memoContainerDiv'><\/div>/.test(html))

  const r = todayhumorAdapter.parse(html, ctx())
  // 댓글 5개짜리 글인데 1건만 나온다. 못 읽은 게 아니라 응답에 없다.
  t('댓글: 수집하지 않는다 (본문 1건만)', r.reviews.length, 1)
  t('댓글: 미수집을 실패로 세지 않는다', r.parseFailures, 0)
}

// ── 사진만 있는 글 — 실패가 아니다 ────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-image-only.html'), ctx())
  t('사진만: 1건 남는다 (제목)', r.reviews.length, 1)
  t('사진만: 실패로 세지 않는다', r.parseFailures, 0)
  ok('사진만: 제목이 텍스트가 된다', r.reviews[0].text.includes('치매로 비참하게'))
  // 일반 보드는 원글작성시간 칸이 비어 있다(`<div></div>`). 그때만 등록시간으로 내려간다.
  t('사진만: 원글작성시간이 없으면 등록시간으로 내려간다', r.reviews[0].writtenAt, '2026-09-16')
}

// ── 본문 컨테이너 소실 — 실패다 ───────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  t('본문소실: 제목이 있어도 리뷰를 만들지 않는다', r.reviews.length, 0)
  ok('본문소실: 사진만 있는 글과 다른 값이다', r.parseFailures !== 0)
}

// ── 제목도 본문도 없음 — 실패다 ───────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-empty.html'), ctx())
  ok('전부빔: parseFailures > 0', r.parseFailures > 0)
  t('전부빔: 리뷰 0건', r.reviews.length, 0)
}

// ── 닫는 주석이 사라져도 옆 영역을 통째로 삼키지 않는지 ───────────
{
  // `</div><!--viewContent-->` 가 사라지면 슬라이스가 문서 끝까지 간다.
  // 그러면 본문 뒤의 출처·스크랩 영역이 리뷰 텍스트로 섞이는데, **어댑터는
  // 그 상태를 감지하지 못한다**(텍스트가 나오니 실패로도 안 잡힌다).
  // 알려진 한계다 — 감시는 사람이 보는 길이 이상 탐지에 맡긴다.
  // ponytail: 닫는 주석 하나에 의존. 깨지면 div 세기(damoang sliceDiv)로 올려라.
  const r = todayhumorAdapter.parse(fx('post-with-body.html').replace('</div><!--viewContent-->', '</div>'), ctx())
  t('닫는주석 소실: 그래도 throw 하지 않는다', r.reviews.length, 1)
  ok('닫는주석 소실: 본문 자체는 살아 있다', r.reviews[0].text.includes('계속 혁신당이 쇄빙선 역할로'))
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['제목만 있고 본문 없음', '<meta property="og:title" content="x"/>'],
]) {
  let threw = false
  let r = null
  try {
    r = todayhumorAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
  ok(`쓰레기(${name}): 리뷰 0건`, r && r.reviews.length === 0)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('오늘의유머 파서가 틀렸다.')
  process.exit(1)
}
console.log('오늘의유머 파서 정상 — 본문 전용이고, 컨테이너 소실을 실패로 센다.')
