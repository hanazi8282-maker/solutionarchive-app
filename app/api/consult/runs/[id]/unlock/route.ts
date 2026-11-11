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
  let nums
  try {
    nums = parseUserNumbers(Object.fromEntries(form.entries()))
  } catch {
    return to('?error=nums')
  }
  try {
    await unlockLayer1(run, nums)
  } catch (e) {
    return to(`?error=${encodeURIComponent(e instanceof Error && e.message === 'no_layer0' ? 'nol0' : 'l1')}`)
  }
  return to()
}
