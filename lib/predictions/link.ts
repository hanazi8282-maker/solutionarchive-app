// 발행 글 ↔ 판정 로그 엔트리 연결. prediction-schema.md §7-3 Option B.
//
// **[2026-09-06] 마이그레이션 적용 확인됨.** 스텁 해제.
// `20260905000001_post_decision_log_link.sql` 이 대시보드에서 실행됐고,
// `scripts/predictions-migration-verify.mjs --probe` 로 직접 확인했다 —
// 4컬럼 존재, role CHECK 가 'variant' 를 23514 로 거절, 형식 CHECK 가
// 'LOG-123' 을 거절, 정상 role 은 INSERT 통과(테스트 행은 삭제).
// "적용했다고 들었다"가 아니라 실측이다 (CLAUDE.md §7.1).
//
// 이 플래그를 지우지 않고 남겨 둔다. 다른 환경(로컬 스택·프리뷰 브랜치)에서는
// 테이블이 없을 수 있고, 그때 이 모듈은 **INSERT 를 시도하지 않고 `skipped`**
// 를 돌려준다. 실패를 삼키는 게 아니라 애초에 시도하지 않았다는 걸 호출부가
// 구분할 수 있게 상태로 준다.

import type { SupabaseClient } from '@supabase/supabase-js'

export const LINK_TABLE_READY = true

export const LINK_TABLE = 'post_decision_link'

/** §7-3 role. paired 예측(한 판정에 두 발행)을 구분하는 축이다. */
export type LinkRole = 'primary' | 'paired_control' | 'paired_variant'

/** 마이그레이션의 CHECK 와 같은 정규식. 여기서 먼저 걸러야 DB 에러 대신 사람이 읽는 메시지가 나온다. */
export const LOG_CODE_RE = /^(LOG|UPD|NEW|XUP)-\d{8}-\d{2}$/

export type LinkOutcome =
  | { status: 'linked' }
  | { status: 'exists' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }

export interface LinkInput {
  postId: string
  decisionLogCode: string
  role?: LinkRole
}

/**
 * 판정 로그 코드를 발행 글에 붙인다.
 *
 * 반환값의 `skipped` 는 **"연결 없음"이 아니라 "연결을 시도하지 않음"**이다.
 * 호출부는 이 둘을 구분해서 로그에 남겨야 한다 (CLAUDE.md §7.1).
 */
export async function linkDecisionLog(
  supabase: SupabaseClient,
  input: LinkInput,
): Promise<LinkOutcome> {
  const role: LinkRole = input.role ?? 'primary'

  if (!LOG_CODE_RE.test(input.decisionLogCode)) {
    return { status: 'failed', reason: `판정 로그 코드 형식이 아니다: ${input.decisionLogCode}` }
  }

  if (!LINK_TABLE_READY) {
    return {
      status: 'skipped',
      reason: `${LINK_TABLE} 테이블 미적용 — 마이그레이션 20260905000001 을 대시보드에서 실행한 뒤 LINK_TABLE_READY 를 true 로 바꿔라`,
    }
  }

  const { error } = await supabase
    .from(LINK_TABLE)
    .insert({ post_id: input.postId, decision_log_code: input.decisionLogCode, role })

  if (error) {
    // 23505 = unique_violation. 같은 (post_id, code, role) 재연결은 사고가 아니다.
    if (error.code === '23505') return { status: 'exists' }
    return { status: 'failed', reason: error.message }
  }
  return { status: 'linked' }
}

/**
 * 한 판정 로그 코드에 붙은 발행 글들을 읽는다. 채점기가 post_id 를 얻는 경로다.
 *
 * 테이블이 없으면 **빈 배열이 아니라 null** 을 준다. 0건과 확인 불가를
 * 같은 값으로 돌려주면 채점기가 "예측은 있는데 발행이 없다"로 오독한다.
 */
export async function readLinks(
  supabase: SupabaseClient,
  decisionLogCode: string,
): Promise<{ postId: string; role: LinkRole }[] | null> {
  if (!LINK_TABLE_READY) return null

  const { data, error } = await supabase
    .from(LINK_TABLE)
    .select('post_id, role')
    .eq('decision_log_code', decisionLogCode)

  if (error) return null
  return (data ?? []).map(r => ({ postId: r.post_id as string, role: r.role as LinkRole }))
}
