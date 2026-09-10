#!/usr/bin/env node
// 각색 제안(adaptation_suggestion) 파싱 로직 셀프테스트. 네트워크·DB·LLM 호출 없음.
//
// §17-2 갭 #2: reverse 모드에서만 의미 있는 필드라, LLM 응답에 뭐가 오든
// forward 모드에서는 절대 저장되면 안 된다(무의미한 필드를 억지로 채우지 않는다).
// 여기서는 writer LLM 응답을 파싱하는 순수 함수만 떼어 테스트한다 — 실제
// LLM 호출·프롬프트 생성 전체는 모킹 대상이 아니라 애초에 안 쓴다.

import { extractAdaptationSuggestion, systemPromptFor } from '../lib/analysis/angle-adaptation.ts'

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

// ── extractAdaptationSuggestion ──────────────────────────────────
t(
  'reverse + 정상 문자열 → 그대로(trim)',
  extractAdaptationSuggestion('reverse', { adaptation_suggestion: '  가격대를 낮춰 제시  ' }),
  '가격대를 낮춰 제시',
)
t(
  'forward + 문자열 있어도 → null (모델이 그래도 채워 보낸 경우 방어)',
  extractAdaptationSuggestion('forward', { adaptation_suggestion: '이건 저장되면 안 됨' }),
  null,
)
t('reverse + 필드 없음 → null', extractAdaptationSuggestion('reverse', {}), null)
t('reverse + 빈 문자열 → null', extractAdaptationSuggestion('reverse', { adaptation_suggestion: '   ' }), null)
t(
  'reverse + 문자열 아님(숫자) → null',
  extractAdaptationSuggestion('reverse', { adaptation_suggestion: 42 }),
  null,
)
t('forward + 필드 없음 → null', extractAdaptationSuggestion('forward', {}), null)

// ── systemPromptFor: 모드별 프롬프트 필드 유무 ───────────────────
ok(
  'reverse 프롬프트에 adaptation_suggestion JSON 필드가 있다',
  systemPromptFor('reverse').includes('"adaptation_suggestion"'),
)
ok(
  'forward 프롬프트에는 adaptation_suggestion 필드가 없다',
  !systemPromptFor('forward').includes('adaptation_suggestion'),
)
ok(
  'reverse 프롬프트에 각색 안내 문단이 포함된다',
  systemPromptFor('reverse').includes('각색해야 하는지'),
)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('각색 제안 파싱/프롬프트 분기가 틀렸다 — forward 모드에 무의미한 필드가 새거나, reverse 모드에서 필드가 안 나갈 수 있다.')
  process.exitCode = 1
} else {
  console.log('각색 제안 파싱 정상 — reverse 모드에서만 채워지고, forward 는 항상 null.')
}
