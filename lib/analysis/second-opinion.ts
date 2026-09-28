// T2 2차 판정 — export/import·야간 2차의 부품. 네트워크 없음, DB 는 recordSecondOpinion 이 넘겨받은 클라이언트로만.
// scripts/relevance-export.mjs · relevance-second-opinion-import.mjs · relevance-second-judge-auto.mjs 가 쓴다.
//
// 설계(남헌 2026-09-26 결정 2):
//   export  → 판정 대상 행을 파일로(ops/state/relevance-export-<날짜>.json). **기존 판정·라벨은 넣지 않는다**(세션이 눈가림 상태로 독립 판정).
//   세션    → 같은 스키마로 relevance-second-opinion-<날짜>.json 을 쓴다(파일·PR 만, DB 없음).
//   import  → 서비스키가 있는 환경(로컬 .env.local 또는 Actions)에서만. 기본은 드라이런(비교 리포트만). --apply 는
//             **라벨 4개 전부 NULL 이고 불가 표시가 없는 행에만** 라벨을 채운다. verdict·human_verdict·기존 라벨은 절대 덮지 않는다.

// "관련"의 정의는 1차 판정(relevance-judge.ts SYSTEM)과 같은 상수다 — 2026-09-28 기준 통일(docs/t2-relevance-criteria.md).
import { PRODUCT_INFORMATIVE_CRITERIA, RELEVANCE_CRITERIA, RELEVANCE_CRITERIA_VERSION } from './relevance-criteria.ts'
import { compareAutoPriority } from './extract-auto.ts'

export const VERDICTS = ['relevant', 'irrelevant', 'unknown'] as const
export const LEVELS = ['high', 'mid', 'low'] as const
export const SIGNALS = ['pain', 'demand', 'objection'] as const

/**
 * export 파일의 `instructions` — 2차 판정 세션이 읽는 프롬프트 본문. 기준은 1차와 같은 RELEVANCE_CRITERIA 를 글자 그대로 싣는다.
 * 결과 파일에 criteria_version 을 되돌려 적게 한다 — import 가 버전이 다른 판정을 자동 승인 입력으로 쓰지 않게(auto-approval.ts).
 */
export const SECOND_OPINION_INSTRUCTIONS = [
  '각 행을 독립적으로 판정하라. 기존 판정은 이 파일에 없다 — 보지 말고 판정하라.',
  '행의 business_model 로 아래 기준 중 어느 쪽을 쓸지 고른다(null 이면 project_pitch 와 원문으로 고른다).',
  '',
  RELEVANCE_CRITERIA,
  '',
  PRODUCT_INFORMATIVE_CRITERIA,
  '',
  '출력: 같은 input_id 로 {criteria_version, rows:[...]} 형태의 relevance-second-opinion-<날짜>.json.',
  `criteria_version 은 "${RELEVANCE_CRITERIA_VERSION}" 을 그대로 적는다.`,
  '행: verdict(relevant|irrelevant|unknown) · product_informative(true|false|null — 위 추가 질문, verdict 와 따로) · impact/frequency(high|mid|low|null) · community_signal(pain|demand|objection|null) · wtp_mentioned(true|false|null) · reason(한 줄).',
  '원문으로 정할 수 없는 라벨은 null 이다 — 추측으로 채우지 마라.',
].join('\n')

/** 결과 파일이 지금 기준으로 판정됐나. 버전이 없거나 다르면 false — 옛 기준 판정은 자동 승인 입력이 아니다(§7.1: 없음을 같음으로 접지 않는다). */
export function isCurrentCriteria(raw: unknown): boolean {
  return Boolean(raw) && typeof raw === 'object' && (raw as { criteria_version?: unknown }).criteria_version === RELEVANCE_CRITERIA_VERSION
}

export type ExportRow = { input_id: string; project_id: string; project_pitch: string | null; business_model: string | null; text: string }
export type OpinionRow = {
  input_id: string
  verdict: (typeof VERDICTS)[number]
  impact: (typeof LEVELS)[number] | null
  frequency: (typeof LEVELS)[number] | null
  community_signal: (typeof SIGNALS)[number] | null
  wtp_mentioned: boolean | null
  /** rr-v2 추가 질문. 생략·null = 판단 불가(옛 t2c 파일은 이 키가 없다). 불리언 아닌 값은 거부한다. */
  product_informative: boolean | null
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
export function toExportRow(r: { input_id: string; project_id: string; raw_text: string | null; pitch?: string | null; business_model?: string | null }): ExportRow {
  return { input_id: r.input_id, project_id: r.project_id, project_pitch: r.pitch ?? null, business_model: r.business_model ?? null, text: (r.raw_text ?? '').replace(/\s+/g, ' ').trim().slice(0, EXPORT_TEXT_MAX) }
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
    const info = o.product_informative == null ? null : typeof o.product_informative === 'boolean' ? o.product_informative : undefined
    if (info === undefined) return void rejected.push({ index, reason: `product_informative 불리언 아님: ${String(o.product_informative)}` })
    seen.add(id)
    ok.push({ input_id: id, verdict: verdict as OpinionRow['verdict'], impact, frequency, community_signal: sig, wtp_mentioned: wtp, product_informative: info, reason: typeof o.reason === 'string' ? o.reason.slice(0, 500) : null })
  })
  return { ok, rejected }
}

/** 2차 판정 요청 본문(user 프롬프트). 야간 2차(relevance-second-judge-auto)와 평가 하네스(t2-approval-eval)가 같은 문장을 쓴다. */
export function secondOpinionUserPrompt(rows: readonly ExportRow[]): string {
  return `아래 행들을 판정하라. JSON 객체 하나만 출력: {"criteria_version":"${RELEVANCE_CRITERIA_VERSION}","rows":[{input_id,verdict,product_informative,impact,frequency,community_signal,wtp_mentioned,reason}]}\n\n${JSON.stringify(rows)}`
}

