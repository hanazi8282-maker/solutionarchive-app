#!/usr/bin/env node
// 다모앙 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-16 에 실제로 받은 https://damoang.net/free/7341567 에서
// 깎은 것이다(마크업 원본 그대로, 항목 수만 줄이고 개수 마커를 맞췄다).
//   post-with-comments.html    JSON-LD + 댓글 4건
//   post-no-comments.html      JSON-LD + 댓글 0건 (정상. 실패가 아니다)
//   post-missing-comments.html 댓글 영역이 통째로 없음 (구조 변경 = 실패)
//   post-missing-body.html     JSON-LD 가 없음 (구조 변경 = 실패)
//
// ⚠️ 이 파일이 지키는 핵심은 **"0건"과 "못 읽음"을 절대 같은 값으로 만들지
//    않는 것**이다(CLAUDE.md §7.1). 다모앙은 댓글 수를 화면에 찍어 주므로
//    (`댓글 (N)`) 마커와 실제 항목 수를 대조할 수 있다 — 이게 없으면
//    클래스명이 바뀌어도 "댓글 0건"으로 조용히 보고된다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { damoangAdapter, parseProductRef, HOST } from '../lib/review/adapters/damoang.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'damoang', n), 'utf8')

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

const PATH = '/free/7341567'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'damoang',
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
t('ref: 경로가 / 로 시작하지 않으면 null', parseProductRef('url:free/1'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/free/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/x'), null)
t('ref: 경로 중간의 // 도 null', parseProductRef('url:/free//evil'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/free@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/free/1'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/free/1 2'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/free\\evil'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', damoangAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 damoang.net 과 정확히 일치', new URL(damoangAdapter.nextRequest(target()).url).host, 'damoang.net')
t('URL: 잘못된 ref 면 요청하지 않는다', damoangAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', damoangAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
// 1글=1요청이다. 커서가 있다는 건 이미 한 번 받았다는 뜻이라 다시 가지 않는다.
t('URL: 커서가 있으면 더 요청하지 않는다', damoangAdapter.nextRequest(target({ cursor: '1' })), null)
// ⚠️ robots 가 /*?page= 를 막는다. 러너는 쿼리를 떼고 판정하므로(runner.ts:153)
//    우리가 ?page= 를 만들면 안전장치가 위반을 못 막는다. 절대 만들지 않는다.
ok('URL: page 쿼리를 만들지 않는다 (robots /*?page= 금지)', !damoangAdapter.nextRequest(target()).url.includes('page='))
ok('URL: 쿼리스트링 자체가 없다', !damoangAdapter.nextRequest(target()).url.includes('?'))

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = damoangAdapter.parse(fx('post-with-comments.html'), ctx())

  t('정상: 본문 1 + 댓글 4 = 5건', r.reviews.length, 5)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post, ...comments] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  ok('본문: writtenAt 이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(post.writtenAt))
  t('본문: 실측 작성일과 일치', post.writtenAt, '2026-09-15')
  ok('본문: 제목이 들어 있다', post.text.includes('뉴스·펌글 작성 기준 안내'))
  ok('본문: 본문이 들어 있다', post.text.includes('안녕하세요, 다모앙입니다'))

  t('댓글: 4건', comments.length, 4)
  ok('댓글: externalId 가 <글경로># 로 시작', comments.every((c) => c.externalId.startsWith(`${PATH}#`)))
  ok('댓글: externalId 에 앵커 id 가 들어간다', comments[0].externalId === `${PATH}#c_7341623`)
  t('댓글: externalId 중복 없음', new Set(r.reviews.map((x) => x.externalId)).size, 5)
  ok('댓글: storyId 가 글 경로', comments.every((c) => c.storyId === PATH))
  ok('댓글: 본문이 비어 있지 않다', comments.every((c) => c.text.length > 0))
  ok('댓글: 실제 본문이 읽힌다', comments.some((c) => c.text.includes('확인했습니다')))
  // 화면 표기가 `09.15` 라 연도가 없고, JSON-LD 의 comment[] 는 일부만 실어 준다
  // (실측 13건 중 3건). 추정해 채우지 않는다 — 재실행마다 값이 달라지는 게 더 나쁘다.
  ok('댓글: writtenAt 은 전부 null (연도 없는 표기 — 추정 금지)', comments.every((c) => c.writtenAt === null))

  ok('전건: rating 은 항상 null', r.reviews.every((x) => x.rating === null))
  ok('전건: seller 는 항상 null', r.reviews.every((x) => x.seller === null))
  ok('전건: authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))
}

// ── 댓글 0건 — 정상이다 ───────────────────────────────────────────
{
  const r = damoangAdapter.parse(fx('post-no-comments.html'), ctx())
  t('댓글0: 본문 1건만', r.reviews.length, 1)
  t('댓글0: 실패 0 — 댓글이 없는 것은 고장이 아니다', r.parseFailures, 0)
  t('댓글0: 커서 없음', r.nextCursor, null)
}

// ── 댓글 영역 소실 — 실패다 ───────────────────────────────────────
{
  const r = damoangAdapter.parse(fx('post-missing-comments.html'), ctx())
  ok('댓글소실: parseFailures > 0', r.parseFailures > 0)
  // 이게 이 파일의 존재 이유다. 위 "댓글0" 과 값이 같아지면 안 된다.
  ok('댓글소실: 댓글 0건과 다른 값이다', r.parseFailures !== 0)
  t('댓글소실: 본문은 그래도 읽는다', r.reviews.length, 1)
}

// ── 본문(JSON-LD) 소실 — 실패다 ───────────────────────────────────
{
  const r = damoangAdapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  ok('본문소실: 본문 항목이 없다', !r.reviews.some((x) => x.storyId === null || x.storyId === undefined))
  ok('본문소실: 댓글은 그래도 읽는다', r.reviews.length === 4)
}

// ── 개수 마커와 실제 항목 수가 어긋나면 실패 ──────────────────────
{
  // 마커는 4 인데 li 는 1개 — 클래스명이 바뀌어 3건을 못 읽은 상황을 흉내낸다.
  const broken = fx('post-with-comments.html').replace(/<li id="c_7341624"[\s\S]*?(?=<\/ul>)/, '')
  const r = damoangAdapter.parse(broken, ctx())
  ok('마커불일치: 못 읽은 만큼 실패로 센다', r.parseFailures > 0)
}

// ── 본문 없는 댓글(이모티콘만) — 실패가 아니다 ────────────────────
{
  // 실측 c_7341577 이 이 모양이었다. 컨테이너는 멀쩡하고 알맹이만 없다.
  const one =
    '<script type="application/ld+json">[{"@type":"DiscussionForumPosting","headline":"t","text":"b","datePublished":"2026-09-15T18:21:47+09:00"}]</script>' +
    '<h2>댓글 <span>(1)</span></h2><ul>' +
    '<li id="c_1" class="comment-item"><div class="comment-body"><p><img src="/emoticons/a.gif" alt="이모티콘"></p></div></li>' +
    '</ul>'
  const r = damoangAdapter.parse(one, ctx())
  t('이모티콘댓글: 실패로 세지 않는다', r.parseFailures, 0)
  t('이모티콘댓글: 본문 1건만 남는다', r.reviews.length, 1)
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
    r = damoangAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('다모앙 파서가 틀렸다.')
  process.exit(1)
}
console.log('다모앙 파서 정상 — 댓글 0건과 구조 소실을 가른다.')
