// G8(v71cp): 결론서·모드 B/C1/C2 결과가 만들어질 때 consult_predictions 에 사전 등록 예측을 남긴다.
// R10(확률 보정 검증) 통과 전이라 숫자 확률은 저장하지 않는다 — prob 는 항상 null, 범주형 판정(verdict)과 근거 수(evidence_count)만.
// 기록 실패는 결과 생성을 깨뜨리지 않는다: recordPredictions 는 던지지 않고 상태만 돌려준다(로그는 영어).
// 스키마: 20261113000002_consult_predictions.sql + 20261116000001_consult_predictions_categorical.sql(prob nullable·범주 칼럼).
import type { SupabaseClient } from '@supabase/supabase-js'

export type PredictionKind = 'report' | 'memo' | 'b' | 'c1' | 'c2'
export type PredictionRow = { run_id: string; mode: PredictionKind; claim: string; verdict: string; evidence_count: number; prob: null; due_at: string }

/** 결과 확인 시점 = 생성 + 90일(테이블 주석 그대로). */
export const DUE_DAYS = 90
const STAGE = ['0 팀-시장', '1 시장-제품', '2 제품-채널', '3 채널-수익', '4 시장 자리']
const clip = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 300) : '')
type O = Record<string, any>

/** 순수 함수 — 결과 JSON → 예측 행(최대 3개). 빈 claim 은 버린다. 숫자 확률(prediction_pct 등)은 읽지 않는다. */
export function buildPredictions(runId: string, kind: PredictionKind, o: O, now = new Date()): PredictionRow[] {
  const due = new Date(now.getTime() + DUE_DAYS * 864e5).toISOString()
  let ev = 0
  let rows: [string, string][] = []
  if (kind === 'report') {
    ev = Array.isArray(o.similar) ? o.similar.length : 0
    rows = [[clip(o.headline), `${o.leak_or_gap?.kind ?? 'unknown'}`], [o.viability ? `막힌 다리 ${STAGE[o.viability.fit_broken_stage] ?? '?'}: ${clip(o.viability.fit_test_result)}` : '', `${o.viability?.fit_color ?? ''}`]]
  } else if (kind === 'memo') {
    rows = [[clip(o.recommendation?.choice), 'recommend'], ...((o.recommendation?.change_mind_if ?? []) as unknown[]).slice(0, 2).map((c): [string, string] => [clip(c), 'change_mind_if'])]
  } else if (kind === 'b') {
    ev = Number(o.reference_group?.count) || 0
    rows = [[clip(o.verdict_reason), `${o.verdict ?? ''}`], [clip(o.falsifiable_condition), 'falsifiable'], [clip(o.kill_condition), 'kill']]
  } else if (kind === 'c1') {
    ev = Number(o.reference_group?.count) || 0
    rows = [[`가장 먼저 끊긴 다리: ${STAGE[o.blocked_stage] ?? '?'}`, `blocked_stage_${o.blocked_stage}`], [clip(o.give_up_condition), 'give_up']]
  } else {
    const top = o.candidates?.[o.top_pick?.index]
    ev = top ? (top.reference_cases?.length ?? 0) + (top.failure_case ? 1 : 0) : 0
    rows = [[top ? `1순위 ${clip(top.name)}: ${clip(o.top_pick?.reason)}` : '', 'top_pick'], [clip(o.top_pick?.give_up_condition), 'give_up']]
  }
  return rows.filter(([c, v]) => c && v && !c.endsWith(': ')).map(([claim, verdict]) => ({ run_id: runId, mode: kind, claim, verdict, evidence_count: ev, prob: null, due_at: due }))
}

/** 기록 — 던지지 않는다. 'recorded' | 'empty'(남길 예측 없음) | 'failed'(테이블 미적용·칼럼 없음 등, 로그만). */
export async function recordPredictions(sb: Pick<SupabaseClient, 'from'>, runId: string, kind: PredictionKind, output: unknown): Promise<'recorded' | 'empty' | 'failed'> {
  try {
    const rows = buildPredictions(runId, kind, (output ?? {}) as O)
    if (!rows.length) return 'empty'
    const { error } = await sb.from('consult_predictions').insert(rows)
    if (error) { console.error(`consult_predictions insert failed (run ${runId}, ${kind}): ${error.message}`); return 'failed' }
    return 'recorded'
  } catch (e) {
    console.error(`consult_predictions insert threw (run ${runId}, ${kind}): ${e instanceof Error ? e.message : e}`)
    return 'failed'
  }
}
