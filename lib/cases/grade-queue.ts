// 카드 채점 모드(/cases/grade)의 순수 로직 한 벌 — 줄 세우기·10장 자르기·제출 payload 검증.
// DB·React 를 부르지 않는다. 셀프테스트: scripts/cases-grade-selftest.mjs
//
// ⛔ CLAUDE.md §10.1: 여기서 승인이 일어나지 않는다. 이 파일은 "무엇을 먼저 보여줄까"와
//    "사람이 고른 것이 말이 되나"만 판정한다. 쓰기는 app/cases/actions.ts 의 사람 액션뿐이다.

import { readTransferability, type Transferability } from './review.ts'

/** 하루 검수 30분 = 카드 10장 (남헌 2026-09-23 Q2-A). 넘는 건 다음 페이지로 민다. */
export const GRADE_PAGE_SIZE = 10

export type QueueMove = {
  id: string
  review_status: string
  transfer_note?: string | null
}
export type QueueCase = {
  id: string
  created_at: string
  business_model?: string | null
  bottleneck?: string | null
  review_status: string
  reviewed_at?: string | null
  moves: QueueMove[]
}

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

/** ISO 타임스탬프 → KST 날짜(YYYY-MM-DD). 못 읽으면 null — "오늘이 아니다"로 접지 않는다(§7.1). */
export function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : KST.format(t)
}

/** 오늘(KST) 결정된 케이스 수. 진행 표시 "오늘 N/10장" 의 N. CLI·다른 탭에서 결정한 것도 센다. */
export function countReviewedToday(all: readonly QueueCase[], today: string): number {
  return all.filter((c) => c.review_status !== 'draft' && kstDate(c.reviewed_at) === today).length
}

/**
 * 병목별 승인 무브 수. `research-queue.mjs` 의 커버리지 갭과 같은 발상이다 —
 * 사례가 적은 병목부터 채워야 매칭에서 빈칸이 줄어든다. 여기서는 조사 슬롯이 아니라
 * 검수 순서를 정하는 데 쓴다(승인 무브가 곧 매칭 재고다, lib/cases/match.ts).
 */
export function approvedMovesByBottleneck(all: readonly QueueCase[]): Map<string, number> {
  const n = new Map<string, number>()
  for (const c of all) {
    if (c.review_status !== 'approved') continue // 케이스·무브 둘 다 approved 여야 매칭에 든다
    const key = c.bottleneck ?? ''
    const hit = c.moves.filter((m) => m.review_status === 'approved').length
    n.set(key, (n.get(key) ?? 0) + hit)
  }
  return n
}

/**
 * 줄 세우기: SAAS 먼저 → 승인 무브가 적은 병목 먼저 → 오래된 것 먼저.
 * SAAS 를 맨 앞에 두는 이유는 피봇 방향이라 재고가 0 에 가깝기 때문이다(2026-09-23 계획 §4 B(3)).
 */
export function sortGradeQueue<T extends QueueCase>(queue: readonly T[], byBottleneck: Map<string, number>): T[] {
  const saas = (c: QueueCase) => (c.business_model === 'SAAS' ? 0 : 1)
  const stock = (c: QueueCase) => byBottleneck.get(c.bottleneck ?? '') ?? 0
  return [...queue].sort(
    (a, b) =>
      saas(a) - saas(b) ||
      stock(a) - stock(b) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  )
}

/** 10장씩. 범위 밖 page 는 1 로 접지 않고 빈 페이지를 준다 — 링크가 틀린 것을 숨기지 않는다. */
export function gradeQueuePage<T>(sorted: readonly T[], page: number): { items: T[]; page: number; pages: number; total: number } {
  const p = Number.isInteger(page) && page >= 1 ? page : 1
  const pages = Math.max(1, Math.ceil(sorted.length / GRADE_PAGE_SIZE))
  const from = (p - 1) * GRADE_PAGE_SIZE
  return { items: sorted.slice(from, from + GRADE_PAGE_SIZE), page: p, pages, total: sorted.length }
}

/** 케이스 승인 체크박스의 기본값 = 무브를 하나라도 승인하면 켠다. 사람이 끌 수 있다. */
export function caseApproveDefault(checkedMoveCount: number): boolean {
  return checkedMoveCount > 0
}

// ────────────────────────────────────────────────────────────
// 카드에서 사람이 손으로 채우는 나머지 축들
// ────────────────────────────────────────────────────────────
//
// 어휘를 `draft.ts` 에 두지 않았다. 여긴 **폼에서 온 문자열을 정규화하는 자리**고,
// 저장 컬럼은 서로 다른 마이그레이션 둘에서 온다:
//   transferability_reason  → 20260930000005 (이 트랙)
//   pmf_signal · metric_kind → 20260930000004 (D 트랙)
// 한쪽이 미적용이어도 다른 쪽은 저장돼야 하므로 검증도 따로 둔다(actions.ts 의 묶음 2개).

