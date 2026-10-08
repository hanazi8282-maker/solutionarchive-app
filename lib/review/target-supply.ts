// 타깃 공급 — 소스별 "필요 타깃 수 N" 과 결손(gap)을 계산한다. 순수 함수만. DB 는 scripts/target-supply.mjs 의 포트가 읽는다.
//
// 설계: Fable target-supply-design-v30(공개 리포 밖) §2·§3·§6·§7. 남헌 v32 §5 결정: D1 A(마이그 0 — JSON·job summary 만),
//   D2 v = 게시판 2·검색 1·앱스토어 1/7(5일 뒤 1차·14일 뒤 실측 보정), D3 30% = 활성 타깃 비중 게이트 + 14일 신규건수 비중 관측,
//   D4 googleplay 활성 80 동결, D6 발굴 건수 = gap 연동(소스당 ≤5, 추정 r 이면 1), D8 consecutive_empty=0 인 exhausted 만 되살림.
//
// 공식: N = min(N_budget, N_visit)
//   N_budget = floor(B ÷ (r × v)) — B 하루 요청 예산, r 타깃 1회 방문당 요청 수, v 하루 재방문 목표
//   N_visit  = floor(R × tpr ÷ v) — R 하루 실행 횟수(#449 스케줄 계획, 없으면 기존 2슬롯), tpr 1회 타깃 수
//   설계 문서는 R=2 로 적었다. #449 가 소스별 R(≤6)을 계획하므로 그 값을 쓴다 — 계획이 없으면 2 그대로.
//
// ⚠️ 이 모듈은 아무것도 쓰지 않는다. 결과는 신호다. review_source_ramp.supply_state(어제 실측)와 뜻이 달라 그 칸에 덮지 않는다.
// ⚠️ 3상태(§7.1): B 나 r 을 못 읽으면 `unverified` — `short` 로 접지 않는다.

import { createHash } from 'node:crypto'

import { REQUESTS_PER_BOARD_RUN, REQUESTS_PER_POST_RUN } from './request-cap.ts'
import { RAMP_EXCLUDED, RAMP_STEPS, pctTarget, validPlan, type SchedulePlan } from './ramp.ts'

/** 신규 타깃 게이트: 한 소스가 enabled 소스 활성 타깃의 이 비중을 넘으면 그 소스에 새 타깃을 넣지 않는다(D3). 기존 타깃은 유지. */
export const SHARE_GATE = 0.3
/** D4: googleplay 활성 타깃 동결선. 넘겨 넣지 않는다. 확대는 단계표·30% 게이트 둘 다 충족(expand_ready) 뒤 사람이 이 값을 올린다. */
export const GOOGLEPLAY_FROZEN_ACTIVE = 80
/** D6: 발굴 1회 소스당 상한. */
export const DISCOVERY_TARGET_MAX = 5
/** cap_base 가 없을 때 B = daily_request_cap × 이 비율(퍼센트 램프 첫 단계 50% 와 같은 값). */
export const CAP_FALLBACK_PCT = 50
/** 기존 2슬롯(nightly-review-collect 05:37Z·17:37Z). 스케줄 계획이 없는 소스의 하루 실행 횟수. */
export const LEGACY_RUNS_PER_DAY = 2

/** v 분류(D2). 앱스토어형 1/7 · 검색형 1 · 나머지(게시판·글·영상) 2. */
// wordpress_org·shopify_apps(2026-10-09): 앱·플러그인 리뷰 페이지 = 제품 1개 = 타깃 1개, 새 리뷰가 드물다 → 앱스토어형.
export const APP_SOURCES: ReadonlySet<string> = new Set(['appstore', 'googleplay', 'wordpress_org', 'shopify_apps'])
export const SEARCH_SOURCES: ReadonlySet<string> = new Set(['hackernews', 'kakao_blog', 'kakao_cafe'])
/** `board:` ref 를 받는 어댑터(lib/review/adapters 에서 parseBoardRef·board: 를 쓰는 12곳). board_register 처방 대상. */
export const BOARD_SOURCES: ReadonlySet<string> = new Set([
  '82cook', 'bobaedream', 'clien', 'damoang', 'devto', 'disquiet', 'indiehackers', 'inflearn', 'okky', 'tumblbug', 'velog', 'yozm',
])
/** 제품 사전(dictionary-targets.mjs)으로 공급할 수 있는 소스. */
export const DICTIONARY_SOURCES: ReadonlySet<string> = new Set(['appstore', 'googleplay', 'kakao_blog', 'kakao_cafe'])
/** 발굴 엔진 프로브가 타깃을 만드는 소스(lib/discovery/probe.ts). danawa 는 RAMP_EXCLUDED 라 excluded 로 빠진다. */
export const DISCOVERY_SOURCES: ReadonlySet<string> = new Set(['hackernews'])
/** 공급 계산에서 빼는 소스: 램프 제외(danawa 남헌 최소화·todayhumor 차단 이력) + producthunt(v30 #8 비활성 예정). */
export const SUPPLY_EXCLUDED: ReadonlySet<string> = new Set([...RAMP_EXCLUDED, 'producthunt'])

