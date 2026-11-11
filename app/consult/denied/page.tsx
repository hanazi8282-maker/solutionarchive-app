import Link from 'next/link'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'

export const metadata = { title: '접근할 수 없습니다 — 60초 진단', robots: { index: false } }

// 컨설팅 영역의 권한 없음 안내(v71ck 6). 운영진 전용 화면(/consult/admin)에 권한 없이 들어온 경우 내부 로그인으로 보내지 않고 여기로 온다.
export default function ConsultDenied() {
  return (
    <PubShell theme="light" footerNote="운영진 전용 화면입니다. 진단은 로그인 후 바로 이용하실 수 있습니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title="이 화면은 운영진만 볼 수 있습니다" lead="진단과 결제 안내는 아래에서 이어가세요." />
        <Panel titleAs="h2" title="어디로 갈까요">
          <p className="pub-text"><Link href="/consult/login">로그인하고 진단 받기</Link> · <Link href="/consult">60초 진단 소개로 돌아가기</Link></p>
        </Panel>
      </div>
    </PubShell>
  )
}
