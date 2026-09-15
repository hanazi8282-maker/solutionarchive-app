#!/usr/bin/env node
// 네이버 검색 오픈API 파서 셀프테스트 — 네트워크 없이 픽스처로만 돈다.
//
// ⚠️ 픽스처는 응답의 **구조만** 보존한다. 본문·작성자는 합성값이다
//    (다나와 픽스처와 같은 규칙). 원문을 30일 보관하고 폐기하기로 해놓고
//    공개 리포에 영구 커밋하면 말이 맞지 않는다.
//
// 여기서 고정하는 것:
//   · 페이지 경계에서 스스로 멈추는가 (넘기면 400 이고 러너가 failed 로 찍는다)
//   · `sort=date` 가 URL 에 **반드시** 있는가 (없으면 증분 종료가 오작동)
//   · 자격증명이 **헤더**로 가는가 (쿼리로 가면 URL 로그에 키가 남는다)
//   · `<b>` 하이라이트·엔티티가 본문에서 지워지는가
//   · authorMasked 가 항상 null 인가 (필요 없는 개인 식별 재료를 안 받는다)

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  naverBlogAdapter,
  naverCafeAdapter,
  naverKinAdapter,
  DISPLAY,
  START_LIMIT,
} from '../lib/review/adapters/naver.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'review', 'naver', name), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (got === want) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// 자격증명은 **가짜**다. 네트워크를 안 타므로 실제 키가 필요 없다.
process.env.NAVER_CLIENT_ID = 'TEST_ID'
process.env.NAVER_CLIENT_SECRET = 'TEST_SECRET'

const blog = await fx('blog-page1.json')
const cafe = await fx('cafe-page1.json')
const kin = await fx('kin-page1.json')
const empty = await fx('empty.json')
const authError = await fx('auth-error.json')

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'naver_blog',
  productRef: 'q:무선이어폰',
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (cursor = null, productRef = 'q:무선이어폰') => ({ productRef, cursor })

// ── URL 계약 ──────────────────────────────────────────────────────
{
  const req = naverBlogAdapter.nextRequest(target())
  ok('블로그 엔드포인트', req.url.startsWith('https://openapi.naver.com/v1/search/blog.json'))
  ok('⚠️ sort=date 가 URL 에 있다 — 없으면 증분 종료가 오작동한다', req.url.includes('sort=date'))
  ok('첫 요청은 start=1', req.url.includes('start=1'))
  ok(`display=${DISPLAY}`, req.url.includes(`display=${DISPLAY}`))
  ok('질의어가 인코딩돼 들어간다', req.url.includes(encodeURIComponent('무선이어폰')))

  // ⛔ 키는 헤더로만 간다. URL 에 섞이면 로그·에러 메시지에 그대로 남는다.
  t('클라이언트 ID 가 헤더로 간다', req.headers['X-Naver-Client-Id'], 'TEST_ID')
  t('클라이언트 시크릿이 헤더로 간다', req.headers['X-Naver-Client-Secret'], 'TEST_SECRET')
  ok('⛔ 키가 URL 에 들어가지 않는다', !req.url.includes('TEST_ID') && !req.url.includes('TEST_SECRET'))
}
{
  const req = naverCafeAdapter.nextRequest(target({ sourceKey: 'naver_cafe' }))
  ok('카페 엔드포인트', req.url.includes('/search/cafearticle.json'))
  ok('카페도 sort=date', req.url.includes('sort=date'))
  const k = naverKinAdapter.nextRequest(target({ sourceKey: 'naver_kin' }))
  ok('지식iN 엔드포인트', k.url.includes('/search/kin.json'))
  ok('지식iN 도 sort=date', k.url.includes('sort=date'))
}
{
  t('robotsPolicy 는 official-api (openapi.naver.com 은 Disallow: / 다)', naverBlogAdapter.robotsPolicy, 'official-api')
  t('requiredEnv 2개', naverBlogAdapter.requiredEnv.join(','), 'NAVER_CLIENT_ID,NAVER_CLIENT_SECRET')
}

// ── 페이지 경계 ───────────────────────────────────────────────────
{
  // start + display > 1000 이면 요청하지 않는다. 넘기면 네이버가 400 을 주고
  // 러너가 그 타깃을 failed 로 찍는다 — 정상 경계를 고장으로 기록하게 된다.
  t('경계 직전(start=801)은 요청한다', Boolean(naverBlogAdapter.nextRequest(target({ cursor: '801' }))), true)
  t('경계를 넘는 커서(start=901)면 nextRequest 가 null', naverBlogAdapter.nextRequest(target({ cursor: '901' })), null)
  t(`START_LIMIT 은 ${START_LIMIT}`, START_LIMIT, 1000)
}
{
  t('product_ref 형식이 아니면 null', naverBlogAdapter.nextRequest(target({ productRef: '12345' })), null)
  t('빈 질의면 null', naverBlogAdapter.nextRequest(target({ productRef: 'q:' })), null)
}
{
  // 키가 없으면 요청 자체를 만들지 않는다. 키 없이 보낸 401 은 러너가
  // "차단"으로 기록하고 소스를 끈다 — 원인이 우리 설정인데 상대 탓이 된다.
  const id = process.env.NAVER_CLIENT_ID
  delete process.env.NAVER_CLIENT_ID
  t('키가 없으면 nextRequest 가 null', naverBlogAdapter.nextRequest(target()), null)
  process.env.NAVER_CLIENT_ID = id
}

