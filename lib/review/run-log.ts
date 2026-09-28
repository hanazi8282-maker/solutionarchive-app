// review_collection_runs 실행 행 마감 — 차단·쿼터 건수 포함, 컬럼 없음 폴백.
//
// 왜 따로 있나: 차단(403/429)·쿼터 소진 건수는 수집 램프(reports/2026-09-28/cowork-four-orders.md §2-2)
// 의 되돌리기 조건이다. 마이그 20260930000033 이 두 컬럼을 만든다. 미적용이어도 수집 행은 남아야 하므로
// 42703/PGRST204 면 **두 필드만 빼고** 다시 쓰고, 그 사실을 경고로 돌려준다 — 조용히 성공으로 접지 않는다(§7.1).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn } from '../analysis/facets.ts'

export const BLOCK_COUNTS_MIGRATION = '20260930000033_review_run_block_counts'
export const BLOCK_COUNT_KEYS = ['blocked_responses', 'quota_responses'] as const

/** 3상태: 전부 저장 / 카운트만 빼고 저장(마이그 미적용) / 저장 실패. */
export type RunFinishOutcome =
  | { state: 'saved' }
  | { state: 'saved_without_counts'; warning: string }
  | { state: 'failed'; error: string }

export async function finishRunRow(
  sb: Pick<SupabaseClient, 'from'>,
  runId: string,
  row: Record<string, unknown>,
  counts: { blockedResponses: number; quotaExhaustedResponses: number },
): Promise<RunFinishOutcome> {
  const full = { ...row, blocked_responses: counts.blockedResponses, quota_responses: counts.quotaExhaustedResponses }
  const first = await sb.from('review_collection_runs').update(full).eq('id', runId)
  if (!first.error) return { state: 'saved' }
  if (!isMissingColumn(first.error.code)) return { state: 'failed', error: first.error.message }

  const retry = await sb.from('review_collection_runs').update(row).eq('id', runId)
  if (retry.error) return { state: 'failed', error: retry.error.message }
  return {
    state: 'saved_without_counts',
    warning: `차단 ${counts.blockedResponses}·쿼터 ${counts.quotaExhaustedResponses}건을 DB 에 못 남겼다 — 마이그 ${BLOCK_COUNTS_MIGRATION} 미적용(실행 행은 저장됨)`,
  }
}
