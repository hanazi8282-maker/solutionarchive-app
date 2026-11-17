import { PubShell } from './_pub/components/PubShell'
import { Hero } from './_pub/components/Hero'
import { Panel } from './_pub/components/Panel'
import { PubButtonLink } from './_pub/components/Button'

// 없는 화면 — 바깥 손님도 보는 화면이라 손님 말로 쓴다. 첫 화면(`/`)은 로그인한 팀원을 작업 화면으로 보내므로 출구가 하나로 충분하다.
export default function NotFound() {
  return (
    <PubShell theme="light">
      <div className="pub-solo">
        <Hero eyebrow="404" title="없는 화면입니다" lead="주소가 바뀌었거나 잘못 입력됐을 수 있습니다. 첫 화면에서 다시 시작해 주세요." />
        <Panel><div className="pub-actions"><PubButtonLink href="/" variant="primary" size="lg">첫 화면으로</PubButtonLink></div></Panel>
      </div>
    </PubShell>
  )
}
