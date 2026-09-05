// 케이스 무브 매칭 + PMF 근접도 (M1).
//
// 이 파일은 **순수 함수만** 둔다. DB 조회는 scripts/case-match.mjs 가 하고
// 여기에는 행 배열을 넘긴다. 그래야 셀프테스트가 네트워크 없이 돈다.
//
// 왜 이 층이 따로 필요한가
//   "이 병목을 다른 브랜드는 어떻게 풀었나"가 이 파이프라인의 존재 이유다.
//   그 질문에 답하려면 (1) 같은 병목이고 (2) **다른 케이스**인 무브를 모아야
//   한다. 같은 브랜드의 무브를 섞으면 "짝을 찾았다"가 자기 자신을 본 것이
//   되는데, 결과 화면에서는 구분이 안 된다.
//
// ★ §7.1 3상태를 타입으로 강제한다
//   matched   = 짝이 있다 (양성)
//   no_match  = 조회는 정상인데 짝이 0건이다 (음성)
//   not_run   = 조회를 못 했거나 입력이 없어 판정 자체를 못 했다 (확인 불가)
//   `no_match` 와 `not_run` 을 같은 빈 배열로 돌려주면 "선례가 없다"와
//   "안 찾아봤다"가 섞인다. 그게 이 프로젝트에서 반복된 사고다.

export const MATCH_STATUS = ['matched', 'no_match', 'not_run'] as const
export type MatchStatus = (typeof MATCH_STATUS)[number]

// 등급 순위. A 가 가장 세다. D 는 수치가 없는 무브라 매칭 결과에서 뺀다.
export const GRADE_RANK: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 }

export interface MoveRow {
  id: string
  case_study_id: string
  lever: string
  claim: string
  evidence_grade: string
  outcome_direction: string
  review_status: string
  metric_name?: string | null
  metric_before?: number | null
  metric_after?: number | null
  metric_unit?: string | null
}

export interface StudyRow {
  id: string
  slug: string
  brand_name: string
  bottleneck: string
  business_model?: string | null
  buyer_type?: string | null
  price_band?: string | null
  outcome_status?: string | null
  review_status: string
}

export interface MatchedMove extends MoveRow {
  study: StudyRow
  facet_hits: string[]
  match_score: number
}

export interface MatchResult {
  status: MatchStatus
  reason: string
  bottleneck: string | null
  moves: MatchedMove[]
  /** 조회 대상이었지만 걸러진 무브 수. "0건"의 뜻을 좁히는 데 쓴다. */
  excluded: { self: number; not_approved: number; grade_d: number }
}

const notRun = (reason: string): MatchResult => ({
  status: 'not_run', reason, bottleneck: null, moves: [],
  excluded: { self: 0, not_approved: 0, grade_d: 0 },
})

/**
 * 같은 병목의 선례 무브를 찾는다.
 *
 * 패싯(business_model / buyer_type / price_band)은 **거르는 데 쓰지 않는다.**
 * 좁히면 "0건"이 늘어나는데, 그게 진짜 없는 건지 필터가 셌던 건지 구분이 안
 * 된다. 대신 일치한 패싯을 점수와 `facet_hits` 로 노출해 정렬에만 쓴다.
 */
