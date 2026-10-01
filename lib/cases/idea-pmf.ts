// `/cases/report` PMF 판정(구 매칭 리포트) 사분면 자가진단 — 순수 부품. DB·LLM 호출 없음(잡 본체는 P3 의 ./idea-pmf-run.ts).
// 정본: reports/2026-10-01/design-direction-pmf-judgment.md A1~A7 · P2(남헌 2026-10-01 v9).
//
// ★ 사분면 산식은 새로 만들지 않는다 — lib/cases/match.ts 의 precedentAxis·demandAxis·quadrantOf 를 그대로 부른다.
// ★ 수요축은 창업자 답변을 AI 가 읽은 **자가진단** 값이다. 이 파일이 만드는 답변 행·점수 행은 전부
//   is_self_reported: true 를 싣는다(case_evidence.is_self_reported 와 같은 이름·뜻, 새 표 CHECK 가 false 를 막는다).
// ★ 구조화 4필드(핵심 기능·주 소비자층·예상 가격·대안)는 **병목 추출 프롬프트 재료로만** 쓴다.
//   matchMoves 인자(병목 하나)·패싯 정렬에는 들어가지 않는다(selfFacets = {}).
// ★ 클라이언트 패널도 이 파일을 import 한다 — node:* 금지(해시는 Web Crypto, idea-angles.ts 규칙).
import { FACET_FIELDS } from '../analysis/facets.ts'
import { normalizeWhitespace } from '../analysis/judge-prompt.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import type { FailedAngleCard } from './advisor.ts'
import { BOTTLENECK } from './draft.ts'
import { IDEA_ANCHOR_MOVES, IDEA_SNIPPET_MAX, limitReason, type IdeaEvidenceRow } from './idea-angles.ts'
import { demandAxis, gradeRankOf, precedentAxis, quadrantOf, type MatchedMove, type MatchResult, type Quadrant } from './match.ts'

export const PMF_INPUT_MAX = { core_feature: 120, customer: 80, price: 40, alternative: 120 } as const
export const PMF_REQUIRED = ['core_feature', 'customer'] as const
export const PMF_ANSWER_MAX = 500
export const PMF_QUESTIONS = { min: 2, max: 4 } as const
/** LLM 출력 길이 상한(A3). 질문은 넘으면 버리고, 요소 이름·이유는 말줄임으로 줄인다. */
export const PMF_QUESTION_MAX = 120
export const PMF_FACTOR_MAX = 30
export const PMF_REASON_MAX = 200
export const PMF_ACTIVE = ['queued', 'running', 'scoring'] as const
/** 하루 상한에 세는 상태 — 실행(run) 단위. limited 는 LLM 을 안 불렀으니 안 센다. awaiting_answers 는 세지만 동시엔 안 든다. */
export const PMF_COUNTED = ['queued', 'running', 'no_match', 'awaiting_answers', 'scoring', 'done', 'failed'] as const

export const PMF_DEMAND_LABEL = '수요축 (자가진단)'
export const PMF_CAPTION = '권고이지 보장이 아니다. 수요축은 내 답을 AI 가 읽은 자가진단 값이라 리뷰 데이터로 잰 수요와 다르다.'

export type PmfRunStatus = 'queued' | 'running' | 'no_match' | 'awaiting_answers' | 'scoring' | 'done' | 'failed' | 'limited'
export type Bottleneck = (typeof BOTTLENECK)[number]
type InputKey = keyof typeof PMF_INPUT_MAX
export type PmfInput = Record<InputKey, string | null> & { bottleneck_override: Bottleneck | null }
export type PmfSalient = { factor: string; why: string; anchor_move_id: string | null }
export type PmfQuestion = { id: string; factor: string; question: string; anchor_move_id: string | null }
export type PmfAnswer = { id: string; text: string | null }
/** idea_pmf_answers 한 행(잡 1 이 질문으로 insert, 잡 2 가 점수로 update). */
export type PmfAnswerRow = {
  question_id: string
  factor: string
  question: string
  anchor_move_id: string | null
  answer_text: string | null
  importance: number | null
  satisfaction: number | null
  opportunity_score: number | null
  evidence_quote: string | null
  notes: string | null
  is_self_reported: true
}

