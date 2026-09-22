// "내 문제 → 유사 케이스" 검색 — **순수 함수만**. DB 조회는 lib/cases/corpus-db.ts 가 하고
// 여기엔 행 배열을 넘긴다(lib/cases/match.ts:3-4 규약). 그래야 셀프테스트가 네트워크 없이 돈다.
//
// 왜 이 층이 따로 필요한가
//   matchMoves(병목 하드필터)와 advisor.matchCaseMoves(낱말 매칭)는 둘 다 "프로젝트가 이미
//   있는 사람" 을 전제로 한다. 셀러가 자기 말로 묻는 입구가 없었다. 이 파일은 새 매칭기를
//   만들지 않고 둘 중 낱말 매칭 쪽에 **하드필터(병목·문제 유형)만 얹어** 재사용한다.
//
// ★ §7.1 3상태를 그대로 싣는다: matched(짝 있음) / no_match(찾았는데 0건) /
//   not_run(조회 실패거나 조건이 없어 아예 못 찾음). 화면이 셋을 다른 문장으로 말한다.

import { BOTTLENECK, READER_PROBLEMS } from './draft.ts'
import {
  matchCaseMoves, matchFailedAngles, toTerms,
  type AdvisorStatus, type CaseMoveCard, type CorpusResult, type FailedAngleCard,
  type FailedAngleRow, type ProductKind,
} from './advisor.ts'
import type { MoveRow, StudyRow } from './match.ts'

/** 자유 텍스트 상한. 신뢰 경계라 길이를 여기서 자른다 — 긴 입력은 낱말 수만 늘리고 매칭을 넓히기만 한다. */
export const QUERY_MAX = 200
/** 결과 카드 상한. advisor 의 TOP_N(5)보다 크다 — 여긴 검색 화면이라 5장에서 끊으면 "더 없나"를 알 수 없다. */
export const SEARCH_LIMIT = 20
/**
 * 질의 쪽 제품 종류 기본값. 이 화면의 독자는 SaaS 1인 창업가다(2026-09-23 피봇).
 * 하드필터가 아니라 가산점이라(advisor.KIND_MISMATCH_MODE) 소비재 무브도 **뒤에** 나온다.
 */
export const DEFAULT_KIND: ProductKind = 'software'

export interface SearchQuery {
  bottleneck: string | null
  problem: string | null
  q: string | null
}

export interface SearchCorpora {
  studies: StudyRow[] | null | undefined
  moves: MoveRow[] | null | undefined
  failedAngles: FailedAngleRow[] | null | undefined
}

export interface SearchResult {
  status: AdvisorStatus
  reason: string
  query: SearchQuery
  terms: string[]
  kind: ProductKind
  moves: CorpusResult<CaseMoveCard>
  failed_angles: CorpusResult<FailedAngleCard>
  /** 승인된 SaaS 케이스 수. null = 못 셌다(조회 실패) — 0 과 다르다. 빈 상태 문구가 이 값을 쓴다. */
  saas_case_count: number | null
  empty_state: string
}

/**
 * 질의 파싱. 어휘 밖 값은 조용히 무시하지 않고 errors 로 돌린다 —
 * 무시하면 "필터가 안 걸린 전체 결과"를 "그 유형의 결과"로 읽게 된다.
 */
export function parseSearchQuery(raw: {
  bottleneck?: string | null
  problem?: string | null
  q?: string | null
}): { query: SearchQuery; errors: string[] } {
  const errors: string[] = []
  const pick = (v: string | null | undefined, vocab: readonly string[], name: string): string | null => {
    const t = (v ?? '').trim().toUpperCase()
    if (!t) return null
    if (!vocab.includes(t)) { errors.push(`${name} 어휘 밖: ${t} (가능: ${vocab.join(', ')})`); return null }
    return t
  }
  const q = (raw.q ?? '').trim().slice(0, QUERY_MAX) || null
  return {
    query: {
      bottleneck: pick(raw.bottleneck, BOTTLENECK, 'bottleneck'),
      problem: pick(raw.problem, READER_PROBLEMS, 'problem'),
      q,
    },
    errors,
  }
}

