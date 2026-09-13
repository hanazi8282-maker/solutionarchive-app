import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// 504 재시도 대기. 2026-09-12~13 크론 로그의 Gateway Timeout 은 매시 :00:3x / :30:0x
// 몇 초 창에만 몰렸고, 같은 실행 안에서도 앞 쿼리는 통과하고 뒤 쿼리만 걸렸다.
// 창을 벗어날 만큼만 기다린다.
// 이건 증상 완화다. 원인(iad1→서울 경로) 대응은 Threads 라우트 icn1 이동 —
// 근거 수치는 app/api/threads/collect-metrics/route.ts 의 🌏 리전 주석.
const GATEWAY_RETRY_DELAY_MS = 1500

/**
 * Supabase 게이트웨이 504 에 한해 읽기 요청을 한 번만 다시 보낸다.
 *
 * - GET/HEAD 만. 쓰기(POST/PATCH/DELETE)는 504 여도 DB 에 반영됐을 수 있어 재전송하지 않는다.
 * - postgrest-js 내장 재시도는 520/503 만 본다(504 는 즉시 에러). 그래서 여기서 메운다.
 * - 재시도는 반드시 로그로 남긴다(CLAUDE.md §7.2). 재시도가 성공해도 504 는 났던 것이고,
 *   이 로그 건수가 원인 조사(스케줄 분 이동 등)의 효과 측정값이다.
 */
export async function fetchWithGatewayRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  const method = (init?.method ?? 'GET').toUpperCase()
  if (res.status !== 504 || (method !== 'GET' && method !== 'HEAD')) return res

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const path = new URL(url).pathname
  console.warn(`[supabase] 504 on ${method} ${path} — retrying once in ${GATEWAY_RETRY_DELAY_MS}ms`)
  await res.body?.cancel()
  await new Promise(r => setTimeout(r, GATEWAY_RETRY_DELAY_MS))

  const retry = await fetch(input, init)
  console.warn(`[supabase] retry ${method} ${path} → HTTP ${retry.status}`)
  return retry
}

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
    global: { fetch: fetchWithGatewayRetry },
  })
}