const INPUT_KEYS = Object.keys(PMF_INPUT_MAX) as InputKey[]
/** DB length() 와 같은 글자 수(코드 포인트). */
const chars = (s: string) => [...s].length
const clip = (s: string, max: number) => (chars(s) > max ? [...s].slice(0, max - 1).join('') + '…' : s)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const asObj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** POST 본문의 input. 길이 초과·필수 누락·어휘 밖 override 는 **실패**로 돌린다(자르거나 조용히 null 로 두지 않는다). */
export function parsePmfInput(raw: unknown):
  | { ok: true; input: PmfInput }
  | { ok: false; field: string; error: string } {
  const o = asObj(raw)
  if (!o) return { ok: false, field: 'input', error: '입력이 비었다' }
  const input = { bottleneck_override: null } as PmfInput
  for (const k of INPUT_KEYS) {
    const v = o[k]
    if (v != null && typeof v !== 'string') return { ok: false, field: k, error: `${k} 는 글자여야 한다` }
    const s = str(v)
    if (chars(s) > PMF_INPUT_MAX[k]) return { ok: false, field: k, error: `${k} ${chars(s)}자 — 상한 ${PMF_INPUT_MAX[k]}자` }
    if (!s && (PMF_REQUIRED as readonly string[]).includes(k)) return { ok: false, field: k, error: `${k} 가 비었다 — 병목을 읽을 재료가 없다` }
    input[k] = s || null
  }
  const ov = o.bottleneck_override
  if (ov != null && ov !== '') {
    if (typeof ov !== 'string' || !(BOTTLENECK as readonly string[]).includes(ov)) {
      return { ok: false, field: 'bottleneck_override', error: 'bottleneck_override 가 병목 어휘 밖이다' }
    }
    input.bottleneck_override = ov as Bottleneck
  }
  return { ok: true, input }
}

