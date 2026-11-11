import { notFound } from 'next/navigation'
import { db } from '@/lib/consult/runs'
import { TAGLINE } from '@/lib/consult/tagline'
import { CTA } from '@/lib/consult/report/mail'
import type { ReportPayload } from '@/lib/consult/report/compose'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButtonLink } from '../../_pub/components/Button'
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
  const p = data.payload as ReportPayload
  const c1 = p.ch1

  return (
    <PubShell theme="light" footerNote="공개된 정보를 근거로 한 추정입니다. 결정은 대표님이 합니다.">
      <div className="pub-solo">
        <Hero eyebrow={`${p.company} 결론서`} title={c1.headline} lead={TAGLINE} />
        <div className="pub-actions"><PrintButton /></div>

        <Panel titleAs="h2" title="1. 진단">
          <p className="pub-text"><b>{c1.leak_or_gap.kind === 'gap' ? '미개척' : '누수'}: {c1.leak_or_gap.title}</b></p>
          <p className="pub-text">{c1.leak_or_gap.detail}</p>
          <p className="pub-text"><b>카테고리 위치: {c1.position.category}</b> — {c1.position.where}</p>
          <p className="pub-caption">근거: {c1.position.basis}</p>
          {c1.similar.length > 0 ? (<><p className="pub-text"><b>비슷한 회사</b></p><ul>{c1.similar.map((s) => <li key={s.name} className="pub-caption"><b>{s.name}</b> — {s.what}</li>)}</ul></>) : null}
          <p className="pub-text"><b>손실 범위: 월 {c1.loss.low_man.toLocaleString('ko-KR')}~{c1.loss.high_man.toLocaleString('ko-KR')}만원</b></p>
          <p className="pub-caption">산식: {c1.loss.formula}</p>
          <ul>{c1.loss.assumptions.map((a) => <li key={a} className="pub-caption">{a}</li>)}</ul>
        </Panel>

        {p.ch2 ? (
          <Panel titleAs="h2" title="2. 결정 메모">
            <p className="pub-text"><b>{p.ch2.decision}</b></p>
            {p.ch2.options.map((o) => <p key={o.name} className="pub-caption"><b>{o.name}</b> — 장점: {o.pros} / 단점: {o.cons}</p>)}
            <p className="pub-text">권고: {p.ch2.recommendation.choice}</p>
            <ul>{p.ch2.recommendation.reasons.map((r) => <li key={r} className="pub-caption">{r}</li>)}</ul>
            <p className="pub-caption">이럴 때는 결정을 바꾸세요: {p.ch2.recommendation.change_mind_if.join(' / ')}</p>
            {p.ch2.risks.map((r) => <p key={r.risk} className="pub-caption">위험: {r.risk} → {r.mitigation}</p>)}
            <p className="pub-text"><b>액션플랜</b></p>
            <ol>{p.ch2.actionplan.map((a) => <li key={a.step} className="pub-caption">{a.step} (끝난 기준: {a.done_when})</li>)}</ol>
          </Panel>
        ) : null}

        {p.ch3to6 ? (
          <>
            <Panel titleAs="h2" title="3. 발전 방향 후보">
              {p.ch3to6.candidates.map((c, i) => (
                <div key={c.title}>
                  <p className="pub-text"><b>후보 {i + 1}. {c.title}</b></p>
                  <p className="pub-text">{c.what}</p>
                  <p className="pub-caption">근거: {c.why}</p>
                  <p className="pub-caption">반박: {c.rebuttal}</p>
                </div>
              ))}
            </Panel>
            <Panel titleAs="h2" title="4. 고객의 고객">
              {p.ch3to6.customers.map((c) => <p key={c.who} className="pub-text"><b>{c.who}</b> — 필요: {c.need} / 닿는 방법: {c.reach}</p>)}
            </Panel>
            <Panel titleAs="h2" title="5. 경쟁 지도">
              {p.ch3to6.competitors.map((c) => <p key={c.name} className="pub-text"><b>{c.name}</b> ({c.kind}) <span className="pub-caption">근거: {c.basis}</span></p>)}
            </Panel>
            <Panel titleAs="h2" title="6. 걸림돌">
              {p.ch3to6.obstacles.map((o) => <p key={o.obstacle} className="pub-text"><b>{o.obstacle}</b> — 근거: {o.evidence} / 대응: {o.handle}</p>)}
            </Panel>
          </>
        ) : null}

        <Panel titleAs="h2" title="부록">
          <p className="pub-caption">{p.appendix.note}</p>
          {p.appendix.sources.length > 0 ? <ul>{p.appendix.sources.map((u) => <li key={u} className="pub-caption">{u}</li>)}</ul> : null}
          <p className="pub-caption">작성 {p.generated_at.slice(0, 10)}</p>
        </Panel>

        <Panel>
          <div className="pub-actions"><PubButtonLink href="/consult" variant="primary" size="lg">{CTA}</PubButtonLink></div>
        </Panel>
      </div>
    </PubShell>
  )
}