export function matchMoves(
  bottleneck: string | null | undefined,
  studies: StudyRow[] | null | undefined,
  moves: MoveRow[] | null | undefined,
  selfStudyId: string | null = null,
  selfFacets: Partial<Pick<StudyRow, 'business_model' | 'buyer_type' | 'price_band'>> = {},
): MatchResult {
  if (!bottleneck) return notRun('병목이 주어지지 않았다 — 무엇을 찾을지 모르는 상태다')
  if (studies === null || studies === undefined || moves === null || moves === undefined) {
    return notRun('케이스·무브 조회가 실패했다 (null) — "선례 0건"이 아니라 "확인 불가"다')
  }

  const byId = new Map(studies.map(s => [s.id, s]))
  const excluded = { self: 0, not_approved: 0, grade_d: 0 }
  const out: MatchedMove[] = []

  for (const m of moves) {
    const study = byId.get(m.case_study_id)
    if (!study) continue                      // 맥락 없는 무브는 애초에 못 쓴다
    if (study.bottleneck !== bottleneck) continue
    if (selfStudyId !== null && m.case_study_id === selfStudyId) { excluded.self++; continue }
    // 케이스와 무브 **둘 다** approved 여야 한다. 케이스 승인이 무브 승인을
    // 뜻하지 않는다 (case-review.mjs 가 그렇게 경고한다).
    if (study.review_status !== 'approved' || m.review_status !== 'approved') { excluded.not_approved++; continue }
    if ((GRADE_RANK[m.evidence_grade] ?? 0) <= 0) { excluded.grade_d++; continue }

    const facet_hits: string[] = []
    if (selfFacets.business_model && selfFacets.business_model === study.business_model) facet_hits.push('business_model')
    if (selfFacets.buyer_type && selfFacets.buyer_type === study.buyer_type) facet_hits.push('buyer_type')
    if (selfFacets.price_band && selfFacets.price_band === study.price_band) facet_hits.push('price_band')

    out.push({
      ...m, study, facet_hits,
      match_score: (GRADE_RANK[m.evidence_grade] ?? 0) * 10 + facet_hits.length,
    })
  }

  // 등급 우선, 그다음 패싯 일치 수, 그다음 슬러그(결과 고정용).
  out.sort((a, b) =>
    b.match_score - a.match_score || a.study.slug.localeCompare(b.study.slug) || a.lever.localeCompare(b.lever))

  if (out.length === 0) {
    const why = [
      excluded.self ? `자기 케이스 ${excluded.self}건 제외` : '',
      excluded.not_approved ? `미승인 ${excluded.not_approved}건 제외` : '',
      excluded.grade_d ? `등급 D ${excluded.grade_d}건 제외` : '',
    ].filter(Boolean).join(' / ')
    return {
      status: 'no_match',
      reason: `조회는 정상인데 ${bottleneck} 선례가 0건이다${why ? ` (${why})` : ''} — 확인해보니 없다`,
      bottleneck, moves: [], excluded,
    }
  }
  return {
    status: 'matched',
    reason: `${bottleneck} 선례 ${out.length}건 (케이스 ${new Set(out.map(m => m.study.id)).size}곳)`,
    bottleneck, moves: out, excluded,
  }
}

// ────────────────────────────────────────────────────────────
// PMF 근접도 — 2축
// ────────────────────────────────────────────────────────────
//
// 축을 왜 둘로 나누는가 (하나로 합치지 않는 이유)
//   수요축과 선례축은 **출처가 다르고 틀리는 방식도 다르다.** 수요는 우리
//   리뷰 데이터(analysis_aspects)에서, 선례는 남의 사례에서 온다. 하나의
//   숫자로 곱해 버리면 "선례가 없어서 낮은 것"과 "수요가 없어서 낮은 것"이
//   같은 값으로 나오고, 그러면 다음 행동이 정반대인데 화면이 같아진다.
//
// ⚠️ opportunity_score 는 DB 생성 컬럼이다. 여기서 **재계산하지 않는다.**
//    읽어서 정규화만 한다. importance/satisfaction 으로 다시 만들지 마라.

export const QUADRANT = ['PROVEN_DEMAND', 'UNCHARTED_DEMAND', 'CROWDED_NO_DEMAND', 'PARK'] as const
export type Quadrant = (typeof QUADRANT)[number]

