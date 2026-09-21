// PMF 2축 진단 1회 실행 — 앱 라우트(POST /api/analyze/pmf)와 CLI(scripts/pmf-assess.mjs)가
// **같은 산식·같은 저장 형태**를 쓰게 하는 한 벌.
//
// 왜 이 파일이 생겼나
//   진단은 CLI 로만 돌았다. 로그인한 셀러가 화면에서 "진단" 을 누르려면 같은 일을 하는 코드가
//   앱에도 있어야 하는데, 복붙하면 두 벌이 된다. 두 벌이 되는 순간 화면과 스크립트의 값이
//   갈라지고 어느 쪽이 맞는지 아무도 모른다(pmf-assess.mjs 헤더).
//
// ⚠️ 산식을 여기서 다시 만들지 않는다. demandAxis / precedentAxis / quadrantOf / matchMoves 는
//    lib/cases/match.ts 한 벌이다. 여기는 **조회 + 조립 + 저장**만 한다.
//
// ⚠️ 패싯이 없으면 추정하지 않는다. bottleneck 이 NULL 이면 진단 자체를 돌리지 않고 돌려보낸다 —
//    "가장 그럴듯한 병목" 을 골라 주면 결과가 사용자가 넣지 않은 전제 위에서 나오는데, 화면에서는
//    구분이 안 된다(normalizeFacets 의 판단과 같다).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(scripts/pmf-assess.mjs). `@/` 별칭·enum 을 쓰지 않고
//    상대경로에 `.ts` 확장자를 붙인다.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  matchMoves, demandAxis, precedentAxis, quadrantOf,
  PMF_QUADRANT_ADVICE, noQuadrantAdvice,
  type MatchResult, type MoveRow, type StudyRow, type Quadrant,
} from './match.ts'

/** 진단 입력이 되는 프로젝트 패싯. 어휘는 lib/cases/draft.ts = DB CHECK 와 같다. */
export interface ProjectFacets {
  bottleneck: string | null
  business_model: string | null
  buyer_type: string | null
  price_band: string | null
  purchase_frequency: string | null
}

export interface PmfProjectRow extends ProjectFacets {
  id: string
  product_elevator_pitch: string | null
  market: string | null
}

/** pmf_assessments 에 그대로 들어가는 행. DB CHECK 제약과 모양이 같아야 한다. */
export interface AssessmentRow {
  input: Record<string, unknown>
  facets: Record<string, string | null>
  target_project_id: string | null
  demand_axis: number | null
  precedent_axis: number | null
  quadrant: Quadrant | null
  match_status: MatchResult['status']
  match_reason: string
  created_by: string
}

export interface MoveLinkRow {
  assessment_id: string
  case_move_id: string
  match_score: number
  match_reason: string
  matched_by: 'facet'
}

/** 한 번에 연결하는 인용 무브 상한. CLI 가 쓰던 값 그대로다. */
export const MAX_LINKED_MOVES = 20

/**
 * 진단 결과 → pmf_assessments 행.
 *
 * ★ not_run 이면 축·사분면을 전부 NULL 로 만든다. DB CHECK(pmf_assessments_not_run_is_empty)도
 *   같은 걸 강제하지만 여기서 먼저 지운다 — 제약에 걸려 저장이 통째로 실패하면 진단 기록 자체가
 *   사라진다(CLI 주석과 같은 이유).
 *
 * ★ 제외 건수를 match_reason 뒤에 붙인다. `excluded` 를 담을 컬럼이 없어서, 화면이 "0건" 의 뜻
 *   (자기 케이스였나 · 미승인이었나 · 등급 D 였나)을 나중에 읽을 수 있는 자리가 여기뿐이다.
 */
export function buildAssessmentRow(args: {
  input: Record<string, unknown>
  facets: Record<string, string | null>
  targetProjectId: string | null
  match: MatchResult
  demand: { value: number | null }
  quadrant: Quadrant | null
  createdBy: string
}): AssessmentRow {
  const { match, demand } = args
  const notRun = match.status === 'not_run'
  const precedent = precedentAxis(match)
  const e = match.excluded
  return {
    input: args.input,
    facets: args.facets,
    target_project_id: args.targetProjectId,
    demand_axis: notRun ? null : demand.value,
    precedent_axis: notRun ? null : precedent.value,
    quadrant: notRun ? null : args.quadrant,
    match_status: match.status,
    match_reason: `${match.reason} · 제외: 자기 ${e.self} · 미승인 ${e.not_approved} · 등급D ${e.grade_d} · 반면교사 ${e.negative}`,
    created_by: args.createdBy,
  }
}

/** 진단이 딛고 선 선례 무브 연결 행. 무브가 강등되면 스테일을 감지하는 유일한 경로다. */
export function buildMoveRows(assessmentId: string, match: MatchResult): MoveLinkRow[] {
  return match.moves.slice(0, MAX_LINKED_MOVES).map((m) => ({
    assessment_id: assessmentId,
    case_move_id: m.id,
    match_score: m.match_score,
    match_reason: m.facet_hits.length ? `패싯일치 ${m.facet_hits.join('/')}` : '병목 일치',
    matched_by: 'facet' as const,
  }))
}

/** 진단 입력이 비어 있으면 어느 칸이 비었는지 돌려준다. bottleneck 만 필수다 — 나머지는 정렬 재료다. */
export function missingFacets(p: ProjectFacets): string[] {
  return p.bottleneck ? [] : ['bottleneck']
}

