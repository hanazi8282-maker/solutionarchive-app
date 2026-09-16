import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { REF_BUILDERS } from '@/lib/review/target-ref'

// 수집 타깃 등록 API — review_sources 에 등록된 소스 전부 공용.
//
// ⛔ **URL 이나 확정된 ref 만 받는다. 자유 텍스트로 검색해서 후보 중 하나를
//    시스템이 자동으로 고르는 기능은 만들지 않는다.** 어느 상품을 어느
//    프로젝트에 붙일지는 사람이 정한다(review_targets 설계 주석).
//    자동 선택은 조용히 틀린 상품의 리뷰를 모아 오고, 분석 결과가 그럴듯하게
//    나오기 때문에 아무도 알아채지 못한다.
//
// ⚠️ hackernews 의 `q:` 는 성격이 다르다. 상품 식별자가 아니라 **질의 자체**가
//    대상이고, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. 그래서
//    "검색해서 고르는" 단계가 아예 없다 — 사람이 쓴 키워드를 그대로 쓴다.
//
// ref 를 만드는 규칙은 전부 lib/review/target-ref.ts 에 있다. 이 라우트는
// 프로젝트·소스 존재 확인과 적재만 한다.

/** 타깃 조회·응답에 공통으로 쓰는 컬럼. */
const TARGET_SELECT =
  'id, project_id, source_key, product_ref, label, cursor, status, last_review_at, last_run_at, total_collected, consecutive_empty, created_at'

// ── 타깃 등록 ────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)

  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const sourceKey = typeof body?.source_key === 'string' ? body.source_key.trim() : ''
  if (!sourceKey) {
    return NextResponse.json({ error: '수집 소스를 선택해주세요.' }, { status: 400 })
  }

  const rawRef = typeof body?.product_ref_raw === 'string' ? body.product_ref_raw : ''

  // 1. 프로젝트가 실제로 있는가. 없는 프로젝트에 타깃을 달면 FK 위반이
  //    500 으로 튀어 "서버 오류"처럼 보인다. 원인을 그대로 말해준다.
  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) {
    console.error('[analyze/targets] project fetch error:', projectError.message)
    return NextResponse.json({ error: '프로젝트 조회에 실패했습니다.' }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 2. 소스가 등록돼 있는가.
  //    ⚠️ review_sources 에 행이 없으면 FK 때문에 타깃을 한 건도 못 넣는다.
  //       마이그레이션을 아직 적용 안 한 상태가 대부분이라, 어떤 소스가
  //       살아 있는지 에러에 같이 실어 준다.
  const { data: sources, error: sourcesError } = await supabase
    .from('review_sources')
    .select('key, display_name, enabled, disabled_reason')

  if (sourcesError) {
    console.error('[analyze/targets] sources fetch error:', sourcesError.message)
    return NextResponse.json({ error: '수집 소스 조회에 실패했습니다.' }, { status: 500 })
  }

  const registered = sources ?? []
  const source = registered.find((s) => s.key === sourceKey)

  if (!source) {
    return NextResponse.json(
      {
        error:
          `등록되지 않은 수집 소스입니다: ${sourceKey}. ` +
          `현재 등록된 소스: ${registered.map((s) => s.key).join(', ') || '(없음 — 마이그레이션 미적용)'}`,
        registered_sources: registered.map((s) => s.key),
      },
      { status: 400 },
    )
  }

  // 사람이 끈 소스에 새 타깃을 붙이면, 수집은 안 되는데 등록은 된 상태가 된다.
  // 나중에 소스를 켜는 순간 아무도 예상 못 한 타깃이 같이 돌기 시작한다.
  if (!source.enabled) {
    return NextResponse.json(
      {
        error: `비활성 상태인 소스입니다: ${sourceKey}. 사유: ${source.disabled_reason ?? '(사유 미기록)'}`,
        disabled_reason: source.disabled_reason ?? null,
      },
      { status: 400 },
    )
  }

  // 3. 소스별 product_ref 해석. 어댑터가 읽을 수 있는 형태로만 저장한다.
  const build = REF_BUILDERS[sourceKey]
  if (!build) {
    // 소스는 DB 에 있는데 이 API 가 그 형식을 모르는 상태다. 조용히 통과시키면
    // 어댑터가 못 읽는 값이 저장되고, 수집이 매일 밤 0건으로 끝난다.
    return NextResponse.json(
      { error: `이 소스의 대상 형식을 아직 지원하지 않습니다: ${sourceKey}` },
      { status: 400 },
    )
  }

  const ref = build(rawRef)
  if (!ref.ok) {
    return NextResponse.json({ error: ref.error }, { status: 400 })
  }

  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : null

  // 4. 등록. status/cursor 는 러너가 처음부터 읽도록 기본값으로 둔다.
  const { data: created, error: insertError } = await supabase
    .from('review_targets')
    .insert({
      project_id: projectId,
      source_key: sourceKey,
      product_ref: ref.productRef,
      label,
      status: 'active',
      cursor: null,
    })
    .select(TARGET_SELECT)
    .single()

  if (insertError) {
    // ⚠️ UNIQUE(project_id, source_key, product_ref) 충돌은 오류가 아니라
    //    **이미 원하는 상태**다. 500 으로 돌려주면 화면이 실패로 보이고,
    //    사람이 같은 버튼을 계속 누르게 된다. 멱등하게 처리한다.
    if (insertError.code === '23505') {
      const { data: existing, error: existingError } = await supabase
        .from('review_targets')
        .select(TARGET_SELECT)
        .eq('project_id', projectId)
        .eq('source_key', sourceKey)
        .eq('product_ref', ref.productRef)
        .single()

      if (existingError || !existing) {
        console.error('[analyze/targets] conflict refetch error:', existingError?.message)
        return NextResponse.json({ error: '이미 등록된 대상인데 조회에 실패했습니다.' }, { status: 500 })
      }

      return NextResponse.json({ created: false, target: existing })
    }

    console.error('[analyze/targets] insert error:', insertError.message)
    return NextResponse.json({ error: '수집 대상 등록에 실패했습니다.' }, { status: 500 })
  }

  console.log(`[analyze/targets] created project=${projectId} source=${sourceKey} ref=${ref.productRef}`)
  return NextResponse.json({ created: true, target: created }, { status: 201 })
}

// ── 프로젝트의 타깃 목록 ─────────────────────────────────────────
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  // 소스 표시명을 같이 읽는다 — 화면에서 'hackernews' 대신 사람이 읽는 이름을 쓴다.
  const { data, error } = await supabase
    .from('review_targets')
    .select(`${TARGET_SELECT}, review_sources ( display_name, enabled, health )`)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[analyze/targets] list error:', error.message)
    return NextResponse.json({ error: '수집 대상 조회에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ targets: data ?? [] })
}