/**
 * 수요축: opportunity_score 를 0~1 로 정규화. 산식 O_k = I + max(I-S,0) 의 이론 최대는 2*max(I).
 *
 * 기본 척도는 **1~10** 이다 (analysis_aspects 실측: importance 3~9 / satisfaction 1~10).
 * 처음에 5 로 뒀다가 실데이터에서 걸렸다 — opportunity_score 17 이 2*5=10 을 넘어
 * `Math.min(1, ...)` 에 걸려 조용히 1.0 으로 포화됐다. 상한에 걸린 값과 진짜
 * 최고 수요가 화면에서 같아 보였다 (§7.2: 안전장치가 걸린 걸 정상으로 읽지 마라).
 *
 * 그래서 척도를 넘는 값이 오면 **포화시키지 않고 확인 불가로 돌린다.** 그건
 * "수요가 최대"가 아니라 "척도 가정이 틀렸다"는 신호다.
 */
export function demandAxis(
  opportunityScores: (number | null | undefined)[] | null | undefined,
  importanceMax = 10,
): { value: number | null; reason: string } {
  if (!opportunityScores) return { value: null, reason: '수요 데이터 조회 실패 — 0 이 아니라 확인 불가' }
  const vals = opportunityScores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (vals.length === 0) return { value: null, reason: '유효한 opportunity_score 가 0건 — 확인 불가' }
  const top = Math.max(...vals)
  const ceiling = 2 * importanceMax
  if (top > ceiling) {
    return {
      value: null,
      reason: `opportunity_score ${top} 이 척도 상한 ${ceiling}(=2*${importanceMax}) 을 넘었다 — 척도 가정이 틀렸다. 포화시키지 않고 확인 불가로 둔다`,
    }
  }
  return { value: top / ceiling, reason: `최고 opportunity_score ${top} / 상한 ${ceiling} (n=${vals.length})` }
}

/** 선례축: 매칭된 무브의 등급·케이스 수. 등급 A 두 케이스면 1.0 에 가깝다. */
export function precedentAxis(match: MatchResult): { value: number | null; reason: string } {
  if (match.status === 'not_run') return { value: null, reason: `선례 확인 불가 — ${match.reason}` }
  if (match.status === 'no_match') return { value: 0, reason: match.reason }
  const caseIds = new Set(match.moves.map(m => m.study.id))
  const bestRank = Math.max(...match.moves.map(m => GRADE_RANK[m.evidence_grade] ?? 0))
  // 케이스 2곳 이상 = 비교가 성립하는 최소선. 그걸 만점의 기준으로 삼는다.
  const breadth = Math.min(1, caseIds.size / 2)
  return {
    value: Math.min(1, (bestRank / 3) * 0.6 + breadth * 0.4),
    reason: `최고등급 ${['D', 'C', 'B', 'A'][bestRank]} · 케이스 ${caseIds.size}곳 · 무브 ${match.moves.length}건`,
  }
}

/** 사분면. 한 축이라도 null 이면 사분면을 내지 않는다 — 반쪽 근거로 그리지 않는다. */
export function quadrantOf(
  demand: number | null,
  precedent: number | null,
  cut = 0.5,
): { quadrant: Quadrant | null; reason: string } {
  if (demand === null || precedent === null) {
    return {
      quadrant: null,
      reason: `축이 비어 사분면을 내지 않는다 (수요 ${demand === null ? '확인 불가' : demand}, 선례 ${precedent === null ? '확인 불가' : precedent})`,
    }
  }
  const hiD = demand >= cut, hiP = precedent >= cut
  if (hiD && hiP) return { quadrant: 'PROVEN_DEMAND', reason: '수요도 있고 남이 푼 선례도 있다 — 우선순위 1' }
  if (hiD && !hiP) return { quadrant: 'UNCHARTED_DEMAND', reason: '수요는 있는데 선례가 약하다 — 직접 검증해야 한다' }
  if (!hiD && hiP) return { quadrant: 'CROWDED_NO_DEMAND', reason: '남들은 많이 했는데 우리 데이터에 수요가 없다' }
  return { quadrant: 'PARK', reason: '둘 다 약하다 — 지금 건드리지 않는다' }
}
