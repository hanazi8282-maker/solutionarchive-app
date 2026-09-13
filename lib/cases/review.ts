// 케이스 검수(승인·반려) 규칙 한 벌. scripts/case-review.mjs(CLI)와 /cases(화면 서버 액션)가 같이 쓴다.
// DB 를 부르지 않는다 — 규칙만. 셀프테스트: scripts/case-review-rules-selftest.mjs
//
// ⛔ CLAUDE.md §10.1: review_status 를 approved/rejected 로 바꾸는 건 사람만 한다.
//    등급(evidence_grade)은 검수 결정과 별개 축이다. 여기서도, 화면에서도 바꾸지 않는다.

export const REVIEW_DECISIONS = ['approved', 'rejected'] as const
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number]

export function isReviewDecision(v: unknown): v is ReviewDecision {
  return typeof v === 'string' && (REVIEW_DECISIONS as readonly string[]).includes(v)
}

/** 사람 입력 검증. 통과면 null, 아니면 화면에 보일 사유. draft 로 되돌리는 결정도 막는다. */
export function checkDecisionInput(input: { decision: unknown; by: string; note: string }): string | null {
  if (!isReviewDecision(input.decision)) return '승인 또는 반려 중 하나를 골라야 합니다.'
  if (!input.by.trim()) return '검수자 이름은 필수입니다. 누가 결정했는지 없는 승인은 검수가 아닙니다.'
  if (input.decision === 'rejected' && !input.note.trim()) return '반려 사유를 적어야 합니다.'
  return null
}

/** 무브 승인 시 주의. 부정 사례는 A 등급이어야 발행 대상이다. */
export function moveApprovalWarning(m: { outcome_direction?: string | null; evidence_grade?: string | null }): string | null {
  return m.outcome_direction === 'negative' && m.evidence_grade !== 'A'
    ? `부정 사례인데 등급 ${m.evidence_grade} 다. 승인은 되지만 발행 대상은 아니다.`
    : null
}

/** 케이스 승인 시 주의. 케이스 승인이 무브 승인이 아니다. */
export function caseApprovalWarning(moves: readonly { review_status?: string | null }[]): string | null {
  const pending = moves.filter((m) => m.review_status === 'draft').length
  return pending > 0
    ? `아직 draft 인 무브가 ${pending}건 있다. 케이스가 승인돼도 이 무브들은 안 쓰인다 — "케이스 승인 = 무브 전부 승인"이 아니다.`
    : null
}
