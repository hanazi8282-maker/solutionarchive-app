import { redirect } from 'next/navigation'
import { PubShell } from './_pub/components/PubShell'
import { Hero } from "./_pub/components/Hero"
import { Panel } from './_pub/components/Panel'
import { PubButton } from './_pub/components/Button'
import { getAuthVerdict } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/consult/runs'

// 로그인 안 한 방문자가 보는 첫 화면 + 상세페이지(v71co 개정 §2-1·§2-11).
// ⚠️ 이 라우트 하나만 공개다(정확일치, lib/auth/policy.ts PUBLIC_EXACT). 가짜 후기·가짜 숫자·가짜 마감은 쓰지 않는다 — 후기 칸은 실제 후기가 생길 때까지 없다.
// 정적 프리렌더 금지: 로그인 여부로 갈리고, 숫자(쌓은 자료)를 DB 에서 읽는다.
export const dynamic = 'force-dynamic'

const PROMISE = '새 손님을 데려올 길과, 손님이 새는 곳을 찾아 드립니다.'
export const metadata = {
  title: `${PROMISE} — 솔루션아카이브`,
  description: '서비스 주소만 넣으세요. 귀사만을 위한 결론서 초안을 무료로 보내 드립니다. 새 손님을 데려올 길, 손님이 새는 곳, 이번 주에 할 일까지.',
}

// 문구 A/B/C — ?v= 로 바꿔 시험한다(신청 때 변형 이름이 같이 저장된다). 뜻은 같고 첫 줄만 다르다.
const HEAD: Record<string, string> = {
  a: PROMISE,
  b: '손님이 안 느는 이유, 서비스 주소 하나로 찾아 드립니다.',
  c: '광고비 쓰기 전에, 새 손님이 올 길부터 확인하세요.',
}