/** sha256(정규화 input) 16진. 키 고정 순서·trim·소문자·공백 축약 — 캐시 키의 절반(나머지는 queryHash). */
export async function inputHash(input: PmfInput): Promise<string> {
  const norm = (v: string | null) => (v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const keys = [...INPUT_KEYS, 'bottleneck_override' as const].sort()
  const body = JSON.stringify(keys.map((k) => [k, norm(input[k])]))
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 캐시 조회 키. requested_by 가 빠지면 남의 답변 행을 돌려준다 — P3 는 이 세 값을 전부 .eq 로 건다. */
export function pmfCacheKey(email: string, query_hash: string, input_hash: string) {
  return { requested_by: email, query_hash, input_hash }
}

/**
 * 상한(A7). 하루 10건·사용자 동시 1 은 idea_pmf_runs 로 따로 세고(앵글 10 과 별개, 합 20 — 남헌 2026-10-01 v10 확정.
 * 앵글은 idea_angle_runs 만 센다. idea_query_log 는 세지 않는다 — 캐시 히트·limited 행까지 있어 상한 근거로 쓰면 안 된다),
 * 전역 동시 2 는 **PMF 활성 + 앵글 활성의 합**이다(구독 5시간 창을 지키는 숫자).
 */
export function pmfLimitReason(n: { userToday: number; userActive: number; pmfActive: number; angleActive: number }): string | null {
  return limitReason({ userToday: n.userToday, userActive: n.userActive, globalActive: n.pmfActive + n.angleActive }, 'PMF 판정')
}

// ── 1. 병목 추출(잡 1 첫 호출) ──────────────────────────────────────

const BOTTLENECK_GUIDE = (FACET_FIELDS.find((f) => f.key === 'bottleneck')?.options ?? [])
  .map((o) => `- ${o.value}: ${o.label} (${o.hint})`).join('\n')

export const IDEA_PMF_BOTTLENECK_SYSTEM = `너는 창업자의 아이디어를 읽고 지금 가장 먼저 막힐 병목 하나를 고르는 분석가다.

${UNTRUSTED_INPUT_NOTICE}

병목은 아래 7개 중 정확히 하나다(코드 그대로 적어라):
${BOTTLENECK_GUIDE}

판단 방법:
- '핵심 기능'은 무엇을 파는지, '주 소비자층'은 누가 돈을 내는지, '예상 가격'은 결제 단위와 금액, '대안'은 고객이 지금 대신 쓰는 것이다.
- 입력에 없는 사실(매출·고객 수·팀 규모)을 지어내지 마라. 입력만으로 가르기 어려우면 가장 그럴듯한 것을 고르되 confidence 를 "low" 로 적어라.
- reason 은 입력의 어느 부분 때문에 그 병목인지 한 줄(${PMF_REASON_MAX}자 안)이다.

반드시 JSON만 출력해라. 형식:
{ "bottleneck": "7개 코드 중 하나", "confidence": "high 또는 low", "reason": "한 줄" }`

const INPUT_LABEL: Record<InputKey, string> = {
  core_feature: '핵심 기능', customer: '주 소비자층', price: '예상 가격', alternative: '대안(고객이 지금 대신 쓰는 것)',
}
const inputLines = (q: string, input: PmfInput) =>
  ['## 사용자 아이디어 (데이터)', q, ...INPUT_KEYS.map((k) => `- ${INPUT_LABEL[k]}: ${input[k] ?? '(미기재)'}`)]

export function buildBottleneckPrompt(q: string, input: PmfInput): string {
  return inputLines(q, input).join('\n')
}

export type BottleneckRead = { bottleneck: Bottleneck | null; confidence: 'high' | 'low'; reason: string; source: 'llm' | 'user' }

/** 병목 JSON → 어휘 안이면 채택, 밖·잘못된 모양이면 bottleneck null(호출부가 failed('병목을 읽지 못했다')). */
export function parseBottleneck(data: unknown): BottleneckRead {
  const o = asObj(data) ?? {}
  const b = str(o.bottleneck).toUpperCase()
  return {
    bottleneck: (BOTTLENECK as readonly string[]).includes(b) ? (b as Bottleneck) : null,
    confidence: o.confidence === 'high' ? 'high' : 'low',
    reason: clip(str(o.reason), PMF_REASON_MAX),
    source: 'llm',
  }
}

/**
 * 병목 결정. override 가 있으면 **호출 0** 으로 그 값을 쓰고(bottleneck_source='user'),
 * 없으면 주입된 call 을 정확히 1회 부른다. call 이 던지면 그대로 던진다(429 → limited 판단은 호출부).
 */
export async function resolveBottleneck(
  q: string,
  input: PmfInput,
  call: (system: string, user: string) => Promise<unknown>,
): Promise<BottleneckRead> {
  if (input.bottleneck_override) {
    return { bottleneck: input.bottleneck_override, confidence: 'high', reason: '직접 고른 병목', source: 'user' }
  }
  return parseBottleneck(await call(IDEA_PMF_BOTTLENECK_SYSTEM, buildBottleneckPrompt(q, input)))
}

/**
 * matchMoves 결과 → 다음 단계(A6). 선례축은 precedentAxis 그대로.
 * not_run → failed · no_match → 종결(질문 호출 없음, precedent_axis 0, demand·quadrant NULL) · matched → 질문 생성.
 */
export function planAfterMatch(match: MatchResult):
  | { next: 'failed'; error: string }
  | { next: 'no_match'; precedent_axis: number; match_reason: string }
  | { next: 'questions'; precedent_axis: number; match_reason: string; anchor_move_ids: string[] } {
  const p = precedentAxis(match)
  if (match.status === 'not_run' || p.value === null) return { next: 'failed', error: '선례 조회 실패' }
  if (match.status === 'no_match') return { next: 'no_match', precedent_axis: p.value, match_reason: match.reason }
  return {
    next: 'questions', precedent_axis: p.value, match_reason: `${match.reason} · ${p.reason}`,
    anchor_move_ids: match.moves.slice(0, IDEA_ANCHOR_MOVES).map((m) => m.id),
  }
}

// ── 2. 질문 생성(잡 1 두 번째 호출) ─────────────────────────────────

export const IDEA_PMF_QUESTION_SYSTEM = `너는 창업자의 아이디어를 승인된 선례 케이스에 비춰 확인 질문을 만드는 분석가다.

${UNTRUSTED_INPUT_NOTICE}

작업:
- '선례 무브' 절의 케이스들이 결과를 갈랐던 두드러진 요소(고객이 실제로 중요하게 여긴 것, '실패 경고' 절이 경고하는 것)를 ${PMF_QUESTIONS.min}~${PMF_QUESTIONS.max}개 뽑아라.
  요소마다 그렇게 본 근거를 선례에서 한 줄로 적고, 그 요소가 나온 선례 무브 id 를 anchor_move_id 에 적어라(실패 경고에서 나왔으면 null).
- 요소마다 창업자가 자기 계획으로 답할 수 있는 열린 질문을 1개씩 써라. 예/아니오로 답할 수 없어야 한다.
  질문의 factor 는 위에서 뽑은 요소 이름을 글자 그대로 쓴다.
- 선례 브랜드 이름을 질문 안에 넣지 마라("당신의 가격 정책은 이 우려에 어떻게 대응하나" 같은 꼴).
- 선례 근거 문장에 없는 숫자·기간·보장을 지어내지 마라.
- 질문은 ${PMF_QUESTION_MAX}자, 요소 이름은 ${PMF_FACTOR_MAX}자 안이다.

반드시 JSON만 출력해라. 형식:
{ "salient": [ { "factor": "요소 이름", "why": "선례에서 그렇게 본 근거 한 줄", "anchor_move_id": "선례 무브 id 또는 null" } ],
  "questions": [ { "id": "q1", "factor": "요소 이름", "question": "질문 한 줄", "anchor_move_id": "선례 무브 id 또는 null" } ] }`

/** 질문 사용자 프롬프트. 선례(공개 코퍼스)가 먼저, 아이디어(데이터)가 끝에 온다. */
export function buildQuestionPrompt(
  q: string,
  input: PmfInput,
  moves: MatchedMove[],
  evidence: IdeaEvidenceRow[],
  failed: Pick<FailedAngleCard, 'claimed_angle' | 'outcome'>[],
): string {
  const lines = ['## 선례 무브 (같은 병목의 승인된 사례)']
  for (const m of moves.slice(0, IDEA_ANCHOR_MOVES)) {
    const rank = gradeRankOf(m)
    lines.push(`- id: ${m.id}`, `  브랜드: ${m.study.brand_name} / 레버: ${m.lever} / 등급: ${rank == null ? '?' : ['D', 'C', 'B', 'A'][rank]}`,
      `  주장: ${m.claim}`, `  다음 행동: ${m.transfer_note ?? '(미기재)'}`, `  전제 조건: ${m.preconditions ?? '(미기재)'}`)
    if (m.metric_name) lines.push(`  지표: ${m.metric_name} ${m.metric_before ?? '?'} → ${m.metric_after ?? '?'} ${m.metric_unit ?? ''}`.trimEnd())
    const ev = evidence.filter((e) => e.case_study_id === m.case_study_id && e.snippet?.trim())
      .sort((a, b) => Number(Boolean(b.supports_claim)) - Number(Boolean(a.supports_claim))).slice(0, 2)
    for (const e of ev) lines.push(`  근거 문장: ${e.snippet!.trim().slice(0, IDEA_SNIPPET_MAX)}`)
  }
  if (failed.length) {
    lines.push('', '## 실패 경고 (겹친 실패 원장)')
    for (const f of failed.slice(0, 3)) lines.push(`- ${f.claimed_angle}: ${f.outcome}`)
  }
  lines.push('', ...inputLines(q, input))
  return lines.join('\n')
}

/**
 * 질문 JSON → 질문 2~4개. 빈 질문·${PMF_QUESTION_MAX}자 초과는 버린다. anchor 가 매칭 무브 밖이면 null.
 * **선례에 묶이지 않은 질문은 버린다** — anchor 가 매칭 무브 안이거나 factor 가 salient 요소 이름과 같아야 한다.
 * id 는 LLM 값을 믿지 않고 q1..q4 로 다시 매긴다. 2개 미만이면 ok:false(호출부 failed('질문을 만들지 못했다')).
 */
export function parsePmfQuestions(data: unknown, allowedMoveIds: readonly string[]):
  | { ok: true; salient: PmfSalient[]; questions: PmfQuestion[] }
  | { ok: false; error: string } {
  const o = asObj(data) ?? {}
  const anchor = (v: unknown) => (typeof v === 'string' && allowedMoveIds.includes(v) ? v : null)
  const salient = (Array.isArray(o.salient) ? o.salient : []).flatMap((x): PmfSalient[] => {
    const s = asObj(x)
    const factor = clip(str(s?.factor), PMF_FACTOR_MAX)
    return s && factor ? [{ factor, why: clip(str(s.why), PMF_REASON_MAX), anchor_move_id: anchor(s.anchor_move_id) }] : []
  }).slice(0, PMF_QUESTIONS.max)
  const salientNames = new Set(salient.map((s) => s.factor))
  const questions = (Array.isArray(o.questions) ? o.questions : []).flatMap((x): Omit<PmfQuestion, 'id'>[] => {
    const s = asObj(x)
    const question = str(s?.question)
    if (!s || !question || chars(question) > PMF_QUESTION_MAX) return []
    const factor = clip(str(s.factor) || question, PMF_FACTOR_MAX)
    const anchor_move_id = anchor(s.anchor_move_id)
    if (!anchor_move_id && !salientNames.has(factor)) return []
    return [{ factor, question, anchor_move_id }]
  }).slice(0, PMF_QUESTIONS.max).map((x, i) => ({ id: `q${i + 1}`, ...x }))
  if (questions.length < PMF_QUESTIONS.min) return { ok: false, error: '질문을 만들지 못했다' }
  return { ok: true, salient, questions }
}

/** 질문 → idea_pmf_answers insert 행(답 NULL). is_self_reported 는 DB DEFAULT 에 기대지 않고 명시한다. */
export function pmfAnswerRows(runId: string, questions: PmfQuestion[]) {
  return questions.map((q) => ({
    run_id: runId, question_id: q.id, factor: q.factor, question: q.question,
    anchor_move_id: q.anchor_move_id, answer_text: null, is_self_reported: true as const,
  }))
}

// ── 3. 답변 → 점수(잡 2) ────────────────────────────────────────────

/** PUT 본문의 answers. 질문 밖 id·${PMF_ANSWER_MAX}자 초과는 실패, 빈 글자는 건너뜀(null), non-null 최소 1개. */
export function parsePmfAnswers(raw: unknown, questions: PmfQuestion[]):
  | { ok: true; answers: PmfAnswer[] }
  | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'answers 가 배열이 아니다' }
  const byId = new Map<string, string | null>()
  for (const x of raw) {
    const a = asObj(x)
    const id = typeof a?.id === 'string' ? a.id : ''
    if (!questions.some((q) => q.id === id)) return { ok: false, error: `없는 질문 id: ${id || '(빈 값)'}` }
    if (a!.text != null && typeof a!.text !== 'string') return { ok: false, error: `${id} 답은 글자여야 한다` }
    const text = str(a!.text)
    if (chars(text) > PMF_ANSWER_MAX) return { ok: false, error: `${id} 답 ${chars(text)}자 — 상한 ${PMF_ANSWER_MAX}자` }
    byId.set(id, text || null)
  }
  const answers = questions.map((q) => ({ id: q.id, text: byId.get(q.id) ?? null }))
  if (!answers.some((a) => a.text)) return { ok: false, error: '답이 하나도 없다 — 최소 1개는 답해야 한다' }
  return { ok: true, answers }
}

