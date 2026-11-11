// 1층 생성기 — 0층 진단(Ch1) + 사용자 숫자 3개를 받아 ⓐ~ⓓ 를 만든다. 결론서 v4 1장의 확장 블록이다(R11 에서 같은 모듈을 조립).
import { consultLlmJson } from '../llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../../llm/untrusted-input.ts'
import type { Ch1 } from './ch1-validate.ts'
import { validateL1, type Ch1L1, type UserNumbers } from './ch1-l1-validate.ts'

export type SimilarCase = { name: string; what: string }

const SYSTEM = `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 0층 진단과 대표님이 직접 입력한 숫자 3개를 받아 1층을 JSON 으로 씁니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 권고는 "~하세요", 별명·농담 금지, "90일 재측정"·"액션플랜" 금지. 근거 없는 사실을 지어내지 않습니다.
- recalc.terms: 월 손실(만원)을 곱셈으로 만드는 항 2~6개. 각 항은 {label, low, high, user}. 대표님 숫자 3개(월 대상자 수, 현재 전환율, 객단가)는 user=true 이고 low=high=입력값 그대로입니다(전환율은 % 숫자 그대로 또는 0~1 비율 중 하나로 일관되게). 나머지 항(예: 놓치는 비율 0.05~0.2)은 가정이며 user=false 로 두고 low<high 구간으로 냅니다. 모든 항을 곱하면 월 손실(만원)이 되도록 단위를 맞추세요(전환율을 % 로 쓰면 0.01 배 항을 따로 두세요). 곱셈은 제가 합니다.
- candidates: 발전 방향 후보 정확히 2개. 각 후보에 title, what(무엇을 하는가), why(왜 — 진단·수집 사실·유사 사례 근거), rebuttal(이 후보가 틀릴 수 있는 가장 강한 반박 1개).
- benchmark: position(비슷한 회사들 사이에서의 위치), basis(근거). 유사 사례 목록은 아래 "비슷한 사례"에 있는 것만 인용하고 없으면 근거를 약하게 말합니다.
- memo_first: 결정 메모의 첫 문장(권고 한 문장, "~하세요" 체, 80자 이내).
출력은 JSON 객체 하나만:
{"recalc":{"terms":[{"label":"","low":0,"high":0,"user":true}],"note":""},"candidates":[{"title":"","what":"","why":"","rebuttal":""},{"title":"","what":"","why":"","rebuttal":""}],"benchmark":{"position":"","basis":""},"memo_first":""}`

export async function buildL1(i: { runId: string; owner: string; ch1: Ch1; nums: UserNumbers; similar: SimilarCase[] }): Promise<{ l1: Ch1L1; costUsd: number; model: string }> {
  const sim = i.similar.length ? i.similar.map((c) => `- ${c.name}: ${c.what}`).join('\n') : '(보유 사례 없음)'
  const user = `0층 진단:\n${JSON.stringify({ headline: i.ch1.headline, leak_or_gap: i.ch1.leak_or_gap, position: i.ch1.position, loss: i.ch1.loss })}\n\n대표님 숫자: 월 대상자 수 ${i.nums.audience} · 현재 전환율 ${i.nums.rate_pct}% · 객단가 ${i.nums.value_man}만원\n\n비슷한 사례:\n${sim}`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'l1', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 3500 })
    cost += r.costUsd
    try {
      const l1 = validateL1(r.data, i.nums)
      l1.benchmark.similar = i.similar.slice(0, 3)
      return { l1, costUsd: cost, model: r.model }
    } catch (e) {
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
