import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButtonLink } from '../../_pub/components/Button'

// 없는 열람 주소(잘못 옮겨 적은 경우 포함). 주소를 맞춰 볼 수 있게 안내하고, 첫 화면으로 돌아가는 단추 하나.
export const metadata = { title: '열람 주소를 찾을 수 없습니다', robots: { index: false, follow: false } }

export default function LeadNotFound() {
  return (
    <PubShell theme="light" footerNote="받으신 메일의 주소를 그대로 복사해 열어 보세요.">
      <div className="pub-solo">
        <Hero eyebrow="열람 주소" title="이 주소의 초안을 찾지 못했습니다" lead="주소가 중간에 잘렸거나 한 글자가 다를 수 있습니다. 받으신 메일의 주소를 그대로 다시 열어 보시고, 그래도 안 열리면 첫 화면에서 새로 신청해 주세요." />
        <Panel><div className="pub-actions"><PubButtonLink href="/" variant="primary" size="lg">첫 화면으로</PubButtonLink></div></Panel>
      </div>
    </PubShell>
  )
}
