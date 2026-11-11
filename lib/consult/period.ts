// 구독 기간 계산 — 순수 함수(import 없음). 활성화한 날부터 한 달. 31일→말일 보정(1/31 + 1달 = 2/28 또는 2/29).
export function addMonth(start: Date): Date {
  const d = new Date(start.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + 1)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

export const PLAN = { id: 'monthly_29000', amount_krw: 29000, label: '월 29,000원' } as const

/** 입금자명 검증 — 2~20자, 제어문자 없음. 이름이 곧 대조 키라 비면 안 된다. */
export function cleanDepositor(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (s.length < 2 || s.length > 20 || /[\u0000-\u001f<>]/.test(s)) throw new Error('입금자명은 2~20자로 적어 주세요')
  return s
}