// ── 파싱 ──────────────────────────────────────────────────────────
{
  const r = naverBlogAdapter.parse(blog, ctx())
  t('블로그 3건 파싱', r.reviews.length, 3)
  t('파싱 실패 0', r.parseFailures, 0)
  t('3건 < display 면 마지막 페이지', r.nextCursor, null)

  const a = r.reviews[0]
  t('externalId 는 link', a.externalId, 'https://blog.naver.com/example001/223000000001')
  ok('⚠️ 스니펫이라는 사실이 본문에 박힌다', a.text.startsWith('[네이버 블로그 검색 스니펫 · https://blog.naver.com/example001/223000000001]'))
  ok('<b> 하이라이트가 지워진다', !a.text.includes('<b>') && !a.text.includes('</b>'))
  ok('HTML 엔티티가 풀린다', a.text.includes('"근본 해결"'))
  ok('본문이 실제로 들어간다', a.text.includes('오른쪽만 연결이 자꾸 끊깁니다'))
  t('postdate → writtenAt', a.writtenAt, '2026-09-15')
  t('별점 없음', a.rating, null)
  t('판매처 없음', a.seller, null)
  ok('⛔ authorMasked 는 항상 null (bloggername 저장 안 함)', r.reviews.every((x) => x.authorMasked === null))
  ok('⛔ bloggername 이 본문에도 안 들어간다', !r.reviews.some((x) => x.text.includes('합성_블로그명')))
}
{
  const r = naverCafeAdapter.parse(cafe, ctx(null, 'q:유산균'))
  t('카페 2건 파싱', r.reviews.length, 2)
  // link 없는 항목은 **조용히 버리지 않는다.** 0건 파싱과 "3건 보이는데 2건"은
  // 다른 사건이고, 후자가 구조 변경 신호다(§7.1).
  t('link 없는 항목은 파싱 실패 1건', r.parseFailures, 1)
  t('⚠️ 카페 응답엔 작성일이 없다 → writtenAt null', r.reviews[0].writtenAt, null)
  ok('카페 접두', r.reviews[0].text.startsWith('[네이버 카페 검색 스니펫 · '))
  ok('cafename 을 저장하지 않는다', r.reviews.every((x) => x.authorMasked === null))
}
{
  const r = naverKinAdapter.parse(kin, ctx(null, 'q:탈모샴푸'))
  t('지식iN 2건 파싱', r.reviews.length, 2)
  t('지식iN 파싱 실패 0', r.parseFailures, 0)
  ok('지식iN 접두', r.reviews[0].text.startsWith('[네이버 지식iN · https://kin.naver.com/'))
  t('지식iN 도 작성일 필드를 안 읽는다(실물 미확인)', r.reviews[0].writtenAt, null)
}
{
  const r = naverBlogAdapter.parse(empty, ctx())
  t('결과 0건은 정상 종료', r.parseFailures, 0)
  t('결과 0건이면 커서 null', r.nextCursor, null)
  t('결과 0건이면 리뷰 0건', r.reviews.length, 0)
}
{
  // 인증 실패 본문은 JSON 이지만 items 가 없다. 0건이 아니라 **구조 이상 1건**이다.
  const r = naverBlogAdapter.parse(authError, ctx())
  t('items 가 없으면 파싱 실패 1건', r.parseFailures, 1)
  t('items 가 없으면 커서 null', r.nextCursor, null)
}
{
  const r = naverBlogAdapter.parse('<html>not json</html>', ctx())
  t('JSON 이 아니면 파싱 실패 1건', r.parseFailures, 1)
}

// ── 커서 전진 ─────────────────────────────────────────────────────
//
// ⚠️ 픽스처에서 파생한다(항목을 DISPLAY 개로 복제). 실제 응답 100건을
//    리포에 커밋하지 않기 위해서다 — 검증하려는 건 개수이지 본문이 아니다.
{
  const one = JSON.parse(blog).items[0]
  const full = JSON.stringify({
    items: Array.from({ length: DISPLAY }, (_, i) => ({
      ...one,
      link: `${one.link}-${i}`,
    })),
  })
  const r = naverBlogAdapter.parse(full, ctx())
  t('꽉 찬 페이지면 커서가 전진한다', r.nextCursor, String(1 + DISPLAY))
  t('꽉 찬 페이지는 DISPLAY 건 파싱', r.reviews.length, DISPLAY)

  // ⚠️ 커서가 안 전진하면 같은 페이지를 영원히 다시 읽는다. 다나와에서 실제로
  //    난 사고이고, 안전장치가 폭주를 막아 준 탓에 오래 안 보였다(§7.2).
  const r2 = naverBlogAdapter.parse(full, ctx(String(1 + DISPLAY)))
  ok('두 번째 페이지의 커서는 첫 번째와 다르다', r2.nextCursor !== r.nextCursor)

  // 상한 근처에서는 꽉 찬 페이지여도 멈춘다.
  const r3 = naverBlogAdapter.parse(full, ctx('801'))
  t('상한 근처에서는 꽉 차도 커서 null', r3.nextCursor, null)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('네이버 파서가 틀렸다. 정렬·경계·자격증명 위치가 걸려 있는 코드다.')
  process.exit(1)
}
console.log('네이버 파서 정상 — 경계·정렬·헤더 인증·스니펫 표시·작성자 미저장이 맞물린다.')
