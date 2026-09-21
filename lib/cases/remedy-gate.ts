// 처방 카드 관련성 게이트 — 낱말 겹침으로 걸린 카드에서 "무관(0)" 판정을 받은 것을 뺀다.
//
// 이 파일은 **순수 함수만** 둔다(remedy.ts · advisor.ts 와 같은 규약). DB 조회는 lib/cases/remedy-db.ts,
// LLM 판정은 lib/cases/remedy-judge.ts 가 한다. 여기는 "판정 행을 카드에 붙여 거르는" 계산뿐이다.
//
// 왜 필요한가: 낱말 겹침만으로는 무관 비율이 59.5% 였다
// (docs/review-sources-and-remedy-roadmap-2026-09-21.md §3-0). 카드를 더 넣어도 우연 겹침이 같이 늘어
// 낱말 방식으로는 10% 가 나오지 않는다(§3-3). 그래서 뒤에 게이트를 한 겹 둔다.
//
// ★ §7.1 3상태를 카드 단위로 지킨다.
//   verdict 1·2  → kept        (관련 있다)
//   verdict 0    → 목록에서 제거 (관련 없다)
//   행 없음 · verdict NULL · 지문 불일치 → unverified ("판정 불가". 숨기지 않는다. 0 으로 접지 않는다)
//   판정을 못 받은 카드를 버리면 "확인 불가"가 조용히 "관련 없음"이 된다. 그게 이 규약이 막는 사고다.

import { createHash } from 'node:crypto'
import type { CaseMoveCard, FailedAngleCard, PrincipleCard } from './advisor.ts'
import { failureLine, fixLine, principleLine, type RemedyCard, type RemedyResult } from './remedy.ts'

export const CARD_KINDS = ['case_move', 'failed_angle', 'principle'] as const
export type CardKind = (typeof CARD_KINDS)[number]

/** remedy_verdicts 한 행. 조회하는 쪽(remedy-db.ts)이 이 모양으로 넘긴다. */
export interface VerdictRow {
  aspect_id: string
  card_kind: CardKind
  card_id: string
  card_fingerprint: string
  /** 0 무관 · 1 부분 · 2 직접 · null 미검증(판정 실패). */
  verdict: number | null
  /** 사람이 손으로 채점한 값. 있으면 verdict 보다 우선한다. */
  human_verdict?: number | null
}

/** 카드 한 장의 게이트 상태. 'removed' 는 목록에서 빠지므로 카드에 붙지 않는다. */
export type GateState = 'kept' | 'unverified'

export type Gated<T> = T & { gate: GateState }

export interface GateSummary {
  /** 0/1/2 판정을 실제로 받은 카드 수(통과 + 제외). */
  judged: number
  /** 무관(0)으로 빠진 카드 수. */
  removed: number
  /** 판정을 못 받은 카드 수 — 화면에 남되 "미검증" 으로 표시된다. */
  unverified: number
}

export interface GatedRemedyCard extends Omit<RemedyCard, 'fixes' | 'failures' | 'principles'> {
  fixes: Gated<CaseMoveCard>[]
  failures: Gated<FailedAngleCard>[]
  principles: Gated<PrincipleCard>[]
  gate_summary: GateSummary
}

export interface GatedRemedyResult extends Omit<RemedyResult, 'cards'> {
  cards: GatedRemedyCard[]
}

/** 카드 문장의 지문. 문구가 바뀌면 값이 달라져 옛 판정이 무효가 된다. */
export function cardFingerprint(kind: CardKind, lineText: string): string {
  return createHash('sha1').update(`${kind}\n${lineText}`).digest('hex')
}

/** 코퍼스마다 다른 식별자 컬럼을 한 축으로 모은다(case_moves.id / failed_angles.case_key / sp_id). */
export function cardIdOf(kind: CardKind, card: CaseMoveCard | FailedAngleCard | PrincipleCard): string {
  if (kind === 'case_move') return (card as CaseMoveCard).case_move_id
  if (kind === 'failed_angle') return (card as FailedAngleCard).case_key
  return (card as PrincipleCard).sp_id
}

