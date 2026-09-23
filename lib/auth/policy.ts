// 로그인 판정 규칙 한 벌 — proxy.ts(경로 보호)와 lib/auth/session.ts(서버 액션 가드)가 같이 쓴다.
// import 가 하나도 없다. scripts/auth-selftest.mjs 가 node 로 바로 불러 검사한다.
//
// ponytail: 허용 목록 = 전원 같은 권한. CLAUDE.md §5 의 역할×브랜드 RBAC 는 아직 없다.
//   다음 단계: user_roles(user_id, role, brand_access[]) 테이블 + 세션 클라이언트로 RLS 적용.
//   지금 DB 쿼리는 lib/supabase/server.ts 의 service_role 이라 RLS 를 우회한다 — 로그인은
//   "누가 앱에 들어오나"만 막는다. RBAC 가 붙으면 AUTH_ALLOWED_EMAILS 는 첫 super_admin 부트스트랩용으로만 남긴다.

export type AuthVerdict =
  | { kind: 'allowed'; email: string }
  | { kind: 'anonymous' }
  | { kind: 'forbidden'; email: string }
  | { kind: 'allowlist_unset' }
  | { kind: 'unavailable'; detail: string }

export type GuardResult = { ok: true; email: string } | { ok: false; message: string }

/** supabase.auth.getUser() 응답 중 판정에 쓰는 부분만. */
type UserResult = {
  data: { user: { email?: string | null } | null }
  error: { name?: string; status?: number; message: string } | null
}

/**
 * AUTH_ALLOWED_EMAILS (쉼표 구분) → 소문자 이메일 집합. 비었으면 null.
 * null 은 "아무도 통과 못 함"이다. 코드 기본값을 두지 않는다 — env 누락이 전체 공개가 아니라 전체 잠금으로 나타나야 한다.
 */