export type SourceRow = {
  key: string
  enabled: boolean
  daily_request_cap: number | null
  robots_status?: string | null
  tos_status?: string | null
  override?: string | null
}
export type RampRow = {
  source_key: string
  targets_per_run?: number | null
  cap_base?: number | null
  pct_step?: number | null
  last_evaluated_date?: string | null
  schedule_plan?: unknown
}
export type TargetRow = {
  id?: string
  source_key: string
  status: string
  product_ref: string
  label?: string | null
  consecutive_empty: number
  /** 비증분형 재방문 간격 판정용. 없으면(옛 픽스처·미기록) 비증분형은 revisit_unknown. */
  last_run_at?: string | null
}
export type RunRow = {
  source_key: string
  requests: number | null
  targets_visited: number | null
  new_reviews: number | null
  blocked_responses?: number | null
  status: string
  dry_run: boolean
}

export type SupplyState = 'short' | 'met' | 'over' | 'unverified' | 'excluded'
export type Remedy = 'reactivate' | 'board_register' | 'dictionary' | 'discovery' | 'new_source'

export type SourceSupply = {
  source_key: string
  policy: 'ok' | 'excluded'
  /** 약관 금지·자동화 금지인데 override 가 없는 소스 — 표시만 한다(남헌 2026-10-07: 현행 enabled 유지, 게이트 아님). */
  tos_flag: boolean
  cap_base: number | null
  cap_basis: string
  pct_step: number | null
  B: number | null
  r: number | null
  r_basis: string
  v: number
  v_basis: string
  runs_per_day: number
  runs_basis: string
  tpr: number
  N_budget: number | null
  N_visit: number
  N: number | null
  bound: 'budget' | 'visits' | null
  active: number
  inactive: { exhausted: number; failed: number; zero_empty_exhausted: number }
  gap: number | null
  state: SupplyState
  /** 활성 타깃 비중(%) — D3 게이트 입력. */
  share_active_pct: number
  /** 이 소스에 새 타깃을 몇 개까지 넣을 수 있나(30% 게이트·googleplay 동결 반영). gap 과 별개 상한. */
  gate_headroom: number
  remedies: Remedy[]
  area_active: Record<string, number>
}

export type SupplyReport = {
  generated_at: string
  ramp_read: 'ok' | 'unavailable'
  totals: { active: number; inactive: number }
  share_active: Record<string, number>
  share_new_reviews_14d: Record<string, number>
  areas: Record<string, { active: number; minimum: number; state: 'met' | 'short' | 'unverified' }>
  googleplay: { frozen_at: number; stage_cap: number | null; share_cap: number; expand_ready: boolean; reason: string }
  sources: SourceSupply[]
}

/**
 * 게시판 타깃인가 — 접두만 본다. request-cap classifyTargetRef(parseBoardRef)는 velog `board:tag:<태그>` 를 글로 센다(슬러그에 `:` 불가).
 * 여기선 게시판으로 세야 r 폴백이 과대 쪽(20)이 되고 board_register·되살리기 순서가 맞다.
 */
const isBoard = (ref: string) => /^board:/i.test(ref ?? '')

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

/** D2 재방문 목표. */
export function revisitTarget(sourceKey: string): { v: number; basis: string } {
  if (APP_SOURCES.has(sourceKey)) return { v: 1 / 7, basis: 'design_v32:app(1/7)' }
  if (SEARCH_SOURCES.has(sourceKey)) return { v: 1, basis: 'design_v32:search(1)' }
  return { v: 2, basis: 'design_v32:board(2)' }
}

