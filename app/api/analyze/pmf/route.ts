import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runPmfAssessment } from '@/lib/cases/pmf-run'

// PMF 2축 진단 실행 — POST /api/analyze/pmf { project_id }
//
// 전에는 CLI(scripts/pmf-assess.mjs)로만 돌았다. 산식·저장 형태는 lib/cases/pmf-run.ts 한 벌이고
// 여기서는 HTTP 로만 감싼다.
//
// 상태 코드가 세 사건을 가른다(§7.1):
//   400 진단 입력이 없다      — 사용자가 채워야 한다. 추정해서 돌리지 않는다.
//   404 프로젝트가 없다
//   500 조회·저장이 실패했다  — "선례 0건" 으로 접지 않는다
//   200 진단이 돌았다         — match_status 가 matched / no_match / not_run 을 그대로 말한다

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })

  const result = await runPmfAssessment(supabase, projectId, 'app')

  if (!result.ok) {
    const status = result.kind === 'missing_input' ? 400 : result.kind === 'not_found' ? 404 : 500
    return NextResponse.json(
      {
        error: result.kind === 'missing_input'
          ? `${result.reason} (필요: ${(result.missing ?? []).join(', ')})`
          : result.reason,
        ...(result.missing ? { missing: result.missing } : {}),
      },
      { status },
    )
  }

  return NextResponse.json({
    assessment: result.assessment,
    match: result.match,
    demand: result.demand,
    precedent: result.precedent,
    quadrant: result.quadrant,
    advice: result.advice,
    linked_moves: result.linked_moves,
  })
}
