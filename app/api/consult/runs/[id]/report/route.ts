// POST /api/consult/runs/<id>/report — R11 결론서 조립. preset: free(1장, 누구나) · paid(1+2장, 구독/운영진) · cold(전 장, 운영진 전용 — 콜드메일 동봉용).
// 결과는 공개 읽기 전용 출구 /r/{token} 으로 간다. 발송은 하지 않는다(사람이 한다).
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun } from '@/lib/consult/runs'
import { hasPaidAccess, isStaff } from '@/lib/consult/entitlement'
import { composeReport, type Preset } from '@/lib/consult/report/compose'

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const run = await getRun(id, auth.email)
  if (!run) return NextResponse.json({ error: '진단을 찾을 수 없습니다.' }, { status: 404 })
  const back = (q: string) => NextResponse.redirect(new URL(`/consult/run/${id}?${q}`, req.url), 303)

  const raw = String((await req.formData()).get('preset') ?? 'free')
  const preset: Preset = raw === 'cold' ? 'cold' : raw === 'paid' ? 'paid' : 'free'
  if (preset === 'cold' && !isStaff(auth.email)) return NextResponse.json({ error: '운영진 전용입니다.' }, { status: 403 })
  if (preset === 'paid') {
    let ok: boolean
    try { ok = await hasPaidAccess(auth.email) } catch { return NextResponse.json({ error: '구독 상태를 확인하지 못했습니다.' }, { status: 503 }) }
    if (!ok) return NextResponse.redirect(new URL(`/consult/pay?run=${id}`, req.url), 303)
  }
  try {
    const { token } = await composeReport(run, preset, auth.email)
    return NextResponse.redirect(new URL(`/r/${token}`, req.url), 303)
  } catch (e) {
    return back(`error=${e instanceof Error && e.message === 'no_layer1' ? 'nol1' : 'report'}`)
  }
}
