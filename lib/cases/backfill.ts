// 전이축 백필 계획 — 초안 JSON 의 무브를 DB 행에 짝짓고, "무엇을 쓸지"만 정한다.
//
// 이 파일은 **순수 함수만** 둔다 (lib/cases/match.ts 와 같은 규약). DB 조회·쓰기는
// scripts/case-review.mjs 의 backfill-reader-axis 가 하고 여기에는 행 배열을 넘긴다.
// 그래야 셀프테스트가 네트워크 없이 돈다.
//
// 왜 이 층이 따로 필요한가
//   반려된 케이스가 못 통과하는 이유는 무브의 transfer_note 가 비어 있어서다
//   (draft.ts::gradeMove 가 그걸 보면 다른 판정 전에 D 를 준다). 그 세 필드만
//   채워 넣어야 하는데, 초안을 다시 commit 하면 승인 상태까지 새로 만든다
//   (case-review.mjs::regrade 위 주석). 그래서 좁은 백필 경로가 필요하다.
//
// ★ 짝짓기가 이 작업에서 가장 틀리기 쉬운 지점이다.
//   case_moves 에는 초안 인덱스를 담은 컬럼이 없다. `created_at`+`id` 정렬에
//   의존하면 같은 케이스에 같은 lever 가 둘 있을 때(purple·oatly 는 무브 2개가
//   둘 다 OPERATIONS) 조용히 엇갈린다. 그래서 **lever + metric_name** 으로
//   맞추고, 유일하게 대응되지 않으면 그 무브는 **건너뛰고 "확인 불가"로
//   보고한다**. 애매한 짝을 추측으로 쓰지 않는다 (§7.1).

import { READER_PROBLEMS } from './draft.ts'

/**
 * 이 백필이 쓸 수 있는 컬럼 전부. 계획은 이 목록 밖의 키를 절대 내보내지 않고,
 * 스크립트는 UPDATE 직전에 `assertBackfillColumns` 로 한 번 더 막는다.
 * review_status · reviewed_by · reviewed_at · evidence_grade · fact_check_grade ·
 * claim · metric_* · evidence 는 이 경로가 건드리지 않는다 — 등급은 이어서
 * `regrade` 가 근거에서 계산하고, 승인은 사람 몫이다 (CLAUDE.md §10.1).
 */
export const MOVE_BACKFILL_COLUMNS = ['transfer_note', 'preconditions'] as const
export const STUDY_BACKFILL_COLUMNS = ['reader_problem'] as const

export type MoveBackfillColumn = (typeof MOVE_BACKFILL_COLUMNS)[number]

/** 짝짓기 3상태 — 양성 / 음성 / 확인 불가 (§7.1). lib/cases/match.ts 와 같은 발상. */
export const PAIR_STATUS = ['matched', 'no_match', 'ambiguous'] as const
export type PairStatus = (typeof PAIR_STATUS)[number]

export interface DraftMoveLike {
  lever: string
  metric_name?: string | null
  transfer_note?: string | null
  preconditions?: string | null
}

export interface MoveRowLike {
  id: string
  lever: string
  metric_name?: string | null
  transfer_note?: string | null
  preconditions?: string | null
}

export interface FieldWrite {
  column: MoveBackfillColumn
  /** 지금 DB 에 들어 있는 값. dry 출력이 "무엇을 덮는가"를 보여 주려고 남긴다. */
  from: string | null
  to: string
}

export interface FieldSkip {
  column: MoveBackfillColumn
  from: string | null
  reason: string
}

export interface MovePlan {
  index: number
  status: PairStatus
  /** 짝짓기 키. 보고에 그대로 찍어서 왜 엇갈렸는지 사람이 보게 한다. */
  key: string
  lever: string
  metric_name: string | null
  row_id: string | null
  reason: string
  write: FieldWrite[]
  skip: FieldSkip[]
}

export interface StudyPlan {
  status: 'write' | 'skip'
  column: (typeof STUDY_BACKFILL_COLUMNS)[number]
  from: string | null
  to: string | null
  reason: string
  /** 어휘 밖 값 등 — 확인 불가가 아니라 음성이다. 종료코드 1 로 올린다. */
  negative: boolean
}

export interface BackfillPlan {
  moves: MovePlan[]
  /** 초안의 어떤 무브도 가져가지 않은 DB 행. 초안 3무브 / DB 2행의 역방향이다. */
  orphanRows: { id: string; lever: string; metric_name: string | null }[]
  study: StudyPlan
  /** 짝을 못 지었거나 어휘가 틀린 게 하나라도 있나 (종료코드 1 판단용). */
  negative: boolean
  /** 실제로 UPDATE 가 나갈 필드 개수. 0 이면 쓸 게 없다. */
  writeCount: number
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
/** 키·빈값 판정용 정규화. 공백 차이로 짝이 엇갈리는 것만 막고 대소문자는 살린다. */
const norm = (v: unknown): string => text(v).replace(/\s+/g, ' ').trim()
const orNull = (v: unknown): string | null => (norm(v) ? text(v) : null)

export const pairKey = (m: { lever: string; metric_name?: string | null }): string =>
  `${norm(m.lever)}|${norm(m.metric_name) || '<수치명없음>'}`

const tally = (keys: string[]): Map<string, number> => {
  const out = new Map<string, number>()
  for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1)
  return out
}