/**
 * 30% 게이트의 남은 자리. (a + k) / (T + k) ≤ 0.3 를 만족하는 최대 k — 이 소스 하나만 늘린다고 볼 때.
 * ponytail: 다른 소스가 같은 날 함께 늘면 T 가 커져 실제 자리는 더 크다(보수 쪽). 정확히 하려면 소스 간 라운드로빈.
 */
export function shareHeadroom(active: number, totalActive: number): number {
  return Math.max(0, Math.floor((SHARE_GATE * totalActive - active) / (1 - SHARE_GATE) + 1e-9))
}

/** 새 타깃 상한 = 30% 게이트 ∧ (googleplay) 80 동결. */
export function gateHeadroom(sourceKey: string, active: number, totalActive: number): number {
  const share = shareHeadroom(active, totalActive)
  return sourceKey === 'googleplay' ? Math.min(share, Math.max(0, GOOGLEPLAY_FROZEN_ACTIVE - active)) : share
}

/** r = 최근 14일 Σrequests ÷ Σtargets_visited(status ok·dry_run 아님). 없거나 1 미만이면 ref 유형 폴백(과대 쪽 = 덜 등록, 호스트에 안전). */
export function requestsPerVisit(runs: RunRow[], activeRefs: string[]): { r: number; basis: string } {
  let req = 0
  let vis = 0
  for (const x of runs) {
    if (x.dry_run || x.status !== 'ok') continue
    req += x.requests ?? 0
    vis += x.targets_visited ?? 0
  }
  const board = activeRefs.some(isBoard)
  const fb = board ? REQUESTS_PER_BOARD_RUN : REQUESTS_PER_POST_RUN
  if (vis > 0) {
    const r = req / vis
    if (r >= 1) return { r: Math.round(r * 100) / 100, basis: 'measured_14d' }
    return { r: fb, basis: `fallback_measured_lt1(${(Math.round(r * 100) / 100).toString()})` }
  }
  return { r: fb, basis: board ? 'fallback_board' : 'fallback_post' }
}

function areaOf(label: string | null | undefined): string {
  const m = /^([1-5]):/.exec(label ?? '')
  return m ? m[1] : 'unmapped'
}