export type PmfRunResult =
  | { ok: false; kind: 'not_found' | 'missing_input' | 'lookup_failed' | 'save_failed'; reason: string; missing?: string[] }
  | {
      ok: true
      assessment: AssessmentRow & { id: string; created_at: string | null }
      match: MatchResult
      demand: { value: number | null; reason: string }
      precedent: { value: number | null; reason: string }
      quadrant: { quadrant: Quadrant | null; reason: string }
      advice: string
      linked_moves: number
    }

const STUDY_COLS =
  'id, slug, brand_name, bottleneck, business_model, buyer_type, price_band, outcome_status, review_status'
const MOVE_COLS =
  'id, case_study_id, lever, claim, evidence_grade, fact_check_grade, outcome_direction, review_status, metric_name, metric_before, metric_after, metric_unit'

/**
 * 프로젝트 1건을 진단하고 결과를 적립한다.
 *
 * 조회 실패는 빈 배열로 접지 않는다 — null 로 넘겨 matchMoves 가 not_run(확인 불가)으로 판정하게
 * 둔다. 그 행도 저장한다: "진단을 돌렸는데 케이스 조회가 실패했다" 는 "선례가 없다" 와 다른 사건이고,
 * 기록이 남아야 나중에 왜 사분면이 안 나왔는지 설명된다(§7.1).
 */
export async function runPmfAssessment(
  supabase: SupabaseClient,
  projectId: string,
  createdBy = 'app',
): Promise<PmfRunResult> {
  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch, market, bottleneck, business_model, buyer_type, price_band, purchase_frequency')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) {
    console.error('[analyze/pmf] project fetch error:', projectError.message)
    return { ok: false, kind: 'lookup_failed', reason: `프로젝트 조회에 실패했습니다 — ${projectError.message}` }
  }
  if (!project) return { ok: false, kind: 'not_found', reason: '프로젝트를 찾을 수 없습니다.' }

  const p = project as PmfProjectRow
  const missing = missingFacets(p)
  if (missing.length > 0) {
    return {
      ok: false,
      kind: 'missing_input',
      reason: '진단 입력이 없다 — 가설 병목을 고르지 않았습니다. 추정하지 않습니다.',
      missing,
    }
  }

  const facets: Record<string, string | null> = {
    business_model: p.business_model ?? null,
    buyer_type: p.buyer_type ?? null,
    purchase_frequency: p.purchase_frequency ?? null,
    price_band: p.price_band ?? null,
    bottleneck: p.bottleneck ?? null,
  }

  // 조회 실패는 null. 빈 배열과 섞지 않는다.
  const select = async <T>(table: string, cols: string, eq?: [string, string]): Promise<T[] | null> => {
    let q = supabase.from(table).select(cols)
    if (eq) q = q.eq(eq[0], eq[1])
    const { data, error } = await q
    if (error) {
      console.error(`[analyze/pmf] ${table} select error:`, error.code ?? '', error.message)
      return null
    }
    return (data ?? []) as T[]
  }

  const studies = await select<StudyRow>('case_studies', STUDY_COLS)
  const moves = await select<MoveRow>('case_moves', MOVE_COLS)
  const aspects = await select<{ opportunity_score: number | string | null }>(
    'analysis_aspects', 'opportunity_score', ['project_id', projectId],
  )

  const match = matchMoves(p.bottleneck, studies, moves, null, {
    business_model: p.business_model,
    buyer_type: p.buyer_type,
    price_band: p.price_band,
  })
  const demand = demandAxis(
    aspects === null ? null : aspects.map((a) => (a.opportunity_score == null ? null : Number(a.opportunity_score))),
  )
  const precedent = precedentAxis(match)
  const quad = quadrantOf(demand.value, precedent.value)

  const row = buildAssessmentRow({
    input: {
      item: p.product_elevator_pitch,
      market: p.market,
      ...facets,
      target_project_id: projectId,
      created_by: createdBy,
    },
    facets,
    targetProjectId: projectId,
    match,
    demand,
    quadrant: quad.quadrant,
    createdBy,
  })

  const ins = await supabase.from('pmf_assessments').insert(row).select('id, created_at').single()
  if (ins.error || !ins.data) {
    console.error('[analyze/pmf] assessment insert error:', ins.error?.code ?? '', ins.error?.message)
    return { ok: false, kind: 'save_failed', reason: `진단 결과 저장에 실패했습니다 — ${ins.error?.message ?? '알 수 없는 오류'}` }
  }

  // 인용 무브 연결 실패는 진단 본체를 되돌리지 않는다. 다만 감추지도 않는다 —
  // 연결이 끊기면 무브가 강등돼도 이 진단이 스테일해진 걸 감지할 방법이 없다.
  let linked = 0
  const moveRows = buildMoveRows(ins.data.id as string, match)
  if (moveRows.length > 0) {
    const mr = await supabase.from('pmf_assessment_moves').insert(moveRows)
    if (mr.error) console.error('[analyze/pmf] assessment_moves insert error:', mr.error.code ?? '', mr.error.message)
    else linked = moveRows.length
  }

  return {
    ok: true,
    assessment: { ...row, id: ins.data.id as string, created_at: (ins.data.created_at as string) ?? null },
    match,
    demand,
    precedent,
    quadrant: quad,
    advice: quad.quadrant ? PMF_QUADRANT_ADVICE[quad.quadrant] : noQuadrantAdvice(demand.value, precedent.value),
    linked_moves: linked,
  }
}
