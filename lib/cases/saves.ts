// 케이스 저장(북마크) 한 벌 — `/library/<slug>` 의 토글과 `/library/saved` 의 목록이 같이 쓴다.
//
// ★ §7.1 3상태. 이 파일의 존재 이유가 그것이다:
//     saved       — 저장돼 있다
//     not_saved   — 저장 안 돼 있다 (조회는 정상)
//     unavailable — 못 읽었다 (마이그 미적용 / 조회 실패)
//   `unavailable` 을 `not_saved` 로 접으면 버튼이 "저장" 으로 보이고, 눌러도 아무 일이
//   안 나는 화면이 된다. 마이그레이션 20260930000002 가 아직 미적용이라 이 경로는
//   **지금 실제로 자주 타는 경로**다.
//
// ★ DB 접근 함수는 `sb` 를 인자로 받는다(lib/cases/detail.ts 와 같은 규약). 오류 분류·
//   목록 정렬은 순수 함수로 빼서 `scripts/case-saves-selftest.mjs` 가 네트워크·DB 없이 본다.

import type { createClient } from '@/lib/supabase/server'
import { pickLeadMove, type DetailMoveRow, type DetailStudyRow } from './detail.ts'

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>

/** 이 기능을 켜는 마이그레이션. 화면 문구가 파일명을 그대로 말한다(사람이 찾아 실행할 수 있게). */
export const SAVES_MIGRATION = '20260930000002_case_saves.sql'

export type SaveFailure = {
  /** migration_missing = 테이블이 아직 없다. error = 그 밖의 조회/쓰기 실패. */
  kind: 'migration_missing' | 'error'
  reason: string
}

export type SavedState =
  | { state: 'saved' }
  | { state: 'not_saved' }
  | ({ state: 'unavailable' } & SaveFailure)

// ────────────────────────────────────────────────────────────
// 1) 오류 분류 (순수)
// ────────────────────────────────────────────────────────────
/**
 * PostgREST 오류 → 3상태 중 어느 것인가. 오류가 아니면 null.
 *
 * `42P01`(Postgres: relation does not exist) 과 `PGRST205`(PostgREST: 스키마 캐시에
 * 그 테이블이 없다) 는 **기능이 아직 안 켜진 것**이지 "저장 안 됨"이 아니다.
 * 이 둘을 일반 오류와도 가른다 — 사람이 할 일이 다르다(마이그 실행 vs 로그 확인).
 *
 * ⚠️ 메시지 낱말(`case_saves`)로도 걸러내는 이유: PostgREST 버전에 따라 코드가 비고
 *    메시지만 오는 응답이 있다. 코드가 비었다고 일반 오류로 내리면 "저장 실패: ..." 라는
 *    막다른 문구가 뜨고, 실제 할 일(마이그 실행)이 화면에서 사라진다.
 */
export function classifySaveError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): SaveFailure | null {
  if (!error) return null
  const code = (error.code ?? '').trim()
  const message = (error.message ?? '').trim()
  const missing =
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation .*case_saves.* does not exist/i.test(message) ||
    /could not find the table .*case_saves/i.test(message)
  if (missing) {
    return {
      kind: 'migration_missing',
      reason: `저장 기능이 아직 켜지지 않았습니다 — 마이그레이션 ${SAVES_MIGRATION} 미적용(DB 에 case_saves 테이블이 없습니다).`,
    }
  }
  return { kind: 'error', reason: `저장함을 읽지 못했습니다: ${message || code || '사유 미상'}` }
}

/** 유니크 제약 위반. 토글 경합(더블클릭·두 탭)에서만 난다 — 실패가 아니라 "이미 저장됨"이다. */
export function isDuplicateSave(error: { code?: string | null } | null | undefined): boolean {
  return (error?.code ?? '') === '23505'
}

// ────────────────────────────────────────────────────────────
// 2) 저장 목록 분류 (순수)
// ────────────────────────────────────────────────────────────
export type SavedRow = { case_study_id: string; created_at?: string | null }

export type SavedCard = {
  study: DetailStudyRow
  move: DetailMoveRow | null
  move_count: number
  saved_at: string | null
}

/**
 * 저장 행 + 코퍼스 → 화면에 낼 카드와 **못 내는 것의 개수**.
 *
 * 저장한 뒤 케이스가 승인 취소되거나 지워지면 카드가 줄어든다. 그때 조용히 빼면
 * 사람은 자기가 저장한 것이 사라졌다고 본다 — 몇 건이 왜 안 보이는지 같이 돌려준다(§7.1).
 * 저장 순서(최근 먼저)는 DB 정렬을 믿지 않고 여기서 한 번 더 고정한다.
 */
export function savedCards(
  rows: SavedRow[],
  studies: DetailStudyRow[],
  moves: DetailMoveRow[],
): { cards: SavedCard[]; hidden: number } {
  const byId = new Map(studies.map((s) => [s.id, s]))
  const sorted = [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const cards: SavedCard[] = []
  let hidden = 0
  for (const r of sorted) {
    const study = byId.get(r.case_study_id)
    // 지워졌거나(케이스 없음) 승인이 내려간 케이스는 공개 상세가 404 다 — 카드로 내면 죽은 링크가 된다.
    if (!study || study.review_status !== 'approved') {
      hidden++
      continue
    }
    const mine = moves.filter((m) => m.case_study_id === study.id)
    cards.push({
      study,
      move: pickLeadMove(mine),
      move_count: mine.filter((m) => m.review_status === 'approved').length,
      saved_at: r.created_at ?? null,
    })
  }
  return { cards, hidden }
}

// ────────────────────────────────────────────────────────────
// 3) 조회 (DB)
// ────────────────────────────────────────────────────────────
/** 이 사람이 이 케이스를 저장했나. 못 읽었으면 `unavailable` 이다 — `not_saved` 로 접지 않는다. */
export async function isSaved(sb: Client, caseStudyId: string, email: string): Promise<SavedState> {
  const { data, error } = await sb
    .from('case_saves')
    .select('id')
    .eq('case_study_id', caseStudyId)
    .eq('user_email', email)
    .limit(1)
  const failure = classifySaveError(error)
  if (failure) {
    console.error('[cases/saves] isSaved error:', error?.code ?? '', error?.message ?? '')
    return { state: 'unavailable', ...failure }
  }
  return (data ?? []).length > 0 ? { state: 'saved' } : { state: 'not_saved' }
}

/** 이 사람의 저장 행 전부(최근 먼저). 못 읽었으면 빈 목록이 아니라 실패를 돌린다. */
export async function listSaved(
  sb: Client,
  email: string,
): Promise<{ ok: true; rows: SavedRow[] } | ({ ok: false } & SaveFailure)> {
  const { data, error } = await sb
    .from('case_saves')
    .select('case_study_id, created_at')
    .eq('user_email', email)
    .order('created_at', { ascending: false })
  const failure = classifySaveError(error)
  if (failure) {
    console.error('[cases/saves] listSaved error:', error?.code ?? '', error?.message ?? '')
    return { ok: false, ...failure }
  }
  return { ok: true, rows: (data ?? []) as SavedRow[] }
}
