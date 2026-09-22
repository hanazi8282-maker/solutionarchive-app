#!/usr/bin/env node
// 수기 입력 경로 셀프테스트 — 경쟁사 URL(선택) · 붙여넣기 길이 상한. 네트워크·DB 없음.
//   node scripts/analyze-manual-input-selftest.mjs
//
// 이 파일이 막는 회귀 둘:
//   1. 경쟁사 URL 을 다시 필수로 만드는 것 — 제품도 경쟁사도 없는 사람의 유일한
//      입력 경로가 그 한 칸에 막힌다(남헌 2026-09-23 Q4-A 를 되돌리는 변경이다).
//   2. reverse 모드의 다나와 검사를 같이 푸는 것 — 역설계는 그 URL 이 곧 대상이라,
//      비거나 잘못된 URL 로 만들면 오늘 밤 수집이 조용히 0건으로 끝난다(§7.1).

import { MAX_RAW_TEXT_CHARS, parseCompetitorUrl, parseRawText } from '../lib/analysis/inputs.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const DANAWA = 'https://prod.danawa.com/info/?pcode=252495223'

// ── 경쟁사 URL — forward 는 선택 ──────────────────────────────────
{
  const r = parseCompetitorUrl('', 'forward')
  t('forward: 빈 URL 통과', r.ok, true)
  t('forward: 빈 URL 은 null 로 저장한다(빈 문자열 아님)', r.value, null)
}
t('forward: 공백만 입력도 null', parseCompetitorUrl('   ', 'forward').value, null)
t('forward: 필드 자체가 없어도 null', parseCompetitorUrl(undefined, 'forward').value, null)
t('forward: 문자열이 아니면 null(조용히 통과, 필수가 아니다)', parseCompetitorUrl(123, 'forward').value, null)
t('forward: 값이 있으면 다듬어 그대로 저장', parseCompetitorUrl(`  ${DANAWA}  `, 'forward').value, DANAWA)
// forward 는 다나와가 아니어도 받는다 — 비교 대상은 어느 채널이든 될 수 있다.
t('forward: 다나와가 아닌 URL 도 받는다', parseCompetitorUrl('https://g2.com/products/x', 'forward').value, 'https://g2.com/products/x')

// ── 경쟁사 URL — reverse 는 여전히 필수 + 다나와만 ────────────────
{
  const r = parseCompetitorUrl('', 'reverse')
  t('reverse: 빈 URL 은 거절', r.ok, false)
  ok('reverse: 무엇을 넣어야 하는지 말한다', r.error.includes('다나와'))
}
{
  const r = parseCompetitorUrl('https://smartstore.naver.com/x/products/1', 'reverse')
  t('reverse: 잘못된 URL 은 여전히 거절', r.ok, false)
  ok('reverse: 거절 사유가 한국어', r.error.includes('역방향'))
}
t('reverse: 다나와 상세 URL 은 통과', parseCompetitorUrl(DANAWA, 'reverse').value, DANAWA)
t('reverse: 다나와라도 pcode 없는 검색 URL 은 거절', parseCompetitorUrl('https://search.danawa.com/dsearch.php?k1=a', 'reverse').ok, false)

// ── 붙여넣기 원문 — 길이 상한은 안전판이지 발행 경계가 아니다 ─────
t('원문: 빈 값은 거절', parseRawText('').ok, false)
t('원문: 공백만도 거절', parseRawText('   ').ok, false)
t('원문: 문자열이 아니면 거절', parseRawText(null).ok, false)
t('원문: 앞뒤 공백을 다듬는다', parseRawText('  경험담  ').value, '경험담')
// 케이스 근거 스니펫 300자 상한과 **다른 축**이다(남헌 2026-09-23: 분석용 전문은 허용,
// 발행 경계는 케이스 근거에 있다). 300자를 여기 들고 오면 긴 글이 통째로 막힌다.
t('원문: 300자 훨씬 넘어도 통과(분석용 전문 허용)', parseRawText('가'.repeat(5000)).ok, true)
t(`원문: 상한 ${MAX_RAW_TEXT_CHARS}자는 통과`, parseRawText('가'.repeat(MAX_RAW_TEXT_CHARS)).ok, true)
{
  const r = parseRawText('가'.repeat(MAX_RAW_TEXT_CHARS + 1))
  t(`원문: ${MAX_RAW_TEXT_CHARS + 1}자는 거절`, r.ok, false)
  // 자르고 통과시키면 뒷부분이 사라진 줄 모른 채 분석이 돈다(§7.1).
  ok('원문: 자르지 않고 거절한다', !('value' in r))
  ok('원문: 상한과 실제 길이를 둘 다 알려준다', r.error.includes('20,000') && r.error.includes('20,001'))
}
// trim 뒤 길이로 잰다 — 앞뒤 공백 때문에 거절되면 사람이 이유를 알 수 없다.
t('원문: 공백을 뺀 뒤 상한을 잰다', parseRawText(`  ${'가'.repeat(MAX_RAW_TEXT_CHARS)}  `).ok, true)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('수기 입력 경로가 틀렸다. 이 상태면 제품 없는 사람의 입력이 막히거나 역설계가 빈 대상으로 돈다.')
  process.exitCode = 1
} else {
  console.log('수기 입력 경로 정상 — forward 선택 · reverse 필수(다나와) · 원문 상한 20,000자 확인.')
}
