#!/usr/bin/env node
// judge 프롬프트 셀프테스트 (진단 1-2). 네트워크·LLM 없음.
//
// 고정하는 것: **한 프로젝트 안의 judge 프롬프트들이 코퍼스만큼의 공통 접두사를 갖는다.**
// Gemini 암묵적 캐시는 앞쪽 공통 접두사가 일치해야 걸린다. 변하는 문구가 맨 앞에 있으면
// 적중률이 구조적으로 0 이고, 20KB 코퍼스가 앵글마다 정가로 20회 넘게 재전송된다.
// 줄 순서를 되돌리면 이 테스트가 깨진다.

import {
  buildJudgePrompt,
  buildEvidenceCorpus,
  judgeCachePrefix,
  normalizeWhitespace,
} from '../lib/analysis/judge-prompt.ts'

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) pass++
  else {
    fail++
    console.log(`❌ ${name}`)
  }
}

const inputs = [
  { source_type: 'review', raw_text: '리뷰 원문: 향이 좋다. '.repeat(60) },
  { source_type: 'ad', raw_text: '광고 원문: 임상시험 결과 8주 만족도 92%. '.repeat(60) },
  { source_type: 'detail_page', raw_text: '상세 원문: pH 5.5 약산성. '.repeat(60) },
]
const evidence = buildEvidenceCorpus(inputs)

const aspectsA = [{ name: '향', aspect_layer: 'SENSORY', notes: '향이 강하다는 언급 다수' }]
const aspectsB = [{ name: '세정력', aspect_layer: 'FUNCTION', notes: '유분 제거 불만' }]

const p1 = buildJudgePrompt('향이 은은하게 남습니다', aspectsA, 'COPY', evidence)
const p2 = buildJudgePrompt('오후까지 유분이 잡힙니다', aspectsB, 'PRODUCT_SPEC', evidence)

// ── 공통 접두사 ──────────────────────────────────────────────────
function commonPrefixLen(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}
const shared = commonPrefixLen(p1, p2)

ok('두 프롬프트가 다르다(문구·속성·유형이 다르므로)', p1 !== p2)
ok(
  `공통 접두사가 코퍼스 길이 이상 (공유 ${shared}자 / 코퍼스 ${evidence.text.length}자)`,
  shared >= evidence.text.length,
)
ok('공통 접두사가 곧 judgeCachePrefix', p1.startsWith(judgeCachePrefix(evidence)) && p2.startsWith(judgeCachePrefix(evidence)))
ok('프롬프트가 코퍼스 절로 시작한다', p1.startsWith('## 수집 원문'))
// 옛 순서(변하는 문구가 맨 앞)면 공유 접두사가 '## 심사 대상 문구\n' 수준으로 떨어진다.
ok('심사 대상 문구가 맨 앞이 아니다(옛 순서 회귀 방지)', !p1.startsWith('## 심사 대상 문구'))
ok('공유 비율이 80% 이상', shared / p1.length > 0.8)

// ── 정보 손실이 없어야 한다 ──────────────────────────────────────
ok('문구가 들어 있다', p1.includes('향이 은은하게 남습니다'))
ok('속성명이 들어 있다', p1.includes('향'))
ok('판단근거가 들어 있다', p1.includes('향이 강하다는 언급 다수'))
ok('산출물 유형 설명이 들어 있다', p2.includes('내부용 차기 제품 개선 과제 메모'))
ok('지어내지 말라는 지시가 끝에 있다', p1.trimEnd().endsWith('SUBSTANTIATED 는 불가능하다.'))
ok('지시가 절 이름으로 원문을 가리킨다', p1.includes("'수집 원문' 절"))
ok('속성이 없어도 안전', buildJudgePrompt('x', [], 'COPY', evidence).includes('(연결된 속성 없음)'))

// ── 코퍼스 구성 ──────────────────────────────────────────────────
ok('광고가 리뷰보다 앞(근거는 광고·상세에 있다)', evidence.text.indexOf('광고 원문') < evidence.text.indexOf('리뷰 원문'))
ok('인용 검증용 normalized 사본이 있다', evidence.normalized.includes(normalizeWhitespace('광고 원문')))
ok('원문이 없으면 그 사실을 적는다', buildEvidenceCorpus([]).text === '(수집된 원문 없음)')
{
  const big = buildEvidenceCorpus([{ source_type: 'ad', raw_text: 'x'.repeat(50_000) }])
  ok('상한을 넘으면 잘렸다고 알린다', big.text.includes('(원문 일부 생략됨)'))
  ok('상한(20k+여유) 안으로 자른다', big.text.length < 21_000)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
console.log(`- judge 프롬프트 ${p1.length}자 중 ${shared}자(${((shared / p1.length) * 100).toFixed(1)}%)가 앵글 간 공통 접두사`)
if (fail) {
  console.log('judge 프롬프트 순서가 되돌아갔다. 코퍼스가 앵글마다 정가로 재전송된다(진단 1-2).')
  process.exitCode = 1
} else {
  console.log('judge 프롬프트 정상 — 코퍼스 선두·정보 보존·코퍼스 상한 확인.')
}
