// POST /d/<token>/situation/save — 유료 상황 질문 답 저장(v71cq §4). 입금 확인(활성) 뒤에만, 한 번만. 유료본 생성 연결은 꼬리표가 찰 때까지 보류 — 답만 쌓는다.
import { NextResponse, type NextRequest } from 'next/server'
import { getLead, TOKEN_RE } from '@/lib/consult/leads'
import { isLeadPaid, saveSituationAnswers } from '@/lib/consult/lead-pay'
import { parseSituation } from '@/lib/consult/situation'

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!TOKEN_RE.test(token)) return new NextResponse(null, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/d/${token}/situation${q}`, req.url), 303)
  const lead = await getLead(token)
  if (!lead) return new NextResponse(null, { status: 404 })
  if (!(await isLeadPaid(lead.id))) return to() // 입금 확인 전에는 저장하지 않는다(화면이 잠김 안내를 보여 준다)
  const form = await req.formData()
  const r = parseSituation((k) => form.getAll(k).map(String))
  if (!r.ok) return to(`?error=${r.missing}`)
  await saveSituationAnswers(token, r.answers)
  return to()
}
