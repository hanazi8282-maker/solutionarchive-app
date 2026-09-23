// 공개 카드 그리드(`/library`)의 데이터 한 벌 — 트랙 3(reports/2026-09-23/ui-overhaul-reference-plan.md §4).
//
// 조회는 `loadLibrary` 하나뿐이고 나머지는 전부 순수 함수다 — `scripts/library-selftest.mjs` 가
// 네트워크·DB 없이 그 순수 함수만 부른다(lib/cases/match.ts:3-4 규약과 같은 이유: 대표 무브
// 선택과 정렬이 조용히 틀리면 화면에서는 카드가 그대로 나와서 구분이 안 된다).
//
// ★ 왜 detail.ts 와 따로 두나. 상세는 "한 건 + 그 주변"을 보고 여기는 "승인 전체 목록"을 본다.
//   대표 무브 규칙도 다르다 — 상세의 `pickLeadMove` 는 **등급이 센** 무브(그 케이스에서 가장 볼
//   만한 것), 그리드는 **시간순 첫** 무브(이야기의 시작)다. 한 함수로 합치면 둘 중 하나가
//   조용히 바뀐다. 대신 정렬·그룹 도구(`sortMovesByTime`)와 어휘·질의 파싱은 그대로 빌려 쓴다.
//
// ★ §7.1 3상태. `status`:
//     ok    — 조회 정상, 카드 1장 이상
//     empty — 조회 정상인데 조건에 맞는 승인 케이스가 0건
//     error — 조회 자체를 못 했다. empty 와 **같은 화면을 쓰지 않는다**(DB 장애가 "케이스 없음"으로 굳는다)
//   근거 수도 같다: `evidence_count === null` 은 "근거 0건"이 아니라 "못 셌다"다.

import type { createClient } from '@/lib/supabase/server'
import { safeSelect } from './corpus-db.ts'
import { sortMovesByTime, type DetailMoveRow, type DetailStudyRow } from './detail.ts'
import { displayGrade } from './grade-display.ts'
import { productKindOf } from './advisor.ts'
import { READER_PROBLEMS } from './draft.ts'
import {
  DEFAULT_SEARCH_KIND, emptyStateText, parseSearchQuery, type SearchKind,
} from './search.ts'

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>

export const LIBRARY_SORTS = ['recent', 'grade', 'moves'] as const
export type LibrarySort = (typeof LIBRARY_SORTS)[number]
export const DEFAULT_SORT: LibrarySort = 'recent'

export const LIBRARY_SORT_LABEL: Record<LibrarySort, string> = {
  recent: '최신 승인순',
  grade: '등급순',
  moves: '무브 많은 순',
}

export interface LibraryQuery {
  /** `reader_problem` 어휘 1개. null = 전체. */
  problem: string | null
  /** 'saas'(기본) = 소비재를 **숨긴다**(지우지 않는다 — §10.2 예외 1). 'all' = 전부. */
  kind: SearchKind
  sort: LibrarySort
}

export type LibraryCard = {
  study: DetailStudyRow
  /** 대표 무브 — 승인 무브 중 시간순 첫 것. 승인 무브가 0개면 null(카드는 그 사실을 적는다). */
  move: DetailMoveRow | null
  /** 승인 무브 수. */
  move_count: number
  /** 근거 수. **null = 못 셌다** — 0 과 섞지 않는다. */
  evidence_count: number | null
}

export type LibraryCounts = {
  /** 현재 kind 필터 기준 승인 케이스 수(문제 유형 필터 **전**). */
  total: number
  by_problem: Record<string, number>
  /** `reader_problem` 이 비어 어느 칩에도 안 들어가는 케이스 수. 칩 합과 total 이 다른 이유다. */
  unlabeled: number
}

export type LibraryResult = {
  status: 'ok' | 'empty' | 'error'
  reason: string
  query: LibraryQuery
  cards: LibraryCard[]
  counts: LibraryCounts
  /** kind='saas' 로 숨긴 **승인** 소비재 케이스 수. 0 이면 숨긴 것이 없다. */
  hidden_consumer: number
  /** 승인 SaaS 케이스 수. null = 못 셌다. 빈 상태 문구가 이 값을 쓴다. */
  saas_case_count: number | null
  empty_state: string
  /** 로고 컬럼(마이그 20260930000001)이 응답에 있었나. 'unknown' = 셀 케이스가 없어 판정 못 함. */
  logo_columns: 'present' | 'missing' | 'unknown'
}

const EMPTY_COUNTS: LibraryCounts = { total: 0, by_problem: {}, unlabeled: 0 }

