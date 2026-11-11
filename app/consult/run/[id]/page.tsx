import { notFound, redirect } from 'next/navigation'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun, db } from '@/lib/consult/runs'
import { TAGLINE } from '@/lib/consult/tagline'
import type { Ch1 } from '@/lib/consult/report/ch1'
import { PubShell } from '../../../_pub/components/PubShell'
import { Hero } from '../../../_pub/components/Hero'
import { Panel } from '../../../_pub/components/Panel'
import { PubButton } from '../../../_pub/components/Button'

export const metadata = { title: '진단 — 60초 진단' }
export const dynamic = 'force-dynamic'

type Facts = { pages: { url: string; title: string; text: string }[]; thin: boolean; notes: string[] }

// 진단 화면. 0층(무료 4블록)이 있으면 보여 주고, 없으면 수집 요약 + "진단 시작" 버튼.
export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ busy?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const auth = await requireConsultUser()
  if (!auth.ok) redirect(`/consult/login?next=${encodeURIComponent(`/consult/run/${id}`)}`)
  const run = await getRun(id, auth.email)
  if (!run) notFound()
  const sb = await db()
  const [{ data: col }, { data: dg }] = await Promise.all([
    sb.from('consult_collected').select('facts,thin').eq('run_id', id).maybeSingle(),
    sb.from('consult_diagnoses').select('blocks').eq('run_id', id).eq('layer', 0).maybeSingle(),
  ])
  const facts = (col?.facts ?? null) as Facts | null
  const ch = (dg?.blocks ?? null) as Ch1 | null
  const webPages = facts?.pages.filter((p) => p.url !== 'user:one_liner') ?? []

  return (
    <PubShell theme="light" footerNote="진단은 공개된 정보를 근거로 한 추정입니다. 결정은 대표님이 합니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title={ch?.headline ?? run.company_name ?? run.company_url ?? '창업 전 아이디어'} lead={ch ? run.one_liner ?? TAGLINE : TAGLINE} />

        {run.status === 'failed' ? <Panel tone="alert" titleAs="h2" title="처리에 실패했습니다"><p className="pub-text">{run.error}</p></Panel> : null}
        {sp.busy ? <Panel titleAs="h2" title="진단 중입니다"><p className="pub-text">잠시 뒤 새로고침하세요.</p></Panel> : null}

        {ch ? (
          <>
            <Panel titleAs="h2" title={ch.leak_or_gap.kind === 'gap' ? `미개척: ${ch.leak_or_gap.title}` : `누수: ${ch.leak_or_gap.title}`}>
              <p className="pub-text">{ch.leak_or_gap.detail}</p>
            </Panel>
            <Panel titleAs="h2" title={`카테고리 위치: ${ch.position.category}`}>
              <p className="pub-text">{ch.position.where}</p>
              <p className="pub-caption">근거: {ch.position.basis}</p>
            </Panel>
            <Panel titleAs="h2" title="손실 범위">
              <p className="pub-text"><b>월 {ch.loss.low_man.toLocaleString('ko-KR')}~{ch.loss.high_man.toLocaleString('ko-KR')}만원</b></p>
              <p className="pub-caption">산식: {ch.loss.formula}</p>
              <ul>{ch.loss.assumptions.map((a) => <li key={a} className="pub-caption">{a}</li>)}</ul>
              {ch.loss.note ? <p className="pub-caption">{ch.loss.note}</p> : null}
            </Panel>
            {ch.similar.length > 0 ? (
              <Panel titleAs="h2" title="비슷한 회사">
                <ul>{ch.similar.map((s) => <li key={s.name} className="pub-text"><b>{s.name}</b> — {s.what}</li>)}</ul>
              </Panel>
            ) : null}
          </>
        ) : (
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
            <form className="pub-form" action={`/api/consult/runs/${id}/diagnose`} method="post">
              <PubButton variant="primary" size="lg">{run.status === 'failed' ? '진단 다시 시도' : '무료 진단 보기'}</PubButton>
            </form>
          </Panel>
        )}
      </div>
    </PubShell>
  )
}
