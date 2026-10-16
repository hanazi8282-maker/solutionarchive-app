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

import { abandonEvalAt, type AbandonCriteria, type AreaDef, type AreasConfig } from '../analysis/areas-config.ts'
import { REQUESTS_PER_BOARD_RUN, REQUESTS_PER_POST_RUN } from './request-cap.ts'
import { RAMP_EXCLUDED, RAMP_STEPS, pctTarget, validPlan, type SchedulePlan } from './ramp.ts'
import { isOwnerRobotsOverride } from './runner.ts'

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
  '82cook', 'bobaedream', 'clien', 'damoang', 'devto', 'disquiet', 'indiehackers', 'inflearn', 'n8n_community', 'make_community', 'bubble_forum', 'retool_community', 'glide_community', 'softr_community', 'okky', 'tumblbug', 'velog', 'yozm',
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
  /** 재방문 시계(v48) 속도 재료 — 기존 칸만 쓴다(review_targets). 없으면 속도 확인 불가 → 상한 간격. */
  total_collected?: number | null
  created_at?: string | null
  last_review_at?: string | null
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
  /** robots 금지 확정(robots_status='disallowed') ∧ 소유자 예외 없음 — 되살리기 대상에서 뺀다(v48). */
  robots_blocked?: boolean
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

/** 타깃 라벨 접두 `N:`(1~5) → 영역, 없으면 'unmapped'. T2 순서(lib/analysis/area-priority.ts)가 area_code NULL 프로젝트의 폴백으로 쓴다. */
export function areaOf(label: string | null | undefined): string {
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
      robots_blocked: s.robots_status === 'disallowed' && !isOwnerRobotsOverride(s.override, s.robots_status),
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
  revive: Array<{ id: string; source_key: string; product_ref: string; prev_status: string; prev_consecutive_empty: number; total_collected?: number }>
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

// ── 재방문 시계(남헌 v48 §2-A, 2026-10-11) ─────────────────────────
// 비증분형의 exhausted 는 영구 정지가 아니라 "다음 재점검까지 쉼"이다. 간격은 타깃이 실제로 낸 신규 속도에서 잰다.
// 재료는 review_targets 의 기존 칸뿐이다(total_collected·created_at·last_run_at·last_review_at·consecutive_empty) — 새 칸 없음.
/** 하한(일) — 인기 타깃. v37 의 7일에서 내렸다(v48). */
export const REVISIT_MIN_DAYS = 3
/** 상한(일) — 조용한 타깃. 아무리 조용해도 2주에 한 번은 첫 페이지를 본다. */
export const REVISIT_MAX_DAYS = 14
/**
 * K: 한 번 재점검할 때 기대하는 신규 건수 — 재방문 1회에 ≥3건은 받아야 요청 값어치가 있다.
 * 10 이었을 때 실측(PR #486 드라이런, 2026-10-12): 앱스토어 최신 리뷰가 방문 시점보다 2~3.5일 전 → λ≈0.3~0.5/일 → 20~30일 → 106개 전부 상한 14에 붙었다.
 * 3 이면 그런 타깃 약 6일, 최신 리뷰 <1일인 인기 타깃 3일, 더 조용한 곳 14일.
 */
export const REVISIT_EXPECTED_NEW = 3
/** v69 A레인: 한 번 재점검에서 기대 신규가 이 값 미만이면 되살리지 않는다(헛수고 방지). 속도를 모르면 걸지 않는다. */
export const REVIVE_MIN_EXPECTED_NEW = 1
/** v69 A레인: 한 실행 전체 되살리기 상한(소스별 상한과 별개). */
export const REVIVE_TOTAL_PER_RUN = 40
/** 무인 되살리기(--auto) 소스별 실행당 상한. 하루 수집 슬롯 6(ramp.ts COLLECT_SLOTS)에 나눠 106개 백로그를 약 3일(= 하한)에 흡수한다. */
export const REVIVE_PER_RUN = 6
/**
 * v71ad §5(a): 위 두 상한(40·6)을 리포 변수로 올릴 수 있게 한다 — 이 값 위로는 변수를 아무리 올려도 안 간다(코드 안 하드 천장).
 * 변수 이름: TARGET_REVIVE_TOTAL_CEILING(기본 REVIVE_TOTAL_PER_RUN) · TARGET_REVIVE_PER_SOURCE(기본 REVIVE_PER_RUN).
 */
export const REVIVE_HARD_CEILING = 200

/** env 정수 → 상한. 미설정·빈값·숫자 아님·0 이하 → 기본(잘못된 값에 넓어지지 않는다). 하드 천장 200 을 넘으면 잘라 clipped. */
export function envCap(raw: string | undefined | null, def: number): { value: number; note: string | null } {
  if (raw == null || String(raw).trim() === '') return { value: def, note: null }
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n <= 0) return { value: def, note: `값 '${raw}' 이 양의 정수가 아니라 기본 ${def}` }
  if (n > REVIVE_HARD_CEILING) return { value: REVIVE_HARD_CEILING, note: `${n} 이 하드 천장 ${REVIVE_HARD_CEILING} 을 넘어 ${REVIVE_HARD_CEILING}` }
  return { value: n, note: null }
}

