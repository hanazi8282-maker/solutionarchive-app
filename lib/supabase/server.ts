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
  const res = await fetchWithClockSkewRetry(input, init)
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

// PGRST303 "JWT issued at future" 재시도 — 250ms 간격 최대 2회(최악 +0.5s + 왕복 2번).
// 원인 조사(2026-10-01, PR 본문): 이 클라이언트는 런타임에 JWT 를 만들지 않는다. Authorization 은
// SUPABASE_SERVICE_ROLE_KEY 정적 값이다(supabase-js fetchWithAuth, persistSession:false 라 세션 토큰 없음).
// 그래서 Vercel 시계는 iat 에 들어가지 않는다. 미래 iat 는 Supabase 쪽에서만 생길 수 있다 —
// sb_secret_ 키를 게이트웨이가 단명 내부 JWT 로 바꿔 서명할 때 게이트웨이 시계 > PostgREST 시계.
// 코드로 못 고치는 인프라 오차라 재시도로 완충만 한다.
const CLOCK_SKEW_RETRY_DELAY_MS = 250
const CLOCK_SKEW_MAX_RETRIES = 2

async function isIssuedAtFuture(res: Response): Promise<boolean> {
  if (res.status !== 401) return false
  try {
    const body = (await res.clone().json()) as { code?: unknown; message?: unknown }
    return body.code === 'PGRST303' && /issued at future/i.test(String(body.message))
  } catch {
    return false
  }
}

/**
 * GET 만. 401 본문이 PGRST303 + "issued at future" 일 때만 다시 보낸다 — 같은 PGRST303 이라도
 * "JWT expired" 등, 그리고 PGRST301(키 불량)은 재시도하지 않는다(숨기지 않는다).
 * HEAD 는 본문이 없어 코드를 못 읽으니 제외. 상한 뒤에도 실패면 마지막 응답을 그대로 넘긴다 →
 * 호출부의 기존 "확인 불가" 경로. 재시도는 성공해도 warn 1줄(경로·횟수만, 키·질의 문자열 없음) —
 * 이 줄 건수가 빈도 측정값이다(Vercel 런타임 로그에서 "PGRST303" grep).
 */
export async function fetchWithClockSkewRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init)
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return res
  let retries = 0
  while (retries < CLOCK_SKEW_MAX_RETRIES && await isIssuedAtFuture(res)) {
    await res.body?.cancel()
    await new Promise(r => setTimeout(r, CLOCK_SKEW_RETRY_DELAY_MS))
    retries++
    res = await fetch(input, init)
  }
  if (retries > 0) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    console.warn(`[supabase] PGRST303 issued-at-future on GET ${new URL(url).pathname} — retried ${retries}x → HTTP ${res.status}`)
  }
  return res
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
