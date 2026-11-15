// POST /api/consult/modes — 모드 B(결정 검증)·C1(아이디어 검증)·C2(새 아이디어 추천) 접수 → 생성 → /consult/m/<id>.
// 로그인한 누구나(허용 목록 아님): proxy 가 막고, 여기서도 requireConsultUser 를 맨 앞에서 부른다. CONSULT_MODES=off 면 404.
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { modesEnabled, runMode, type ModeInput } from '@/lib/consult/modes'
import { bypassCapExceeded, capExceeded } from '@/lib/consult/usage'

export const maxDuration = 300

const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? '').trim().slice(0, n)

export async function POST(req: NextRequest) {
  if (!modesEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })
  const form = await req.formData()
  const mode = String(form.get('mode') ?? '')
  const back = (e: string) => NextResponse.redirect(new URL(`/consult/start?error=${e}&mode=${mode}`, req.url), 303)

  let input: ModeInput
  if (mode === 'b') {
    const company = clip(form.get('company'), 80), decision = clip(form.get('decision'), 400), context = clip(form.get('context'), 1500)
    if (company.length < 2 || decision.length < 10) return back('b_input')
    input = { mode: 'b', company, decision, context: context || '(추가 설명 없음)' }
  } else if (mode === 'c1') {
    const idea = clip(form.get('idea'), 600), conditions = clip(form.get('conditions'), 600), extra = clip(form.get('extra'), 600)
    if (idea.length < 10 || conditions.length < 5) return back('c1_input')
    input = { mode: 'c1', idea, conditions, extra: extra || undefined }
  } else if (mode === 'c2') {
    const tech = clip(form.get('tech'), 40), capital = clip(form.get('capital'), 80), hours = clip(form.get('hours'), 80), access = clip(form.get('access'), 200), interests = clip(form.get('interests'), 200)
    if (!tech || !capital || !hours || access.length < 2) return back('c2_input')
    input = { mode: 'c2', tech, capital, hours, access, interests: interests || undefined }
  } else {
    return back('mode')
  }

  if (await capExceeded()) return back('cap')
  if (await bypassCapExceeded(process.env.CONSULT_AUTH_DISABLED, process.env.CONSULT_AUTH_DISABLED_UNTIL)) return back('cap')
  try {
    const id = await runMode(auth.email, input)
    return NextResponse.redirect(new URL(`/consult/m/${id}`, req.url), 303)
  } catch {
    return back('failed')
  }
}