/**
 * v71ad §5(a): 소스별 재방문 간격 배율 — 리포 변수 TARGET_REVISIT_SCALE = JSON {"<source_key>": 배율}. **줄이기만** 한다:
 * 배율은 [0.25, 1], 범위 밖·숫자 아님은 그 항목만 버리고 note 에 남긴다. 결과 간격 하한은 1일.
 * 왜 필요한가: 증분형 exhausted 는 연속 0건 3회(글)·30회(게시판)로 닫혀서 revisitDays 의 2^consecutive_empty 가 8배 이상 —
 *   λ 가 1.7/일 미만이면 전부 상한 14일에 붙는다. 이 배율이 그 14일을 소스별로 깎는 유일한 손잡이다.
 */
export const REVISIT_SCALE_MIN = 0.25
export function parseRevisitScale(raw: string | undefined | null): { scale: Record<string, number>; notes: string[] } {
  if (raw == null || String(raw).trim() === '') return { scale: {}, notes: [] }
  let obj: unknown
  try {
    obj = JSON.parse(String(raw))
  } catch {
    return { scale: {}, notes: [`TARGET_REVISIT_SCALE JSON 아님 — 무시(배율 1)`] }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { scale: {}, notes: ['TARGET_REVISIT_SCALE 가 객체가 아님 — 무시(배율 1)'] }
  const scale: Record<string, number> = {}
  const notes: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'number' && v >= REVISIT_SCALE_MIN && v <= 1) scale[k] = v
    else notes.push(`TARGET_REVISIT_SCALE.${k}=${JSON.stringify(v)} 범위 [${REVISIT_SCALE_MIN}, 1] 밖 — 무시`)
  }
  return { scale, notes }
}

/**
 * v71aj D-24 (가)(나): 숨은 천장 두 개를 소스별 리포 변수로 풀 수 있게 한다. **변수가 없으면 현행 그대로**(롤백 = 변수 삭제).
 *   TARGET_REVIVE_CE_EXP_MAX  JSON {"<source_key>"|"*": k} — revisitDays 의 2^consecutive_empty 에서 지수를 k 로 자른다(정수 0~10).
 *                             증분형은 연속 0건 3회(글)·30회(게시판)로 닫혀 2^3 이상 → λ<1.7/일이면 전부 14일. k=2 면 최대 ×4.
 *                             간격은 여전히 clamp(3, 14) 안이다(§10.1 "3~14일" 문구 안).
 *   TARGET_REVIVE_QUEUE_SLACK JSON {"<source_key>"|"*": k} — queue_full(소스별 n ≥ tpr − active)에 k 자리를 더 연다(정수 0~200).
 *                             증분형은 active 가 tpr 보다 많아 tpr − active ≤ 0 → 시계가 켜져도 전부 queue_full. 소스별·전체 상한(6·40)은 그대로 묶는다.
 * 소스 키가 우선, 없으면 "*". 범위 밖·정수 아님은 그 항목만 버리고 note.
 */
export const CE_EXP_MAX_LIMIT = 10
export function parsePerSourceInt(raw: string | undefined | null, name: string, max: number): { map: Record<string, number>; notes: string[] } {
  if (raw == null || String(raw).trim() === '') return { map: {}, notes: [] }
  let obj: unknown
  try {
    obj = JSON.parse(String(raw))
  } catch {
    return { map: {}, notes: [`${name} JSON 아님 — 무시(현행)`] }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { map: {}, notes: [`${name} 가 객체가 아님 — 무시(현행)`] }
  const map: Record<string, number> = {}
  const notes: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max) map[k] = v as number
    else notes.push(`${name}.${k}=${JSON.stringify(v)} 범위 [0, ${max}] 정수 아님 — 무시`)
  }
  return { map, notes }
}
const perSourceOf = (m: Record<string, number> | undefined, k: string): number | undefined => m?.[k] ?? m?.['*']

const DAY_MS = 86_400_000

