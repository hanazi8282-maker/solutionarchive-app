// 리뷰 목적 적합성 판정(T2) — 수집한 원문 한 건이 이 프로젝트의 분석 재료인지 LLM 이 3상태로 채점한다.
//
// 왜 생겼나(reports/2026-09-23/data-velocity-plan.md §2): 목적 적합성을 거르는 자리가 파이프라인
// 어디에도 없었다. 수집은 텍스트 내용을 안 보고, extract 는 들어온 것을 그대로 프롬프트에 밀어 넣는다.
// 리뷰 12,443건에 속성 40개가 그 결과다.
//
// 4층 게이트에서 이 파일의 자리(남헌 2026-09-23 확정):
//   T0 타깃 설계(비용 0) → T1 규칙 선별(extract-select.ts, LLM 0원) → **T2 = 여기(표본에만, 야간 배치)**
//   → T3 사람 채점(human_verdict 가 이긴다) → T4 처방 카드 게이트(remedy-gate.ts)
//
// ★ 세 상태를 지킨다(CLAUDE.md §7.1). mock · 파싱 실패 · 라벨 누락 · 응답 누락 · 호출 실패는
//   전부 `unknown` 이다. **절대 `irrelevant` 로 접지 않는다.** 여기서 한 칸을 접으면 멀쩡한 리뷰가
//   영영 안 읽힌다 — 버려진 원문은 30일 뒤 purge 되고 되돌릴 방법이 없다.
// ★ LLM 은 플래그만 한다(§10.1). 이 판정은 extract 입력 선별에서 제외하는 데만 쓰고,
//   행을 지우거나 상태를 바꾸지 않는다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(배치 CLI·셀프테스트). `@/` 별칭·enum 을 쓰지 않는다.

import { MOCK_MODEL } from './mock.ts'
import { callLlmWithModel, isQuotaFailure, resolveProvider } from './llm.ts'
// JSON 배열 응답을 건져내는 방식은 처방 판정과 한 벌이다 — 두 벌이 되면 한쪽만 관용도가 는다.
import { extractJsonArray } from '../cases/remedy-judge.ts'
// 목적 어휘 정본은 config/reader-problems.json 이다(lib/cases/draft.ts 가 읽는다).
import { READER_PROBLEM_LABEL } from '../cases/draft.ts'

export const RELEVANCE_VERDICTS = ['relevant', 'irrelevant', 'unknown'] as const
export type Relevance = (typeof RELEVANCE_VERDICTS)[number]

// T2 라벨(reports/2026-09-24/competitor-features-reestimate.md A1 · §F 7·8 · 12 WTP).
// 같은 호출에서 함께 받는다. 모델이 못 정하면 NULL 이다 — 'mid'·false 로 접지 않는다(§7.1).
export const LABEL_LEVELS = ['high', 'mid', 'low'] as const
export type LabelLevel = (typeof LABEL_LEVELS)[number]
export const COMMUNITY_SIGNALS = ['pain', 'demand', 'objection'] as const
export type CommunitySignal = (typeof COMMUNITY_SIGNALS)[number]

export interface RelevanceLabels {
  impact: LabelLevel | null
  frequency: LabelLevel | null
  community_signal: CommunitySignal | null
  /** true = 지불 의사·가격 언급 있음, false = 없음이라고 모델이 답함, null = 못 정함. */
  wtp_mentioned: boolean | null
}

const NO_LABELS: RelevanceLabels = { impact: null, frequency: null, community_signal: null, wtp_mentioned: null }

/** 리뷰 1건을 프롬프트에 실을 때의 상한. 긴 본문 하나가 배치를 독식하지 않게. */
export const MAX_REVIEW_CHARS = 1500
/** 한 번의 호출에 넣는 리뷰 수. 20건이면 입력 ≈15k 토큰(상한 기준)으로 한 호출에 들어간다. */
export const BATCH_SIZE = 20
/** few-shot 으로 주입하는 사람 채점 예시의 최대 개수·길이. */
export const MAX_EXAMPLES = 10
const EXAMPLE_CHARS = 300

/** 프로젝트의 분석 목적. reader_problem 이 없으면 한 줄 소개로 내려간다. */
export interface RelevancePurpose {
  /** config/reader-problems.json 의 코드. 지금 analysis_projects 에는 이 컬럼이 없다(미래 대비). */
  reader_problem?: string | null
  product_elevator_pitch?: string | null
  purpose?: string | null
}

