#!/usr/bin/env node
// 에펨코리아(fmkorea) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-17 에 실제로 받은 https://www.fmkorea.com/best/10342734564
// 외 2건에서 깎았다(파싱 대상 영역은 마크업 원본 그대로).
//   post-with-comments.html    단일 페이지. 마커 3 · BEST 중복 포함 앵커 4 · 고유 3
//   post-no-comments.html      마커 0 + 항목 0 (정상 — 실패 아님)
//   post-missing-comments.html 단일 페이지인데 마커 3 · 항목 0 (못 읽음 = 실패)
//   post-paginated.html        페이저 있음. 마커 53 · 고유 앵커 3 (한계 — 실패 아님)
//   post-missing-body.html     xe_content 글 본문이 없음 (구조 변경 = 실패)
//
// ⚠️ 이 파일의 핵심은 **마커−앵커 차액을 언제 실패로 세는가**다. 에펨은 댓글이
//    많으면 페이저를 붙이고 글 페이지에 마지막 페이지를 렌더한다. 그때 차액은
//    "못 읽은 것"이 아니라 "다른 페이지에 있는 것"이다. 실측 3건:
//      마커 77  · 고유앵커 77 · cpage 없음  ← 단일 페이지
//      마커 177 · 고유앵커 79 · cpage=2     ← 페이저
//      마커 53  · 고유앵커  5 · cpage=2     ← 페이저
//    그래서 cpage 유무로 가른다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fmkoreaAdapter, parseProductRef, HOST } from '../lib/review/adapters/fmkorea.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'fmkorea', n), 'utf8')

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

const PATH = '/best/10342734564'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'fmkorea',
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
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/best/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/best/1'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/best@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/best/1'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/best\\evil'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/best/1 2'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)

