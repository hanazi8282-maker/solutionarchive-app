import { notFound, redirect } from 'next/navigation'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun, db } from '@/lib/consult/runs'
import { TAGLINE } from '@/lib/consult/tagline'
import { PubShell } from '../../../_pub/components/PubShell'
import { Hero } from '../../../_pub/components/Hero'
import { Panel } from '../../../_pub/components/Panel'

export const metadata = { title: '진단 — 60초 진단' }
export const dynamic = 'force-dynamic'

type Facts = { pages: { url: string; title: string; text: string }[]; thin: boolean; notes: string[] }

// 진단 결과 화면(R2 시점: 수집 결과 요약까지. R3 에서 0층 4블록이 이 자리에 붙는다).
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireConsultUser()
  if (!auth.ok) redirect(`/consult/login?next=${encodeURIComponent(`/consult/run/${id}`)}`)
  const run = await getRun(id, auth.email)
  if (!run) notFound()
  const { data } = await (await db()).from('consult_collected').select('facts,thin').eq('run_id', id).maybeSingle()
  const facts = (data?.facts ?? null) as Facts | null
  const webPages = facts?.pages.filter((p) => p.url !== 'user:one_liner') ?? []

  return (
    <PubShell theme="light" footerNote="수집은 공개된 페이지만, robots.txt 를 지켜 읽습니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title={run.company_name ?? run.company_url ?? '창업 전 아이디어'} lead={TAGLINE} />
        {run.status === 'failed' ? <Panel tone="alert" titleAs="h2" title="수집에 실패했습니다"><p className="pub-text">{run.error}</p></Panel> : null}
        <Panel titleAs="h2" title="수집한 정보">
          <p className="pub-text">{run.one_liner}</p>
          {facts ? (
            <>
              <p className="pub-caption">
                {webPages.length > 0 ? `공개 페이지 ${webPages.length}곳을 읽었습니다.` : '읽은 공개 페이지가 없어 한 줄 설명만으로 진단합니다.'}
                {facts.thin ? ' 정보가 얇은 회사로 분류했습니다.' : ''}
              </p>
              {facts.notes.map((n) => <p key={n} className="pub-caption">{n}</p>)}
            </>
          ) : <p className="pub-caption">수집 결과가 없습니다.</p>}
        </Panel>
      </div>
    </PubShell>
  )
}