export interface RelevanceReview {
  input_id: string
  text: string
}

/** 사람이 채점한 예시 한 건(되먹임). unknown 은 예시가 되지 않는다. */
export interface RelevanceExample {
  text: string
  verdict: 'relevant' | 'irrelevant'
}

export interface RelevanceVerdict extends RelevanceLabels {
  input_id: string
  verdict: Relevance
  /** 모델이 적은 한 줄. 없으면 null — 사람이 표본을 볼 때 판단 근거가 된다. */
  reason: string | null
}

export interface RelevanceOutcome {
  model: string
  verdicts: RelevanceVerdict[]
  /** 호출이 실패했을 때의 사유. verdicts 는 전부 unknown 이다. */
  error?: string
  /** 오늘 다시 불러도 같은 실패(429·503·예산). 배치는 여기서 멈추고 내일로 넘긴다(§7.2). */
  quotaExhausted?: boolean
}

/** llm.ts 의 호출 함수와 같은 모양. 셀프테스트가 가짜를 꽂을 수 있게 주입받는다. */
export type RelevanceCall = (system: string, user: string) => Promise<{ text: string; model: string }>

const SYSTEM = [
  '너는 1인·소규모 팀 창업가를 돕는 리서치 파이프라인의 리뷰 선별을 맡는다.',
  '분석 목적 하나와 수집된 리뷰·댓글 원문 여러 건이 주어진다.',
  '리뷰마다 이 목적의 분석 재료로 쓸 수 있는지 판정해라.',
  '',
  'relevant   = 이 목적이 말하는 사용자·문제·제품 맥락을 다룬다. 불만이든 칭찬이든 상관없다.',
  'irrelevant = 다른 제품·다른 주제의 잡담이거나, 내용이 없어(광고·한 줄 감탄) 재료가 되지 않는다.',
  'unknown    = 판단이 서지 않는다. 맥락이 모자라거나 애매하면 전부 여기로 둔다.',
  '',
  'irrelevant 는 확실할 때만 쓴다. 버려진 리뷰는 다시 읽히지 않는다 — 애매하면 unknown 이다.',
  '없는 id 를 만들지 말고, 주어진 id 전부에 대해 한 줄씩 답해라.',
  '',
  '라벨 4개를 함께 달아라. 원문으로 정할 수 없으면 null 이다 — 추측으로 채우지 마라.',
  'impact = 이 문제가 그 사람에게 얼마나 큰가: "high" | "mid" | "low" | null',
  'freq   = 이 문제를 얼마나 자주 겪는다고 읽히나: "high" | "mid" | "low" | null',
  'signal = "pain"(겪는 문제) | "demand"(원하는 기능·해결책) | "objection"(안 쓰는/안 사는 이유) | null',
  'wtp    = 돈을 내겠다·가격이 얼마면 산다 같은 지불 의사 언급이 있으면 true, 분명히 없으면 false, 애매하면 null',
  '출력은 JSON 배열 하나뿐이다: [{"id":"R1","rel":"relevant","why":"한 줄 근거","impact":"high","freq":"low","signal":"pain","wtp":null}].',
  '설명·코드블록·다른 키를 붙이지 마라.',
].join('\n')

/** 목적 한 줄. reader_problem 코드+라벨이 1순위, 없으면 한 줄 소개, 그것도 없으면 분석 목적. */
export function describePurpose(purpose: RelevancePurpose | null | undefined): string {
  const code = purpose?.reader_problem?.trim()
  if (code) {
    const label = READER_PROBLEM_LABEL[code]
    return label ? `${code} — ${label}` : code
  }
  const pitch = purpose?.product_elevator_pitch?.trim()
  if (pitch) return pitch
  const p = purpose?.purpose?.trim()
  if (p) return p
  // 목적을 모르면 프롬프트가 아무 기준도 못 준다. 그 사실을 감추지 않는다 —
  // 모델은 기준 없이 판정하느니 unknown 을 내야 한다.
  return '(목적 미기재 — 기준이 없으면 전부 unknown 으로 답해라)'
}

const LABEL: Record<RelevanceExample['verdict'], string> = { relevant: '관련', irrelevant: '무관' }

