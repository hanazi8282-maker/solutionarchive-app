import { notFound } from 'next/navigation'
import { db } from '@/lib/consult/runs'
import { CTA } from '@/lib/consult/report/mail'
import type { ReportPayload } from '@/lib/consult/report/compose'
import { Panel } from '../../_pub/components/Panel'
import { PubButtonLink } from '../../_pub/components/Button'
import { ReportView } from '../ReportView'
import { PrintButton } from './PrintButton'

// 결론서 공개 읽기 전용 출구 — 토큰(32자리 hex, 추측 불가)을 아는 사람만 본다. 색인 금지. 로그인 불필요(콜드메일 수신자용).
export const metadata = { title: '결론서', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f]{32}$/.test(token)) notFound()
  const { data, error } = await (await db()).from('consult_reports').select('payload').eq('token', token).maybeSingle()
  if (error) throw new Error(`결론서 조회 실패: ${error.message}`) // 못 읽은 것을 "없음"으로 접지 않는다
  if (!data) notFound()
  return (
    <ReportView
      p={data.payload as ReportPayload}
      top={<div className="pub-actions"><PrintButton /></div>}
      bottom={<Panel><div className="pub-actions"><PubButtonLink href="/consult" variant="primary" size="lg">{CTA}</PubButtonLink></div></Panel>}
    />
  )
}
