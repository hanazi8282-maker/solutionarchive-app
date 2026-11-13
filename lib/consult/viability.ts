// v71cl-엔진: 사업 성공여부 사전 검증 채점기 — 순수 함수(import 없음, 규칙은 config/viability_rules_v1.json 을 호출자가 읽어서 넘긴다).
// 수치는 전부 그 JSON에서 온다. 여기서 숫자를 새로 만들지 않는다.
import type { ViabilityRules } from './viability-types.ts'

export function getViabilityRules(rules: ViabilityRules, segment: 'P' | 'S' | 'M' | 'E') {
  return {
    segment,
    definition: rules.segments[segment],
    gates: rules.gates,
    killCriteria: rules.kill_criteria_top10,
    failureModes: rules.failure_modes,
  }
}

export type VAnswers = Partial<Record<'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9' | 'V10' | 'V11' | 'V12' | 'V13', 0 | 1 | 2 | 3>>

/** 사업 채점 V1~V13. cap 규칙: V1~V4 가 1점 이하이면 V6~V10 은 최대 1점. 미응답은 0점(추정 금지). */
export function scorePlan(rules: ViabilityRules, answers: VAnswers) {
  const fitLow = (['V1', 'V2', 'V3', 'V4'] as const).some((k) => (answers[k] ?? 0) <= 1)
  const capped: string[] = []
  const items: Record<string, number> = {}
  for (const key of Object.keys(rules.viability_rubric_v1_v13.items)) {
    let v = answers[key as keyof VAnswers] ?? 0
    if (fitLow && (['V6', 'V7', 'V8', 'V9', 'V10'] as const).includes(key as any) && v > 1) {
      v = 1
      capped.push(key)
    }
    items[key] = v
  }
  const total = Object.values(items).reduce((a, b) => a + b, 0)
  const band = rules.viability_rubric_v1_v13.score_bands.find((b) => total >= b.range[0] && total <= b.range[1])
  return { items, total, max: rules.viability_rubric_v1_v13.max_score, band: band?.label ?? null, action: band?.action ?? null, capped }
}

export type AAnswers = Partial<Record<'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10' | 'A11' | 'A12', 0 | 1 | 2>>

/** 답변 채점 A1~A12. gate: 첫 달 17점, 이후 20점 미달이면 재작성. */
export function scoreAdvice(rules: ViabilityRules, answers: AAnswers, opts: { isFirstMonth: boolean }) {
  const items: Record<string, number> = {}
  for (const key of Object.keys(rules.advice_rubric_a1_a12.items)) items[key] = answers[key as keyof AAnswers] ?? 0
  const total = Object.values(items).reduce((a, b) => a + b, 0)
  const band = rules.advice_rubric_a1_a12.score_bands.find((b) => total >= b.range[0] && total <= b.range[1])
  const threshold = opts.isFirstMonth ? rules.advice_rubric_a1_a12.gate_thresholds.first_month : rules.advice_rubric_a1_a12.gate_thresholds.after_first_month
  return { items, total, max: rules.advice_rubric_a1_a12.max_score, band: band?.label ?? null, threshold, passesGate: total >= threshold }
}
