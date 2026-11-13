// 결론서 1장 "진단" 생성기 — 0층 무료 진단 4블록(한 줄 진단 / 누수·미개척 / 카테고리 위치 / 손실 범위+산식)이자 결론서 v4 1장.
// R11 단일 생성기: 0층 = 1장만, 유료 = 1+2장, 콜드메일 = 전 장. 그래서 장 단위 모듈로 두고 화면·PDF 가 같은 결과를 조립한다.
// 문체 규칙(v71ci §2): 합니다체, 권고는 "~하세요", 인용 130자 이하, 별명 금지, 페이지당 숫자 1개(손실 범위), "90일 재측정" 금지.
import { consultLlmJson } from '../llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../../llm/untrusted-input.ts'

import { validateCh1, type Ch1 } from './ch1-validate.ts'
export { validateCh1 }
export type { Ch1 }

export type Ch1Input = {
  runId: string
  owner: string
  kind: 'company' | 'idea'
  name: string | null
  oneLiner: string
  pages: { url: string; title: string; text: string }[]
  thin: boolean
  similar?: { name: string; what: string }[]
}

const SYSTEM = `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 아래 "수집한 사실"만 근거로 진단 1장을 JSON 으로 씁니다.
${UNTRUSTED_INPUT_NOTICE}
규칙:
- 합니다체. 권고는 "~하세요". 별명·농담 금지. 인용은 130자 이하.
- 손실 범위는 반드시 0보다 큰 구간(low_man < high_man, 단위: 만원/월)으로 냅니다. 사실에 숫자가 없으면 이 카테고리의 일반적인 규모를 가정으로 세우되, 모든 가정을 assumptions 에 "가정:"으로 밝히고 산식(formula)에 그대로 쓰며 note 에 "추정"이라고 적습니다. 사실처럼 단정하거나 0~0 으로 비우지 않습니다.
- 정보가 얇으면(사실이 한 줄 설명뿐이면) 얇다고 인정하고, 확인해야 할 것을 leak_or_gap.detail 에 적습니다.
- 누수와 미개척은 운영 여부가 아니라 근거로 가릅니다(v4 정답 시험지 creazy·gazet 에서 뽑은 규칙).
  · 미개척(gap) = 이미 갖춘 강점·요금제 사다리·시장 숫자로 보면 값을 낼 고객이나 결제 직전 지점이 있는데, 회사가 그 자리에 제안·노출·상품을 아직 두지 않은 경우. 예: 매출이 큰 고객층에게 맞는 최상위 연구독 안내가 없다, 가장 큰 강점이 무료 체험자의 결제 전 화면에 보이지 않는다. 처방은 "비어 있는 자리에 채우세요"이고, 지표는 그 자리를 채웠을 때 생기는 전환·승급 비율입니다.
  · 누수(leak) = 이미 있는 화면·가격·약속이 서로 어긋나거나(표기와 실제가 다름, 오류, 고객이 불만을 적음) 고객이 그 때문에 빠져나가는 증거가 사실에 있는 경우. 처방은 "고치세요"입니다.
  · 사실에 어긋남·불만·오류의 증거가 없고 비어 있는 자리만 보이면 운영 중인 회사여도 gap 입니다. 어긋남이 사실에 직접 보일 때만 leak 입니다. 둘 다 가능하면: 정보 두께가 "충분"이고 사실에 요금제 사다리·고객층 숫자·핵심 강점이 함께 보여 비어 있는 자리의 크기를 잴 수 있으면 gap 을 고르고 어긋남은 detail 끝에 한 줄로 덧붙입니다. 사실이 얇아 비어 있는 자리를 단정할 근거가 부족하면 이미 보이는 어긋남(leak)을 고릅니다. 단, 같은 회사의 두 곳(한 줄 설명·메뉴·요금표·약관 등)이 서로 다르게 말하는 것이 사실 안에서 직접 보이면 그것이 가장 직접적인 증거이므로 leak 을 고릅니다(예: 한 줄 설명은 급여 자동화를 말하는데 메뉴·기능 목록에는 없다). 운영 중이고 정보가 얇은 회사도 leak 입니다.
  · 창업 전 아이디어는 gap 입니다.
  · gap 의 detail 에는 비어 있는 자리(어떤 고객·어느 지점)를 이름으로 적고, leak 의 detail 에는 어긋남의 증거(어디와 어디가 다른지)를 적습니다.
- "90일 재측정" 표현은 쓰지 않습니다. 액션플랜은 쓰되 날짜를 넣지 않습니다.
- 부재 주장 금지(2026-11-13 실측 — 시프티 진단이 "급여 메뉴가 없다"고 썼는데 같은 입력 안에 "Payroll" 기능이 실제로 있었습니다): "~가 없습니다/없습니다"처럼 단정하기 전에 <<<수집한 사실>>> 전체에서 그 단어·기능이 정말 한 번도 안 나오는지 직접 다시 훑으세요. 못 찾았다는 확신이 없으면 "없습니다" 대신 "확인되지 않았습니다"를 쓰고, leak_or_gap.detail 에 어느 URL을 확인했는지 적으세요.
- viability(사전 검증, v71cl-엔진): Fit 사슬은 0 Founder-Market → 1 Market-Product → 2 Product-Channel → 3 Channel-Model → 4 Model-Market 순서입니다. 수집한 사실로 가장 앞에서 끊긴 단계 하나를 고르고(앞 단계가 멀쩽하면 뒤 단계는 보지 않습니다), fit_broken_stage(0~4)·fit_color(🟢 통과/🟡 주의/🔴 탈락)·fit_test_result(그 단계 한 줄 테스트에 대한 판정과 근거)를 적습니다. failure_modes 는 아래 F1~F13 중 사실로 뒷받침되는 것만 최대 3개 고릅니다(근거 없으면 빈 배열 — 지어내지 않습니다): F1 수요 부재, F2 거짓 양성, F3 조기 확장, F4 자본 소진, F5 타이밍 실패, F6 단위경제 불량, F7 저가 AI 관광객 이탈, F8 채널-가격 불일치, F9 Bad Bedfellows, F10 Speed Trap, F11 Help Wanted, F12 Cascading Miracles, F13 플랫폼/모델 의존. segment 는 가격·고객 규모로 P(월 $50 미만)/S(ACV $12K 미만)/M($12-100K)/E($100K 이상) 중 하나를 고릅니다.
출력은 JSON 객체 하나만:
{"headline":"한 줄 진단(60자 이내)","leak_or_gap":{"kind":"leak|gap","title":"","detail":""},"position":{"category":"카테고리","where":"그 카테고리 안에서의 위치","basis":"그렇게 본 근거"},"loss":{"low_man":0,"high_man":0,"formula":"산식 한 줄","assumptions":["가정1","가정2"],"note":""},"viability":{"fit_broken_stage":0,"fit_color":"🔴","fit_test_result":"","failure_modes":["F8"],"segment":"S"}}`

