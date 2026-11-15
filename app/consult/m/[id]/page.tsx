import { notFound, redirect } from 'next/navigation'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun, db } from '@/lib/consult/runs'
import { modesEnabled } from '@/lib/consult/modes'
import type { ModeB } from '@/lib/consult/report/mode-b-validate'
import type { ModeC1 } from '@/lib/consult/report/mode-c1-validate'
import type { ModeC2 } from '@/lib/consult/report/mode-c2-validate'
import { PubShell } from '../../../_pub/components/PubShell'
import { Hero } from '../../../_pub/components/Hero'
import { Panel } from '../../../_pub/components/Panel'
import { PubButtonLink } from '../../../_pub/components/Button'

export const metadata = { title: '결과 — 60초 진단', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const STAGE = ['0 팀-시장', '1 시장-제품', '2 제품-채널', '3 채널-수익', '4 시장 자리']
const VERDICT: Record<string, string> = { 진행: '진행', 조건부_진행: '조건부 진행', 순서_바꿈: '순서 바꿈', 중단: '중단' }

type Exp = { what: string; who: string; n: number; success_metric: string; if_fail: string; checkpoint?: string }

function Experiment({ e, title = '2주 실험' }: { e: Exp; title?: string }) {
  return (
    <Panel title={title} titleAs="h2">
      <ul className="pub-text">
        <li>무엇을: {e.what}</li>
        <li>누구에게: {e.who}</li>
        <li>몇 명: {e.n}</li>
        <li>성공 기준: {e.success_metric}</li>
        <li>실패하면: {e.if_fail}</li>
        {e.checkpoint ? <li>점검 시점: {e.checkpoint}</li> : null}
      </ul>
    </Panel>
  )
}

function Artifacts({ items, planB }: { items: string[]; planB: { name: string; trigger: string } }) {
  return (
    <Panel title="실행 패키지 (복사해서 바로 쓰세요)" titleAs="h2">
      {items.map((a, i) => <pre key={i} className="pub-text" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a}</pre>)}
      <p className="pub-text"><strong>플랜 B:</strong> {planB.name} — 전환 조건: {planB.trigger}</p>
    </Panel>
  )
}

function TwoLine({ known, unknown }: { known: string; unknown: string }) {
  return (
    <Panel>
      <p className="pub-text"><strong>이미 알고 계실 것</strong> {known}</p>
      <p className="pub-text"><strong>모르고 계셨을 것</strong> {unknown}</p>
    </Panel>
  )
}

function Reference({ g }: { g: { count: number; note: string } }) {
  return (
    <Panel title="비슷한 사례(근거)" titleAs="h2">
      <p className="pub-text">{g.count < 10 ? `근거 부족 — 확인된 사례 ${g.count}건입니다. 아래는 참고용입니다.` : `확인된 사례 ${g.count}건 기준입니다.`}</p>
      <p className="pub-text">{g.note}</p>
    </Panel>
  )
}

export default async function ModeResult({ params }: { params: Promise<{ id: string }> }) {
  if (!modesEnabled()) notFound()
  const { id } = await params
  const auth = await requireConsultUser()
  if (!auth.ok) redirect(`/consult/login?next=${encodeURIComponent(`/consult/m/${id}`)}`)
  const run = await getRun(id, auth.email) // owner_email 이 다르면 null → 404: 다른 사람의 결과는 URL 을 알아도 열리지 않는다.
  if (!run) notFound()
  const { data } = await (await db()).from('consult_mode_results').select('mode,output').eq('run_id', id).maybeSingle()
  if (!data) {
    return (
      <PubShell theme="light" footerNote="결과가 없습니다.">
        <div className="pub-solo">
          <Hero eyebrow="결과" title="결과가 아직 없습니다" lead={run.status === 'failed' ? '생성에 실패했습니다. 다시 시도해 주세요.' : '생성 중이거나 만들어지지 않았습니다.'} />
          <div className="pub-actions"><PubButtonLink href="/consult/start" variant="primary" size="lg">처음으로</PubButtonLink></div>
        </div>
      </PubShell>
    )
  }
  const mode = data.mode as 'b' | 'c1' | 'c2'
  return (
    <PubShell theme="light" footerNote="결과는 공개된 정보와 수집된 사례를 근거로 한 판단 재료입니다. 확률 예측은 검증 전이라 싣지 않았습니다. 결정은 대표님이 합니다.">
      <div className="pub-solo">
        {mode === 'b' ? <ModeBView o={data.output as ModeB} /> : mode === 'c1' ? <ModeC1View o={data.output as ModeC1} /> : <ModeC2View o={data.output as ModeC2} />}
        <div className="pub-actions"><PubButtonLink href="/consult/start" variant="outline" size="lg">다른 모드 해보기</PubButtonLink></div>
      </div>
    </PubShell>
  )
}

