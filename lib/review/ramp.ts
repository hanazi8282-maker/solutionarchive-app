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
/**
 * 배분 B 의 하루 시간 예산 = 기존 슬롯 2 × timeout 90분(nightly-review-collect.yml). 슬롯·타임아웃이 바뀌면 여기만 고친다.
 * v30 §2 로 슬롯이 6개가 됐지만 이 값은 그대로 둔다 — 추가 4슬롯은 퍼센트 램프 계획이 있는 소스만 돌고, 남헌이 승인한
 * 배분 B 를 넓히는 것은 별개 결정이다(PR 본문 결정거리). 회당 시간 제한은 아래 RUN_TIME_SEC.
 */
export const DAILY_TIME_BUDGET_SEC = 2 * 90 * 60

// ── 수집 스케줄러(남헌 v30 §2) ─────────────────────────────────────
// 하루 예산 B(퍼센트 목표) → 회당 처리 가능량 P = min(시간 몫, P_safe, 활성 타깃 × 타깃당 평균 요청) → R = ceil(B/P) ≤ 6.
// 계획은 stepPctRamps 가 하루 1번 review_source_ramp.schedule_plan(마이그 20261007000030)에 쓰고, 실행마다 collectWithRamp 가 읽는다.
// cap_base 없음·계획 없음·칸 없음이면 아무것도 바뀌지 않는다(기존 2슬롯·기존 예산).

/** 하루 최대 run 수(v30 §2). */
export const MAX_RUNS_PER_DAY = 6
/** 회당 시간 제한 = nightly-review-collect.yml collect 잡 `timeout-minutes: 90`. 스크립트엔 실행 전체 상한이 없다(요청당 20초뿐). */
export const RUN_TIME_SEC = 90 * 60
/**
 * 수집 크론 슬롯(UTC, 시각 순, 인덱스 = 슬롯 번호). 워크플로 cron 줄과 1:1 — scripts/review-collect-scheduler-selftest.mjs 가 대조.
 * 기존 2개(37 5 · 37 17)는 그대로 두고 그 사이에 4개를 끼웠다. 분은 서로 다르게(정각·30분 피함, 같은 시각 집중 금지).
 * 마지막 슬롯을 20:47 로 둔 것은 1~3시간 지연(실측)이 나도 UTC 자정을 넘지 않게 — 넘으면 다음 날 예산을 먼저 쓴다.
 */
export const COLLECT_SLOTS = ['43 1 * * *', '37 5 * * *', '29 9 * * *', '19 13 * * *', '37 17 * * *', '47 20 * * *'] as const
/** 기존 슬롯 — 모든 소스가 지금처럼 돈다. 나머지(추가 슬롯)는 계획이 있는 소스만. */
export const LEGACY_SLOTS: ReadonlySet<string> = new Set(['37 5 * * *', '37 17 * * *'])
/**
 * P_safe — 회당 안전 요청 수(소스별). 산정 규칙(2026-10-07 [Fable] 분석, 리포 미수록):
 *   min(시간 몫, 공식 한도 ÷ 6, 2 × 14일 회당 최대 요청(차단·쿼터 0 기간)). 실측이 구조값보다 작으면 구조값(10타깃 × 페이지 상한) 잠정.
 * 회당 최대 실측은 2026-10-07 review_collection_runs 14일 스냅샷. 바뀌면 이 맵의 값만 고친다.
 * 맵에 없는 소스(kakao_blog·kakao_cafe 실측 0, producthunt 비활성 예정, danawa 램프 제외)는 기본값.
 * ponytail: 기본값 10 = 가장 작은 구조값(10타깃 × 1요청) — 확인 불가를 넉넉한 값으로 접지 않는다(§7.1). 첫 수집 뒤 값을 넣는다.
 */
