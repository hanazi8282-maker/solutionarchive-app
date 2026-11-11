import { TAGLINE } from '@/lib/consult/tagline'
import { getConsultUser } from '@/lib/consult/session'
import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubButtonLink } from '../_pub/components/Button'

export const metadata = { title: '60초 진단 — 솔루션아카이브' }

// 컨설팅 MVP 랜딩(v71ci R0). 로그인 없이 열린다. 단계: 0층 무료 진단 → 1층 해금 → 유료(결정 메모·에이전트·주간 갱신·측정 카드).
export default async function ConsultLanding() {
  const u = await getConsultUser()
  const signedIn = u.kind === 'ok'
  return (
    <PubShell theme="light" footerNote="진단은 공개된 정보와 수집된 사례를 근거로 합니다. 결과는 판단 재료이고, 결정은 대표님이 합니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title={TAGLINE} lead="회사 주소와 한 줄 설명만 넣으세요. 무료로 한 줄 진단과 손실 범위(산식 포함)를 보여 드립니다." />
        <Panel>
          <div className="pub-actions">
            <PubButtonLink href={signedIn ? '/consult/new' : '/consult/login?next=/consult/new'} variant="primary" size="lg">
              {signedIn ? '진단 시작하기' : '로그인하고 진단 시작하기'}
            </PubButtonLink>
          </div>
        </Panel>
      </div>
    </PubShell>
  )
}
