import { notFound } from 'next/navigation'
import { db } from '@/lib/consult/runs'
import { getLead, hostOf, TOKEN_RE } from '@/lib/consult/leads'
import type { ReportPayload } from '@/lib/consult/report/compose'
import { Panel } from '../../_pub/components/Panel'
import { Hero } from '../../_pub/components/Hero'
import { PubShell } from '../../_pub/components/PubShell'
import { PubButtonLink } from '../../_pub/components/Button'
import { ReportView } from '../../r/ReportView'
import { PrintButton } from '@/app/r/[token]/PrintButton'
import { Starter } from './Starter'
import { Tracker } from './Tracker'

// 비공개 열람 화면(v71co 개정 §2-3): 추측 불가 주소(32자리 hex) · 검색 제외 · 로그인 없음 · PDF 저장 · 열람·깊이 기록 · 맨 아래 다음 단계 단추 하나.
export const metadata = { title: '결론서 초안', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' as const }
export const dynamic = 'force-dynamic'

export default async function LeadView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!TOKEN_RE.test(token)) notFound()
  const lead = await getLead(token)
  if (!lead) notFound()
  const host = hostOf(lead.url)

  if (lead.status === 'queued' || lead.status === 'generating') {
    const stale = lead.status === 'generating' && lead.gen_started_at !== null && Date.now() - new Date(lead.gen_started_at).getTime() > 8 * 60000
    return (
      <PubShell theme="light" footerNote="이 화면은 받으신 분만 아는 주소입니다. 창을 닫아도 만들기는 계속됩니다.">
        <div className="pub-solo">
          <Hero eyebrow="무료 초안" title={`${host} 결론서 초안을 만드는 중입니다`} lead="공개된 페이지를 읽고 쓰는 데 보통 2~4분 걸립니다. 이 화면은 저절로 바뀝니다." />
          <Panel titleAs="h2" title="지금 하는 일"><p className="pub-text" role="status">서비스 화면과 가격표, 비슷한 서비스를 읽고 있습니다. 이 주소를 북마크해 두시면 나중에 다시 열 수 있습니다.</p></Panel>
          <Starter token={token} start={lead.status === 'queued' || stale} />
        </div>
      </PubShell>
    )
  }
  if (lead.status === 'failed') {
    return (
      <PubShell theme="light" footerNote="실패한 신청은 하루 접수 수에 다시 들어가지 않습니다.">
        <div className="pub-solo">
          <Hero eyebrow="무료 초안" title="초안을 만들지 못했습니다" lead={lead.error === 'cost_cap' ? '오늘 만들 수 있는 초안을 모두 만들었습니다. 내일 다시 신청해 주세요.' : '주소의 공개 페이지를 읽지 못했을 수 있습니다. 주소를 확인하고 잠시 뒤 다시 신청해 주세요.'} />
          <Panel><div className="pub-actions"><PubButtonLink href="/#start" variant="primary" size="lg">다시 신청하기</PubButtonLink></div></Panel>
        </div>
      </PubShell>
    )
  }

  const { data, error } = await (await db()).from('consult_reports').select('payload').eq('token', lead.report_token ?? '').maybeSingle()
  if (error) throw new Error(`결론서 조회 실패: ${error.message}`) // 못 읽은 것을 "없음"으로 접지 않는다
  if (!data) throw new Error('결론서가 없습니다') // ready 인데 본문이 없으면 오류 화면(app/error.tsx)
  const done = lead.completion_status === 'ready'
  return (
    <>
      <Tracker token={token} />
      <ReportView
        p={data.payload as ReportPayload}
        top={<div className="pub-actions"><PrintButton /></div>}
        bottom={
          <Panel titleAs="h2" title={done ? '완성본이 준비돼 있습니다' : '다음: 숫자 3개로 완성본 받기'}>
            <p className="pub-text">{done ? '입력하신 숫자로 다시 계산한 완성본을 볼 수 있습니다.' : '위 진단에서 가정으로 둔 숫자를 실제 숫자로 바꿔 손님이 새는 곳을 다시 판정해 드립니다. 1분이면 됩니다. 무료입니다.'}</p>
            <div className="pub-actions"><PubButtonLink href={`/d/${token}/numbers`} variant="primary" size="lg">{done ? '완성본 보기' : '숫자 입력하고 완성본 받기'}</PubButtonLink></div>
          </Panel>
        }
      />
    </>
  )
}