export const P_SAFE: Readonly<Record<string, number>> = {
  appstore: 100, // 구조값 10타깃 × 페이지 상한 10(실측 회당 최대 32)
  hackernews: 324, // 2 × 실측 162
  googleplay: 20, // 10타깃 × maxPagesPerRun 2(실측 10)
  youtube: 200, // 구조값 10타깃 × 20페이지(실측 1) · 공식 쿼터 10,000 units/일
  devto: 40, // 2 × 실측 20
  indiehackers: 40, // 2 × 실측 20
  disquiet: 40, // 2 × 실측 20
  tumblbug: 200, // 구조값(실측 1)
  yozm: 20, // 구조값 목록 1 + 글 ≤19(실측 0) · robots Crawl-delay 5
  '82cook': 94, // 2 × 실측 47
  bobaedream: 86, // 2 × 실측 43
  clien: 96, // 2 × 실측 48
  velog: 114, // 2 × 실측 57
  okky: 40, // 2 × 실측 20
  damoang: 10, // 구조값 10타깃 × 1(실측 3)
  fmkorea: 10, // 구조값(실측 5)
  theqoo: 10, // 구조값(실측 4)
  brunch: 14, // 2 × 실측 7 · robots Crawl-delay 5
}
export const P_SAFE_DEFAULT = 10
export const pSafeOf = (sourceKey: string): number => P_SAFE[sourceKey] ?? P_SAFE_DEFAULT

/** B 가 R=6 으로도 안 채워질 때 묶인 항. 'targets' = 타깃 부족 — 공급 자동화(v30 §3)가 읽는 신호. */
export type Bottleneck = 'targets' | 'time' | 'safe'
export type SchedulePlan = {
  /** 계획을 세운 UTC 날. */
  date: string
  budget: number
  runsPerDay: number
  /** 회당 몫 = ceil(B / R). */
  perRun: number
  /** 회당 하드 상한 = min(시간 몫, P_safe). 러너가 이걸 넘겨 보내지 않는다. */
  perRunCap: number
  /** 1회 타깃 수(자동 산정). null = 타깃당 평균 요청 측정 없음 → 계단(targets_per_run) 그대로. */
  targetsPerRun: number | null
  bottleneck: Bottleneck | null
  terms: { time: number; safe: number; targets: number | null; activeTargets: number; avgReqPerTarget: number | null }
}

/** 순수 계산. 타깃당 평균 요청이 없으면(측정 없음) 타깃 항을 빼고 계산한다 — 0 으로 접지 않는다(§7.1). */
export function planSchedule(a: {
  budget: number
  timeCap: number
  safeCap: number
  activeTargets: number
  avgReqPerTarget: number | null
}): Omit<SchedulePlan, 'date'> {
  const targets = a.activeTargets === 0 ? 0 : a.avgReqPerTarget === null ? null : Math.floor(a.activeTargets * a.avgReqPerTarget)
  // 1 이상: water-fill floor 로 0 이 나와도 기존 슬롯에서 소스가 완전히 멈추지 않게(독립 검토 b).
  const perRunCap = Math.max(1, Math.min(a.timeCap, a.safeCap))
  const p = targets === null ? perRunCap : Math.min(perRunCap, targets)
  const need = a.budget <= 0 ? 1 : p <= 0 ? Infinity : Math.ceil(a.budget / p)
  const runsPerDay = p <= 0 ? 1 : Math.min(MAX_RUNS_PER_DAY, Math.max(1, need))
  const bottleneck: Bottleneck | null =
    need <= MAX_RUNS_PER_DAY ? null : targets !== null && targets <= perRunCap ? 'targets' : a.timeCap <= a.safeCap ? 'time' : 'safe'
  const perRun = Math.ceil(Math.max(0, a.budget) / runsPerDay)
  const targetsPerRun =
    a.activeTargets > 0 && a.avgReqPerTarget !== null && a.avgReqPerTarget > 0
      ? Math.min(a.activeTargets, Math.max(1, Math.ceil(Math.min(perRun, perRunCap) / a.avgReqPerTarget)))
      : null
  return {
    budget: a.budget, runsPerDay, perRun, perRunCap, targetsPerRun, bottleneck,
    terms: { time: a.timeCap, safe: a.safeCap, targets, activeTargets: a.activeTargets, avgReqPerTarget: a.avgReqPerTarget },
  }
}

