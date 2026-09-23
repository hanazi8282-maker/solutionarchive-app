// 공개 케이스 상세(`/library/<slug>`)의 데이터 한 벌.
//
// 이 파일에 DB 조회와 순수 함수가 같이 있다. 조회는 `loadCaseDetail` 하나뿐이고 나머지는
// 전부 순수 함수다 — `scripts/case-detail-selftest.mjs` 가 네트워크·DB 없이 그 순수 함수만
// 부른다(lib/cases/match.ts:3-4 규약과 같은 이유: 정렬·그룹·체크리스트가 조용히 틀리면
// 화면에서는 구분이 안 된다).
//
// ★ §7.1 3상태. `status`:
//     ok        — 승인된 케이스를 찾았다
//     not_found — 조회는 정상인데 그 slug 로 **승인된** 케이스가 없다 (404 로 접어도 된다)
//     error     — 조회 자체를 못 했다 (404 로 접으면 안 된다. 화면이 "확인 불가"로 말한다)
//   not_found 와 error 를 같은 404 로 만들면 DB 장애가 "그런 케이스 없음"으로 굳는다.
//
// ★ `select('*')` 를 쓴다. 컬럼 목록을 적으면 마이그레이션(로고 20260930000001 ·
//   이식성 20260915000001) 미적용 환경에서 42703 으로 **조회 전체가** 실패하고, 그게
//   "케이스 없음"으로 보인다. `*` 는 없는 컬럼을 그냥 안 실어 오므로 미적용이 값 미기재로
//   나타난다 — 그 둘을 화면이 가를 수 있게 `logoColumns` 로 따로 알려 준다.

import type { createClient } from '@/lib/supabase/server'
import { matchFailedAngles, productKindOf, toTerms, type FailedAngleCard, type FailedAngleRow } from './advisor.ts'
import { pairMoves, type MovePair, type PairSide } from './compare.ts'
import type { MoveRow, StudyRow } from './match.ts'
import type { Evidence } from './draft.ts'

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>

/** 관련 케이스 장수. 3장은 §4 카드 그리드 한 줄이다. */
export const RELATED_LIMIT = 3
/** 카드 한 줄에 싣는 `transfer_note` 길이(§4). */
export const TRANSFER_NOTE_CLIP = 60

export type DetailStudyRow = StudyRow & {
  summary?: string | null
  period_start?: string | null
  period_end?: string | null
  tags?: string[] | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at?: string
  /** 마이그 20260930000001 미적용이면 키 자체가 없다. */
  logo_url?: string | null
  brand_domain?: string | null
}

export type DetailMoveRow = MoveRow & {
  transfer_note?: string | null
  preconditions?: string | null
  observed_period_start?: string | null
  observed_period_end?: string | null
  created_at?: string
  reviewed_by?: string | null
  reviewed_at?: string | null
}

export type DetailEvidenceRow = Evidence & {
  id: string
  case_move_id: string | null
  domain: string | null
}

// ────────────────────────────────────────────────────────────
// 1) 무브 정렬 — 시간순. NULL 은 맨 뒤다.
// ────────────────────────────────────────────────────────────
/**
 * `observed_period_start` 오름차순, NULL 은 마지막, 같으면 `created_at`.
 *
 * NULL 을 맨 앞에 두면 "시점 미확인"이 이야기의 1단계로 읽힌다 — 실제로는 언제 있었는지
 * 모르는 무브다. 타임라인의 첫 칸은 시점을 아는 것이 차지해야 한다(§7.1: 모르는 것을
 * 아는 것처럼 배치하지 않는다).
 */
export function sortMovesByTime<T extends { observed_period_start?: string | null; created_at?: string }>(moves: T[]): T[] {
  return [...moves].sort((a, b) => {
    const as = (a.observed_period_start ?? '').trim()
    const bs = (b.observed_period_start ?? '').trim()
    if (as && bs && as !== bs) return as < bs ? -1 : 1
    if (as && !bs) return -1
    if (!as && bs) return 1
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })
}

