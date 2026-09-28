// 케이스 숨김(soft delete) 한 벌 — 마이그 20260930000030_case_soft_delete.sql.
//
// 왜: 자동 승인(feat/case-auto-approval)이 잘못 내보낸 케이스를 사람이 **즉시** 공개 화면에서 내린다(남헌 2026-09-28).
//   "반려"(review_status='rejected')는 검수 결정이고, 이건 "노출에서 내림"이다 — 두 축을 섞지 않는다.
//   숨긴 케이스는 review_status 가 그대로 approved 여도 어디에도 안 나간다. 복원하면 deleted_at 만 비운다.
//   하드 DELETE 는 없다 — case_moves·case_evidence·case_saves·case_feedback·pmf_assessment_moves 가 전부
//   ON DELETE CASCADE 라 한 번에 지워지고 되돌릴 수 없다(CLAUDE.md §10.2 예외 1, 사람 판단).
//
// 숨김은 케이스 단위다. 무브는 부모 케이스를 따라 숨는다 — 무브를 따로 보여 주는 자리(검색·어드바이저·퀴즈·
// 앵글 선택)도 전부 `case_study_id` 로 거른다. 무브 단독 숨김 컬럼은 두지 않았다(필요해지면 그때).
//
// ⚠️ node 가 타입 스트리핑으로 직접 로드한다(scripts/cmo-daily.mjs · scripts/case-soft-delete-selftest.mjs). `@/` 별칭 금지.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn } from '../analysis/facets.ts'

export const SOFT_DELETE_MIGRATION = '20260930000030_case_soft_delete.sql'
export const DELETE_REASON_MAX = 500

type WithDeletedAt = { id: string; deleted_at?: string | null }

/** `select('*')` 로 읽은 케이스 행에서 숨긴 것의 id. 컬럼이 없으면(마이그 미적용) undefined → 숨긴 것 없음. */
export function deletedIdsOf(studies: WithDeletedAt[]): Set<string> {
  return new Set(studies.filter((s) => s.deleted_at != null).map((s) => s.id))
}

/**
 * 숨긴 케이스와 그 무브를 뺀다. null(조회 실패)은 그대로 null — 빈 배열로 접지 않는다(§7.1).
 * `deleted === null`(숨김 목록을 못 읽었다)이면 **둘 다 null** 이다. 숨긴 케이스를 모르는 채로
 * 공개하면 "내렸다"가 거짓이 된다 — 화면은 "확인 불가"로 떨어진다.
 */
export function withoutDeleted<S extends { id: string }, M extends { case_study_id: string | null }>(
  studies: S[] | null,
  moves: M[] | null,
  deleted: Set<string> | null,
): { studies: S[] | null; moves: M[] | null } {
  if (deleted === null) return { studies: null, moves: null }
  return {
    studies: studies && studies.filter((s) => !deleted.has(s.id)),
    moves: moves && moves.filter((m) => !(m.case_study_id && deleted.has(m.case_study_id))),
  }
}

/**
 * 명시 컬럼으로 읽는 자리(코퍼스·처방·PMF·퀴즈·앵글 선택)용 — 숨긴 케이스 id.
 *  - 컬럼 없음(42703/PGRST204) = 마이그 미적용 = **숨긴 케이스가 있을 수 없다** → 빈 집합(경고 로그).
 *    이건 "확인 불가"를 "없음"으로 접는 게 아니라 참인 음성이다 — 쓸 컬럼이 없으면 아무도 숨길 수 없었다.
 *  - 그 밖의 오류 = null(확인 불가). 호출자는 코퍼스 전체를 null 로 본다.
 * `.not()` 필터 대신 전 행을 읽어 JS 로 거른다 — 셀프테스트 목(select→eq 만 흉내)이 그대로 통한다.
 * ponytail: 케이스 수십 건이라 전 행 id 를 읽는다. 수천 건이면 `.not('deleted_at','is',null)` 로 내린다.
 */
export async function loadDeletedCaseIds(sb: Pick<SupabaseClient, 'from'>, where: string): Promise<Set<string> | null> {
  const { data, error } = await sb.from('case_studies').select('id, deleted_at')
  if (!error) return deletedIdsOf((data ?? []) as WithDeletedAt[])
  if (isMissingColumn(error.code)) {
    console.warn(`[${where}] case_studies.deleted_at 없음 — 마이그 ${SOFT_DELETE_MIGRATION} 미적용. 숨긴 케이스가 있을 수 없어 전부 보인다.`)
    return new Set()
  }
  console.error(`[${where}] case_studies 숨김 목록 조회 실패:`, error.code ?? '', error.message)
  return null
}

/** 숨김 요청 검증. 통과면 null, 아니면 화면에 보일 사유. 사유 없는 숨김은 나중에 아무도 되돌릴지 판단 못 한다. */
export function checkDeleteInput(input: { id: unknown; reason: unknown }): string | null {
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return '대상 케이스가 없습니다. 새로고침 후 다시 시도하세요.'
  if (!reason) return '내리는 사유를 적어야 합니다.'
  if (reason.length > DELETE_REASON_MAX) return `사유는 ${DELETE_REASON_MAX}자 이내로 적습니다.`
  return null
}
