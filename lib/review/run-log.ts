// review_collection_runs 실행 행 마감 — 차단·쿼터 건수 + robots 예외 사용 기록 포함, 컬럼 없음 폴백.
//
// 왜 따로 있나: 차단(403/429)·쿼터 소진 건수는 수집 램프(reports/2026-09-28/cowork-four-orders.md §2-2)
// 의 되돌리기 조건이다. 마이그 20260930000033 이 두 컬럼을 만든다. robots 예외 사용 건수·예외 값은
// 남헌이 연 예외를 유지·회수할 근거다(reports/2026-10-06/design-report-v22.md §4, 마이그 20261006000001).
// 미적용이어도 수집 행은 남아야 하므로 42703/PGRST204 면 **해당 필드 묶음만 빼고** 다시 쓰고, 그 사실을
// 경고로 돌려준다 — 조용히 성공으로 접지 않는다(§7.1).
//
// 묶음별 폴백 판정:
//   · override 3필드 — 오류 메시지에 그 컬럼 이름이 있을 때만 뺀다(남헌 v23 4). 다른 컬럼 오류를 이 묶음 탓으로 돌리지 않는다.
//   · 차단·쿼터 2필드 — 000033 때부터의 동작 그대로: 컬럼 없음 오류가 override 탓이 아니면 이 묶음을 뺀다.
//   한 번 빠진 묶음은 memo 에 기억해 같은 실행(review-collect.mjs 프로세스)의 다음 소스부터 처음부터 뺀다 —
//   소스마다 실패 요청을 한 번씩 더 보내지 않게.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn } from '../analysis/facets.ts'

export const BLOCK_COUNTS_MIGRATION = '20260930000033_review_run_block_counts'
export const BLOCK_COUNT_KEYS = ['blocked_responses', 'quota_responses'] as const
export const OVERRIDE_COLS_MIGRATION = '20261006000001_review_collection_runs_override_cols'
export const OVERRIDE_COL_KEYS = ['robots_owner_override', 'robots_bypassed', 'override_value'] as const

/** 3상태: 전부 저장 / 일부 묶음만 빼고 저장(마이그 미적용) / 저장 실패. */
export type RunFinishOutcome =
  | { state: 'saved' }
  | { state: 'saved_without_counts'; warning: string; missing: Array<'counts' | 'override'> }
  | { state: 'failed'; error: string }

/** 한 실행(프로세스) 동안 "이 묶음 컬럼은 없다"를 기억한다. review-collect.mjs 가 하나 만들어 소스마다 넘긴다. */
export type RunLogMemo = { countsMissing?: boolean; overrideMissing?: boolean }

export async function finishRunRow(
  sb: Pick<SupabaseClient, 'from'>,
  runId: string,
  row: Record<string, unknown>,
  counts: { blockedResponses: number; quotaExhaustedResponses: number },
  /**
   * robots 예외 사용 기록. overrideValue = 그 실행 시점 review_sources.override 스냅샷(NULL = 예외 없음).
   * 한 행 = 소스 1개 = loadSource 1회라 값은 구조상 1개다 — 소스 키별 구분은 행의 source_key 가 한다.
   * 한 행에 여러 값이 들어오는 구조로 바뀌면(재로드·여러 소스 합산) "마지막 값"이 아니라 등장 순서대로
   * 중복 없이 쉼표 연결한다: 마지막 값만 남기면 앞 값으로 보낸 요청의 근거가 사라진다.
   */
  overrides: { robotsOwnerOverride: number; robotsBypassed: number; overrideValue: string | null } = {
    robotsOwnerOverride: 0,
    robotsBypassed: 0,
    overrideValue: null,
  },
  memo: RunLogMemo = {},
): Promise<RunFinishOutcome> {
  const countFields = { blocked_responses: counts.blockedResponses, quota_responses: counts.quotaExhaustedResponses }
  const overrideFields = {
    robots_owner_override: overrides.robotsOwnerOverride,
    robots_bypassed: overrides.robotsBypassed,
    override_value: overrides.overrideValue,
  }
  const payload = () => ({
    ...row,
    ...(memo.countsMissing ? {} : countFields),
    ...(memo.overrideMissing ? {} : overrideFields),
  })

  // 최대 3번: 전부 → 한 묶음 뺌 → 두 묶음 다 뺌. 더 뺄 게 없으면 실패.
  for (;;) {
    const res = await sb.from('review_collection_runs').update(payload()).eq('id', runId)
    if (!res.error) break
    if (!isMissingColumn(res.error.code)) return { state: 'failed', error: res.error.message }
    const msg = res.error.message ?? ''
    if (!memo.overrideMissing && OVERRIDE_COL_KEYS.some((k) => msg.includes(k))) memo.overrideMissing = true
    else if (!memo.countsMissing) memo.countsMissing = true
    else return { state: 'failed', error: res.error.message }
  }

  const missing: Array<'counts' | 'override'> = []
  const parts: string[] = []
  if (memo.countsMissing) {
    missing.push('counts')
    parts.push(`차단 ${counts.blockedResponses}·쿼터 ${counts.quotaExhaustedResponses}건(마이그 ${BLOCK_COUNTS_MIGRATION})`)
  }
  if (memo.overrideMissing) {
    missing.push('override')
    parts.push(
      `소유자 예외 ${overrides.robotsOwnerOverride}·robots 예외 통과 ${overrides.robotsBypassed}건·예외 값 ${overrides.overrideValue ?? '없음'}(마이그 ${OVERRIDE_COLS_MIGRATION})`,
    )
  }
  if (missing.length === 0) return { state: 'saved' }
  return {
    state: 'saved_without_counts',
    warning: `${parts.join(', ')}을 DB 에 못 남겼다 — 마이그 미적용(실행 행은 저장됨)`,
    missing,
  }
}
