// T2 완전 동의 자동 승인 — 순수 부품(DB·시계·네트워크 없음). 집행은 scripts/relevance-auto-approve.mjs.
//
// 권한 근거: CLAUDE.md §10.1 예외(남헌 2026-09-28) 조건 5개. 수치의 근거는 reports/2026-09-28/approval-automation-design.md.
//   1 완전 동의만        → isFullAgreement: 1차 verdict 와 2차 second_verdict 가 **둘 다 'relevant'** 이고
//                          product_informative·second_product_informative 가 **둘 다 true** 일 때만 true(rr-v2).
//   2 기준 통일 뒤에만   → 플래그 AUTO_APPROVAL_ENABLED(기본 꺼짐) + 1차 판정 시각 ≥ AUTO_APPROVAL_SINCE
//                          (+ import 가 현재 criteria_version 파일만 second_verdict 로 기록 — second-opinion.ts isCurrentCriteria).
//   3 상시 감사          → AUDIT_DAILY 건을 사람 채점표에 섞는다(relevance-grading-sample.mjs --audit). 결과는 기존 human_verdict.
//   4 자동 킬스위치      → killSwitch: 감사 창 오류가 문턱 이상이거나, 감사가 안 돌면(확인 불가) 스스로 꺼진다.
//                          오류 = 사람 irrelevant 또는 human_product_informative=false (scoreApproval).
//   5 범위               → 이 모듈은 review_relevance_verdicts 의 auto_approved_at 만 다룬다. 케이스·등급·발행은 모른다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

/**
 * 조건 버전 태그. 단계적 확대(설계 §6)로 조건이 바뀌면 새 태그를 쓴다 — 옛 승인과 섞이지 않게.
 * rr-v2(남헌 2026-09-28): 완전 동의에 "정보 있음(product_informative)" 둘 다 true 를 더했다. 감사 창도 rr-v2 행만 센다.
 */
export const AUTO_APPROVAL_RULE = 'rr-v2'

/** 하루 감사 표본(사람 채점표에 섞는 자동 승인 건수). 근거: 설계 §4 — 50건 창을 평일 2주에 채우는 최소 속도. */
export const AUDIT_DAILY = 5

/** 킬스위치 수치. 근거: 설계 §5. */
export const KILL = {
  /** 허용 오류율 기준선 — 소비재 1차·2차 불일치 6.7%(537건, 09-28 실측)를 완전 동의 행의 오류 상한으로 쓴다. */
  p0: 0.07,
  /** 감사 창 = 가장 최근 사람 채점 50건(≈ 평일 2주). */
  window: 50,
  /** 이보다 적으면 오류율을 말하지 않는다(워밍업). */
  minAudits: 10,
  /** 켠 뒤 이 기간이 지나도 감사가 안 쌓이면 확인 불가로 끈다. */
  warmupDays: 14,
  /** 워밍업 뒤 최근 14일 채점이 이보다 적으면 "감사가 안 돈다" = 조건 3 불충족. 기대치 50건의 40%. */
  minRecentAudits: 20,
} as const

/** 킬스위치 수치 한 벌. ca-v1(lib/cases/case-auto-approval.ts)이 같은 산식을 다른 수치로 쓴다. */
export type KillParams = { readonly [K in keyof typeof KILL]: number }

const DAY_MS = 86_400_000

export interface VerdictRow {
  input_id: string
  verdict: string | null
  second_verdict?: string | null
  product_informative?: boolean | null
  second_product_informative?: boolean | null
  human_verdict?: string | null
  judged_at?: string | null
  auto_approved_at?: string | null
}

/**
 * 자동 승인 대상인가 — 완전 동의(둘 다 relevant **이고 둘 다 정보 있음 true**)이고, 사람이 아직 안 봤고, 이미 승인되지 않았고,
 * 1차 판정이 통일 기준 시행(since) 이후인 행만. 판정이 하나뿐이거나 unknown·irrelevant·정보 null/false 가 섞이면 false.
 */
export function isFullAgreement(r: VerdictRow, since: Date): boolean {
  if (r.verdict !== 'relevant' || r.second_verdict !== 'relevant') return false
  // 정보 판정이 없으면(null·컬럼 없음) 대상이 아니다 — 모름을 있음으로 접지 않는다(§7.1).
  if (r.product_informative !== true || r.second_product_informative !== true) return false
  if (r.human_verdict != null || r.auto_approved_at != null) return false
  const t = r.judged_at ? Date.parse(r.judged_at) : NaN
  // 판정 시각을 모르면 옛 기준 판정일 수 있다 — 대상이 아니다(§7.1).
  return Number.isFinite(t) && t >= since.getTime()
}

/** n 건 창에서 킬스위치가 걸리는 오류 건수: ceil(n·p0 + 2·sqrt(n·p0·(1−p0))). p0 가 참일 때 오탐 ≈ 2~5%. */
export function tripThreshold(n: number, p0: number = KILL.p0): number {
  return Math.ceil(n * p0 + 2 * Math.sqrt(n * p0 * (1 - p0)))
}

export interface AuditRow {
  human_verdict: string | null
  /** 사람의 "정보 있음" 판정. rr-v2 감사는 human_verdict 와 이것이 둘 다 채워진 행만 센다. */
  human_product_informative: boolean | null
  human_graded_at: string | null
}

