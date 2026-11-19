// R5 케이스 검색(case_retrieve) — 진단 카테고리·한 줄 설명으로 보유 사례 최대 3곳을 찾는다. 노출은 case_bank 뷰(A·B 등급만).
// P1-C(v71co): 카테고리만 맞는 엉뚱한 사례가 붙던 문제 — 후보를 넓게 가져온 뒤 모델이 "구조가 비슷한가"(고객 유형·과금·채널)를 판정하고,
// 고른 사례마다 "왜 비슷한지" 한 줄을 붙인다. 하나도 못 고르면 빈 배열(억지로 채우지 않는다). 실패 사례가 후보에 있으면 1건 이상 포함한다(성공만 보여 주지 않는다).
import { consultLlmJson } from './llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import { db } from './runs.ts'
import { CATEGORIES, MECHANISMS, sanitizeCaseQuery, caseLine, pickSimilar, type CaseRow } from './cases-validate.ts'

const SYSTEM = `사업 설명을 보고 사례 검색 질의를 고릅니다. 반드시 아래 목록 안에서만 고르세요.
${UNTRUSTED_INPUT_NOTICE}
category 후보: ${CATEGORIES.join(', ')}
mechanism 후보: ${MECHANISMS.join(', ')}
출력은 JSON 하나만: {"category":"목록 중 하나 또는 빈 문자열","mechanisms":["최대 2개"]}`

const JUDGE = `당신은 사업 설명과 사례 후보를 비교해 "구조가 비슷한 사례"만 고르는 심사자입니다.
${UNTRUSTED_INPUT_NOTICE}
비슷하다는 기준은 셋뿐입니다: 같은 유형의 고객(누가 돈을 내나) / 비슷한 과금·가격 구조 / 비슷한 판매 채널. 업종 이름이 같다는 것만으로는 비슷하지 않습니다.
사례를 최대 3개 고릅니다. 기준을 못 맞추는 후보는 고르지 않습니다(0개도 가능 — 억지로 채우지 않습니다). 고른 것 중 결과가 실패·폐업·부진인 사례가 후보에 있으면 1개 이상 포함합니다.
각 사례에 why: 위 세 기준 중 무엇이 비슷한지 한 문장(60자 이내, 합니다체). 후보에 적힌 내용에 없는 사실은 쓰지 않습니다.
출력은 JSON 하나만: {"picks":[{"i":후보번호,"why":""}]}`

export type SimilarCase = { name: string; what: string; why?: string }

/** [v71cu B4] 주입(선택) — 비교 하니스(scripts/story-flow-compare.mjs)가 구독 경로 claude -p 와 읽기 전용 클라이언트를 넣는다. 비우면 기존 경로(consultLlmJson·db()) 그대로. */
export type RetrieveDeps = {
  llmJson?: (o: { system: string; user: string; maxTokens: number }) => Promise<{ data: Record<string, unknown> }>
  sb?: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> }
}

export async function retrieveSimilar(i: { runId: string; owner: string; category: string; oneLiner: string; limit?: number }, deps: RetrieveDeps = {}): Promise<SimilarCase[]> {
  const limit = i.limit ?? 3
  const ask = deps.llmJson ?? ((o: { system: string; user: string; maxTokens: number }) => consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'judge', tag: 'haiku', ...o }))
  let q = { category: null as string | null, mechanisms: [] as string[] }
  try {
    const r = await ask({ system: SYSTEM, user: `카테고리: ${i.category}\n설명: ${i.oneLiner.slice(0, 300)}`, maxTokens: 200 })
    q = sanitizeCaseQuery(r.data)
  } catch {
    return [] // 질의를 못 만들면 사례를 붙이지 않는다 — 억지로 아무 사례나 붙이지 않는다.
  }
  if (!q.category && q.mechanisms.length === 0) return []
  const sb = deps.sb ?? (await db())
  const rows: CaseRow[] = []
  const tries = q.mechanisms.length ? q.mechanisms : [null]
  for (const m of tries) {
    const { data } = await sb.rpc('case_retrieve', { p_category: q.category, p_mechanism: m, p_outcome: null, p_decision_keyword: null, p_limit: 30 })
    if (Array.isArray(data)) rows.push(...(data as CaseRow[]))
  }
  const seen = new Set<string>()
  const cands: { name: string; what: string }[] = []
  for (const r of rows) {
    const l = caseLine(r)
    if (!l || seen.has(l.name)) continue
    seen.add(l.name)
    cands.push(l)
  }
  if (cands.length === 0) return []
  const list = cands.slice(0, 40).map((c, n) => `${n}. ${c.name} — ${c.what}`).join('\n')
  try {
    const r = await ask({ system: JUDGE, user: `사업 설명: ${i.oneLiner.slice(0, 400)}\n\n후보:\n${list}`, maxTokens: 500 })
    return pickSimilar(r.data, cands.slice(0, 40), limit)
  } catch {
    return [] // 비슷한지 판정하지 못하면 붙이지 않는다(§7.1 — 판정 실패를 "비슷함"으로 접지 않는다).
  }
}
