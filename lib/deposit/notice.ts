// 입금 안내 문구(v71bv). 계좌 정보는 환경변수에서만 읽는다 — 이 리포는 공개라 은행·예금주·번호를
// 코드·문서에 쓰지 않는다. 값은 .env.local / Vercel env 에만 둔다.
// 문구는 초안이다(DRAFT). 자동 발송 경로는 없다 — 관리자가 화면 버튼을 눌러 자기 메일 앱에서 보낸다.

export const DEPOSIT_ENV_KEYS = ['DEPOSIT_BANK_NAME', 'DEPOSIT_ACCOUNT_HOLDER', 'DEPOSIT_ACCOUNT_NUMBER'] as const

export type DepositAccount = { bank: string; holder: string; number: string }

/** 셋 다 있어야 ok. 하나라도 비면 어떤 키가 빠졌는지 돌려준다(빈 계좌로 안내문을 만들지 않는다). */
export function readDepositAccount(env: Record<string, string | undefined>):
  { ok: true; account: DepositAccount } | { ok: false; missing: string[] } {
  const v = DEPOSIT_ENV_KEYS.map((k) => (env[k] ?? '').trim())
  const missing = DEPOSIT_ENV_KEYS.filter((_, i) => !v[i])
  if (missing.length) return { ok: false, missing }
  return { ok: true, account: { bank: v[0], holder: v[1], number: v[2] } }
}

export const DEPOSIT_SUBJECT = '[DRAFT] 솔루션아카이브 입금 안내'

// 상품 두 개(D-6). 팀 플랜은 없다(숨김). 금액은 자유 입력이 아니라 이 표에서만 나온다.
export const DEPOSIT_PRODUCTS = {
  single: { label: '단건 리포트 19,000원(경쟁사 1곳)', amount: '19,000원' },
  monthly: { label: '구독 월 29,000원/1인', amount: '29,000원(월)' },
} as const
export type DepositProduct = keyof typeof DEPOSIT_PRODUCTS

export const DEPOSIT_REFUND = '입금 확인 후 7일 이내 요청 시 100% 환불'

export function depositBody(a: DepositAccount, product: DepositProduct | ''): string {
  const p = product ? DEPOSIT_PRODUCTS[product] : null
  return [
    '[DRAFT — 문구 검토 전 초안]',
    '',
    '안녕하세요, 솔루션아카이브입니다.',
    '신청해 주셔서 감사합니다. 아래 계좌로 입금해 주시면 확인 후 작업을 시작합니다.',
    '',
    `상품: ${p ? p.label : '[상품 선택 필요]'}`,
    `금액: ${p ? p.amount : '[상품 선택 필요]'}`,
    '',
    `은행: ${a.bank}`,
    `예금주: ${a.holder}`,
    `계좌번호: ${a.number}`,
    '',
    `환불: ${DEPOSIT_REFUND}`,
    '입금자명이 신청자 이름과 다르면 회신으로 알려 주세요.',
  ].join('\n')
}

/** 관리자 메일 앱을 여는 mailto 주소. 받는 사람이 이메일 형식이 아니거나 상품이 안 골라졌으면 null. */
export function isDepositEmail(to: string): boolean {
  return /^[^\s@,;?&]+@[^\s@,;?&]+\.[^\s@,;?&]+$/.test(to.trim()) // ?·& 차단 = 헤더 주입 차단
}

export function depositMailto(to: string, a: DepositAccount, product: DepositProduct | ''): string | null {
  const addr = to.trim()
  if (!product || !isDepositEmail(addr)) return null
  return `mailto:${addr}?subject=${encodeURIComponent(DEPOSIT_SUBJECT)}&body=${encodeURIComponent(depositBody(a, product))}`
}
