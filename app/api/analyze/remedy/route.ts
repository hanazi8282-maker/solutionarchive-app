import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildRemedies, type RemedyAspectRow } from '@/lib/cases/remedy'
import type { MoveRow, StudyRow } from '@/lib/cases/match'
import type { FailedAngleRow, PrincipleRow } from '@/lib/cases/advisor'

// 문제 해결 제안 — 조회 전용. GET /api/analyze/remedy?project_id=<uuid>
//
// 페인 속성(판정 "여기를 민다"·"지켜본다")마다 보완 선례·실패 사례·원칙을 조립한다.
// 조립은 lib/cases/remedy.ts(순수)가 하고 여기서는 행을 읽어 넘기기만 한다 — advisor 라우트와 같은 규약.
//
// ★ 조회 실패를 빈 배열로 접지 않는다. null 로 넘겨야 remedy 가 "관련 사례 없음(no_match)" 과
//   "확인 불가(not_run)" 를 가른다(§7.1).

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
    console.error(`[analyze/remedy] ${table} select error:`, error.code ?? '', error.message)
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
    .select('id, product_elevator_pitch, market')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) {
    console.error('[analyze/remedy] project fetch error:', projectError.message)
    return NextResponse.json({ error: '프로젝트 조회에 실패했습니다.' }, { status: 500 })
  }
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })

  const { data: aspects, error: aspectsError } = await supabase
    .from('analysis_aspects')
    .select('id, name, notes, importance, satisfaction')
    .eq('project_id', projectId)
    .order('opportunity_score', { ascending: false, nullsFirst: false })
  if (aspectsError) console.error('[analyze/remedy] aspects fetch error:', aspectsError.message)

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

  return NextResponse.json({ project_id: projectId, remedies })
}