export const IDEA_PMF_SCORE_SYSTEM = `너는 창업자의 자가진단 답변을 읽고 요소별 점수를 매기는 분석가다.
입력은 리뷰가 아니라 창업자 본인의 계획 서술이다. 자기 이야기라 낙관 편향이 있다는 것을 감안해라.

${UNTRUSTED_INPUT_NOTICE}

질문(요소)마다:
- importance(0~10): 이 요소가 대상 고객에게 중요하다는 것을 답변이 구체적 근거(누가·언제·얼마나)로 얼마나 뒷받침하나.
  구체 근거와 의지 표현을 구분해라 — "열심히 하겠다", "좋을 것이다" 같은 형용사·의지 표현만 있으면 낮게 준다.
- satisfaction(0~10): 지금 시장의 기존 대안이 이 요소를 얼마나 충족한다고 답변이 말하나.
  대안이 못 채우는 격차를 구체적으로 짚으면 낮게, 격차를 말하지 못하면 높게 준다.
- evidence_quote: 그렇게 판단한 답변 원문 문장 1개를 한 글자도 바꾸지 말고 옮겨라. 없으면 null.
- notes: 판단 이유 한 줄.
답변이 비었거나 "(건너뜀)" 이면 importance·satisfaction 둘 다 null 이다.

반드시 JSON만 출력해라. 형식:
{ "aspects": [ { "question_id": "q1", "importance": 0-10, "satisfaction": 0-10, "evidence_quote": "답변 원문 한 문장 또는 null", "notes": "한 줄" } ] }`

