import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ANALYSIS_SOURCE_TYPES, type AnalysisSourceType } from '@/lib/analysis/types'
import { parseRawText } from '@/lib/analysis/inputs'

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

  // 길이 상한은 발행 경계가 아니라 사고 방지용 안전판이다 — 근거는 lib/analysis/inputs.ts.
  const raw = parseRawText(body?.raw_text)
  if (!raw.ok) return NextResponse.json({ error: raw.error }, { status: 400 })
  const rawText = raw.value

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