/**
 * 비증분형 타깃의 재방문 간격(일). 증분형은 null(간격 규칙 없음 — 연속 0건 규칙이 따로 닫는다).
 *
 *   λ_hist  = total_collected ÷ max(1, (last_run_at − created_at) 일)      지금까지 이 타깃이 낸 신규 속도(건/일)
 *   λ_quiet = 1 ÷ ((last_run_at − last_review_at) 일)                       마지막 방문 때 최신 리뷰가 이미 그만큼 묵었다 → 그보다 빠를 수 없다(1일 이상일 때만)
 *   λ       = min(λ_hist, λ_quiet)
 *   days    = clamp(K ÷ λ × 2^consecutive_empty, 3, 14)                    K = 3 · λ = 0 → 14 · 빈 재점검마다 2배(조용한 곳은 상한으로)
 *
 * 속도를 못 재면(created_at·last_review_at 둘 다 없음) 상한 14 — 모르는 것을 인기로 접지 않는다(호스트에 안전한 쪽).
 * ponytail: 첫 통독(앱스토어 RSS 최대 500건)이 λ_hist 를 부풀린다 — 젊은 타깃은 실제보다 자주 간다. λ_quiet 와 빈 재점검 2배가
 *   이를 깎는다. 재점검별 신규 건수를 타깃 단위로 남기는 칸이 생기면 그걸로 바꾼다(지금은 없음 — 마이그 안 함).
 */
export function revisitDays(
  t: Pick<TargetRow, 'source_key'> & Partial<TargetRow>,
  opts: { all?: boolean; scale?: Record<string, number>; expCap?: Record<string, number> } = {},
): { days: number; basis: string } | null {
  if (!NON_INCREMENTAL_SOURCES.has(t.source_key) && !opts.all) return null
  const k = opts.scale?.[t.source_key]
  const sc = typeof k === 'number' && k >= REVISIT_SCALE_MIN && k <= 1 ? k : 1
  const scaled = (d: number) => (sc === 1 ? d : Math.max(1, d * sc))
  const tag = sc === 1 ? '' : `·×${sc}`
  const last = t.last_run_at ? Date.parse(t.last_run_at) : NaN
  const created = t.created_at ? Date.parse(t.created_at) : NaN
  const newest = t.last_review_at ? Date.parse(t.last_review_at) : NaN
  const rates: number[] = []
  if (Number.isFinite(last) && Number.isFinite(created)) rates.push((t.total_collected ?? 0) / Math.max(1, (last - created) / DAY_MS))
  if (Number.isFinite(last) && Number.isFinite(newest) && (last - newest) / DAY_MS >= 1) rates.push(1 / ((last - newest) / DAY_MS))
  const ce = Math.max(0, t.consecutive_empty ?? 0)
  if (rates.length === 0) return { days: scaled(REVISIT_MAX_DAYS), basis: `velocity_unknown→max${tag}` }
  const lambda = Math.min(...rates)
  const cap = perSourceOf(opts.expCap, t.source_key)
  const exp = cap === undefined ? ce : Math.min(ce, cap)
  const raw = lambda > 0 ? (REVISIT_EXPECTED_NEW / lambda) * 2 ** exp : Infinity
  const days = scaled(Math.min(REVISIT_MAX_DAYS, Math.max(REVISIT_MIN_DAYS, raw)))
  return { days: Math.round(days * 100) / 100, basis: `λ=${Math.round(lambda * 1000) / 1000}/일·ce=${ce}${exp < ce ? `→2^${exp}` : ''}${tag}` }
}

/** 신규 속도 λ(건/일) — revisitDays 와 같은 재료·같은 min. 못 재면 null. */
export function revisitRate(t: Partial<TargetRow>): number | null {
  const last = t.last_run_at ? Date.parse(t.last_run_at) : NaN
  const created = t.created_at ? Date.parse(t.created_at) : NaN
  const newest = t.last_review_at ? Date.parse(t.last_review_at) : NaN
  const rates: number[] = []
  if (Number.isFinite(last) && Number.isFinite(created)) rates.push((t.total_collected ?? 0) / Math.max(1, (last - created) / DAY_MS))
  if (Number.isFinite(last) && Number.isFinite(newest) && (last - newest) / DAY_MS >= 1) rates.push(1 / ((last - newest) / DAY_MS))
  return rates.length ? Math.min(...rates) : null
}

