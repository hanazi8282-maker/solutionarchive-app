#!/usr/bin/env node
// 텀블벅 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-17 에 실제로 받은 https://tumblbug.com/eastereggs 의
// window.MOBX_STATE 에서 우리가 읽는 부분만 남긴 것이다(필드명·값 원본 그대로).
//   project-with-reviews.html    후기 4건, 마커 66
//   project-no-reviews.html      후기 0건, 마커 0 (정상. 실패가 아니다)
//   project-missing-reviews.html creator 는 있는데 review 키가 없음 (실패)
//   project-missing-state.html   MOBX_STATE 자체가 없음 = SPA 껍데기 (실패)
//
// ⚠️ 이 어댑터가 다른 소스와 가장 다른 점: **마커(66)와 항목 수(4)가 정상일 때도
//    어긋난다.** 프리뷰가 4건 상한이기 때문이다. damoang 식으로 차이를 실패로
//    세면 매번 실패 62건이 찍힌다. 아래 "프리뷰상한" 블록이 그걸 고정한다.
//
// ⚠️ 두 번째로 다른 점: **externalId 에 프로젝트 경로가 안 들어간다.** 같은
//    후기가 같은 창작자의 다른 프로젝트 페이지에도 실려 오므로, 경로를 섞으면
//    같은 글이 매번 새 리뷰로 쌓인다. "창작자축" 블록이 그걸 고정한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tumblbugAdapter, parseProductRef, HOST } from '../lib/review/adapters/tumblbug.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'tumblbug', n), 'utf8')

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

