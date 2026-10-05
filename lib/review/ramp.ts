// 수집 램프 — 손잡이 둘.
//   (1) 타깃 수 계단: 소스별 "1회 타깃 수" 10/15/22/30(level 0~3). 근거 reports/2026-09-28/cowork-four-orders.md §2-2, 마이그 20260930000034.
//       차단 응답이 나오면 직전 단계로 내리고 RAMP_FREEZE_DAYS(3일, 2026-10-05 남헌 v22) 동결한다.
//   (2) 퍼센트 램프(남헌 v24 #2 + v25, 2026-10-06): 소스별 하루 요청 수 = 상한(cap_base)의 50→60→70→80→90%.
//       설계 reports/2026-10-06/percent-ramp-table.md(권고안: 배분 B 동적 · 공급 부족 보류 · 러너 예산 min(cap, target) · cap_base 스냅샷).
//       마이그 20261006000002 가 칸을 만든다. cap_base IS NULL 이거나 칸이 없으면 (2)는 아무것도 하지 않는다 — 지금과 같다.
// 러너 배선: scripts/review-collect.mjs → stepPctRamps(실행 전 하루 판정) → 소스마다 collectWithRamp.
// 권한: CLAUDE.md §10.1 '수집 램프 단계 자동 기록'. 모든 변경은 review_source_ramp_log 를 **먼저** 쓰고, 로그가 실패하면 바꾸지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTableError } from '../agents/status.ts'
import { isMissingColumn } from '../analysis/facets.ts'
import { runCollection, type RunnerPorts, type RunResult } from './runner.ts'
import type { ReviewSourceAdapter } from './types.ts'

/** level 0~3 의 1회 타깃 수. 주 1회 약 +50%. level 0 = 기본값(램프 행 없음·확인 불가 폴백 10). */
export const RAMP_STEPS = [10, 15, 22, 30] as const

export const RAMP_MIGRATION = '20260930000034_review_source_ramp'
export const PCT_RAMP_MIGRATION = '20261006000002_review_source_ramp_pct'

/** 퍼센트 단계. 시작 50, 90 초과 금지(마이그 CHECK 와 같은 값). */
export const PCT_STEPS = [50, 60, 70, 80, 90] as const
/** 정상 며칠 연속이면 한 단계 올리나(v25: 2일 — 하루 정상은 1일차로만 센다). */
export const PCT_RISE_OK_DAYS = 2
/** 같은 단계에서 2회째 차단이면 동결 기간(남헌 승인 2026-10-06). 1회째는 RAMP_FREEZE_DAYS. */
export const PCT_ESCALATED_FREEZE_DAYS = 14
/** 차단선 재정의 계수 — cap_base := floor(block_line × 0.9), 내리는 쪽만(percent-ramp-table §6). */
export const BLOCK_LINE_FACTOR = 0.9
/** 배분 B 의 하루 시간 예산 = 슬롯 2 × timeout 90분(nightly-review-collect.yml). 슬롯·타임아웃이 바뀌면 여기만 고친다. */
export const DAILY_TIME_BUDGET_SEC = 2 * 90 * 60

type Sb = Pick<SupabaseClient, 'from'>

/** 퍼센트 램프 상태. null = 칸 없음(마이그 미적용) 또는 cap_base 미입력 — 둘 다 퍼센트 램프 미가동. */
export type PctRamp = {
  pctStep: number
  capBase: number
  dailyRequestTarget: number | null
  consecutiveOkDays: number
  lastEvaluatedDate: string | null
  blockLine: number | null
  blocksAtStep: number
  supplyState: SupplyState | null
}
export type SupplyState = 'met' | 'short' | 'none'

export type SourceRamp = {
  sourceKey: string
  level: number
  targetsPerRun: number
  frozenUntil: string | null
  changedAt: string
  reason: string
  /** 퍼센트 칸을 읽었나(false = 마이그 000002 미적용 → 옛 칸만 읽은 폴백). */
  pctReady: boolean
  pct: PctRamp | null
}

const BASE_COLS = 'source_key, level, targets_per_run, frozen_until, changed_at, reason'
const PCT_COLS = 'pct_step, cap_base, daily_request_target, consecutive_ok_days, last_evaluated_date, block_line, blocks_at_step, supply_state'