export function computeSupply(input: {
  now: Date
  sources: SourceRow[]
  /** null = review_source_ramp 를 못 읽었다(테이블 없음·조회 실패). 행 없음은 빈 배열. */
  ramps: RampRow[] | null
  targets: TargetRow[]
  /** 최근 14일분. 호출자가 기간을 자른다. */
  runs: RunRow[]
}): SupplyReport {
  const today = input.now.toISOString().slice(0, 10)
  const enabled = input.sources.filter((s) => s.enabled === true)
  const enabledKeys = new Set(enabled.map((s) => s.key))
  const rampBy = new Map((input.ramps ?? []).map((r) => [r.source_key, r]))

  const tBy = new Map<string, TargetRow[]>()
  for (const t of input.targets) (tBy.get(t.source_key) ?? tBy.set(t.source_key, []).get(t.source_key)!).push(t)
  const rBy = new Map<string, RunRow[]>()
  for (const r of input.runs) (rBy.get(r.source_key) ?? rBy.set(r.source_key, []).get(r.source_key)!).push(r)

  const activeOf = (k: string) => (tBy.get(k) ?? []).filter((t) => t.status === 'active').length
  const totalActive = enabled.reduce((n, s) => n + activeOf(s.key), 0)
  const totalInactive = input.targets.filter((t) => enabledKeys.has(t.source_key) && t.status !== 'active').length

  const newBy: Record<string, number> = {}
  let newTotal = 0
  for (const r of input.runs) {
    if (r.dry_run || !enabledKeys.has(r.source_key)) continue
    newBy[r.source_key] = (newBy[r.source_key] ?? 0) + (r.new_reviews ?? 0)
    newTotal += r.new_reviews ?? 0
  }
  const shareNew = Object.fromEntries(Object.entries(newBy).map(([k, n]) => [k, pct(n, newTotal)]))

  const sources: SourceSupply[] = enabled.map((s) => {
    const ts = tBy.get(s.key) ?? []
    const active = ts.filter((t) => t.status === 'active')
    const exhausted = ts.filter((t) => t.status === 'exhausted')
    const ramp = rampBy.get(s.key)
    const excluded = SUPPLY_EXCLUDED.has(s.key)

    // B
    let B: number | null = null
    let capBase: number | null = null
    let capBasis: string
    const pctStep = typeof ramp?.pct_step === 'number' ? ramp.pct_step : null
    if (typeof ramp?.cap_base === 'number' && ramp.cap_base > 0) {
      capBase = ramp.cap_base
      B = pctTarget(ramp.cap_base, pctStep ?? 50)
      capBasis = 'cap_base'
    } else if (typeof s.daily_request_cap === 'number' && s.daily_request_cap > 0) {
      B = Math.floor((s.daily_request_cap * CAP_FALLBACK_PCT) / 100)
      capBasis = 'daily_request_cap(임시)'
    } else capBasis = 'unverified'
    if (input.ramps === null && capBasis !== 'unverified') capBasis += '·⚠️ramp_unavailable'

    const plan: SchedulePlan | null = validPlan(ramp?.schedule_plan, today, ramp?.last_evaluated_date ?? null)
    const runsPerDay = plan?.runsPerDay ?? LEGACY_RUNS_PER_DAY
    const tpr = plan?.targetsPerRun ?? (typeof ramp?.targets_per_run === 'number' ? ramp.targets_per_run : RAMP_STEPS[0])
    const { r, basis: rBasis } = requestsPerVisit(rBy.get(s.key) ?? [], active.map((t) => t.product_ref))
    const { v, basis: vBasis } = revisitTarget(s.key)

    const nBudget = B === null ? null : Math.floor(B / (r * v) + 1e-9)
    const nVisit = Math.floor((runsPerDay * tpr) / v + 1e-9)
    const N = nBudget === null ? null : Math.min(nBudget, nVisit)
    const bound = N === null ? null : nBudget! <= nVisit ? 'budget' : 'visits'
    const gap = N === null ? null : N - active.length

    let state: SupplyState
    if (excluded) state = 'excluded'
    else if (N === null || gap === null) state = 'unverified'
    else if (gap > 0) state = 'short'
    else if (active.length > N * 1.1) state = 'over'
    else state = 'met'

    const zeroEmpty = exhausted.filter((t) => t.consecutive_empty === 0).length
    const remedies: Remedy[] = []
    if (state === 'short') {
      if (zeroEmpty > 0) remedies.push('reactivate')
      if (BOARD_SOURCES.has(s.key) && !active.some((t) => isBoard(t.product_ref))) remedies.push('board_register')
      if (DICTIONARY_SOURCES.has(s.key)) remedies.push('dictionary')
      if (DISCOVERY_SOURCES.has(s.key)) remedies.push('discovery')
      if (remedies.length === 0) remedies.push('new_source')
      // D3 관측: 14일 신규 건수 비중 30% 초과면 발굴을 맨 뒤로(막지는 않는다).
      if ((shareNew[s.key] ?? 0) > SHARE_GATE * 100 && remedies.includes('discovery')) {
        remedies.splice(remedies.indexOf('discovery'), 1)
        remedies.push('discovery')
      }
    }

    const areaActive: Record<string, number> = {}
    for (const t of active) areaActive[areaOf(t.label)] = (areaActive[areaOf(t.label)] ?? 0) + 1

    const tos = s.tos_status ?? null
    return {
      source_key: s.key,
      policy: excluded ? 'excluded' : 'ok',
      tos_flag: (tos === 'prohibited' || tos === 'forbids_automation') && !s.override,
      cap_base: capBase,
      cap_basis: capBasis,
      pct_step: pctStep,
      B,
      r,
      r_basis: rBasis,
      v: Math.round(v * 1000) / 1000,
      v_basis: vBasis,
      runs_per_day: runsPerDay,
      runs_basis: plan ? 'schedule_plan' : 'legacy_2slots',
      tpr,
      N_budget: nBudget,
      N_visit: nVisit,
      N,
      bound,
      active: active.length,
      inactive: { exhausted: exhausted.length, failed: ts.filter((t) => t.status === 'failed').length, zero_empty_exhausted: zeroEmpty },
      gap,
      state,
      share_active_pct: pct(active.length, totalActive),
      gate_headroom: excluded ? 0 : gateHeadroom(s.key, active.length, totalActive),
      remedies,
      area_active: areaActive,
    }
  })

  // 영역 최소 할당(설계 §6): max(8, ceil(10% × 영역 표기 활성 총수)). unmapped ≥ 50% 면 영역 지표는 허수 → unverified(R4).
  const areaTotals: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, unmapped: 0 }
  for (const s of sources) for (const [a, n] of Object.entries(s.area_active)) areaTotals[a] = (areaTotals[a] ?? 0) + n
  const labeled = totalActive - areaTotals.unmapped
  const minimum = Math.max(8, Math.ceil(0.1 * labeled))
  const unmappedHeavy = totalActive === 0 || areaTotals.unmapped / totalActive >= 0.5
  const areas = Object.fromEntries(
    ['1', '2', '3', '4', '5'].map((a) => [
      a,
      { active: areaTotals[a], minimum, state: unmappedHeavy ? 'unverified' : areaTotals[a] >= minimum ? 'met' : 'short' } as const,
    ]),
  )

  // D4: googleplay 확대 판정 — 단계 상한(N_budget)과 30% 게이트 상한 둘 다 동결선 위여야 하고, 14일 차단 0.
  const gp = sources.find((s) => s.source_key === 'googleplay')
  const gpBlocked = (rBy.get('googleplay') ?? []).reduce((n, r) => n + (r.dry_run ? 0 : (r.blocked_responses ?? 0)), 0)
  const shareCap = Math.floor(SHARE_GATE * totalActive)
  const stageCap = gp?.N_budget ?? null
  const expandReady = stageCap !== null && stageCap > GOOGLEPLAY_FROZEN_ACTIVE && shareCap > GOOGLEPLAY_FROZEN_ACTIVE && gpBlocked === 0
  const gpReason = !gp
    ? 'googleplay 행 없음(비활성·미등록)'
    : `단계 상한 ${stageCap ?? '확인 불가'}(${gp.cap_basis}, r ${gp.r} ${gp.r_basis}) · 30% 상한 ${shareCap} · 14일 차단 ${gpBlocked}` +
      (expandReady ? ' → 확대 조건 충족(동결선 상향은 사람)' : ` → 동결 ${GOOGLEPLAY_FROZEN_ACTIVE}`)

  return {
    generated_at: input.now.toISOString(),
    ramp_read: input.ramps === null ? 'unavailable' : 'ok',
    totals: { active: totalActive, inactive: totalInactive },
    share_active: Object.fromEntries(sources.filter((s) => s.active > 0).map((s) => [s.source_key, s.share_active_pct])),
    share_new_reviews_14d: shareNew,
    areas,
    googleplay: { frozen_at: GOOGLEPLAY_FROZEN_ACTIVE, stage_cap: stageCap, share_cap: shareCap, expand_ready: expandReady, reason: gpReason },
    sources,
  }
}

