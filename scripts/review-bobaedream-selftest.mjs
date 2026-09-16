#!/usr/bin/env node
// 보배드림 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-17 에 실제로 받은
// https://www.bobaedream.co.kr/view?code=freeb&No=2000000 에서 깎은 것이다
// (마크업 원본 그대로, 댓글 23건 중 4건만 남기고 개수 마커를 맞췄다).
//   post-with-comments.html    본문 + 댓글 4건
//   post-no-comments.html      본문 + 댓글 0건 (정상. 실패가 아니다)
//   post-missing-comments.html 댓글 영역이 통째로 없음 (구조 변경 = 실패)
//   post-missing-body.html     bodyCont 가 없음 (구조 변경 = 실패)
//
// ⚠️ 이 파일이 지키는 핵심은 **"0건"과 "못 읽음"을 절대 같은 값으로 만들지
//    않는 것**이다(CLAUDE.md §7.1). 보배드림은 댓글 수를 화면에 찍어 주므로
//    (`댓글 (N)`) 마커와 실제 항목 수를 대조할 수 있다.
//
// ⚠️ 그리고 **없는 게시판이 HTTP 200 에 121바이트로 온다**(실측 code=strange).
//    상태 코드로 성공을 판정하면 그걸 정상 수집으로 적게 된다. 아래
//    "껍데기 200" 블록이 그 경우를 고정해 둔다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bobaedreamAdapter, parseProductRef, HOST } from '../lib/review/adapters/bobaedream.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'bobaedream', n), 'utf8')

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

const PATH = '/view?code=freeb&No=2000000'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'bobaedream',
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
t('ref: 경로가 / 로 시작하지 않으면 null', parseProductRef('url:view?code=freeb&No=1'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/view/../admin?code=freeb&No=1'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/x'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/view?code=freeb&No=1@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/view?code=freeb&No=1'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/view?code=free b&No=1'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/view\\evil?code=freeb&No=1'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── 글이 아닌 경로를 막는 가드 ────────────────────────────────────
// 이게 없으면 HTTP 200 인데 bodyCont 가 없는 페이지가 타깃으로 들어와
// parseFailures 만 쌓고, 남의 실수로 소스 건강도가 broken 이 된다.
t('가드: /view 가 아니면 null', parseProductRef('url:/list?code=freeb'), null)
t('가드: 중고차 목록 페이지는 null', parseProductRef('url:/mycar/mycar_list.php?gubun=K'), null)
t('가드: 쿼리가 아예 없으면 null', parseProductRef('url:/view'), null)
t('가드: code 가 없으면 null', parseProductRef('url:/view?No=2000000'), null)
t('가드: No 가 없으면 null', parseProductRef('url:/view?code=freeb'), null)
t('가드: No 가 숫자가 아니면 null', parseProductRef('url:/view?code=freeb&No=abc'), null)
t('가드: code 에 기호가 섞이면 null', parseProductRef('url:/view?code=free-b&No=1'), null)
// /view.php 도 같은 글을 주지만 받지 않는다 — 받으면 같은 글이 두 externalId 로 쌓인다.
t('가드: /view.php 표기는 받지 않는다', parseProductRef('url:/view.php?code=freeb&No=2000000'), null)
// 파라미터 순서가 달라도 같은 글은 같은 경로가 돼야 한다.
t('가드: 파라미터 순서를 정규화한다', parseProductRef('url:/view?No=2000000&code=freeb'), PATH)
t('가드: 군더더기 파라미터는 떨어진다', parseProductRef('url:/view?code=freeb&No=2000000&s_cate=&page=3'), PATH)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', bobaedreamAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 www.bobaedream.co.kr 과 정확히 일치', new URL(bobaedreamAdapter.nextRequest(target()).url).host, 'www.bobaedream.co.kr')
t('URL: 잘못된 ref 면 요청하지 않는다', bobaedreamAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', bobaedreamAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
// 1글=1요청이다. 커서가 있다는 건 이미 한 번 받았다는 뜻이라 다시 가지 않는다.
t('URL: 커서가 있으면 더 요청하지 않는다', bobaedreamAdapter.nextRequest(target({ cursor: '1' })), null)
// 러너는 robots 판정에 쿼리를 넘기지 않는다(runner.ts:153, SP-026). 보배드림
// robots 는 전면 허용이라 지금은 구멍이 없지만, 규칙이 생기면 즉시 문제가 된다.
// 그러니 애초에 페이지네이션을 만들지 않는다.
ok('URL: page 쿼리를 만들지 않는다', !/[?&]page=/.test(bobaedreamAdapter.nextRequest(target()).url))

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = bobaedreamAdapter.parse(fx('post-with-comments.html'), ctx())

  t('정상: 본문 1 + 댓글 4 = 5건', r.reviews.length, 5)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post, ...comments] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  t('본문: 실측 작성일과 일치', post.writtenAt, '2020-04-22')
  ok('본문: 제목이 들어 있다', post.text.includes('이거 3D그래픽 이라는데 검증 좀'))
  // 제목 뒤 `[23]` 은 댓글 수다. 제목에 섞이면 안 된다.
  ok('본문: 제목에 댓글 수 [23] 가 섞이지 않는다', !post.text.includes('[23]'))
  ok('본문: 본문이 들어 있다', post.text.includes('아니죠'))

  t('댓글: 4건', comments.length, 4)
  ok('댓글: externalId 가 <글경로># 로 시작', comments.every((c) => c.externalId.startsWith(`${PATH}#`)))
  t('댓글: externalId 에 앵커 id 가 들어간다', comments[0].externalId, `${PATH}#small_cmt_1018376`)
  t('댓글: externalId 중복 없음', new Set(r.reviews.map((x) => x.externalId)).size, 5)
  ok('댓글: storyId 가 글 경로', comments.every((c) => c.storyId === PATH))
  ok('댓글: 본문이 비어 있지 않다', comments.every((c) => c.text.length > 0))
  ok('댓글: 실제 본문이 읽힌다', comments.some((c) => c.text.includes('다시 태어나고 싶드앙')))
  // 작성자 닉네임·레벨·신고 링크가 본문에 섞이면 안 된다. <dd> 경계가 그걸 막는다.
  ok('댓글: 작성자 닉네임이 본문에 섞이지 않는다', comments.every((c) => !c.text.includes('뽕자')))
  ok('댓글: 신고 링크가 본문에 섞이지 않는다', comments.every((c) => !c.text.includes('신고')))
  // 82cook 과 달리 댓글에 2자리 **연도**가 있다. 추정이 아니라 표기된 값이다.
  ok('댓글: writtenAt 이 전부 YYYY-MM-DD', comments.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.writtenAt)))
  t('댓글: 첫 댓글 작성일', comments[0].writtenAt, '2020-04-22')
  // 각 댓글이 **자기** 날짜를 가져야 한다. 앞 댓글 것을 주워 오면 전부 같아진다.
  ok('댓글: 날짜가 글 작성일 이후다', comments.every((c) => c.writtenAt >= '2020-04-22'))

  ok('전건: rating 은 항상 null', r.reviews.every((x) => x.rating === null))
  ok('전건: seller 는 항상 null', r.reviews.every((x) => x.seller === null))
  ok('전건: authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))
  ok('전건: externalId 를 전부 확보했다 (composite 폴백 없음)', r.reviews.every((x) => x.externalId))
}

