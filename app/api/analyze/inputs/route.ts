import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ANALYSIS_SOURCE_TYPES, type AnalysisSourceType } from '@/lib/analysis/types'

// 분석 프로젝트에 수집 원문 추가 (2단계)
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)

  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const sourceType = body?.source_type as AnalysisSourceType
  if (!ANALYSIS_SOURCE_TYPES.includes(sourceType)) {
    return NextResponse.json({ error: '수집 유형을 선택해주세요.' }, { status: 400 })
  }

  const rawText = typeof body?.raw_text === 'string' ? body.raw_text.trim() : ''
  if (!rawText) {
    return NextResponse.json({ error: '수집 원문을 입력해주세요.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('analysis_inputs')
    .insert({
      project_id:  projectId,
      source_type: sourceType,
      raw_text:    rawText,
    })
    .select()
    .single()

  if (error) {
    console.error('[analyze/inputs] insert error:', error.message)
    return NextResponse.json({ error: '입력 추가 실패' }, { status: 500 })
  }

  return NextResponse.json({ input: data })
}