// ────────────────────────────────────────────────────────────
// 2) 근거 그룹 — 출처 성격별. 한 근거는 한 그룹에만 들어간다.
// ────────────────────────────────────────────────────────────
export const EVIDENCE_GROUPS = ['filing', 'primary_independent', 'self_reported', 'secondary', 'estimate'] as const
export type EvidenceGroupKey = (typeof EVIDENCE_GROUPS)[number]

export const EVIDENCE_GROUP_LABEL: Record<EvidenceGroupKey, string> = {
  filing: '법정 공시',
  primary_independent: '1차 · 당사자 아님',
  self_reported: '1차 · 당사자 자기보고',
  secondary: '2차 보도',
  estimate: '추정치',
}

export const EVIDENCE_GROUP_NOTE: Record<EvidenceGroupKey, string> = {
  filing: '허위기재에 법적 책임이 따르는 문서(SEC S-1/10-K/8-K · DART).',
  primary_independent: '당사자가 아닌 곳이 직접 관측·집계한 1차 출처.',
  self_reported: '당사자가 자기 성과를 말한 것. 1차이지만 교차 확인은 아니다.',
  secondary: '보도·해설. 원 수치를 옮겨 적은 것이라 독립 확인으로 세지 않는다.',
  estimate: '조사기관·업계 추산. 아무도 실측하지 않은 숫자다.',
}

/**
 * 근거 1건의 그룹. **판정 순서가 곧 규칙이다** — 공시가 추정보다 먼저이고, 추정은
 * 2차 보도보다 먼저다(2차 매체의 추산은 보도가 아니라 추정으로 읽혀야 한다).
 * 규칙 정본은 `docs/evidence-rules.md §1`, 등급 산식은 `lib/cases/draft.ts`.
 */
export function evidenceGroupOf(e: Pick<Evidence, 'source_tier' | 'is_self_reported' | 'is_estimate' | 'is_regulatory_filing'>): EvidenceGroupKey {
  if (e.is_regulatory_filing) return 'filing'
  if (e.is_estimate) return 'estimate'
  if (e.source_tier === 'primary') return e.is_self_reported ? 'self_reported' : 'primary_independent'
  return 'secondary'
}

export type EvidenceGroup<T> = { key: EvidenceGroupKey; label: string; note: string; rows: T[] }

/** 그룹별로 묶는다. 빈 그룹은 내지 않는다 — 0건 줄이 다섯 개 있는 화면은 아무것도 말하지 않는다. */
export function groupEvidence<T extends Pick<Evidence, 'source_tier' | 'is_self_reported' | 'is_estimate' | 'is_regulatory_filing'>>(
  rows: T[] | null | undefined,
): EvidenceGroup<T>[] {
  const by = new Map<EvidenceGroupKey, T[]>()
  for (const e of rows ?? []) {
    const k = evidenceGroupOf(e)
    const list = by.get(k) ?? []
    list.push(e)
    by.set(k, list)
  }
  return EVIDENCE_GROUPS
    .filter((k) => (by.get(k)?.length ?? 0) > 0)
    .map((k) => ({ key: k, label: EVIDENCE_GROUP_LABEL[k], note: EVIDENCE_GROUP_NOTE[k], rows: by.get(k)! }))
}

/** "근거 5건 · 공시 2 · 자기보고 3" 같은 한 줄. 0건이면 빈 문자열(문장은 화면이 만든다). */
export function evidenceTally(rows: { is_regulatory_filing?: boolean; is_self_reported?: boolean; is_estimate?: boolean; source_tier?: string }[]): string {
  if (rows.length === 0) return ''
  const groups = groupEvidence(rows as Parameters<typeof groupEvidence>[0])
  return groups.map((g) => `${g.label} ${g.rows.length}`).join(' · ')
}

