// 결론서 3~6장 생성기(Opus) — 콜드메일용 전 장 조립에서 쓴다. 입력: 1장 진단 + 수집 사실 + 보유 사례. 근거 없는 경쟁사 이름은 쓰지 않는다.
import { consultLlmJson } from '../llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../../llm/untrusted-input.ts'
import type { Ch1 } from './ch1-validate.ts'
import { validateCh3to6, type Ch3to6 } from './ch3to6-validate.ts'

const SYSTEM = `당신은 창업자의 결정을 검증하는 컨설턴트입니다. 결론서의 3~6장을 JSON 으로 씁니다.
${UNTRUSTED_INPUT_NOTICE}
규칙: 합니다체, 권고는 "~하세요", 별명·농담 금지, "90일 재측정" 금지, 액션플랜은 날짜 없이. 근거 없는 사실·숫자를 지어내지 않습니다.
- candidates(3장 발전 방향 후보): 2~3개. 각각 title, what, why(진단·수집 사실·유사 사례 근거), rebuttal(가장 강한 반박 1개).
- customers(4장 고객의 고객): 2~4개. 이 회사의 고객이 다시 누구를 상대하는지(who), 그들이 필요한 것(need), 닿는 방법(reach).
- competitors(5장 경쟁 지도): 2~6개. 이름은 수집한 사실이나 "비슷한 사례"에 나온 것, 또는 한 줄 설명에서 분명히 읽히는 것만. 각각 name, kind(직접 경쟁/대체재/수작업 등), basis(어디서 그렇게 봤는지). 근거가 없으면 이름 대신 유형만 쓰고 basis 에 "수집한 사실에 없음"이라고 적습니다.
- obstacles(6장 걸림돌): 2~5개. obstacle, evidence, handle.
출력은 JSON 객체 하나만:
{"candidates":[{"title":"","what":"","why":"","rebuttal":""}],"customers":[{"who":"","need":"","reach":""}],"competitors":[{"name":"","kind":"","basis":""}],"obstacles":[{"obstacle":"","evidence":"","handle":""}]}`

export async function buildCh3to6(i: { runId: string; owner: string; ch1: Ch1; pages: { url: string; title: string; text: string }[]; similar: { name: string; what: string }[] }): Promise<{ ch: Ch3to6; costUsd: number; model: string }> {
  const facts = i.pages.map((p) => `[${p.url}] ${p.title}\n${p.text.slice(0, 1800)}`).join('\n\n')
  const sim = i.similar.length ? i.similar.map((c) => `- ${c.name}: ${c.what}`).join('\n') : '(보유 사례 없음)'
  const user = `1장 진단:\n${JSON.stringify({ headline: i.ch1.headline, leak_or_gap: i.ch1.leak_or_gap, position: i.ch1.position, loss: i.ch1.loss })}\n\n수집한 사실:\n${facts}\n\n비슷한 사례:\n${sim}`
  let cost = 0
  let feedback = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'report', tag: 'opus', system: SYSTEM, user: user + feedback, maxTokens: 5000 })
    cost += r.costUsd
    try {
      return { ch: validateCh3to6(r.data), costUsd: cost, model: r.model }
    } catch (e) {
      if (attempt === 1) throw e
      feedback = `\n\n[이전 출력이 거절됐습니다: ${e instanceof Error ? e.message : String(e)}. 같은 형식으로 고쳐서 다시 출력하세요.]`
    }
  }
  throw new Error('unreachable')
}
