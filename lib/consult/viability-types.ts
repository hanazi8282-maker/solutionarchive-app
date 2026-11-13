// config/viability_rules_v1.json 의 타입. JSON 을 바꾸면 여기도 맞춰 고친다(자동 생성 아님).
export type ScoreBand = { range: [number, number]; label: string; action?: string }

export type ViabilityRules = {
  segments: Record<'P' | 'S' | 'M' | 'E', { name: string; definition: string }>
  gates: Record<string, unknown>
  kill_criteria_top10: unknown[]
  failure_modes: Record<string, unknown>
  viability_rubric_v1_v13: { max_score: number; items: Record<string, unknown>; score_bands: ScoreBand[] }
  advice_rubric_a1_a12: { max_score: number; items: Record<string, unknown>; score_bands: ScoreBand[]; gate_thresholds: { first_month: number; after_first_month: number } }
}
