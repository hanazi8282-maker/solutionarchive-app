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
출력은 JSON 객체 하나만:
{"headline":"한 줄 진단(60자 이내)","leak_or_gap":{"kind":"leak|gap","title":"","detail":""},"position":{"category":"카테고리","where":"그 카테고리 안에서의 위치","basis":"그렇게 본 근거"},"loss":{"low_man":0,"high_man":0,"formula":"산식 한 줄","assumptions":["가정1","가정2"],"note":""}}`

export async function buildCh1(i: Ch1Input): Promise<{ ch: Ch1; costUsd: number; model: string }> {
  const facts = i.pages.map((p) => `[${p.url}] ${p.title}\n${p.text.slice(0, 2500)}`).join('\n\n')
  const user = `상태: ${i.kind === 'idea' ? '창업 전 아이디어' : '운영 중인 회사'}\n이름: ${i.name ?? '(미기재)'}\n정보 두께: ${i.thin ? '얇음' : '충분'}\n\n수집한 사실:\n<<<\n${facts}\n>>>`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'diagnosis', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 2500 })
    cost += r.costUsd
    try {
      return { ch: validateCh1(r.data, { thin: i.thin, similar: i.similar }), costUsd: cost, model: r.model }
    } catch (e) {
      if (attempt === 1) throw e
      feedback = `

[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
