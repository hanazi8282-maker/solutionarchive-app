// POST /api/consult/runs/<id>/measure — R8 측정카드(유료). ROI 모드는 target·due 를 폼에서 받고, 몰랐던 사실 모드는 입력 없이 만든다.
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun } from '@/lib/consult/runs'
import { hasPaidAccess } from '@/lib/consult/entitlement'
import { createMeasureCard } from '@/lib/consult/measure'

export const maxDuration = 120

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const run = await getRun(id, auth.email)
  if (!run) return NextResponse.json({ error: '진단을 찾을 수 없습니다.' }, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/consult/run/${id}${q}#measure`, req.url), 303)

  let paid: boolean
  try { paid = await hasPaidAccess(auth.email) } catch { return NextResponse.json({ error: '구독 상태를 확인하지 못했습니다.' }, { status: 503 }) }
  if (!paid) return NextResponse.redirect(new URL(`/consult/pay?run=${id}`, req.url), 303)

  const form = await req.formData()
  try {
    await createMeasureCard(run, { target: form.get('target'), due: form.get('due') })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    return to(`?error=${m === 'no_layer0' ? 'nol0' : m.startsWith('목표') || m.startsWith('점검일') ? 'target' : 'measure'}`)
  }
  return to()
}
