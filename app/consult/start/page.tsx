import { notFound, redirect } from 'next/navigation'
import { getConsultUser } from '@/lib/consult/session'
import { modesEnabled } from '@/lib/consult/modes'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButton, PubButtonLink } from '../../_pub/components/Button'

export const metadata = { title: '무엇을 도와드릴까요 — 60초 진단' }
export const dynamic = 'force-dynamic'

const MSG: Record<string, string> = {
  b_input: '회사 이름과 하려는 결정을 10자 이상 적어 주세요.',
  c1_input: '아이디어를 10자 이상, 본인 조건을 5자 이상 적어 주세요.',
  c2_input: '기술·자본·시간·고객 접점 분야를 모두 적어 주세요.',
  cap: '오늘은 진단 한도에 도달했습니다. 내일 다시 시도해 주세요.',
  failed: '결과를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요(입력은 저장되지 않았습니다).',
  mode: '모드를 선택해 주세요.',
}

// P2-A 모드 라우팅: 한 화면에서 A 회사 진단 / B 결정 검증 / C1 아이디어 검증 / C2 새 아이디어 추천으로 갈라진다.
export default async function ConsultStart({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string }> }) {
  if (!modesEnabled()) notFound()
  const u = await getConsultUser()
  if (u.kind !== 'ok') redirect('/consult/login?next=/consult/start')
  const sp = await searchParams
  const open = (m: string) => sp.mode === m
  return (
    <PubShell theme="light" footerNote="결과는 공개된 정보와 수집된 사례를 근거로 한 판단 재료입니다. 결정은 대표님이 합니다.">
      <div className="pub-solo">
        <Hero eyebrow="60초 진단" title="무엇을 도와드릴까요?" lead="상황에 맞는 것을 고르세요. 입력한 내용은 본인 계정에서만 볼 수 있습니다." />
        {sp.error && MSG[sp.error] ? <Panel tone="alert" titleAs="h2" title="확인해 주세요"><p className="pub-text">{MSG[sp.error]}</p></Panel> : null}

        <Panel title="① 내 회사 진단" titleAs="h2">
          <p className="pub-text">운영 중인 회사의 주소와 한 줄 설명으로, 어디서 새는지와 먼저 할 일을 봅니다.</p>
          <div className="pub-actions"><PubButtonLink href="/consult/new" variant="primary" size="lg">회사 진단 시작</PubButtonLink></div>
        </Panel>

        <Panel title="② 하려는 결정 검증" titleAs="h2">
          <details open={open('b')}>
            <summary className="pub-text">입력하기: 지금 해도 되는 결정인가요?</summary>
            <form className="pub-form" action="/api/consult/modes" method="post">
              <input type="hidden" name="mode" value="b" />
              <label className="pub-text" htmlFor="b_company">회사 또는 서비스 이름</label>
              <input className="pub-field" autoComplete="off" id="b_company" name="company" required maxLength={80} />
              <label className="pub-text" htmlFor="b_decision">하려는 결정 한 문장</label>
              <textarea className="pub-field pub-pmf-textarea" autoComplete="off" id="b_decision" name="decision" required minLength={10} maxLength={400} placeholder="예: 결론서를 월 29,000원 구독으로 팔고 환불 보증을 붙인다…" />
              <label className="pub-text" htmlFor="b_context">지금 상황·숫자(선택, 내부 숫자는 화면에 다시 보이지 않습니다)</label>
              <textarea className="pub-field pub-pmf-textarea" autoComplete="off" id="b_context" name="context" maxLength={1500} placeholder="예: 콜드메일 33통 회신 0, 유료 고객 0…" />
              <PubButton variant="primary" size="lg">결정 검증하기</PubButton>
            </form>
          </details>
        </Panel>

        <Panel title="③ 아이디어 검증 (창업 전)" titleAs="h2">
          <details open={open('c1')}>
            <summary className="pub-text">입력하기: 이 아이디어, 해볼 만한가요?</summary>
            <form className="pub-form" action="/api/consult/modes" method="post">
              <input type="hidden" name="mode" value="c1" />
              <label className="pub-text" htmlFor="c1_idea">아이디어 한 문장(누가·무엇을·왜 돈을 내나)</label>
              <textarea className="pub-field pub-pmf-textarea" autoComplete="off" id="c1_idea" name="idea" required minLength={10} maxLength={600} placeholder="예: 네일샵·미용실 노쇼를 줄이는 예약금 결제 서비스…" />
              <label className="pub-text" htmlFor="c1_conditions">본인 조건(만들 수 있는가·자본·고객 접점)</label>
              <textarea className="pub-field pub-pmf-textarea" autoComplete="off" id="c1_conditions" name="conditions" required minLength={5} maxLength={600} placeholder="예: 개발 가능, 자본 300만원, 미용실 사장 지인 3명…" />
              <label className="pub-text" htmlFor="c1_extra">추가 정보(선택: 인터뷰 수, 선결제 여부 등)</label>
              <textarea className="pub-field pub-pmf-textarea" autoComplete="off" id="c1_extra" name="extra" maxLength={600} />
              <PubButton variant="primary" size="lg">아이디어 검증하기</PubButton>
            </form>
          </details>
        </Panel>

        <Panel title="④ 새 아이디어 추천 (창업 전)" titleAs="h2">
          <details open={open('c2')}>
            <summary className="pub-text">입력하기: 제 조건에 맞는 사업 후보 3개 받기</summary>
            <form className="pub-form" action="/api/consult/modes" method="post">
              <input type="hidden" name="mode" value="c2" />
              <label className="pub-text" htmlFor="c2_tech">기술</label>
              <select className="pub-field" autoComplete="off" id="c2_tech" name="tech" defaultValue="개발 가능">
                <option>개발 가능</option>
                <option>노코드만 가능</option>
                <option>개발 불가</option>
              </select>
              <label className="pub-text" htmlFor="c2_capital">쓸 수 있는 자본</label>
              <input className="pub-field" autoComplete="off" id="c2_capital" name="capital" required maxLength={80} placeholder="예: 500만원…" />
              <label className="pub-text" htmlFor="c2_hours">투입 시간</label>
              <input className="pub-field" autoComplete="off" id="c2_hours" name="hours" required maxLength={80} placeholder="예: 월 60시간…" />
              <label className="pub-text" htmlFor="c2_access">고객 접점이 있는 분야</label>
              <input className="pub-field" autoComplete="off" id="c2_access" name="access" required maxLength={200} placeholder="예: 소상공인(음식·미용) 사장님을 알고 있음…" />
              <label className="pub-text" htmlFor="c2_interests">관심 분야(선택)</label>
              <input className="pub-field" autoComplete="off" id="c2_interests" name="interests" maxLength={200} />
              <PubButton variant="primary" size="lg">후보 추천받기</PubButton>
            </form>
          </details>
        </Panel>
      </div>
    </PubShell>
  )
}
