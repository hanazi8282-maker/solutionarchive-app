// POST /api/consult/runs/<id>/unlock — R4 1층 해금: 대표님 숫자 3개를 받아 ⓐ~ⓓ 를 만든다. 0층이 먼저 있어야 한다.
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun } from '@/lib/consult/runs'
import { unlockLayer1 } from '@/lib/consult/pipeline'
import { parseUserNumbers } from '@/lib/consult/report/ch1-l1-validate'

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const run = await getRun(id, auth.email)
  if (!run) return NextResponse.json({ error: '진단을 찾을 수 없습니다.' }, { status: 404 })
  const to = (q = '') => NextResponse.redirect(new URL(`/consult/run/${id}${q}`, req.url), 303)

  const form = await req.formData()
  const entries = Object.fromEntries(form.entries())
  // 2026-11-13 지시 §2-6: 아이디어형엔 "현재 전환율"이 없다(출시 전) — 화면에서 안 받고 100으로 고정해
  // sensitivityTable 의 "접근 가능한 잠재 고객 수 × 지불 의사 × 도입률 10/20/30%" 해석을 그대로 쓴다.
  if (run.kind === 'idea' && !entries.rate_pct) entries.rate_pct = '100'
  let nums
  try {
    nums = parseUserNumbers(entries)
  } catch {
    return to('?error=nums')
  }
  const altMeans = run.kind === 'idea' ? String(form.get('alt_means') ?? '').trim().slice(0, 300) || undefined : undefined
  try {
    await unlockLayer1(run, nums, altMeans)
  } catch (e) {
    return to(`?error=${encodeURIComponent(e instanceof Error && e.message === 'no_layer0' ? 'nol0' : 'l1')}`)
  }
  return to()
}