export function parseAllowlist(raw: string | null | undefined): Set<string> | null {
  const emails = (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return emails.length > 0 ? new Set(emails) : null
}

/**
 * 로그인 없이 통과하는 경로. 여기 없는 경로는 전부 보호된다(새 화면·API 는 기본 잠김).
 * 근거는 scripts/auth-selftest.mjs 가 코드에서 다시 뽑아 대조한다.
 */
const PUBLIC_PREFIXES = [
  '/login', //            로그인 화면
  '/auth', //             OAuth 시작·콜백·로그아웃. 막으면 아무도 로그인 못 한다
  '/onboarding', //       익명 온보딩 퀴즈(localStorage session_id, AppNav 도 숨김)
  '/api/onboarding', //   그 퀴즈의 API·공유 이미지
  '/api/threads', //      Vercel Cron·수동 트리거 — 전부 requireCronAuth(Bearer CRON_SECRET)
  '/api/insight', //      capture=requireCronAuth, kakao-webhook=카카오 서버가 부름(KAKAO_ALLOWED_USER_IDS)
  // 승인된 칼럼 공개 읽기 + 그 OG 이미지. **읽기 전용**이고 approved 행만 나온다.
  // 검수 화면 `/columns` 는 under() 가 `${p}/` 로 이어 붙여 비교하므로 여기에 걸리지 않는다
  // — 그 경계를 auth-selftest 음성 3건(`/columns`·`/columns/decide`·`/columns/readx`)이 지킨다.
  // 남헌 2026-09-23 명시 승인(기능 5 "사이트에 칼럼을 기재하는 장소").
  '/columns/read',
]

/**
 * **정확일치로만** 공개하는 경로. ⚠️ `/` 를 위 접두사 목록에 넣지 마라. 그 목록의 뜻은
 * "이 아래는 전부 공개"이고, `/` 아래는 앱 전체다. 지금의 `under()` 는 `${p}/` 로 이어 붙여
 * 비교하므로 우연히 막고 있지만(`'/dashboard'.startsWith('//')` 가 false), 그 한 글자에
 * 기대는 건 방어가 아니다 — `startsWith(p)` 로 한 번만 단순화하면 전 경로가 열린다.
 *  - `/`                랜딩(로그인 전 첫 화면). 로그인돼 있으면 페이지가 /dashboard 로 보낸다.
 *  - `/opengraph-image` 그 랜딩의 OG 이미지(app/opengraph-image.tsx). 링크 미리보기 크롤러는
 *                       익명이라 막으면 이미지가 영영 안 뜬다. DB 를 읽지 않는 정적 문구 이미지다.
 */
const PUBLIC_EXACT = ['/', '/opengraph-image']

/** 위 공개 접두사 안이지만 사람만 부르는 경로. */
const PROTECTED_EXCEPTIONS = [
  // Meta OAuth 콜백. 크론 인증이 없고 state 검사도 없이 api_tokens 에 토큰을 쓴다 — 공개로 두면
  // 남의 Threads 계정 인가 코드로 우리 토큰을 덮어쓸 수 있다. 부르는 건 사람 브라우저뿐이다.
  '/api/threads/callback',
]

export function isPublicPath(pathname: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`)
  if (PROTECTED_EXCEPTIONS.some(under)) return false
  if (PUBLIC_EXACT.includes(pathname)) return true
  return PUBLIC_PREFIXES.some(under)
}

/**
 * 세션 + 허용 목록 판정. 3상태를 접지 않는다(CLAUDE.md §7.1):
 * "로그인 안 됨"(anonymous)과 "확인 못 함"(unavailable)은 다른 결과이고, 둘 다 통과시키지 않는다.
 * 허용 목록이 비면 Supabase 에 묻지도 않고 잠근다.
 */
export async function resolveAuth(
  allowRaw: string | null | undefined,
  getUser: (() => Promise<UserResult>) | null,
): Promise<AuthVerdict> {
  const allow = parseAllowlist(allowRaw)
  if (!allow) return { kind: 'allowlist_unset' }
  if (!getUser) return { kind: 'unavailable', detail: 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정' }

  let res: UserResult
  try {
    res = await getUser()
  } catch (e) {
    return { kind: 'unavailable', detail: e instanceof Error ? e.message : String(e) }
  }

  if (res.error) {
    const s = res.error.status
    // 세션 없음(AuthSessionMissingError 400)·만료/무효 토큰(4xx) = 로그인 안 됨.
    // 네트워크 실패(AuthRetryableFetchError, status 0)·5xx·429·상태 없는 오류 = 확인 불가.
    const outage = res.error.name === 'AuthRetryableFetchError' || !s || s === 429 || s >= 500
    return outage
      ? { kind: 'unavailable', detail: `${res.error.name ?? 'AuthError'}(${s ?? '-'}): ${res.error.message}` }
      : { kind: 'anonymous' }
  }

  const user = res.data.user
  if (!user) return { kind: 'anonymous' }
  const email = user.email?.trim().toLowerCase() ?? ''
  return email && allow.has(email) ? { kind: 'allowed', email } : { kind: 'forbidden', email: email || '(이메일 없음)' }
}

/** 사용자에게 보일 거절 사유(한국어). */
export function verdictMessage(v: AuthVerdict): string {
  switch (v.kind) {
    case 'allowed': return ''
    case 'anonymous': return '로그인이 필요합니다.'
    case 'forbidden': return `허용 목록에 없는 계정입니다 (${v.email}).`
    case 'allowlist_unset': return '허용 목록(AUTH_ALLOWED_EMAILS)이 설정되지 않아 아무도 들어올 수 없습니다.'
    case 'unavailable': return `인증 확인 불가 — 로그인 상태를 확인하지 못했습니다 (${v.detail}).`
  }
}

/** API·비GET 요청 거절 시 HTTP 상태. 설정 누락·장애는 401 이 아니다 — 자격을 뒤지게 만든다. */
export function denyStatus(v: AuthVerdict): number {
  return v.kind === 'anonymous' ? 401 : v.kind === 'forbidden' ? 403 : v.kind === 'allowed' ? 200 : 503
}

/** 서버 액션 가드의 판정부. 허용된 경우만 통과, 나머지는 쓰지 않고 사유를 돌려준다. */
export function guardFromVerdict(v: AuthVerdict): GuardResult {
  return v.kind === 'allowed' ? { ok: true, email: v.email } : { ok: false, message: `${verdictMessage(v)} 저장하지 않았습니다.` }
}

/** 로그인 후 돌아갈 경로. 같은 사이트 상대경로만 — 외부 URL·프로토콜 상대(//) 는 버린다. */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/dashboard'
}