const isInt = (v: unknown, min: number, max = Infinity): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/**
 * DB 에서 읽은 계획(jsonb)을 믿을 수 있을 때만 돌려준다 — 아니면 null(= 기존 예산·기존 2슬롯).
 * 모양이 깨졌거나(runsPerDay NaN → 모든 추가 슬롯에서 돌고 daily_request_cap 까지 소비) 회당 상한이 0 이거나(소스 정지)
 * 오늘(UTC) 계획이 아니면(stepPctRamps 가 그 소스를 건너뛴 날) 쓰지 않는다(독립 검토 a·b·c). 모두 '덜 요청' 쪽으로 접는다.
 *
 * 예외 하나 — 시작일 계획(v32): 시작일 S 의 'start' 판정은 last_evaluated_date=S·plan.date=S 를 쓰고, S+1 에는 판정 필터
 * (last < 어제)가 S < S 로 거짓이라 계획이 갱신되지 않는다(시작일을 세지 않는 것은 의도). 그래서
 * `plan.date == lastEvaluatedDate == 어제` 이면 S+1 하루만 유효로 받는다. 평소 날은 last=D-1·plan=D 라 이 모양이 안 나오고,
 * 판정이 실패해 묵은 계획(last=D-1·plan=D, 오늘 D+1)은 last≠plan 이라 여전히 무효다. 이틀 이상 묵은 계획도 무효.
 */
export function validPlan(raw: unknown, today: string, lastEvaluatedDate: string | null = null): SchedulePlan | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as SchedulePlan
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const startDayCarry = p.date === yesterday && lastEvaluatedDate === p.date
  if (p.date !== today && !startDayCarry) return null
  if (!isInt(p.runsPerDay, 1, MAX_RUNS_PER_DAY) || !isInt(p.perRunCap, 1) || !isInt(p.budget, 0) || !isInt(p.perRun, 0)) return null
  if (p.targetsPerRun !== null && !isInt(p.targetsPerRun, 1)) return null
  return p
}

/** 크론 문자열 → 슬롯 번호. 스케줄 실행이 아니면(수동) null. */
export function slotIndexOf(cron: string | null | undefined): number | null {
  const i = (COLLECT_SLOTS as readonly string[]).indexOf((cron ?? '').trim())
  return i < 0 ? null : i
}

/** R 회 소스의 몇 번째 창인가(슬롯 i). 하루를 R 개 창으로 나눈다. */
const windowOf = (runsPerDay: number, i: number) => Math.floor((i * runsPerDay) / COLLECT_SLOTS.length)

/** 추가 슬롯 i 에서 이 소스가 도는가 — 자기 창의 첫 슬롯만. 기존 슬롯은 따로(모두 돈다). */
export function slotRuns(runsPerDay: number, i: number): boolean {
  return i === 0 || windowOf(runsPerDay, i) !== windowOf(runsPerDay, i - 1)
}

/**
 * 슬롯 i 까지의 누적 허용 요청 = ceil(B × (창+1) / R). 러너 예산 = min(cap, 이 값) − 오늘 쓴 요청 이라
 * 앞 슬롯이 건너뛰어지거나 늦으면 다음 슬롯이 따라잡고(최대 B), 이미 쓴 만큼은 다시 안 쓴다. R=1 이면 어느 슬롯이든 B.
 */
export function slotAllowance(budget: number, runsPerDay: number, i: number): number {
  return Math.min(budget, Math.ceil((budget * (windowOf(runsPerDay, i) + 1)) / runsPerDay))
}

/** 요약 한 줄. */
export function planLine(p: Omit<SchedulePlan, 'date'>): string {
  const tg = p.terms.targets === null ? '측정 없음' : `${p.terms.targets}(${p.terms.activeTargets}×${p.terms.avgReqPerTarget?.toFixed(1) ?? 0})`
  const bn = p.bottleneck ? ` · ⚠️ 병목 ${({ targets: '타깃 부족', time: '시간', safe: 'P_safe' } as const)[p.bottleneck]}(R=${MAX_RUNS_PER_DAY} 로도 B 미충족)` : ''
  return `스케줄 B ${p.budget} · P=min(시간 ${p.terms.time}, 안전 ${p.terms.safe}, 타깃 ${tg}) · R ${p.runsPerDay}/일 · 회당 ${p.perRun}(상한 ${p.perRunCap}) · 1회 타깃 ${p.targetsPerRun ?? '계단 그대로'}${bn}`
}

