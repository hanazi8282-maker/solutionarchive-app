import { createClient } from '@/lib/supabase/server'
import { NextResponse, after } from 'next/server'
import { requiredKeyFor, resolveProvider } from '@/lib/analysis/llm'
import { withLlmBudget } from '@/lib/analysis/budget'
import { REANALYZABLE } from '@/lib/analysis/extract-gate'
import { claimExtraction, runExtraction } from '@/lib/analysis/extract-run'

// 응답은 202 로 즉시 나가지만, after() 안의 추출 작업은 같은 인스턴스에서
// 계속 돌기 때문에 함수 실행시간 상한이 그대로 적용된다. 긴 입력을 감당하려면
// 여유가 필요하므로 Fluid compute 상한까지 올린다.
export const maxDuration = 300

// ★ 2026-09-20: 프롬프트·잠금·추출 본체는 `lib/analysis/extract-run.ts` 로 옮겼다.
//   `scripts/analyze-extract-run.mjs`(운영자 CLI)가 같은 한 벌을 쓴다 — 로그인 벽 뒤의
//   이 라우트를 세션 없이 부를 방법이 없어서다. 여기는 HTTP 껍데기만 남긴다.
//   LLM 프로바이더 전환(gemini/anthropic/mock)·재시도·Gemini 모델 폴백은 lib/analysis/llm.ts 가 전담한다.

// ── POST: 잡 시작만 하고 즉시 반환 ───────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const provider = resolveProvider()
  // mock 은 키가 필요 없으므로 requiredKey 가 null 이다.
  const requiredKey = requiredKeyFor(provider)
  if (requiredKey && !process.env[requiredKey]) {
    console.error(`[analyze/extract] ${requiredKey} is not set (provider=${provider})`)
    return NextResponse.json({ error: '분석 엔진이 설정되지 않았습니다.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  // 재분석 플래그. 이미 extracted 인 프로젝트를 다시 돌릴 때만 의미가 있다.
  const force = body?.force === true

  // 1~4. 상태 조회 → 시작 가능 판정 → 원문 확인 → 조건부 UPDATE 잠금 (extract-run.ts)
  const claim = await claimExtraction(supabase, projectId, force)
  if (!claim.ok) {
    return NextResponse.json(
      claim.projectStatus !== undefined ? { error: claim.error, status: claim.projectStatus } : { error: claim.error },
      { status: claim.httpStatus },
    )
  }

  // 5. 응답을 먼저 보내고, 실제 추출은 그 뒤에 이어서 실행한다.
  // withLlmBudget — 이 추출 1건이 쓸 수 있는 LLM 비용 상한을 건다(진단 1-3, lib/analysis/budget.ts).
  after(() => withLlmBudget(() => runExtraction(supabase, projectId, provider)))

  return NextResponse.json(
    {
      status: 'processing',
      project_id: projectId,
      provider,
      started_at: claim.startedAt,
      attempts: claim.attempts,
      // 재분석이면 기존 aspects 가 교체된다는 사실을 호출자가 알 수 있게 한다.
      reanalysis: claim.isReanalysis,
    },
    { status: 202 },
  )
}

// ── GET: 폴링용 상태 조회 ────────────────────────────────────────
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const { data: project, error } = await supabase
    .from('analysis_projects')
    .select('id, status, maturity_stage, extract_started_at, extract_finished_at, extract_error, extract_attempts')
    .eq('id', projectId)
    .single()

  if (error || !project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (project.status === 'processing') {
    const t = project.extract_started_at ? Date.parse(project.extract_started_at) : NaN
    return NextResponse.json({
      status: 'processing',
      started_at: project.extract_started_at,
      elapsed_ms: Number.isFinite(t) ? Date.now() - t : null,
      attempts: project.extract_attempts,
    })
  }

  if (project.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      error: project.extract_error ?? '알 수 없는 오류로 실패했습니다.',
      attempts: project.extract_attempts,
    })
  }

  // extracted 이후 단계(reviewed 등)도 완료로 본다.
  const { count, error: countError } = await supabase
    .from('analysis_aspects')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  // 조회 실패를 "속성 0개"로 접지 않는다(§7.1). 전에는 `count ?? 0` 이라 실패가 화면에
  // "분석 완료 — 속성 0개" 로 갔다. 폴링 쪽(review/page.tsx)은 !ok 면 error 를 그대로 보여준다.
  if (countError || count == null) {
    console.error('[analyze/extract] aspects count error:', countError?.message ?? 'count is null')
    return NextResponse.json({ error: '속성 수를 확인하지 못했습니다 — 0개라는 뜻이 아닙니다. 새로고침해 다시 확인하세요.' }, { status: 500 })
  }

  return NextResponse.json({
    status: project.status,
    aspects_count: count,
    maturity_stage: project.maturity_stage,
    finished_at: project.extract_finished_at,
    attempts: project.extract_attempts,
    // 이 상태에서 POST { force: true } 로 재분석을 시작할 수 있는지.
    // (재분석하면 기존 aspects 는 삭제되고 새로 저장된다)
    can_reanalyze: REANALYZABLE.includes(project.status),
  })
}
