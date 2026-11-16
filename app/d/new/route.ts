// POST /d/new — 로그인 없는 무료 초안 신청(v71co 개정 §2-2). 접수만 하고 생성은 열람 화면이 시작한다(/d/<token>/generate).
// 공개 경로(lib/auth/policy.ts PUBLIC_PREFIXES '/d'). 남용 방어: 숨김 칸 · 하루 전체 상한 · IP 해시당 상한 · 비용 상한 · 같은 메일·주소 24시간 재사용.
import { NextResponse, type NextRequest } from 'next/server'
import { createLead, hashIp, leadCounts, parseLeadForm, LEAD_DAILY_CAP, LEAD_IP_DAILY } from '@/lib/consult/leads'
import { capExceeded } from '@/lib/consult/usage'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const back = (e: string) => NextResponse.redirect(new URL(`/?error=${e}#start`, req.url), 303)
  const p = parseLeadForm({ url: form.get('url'), email: form.get('email'), consent: form.get('consent'), website: form.get('website'), v: form.get('v') })
  if (!p.ok) return p.code === 'bot' ? NextResponse.redirect(new URL('/', req.url), 303) : back(p.code)
  const ip = hashIp((req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown')
  try {
    const n = await leadCounts(ip)
    if (n.today >= LEAD_DAILY_CAP) return back('cap')
    if (n.ip >= LEAD_IP_DAILY) return back('ip')
    if (await capExceeded()) return back('cap')
    const { token } = await createLead({ email: p.email, url: p.url, variant: p.variant, ipHash: ip })
    return NextResponse.redirect(new URL(`/d/${token}`, req.url), 303)
  } catch (e) {
    console.error('[lead] create failed:', e instanceof Error ? e.message : e)
    return back('fail')
  }
}
