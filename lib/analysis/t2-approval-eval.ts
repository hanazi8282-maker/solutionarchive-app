// rr-v2 자동 승인 평가 하네스의 순수 부품 — gold·채점·재확인 추출·옛 프롬프트 대비 일치. 네트워크·DB 없음.
// 집행은 scripts/t2-approval-eval.mjs, 셀프테스트는 scripts/t2-approval-eval-selftest.mjs.
//
// 질문: 1차·2차가 둘 다 relevant ∧ 둘 다 정보 있음(= rr-v2 가 승인할 행, "A")을 사람 기준으로 채점하면 몇 건이 틀리나.
// gold 는 감사 킬스위치와 **같은 함수**(scoreApproval)로 정한다 — 평가와 운영 감사가 다른 잣대면 평가 숫자가 운영을 예측하지 못한다.
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

export type RecheckReason = 'a' | 'b'
/** a = gold 를 못 정함(사람 정보 열 비었거나 관련 모름) · b = 09-28 좁은 기준으로 '무관' 매긴 8건 — 관련 열까지 다시 받는다. */
export interface RecheckItem { input_id: string; reason: RecheckReason }

const NARROW = new Set(RR39_NARROW_IRRELEVANT_INPUT_IDS)
const EXAMPLES = new Set(INFORMATIVE_EXAMPLE_INPUT_IDS)

/**
 * 사람 기준 정답. true = 승인해도 된다 · false = 승인하면 오류 · null = 모른다.
 * 좁은 기준 8건은 정보 열이 채워지기(= 재확인 표를 거치기) 전에는 human_verdict 를 믿지 않는다.
 */
export function goldOf(r: Pick<EvalInput, 'input_id' | 'human_verdict' | 'human_product_informative' | 'human_graded_at'>): boolean | null {
  if (NARROW.has(r.input_id) && typeof r.human_product_informative !== 'boolean') return null
  const s = scoreApproval({ human_verdict: r.human_verdict, human_product_informative: r.human_product_informative, human_graded_at: r.human_graded_at })
  return s === null ? null : s === 'correct'
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
  errors: number
  precision: number | null
  recall: number | null
  meets_gate: boolean
  recheck: RecheckItem[]
}

export function scoreEval(rows: readonly EvalInput[]): EvalResult {
  let unjudged = 0, excluded = 0, known = 0, pos = 0, nA = 0, errors = 0, hit = 0
  const recheck: RecheckItem[] = []
  const seen = new Set<string>()
  const push = (input_id: string, reason: RecheckReason) => { if (!seen.has(input_id)) { seen.add(input_id); recheck.push({ input_id, reason }) } }

  for (const r of rows) {
    if (NARROW.has(r.input_id)) push(r.input_id, 'b')
    if (EXAMPLES.has(r.input_id)) { excluded++; continue }
    const a = predictA(r.first, r.second)
    const gold = goldOf(r)
    const humanSeen = r.human_verdict != null
    if (gold === null && (humanSeen || a === true)) push(r.input_id, 'a')
    if (a === null) { unjudged++; continue }
    if (gold === null) continue
    known++
    if (gold) pos++
    if (a) { nA++; if (!gold) errors++; else hit++ }
  }
  // 좁은 기준 8건은 이번 표본에 없어도 항상 재확인 목록에 든다.
  for (const id of NARROW) push(id, 'b')

  const precision = nA ? (nA - errors) / nA : null
  const recall = pos ? hit / pos : null
  return {
    n: rows.length, unjudged, excluded_examples: excluded, gold_known: known, gold_positive: pos,
    n_A: nA, errors, precision, recall,
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