export type ReviveOptions = {
  /** v69 A레인: 증분형(게시판·검색 등)의 연속 0건 exhausted 도 재방문 시계로 되살린다. 기본 꺼짐 — 관찰 3일 뒤 켠다. */
  clockAll?: boolean
  /** 기대 신규(λ × 마지막 방문 뒤 경과일)가 이 값 미만이면 건너뛴다. 없으면 검사 안 함. */
  minExpectedNew?: number
  /** 한 실행 증분형 되살리기 전체 상한. 비증분형(앱스토어·유튜브)은 세지 않는다 — 14일 보장을 밀어내지 않게. */
  totalCap?: number
  /** 소스별 이번 실행 상한(무인 --auto 는 REVIVE_PER_RUN). 없으면 수동 경로 — 기존 min(gap, 게이트 여유)만. */
  perRunCap?: number
  /** true = 비증분형(재방문 시계)만. 증분형 exhausted 는 manual_only 로 건너뛴다(D8 수동 경로에 남긴다). */
  clockOnly?: boolean
  /** v71ad: 소스별 재방문 간격 배율(parseRevisitScale). 없으면 1. */
  revisitScale?: Record<string, number>
  /** v71aj: 소스별 2^consecutive_empty 지수 상한(TARGET_REVIVE_CE_EXP_MAX). 없으면 자르지 않는다. */
  revisitExpCap?: Record<string, number>
  /** v71aj: 소스별 queue_full 여유 자리(TARGET_REVIVE_QUEUE_SLACK). 없으면 0. */
  queueSlack?: Record<string, number>
}

/**
 * 대상 = exhausted ∧ enabled 소스 ∧ SUPPLY_EXCLUDED 아님(producthunt·danawa·todayhumor) ∧ robots 금지 확정 아님
 *        ∧ (증분형: consecutive_empty=0 — D8 그대로)
 *        ∧ (비증분형: last_run_at + revisitDays 경과 — 아니면 revisit_not_due, last_run_at 없으면 revisit_unknown. consecutive_empty 는
 *           간격을 늘리는 재료라 거르지 않는다 — 걸렀으면 빈 재점검 한 번에 시계가 영영 멈춘다).
 * 소스별 상한 = min(gap(N − active), 게이트 여유[, perRunCap, 비증분형은 tpr − active]). unverified 소스는 0. board: 먼저, 같은 등급은 오래 안 간 순.
 * 법적 게이트로 빼지 않는다 — 남헌 2026-10-07: devto·disquiet·indiehackers·tumblbug·youtube 는 enabled 유지, 현행 enabled 만 본다.
 * 기준 시각 = report.generated_at.
 */
export function planRevive(targets: TargetRow[], report: SupplyReport, opts: ReviveOptions = {}): RevivePlan {
  const now = Date.parse(report.generated_at)
  const supplyBy = new Map(report.sources.map((s) => [s.source_key, s]))
  const bySource: RevivePlan['bySource'] = {}
  const revive: RevivePlan['revive'] = []
  const cands = targets
    .filter((t) => t.status === 'exhausted' && (opts.clockAll || t.consecutive_empty === 0 || NON_INCREMENTAL_SOURCES.has(t.source_key)))
    .sort(
      (a, b) =>
        reviveRank(a.product_ref) - reviveRank(b.product_ref) ||
        String(a.last_run_at ?? '').localeCompare(String(b.last_run_at ?? '')) ||
        String(a.id).localeCompare(String(b.id)),
    )
  const used = new Map<string, number>()
  for (const t of cands) {
    const b = (bySource[t.source_key] ??= { candidates: 0, revive: 0, skipped: {} })
    b.candidates++
    const s = supplyBy.get(t.source_key)
    const clock = NON_INCREMENTAL_SOURCES.has(t.source_key) || opts.clockAll === true
    let skip: string | null = null
    if (!s) skip = 'source_disabled_or_missing'
    else if (s.state === 'excluded') skip = 'source_excluded'
    else if (s.robots_blocked) skip = 'robots_disallowed'
    else if (opts.clockOnly && !clock) skip = 'manual_only'
    else if (s.state === 'unverified' || s.gap === null) skip = 'supply_unverified'
    else if (!t.id || !UUID.test(t.id)) skip = 'bad_id'
    else if (clock) {
      const last = t.last_run_at ? Date.parse(t.last_run_at) : NaN
      if (!Number.isFinite(last)) skip = 'revisit_unknown'
      else {
        const due = last + revisitDays(t, { all: opts.clockAll, scale: opts.revisitScale, expCap: opts.revisitExpCap })!.days * DAY_MS
        if (due > now) {
          skip = 'revisit_not_due'
          const iso = new Date(due).toISOString()
          if (!b.next_due || iso < b.next_due) b.next_due = iso
        } else if (opts.minExpectedNew !== undefined && !NON_INCREMENTAL_SOURCES.has(t.source_key)) {
          // 비증분형은 "조용해도 14일에 한 번은 첫 페이지를 본다"(REVISIT_MAX_DAYS) 보장을 지킨다 — 예측 검사는 새로 여는 증분형에만.
          const lam = revisitRate(t)
          if (lam !== null && lam * ((now - last) / DAY_MS) < opts.minExpectedNew) skip = 'expected_low'
        }
      }
    }
    if (!skip && opts.totalCap !== undefined && !NON_INCREMENTAL_SOURCES.has(t.source_key) && revive.filter((r) => !NON_INCREMENTAL_SOURCES.has(r.source_key)).length >= opts.totalCap) skip = 'total_cap'
    if (!skip && s && s.gap !== null) {
      const n = used.get(t.source_key) ?? 0
      if (n >= Math.min(Math.max(0, s.gap), s.gate_headroom)) skip = s.gap <= 0 ? 'no_gap' : 'over_headroom'
      else if (opts.perRunCap !== undefined && n >= opts.perRunCap) skip = 'run_cap'
      // 한 실행이 소비할 수 있는 만큼만 연다 — 수집이 안 도는 슬롯에서 되살린 타깃이 쌓이지 않게(tpr = 회당 타깃 수).
      else if (opts.perRunCap !== undefined && clock && n >= Math.max(0, s.tpr - s.active) + (perSourceOf(opts.queueSlack, t.source_key) ?? 0)) skip = 'queue_full'
    }
    if (skip) {
      b.skipped[skip] = (b.skipped[skip] ?? 0) + 1
      continue
    }
    used.set(t.source_key, (used.get(t.source_key) ?? 0) + 1)
    b.revive++
    revive.push({ id: t.id!, source_key: t.source_key, product_ref: t.product_ref, prev_status: t.status, prev_consecutive_empty: t.consecutive_empty, total_collected: t.total_collected ?? 0 })
  }
  return { revive, bySource }
}

