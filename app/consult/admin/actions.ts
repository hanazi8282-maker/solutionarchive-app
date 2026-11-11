'use server'
// 컨설팅 구독 관리 — 남헌(허용 목록)만. 입금 확인 뒤 활성화/반려/종료. 모든 export 는 맨 앞에서 requireAllowedUser 를 부른다(auth-selftest 가 검사).
import { revalidatePath } from 'next/cache'
import { requireAllowedUser } from '@/lib/auth/session'
import { db } from '@/lib/consult/runs'
import { addMonth } from '@/lib/consult/period'

type Result = { ok: boolean; message: string }

export async function activateSubscription(id: string): Promise<Result> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: '잘못된 요청입니다.' }
  const now = new Date()
  const { error } = await (await db()).from('consult_payment_requests')
    .update({ status: 'active', activated_at: now.toISOString(), activated_by: auth.email, ends_at: addMonth(now).toISOString(), note: null })
    .eq('id', id).eq('status', 'requested')
  revalidatePath('/consult/admin')
  return error ? { ok: false, message: `활성화 실패: ${error.message}` } : { ok: true, message: '활성화했습니다.' }
}

export async function rejectRequest(id: string): Promise<Result> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: '잘못된 요청입니다.' }
  const { error } = await (await db()).from('consult_payment_requests').update({ status: 'rejected', note: `반려 ${auth.email}` }).eq('id', id).eq('status', 'requested')
  revalidatePath('/consult/admin')
  return error ? { ok: false, message: `반려 실패: ${error.message}` } : { ok: true, message: '반려했습니다.' }
}

export async function endSubscription(id: string): Promise<Result> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: '잘못된 요청입니다.' }
  const { error } = await (await db()).from('consult_payment_requests').update({ status: 'ended', ends_at: new Date().toISOString() }).eq('id', id).eq('status', 'active')
  revalidatePath('/consult/admin')
  return error ? { ok: false, message: `종료 실패: ${error.message}` } : { ok: true, message: '종료했습니다.' }
}