type RampRow = {
  source_key: string; level: number; targets_per_run: number; frozen_until: string | null; changed_at: string; reason: string
  pct_step?: number; cap_base?: number | null; daily_request_target?: number | null; consecutive_ok_days?: number
  last_evaluated_date?: string | null; block_line?: number | null; blocks_at_step?: number; supply_state?: SupplyState | null
}

function toRamp(data: RampRow, pctReady: boolean): SourceRamp {
  return {
    sourceKey: data.source_key,
    level: data.level,
    targetsPerRun: data.targets_per_run,
    frozenUntil: data.frozen_until,
    changedAt: data.changed_at,
    reason: data.reason,
    pctReady,
    pct:
      pctReady && typeof data.cap_base === 'number' && data.cap_base > 0
        ? {
            pctStep: data.pct_step ?? PCT_STEPS[0],
            capBase: data.cap_base,
            dailyRequestTarget: data.daily_request_target ?? null,
            consecutiveOkDays: data.consecutive_ok_days ?? 0,
            lastEvaluatedDate: data.last_evaluated_date ?? null,
            blockLine: data.block_line ?? null,
            blocksAtStep: data.blocks_at_step ?? 0,
            supplyState: data.supply_state ?? null,
          }
        : null,
  }
}

/**
 * 3상태: ramp(행 있음) / none(행 없음 = 램프 미적용, 기본 타깃 수) / unavailable(테이블 없음·조회 실패).
 * unavailable 을 none 으로 접지 마라 — 되돌리기로 내려둔 단계를 못 읽고 기본값으로 돌면 동결이 풀린다(§7.1).
 * 퍼센트 칸이 없으면(42703/PGRST204) 옛 칸만 다시 읽는다(pctReady=false) — 타깃 수 계단은 지금처럼 돈다.
 */
export async function loadSourceRamp(
  sb: Sb,
  sourceKey: string,
): Promise<{ state: 'ramp'; ramp: SourceRamp } | { state: 'none' } | { state: 'unavailable'; reason: string }> {
  let pctReady = true
  let { data, error } = await sb.from('review_source_ramp').select(`${BASE_COLS}, ${PCT_COLS}`).eq('source_key', sourceKey).maybeSingle()
  if (error && isMissingColumn(error.code)) {
    pctReady = false
    ;({ data, error } = await sb.from('review_source_ramp').select(BASE_COLS).eq('source_key', sourceKey).maybeSingle())
  }
  if (error) {
    return {
      state: 'unavailable',
      reason: isMissingTableError(error.code, error.message) ? `테이블 없음 — 마이그 ${RAMP_MIGRATION} 미적용` : `조회 실패 — ${error.message}`,
    }
  }
  if (!data) return { state: 'none' }
  return { state: 'ramp', ramp: toRamp(data, pctReady) }
}

/** 램프 대상이 아닌 소스(§10.1): 차단 이력(todayhumor) · 남헌이 속도를 정해 둔 소스(danawa, 09-27 최소화). 기본 타깃 수로만 돈다. */
export const RAMP_EXCLUDED: ReadonlySet<string> = new Set(['danawa', 'todayhumor'])
/** 되돌리기 뒤 동결 기간. cowork-four-orders §2-2 의 14일을 2026-10-05 남헌 v22 로 3일로 줄였다(정책 문서는 그대로). */
export const RAMP_FREEZE_DAYS = 3

type Loaded = Awaited<ReturnType<typeof loadSourceRamp>>

/**
 * 이번 실행의 1회 타깃 수. 수동 --targets 가 있으면 그것, 없으면 램프 행의 targets_per_run.
 * 행 없음·제외 소스·확인 불가는 RAMP_STEPS[0](=10). 확인 불가는 note 에 ⚠️ 로 드러낸다(§7.1 — 정상으로 접지 않는다).
 */
export function resolveTargetLimit(sourceKey: string, loaded: Loaded, explicit: number | null): { limit: number; note: string } {
  const dflt = RAMP_STEPS[0]
  if (explicit !== null) return { limit: explicit, note: `1회 타깃 ${explicit}개 — --targets 수동 지정(램프 무시)` }
  if (RAMP_EXCLUDED.has(sourceKey)) return { limit: dflt, note: `1회 타깃 ${dflt}개 — 램프 제외 소스(§10.1)` }
  if (loaded.state === 'unavailable') return { limit: dflt, note: `⚠️ 램프 확인 불가(${loaded.reason}) — 기본 ${dflt}개로 폴백` }
  if (loaded.state === 'none') return { limit: dflt, note: `1회 타깃 ${dflt}개 — 램프 행 없음(기본)` }
  const r = loaded.ramp
  return { limit: r.targetsPerRun, note: `1회 타깃 ${r.targetsPerRun}개 — 램프 level ${r.level}${r.frozenUntil ? ` (동결 ~${r.frozenUntil})` : ''}` }
}

