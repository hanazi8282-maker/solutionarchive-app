// POST /d/optout — 수신 거부 접수(v71cq §2-2). 공개 경로(/d 접두사). 주소와 이유만 받는다.
import { NextResponse, type NextRequest } from 'next/server'
import { addOptout, parseOptout } from '@/lib/consult/optout'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const p = parseOptout({ email: form.get('email'), reason: form.get('reason'), website: form.get('website') })
  const to = (q: string) => NextResponse.redirect(new URL(`/unsubscribe?${q}`, req.url), 303)
  if (!p.ok) return p.code === 'bot' ? to('done=1') : to('error=email')
  try { await addOptout(p.email, p.reason) } catch (e) { console.error('[optout] failed:', e instanceof Error ? e.message : e); return to('error=fail') }
  return to('done=1')
}
