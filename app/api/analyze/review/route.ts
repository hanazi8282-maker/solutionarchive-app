import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  ASPECT_LAYERS,
  ATTRIBUTIONS,
  PAIN_TIMINGS,
  type AspectLayer,
  type Attribution,
  type PainTiming,
} from '@/lib/analysis/types'

// ── 헬퍼 ─────────────────────────────────────────────────────────
function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

/** 0~10 범위 숫자로 정규화. 숫자가 아니면 null */
function pickScore(value: unknown): number | null {
  if (value === null || value === '' || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(10, Math.max(0, n))
}

// ── 검수 화면 데이터 조회 ────────────────────────────────────────
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, maturity_stage, maturity_notes, m_meta_signal, extract_error, extract_started_at, extract_finished_at')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    console.error('[analyze/review] project fetch error:', projectError?.message)
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  // opportunity_score 는 DB 계산 컬럼 — 읽기만 한다.
  const { data: aspects, error: aspectsError } = await supabase
    .from('analysis_aspects')
    .select('id, name, aspect_layer, importance, satisfaction, opportunity_score, attribution, pain_timing, persona_role, proxy_consumption, is_segmentation_axis, value_realization_frequency, human_confirmed, notes')
    .eq('project_id', projectId)
    .order('opportunity_score', { ascending: false, nullsFirst: false })

  if (aspectsError) {
    console.error('[analyze/review] aspects fetch error:', aspectsError.message)
    return NextResponse.json({ error: '속성 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ project, aspects: aspects ?? [] })
}

// ── 검수 결과 저장 ───────────────────────────────────────────────
// aspects 를 일괄 갱신하고, 전체가 human_confirmed 면 status='reviewed' 로 올린다.
export async function PUT(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)

  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const rawAspects = Array.isArray(body?.aspects) ? body.aspects : null
  if (!rawAspects) {
    return NextResponse.json({ error: '저장할 속성 목록이 없습니다.' }, { status: 400 })
  }

  // 0. 검수 가능한 상태인지 확인.
  //    추출이 아직 돌고 있거나(processing) 실패한(failed) 프로젝트를 검수 완료로
  //    올려버리면 이후 재시도가 상태를 덮어써 검수 결과가 사라진다.
  const { data: current, error: currentError } = await supabase
    .from('analysis_projects')
    .select('status')
    .eq('id', projectId)
    .single()

  if (currentError || !current) {
    console.error('[analyze/review] project fetch error:', currentError?.message)
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  const REVIEWABLE = ['extracted', 'reviewed', 'scored', 'angled', 'done']
  if (!REVIEWABLE.includes(current.status)) {
    const message =
      current.status === 'processing'
        ? '분석이 진행 중입니다. 완료 후 검수할 수 있습니다.'
        : current.status === 'failed'
          ? '분석이 실패한 프로젝트입니다. 재시도 후 검수해주세요.'
          : '아직 분석하지 않은 프로젝트입니다.'
    return NextResponse.json({ error: message, status: current.status }, { status: 409 })
  }

  // 1. 속성별 갱신 (opportunity_score 는 generated 컬럼이라 payload 에 넣지 않는다)
  for (const item of rawAspects) {
    const a = (item ?? {}) as Record<string, unknown>
    const id = typeof a.id === 'string' ? a.id : ''
    if (!id) {
      return NextResponse.json({ error: '속성 id가 없습니다.' }, { status: 400 })
    }

    const name = typeof a.name === 'string' ? a.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: '속성 이름은 비울 수 없습니다.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('analysis_aspects')
      .update({
        name,
        aspect_layer: pickEnum<AspectLayer>(a.aspect_layer, ASPECT_LAYERS),
        importance: pickScore(a.importance),
        satisfaction: pickScore(a.satisfaction),
        attribution: pickEnum<Attribution>(a.attribution, ATTRIBUTIONS),
        pain_timing: pickEnum<PainTiming>(a.pain_timing, PAIN_TIMINGS),
        human_confirmed: a.human_confirmed === true,
        notes: typeof a.notes === 'string' && a.notes.trim() ? a.notes.trim() : null,
      })
      .eq('id', id)
      .eq('project_id', projectId) // 다른 프로젝트의 속성을 건드리지 못하게 잠근다

    if (error) {
      console.error('[analyze/review] aspect update error:', error.message)
      return NextResponse.json({ error: '속성 저장에 실패했습니다.' }, { status: 500 })
    }
  }

  // 2. 저장된 실제 상태를 다시 읽어 전체 검수 완료 여부를 판정한다
  const { data: refreshed, error: refreshError } = await supabase
    .from('analysis_aspects')
    .select('id, name, aspect_layer, importance, satisfaction, opportunity_score, attribution, pain_timing, persona_role, proxy_consumption, is_segmentation_axis, value_realization_frequency, human_confirmed, notes')
    .eq('project_id', projectId)
    .order('opportunity_score', { ascending: false, nullsFirst: false })

  if (refreshError) {
    console.error('[analyze/review] aspects refetch error:', refreshError.message)
    return NextResponse.json({ error: '저장 후 조회에 실패했습니다.' }, { status: 500 })
  }

  const list = refreshed ?? []
  const allConfirmed = list.length > 0 && list.every(a => a.human_confirmed === true)

  // 3. 전체 확인되었으면 status='reviewed'
  let projectStatus: string | null = null
  if (allConfirmed) {
    const { data: updated, error: statusError } = await supabase
      .from('analysis_projects')
      .update({ status: 'reviewed' })
      .eq('id', projectId)
      .select('status')
      .single()

    if (statusError) {
      console.error('[analyze/review] project status update error:', statusError.message)
      return NextResponse.json({ error: '상태 변경에 실패했습니다.' }, { status: 500 })
    }
    projectStatus = updated?.status ?? null
  } else {
    const { data: current } = await supabase
      .from('analysis_projects')
      .select('status')
      .eq('id', projectId)
      .single()
    projectStatus = current?.status ?? null
  }

  return NextResponse.json({
    aspects: list,
    saved: list.length,
    all_confirmed: allConfirmed,
    status: projectStatus,
  })
}
