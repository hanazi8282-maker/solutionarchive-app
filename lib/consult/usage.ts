// llm_usage 기록 + 단가 계산. 컨설팅의 모든 LLM 호출은 recordUsage 를 거친다(예산: 0층 ≤$0.5 · 메모 ≤$1.5 · 대화 1턴 ≈$0.05).
// 단가는 USD/1M 토큰 추정치(입력,출력) — 실제 청구와 다를 수 있어 "추정"으로만 쓴다. 바꿀 땐 여기 한 곳.
import { createClient } from '../supabase/server.ts'

import { costUsd, type ModelTag, type Purpose } from './cost.ts'
import { consultAuthBypassActive } from '../auth/policy.ts'
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

/** 비용 상한 가드(v71cj 작업 1): 월 합계 $50, 일 합계 $10 를 넘으면 신규 진단/메모 생성을 막는다. 값은 env 로 조정. */
export const MONTH_CAP_USD = Number(process.env.CONSULT_MONTH_CAP_USD ?? 50)
export const DAY_CAP_USD = Number(process.env.CONSULT_DAY_CAP_USD ?? 10)

export async function costSinceUsd(sinceIso: string): Promise<number> {
  const sb = await createClient()
  if (!sb) throw new Error('SUPABASE 환경변수 없음 — llm_usage 를 쓸 수 없다')
  const { data, error } = await sb.from('llm_usage').select('cost_usd').gte('created_at', sinceIso).limit(20000)
  if (error) throw new Error(`llm_usage 조회 실패: ${error.message}`)
  return (data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0)
}

/** 상한 초과면 사유 문자열, 아니면 null. 조회 실패는 던진다(가드가 조용히 열리면 안 된다). */
export async function capExceeded(now = new Date()): Promise<string | null> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  if ((await costSinceUsd(month)) >= MONTH_CAP_USD) return 'month'
  if ((await costSinceUsd(day)) >= DAY_CAP_USD) return 'day'
  return null
}

/** 로그인 우회 창(2026-11-13, §1-3) 전용 상한 — 기존 일/월 상한보다 낮게 $3. 우회가 꺼져 있으면 항상 null. */
export const BYPASS_COST_CAP_USD = Number(process.env.CONSULT_BYPASS_COST_CAP_USD ?? 3)

export async function bypassCapExceeded(
  disabledRaw: string | null | undefined,
  untilRaw: string | null | undefined,
  now = new Date(),
): Promise<string | null> {
  if (!consultAuthBypassActive(disabledRaw, untilRaw, now)) return null
  // 우회 창 최대 길이(90분)만큼만 거슬러 본다 — 시작 시각을 따로 기록하지 않아도 창 밖 비용은 안 섞인다.
  const windowStart = new Date(now.getTime() - 90 * 60000).toISOString()
  return (await costSinceUsd(windowStart)) >= BYPASS_COST_CAP_USD ? 'bypass' : null
}