/** 카드 문장. 판정 프롬프트에 넣는 텍스트이자 지문의 입력이다 — 화면이 보는 문장과 같아야 한다. */
export function cardLine(kind: CardKind, card: CaseMoveCard | FailedAngleCard | PrincipleCard): string {
  if (kind === 'case_move') return fixLine(card as CaseMoveCard)
  if (kind === 'failed_angle') return failureLine(card as FailedAngleCard)
  return principleLine(card as PrincipleCard)
}

const key = (aspectId: string, kind: CardKind, cardId: string) => `${aspectId}|${kind}|${cardId}`

/** 사람 판정이 있으면 그것을 쓴다. 없으면 LLM 판정. 둘 다 없으면 null(미검증). */
function effectiveVerdict(row: VerdictRow | undefined, kind: CardKind, line: string): number | null {
  if (!row) return null
  // 지문이 어긋났다 = 그 판정은 지금 이 문장에 대한 것이 아니다. 없는 것으로 친다.
  if (row.card_fingerprint !== cardFingerprint(kind, line)) return null
  const v = row.human_verdict ?? row.verdict
  return v === 0 || v === 1 || v === 2 ? v : null
}

/**
 * 판정 행을 카드에 붙이고 무관(0)을 걸러낸다.
 *
 * not_run(조회를 못 한 속성)은 건드리지 않는다 — 확인 불가는 확인 불가로 남는다.
 * 카드가 1장 이상이었는데 전부 무관이면 그 속성은 no_match 가 된다: "재검사했더니 전부 무관" 이지
 * "조회를 못 했다" 가 아니다.
 */
export function applyGate(remedies: RemedyResult, verdicts: VerdictRow[]): GatedRemedyResult {
  const byKey = new Map<string, VerdictRow>()
  for (const v of verdicts) byKey.set(key(v.aspect_id, v.card_kind, v.card_id), v)

  const cards = remedies.cards.map((c): GatedRemedyCard => {
    const summary: GateSummary = { judged: 0, removed: 0, unverified: 0 }

    function gate<T extends CaseMoveCard | FailedAngleCard | PrincipleCard>(kind: CardKind, list: T[]): Gated<T>[] {
      const out: Gated<T>[] = []
      for (const card of list) {
        const line = cardLine(kind, card)
        const v = effectiveVerdict(byKey.get(key(c.aspect_id, kind, cardIdOf(kind, card))), kind, line)
        if (v === null) { summary.unverified++; out.push({ ...card, gate: 'unverified' }); continue }
        summary.judged++
        if (v === 0) { summary.removed++; continue }
        out.push({ ...card, gate: 'kept' })
      }
      return out
    }

    const before = c.fixes.length + c.failures.length + c.principles.length
    const fixes = gate('case_move', c.fixes)
    const failures = gate('failed_angle', c.failures)
    const principles = gate('principle', c.principles)
    const after = fixes.length + failures.length + principles.length

    const wipedOut = c.status === 'matched' && before > 0 && after === 0
    return {
      ...c,
      fixes, failures, principles,
      status: wipedOut ? 'no_match' : c.status,
      reason: wipedOut ? `낱말로 걸린 ${before}장을 재검사했더니 전부 무관 — 관련 사례 없음` : c.reason,
      gate_summary: summary,
    }
  })

  // 전체 상태도 다시 센다 — 속성이 전부 no_match 로 바뀌었는데 위쪽만 matched 로 남으면 화면이 갈라진다.
  // not_run(확인 불가)은 게이트가 만들지 않으므로 원래 것을 그대로 물려받는다.
  const stillMatched = cards.filter((c) => c.status === 'matched').length
  const status = remedies.status === 'matched' && stillMatched === 0 ? 'no_match' : remedies.status
  const reason = remedies.status === 'matched' && stillMatched === 0
    ? '낱말로 걸린 카드를 재검사했더니 관련 있는 카드가 0장이다 — 관련 사례 없음. 억지로 끼워 맞추지 않는다.'
    : remedies.status === 'matched'
      ? `페인 속성 ${cards.length}건 중 근거가 붙은 속성 ${stillMatched}건`
      : remedies.reason

  return { status, reason, cards }
}
