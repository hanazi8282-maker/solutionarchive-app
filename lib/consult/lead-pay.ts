// 무료 초안 신청자의 유료본 결제 요청·상황 질문(v71cq §3·§4). PG 없음 — 계좌이체를 남헌이 확인해 /consult/admin 에서 활성화한다.
// 입금 확인(활성화) 전에는 유료 기능(상황 질문)이 열리지 않는다 — 열림 판정은 isLeadPaid 한 곳이다.
import { db } from './runs.ts'
import { cleanDepositor } from './period.ts'
import type { LeadRow } from './leads.ts'
import type { SituationAnswers } from './situation.ts'

/** 값 시험(?p=49|99): 다른 값은 기본 49. 손님 화면과 저장 금액이 같은 값을 쓴다. */
export const priceOf = (p: unknown): 49000 | 99000 => (String(p ?? '') === '99' ? 99000 : 49000)
export const fmtKrw = (n: number) => n.toLocaleString('ko-KR')

/** 입금 방법 안내 문구는 남헌 확인 뒤에 켠다(사업자 등록·통신판매 신고 판단 전) — 기본 꺼짐. */
export const payInstructionsOn = () => process.env.LEAD_PAY_INSTRUCTIONS === '1'

export type LeadPayment = { id: string; amount_krw: number; depositor_name: string; status: 'requested' | 'active' | 'ended' | 'rejected'; requested_at: string }

export const isPaidStatus = (rows: Pick<LeadPayment, 'status'>[]) => rows.some((r) => r.status === 'active')

export async function getLeadPayments(leadId: string): Promise<LeadPayment[]> {
  const { data, error } = await (await db()).from('consult_lead_payments').select('id,amount_krw,depositor_name,status,requested_at').eq('lead_id', leadId).order('requested_at', { ascending: false })
  if (error) throw new Error(`결제 조회 실패: ${error.message}`) // 확인 못 한 것을 "미결제"로 접지 않는다
  return (data ?? []) as LeadPayment[]
}

export async function isLeadPaid(leadId: string): Promise<boolean> {
  return isPaidStatus(await getLeadPayments(leadId))
}

/** 결제 요청 접수. 열린 요청(요청·활성)이 있으면 새로 만들지 않는다. 반환: 'ok' | 'open' | 'name'. */
export async function requestLeadPayment(lead: Pick<LeadRow, 'id' | 'status'>, amount: 49000 | 99000, depositorRaw: unknown): Promise<'ok' | 'open' | 'name' | 'not_ready'> {
  if (lead.status !== 'ready') return 'not_ready'
  let depositor: string
  try { depositor = cleanDepositor(depositorRaw) } catch { return 'name' }
  const rows = await getLeadPayments(lead.id)
  if (rows.some((r) => r.status === 'requested' || r.status === 'active')) return 'open'
  const { error } = await (await db()).from('consult_lead_payments').insert({ lead_id: lead.id, amount_krw: amount, depositor_name: depositor })
  if (error) throw new Error(`결제 요청 저장 실패: ${error.message}`)
  return 'ok'
}

/** 상황 답 저장 — 한 번만(이미 있으면 덮어쓰지 않는다). 반환: 저장했으면 true. */
export async function saveSituationAnswers(token: string, answers: SituationAnswers): Promise<boolean> {
  const { data, error } = await (await db()).from('consult_leads').update({ situation: answers, situation_at: new Date().toISOString() }).eq('token', token).is('situation', null).select('id')
  if (error) throw new Error(`상황 답 저장 실패: ${error.message}`)
  return (data?.length ?? 0) > 0
}
