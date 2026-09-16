#!/usr/bin/env node
// 82cook 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-16 에 실제로 받은
// https://www.82cook.com/entiz/read.php?num=4239440 에서 깎았다
// (마크업 원본 그대로, 댓글 72건 중 4건만 남기고 total_reple 을 맞췄다).
//   post-with-comments.html    #articleBody + 댓글 4건(1건은 delReple 표시)
//   post-no-comments.html      댓글 0건 (정상)
//   post-missing-comments.html 댓글 영역이 통째로 없음 (구조 변경 = 실패)
//   post-missing-body.html     #articleBody 가 없음 (구조 변경 = 실패)
//
// ⚠️ 작성일이 `'26.9.15 8:00 PM` 형식이다. 2자리 연도를 잘못 펴면 2126년이나
//    1926년이 된다. 아래 날짜 테스트가 그걸 막는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cook82Adapter, parseProductRef, HOST, __internal } from '../lib/review/adapters/82cook.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', '82cook', n), 'utf8')

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

const PATH = '/entiz/read.php?num=4239440'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: '82cook',
  productRef: REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (over = {}) => ({ productRef: REF, cursor: null, ...over })

// ── product_ref 파싱 ──────────────────────────────────────────────
t('ref: url:<경로+쿼리> 를 그대로 읽는다', parseProductRef(REF), PATH)
t('ref: 앞뒤 공백 허용', parseProductRef(`  ${REF}  `), PATH)
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: / 로 시작하지 않으면 null', parseProductRef('url:entiz/read.php?num=1'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/entiz/../admin'), null)
t('ref: // 로 시작하면 null', parseProductRef('url://evil.example/x'), null)
t('ref: @ 가 있으면 null', parseProductRef('url:/entiz@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/entiz/read.php'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)

// ⚠️ robots 가 이 URL 하나를 콕 집어 금지한다:
//      Disallow: /entiz/read.php?bn=15&num=1166440&page=6
//    러너는 robots 판정에 쿼리를 안 넘기므로(runner.ts:153) 이 규칙을 못 본다.
//    안전장치가 못 막으니 어댑터가 직접 막는다.
t(
  'ref: robots 가 금지한 그 URL 은 거부한다',
  parseProductRef('url:/entiz/read.php?bn=15&num=1166440&page=6'),
  null,
)
t(
  'ref: 같은 글이라도 파라미터 순서가 달라지면 거부한다',
  parseProductRef('url:/entiz/read.php?num=1166440&bn=15&page=6'),
  null,
)
t('ref: 금지 글이 아닌 같은 경로는 통과한다', parseProductRef('url:/entiz/read.php?bn=15&num=1166441&page=6'), '/entiz/read.php?bn=15&num=1166441&page=6')

// ── 2자리 연도 — 2126·1926 으로 새지 않는지 ───────────────────────
const d = __internal.parseShortDate
t("날짜: '26.9.15 8:00 PM -> 2026-09-15", d("'26.9.15 8:00 PM"), '2026-09-15')
t("날짜: '26.12.31 -> 2026-12-31 (한 자리 월일 0채움)", d("'26.12.31 1:02 AM"), '2026-12-31')
t("날짜: '00.1.1 -> 2000-01-01", d("'00.1.1 9:00 AM"), '2000-01-01')
t("날짜: '99 는 1999 로 (2099 아님)", d("'99.12.31 9:00 PM"), '1999-12-31')
t("날짜: '89 는 2089 로 (피벗 90)", d("'89.1.2 9:00 PM"), '2089-01-02')
t('날짜: 형식이 다르면 null', d('2026-09-15'), null)
t('날짜: 빈 값은 null', d(''), null)
t('날짜: 월이 범위를 벗어나면 null', d("'26.13.1 9:00 PM"), null)
t('날짜: 일이 범위를 벗어나면 null', d("'26.9.32 9:00 PM"), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', cook82Adapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 www.82cook.com 과 정확히 일치', new URL(cook82Adapter.nextRequest(target()).url).host, 'www.82cook.com')
t('URL: 잘못된 ref 면 요청하지 않는다', cook82Adapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: robots 금지 글은 요청하지 않는다', cook82Adapter.nextRequest(target({ productRef: 'url:/entiz/read.php?bn=15&num=1166440&page=6' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', cook82Adapter.nextRequest(target({ cursor: '1' })), null)

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = cook82Adapter.parse(fx('post-with-comments.html'), ctx())

  t('정상: 본문 1 + 댓글 4 = 5건', r.reviews.length, 5)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post, ...comments] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  t('본문: 실측 작성일(2026-09-15)', post.writtenAt, '2026-09-15')
  ok('본문: writtenAt 이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(post.writtenAt))
  ok('본문: 실제 본문이 읽힌다', post.text.includes('창고형 약국이 동네에 생겨서'))

  t('댓글: 4건', comments.length, 4)
  ok('댓글: externalId 가 <글경로># 로 시작', comments.every((c) => c.externalId.startsWith(`${PATH}#`)))
  ok('댓글: externalId 에 data-rn 이 들어간다', comments[0].externalId === `${PATH}#41169700`)
  t('댓글: externalId 중복 없음', new Set(r.reviews.map((x) => x.externalId)).size, 5)
  ok('댓글: storyId 가 글 경로', comments.every((c) => c.storyId === PATH))
  ok('댓글: 실제 본문이 읽힌다', comments.some((c) => c.text.includes('거의 반값인게 많더라구요')))
  ok('댓글: writtenAt 이 전부 YYYY-MM-DD', comments.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.writtenAt)))
  t('댓글: 실측 작성일이 2026 년으로 펴진다', comments[0].writtenAt, '2026-09-15')
  ok('댓글: 줄바꿈(<br>)이 살아 있다', comments.some((c) => c.text.includes('\n')))

  ok('전건: rating 은 항상 null', r.reviews.every((x) => x.rating === null))
  ok('전건: seller 는 항상 null', r.reviews.every((x) => x.seller === null))
  ok('전건: authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))
  // 작성자 IP 가 마크업에 그대로 있다. 본문에 섞여 들어가면 안 된다.
  ok('전건: 작성자 IP 를 본문에 넣지 않는다', r.reviews.every((x) => !/\d+\.\d+\.xxx\./.test(x.text)))
}