/** 타깃당 평균 요청 = 최근 14일 실수집의 요청 합 ÷ 방문 타깃 합. 방문 0 이면 null(측정 없음). */
async function avgRequestsPerTarget(sb: Sb, sourceKey: string, now: Date): Promise<{ value: number | null; error?: string }> {
  const { data, error } = await sb
    .from('review_collection_runs')
    .select('requests, targets_visited')
    .eq('source_key', sourceKey)
    .eq('dry_run', false)
    .gte('started_at', new Date(now.getTime() - 14 * 86_400_000).toISOString())
  if (error) return { value: null, error: error.message }
  const rows = (data ?? []) as Array<{ requests: number | null; targets_visited: number | null }>
  const visited = rows.reduce((s, r) => s + (r.targets_visited ?? 0), 0)
  return { value: visited > 0 ? rows.reduce((s, r) => s + (r.requests ?? 0), 0) / visited : null }
}

/**
 * 추가 슬롯 i 에서 돌 소스 = cap_base·유효한 오늘 계획이 있고 제외 소스가 아니고 slotRuns 인 것.
 * 3상태(§7.1): ok(목록, 0개면 note 에 "계획 없음 — 정상") / unavailable(칸 없음·테이블 없음·조회 실패 → 빈 목록 + ⚠️).
 * unavailable 이어도 추가 슬롯은 안 도는 쪽으로 접는다(기존 2슬롯 동작 그대로) — 대신 호출자가 경고로 드러낸다.
 */
export async function plannedSourcesForSlot(
  sb: Sb,
  i: number,
  now: Date = new Date(),
): Promise<{ state: 'ok' | 'unavailable'; keys: string[]; note: string }> {
  const { data, error } = await sb.from('review_source_ramp').select('source_key, cap_base, last_evaluated_date, schedule_plan').not('cap_base', 'is', null)
  if (error) {
    const why = isMissingColumn(error.code)
      ? `schedule_plan 칸 없음 — 마이그 ${SCHEDULE_MIGRATION} 적용 필요`
      : isMissingTableError(error.code, error.message) ? '테이블 없음' : `조회 실패 — ${error.message}`
    return { state: 'unavailable', keys: [], note: `⚠️ 추가 슬롯 계획 확인 불가(${why}) → 추가 슬롯 미동작(기존 2슬롯만)` }
  }
  const rows = (data ?? []) as Array<{ source_key: string; schedule_plan: unknown; last_evaluated_date?: string | null }>
  const today = isoDate(now)
  const valid = rows
    .filter((r) => !RAMP_EXCLUDED.has(r.source_key))
    .map((r) => ({ key: r.source_key, plan: validPlan(r.schedule_plan, today, r.last_evaluated_date ?? null) }))
  const keys = valid.filter((v) => v.plan && slotRuns(v.plan.runsPerDay, i)).map((v) => v.key)
  const stale = valid.filter((v) => !v.plan).length
  const note =
    rows.length === 0
      ? '계획 없음(cap_base 행 0개 — 정상)'
      : `cap_base 행 ${rows.length}개 · 오늘 유효 계획 ${valid.length - stale}개${stale ? ` · 계획 없음/지난 날짜/모양 깨짐 ${stale}개(기존 슬롯만)` : ''}`
  return { state: 'ok', keys, note }
}

