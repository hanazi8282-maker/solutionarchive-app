// Next 16 의 proxy(구 middleware). 사람 화면·API 를 로그인 + 허용 목록으로 막는다.
//
// 기본은 잠김이다: lib/auth/policy.ts 의 공개 경로(로그인·콜백·익명 퀴즈·크론/웹훅) 말고는 전부 검사한다.
// 공개 경로는 Supabase 를 부르기 전에 통과시킨다 — 크론이 인증 서버 장애에 끌려가지 않게.
//
// 이게 유일한 방어가 아니다. DB 에 쓰는 서버 액션은 lib/auth/session.ts requireAllowedUser 를 따로 부른다.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { denyStatus, isPublicPath, resolveAuth, verdictMessage } from './lib/auth/policy'

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  // @supabase/ssr 규약: 토큰이 갱신되면 요청과 응답 양쪽에 새 쿠키를 쓴다.
  let res = NextResponse.next({ request: req })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = url && key
    ? createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list, headers) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
          Object.entries(headers ?? {}).forEach(([k, v]) => res.headers.set(k, v))
        },
      },
    })
    : null

  // ponytail: 요청마다 Supabase Auth 에 getUser 1회(네트워크). 내부 도구 트래픽이라 둔다 —
  //   느려지면 비대칭 JWT 서명키 + getClaims()(로컬 검증)로 바꾼다.
  const verdict = await resolveAuth(process.env.AUTH_ALLOWED_EMAILS, sb && (() => sb.auth.getUser()))
  if (verdict.kind === 'allowed') return res
  if (verdict.kind === 'unavailable') console.error(`[auth] proxy session check unavailable: ${verdict.detail}`)

  // 화면 이동은 /login 으로 보낸다. 로그인 화면이 같은 판정을 다시 해서 사유(로그인 필요 /
  // 허용 목록 밖 / 목록 미설정 / 확인 불가)를 그대로 보여준다. API·폼 POST 는 리디렉트 대신 상태 코드.
  const isPageView = !pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD')
  const deny = isPageView
    ? NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, req.url))
    : NextResponse.json({ error: verdictMessage(verdict) }, { status: denyStatus(verdict) })
  res.cookies.getAll().forEach((c) => deny.cookies.set(c))
  return deny
}

export const config = {
  // 정적 자산만 뺀다. 경로별 공개 여부는 matcher 가 아니라 isPublicPath 가 정한다(셀프테스트 대상).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
