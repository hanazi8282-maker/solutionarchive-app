#!/usr/bin/env node
// parseDanawaProductUrl 셀프테스트. 네트워크·DB 없음.
//
// 이 함수가 두 게이트의 유일한 판정기다:
//   - reverse 모드 진입 게이트 (결정 B) — 다나와 URL 이 아니면 명확히 막는다
//   - 수집 타깃 등록 pcode 확정
// 틀리면 조용히 빈 결과를 주거나(§7.1 위반), 엉뚱한 pcode 로 다른 상품 리뷰를 쌓는다.

import { parseDanawaProductUrl } from '../lib/review/danawa-url.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 통과: 상품 상세 URL ──────────────────────────────────────────
{
  const r = parseDanawaProductUrl('https://prod.danawa.com/info/?pcode=252495223')
  t('상품 상세 URL → pcode', r.ok && r.pcode, '252495223')
}
{
  const r = parseDanawaProductUrl('  https://prod.danawa.com/info/?pcode=12345&cate=112758  ')
  ok('앞뒤 공백·부가 파라미터 있어도 통과', r.ok && r.pcode === '12345')
}

// ── 거절: 다나와 URL 이 아님 (reverse 게이트가 여기서 막아야 한다) ──
for (const [name, url] of [
  ['스마트스토어', 'https://smartstore.naver.com/store/products/1234567'],
  ['쿠팡', 'https://www.coupang.com/vp/products/7654321'],
  ['아마존', 'https://www.amazon.com/dp/B0ABCD1234'],
  ['G2', 'https://www.g2.com/products/notion/reviews'],
  ['Capterra', 'https://www.capterra.com/p/12345/Notion/'],
  ['다나와 검색결과', 'https://search.danawa.com/dsearch.php?query=%EC%84%A0%ED%92%8D%EA%B8%B0'],
  ['다나와 카테고리(pcode 없음)', 'https://prod.danawa.com/list/?cate=112758'],
  ['URL 아님(그냥 텍스트)', '선풍기 추천'],
  ['빈 문자열', ''],
]) {
  const r = parseDanawaProductUrl(url)
  ok(`거절: ${name}`, r.ok === false && typeof r.error === 'string' && r.error.length > 0)
}

// ── §7.1: 실패는 명확한 에러 문자열이지 조용한 빈 결과가 아니다 ──
{
  const r = parseDanawaProductUrl('https://smartstore.naver.com/x/products/1')
  ok('거절 시 에러 메시지에 pcode 안내가 있다', !r.ok && r.error.includes('pcode'))
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('다나와 URL 판정기가 틀렸다. reverse 게이트가 새거나 엉뚱한 상품을 받는다.')
  process.exitCode = 1
} else {
  console.log('다나와 URL 판정기 정상 — 상품 상세만 통과, 나머지는 명확히 거절.')
}
