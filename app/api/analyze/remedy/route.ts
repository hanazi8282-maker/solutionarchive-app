import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildProjectRemedies, loadVerdicts } from '@/lib/cases/remedy-db'
import { applyGate } from '@/lib/cases/remedy-gate'

// 문제 해결 제안 — 조회 전용. GET /api/analyze/remedy?project_id=<uuid>
//
// 페인 속성(판정 "여기를 민다"·"지켜본다")마다 보완 선례·실패 사례·원칙을 조립한다.
// 조립은 lib/cases/remedy.ts(순수), 조회는 lib/cases/remedy-db.ts, 거르기는 lib/cases/remedy-gate.ts 다.
//
// ★ 여기서 LLM 을 부르지 않는다. 판정은 extract 직후·`POST /api/analyze/remedy/judge` 가 미리 돌려
//   remedy_verdicts 에 적립해 둔 것을 읽기만 한다 — 결과 화면이 LLM 을 기다리면 안 된다.
// ★ 판정이 없는 카드는 숨기지 않고 "미검증" 으로 내보낸다. 확인 불가를 관련 없음으로 접지 않는다(§7.1).

export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })

  const remedies = await buildProjectRemedies(supabase, projectId, 'analyze/remedy')
  if (!remedies) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })

  const verdicts = await loadVerdicts(supabase, 'analyze/remedy', remedies.cards.map((c) => c.aspect_id))

  return NextResponse.json({
    project_id: projectId,
    // 판정 캐시 조회 자체가 실패하면 빈 배열로 넘긴다 = 전부 미검증. 카드가 사라지지는 않는다.
    remedies: applyGate(remedies, verdicts ?? []),
  })
}
