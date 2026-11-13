// v71cm 모드 B "기존 결정 검증" 생성기(Opus). 입력: 회사(기존 진단 또는 사실) + 하려는 결정 한 문장 + (선택) 이유·기대·예산.
// 로직(v71cm §2): 결정→다리 매핑 → cap 규칙(앞 다리 미확인이면 순서_바꿈) → 참조군 → 사전부검 → 반증조건·예측 → 실행패키지 → 그만둘 조건.
import { consultLlmJson } from '../llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../../llm/untrusted-input.ts'
import { validateModeB, type ModeB } from './mode-b-validate.ts'
export { validateModeB }
export type { ModeB }

const SYSTEM = `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 창업자가 "하려는 결정"을 말하면, 그 결정을 지금 해도 되는지 판정합니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 별명·농담 금지, "90일 재측정" 금지. 근거 없는 사실·숫자를 지어내지 않고, 모르면 모른다고 씁니다.

Fit 사슬(순서, 뒤 단계는 앞 단계가 성립해야 의미 있음): 0 Founder-Market → 1 Market-Product → 2 Product-Channel → 3 Channel-Model → 4 Model-Market.
절차:
1. target_stage: 이 결정이 고치려는 다리 번호(0~4)를 정합니다.
2. blocked_earlier_stage: target_stage 보다 앞에 있는 다리 중 "비어 있음/미확인"인 가장 앞 단계가 있으면 그 번호, 없으면 null.
3. cap 규칙: blocked_earlier_stage 가 있으면 verdict 는 반드시 "순서_바꿈"입니다(그 앞 다리부터 고쳐야 하므로 진행/조건부_진행을 고를 수 없습니다). blocked_earlier_stage 가 없으면 상황에 따라 진행/조건부_진행/중단 중 고릅니다.
4. verdict: "진행"(바로 해도 됨) | "조건부_진행"(조건을 달아 진행) | "순서_바꿈"(먼저 할 일이 있음) | "중단"(하지 말아야 함) 중 하나. verdict_reason 에 그 이유.
5. reference_group: 비슷한 결정을 한 사례가 있으면 count(건수)와 note(분포 요약, 성공만 아니라 실패도 포함해서 설명). 없으면 count:0.
6. premortem: "6개월 뒤 이 결정이 실패했다면 이유 3개"를 2~4개 적습니다.
7. falsifiable_condition: 이 판정이 틀렸다고 볼 반증 조건 한 문장("X가 Y 이상/미만이면 이 판정은 틀림").
8. prediction_pct: 이 판정이 맞다고 보는 확률(0~100).
9. kill_condition: 언제 이 방향을 접을지.
10. execution_package: artifacts(2~5개, 복붙 가능한 실제 문구·산출물 — 설명이 아니라 산출물 그 자체), experiment(2주 실험: what·who·n(숫자)·success_metric·if_fail), plan_b(name·trigger — 반증 조건이 켜지면 넘어갈 대안).
11. two_line: known(이미 알고 있을 것, 60자 이내) · unknown(모르고 있었을 것 — 이 판정의 핵심, 120자 이내).
출력은 JSON 객체 하나만:
{"two_line":{"known":"","unknown":""},"verdict":"진행|조건부_진행|순서_바꿈|중단","verdict_reason":"","target_stage":0,"blocked_earlier_stage":null,"reference_group":{"count":0,"note":""},"premortem":["",""],"falsifiable_condition":"","prediction_pct":50,"kill_condition":"","execution_package":{"artifacts":["",""],"experiment":{"what":"","who":"","n":10,"success_metric":"","if_fail":""},"plan_b":{"name":"","trigger":""}}}`

export type ModeBInput = {
  runId: string
  owner: string
  company: string
  decision: string
  context: string // 회사 현황·숫자(내부 숫자는 화면 비노출 — 입력으로만 사용)
}

export async function buildModeB(i: ModeBInput): Promise<{ modeB: ModeB; costUsd: number; model: string }> {
  const user = `회사: ${i.company}\n하려는 결정: ${i.decision}\n\n회사 현황:\n<<<\n${i.context}\n>>>`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'diagnosis', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 3000 })
      cost += r.costUsd
      return { modeB: validateModeB(r.data), costUsd: cost, model: r.model }
    } catch (e) {
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
