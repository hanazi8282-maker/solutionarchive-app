// POST /api/consult/runs — R1 입력 접수 + R2 E0 수집. 폼 POST 를 받아 run 을 만들고 수집한 뒤 /consult/run/<id> 로 보낸다.
// 로그인한 누구나(허용 목록 아님): proxy 가 막고, 여기서도 requireConsultUser 를 맨 앞에서 부른다.
import { NextResponse, type NextRequest } from 'next/server'
import { requireConsultUser } from '@/lib/consult/session'
import { normalizeCompanyUrl } from '@/lib/consult/url'
import { collectAndStore } from '@/lib/consult/pipeline'
import { createRun, setStatus } from '@/lib/consult/runs'
import { capExceeded } from '@/lib/consult/usage'

export const maxDuration = 60

const clip = (v: FormDataEntryValue | null, n: number) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, n) : null
}

export async function POST(req: NextRequest) {
  const auth = await requireConsultUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const form = await req.formData()
  const kind = form.get('kind') === 'idea' ? 'idea' : 'company'
  const rawUrl = clip(form.get('url'), 300)
  const oneLiner = clip(form.get('one_liner'), 600)
  const name = clip(form.get('name'), 80)
  const back = (e: string) => NextResponse.redirect(new URL(`/consult/new?error=${e}`, req.url), 303)

  if (!oneLiner || oneLiner.length < 10) return back('liner')
  const url = rawUrl ? normalizeCompanyUrl(rawUrl) : null
  if (rawUrl && !url) return back('url')
  if (kind === 'company' && !url) return back('url')

  if (await capExceeded()) return back('cap')
  const run = await createRun(auth.email, { kind, name, url: url?.href ?? null, oneLiner })
  try {
    await collectAndStore(run)
  } catch (e) {
    await setStatus(run.id, 'failed', e instanceof Error ? e.message.slice(0, 300) : 'collect failed')
  }
  return NextResponse.redirect(new URL(`/consult/run/${run.id}`, req.url), 303)
}