/**
 * 질의 파싱. 문제 유형·종류는 `parseSearchQuery` 를 그대로 쓴다 — 어휘와 오류 문구가 검색
 * 화면과 갈라지면 같은 `?problem=` 이 두 화면에서 다르게 읽힌다.
 * 어휘 밖 값은 조용히 기본값으로 떨어지지 않고 errors 로 나간다(화면이 "그 조건은 빼고 보여줬다"고 말한다).
 */
export function parseLibraryQuery(raw: {
  problem?: string | null
  kind?: string | null
  sort?: string | null
}): { query: LibraryQuery; errors: string[] } {
  const { query, errors } = parseSearchQuery({ problem: raw.problem, kind: raw.kind })
  const rawSort = (raw.sort ?? '').trim().toLowerCase()
  let sort: LibrarySort = DEFAULT_SORT
  if (rawSort) {
    if ((LIBRARY_SORTS as readonly string[]).includes(rawSort)) sort = rawSort as LibrarySort
    else errors.push(`sort 어휘 밖: ${rawSort} (가능: ${LIBRARY_SORTS.join(', ')})`)
  }
  return { query: { problem: query.problem, kind: query.kind, sort }, errors }
}

/**
 * 카드에 실을 대표 무브 — 승인 무브 중 **시간순 첫 것**(`observed_period_start` 가장 이른 것,
 * 없거나 같으면 `created_at`). 정렬은 `detail.sortMovesByTime` 한 벌을 쓴다: 시점 미기재를
 * 맨 뒤로 보내는 규칙이 여기서도 같아야 한다(모르는 것을 이야기의 1단계로 앉히지 않는다).
 */
export function pickFirstMove(moves: DetailMoveRow[]): DetailMoveRow | null {
  const approved = moves.filter((m) => m.review_status === 'approved')
  return approved.length > 0 ? sortMovesByTime(approved)[0] : null
}

const GRADE_RANK: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 }
/** 미기재는 -1 — D(가져갈 게 없음)보다 뒤다. 둘은 다른 상태다(grade-display.ts). */
const gradeRank = (c: LibraryCard) => GRADE_RANK[displayGrade(c.move) ?? ''] ?? -1

/** 최신 승인순. `reviewed_at` 미기재는 **맨 뒤**(다른 날짜로 메우지 않는다), 같으면 적립일 역순. */
function byRecent(a: LibraryCard, b: LibraryCard): number {
  const as = (a.study.reviewed_at ?? '').trim()
  const bs = (b.study.reviewed_at ?? '').trim()
  if (as && bs && as !== bs) return as < bs ? 1 : -1
  if (as && !bs) return -1
  if (!as && bs) return 1
  return (b.study.created_at ?? '').localeCompare(a.study.created_at ?? '')
}

/** 정렬 3종. 1차 키가 같으면 전부 최신 승인순으로 떨어진다 — 같은 등급 안에서 순서가 흔들리지 않게. */
export function sortLibrary(cards: LibraryCard[], sort: LibrarySort): LibraryCard[] {
  const cmp: Record<LibrarySort, (a: LibraryCard, b: LibraryCard) => number> = {
    recent: byRecent,
    grade: (a, b) => gradeRank(b) - gradeRank(a) || byRecent(a, b),
    moves: (a, b) => b.move_count - a.move_count || byRecent(a, b),
  }
  return [...cards].sort(cmp[sort])
}

/** 문제 유형별 건수 — 사이드바 칩이 쓴다. 어휘 밖·빈 값은 `unlabeled` 로 따로 센다(0 으로 숨기지 않는다). */
export function problemCounts(studies: DetailStudyRow[]): LibraryCounts {
  const by_problem: Record<string, number> = {}
  for (const code of READER_PROBLEMS) by_problem[code] = 0
  let unlabeled = 0
  for (const s of studies) {
    const p = (s.reader_problem ?? '').trim()
    if (p && p in by_problem) by_problem[p] += 1
    else unlabeled += 1
  }
  return { total: studies.length, by_problem, unlabeled }
}

export type LibraryCorpora = {
  studies: DetailStudyRow[] | null | undefined
  moves: DetailMoveRow[] | null | undefined
  /** 근거는 **건수만** 쓴다(카드에 인용을 싣지 않는다). null = 못 셌다. */
  evidence: { case_study_id: string | null }[] | null | undefined
}

/**
 * 그리드 한 화면. 필터 순서가 규칙이다 — **종류(kind) 먼저, 문제 유형 나중**.
 * 그래야 두 사유의 건수가 겹치지 않는다(겹치면 "조건 밖 N건"이 숨긴 소비재까지 세어 거짓말이 된다).
 * lib/cases/search.ts 의 같은 순서와 맞춰 둔 것이다.
 */