// ── robots `*` 그룹을 코드로 내재화한 가드 (SP-028) ───────────────
// `Disallow: /` + `Allow: /$ /best /best2 /humor` 가 원문이다.
t('robots: /best/<숫자> 통과', parseProductRef('url:/best/123'), '/best/123')
t('robots: /best2/<숫자> 통과', parseProductRef('url:/best2/123'), '/best2/123')
t('robots: /humor/<숫자> 통과', parseProductRef('url:/humor/123'), '/humor/123')
// XE 기본 주소. `Disallow: /` 대상이라 여기서 끊는다.
t('robots: /8123456 은 null (Disallow: / 대상)', parseProductRef('url:/8123456'), null)
t('robots: /index.php 는 null', parseProductRef('url:/index.php'), null)
t('robots: 루트는 null', parseProductRef('url:/'), null)
t('robots: /bestiary 처럼 접두만 겹치면 null', parseProductRef('url:/bestiary/1'), null)
t('robots: 댓글 퍼머링크(/best/1/2)는 null', parseProductRef('url:/best/10342734564/10342859374'), null)
t('robots: 숫자가 아니면 null', parseProductRef('url:/best/abc'), null)
t('robots: 글 id 가 없으면 null', parseProductRef('url:/best/'), null)
// 쿼리 규칙(`Disallow: /*m=0&` 등)은 러너가 판정 못 한다(SP-026). 애초에 안 만든다.
t('robots: 쿼리가 붙으면 null', parseProductRef('url:/best/123?cpage=2'), null)
t('robots: listStyle 쿼리도 null', parseProductRef('url:/best/123?listStyle=viewer'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', fmkoreaAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 www.fmkorea.com 과 정확히 일치', new URL(fmkoreaAdapter.nextRequest(target()).url).host, 'www.fmkorea.com')
ok('URL: https 로만 간다', fmkoreaAdapter.nextRequest(target()).url.startsWith('https://'))
ok('URL: 쿼리스트링을 만들지 않는다', !fmkoreaAdapter.nextRequest(target()).url.includes('?'))
ok('URL: cpage 를 만들지 않는다', !fmkoreaAdapter.nextRequest(target()).url.includes('cpage'))
t('URL: 잘못된 ref 면 요청하지 않는다', fmkoreaAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: XE 기본 주소면 요청하지 않는다', fmkoreaAdapter.nextRequest(target({ productRef: 'url:/8123456' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', fmkoreaAdapter.nextRequest(target({ cursor: '1' })), null)

// ── 정상 글 + 댓글 (단일 페이지) ──────────────────────────────────
{
  const html = fx('post-with-comments.html')
  // 픽스처가 실측 구조를 유지하는지부터 본다 — BEST 중복이 실재해야 의미가 있다.
  t('전제: 앵커 4개 중 고유 3개 (BEST 중복 1)', [...html.matchAll(/<li id="comment_(\d+)_?"/g)].length, 4)
  t('전제: 고유 id 는 3개', new Set([...html.matchAll(/<li id="comment_(\d+)_?"/g)].map((m) => m[1])).size, 3)
  ok('전제: 페이저가 없다 (단일 페이지)', !/document_cpage/.test(html))

  const r = fmkoreaAdapter.parse(html, ctx())

  t('정상: 본문 1 + 댓글 3 = 4건', r.reviews.length, 4)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)

  const [post, ...comments] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  t('본문: 실측 작성일과 일치', post.writtenAt, '2026-09-16')
  ok('본문: writtenAt 이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(post.writtenAt))
  ok('본문: 제목이 들어 있다', post.text.includes('강레오 수육찜'))
  ok('본문: 본문 텍스트가 들어 있다', post.text.includes('물 500ml'))
  ok('본문: 중첩 div 뒤의 내용까지 읽는다', post.text.includes('앞에서 잘리면 안 된다'))
  ok('본문: 댓글을 본문에 섞지 않는다', !post.text.includes('대파가 핵심이네'))

  // ⚠️ 여기가 BEST 중복 제거의 증거다. 안 하면 4건이 되고 같은 댓글이 두 번 적재된다.
  t('댓글: BEST 중복을 접어 3건', comments.length, 3)
  t('댓글: externalId 가 전부 다르다', new Set(comments.map((c) => c.externalId)).size, 3)
  t('댓글: externalId 는 <경로>#<댓글srl>', comments[0].externalId, `${PATH}#10342883096`)
  ok('댓글: externalId 에 BEST 의 `_` 접미가 새지 않는다', comments.every((c) => !c.externalId.endsWith('_')))
  t('댓글: storyId 가 글 경로', comments[0].storyId, PATH)
  ok('댓글: 본문이 들어 있다', comments[0].text.includes('이거 진짜 해봤는데'))
  ok('댓글: <br /> 이 줄바꿈이 된다', comments[1].text.includes('\n안 그러면 퍽퍽해짐'))
  ok('댓글: 엔티티를 푼다', comments[1].text.includes('<주의>') && comments[1].text.includes('&'))
  ok('댓글: 뒤 댓글을 삼키지 않는다', !comments[0].text.includes('대파가 핵심이네'))
  // 시각 표기가 `9 분 전` 꼴이라 역산하면 재수집마다 값이 달라진다. 안 채운다.
  ok('댓글: 상대시각이라 writtenAt 은 전건 null', comments.every((c) => c.writtenAt === null))

  ok('전건: rating 은 항상 null', r.reviews.every((x) => x.rating === null))
  ok('전건: seller 는 항상 null', r.reviews.every((x) => x.seller === null))
  ok('전건: authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))
}

// ── 댓글 0건 — 실패가 아니다 ──────────────────────────────────────
{
  const r = fmkoreaAdapter.parse(fx('post-no-comments.html'), ctx())
  t('0건: 본문 1건만', r.reviews.length, 1)
  t('0건: 실패로 세지 않는다', r.parseFailures, 0)
}

// ── 단일 페이지인데 항목이 없다 — 실패다 ──────────────────────────
{
  const html = fx('post-missing-comments.html')
  ok('댓글소실: 페이저가 없다', !/document_cpage/.test(html))

  const r = fmkoreaAdapter.parse(html, ctx())
  t('댓글소실: 본문 1건은 살린다', r.reviews.length, 1)
  // 페이저가 없는데 3건 보인다고 적혀 있고 0건 읽혔다 = 진짜 못 읽은 것이다.
  t('댓글소실: 못 읽은 3건을 실패로 센다', r.parseFailures, 3)
}

// ── 페이저가 있으면 차액은 실패가 아니다 (AC-0 실측 반영) ─────────
{
  const html = fx('post-paginated.html')
  ok('페이저: window.document_cpage 가 있다', /window\.document_cpage\s*=\s*2/.test(html))
  t('페이저: 마커는 53', Number(/댓글 <b>(\d+)<\/b>/.exec(html)[1]), 53)

  const r = fmkoreaAdapter.parse(html, ctx())
  t('페이저: 본문 1 + 마지막 페이지 댓글 3 = 4건', r.reviews.length, 4)
  // ⚠️ 이게 이 어댑터에서 가장 중요한 단정이다. 설계 초안은 차액(50)을
  //    parseFailures 로 세라고 했는데, 실측해 보니 그 차액은 **다른 페이지에
  //    있는 댓글**이었다. 세면 멀쩡한 파서가 매일 밤 가짜 실패를 찍는다.
  t('페이저: 차액 50건을 실패로 세지 않는다', r.parseFailures, 0)
  ok('페이저: 그래도 댓글은 마지막 페이지 것만 담는다 (알려진 한계)', r.reviews.length - 1 === 3)
}

// ── 본문 컨테이너 소실 — 실패다 ───────────────────────────────────
{
  const r = fmkoreaAdapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  ok('본문소실: 댓글 3건은 그대로 읽는다', r.reviews.length === 3)
  ok('본문소실: 글 본문 리뷰가 없다', r.reviews.every((x) => x.storyId !== null))
}

// ── 댓글 본문 클래스 규칙이 바뀌면 실패다 ─────────────────────────
{
  const html = fx('post-with-comments.html').replaceAll(' xe_content">', ' xe_content_v2">')
  const r = fmkoreaAdapter.parse(html, ctx())
  // 글 본문 1 + 댓글 3 = 4건 전부 못 읽는다.
  t('클래스변경: 리뷰 0건', r.reviews.length, 0)
  ok('클래스변경: 4건을 실패로 센다', r.parseFailures === 4)
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['제목만 있고 본문 없음', '<h1 class="np_18px"><span class="np_18px_span">제목</span></h1>'],
]) {
  let threw = false
  let r = null
  try {
    r = fmkoreaAdapter.parse(body, ctx())
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
  console.log('에펨코리아 파서가 틀렸다.')
  process.exit(1)
}
console.log('에펨코리아 파서 정상 — BEST 중복을 접고, 페이저와 구조 소실을 가른다.')
