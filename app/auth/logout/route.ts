// POST /auth/logout — 상단 네비·로그인 화면의 로그아웃 버튼.

import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createSessionClient } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const sb = await createSessionClient()
  const res = sb ? await sb.auth.signOut({ scope: 'local' }) : null

  // signOut 은 Supabase 가 응답하지 않으면 로컬 세션도 안 지운다. 로그아웃 버튼이 조용히 아무 일도
  // 안 하면 안 되므로, 서버 쪽 토큰 폐기와 별개로 세션 쿠키(sb-*)는 여기서 무조건 지운다.
  const store = await cookies()
  store.getAll().filter((c) => c.name.startsWith('sb-')).forEach((c) => store.delete(c.name))
  if (res?.error) console.error(`[auth] signOut failed (cookies cleared anyway): ${res.error.message}`)

  return NextResponse.redirect(new URL('/login', req.url), 303)
}