/** 사람용 한 줄(job summary). */
export function supplyLine(s: SourceSupply): string {
  if (s.state === 'excluded') return `${s.source_key} · excluded · active ${s.active}`
  const gap = s.gap === null ? '?' : s.gap > 0 ? `−${s.gap}` : `+${-s.gap}`
  return (
    `${s.source_key} · ${s.state}(${gap}) · ${s.bound ?? '?'} 묶임 · N ${s.N ?? '?'} / active ${s.active}` +
    ` · B ${s.B ?? '?'}(${s.cap_basis}) · r ${s.r}(${s.r_basis}) · v ${s.v} · R ${s.runs_per_day}×tpr ${s.tpr}` +
    ` · 게이트 여유 ${s.gate_headroom}${s.tos_flag ? ' · ⚠️약관 플래그' : ''}` +
    (s.remedies.length ? ` · 처방 ${s.remedies.join('>')}` : '')
  )
}

/**
 * D6: 발굴 1회 후보 수. supply 가 없거나 그 소스가 gap 모델 밖(excluded·unverified·행 없음)이면 기존 고정값 — 줄이지도 늘리지도 않는다.
 * short ∧ 'discovery' 처방일 때만 min(gap, 5, 게이트 여유), 추정 r(fallback_*)이면 1. 그 밖(met·over)은 0.
 */
