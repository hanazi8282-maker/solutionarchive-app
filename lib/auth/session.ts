// 서버 전용 인증 헬퍼 — 서버 컴포넌트·서버 액션·라우트 핸들러가 쓴다. proxy.ts 는 요청 쿠키를
// 직접 다뤄야 해서 따로 만든다(판정 로직은 둘 다 ./policy.ts 한 벌).
//
// ⚠️ 이건 "누가 들어왔나"만 가린다. DB 쿼리는 여전히 lib/supabase/server.ts 의 service_role 이다
//    (RLS 우회). 세션 기반 RLS 는 RBAC 단계에서 — policy.ts 의 ponytail 주석.

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { guardFromVerdict, resolveAuth, type AuthVerdict, type GuardResult } from './policy'

/** 쿠키 세션을 읽는 anon 키 클라이언트. 공개 env 가 없으면 null(= 확인 불가로 판정된다). */
export async function createSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const store = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // 서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없다. 토큰 갱신은 proxy.ts 가 응답에 쓴다.
        }
      },
    },
  })
}

/** 요청당 한 번만 Supabase 에 묻는다(레이아웃·페이지·액션이 같은 렌더에서 부르면 재사용). */
export const getAuthVerdict = cache(async (): Promise<AuthVerdict> => {
  const sb = await createSessionClient()
  const verdict = await resolveAuth(process.env.AUTH_ALLOWED_EMAILS, sb && (() => sb.auth.getUser()))
  if (verdict.kind === 'unavailable') console.error(`[auth] session check unavailable: ${verdict.detail}`)
  return verdict
})

/**
 * DB 에 쓰는 서버 액션 맨 앞에서 부른다. proxy 만 믿지 않는다 — 서버 액션은 자기가 붙은
 * 라우트로 가는 POST 라, matcher 가 바뀌거나 액션이 다른 라우트로 옮겨지면 조용히 보호가 빠진다.
 *
 *   const auth = await requireAllowedUser()
 *   if (!auth.ok) return { ok: false, message: auth.message }
 *
 * scripts/auth-selftest.mjs 가 'use server' 파일의 모든 export 가 이걸 부르는지 검사한다.
 */
export async function requireAllowedUser(): Promise<GuardResult> {
  return guardFromVerdict(await getAuthVerdict())
}
