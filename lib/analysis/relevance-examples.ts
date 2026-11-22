// T2 1차 판정 few-shot 로더 — 운영(scripts/relevance-judge-auto.mjs)과 평가 하네스(scripts/t2-approval-eval.mjs)가 한 벌을 쓴다(v71cu P3).
// 사람 채점 최근 MAX_EXAMPLES 건. 이 프로젝트 것 우선, 모자라면 다른 프로젝트에서 채운다. 조회 실패는 few-shot 없이(운영 동작 그대로).
// input_id 를 함께 돌려준다 — 하네스가 프롬프트에 실린 행을 채점에서 뺀다(누설).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { MAX_EXAMPLES } from './relevance-judge.ts'

type Sb = { from: (t: string) => any }

export interface LoadedExample { input_id: string; text: string; verdict: 'relevant' | 'irrelevant' }

export async function loadRelevanceExamples(supabase: Sb, projectId: string, onError: (m: string) => void = console.error): Promise<LoadedExample[]> {
  const pick = async (own: boolean) => {
    let q = supabase
      .from('review_relevance_verdicts')
      .select('input_id, human_verdict, human_graded_at')
      .not('human_verdict', 'is', null)
      .in('human_verdict', ['relevant', 'irrelevant'])
      .order('human_graded_at', { ascending: false, nullsFirst: false })
      .limit(MAX_EXAMPLES)
    q = own ? q.eq('project_id', projectId) : q.neq('project_id', projectId)
    const { data, error } = await q
    if (error) {
      onError(`⚠️ 사람 채점 조회 실패(${own ? '자기' : '타'} 프로젝트): ${error.message}`)
      return []
    }
    return (data ?? []) as { input_id: string; human_verdict: 'relevant' | 'irrelevant' }[]
  }

  const rows = await pick(true)
  if (rows.length < MAX_EXAMPLES) rows.push(...(await pick(false)).slice(0, MAX_EXAMPLES - rows.length))
  if (rows.length === 0) return []

  const { data: texts, error } = await supabase
    .from('analysis_inputs')
    .select('id, raw_text')
    .in('id', rows.map((r) => r.input_id))
  if (error) {
    onError(`⚠️ 예시 원문 조회 실패: ${error.message} — few-shot 없이 판정한다`)
    return []
  }
  const byId = new Map(((texts ?? []) as { id: string; raw_text: string | null }[]).map((t) => [t.id, t.raw_text]))
  return rows
    .map((r) => ({ input_id: r.input_id, text: byId.get(r.input_id) ?? '', verdict: r.human_verdict }))
    .filter((e) => e.text)
}