export function discoveryCount(report: Pick<SupplyReport, 'sources'> | null, sourceKey: string, fallback: number): { count: number; note: string } {
  if (!report) return { count: fallback, note: `⚠️ supply 없음 — 고정 ${fallback}건(기존 동작)` }
  const s = report.sources.find((x) => x.source_key === sourceKey)
  if (!s) return { count: fallback, note: `⚠️ supply 에 ${sourceKey} 행 없음 — 고정 ${fallback}건` }
  if (s.state === 'excluded' || s.state === 'unverified') return { count: fallback, note: `${sourceKey} ${s.state} — gap 모델 밖, 고정 ${fallback}건` }
  if (s.state !== 'short' || !s.remedies.includes('discovery') || s.gap === null) return { count: 0, note: `${sourceKey} ${s.state}(N ${s.N} / active ${s.active}) — 발굴 0건` }
  const cap = Math.min(s.gap, DISCOVERY_TARGET_MAX, s.gate_headroom)
  if (s.r_basis.startsWith('fallback')) return { count: Math.min(1, cap), note: `${sourceKey} short(−${s.gap}) · r 추정(${s.r_basis}) → ${Math.min(1, cap)}건` }
  return { count: cap, note: `${sourceKey} short(−${s.gap}) · 게이트 여유 ${s.gate_headroom} → ${cap}건` }
}

// ── 비활성 되살리기(D8) ──────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 되살리기 순서: board: → 그 밖(q:·앱 id 등) → url: 맨 뒤.
 * url: 글은 새 댓글이 없으면 연속 0건 3회(약 1.5일)로 다시 닫힌다 — 앞에 두면 gap 을 잠깐 메워 met 으로 보이게 하고
 * board_register 처방을 가린다(독립 검토 d).
 */
const reviveRank = (ref: string) => (isBoard(ref) ? 0 : /^url:/i.test(ref ?? '') ? 2 : 1)

/** 되살리기 대상 id 집합의 지문(정렬 뒤 sha256 앞 16자리). 드라이런이 출력하고 --run 이 --expect-hash 로 대조한다. */
export function idSetHash(ids: string[]): string {
  return createHash('sha256').update([...ids].sort().join('\n')).digest('hex').slice(0, 16)
}

export type RevivePlan = {
  revive: Array<{ id: string; source_key: string; product_ref: string; prev_status: string; prev_consecutive_empty: number }>
  /** 소스별 { candidates, revive, skipped: {사유: 건수} } */
  /** next_due = 재방문 간격 미경과로 건너뛴 행 중 가장 이른 자격 시각(ISO). 없으면 키 없음. */
  bySource: Record<string, { candidates: number; revive: number; skipped: Record<string, number>; next_due?: string }>
}

/**
 * 비증분형 소스 — 어댑터에 `incrementalOnly` 가 없어 러너가 "끝까지 읽음"(cursor null)에서 exhausted 로 닫는다
 * (lib/review/runner.ts `endStatus = adapter.incrementalOnly ? 'active' : 'exhausted'`). 이 소스의
 * `exhausted ∧ consecutive_empty=0` 은 옛 로직 흔적이 아니라 **정상 종료**다 — 피드 전체를 다시 읽으므로 되살리면 중복만 나온다.
 * 대상(2026-10-08 실측, scripts/review-collect.mjs 어댑터 표 기준): appstore(RSS 최대 500건) · youtube · danawa · producthunt · naver_blog_post.
 * 셀프테스트가 어댑터의 incrementalOnly 와 이 집합을 대조한다.
 */
export const NON_INCREMENTAL_SOURCES: ReadonlySet<string> = new Set(['appstore', 'youtube', 'danawa', 'producthunt', 'naver_blog_post'])
/** 비증분형 재방문 최소 간격(일). 설계 v 의 앱스토어 1/7 과 같은 값 — v 가 더 느슨해도(게시판 2 등) 전체 재읽기는 주 1회보다 자주 하지 않는다. */
export const NON_INCREMENTAL_MIN_REVISIT_DAYS = 7

/** 비증분형 타깃의 재방문 간격(일) = max(1/v, 7). 증분형은 null(간격 규칙 없음). */
export function revisitDays(sourceKey: string): number | null {
  if (!NON_INCREMENTAL_SOURCES.has(sourceKey)) return null
  return Math.max(1 / revisitTarget(sourceKey).v, NON_INCREMENTAL_MIN_REVISIT_DAYS)
}