// ── 퍼센트 램프: 순수 함수 ─────────────────────────────────────────

/** 목표 요청 수 = floor(min(cap_base, 배분 몫) × pct / 100). 몫 null = 배분 없음. */
export function pctTarget(capBase: number, pct: number, share: number | null = null): number {
  return Math.floor((Math.min(capBase, share ?? capBase) * pct) / 100)
}

/** 퍼센트 램프가 이 소스에서 도는가 — 제외 소스·행 없음·칸 없음·cap_base 미입력이면 null(지금과 같은 동작). */
export function activePct(sourceKey: string, loaded: Loaded): PctRamp | null {
  if (RAMP_EXCLUDED.has(sourceKey) || loaded.state !== 'ramp') return null
  return loaded.ramp.pct
}

/** 러너가 쓸 오늘 목표. 판정 전(target NULL)이면 현재 단계로 계산한다. */
export function effectiveTarget(p: PctRamp): number {
  return p.dailyRequestTarget ?? pctTarget(p.capBase, p.pctStep)
}

/** 요약 줄(남헌 v25): 소스별 현재 단계 / 연속 정상 일수 / 오늘 목표 / 상한 [/ 공급] [· 안정]. */
export function pctSummary(p: PctRamp): string {
  const supply = p.supplyState ? ` · 공급 ${({ met: '충족', short: '부족', none: '측정 없음' } as const)[p.supplyState]}` : ''
  return `퍼센트 ${p.pctStep}% · 연속정상 ${p.consecutiveOkDays}일 · 오늘목표 ${effectiveTarget(p)} / 상한 ${p.capBase}${supply}${p.pctStep >= 90 ? ' · 안정' : ''}`
}

export type DayRow = {
  status: string | null
  requests: number | null
  blocked_responses: number | null
  quota_responses: number | null
  health_after: string | null
}

/**
 * 하루(UTC) 판정. 우선순위대로 하나만 고른다.
 *   blocked — 차단 신호(blocked_responses ≥ 1). 연속 정상 0(하강·동결은 실행 직후 pctOnBlock 이 이미 했다).
 *   none    — 그날 행이 없다(미발화·타임아웃으로 미실행) = 측정 없음, 보류.
 *   quota   — 공식 API 쿼터 소진. 차단이 아니지만 정상도 아니다 — 보류(percent-ramp-table §7 위험 5).
 *   error   — failed·interrupted·running(마감 안 됨)·health broken. 정상이 아니다 — 보류(리셋은 차단만, 같은 문서 §5).
 *   frozen  — 동결 기간이 그날에 걸쳐 있다 — 보류(동결 = 올리지 않는다).
 *   alloc   — 그날 목표가 배분(B)으로 깎였다 — 실측이 아니라 보류(§3).
 *   short   — 정상인데 요청이 직전 단계 목표 미만(공급 부족) — 보류(권고 B: 넣지도 리셋하지도 않는다).
 *   ok      — 정상 1일.
 */
export type DayVerdict = 'blocked' | 'none' | 'quota' | 'error' | 'frozen' | 'alloc' | 'short' | 'ok'

export function judgePctDay(args: {
  rows: DayRow[]
  /** 그날 적용된 목표(어제 저장된 daily_request_target, 없으면 그 단계 계산값). */
  dayTarget: number
  pct: number
  frozen: boolean
  allocLimited: boolean
}): { verdict: DayVerdict; requests: number; supply: SupplyState } {
  const { rows, dayTarget, pct } = args
  const requests = rows.reduce((s, r) => s + (r.requests ?? 0), 0)
  // 직전 단계 목표 = 이번 목표 × (pct−10)/pct (= 상한 × 10%p 아래). 50% 단계면 40%.
  const shortLine = Math.floor((dayTarget * (pct - 10)) / pct)
  const supply: SupplyState = rows.length === 0 ? 'none' : requests < shortLine ? 'short' : 'met'
  const v = (verdict: DayVerdict) => ({ verdict, requests, supply })
  if (rows.some((r) => (r.blocked_responses ?? 0) > 0)) return v('blocked')
  if (rows.length === 0) return v('none')
  if (rows.some((r) => (r.quota_responses ?? 0) > 0)) return v('quota')
  if (rows.some((r) => r.status !== 'ok' || r.health_after === 'broken')) return v('error')
  if (args.frozen) return v('frozen')
  if (args.allocLimited) return v('alloc')
  if (supply === 'short') return v('short')
  return v('ok')
}

