// 앵글 생성(app/api/analyze/angle/route.ts) writer 프롬프트 중, reverse 모드
// "각색 제안"(§17-2 갭 #2)에 관련된 순수 조각만 떼어낸다. route.ts 는 Next.js
// 런타임 전용 import(next/server 등)를 갖고 있어 순수 node 스크립트에서 직접
// import 할 수 없다 — 여기 있는 함수만 상대경로로 셀프테스트에서 import 한다
// (scripts/analyze-angle-adaptation-selftest.mjs).

import type { AnalysisMode } from './types'

export const ANGLE_TYPE_GUIDE = `앵글 유형 정의:
- PAS: 문제(Problem)→동요(Agitate)→해결(Solution). 감정적 페인을 정면으로 건드린다.
- MECHANISM: 왜 되는지의 고유 작동원리를 설명해 믿게 만든다.
- COMPARISON: 대안/경쟁 방식과 대조해 우위를 드러낸다.
- SOCIAL_PROOF: 다른 사람들의 선택·후기를 근거로 안심시킨다.
- FEAR_FOMO: 놓쳤을 때의 손실·뒤처짐을 환기한다.
- ASPIRATION: 도달하고 싶은 상태·정체성을 그려준다.
- REATTRIBUTION: "당신 탓이 아니다". 자책 인정 → 원인은 당신이 아니라 구조/제품 → 구조적 해법 제시.
  반드시 이 3단 구조를 지켜라. 사용자를 탓하거나 훈계하지 마라.
- SELF_SELECTION: "이런 사람에게는 맞고, 이런 사람에게는 안 맞는다"로 스스로 걸러내게 한다.

산출물 유형(output_type)별 톤:
- COPY: 실제 노출되는 카피 문구 한 줄. 헤드라인으로 바로 쓸 수 있어야 한다.
- OFFER: 카피가 아니라 "오퍼(제안) 문구". 보장·교환·체험·구성 등 거래 조건으로 페인을 없앤다.
  예) 사이즈가 안 맞으면 무료 교환, 30일 안에 효과 없으면 전액 환불 같은 형태.
- PRODUCT_SPEC: 광고 문구가 아니라 "차기 제품 개선 과제" 메모. 무엇을 고쳐야 하는지 한 줄로.
- BASELINE_SPEC: 광고 문구가 아니라 "기본으로 반드시 충족해야 하는 사양" 목록 요약 한 줄.
  이건 차별화 소구점이 아니라, 빠지면 탈락하는 기본기다.`

// reverse 모드(§13-1)에서만 "각색 제안"을 같은 호출에서 함께 받는다 — 별도 LLM
// 호출을 신설하지 않는다(§17-2 원문 지시). forward 모드는 역산 대상 자체가
// 없어 무의미하므로 프롬프트에서 필드째로 뺀다(§17-2 — 무의미한 필드를 억지로
// 채우지 마라).
const ADAPTATION_SUGGESTION_GUIDE = `
이 앵글은 reverse 모드(경쟁사의 이미 성공한 상품을 역설계하는 분석)에서 나왔다.
"경쟁사 상품 URL" 은 우리 상품이 아니라 역산 대상이다. 위 산출물이 경쟁사
맥락에서 통했던 이유를 바탕으로, 이걸 "내 상품 한 줄 소개"에 맞게 어떻게
각색해야 하는지 한 줄로 제안해라(그대로 베끼면 안 되는 이유·바꿔야 할 지점
중심으로).`

export function systemPromptFor(mode: AnalysisMode): string {
  const jsonFields = mode === 'reverse'
    ? `{ "angle_type": "배정된 유형 또는 허용 후보 중 하나",
  "headline_draft": "산출물 한 줄",
  "reason": "이 문구를 만든 근거 한 줄",
  "adaptation_suggestion": "경쟁사 앵글을 내 상품에 맞게 각색하는 방법 한 줄" }`
    : `{ "angle_type": "배정된 유형 또는 허용 후보 중 하나",
  "headline_draft": "산출물 한 줄",
  "reason": "이 문구를 만든 근거 한 줄" }`

  return `너는 이커머스 소구점 발굴 파이프라인의 Stage4(앵글 생성)를 수행한다.
주어진 속성(aspect) 하나와 배정된 앵글 유형에 맞춰 한국어 산출물 1건을 만든다.

${ANGLE_TYPE_GUIDE}

작성 제약:
원문에 근거가 없는 효능·결과·변화는 단정하지 마라. 1인칭 경험담 형식으로 우회하는 것도 금지다.
${mode === 'reverse' ? ADAPTATION_SUGGESTION_GUIDE : ''}

반드시 JSON만 출력해라. 형식:
${jsonFields}`
}

/**
 * writer 응답에서 adaptation_suggestion 을 뽑는다. forward 모드에서는 프롬프트에서
 * 필드째로 뺐으므로 항상 null로 눕힌다 — 모델이 그래도 채워 보내는 경우까지 방어한다.
 */
export function extractAdaptationSuggestion(mode: AnalysisMode, parsed: Record<string, unknown>): string | null {
  if (mode !== 'reverse') return null
  const v = parsed.adaptation_suggestion
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