/**
 * 프롬프트를 만든다(순수). 라벨은 리뷰 순서로 정해지므로 같은 입력이면 같은 프롬프트다.
 * uuid 를 그대로 넣지 않는 이유는 토큰이다 — 20건이면 uuid 만 720자다.
 */
export function buildRelevancePrompt(
  purpose: RelevancePurpose | null | undefined,
  reviews: RelevanceReview[],
  examples: RelevanceExample[] = [],
): { system: string; user: string; labels: string[] } {
  const labels = reviews.map((_, i) => `R${i + 1}`)
  const shots = examples.slice(0, MAX_EXAMPLES)
  const user = [
    `## 분석 목적`,
    describePurpose(purpose),
    '',
    // 되먹임(T3) — 사람이 채점한 것이 있으면 그 기준을 그대로 보여준다. 없으면 이 블록 자체가 없다.
    ...(shots.length > 0
      ? [
          `## 사람이 매긴 판정 예시 ${shots.length}건 (이 기준을 따라라)`,
          ...shots.map((e, i) => `${i + 1}. [${LABEL[e.verdict]}] ${oneLine(e.text).slice(0, EXAMPLE_CHARS)}`),
          '',
        ]
      : []),
    `## 리뷰 ${reviews.length}건`,
    ...reviews.map((r, i) => `${labels[i]}. ${oneLine(r.text).slice(0, MAX_REVIEW_CHARS)}`),
    '',
    `위 ${reviews.length}건 전부에 대해 지정된 JSON 배열 하나만 출력해라.`,
  ].join('\n')
  return { system: SYSTEM, user, labels }
}

/** 원문의 줄바꿈은 라벨 경계를 흐린다. 한 줄로 눕힌다. */
function oneLine(text: string): string {
  return String(text ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

/**
 * 모델이 낸 텍스트에서 [{"id","rel","why"}] 배열을 건져낸다.
 * 못 건지면 null(= 전부 unknown)이지 빈 배열이 아니다 — 빈 배열은 "다 무관" 으로 읽힌다.
 */
export function parseRelevanceArray(
  raw: string,
): ({ id: string; rel: Relevance; why: string | null } & RelevanceLabels)[] | null {
  const arr = extractJsonArray(raw)
  if (!arr) return null
  return arr
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    .map(x => {
      const rel = String(x.rel ?? '').trim().toLowerCase()
      const why = typeof x.why === 'string' && x.why.trim() ? x.why.trim() : null
      return {
        id: String(x.id ?? '').trim().toUpperCase(),
        // 어휘 밖 값은 unknown 이다. 'no'·'0'·'irrelevant?' 같은 응답을 무관으로 읽지 않는다.
        rel: ((RELEVANCE_VERDICTS as readonly string[]).includes(rel) ? rel : 'unknown') as Relevance,
        why,
        impact: pick(x.impact, LABEL_LEVELS),
        frequency: pick(x.freq ?? x.frequency, LABEL_LEVELS),
        community_signal: pick(x.signal ?? x.community_signal, COMMUNITY_SIGNALS),
        wtp_mentioned: toBool(x.wtp ?? x.wtp_mentioned),
      }
    })
}

/** 어휘 안이면 그 값, 밖이면 null. 'medium' 을 'mid' 로 짐작하지 않는다. */
function pick<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (allowed as readonly string[]).includes(s) ? (s as T) : null
}

/** true/false(문자열 포함)만 받는다. 'yes'·1 같은 것은 null 이다. */
function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return s === 'true' ? true : s === 'false' ? false : null
}

/** 페인 카드 태그(§F 7번). NULL 라벨은 태그를 만들지 않는다 — 빈 태그 금지. */
export function impactFrequencyTags(row: Partial<RelevanceLabels> | null | undefined): string[] {
  const KO: Record<LabelLevel, string> = { high: '높음', mid: '보통', low: '낮음' }
  const out: string[] = []
  const impact = pick(row?.impact, LABEL_LEVELS)
  const frequency = pick(row?.frequency, LABEL_LEVELS)
  if (impact) out.push(`영향 ${KO[impact]}`)
  if (frequency) out.push(`빈도 ${KO[frequency]}`)
  return out
}

/**
 * 리뷰 한 묶음(최대 BATCH_SIZE)을 판정한다. 실패는 전부 unknown 으로 내려간다 — 던지지 않는다.
 * 한도·예산 소진이면 `quotaExhausted` 로 알려, 호출부가 다음 묶음으로 넘어가지 않고 멈추게 한다.
 */
