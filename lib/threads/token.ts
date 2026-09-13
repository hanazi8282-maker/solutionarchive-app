// 상대 경로 + .ts: scripts/threads-token-selftest.mjs 가 Node 로 직접 import 한다(@/ 별칭 해석 불가).
import { createClient } from '../supabase/server.ts'

const BASE = 'https://graph.threads.net'
const PROVIDER = 'threads'

// 만료 7일 전부터 갱신한다. 갱신 크론이 주 1회라 한 주기를 통째로 놓쳐도
// 다음 주기에 아직 만료 전이어야 하므로, 임계값이 크론 간격(7일)보다 작으면 안 된다.
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

// Threads 는 발급 후 24시간이 지나야 갱신을 받아준다(공식 문서).
// 그 전에 호출하면 에러가 나므로 아예 시도하지 않는다.
const MIN_TOKEN_AGE_MS = 24 * 60 * 60 * 1000

export interface ThreadsCredentials {
  accessToken: string
  userId: string
}

interface TokenRow {
  access_token: string
  expires_at: string
  user_id: string | null
  updated_at: string
}

/**
 * 토큰 조회 결과 3상태 (CLAUDE.md §7.1).
 *
 * - ok           — 양성: 쓸 수 있는 토큰이 있다
 * - needs_reauth — 음성: 확인했고, 사람이 재인증하기 전엔 쓸 토큰이 없다(행 없음·user_id 없음·만료)
 * - unavailable  — 확인 불가: api_tokens 를 읽지 못했다(DB 오류·게이트웨이 타임아웃·환경변수 없음)
 *
 * needs_reauth 와 unavailable 을 한 값(null)으로 접으면 안 된다. 2026-09-12~13 에
 * Supabase Gateway Timeout 10건이 "재인증 필요"로 보고됐다 — 토큰은 멀쩡했다.
 * 다음 행동이 정반대다: 전자는 사람이 인가 창을 거치고, 후자는 기다리거나 인프라를 본다.
 */
export type TokenResult =
  | { status: 'ok'; creds: ThreadsCredentials }
  | { status: 'needs_reauth'; reason: string }
  | { status: 'unavailable'; reason: string }

/**
 * api_tokens 에 저장된 Threads 토큰을 가져온다. 만료가 가까우면 갱신 후 저장한다.
 * throw 하지 않는다. 실패는 전부 needs_reauth / unavailable 로 돌려준다.
 */
export async function loadThreadsToken(): Promise<TokenResult> {
  const supabase = await createClient()
  if (!supabase) {
    console.error('[threads] Supabase 환경변수 없음 — 토큰 확인 불가')
    return { status: 'unavailable', reason: 'Supabase 환경변수 없음' }
  }

  const { data, error } = await supabase
    .from('api_tokens')
    .select('access_token, expires_at, user_id, updated_at')
    .eq('provider', PROVIDER)
    .maybeSingle<TokenRow>()

  if (error) {
    // 조회 실패는 "토큰 없음"이 아니다. 행이 있는지조차 모른다.
    console.error(`[threads] api_tokens 조회 실패(확인 불가, 재인증 판단 아님): ${error.message}`)
    return { status: 'unavailable', reason: `api_tokens 조회 실패: ${error.message}` }
  }
  if (!data) {
    console.info('[threads] api_tokens 에 토큰 없음 — OAuth 초기 인증 필요')
    return { status: 'needs_reauth', reason: 'api_tokens 에 threads 행 없음' }
  }
  if (!data.user_id) {
    // user_id 는 발행 API 의 경로 파라미터라 없으면 아무것도 못 한다.
    console.error('[threads] 토큰 행에 user_id 가 없음 — 콜백/시드 스크립트로 재저장 필요')
    return { status: 'needs_reauth', reason: '토큰 행에 user_id 없음' }
  }

  const now = Date.now()
  const expiresAt = new Date(data.expires_at).getTime()

  if (expiresAt <= now) {
    // 만료된 토큰은 갱신조차 불가능하다(공식 문서: 만료 후에는 refresh 불가).
    // 사람이 인가 창을 다시 거치는 수밖에 없다.
    console.error('[threads] 토큰 만료됨 — 갱신 불가, 수동 재인증 필요')
    return { status: 'needs_reauth', reason: `토큰 만료(${data.expires_at})` }
  }

  const current: ThreadsCredentials = { accessToken: data.access_token, userId: data.user_id }

  if (expiresAt - now > REFRESH_THRESHOLD_MS) return { status: 'ok', creds: current }

  const tokenAge = now - new Date(data.updated_at).getTime()
  if (tokenAge < MIN_TOKEN_AGE_MS) {
    // 만료가 임박했는데 토큰이 24시간도 안 됐다면 expires_at 이 잘못 저장된 것이다.
    // 갱신은 어차피 거부당하므로 현재 토큰을 그대로 쓰고 경고만 남긴다.
    console.warn('[threads] 만료 임박하나 토큰이 24시간 미만 — 갱신 불가, expires_at 확인 필요')
    return { status: 'ok', creds: current }
  }

  return { status: 'ok', creds: await refreshToken(supabase, current) }
}