/**
 * 초안 하나에 대한 백필 계획을 만든다. DB 를 안 본다 — 행은 인자로 받는다.
 *
 * @param overwrite 이미 값이 있는 필드도 덮어쓴다. 기본은 **빈칸만 채운다**.
 */
export function planReaderAxisBackfill(
  draft: { reader_problem?: string | null; moves?: DraftMoveLike[] },
  study: { reader_problem?: string | null },
  rows: MoveRowLike[],
  { overwrite = false }: { overwrite?: boolean } = {},
): BackfillPlan {
  const draftMoves = Array.isArray(draft.moves) ? draft.moves : []
  const rowCount = tally(rows.map(pairKey))
  const draftCount = tally(draftMoves.map(pairKey))
  const claimed = new Set<string>()

  const moves: MovePlan[] = draftMoves.map((m, index) => {
    const key = pairKey(m)
    const base = {
      index, key, lever: m.lever, metric_name: orNull(m.metric_name),
      write: [] as FieldWrite[], skip: [] as FieldSkip[],
    }
    if ((draftCount.get(key) ?? 0) > 1) {
      return {
        ...base, status: 'ambiguous' as const, row_id: null,
        reason: `확인 불가 — 초안 안에 lever+수치명이 같은 무브가 ${draftCount.get(key)}개다. 어느 DB 행이 어느 초안 무브인지 정할 수 없다`,
      }
    }
    const hits = rows.filter((r) => pairKey(r) === key)
    if (hits.length === 0) {
      return {
        ...base, status: 'no_match' as const, row_id: null,
        reason: '음성 — 같은 lever+수치명 DB 행이 없다 (수치명이 바뀌었거나 그 무브가 DB 에 없다)',
      }
    }
    if (hits.length > 1) {
      return {
        ...base, status: 'ambiguous' as const, row_id: null,
        reason: `확인 불가 — 같은 lever+수치명 DB 행이 ${hits.length}개다 (${hits.map((h) => h.id).join(', ')})`,
      }
    }
    const row = hits[0]
    claimed.add(row.id)
    const plan: MovePlan = {
      ...base, status: 'matched', row_id: row.id,
      reason: '짝 1:1',
    }
    for (const column of MOVE_BACKFILL_COLUMNS) {
      const from = orNull(row[column])
      const to = text(m[column]).trim()
      if (!to) {
        plan.skip.push({ column, from, reason: '초안에 값이 없다 — 채울 게 없다' })
        continue
      }
      if (from !== null && !overwrite) {
        plan.skip.push({ column, from, reason: '이미 값이 있다 — 빈칸만 채운다 (--overwrite 로 덮어쓴다)' })
        continue
      }
      if (from !== null && norm(from) === norm(to)) {
        plan.skip.push({ column, from, reason: '같은 값이다' })
        continue
      }
      plan.write.push({ column, from, to })
    }
    return plan
  })

  const orphanRows = rows.filter((r) => !claimed.has(r.id))
    .map((r) => ({ id: r.id, lever: r.lever, metric_name: orNull(r.metric_name) }))

  const studyPlan = planStudyReaderProblem(draft.reader_problem, study.reader_problem, overwrite)
  const negative = studyPlan.negative || moves.some((m) => m.status !== 'matched') || orphanRows.length > 0
  const writeCount = moves.reduce((n, m) => n + m.write.length, 0) + (studyPlan.status === 'write' ? 1 : 0)
  return { moves, orphanRows, study: studyPlan, negative, writeCount }
}

function planStudyReaderProblem(
  draftValue: string | null | undefined,
  current: string | null | undefined,
  overwrite: boolean,
): StudyPlan {
  const column = 'reader_problem' as const
  const from = orNull(current)
  const to = norm(draftValue)
  if (!to) return { status: 'skip', column, from, to: null, reason: '초안에 값이 없다 — 채울 게 없다', negative: false }
  // 어휘 밖을 조용히 통과시키면 DB CHECK(23514) 로 쓰기 단계에서 터진다. 여기서 음성으로 세운다.
  if (!READER_PROBLEMS.includes(to)) {
    return {
      status: 'skip', column, from, to,
      reason: `음성 — 어휘 밖 값이다: "${to}" (정본은 config/reader-problems.json)`, negative: true,
    }
  }
  if (from !== null && !overwrite) {
    return { status: 'skip', column, from, to, reason: '이미 값이 있다 — 빈칸만 채운다 (--overwrite 로 덮어쓴다)', negative: false }
  }
  if (from !== null && norm(from) === to) {
    return { status: 'skip', column, from, to, reason: '같은 값이다', negative: false }
  }
  return { status: 'write', column, from, to, reason: '빈칸을 채운다', negative: false }
}

/**
 * UPDATE 직전 마지막 관문. patch 에 백필 대상 밖의 키가 하나라도 있으면 던진다.
 * "쓰는 컬럼은 정확히 셋뿐"을 주석이 아니라 코드로 강제하는 자리다.
 */
export function assertBackfillColumns(
  patch: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  const extra = Object.keys(patch).filter((k) => !allowed.includes(k))
  if (extra.length > 0) {
    throw new Error(`백필 화이트리스트 밖 컬럼에 UPDATE 를 내려 하고 있다: ${extra.join(', ')} (허용: ${allowed.join(', ')})`)
  }
  return patch
}
