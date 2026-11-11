// POST /api/consult/runs/<id>/diagnose — R3 0층 무료 진단(= 결론서 1장). 이미 만든 진단이 있으면 다시 부르지 않는다(비용).
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun } from '@/lib/consult/runs'
import { diagnoseLayer0 } from '@/lib/consult/pipeline'

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const run = await getRun(id, auth.email)
  if (!run) return NextResponse.json({ error: '진단을 찾을 수 없습니다.' }, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/consult/run/${id}${q}`, req.url), 303)

  if (run.status === 'diagnosing') return to('?busy=1')
  try {
    await diagnoseLayer0(run)
  } catch {
    // 사유는 run.error 에 저장됐다 — 화면이 보여 준다.
  }
  return to()
}
