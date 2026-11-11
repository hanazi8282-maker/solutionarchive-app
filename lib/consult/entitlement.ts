// 유료 권한 판정 — consult_payment_requests 에 활성(status='active', 종료일 없거나 미래)인 행이 있으면 유료. 입금 확인 뒤 남헌이 /consult/admin 에서 활성화한다(PG 없음).
// 판정 함수(순수)와 DB 조회를 나눈다 — 판정만 셀프테스트한다.
import { db } from './runs.ts'
import { parseAllowlist } from '../auth/policy.ts'

export type PayRow = { status: string; ends_at: string | null }

export function isActive(rows: PayRow[], now: Date = new Date()): boolean {
  return rows.some((r) => r.status === 'active' && (r.ends_at === null || new Date(r.ends_at).getTime() > now.getTime()))
}

export async function isPaid(email: string): Promise<boolean> {
  const { data, error } = await (await db()).from('consult_payment_requests').select('status,ends_at').eq('owner_email', email.toLowerCase())
  if (error) throw new Error(`구독 조회 실패: ${error.message}`) // 확인 못 한 것을 "무료"로 접지 않는다 — 호출부가 503 으로 보여 준다
  return isActive((data ?? []) as PayRow[])
}

/** 내부 허용 목록(남헌·운영진)은 승인 테스트와 운영을 위해 유료 기능을 그대로 쓴다. */
export function isStaff(email: string): boolean {
  return parseAllowlist(process.env.AUTH_ALLOWED_EMAILS)?.has(email.trim().toLowerCase()) ?? false
}

/** 유료 기능 접근 = 활성 구독 또는 운영진. DB 조회 실패는 던진다. */
export async function hasPaidAccess(email: string): Promise<boolean> {
  return isStaff(email) || (await isPaid(email))
}