/** 하루 판정 → 다음 상태. 정상 2일 연속이면 한 단계(90 에서 유지), 차단이면 연속 0, 나머지는 그대로. */
export function nextPctState(p: Pick<PctRamp, 'pctStep' | 'consecutiveOkDays'>, verdict: DayVerdict): { pctStep: number; consecutiveOkDays: number; rose: boolean } {
  if (verdict === 'blocked') return { pctStep: p.pctStep, consecutiveOkDays: 0, rose: false }
  if (verdict !== 'ok') return { pctStep: p.pctStep, consecutiveOkDays: p.consecutiveOkDays, rose: false }
  const days = p.consecutiveOkDays + 1
  if (days >= PCT_RISE_OK_DAYS && p.pctStep < PCT_STEPS[PCT_STEPS.length - 1]) return { pctStep: p.pctStep + 10, consecutiveOkDays: 0, rose: true }
  return { pctStep: p.pctStep, consecutiveOkDays: days, rose: false }
}

/**
 * 차단 → 즉시 한 단계 하강(50 이 바닥) + 연속 정상 0 + 동결(같은 단계 2회째면 14일).
 * priorBlocksAtStep = 이 단계에서 전에 난 차단 수(로그 집계). null = 못 셌다 → 2회째로 본다(더 긴 동결 쪽, §7.1).
 * 차단선 = 그날 요청 합. cap_base 는 floor(차단선 × 0.9) 로 **내리기만** 한다(1 미만이면 그대로 — 사람 몫).
 */
export function pctOnBlock(p: Pick<PctRamp, 'pctStep' | 'capBase'>, priorBlocksAtStep: number | null, requestsTodayTotal: number) {
  const blocksAtStep = (priorBlocksAtStep ?? 1) + 1
  const lowered = Math.floor(requestsTodayTotal * BLOCK_LINE_FACTOR)
  return {
    pctStep: Math.max(PCT_STEPS[0], p.pctStep - 10),
    consecutiveOkDays: 0,
    blocksAtStep,
    escalated: blocksAtStep >= 2,
    freezeDays: blocksAtStep >= 2 ? PCT_ESCALATED_FREEZE_DAYS : RAMP_FREEZE_DAYS,
    blockLine: requestsTodayTotal,
    capBase: lowered >= 1 && lowered < p.capBase ? lowered : p.capBase,
  }
}

/**
 * 배분 B(동적): active 타깃이 있는 소스만 분모. 합(요청 × 간격)이 예산 안이면 아무도 안 깎는다.
 * 넘으면 water-fill — 몫보다 작은 소스는 제값, 남는 시간을 나머지에 균등. 깎인 소스만 요청 수 몫을 돌려준다.
 */
export function allocateShares(items: Array<{ key: string; requests: number; intervalMs: number }>, budgetSec = DAILY_TIME_BUDGET_SEC): Map<string, number> {
  const cut = new Map<string, number>()
  const sorted = items.map((i) => ({ ...i, sec: (i.requests * i.intervalMs) / 1000 })).sort((a, b) => a.sec - b.sec)
  let left = budgetSec
  for (let i = 0; i < sorted.length; i++) {
    const share = left / (sorted.length - i)
    if (sorted[i].sec <= share) {
      left -= sorted[i].sec
      continue
    }
    for (const s of sorted.slice(i)) cut.set(s.key, Math.floor((share * 1000) / Math.max(1, s.intervalMs)))
    break
  }
  return cut
}

const DAY_MS = 86_400_000
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const isoDate = (d: Date) => d.toISOString().slice(0, 10)

// ── 퍼센트 램프: 집행 ──────────────────────────────────────────────

/**
 * 실행 전 하루 판정(review-collect.mjs 맨 앞). 어제(UTC)가 아직 판정 안 된 퍼센트 램프 행만 — 그날 첫 슬롯이 하고
 * 둘째 슬롯은 last_evaluated_date 잠금으로 건너뛴다. 소스마다 로그 먼저 → 실패하면 그 소스 상태를 안 바꾼다.
 * 행 없음 = 빈 배열(출력도 없음 — 지금과 같다). 칸 없음·조회 실패는 ⚠️ 한 줄로 드러내고 판정하지 않는다.
 */