const ERR: Record<string, string> = {
  url: '서비스 주소를 확인해 주세요(https://로 시작하는 공개 주소).',
  email: '받을 메일 주소를 확인해 주세요.',
  consent: '개인정보 안내에 동의해 주셔야 보내 드릴 수 있습니다.',
  cap: '오늘 접수가 마감됐습니다. 내일 다시 신청해 주세요.',
  optout: '이 메일 주소는 수신 거부 목록에 있어 초안을 보내 드릴 수 없습니다. 다시 받고 싶으시면 받으셨던 메일에 답장해 주세요.',
  ip: '같은 곳에서 오늘 신청할 수 있는 횟수를 넘었습니다. 내일 다시 신청해 주세요.',
  fail: '접수하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}

function DraftForm({ id, variant }: { id: string; variant: string }) {
  return (
    <form className="pub-form" action="/d/new" method="post" id={id === 'top' ? 'start' : undefined}>
      <input type="hidden" name="v" value={variant} />
      <label className="pub-text" htmlFor={`${id}-url`}>서비스 주소</label>
      <input className="pub-field" id={`${id}-url`} name="url" type="url" inputMode="url" autoComplete="url" required maxLength={300} placeholder="https://example.com…" />
      <label className="pub-text" htmlFor={`${id}-email`}>초안 안내를 받을 메일</label>
      <input className="pub-field" id={`${id}-email`} name="email" type="email" autoComplete="email" spellCheck={false} required maxLength={254} placeholder="you@company.com…" />
      {/* 숨김 칸: 사람은 비워 둔다(자동 입력 봇 거르기) */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor={`${id}-web`}>웹사이트</label>
        <input id={`${id}-web`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="pub-caption"><input type="checkbox" name="consent" required /> 입력한 주소와 메일을 초안을 만들고 안내하는 데만 쓰는 것에 동의합니다. <a href="/privacy">개인정보 안내</a> · <a href="/unsubscribe">수신 거부</a></label>
      <PubButton variant="primary" size="lg">무료 초안 받기</PubButton>
    </form>
  )
}

async function loadScale(): Promise<{ cases: number | null; failures: number | null; voices: number | null }> {
  const sb = await createClient()
  if (!sb) return { cases: null, failures: null, voices: null }
  const n = async (t: string, mode: 'exact' | 'estimated') => {
    const r = await sb.from(t).select('*', { count: mode, head: true })
    return r.error ? null : r.count
  }
  const [cases, failures, voices] = await Promise.all([n('case_bank_labels', 'exact'), n('failure_ledger', 'exact'), n('analysis_inputs', 'estimated')])
  return { cases, failures, voices }
}

/** 실물 보기: 실제로 만든 초안의 첫 장(회사 이름은 가린다). 못 읽으면 칸을 숨긴다(지어내지 않는다). */
type Sample = { headline: string; kind: string; title: string; detail: string; category: string; where: string }
async function loadSample(): Promise<Sample | null> {
  const token = process.env.LANDING_SAMPLE_REPORT_TOKEN ?? "809b69e5ed734d5f873854e0a6a1ab06"
  const names = (process.env.LANDING_SAMPLE_MASK ?? "shiftee,시프티").split(",").map((x) => x.trim()).filter(Boolean)
  const esc = (x: string) => x.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  const mask = (t: string) => names.reduce((acc, n) => acc.replace(new RegExp(esc(n), 'gi'), '○○'), t)
  try {
    const { data } = await (await db()).from("consult_reports").select("payload").eq("token", token).maybeSingle()
    const c = (data?.payload as { ch1?: { headline?: string; leak_or_gap?: { kind: string; title: string; detail: string }; position?: { category: string; where: string } } } | undefined)?.ch1
    if (!c?.headline || !c.leak_or_gap || !c.position) return null
    const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t)
    return { headline: mask(c.headline), kind: c.leak_or_gap.kind, title: mask(c.leak_or_gap.title), detail: mask(clip(c.leak_or_gap.detail, 260)), category: mask(c.position.category), where: mask(clip(c.position.where, 120)) }
  } catch { return null }
}

const fmt = (n: number) => n.toLocaleString('ko-KR')

export default async function Home({ searchParams }: { searchParams: Promise<{ v?: string; p?: string; error?: string }> }) {
  // 로그인한 사람에게 랜딩은 볼 이유가 없는 화면이다 — 종전대로 작업 화면으로 보낸다.
  const verdict = await getAuthVerdict()
  if (verdict.kind === 'allowed') redirect('/dashboard')
  const sp = await searchParams
  const variant = sp.v && sp.v in HEAD ? sp.v : 'a'
  const price = sp.p === '99' ? '99,000' : '49,000'
  const [scale, sample] = await Promise.all([loadScale(), loadSample()])
  const scaleParts = [
    scale.cases !== null ? `정리한 사례 ${fmt(scale.cases)}건` : null,
    scale.failures !== null ? `실패 기록 ${fmt(scale.failures)}건` : null,
    scale.voices !== null && scale.voices > 0 ? `읽은 고객 글 약 ${fmt(Math.round(scale.voices / 100) * 100)}건` : null,
  ].filter(Boolean)

  return (
    <PubShell theme="light" footerNote="솔루션아카이브는 공개된 정보와 직접 쌓은 사례로 결론서를 만듭니다. 결과는 판단 재료이고, 결정은 대표님이 합니다.">
      <div className="pub-solo">
        <Hero eyebrow="솔루션아카이브" title={HEAD[variant]} lead="서비스 주소만 넣으세요. 귀사만을 위한 결론서 초안을 무료로 보내 드립니다." />
        {sp.error && ERR[sp.error] ? <Panel tone="alert" titleAs="h2" title="확인해 주세요"><p className="pub-text" role="alert">{ERR[sp.error]}</p></Panel> : null}
        <Panel><DraftForm id="top" variant={variant} /></Panel>

        <Panel titleAs="h2" title="지금 모습">
          <p className="pub-text">서비스는 만들었습니다. 그런데 손님이 늘지 않습니다. 기능을 더 만들까, 광고를 할까, 값을 내릴까. 무엇부터 해야 할지 모르는 채로 한 달이 또 갑니다.</p>
        </Panel>

        <Panel titleAs="h2" title="왜 여태 안 풀렸나">
          <p className="pub-text">문제는 열심히 하지 않아서가 아닙니다. 어디가 막혔는지 모르고 고치기 때문입니다. 안 오는 건지, 와서 가입을 안 하는 건지, 쓰다 마는 건지에 따라 할 일이 완전히 다릅니다.</p>
        </Panel>

        <section aria-labelledby="three-h">
          <h2 className="pub-h2" id="three-h">우리가 하는 일 3가지</h2>
          <div className="pub-three">
            <Panel titleAs="h3" title="① 데려올 손님 찾기"><p className="pub-text">경쟁 서비스 고객이 남긴 불만을 읽고 <b>귀사가 데려올 수 있는 손님</b>을 찾습니다.</p></Panel>
            <Panel titleAs="h3" title="② 실제로 한 일 보여 주기"><p className="pub-text">비슷한 처지였던 회사들이 <b>실제로 무엇을 해서 어떻게 됐는지</b> 보여 드립니다. 잘된 곳과 안 된 곳 모두요.</p></Panel>
            <Panel titleAs="h3" title="③ 이번 주 할 일"><p className="pub-text"><b>이번 주에 바로 해 볼 일</b>을 문구까지 써서 드립니다.</p></Panel>
          </div>
        </section>

        {sample ? (
          <Panel titleAs="h2" title="실물 보기">
            <p className="pub-caption">실제 서비스 주소로 만든 결론서 초안의 첫 장입니다(회사 이름은 가렸습니다). 이런 문서를 귀사 것으로 만들어 드립니다.</p>
            <p className="pub-text"><b>{sample.headline}</b></p>
            <p className="pub-text"><b>{sample.kind === 'gap' ? '미개척' : '누수'}: {sample.title}</b></p>
            <p className="pub-caption">{sample.detail}</p>
            <p className="pub-caption">카테고리 위치: {sample.category} — {sample.where}</p>
          </Panel>
        ) : null}

        <section aria-labelledby="tiers-h">
          <h2 className="pub-h2" id="tiers-h">받는 것 3단계</h2>
          <div className="pub-three">
            <Panel titleAs="h3" title="초안 · 무료"><p className="pub-text">서비스 주소만 넣으면 됩니다. 바깥에서 보이는 것(화면·가격표·가입 과정·경쟁 서비스 고객 글)만으로 만든 결론서입니다.</p></Panel>
            <Panel titleAs="h3" title="완성본 · 무료"><p className="pub-text">한 달 방문·가입·유료 손님 숫자 3개와 질문 3개(1분)에 답하면, 그 숫자로 다시 계산해 손님이 새는 곳을 판정하고 새 손님 길을 귀사에 맞게 다시 순서 매깁니다.</p></Panel>
            <Panel titleAs="h3" title="유료본"><p className="pub-text">상황 맞춤 처방 + 7일 실험 꾸러미 + 실험 뒤 다시 판정. 닮은 상황의 사례를 찾아 &ldquo;몇 곳이 했고 몇 곳이 됐는지&rdquo;까지 보여 드립니다.</p></Panel>
          </div>
        </section>

        <Panel titleAs="h2" title="값과 약속">
          <p className="pub-text">유료본 {price}원. 읽고 쓸모없으면 전액 돌려 드립니다. 이유는 묻지 않습니다.</p>
          <p className="pub-caption">유료본은 완성본을 받아 보신 뒤에 안내해 드립니다. 먼저 무료 초안으로 확인하세요.</p>
        </Panel>

        <Panel titleAs="h2" title="누가 만드나">
          <p className="pub-text">솔루션아카이브는 작은 서비스 팀이 손님을 늘릴 길을 찾도록 돕는 곳입니다. 공개된 사례와 고객 글을 모아 두고, 귀사 상황과 닮은 것을 찾아 비교합니다.</p>
          {scaleParts.length > 0 ? <p className="pub-caption">지금까지 쌓은 자료: {scaleParts.join(' · ')}</p> : null}
        </Panel>

        <section aria-labelledby="faq-h">
          <h2 className="pub-h2" id="faq-h">자주 묻는 것</h2>
          <Panel titleAs="h3" title="우리 회사 자료를 어떻게 아나요?"><p className="pub-text">공개된 것만 봅니다. 서비스 화면, 가격표, 가입 과정, 경쟁 서비스 고객이 공개로 남긴 글입니다. 로그인해야 보이는 화면은 보지 않습니다.</p></Panel>
          <Panel titleAs="h3" title="숫자를 줘도 안전한가요?"><p className="pub-text">입력하신 숫자는 완성본을 만드는 데만 쓰고, 받으신 분의 열람 주소에서만 보입니다. 다른 곳에 공개하지 않습니다.</p></Panel>
          <Panel titleAs="h3" title="얼마나 걸리나요?"><p className="pub-text">초안은 신청하고 2~4분, 완성본은 숫자를 낸 뒤 1분 안팎입니다.</p></Panel>
          <Panel titleAs="h3" title="우리 분야도 되나요?"><p className="pub-text">지금은 10명 이하 SaaS 팀을 먼저 받고 있습니다. 다른 분야도 신청은 되지만, 읽을 자료가 얇으면 초안에 그렇게 적습니다.</p></Panel>
          <Panel titleAs="h3" title="환불은 어떻게 하나요?"><p className="pub-text">유료본을 읽고 쓸모없으면 이유를 묻지 않고 전액 돌려 드립니다. 입금하신 계좌로 돌려 드립니다.</p></Panel>
        </section>

        <Panel titleAs="h2" title="귀사 것으로 받아 보세요"><DraftForm id="bottom" variant={variant} /></Panel>
      </div>
    </PubShell>
  )
}