// ────────────────────────────────────────────────────────────
// 3) 왜 이 등급인가 — 체크리스트. 숫자 점수를 만들지 않는다.
// ────────────────────────────────────────────────────────────
/**
 * 항목별 통과/미달. **합계 점수를 내지 않는다**(레퍼런스 계획 §3-2, SP-004):
 * 점수를 만들면 근거 없는 숫자가 등급을 대신하고, 등급 4단계라는 차별화가 사라진다.
 *
 * `required=false` 인 항목(공시)은 **미달이 결함이 아니다** — 비상장사는 공시가 없다.
 * 화면이 그 둘을 다른 색으로 말해야 "공시 없음"이 "부실한 케이스"로 읽히지 않는다.
 */
export type GradeCheckItem = {
  key: 'transfer_note' | 'preconditions' | 'evidence_count' | 'self_reported_ratio' | 'filing'
  label: string
  pass: boolean
  detail: string
  required: boolean
}

export function gradeChecklist(
  move: { transfer_note?: string | null; preconditions?: string | null } | null | undefined,
  evidence: Pick<Evidence, 'source_tier' | 'is_self_reported' | 'is_estimate' | 'is_regulatory_filing'>[],
): GradeCheckItem[] {
  const note = (move?.transfer_note ?? '').trim()
  const pre = (move?.preconditions ?? '').trim()
  const n = evidence.length
  const self = evidence.filter((e) => e.is_self_reported).length
  const filings = evidence.filter((e) => e.is_regulatory_filing).length
  // 비율은 근거가 있을 때만 뜻이 있다. 0건에서 "자기보고 0%" 는 통과가 아니라 판정 불가다.
  const ratio = n === 0 ? null : Math.round((self / n) * 100)

  return [
    {
      key: 'transfer_note', required: true, pass: note.length >= 15,
      label: '내일 할 행동(transfer_note)이 구체적으로 적혀 있다',
      detail: note ? `${note.length}자` : '미기재 — 이것이 비면 인사이트 등급은 D 다',
    },
    {
      key: 'preconditions', required: true, pass: pre.length > 0,
      label: '옮기려면 무엇이 있어야 하는지(전제)가 적혀 있다',
      detail: pre ? `${pre.length}자` : '미기재 — 전제가 없으면 인사이트 등급은 B 에서 멈춘다',
    },
    {
      key: 'evidence_count', required: true, pass: n > 0,
      label: '뒷받침 근거가 1건 이상 있다',
      detail: n > 0 ? `${n}건` : '0건 — 수치가 있는데 근거가 없으면 초안 검증에서 error 다',
    },
    {
      key: 'self_reported_ratio', required: true, pass: n > 0 && self < n,
      label: '당사자 자기보고만으로 이루어져 있지 않다',
      detail: ratio === null
        ? '근거 0건이라 비율을 낼 수 없다 — 통과도 미달도 아닌 확인 불가다'
        : `자기보고 ${self}/${n}건 (${ratio}%)`,
    },
    {
      key: 'filing', required: false, pass: filings > 0,
      label: '법정 공시가 근거에 있다',
      detail: filings > 0
        ? `${filings}건`
        : '없다 — 비상장·소규모 브랜드는 공시가 존재하지 않는다. 미달이 결함은 아니다',
    },
  ]
}

// ────────────────────────────────────────────────────────────
// 4) 수치 타일
// ────────────────────────────────────────────────────────────
export type MetricTile = {
  move_id: string
  name: string
  before: number | null
  after: number
  unit: string
  /** 이 무브의 근거가 **전부** 추정치다. 한 건이라도 실측이 있으면 false. */
  estimate_only: boolean
  /** 근거 0건 — 추정도 실측도 아니다(§7.1: 확인 불가). */
  no_evidence: boolean
}