export async function stepPctRamps(sb: Sb, now: Date, dryRun: boolean): Promise<string[]> {
  const notes: string[] = []
  const { data, error } = await sb.from('review_source_ramp').select(`${BASE_COLS}, ${PCT_COLS}`).not('cap_base', 'is', null)
  if (error) {
    if (isMissingColumn(error.code)) return [`⚠️ 퍼센트 램프 칸 없음 — 마이그 ${PCT_RAMP_MIGRATION} 미적용, 승강 판정 생략`]
    if (isMissingTableError(error.code, error.message)) return []
    return [`⚠️ 퍼센트 램프 조회 실패(${error.message}) — 승강 판정 생략`]
  }
  const today = utcDay(now)
  const yStart = new Date(today.getTime() - DAY_MS)
  const yDate = isoDate(yStart)
  const ramps = (data ?? [])
    .map((d) => toRamp(d, true))
    .filter((r) => r.pct && !RAMP_EXCLUDED.has(r.sourceKey) && (r.pct.lastEvaluatedDate === null || r.pct.lastEvaluatedDate < yDate))
  if (ramps.length === 0) return notes

  // 배분 B 재료 — 켜진 소스의 간격·상한과 active 타깃 수. 못 읽으면 배분 없이(몫 null) 가고 ⚠️.
  let shares = new Map<string, number>()
  try {
    const src = await sb.from('review_sources').select('key, min_interval_ms, daily_request_cap').eq('enabled', true)
    if (src.error) throw new Error(src.error.message)
    const capBaseOf = new Map((data ?? []).map((d) => [d.source_key as string, d.cap_base as number]))
    const items: Array<{ key: string; requests: number; intervalMs: number }> = []
    for (const s of src.data ?? []) {
      const c = await sb.from('review_targets').select('id', { count: 'exact', head: true }).eq('source_key', s.key).eq('status', 'active')
      if (c.error) throw new Error(c.error.message)
      if ((c.count ?? 0) > 0) items.push({ key: s.key, requests: capBaseOf.get(s.key) ?? s.daily_request_cap, intervalMs: s.min_interval_ms })
    }
    shares = allocateShares(items)
  } catch (e) {
    notes.push(`⚠️ 퍼센트 램프 배분 재료 조회 실패(${e instanceof Error ? e.message : String(e)}) — 오늘은 배분 없이 목표 계산`)
  }

  for (const r of ramps) {
    const p = r.pct as PctRamp
    const share = shares.get(r.sourceKey) ?? null
    let next: { pctStep: number; consecutiveOkDays: number; rose: boolean }
    let event: 'start' | 'day' | 'rise'
    let reason: string
    let supply: SupplyState | null = p.supplyState
    if (p.lastEvaluatedDate === null) {
      // 첫 판정 = 시작. 램프 밖에서 돈 날(시작일 포함)은 세지 않는다 — last_evaluated_date 를 오늘(UTC)로 써 오늘은 건너뛰고 내일부터 센다.
      next = { pctStep: p.pctStep, consecutiveOkDays: 0, rose: false }
      event = 'start'
      reason = `퍼센트 램프 시작 ${p.pctStep}% (상한 ${p.capBase})`
    } else {
      const runs = await sb
        .from('review_collection_runs')
        .select('status, requests, blocked_responses, quota_responses, health_after')
        .eq('source_key', r.sourceKey)
        .eq('dry_run', false)
        .gte('started_at', yStart.toISOString())
        .lt('started_at', today.toISOString())
      if (runs.error) {
        notes.push(`⚠️ ${r.sourceKey}: 어제 실행 조회 실패(${runs.error.message}) — 판정 보류(다음 슬롯에 다시)`)
        continue
      }
      const unallocated = pctTarget(p.capBase, p.pctStep)
      const dayTarget = p.dailyRequestTarget ?? unallocated
      const j = judgePctDay({
        rows: (runs.data ?? []) as DayRow[],
        dayTarget,
        pct: p.pctStep,
        frozen: r.frozenUntil !== null && Date.parse(r.frozenUntil) > yStart.getTime(),
        allocLimited: dayTarget < unallocated,
      })
      supply = j.supply
      next = nextPctState(p, j.verdict)
      event = next.rose ? 'rise' : 'day'
      reason = `${yDate} ${j.verdict} (요청 ${j.requests}/목표 ${dayTarget}) — ${next.rose ? `정상 ${PCT_RISE_OK_DAYS}일 연속, ${p.pctStep}%→${next.pctStep}%` : `${next.pctStep}% 유지, 연속정상 ${next.consecutiveOkDays}일`}`
    }
    const target = pctTarget(p.capBase, next.pctStep, share)
    const line = `${r.sourceKey}: ${reason} · 오늘목표 ${target}${share !== null ? `(배분 몫 ${share})` : ''} / 상한 ${p.capBase}${next.pctStep >= 90 ? ' · 안정' : ''}`
    if (dryRun) {
      notes.push(`dry-run — ${line}`)
      continue
    }
    const log = await sb.from('review_source_ramp_log').insert({
      source_key: r.sourceKey, prev_level: r.level, new_level: r.level, prev_pct: p.pctStep, new_pct: next.pctStep, event, reason, applied_by: 'review-collect',
    })
    if (log.error) {
      notes.push(`❌ ${r.sourceKey}: 퍼센트 램프 판정 보류 — 로그 기록 실패(${log.error.message}), 상태 그대로`)
      continue
    }
    const upd = await sb
      .from('review_source_ramp')
      .update({
        pct_step: next.pctStep,
        consecutive_ok_days: next.consecutiveOkDays,
        last_evaluated_date: event === 'start' ? isoDate(now) : yDate, // 시작일은 오늘(UTC): 오늘 일부는 램프 밖에서 돌았을 수 있어 세지 않는다(독립 검토 2026-10-06)
        daily_request_target: target,
        supply_state: supply,
        ...(next.rose ? { blocks_at_step: 0, changed_at: now.toISOString(), reason } : {}),
      })
      .eq('source_key', r.sourceKey)
    notes.push(upd.error ? `❌ ${r.sourceKey}: 로그는 남았고 상태 갱신 실패(${upd.error.message})` : line)
  }
  return notes
}

