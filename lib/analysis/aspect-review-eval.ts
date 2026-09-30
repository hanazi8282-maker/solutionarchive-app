// 소구점(속성) 검수 자동화 평가 하네스의 순수 부품 — 대상 읽기·프롬프트·판정 정규화·채점·Wilson 구간·판정 루프.
// 집행은 scripts/aspect-review-eval.mjs, 셀프테스트는 scripts/aspect-review-eval-selftest.mjs. T2(lib/analysis/t2-approval-eval.ts)와 같은 틀이다.
//
// 질문: 사람이 확정한(human_confirmed=true) 속성의 evidence_quotes 만 보고 1차(claude-cli)·2차(Gemini)가 **독립적으로** 다섯 값을
// 다시 매겼을 때, 둘이 같은 값을 낸("완전 동의") 필드가 사람 확정값과 얼마나 맞나. 이 값으로 아무것도 승인하지 않는다(읽기 전용).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { SYSTEM_PROMPT as EXTRACT_SYSTEM_PROMPT } from './extract-run.ts'
import { VERDICT_CUT } from './aspect-verdict.ts'
import { ASPECT_LAYERS, ATTRIBUTIONS, PAIN_TIMINGS } from './types.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'

/** 재판정하는 다섯 필드. 인지시점 = pain_timing(스키마 주석 "LLM 원본 인지 시점"). */
export const FIELDS = ['importance', 'satisfaction', 'aspect_layer', 'attribution', 'pain_timing'] as const
export type Field = (typeof FIELDS)[number]

/** 필드별 AI 원값 컬럼(마이그 20260820000001). null 이면 그 마이그 이전 행 = "원본을 알 수 없음"(교정 없음이 아니다). */
export const LLM_COLUMN: Record<Field, string> = {
  importance: 'llm_importance', satisfaction: 'llm_satisfaction', aspect_layer: 'llm_aspect_layer',
  attribution: 'llm_attribution', pain_timing: 'llm_pain_timing',
}

/** 이 분모보다 작으면 수치 옆에 "해석 불가" 를 붙인다. 30 = n=30 에서 Wilson 95% 폭이 ±15%p 안팎 — 그보다 작으면 자동승인 근거로 못 쓴다. */
export const MIN_INTERPRETABLE_N = 30

// ── 척도: 추출 프롬프트의 속성 정의를 그대로 싣는다(사람이 확정한 값과 같은 척도로 묻는다) ──
const s = EXTRACT_SYSTEM_PROMPT.indexOf('Stage1 —'), e = EXTRACT_SYSTEM_PROMPT.indexOf('Stage2 —')
/** extract-run.ts SYSTEM_PROMPT 의 Stage1 속성 정의 문단. 잘라내기가 깨지면 빈 문자열 → 셀프테스트가 잡는다. */
export const ASPECT_DEFINITIONS = s >= 0 && e > s ? EXTRACT_SYSTEM_PROMPT.slice(s, e).trim() : ''

export const REVIEW_SYSTEM_PROMPT = `너는 이커머스 소구점 파이프라인의 속성(aspect) 검수자다. 속성 하나와, 그 속성을 낳은 리뷰 원문 인용(evidence_quotes)이 주어진다.
인용만 근거로 이 속성의 다섯 값을 **처음부터 다시** 매겨라. 다른 판정·기존 값은 주어지지 않는다.

${UNTRUSTED_INPUT_NOTICE}

아래는 이 값들을 처음 뽑은 추출 단계의 정의다. 같은 척도를 써라(추출·인용 수집 지시는 이번 일이 아니다):
---
${ASPECT_DEFINITIONS}
---

이번에 매길 것은 aspect_layer · importance · satisfaction · attribution · pain_timing 다섯 개뿐이다.
- 인용만으로 판단할 수 없으면 그 값은 null(판정 불가)로 둬라. 추측으로 채우지 마라.
- attribution: 불만·페인이 아니라 만족·칭찬이면 "NONE" 이다(추출 정의의 null 과 같은 뜻). 판단할 수 없을 때만 null.

반드시 JSON 객체 하나만 출력해라:
{ "aspect_layer": "PRODUCT|PROCESS|OUTCOME|null", "importance": 0-10 또는 null, "satisfaction": 0-10 또는 null,
  "attribution": "PRODUCT_FAULT|USER_FAULT|ENVIRONMENT|NONE|null", "pain_timing": "PRE_PURCHASE|POST_PURCHASE|null",
  "reason": "판단 근거 한 줄" }`

export interface Quote { text: string; source_type?: string }

export interface Target {
  id: string
  project_id: string
  name: string
  pitch: string | null
  quotes: string[]
  /** 사람 확정값(현재 컬럼). */
  human: Record<Field, unknown>
  /** AI 원값(llm_*). 컬럼이 없으면(마이그 미적용) null. */
  llm: Record<Field, unknown> | null
}