/** `metric_after` 와 이름·단위가 다 있는 무브만 타일이 된다(DB CHECK 가 그 조합을 강제한다). */
export function metricTiles(
  moves: DetailMoveRow[],
  evidenceByMove: Map<string, Pick<Evidence, 'is_estimate'>[]>,
): MetricTile[] {
  const tiles: MetricTile[] = []
  for (const m of moves) {
    const name = (m.metric_name ?? '').trim()
    const unit = (m.metric_unit ?? '').trim()
    if (!name || !unit || m.metric_after == null) continue
    const ev = evidenceByMove.get(m.id) ?? []
    tiles.push({
      move_id: m.id,
      name,
      before: m.metric_before ?? null,
      after: m.metric_after,
      unit,
      estimate_only: ev.length > 0 && ev.every((e) => e.is_estimate === true),
      no_evidence: ev.length === 0,
    })
  }
  return tiles
}

// ────────────────────────────────────────────────────────────
// 5) 갈린 사례 — 이 케이스 무브의 **반대 방향** 짝만
// ────────────────────────────────────────────────────────────
export type SplitCase = {
  /** 이 케이스의 무브. 무엇에 대한 반례인지 밝히지 않으면 "남들은 갈렸다"가 떠 있는 문장이 된다. */
  ours: DetailMoveRow
  bottleneck: string
  lever: string
  /** 반대 방향이고 **다른 케이스**인 무브들. */
  others: PairSide[]
}

/**
 * `pairMoves` 결과에서 이 케이스와 맞물린 짝만 뽑는다.
 *
 * 짝 판정 자체는 `compare.ts` 한 벌을 그대로 쓴다 — 여기서 조건을 다시 쓰면(같은 병목·레버·
 * 교차 케이스·양쪽 승인) 곧 갈라지고, 갈라진 쪽이 화면에 나간다.
 */
export function splitCases(study: DetailStudyRow, moves: DetailMoveRow[], pairs: MovePair[]): SplitCase[] {
  const byKey = new Map(pairs.map((p) => [p.key, p]))
  const out: SplitCase[] = []
  for (const m of moves) {
    if (m.outcome_direction !== 'positive' && m.outcome_direction !== 'negative') continue
    const pair = byKey.get(`${study.bottleneck}|${m.lever}`)
    if (!pair) continue
    const opposite = m.outcome_direction === 'positive' ? pair.negative : pair.positive
    const others = opposite.filter((s) => s.study.id !== study.id)
    if (others.length === 0) continue
    out.push({ ours: m, bottleneck: pair.bottleneck, lever: pair.lever, others })
  }
  return out
}

// ────────────────────────────────────────────────────────────
// 6) 관련 케이스 3장
// ────────────────────────────────────────────────────────────
export type RelatedCase = {
  study: DetailStudyRow
  /** 카드에 실을 대표 무브 — 승인 무브 중 인사이트 등급이 가장 센 것. */
  move: DetailMoveRow | null
  move_count: number
  /** 왜 관련으로 뽑혔나. 카드에 그대로 적어야 "비슷한 것 3개"가 짐작으로 안 읽힌다. */
  reason: '같은 문제 유형' | '같은 병목' | '같은 종류'
}

const GRADE_RANK: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 }

