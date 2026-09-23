import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ANALYSIS_PURPOSES, ANALYSIS_MODES, type AnalysisPurpose, type AnalysisMode } from '@/lib/analysis/types'
import {
  isMissingColumn, MIGRATION_20260930000003_KEYS, MISSING_COLUMN_HINT, omitKeys, parseFacets,
} from '@/lib/analysis/facets'
import { parseCompetitorUrl } from '@/lib/analysis/inputs'
import { getAuthVerdict } from '@/lib/auth/session'
import { guardFromVerdict } from '@/lib/auth/policy'

// 소구점 분석 프로젝트 생성 (1단계 폼)
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)

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

  // 경쟁사 URL 은 forward 에서 **선택**이다(남헌 2026-09-23 Q4-A) — 비면 NULL 로 저장한다.
  // reverse 는 여전히 필수이고 다나와만 커버한다. 판정은 lib/analysis/inputs.ts (순수).
  const competitor = parseCompetitorUrl(body?.competitor_url, mode)
  if (!competitor.ok) return NextResponse.json({ error: competitor.error }, { status: 400 })

  const guess = typeof body?.seller_own_guess === 'string' ? body.seller_own_guess.trim() : ''

  // PMF 진단 입력(패싯 7개 = market + 어휘 6개)은 전부 선택이다. 안 보내면 컬럼이 NULL 로 남고, 결과 화면이
  // 그 자리에서 다시 받는다(PATCH). 보냈는데 어휘 밖이면 조용히 버리지 않고 막는다.
  const facets = parseFacets(body)
  if (!facets.ok) return NextResponse.json({ error: facets.error, field: facets.field }, { status: 400 })

  // 소유자(2026-09-21, 20260925000001). **세션에서만** 온다 — 본문 owner_email 은 읽지 않는다.
  // 프록시가 이미 세션을 검사했지만, 여기서 다시 못 읽으면(확인 불가) 프로젝트는 만들되 NULL 로 남긴다 —
  // 추정해 채우지 않고, 로그로 남겨 재사용률 집계에서 "모름" 이 보이게 한다(§7.1).
  const guard = guardFromVerdict(await getAuthVerdict())
  const ownerEmail = guard.ok ? guard.email : null
  if (!ownerEmail) console.warn('[analyze/projects] owner_email unresolved — stored as NULL')

  const row: Record<string, unknown> = {
    competitor_url:         competitor.value,
    product_elevator_pitch: pitch,
    purpose:                purpose,
    mode:                   mode,
    seller_own_guess:       guess || null,
    status:                 'collecting',
    owner_email:            ownerEmail,
    ...facets.values,
  }
  const create = (payload: Record<string, unknown>) =>
    supabase.from('analysis_projects').insert(payload).select().single()

  let { data, error } = await create(row)

  // `reader_problem` 은 FACET_KEYS 에 있으므로 위 스프레드로 자동으로 실린다. 마이그
  // 20260930000003 이 배포보다 늦으면 이 INSERT 가 죽고 **새 분석을 아예 시작할 수 없다**
  // (설계서 리스크). 그 키만 빼고 **1회** 재시도한다 — 프로젝트는 만들어지고 문제 유형만 빠진다.
  // 조용히 넘기지 않고 무엇을 뺐는지 로그에 남긴다 — 안 남기면 사람이 고른 문제 유형이 저장되지
  // 않은 것을 아무도 모른다(§7.1 · §7.2).
  if (error && isMissingColumn(error.code)) {
    console.warn('[analyze/projects] insert ' + error.code + ' — ' + MISSING_COLUMN_HINT + '. '
      + MIGRATION_20260930000003_KEYS.join('·') + ' 를 빼고 1회 재시도한다 (그 값은 저장되지 않는다): ' + error.message)
    ;({ data, error } = await create(omitKeys(row, MIGRATION_20260930000003_KEYS)))
  }

  if (error) {
    console.error('[analyze/projects] insert error:', error.code ?? '', error.message)
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
