// R7 에이전트 순수부 — 단계 파싱, 도구 인자 검증, 손실 재계산(곱셈은 코드가 한다). 셀프테스트가 node 로 바로 불러 검사한다.
import { CATEGORIES, MECHANISMS } from './cases-validate.ts'
import { assertNoStatViolations } from './report/stat-lint.ts'

export const TOOLS = ['search_cases', 'recalc_loss', 'show_memo', 'get_viability_rules'] as const
export type ToolName = (typeof TOOLS)[number]
export type Step = { kind: 'tool'; tool: ToolName; args: Record<string, unknown> } | { kind: 'final'; text: string }

export const MAX_STEPS = 4

/** 모델 출력 → 한 단계. {"tool":..,"args":{..}} 또는 {"final":".."}. 둘 다 아니면 던진다(빈 답변으로 접지 않는다). */
export function parseStep(raw: Record<string, unknown>): Step {
  if (typeof raw.final === 'string' && raw.final.trim()) {
    const text = raw.final.trim().slice(0, 3000)
    assertNoStatViolations(text, '에이전트 답변') // G6: 근거 없는 확률·변화율 서술은 답변에서도 거절한다.
    return { kind: 'final', text }
  }
  const tool = raw.tool
  if (typeof tool === 'string' && (TOOLS as readonly string[]).includes(tool)) {
    const args = raw.args && typeof raw.args === 'object' && !Array.isArray(raw.args) ? (raw.args as Record<string, unknown>) : {}
    return { kind: 'tool', tool: tool as ToolName, args }
  }
  throw new Error('에이전트 형식 오류: tool 또는 final 이 필요함')
}

export function validateToolArgs(tool: ToolName, args: Record<string, unknown>): Record<string, unknown> {
  if (tool === 'search_cases') {
    const category = typeof args.category === 'string' && (CATEGORIES as readonly string[]).includes(args.category) ? args.category : null
    const mechanism = typeof args.mechanism === 'string' && (MECHANISMS as readonly string[]).includes(args.mechanism) ? args.mechanism : null
    if (!category && !mechanism) throw new Error('search_cases: category 또는 mechanism 이 허용 목록 안에 있어야 함')
    return { category, mechanism }
  }
  if (tool === 'recalc_loss') {
    const n = (k: string, min: number, max: number) => {
      const x = Number(args[k])
      if (!Number.isFinite(x) || x < min || x > max) throw new Error(`recalc_loss: ${k} 범위 오류`)
      return x
    }
    const low = n('leak_low', 0, 1)
    const high = n('leak_high', 0, 1)
    if (high < low) throw new Error('recalc_loss: leak_high 가 leak_low 보다 작음')
    return { audience: n('audience', 1, 1e9), rate_pct: n('rate_pct', 0, 100), value_man: n('value_man', 0, 1e6), leak_low: low, leak_high: high }
  }
  if (tool === 'get_viability_rules') {
    const segment = args.segment
    if (typeof segment !== 'string' || !['P', 'S', 'M', 'E'].includes(segment)) throw new Error('get_viability_rules: segment 는 P|S|M|E 중 하나')
    return { segment }
  }
  return {}
}

/** 월 손실(만원) = 대상자 × 전환율 × 객단가 × 놓치는 비율. 모델이 아니라 여기서 곱한다. */
export function recalcLoss(a: { audience: number; rate_pct: number; value_man: number; leak_low: number; leak_high: number }): { low_man: number; high_man: number; formula: string } {
  const base = a.audience * (a.rate_pct / 100) * a.value_man
  return {
    low_man: Math.round(base * a.leak_low),
    high_man: Math.round(base * a.leak_high),
    formula: `${a.audience} × ${a.rate_pct}% × ${a.value_man}만원 × ${a.leak_low}~${a.leak_high}`,
  }
}
