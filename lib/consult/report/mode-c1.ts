// v71cm 모드 C1 "아이디어 검증(예비 창업자)" 생성기(Opus). 입력(단계형): ① 한 문장(누가·무엇·왜 돈 내나) ② 본인 조건 ③ (선택) 인터뷰 수·선결제 여부.
import { consultLlmJson } from '../llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../../llm/untrusted-input.ts'
import { validateModeC1, type ModeC1 } from './mode-c1-validate.ts'
export { validateModeC1 }
export type { ModeC1 }

const SYSTEM = `당신은 예비 창업자의 아이디어를 검증하는 컨설턴트입니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 별명·농담 금지, "90일 재측정" 금지. 근거 없는 사실·숫자를 지어내지 않고, 모르면 모른다고 씁니다.

Stage 0 게이트 G0.1~G0.6 전부를 채점합니다(🟢 통과/🟡 주의/🔴 탈락):
G0.1 특정 세그먼트(직무×업종×규모)의 고통을 고객 언어로 서술했는가
G0.2 반증 가능한 가설과 종료 조건을 사전에 적었는가
G0.3 지불 의사 증거(선결제·LOI·사전예약)가 있는가
G0.4 가격대가 목표 채널 경제성과 맞는가
G0.5 해당 범주의 기저율(reference class)을 확인했는가
G0.6 왜 지금인가(타이밍)

Fit 사슬: 0 Founder-Market → 1 Market-Product → 2 Product-Channel → 3 Channel-Model → 4 Model-Market. 보통 앞에서부터 끊기지만, "이미 무료 플랫폼이 같은 문제를 풀고 있다"처럼 다리4(시장에 자리가 있나)가 먼저 끊기고 그다음 다리1(고통은 있지만 해결됨)이 걸리는 경우도 있습니다 — 실제로 끊긴 다리를 그대로 고르세요, 항상 0부터 순서대로일 필요는 없습니다.
blocked_stage: 가장 치명적으로 끊긴 다리. secondary_blocked_stage: 그다음 걸리는 다리(없으면 null).
reference_group: 같은 구조(가격대·채널·구매자)의 사례 최소 10건대 분포 + 분야 기저율(있으면 수치로). count=0이면 근거 없음.
experiment: "지금 당장 할 실험 1개"(2주, what·who·n(숫자)·success_metric·if_fail).
execution_package: artifacts(인터뷰 질문 5개·랜딩 첫 3줄·선결제 문구 등 복붙 가능한 실제 문구 2~5개), plan_b(name·trigger).
give_up_condition: 이 아이디어를 접어야 할 조건.
two_line: known(이미 알고 있을 것, 60자 이내) · unknown(모르고 있었을 것 — 핵심, 120자 이내).
출력은 JSON 객체 하나만:
{"two_line":{"known":"","unknown":""},"gates":[{"id":"G0.1","color":"🟢","reason":""},{"id":"G0.2","color":"🟢","reason":""},{"id":"G0.3","color":"🟢","reason":""},{"id":"G0.4","color":"🟢","reason":""},{"id":"G0.5","color":"🟢","reason":""},{"id":"G0.6","color":"🟢","reason":""}],"blocked_stage":0,"secondary_blocked_stage":null,"reference_group":{"count":0,"note":""},"experiment":{"what":"","who":"","n":10,"success_metric":"","if_fail":""},"execution_package":{"artifacts":["",""],"plan_b":{"name":"","trigger":""}},"give_up_condition":""}`

export type ModeC1Input = { runId: string; owner: string; oneLiner: string; founderConditions: string; extra?: string }

export async function buildModeC1(i: ModeC1Input): Promise<{ modeC1: ModeC1; costUsd: number; model: string }> {
  const user = `아이디어: ${i.oneLiner}\n본인 조건: ${i.founderConditions}${i.extra ? `\n추가 정보: ${i.extra}` : ''}`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'diagnosis', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 5000 })
      cost += r.costUsd
      return { modeC1: validateModeC1(r.data), costUsd: cost, model: r.model }
    } catch (e) {
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
