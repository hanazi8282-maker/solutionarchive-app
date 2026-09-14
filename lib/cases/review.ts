// 케이스 검수(승인·반려) 규칙 한 벌. scripts/case-review.mjs(CLI)와 /cases(화면 서버 액션)가 같이 쓴다.
// DB 를 부르지 않는다 — 규칙만. 셀프테스트: scripts/case-review-rules-selftest.mjs
//
// ⛔ CLAUDE.md §10.1: review_status 를 approved/rejected 로 바꾸는 건 사람만 한다.
//    등급(evidence_grade)은 검수 결정과 별개 축이다. 여기서도, 화면에서도 바꾸지 않는다.

import { TRANSFERABILITY, type Transferability } from './draft.ts'

export { TRANSFERABILITY, type Transferability }

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

// ────────────────────────────────────────────────────────────
// 이식성 판정 — 관측은 조사원, 판정은 사람
// ────────────────────────────────────────────────────────────
//
// ⛔ 기계가 `transferability` 를 쓰는 경로는 **없다.** 값이 들어오는 자리는 둘뿐이다:
//    (1) /cases 승인 서버 액션  (2) scripts/case-review.mjs transferability --by <사람>
//    새 승인 경로를 만들지 않고 기존 승인 트랜잭션에 얹었다. 자동 판정을 넣으면
//    "남이 대신 골라 준 이식성"이 앵글 우선순위를 결정하게 된다.
//
// ★ 미선택도 승인할 수 있다. 판정을 필수로 걸면 검수 병목(현재 draft 무브 32건)이
//   더 심해진다. 미판정은 NULL 로 남고, 앵글 정렬에서 HIGH 아래 · LOW 위다 —
//   "아직 안 봤다"를 "낮다"로 접지 않는다 (§7.1).

export function isTransferability(v: unknown): v is Transferability {
  return typeof v === 'string' && (TRANSFERABILITY as readonly string[]).includes(v)
}

/**
 * 폼에서 온 이식성 값을 정규화한다.
 * 빈 값 → `{ value: null }` (미판정으로 저장, 승인은 통과).
 * 어휘 밖 → `{ error }` — 조용히 null 로 접지 않는다. 그건 사람의 선택을 버리는 것이다.
 */
export function readTransferability(raw: unknown): { value: Transferability | null; error?: string } {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return { value: null }
  if (!isTransferability(s)) return { value: null, error: `이식성 값이 어휘 밖입니다: ${s} (${TRANSFERABILITY.join('/')})` }
  return { value: s }
}

/** 미판정으로 저장될 때 사람에게 보일 안내. 빈칸으로 두는 것이 무슨 뜻인지 말해 준다. */
export const TRANSFERABILITY_UNRATED_HINT =
  '미판정으로 저장됩니다 — 앵글 우선순위에서 HIGH 아래, LOW 위입니다.'

export const TRANSFERABILITY_LABEL: Readonly<Record<Transferability, string>> = {
  HIGH: '높음 — 독자가 내일 바로 해 볼 수 있다',
  MEDIUM: '중간 — 조건이 맞으면 옮길 수 있다',
  LOW: '낮음 — 이 브랜드라서 됐다',
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