// ── 댓글 0건 — 정상이다 ───────────────────────────────────────────
{
  const r = bobaedreamAdapter.parse(fx('post-no-comments.html'), ctx())
  t('댓글0: 본문 1건만', r.reviews.length, 1)
  t('댓글0: 실패 0 — 댓글이 없는 것은 고장이 아니다', r.parseFailures, 0)
  t('댓글0: 커서 없음', r.nextCursor, null)
}

// ── 댓글 영역 소실 — 실패다 ───────────────────────────────────────
{
  const r = bobaedreamAdapter.parse(fx('post-missing-comments.html'), ctx())
  ok('댓글소실: parseFailures > 0', r.parseFailures > 0)
  // 이게 이 파일의 존재 이유다. 위 "댓글0" 과 값이 같아지면 안 된다.
  const zero = bobaedreamAdapter.parse(fx('post-no-comments.html'), ctx())
  ok('댓글소실: 댓글 0건과 다른 값이다', r.parseFailures !== zero.parseFailures)
  t('댓글소실: 본문은 그래도 읽는다', r.reviews.length, 1)
}

// ── 본문(bodyCont) 소실 — 실패다 ──────────────────────────────────
{
  const r = bobaedreamAdapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  ok('본문소실: 본문 항목이 없다', !r.reviews.some((x) => x.storyId === null))
  t('본문소실: 댓글은 그래도 읽는다', r.reviews.length, 4)
}

// ── 껍데기 200 — 없는 게시판(실측 code=strange, 121바이트) ────────
// HTTP 200 이라고 성공이 아니다. 본문도 댓글도 없으니 실패 2건이어야 한다.
{
  const r = bobaedreamAdapter.parse('<html><body><div id="wrap"></div></body></html>', ctx())
  t('껍데기200: 리뷰 0건', r.reviews.length, 0)
  ok('껍데기200: parseFailures >= 2 (본문 + 댓글영역)', r.parseFailures >= 2)
}

// ── 마커는 있는데 한 건도 못 읽으면 실패 ──────────────────────────
{
  // 마커는 4 인데 앵커 id 규칙이 통째로 바뀌었다 = 진짜 고장이다.
  const broken = fx('post-with-comments.html').replace(/id="small_cmt_\d+"/g, 'id="cmt_x"')
  const r = bobaedreamAdapter.parse(broken, ctx())
  t('앵커전멸: 실패로 센다', r.parseFailures, 1)
  t('앵커전멸: 댓글 0건', r.reviews.length, 1)
}