/** 이유 한 줄 상한. DB CHECK(20260930000005)·textarea maxLength 와 같은 수여야 한다. */
export const TRANSFERABILITY_REASON_MAX = 200

/** PMF 신호 강도 S. 정의는 reports/2026-09-23/pmf-grade-axis-design.md §3-1. 빈 값 = 코드 제안값 사용. */
export const PMF_SIGNALS = ['0', '1', '2', '3'] as const
export type PmfSignal = (typeof PMF_SIGNALS)[number]

/** 이 무브의 지표가 결과 지표인가 투입 지표인가. 투입 지표는 최대 S2 (§3-1 규칙 ②). */
export const METRIC_KINDS = ['outcome', 'input'] as const
export type MetricKind = (typeof METRIC_KINDS)[number]

export type GradeMoveSubmission = {
  id: string
  transferability: Transferability | null
  /** 빈칸은 null = **미기재**다. "이유 없음"이 아니다(§7.1). */
  transferabilityReason: string | null
  /** null = 사람이 고르지 않았다 → 코드 제안값을 그대로 둔다(덮어쓰지 않는다). */
  pmfSignal: PmfSignal | null
  metricKind: MetricKind | null
}
export type GradeSubmission = {
  caseId: string
  moves: GradeMoveSubmission[]
  approveCase: boolean
}

/** 이유 한 줄 정규화. 줄바꿈은 공백으로 접는다 — 다이제스트가 한 줄 목록으로 쓰기 때문이다. */
export function readTransferabilityReason(raw: unknown): { value: string | null; error?: string } {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (!s) return { value: null }
  if (s.length > TRANSFERABILITY_REASON_MAX) {
    return { value: null, error: `이식성 이유는 ${TRANSFERABILITY_REASON_MAX}자까지입니다 (${s.length}자 입력).` }
  }
  return { value: s }
}

/** 어휘 밖은 조용히 null 로 접지 않는다 — 사람이 고른 것을 버리는 것이라서다(readTransferability 와 같은 규칙). */
function readEnum<T extends string>(raw: unknown, vocab: readonly T[], label: string): { value: T | null; error?: string } {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return { value: null }
  if (!(vocab as readonly string[]).includes(s)) return { value: null, error: `${label} 값이 어휘 밖입니다: ${s} (${vocab.join('/')})` }
  return { value: s as T }
}

export const readPmfSignal = (raw: unknown) => readEnum(raw, PMF_SIGNALS, 'PMF 신호 강도(S)')
export const readMetricKind = (raw: unknown) => readEnum(raw, METRIC_KINDS, '지표 종류')

/**
 * 제출 payload 검증. 체크 안 한 무브는 **아예 빠진다** — 이 화면에 반려는 없고,
 * 고르지 않은 것은 draft 그대로다(그래야 "안 본 것"과 "보고 아니라고 한 것"이 갈린다).
 * 이식성은 기존 승인과 같은 규칙: 미선택은 통과, 어휘 밖은 거절(lib/cases/review.ts).
 */
export function readGradeSubmission(input: {
  caseId: unknown
  moveIds: readonly unknown[]
  transferabilityOf: (moveId: string) => unknown
  approveCase: unknown
  /** 아래 셋은 없어도 된다(옛 폼·CLI). 없으면 미기재로 남고 저장 대상에서 빠진다. */
  transferabilityReasonOf?: (moveId: string) => unknown
  pmfSignalOf?: (moveId: string) => unknown
  metricKindOf?: (moveId: string) => unknown
}): { value: GradeSubmission | null; error?: string } {
  const caseId = typeof input.caseId === 'string' ? input.caseId.trim() : ''
  if (!caseId) return { value: null, error: '대상 케이스가 없습니다. 새로고침 후 다시 시도하세요.' }

  const ids: string[] = []
  for (const raw of input.moveIds) {
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (!id) return { value: null, error: '무브 식별자가 비었습니다. 새로고침 후 다시 시도하세요.' }
    if (!ids.includes(id)) ids.push(id)
  }

  const approveCase = input.approveCase === true || input.approveCase === 'on'
  if (ids.length === 0 && !approveCase) {
    return { value: null, error: '고른 것이 없습니다 — 승인할 무브를 체크하거나 케이스 승인을 체크하세요.' }
  }

  const moves: GradeSubmission['moves'] = []
  for (const id of ids) {
    const t = readTransferability(input.transferabilityOf(id))
    if (t.error) return { value: null, error: t.error }
    const reason = readTransferabilityReason(input.transferabilityReasonOf?.(id))
    if (reason.error) return { value: null, error: reason.error }
    const s = readPmfSignal(input.pmfSignalOf?.(id))
    if (s.error) return { value: null, error: s.error }
    const kind = readMetricKind(input.metricKindOf?.(id))
    if (kind.error) return { value: null, error: kind.error }
    moves.push({ id, transferability: t.value, transferabilityReason: reason.value, pmfSignal: s.value, metricKind: kind.value })
  }
  return { value: { caseId, moves, approveCase } }
}