/** 승인 무브 중 대표 1개. 등급이 센 것 → 옮길 행동이 적힌 것 → created_at 순. */
export function pickLeadMove(moves: DetailMoveRow[]): DetailMoveRow | null {
  const approved = moves.filter((m) => m.review_status === 'approved')
  if (approved.length === 0) return null
  return [...approved].sort((a, b) =>
    (GRADE_RANK[b.evidence_grade] ?? -1) - (GRADE_RANK[a.evidence_grade] ?? -1)
    || (b.transfer_note ? 1 : 0) - (a.transfer_note ? 1 : 0)
    || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}

/**
 * 같은 문제 유형 → 같은 병목 → 같은 종류(SaaS/실물) 순으로 3장.
 *
 * **승인 무브가 0개인 케이스는 넣지 않는다.** 카드에 적을 "가져갈 행동"이 없어서
 * 눌러도 빈 상세가 나온다. 3장을 못 채우면 채우지 않는다 — 비슷한 것으로 메우면
 * "관련"이라는 말이 거짓이 된다(§7.1).
 */
export function relatedCases(
  study: DetailStudyRow,
  studies: DetailStudyRow[],
  moves: DetailMoveRow[],
  limit = RELATED_LIMIT,
): RelatedCase[] {
  const movesBy = new Map<string, DetailMoveRow[]>()
  for (const m of moves) {
    const list = movesBy.get(m.case_study_id) ?? []
    list.push(m)
    movesBy.set(m.case_study_id, list)
  }

  const kind = productKindOf(study.business_model)
  const pool = studies.filter((s) => s.id !== study.id && s.review_status === 'approved')
  const picked: RelatedCase[] = []
  const seen = new Set<string>()

  const take = (reason: RelatedCase['reason'], match: (s: DetailStudyRow) => boolean) => {
    for (const s of pool) {
      if (picked.length >= limit) return
      if (seen.has(s.id) || !match(s)) continue
      const all = movesBy.get(s.id) ?? []
      const lead = pickLeadMove(all)
      if (!lead) continue
      seen.add(s.id)
      picked.push({ study: s, move: lead, move_count: all.filter((m) => m.review_status === 'approved').length, reason })
    }
  }

  take('같은 문제 유형', (s) => Boolean(study.reader_problem) && s.reader_problem === study.reader_problem)
  take('같은 병목', (s) => Boolean(study.bottleneck) && s.bottleneck === study.bottleneck)
  take('같은 종류', (s) => productKindOf(s.business_model) === kind)
  return picked
}

/** 카드 한 줄 — `transfer_note` 앞 60자. 자를 때 말줄임을 붙여 자른 사실을 숨기지 않는다. */
export function clipTransferNote(note: string | null | undefined, max = TRANSFER_NOTE_CLIP): string | null {
  const s = (note ?? '').trim()
  if (!s) return null
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/** 제목 — "문제 → 수". summary 첫 문장을 쓰고, 없으면 브랜드명만(지어내지 않는다). */
export function detailTitle(study: { brand_name?: string | null; summary?: string | null }): string {
  const brand = (study.brand_name ?? '').trim() || '(브랜드명 미기재)'
  const first = (study.summary ?? '').trim().split(/(?<=[.。!?])\s|\n/)[0]?.trim() ?? ''
  return first ? `${brand} — ${first}` : brand
}

// ────────────────────────────────────────────────────────────
// 7) 조회 — 이 파일에서 DB 를 타는 유일한 곳
// ────────────────────────────────────────────────────────────
export type CaseDetail = {
  study: DetailStudyRow
  /** 승인 무브만, 시간순. */
  moves: DetailMoveRow[]
  /** 승인 아님으로 빠진 무브 수. "무브 1개"와 "무브 1개만 승인"은 다른 사실이다. */
  excluded_moves: number
  evidence: DetailEvidenceRow[]
  evidence_by_move: Map<string, DetailEvidenceRow[]>
  /** 무브에 안 붙은 케이스 단위 근거. */
  case_evidence: DetailEvidenceRow[]
  splits: SplitCase[]
  /** 짝 판정의 3상태 사유(코퍼스 조회 실패와 0묶음을 가른다). */
  splits_reason: string
  failed_angles: { status: 'matched' | 'no_match' | 'not_run'; reason: string; cards: FailedAngleCard[] }
  related: RelatedCase[]
  /** 로고 컬럼(마이그 20260930000001)이 응답에 있었나. 'missing' 은 "로고 미기재"가 아니다. */
  logo_columns: 'present' | 'missing'
}

export type CaseDetailResult =
  | { status: 'ok'; detail: CaseDetail }
  | { status: 'not_found'; reason: string }
  | { status: 'error'; reason: string }

/** 조회 실패는 null 로 돌린다. 빈 배열과 섞지 않는다(corpus-db.ts 와 같은 규약). */
async function selectAll<T>(sb: Client, table: string, where: string): Promise<T[] | null> {
  const { data, error } = await sb.from(table).select('*')
  if (error) {
    console.error(`[${where}] ${table} select error:`, error.code ?? '', error.message)
    return null
  }
  return (data ?? []) as T[]
}

/**
 * 승인된 케이스 한 건 + 그 화면에 필요한 것 전부.
 *
 * 케이스·무브는 **코퍼스 전체**를 읽는다. 갈린 사례(`pairMoves`)와 관련 케이스가 전체를
 * 봐야 하고, 승인 케이스가 수십 건 규모라 한 번에 읽는 게 조인 3번보다 싸다. 규모가
 * 커지면 그때 좁힌다 — ponytail: 승인 케이스 500건을 넘으면 관련·짝을 SQL 로 내린다.
 */
export async function loadCaseDetail(sb: Client, slug: string, where = 'library/[slug]'): Promise<CaseDetailResult> {
  const clean = (slug ?? '').trim().toLowerCase()
  if (!clean) return { status: 'not_found', reason: 'slug 가 비었다' }

  const [studies, moves, failedAngles] = await Promise.all([
    selectAll<DetailStudyRow>(sb, 'case_studies', where),
    selectAll<DetailMoveRow>(sb, 'case_moves', where),
    selectAll<FailedAngleRow>(sb, 'failed_angles', where),
  ])
  if (studies === null || moves === null) {
    return { status: 'error', reason: '케이스·무브 조회가 실패했다 — 이 케이스가 없다는 뜻이 아니다' }
  }

  const study = studies.find((s) => s.slug === clean)
  if (!study) return { status: 'not_found', reason: `slug "${clean}" 로 케이스가 없다` }
  if (study.review_status !== 'approved') {
    return { status: 'not_found', reason: `slug "${clean}" 는 아직 승인되지 않았다 (${study.review_status})` }
  }

  const all = moves.filter((m) => m.case_study_id === study.id)
  const approved = sortMovesByTime(all.filter((m) => m.review_status === 'approved'))

  const { data: evRows, error: evErr } = await sb.from('case_evidence').select('*').eq('case_study_id', study.id)
  if (evErr) {
    console.error(`[${where}] case_evidence select error:`, evErr.code ?? '', evErr.message)
    return { status: 'error', reason: `근거 조회가 실패했다 (${evErr.message}) — 근거 0건이 아니라 확인 불가다` }
  }
  const evidence = (evRows ?? []) as DetailEvidenceRow[]

  const evidence_by_move = new Map<string, DetailEvidenceRow[]>()
  for (const e of evidence) {
    if (!e.case_move_id) continue
    const list = evidence_by_move.get(e.case_move_id) ?? []
    list.push(e)
    evidence_by_move.set(e.case_move_id, list)
  }

  const pairs = pairMoves(studies, moves)
  const terms = toTerms(study.summary, study.brand_name, ...approved.map((m) => m.claim))

  return {
    status: 'ok',
    detail: {
      study,
      moves: approved,
      excluded_moves: all.length - approved.length,
      evidence,
      evidence_by_move,
      case_evidence: evidence.filter((e) => !e.case_move_id),
      splits: splitCases(study, approved, pairs.pairs),
      splits_reason: pairs.reason,
      failed_angles: matchFailedAngles(terms, failedAngles),
      related: relatedCases(study, studies, moves),
      // 컬럼이 응답에 있는지로 본다 — 값이 NULL 인 것(미기재)과 컬럼이 없는 것(마이그 미적용)은
      // 다른 사건이고, 화면이 다른 문장으로 말해야 한다(§7.1).
      logo_columns: 'logo_url' in study ? 'present' : 'missing',
    },
  }
}
