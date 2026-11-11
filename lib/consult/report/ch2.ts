// 결론서 2장 "결정 메모" 생성기(Opus, 유료). 입력: 0층 진단 + 1층 + 수집 사실 요약. 결정 문장은 1층 ⓓ 와 같아야 한다.
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
출력은 JSON 객체 하나만:
{"decision":"","options":[{"name":"","pros":"","cons":""}],"recommendation":{"choice":"","reasons":[""],"change_mind_if":[""]},"risks":[{"risk":"","mitigation":""}],"actionplan":[{"step":"","done_when":""}]}`

export async function buildCh2(i: { runId: string; owner: string; ch1: Ch1; l1: Ch1L1 }): Promise<{ ch: Ch2; costUsd: number; model: string }> {
  const user = `0층 진단:\n${JSON.stringify({ headline: i.ch1.headline, leak_or_gap: i.ch1.leak_or_gap, position: i.ch1.position })}\n\n1층:\n${JSON.stringify({ recalc: { low_man: i.l1.recalc.low_man, high_man: i.l1.recalc.high_man, note: i.l1.recalc.note }, candidates: i.l1.candidates, benchmark: i.l1.benchmark, memo_first: i.l1.memo_first })}`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'memo', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 4500 })
    cost += r.costUsd
    try {
      return { ch: validateCh2(r.data, i.l1.memo_first), costUsd: cost, model: r.model }
    } catch (e) {
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
