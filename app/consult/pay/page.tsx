import { redirect } from 'next/navigation'
import { requireConsultUser } from '@/lib/consult/session'
import { db } from '@/lib/consult/runs'
import { PLAN } from '@/lib/consult/period'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButton } from '../../_pub/components/Button'

export const metadata = { title: '유료 이용 — 60초 진단' }
export const dynamic = 'force-dynamic'

const MSG: Record<string, string> = {
  name: '입금자명을 2~20자로 적어 주세요.',
  open: '이미 접수된 요청이 있습니다. 입금 확인 후 활성화됩니다.',
  db: '요청을 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.',
}
const STATUS: Record<string, string> = { requested: '입금 확인 중', active: '이용 중', ended: '종료', rejected: '반려' }

// R9: PG 없이 계좌이체 안내 + 수동 활성화. 계좌 정보는 서버 환경변수에서만 읽는다(코드·리포에 없다).
export default async function PayPage({ searchParams }: { searchParams: Promise<{ run?: string; error?: string; requested?: string; cancelled?: string }> }) {
  const sp = await searchParams
  const auth = await requireConsultUser()
  if (!auth.ok) redirect('/consult/login?next=/consult/pay')
  const { data: rows } = await (await db()).from('consult_payment_requests').select('id,status,requested_at,ends_at,depositor_name,note').eq('owner_email', auth.email).order('requested_at', { ascending: false }).limit(5)
  const bank = process.env.DEPOSIT_BANK_NAME
  const num = process.env.DEPOSIT_ACCOUNT_NUMBER
  const holder = process.env.DEPOSIT_ACCOUNT_HOLDER
  const bankReady = Boolean(bank && num && holder)
  const active = rows?.find((r) => r.status === 'active')

  return (
    <PubShell theme="light" footerNote="입금 확인은 영업일 기준 하루 안에 합니다. 결제 대행(PG)을 쓰지 않습니다.">
      <div className="pub-solo">
        <Hero eyebrow="유료 이용" title={`실행 리포트·에이전트·측정카드 — ${PLAN.label}`} lead="계좌이체로 입금하시면 확인 후 이용을 열어 드립니다." />
        {sp.error && MSG[sp.error] ? <Panel tone="alert" titleAs="h2" title="확인하세요"><p className="pub-text">{MSG[sp.error]}</p></Panel> : null}
        {sp.requested ? <Panel titleAs="h2" title="요청을 접수했습니다"><p className="pub-text">아래 계좌로 입금하시면 확인 후 활성화합니다.</p></Panel> : null}
        {sp.cancelled ? <Panel titleAs="h2" title="해지 요청을 접수했습니다"><p className="pub-text">운영진이 확인 후 종료합니다.</p></Panel> : null}

        <Panel titleAs="h2" title="입금 안내">
          {bankReady ? (
            <ul>
              <li className="pub-text">은행: {bank}</li>
              <li className="pub-text">계좌: {num}</li>
              <li className="pub-text">예금주: {holder}</li>
              <li className="pub-text">금액: {PLAN.amount_krw.toLocaleString('ko-KR')}원</li>
            </ul>
          ) : <p className="pub-text">입금 계좌를 준비 중입니다. 요청을 남기시면 계좌를 따로 안내드립니다.</p>}
        </Panel>

        {active ? (
          <Panel titleAs="h2" title="이용 중입니다">
            <p className="pub-text">{active.ends_at ? `${String(active.ends_at).slice(0, 10)} 까지 이용할 수 있습니다.` : '기간 제한 없이 이용 중입니다.'}</p>
            {active.note ? <p className="pub-caption">{active.note}</p> : (
              <form className="pub-form" action="/api/consult/pay" method="post">
                <input type="hidden" name="action" value="cancel" />
                <PubButton variant="ghost">해지 요청</PubButton>
              </form>
            )}
          </Panel>
        ) : (
          <Panel titleAs="h2" title="결제 요청">
            <form className="pub-form" action="/api/consult/pay" method="post">
              <input type="hidden" name="action" value="request" />
              {sp.run ? <input type="hidden" name="run" value={sp.run} /> : null}
              <label className="pub-text" htmlFor="depositor">입금자명</label>
              <input className="pub-field" id="depositor" name="depositor" required minLength={2} maxLength={20} />
              <PubButton variant="primary" size="lg">요청 남기기</PubButton>
            </form>
          </Panel>
        )}

        {rows && rows.length > 0 ? (
          <Panel titleAs="h2" title="내 요청">
            <ul>{rows.map((r) => <li key={r.id} className="pub-caption">{String(r.requested_at).slice(0, 10)} · {STATUS[r.status] ?? r.status}{r.depositor_name ? ` · ${r.depositor_name}` : ''}</li>)}</ul>
          </Panel>
        ) : null}
      </div>
    </PubShell>
  )
}