// ── 댓글 0건 — 정상이다 ───────────────────────────────────────────
{
  const r = cook82Adapter.parse(fx('post-no-comments.html'), ctx())
  t('댓글0: 본문 1건만', r.reviews.length, 1)
  t('댓글0: 실패 0 — 댓글이 없는 것은 고장이 아니다', r.parseFailures, 0)
  t('댓글0: 커서 없음', r.nextCursor, null)
}

// ── 댓글 영역 소실 — 실패다 ───────────────────────────────────────
{
  const r = cook82Adapter.parse(fx('post-missing-comments.html'), ctx())
  ok('댓글소실: parseFailures > 0', r.parseFailures > 0)
  ok('댓글소실: 댓글 0건과 다른 값이다', r.parseFailures !== 0)
  t('댓글소실: 본문은 그래도 읽는다', r.reviews.length, 1)
}

// ── 본문 소실 — 실패다 ────────────────────────────────────────────
{
  const r = cook82Adapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  ok('본문소실: 댓글은 그래도 읽는다', r.reviews.length === 4)
}

// ── 개수 마커 불일치 ──────────────────────────────────────────────
{
  // total_reple 은 4 인데 li 는 3개 — 1건을 못 읽은 상황.
  const broken = fx('post-with-comments.html').replace(/<li data-rn="41169726"[\s\S]*?(?=<li data-rn=)/, '')
  const r = cook82Adapter.parse(broken, ctx())
  ok('마커불일치: 못 읽은 만큼 실패로 센다', r.parseFailures > 0)
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
]) {
  let threw = false
  let r = null
  try {
    r = cook82Adapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('82cook 파서가 틀렸다.')
  process.exit(1)
}
console.log('82cook 파서 정상 — 2자리 연도와 구조 소실을 모두 가른다.')
