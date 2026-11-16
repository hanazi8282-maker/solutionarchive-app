import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubButton, PubButtonLink } from '../_pub/components/Button'
import { OPTOUT_REASONS } from '@/lib/consult/optout'

// 수신 거부 화면(v71cq §2-2) — 메일 끝 거부 문구가 여는 곳. 주소는 URL 에 싣지 않고 여기서 적는다(개인정보를 주소창에 두지 않는다).
export const metadata = { title: '수신 거부 — 솔루션아카이브', robots: { index: false, follow: true } }
export const dynamic = 'force-dynamic'

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams
  if (sp.done) {
    return (
      <PubShell theme="light" footerNote="거부한 주소는 이후 초안 신청과 메일 발송 명단에서 자동으로 빠집니다.">
        <div className="pub-solo">
          <Hero eyebrow="수신 거부" title="처리했습니다" lead="이 주소로는 더 이상 메일을 보내지 않습니다. 이미 만들어진 초안은 그대로 있으니, 지우고 싶으시면 개인정보 안내의 방법으로 요청해 주세요." />
          <Panel><div className="pub-actions"><PubButtonLink href="/" variant="ghost">첫 화면으로</PubButtonLink><PubButtonLink href="/privacy" variant="ghost">개인정보 안내</PubButtonLink></div></Panel>
        </div>
      </PubShell>
    )
  }
  return (
    <PubShell theme="light" footerNote="적어 주신 주소와 이유(선택)만 저장합니다. 이유는 비워 두셔도 됩니다.">
      <div className="pub-solo">
        <Hero eyebrow="수신 거부" title="더 이상 메일을 받지 않겠습니다" lead="메일을 받은 주소를 적어 주세요. 바로 발송 명단에서 뺍니다." />
        {sp.error ? <Panel tone="alert" titleAs="h2" title="확인해 주세요"><p className="pub-text" role="alert">{sp.error === 'email' ? '메일 주소를 확인해 주세요.' : '접수하지 못했습니다. 잠시 뒤 다시 시도하거나, 받은 메일에 "수신 거부"라고 답장해 주세요.'}</p></Panel> : null}
        <Panel>
          <form className="pub-form" action="/d/optout" method="post">
            <label className="pub-text" htmlFor="oo-email">메일 주소</label>
            <input className="pub-field" id="oo-email" name="email" type="email" autoComplete="email" spellCheck={false} required maxLength={254} placeholder="you@company.com…" />
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
              <label htmlFor="oo-web">웹사이트</label>
              <input id="oo-web" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            <label className="pub-text" htmlFor="oo-reason">이유(선택)</label>
            <select className="pub-field" id="oo-reason" name="reason" defaultValue="">
              <option value="">말씀하지 않겠습니다</option>
              {Object.entries(OPTOUT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <PubButton variant="primary" size="lg">수신 거부하기</PubButton>
          </form>
        </Panel>
      </div>
    </PubShell>
  )
}
