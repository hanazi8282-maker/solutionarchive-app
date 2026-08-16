import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// TODO: Google SSO 완성 후 사용자 세션 기반으로 교체
// 현재: service_role key로 RLS 우회 (인증 전 개발 단계)
// 변경 후: createServerClient(@supabase/ssr) + 쿠키 세션으로 RLS 적용
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
