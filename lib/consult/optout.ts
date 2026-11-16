// 수신 거부 목록(v71cq §2-2). 추가 전용 — 거부한 주소는 무료 초안 신청과 명단·메일 꾸러미 생성에서 자동으로 빠진다.
// 순수 함수(normalizeEmail·parseOptout)는 scripts/lead-selftest.mjs 가 검사한다.
import { db } from './runs.ts'

export const OPTOUT_REASONS = { too_many: '너무 많이 옴', no_interest: '관심 없음', wrong_person: '잘못 온 메일', other: '기타' } as const
export type OptoutReason = keyof typeof OPTOUT_REASONS
const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i

export const normalizeEmail = (raw: unknown): string | null => {
  const e = String(raw ?? '').trim().toLowerCase()
  return EMAIL_RE.test(e) && e.length <= 254 ? e : null
}

export function parseOptout(f: { email?: unknown; reason?: unknown; website?: unknown }): { ok: true; email: string; reason: OptoutReason | null } | { ok: false; code: 'email' | 'bot' } {
  if (String(f.website ?? '').trim()) return { ok: false, code: 'bot' }
  const email = normalizeEmail(f.email)
  if (!email) return { ok: false, code: 'email' }
  const r = String(f.reason ?? '')
  return { ok: true, email, reason: r in OPTOUT_REASONS ? (r as OptoutReason) : null } // 이유는 필수 아님
}

/** 못 읽은 것을 "거부 안 함"으로 접지 않는다 — 조회 실패는 던진다(호출부가 접수를 멈춘다). */
export async function isOptedOut(email: string): Promise<boolean> {
  const { data, error } = await (await db()).from('consult_optouts').select('email').eq('email', email.toLowerCase()).maybeSingle()
  if (error) throw new Error(`수신 거부 조회 실패: ${error.message}`)
  return Boolean(data)
}

/** 명단·메일 꾸러미 생성(§4)이 쓴다: 거부한 주소를 뺀 목록과 빠진 개수. */
export async function filterOptedOut<T extends { email: string }>(rows: T[]): Promise<{ kept: T[]; removed: number }> {
  if (rows.length === 0) return { kept: rows, removed: 0 }
  const { data, error } = await (await db()).from('consult_optouts').select('email').in('email', rows.map((r) => r.email.toLowerCase()))
  if (error) throw new Error(`수신 거부 조회 실패: ${error.message}`)
  const out = new Set((data ?? []).map((d) => d.email as string))
  const kept = rows.filter((r) => !out.has(r.email.toLowerCase()))
  return { kept, removed: rows.length - kept.length }
}

export async function addOptout(email: string, reason: OptoutReason | null): Promise<void> {
  // 이미 있으면 그대로 둔다(추가 전용 — 덮어쓰지 않는다). 같은 주소를 두 번 눌러도 성공으로 본다.
  const { error } = await (await db()).from('consult_optouts').upsert({ email, reason }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) throw new Error(`수신 거부 저장 실패: ${error.message}`)
}
