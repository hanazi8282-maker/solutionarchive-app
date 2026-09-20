// 지불의사(WTP) 신호 — 순수 검증기. DB·네트워크를 타지 않는다(scripts/wtp-selftest.mjs 가 이 파일만 돌린다).
//
// 정본은 마이그레이션 `supabase/migrations/20260924000001_wtp_signals.sql` 의 CHECK 다.
// 여기 규칙은 그 사본이고, 어긋나면 INSERT 가 23514 로 죽는다 — 가장 늦게 발견되는 형태다.
//
// ★ 가격표가 아니다. 여기서 나온 값으로 화면에 가격을 띄우지 않는다(CLAUDE.md §10.2 — 가격 정책은
//   사업 방향 결정이라 사람이 정한다). 이 파일이 하는 일은 "사람이 뭐라고 답했나" 를 그대로 옮기는 것뿐이다.
//
// ★ 접지 않는 것(§7.1): 어휘 밖 값·범위 밖 금액을 null 로 조용히 바꾸지 않는다. 바꾸면 사람이 고른 답이
//   사라진 걸 아무도 모른 채 "안 내겠다" 로 집계된다. 안 답한 것(행 없음)과 0원은 다른 사건이다.

export const WTP_SURFACES = ['result', 'review', 'angles'] as const
export const WTP_BILLINGS = ['one_off', 'monthly'] as const

/** 원 단위 상한 — 오타 방어(1억 같은 값). 마이그레이션 CHECK 와 같은 값이어야 한다. */
export const WTP_AMOUNT_MAX = 10_000_000
export const WTP_NOTE_MAX = 500

export type WtpSurface = (typeof WTP_SURFACES)[number]
export type WtpBilling = (typeof WTP_BILLINGS)[number]

export type WtpRow = {
  would_pay: boolean
  amount_krw: number | null
  billing: WtpBilling | null
  note: string | null
  surface: WtpSurface
}

export type WtpParse = { ok: true; row: WtpRow } | { ok: false; error: string }

const bad = (error: string): WtpParse => ({ ok: false, error })

/** 빈 값 = "안 넣었다". 0 은 빈 값이 아니다(0원은 사람이 고른 답이다). */
const empty = (v: unknown) => v == null || v === ''

/**
 * 요청 본문에서 WTP 답 한 벌을 뽑아 검증한다. project_id·owner_email 은 여기서 보지 않는다 —
 * 신원은 세션에서만 오고(app/api/profile/route.ts 와 같은 규칙), 프로젝트는 라우트가 붙인다.
 */
export function parseWtpBody(body: unknown): WtpParse {
  const src = (body ?? {}) as Record<string, unknown>

  // ── would_pay: 필수. 없으면 "안 내겠다" 로 읽지 않는다 — 답을 안 한 것과 안 내겠다는 다르다.
  if (typeof src.would_pay !== 'boolean') {
    return bad('지불 의사(would_pay)는 참/거짓 중 하나여야 한다. 답하지 않은 것과 "안 낸다"는 다른 답이다.')
  }
  const would_pay = src.would_pay

  // ── amount_krw: 낼 때만. 0~10,000,000 정수.
  let amount_krw: number | null = null
  if (!empty(src.amount_krw)) {
    if (!would_pay) {
      return bad('금액(amount_krw)은 "낸다"고 답했을 때만 보낼 수 있다. 안 낸다고 했는데 금액이 함께 왔다.')
    }
    const n = typeof src.amount_krw === 'number' ? src.amount_krw
      : typeof src.amount_krw === 'string' ? Number(src.amount_krw.trim())
        : NaN
    if (!Number.isInteger(n)) {
      return bad('금액(amount_krw)은 원 단위 정수여야 한다.')
    }
    if (n < 0 || n > WTP_AMOUNT_MAX) {
      return bad(`금액(amount_krw)은 0원 이상 ${WTP_AMOUNT_MAX.toLocaleString('ko-KR')}원 이하여야 한다 (받은 값 ${n}).`)
    }
    amount_krw = n
  }

  // ── billing: 낼 때만. 일회성 / 월 구독 두 갈래뿐.
  let billing: WtpBilling | null = null
  if (!empty(src.billing)) {
    if (!would_pay) {
      return bad('결제 형태(billing)는 "낸다"고 답했을 때만 보낼 수 있다.')
    }
    if (typeof src.billing !== 'string' || !(WTP_BILLINGS as readonly string[]).includes(src.billing)) {
      return bad(`결제 형태(billing) 값이 어휘에 없다. 허용: ${WTP_BILLINGS.join(', ')}`)
    }
    billing = src.billing as WtpBilling
  }

  // ── note: 선택. 자르지 않고 막는다(조용히 버리면 사람이 쓴 문장이 사라진 걸 모른다).
  let note: string | null = null
  if (!empty(src.note)) {
    if (typeof src.note !== 'string') {
      return bad('한 줄 메모(note) 값이 문자열이 아니다.')
    }
    const v = src.note.trim()
    if (v.length > WTP_NOTE_MAX) {
      return bad(`한 줄 메모(note)는 ${WTP_NOTE_MAX}자를 넘을 수 없다 (현재 ${v.length}자).`)
    }
    note = v === '' ? null : v
  }

  // ── surface: 어느 화면의 답인가. 기본값은 진단 결과 화면.
  let surface: WtpSurface = 'result'
  if (!empty(src.surface)) {
    if (typeof src.surface !== 'string' || !(WTP_SURFACES as readonly string[]).includes(src.surface)) {
      return bad(`화면(surface) 값이 어휘에 없다. 허용: ${WTP_SURFACES.join(', ')}`)
    }
    surface = src.surface as WtpSurface
  }

  return { ok: true, row: { would_pay, amount_krw, billing, note, surface } }
}
