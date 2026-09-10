import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ANALYSIS_PURPOSES, ANALYSIS_MODES, type AnalysisPurpose, type AnalysisMode } from '@/lib/analysis/types'
import { parseDanawaProductUrl } from '@/lib/review/danawa-url'

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

  // mode 는 안 보내면 forward (기존 클라이언트 호환). §13-1 / 결정 B.
  const mode: AnalysisMode = body?.mode == null ? 'forward' : (body.mode as AnalysisMode)
  if (!ANALYSIS_MODES.includes(mode)) {
    return NextResponse.json({ error: '분석 방향(forward/reverse)이 올바르지 않습니다.' }, { status: 400 })
  }

  // reverse 는 지금 다나와 채널만 커버한다. 스마트스토어/쿠팡/아마존/G2/Capterra
  // URL 이면 조용히 빈 결과를 주지 않고 여기서 명확히 막는다 (§7.1).
  //   - 스마트스토어/쿠팡: 트랙 B 가 아직 커버 안 함
  //   - G2/Capterra 등 SaaS: 이용약관상 스크래핑 자체가 금지(SP-007) — 비용이 아니라 접근권 문제
  if (mode === 'reverse') {
    const danawa = parseDanawaProductUrl(competitorUrl)
    if (!danawa.ok) {
      return NextResponse.json(
        {
          error:
            '지금은 다나와가 커버하는 상품만 역방향 분석이 가능합니다. ' +
            '다나와 상품 상세 URL을 입력해주세요. (예: https://prod.danawa.com/info/?pcode=252495223)',
        },
        { status: 400 },
      )
    }
  }

  const guess = typeof body?.seller_own_guess === 'string' ? body.seller_own_guess.trim() : ''

  const { data, error } = await supabase
    .from('analysis_projects')
    .insert({
      competitor_url:         competitorUrl,
      product_elevator_pitch: pitch,
      purpose:                purpose,
      mode:                   mode,
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
