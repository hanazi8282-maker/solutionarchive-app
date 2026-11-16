// POST /d/<token>/pay-request — 유료본 결제 요청 접수(v71cq §3). 접수까지만: 입금 확인과 활성화는 남헌이 /consult/admin 에서 한다.
import { NextResponse, type NextRequest } from 'next/server'
import { getLead, TOKEN_RE } from '@/lib/consult/leads'
import { priceOf, requestLeadPayment } from '@/lib/consult/lead-pay'

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!TOKEN_RE.test(token)) return new NextResponse(null, { status: 404 })
  const form = await req.formData()
  const p = String(form.get('p') ?? '') === '99' ? '99' : '49'
  const to = (q: string) => NextResponse.redirect(new URL(`/d/${token}/paid?p=${p}&${q}`, req.url), 303)
  const lead = await getLead(token)
  if (!lead) return new NextResponse(null, { status: 404 })
  const r = await requestLeadPayment(lead, priceOf(p), form.get('depositor'))
  return to(r === 'ok' ? 'requested=1' : `error=${r}`)
}
