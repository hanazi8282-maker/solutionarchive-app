import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { advise } from '@/lib/cases/advisor'
import type { MoveRow, StudyRow } from '@/lib/cases/match'
import type { FailedAngleRow, PrincipleRow } from '@/lib/cases/advisor'

// 크로스섹션 어드바이저 — 조회 전용 (M3 백엔드, 결정 C).
//
//   GET /api/analyze/advisor?angle_id=<uuid>[&q=<자유질문>]
//   GET /api/analyze/advisor?project_id=<uuid>[&q=<자유질문>]
//
// Corpus A(case_studies/case_moves) + Corpus B(failed_angles) + Corpus C
// (strategy_principles) 대상 태그·키워드 매칭. 근거 없으면 "관련 사례 없음"을
// 명시적으로 돌려준다(끼워맞추기 금지).
//
// Corpus D 격인 validated_angles_corpus 는 아직 비어 있어 wiring 하지 않는다 —
// 실사용 승인 데이터가 쌓인 뒤에 붙인다.
//
// UI: app/analyze/[id]/angles/page.tsx 의 AdvisorPanel 이 "유사 사례 보기"를
//     눌렀을 때만 이 라우트를 호출한다(앵글마다 자동 fetch 하지 않는다).

const STUDY_COLS =
  'id, slug, brand_name, bottleneck, business_model, buyer_type, price_band, outcome_status, review_status'
const MOVE_COLS =
  'id, case_study_id, lever, claim, evidence_grade, outcome_direction, review_status, metric_name, metric_before, metric_after, metric_unit'

/** 조회 실패는 null 로. 빈 배열([])과 절대 안 섞는다 — advisor 가 3상태로 구분한다. */
async function safeSelect<T>(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  table: string,
  cols: string,
): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).select(cols)
  if (error) {
    console.error(`[analyze/advisor] ${table} select error:`, error.code ?? '', error.message)
    return null
  }
  return (data ?? []) as T[]
}

export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const url = new URL(req.url)
  const angleId = url.searchParams.get('angle_id')?.trim() ?? ''
  const projectId = url.searchParams.get('project_id')?.trim() ?? ''
  const freeText = url.searchParams.get('q')?.trim() ?? ''

  if (!angleId && !projectId) {
    return NextResponse.json({ error: 'angle_id 또는 project_id 가 필요합니다.' }, { status: 400 })
  }

  // ── 앵글 컨텍스트 조립 ──────────────────────────────────────
  let category: string | null = null
  let angleDescription: string | null = null
  let resolvedProjectId = projectId
  let angleContext: Record<string, unknown> | null = null

  if (angleId) {
    const { data: angle, error: angleErr } = await supabase
      .from('analysis_angles')
      .select('id, project_id, aspect_id, angle_type, headline_draft, substantiation_verdict')
      .eq('id', angleId)
      .maybeSingle()
    if (angleErr) {
      console.error('[analyze/advisor] angle fetch error:', angleErr.message)
      return NextResponse.json({ error: '앵글 조회에 실패했습니다.' }, { status: 500 })
    }
    if (!angle) return NextResponse.json({ error: '앵글을 찾을 수 없습니다.' }, { status: 404 })

    resolvedProjectId = angle.project_id
    let aspectName: string | null = null
    let aspectNotes: string | null = null
    if (angle.aspect_id) {
      const { data: aspect } = await supabase
        .from('analysis_aspects')
        .select('name, notes, aspect_layer')
        .eq('id', angle.aspect_id)
        .maybeSingle()
      aspectName = aspect?.name ?? null
      aspectNotes = aspect?.notes ?? null
    }
    angleDescription = [aspectName, aspectNotes, angle.headline_draft].filter(Boolean).join(' · ') || null
    angleContext = {
      angle_id: angle.id,
      angle_type: angle.angle_type,
      substantiation_verdict: angle.substantiation_verdict,
      aspect_name: aspectName,
    }
  }

  if (resolvedProjectId) {
    const { data: project, error: projErr } = await supabase
      .from('analysis_projects')
      .select('id, product_elevator_pitch, seller_own_guess')
      .eq('id', resolvedProjectId)
      .maybeSingle()
    if (projErr) {
      console.error('[analyze/advisor] project fetch error:', projErr.message)
      return NextResponse.json({ error: '프로젝트 조회에 실패했습니다.' }, { status: 500 })
    }
    if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
    category = project.product_elevator_pitch ?? null
    if (!angleDescription) angleDescription = project.seller_own_guess ?? null
  }

  // ── 코퍼스 로드 ────────────────────────────────────────────
  const principles = await safeSelect<PrincipleRow>(
    supabase,
    'strategy_principles',
    'sp_id, tags, statement, evidence_grade, evidence_grade_note, source_ref',
  )
  const studies = await safeSelect<StudyRow>(supabase, 'case_studies', STUDY_COLS)
  const moves = await safeSelect<MoveRow>(supabase, 'case_moves', MOVE_COLS)
  const failedAngles = await safeSelect<FailedAngleRow>(
    supabase,
    'failed_angles',
    'case_key, product_category, claimed_angle, outcome, evidence_source, source_tier, is_estimate',
  )

  const result = advise(
    { category, angleDescription, freeText: freeText || null },
    { principles, studies, moves, failedAngles },
  )

  return NextResponse.json({
    context: { project_id: resolvedProjectId || null, category, angle_description: angleDescription, free_text: freeText || null, angle: angleContext },
    advisor: result,
  })
}
