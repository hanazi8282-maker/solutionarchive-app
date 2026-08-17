import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ANALYSIS_PURPOSES, type AnalysisPurpose } from '@/lib/analysis/types'

// 소구점 분석 프로젝트 생성 (1단계 폼)
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)

  const competitorUrl = typeof body?.competitor_url === 'string' ? body.competitor_url.trim() : ''
  if (!competitorUrl) {
    return NextResponse.json({ error: '경쟁사 상품 URL을 입력해주세요.' }, { status: 400 })
  }

  const pitch = typeof body?.product_elevator_pitch === 'string' ? body.product_elevator_pitch.trim() : ''
  if (!pitch) {
    return NextResponse.json({ error: '상품 한 줄 소개를 입력해주세요.' }, { status: 400 })
  }

  const purpose = body?.purpose as AnalysisPurpose
  if (!ANALYSIS_PURPOSES.includes(purpose)) {
    return NextResponse.json({ error: '분석 목적을 선택해주세요.' }, { status: 400 })
  }

  const guess = typeof body?.seller_own_guess === 'string' ? body.seller_own_guess.trim() : ''

  const { data, error } = await supabase
    .from('analysis_projects')
    .insert({
      competitor_url:         competitorUrl,
      product_elevator_pitch: pitch,
      purpose:                purpose,
      seller_own_guess:       guess || null,
      status:                 'collecting',
    })
    .select()
    .single()

  if (error) {
    console.error('[analyze/projects] insert error:', error.message)
    return NextResponse.json({ error: '프로젝트 생성 실패' }, { status: 500 })
  }

  return NextResponse.json({ project: data })
}
