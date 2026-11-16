import { notFound } from 'next/navigation'
import { getLead, TOKEN_RE } from '@/lib/consult/leads'
import { isLeadPaid } from '@/lib/consult/lead-pay'
import { SITUATION, SITUATION_NOTE_MAX } from '@/lib/consult/situation'
import { Panel } from '../../../_pub/components/Panel'
import { Hero } from '../../../_pub/components/Hero'
import { PubShell } from '../../../_pub/components/PubShell'
import { PubButton, PubButtonLink } from '../../../_pub/components/Button'

// 유료 상황 질문(v71cq §4): 14개 고르기 + 선택 메모 1개, 5분. 입금 확인 뒤에만 열린다. 선택지는 lib/consult/situation.ts(꼬리표 "상황" 칸과 같은 값 목록).
export const metadata = { title: '상황 질문', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' as const }
export const dynamic = 'force-dynamic'

export default async function SituationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params
  const sp = await searchParams
  if (!TOKEN_RE.test(token)) notFound()
  const lead = await getLead(token)
  if (!lead) notFound()

  if (!(await isLeadPaid(lead.id))) {
    return (
      <PubShell theme="light" footerNote="입금 확인 전에는 열리지 않습니다.">
        <div className="pub-solo">
          <Hero eyebrow="유료본" title="입금이 확인되면 열립니다" lead="유료본을 요청하시고 입금이 확인되면 이 주소에서 상황 질문을 시작하실 수 있습니다." />
          <Panel><div className="pub-actions"><PubButtonLink href={`/d/${token}/paid`} variant="primary" size="lg">유료본 안내로</PubButtonLink></div></Panel>
        </div>
      </PubShell>
    )
  }
  if (lead.situation) {
    return (
      <PubShell theme="light" footerNote="받은 답은 유료본을 만드는 데만 씁니다.">
        <div className="pub-solo">
          <Hero eyebrow="유료본" title="답을 받았습니다" lead="받은 답으로 유료본을 준비합니다. 준비되는 대로 안내해 드립니다." />
          <Panel><div className="pub-actions"><PubButtonLink href={`/d/${token}`} variant="ghost">← 결론서 초안으로</PubButtonLink></div></Panel>
        </div>
      </PubShell>
    )
  }
  const label = SITUATION.find((q) => q.key === sp.error)?.label
  return (
    <PubShell theme="light" footerNote="모든 질문에 답해 주셔야 처방이 정확해집니다. 한 번 보내면 바꿀 수 없습니다.">
      <div className="pub-solo">
        <Hero eyebrow="유료본" title="상황 질문 14개" lead="대부분 고르기입니다. 5분이면 됩니다." />
        {sp.error ? <Panel tone="alert" titleAs="h2" title="확인해 주세요"><p className="pub-text" role="alert">{label ? `「${label}」에 답해 주세요.` : '모든 질문에 답해 주세요.'}</p></Panel> : null}
        <Panel>
          <form className="pub-form" action={`/d/${token}/situation/save`} method="post">
            {SITUATION.map((q) => q.multi ? (
              <fieldset className="pub-fieldset" key={q.key}>
                <legend className="pub-text">{q.label}</legend>
                {q.options.map((o) => <label key={o} className="pub-text"><input type="checkbox" name={q.key} value={o} /> {o}</label>)}
              </fieldset>
            ) : (
              <div className="pub-q" key={q.key}>
                <label className="pub-text" htmlFor={`q-${q.key}`}>{q.label}</label>
                <select className="pub-field" id={`q-${q.key}`} name={q.key} required defaultValue="">
                  <option value="" disabled>고르세요</option>
                  {q.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <label className="pub-text" htmlFor="q-note">꼭 알려 주고 싶은 것(선택)</label>
            <textarea className="pub-field pub-pmf-textarea" id="q-note" name="note" maxLength={SITUATION_NOTE_MAX} autoComplete="off" placeholder="예: 곧 값을 올릴 계획이 있습니다…" />
            <PubButton variant="primary" size="lg">보내기</PubButton>
          </form>
        </Panel>
        <Panel><div className="pub-actions"><PubButtonLink href={`/d/${token}/paid`} variant="ghost">← 유료본 안내</PubButtonLink></div></Panel>
      </div>
    </PubShell>
  )
}
