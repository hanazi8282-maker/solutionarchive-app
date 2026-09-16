#!/usr/bin/env node
// 브런치(brunch) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-17 에 실제로 받은 https://brunch.co.kr/@brunch/431 ·
// /@brunch/430 에서 깎았다(JSON-LD 블록은 응답 원문 그대로).
//   post.html              Organization + BlogPosting 두 블록 (정상)
//   post-missing-body.html BlogPosting 이 없음 (구조 변경 = 실패)
//   post-broken-json.html  깨진 블록이 **앞에** 있고 뒤에 정상 블록
//   post-long-body.html    articleBody 가 5,000자에서 잘린 실제 글
//
// ⚠️ **이 소스는 본문 전용이다.** 댓글은 `/api/` 뒤에 있고 robots 가 막는다.
//    "댓글 0건"은 실패가 아니라 설계된 결과다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brunchAdapter, parseProductRef, HOST } from '../lib/review/adapters/brunch.ts'
import { parseUrlRef } from '../lib/review/adapters/url-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'brunch', n), 'utf8')

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

const PATH = '/@brunch/431'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'brunch',
  productRef: REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (over = {}) => ({ productRef: REF, cursor: null, ...over })

// ── 공용 파서를 왜 안 쓰는지부터 못 박는다 ────────────────────────
// 이게 깨지면 = url-ref.ts 가 `@` 를 허용하게 바뀌었다 = 다모앙·82cook 의
// userinfo 차단도 같이 풀렸다는 뜻이다. 그때는 이 어댑터가 아니라 그쪽을 봐라.
t('전제: 공용 parseUrlRef 는 브런치 경로를 거부한다', parseUrlRef(REF), null)
t('전제: 그래도 이 어댑터는 읽는다', parseProductRef(REF), PATH)

