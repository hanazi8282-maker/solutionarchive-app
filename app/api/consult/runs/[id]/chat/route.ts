// POST /api/consult/runs/<id>/chat — R7 에이전트 대화 1턴(유료). 도구 호출은 서버가 실행한다.
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun } from '@/lib/consult/runs'
import { hasPaidAccess } from '@/lib/consult/entitlement'
import { chatTurn } from '@/lib/consult/agent'

export const maxDuration = 120

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const run = await getRun(id, auth.email)
  if (!run) return NextResponse.json({ error: '진단을 찾을 수 없습니다.' }, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/consult/run/${id}${q}#chat`, req.url), 303)

  let paid: boolean
  try { paid = await hasPaidAccess(auth.email) } catch { return NextResponse.json({ error: '구독 상태를 확인하지 못했습니다.' }, { status: 503 }) }
  if (!paid) return NextResponse.redirect(new URL(`/consult/pay?run=${id}`, req.url), 303)

  const text = String((await req.formData()).get('message') ?? '').trim()
  if (text.length < 2) return to('?error=msg')
  try {
    await chatTurn(run, text)
  } catch {
    return to('?error=chat')
  }
  return to()
}