// ── 마커보다 적게 온 것은 실패가 아니다 (사이트가 나눠 준다) ──────
//
// ⚠️ damoang·82cook 은 `declared - anchors` 를 실패로 센다. 보배드림에 같은
//    규칙을 쓰면 안 된다는 것이 실측에서 나왔다(2026-09-17):
//      댓글 155건 글 → 정적 HTML 앵커 55개. 나머지는 comment_list.php 로 온다.
//      댓글 21·12·12·5·1건 글 → 전부 일치.
//    차이를 실패로 세면 인기 글 하나가 실패 100건을 찍어 소스를 broken 으로
//    꺼뜨린다. 구조가 깨진 게 아니라 사이트가 나눠 주는 것이다(§7.2).
{
  const partial = fx('post-with-comments.html').replace('<span class="comm2">(4)</span>', '<span class="comm2">(155)</span>')
  const r = bobaedreamAdapter.parse(partial, ctx())
  t('부분수집: 실패로 세지 않는다', r.parseFailures, 0)
  t('부분수집: 읽은 만큼은 적재한다', r.reviews.length, 5)
  // 그래도 "전멸"과는 갈라야 한다 — 위 블록이 그 반대편을 고정한다.
  const dead = partial.replace(/id="small_cmt_\d+"/g, 'id="cmt_x"')
  ok('부분수집: 전멸과는 다른 값이다', bobaedreamAdapter.parse(dead, ctx()).parseFailures > r.parseFailures)
}

// ── 마커에 천단위 쉼표가 있어도 읽는다 ────────────────────────────
{
  const many = fx('post-with-comments.html').replace('<span class="comm2">(4)</span>', '<span class="comm2">(1,234)</span>')
  const r = bobaedreamAdapter.parse(many, ctx())
  t('쉼표마커: 실패 0 (부분수집이지 고장이 아니다)', r.parseFailures, 0)
  t('쉼표마커: 읽은 만큼 적재', r.reviews.length, 5)
}

// ── 본문 없는 댓글(이미지만) — 실패가 아니다 ──────────────────────
{
  const one =
    '<div class="bodyCont" itemprop="articleBody"><p>본문</p></div>' +
    '<span class="comm2">(1)</span>' +
    '<dl><dt><span class="date">26.09.17 10:00</span></dt>' +
    '<dd class="" id="small_cmt_1"><img src="/a.gif"></dd></dl>'
  const r = bobaedreamAdapter.parse(one, ctx())
  t('이미지댓글: 실패로 세지 않는다', r.parseFailures, 0)
  t('이미지댓글: 본문 1건만 남는다', r.reviews.length, 1)
}

// ── 댓글 날짜가 각자 제 것인지 ────────────────────────────────────
{
  const two =
    '<div class="bodyCont" itemprop="articleBody"><p>본문</p></div>' +
    '<span class="comm2">(2)</span>' +
    '<dl><dt><span class="date">20.04.22 10:54</span></dt><dd id="small_cmt_1">첫째</dd></dl>' +
    '<dl><dt><span class="date">21.12.31 23:59</span></dt><dd id="small_cmt_2">둘째</dd></dl>'
  const r = bobaedreamAdapter.parse(two, ctx())
  t('날짜분리: 첫 댓글', r.reviews[1].writtenAt, '2020-04-22')
  // 앞 댓글 날짜를 주워 오면 여기가 2020-04-22 로 깨진다.
  t('날짜분리: 둘째 댓글은 제 날짜를 쓴다', r.reviews[2].writtenAt, '2021-12-31')
}

// ── 날짜 표기가 깨졌을 때 추정하지 않는다 ─────────────────────────
{
  const bad =
    '<div class="bodyCont" itemprop="articleBody"><p>본문</p></div>' +
    '<span class="comm2">(1)</span>' +
    '<dl><dt><span class="date">방금 전</span></dt><dd id="small_cmt_1">내용</dd></dl>'
  const r = bobaedreamAdapter.parse(bad, ctx())
  // parse() 는 순수 함수라 기준시각이 없다. 상대시간은 채우지 않는다.
  t('상대시간: writtenAt 은 null (추정 금지)', r.reviews[1].writtenAt, null)
  t('상대시간: 실패로 세지 않는다 — 본문은 읽었다', r.parseFailures, 0)
}

// ── 중첩 div 가 있어도 본문이 앞에서 잘리지 않는다 ────────────────
{
  const nested =
    '<div class="bodyCont" itemprop="articleBody"><p>앞</p><div class="quote"><p>인용</p></div><p>뒤</p></div>' +
    '<span class="comm2">(0)</span>'
  const r = bobaedreamAdapter.parse(nested, ctx())
  ok('중첩div: 앞부분이 있다', r.reviews[0].text.includes('앞'))
  ok('중첩div: 뒷부분도 있다 — 비탐욕 정규식이면 여기가 깨진다', r.reviews[0].text.includes('뒤'))
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['div 가 안 닫힘', '<div class="bodyCont" itemprop="articleBody"><p>본문'],
]) {
  let threw = false
  let r = null
  try {
    r = bobaedreamAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('보배드림 파서가 틀렸다.')
  process.exit(1)
}
console.log('보배드림 파서 정상 — 댓글 0건과 구조 소실을 가른다.')