// ── product_ref 파싱 — 여기가 SSRF 경계다 ─────────────────────────
t('ref: url:<경로> 를 경로로 읽는다', parseProductRef(REF), PATH)
t('ref: 앞뒤 공백 허용', parseProductRef(`  ${REF}  `), PATH)
t('ref: URL: 대문자 접두도 허용', parseProductRef(`URL:${PATH}`), PATH)
t('ref: url:/@a/1 통과', parseProductRef('url:/@a/1'), '/@a/1')
t('ref: 핸들에 _ - 허용', parseProductRef('url:/@a_b-c/12345'), '/@a_b-c/12345')
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: 번호가 숫자가 아니면 null', parseProductRef('url:/@a/b'), null)
t('ref: 한 단 더 붙으면 null', parseProductRef('url:/@a/1/2'), null)
t('ref: 번호가 11자리면 null', parseProductRef('url:/@a/12345678901'), null)
t('ref: 번호가 없으면 null', parseProductRef('url:/@a'), null)
t('ref: /write 는 null (robots Disallow)', parseProductRef('url:/write'), null)
t('ref: /search 는 null (robots Disallow)', parseProductRef('url:/search'), null)
t('ref: /api/ 는 null (robots Disallow — 댓글 경로)', parseProductRef('url:/api/comment/431'), null)
t('ref: @@ 형태는 null', parseProductRef('url:/@@abcd/431'), null)
t('ref: 핸들 없이 @ 만 있으면 null', parseProductRef('url:/@/431'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/@a/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/@a/1'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/@a/1'), null)
t('ref: userinfo 를 끼워도 null', parseProductRef('url:/@a/1@evil.example'), null)
t('ref: 쿼리스트링이 붙으면 null', parseProductRef('url:/@a/1?utm_source=x'), null)
t('ref: 프래그먼트가 붙으면 null', parseProductRef('url:/@a/1#c'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/@a/1 2'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/@a\\evil'), null)
// 앞뒤 공백은 trim 으로 떨어지지만(위 "앞뒤 공백 허용"), **가운데** 낀 건 다르다.
t('ref: 경로 가운데 개행이 끼면 null', parseProductRef('url:/@a/1\n2'), null)
t('ref: 경로 가운데 탭이 끼면 null', parseProductRef('url:/@a\t/1'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', brunchAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 brunch.co.kr 과 정확히 일치', new URL(brunchAdapter.nextRequest(target()).url).host, 'brunch.co.kr')
ok('URL: https 로만 간다', brunchAdapter.nextRequest(target()).url.startsWith('https://'))
ok('URL: 쿼리스트링을 만들지 않는다', !brunchAdapter.nextRequest(target()).url.includes('?'))
t('URL: 잘못된 ref 면 요청하지 않는다', brunchAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', brunchAdapter.nextRequest(target({ productRef: 'url:https://evil.example/@a/1' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', brunchAdapter.nextRequest(target({ cursor: '1' })), null)

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = brunchAdapter.parse(fx('post.html'), ctx())

  t('정상: 본문 1건', r.reviews.length, 1)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1글=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  // datePublished = "2026-09-07T01:00:24+09:00". KST 오프셋이 이미 붙어 있어서
  // 앞 10자가 곧 KST 날짜다. UTC 로 바꿔 자르면 9-06 이 되어 하루 밀린다.
  t('본문: KST 오프셋 ISO 의 앞 10자를 쓴다', post.writtenAt, '2026-09-07')
  ok('본문: writtenAt 이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(post.writtenAt))
  ok('본문: 제목이 들어 있다', post.text.includes('문학주간'))
  ok('본문: articleBody 가 들어 있다', post.text.includes('곁눈질은 어쩌면 세계를 이해하는'))
  ok('본문: description(발췌)만 담고 끝나지 않는다', post.text.length > 2000)
  // Organization 블록이 먼저 나온다. 거기서 멈추면 본문이 통째로 빈다.
  ok('본문: Organization 블록에서 멈추지 않는다', !post.text.includes('play.google.com'))

  t('전건: rating 은 항상 null', post.rating, null)
  t('전건: seller 는 항상 null', post.seller, null)
  t('전건: authorMasked 는 항상 null', post.authorMasked, null)
}

// ── 4,000자급 본문이 안 잘린다 / 5,000자 상한은 실재한다 ──────────
{
  const r = brunchAdapter.parse(fx('post-long-body.html'), ctx())
  const [post] = r.reviews
  t('긴글: 1건', r.reviews.length, 1)
  t('긴글: 실패 0', r.parseFailures, 0)
  ok('긴글: 4,000자를 넘겨 담는다 (그 아래에서 잘리지 않는다)', post.text.length > 4000)

  // ⚠️ 실측된 천장이다. 이게 깨지면(=5,000자를 넘겨 오면) 브런치가 상한을
  //    바꾼 것이다. 그때는 어댑터 주석의 ponytail 노트를 갱신해라.
  //    "확인 불가"를 "무제한"으로 접지 않으려고 숫자로 박아 둔다(§7.1).
  const raw = JSON.parse(/"articleBody":("(?:[^"\\]|\\.)*")/.exec(fx('post-long-body.html'))[1])
  t('긴글: articleBody 는 5,001자에서 끝난다 (5,000자 + 말줄임표)', raw.length, 5001)
  ok('긴글: 말미가 말줄임표다 = 잘렸다는 증거', raw.endsWith('…'))
}

// ── 댓글은 수집하지 않는다 (설계) ─────────────────────────────────
{
  const r = brunchAdapter.parse(fx('post.html'), ctx())
  t('댓글: 리뷰는 본문 1건뿐', r.reviews.length, 1)
  // 댓글이 0건인 걸 실패로 세면 매일 밤 가짜 경보가 뜬다. robots 가 막아서
  // 애초에 안 받는 것이지 못 읽은 게 아니다.
  t('댓글: 미수집을 실패로 세지 않는다', r.parseFailures, 0)
  ok('댓글: storyId 를 쓰지 않는다', r.reviews.every((x) => x.storyId === null))
}

// ── BlogPosting 소실 — 실패다 ─────────────────────────────────────
{
  const html = fx('post-missing-body.html')
  ok('본문소실: Organization 블록은 남아 있다', html.includes('"Organization"'))
  ok('본문소실: BlogPosting 은 없다', !html.includes('BlogPosting'))

  const r = brunchAdapter.parse(html, ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  // 화면에 제목·본문 텍스트가 남아 있어도 리뷰를 만들지 않는다(§7.1 사례 1).
  t('본문소실: 리뷰를 만들지 않는다', r.reviews.length, 0)
}

// ── 깨진 JSON 블록이 앞에 있어도 뒤 블록을 버리지 않는다 ──────────
{
  const r = brunchAdapter.parse(fx('post-broken-json.html'), ctx())
  t('깨진블록: 뒤의 정상 블록을 읽는다', r.reviews.length, 1)
  t('깨진블록: 실패로 세지 않는다', r.parseFailures, 0)
  ok('깨진블록: 본문이 실제로 들어간다', r.reviews[0].text.includes('문학주간'))
}

// ── 형식이 다른 날짜는 추정하지 않는다 ────────────────────────────
{
  const html = fx('post.html').replace('"datePublished":"2026-09-07T01:00:24+09:00"', '"datePublished":1757174424000')
  const r = brunchAdapter.parse(html, ctx())
  t('날짜: 형식이 다르면 null (추정 금지)', r.reviews[0].writtenAt, null)
  t('날짜: 그래도 본문은 살린다', r.reviews.length, 1)
  t('날짜: 날짜 하나 때문에 실패로 세지 않는다', r.parseFailures, 0)
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['ld+json 이 전부 깨짐', '<script type="application/ld+json">{{{</script>'],
  ['BlogPosting 인데 필드가 빔', '<script type="application/ld+json">{"@type":"BlogPosting"}</script>'],
]) {
  let threw = false
  let r = null
  try {
    r = brunchAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
  ok(`쓰레기(${name}): 리뷰 0건`, r && r.reviews.length === 0)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('브런치 파서가 틀렸다.')
  process.exit(1)
}
console.log('브런치 파서 정상 — 본문 전용이고, BlogPosting 소실을 실패로 센다.')
