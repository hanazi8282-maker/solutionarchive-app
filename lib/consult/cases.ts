// R5 케이스 검색(case_retrieve) — 진단 카테고리·한 줄 설명으로 보유 사례 최대 3곳을 찾는다. 노출은 case_bank 뷰(A·B 등급만).
// 소스가 부족하거나 질의가 비면 빈 배열이다(대체 경로: 3곳 목록 v0 만 — 못 찾은 것을 지어내지 않는다).
import { consultLlmJson } from './llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import { db } from './runs.ts'
import { CATEGORIES, MECHANISMS, sanitizeCaseQuery, caseLine, type CaseRow } from './cases-validate.ts'

const SYSTEM = `사업 설명을 보고 사례 검색 질의를 고릅니다. 반드시 아래 목록 안에서만 고르세요.
${UNTRUSTED_INPUT_NOTICE}
category 후보: ${CATEGORIES.join(', ')}
mechanism 후보: ${MECHANISMS.join(', ')}
출력은 JSON 하나만: {"category":"목록 중 하나 또는 빈 문자열","mechanisms":["최대 2개"]}`

export async function retrieveSimilar(i: { runId: string; owner: string; category: string; oneLiner: string; limit?: number }): Promise<{ name: string; what: string }[]> {
  const limit = i.limit ?? 3
  let q = { category: null as string | null, mechanisms: [] as string[] }
  try {
    const r = await consultLlmJson({ runId: i.runId, owner: i.owner, purpose: 'judge', tag: 'haiku', system: SYSTEM, user: `카테고리: ${i.category}\n설명: ${i.oneLiner.slice(0, 300)}`, maxTokens: 200 })
    q = sanitizeCaseQuery(r.data)
  } catch {
    return [] // 질의를 못 만들면 사례를 붙이지 않는다 — 억지로 아무 사례나 붙이지 않는다.
  }
  if (!q.category && q.mechanisms.length === 0) return []
  const sb = await db()
  const rows: CaseRow[] = []
  const tries = q.mechanisms.length ? q.mechanisms : [null]
  for (const m of tries) {
    const { data } = await sb.rpc('case_retrieve', { p_category: q.category, p_mechanism: m, p_outcome: null, p_decision_keyword: null, p_limit: 12 })
    if (Array.isArray(data)) rows.push(...(data as CaseRow[]))
  }
  const seen = new Set<string>()
  const out: { name: string; what: string }[] = []
  for (const r of rows) {
    const l = caseLine(r)
    if (!l || seen.has(l.name)) continue
    seen.add(l.name)
    out.push(l)
    if (out.length >= limit) break
  }
  return out
}
