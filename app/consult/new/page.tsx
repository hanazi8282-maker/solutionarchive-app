import { TAGLINE } from '@/lib/consult/tagline'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButton } from '../../_pub/components/Button'

export const metadata = { title: '진단 시작 — 60초 진단' }

const MSG: Record<string, string> = {
  liner: '한 줄 설명을 10자 이상 적어 주세요.',
  url: '회사 주소를 확인해 주세요(https://로 시작하는 공개 주소만 가능합니다).',
}

// R1 입력 화면: 회사 URL + 한 줄 설명. 창업 전이면 주소 없이 아이디어만(kind=idea, T12).
export default async function ConsultNew({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams
  return (
    <PubShell theme="light" footerNote="입력하신 내용은 본인 계정에만 저장됩니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title="어떤 사업인가요?" lead={TAGLINE} />
        {sp.error && MSG[sp.error] ? <Panel tone="alert" titleAs="h2" title="입력을 확인하세요"><p className="pub-text">{MSG[sp.error]}</p></Panel> : null}
        <Panel>
          <form className="pub-form" action="/api/consult/runs" method="post">
            <label className="pub-text" htmlFor="kind">상태</label>
            <select className="pub-field" id="kind" name="kind" defaultValue="company">
              <option value="company">운영 중인 회사</option>
              <option value="idea">창업 전 아이디어</option>
            </select>
            <label className="pub-text" htmlFor="name">회사 또는 서비스 이름(선택)</label>
            <input className="pub-field" id="name" name="name" maxLength={80} />
            <label className="pub-text" htmlFor="url">회사 주소(운영 중이면 필수)</label>
            <input className="pub-field" id="url" name="url" inputMode="url" placeholder="https://example.com" maxLength={300} />
            <label className="pub-text" htmlFor="one_liner">한 줄 설명</label>
            <textarea className="pub-field pub-pmf-textarea" id="one_liner" name="one_liner" required minLength={10} maxLength={600} placeholder="누구의 어떤 문제를 어떻게 푸는 사업인가요?" />
            <PubButton variant="primary" size="lg">진단 시작</PubButton>
          </form>
        </Panel>
      </div>
    </PubShell>
  )
}