// ── 재고 게이지(v69 A레인) ─────────────────────────────────────────
export type GaugeLevel = 'ok' | 'warn' | 'urgent'
export type SourceGauge = {
  source_key: string
  /** 즉시 재고: 소비형(방문하면 닫히는 비증분형)은 active ÷ 하루 방문 슬롯 = 버티는 일수. 순환형(증분형)은 소비되지 않아 null. */
  immediate_days: number | null
  basis: 'consumed' | 'cyclic'
  active: number
  /** 예약 재고: 재방문 간격이 이미 지나 되살릴 수 있는 exhausted 수 / 아직 간격 안 지난 수 / 가장 이른 자격 시각. */
  reserved_due_now: number
  reserved_waiting: number
  reserved_next_due: string | null
  level: GaugeLevel
}
export const GAUGE_WARN_DAYS = 14
export const GAUGE_URGENT_DAYS = 7

/**
 * 소스별 재고 게이지. 소비형(방문하면 exhausted 로 닫히는 비증분형)만 일수로 센다. 증분형은 타깃이 되풀이되므로 일수가 정의되지 않는다 —
 * 활성 0 = 긴급, 결손 = 경고로 본다. ponytail: 순환형 일수는 소스별 실측 소비율이 쌓이면 도입. 제외 소스는 빠진다.
 */