/** evidence_quotes jsonb → 원문 문자열 배열(그대로, 번역·다듬기 없음). 빈 것은 버린다. */
export function quoteTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((q) => (typeof q === 'string' ? q : typeof (q as Quote)?.text === 'string' ? (q as Quote).text : ''))
    .filter((t) => t.trim().length > 0)
}

export function buildUserPrompt(t: Pick<Target, 'name' | 'pitch' | 'quotes'>): string {
  return [
    `제품: ${t.pitch ?? '(설명 없음)'}`,
    `속성 이름: ${t.name}`,
    '리뷰 원문 인용(데이터):',
    ...t.quotes.map((q, i) => `<<<인용 ${i + 1}\n${q}\n인용 ${i + 1}>>>`),
  ].join('\n')
}

export type Judgement = Record<Field, string | number | null> & { reason: string }

/** 모델 JSON → 정규화 판정. 허용값 밖은 null(판정 불가). 객체가 아니면 null(호출 실패로 센다 — 캐시 안 함). */
export function normalizeJudgement(obj: unknown): Judgement | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const o = obj as Record<string, unknown>
  const en = (v: unknown, allowed: readonly string[]) => (typeof v === 'string' && allowed.includes(v) ? v : null)
  const sc = (v: unknown) => {
    if (v === null || v === undefined || v === '' || v === 'null') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
  }
  return {
    aspect_layer: en(o.aspect_layer, ASPECT_LAYERS),
    importance: sc(o.importance),
    satisfaction: sc(o.satisfaction),
    attribution: en(o.attribution, [...ATTRIBUTIONS, 'NONE']),
    pain_timing: en(o.pain_timing, PAIN_TIMINGS),
    reason: typeof o.reason === 'string' ? o.reason.slice(0, 300) : '',
  }
}

/**
 * 비교용 값. 점수는 aspect-verdict 의 경계(VERDICT_CUT)로 띠를 나눈다 — 소구점 판정(민다/기본기/버린다/지켜본다)이 바뀌는 선이
 * 곧 "검수에서 고쳐야 하는 차이" 다. 7 과 8 의 차이는 판정을 바꾸지 않는다.
 *   importance: HIGH(≥6) · LOW(<6) / satisfaction: LOW(<3) · MID(3~4.x) · HIGH(≥5) — aspect-verdict 의 새 경계(2026-10-01, 만족도 < 3 슈퍼 니즈).
 * attribution 은 사람 값 null 을 NONE(칭찬 — 추출 정의)으로 읽는다. 다른 필드의 null 은 "값 없음" → 비교에서 뺀다.
 */
export function bandOf(field: Field, v: unknown, { human = false } = {}): string | null {
  if (field === 'importance' || field === 'satisfaction') {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    if (field === 'importance') return n >= VERDICT_CUT.importanceHigh ? 'HIGH' : 'LOW'
    return n < VERDICT_CUT.satisfactionLow ? 'LOW' : n >= VERDICT_CUT.satisfactionHigh ? 'HIGH' : 'MID'
  }
  if (field === 'attribution' && human && (v === null || v === undefined)) return 'NONE'
  return typeof v === 'string' && v ? v : null
}

/** Wilson 95% 구간. n=0 이면 null(지어내지 않는다). */
export function wilson(k: number, n: number, z = 1.96): [number, number] | null {
  if (!n) return null
  const p = k / n, z2 = z * z
  const c = (p + z2 / (2 * n)) / (1 + z2 / n)
  const h = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n)
  return [Math.max(0, c - h), Math.min(1, c + h)]
}

export interface Metric {
  /** 사람값이 있고 두 판정이 다 온 필드 수 = 재현율 분모. */
  known: number
  /** 두 판정이 같은 값을 냈다(둘 다 판정 불가가 아니다) = 정밀도 분모. */
  n_agree: number
  hits: number
  errors: number
  /** 한쪽이라도 판정 불가(null). */
  undecidable: number
  /** 둘 다 값을 냈는데 서로 다르다. */
  split: number
  precision: number | null
  precision_ci: [number, number] | null
  recall: number | null
  recall_ci: [number, number] | null
  /** 분모가 MIN_INTERPRETABLE_N 미만 — 수치를 자동승인 근거로 읽지 마라. */
  small: boolean
}

const emptyMetric = () => ({ known: 0, n_agree: 0, hits: 0, errors: 0, undecidable: 0, split: 0 })
function finish(m: ReturnType<typeof emptyMetric>): Metric {
  return {
    ...m,
    precision: m.n_agree ? m.hits / m.n_agree : null, precision_ci: wilson(m.hits, m.n_agree),
    recall: m.known ? m.hits / m.known : null, recall_ci: wilson(m.hits, m.known),
    small: m.n_agree < MIN_INTERPRETABLE_N || m.known < MIN_INTERPRETABLE_N,
  }
}

