// POST /auth/login — Google OAuth 시작. /login 화면의 폼이 부른다.
// PKCE code verifier 는 세션 클라이언트가 쿠키에 쓰고, 콜백(/auth/callback)이 그걸로 코드를 교환한다.

import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/auth/session'
import { safeNext } from '@/lib/auth/policy'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const next = safeNext(String(form.get('next') ?? ''))
  const back = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}&next=${encodeURIComponent(next)}`, req.url), 303)

  const sb = await createSessionClient()
  if (!sb) return back('start')

  // redirectTo 는 Supabase 대시보드 Redirect URLs 에 있어야 한다. 없으면 Supabase 가 Site URL 로 보낸다
  // (preview 에서 로그인했는데 운영으로 튕기는 증상).
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${req.nextUrl.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error || !data.url) {
    console.error(`[auth] signInWithOAuth failed: ${error?.message ?? 'no url'}`)
    return back('start')
  }
  return NextResponse.redirect(data.url, 303)
}
