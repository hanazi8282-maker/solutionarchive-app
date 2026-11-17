// POST /d/<token>/complete — 완성본 입력(숫자 3개 + 고르기 3개) 접수 → 완성본 생성 → 결과 화면. 한 열람 주소당 한 번(실패 때만 다시).
import { NextResponse, type NextRequest } from 'next/server'
import { generateCompletion, getLead, parseCompletion, saveCompletion, TOKEN_RE } from '@/lib/consult/leads'

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!TOKEN_RE.test(token)) return new NextResponse(null, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/d/${token}/numbers${q}`, req.url), 303)
  const lead = await getLead(token)
  if (!lead || lead.status !== 'ready') return to()
  const form = await req.formData()
  const p = parseCompletion({
    visits: form.get('visits'), signups: form.get('signups'), paid: form.get('paid'),
    source: form.get('source'), pain: form.get('pain'), tried: form.getAll('tried'),
  })
  if (!p.ok) return to(`?error=${p.code}`)
  const saved = await saveCompletion(token, p.c)
  if (saved) await generateCompletion(saved, p.c)
  return to()
}
