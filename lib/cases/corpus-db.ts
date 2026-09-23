// 케이스 코퍼스 조회부 — **여기만 DB 를 탄다.** 매칭·랭킹은 lib/cases/{match,advisor,search}.ts
// 의 순수 함수가 한다(match.ts:3-4 규약). 같은 SELECT 가 라우트마다 복붙돼 컬럼이 갈라지던 자리를
// 한 곳으로 모았다 — app/api/analyze/advisor 와 app/api/cases/search 가 같은 컬럼을 본다.

import type { createClient } from '@/lib/supabase/server'
import type { MoveRow, StudyRow } from './match'
import type { FailedAngleRow, PrincipleRow } from './advisor'

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>

export const STUDY_COLS =
  'id, slug, brand_name, bottleneck, reader_problem, business_model, buyer_type, price_band, outcome_status, review_status'
/**
 * ★ 뒤 5개(`transfer_note` 이후)가 "내일 할 행동"의 병목이었다 — 컬럼이 SELECT 에 없어서
 *   데이터가 DB 에 있는데도 화면까지 도달하지 못했다. 전부 20260915000001·20260906000001 로
 *   이미 적용된 컬럼이다(docs/migration-exceptions.md) — 없는 컬럼을 넣으면 42703 으로
 *   **조회 전체가** 죽고 그게 "선례 없음"으로 보인다. 컬럼을 더할 때는 적용 여부를 먼저 확인한다.
 */
export const MOVE_COLS =
  'id, case_study_id, lever, claim, evidence_grade, fact_check_grade, outcome_direction, review_status, metric_name, metric_before, metric_after, metric_unit, transfer_note, preconditions, transferability, observed_period_start, created_at'
export const FAILED_ANGLE_COLS =
  'case_key, product_category, claimed_angle, outcome, evidence_source, source_tier, is_estimate'
export const PRINCIPLE_COLS = 'sp_id, tags, statement, evidence_grade, evidence_grade_note, source_ref'

/**
 * 조회 실패는 null 로 돌린다. 빈 배열([])과 **절대** 섞지 않는다 —
 * 섞는 순간 매칭기가 "확인 불가"를 "선례 없음"으로 접는다(§7.1).
 */
export async function safeSelect<T>(supabase: Client, table: string, cols: string, where: string): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).select(cols)
  if (error) {
    console.error(`[${where}] ${table} select error:`, error.code ?? '', error.message)
    return null
  }
  return (data ?? []) as T[]
}

/** 케이스·무브·실패앵글 3종. 원칙 원장은 어드바이저만 쓰므로 여기서 안 읽는다. */
export async function loadCaseCorpus(supabase: Client, where: string): Promise<{
  studies: StudyRow[] | null
  moves: MoveRow[] | null
  failedAngles: FailedAngleRow[] | null
}> {
  const [studies, moves, failedAngles] = await Promise.all([
    safeSelect<StudyRow>(supabase, 'case_studies', STUDY_COLS, where),
    safeSelect<MoveRow>(supabase, 'case_moves', MOVE_COLS, where),
    safeSelect<FailedAngleRow>(supabase, 'failed_angles', FAILED_ANGLE_COLS, where),
  ])
  return { studies, moves, failedAngles }
}

export const loadPrinciples = (supabase: Client, where: string) =>
  safeSelect<PrincipleRow>(supabase, 'strategy_principles', PRINCIPLE_COLS, where)