/**
 * 안전 되돌리기: 차단 응답 ≥1 이면 직전 단계로 내리고 동결. 로그 행을 **먼저** 쓰고, 로그가 실패하면
 * 단계를 바꾸지 않는다(§10.1 — 로그 없이 바꾸지 않는다). 대상이 아니면 null.
 * 퍼센트 램프가 돌면 같은 로그 1행·갱신 1회로 타깃 수 계단과 퍼센트 단계를 함께 내린다(pctOnBlock). 아니면 옛 경로 그대로.
 */
export async function rollbackOnBlock(
  sb: Sb,
  sourceKey: string,
  loaded: Loaded,
  blockedResponses: number,
  now: Date,
  dryRun: boolean,
  requestsTodayTotal = 0,
): Promise<string | null> {
  if (blockedResponses <= 0 || loaded.state !== 'ramp' || RAMP_EXCLUDED.has(sourceKey)) return null
  const { level } = loaded.ramp
  const p = loaded.ramp.pct
  if (p) return pctRollback(sb, sourceKey, loaded.ramp, p, blockedResponses, now, dryRun, requestsTodayTotal)
  if (level <= 0) return `램프 level 0 — 차단 ${blockedResponses}건이지만 더 내릴 단계가 없다`
  const next = level - 1
  const reason = `차단 응답 ${blockedResponses}건 — 안전 되돌리기 level ${level}→${next}, ${RAMP_FREEZE_DAYS}일 동결`
  if (dryRun) return `dry-run — 실수집이면: ${reason}`
  const log = await sb.from('review_source_ramp_log').insert({
    source_key: sourceKey, prev_level: level, new_level: next, reason, applied_by: 'review-collect',
  })
  if (log.error) return `❌ 램프 되돌리기 보류 — 로그 기록 실패(${log.error.message}), 단계는 그대로 level ${level}`
  const upd = await sb
    .from('review_source_ramp')
    .update({
      level: next,
      targets_per_run: RAMP_STEPS[next],
      frozen_until: new Date(now.getTime() + RAMP_FREEZE_DAYS * DAY_MS).toISOString(),
      changed_at: now.toISOString(),
      reason,
    })
    .eq('source_key', sourceKey)
  if (upd.error) return `❌ 램프 되돌리기 실패 — 로그는 남았고 단계 갱신 실패(${upd.error.message})`
  return reason
}

