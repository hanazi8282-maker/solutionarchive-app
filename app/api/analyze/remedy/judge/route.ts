import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withLlmBudget } from '@/lib/analysis/budget'
import { judgeProjectRemedies } from '@/lib/cases/remedy-db'
import { requiredKeyFor, resolveProvider } from '@/lib/analysis/llm'

// 처방 카드 관련성 판정 — POST /api/analyze/remedy/judge  { project_id }
//
// 낱말 겹침으로 걸린 카드를 LLM 이 0/1/2 로 채점해 remedy_verdicts 에 적립한다. 결과 화면(GET /remedy)은
// 이 캐시를 읽기만 하므로 LLM 을 기다리지 않는다. 보통은 extract 끝에서 자동으로 돌고, 이 라우트는
// 이미 분석이 끝난 프로젝트를 다시 판정할 때 쓴다(코퍼스에 사례가 추가된 뒤 등).
//
// 이미 판정이 있고 카드 문장이 그대로면 건너뛴다 — 재호출이 공짜가 되게.
// 판정에 실패한 카드는 NULL(미검증)로 남고, 화면에서 사라지지 않는다(§7.1).

export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const provider = resolveProvider()
  const requiredKey = requiredKeyFor(provider)
  if (requiredKey && !process.env[requiredKey]) {
    console.error(`[analyze/remedy/judge] ${requiredKey} is not set (provider=${provider})`)
    return NextResponse.json({ error: '분석 엔진이 설정되지 않았습니다.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })

  try {
    // extract 와 같은 예산 가드레일 안에서 돈다(lib/analysis/budget.ts).
    const result = await withLlmBudget(() => judgeProjectRemedies(supabase, projectId))
    return NextResponse.json({ provider, ...result })
  } catch (e) {
    console.error('[analyze/remedy/judge] failed:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: '판정에 실패했습니다.' }, { status: 500 })
  }
}
