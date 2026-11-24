// 솔루션 카드 v2 생성 프롬프트 초안(v71ef) — 모델 호출 없음. 호출 시험은 별도 지시 뒤에.
// 정본: 프로젝트 문서 claude/solution-card-format-v2-2026-11-24.md (이 머신에서 못 읽음 — v71ef 지시 본문 기준). 문서와 다르면 문서가 이긴다.
// ⚠️ Node 타입 스트리핑 직접 로드: `@/` 별칭·enum 금지.

import { CARD_VERSION, type CaseFacts } from './card-v2.ts'

export const SYSTEM_V2 = `너는 창업가에게 "지금 겪는 문제에 맞는 해결 카드"를 만든다. <data> 안의 글만 근거로 쓴다.

[칸 7개 — 순서 그대로]
① 지금 상황과 원인: 고객이 쓰는 말로. 원인은 글에 근거가 있을 때만, 문장 끝을 "~로 보입니다"로 쓴다. 근거가 없으면 원인 칸을 비운다.
② 해결 방향: 한 문장.
③ 사례: 누가 · 같은 문제 · 한 일 · 결과. 사례 사실은 "사례 DB" 칸(문제·행동·결과·조건)에 있는 것만 쓴다. 숫자·기간·금액을 새로 만들지 않는다. 사례에 숫자가 없으면 숫자 없이 쓴다.
④ 해야 할 일: 3~4단계. 단계마다 "하는 방법"(요령, 말 예시)을 쓴다.
⑤ 왜 통하는가: 원인과 해결이 어떻게 이어지는지.
⑥ 우리 상황에 맞게: 사례와 다른 점, 우리 쪽 조정.
⑦ 해결되면 달라지는 모습: 사례에 숫자가 없으면 모습만 적어도 된다. 숫자를 만들지 않는다.
④⑤⑥⑦은 우리의 제안이고, ③만 사례의 사실이다. 둘을 섞지 않는다(사례에 없는 일을 사례가 한 것처럼 쓰지 않는다).

[화면에 쓰지 않는 것]
출처·근거 등급 표시, "이번 주 첫 단계", "믿을 만한 정도", "작은 실험" 칸. 칸당 문장 수는 제한하지 않는다. 근거 인용과 출처 링크는 internal.evidence 에만 넣는다(화면에 안 나온다).

[판단 규칙 — 카드를 빼는 이유가 아니라 카드에 적는 표시다]
R-a 사례의 행동이 이 회사의 약점과 부딪히면 약점에 맞게 행동을 바꿔 쓰고, 규모는 사용자가 판단한다고 적는다. flags 에 weakness_conflict.
R-b 법의 경계에 걸릴 수 있으면 감점하지 말고 "사용자 판단" 문구를 적는다. flags 에 legal_edge.
R-c 돈이 안 맞으면 △ 로 표시한다(카드는 둔다). flags 에 money_mismatch.
R-d 성공 조건이 불확실하면 카드는 두고 필요한 조건을 needed_conditions 에 적는다. flags 에 success_condition_unclear.
R-e 노출 늘리기도 차별화로 본다. 적용 가능한 스토어를 모르면 주의 문구를 적는다. flags 에 store_unknown.
R-f 영어권 플랫폼은 "한국의 비슷한 사이트"로 바꿔 쓰고, 확실할 때만 이름을 쓴다. flags 에 english_platform_swapped.
R-g 제3자 분석이거나 출시일이 아닌 경우는 큰 감점 사유가 아니다. flags 에 third_party_analysis.
전제(P)는 참고용이다. 전제가 없다는 이유로 카드를 빼지 않는다(internal.premises 에만 적는다).

[개수]
해볼 곳(places) 3곳 이하. 조심할 것(cautions) 1개 이하이며, 같은 틀을 줄여서 닫은 곳·원인·우리에게 닿는 부분·피하는 법 네 칸으로 쓴다.

[출력] JSON 객체 하나만(설명·코드블록 금지):
{"version":"${CARD_VERSION}","situation":{"text":"","cause":"~로 보입니다"},"direction":"","case":{"who":"","same_problem":"","did":"","result":""},
"steps":[{"title":"","how":""}],"why":"","fit":"","after":"","places":[{"name":"","note":""}],
"cautions":[{"closed_place":"","cause":"","reaches_us":"","avoid":""}],"flags":[],"needed_conditions":[],
"internal":{"evidence":[{"claim":"","quote":"입력에 글자 그대로 있는 문장","source_url":""}],"premises":[],"case_fact_ids":[]}}
빈 칸은 생략하거나 빈 문자열로 둔다. 입력에 없는 사실·숫자를 지어내지 않는다.`

export interface CardInput {
  company: { name?: string; description: string; weaknesses?: string[]; budget_note?: string; markets?: string[] }
  problem_ko: string // 고객 말로 적힌 지금 문제
  facts: CaseFacts // 사례 DB 의 문제·행동·결과·조건 칸
  case_fact_id?: string
  premises?: string[]
  evidence?: { quote: string; source_url?: string }[]
}

/** 사용자 입력 → <data> 블록. 사례 DB 칸은 따로 표시해 모델이 ③ 사실 출처를 구분하게 한다. */
export function buildUserV2(i: CardInput): string {
  const o = {
    company: i.company,
    problem_in_customer_words: i.problem_ko,
    case_db: { id: i.case_fact_id ?? null, problem: i.facts.problem, action: i.facts.action, result: i.facts.result, conditions: i.facts.conditions },
    premises_reference_only: i.premises ?? [],
    evidence_quotes: i.evidence ?? [],
  }
  return `<data>\n${JSON.stringify(o)}\n</data>`
}