export function buildLibrary(query: LibraryQuery, corpora: LibraryCorpora): LibraryResult {
  const studies = corpora.studies ?? null
  const moves = corpora.moves ?? null
  const evidence = corpora.evidence ?? null

  if (studies === null || moves === null) {
    return {
      status: 'error',
      reason: '케이스·무브 조회가 실패했다 — 승인 케이스가 0건이라는 뜻이 아니다',
      query,
      cards: [],
      counts: EMPTY_COUNTS,
      hidden_consumer: 0,
      saas_case_count: null,
      empty_state: emptyStateText(null),
      logo_columns: 'unknown',
    }
  }

  const approved = studies.filter((s) => s.review_status === 'approved')
  const kindScoped = query.kind === 'saas'
    ? approved.filter((s) => productKindOf(s.business_model) === 'software')
    : approved
  const hidden_consumer = approved.length - kindScoped.length
  const counts = problemCounts(kindScoped)

  const scoped = query.problem
    ? kindScoped.filter((s) => s.reader_problem === query.problem)
    : kindScoped
  const filteredOut = kindScoped.length - scoped.length

  const movesBy = new Map<string, DetailMoveRow[]>()
  for (const m of moves) {
    const list = movesBy.get(m.case_study_id) ?? []
    list.push(m)
    movesBy.set(m.case_study_id, list)
  }
  const evidenceBy = new Map<string, number>()
  for (const e of evidence ?? []) {
    if (!e.case_study_id) continue
    evidenceBy.set(e.case_study_id, (evidenceBy.get(e.case_study_id) ?? 0) + 1)
  }

  const cards = sortLibrary(scoped.map((study) => {
    const all = movesBy.get(study.id) ?? []
    return {
      study,
      move: pickFirstMove(all),
      move_count: all.filter((m) => m.review_status === 'approved').length,
      evidence_count: evidence === null ? null : (evidenceBy.get(study.id) ?? 0),
    }
  }), query.sort)

  const saas_case_count = approved.filter((s) => productKindOf(s.business_model) === 'software').length

  // 무엇을 왜 뺐는지 한 줄로 밝힌다(§7.1). 숨긴 것은 되돌리는 방법까지 같이 적는다.
  const notes = [
    filteredOut ? `문제 유형 밖 ${filteredOut}건 제외` : null,
    hidden_consumer ? `소비재 ${hidden_consumer}건 숨김(kind=all 로 보기)` : null,
    evidence === null ? '근거 수는 못 셌다(0건이 아니다)' : null,
  ].filter(Boolean)
  const scopeNote = notes.length ? ` (${notes.join(' · ')})` : ''

  return {
    status: cards.length > 0 ? 'ok' : 'empty',
    reason: cards.length > 0
      ? `승인 케이스 ${cards.length}건 · ${LIBRARY_SORT_LABEL[query.sort]}${scopeNote}`
      : `조회는 정상인데 조건에 맞는 승인 케이스가 0건이다${scopeNote}`,
    query,
    cards,
    counts,
    hidden_consumer,
    saas_case_count,
    empty_state: emptyStateText(saas_case_count),
    // 컬럼이 응답에 있는지로 본다 — 값이 NULL 인 것(로고 미기재)과 컬럼이 없는 것(마이그 미적용)은
    // 다른 사건이고, 화면이 다른 문장으로 말해야 한다(detail.ts 와 같은 규칙).
    logo_columns: studies.length === 0 ? 'unknown' : ('logo_url' in studies[0] ? 'present' : 'missing'),
  }
}

/**
 * 이 파일에서 DB 를 타는 유일한 곳.
 *
 * `select('*')` 를 쓴다 — 컬럼 목록을 적으면 로고 마이그(20260930000001) 미적용 환경에서
 * 42703 으로 **조회 전체가** 실패하고 그게 "케이스 없음"으로 보인다(detail.ts 와 같은 이유).
 *
 * ponytail: 승인 케이스 수십 건 규모라 전체를 읽고 메모리에서 좁힌다. 500건을 넘으면
 *   문제 유형·종류 필터와 정렬을 SQL 로 내린다(그때 건수 칩은 count 쿼리 1번으로).
 */
export async function loadLibrary(sb: Client, query: LibraryQuery, where = 'library'): Promise<LibraryResult> {
  const [studies, moves, evidence] = await Promise.all([
    safeSelect<DetailStudyRow>(sb, 'case_studies', '*', where),
    safeSelect<DetailMoveRow>(sb, 'case_moves', '*', where),
    safeSelect<{ case_study_id: string | null }>(sb, 'case_evidence', 'case_study_id', where),
  ])
  return buildLibrary(query, { studies, moves, evidence })
}
