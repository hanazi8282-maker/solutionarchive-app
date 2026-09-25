// T2 2차 판정(클라우드 세션) — export/import 의 순수 부품. 네트워크·DB 없음. scripts/relevance-export.mjs · relevance-second-opinion-import.mjs 가 쓴다.
//
// 설계(남헌 2026-09-26 결정 2):
//   export  → 판정 대상 행을 파일로(ops/state/relevance-export-<날짜>.json). **기존 판정·라벨은 넣지 않는다**(세션이 눈가림 상태로 독립 판정).
//   세션    → 같은 스키마로 relevance-second-opinion-<날짜>.json 을 쓴다(파일·PR 만, DB 없음).
//   import  → 서비스키가 있는 환경(로컬 .env.local 또는 Actions)에서만. 기본은 드라이런(비교 리포트만). --apply 는
//             **라벨 4개 전부 NULL 이고 불가 표시가 없는 행에만** 라벨을 채운다. verdict·human_verdict·기존 라벨은 절대 덮지 않는다.

export const VERDICTS = ['relevant', 'irrelevant', 'unknown'] as const
export const LEVELS = ['high', 'mid', 'low'] as const
export const SIGNALS = ['pain', 'demand', 'objection'] as const

export type ExportRow = { input_id: string; project_id: string; project_pitch: string | null; text: string }
export type OpinionRow = {
  input_id: string
  verdict: (typeof VERDICTS)[number]
  impact: (typeof LEVELS)[number] | null
  frequency: (typeof LEVELS)[number] | null
  community_signal: (typeof SIGNALS)[number] | null
  wtp_mentioned: boolean | null
  reason?: string | null
}
export type DbRow = {
  input_id: string
  verdict: string | null
  human_verdict: string | null
  impact: string | null
  frequency: string | null
  community_signal: string | null
  wtp_mentioned: boolean | null
  labels_unavailable_reason: string | null
}

export const EXPORT_TEXT_MAX = 600

/** export 행 만들기 — 원문은 앞 600자만(세션 컨텍스트 절약), 판정·라벨은 싣지 않는다. */
export function toExportRow(r: { input_id: string; project_id: string; raw_text: string | null; pitch?: string | null }): ExportRow {
  return { input_id: r.input_id, project_id: r.project_id, project_pitch: r.pitch ?? null, text: (r.raw_text ?? '').replace(/\s+/g, ' ').trim().slice(0, EXPORT_TEXT_MAX) }
}

/** 세션 결과 파일 검증 — 어휘 밖 값·중복·빈 id 는 거부 목록으로 돌려준다(조용히 버리지 않는다, §7.1). */
export function validateOpinions(raw: unknown): { ok: OpinionRow[]; rejected: { index: number; reason: string }[] } {
  const ok: OpinionRow[] = []
  const rejected: { index: number; reason: string }[] = []
  const rows = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown }).rows) ? (raw as { rows: unknown[] }).rows : null)
  if (!rows) return { ok, rejected: [{ index: -1, reason: '배열 또는 {rows:[]} 가 아니다' }] }
  const seen = new Set<string>()
  rows.forEach((r, index) => {
    const o = (r ?? {}) as Record<string, unknown>
    const id = typeof o.input_id === 'string' ? o.input_id.trim() : ''
    if (!id) return void rejected.push({ index, reason: 'input_id 없음' })
    if (seen.has(id)) return void rejected.push({ index, reason: `중복 input_id ${id}` })
    const verdict = o.verdict
    if (!(VERDICTS as readonly unknown[]).includes(verdict)) return void rejected.push({ index, reason: `verdict 어휘 밖: ${String(verdict)}` })
    const lvl = (k: string) => (o[k] == null ? null : (LEVELS as readonly unknown[]).includes(o[k]) ? (o[k] as OpinionRow['impact']) : undefined)
    const impact = lvl('impact'), frequency = lvl('frequency')
    if (impact === undefined) return void rejected.push({ index, reason: `impact 어휘 밖: ${String(o.impact)}` })
    if (frequency === undefined) return void rejected.push({ index, reason: `frequency 어휘 밖: ${String(o.frequency)}` })
    const sig = o.community_signal == null ? null : (SIGNALS as readonly unknown[]).includes(o.community_signal) ? (o.community_signal as OpinionRow['community_signal']) : undefined
    if (sig === undefined) return void rejected.push({ index, reason: `community_signal 어휘 밖: ${String(o.community_signal)}` })
    const wtp = o.wtp_mentioned == null ? null : typeof o.wtp_mentioned === 'boolean' ? o.wtp_mentioned : undefined
    if (wtp === undefined) return void rejected.push({ index, reason: `wtp_mentioned 불리언 아님: ${String(o.wtp_mentioned)}` })
    seen.add(id)
    ok.push({ input_id: id, verdict: verdict as OpinionRow['verdict'], impact, frequency, community_signal: sig, wtp_mentioned: wtp, reason: typeof o.reason === 'string' ? o.reason.slice(0, 500) : null })
  })
  return { ok, rejected }
}

export type Comparison = {
  input_id: string
  db_verdict: string | null
  human_verdict: string | null
  opinion_verdict: string
  agrees_with_db: boolean | null
  agrees_with_human: boolean | null
  fillable: boolean
}

/** 세션 판정 vs DB 비교 + "라벨을 채울 수 있는 행" 판정. 채우기 조건: 라벨 4개 전부 NULL · 불가 표시 없음 · 세션이 relevant 로 봤고 라벨을 하나라도 줌. */
export function compare(opinions: OpinionRow[], db: Map<string, DbRow>): { rows: Comparison[]; missing: string[] } {
  const rows: Comparison[] = []
  const missing: string[] = []
  for (const o of opinions) {
    const d = db.get(o.input_id)
    if (!d) { missing.push(o.input_id); continue }
    const allNull = d.impact == null && d.frequency == null && d.community_signal == null && d.wtp_mentioned == null
    const gaveLabel = o.impact != null || o.frequency != null || o.community_signal != null || o.wtp_mentioned != null
    rows.push({
      input_id: o.input_id,
      db_verdict: d.verdict,
      human_verdict: d.human_verdict,
      opinion_verdict: o.verdict,
      agrees_with_db: d.verdict == null || d.verdict === 'unknown' || o.verdict === 'unknown' ? null : d.verdict === o.verdict,
      agrees_with_human: d.human_verdict == null || o.verdict === 'unknown' ? null : d.human_verdict === o.verdict,
      fillable: allNull && d.labels_unavailable_reason == null && o.verdict === 'relevant' && gaveLabel,
    })
  }
  return { rows, missing }
}

export function summarize(rows: Comparison[]) {
  const n = rows.length
  const dbCmp = rows.filter((r) => r.agrees_with_db !== null)
  const huCmp = rows.filter((r) => r.agrees_with_human !== null)
  return {
    n,
    vs_db: { compared: dbCmp.length, agree: dbCmp.filter((r) => r.agrees_with_db).length },
    vs_human: { compared: huCmp.length, agree: huCmp.filter((r) => r.agrees_with_human).length },
    fillable: rows.filter((r) => r.fillable).length,
    unknown: rows.filter((r) => r.opinion_verdict === 'unknown').length,
  }
}
