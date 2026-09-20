// 문제 해결 제안 (산출물 C) — 페인 속성마다 "이렇게 보완한 사례 / 이렇게 갔다가 막힌 사례 / 원칙".
//
// 이 파일은 **순수 함수만** 둔다 — DB 조회는 app/api/analyze/remedy 가 하고 여기엔 행 배열을 넘긴다
// (lib/cases/advisor.ts 와 같은 규약).
//
// 왜 어드바이저를 다시 감싸는가
//   advise() 는 "이 프로젝트와 겹치는 근거" 를 뭉쳐서 돌려준다. 셀러가 실제로 물어보는 건 그게 아니라
//   **"이 속성 문제를 어떻게 푸나"** 다. 그래서 질의어를 속성 단위로 좁혀 속성마다 한 장을 만든다.
//
// ★ 어느 속성에 처방을 붙일지는 (중요도, 만족도)만으로 정한다 — aspectVerdict() 가 PUSH(여기를 민다)
//   라고 한 속성이 1순위, WATCH(지켜본다)가 2순위다. 선례가 많다고 처방 대상이 되지 않는다:
//   두 축은 출처가 다르고 틀리는 방식도 다르다(lib/cases/match.ts 헤더).
//
// ★ 3상태를 속성마다 유지한다. "관련 사례 없음(no_match)" 과 "조회를 못 했다(not_run)" 를 같은 빈
//   배열로 돌려주면 억지로 끼워 맞추지 않겠다는 약속이 화면에서 사라진다(§7.1).

import { aspectVerdict, type AspectVerdict } from '../analysis/aspect-verdict.ts'
import {
  advise,
  type AdvisorStatus, type CaseMoveCard, type FailedAngleCard, type PrincipleCard,
  type FailedAngleRow, type PrincipleRow,
} from './advisor.ts'
import type { MoveRow, StudyRow } from './match.ts'

/** 처방 대상이 되는 판정. 앞이 1순위다. */
export const REMEDY_VERDICTS = ['PUSH', 'WATCH'] as const

export const MAX_FIXES = 3
export const MAX_FAILURES = 2
export const MAX_PRINCIPLES = 2

export interface RemedyAspectRow {
  id: string
  name: string
  notes?: string | null
  importance: number | string | null
  satisfaction: number | string | null
}

export interface RemedyProject {
  market?: string | null
  product_elevator_pitch?: string | null
}

export interface RemedyCard {
  aspect_id: string
  aspect_name: string
  verdict: AspectVerdict
  headline: string
  fixes: CaseMoveCard[]
  failures: FailedAngleCard[]
  principles: PrincipleCard[]
  /** 이 속성 한 장의 3상태. matched / no_match / not_run. */
  status: AdvisorStatus
  reason: string
  terms: string[]
}

export interface RemedyResult {
  status: AdvisorStatus
  reason: string
  cards: RemedyCard[]
}

// ── 문장 템플릿 (docs/pmf-product-design.md §3-1 6) ─────────────
// 화면이 각자 문장을 만들면 같은 카드가 요약 마크다운과 결과 화면에서 달라진다. 한 곳에 둔다.

export function remedyHeadline(aspectName: string): string {
  return `'${aspectName}' 문제 — 비슷한 문제를 이렇게 보완한 사례가 있다`
}

/** 보완 선례 한 줄. 사실확인 등급과 인사이트 등급은 **다른 축**이라 둘 다 적는다(2026-09-16 재설계). */
export function fixLine(c: CaseMoveCard): string {
  return `${c.brand_name} 가 ${c.lever} 로 "${c.claim}" (사실확인 ${c.fact_check_grade ?? '미기재'} · 인사이트 ${c.evidence_grade} · ${c.outcome_direction})`
}

/** 이렇게 갔다가 막힌 사례 한 줄. 추정이 섞인 재서술이면 그 사실을 붙인다. */
export function failureLine(c: FailedAngleCard): string {
  return `${c.claimed_angle} → ${c.outcome} (${c.source_tier}${c.is_estimate ? ' · 추정 포함' : ''})`
}

export function principleLine(c: PrincipleCard): string {
  return `${c.sp_id} ${c.statement} (${c.evidence_grade})`
}

/**
 * 페인 속성마다 처방 카드 1장.
 *
 * aspects 가 null 이면 not_run — 속성 조회 실패를 "페인 없음" 으로 접지 않는다.
 * 판정이 PUSH/WATCH 인 속성이 0건이면 no_match: 조회는 정상인데 처방할 대상이 없는 상태다.
 */
export function buildRemedies(input: {
  aspects: RemedyAspectRow[] | null | undefined
  project: RemedyProject | null | undefined
  corpora: {
    principles: PrincipleRow[] | null | undefined
    studies: StudyRow[] | null | undefined
    moves: MoveRow[] | null | undefined
    failedAngles: FailedAngleRow[] | null | undefined
  }
}): RemedyResult {
  const { aspects, project, corpora } = input
  if (aspects == null) {
    return { status: 'not_run', reason: '속성 조회에 실패했다 — "페인 없음" 이 아니라 확인 불가다', cards: [] }
  }

  const targets = aspects
    .map((a) => ({ a, v: aspectVerdict(a.importance, a.satisfaction) }))
    .filter((x) => (REMEDY_VERDICTS as readonly string[]).includes(x.v.code))
    .sort((x, y) => REMEDY_VERDICTS.indexOf(x.v.code as 'PUSH') - REMEDY_VERDICTS.indexOf(y.v.code as 'PUSH'))

  if (targets.length === 0) {
    return {
      status: 'no_match',
      reason: `조회는 정상인데 판정이 "여기를 민다"·"지켜본다" 인 속성이 0건이다 — 처방할 페인이 없다 (속성 ${aspects.length}건)`,
      cards: [],
    }
  }

  const freeText = [project?.market, project?.product_elevator_pitch].filter(Boolean).join(' ') || null

  const cards: RemedyCard[] = targets.map(({ a, v }) => {
    const r = advise({ category: a.name, angleDescription: a.notes ?? null, freeText }, corpora)
    return {
      aspect_id: a.id,
      aspect_name: a.name,
      verdict: v,
      headline: remedyHeadline(a.name),
      fixes: r.corpus_a.cards.slice(0, MAX_FIXES),
      failures: r.corpus_b.cards.slice(0, MAX_FAILURES),
      principles: r.corpus_c.cards.slice(0, MAX_PRINCIPLES),
      status: r.status,
      reason: r.reason,
      terms: r.terms,
    }
  })

  // 전체 상태: 한 장이라도 근거가 붙었으면 matched. 전부 조회 정상인데 0건이면 no_match.
  const status: AdvisorStatus = cards.some((c) => c.status === 'matched')
    ? 'matched'
    : cards.every((c) => c.status === 'no_match') ? 'no_match' : 'not_run'
  const reason = status === 'matched'
    ? `페인 속성 ${cards.length}건 중 근거가 붙은 속성 ${cards.filter((c) => c.status === 'matched').length}건`
    : status === 'no_match'
      ? '페인 속성마다 조회는 정상인데 겹치는 근거가 0건이다 — 관련 사례 없음. 억지로 끼워 맞추지 않는다.'
      : '코퍼스 조회가 실패한 속성이 있다 — "관련 사례 없음" 이 아니라 확인 불가다'

  return { status, reason, cards }
}
