import { notFound } from 'next/navigation'
import { ageMin, funnel, getLead, hostOf, PAINS, SOURCES, stageLabel, TOKEN_RE, TRIED } from '@/lib/consult/leads'
import { Panel } from '../../../_pub/components/Panel'
import { Hero } from '../../../_pub/components/Hero'
import { PubShell } from '../../../_pub/components/PubShell'
import { PubButton, PubButtonLink } from '../../../_pub/components/Button'
import { Starter } from '../Starter'

// 완성본 입력(v71co 개정 §2-4): 숫자 3개 + 고르기 3개, 1분. 내면 완성본(숫자로 다시 계산한 판정과 새 손님 길 3개).
export const metadata = { title: '완성본 — 숫자 3개', robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' as const }
export const dynamic = 'force-dynamic'

const ERR: Record<string, string> = {
  nums: '세 칸 모두 0 이상의 정수로 적어 주세요(방문은 1 이상).',
  order: '방문 ≥ 가입 ≥ 유료 손님 순서가 맞아야 합니다. 숫자를 다시 확인해 주세요.',
  choice: '고르기 질문 세 개에 모두 답해 주세요(해 본 것은 하나 이상).',
}

export default async function NumbersPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params
  const sp = await searchParams
  if (!TOKEN_RE.test(token)) notFound()
  const lead = await getLead(token)
  if (!lead) notFound()
  const host = hostOf(lead.url)
  const back = (
    <Panel><div className="pub-actions"><PubButtonLink href={`/d/${token}`} variant="ghost">← 결론서 초안으로</PubButtonLink></div></Panel>
  )

  if (lead.status !== 'ready') {
    return (<PubShell theme="light"><div className="pub-solo"><Hero eyebrow="완성본" title="초안이 아직 준비되지 않았습니다" lead="초안이 끝나면 이 화면에서 숫자를 받을 수 있습니다." />{back}</div></PubShell>)
  }

  const c = lead.completion
  if (c && lead.completion_status === 'generating' && ageMin(lead.completion_at) < 5) {
    return (
      <PubShell theme="light" footerNote="창을 닫아도 만들기는 계속됩니다.">
        <div className="pub-solo">
          <Hero eyebrow="완성본" title="입력하신 숫자로 다시 계산하는 중입니다" lead="보통 1분 안에 끝납니다. 이 화면은 저절로 바뀝니다." />
          <Starter token={token} start={false} />
        </div>
      </PubShell>
    )
  }

  if (c && lead.completion_status === 'ready' && lead.completion_result) {
    const r = lead.completion_result
    const f = funnel(c)
    return (
      <PubShell theme="light" footerNote="입력하신 숫자와 공개된 정보로만 계산했습니다. 결정은 대표님이 합니다.">
        <div className="pub-solo">
          <Hero eyebrow={`${host} 완성본`} title={`손님이 새는 곳: ${stageLabel(r.stage)}`} lead={r.reason} />
          <Panel titleAs="h2" title="입력하신 숫자로 본 길">
            <p className="pub-text">한 달 방문 {c.visits.toLocaleString('ko-KR')} → 가입 {c.signups.toLocaleString('ko-KR')} → 유료 손님 {c.paid.toLocaleString('ko-KR')}</p>
            <p className="pub-caption">방문 → 가입 {f.visitToSignup ?? '계산 불가'}% · 가입 → 유료 {f.signupToPaid ?? '계산 불가'}% · 방문 → 유료 {f.visitToPaid ?? '계산 불가'}% (입력하신 숫자의 나눗셈입니다)</p>
          </Panel>
          <Panel titleAs="h2" title="새 손님을 데려올 길 3개 (귀사에 맞춰 순서를 매겼습니다)">
            <ol>
              {r.paths.map((p) => (
                <li key={p.title}>
                  <p className="pub-text"><b>{p.title}</b> — {p.why}</p>
                  <p className="pub-caption">이번 주 첫 일: {p.first_step}</p>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel titleAs="h2" title="유료본에서 더 받는 것">
            <p className="pub-text">귀사 상황(대상 손님·값·쓸 수 있는 시간과 돈·해 본 것)을 5분 질문으로 더 받으면, 닮은 상황의 사례에서 &ldquo;몇 곳이 했고 몇 곳이 됐는지, 안 된 곳은 왜 안 됐는지&rdquo;를 찾아 7일 실험 꾸러미(문구·올릴 곳·합격 기준)로 드립니다.</p>
            <p className="pub-caption">유료본 안내는 곧 이 화면에 열립니다. 읽고 쓸모없으면 전액 돌려 드립니다.</p>
          </Panel>
          {back}
        </div>
      </PubShell>
    )
  }

  return (
    <PubShell theme="light" footerNote="입력하신 숫자는 이 열람 주소에만 저장되고 다른 곳에 보이지 않습니다.">
      <div className="pub-solo">
        <Hero eyebrow={`${host} 완성본`} title="숫자 3개와 질문 3개" lead="1분이면 됩니다. 정확하지 않아도 대략의 숫자면 됩니다." />
        {sp.error && ERR[sp.error] ? <Panel tone="alert" titleAs="h2" title="확인해 주세요"><p className="pub-text" role="alert">{ERR[sp.error]}</p></Panel> : null}
        {lead.completion_status === 'failed' ? <Panel tone="alert" titleAs="h2" title="완성본을 만들지 못했습니다"><p className="pub-text">같은 숫자로 다시 보내 주세요.</p></Panel> : null}
        <Panel>
          <form className="pub-form" action={`/d/${token}/complete`} method="post">
            <label className="pub-text" htmlFor="visits">지난 한 달 방문한 사람 수</label>
            <input className="pub-field" id="visits" name="visits" type="text" inputMode="numeric" autoComplete="off" required placeholder="예: 1200…" defaultValue={c?.visits ?? ''} />
            <label className="pub-text" htmlFor="signups">그중 가입한 사람 수</label>
            <input className="pub-field" id="signups" name="signups" type="text" inputMode="numeric" autoComplete="off" required placeholder="예: 60…" defaultValue={c?.signups ?? ''} />
            <label className="pub-text" htmlFor="paid">그중 돈을 낸 손님 수</label>
            <input className="pub-field" id="paid" name="paid" type="text" inputMode="numeric" autoComplete="off" required placeholder="예: 3…" defaultValue={c?.paid ?? ''} />
            <label className="pub-text" htmlFor="source">손님이 주로 어디서 오나요?</label>
            <select className="pub-field" id="source" name="source" required defaultValue={c?.source ?? ''}>
              <option value="" disabled>고르세요</option>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <label className="pub-text" htmlFor="pain">지금 가장 큰 고민은?</label>
            <select className="pub-field" id="pain" name="pain" required defaultValue={c?.pain ?? ''}>
              <option value="" disabled>고르세요</option>
              {PAINS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <fieldset className="pub-fieldset">
              <legend className="pub-text">이미 해 본 것(여러 개 가능)</legend>
              {TRIED.map((t) => (
                <label key={t} className="pub-text"><input type="checkbox" name="tried" value={t} defaultChecked={c?.tried.includes(t)} /> {t}</label>
              ))}
            </fieldset>
            <PubButton variant="primary" size="lg">완성본 받기</PubButton>
          </form>
        </Panel>
        {back}
      </div>
    </PubShell>
  )
}