export async function judgeRelevanceBatch(
  purpose: RelevancePurpose | null | undefined,
  reviews: RelevanceReview[],
  examples: RelevanceExample[] = [],
  call?: RelevanceCall,
): Promise<RelevanceOutcome> {
  const allUnknown = (model: string, error?: string, quotaExhausted = false): RelevanceOutcome => ({
    model,
    verdicts: reviews.map(r => ({ input_id: r.input_id, verdict: 'unknown' as Relevance, reason: null, ...NO_LABELS })),
    ...(error ? { error } : {}),
    ...(quotaExhausted ? { quotaExhausted } : {}),
  })

  if (reviews.length === 0) return { model: MOCK_MODEL, verdicts: [] }

  const provider = resolveProvider()
  // mock 은 판정을 흉내내지 않는다. "판정 안 했다" 를 그대로 돌려준다.
  if (provider === 'mock') return allUnknown(MOCK_MODEL)

  const { system, user, labels } = buildRelevancePrompt(purpose, reviews, examples)
  const run = call ?? ((s: string, u: string) => callLlmWithModel(provider, s, u, 'relevance-judge'))

  let text: string
  let model: string
  try {
    const res = await run(system, user)
    text = res.text
    model = res.model
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[relevance-judge] 판정 호출 실패 (리뷰 ${reviews.length}건):`, message)
    return allUnknown(`${provider}:failed`, message, isQuotaFailure(e))
  }

  const parsed = parseRelevanceArray(text)
  if (!parsed) {
    console.warn(`[relevance-judge] JSON 파싱 실패 — 원문 앞 200자: ${JSON.stringify(text.slice(0, 200))}`)
    return allUnknown(model, 'JSON 파싱 실패')
  }

  const byLabel = new Map(parsed.map(p => [p.id, p]))
  // 응답에 없는 라벨은 unknown 으로 남는다(빠진 것은 무관이 아니다). 응답에만 있는 라벨은 버린다.
  return {
    model,
    verdicts: reviews.map((r, i) => {
      const hit = byLabel.get(labels[i])
      return {
        input_id: r.input_id,
        verdict: hit ? hit.rel : ('unknown' as Relevance),
        reason: hit ? hit.why : null,
        impact: hit ? hit.impact : null,
        frequency: hit ? hit.frequency : null,
        community_signal: hit ? hit.community_signal : null,
        wtp_mentioned: hit ? hit.wtp_mentioned : null,
      }
    }),
  }
}

/** 리뷰를 호출 단위로 쪼갠다(기본 BATCH_SIZE). */
export function chunkReviews<T>(items: readonly T[], size = BATCH_SIZE): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

// ── extract 입력 선별에서 소비하는 자리 ─────────────────────────

/** review_relevance_verdicts 한 행(필요한 컬럼만). */
export interface RelevanceRow {
  input_id: string
  verdict?: string | null
  /** 사람 채점. 있으면 LLM 판정을 이긴다(remedy_verdicts 와 같은 규칙). */
  human_verdict?: string | null
}

export interface DropResult<T> {
  kept: T[]
  /** 무관 판정으로 뺀 건수. 0 과 구분해 로그에 남긴다(§7.1). */
  droppedIrrelevant: number
}

/**
 * 무관(irrelevant) 판정을 받은 입력만 뺀다.
 *
 *   irrelevant → 제외
 *   relevant · unknown · 판정 행 없음 → 그대로 둔다 (확인 불가를 버리지 않는다)
 *   rows === null (조회 실패·테이블 없음·첫날) → **아무것도 빼지 않는다**
 *
 * 판정 캐시를 못 읽었을 때 전부 빼거나 전부 남기는 것 중 하나를 골라야 한다면 남기는 쪽이다.
 * 잘못 남기면 프롬프트가 조금 탁해질 뿐이지만, 잘못 빼면 그 원문은 영영 안 읽힌다.
 */
export function dropIrrelevant<T extends { id?: string | null }>(
  inputs: readonly T[],
  rows: readonly RelevanceRow[] | null | undefined,
): DropResult<T> {
  if (!rows || rows.length === 0) return { kept: [...inputs], droppedIrrelevant: 0 }

  const irrelevant = new Set<string>()
  for (const r of rows) {
    const human = r.human_verdict?.trim()
    const verdict = human || r.verdict?.trim()
    if (verdict === 'irrelevant' && r.input_id) irrelevant.add(r.input_id)
  }

  const kept = inputs.filter(i => !(i.id && irrelevant.has(i.id)))
  return { kept, droppedIrrelevant: inputs.length - kept.length }
}

// ── T3 사람 채점 표본 ───────────────────────────────────────────

export interface GradingCandidate {
  input_id: string
  verdict: Relevance
  text: string
  project?: string | null
  reason?: string | null
}

/** 재현 가능한 난수(mulberry32) — remedy-grading-sample.mjs 와 같은 것. seed 가 같으면 같은 표다. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * 채점 표본을 뽑는다 — 관련 절반·무관 절반을 섞는다(정밀도와 재현율을 같이 재려면 둘 다 필요하다).
 * 한쪽이 모자라면 남는 자리는 다른 쪽에서 채운다. unknown 은 표본에 넣지 않는다 —
 * 채점해도 "모델이 판단 못 한 것을 사람이 대신 판단" 일 뿐 모델 정밀도를 재지 못한다.
 */
export function pickGradingSample(
  rows: readonly GradingCandidate[],
  opts: { n?: number; seed?: number } = {},
): GradingCandidate[] {
  const n = Math.max(0, Math.floor(opts.n ?? 10))
  const random = rng(opts.seed ?? 42)
  const rel = shuffle(rows.filter(r => r.verdict === 'relevant'), random)
  const irr = shuffle(rows.filter(r => r.verdict === 'irrelevant'), random)

  const half = Math.floor(n / 2)
  const takeRel = Math.min(half, rel.length)
  const takeIrr = Math.min(n - takeRel, irr.length)
  const picked = [...rel.slice(0, takeRel), ...irr.slice(0, takeIrr)]
  // 한쪽이 모자랐으면 남는 자리를 반대쪽에서 마저 채운다.
  if (picked.length < n) {
    const rest = [...rel.slice(takeRel), ...irr.slice(takeIrr)]
    picked.push(...rest.slice(0, n - picked.length))
  }
  // 채점자가 순서로 정답을 짐작하지 못하게 섞는다.
  return shuffle(picked, random)
}

export interface GradingMark {
  input_id: string
  verdict: 'relevant' | 'irrelevant'
}

export interface GradingParse {
  marks: GradingMark[]
  /** 둘 다 비어 있는 줄 = 판단 불가. 건너뛴다(무관이 아니다). */
  blank: number
  /** 둘 다 체크된 줄. 사람 실수다 — 적용하지 않고 보고한다. */
  conflict: string[]
}

const CHECKED = /^[xX✓✔oO]$/
/** 체크칸으로 볼 수 있는 내용 — 빈칸·빈 상자·체크 표시. */
const BOX = /^(☐|□|\[\s*\]|[xX✓✔oO])?$/

/**
 * 채점표 마크다운을 읽는다. `관련`·`무관` 두 칸은 **나란히 붙은 체크칸 쌍**으로 찾는다 —
 * 열을 하나 더 붙였다고 채점이 통째로 밀리면 안 된다(모델 판정 열이 실제로 그렇게 생겼다).
 * 키 칸의 `input_id` 만 신뢰한다 — 본문 열은 사람이 고쳐도 되는 자리다.
 */
export function parseGradingMarkdown(md: string): GradingParse {
  const marks: GradingMark[] = []
  const conflict: string[] = []
  let blank = 0

  for (const line of String(md ?? '').split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 4) continue
    const key = cells[cells.length - 1].replace(/`/g, '').trim()
    // uuid 가 아니면 머리글·구분선이다.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) continue

    const pair = cells.findIndex((c, i) => i + 1 < cells.length && BOX.test(c) && BOX.test(cells[i + 1]))
    if (pair === -1) continue
    const rel = CHECKED.test(cells[pair])
    const irr = CHECKED.test(cells[pair + 1])
    if (rel && irr) {
      conflict.push(key)
      continue
    }
    if (!rel && !irr) {
      blank++
      continue
    }
    marks.push({ input_id: key, verdict: rel ? 'relevant' : 'irrelevant' })
  }

  return { marks, blank, conflict }
}