const PATH = '/eastereggs'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'tumblbug',
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
t('ref: 경로가 / 로 시작하지 않으면 null', parseProductRef('url:eastereggs'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/x'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/proj@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/x'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/east ereggs'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/east\\eggs'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── robots 금지 접두를 어댑터가 직접 막는다 ───────────────────────
// 러너는 쿼리를 떼고 robots 를 본다(SP-026). `/discover?` `/search?` 는
// 공용 안전장치로 안 막히므로 여기서 막아야 한다.
t('robots: /api/ 금지', parseProductRef('url:/api/projects'), null)
t('robots: /auth/ 금지', parseProductRef('url:/auth/login'), null)
t('robots: /sessions/ 금지', parseProductRef('url:/sessions/new'), null)
t('robots: /oauth/ 금지', parseProductRef('url:/oauth/token'), null)
t('robots: /discover 금지', parseProductRef('url:/discover'), null)
t('robots: /search 금지', parseProductRef('url:/search'), null)

// ── 경로 모양 — 한 세그먼트만 ─────────────────────────────────────
// 탭 경로를 받으면 같은 창작자를 여러 번 긁게 된다(후기 payload 가 동일).
t('경로: /story 탭은 받지 않는다', parseProductRef('url:/eastereggs/story'), null)
t('경로: /community/backer 탭도 받지 않는다', parseProductRef('url:/eastereggs/community/backer'), null)
t('경로: 쿼리가 붙으면 받지 않는다', parseProductRef('url:/eastereggs?tab=review'), null)
t('경로: 루트만 있으면 null', parseProductRef('url:/'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', tumblbugAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 tumblbug.com 과 정확히 일치', new URL(tumblbugAdapter.nextRequest(target()).url).host, 'tumblbug.com')
t('URL: 잘못된 ref 면 요청하지 않는다', tumblbugAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', tumblbugAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
t('URL: 커서가 있으면 더 요청하지 않는다', tumblbugAdapter.nextRequest(target({ cursor: '1' })), null)
ok('URL: page 쿼리를 만들지 않는다', !/[?&]page=/.test(tumblbugAdapter.nextRequest(target()).url))
ok('URL: 쿼리스트링 자체가 없다', !tumblbugAdapter.nextRequest(target()).url.includes('?'))

// ── 정상 ──────────────────────────────────────────────────────────
{
  const r = tumblbugAdapter.parse(fx('project-with-reviews.html'), ctx())

  t('정상: 후기 4건', r.reviews.length, 4)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 커서 없음 — 1문서=1요청', r.nextCursor, null)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  ok('정상: 실제 본문이 읽힌다', r.reviews.some((x) => x.text.includes('캐릭터 그림이 너무 귀여워요')))
  ok('정상: 두 번째 후기도 읽힌다', r.reviews.some((x) => x.text.includes('배송 포장이 너무 부실합니다')))
  ok('정상: 본문이 비어 있지 않다', r.reviews.every((x) => x.text.length > 0))

  ok('전건: rating 은 항상 null', r.reviews.every((x) => x.rating === null))
  ok('전건: seller 는 항상 null', r.reviews.every((x) => x.seller === null))
  ok('전건: authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))

  // writtenAt — createdAt 이 절대 ISO 라 추정할 게 없다.
  ok('날짜: 전부 YYYY-MM-DD', r.reviews.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.writtenAt)))
  t('날짜: 실측값과 일치', r.reviews[0].writtenAt, '2026-02-26')
}

// ── 창작자축 — externalId 에 프로젝트 경로가 들어가면 안 된다 ─────
{
  const html = fx('project-with-reviews.html')
  const a = tumblbugAdapter.parse(html, ctx())
  // 같은 창작자의 **다른** 프로젝트 페이지로 들어온 상황.
  const b = tumblbugAdapter.parse(html, ctx({ productRef: 'url:/clear' }))

  ok('창작자축: externalId 가 tbr: 로 시작', a.reviews.every((x) => x.externalId.startsWith('tbr:')))
  t('창작자축: externalId 에 실제 후기 id 가 들어간다', a.reviews[0].externalId, 'tbr:245885')
  ok('창작자축: externalId 에 프로젝트 경로가 안 섞인다', a.reviews.every((x) => !x.externalId.includes('/')))
  // 이게 이 블록의 존재 이유다. 경로를 섞었다면 여기가 깨진다.
  t(
    '창작자축: 다른 프로젝트 페이지로 들어와도 externalId 가 같다',
    JSON.stringify(a.reviews.map((x) => x.externalId)),
    JSON.stringify(b.reviews.map((x) => x.externalId)),
  )
  t('창작자축: externalId 중복 없음', new Set(a.reviews.map((x) => x.externalId)).size, 4)
  ok('창작자축: externalId 를 전건 확보 (composite 폴백 없음)', a.reviews.every((x) => x.externalId))
}

// ── storyId 는 그 후기가 달린 **원래** 프로젝트다 ─────────────────
{
  const r = tumblbugAdapter.parse(fx('project-with-reviews.html'), ctx())
  ok('storyId: 전부 / 로 시작', r.reviews.every((x) => x.storyId.startsWith('/')))
  // 실측: /eastereggs 페이지인데 후기 4건 중 2건은 clear 프로젝트 것이다.
  const others = r.reviews.filter((x) => x.storyId !== PATH)
  ok('storyId: 지금 보고 있는 프로젝트와 다른 것이 섞여 있다', others.length > 0)
  t('storyId: 그 값이 원래 프로젝트 경로다', others[0].storyId, '/clear')
}

// ── 후기 0건 — 정상이다 ───────────────────────────────────────────
{
  const r = tumblbugAdapter.parse(fx('project-no-reviews.html'), ctx())
  t('후기0: 리뷰 0건', r.reviews.length, 0)
  t('후기0: 실패 0 — 후기가 없는 것은 고장이 아니다', r.parseFailures, 0)
  t('후기0: 커서 없음', r.nextCursor, null)
}

// ── review 영역 소실 — 실패다 ─────────────────────────────────────
{
  const r = tumblbugAdapter.parse(fx('project-missing-reviews.html'), ctx())
  ok('review소실: parseFailures > 0', r.parseFailures > 0)
  // 이게 이 파일의 존재 이유다. 위 "후기0" 과 값이 같아지면 안 된다.
  const zero = tumblbugAdapter.parse(fx('project-no-reviews.html'), ctx())
  ok('review소실: 후기 0건과 다른 값이다', r.parseFailures !== zero.parseFailures)
  t('review소실: 리뷰 0건', r.reviews.length, 0)
}

// ── MOBX_STATE 소실 (SPA 껍데기) — 실패다 ─────────────────────────
// 실측: /neogury · /user/neogury · /creator/neogury 가 전부 HTTP 200 인데
// 후기 payload 가 없는 36KB 껍데기였다. 200 을 성공으로 접으면 안 된다.
{
  const r = tumblbugAdapter.parse(fx('project-missing-state.html'), ctx())
  ok('state소실: parseFailures > 0', r.parseFailures > 0)
  t('state소실: 리뷰 0건', r.reviews.length, 0)
}

// ── 프리뷰 상한 — 마커 66 vs 항목 4 는 실패가 아니다 ──────────────
//
// ⚠️ damoang·82cook 은 `declared - anchors` 를 실패로 센다. 여기서 그러면
//    정상 페이지마다 실패 62건이 찍혀 소스가 곧바로 broken 으로 꺼진다.
{
  const r = tumblbugAdapter.parse(fx('project-with-reviews.html'), ctx())
  t('프리뷰상한: 마커 66 인데 4건이어도 실패 0', r.parseFailures, 0)

  // 그래도 "마커는 있는데 한 건도 없다"는 갈라야 한다.
  const emptied = fx('project-with-reviews.html').replace(/"contents":\[[\s\S]*?\],"keywords"/, '"contents":[],"keywords"')
  const dead = tumblbugAdapter.parse(emptied, ctx())
  t('프리뷰상한: 마커>0 인데 0건이면 실패', dead.parseFailures, 1)
  t('프리뷰상한: 그때 리뷰는 0건', dead.reviews.length, 0)
}

// ── 고유 id 가 없으면 폴백을 만들지 않고 실패로 센다 ──────────────
{
  const noId = fx('project-with-reviews.html').replace(/"projectWarrantyReviewId":\d+,/g, '')
  const r = tumblbugAdapter.parse(noId, ctx())
  t('무id: 리뷰 0건 — composite 폴백을 만들지 않는다', r.reviews.length, 0)
  t('무id: 항목 수만큼 실패로 센다', r.parseFailures, 4)
}

// ── 본문 없는 후기(사진만) — 실패가 아니다 ────────────────────────
{
  const state = {
    projectStore: {
      creators: [['x', { review: { totalReviewCount: 1, contents: [{ projectWarrantyReviewId: 1, body: '   ', createdAt: '2026-01-02T03:04:05', projectPermalink: 'x' }] } }]],
    },
  }
  const html = `<script>window.MOBX_STATE = ${JSON.stringify(state)};</script>`
  const r = tumblbugAdapter.parse(html, ctx())
  t('사진만후기: 실패로 세지 않는다', r.parseFailures, 0)
  t('사진만후기: 적재하지 않는다', r.reviews.length, 0)
}

// ── 중첩 JSON 을 앞에서 자르지 않는다 ─────────────────────────────
// 비탐욕 정규식으로 잘랐다면 첫 `}` 에서 끊겨 **항상** 실패한다.
{
  const state = {
    a: { b: { c: { d: 1 } } },
    projectStore: {
      creators: [['x', { review: { totalReviewCount: 1, contents: [{ projectWarrantyReviewId: 9, body: '중첩 뒤에 있는 후기', createdAt: '2026-03-04T00:00:00', projectPermalink: 'p' }] } }]],
    },
  }
  const html = `<script>window.MOBX_STATE = ${JSON.stringify(state)};\n</script><div>뒤</div>`
  const r = tumblbugAdapter.parse(html, ctx())
  t('중첩JSON: 뒤쪽 후기까지 읽는다', r.reviews.length, 1)
  t('중첩JSON: 실패 0', r.parseFailures, 0)
}

// ── 문자열 안의 중괄호에 속지 않는다 ──────────────────────────────
{
  const state = {
    note: 'body with } brace and \\" quote',
    projectStore: {
      creators: [['x', { review: { totalReviewCount: 1, contents: [{ projectWarrantyReviewId: 7, body: '중괄호 } 뒤', createdAt: '2026-04-05T00:00:00', projectPermalink: 'p' }] } }]],
    },
  }
  const html = `<script>window.MOBX_STATE = ${JSON.stringify(state)};</script>`
  const r = tumblbugAdapter.parse(html, ctx())
  t('문자열중괄호: 후기를 읽는다', r.reviews.length, 1)
  t('문자열중괄호: 실패 0', r.parseFailures, 0)
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['MOBX 는 있는데 JSON 이 깨짐', '<script>window.MOBX_STATE = { this is not json </script>'],
  ['MOBX 가 안 닫힘', '<script>window.MOBX_STATE = {"projectStore":{"creators":[]'],
]) {
  let threw = false
  let r = null
  try {
    r = tumblbugAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('텀블벅 파서가 틀렸다.')
  process.exit(1)
}
console.log('텀블벅 파서 정상 — 후기 0건과 구조 소실을 가르고, 창작자축 id 를 지킨다.')