export const SCHEDULE_MIGRATION = '20261007000030_review_source_ramp_schedule_plan'

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
  /** v30 §2 스케줄 계획. null = 칸 없음(마이그 000030 미적용)·아직 계획 전 — 기존 예산·기존 2슬롯. */
  plan: SchedulePlan | null
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
  schedule_plan?: SchedulePlan | null
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
            plan: data.schedule_plan ?? null,
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
  let { data, error } = await sb.from('review_source_ramp').select(`${BASE_COLS}, ${PCT_COLS}, schedule_plan`).eq('source_key', sourceKey).maybeSingle()
  // schedule_plan 만 없으면(마이그 000030 미적용) 퍼센트 칸까지는 읽는다 — 계획 없이 지금처럼.
  if (error && isMissingColumn(error.code) && /schedule_plan/.test(error.message ?? '')) {
    ;({ data, error } = await sb.from('review_source_ramp').select(`${BASE_COLS}, ${PCT_COLS}`).eq('source_key', sourceKey).maybeSingle())
  }
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
  // 스케줄러(v30 §2) 재료 — 같은 조회에서 얻는다. 못 읽으면 계획 없음(null) → 기존 예산·기존 2슬롯.
  let runShares: Map<string, number> | null = null
  const activeOf = new Map<string, number>()
  const intervalOf = new Map<string, number>()
  try {
    const src = await sb.from('review_sources').select('key, min_interval_ms, daily_request_cap').eq('enabled', true)
    if (src.error) throw new Error(src.error.message)
    const capBaseOf = new Map((data ?? []).map((d) => [d.source_key as string, d.cap_base as number]))
    const items: Array<{ key: string; requests: number; intervalMs: number }> = []
    for (const s of src.data ?? []) {
      const c = await sb.from('review_targets').select('id', { count: 'exact', head: true }).eq('source_key', s.key).eq('status', 'active')
      if (c.error) throw new Error(c.error.message)
      activeOf.set(s.key, c.count ?? 0)
      intervalOf.set(s.key, s.min_interval_ms)
      if ((c.count ?? 0) > 0) items.push({ key: s.key, requests: capBaseOf.get(s.key) ?? s.daily_request_cap, intervalMs: s.min_interval_ms })
    }
    shares = allocateShares(items)
    // 회당 시간 몫: 한 잡(90분)을 타깃 있는 소스가 순서대로 나눠 쓴다 — 같은 water-fill 을 회당 예산으로.
    runShares = allocateShares(items, RUN_TIME_SEC)
  } catch (e) {
    notes.push(`⚠️ 퍼센트 램프 배분 재료 조회 실패(${e instanceof Error ? e.message : String(e)}) — 오늘은 배분 없이 목표 계산, 스케줄 계획 없음(기존 2슬롯)`)
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
    // 스케줄 계획(v30 §2). 꺼진 소스·재료 없음이면 null.
    let plan: SchedulePlan | null = null
    const iv = intervalOf.get(r.sourceKey)
    if (runShares && iv !== undefined) {
      const avg = await avgRequestsPerTarget(sb, r.sourceKey, now)
      if (avg.error) notes.push(`⚠️ ${r.sourceKey}: 타깃당 평균 요청 조회 실패(${avg.error}) — 타깃 항 없이 계획`)
      plan = {
        date: isoDate(now),
        ...planSchedule({
          budget: target,
          timeCap: runShares.get(r.sourceKey) ?? Math.floor((RUN_TIME_SEC * 1000) / Math.max(1, iv)),
          safeCap: pSafeOf(r.sourceKey),
          activeTargets: activeOf.get(r.sourceKey) ?? 0,
          avgReqPerTarget: avg.value,
        }),
      }
    }
    const line = `${r.sourceKey}: ${reason} · 오늘목표 ${target}${share !== null ? `(배분 몫 ${share})` : ''} / 상한 ${p.capBase}${next.pctStep >= 90 ? ' · 안정' : ''}`
    const planNote = `${r.sourceKey}: ${plan ? planLine(plan) : '스케줄 계획 없음(재료 조회 실패·꺼진 소스) → 기존 2슬롯'}`
    if (dryRun) {
      notes.push(`dry-run — ${line}`, `dry-run — ${planNote}`)
      continue
    }
    const log = await sb.from('review_source_ramp_log').insert({
      source_key: r.sourceKey, prev_level: r.level, new_level: r.level, prev_pct: p.pctStep, new_pct: next.pctStep, event, reason, applied_by: 'review-collect',
    })
    if (log.error) {
      notes.push(`❌ ${r.sourceKey}: 퍼센트 램프 판정 보류 — 로그 기록 실패(${log.error.message}), 상태 그대로`)
      continue
    }
    const payload = {
      pct_step: next.pctStep,
      consecutive_ok_days: next.consecutiveOkDays,
      last_evaluated_date: event === 'start' ? isoDate(now) : yDate, // 시작일은 오늘(UTC): 오늘 일부는 램프 밖에서 돌았을 수 있어 세지 않는다(독립 검토 2026-10-06)
      daily_request_target: target,
      supply_state: supply,
      ...(next.rose ? { blocks_at_step: 0, changed_at: now.toISOString(), reason } : {}),
    }
    let upd = await sb.from('review_source_ramp').update({ ...payload, schedule_plan: plan }).eq('source_key', r.sourceKey)
    // schedule_plan 칸이 없으면(마이그 000030 미적용) 그 칸만 빼고 다시 — 퍼센트 램프는 지금처럼 돈다.
    if (upd.error && isMissingColumn(upd.error.code)) {
      upd = await sb.from('review_source_ramp').update(payload).eq('source_key', r.sourceKey)
      if (!upd.error) notes.push(`⚠️ ${r.sourceKey}: schedule_plan 칸 없음 — 마이그 ${SCHEDULE_MIGRATION} 미적용, 계획 미기록(기존 2슬롯)`)
    }
    notes.push(...(upd.error ? [`❌ ${r.sourceKey}: 로그는 남았고 상태 갱신 실패(${upd.error.message})`] : [line, planNote]))
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
  /** 이번 실행의 크론 문자열(github.event.schedule). 수동 실행·없음 = null → 슬롯 나눔 없이 하루 목표 전체. */
  slot?: string | null
}): Promise<{ result: RunResult | null; fatal: string | null; targetLimit: number; notes: string[] }> {
  const { sb, adapter, dryRun, explicitTargets, ports } = args
  let loaded: Loaded
  try {
    loaded = await loadSourceRamp(sb, adapter.key)
  } catch (e) {
    loaded = { state: 'unavailable', reason: `조회 예외 — ${e instanceof Error ? e.message : String(e)}` }
  }
  const resolved = resolveTargetLimit(adapter.key, loaded, explicitTargets)
  let limit = resolved.limit
  const notes = [resolved.note]
  const pct = activePct(adapter.key, loaded)
  if (pct) notes.push(pctSummary(pct))
  // 예산 3상태(v30 §2): 계획 적용 / cap_base·계획 없음 → 기존 예산 / 확인 불가 → 기존 예산(⚠️).
  let dailyRequestTarget = pct ? effectiveTarget(pct) : null
  let maxRequestsThisRun: number | null = null
  let budgetNote: string
  const plan = pct ? validPlan(pct.plan, isoDate(ports.now()), pct.lastEvaluatedDate) : null
  if (plan) {
    const i = slotIndexOf(args.slot)
    if (i !== null) dailyRequestTarget = slotAllowance(dailyRequestTarget as number, plan.runsPerDay, i)
    maxRequestsThisRun = plan.perRunCap
    if (explicitTargets === null && plan.targetsPerRun !== null) limit = plan.targetsPerRun
    budgetNote =
      `예산: 스케줄 계획 적용(${plan.date}) — ${planLine(plan)} · 이번 슬롯 ${i === null ? '수동(슬롯 나눔 없음)' : `#${i}`} 누적 허용 ${dailyRequestTarget}` +
      (explicitTargets === null && plan.targetsPerRun !== null ? ` · 1회 타깃 ${limit}개(자동 산정)` : '')
  } else if (pct) {
    budgetNote = pct.plan
      ? '⚠️ 예산: 스케줄 계획 무시(오늘 날짜 아님·모양 깨짐) → 퍼센트 목표만(기존 2슬롯)'
      : '예산: 스케줄 계획 없음 → 퍼센트 목표만(기존 2슬롯)'
  } else if (RAMP_EXCLUDED.has(adapter.key)) {
    budgetNote = '예산: 램프 제외 소스 → 기존 예산(daily_request_cap)'
  } else if (loaded.state === 'unavailable') {
    budgetNote = `⚠️ 예산: 램프 확인 불가 → 기존 예산(daily_request_cap)`
  } else if (loaded.state === 'none') {
    budgetNote = '예산: 램프 행 없음 → 기존 예산(daily_request_cap)'
  } else {
    budgetNote = loaded.ramp.pctReady ? '예산: cap_base 없음 → 기존 예산(daily_request_cap)' : `⚠️ 예산: 퍼센트 칸 없음(마이그 ${PCT_RAMP_MIGRATION} 미적용) → 기존 예산(daily_request_cap)`
  }
  let result: RunResult | null = null
  let fatal: string | null = null
  try {
    result = await runCollection(adapter, { dryRun, targetLimit: limit, dailyRequestTarget, maxRequestsThisRun }, ports)
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e)
  }
  const rb = await rollbackOnBlock(
    sb, adapter.key, loaded, result?.stats.blockedResponses ?? 0, ports.now(), dryRun,
    (result?.requestsTodayBefore ?? 0) + (result?.requests ?? 0),
  )
  if (rb) notes.push(rb)
  notes.push(budgetNote)
  return { result, fatal, targetLimit: limit, notes }
}
