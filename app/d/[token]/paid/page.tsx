import { notFound } from 'next/navigation'
import { getLead, TOKEN_RE } from '@/lib/consult/leads'
import { fmtKrw, getLeadPayments, isPaidStatus, payInstructionsOn, priceOf } from '@/lib/consult/lead-pay'
import { Panel } from '../../../_pub/components/Panel'
import { Hero } from '../../../_pub/components/Hero'
import { PubShell } from '../../../_pub/components/PubShell'
import { PubButton, PubButtonLink } from '../../../_pub/components/Button'

// 유료본 안내·결제 요청(v71cq §3). 값은 ?p=49|99(기본 49). 접수까지만 만든다 — 입금 방법 문구는 LEAD_PAY_INSTRUCTIONS=1 일 때만 보인다(남헌 확인 뒤 켠다).
export const metadata = { title: '유료본 안내', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' as const }
export const dynamic = 'force-dynamic'

const ERR: Record<string, string> = {
  name: '입금자명을 2~20자로 적어 주세요.',
  open: '이미 접수된 요청이 있습니다. 입금 확인 뒤에 열립니다.',
  not_ready: '초안이 준비된 뒤에 요청할 수 있습니다.',
}
const STATUS: Record<string, string> = { requested: '입금 확인 중', active: '이용 가능', ended: '종료', rejected: '반려' }

export default async function PaidPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string; error?: string; requested?: string }> }) {
  const { token } = await params
  const sp = await searchParams
  if (!TOKEN_RE.test(token)) notFound()
  const lead = await getLead(token)
  if (!lead) notFound()
  const price = priceOf(sp.p)
  const pays = await getLeadPayments(lead.id)
  const paid = isPaidStatus(pays)
  const open = pays.find((r) => r.status === 'requested')
  const instr = payInstructionsOn()
  const bank = process.env.DEPOSIT_BANK_NAME
  const num = process.env.DEPOSIT_ACCOUNT_NUMBER
  const holder = process.env.DEPOSIT_ACCOUNT_HOLDER

  return (
    <PubShell theme="light" footerNote="읽고 쓸모없으면 전액 돌려 드립니다. 이유는 묻지 않습니다.">
      <div className="pub-solo">
        <Hero eyebrow="유료본" title="상황 맞춤 처방" lead="귀사 상황을 5분 질문으로 더 받아, 닮은 상황의 사례에서 찾은 처방과 7일 실험 꾸러미를 드립니다." />
        {sp.error && ERR[sp.error] ? <Panel tone="alert" titleAs="h2" title="확인해 주세요"><p className="pub-text" role="alert">{ERR[sp.error]}</p></Panel> : null}
        {sp.requested ? <Panel titleAs="h2" title="요청을 접수했습니다"><p className="pub-text" role="status">입금 확인이 끝나면 상황 질문이 열립니다.</p></Panel> : null}

        <Panel titleAs="h2" title="유료본에 더 들어가는 것">
          <ul>
            <li className="pub-text"><b>상황 맞춤 처방</b> — 닮은 상황의 사례에서 &ldquo;몇 곳이 했고 몇 곳이 됐는지, 안 된 곳은 왜 안 됐는지&rdquo;와 귀사가 따라 할 순서.</li>
            <li className="pub-text"><b>7일 실험 꾸러미</b> — 쓸 문구, 올릴 곳, 합격 기준.</li>
            <li className="pub-text"><b>그만둘 조건</b> — 어디까지 해 보고 멈출지 미리 정합니다.</li>
            <li className="pub-text"><b>실험 뒤 다시 판정 1회</b> — 실험 뒤 숫자를 주시면 다시 판정해 드립니다.</li>
          </ul>
        </Panel>

        <Panel titleAs="h2" title="값과 약속">
          <p className="pub-text">{fmtKrw(price)}원. 읽고 쓸모없으면 전액 돌려 드립니다. 이유는 묻지 않습니다.</p>
        </Panel>

        {paid ? (
          <Panel titleAs="h2" title="입금이 확인됐습니다">
            <p className="pub-text">상황 질문을 시작하세요. 5분이면 됩니다.</p>
            <div className="pub-actions"><PubButtonLink href={`/d/${token}/situation`} variant="primary" size="lg">상황 질문 시작</PubButtonLink></div>
          </Panel>
        ) : (
          <>
            {instr && bank && num && holder ? (
              <Panel titleAs="h2" title="입금 안내">
                <ul>
                  <li className="pub-text">은행: {bank}</li>
                  <li className="pub-text">계좌: {num}</li>
                  <li className="pub-text">예금주: {holder}</li>
                  <li className="pub-text">금액: {fmtKrw(open?.amount_krw ?? price)}원</li>
                </ul>
                <p className="pub-caption">입금하신 뒤 아래에 입금자명을 남겨 주세요.</p>
              </Panel>
            ) : null}
            {open ? (
              <Panel titleAs="h2" title="입금 확인 중입니다">
                <p className="pub-text">{open.depositor_name} 님 요청({fmtKrw(open.amount_krw)}원)을 받았습니다. {instr ? '입금 확인이 끝나면 열립니다.' : '입금 방법은 확인 뒤 따로 안내해 드립니다.'}</p>
              </Panel>
            ) : (
              <Panel titleAs="h2" title="유료본 요청">
                <form className="pub-form" action={`/d/${token}/pay-request`} method="post">
                  <input type="hidden" name="p" value={price === 99000 ? '99' : '49'} />
                  <label className="pub-text" htmlFor="depositor">입금하실 분 이름(입금자명)</label>
                  <input className="pub-field" id="depositor" name="depositor" autoComplete="name" required minLength={2} maxLength={20} placeholder="예: 홍길동…" />
                  <PubButton variant="primary" size="lg">유료본 요청 남기기</PubButton>
                </form>
                {!instr ? <p className="pub-caption">요청을 남기시면 입금 방법을 확인한 뒤 따로 안내해 드립니다. 입금 전에는 아무것도 청구되지 않습니다.</p> : null}
              </Panel>
            )}
            {pays.length > 0 ? <Panel titleAs="h2" title="내 요청"><ul>{pays.map((r) => <li key={r.id} className="pub-caption">{r.requested_at.slice(0, 10)} · {fmtKrw(r.amount_krw)}원 · {STATUS[r.status] ?? r.status}</li>)}</ul></Panel> : null}
          </>
        )}
        <Panel><div className="pub-actions"><PubButtonLink href={`/d/${token}/numbers`} variant="ghost">← 완성본으로</PubButtonLink></div></Panel>
      </div>
    </PubShell>
  )
}