function ModeBView({ o }: { o: ModeB }) {
  return (
    <>
      <Hero eyebrow="결정 검증" title={`판정: ${VERDICT[o.verdict] ?? o.verdict}`} lead={o.verdict_reason} />
      <TwoLine {...o.two_line} />
      <Panel title="반대 증거 먼저 — 사전 부검" titleAs="h2">
        <p className="pub-text">6개월 뒤 이 결정이 실패했다면 이유입니다.</p>
        <ol className="pub-text">{o.premortem.map((p, i) => <li key={i}>{p}</li>)}</ol>
      </Panel>
      <Panel title="이 결정이 고치려는 다리" titleAs="h2">
        <p className="pub-text">고치려는 곳: {STAGE[o.target_stage]}</p>
        <p className="pub-text">{o.blocked_earlier_stage == null ? '그보다 앞에 비어 있는 다리는 확인되지 않았습니다.' : `먼저 비어 있는 다리: ${STAGE[o.blocked_earlier_stage]} — 이것부터 고쳐야 이 결정의 효과를 알 수 있습니다.`}</p>
      </Panel>
      <Reference g={o.reference_group} />
      <Panel title="이 판정이 틀렸다고 볼 조건" titleAs="h2"><p className="pub-text">{o.falsifiable_condition}</p></Panel>
      <Experiment e={o.execution_package.experiment} />
      <Artifacts items={o.execution_package.artifacts} planB={o.execution_package.plan_b} />
      <Panel title="그만둘 조건" titleAs="h2"><p className="pub-text">{o.kill_condition}</p></Panel>
      {o.loss_and_cost ? <Panel title="하지 않으면 잃는 것 · 드는 비용" titleAs="h2"><p className="pub-text">{o.loss_and_cost}</p></Panel> : null}
    </>
  )
}

function ModeC1View({ o }: { o: ModeC1 }) {
  const label = (id: string) => ({ 'G0.1': '고객·고통 서술', 'G0.2': '반증 가능한 가설', 'G0.3': '지불 의사 증거', 'G0.4': '가격-채널 맞음', 'G0.5': '기저율 확인', 'G0.6': '왜 지금' }[id] ?? id)
  return (
    <>
      <Hero eyebrow="아이디어 검증" title={`가장 먼저 끊긴 다리: ${STAGE[o.blocked_stage]}`} lead={o.secondary_blocked_stage != null ? `그다음: ${STAGE[o.secondary_blocked_stage]}` : undefined} />
      <TwoLine {...o.two_line} />
      <Reference g={o.reference_group} />
      <Panel title="게이트 6개" titleAs="h2">
        <ul className="pub-text">{o.gates.map((g) => <li key={g.id}>{g.color} {label(g.id)} — {g.reason}</li>)}</ul>
      </Panel>
      <Experiment e={o.experiment} title="지금 당장 할 실험 1개 (2주)" />
      <Artifacts items={o.execution_package.artifacts} planB={o.execution_package.plan_b} />
      <Panel title="접어야 할 조건" titleAs="h2"><p className="pub-text">{o.give_up_condition}</p></Panel>
      {o.loss_and_cost ? <Panel title="하지 않으면 잃는 것 · 드는 비용" titleAs="h2"><p className="pub-text">{o.loss_and_cost}</p></Panel> : null}
    </>
  )
}

function ModeC2View({ o }: { o: ModeC2 }) {
  const top = o.candidates[o.top_pick.index]
  return (
    <>
      <Hero eyebrow="새 아이디어 추천" title={`1순위: ${top.name}`} lead={o.top_pick.reason} />
      <TwoLine {...o.two_line} />
      <Panel title="본인 조건" titleAs="h2"><p className="pub-text">{o.conditions_summary}</p></Panel>
      <Panel title="제외한 분야와 이유" titleAs="h2"><ul className="pub-text">{o.excluded.map((e, i) => <li key={i}>{e.area} — {e.reason}</li>)}</ul></Panel>
      {o.candidates.map((c, i) => (
        <Panel key={i} title={`후보 ${i + 1}${i === o.top_pick.index ? ' (1순위)' : ''}: ${c.name}`} titleAs="h2">
          <ul className="pub-text">
            <li>왜 지금: {c.why_now}</li>
            <li>누가: {c.who}</li>
            <li>얼마에: {c.price}</li>
            <li>어떻게 팔고: {c.how_to_sell}</li>
            <li>첫 10명 어디서: {c.first_ten}</li>
            <li>참조 사례: {c.reference_cases.length ? c.reference_cases.join(', ') : '근거 부족 — 사례 은행에서 확인된 사례가 없습니다'}</li>
            <li>실패 사례: {c.failure_case ?? '확인된 실패 사례 없음'}</li>
            <li>막혀 있지 않다는 확인: {c.killed_bridges.join(' / ')}</li>
            <li>첫 2주 실험: {c.experiment.what} (대상 {c.experiment.who}, {c.experiment.n}명, 성공 기준 {c.experiment.success_metric}, 실패하면 {c.experiment.if_fail}{c.experiment.checkpoint ? `, 점검 시점 ${c.experiment.checkpoint}` : ''})</li>
          </ul>
        </Panel>
      ))}
      <Panel title="접어야 할 조건 (1순위)" titleAs="h2"><p className="pub-text">{o.top_pick.give_up_condition}</p>{o.top_pick.loss_and_cost ? <p className="pub-text"><strong>하지 않으면 잃는 것 · 드는 비용:</strong> {o.top_pick.loss_and_cost}</p> : null}</Panel>
      <Artifacts items={o.execution_package.artifacts} planB={o.execution_package.plan_b} />
    </>
  )
}