/** 1차 판정 모델이 Gemini 계열인가. 2차는 Gemini 로 고정이라, 이런 행(옛 판정)에 2차를 달면 독립 판정이 아니다. */
export function isGeminiModel(model: string | null | undefined): boolean {
  return /gemini/i.test(String(model ?? ''))
}

export type SecondJudgeCandidate = {
  input_id: string
  verdict: string | null
  model: string | null
  judged_at: string | null
  human_verdict: string | null
  second_verdict: string | null
}

/**
 * 야간 2차 판정 대상인가 — 1차 있음 ∧ 2차 없음 ∧ 사람 미채점 ∧ 1차 판정이 since 이후 ∧ 1차가 Gemini 가 아님(독립성).
 * DB 쿼리가 같은 조건으로 거르지만, 여기서 한 번 더 건다(쿼리가 조건을 잃어도 대상이 넓어지지 않게).
 * 판정 시각·모델을 모르면 대상이 아니다(§7.1 — 모름을 "해당"으로 접지 않는다).
 */
export function secondJudgeTargetReason(r: SecondJudgeCandidate, since: Date): 'target' | 'no-first' | 'has-second' | 'human' | 'before-since' | 'gemini-first' | 'no-model' {
  if (r.verdict == null) return 'no-first'
  if (r.second_verdict != null) return 'has-second'
  if (r.human_verdict != null) return 'human'
  const t = r.judged_at ? Date.parse(r.judged_at) : NaN
  if (!Number.isFinite(t) || t < since.getTime()) return 'before-since'
  if (!r.model) return 'no-model'
  if (isGeminiModel(r.model)) return 'gemini-first'
  return 'target'
}

/**
 * 상한까지 고르기 — 프로젝트 단위로 묶어 야간 extract·1차 판정과 같은 순서(compareAutoPriority: SaaS 우선 → 많은 순 → projectId)로
 * 펼친 뒤 max 건에서 자른다. remaining 은 상한에 걸려 내일로 미룬 건수다(§7.2 — "대상 0"과 "상한 도달"을 가른다).
 */
export function orderSecondTargets<T extends { project_id: string }>(
  rows: readonly T[],
  businessModelOf: (projectId: string) => string | null | undefined,
  max: number,
): { picked: T[]; remaining: number } {
  const byProject = new Map<string, T[]>()
  for (const r of rows) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r])
  const ordered = [...byProject.entries()]
    .sort(([a, ra], [b, rb]) => compareAutoPriority(
      { projectId: a, newInputs: ra.length, businessModel: businessModelOf(a) },
      { projectId: b, newInputs: rb.length, businessModel: businessModelOf(b) },
    ))
    .flatMap(([, rs]) => rs)
  const n = Math.max(0, Math.floor(max))
  return { picked: ordered.slice(0, n), remaining: Math.max(0, ordered.length - n) }
}

type DbErr ={ code?: string; message?: string } | null
type UpdateChain = {
  eq(col: string, v: unknown): UpdateChain
  is(col: string, v: null): UpdateChain
  select(cols: string): PromiseLike<{ data: unknown[] | null; error: DbErr }>
}
/** supabase-js 클라이언트 중 recordSecondOpinion 이 쓰는 부분만. 셀프테스트는 이 모양의 가짜를 넘긴다. */
export type SecondRecordClient = { from(table: string): { update(payload: Record<string, unknown>): UpdateChain } }

export type RecordOutcome = { result: 'recorded' | 'skipped' | 'failed'; infoColumnAbsent: boolean; error: DbErr }

const missingColumn = (e: DbErr) => Boolean(e && (e.code === '42703' || e.code === 'PGRST204'))

/**
 * 2차 판정 한 행 기록 — second_verdict·second_model·second_judged_at·second_product_informative 만 쓴다.
 * 경쟁 방지 조건을 WHERE 에 건다: second_verdict IS NULL(이미 있으면 덮지 않음), requireUngraded 면 human_verdict IS NULL 도.
 * 0행 갱신 = skipped(그사이 누가 채웠다). 정보 컬럼(마이그 000031)만 없으면 그 필드를 빼고 한 번 더 쓰고 infoColumnAbsent 로 알린다.
 * verdict·human_verdict·라벨은 쓰지 않는다. relevance-second-opinion-import.mjs --record-second 와 relevance-second-judge-auto.mjs 가 같이 쓴다.
 */
export async function recordSecondOpinion(
  sb: SecondRecordClient,
  o: Pick<OpinionRow, 'input_id' | 'verdict' | 'product_informative'>,
  opts: { model: string; judgedAt: string; withInfo?: boolean; requireUngraded?: boolean },
): Promise<RecordOutcome> {
  const write = (withInfo: boolean) => {
    let q = sb.from('review_relevance_verdicts')
      .update({ second_verdict: o.verdict, second_model: opts.model, second_judged_at: opts.judgedAt, ...(withInfo ? { second_product_informative: o.product_informative } : {}) })
      .eq('input_id', o.input_id).is('second_verdict', null)
    if (opts.requireUngraded ?? true) q = q.is('human_verdict', null)
    return q.select('input_id')
  }
  let infoColumnAbsent = opts.withInfo === false
  let { data, error } = await write(!infoColumnAbsent)
  if (!infoColumnAbsent && missingColumn(error) && /second_product_informative/.test(error?.message ?? '')) {
    infoColumnAbsent = true
    ;({ data, error } = await write(false))
  }
  if (error) return { result: 'failed', infoColumnAbsent, error }
  return { result: data && data.length > 0 ? 'recorded' : 'skipped', infoColumnAbsent, error: null }
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
