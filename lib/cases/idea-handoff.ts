// 아이디어 PMF 판정(/cases/report)의 아이디어 인계 — 주소(URL) 질의 대신 서버 액션 POST + 짧은 쿠키(2026-10-12 앱 감사 A-3).
//
// 왜: 아이디어 원문이 ?q= 에 실리면 URL·접근 로그·리퍼러·브라우저 기록에 남는다. 클라이언트 폼(app/cases/report/idea-form.tsx)이
//   원문을 30분짜리 쿠키(경로 /cases/report)에 얹고 질의 없는 주소로 이동한다. 쿠키는 접근 로그에 찍히지 않고 이 경로에서만 간다.
//   서버 액션·새 엔드포인트를 만들지 않는 이유: 인증 경계(§10.2 예외 3)를 건드리지 않으려고 — auth-selftest 가 서버 액션마다 가드를 요구한다.
//   (질의 기록 idea_query_log 는 별개 — 남헌 2026-10-01 결정 그대로, 매칭을 돌린 요청마다 1행.)
// ponytail: 쿠키는 JS 가 쓴다(httpOnly 불가). 서버가 값을 읽기만 하고 신뢰하지 않으므로(QUERY_MAX 로 자르고 낱말 매칭에만 쓴다) 위험은 같다.
// 예외: 고정 예시 문구(EXAMPLE_IDEA)는 공개 상수라 ?q= 로 둔다 — 예시 링크가 그대로 산다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(셀프테스트). `@/` 별칭을 쓰지 않는다.

// 클라이언트 번들에 들어가므로 search.ts(무거운 import 사슬)를 끌어오지 않는다. 같은 값인지는 셀프테스트가 본다.
export const IDEA_MAX = 200

export const IDEA_COOKIE = 'idea_q'
export const IDEA_TTL_SEC = 30 * 60
export const EXAMPLE_IDEA = '프리랜서용 인보이스 자동 발송 SaaS'
export const REPORT_PATH = '/cases/report'

/** 폼 제출값 → 쿠키에 얹을 아이디어. 빈 값이면 null. */
export function ideaOf(raw: unknown): string | null {
  return (typeof raw === 'string' ? raw.trim().slice(0, IDEA_MAX) : '') || null
}

/** document.cookie 에 넣을 한 줄. 값은 encodeURIComponent — 서버(next/headers cookies)가 한 번 풀어 준다. */
export function ideaCookieOf(q: string, secure = false): string {
  return `${IDEA_COOKIE}=${encodeURIComponent(q)}; Path=${REPORT_PATH}; Max-Age=${IDEA_TTL_SEC}; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** 제출 뒤 이동할 주소 — 질의에는 kind 만(아이디어는 싣지 않는다). kind 의 어휘 검사는 page 의 parseSearchQuery 가 한다. */
export function reportPathOf(kind: unknown): string {
  const k = typeof kind === 'string' ? kind.trim().toLowerCase() : ''
  return /^[a-z]{1,10}$/.test(k) && k !== 'saas' ? `${REPORT_PATH}?kind=${k}` : REPORT_PATH
}

/**
 * 페이지가 쓸 아이디어. 쿠키가 정본이다. ?q= 는 고정 예시일 때만 인정하고, 그 밖의 ?q=(옛 공유 링크·외부 입구)는
 * 쓰지 않고 `legacy` 로만 돌려준다 — 화면은 입력창을 채우고 다시 제출하게 한다(URL 로는 매칭을 돌리지 않는다).
 */
export function pickIdea(cookie: string | undefined, qParam: string | undefined): { q: string | undefined; legacy: string | null } {
  const param = ideaOf(qParam)
  if (param === EXAMPLE_IDEA) return { q: param, legacy: null }
  return { q: ideaOf(cookie) ?? undefined, legacy: param }
}
