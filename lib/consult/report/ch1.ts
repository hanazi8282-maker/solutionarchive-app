// 결론서 1장 "진단" 생성기 — 0층 무료 진단 4블록(한 줄 진단 / 누수·미개척 / 카테고리 위치 / 손실 범위+산식)이자 결론서 v4 1장.
// R11 단일 생성기: 0층 = 1장만, 유료 = 1+2장, 콜드메일 = 전 장. 그래서 장 단위 모듈로 두고 화면·PDF 가 같은 결과를 조립한다.
// 문체 규칙(v71ci §2): 합니다체, 권고는 "~하세요", 인용 130자 이하, 별명 금지, 페이지당 숫자 1개(손실 범위), "90일 재측정" 금지.
import { consultLlmJson } from '../llm'
import { UNTRUSTED_INPUT_NOTICE } from '@/lib/llm/untrusted-input'

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
- 근거 없는 숫자를 지어내지 않습니다. 손실 범위는 가정을 명시한 산식으로만 냅니다(단위: 만원/월). 가정이 약하면 note 에 "추정"이라고 적습니다.
- 정보가 얇으면(사실이 한 줄 설명뿐이면) 얇다고 인정하고, 확인해야 할 것을 leak_or_gap.detail 에 적습니다.
- 운영 중인 회사는 "누수"(이미 있는 것에서 새는 곳), 창업 전은 "미개척"(아직 비어 있는 자리) 쪽으로 씁니다.
- "90일 재측정", "액션플랜" 표현은 쓰지 않습니다.
출력은 JSON 객체 하나만:
{"headline":"한 줄 진단(60자 이내)","leak_or_gap":{"kind":"leak|gap","title":"","detail":""},"position":{"category":"카테고리","where":"그 카테고리 안에서의 위치","basis":"그렇게 본 근거"},"loss":{"low_man":0,"high_man":0,"formula":"산식 한 줄","assumptions":["가정1","가정2"],"note":""}}`

export async function buildCh1(i: Ch1Input): Promise<{ ch: Ch1; costUsd: number; model: string }> {
  const facts = i.pages.map((p) => `[${p.url}] ${p.title}\n${p.text.slice(0, 2500)}`).join('\n\n')
  const user = `상태: ${i.kind === 'idea' ? '창업 전 아이디어' : '운영 중인 회사'}\n이름: ${i.name ?? '(미기재)'}\n정보 두께: ${i.thin ? '얇음' : '충분'}\n\n수집한 사실:\n<<<\n${facts}\n>>>`
  const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'diagnosis', tag: 'opus', system: SYSTEM, user, maxTokens: 2500 })
  return { ch: validateCh1(r.data, { thin: i.thin, similar: i.similar }), costUsd: r.costUsd, model: r.model }
}
