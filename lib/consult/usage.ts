// llm_usage 기록 + 단가 계산. 컨설팅의 모든 LLM 호출은 recordUsage 를 거친다(예산: 0층 ≤$0.5 · 메모 ≤$1.5 · 대화 1턴 ≈$0.05).
// 단가는 USD/1M 토큰 추정치(입력,출력) — 실제 청구와 다를 수 있어 "추정"으로만 쓴다. 바꿀 땐 여기 한 곳.
import { createClient } from '@/lib/supabase/server'

import { costUsd, type ModelTag, type Purpose } from './cost.ts'
export { costUsd }
export type { ModelTag, Purpose }

export type UsageInput = {
  runId?: string | null
  ownerEmail?: string | null
  purpose: Purpose
  model: string
  tag: ModelTag
  inputTokens: number
  outputTokens: number
  meta?: Record<string, unknown>
  /** claude-cli 처럼 호출 봉투가 실제 환산 비용을 주면 그 값을 쓴다(토큰 추정 대신). */
  costOverride?: number | null
}

/** 쓰기 실패는 삼키지 않고 던진다 — 비용을 못 남긴 채 호출이 끝나면 예산 상한이 거짓이 된다(§7.1). */
export async function recordUsage(u: UsageInput): Promise<number> {
  const cost = u.costOverride != null ? Math.round(u.costOverride * 100000) / 100000 : costUsd(u.tag, u.inputTokens, u.outputTokens)
  const sb = await createClient()
  if (!sb) throw new Error('SUPABASE 환경변수 없음 — llm_usage 를 쓸 수 없다')
  const { error } = await sb.from('llm_usage').insert({
    run_id: u.runId ?? null, owner_email: u.ownerEmail ?? null, purpose: u.purpose, model: u.model, tag: u.tag,
    input_tokens: u.inputTokens, output_tokens: u.outputTokens, cost_usd: cost, meta: u.meta ?? {},
  })
  if (error) throw new Error(`llm_usage 기록 실패: ${error.message}`)
  return cost
}

/** 한 run 이 지금까지 쓴 비용(USD). 상한 검사용. */
export async function runCostUsd(runId: string): Promise<number> {
  const sb = await createClient()
  if (!sb) throw new Error('SUPABASE 환경변수 없음 — llm_usage 를 쓸 수 없다')
  const { data, error } = await sb.from('llm_usage').select('cost_usd').eq('run_id', runId)
  if (error) throw new Error(`llm_usage 조회 실패: ${error.message}`)
  return (data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0)
}