/**
 * 대상 = exhausted ∧ consecutive_empty=0 ∧ enabled 소스 ∧ SUPPLY_EXCLUDED 아님(producthunt·danawa·todayhumor)
 *        ∧ (비증분형이면 last_run_at + 재방문 간격 경과 — 아니면 revisit_not_due, last_run_at 없으면 revisit_unknown).
 * 소스별 상한 = min(gap(N − active), 게이트 여유). unverified 소스는 0(모르는 결손을 채우지 않는다). board: 먼저.
 * 법적 게이트로 빼지 않는다 — 남헌 2026-10-07: devto·disquiet·indiehackers·tumblbug·youtube 는 enabled 유지, 현행 enabled 만 본다.
 * 기준 시각 = report.generated_at.
 */
export function planRevive(targets: TargetRow[], report: SupplyReport): RevivePlan {
  const now = Date.parse(report.generated_at)
  const supplyBy = new Map(report.sources.map((s) => [s.source_key, s]))
  const bySource: RevivePlan['bySource'] = {}
  const revive: RevivePlan['revive'] = []
  const cands = targets
    .filter((t) => t.status === 'exhausted' && t.consecutive_empty === 0)
    .sort((a, b) => reviveRank(a.product_ref) - reviveRank(b.product_ref) || String(a.id).localeCompare(String(b.id)))
  const used = new Map<string, number>()
  for (const t of cands) {
    const b = (bySource[t.source_key] ??= { candidates: 0, revive: 0, skipped: {} })
    b.candidates++
    const s = supplyBy.get(t.source_key)
    let skip: string | null = null
    if (!s) skip = 'source_disabled_or_missing'
    else if (s.state === 'excluded') skip = 'source_excluded'
    else if (s.state === 'unverified' || s.gap === null) skip = 'supply_unverified'
    else if (!t.id || !UUID.test(t.id)) skip = 'bad_id'
    else if (revisitDays(t.source_key) !== null) {
      const last = t.last_run_at ? Date.parse(t.last_run_at) : NaN
      if (!Number.isFinite(last)) skip = 'revisit_unknown'
      else {
        const due = last + revisitDays(t.source_key)! * 86_400_000
        if (due > now) {
          skip = 'revisit_not_due'
          const iso = new Date(due).toISOString()
          if (!b.next_due || iso < b.next_due) b.next_due = iso
        }
      }
    }
    if (!skip && s && s.gap !== null && (used.get(t.source_key) ?? 0) >= Math.min(Math.max(0, s.gap), s.gate_headroom)) {
      skip = s.gap <= 0 ? 'no_gap' : 'over_headroom'
    }
    if (skip) {
      b.skipped[skip] = (b.skipped[skip] ?? 0) + 1
      continue
    }
    used.set(t.source_key, (used.get(t.source_key) ?? 0) + 1)
    b.revive++
    revive.push({ id: t.id!, source_key: t.source_key, product_ref: t.product_ref, prev_status: t.status, prev_consecutive_empty: t.consecutive_empty })
  }
  return { revive, bySource }
}

/** 되돌리기 SQL — 되살린 행 id 와 이전 status·consecutive_empty 를 담는다. 아직 active 인 행만 되돌린다(그새 다시 닫힌 행은 이미 이전 상태). */
export function rollbackSql(rows: RevivePlan['revive'], stamp: string): string {
  for (const r of rows) {
    if (!UUID.test(r.id)) throw new Error(`id 형식 아님: ${r.id}`)
    if (r.prev_status !== 'exhausted' && r.prev_status !== 'failed') throw new Error(`이전 status 형식 아님: ${r.prev_status}`)
    if (!Number.isInteger(r.prev_consecutive_empty)) throw new Error(`이전 consecutive_empty 형식 아님: ${r.prev_consecutive_empty}`)
  }
  const values = rows
    .map((r) => `  ('${r.id}'::uuid, '${r.prev_status}', ${r.prev_consecutive_empty})`)
    .join(',\n')
  return [
    `-- target-revive 롤백 ${stamp} — ${rows.length}행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.`,
    `-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).`,
    rows.length === 0
      ? '-- 대상 0행 — 실행할 것 없음.'
      : [
          'BEGIN;',
          'UPDATE public.review_targets t',
          '   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty',
          '  FROM (VALUES',
          values,
          '  ) AS v(id, prev_status, prev_consecutive_empty)',
          " WHERE t.id = v.id AND t.status = 'active';",
          'COMMIT;',
          `-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN (${rows.map((r) => `'${r.id}'`).join(', ')}) AND status = 'active';  -- 기대 0`,
        ].join('\n'),
    '',
  ].join('\n')
}
