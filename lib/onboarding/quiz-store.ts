// Stage 6 온보딩 퀴즈의 DB 경계. 순수 로직은 lib/onboarding/quiz.ts 에 있다.
//
// 여기 있는 이유: 퀴즈 라우트와 공유 이미지 라우트가 같은 조회를 쓴다. 두 곳에
// 복사하면 "complete 만 센다" 같은 필터 조건이 한쪽에서만 바뀐다.
//
// §7.1 3상태: 조회 실패는 null 로 돌려준다. 빈 배열([])과 절대 섞지 않는다 —
// "응답자 0명"과 "응답자 수를 못 읽었다"는 다른 사건이고, 후자에서 퍼센타일을
// 만들면 없는 확신을 주게 된다.

import type { createClient } from '@/lib/supabase/server'
import type { FailedAngleRow, Side, SuccessMoveRow } from '@/lib/onboarding/quiz'

export type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>

export const QUIZ_TABLE = 'onboarding_quiz_responses'

export interface QuizCorpora {
  moves: SuccessMoveRow[]
  failedAngles: FailedAngleRow[]
}

/**
 * 퀴즈 코퍼스 로드. 성공 쪽은 `outcome_direction='positive'` 만 — negative(23건)는
 * 방법론 트랙 전용이라 제품 화면에 쓰지 않는다(§13-2).
 * 승인 상태도 걸러낸다: 온보딩 첫 화면에 draft 를 보여줄 이유가 없다.
 */
export async function loadCorpora(supabase: Supabase): Promise<QuizCorpora | null> {
  const { data: moves, error: movesErr } = await supabase
    .from('case_moves')
    .select('id, claim, outcome_direction')
    .eq('outcome_direction', 'positive')
    .eq('review_status', 'approved')
  if (movesErr) {
    console.error('[onboarding/quiz] case_moves select error:', movesErr.code ?? '', movesErr.message)
    return null
  }

  const { data: failedAngles, error: failedErr } = await supabase
    .from('failed_angles')
    .select('id, claimed_angle, product_category')
  if (failedErr) {
    console.error('[onboarding/quiz] failed_angles select error:', failedErr.code ?? '', failedErr.message)
    return null
  }

  return {
    moves: (moves ?? []) as SuccessMoveRow[],
    failedAngles: (failedAngles ?? []) as FailedAngleRow[],
  }
}

export interface QuizEventRow {
  session_id: string
  event_type: 'start' | 'answer' | 'complete'
  pair_case_move_id?: string | null
  pair_failed_angle_id?: string | null
  picked_side?: Side | null
  is_correct?: boolean | null
  score?: number | null
  question_count?: number | null
}

/** 이벤트 적재. 성공/실패만 돌려준다(로그 실패로 온보딩을 막지 않는다). */
export async function logQuizEvents(supabase: Supabase, rows: QuizEventRow[]): Promise<boolean> {
  if (rows.length === 0) return true
  const { error } = await supabase.from(QUIZ_TABLE).insert(rows)
  if (error) {
    console.error('[onboarding/quiz] insert error:', error.code ?? '', error.message)
    return false
  }
  return true
}

/**
 * 완주한 응답자들의 점수 전체. 퍼센타일 분모가 된다.
 * 조회 실패 시 null — 호출부는 퍼센타일을 만들지 않는다.
 */
export async function fetchCompletedScores(supabase: Supabase): Promise<number[] | null> {
  const { data, error } = await supabase
    .from(QUIZ_TABLE)
    .select('score')
    .eq('event_type', 'complete')
    .not('score', 'is', null)
  if (error) {
    console.error('[onboarding/quiz] scores select error:', error.code ?? '', error.message)
    return null
  }
  return (data ?? []).map((r) => Number(r.score)).filter((n) => Number.isFinite(n))
}