export function inventoryGauge(report: SupplyReport, targets: TargetRow[], now: Date, scale?: Record<string, number>, expCap?: Record<string, number>): { sources: SourceGauge[]; below14: number; urgent: number; fuel_line: string } {
  const sources: SourceGauge[] = []
  for (const s of report.sources) {
    if (s.state === 'excluded') continue
    const perDay = Math.max(1, s.runs_per_day * s.tpr)
    const cyclic = !NON_INCREMENTAL_SOURCES.has(s.source_key)
    const immediate = cyclic ? null : Math.round((s.active / perDay) * 10) / 10
    let dueNow = 0
    let waiting = 0
    let next: string | null = null
    for (const t of targets) {
      if (t.source_key !== s.source_key || t.status !== 'exhausted') continue
      const last = t.last_run_at ? Date.parse(t.last_run_at) : NaN
      if (!Number.isFinite(last)) { waiting++; continue }
      const due = last + revisitDays(t, { all: true, scale, expCap })!.days * DAY_MS
      if (due <= now.getTime()) dueNow++
      else {
        waiting++
        const iso = new Date(due).toISOString()
        if (!next || iso < next) next = iso
      }
    }
    // 활성(+소비형은 지금 되살릴 수 있는 예약)이 0 이면 긴급, 결손(short)이면 경고, 아니면 정상.
    // 소비형 일수(immediate_days)는 참고값이다 — queue_full 이 active ≤ tpr 로 묶어 일수가 항상 작아, 문턱으로 쓰면 영구 긴급이 된다(독립 검토 1).
    const available = s.active + (cyclic ? 0 : dueNow)
    const level: GaugeLevel = available === 0 ? 'urgent' : s.state === 'short' ? 'warn' : 'ok'
    sources.push({ source_key: s.source_key, immediate_days: immediate, basis: cyclic ? 'cyclic' : 'consumed', active: s.active, reserved_due_now: dueNow, reserved_waiting: waiting, reserved_next_due: next, level })
  }
  const below14 = sources.filter((g) => g.level !== 'ok').length
  const urgent = sources.filter((g) => g.level === 'urgent').length
  // 남헌 v69 통합 답변 Q1=B: 재고 "일수"는 소비형(방문하면 닫히는 앱스토어·유튜브 류)에만 말이 된다 — (활성 + 지금 되살릴 수 있는 예약) ÷ 하루 방문 슬롯.
  // 순환형(게시판 등)은 타깃이 되풀이돼 일수가 정의되지 않으므로 평소엔 한 줄에 싣지 않고, 이상(활성 0 = 긴급·결손 = 경고)일 때만 곳 수와 소스명을 붙인다.
  const perDayOf = new Map(report.sources.map((s) => [s.source_key, Math.max(1, s.runs_per_day * s.tpr)]))
  const consumed = sources.filter((g) => g.basis === 'consumed')
  const days = (g: SourceGauge) => Math.round(((g.active + g.reserved_due_now) / (perDayOf.get(g.source_key) ?? 1)) * 10) / 10
  const cyclicBad = sources.filter((g) => g.basis === 'cyclic' && g.level !== 'ok')
  const consumedBelow = consumed.filter((g) => days(g) < GAUGE_WARN_DAYS).length
  const consumedPart = consumed.length ? consumed.map((g) => `${g.source_key} ${days(g)}일`).join(' · ') : '소비형 소스 없음'
  const cyclicPart = cyclicBad.length ? ` · 순환형 이상 ${cyclicBad.length}곳(${cyclicBad.slice(0, 5).map((g) => g.source_key).join(', ')}${cyclicBad.length > 5 ? ' 외' : ''})` : ''
  return { sources, below14, urgent, fuel_line: `수집 연료계: 소비형 ${consumedPart} (${GAUGE_WARN_DAYS}일 미만 ${consumedBelow}/${consumed.length}개)${cyclicPart} · SLO 0개를 3일 연속` }
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

// ── 영역 T2 커버리지 열(v37 작업 7 U3, 설계 v31 §3·§4) ─────────────────
// 입력 = 뷰 v_area_t2_coverage(마이그 20261009000040) 행. 못 읽으면(뷰 없음 PGRST205·권한·네트워크) rows=null → 열 전체 '확인 불가'(0 아님, §7.1).
// 상태는 포기·교체 기준 **제안값**(config/areas.json abandon, 남헌 확정 전)으로 계산하는 신호다. '미달'이어도 코드는 영역을 끄거나 바꾸지 않는다 —
// 대시보드에 '남헌 판단 항목'으로 올릴 뿐이다(영역을 끄는 길은 설정 값을 바꾸는 PR 하나, 사람 몫).
// 평가 시점(config cycle_started_at + cycles_before_eval × cycle_days) 전에는 (a)(b)(c) 미달을 '주의(평가 전)'로 낮춘다(피로 방지).
// 최소량을 채운 영역의 즉시 교체 예외(<10%)만 평가 전에도 '미달'이다.
// 판정 칸(judged·relevant·low_rated)은 purged 입력의 판정도 센다 — inputs(purged 제외)와 기준이 다르다(뷰 주석 '기준 차이').

export type AreaCoverageRow = {
  area_code: string
  projects: number
  inputs: number
  rated_inputs: number
  unrated_inputs: number
  unrated_input_pct: number | null
  judged: number
  relevant: number
  irrelevant: number
  unknown: number
  rated_judged: number
  low_rated_judged: number
  projects_100plus: number
  median_inputs: number | null
  pending_est: number
}
export type AreaHealthState = '정상' | '주의' | '미달' | '확인 불가' | '대상 아님'
export type AreaCoverage = {
  code: string
  name: string
  floor: number | null
  judged: number | null
  /** judged / floor (%). */
  coverage_pct: number | null
  /** 평점 ≤3 판정 / 평점 있는 판정 (%). 평점 있는 판정 0 이면 null. */
  low_rated_pct: number | null
  /** relevant / (relevant + irrelevant) (%). unknown 이 상한을 넘으면 null(확인 불가). */
  relevant_pct: number | null
  relevant_n: number | null
  unknown_pct: number | null
  /** 평점 없는 입력 비중(%). 입력 0 이면 null. */
  unrated_pct: number | null
  /** 판정 대기량 거친 추정(방향 불확정 — 실제보다 클 수도 작을 수도. 표본 천장 200 고정, RELEVANCE_SAMPLE 미추종. 뷰 주석). */
  pending: number | null
  projects: number | null
  projects_100plus: number | null
  median_inputs: number | null
  state: AreaHealthState
  reasons: string[]
  /** '미달' = 남헌 판단 항목. 코드는 아무것도 바꾸지 않는다. */
  needs_human: boolean
}
export type AreaCoverageReport = { read: 'ok' | 'unavailable'; error: string | null; criteria: string | null; areas: AreaCoverage[] }

const r1 = (n: number) => Math.round(n * 10) / 10
const num = (v: unknown): number => Number(v ?? 0) || 0

/** 뷰 한 행 → 숫자 열(순수). row 가 undefined = 뷰는 읽었는데 그 영역 프로젝트가 없다(0 — 확인 불가가 아니다). */
function areaNumbers(row: AreaCoverageRow | undefined, code: string, name: string, floor: number | null, maxUnknownPct: number): AreaCoverage {
  const judged = num(row?.judged)
  const relN = num(row?.relevant) + num(row?.irrelevant)
  const ratedJudged = num(row?.rated_judged)
  const inputs = num(row?.inputs)
  const unknownPct = judged > 0 ? r1((num(row?.unknown) / judged) * 100) : null
  const med = row?.median_inputs
  return {
    code, name, floor, judged,
    coverage_pct: floor ? r1((judged / floor) * 100) : null,
    low_rated_pct: ratedJudged > 0 ? r1((num(row?.low_rated_judged) / ratedJudged) * 100) : null,
    relevant_pct: relN > 0 && !(unknownPct !== null && unknownPct > maxUnknownPct) ? r1((num(row?.relevant) / relN) * 100) : null,
    relevant_n: relN,
    unknown_pct: unknownPct,
    unrated_pct: inputs > 0 ? r1(((inputs - num(row?.rated_inputs)) / inputs) * 100) : null,
    pending: num(row?.pending_est),
    projects: num(row?.projects),
    projects_100plus: num(row?.projects_100plus),
    median_inputs: med === null || med === undefined || !Number.isFinite(Number(med)) ? null : Number(med),
    state: '정상', reasons: [], needs_human: false,
  }
}

/** 영역 한 줄의 열·상태(순수). 설계 v31 §3.2 세 기준 + 즉시 교체 예외를 config 제안값으로 잰다. */
export function areaHealth(row: AreaCoverageRow | undefined, area: Pick<AreaDef, 'code' | 'name' | 'kind' | 'active'>, floor: number, ab: AbandonCriteria, now: Date): AreaCoverage {
  const base = areaNumbers(row, area.code, area.name, floor, ab.maxUnknownPct)
  if (area.kind !== 'area' || !area.active) return { ...base, state: '대상 아님' }

  const judged = base.judged as number
  const relN = base.relevant_n as number
  const short: string[] = []
  const immediate: string[] = []
  const unverified: string[] = []
  const watch: string[] = []
  if (judged < floor) watch.push(`최소량 미충족 ${judged}/${floor}`)
  if (judged === 0) watch.push('판정 0 — 관련 비율 아직 없음')
  else if ((base.unknown_pct as number) > ab.maxUnknownPct) unverified.push(`unknown ${base.unknown_pct}% > ${ab.maxUnknownPct}% — 관련 비율 확인 불가`)
  else if (relN < ab.relevantMinN) watch.push(`관련 비율 분모 ${relN} < ${ab.relevantMinN} — 아직 못 잰다`)
  else {
    const p = base.relevant_pct as number
    if (judged >= floor && p < ab.immediateSwapRelevantPct) immediate.push(`즉시 소스 교체 예외: 최소량 충족인데 관련 ${p}% < ${ab.immediateSwapRelevantPct}%`)
    else if (p < ab.grayBandPct[0]) short.push(`(b) 관련 ${p}% < ${ab.grayBandPct[0]}%`)
    else if (p < ab.grayBandPct[1]) watch.push(`(b) 관련 ${p}% 회색 띠 ${ab.grayBandPct[0]}~${ab.grayBandPct[1]}% — 한 사이클 더`)
  }
  if ((base.projects_100plus as number) < ab.minProjects) short.push(`(a) 입력 ${ab.projectInputMin}↑ 프로젝트 ${base.projects_100plus}/${ab.minProjects}`)
  if (base.median_inputs === null) unverified.push('(c) 프로젝트 없음 — 중앙값 없음')
  else if (base.median_inputs < ab.minMedianInputs) short.push(`(c) 입력 중앙값 ${base.median_inputs} < ${ab.minMedianInputs}`)

  // 평가 시점 전: (a)(b)(c) 미달은 '주의(평가 전)'로 낮춘다(피로 방지). 최소량을 채운 즉시 교체 예외만 그대로 '미달'.
  const evalAt = abandonEvalAt(ab)
  if (now.getTime() < evalAt.getTime() && short.length) {
    watch.unshift(...short.map((r) => `평가 전(${evalAt.toISOString().slice(0, 10)}부터 평가): ${r}`))
    short.length = 0
  }
  short.unshift(...immediate)
  const state: AreaHealthState = short.length ? '미달' : unverified.length ? '확인 불가' : watch.length ? '주의' : '정상'
  return { ...base, state, reasons: [...short, ...unverified, ...watch], needs_human: state === '미달' }
}

/**
 * 영역 커버리지 표(순수). 설정 순서대로 영역마다 한 줄 + 뷰에만 있는 코드('(미부여)' 등)는 뒤에 '대상 아님'으로.
 * rows=null(뷰 못 읽음) → 모든 열 null · state '확인 불가'. cfg=null(설정 못 읽음) → 뷰 숫자는 보이되 상태는 '확인 불가'.
 */
export function areaCoverage(input: { rows: AreaCoverageRow[] | null; error: string | null }, cfg: AreasConfig | null, now: Date = new Date()): AreaCoverageReport {
  if (input.rows === null) {
    const why = `영역 커버리지 뷰 확인 불가 — ${input.error ?? '사유 없음'}`
    const blank = (a: { code: string; name: string }): AreaCoverage => ({
      code: a.code, name: a.name, floor: cfg?.floor ?? null, judged: null, coverage_pct: null, low_rated_pct: null, relevant_pct: null, relevant_n: null,
      unknown_pct: null, unrated_pct: null, pending: null, projects: null, projects_100plus: null, median_inputs: null, state: '확인 불가', reasons: [why], needs_human: false,
    })
    return { read: 'unavailable', error: input.error, criteria: cfg?.abandon.status ?? null, areas: (cfg?.areas ?? [{ code: '*', name: '영역 전체' }]).map(blank) }
  }
  const byCode = new Map(input.rows.map((r) => [String(r.area_code), r]))
  if (!cfg) {
    const why = '영역 설정(config/areas.json) 확인 불가 — 최소량·기준 모름'
    return {
      read: 'ok', error: null, criteria: null,
      areas: [...byCode.keys()].sort().map((c) => ({ ...areaNumbers(byCode.get(c), c, c, null, 100), state: '확인 불가' as const, reasons: [why] })),
    }
  }
  const known = new Set(cfg.areas.map((a) => a.code))
  const extra = [...byCode.keys()].filter((c) => !known.has(c)).sort()
  return {
    read: 'ok', error: null, criteria: cfg.abandon.status,
    areas: [
      ...cfg.areas.map((a) => areaHealth(byCode.get(a.code), a, cfg.floor, cfg.abandon, now)),
      ...extra.map((c) => areaHealth(byCode.get(c), { code: c, name: c, kind: 'out', active: false }, cfg.floor, cfg.abandon, now)),
    ],
  }
}

/** 사람용 한 줄(job summary). 못 읽은 칸은 '확인 불가'로 찍는다 — 0 으로 찍지 않는다. */
export function areaCoverageLine(c: AreaCoverage): string {
  if (c.judged === null) {
    return `${c.name} · 판정 커버리지 확인 불가 · 저평점 판정 확인 불가 · 관련 확인 불가 · 평점 없는 입력 확인 불가 · 대기 확인 불가 · 상태 ${c.state}(${c.reasons.join('; ')})`
  }
  const rel = c.relevant_pct !== null ? `${c.relevant_pct}%(n=${c.relevant_n})` : c.judged === 0 ? '판정 없음' : `확인 불가(n=${c.relevant_n}, unknown ${c.unknown_pct}%)`
  return (
    `${c.name} · 판정 ${c.judged}/${c.floor ?? '확인 불가'}(${c.coverage_pct === null ? '확인 불가' : `${c.coverage_pct}%`})` +
    ` · 저평점 판정 ${c.low_rated_pct === null ? '평점 판정 없음' : `${c.low_rated_pct}%`} · 관련 ${rel}` +
    ` · 평점 없는 입력 ${c.unrated_pct === null ? '입력 없음' : `${c.unrated_pct}%`} · 대기(거친 추정) ~${c.pending}` +
    ` · 프로젝트 ${c.projects}(100↑ ${c.projects_100plus}, 중앙값 ${c.median_inputs ?? '-'})` +
    ` · 상태 ${c.state}${c.reasons.length ? `(${c.reasons.join('; ')})` : ''}${c.needs_human ? ' → 남헌 판단 항목(제안 기준 · 코드는 영역을 끄지 않는다)' : ''}`
  )
}
