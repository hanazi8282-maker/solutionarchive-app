// POST /consult/auth/otp — 이메일 로그인 링크(보조 경로, Google OAuth 가 막힐 때의 대체). 허용 목록과 무관.
// 콜백은 기존 /auth/callback(PKCE code 교환)을 그대로 쓴다. 링크는 요청한 브라우저에서 열어야 한다(verifier 쿠키).
import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/auth/session'
import { safeNext } from '@/lib/auth/policy'

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const next = safeNext(String(form.get('next') ?? '/consult/new'))
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const back = (q: string) => NextResponse.redirect(new URL(`/consult/login?${q}&next=${encodeURIComponent(next)}`, req.url), 303)
  if (!EMAIL.test(email) || email.length > 254) return back('error=email')
  const sb = await createSessionClient()
  if (!sb) return back('error=otp')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${req.nextUrl.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  })
  if (error) { console.error(`[consult-auth] signInWithOtp failed: ${error.status ?? '-'} ${error.message}`); return back('error=otp') }
  return back('sent=1')
}
