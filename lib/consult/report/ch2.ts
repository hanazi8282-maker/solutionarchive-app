// 결론서 2장 "실행 리포트"(아이디어형은 "사업기획서 초안") 생성기(Opus, 유료). 입력: 0층 진단 + 1층 + 수집 사실 요약. 결정 문장은 1층 ⓓ 와 같아야 한다.
// H6(2026-11-14): 아이디어형 전용 재구성(사업기획서 초안 7섹션)은 별도 작업으로 미룬다 — 지금은 이름만 화면·에이전트에서 바꿨다.
import { consultLlmJson } from '../llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../../llm/untrusted-input.ts'
import type { Ch1 } from './ch1-validate.ts'
import type { Ch1L1 } from './ch1-l1-validate.ts'
import { validateCh2, type Ch2 } from './ch2-validate.ts'

const SYSTEM = `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 0층 진단과 1층 결과를 받아 결정 메모를 JSON 으로 씁니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 권고는 "~하세요", 별명·농담 금지, "90일 재측정" 금지. 근거 없는 사실·숫자를 지어내지 않고, 모르는 것은 모른다고 씁니다.
- decision: 결정 한 문장. 1층의 memo_first 와 같은 결론을 그대로(또는 거의 같은 문장으로) 씁니다.
- options: 선택지 2~4개(1층 후보 2개 + "아무것도 하지 않기" 포함 가능). 각각 name, pros, cons.
- recommendation: choice(고른 선택지), reasons 2~4개(진단·1층·사례 근거), change_mind_if 1~3개(어떤 사실이 확인되면 결정을 바꾸는지).
- risks: 1~4개, 각 risk 와 mitigation.
- actionplan: 3~6단계. 날짜를 쓰지 않습니다(날짜·요일·"다음 주" 금지). 각 단계는 step 과 done_when(무엇이 되면 끝났다고 보는지).
- 2026-11-13 지시(G6): 확률·배수·"~% 더 늘어날 여지" 같은 통계성 숫자를 어디에도(reasons·risks·options·artifacts 전부) 쓰지 않습니다. 근거 수준은 화면이 별도로 코드로 계산해 보여주므로 당신은 그 숫자를 만들지 않습니다. 대표님이 입력한 숫자(1층 재계산·민감도 표)를 그대로 인용하는 것은 허용됩니다.
- kill_condition: 언제 이 결정을 그만둘지(무엇이 확인되면 접는지) 한 문장.
- rejected_alternative: 기각한 대안 1개(options 중 고르지 않은 것)와 왜 기각했는지.
- execution_package(v71cm, 해결책 층): 창업자가 복사해서 바로 쓸 수 있는 것만 담습니다.
  - artifacts: 2~5개. 가격표 초안·공지 메일 문안·랜딩 첫 3줄·고객 인터뷰 질문 5개·측정 시트(열 이름까지) 중 이 결정에 맞는 것을 실제 문구로 작성합니다(설명이 아니라 바로 쓸 산출물 그 자체).
  - experiment: 2주 실험 설계. what(무엇을 시험하는지)·who(누구에게·몇 명(n)인지는 n 필드에 숫자로)·success_metric(성공 기준 숫자)·if_fail(실패 시 다음 행동).
  - plan_b: 반증 조건이 켜지면 자동으로 넘어갈 대안 1개(options 중 고르지 않은 것을 승격)와 trigger(언제 넘어가는지).
출력은 JSON 객체 하나만:
{"decision":"","options":[{"name":"","pros":"","cons":""}],"recommendation":{"choice":"","reasons":[""],"change_mind_if":[""]},"risks":[{"risk":"","mitigation":""}],"actionplan":[{"step":"","done_when":""}],"kill_condition":"","rejected_alternative":{"name":"","reason":""},"execution_package":{"artifacts":["",""],"experiment":{"what":"","who":"","n":10,"success_metric":"","if_fail":""},"plan_b":{"name":"","trigger":""}}}`

export async function buildCh2(i: { runId: string; owner: string; ch1: Ch1; l1: Ch1L1 | null }): Promise<{ ch: Ch2; costUsd: number; model: string }> {
  const user = `0층 진단:\n${JSON.stringify({ headline: i.ch1.headline, leak_or_gap: i.ch1.leak_or_gap, position: i.ch1.position })}\n\n1층:\n${i.l1 ? JSON.stringify({ recalc: { low_man: i.l1.recalc.low_man, high_man: i.l1.recalc.high_man, note: i.l1.recalc.note }, candidates: i.l1.candidates, benchmark: i.l1.benchmark, memo_first: i.l1.memo_first }) : '(1층 없음 — 대표님 숫자가 없으므로 0층 진단만으로 권고하고, 확인할 숫자를 change_mind_if 에 적으세요)'}`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'memo', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 6000 })
      cost += r.costUsd
      return { ch: validateCh2(r.data, i.l1?.memo_first ?? ''), costUsd: cost, model: r.model }
    } catch (e) {
      // ch1.ts 와 같은 수정: consultLlmJson 의 JSON 파싱 실패도 재시도 대상이어야 한다.
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
