// 컨설팅 외부 사용자 세션 — 허용 목록 없이 "세션 이메일이 있나"만 본다(lib/auth/policy.ts resolveConsultUser).
// proxy.ts 가 /consult/* · /api/consult/* 를 막지만 그것만 믿지 않는다 — DB 에 쓰는 핸들러는 이걸 맨 앞에서 부른다.
import { cache } from 'react'
import { createSessionClient } from '@/lib/auth/session'
import { resolveConsultUser } from '@/lib/auth/policy'

export const getConsultUser = cache(async () => {
  const sb = await createSessionClient()
  return resolveConsultUser(sb && (() => sb.auth.getUser()), {
    disabledRaw: process.env.CONSULT_AUTH_DISABLED,
    untilRaw: process.env.CONSULT_AUTH_DISABLED_UNTIL,
  })
})

/** 서버 핸들러·페이지 맨 앞. 통과하면 owner_email, 아니면 사유. */
export async function requireConsultUser(): Promise<{ ok: true; email: string } | { ok: false; status: 401 | 503; message: string }> {
  const u = await getConsultUser()
  if (u.kind === 'ok') return { ok: true, email: u.email }
  return u.kind === 'anonymous'
    ? { ok: false, status: 401, message: '로그인이 필요합니다.' }
    : { ok: false, status: 503, message: '인증 확인 불가 — 로그인 상태를 확인하지 못했습니다.' }
}
