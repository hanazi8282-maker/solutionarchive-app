import { notFound, redirect } from 'next/navigation'
import { requireConsultUser } from '@/lib/consult/session'
import { getRun, db } from '@/lib/consult/runs'
import { TAGLINE } from '@/lib/consult/tagline'
import type { Ch1 } from '@/lib/consult/report/ch1-validate'
import type { Ch1L1 } from '@/lib/consult/report/ch1-l1-validate'
import { PubShell } from '../../../_pub/components/PubShell'
import { Hero } from '../../../_pub/components/Hero'
import { Panel } from '../../../_pub/components/Panel'
import { PubButton } from '../../../_pub/components/Button'
import { hasPaidAccess, isStaff } from '@/lib/consult/entitlement'
import { coldMailLines, inSendWindow } from '@/lib/consult/report/mail'
import type { Ch2 } from '@/lib/consult/report/ch2-validate'
import { explainLossDivergence, sensitivityTable } from '@/lib/consult/report/ch1-l1-validate'

export const metadata = { title: '진단 — 60초 진단' }
export const dynamic = 'force-dynamic'

type Facts = { pages: { url: string; title: string; text: string }[]; thin: boolean; notes: string[] }

// 진단 화면. 0층(무료 4블록)이 있으면 보여 주고, 없으면 수집 요약 + "진단 시작" 버튼.
export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ busy?: string; error?: string; pct?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const customPct = Number(sp.pct)
  const hasCustomPct = Number.isFinite(customPct) && customPct > 0 && customPct <= 100
  const auth = await requireConsultUser()
  if (!auth.ok) redirect(`/consult/login?next=${encodeURIComponent(`/consult/run/${id}`)}`)
  const run = await getRun(id, auth.email)
  if (!run) notFound()
  const sb = await db()
  const paid = await hasPaidAccess(auth.email).catch(() => null) // null = 확인 불가(무료로 접지 않고 안내만 한다)
  const [{ data: col }, { data: dg }, { data: d1 }, { data: memoRow }, { data: card }, { data: msgs }] = await Promise.all([
    sb.from('consult_collected').select('facts,thin').eq('run_id', id).maybeSingle(),
    sb.from('consult_diagnoses').select('blocks').eq('run_id', id).eq('layer', 0).maybeSingle(),
    sb.from('consult_diagnoses').select('blocks').eq('run_id', id).eq('layer', 1).maybeSingle(),
    sb.from('consult_memos').select('body').eq('run_id', id).eq('version', 1).maybeSingle(),
    sb.from('consult_measure_cards').select('mode,title,metric_name,baseline,target,due_date,body,status').eq('run_id', id).maybeSingle(),
    sb.from('consult_messages').select('role,content').eq('run_id', id).in('role', ['user', 'assistant']).order('id', { ascending: true }).limit(40),
  ])
  const facts = (col?.facts ?? null) as Facts | null
  const ch = (dg?.blocks ?? null) as Ch1 | null
  const l1 = (d1?.blocks ?? null) as Ch1L1 | null
  const memo = (memoRow?.body ?? null) as Ch2 | null
  const staff = isStaff(auth.email)
  const { data: coldRow } = staff ? await sb.from('consult_reports').select('token,payload').eq('run_id', id).contains('chapters', ['6']).order('created_at', { ascending: false }).limit(1) : { data: null }
  const cold = coldRow?.[0] ?? null
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://solutionarch.vercel.app'
  const webPages = facts?.pages.filter((p) => p.url !== 'user:one_liner') ?? []
  // H2(2026-11-14 남헌 채점 피드백): "결정 메모"라는 말이 어색하다 — 회사형은 "실행 리포트", 아이디어형은 "사업기획서 초안".
  const memoLabel = run.kind === 'idea' ? '사업기획서 초안' : '실행 리포트'
  // H1: 전체 읽을 분량을 대략 세어 예상 읽기 시간을 보여준다(분당 500자 기준, 최소 1분). 순수 글자수 계산이라 LLM 비용 없음.
  const readMinutes = (() => {
    let chars = (ch?.headline.length ?? 0) + (ch?.leak_or_gap.detail.length ?? 0) + (ch?.position.where.length ?? 0)
    if (memo) chars += memo.decision.length + memo.recommendation.reasons.join('').length + memo.actionplan.map((a) => a.step + a.done_when).join('').length
    return Math.max(1, Math.ceil(chars / 500))
  })()

  return (
    <PubShell theme="light" footerNote="진단은 공개된 정보를 근거로 한 추정입니다. 결정은 대표님이 합니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title={ch?.headline ?? run.company_name ?? run.company_url ?? '창업 전 아이디어'} lead={ch ? run.one_liner ?? TAGLINE : TAGLINE} />
        {ch ? <p className="pub-caption">예상 읽기 시간: 약 {readMinutes}분</p> : null}
        {memo ? (
          <Panel tone="banner" titleAs="h2" title="오늘 바로 시작할 일 1개">
            <p className="pub-text"><b>{memo.actionplan[0]?.step}</b></p>
            <p className="pub-caption">끝난 기준: {memo.actionplan[0]?.done_when}</p>
          </Panel>
        ) : null}

        {run.status === 'failed' ? <Panel tone="alert" titleAs="h2" title="처리에 실패했습니다"><p className="pub-text">{run.error}</p></Panel> : null}
        {sp.busy ? <Panel titleAs="h2" title="진단 중입니다"><p className="pub-text">잠시 뒤 새로고침하세요.</p></Panel> : null}

        {ch ? (
          <Panel titleAs="h2" title="결론서">
            <form className="pub-form" action={`/api/consult/runs/${id}/report`} method="post">
              <input type="hidden" name="preset" value="free" />
              <PubButton variant="ghost">결론서 열기(1장 진단)</PubButton>
            </form>
            {paid === true ? (
              <form className="pub-form" action={`/api/consult/runs/${id}/report`} method="post">
                <input type="hidden" name="preset" value="paid" />
                <PubButton variant="ghost">결론서 열기(1·2장, {memoLabel} 포함)</PubButton>
              </form>
            ) : null}
            {staff ? (
              <form className="pub-form" action={`/api/consult/runs/${id}/report`} method="post">
                <input type="hidden" name="preset" value="cold" />
                <PubButton variant="ghost">콜드메일용 결론서 만들기(전 장, 운영진)</PubButton>
              </form>
            ) : null}
          </Panel>
        ) : null}
        {cold ? (
          <Panel titleAs="h2" title="콜드메일 본문 3줄(발송은 사람이 합니다)">
            {coldMailLines({ company: run.company_name ?? '', headline: (cold.payload as { ch1: { headline: string } }).ch1.headline, reportUrl: `${SITE}/r/${cold.token}` }).map((l) => <p key={l} className="pub-text">{l}</p>)}
            <p className="pub-caption">{inSendWindow(new Date()) ? '지금은 발송 가능 시간(09~18시)입니다.' : '지금은 발송 시간(09~18시) 밖입니다.'} 같은 회사에 이미 보냈는지 ops/state/dm-log-reconstructed-2026-11-10.md 와 대조한 뒤 보내세요.</p>
          </Panel>
        ) : null}
        {ch ? (
          <>
            <Panel titleAs="h2" title={ch.leak_or_gap.kind === 'gap' ? `미개척: ${ch.leak_or_gap.title}` : `누수: ${ch.leak_or_gap.title}`}>
              <p className="pub-text">{ch.leak_or_gap.detail}</p>
            </Panel>
            <Panel titleAs="h2" title={`카테고리 위치: ${ch.position.category}`}>
              <p className="pub-text">{ch.position.where}</p>
              <p className="pub-caption">근거: {ch.position.basis}</p>
            </Panel>
            {ch.stage === 'none' && ch.acquisition_plan ? (
              <Panel titleAs="h2" title="고객 확보 경로">
                <p className="pub-caption">데이터가 없어 손실 숫자는 생략했습니다. 지금 단계에서는 첫 고객을 모으는 쪽이 더 중요합니다.</p>
                <h3 className="pub-text"><b>첫 고객을 얻는 길</b></h3>
                <ul>{ch.acquisition_plan.channels.map((c) => <li key={c.channel} className="pub-text">{c.channel} — {c.message} <span className="pub-caption">(품: {c.effort})</span></li>)}</ul>
                <p className="pub-text">{ch.acquisition_plan.market_message}</p>
                <h3 className="pub-text"><b>수입원 후보</b></h3>
                <ul>{ch.acquisition_plan.revenue_candidates.map((r) => <li key={r} className="pub-caption">{r}</li>)}</ul>
                {!ch.acquisition_plan.has_basis ? <p className="pub-caption">근거 없음, 시험이 필요합니다 — 수집된 사실·사례에서 뒷받침되지 않은 일반적인 제안입니다.</p> : null}
              </Panel>
            ) : ch.loss ? (
              <Panel titleAs="h2" title="손실 범위">
                <p className="pub-text"><b>월 {ch.loss.low_man.toLocaleString('ko-KR')}~{ch.loss.high_man.toLocaleString('ko-KR')}만원</b> <span className="pub-caption">({ch.stage === 'low' ? '입력값 기반 — 대표님이 밝힌 단계로 계산' : ch.thin ? '근거 없음 — 수집 정보가 얇아 업종 일반 가정' : '추정 — 입력하신 숫자 없음, 업종 평균 가정'})</span></p>
                <p className="pub-caption">근거 충분도: {ch.evidence_level}(근거 수·정보 두께·부재 주장 여부로 코드가 계산, 확률이 아닙니다)</p>
                <p className="pub-caption">산식: {ch.loss.formula}</p>
                <ul>{ch.loss.assumptions.map((a) => <li key={a} className="pub-caption">{a}</li>)}</ul>
                {ch.loss.note ? <p className="pub-caption">{ch.loss.note}</p> : null}
              </Panel>
            ) : null}
            <Panel titleAs="h2" title="비슷한 회사">
              {ch.similar.length > 0 ? (
                <>
                  <ul>{ch.similar.map((s) => <li key={s.name} className="pub-text"><b>{s.name}</b> — {s.what}</li>)}</ul>
                  <p className="pub-caption">참고용 — 가격·전환율 지표 없음, 근거로 쓰지 말 것. 통계는 검증 중입니다.</p>
                </>
              ) : (
                <p className="pub-caption">비슷한 사례를 충분히 못 찾았습니다.</p>
              )}
            </Panel>

            {sp.error ? <Panel tone="alert" titleAs="h2" title="1층을 열지 못했습니다"><p className="pub-text">{sp.error === 'nums' ? '숫자를 확인하세요(전환율은 0~100, 나머지는 0보다 큰 숫자).' : '잠시 뒤 다시 시도하세요.'}</p></Panel> : null}
            {l1 ? (
              <>
                <Panel titleAs="h2" title="내 숫자로 다시 계산한 손실">
                  <p className="pub-text"><b>월 {l1.recalc.low_man.toLocaleString('ko-KR')}~{l1.recalc.high_man.toLocaleString('ko-KR')}만원</b> <span className="pub-caption">(입력값 기반 — 대표님이 입력한 숫자로 계산, 나머지 항은 가정)</span></p>
                  <ul>{l1.recalc.terms.map((t) => <li key={t.label} className="pub-caption">{t.label}: {t.low === t.high ? t.low : `${t.low}~${t.high}`}{t.user ? ' (입력하신 값)' : ' (가정)'}</li>)}</ul>
                  {l1.recalc.note ? <p className="pub-caption">{l1.recalc.note}</p> : null}
                  {ch.loss ? <p className="pub-caption">{explainLossDivergence(ch.loss, l1.recalc)}</p> : null}
                </Panel>
                <Panel titleAs="h2" title="개선 폭별 민감도(근거 없음 — 직접 비교용)">
                  <p className="pub-caption">단일 추정 대신 개선 폭 10/20/30%일 때 월 손실을 그대로 계산해 보여드립니다. 어느 쪽도 사실로 뒷받침되지 않은 가정입니다.</p>
                  <ul>
                    {l1.sensitivity.map((row) => <li key={row.pct} className="pub-text">개선 폭 {row.pct}% → 월 {row.loss_man.toLocaleString('ko-KR')}만원</li>)}
                    {hasCustomPct ? <li className="pub-text"><b>직접 입력 {customPct}%</b> → 월 {sensitivityTable(l1.inputs.audience, l1.inputs.rate_pct, l1.inputs.value_man, [customPct])[0].loss_man.toLocaleString('ko-KR')}만원</li> : null}
                  </ul>
                  <form className="pub-form" action={`/consult/run/${id}`} method="get">
                    <label className="pub-text" htmlFor="pct">직접 입력(개선 폭 %)</label>
                    <input className="pub-field" id="pct" name="pct" inputMode="decimal" autoComplete="off" min="1" max="100" defaultValue={hasCustomPct ? String(customPct) : ''} placeholder="예: 15" />
                    <PubButton variant="ghost">이 폭으로 계산하기</PubButton>
                  </form>
                </Panel>
                {l1.candidates.map((c, i) => (
                  <Panel key={c.title} titleAs="h2" title={`발전 방향 후보 ${i + 1}: ${c.title}`}>
                    <p className="pub-text">{c.what}</p>
                    <p className="pub-caption">근거: {c.why}</p>
                    <p className="pub-caption">반박: {c.rebuttal}</p>
                  </Panel>
                ))}
                <Panel titleAs="h2" title="벤치마크 위치">
                  <p className="pub-text">{l1.benchmark.position}</p>
                  <p className="pub-caption">근거: {l1.benchmark.basis}</p>
                  {l1.benchmark.similar.length > 0 ? <ul>{l1.benchmark.similar.map((s) => <li key={s.name} className="pub-caption"><b>{s.name}</b> — {s.what}</li>)}</ul> : null}
                </Panel>
                <Panel titleAs="h2" title={`${memoLabel} 첫 문장`}><p className="pub-text"><b>{l1.memo_first}</b></p></Panel>

                {paid === null ? <Panel tone="alert" titleAs="h2" title="구독 상태를 확인하지 못했습니다"><p className="pub-text">잠시 뒤 새로고침하세요.</p></Panel> : null}
                {paid === false ? (
                  <Panel titleAs="h2" title={`${memoLabel}·에이전트·측정카드는 유료입니다`}>
                    <p className="pub-text">월 29,000원. 계좌이체로 이용을 엽니다.</p>
                    <div className="pub-actions"><a className="pub-btn pub-btn--primary" href={`/consult/pay?run=${id}`}>유료 이용 안내</a></div>
                  </Panel>
                ) : null}
                {paid === true ? (
                  <>
                    {memo && run.kind === 'idea' && memo.understood ? (
                      // H6(2026-11-14): 사업기획서 초안 7섹션 — 상단 "제가 이해한 아이디어" 카드 + 섹션1~7.
                      <Panel titleAs="h2" title={memoLabel}>
                        <div className="pub-callout">
                          <p className="pub-caption"><b>제가 이해한 아이디어</b></p>
                          <p className="pub-caption">고객: {memo.understood.customer}</p>
                          <p className="pub-caption">문제: {memo.understood.problem}</p>
                          <p className="pub-caption">해법: {memo.understood.solution}</p>
                          <p className="pub-caption">수입원: {memo.understood.revenue_model}</p>
                        </div>
                        <h3 className="pub-text"><b>1. 한줄요약</b></h3>
                        <p className="pub-text">{memo.decision}</p>
                        <h3 className="pub-text"><b>2. 고객과 문제</b></h3>
                        <p className="pub-text">{memo.customer_problem}</p>
                        <h3 className="pub-text"><b>3. 비즈니스모델·수입원</b></h3>
                        <p className="pub-text">{memo.business_model}</p>
                        <h3 className="pub-text"><b>4. 시장 빈자리</b></h3>
                        <p className="pub-text">{memo.market_gap?.detail}</p>
                        <ul>{memo.market_gap?.competitors.map((c) => <li key={c.name} className="pub-caption">{c.name}{c.url ? ` — ${c.url}` : ''} ({c.confirmed ? '확인됨' : '추정'})</li>)}</ul>
                        <h3 className="pub-text"><b>5. 추천이유</b></h3>
                        <ul>{memo.recommendation.reasons.map((r) => <li key={r} className="pub-caption">{r}</li>)}</ul>
                        <h3 className="pub-text"><b>6. 첫 고객 확보 방법</b></h3>
                        <p className="pub-text">{memo.first_customers}</p>
                        <h3 className="pub-text"><b>7. 검증 실험 + 액션플랜</b></h3>
                        {memo.execution_package ? <p className="pub-caption">실험: {memo.execution_package.experiment.what} (대상: {memo.execution_package.experiment.who}, 성공 기준: {memo.execution_package.experiment.success_metric})</p> : null}
                        <ol>{memo.actionplan.map((a) => <li key={a.step} className="pub-caption">{a.step} (끝난 기준: {a.done_when})</li>)}</ol>
                      </Panel>
                    ) : memo ? (
                      <Panel titleAs="h2" title={memoLabel}>
                        <p className="pub-text"><b>{memo.decision}</b></p>
                        {memo.options.map((o) => <p key={o.name} className="pub-caption"><b>{o.name}</b> — 장점: {o.pros} / 단점: {o.cons}</p>)}
                        <p className="pub-text">권고: {memo.recommendation.choice}</p>
                        <ul>{memo.recommendation.reasons.map((r) => <li key={r} className="pub-caption">{r}</li>)}</ul>
                        <p className="pub-caption">이럴 때는 결정을 바꾸세요: {memo.recommendation.change_mind_if.join(' / ')}</p>
                        {memo.risks.map((r) => <p key={r.risk} className="pub-caption">위험: {r.risk} → {r.mitigation}</p>)}
                        <h3 className="pub-text"><b>액션플랜</b></h3>
                        <ol>{memo.actionplan.map((a) => <li key={a.step} className="pub-caption">{a.step} (끝난 기준: {a.done_when})</li>)}</ol>
                      </Panel>
                    ) : (
                      <Panel titleAs="h2" title={`${memoLabel} 만들기`}>
                        <form className="pub-form" action={`/api/consult/runs/${id}/memo`} method="post"><PubButton variant="primary" size="lg">{memoLabel} 만들기</PubButton></form>
                      </Panel>
                    )}

                    <div id="measure" />
                    {card ? (
                      <Panel titleAs="h2" title={card.title}>
                        {card.mode === 'roi' ? (
                          <>
                            <p className="pub-text">{(card.body as { statement?: string }).statement}</p>
                            <p className="pub-caption">{card.metric_name}: 현재 {String(card.baseline)} → 목표 {String(card.target)}{card.due_date ? ` · 점검일 ${card.due_date}` : ''}</p>
                          </>
                        ) : (
                          <ul>{((card.body as { facts?: { fact: string; source: string }[] }).facts ?? []).map((f) => <li key={f.fact} className="pub-text">{f.fact} <span className="pub-caption">(출처: {f.source})</span></li>)}</ul>
                        )}
                      </Panel>
                    ) : (
                      <Panel titleAs="h2" title="측정카드 만들기">
                        <form className="pub-form" action={`/api/consult/runs/${id}/measure`} method="post">
                          {run.kind === 'company' ? (
                            <>
                              <label className="pub-text" htmlFor="target">목표 전환율(%) — 현재 {l1.inputs.rate_pct}%</label>
                              <input className="pub-field" id="target" name="target" inputMode="decimal" required />
                              <label className="pub-text" htmlFor="due">점검일(선택)</label>
                              <input className="pub-field" id="due" name="due" type="date" />
                            </>
                          ) : <p className="pub-caption">숫자가 없어 몰랐던 사실 카드로 만듭니다.</p>}
                          <PubButton variant="primary" size="lg">측정카드 만들기</PubButton>
                        </form>
                      </Panel>
                    )}

                    <div id="chat" />
                    <Panel titleAs="h2" title="컨설턴트에게 묻기">
                      {(msgs ?? []).map((m, i) => <p key={i} className={m.role === 'user' ? 'pub-text' : 'pub-caption'}><b>{m.role === 'user' ? '나' : '컨설턴트'}</b>: {m.content}</p>)}
                      <form className="pub-form" action={`/api/consult/runs/${id}/chat`} method="post">
                        <textarea className="pub-field pub-pmf-textarea" name="message" required minLength={2} maxLength={800} placeholder={`${memoLabel}에 대해 궁금한 것을 적으세요.`} />
                        <PubButton variant="primary">질문하기</PubButton>
                      </form>
                    </Panel>
                  </>
                ) : null}
              </>
            ) : (
              <Panel titleAs="h2" title="내 숫자를 넣으면 더 정확해집니다">
                <p className="pub-text">지금 숫자는 일반적인 가정으로 계산한 대략치입니다. 실제 진단 건수·전환율·구독료를 입력하시면 훨씬 정확한 손실 금액과 우선순위를 드립니다.</p>
                <form className="pub-form" action={`/api/consult/runs/${id}/unlock`} method="post">
                  {run.kind === 'idea' ? (
                    <>
                      <label className="pub-text" htmlFor="audience">접근 가능한 잠재 고객 수</label>
                      <input className="pub-field" id="audience" name="audience" inputMode="numeric" required />
                      <label className="pub-text" htmlFor="value_man">지불 의사(월, 만원)</label>
                      <input className="pub-field" id="value_man" name="value_man" inputMode="decimal" required />
                      <label className="pub-text" htmlFor="alt_means">현재 대체 수단(없으면 비워 두세요)</label>
                      <input className="pub-field" id="alt_means" name="alt_means" autoComplete="off" placeholder="예: 엑셀로 직접 정리" />
                    </>
                  ) : (
                    <>
                      <label className="pub-text" htmlFor="audience">월 대상자 수(방문자·문의 수 등)</label>
                      <input className="pub-field" id="audience" name="audience" inputMode="numeric" required />
                      <label className="pub-text" htmlFor="rate_pct">현재 전환율(%)</label>
                      <input className="pub-field" id="rate_pct" name="rate_pct" inputMode="decimal" required />
                      <label className="pub-text" htmlFor="value_man">객단가(만원)</label>
                      <input className="pub-field" id="value_man" name="value_man" inputMode="decimal" required />
                    </>
                  )}
                  <PubButton variant="primary" size="lg">내 숫자로 다시 계산하기</PubButton>
                </form>
              </Panel>
            )}
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
