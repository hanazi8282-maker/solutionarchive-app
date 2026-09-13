// GET /auth/callback — Supabase 가 Google 인가 뒤 ?code= 를 붙여 돌려보내는 곳.
// 코드 → 세션 쿠키 교환만 한다. 허용 목록 판정은 다음 요청에서 proxy 가 한다(여기서 통과시키지 않는다).

import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/auth/session'
import { safeNext } from '@/lib/auth/policy'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = safeNext(req.nextUrl.searchParams.get('next'))
  const fail = () => NextResponse.redirect(new URL(`/login?error=callback&next=${encodeURIComponent(next)}`, req.url))

  // 사용자가 Google 화면에서 취소하면 code 없이 error= 로 돌아온다.
  if (!code) return fail()
  const sb = await createSessionClient()
  if (!sb) return fail()

  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) {
    console.error(`[auth] exchangeCodeForSession failed: ${error.name}(${error.status ?? '-'}) ${error.message}`)
    return fail()
  }
  return NextResponse.redirect(new URL(next, req.url))
}
