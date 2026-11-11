// POST /api/consult/runs/<id>/memo — R6 결정 메모(유료). 활성 구독 또는 운영진만. 1층이 먼저 있어야 한다.
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun } from '@/lib/consult/runs'
import { hasPaidAccess } from '@/lib/consult/entitlement'
import { generateMemo } from '@/lib/consult/pipeline'

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const run = await getRun(id, auth.email)
  if (!run) return NextResponse.json({ error: '진단을 찾을 수 없습니다.' }, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/consult/run/${id}${q}`, req.url), 303)

  let paid: boolean
  try {
    paid = await hasPaidAccess(auth.email)
  } catch {
    return NextResponse.json({ error: '구독 상태를 확인하지 못했습니다.' }, { status: 503 }) // 확인 못 한 것을 무료로 접지 않는다
  }
  if (!paid) return NextResponse.redirect(new URL(`/consult/pay?run=${id}`, req.url), 303)

  try {
    await generateMemo(run)
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    return to(`?error=${m === 'no_layer1' ? 'nol1' : m === 'cost_cap' ? 'cap' : 'memo'}`)
  }
  return to()
}
