import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ANALYSIS_PURPOSES, ANALYSIS_MODES, type AnalysisPurpose, type AnalysisMode } from '@/lib/analysis/types'
import { parseFacets } from '@/lib/analysis/facets'
import { parseDanawaProductUrl } from '@/lib/review/danawa-url'
import { getAuthVerdict } from '@/lib/auth/session'
import { guardFromVerdict } from '@/lib/auth/policy'

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

  // PMF 진단 입력(패싯 6개)은 전부 선택이다. 안 보내면 컬럼이 NULL 로 남고, 결과 화면이
  // 그 자리에서 다시 받는다(PATCH). 보냈는데 어휘 밖이면 조용히 버리지 않고 막는다.
  const facets = parseFacets(body)
  if (!facets.ok) return NextResponse.json({ error: facets.error, field: facets.field }, { status: 400 })

  // 소유자(2026-09-21, 20260925000001). **세션에서만** 온다 — 본문 owner_email 은 읽지 않는다.
  // 프록시가 이미 세션을 검사했지만, 여기서 다시 못 읽으면(확인 불가) 프로젝트는 만들되 NULL 로 남긴다 —
  // 추정해 채우지 않고, 로그로 남겨 재사용률 집계에서 "모름" 이 보이게 한다(§7.1).
  const guard = guardFromVerdict(await getAuthVerdict())
  const ownerEmail = guard.ok ? guard.email : null
  if (!ownerEmail) console.warn('[analyze/projects] owner_email unresolved — stored as NULL')

  const { data, error } = await supabase
    .from('analysis_projects')
    .insert({
      competitor_url:         competitorUrl,
      product_elevator_pitch: pitch,
      purpose:                purpose,
      mode:                   mode,
      seller_own_guess:       guess || null,
      status:                 'collecting',
      owner_email:            ownerEmail,
      ...facets.values,
    })
    .select()
    .single()

  if (error) {
    console.error('[analyze/projects] insert error:', error.message)
    return NextResponse.json({ error: '프로젝트 생성 실패' }, { status: 500 })
  }

  return NextResponse.json({ project: data })
}

// ── 패싯 갱신 ────────────────────────────────────────────────────
// 계약: { project_id, market?, bottleneck?, business_model?, buyer_type?, price_band?, purchase_frequency? }
// 결과 화면(/analyze/[id]/result)의 인라인 진단 폼이 이걸 부른다 — 필드 이름을 바꾸면 그 화면이 조용히 깨진다.
//
// 패싯 말고는 아무것도 못 바꾼다. status·mode·URL 을 같이 열면 화면 하나가 실수로
// 파이프라인 상태를 되돌릴 수 있고, 그건 로그에도 안 남는다.
export async function PATCH(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)

  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const facets = parseFacets(body)
  if (!facets.ok) return NextResponse.json({ error: facets.error, field: facets.field }, { status: 400 })
  if (facets.keys.length === 0) {
    return NextResponse.json({ error: '바꿀 진단 입력이 없습니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('analysis_projects')
    .update(facets.values)
    .eq('id', projectId)
    .select()
    .maybeSingle()

  if (error) {
    console.error('[analyze/projects] patch error:', error.message)
    return NextResponse.json({ error: '진단 입력 저장에 실패했습니다.' }, { status: 500 })
  }
  // 갱신된 행이 0건 = 그런 프로젝트가 없다. 200 으로 돌려주면 화면이 "저장됨" 으로 읽는다.
  if (!data) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({ project: data })
}