async function pctRollback(
  sb: Sb, sourceKey: string, ramp: SourceRamp, p: PctRamp, blocked: number, now: Date, dryRun: boolean, requestsTodayTotal: number,
): Promise<string> {
  const prior = await sb
    .from('review_source_ramp_log')
    .select('id', { count: 'exact', head: true })
    .eq('source_key', sourceKey)
    .eq('event', 'block')
    .eq('prev_pct', p.pctStep)
  const priorCount = prior.error ? null : (prior.count ?? 0)
  const b = pctOnBlock(p, priorCount, requestsTodayTotal)
  const nextLevel = ramp.level > 0 ? ramp.level - 1 : 0
  const reason =
    `차단 응답 ${blocked}건 — 퍼센트 ${p.pctStep}%→${b.pctStep}%, 연속정상 0, ${b.freezeDays}일 동결` +
    (b.escalated ? ` (같은 단계 ${b.blocksAtStep}회째 차단${priorCount === null ? ' — 이전 차단 수 확인 불가라 2회째로 봄' : ''})` : '') +
    (nextLevel !== ramp.level ? `, level ${ramp.level}→${nextLevel}` : '') +
    ` · 차단선 ${b.blockLine}${b.capBase !== p.capBase ? `, 상한 ${p.capBase}→${b.capBase}` : ''}`
  if (dryRun) return `dry-run — 실수집이면: ${reason}`
  const log = await sb.from('review_source_ramp_log').insert({
    source_key: sourceKey, prev_level: ramp.level, new_level: nextLevel, prev_pct: p.pctStep, new_pct: b.pctStep, event: 'block', reason, applied_by: 'review-collect',
  })
  if (log.error) return `❌ 램프 되돌리기 보류 — 로그 기록 실패(${log.error.message}), 단계는 그대로 ${p.pctStep}% · level ${ramp.level}`
  const upd = await sb
    .from('review_source_ramp')
    .update({
      ...(nextLevel !== ramp.level ? { level: nextLevel, targets_per_run: RAMP_STEPS[nextLevel] } : {}),
      frozen_until: new Date(now.getTime() + b.freezeDays * DAY_MS).toISOString(),
      changed_at: now.toISOString(),
      reason,
      pct_step: b.pctStep,
      consecutive_ok_days: 0,
      blocks_at_step: b.blocksAtStep,
      block_line: b.blockLine,
      block_line_at: now.toISOString(),
      cap_base: b.capBase,
      daily_request_target: pctTarget(b.capBase, b.pctStep),
    })
    .eq('source_key', sourceKey)
  if (upd.error) return `❌ 램프 되돌리기 실패 — 로그는 남았고 단계 갱신 실패(${upd.error.message})`
  return reason
}

/**
 * review-collect.mjs 의 소스 1개 실행 = 램프 읽기 → 러너(예산 min(cap, 퍼센트 목표)) → 차단이면 되돌리기.
 * 셀프테스트가 이 경계를 그대로 탄다. 러너 예외는 fatal 로 돌려준다(기존 try/catch 와 같다).
 */
export async function collectWithRamp(args: {
  sb: Sb
  adapter: ReviewSourceAdapter
  dryRun: boolean
  explicitTargets: number | null
  ports: RunnerPorts
}): Promise<{ result: RunResult | null; fatal: string | null; targetLimit: number; notes: string[] }> {
  const { sb, adapter, dryRun, explicitTargets, ports } = args
  let loaded: Loaded
  try {
    loaded = await loadSourceRamp(sb, adapter.key)
  } catch (e) {
    loaded = { state: 'unavailable', reason: `조회 예외 — ${e instanceof Error ? e.message : String(e)}` }
  }
  const { limit, note } = resolveTargetLimit(adapter.key, loaded, explicitTargets)
  const notes = [note]
  const pct = activePct(adapter.key, loaded)
  if (pct) notes.push(pctSummary(pct))
  let result: RunResult | null = null
  let fatal: string | null = null
  try {
    result = await runCollection(adapter, { dryRun, targetLimit: limit, dailyRequestTarget: pct ? effectiveTarget(pct) : null }, ports)
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e)
  }
  const rb = await rollbackOnBlock(
    sb, adapter.key, loaded, result?.stats.blockedResponses ?? 0, ports.now(), dryRun,
    (result?.requestsTodayBefore ?? 0) + (result?.requests ?? 0),
  )
  if (rb) notes.push(rb)
  return { result, fatal, targetLimit: limit, notes }
}
