// POST /api/consult/pay — R9 결제 요청 접수(계좌이체 안내 + 수동 활성화). 입금 확인과 활성화는 남헌이 /consult/admin 에서 한다.
// action=request(입금자명) | cancel(해지 요청 표시 — 실제 종료는 운영진).
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { db } from '@/lib/consult/runs'
import { PLAN, cleanDepositor } from '@/lib/consult/period'

export async function POST(req: NextRequest) {
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const form = await req.formData()
  const runRaw = String(form.get('run') ?? '')
  const run = /^[0-9a-f-]{36}$/i.test(runRaw) ? runRaw : null
  const back = (q: string) => NextResponse.redirect(new URL(`/consult/pay?${run ? `run=${run}&` : ''}${q}`, req.url), 303)
  const sb = await db()

  if (form.get('action') === 'cancel') {
    const { error } = await sb.from('consult_payment_requests')
      .update({ note: `해지 요청 ${new Date().toISOString().slice(0, 10)}` })
      .eq('owner_email', auth.email).eq('status', 'active')
    return back(error ? 'error=db' : 'cancelled=1')
  }

  let depositor: string
  try { depositor = cleanDepositor(form.get('depositor')) } catch { return back('error=name') }
  const { data: open } = await sb.from('consult_payment_requests').select('id').eq('owner_email', auth.email).in('status', ['requested', 'active']).limit(1)
  if (open && open.length > 0) return back('error=open')
  const { error } = await sb.from('consult_payment_requests').insert({
    owner_email: auth.email, run_id: run, plan: PLAN.id, amount_krw: PLAN.amount_krw, depositor_name: depositor,
  })
  return back(error ? 'error=db' : 'requested=1')
}