/**
 * 감사 1건 채점(순수). 창에는 human_verdict(relevant|irrelevant) 와 human_product_informative 가 **둘 다 채워진** 행만 들어간다.
 *   error   = 사람이 irrelevant 라 했거나, 정보 없음(false)이라 했다 — 자동 승인이 내보내면 안 되는 행.
 *   correct = relevant ∧ 정보 있음(true).
 *   null    = 창 밖(한쪽이 비었다·사람 모름·채점 시각 없음). 오류도 정답도 아니다.
 */
export function scoreApproval(a: AuditRow): 'correct' | 'error' | null {
  if (!a.human_graded_at) return null
  if (a.human_verdict !== 'relevant' && a.human_verdict !== 'irrelevant') return null
  if (typeof a.human_product_informative !== 'boolean') return null
  return a.human_verdict === 'irrelevant' || a.human_product_informative === false ? 'error' : 'correct'
}

export type KillState = 'ok' | 'warmup' | 'tripped' | 'unverifiable'

export interface KillResult {
  state: KillState
  /** 창 안 채점 건수(relevant/irrelevant 만 — 사람 unknown 은 창에 안 들어간다). */
  n: number
  errors: number
  threshold: number | null
  recent: number
  reason: string
}

/**
 * 감사 창을 읽어 켜둘지 정한다. audits = 자동 승인됐고 사람 채점이 있는 행. 채점은 scoreApproval —
 * 사람 irrelevant 또는 정보 없음이 오류 1건이고, 한쪽이라도 빈 행·사람 모름은 창에 안 들어간다.
 */
export function killSwitch(audits: readonly AuditRow[], opts: { now: Date; since: Date; kill?: KillParams }): KillResult {
  const K = opts.kill ?? KILL
  const scored = audits
    .map(a => ({ at: a.human_graded_at as string, score: scoreApproval(a) }))
    .filter(a => a.score !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const win = scored.slice(0, K.window)
  const n = win.length
  const errors = win.filter(a => a.score === 'error').length
  const recent = scored.filter(a => opts.now.getTime() - Date.parse(a.at) <= K.warmupDays * DAY_MS).length
  const threshold = n >= K.minAudits ? tripThreshold(n, K.p0) : null

  if (threshold !== null && errors >= threshold) {
    return { state: 'tripped', n, errors, threshold, recent, reason: `감사 최근 ${n}건 중 오류 ${errors}건(문턱 ${threshold}) — 정확도 ${pct(n - errors, n)}` }
  }
  const age = opts.now.getTime() - opts.since.getTime()
  if (age > K.warmupDays * DAY_MS && recent < K.minRecentAudits) {
    return { state: 'unverifiable', n, errors, threshold, recent, reason: `최근 ${K.warmupDays}일 감사 ${recent}건(필요 ${K.minRecentAudits}) — 감사가 돌지 않아 정확도 확인 불가` }
  }
  if (threshold === null) {
    return { state: 'warmup', n, errors, threshold, recent, reason: `감사 ${n}건 — ${K.minAudits}건 전까지 워밍업(시행 ${K.warmupDays}일 안)` }
  }
  return { state: 'ok', n, errors, threshold, recent, reason: `감사 최근 ${n}건 중 오류 ${errors}건(문턱 ${threshold}) — 정확도 ${pct(n - errors, n)}` }
}

export interface GateResult {
  on: boolean
  reason: string
  since: Date | null
  kill: KillResult | null
}

/**
 * 오늘 자동 승인을 해도 되나. 플래그 → 시행일 → 킬스위치 순서로 하나라도 막히면 끈다.
 * 플래그는 사람(또는 오케스트레이터)이 켜고, 킬스위치는 기계가 끈다 — 기계는 켜지 못한다.
 */
export function autoApprovalGate(input: {
  enabled: string | null | undefined
  since: string | null | undefined
  now: Date
  audits: readonly AuditRow[] | null
}): GateResult {
  if (String(input.enabled ?? '').trim().toLowerCase() !== 'true') {
    return { on: false, reason: 'AUTO_APPROVAL_ENABLED 꺼짐(기본값)', since: null, kill: null }
  }
  const since = parseSince(input.since)
  if (!since) return { on: false, reason: `AUTO_APPROVAL_SINCE 가 없거나 날짜가 아니다(${String(input.since ?? '')}) — 기준 통일 시행일 없이 켜지 않는다`, since: null, kill: null }
  if (since.getTime() > input.now.getTime()) return { on: false, reason: `시행일 ${input.since} 이 아직 오지 않았다`, since, kill: null }
  // 감사 조회 실패는 "오류 0" 이 아니다 — 끈다(§7.1).
  if (input.audits === null) return { on: false, reason: '감사 창 조회 실패 — 확인 불가라 끈다', since, kill: null }
  const kill = killSwitch(input.audits, { now: input.now, since })
  if (kill.state === 'tripped' || kill.state === 'unverifiable') return { on: false, reason: `킬스위치: ${kill.reason}`, since, kill }
  return { on: true, reason: kill.reason, since, kill }
}

/** 'YYYY-MM-DD'(KST 자정) 또는 ISO 시각. 못 읽으면 null. */
export function parseSince(v: string | null | undefined): Date | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00+09:00`) : Date.parse(s)
  return Number.isFinite(t) ? new Date(t) : null
}

function pct(a: number, b: number): string {
  return b ? `${Math.round((a / b) * 1000) / 10}%` : '—'
}
