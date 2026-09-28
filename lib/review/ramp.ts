// 수집 램프 — 소스별 "1회 타깃 수" 계단과 현재 단계 읽기.
//
// 근거: reports/2026-09-28/cowork-four-orders.md §2-2 (남헌 2026-09-28 확정). 엔진(올리기·되돌리기 판정)과
// 러너 배선은 **아직 없다** — 여기는 계단 상수와 읽기 헬퍼 하나뿐이다. 테이블은 마이그 20260930000034.
// 무인 루프가 review_source_ramp 에 쓰는 권한은 CLAUDE.md §10.1 에 아직 없다(엔진 착수 전에 한 줄 필요).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTableError } from '../agents/status.ts'

/** level 0~3 의 1회 타깃 수. 주 1회 약 +50%. level 0 = 현재 기본값(review-collect.mjs --targets 기본 10). */
export const RAMP_STEPS = [10, 15, 22, 30] as const

export const RAMP_MIGRATION = '20260930000034_review_source_ramp'

export type SourceRamp = {
  sourceKey: string
  level: number
  targetsPerRun: number
  frozenUntil: string | null
  changedAt: string
  reason: string
}

/**
 * 3상태: ramp(행 있음) / none(행 없음 = 램프 미적용, 기본 타깃 수) / unavailable(테이블 없음·조회 실패).
 * unavailable 을 none 으로 접지 마라 — 되돌리기로 내려둔 단계를 못 읽고 기본값으로 돌면 동결이 풀린다(§7.1).
 */
export async function loadSourceRamp(
  sb: Pick<SupabaseClient, 'from'>,
  sourceKey: string,
): Promise<{ state: 'ramp'; ramp: SourceRamp } | { state: 'none' } | { state: 'unavailable'; reason: string }> {
  const { data, error } = await sb
    .from('review_source_ramp')
    .select('source_key, level, targets_per_run, frozen_until, changed_at, reason')
    .eq('source_key', sourceKey)
    .maybeSingle()
  if (error) {
    return {
      state: 'unavailable',
      reason: isMissingTableError(error.code, error.message) ? `테이블 없음 — 마이그 ${RAMP_MIGRATION} 미적용` : `조회 실패 — ${error.message}`,
    }
  }
  if (!data) return { state: 'none' }
  return {
    state: 'ramp',
    ramp: {
      sourceKey: data.source_key,
      level: data.level,
      targetsPerRun: data.targets_per_run,
      frozenUntil: data.frozen_until,
      changedAt: data.changed_at,
      reason: data.reason,
    },
  }
}
