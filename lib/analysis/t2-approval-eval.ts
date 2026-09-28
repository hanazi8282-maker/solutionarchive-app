// rr-v2 자동 승인 평가 하네스의 순수 부품 — gold·채점·재확인 추출·옛 프롬프트 대비 일치. 네트워크·DB 없음.
// 집행은 scripts/t2-approval-eval.mjs, 셀프테스트는 scripts/t2-approval-eval-selftest.mjs.
//
// 질문: 1차·2차가 둘 다 relevant ∧ 둘 다 정보 있음(= rr-v2 가 승인할 행, "A")을 사람 기준으로 채점하면 몇 건이 틀리나.
// gold 는 사람 정보 열이 있으면 감사 킬스위치와 **같은 함수**(scoreApproval)로 정한다. 정보 열이 비었으면(마이그 000031 이전 채점 전부)
// 사람 '관련' 을 true 로 **추정**한다(estimated) — 킬스위치처럼 비었다고 버리면 n_A 가 0 이 된다(09-28 실측: A 0 · 재확인 57).
// 킬스위치(운영 감사)는 엄격한 잣대 그대로 둔다. 추정 정답으로 채점된 승인 수는 gold_estimated 로 따로 내 "잠정"을 표시한다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { scoreApproval } from './auto-approval.ts'
import { INFORMATIVE_EXAMPLE_INPUT_IDS, RR39_NARROW_IRRELEVANT_INPUT_IDS } from './relevance-criteria.ts'

/** 가동 문턱(문서화만 — 이 값으로 플래그를 켜지 않는다. 켜는 것은 사람·역할 세션, docs/t2-relevance-criteria.md). */
export const EVAL_GATE = { minNA: 40, maxErrors: 2, minRecall: 0.5 } as const

export interface Judgement {
  verdict: string
  product_informative: boolean | null
}

export interface EvalInput {
  input_id: string
  human_verdict: string | null
  human_product_informative: boolean | null
  human_graded_at: string | null
  /** null = 판정 없음(호출 실패 등). 예측을 못 했으니 A 도 not-A 도 아니다. */
  first: Judgement | null
  second: Judgement | null
}

export type RecheckReason = 'a' | 'b' | 'c'
/**
 * 정답이 추정·미정이면서 예측과 부딪치는 행만 다시 묻는다(사람 정보 열 미기재 전제).
 * a = 사람 무관·모름인데 예측 승인 · c = 사람 관련인데 예측 미승인 · b = 09-28 좁은 기준으로 '무관' 매긴 8건(항상) — 관련 열까지 다시 받는다.
 */
export interface RecheckItem { input_id: string; reason: RecheckReason }

const NARROW = new Set(RR39_NARROW_IRRELEVANT_INPUT_IDS)
const EXAMPLES = new Set(INFORMATIVE_EXAMPLE_INPUT_IDS)

export interface Gold { value: boolean; estimated: boolean }

/**
 * 사람 기준 정답. value true = 승인해도 된다 · false = 승인하면 오류 · null = 모른다.
 * 정보 열 있음 → scoreApproval(관련 ∧ 정보). 없음 → 관련은 true 추정 · 무관은 false(정보와 무관하게 오류) · 모름·미채점은 null.
 * 좁은 기준 8건은 정보 열이 채워지기(= 재확인 표를 거치기) 전에는 human_verdict 를 믿지 않는다.
 */
export function goldOf(r: Pick<EvalInput, 'input_id' | 'human_verdict' | 'human_product_informative' | 'human_graded_at'>): Gold | null {
  if (typeof r.human_product_informative === 'boolean') {
    const s = scoreApproval({ human_verdict: r.human_verdict, human_product_informative: r.human_product_informative, human_graded_at: r.human_graded_at })
    return s === null ? null : { value: s === 'correct', estimated: false }
  }
  if (NARROW.has(r.input_id) || !r.human_graded_at) return null
  if (r.human_verdict === 'relevant') return { value: true, estimated: true }
  if (r.human_verdict === 'irrelevant') return { value: false, estimated: false }
  return null
}

/** rr-v2 가 승인할 행인가. 판정이 하나라도 없으면 null(예측 불가). */
export function predictA(first: Judgement | null, second: Judgement | null): boolean | null {
  if (!first || !second) return null
  return first.verdict === 'relevant' && second.verdict === 'relevant' && first.product_informative === true && second.product_informative === true
}

export interface EvalResult {
  n: number
  /** 판정이 빠져 채점 못 한 행(호출 실패). 0 이 아니면 평가가 불완전하다. */
  unjudged: number
  excluded_examples: number
  gold_known: number
  gold_positive: number
  n_A: number
  /** n_A 중 정답이 추정(사람 관련 ∧ 정보 열 미기재)인 건수. 0 이 아니면 정밀도는 잠정이다. */
  gold_estimated: number
  errors: number
  precision: number | null
  recall: number | null
  meets_gate: boolean
  recheck: RecheckItem[]
}

export function scoreEval(rows: readonly EvalInput[]): EvalResult {
  let unjudged = 0, excluded = 0, known = 0, pos = 0, nA = 0, errors = 0, hit = 0, est = 0
  const recheck: RecheckItem[] = []
  const seen = new Set<string>()
  const push = (input_id: string, reason: RecheckReason) => { if (!seen.has(input_id)) { seen.add(input_id); recheck.push({ input_id, reason }) } }

  for (const r of rows) {
    if (NARROW.has(r.input_id)) push(r.input_id, 'b')
    if (EXAMPLES.has(r.input_id)) { excluded++; continue }
    const a = predictA(r.first, r.second)
    const gold = goldOf(r)
    if (r.human_graded_at && typeof r.human_product_informative !== 'boolean') {
      if (a === true && (r.human_verdict === 'irrelevant' || r.human_verdict === 'unknown')) push(r.input_id, 'a')
      if (a === false && r.human_verdict === 'relevant') push(r.input_id, 'c')
    }
    if (a === null) { unjudged++; continue }
    if (gold === null) continue
    known++
    if (gold.value) pos++
    if (a) { nA++; if (gold.estimated) est++; if (!gold.value) errors++; else hit++ }
  }
  // 좁은 기준 8건은 이번 표본에 없어도 항상 재확인 목록에 든다.
  for (const id of NARROW) push(id, 'b')

  const precision = nA ? (nA - errors) / nA : null
  const recall = pos ? hit / pos : null
  return {
    n: rows.length, unjudged, excluded_examples: excluded, gold_known: known, gold_positive: pos,
    n_A: nA, gold_estimated: est, errors, precision, recall,
    meets_gate: unjudged === 0 && nA >= EVAL_GATE.minNA && errors <= EVAL_GATE.maxErrors && recall !== null && recall >= EVAL_GATE.minRecall,
    recheck,
  }
}

/** 새 1차 verdict 가 옛 프롬프트 1차 verdict 와 얼마나 같은가 — 추가 질문이 관련성 분포를 흔드는지 본다. 양쪽에 다 있는 id 만. */
export function verdictAgreement(fresh: ReadonlyMap<string, string>, baseline: ReadonlyMap<string, string>): { n: number; agree: number; pct: number | null; flips: { input_id: string; from: string; to: string }[] } {
  let n = 0, agree = 0
  const flips: { input_id: string; from: string; to: string }[] = []
  for (const [id, v] of fresh) {
    const b = baseline.get(id)
    if (b === undefined) continue
    n++
    if (b === v) agree++
    else flips.push({ input_id: id, from: b, to: v })
  }
  return { n, agree, pct: n ? agree / n : null, flips }
}