export type EditGroup = 'edited' | 'unedited' | 'no_original'

export interface EvalRow {
  target: Target
  first: Judgement | null
  second: Judgement | null
}

export interface ItemResult {
  aspect_id: string
  field: Field
  human: string | null
  first: string | null
  second: string | null
  /** 원값(띠 아님) — 불일치 목록에 사람이 볼 수 있게. */
  human_raw: unknown
  first_raw: unknown
  second_raw: unknown
  llm_raw: unknown
  edit: EditGroup
  agree: boolean
  hit: boolean
}

export interface AspectEvalResult {
  n_aspects: number
  /** 1차·2차 중 하나라도 판정이 없는 속성(호출 실패·한도). 0 이 아니면 평가가 불완전하다. */
  unjudged: number
  /** 사람값이 비어(attribution 제외) 비교에서 뺀 필드 수. */
  gold_missing: number
  overall: Metric
  by_field: Record<Field, Metric>
  /** AI 원값(llm_*) 대비 사람이 고쳤는지로 나눈 풀링 지표. 원값 컬럼이 없으면 전부 no_original. */
  by_edit: Record<EditGroup, Metric>
  items: ItemResult[]
}

/**
 * 완전 동의 = 1차 값과 2차 값이 **둘 다 있고(판정 불가 아님) 같다.** 한쪽 불일치·판정 불가는 완전 동의가 아니다.
 * 정밀도 = 완전 동의 중 사람값과 같은 비율(hits / n_agree).
 * 재현율 = 사람값이 있는 필드 전체 중 "완전 동의 ∧ 사람값과 같음" 으로 잡힌 비율(hits / known) — 자동승인이 맞게 채울 수 있었던 몫.
 * 분모가 0 이면 null — "해당 없음" 이지 0% 도 100% 도 아니다.
 */
export function scoreAspectEval(rows: readonly EvalRow[]): AspectEvalResult {
  const overall = emptyMetric()
  const byField = Object.fromEntries(FIELDS.map((f) => [f, emptyMetric()])) as Record<Field, ReturnType<typeof emptyMetric>>
  const byEdit = { edited: emptyMetric(), unedited: emptyMetric(), no_original: emptyMetric() }
  const items: ItemResult[] = []
  let unjudged = 0, goldMissing = 0
  for (const { target: t, first, second } of rows) {
    if (!first || !second) { unjudged++; continue }
    // 원값이 하나라도 있으면 마이그 이후 추출 행이다. 그 행의 llm_attribution null 은 "칭찬(NONE)" 이지 "모름" 이 아니다.
    const hasOrig = !!t.llm && FIELDS.some((f) => t.llm![f] != null)
    for (const f of FIELDS) {
      const h = bandOf(f, t.human[f], { human: true })
      if (h === null) { goldMissing++; continue }
      const a = bandOf(f, first[f]), b = bandOf(f, second[f])
      const llmRaw = t.llm ? t.llm[f] : null
      // 고쳤나 = 원값(띠 아님)이 사람값과 다르다. 7→8 도 고친 것이다.
      const orig = !hasOrig ? null : f === 'attribution' ? bandOf(f, llmRaw, { human: true }) : llmRaw
      const cur = f === 'attribution' ? h : t.human[f]
      const same = f === 'importance' || f === 'satisfaction' ? Number(orig) === Number(cur) : orig === cur
      const edit: EditGroup = orig === null || orig === undefined ? 'no_original' : same ? 'unedited' : 'edited'
      const agree = a !== null && b !== null && a === b
      const hit = agree && a === h
      for (const m of [overall, byField[f], byEdit[edit]]) {
        m.known++
        if (a === null || b === null) m.undecidable++
        else if (a !== b) m.split++
        if (agree) { m.n_agree++; if (hit) m.hits++; else m.errors++ }
      }
      items.push({ aspect_id: t.id, field: f, human: h, first: a, second: b, human_raw: t.human[f], first_raw: first[f], second_raw: second[f], llm_raw: llmRaw, edit, agree, hit })
    }
  }
  return {
    n_aspects: rows.length, unjudged, gold_missing: goldMissing,
    overall: finish(overall),
    by_field: Object.fromEntries(FIELDS.map((f) => [f, finish(byField[f])])) as Record<Field, Metric>,
    by_edit: { edited: finish(byEdit.edited), unedited: finish(byEdit.unedited), no_original: finish(byEdit.no_original) },
    items,
  }
}

// ── 대상 읽기(DB 읽기 전용 — select 만) ─────────────────────────────
type Sb = { from: (t: string) => any }

