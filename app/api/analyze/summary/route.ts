import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildSummaryMarkdown, type SummaryAspect, type SummaryPmf } from '@/lib/cases/summary'
import { buildRemedies, type RemedyAspectRow } from '@/lib/cases/remedy'
import type { MoveRow, StudyRow } from '@/lib/cases/match'
import type { FailedAngleRow, PrincipleRow } from '@/lib/cases/advisor'

// 요약 마크다운 — GET /api/analyze/summary?project_id=<uuid> → { markdown }
//
// 결과 화면의 "요약 마크다운 복사" 가 부른다. 공개 URL 은 만들지 않는다(§6) — 이 라우트도
// 로그인 벽 안이고, 나가는 것은 사용자가 직접 복사한 텍스트뿐이다.
//
// 조립은 lib/cases/summary.ts(순수)가 한다. 여기서는 읽어서 넘기기만 하고, 조회 실패는 null 로
// 구분해 넘긴다 — 요약본에서 "없음" 과 "확인 불가" 가 섞이면 되돌릴 자리가 없다(§7.1).

const STUDY_COLS =
  'id, slug, brand_name, bottleneck, business_model, buyer_type, price_band, outcome_status, review_status'
const MOVE_COLS =
  'id, case_study_id, lever, claim, evidence_grade, fact_check_grade, outcome_direction, review_status, metric_name, metric_before, metric_after, metric_unit'

async function safeSelect<T>(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  table: string,
  cols: string,
): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).select(cols)
  if (error) {
    console.error(`[analyze/summary] ${table} select error:`, error.code ?? '', error.message)
    return null
  }
  return (data ?? []) as T[]
}

export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch, market, business_model, maturity_stage, maturity_notes, m_meta_signal')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) {
    console.error('[analyze/summary] project fetch error:', projectError.message)
    return NextResponse.json({ error: '프로젝트 조회에 실패했습니다.' }, { status: 500 })
  }
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })

  const { data: aspects, error: aspectsError } = await supabase
    .from('analysis_aspects')
    .select('id, name, notes, importance, satisfaction, opportunity_score, evidence_quotes, human_confirmed')
    .eq('project_id', projectId)
    .order('opportunity_score', { ascending: false, nullsFirst: false })
  if (aspectsError) console.error('[analyze/summary] aspects fetch error:', aspectsError.message)

  const { data: pmfRows, error: pmfError } = await supabase
    .from('pmf_assessments')
    .select('demand_axis, precedent_axis, quadrant, match_status, match_reason, created_at')
    .eq('target_project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (pmfError) console.error('[analyze/summary] pmf_assessments fetch error:', pmfError.message)

  const { data: angles, error: anglesError } = await supabase
    .from('analysis_angles')
    .select('headline_draft, angle_type, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(3)
  if (anglesError) console.error('[analyze/summary] angles fetch error:', anglesError.message)

  const principles = await safeSelect<PrincipleRow>(
    supabase, 'strategy_principles', 'sp_id, tags, statement, evidence_grade, evidence_grade_note, source_ref',
  )
  const studies = await safeSelect<StudyRow>(supabase, 'case_studies', STUDY_COLS)
  const moves = await safeSelect<MoveRow>(supabase, 'case_moves', MOVE_COLS)
  const failedAngles = await safeSelect<FailedAngleRow>(
    supabase, 'failed_angles', 'case_key, product_category, claimed_angle, outcome, evidence_source, source_tier, is_estimate',
  )

  const remedies = buildRemedies({
    aspects: aspectsError ? null : ((aspects ?? []) as RemedyAspectRow[]),
    project,
    corpora: { principles, studies, moves, failedAngles },
  })

  const markdown = buildSummaryMarkdown({
    project,
    aspects: aspectsError ? null : ((aspects ?? []) as SummaryAspect[]),
    pmf: pmfError ? null : ((pmfRows?.[0] ?? null) as SummaryPmf | null),
    pmfLookupFailed: Boolean(pmfError),
    remedies,
    angles: anglesError ? null : (angles ?? []),
  })

  return NextResponse.json({ markdown })
}