/**
 * 3상태가 필요 없는 호출부용(대시보드). null 은 needs_reauth 와 unavailable 을 **둘 다** 뜻한다 —
 * null 을 "재인증 필요"로 읽지 마라. 크론 라우트는 loadThreadsToken 을 쓴다.
 */
export async function ensureValidToken(): Promise<ThreadsCredentials | null> {
  const r = await loadThreadsToken()
  return r.status === 'ok' ? r.creds : null
}

/**
 * 크론 라우트의 토큰 실패 응답 규약. NextResponse 대신 평범한 객체를 돌려준다
 * (next/server 는 Node 셀프테스트에서 import 되지 않는다).
 *
 * - needs_reauth → 200 + needsReauth:true. 크론이 못 고치고 사람의 재인증만이 답이라
 *   5xx 로 올리면 매시간 알람이 울려 소음이 된다(기존 규약 유지).
 * - unavailable  → 503 + unavailable:true, needsReauth:false. 같은 라우트의 다른 DB 조회
 *   실패(초안·대상 글 조회 → 500)와 같은 층위의 실패라 5xx 로 드러낸다. 조용한 200 으로
 *   두면 "재인증 필요"와 똑같이 묻힌다. 500 이 아니라 503 인 건 코드 버그(500)와
 *   의존 서비스 일시 불가를 로그·대시보드에서 가를 수 있게 하려는 것이다.
 */
export function tokenFailure(r: Exclude<TokenResult, { status: 'ok' }>): { body: Record<string, unknown>; status: number } {
  if (r.status === 'needs_reauth') {
    return { status: 200, body: { ok: false, needsReauth: true, message: 'Threads 재인증 필요', reason: r.reason } }
  }
  return {
    status: 503,
    body: { ok: false, needsReauth: false, unavailable: true, message: `토큰 확인 불가(일시 장애 추정, 재인증 불필요): ${r.reason}` },
  }
}

/**
 * th_refresh_token 그랜트로 장기 토큰을 갱신하고 api_tokens 에 반영한다.
 * 갱신에 실패해도 현재 토큰이 아직 유효하므로 그대로 반환한다(이번 실행은 살린다).
 */
async function refreshToken(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  current: ThreadsCredentials,
): Promise<ThreadsCredentials> {
  // 이 엔드포인트는 갱신 대상 토큰 자체가 파라미터라 쿼리스트링으로 넘긴다(공식 문서 스펙).
  // client_secret 은 필요 없다.
  const url = new URL(`${BASE}/refresh_access_token`)
  url.searchParams.set('grant_type', 'th_refresh_token')
  url.searchParams.set('access_token', current.accessToken)

  const res = await fetch(url, { method: 'GET' })
  const json = await res.json().catch(() => ({}))

  if (!res.ok || !json.access_token) {
    console.error(`[threads] 토큰 갱신 실패 (HTTP ${res.status}): ${JSON.stringify(json)}`)
    return current
  }

  const expiresIn: number = typeof json.expires_in === 'number' ? json.expires_in : 60 * 24 * 60 * 60
  const expiresAt = new Date(Date.now() + expiresIn * 1000)

  const { error } = await supabase.from('api_tokens').upsert(
    {
      provider: PROVIDER,
      access_token: json.access_token as string,
      expires_at: expiresAt.toISOString(),
      user_id: current.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider' },
  )

  if (error) {
    // 저장에 실패하면 새 토큰은 이번 실행에서만 살아 있고 다음 실행은 옛 토큰을 읽는다.
    // 옛 토큰도 아직 유효하므로 즉시 장애는 아니지만, 반복되면 만료로 이어진다.
    console.error(`[threads] 갱신된 토큰 저장 실패: ${error.message}`)
    return { accessToken: json.access_token as string, userId: current.userId }
  }

  console.info(`[threads] 토큰 갱신 완료 — 새 만료 ${expiresAt.toISOString()}`)
  return { accessToken: json.access_token as string, userId: current.userId }
}