/** 결과 0건일 때의 문구. 다른 말로 채우지 않는다 — 숫자는 DB 에서 센 것만 쓴다. */
export function emptyStateText(saasCaseCount: number | null): string {
  return saasCaseCount === null
    ? '승인된 SaaS 케이스 수를 세지 못했다 — 0건이 아니라 확인 불가다'
    : `이 유형의 SaaS 사례가 아직 ${saasCaseCount}건 — 축적 중`
}

const notRun = <T>(reason: string): CorpusResult<T> => ({ status: 'not_run', reason, cards: [] })

export function searchMoves(
  query: SearchQuery,
  corpora: SearchCorpora,
  opts: { kind?: ProductKind } = {},
): SearchResult {
  const kind = opts.kind ?? DEFAULT_KIND
  const terms = toTerms(query.q)
  const hasFilter = Boolean(query.bottleneck || query.problem)
  const studies = corpora.studies ?? null
  const moves = corpora.moves ?? null

  // 하드필터는 **케이스와 무브를 같이** 좁힌다. 무브를 안 좁히면 걸러진 케이스의 무브가
  // matchCaseMoves 안에서 "맥락 없는 무브 N건"으로 세어져 0건 사유가 거짓말이 된다.
  let scoped = studies
  let scopedMoves = moves
  let filteredOut = 0
  if (studies && moves) {
    scoped = studies.filter((s) =>
      (!query.bottleneck || s.bottleneck === query.bottleneck)
      && (!query.problem || s.reader_problem === query.problem))
    const ids = new Set(scoped.map((s) => s.id))
    scopedMoves = moves.filter((m) => ids.has(m.case_study_id))
    filteredOut = studies.length - scoped.length
  }

  const movesResult = !hasFilter && terms.length === 0
    ? notRun<CaseMoveCard>('검색 조건이 없다 — 문제 유형·병목·검색어 중 하나는 필요하다')
    : matchCaseMoves(terms, scoped, scopedMoves, kind, { matchAllWhenNoTerms: hasFilter, limit: SEARCH_LIMIT })

  // 실패 앵글 원장에는 병목·문제 유형 컬럼이 없다. 자유 텍스트가 없으면 **찾지 않은 것**이지
  // "실패 사례가 없는 것"이 아니다(§7.1).
  const failed = terms.length === 0
    ? notRun<FailedAngleCard>('자유 텍스트가 없어 실패 앵글은 찾지 않았다 — "실패 사례 없음"이 아니다')
    : matchFailedAngles(terms, corpora.failedAngles ?? null)

  const saas_case_count = studies === null
    ? null
    : studies.filter((s) => s.review_status === 'approved' && s.business_model === 'SAAS').length

  const both = [movesResult, failed]
  let status: AdvisorStatus
  let reason: string
  if (both.some((c) => c.status === 'matched')) {
    status = 'matched'
    reason = `무브 ${movesResult.cards.length}건 · 실패 앵글 ${failed.cards.length}건`
      + (filteredOut ? ` (조건 밖 케이스 ${filteredOut}건 제외)` : '')
  } else if (both.every((c) => c.status === 'no_match')) {
    status = 'no_match'
    reason = `조회는 정상인데 조건에 맞는 무브·실패 앵글이 0건이다${filteredOut ? ` (조건 밖 케이스 ${filteredOut}건 제외)` : ''}`
  } else if (both.every((c) => c.status === 'not_run')) {
    status = 'not_run'
    reason = `검색을 못 했다 — 무브: ${movesResult.reason} · 실패 앵글: ${failed.reason}`
  } else {
    // 한쪽만 0건이고 다른 쪽은 아예 못 찾은 경우. 섞어서 "없다"로 말하지 않는다.
    status = 'no_match'
    reason = `한쪽만 찾았다 — 무브: ${movesResult.reason} · 실패 앵글: ${failed.reason}`
  }

  return {
    status, reason, query, terms, kind,
    moves: movesResult,
    failed_angles: failed,
    saas_case_count,
    empty_state: emptyStateText(saas_case_count),
  }
}
