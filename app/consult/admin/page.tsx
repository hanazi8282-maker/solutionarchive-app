import { db } from '@/lib/consult/runs'
import { requireAllowedUser } from '@/lib/auth/session'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButton } from '../../_pub/components/Button'
import { activateSubscription, endSubscription, rejectRequest, activateLeadPayment, rejectLeadPayment } from './actions'

export const metadata = { title: '구독 관리 — 60초 진단' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = { requested: '입금 확인 대기', active: '이용 중', ended: '종료', rejected: '반려' }

// 남헌 전용: 입금 확인 뒤 활성화/반려, 이용 중인 구독 종료. proxy 가 허용 목록으로 막고 서버 액션도 requireAllowedUser 를 다시 부른다.
export default async function ConsultAdmin() {
  const auth = await requireAllowedUser()
  if (!auth.ok) return <PubShell theme="light"><Panel tone="alert" titleAs="h2" title="권한 없음"><p className="pub-text">{auth.message}</p></Panel></PubShell>
  const { data: rows, error } = await (await db()).from('consult_payment_requests').select('id,owner_email,depositor_name,status,requested_at,ends_at,note,amount_krw').order('requested_at', { ascending: false }).limit(50)
  const { data: lp } = await (await db()).from('consult_lead_payments').select('id,amount_krw,depositor_name,status,requested_at,consult_leads(email,url)').order('requested_at', { ascending: false }).limit(50)
  type LeadRef = { email: string; url: string } | null

  return (
    <PubShell theme="light" footerNote="입금 내역과 입금자명을 대조한 뒤 활성화하세요. 활성화는 한 달 이용입니다.">
      <div className="pub-solo">
        <Hero eyebrow="운영" title="구독 관리" lead="요청 접수 → 입금 확인 → 활성화 / 반려 / 종료" />
        {error ? <Panel tone="alert" titleAs="h2" title="조회 실패"><p className="pub-text">{error.message}</p></Panel> : null}
        {(rows ?? []).map((r) => (
          <Panel key={r.id} titleAs="h2" title={`${STATUS[r.status] ?? r.status} · ${r.owner_email}`}>
            <p className="pub-text">입금자명 {r.depositor_name ?? '(없음)'} · {Number(r.amount_krw).toLocaleString('ko-KR')}원 · 요청 {String(r.requested_at).slice(0, 10)}{r.ends_at ? ` · 만료 ${String(r.ends_at).slice(0, 10)}` : ''}</p>
            {r.note ? <p className="pub-caption">{r.note}</p> : null}
            {r.status === 'requested' ? (
              <div className="pub-actions">
                <form action={async () => { 'use server'; await activateSubscription(r.id) }}><PubButton variant="primary">입금 확인 · 활성화</PubButton></form>
                <form action={async () => { 'use server'; await rejectRequest(r.id) }}><PubButton variant="ghost">반려</PubButton></form>
              </div>
            ) : null}
            {r.status === 'active' ? (
              <form action={async () => { 'use server'; await endSubscription(r.id) }}><PubButton variant="ghost">종료</PubButton></form>
            ) : null}
          </Panel>
        ))}
        <Hero eyebrow="운영" title="유료본 요청(무료 초안 신청자)" lead="입금 확인 뒤 활성화하면 그 열람 주소에서 상황 질문이 열립니다." />
        {(lp ?? []).map((r) => {
          const l = (Array.isArray(r.consult_leads) ? r.consult_leads[0] : r.consult_leads) as LeadRef
          return (
            <Panel key={r.id} titleAs="h2" title={`${STATUS[r.status] ?? r.status} · ${l?.email ?? "(알 수 없음)"}`}>
              <p className="pub-text">입금자명 {r.depositor_name} · {Number(r.amount_krw).toLocaleString("ko-KR")}원 · 요청 {String(r.requested_at).slice(0, 10)}</p>
              <p className="pub-caption">{l?.url ?? ""}</p>
              {r.status === "requested" ? (
                <div className="pub-actions">
                  <form action={async () => { "use server"; await activateLeadPayment(r.id) }}><PubButton variant="primary">입금 확인 · 활성화</PubButton></form>
                  <form action={async () => { "use server"; await rejectLeadPayment(r.id) }}><PubButton variant="ghost">반려</PubButton></form>
                </div>
              ) : null}
            </Panel>
          )
        })}
        {(lp ?? []).length === 0 ? <Panel titleAs="h2" title="유료본 요청이 없습니다"><p className="pub-text">아직 접수된 요청이 없습니다.</p></Panel> : null}
        {(rows ?? []).length === 0 ? <Panel titleAs="h2" title="요청이 없습니다"><p className="pub-text">접수된 결제 요청이 아직 없습니다.</p></Panel> : null}
      </div>
    </PubShell>
  )
}