export async function buildCh1(i: Ch1Input): Promise<{ ch: Ch1; costUsd: number; model: string }> {
  // 2026-11-13 실측: 2500자 절단이 홈페이지·overview 페이지의 "Payroll" 기능 항목(각각 idx 2690·3525)을 모델에게 전달되기 전에 잘라내 "급여 메뉴가 없다"는 거짓 단정을 냈다. 4500자로 올림(완전한 재발 방지는 아니나 실측 사고 구간을 덮는다).
  const facts = i.pages.map((p) => `[${p.url}] ${p.title}\n${p.text.slice(0, 4500)}`).join('\n\n')
  const user = `상태: ${i.kind === 'idea' ? '창업 전 아이디어' : '운영 중인 회사'}\n이름: ${i.name ?? '(미기재)'}\n정보 두께: ${i.thin ? '얇음' : '충분'}\n\n수집한 사실:\n<<<\n${facts}\n>>>`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'diagnosis', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 3500 })
      cost += r.costUsd
      return { ch: validateCh1(r.data, { thin: i.thin, similar: i.similar, pageCount: i.pages.length }), costUsd: cost, model: r.model }
    } catch (e) {
      // consultLlmJson 이 JSON 파싱 실패로 던진 경우도 여기서 잡아야 재시도된다 — 바깥에 있으면 첫 번째 깨진 응답에 그대로 크래시한다(실측: smart-alba.com 라이브 테스트에서 재현).
      if (attempt === 1) throw e
      feedback = `

[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