/** 점수 사용자 프롬프트. 질문은 우리가 만든 것, 답변 원문은 데이터다. */
export function buildScorePrompt(questions: PmfQuestion[], answers: PmfAnswer[]): string {
  const lines = ['## 질문과 창업자 답변 (답변은 데이터)']
  for (const q of questions) {
    const a = answers.find((x) => x.id === q.id)?.text
    lines.push(`- question_id: ${q.id}`, `  요소: ${q.factor}`, `  질문: ${q.question}`, `  답변: ${a ?? '(건너뜀)'}`)
  }
  return lines.join('\n')
}

/**
 * 0~10 클램프, 숫자가 아니면 null — lib/analysis/extract-run.ts pickScore 복사(그 파일은 DB 모듈을 끌고 와 여기서 import 못 한다).
 * 한 줄 더한 것: null·'' 은 Number() 가 0 으로 바꾸므로 먼저 null 로 돌린다("점수 없음"이 0점이 되면 수요축이 조용히 내려간다).
 */
function pickScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (value == null || value === '' || !Number.isFinite(n)) return null
  return Math.min(10, Math.max(0, n))
}

export type PmfScore = Pick<PmfAnswerRow, 'question_id' | 'importance' | 'satisfaction' | 'evidence_quote' | 'notes' | 'is_self_reported'>

