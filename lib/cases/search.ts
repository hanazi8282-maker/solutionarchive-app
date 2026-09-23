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
  matchCaseMoves, matchFailedAngles, productKindOf, toTerms,
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

/**
 * 결과 쪽 종류 범위 — 화면 필터다(남헌 2026-09-23 확정).
 *   'saas' (기본) — `productKindOf(business_model)==='software'` 인 케이스만. 소비재는 **하드필터로 숨긴다.**
 *   'all'         — 지금까지와 같다. 소비재도 나오고 `KIND_MISMATCH_MODE='bonus'` 로 뒤에 앉는다.
 *
 * ⚠️ 위 `DEFAULT_KIND`(질의 쪽 ProductKind, 가산점 축)와 **다른 축**이다.
 *    이건 "무엇을 보여줄지", 저건 "무엇을 먼저 보여줄지".
 * ⚠️ 소비재 케이스는 삭제하지 않는다(CLAUDE.md §10.2 예외 1). 숨기기만 하므로 `?kind=all` 로 되돌아온다.
 *    그래서 숨긴 건수를 사유에 반드시 밝힌다 — "0건"과 "숨겨서 0건"은 다른 사건이다(§7.1).
 */
export const SEARCH_KINDS = ['saas', 'all'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]
export const DEFAULT_SEARCH_KIND: SearchKind = 'saas'

export interface SearchQuery {
  bottleneck: string | null
  problem: string | null
  q: string | null
  kind: SearchKind
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
  /** 조건 없이 들어온 둘러보기인가. 화면이 "전체 상위 N"임을 밝히는 데 쓴다. */
  browse: boolean
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
  kind?: string | null
}): { query: SearchQuery; errors: string[] } {
  const errors: string[] = []
  const pick = (v: string | null | undefined, vocab: readonly string[], name: string): string | null => {
    const t = (v ?? '').trim().toUpperCase()
    if (!t) return null
    if (!vocab.includes(t)) { errors.push(`${name} 어휘 밖: ${t} (가능: ${vocab.join(', ')})`); return null }
    return t
  }
  const q = (raw.q ?? '').trim().slice(0, QUERY_MAX) || null
  // kind 어휘는 소문자다(URL 에 그대로 보인다). 어휘 밖이면 기본값으로 조용히 떨어지지 않고 오류다 —
  // 조용히 떨어지면 "소비재 포함해서 봤다"고 믿은 사람이 SaaS만 본 결과를 읽는다.
  const rawKind = (raw.kind ?? '').trim().toLowerCase()
  let kind: SearchKind = DEFAULT_SEARCH_KIND
  if (rawKind) {
    if ((SEARCH_KINDS as readonly string[]).includes(rawKind)) kind = rawKind as SearchKind
    else errors.push(`kind 어휘 밖: ${rawKind} (가능: ${SEARCH_KINDS.join(', ')})`)
  }
  return {
    query: {
      bottleneck: pick(raw.bottleneck, BOTTLENECK, 'bottleneck'),
      problem: pick(raw.problem, READER_PROBLEMS, 'problem'),
      q,
      kind,
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
  let hiddenConsumer = 0
  if (studies && moves) {
    // 종류 필터가 **먼저** 걸린다(kind='saas' 기본). 소비재를 걸러 낸 뒤에 병목·문제 유형을 좁혀야
    // 두 사유의 건수가 겹치지 않는다 — 겹치면 "조건 밖 N건"이 숨긴 소비재까지 세어 거짓말이 된다.
    const kindScoped = query.kind === 'saas'
      ? studies.filter((s) => productKindOf(s.business_model) === 'software')
      : studies
    // 숨긴 건수는 **승인된 것만** 센다. 미승인 케이스는 kind 와 무관하게 어차피 카드로 안 나가므로
    // 세면 "숨겨서 안 보인다"로 오해할 수치가 된다.
    hiddenConsumer = studies.length - kindScoped.length === 0
      ? 0
      : studies.filter((s) => s.review_status === 'approved' && productKindOf(s.business_model) !== 'software').length
    scoped = kindScoped.filter((s) =>
      (!query.bottleneck || s.bottleneck === query.bottleneck)
      && (!query.problem || s.reader_problem === query.problem))
    const ids = new Set(scoped.map((s) => s.id))
    scopedMoves = moves.filter((m) => ids.has(m.case_study_id))
    filteredOut = kindScoped.length - scoped.length
  }

  // 조건이 하나도 없으면 **둘러보기**다 — 승인 무브 전체를 점수순 상위 N 으로 낸다.
  // 예전엔 not_run('검색 조건이 없다')으로 빈 화면을 냈는데, 첫 진입이 항상 빈 화면이라
  // "결과가 아예 안 뜬다"로 읽혔다(남헌 2026-09-23 보고). 3상태는 그대로 지킨다 —
  // 둘러보기도 실제로 찾은 것이므로 matched/no_match 로만 답하고, not_run 은 조회 실패에만 남긴다.
  const browse = !hasFilter && terms.length === 0
  const movesResult = matchCaseMoves(terms, scoped, scopedMoves, kind,
    { matchAllWhenNoTerms: hasFilter || browse, limit: SEARCH_LIMIT })

  // 실패 앵글 원장에는 병목·문제 유형 컬럼이 없다. 자유 텍스트가 없으면 **찾지 않은 것**이지
  // "실패 사례가 없는 것"이 아니다(§7.1).
  const failed = terms.length === 0
    ? notRun<FailedAngleCard>('자유 텍스트가 없어 실패 앵글은 찾지 않았다 — "실패 사례 없음"이 아니다')
    : matchFailedAngles(terms, corpora.failedAngles ?? null)

  const saas_case_count = studies === null
    ? null
    : studies.filter((s) => s.review_status === 'approved' && s.business_model === 'SAAS').length

  // 무엇을 왜 뺐는지 한 줄로 밝힌다(§7.1). 숨긴 것은 되돌리는 방법까지 같이 적는다.
  const notes = [
    filteredOut ? `조건 밖 케이스 ${filteredOut}건 제외` : null,
    hiddenConsumer ? `소비재 ${hiddenConsumer}건 숨김(kind=all 로 보기)` : null,
  ].filter(Boolean)
  const scopeNote = notes.length ? ` (${notes.join(' · ')})` : ''

  const both = [movesResult, failed]
  let status: AdvisorStatus
  let reason: string
  if (both.some((c) => c.status === 'matched')) {
    status = 'matched'
    reason = (browse
      ? `조건 없이 전체 상위 ${movesResult.cards.length}건`
      : `무브 ${movesResult.cards.length}건 · 실패 앵글 ${failed.cards.length}건`)
      + scopeNote
  } else if (both.every((c) => c.status === 'no_match')) {
    status = 'no_match'
    reason = `조회는 정상인데 조건에 맞는 무브·실패 앵글이 0건이다${scopeNote}`
  } else if (both.every((c) => c.status === 'not_run')) {
    status = 'not_run'
    reason = `검색을 못 했다 — 무브: ${movesResult.reason} · 실패 앵글: ${failed.reason}`
  } else {
    // 한쪽만 0건이고 다른 쪽은 아예 못 찾은 경우. 섞어서 "없다"로 말하지 않는다.
    status = 'no_match'
    reason = `한쪽만 찾았다 — 무브: ${movesResult.reason} · 실패 앵글: ${failed.reason}`
  }

  return {
    status, reason, query, terms, kind, browse,
    moves: movesResult,
    failed_angles: failed,
    saas_case_count,
    empty_state: emptyStateText(saas_case_count),
  }
}