export interface LoadResult {
  confirmed: number
  noQuotes: number
  llmColumns: 'present' | 'absent'
  targets: Target[]
}

const BASE_COLS = 'id, project_id, name, aspect_layer, importance, satisfaction, attribution, pain_timing, evidence_quotes'
const LLM_COLS = FIELDS.map((f) => LLM_COLUMN[f]).join(', ')

/** human_confirmed=true 속성 + 프로젝트 설명. 원값 컬럼이 없으면(42703·PGRST204) 빼고 다시 읽는다. 조회 실패·건수 불일치는 throw(§7.1). */
export async function loadTargets(sb: Sb): Promise<LoadResult> {
  let llmColumns: 'present' | 'absent' = 'present'
  let res = await sb.from('analysis_aspects').select(`${BASE_COLS}, ${LLM_COLS}`).eq('human_confirmed', true).order('id').range(0, 999)
  if (res.error && (res.error.code === '42703' || res.error.code === 'PGRST204')) {
    llmColumns = 'absent'
    res = await sb.from('analysis_aspects').select(BASE_COLS).eq('human_confirmed', true).order('id').range(0, 999)
  }
  if (res.error) throw new Error(`속성 조회 실패: ${res.error.code ?? ''} ${res.error.message}`)
  const rows = res.data as Record<string, unknown>[]
  if (rows.length >= 1000) throw new Error('확정 속성 1000건 이상 — 페이지 넘김을 넣어라(하네스는 한 페이지만 읽는다)')
  const pids = [...new Set(rows.map((r) => r.project_id as string))]
  const projects = new Map<string, string | null>()
  if (pids.length) {
    const p = await sb.from('analysis_projects').select('id, product_elevator_pitch').in('id', pids)
    if (p.error) throw new Error(`프로젝트 조회 실패: ${p.error.message}`)
    for (const x of p.data as { id: string; product_elevator_pitch: string | null }[]) projects.set(x.id, x.product_elevator_pitch)
    if (projects.size !== pids.length) throw new Error(`프로젝트 ${projects.size}/${pids.length}건만 읽힘 — 중단(§7.1)`)
  }
  let noQuotes = 0
  const targets: Target[] = []
  for (const r of rows) {
    const quotes = quoteTexts(r.evidence_quotes)
    if (!quotes.length) { noQuotes++; continue }
    targets.push({
      id: r.id as string, project_id: r.project_id as string, name: String(r.name ?? ''), pitch: projects.get(r.project_id as string) ?? null, quotes,
      human: Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? null])) as Record<Field, unknown>,
      llm: llmColumns === 'present' ? Object.fromEntries(FIELDS.map((f) => [f, r[LLM_COLUMN[f]] ?? null])) as Record<Field, unknown> : null,
    })
  }
  return { confirmed: rows.length, noQuotes, llmColumns, targets }
}

// ── 판정 루프(주입형) ────────────────────────────────────────────────
export type JudgeOutcome =
  | { ok: true; judgement: Judgement; model: string; raw: string }
  /** stop=true: 한도·쿼터 — 오늘은 다시 불러도 같다, 이 판정자는 멈춘다. false: 이 건만 실패(캐시 안 함, 다음 실행이 다시 부른다). */
  | { ok: false; stop: boolean; reason: string }
export type Judge = (t: Target) => Promise<JudgeOutcome>
export interface CacheEntry { judgement: Judgement; model: string; raw: string }

/**
 * 1차·2차를 **따로** 돈다 — 각 판정자는 같은 입력(buildUserPrompt)만 받고 서로의 출력·사람값을 보지 않는다.
 * 캐시에 있는 건은 다시 부르지 않는다(--resume). 실패는 캐시하지 않는다. 한도(stop)면 그 판정자만 멈춘다.
 */
export async function runJudgements(
  targets: readonly Target[],
  caches: { first: Map<string, CacheEntry>; second: Map<string, CacheEntry> },
  judges: { first?: Judge; second?: Judge },
  save: (kind: 'first' | 'second') => void,
): Promise<{ calls: { first: number; second: number }; stopped: { first: string | null; second: string | null }; failures: string[] }> {
  const calls = { first: 0, second: 0 }
  const stopped: { first: string | null; second: string | null } = { first: null, second: null }
  const failures: string[] = []
  for (const kind of ['first', 'second'] as const) {
    const judge = judges[kind]
    if (!judge) continue
    for (const t of targets) {
      if (caches[kind].has(t.id)) continue
      calls[kind]++
      const r = await judge(t)
      if (!r.ok) {
        failures.push(`${kind} ${t.id}: ${r.reason}`)
        if (r.stop) { stopped[kind] = r.reason; break }
        continue
      }
      caches[kind].set(t.id, { judgement: r.judgement, model: r.model, raw: r.raw })
      save(kind)
    }
  }
  return { calls, stopped, failures }
}