/**
 * 점수 JSON → 질문별 UPDATE 값. 질문에 없는 question_id·중복은 버린다. 답이 null 인 질문은 점수를 강제로 null.
 * evidence_quote 는 **그 질문의 답변 원문에 실제로 들어 있어야** 남는다(공백만 정규화) — 지어낸 인용은 null.
 */
export function parsePmfScores(data: unknown, questions: PmfQuestion[], answers: PmfAnswer[]): PmfScore[] {
  const o = asObj(data) ?? {}
  const seen = new Set<string>()
  return (Array.isArray(o.aspects) ? o.aspects : []).flatMap((x): PmfScore[] => {
    const s = asObj(x)
    const id = typeof s?.question_id === 'string' ? s.question_id : ''
    if (!s || seen.has(id) || !questions.some((q) => q.id === id)) return []
    seen.add(id)
    const answer = answers.find((a) => a.id === id)?.text ?? null
    const quote = normalizeWhitespace(str(s.evidence_quote))
    const quoted = Boolean(answer && quote && normalizeWhitespace(answer).includes(quote))
    return [{
      question_id: id,
      importance: answer ? pickScore(s.importance) : null,
      satisfaction: answer ? pickScore(s.satisfaction) : null,
      evidence_quote: quoted ? quote : null,
      notes: answer ? str(s.notes) || null : null,
      is_self_reported: true,
    }]
  })
}

/**
 * 잡 2 마지막(A4·A5): DB 가 GENERATED 로 낸 opportunity_score 를 **다시 읽어** 넣는다(여기서 재계산하지 않는다).
 * 수요축 = demandAxis, 사분면 = quadrantOf 그대로. 유효 점수 0건이면 ok:false.
 */
export function pmfQuadrant(opportunityScores: (number | null)[], precedent: number):
  | { ok: true; demand_axis: number; quadrant: Quadrant; reason: string; demand_reason: string }
  | { ok: false; error: string } {
  const demand = demandAxis(opportunityScores, 10)
  if (demand.value === null) return { ok: false, error: `점수를 못 냈다 — ${demand.reason}` }
  const q = quadrantOf(demand.value, precedent)
  if (q.quadrant === null) return { ok: false, error: q.reason }
  return { ok: true, demand_axis: demand.value, quadrant: q.quadrant, reason: q.reason, demand_reason: demand.reason }
}
