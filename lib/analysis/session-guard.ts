// 구독 세션 한도 가드(남헌 v30 §5 A안 → v32 소프트/하드 캡). 토큰을 쓰는 작업 단위(야간 T2 1회 · extract 슬롯 1회)마다
// 소프트 캡 = 5시간 세션의 session_cap_pct(15%) — 닿으면 새 프로젝트·새 묶음을 시작하지 않는다(진행 중은 마친다).
// 하드 캡 = hard_cap_pct(30%) — 진행 중 작업의 절대 상한, 닿으면 다음 claude -p 를 시작하지 않는다. 둘 다 상한이지 목표가 아니다.
//
// 돈 단위: claude-cli 봉투 total_cost_usd(API 환산 명목값, llm.ts cliSpent()가 프로세스 단위로 합산).
// %p 환산: usd_per_session_pct(설정값 — 남헌이 수동으로 잰 %p 와 대조해 고친다. 절차는 docs/session-limit-guard.md).
// 하루 합산 상한은 두지 않는다(남헌 결정). 대신 5시간 슬라이딩 창의 합산 사용률을 로그·summary 에 남겨 눈에 보이게만 한다.
//
// 기존 장치와의 경계(중복 구현 금지):
//   · 한도 소진 오류 판정 = llm.ts isQuotaFailure / 리셋 시각 = extract-auto.ts parseQuotaResetAt
//   · 재시도 간격·횟수 = extract-auto.ts QUOTA_COOLDOWN_MS · BLOCKED_ALARM_STREAK(원래 1회 + 재시도 2회)
//   이 파일은 "상한에서 새 시작을 막는다"·"프로젝트 단위 재시도 큐"·"얼마나 썼나를 남긴다"만 더한다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 스크립트 전용(앱 번들에 넣지 않는다).

import fs from 'node:fs'
import path from 'node:path'
import { isQuotaBlocked } from './extract-auto.ts'

export type GuardConfig = {
  /** 소프트 캡 %(v32: 15). 닿으면 새 프로젝트·새 묶음을 시작하지 않는다. */
  capPct: number | null
  /** 하드 캡 %(v32: 30). 진행 중 작업의 절대 상한 — 닿으면 다음 claude -p 를 시작하지 않는다(extract). */
  hardCapPct: number | null
  usdPerPct: number | null
  /** 비용 모름 호출을 셀 근거(본 호출)가 없을 때 쓰는 1회 호출 상한 추정($). 없으면 그때는 확인 불가. */
  unitCostFallbackUsd: number | null
  weeklyStopPct: number | null
  usdPerWeeklyPct: number | null
  /** extract 자동 조정의 주간 안전선 %(남헌 v36 §2). null = 비활성 — 남헌이 N 을 정할 때까지(extract-autotune.ts weeklySafety). */
  autotuneWeeklySafePct: number | null
  /** extract 자동 조정 올리기 임계 %(남헌 v42 §1: 10) — 평균 사용률이 이 값 **미만**이어야 올린다. null(없음·비수치·0 이하) = 코드 폴백 8. */
  autotuneUpBelowPct: number | null
  /** T2 판정 전용 소프트/하드 캡 %(전량 판정 따라잡기). relevanceCapUntil 이전에만 쓴다 — extract·번역·백필은 안 본다. */
  relevanceCapPct: number | null
  relevanceHardCapPct: number | null
  /** 판정 전용 캡·자기 호출 체인의 만료 시각(epoch ms). null(없음·못 읽음) = 판정도 기본 캡, 체인 꺼짐. */
  relevanceCapUntilMs: number | null
  /**
   * 오늘 한정 완화 만료(epoch ms, 남헌 v61). 이 시각 전(∧ relevanceCapUntil 전)에는 판정 캡을 relevanceRelaxCapPct 로 크게 풀고,
   * 체인의 5시간 창 안전선·90분 휴식·주간 '확인 불가' 정지를 끈다. 지나면 코드가 자동으로 원래 값으로 돌아간다. null = 완화 없음.
   */
  relevanceRelaxUntilMs: number | null
  /** 완화 중 판정 소프트·하드 캡 %(사실상 무제한). 없으면 완화 중에도 판정 전용 캡 그대로. */
  relevanceRelaxCapPct: number | null
  /** 체인 다음 실행을 막는 주간 사용률(하한) %. null = 확인 불가 → 체인 멈춤. */
  relevanceChainWeeklyStopPct: number | null
  /** 남헌 v65: 이 시각부터(∧ 완화 중에만) 주간 안전선을 이 값으로 올린다(예 98). 완화가 끝나면 위 기본값으로 자동 복귀. */
  relevanceChainWeeklyStopDay2Pct: number | null
  relevanceChainWeeklyStopDay2FromMs: number | null
  /** 남헌 v65 후속: true 면 주간 % 자동 정지를 끈다(규칙은 남겨 둠, false 로 되살림). */
  relevanceChainWeeklyStopOff: boolean
  /** 체인 다음 실행을 막는 5시간 창 사용률 %. null = 확인 불가 → 체인 멈춤. */
  relevanceChainWindow5hStopPct: number | null
}

const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const isoMs = (v: unknown): number | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : null
}

export function parseGuardConfig(raw: Record<string, unknown> | null | undefined): GuardConfig {
  const r = raw ?? {}
  return {
    capPct: pos(r.session_cap_pct),
    hardCapPct: pos(r.hard_cap_pct),
    unitCostFallbackUsd: pos(r.unit_cost_fallback_usd),
    usdPerPct: pos(r.usd_per_session_pct),
    weeklyStopPct: pos(r.weekly_stop_pct),
    usdPerWeeklyPct: pos(r.usd_per_weekly_pct),
    autotuneWeeklySafePct: pos(r.autotune_weekly_safe_pct),
    autotuneUpBelowPct: pos(r.autotune_up_below_pct),
    relevanceCapPct: pos(r.relevance_session_cap_pct),
    relevanceHardCapPct: pos(r.relevance_hard_cap_pct),
    relevanceCapUntilMs: isoMs(r.relevance_cap_until),
    relevanceRelaxUntilMs: isoMs(r.relevance_relax_until),
    relevanceRelaxCapPct: pos(r.relevance_relax_cap_pct),
    relevanceChainWeeklyStopPct: pos(r.relevance_chain_weekly_stop_pct),
    relevanceChainWeeklyStopDay2Pct: pos(r.relevance_chain_weekly_stop_day2_pct),
    relevanceChainWeeklyStopDay2FromMs: isoMs(r.relevance_chain_weekly_stop_day2_from),
    relevanceChainWeeklyStopOff: r.relevance_chain_weekly_stop_off === true,
    relevanceChainWindow5hStopPct: pos(r.relevance_chain_window5h_stop_pct),
  }
}

/**
 * T2 판정이 쓸 캡. until 이전 ∧ 판정 전용 % 두 개가 다 있으면 그 값, 아니면 기본 capUsdOf/hardCapUsdOf(15%/30%).
 * until 이 지나면 설정 파일을 안 고쳐도 코드가 기본값으로 돌아간다. 못 읽은 until 은 "만료"로 본다(낮은 쪽으로 닫힘).
 */
/** 오늘 한정 완화가 살아 있나 — 완화 만료 전 ∧ 판정 전용 만료(relevance_cap_until) 전. 둘 중 하나라도 못 읽으면 false(원래 동작). */
export function relevanceRelaxLive(cfg: GuardConfig, now: Date): boolean {
  const t = now.getTime()
  return cfg.relevanceRelaxUntilMs != null && cfg.relevanceCapUntilMs != null && t < cfg.relevanceRelaxUntilMs && t < cfg.relevanceCapUntilMs
}

/** 체인 주간 안전선 %. 완화 중이고 day2 시각 이후면 day2 값(98), 아니면 기본값(90). 설정이 비정상이면 기본값(더 낮은 쪽). */
export function chainWeeklyStopPct(cfg: GuardConfig, now: Date): number | null {
  if (cfg.relevanceChainWeeklyStopOff) return Number.POSITIVE_INFINITY
  const base = cfg.relevanceChainWeeklyStopPct
  const d = cfg.relevanceChainWeeklyStopDay2Pct
  if (base == null || d == null || cfg.relevanceChainWeeklyStopDay2FromMs == null) return base
  return relevanceRelaxLive(cfg, now) && now.getTime() >= cfg.relevanceChainWeeklyStopDay2FromMs && d > base ? d : base
}

export function relevanceCaps(cfg: GuardConfig, now: Date): { capUsd: number | null; hardCapUsd: number | null; capPct: number | null; boosted: boolean; relaxed: boolean; untilMs: number | null } {
  const live = cfg.relevanceCapUntilMs != null && now.getTime() < cfg.relevanceCapUntilMs
  // 오늘 한정 완화(남헌 v61): 소프트·하드 둘 다 relax % 로 — 사실상 무제한. 만료되면 아래 판정 전용 캡(20%/35%)으로 자동 복귀.
  if (relevanceRelaxLive(cfg, now) && cfg.relevanceRelaxCapPct != null && cfg.usdPerPct != null) {
    const usd = cfg.relevanceRelaxCapPct * cfg.usdPerPct
    return { capUsd: usd, hardCapUsd: usd, capPct: cfg.relevanceRelaxCapPct, boosted: true, relaxed: true, untilMs: cfg.relevanceRelaxUntilMs }
  }
  if (live && cfg.relevanceCapPct != null && cfg.relevanceHardCapPct != null && cfg.usdPerPct != null) {
    return { capUsd: cfg.relevanceCapPct * cfg.usdPerPct, hardCapUsd: cfg.relevanceHardCapPct * cfg.usdPerPct, capPct: cfg.relevanceCapPct, boosted: true, relaxed: false, untilMs: cfg.relevanceCapUntilMs }
  }
  return { capUsd: capUsdOf(cfg), hardCapUsd: hardCapUsdOf(cfg), capPct: cfg.capPct, boosted: false, relaxed: false, untilMs: cfg.relevanceCapUntilMs }
}

/** 설정 파일을 읽는다. 못 읽으면 error 를 채우고 값은 전부 null — 호출부는 capUsd null 로 닫힌다(§7.1). */
export function loadGuardConfig(file = path.join(process.cwd(), 'config', 'session-guard.json')): { cfg: GuardConfig; error: string | null } {
  try {
    return { cfg: parseGuardConfig(JSON.parse(fs.readFileSync(file, 'utf8'))), error: null }
  } catch (e) {
    return { cfg: parseGuardConfig(null), error: `${file}: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 한 run 의 상한($). 둘 중 하나라도 없으면 null = 상한을 모른다(가드 확인 불가). */
export function capUsdOf(cfg: GuardConfig): number | null {
  return cfg.capPct != null && cfg.usdPerPct != null ? cfg.capPct * cfg.usdPerPct : null
}

/** $ → 세션 %p. 계수가 없으면 null(0 으로 접지 않는다). */
export function pctOf(usd: number, usdPerPct: number | null): number | null {
  return usdPerPct ? Number((usd / usdPerPct).toFixed(2)) : null
}

/**
 * 소프트 캡(남헌 v32): 단위 경계에서만 본다 — 지금까지 쓴 돈이 소프트 캡에 **닿았으면** 새 프로젝트·새 묶음을 시작하지 않는다.
 * 이미 시작한 프로젝트는 끝까지 마치고 저장한다(중간 호출을 막지 않는다). 진행 중 절대 상한은 하드 캡(llm.ts setCliHardCap)이 맡는다.
 */
export function capReached(spentUsd: number, capUsd: number): boolean {
  return spentUsd >= capUsd
}

/** 하드 캡($) = hard_cap_pct × 계수. 없으면 null(하드 캡 없음 — 소프트 캡만). */
export function hardCapUsdOf(cfg: GuardConfig): number | null {
  return cfg.hardCapPct != null && cfg.usdPerPct != null ? cfg.hardCapPct * cfg.usdPerPct : null
}

// 비용 모름 호출을 0 으로 접지 않는 지출 계산은 llm.ts 한 벌이다(하드 캡도 같은 값을 본다).
// 왜 "unknown>0 이면 무조건 멈춤"이 아닌가: timeout 은 입력이 큰 프로젝트 하나의 문제라(llm.ts isCliLimitError) 한 건마다
// 슬롯 전체를 세우면 남은 프로젝트가 매번 밀린다. 근거(본 호출의 최대값)가 있으면 추정하고, 근거가 없을 때만 새 시작을 막는다.
export { spendForCap } from './llm.ts'

// ── 프로젝트 단위 재시도 큐(남헌 v32 #4) ─────────────────────────────
// 한도 오류가 난 **그 프로젝트**만 큐에 넣고, 4시간 뒤(리셋 시각이 있으면 그 시각) 다음 실행이 그것부터 다시 돈다. 프로젝트당 최대 2회.
// 저장 위치는 agent_runs.summary.retry_queue(마이그 없음) — 매 extract-auto 실행이 이전 큐를 이어받아 다시 쓴다.
// 슬롯 쿨다운(extract-auto.ts slotStateOf)과의 관계: 한도는 구독 전체에 걸리므로 실행 단위 쿨다운은 그대로 두고(그동안 아무것도 안 돈다),
// 큐는 "쿨다운이 풀린 뒤 무엇부터·몇 번까지"만 정한다.

export type RetryEntry = { project_id: string; retries: number; due_at: string }

/** 가장 최근(진행 중 제외) extract-auto 행 중 retry_queue 배열을 가진 것의 큐. 없으면 []. */
export function retryQueueOf(rows: readonly RunRow[]): RetryEntry[] {
  const desc = [...rows]
    .filter(r => r.status !== 'running' && Array.isArray(r.summary?.retry_queue))
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))
  const q = (desc[0]?.summary?.retry_queue ?? []) as unknown[]
  return q.filter((e): e is RetryEntry => !!e && typeof (e as RetryEntry).project_id === 'string' && typeof (e as RetryEntry).retries === 'number')
}

/** 대상 순서: 때가 된 큐 항목이 맨 앞(큐 순서), 나머지는 원래 순서. 때가 안 된 큐 항목은 이번에 고르지 않는다. */
export function orderWithQueue<T extends { projectId: string }>(targets: readonly T[], queue: readonly RetryEntry[], now: Date): T[] {
  const due = (e: RetryEntry) => Date.parse(e.due_at) <= now.getTime()
  const waitIds = new Set(queue.filter(e => !due(e)).map(e => e.project_id))
  const first = queue.filter(due).map(e => targets.find(t => t.projectId === e.project_id)).filter((t): t is T => !!t)
  const firstIds = new Set(first.map(t => t.projectId))
  return [...first, ...targets.filter(t => !firstIds.has(t.projectId) && !waitIds.has(t.projectId))]
}

/**
 * 이번 실행 뒤의 큐. touched = 이번에 손댄 프로젝트(성공·일반 실패·한도 모두 — 손댔으면 이전 항목은 끝났다).
 * quota = 이번에 한도로 멈춘 프로젝트(없으면 null). 그 프로젝트의 재시도가 maxRetries 를 다 썼으면 큐에서 빼고 giveUp 으로 알린다.
 */
export function nextRetryQueue(
  prev: readonly RetryEntry[],
  o: { touched: readonly string[]; quota: string | null; resetAt: string | null; now: Date; cooldownMs: number; maxRetries: number },
): { queue: RetryEntry[]; giveUp: RetryEntry | null } {
  const touched = new Set(o.touched)
  const keep = prev.filter(e => !touched.has(e.project_id))
  if (!o.quota) return { queue: keep, giveUp: null }
  const before = prev.find(e => e.project_id === o.quota)
  // 첫 한도 = 큐에 들어감(retries 0). 큐에서 다시 돌다 또 한도 = 재시도 1회 소진(retries 1) … maxRetries 회 소진이면 포기.
  const retries = before ? before.retries + 1 : 0
  const entry: RetryEntry = { project_id: o.quota, retries, due_at: o.resetAt ?? new Date(o.now.getTime() + o.cooldownMs).toISOString() }
  if (retries >= o.maxRetries) return { queue: keep, giveUp: entry }
  return { queue: [entry, ...keep], giveUp: null }
}

// ── 사용량 합산(agent_runs) ───────────────────────────────────────

/** 구독 토큰을 쓰는 실행의 run_key 접두. 수집 run 은 토큰을 안 써서 없다. relevance-translate 는 기록만(상한 없음 — 남헌 결정 전). */
export const GUARDED_RUN_PREFIXES = ['extract-auto-', 'relevance-judge-', 'relevance-translate-'] as const

export type RunRow = { run_key: string; status: string; summary?: Record<string, unknown> | null; started_at?: string | null; finished_at?: string | null }

/** 한 실행이 쓴 $. 새 행은 summary.session.spent_usd, 옛 extract 행은 summary.cost_usd. 없으면 null. */
export function runCostUsd(r: RunRow): number | null {
  const s = r.summary ?? {}
  const sess = (s.session ?? null) as Record<string, unknown> | null
  const v = sess?.spent_usd ?? s.cost_usd
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * sinceMs 이후에 **끝난** 실행들의 합. 진행 중(finished_at 없음)·비용 없는 행은 unknownRuns 로 따로 센다 —
 * 0 달러로 접지 않는다. ponytail: 실행 단위로 끝난 시각만 본다(창 경계에 걸친 실행도 통째로 센다). 실제 세션 창은
 * 첫 메시지 기준 고정 창이라 이건 근사다. 더 정확해야 하면 agent_run_steps 의 단계별 비용으로 내린다.
 */
export function usageSince(rows: readonly RunRow[], sinceMs: number): { usd: number; runs: number; unknownRuns: number } {
  let usd = 0
  let runs = 0
  let unknownRuns = 0
  for (const r of rows) {
    if (!GUARDED_RUN_PREFIXES.some(p => r.run_key.startsWith(p))) continue
    const at = Date.parse(r.finished_at ?? '')
    if (!Number.isFinite(at)) {
      if (Date.parse(r.started_at ?? '') >= sinceMs) unknownRuns += 1
      continue
    }
    if (at < sinceMs) continue
    const c = runCostUsd(r)
    if (c == null) { if (r.summary?.decision !== 'skip') unknownRuns += 1; continue }
    usd += c
    runs += 1
  }
  return { usd: Number(usd.toFixed(4)), runs, unknownRuns }
}

type Supa = { from: (t: string) => any }

/** 최근 7일 가드 대상 실행. 조회 실패는 null(호출부가 "확인 불가"로 다룬다). */
export async function loadRecentRuns(supabase: Supa, now: Date): Promise<RunRow[] | null> {
  const { data, error } = await supabase
    .from('agent_runs')
    .select('run_key, status, summary, started_at, finished_at')
    .gte('started_at', new Date(now.getTime() - 7 * 86_400_000).toISOString())
    .or(GUARDED_RUN_PREFIXES.map(p => `run_key.like.${p}*`).join(','))
    .order('started_at', { ascending: false })
    .limit(1000)
  return error ? null : (data ?? [])
}

/**
 * 주간 자동 중단 스위치. weekly_stop_pct 미설정이면 비활성. 설정됐는데 계수·이력을 모르면 **멈춘다**(확인 불가 → 닫힘).
 * ⚠️ 합산은 이 리포 agent_runs 의 가드 대상 실행뿐이다 — 남헌의 대화형 사용·다른 claude-cli 루프(CMO·discovery·column-review)는
 * 안 들어간다. 그래서 이 %는 실제 주간 사용률의 **하한**이다.
 */
export function weeklyGate(cfg: GuardConfig, weekUsd: number | null): { stop: boolean; pct: number | null; reason: string } {
  if (cfg.weeklyStopPct == null) return { stop: false, pct: null, reason: '주간 중단 스위치 비활성(weekly_stop_pct 미설정)' }
  if (cfg.usdPerWeeklyPct == null) return { stop: true, pct: null, reason: `주간 중단 스위치 ${cfg.weeklyStopPct}% 설정됐는데 usd_per_weekly_pct 가 없다 — 확인 불가라 멈춘다` }
  if (weekUsd == null) return { stop: true, pct: null, reason: '최근 7일 실행 이력(agent_runs) 조회 실패 — 주간 사용률 확인 불가라 멈춘다' }
  const pct = Number((weekUsd / cfg.usdPerWeeklyPct).toFixed(2))
  return pct >= cfg.weeklyStopPct
    ? { stop: true, pct, reason: `주간 사용률(하한) ${pct}% ≥ 중단선 ${cfg.weeklyStopPct}% — 자동 중단` }
    : { stop: false, pct, reason: `주간 사용률(하한) ${pct}% < 중단선 ${cfg.weeklyStopPct}%` }
}

/** run summary 에 붙는 session 블록 — 작업별 사용액·사용률과 5시간 창 합산(§7.2: 수치로 남긴다). */
export function sessionBlock(i: {
  job: 'extract' | 't2' | 'translate'
  cfg: GuardConfig
  spentUsd: number
  calls: number
  costUnknownCalls: number
  /** spendForCap 결과 — 비용 모름 호출을 추정해 더한 상한 판정용 지출. null = 확인 불가. 안 주면 spentUsd. */
  spentForCapUsd?: number | null
  /** 이 실행 전, 지난 5시간에 끝난 다른 가드 대상 실행 합(조회 실패면 null). */
  window5h: { usd: number; runs: number; unknownRuns: number } | null
  weekUsd: number | null
  capped: boolean
  /** T2 가 relevanceCaps 로 쓴 실제 캡. 없으면 기본 캡. */
  caps?: { capUsd: number | null; hardCapUsd: number | null; capPct: number | null }
}) {
  const capUsd = i.job === 'translate' ? null : i.caps ? i.caps.capUsd : capUsdOf(i.cfg) // 번역은 기록만(남헌 결정 전 상한 없음)
  const hardUsd = i.job === 'translate' ? null : i.caps ? i.caps.hardCapUsd : hardCapUsdOf(i.cfg)
  const winUsd = i.window5h ? Number((i.window5h.usd + i.spentUsd).toFixed(4)) : null
  return {
    job: i.job,
    spent_usd: Number(i.spentUsd.toFixed(4)),
    spent_for_cap_usd: i.spentForCapUsd === undefined ? Number(i.spentUsd.toFixed(4)) : i.spentForCapUsd == null ? null : Number(i.spentForCapUsd.toFixed(4)),
    used_pct: pctOf(i.spentUsd, i.cfg.usdPerPct),
    cap_usd: capUsd == null ? null : Number(capUsd.toFixed(4)),
    cap_pct: i.job === 'translate' ? null : i.caps ? i.caps.capPct : i.cfg.capPct,
    // 하드 캡은 extract(llm.ts 호출 시작 전)·T2(묶음 시작 전)에 건다. 번역은 기록만.
    hard_cap_usd: hardUsd == null ? null : Number(hardUsd.toFixed(4)),
    usd_per_pct: i.cfg.usdPerPct,
    capped: i.capped,
    claude_calls: i.calls,
    cost_unknown_calls: i.costUnknownCalls,
    // 5시간 슬라이딩 창 합산(이 실행 포함) — 작업별 15% 두 개가 같은 창에 들어가면 여기서 30% 근처로 보인다. 상한은 아니다.
    window5h_usd: winUsd,
    window5h_pct: winUsd == null ? null : pctOf(winUsd, i.cfg.usdPerPct),
    window5h_other_runs: i.window5h?.runs ?? null,
    window5h_unknown_runs: i.window5h?.unknownRuns ?? null,
    week_usd_lower_bound: i.weekUsd == null ? null : Number((i.weekUsd + i.spentUsd).toFixed(4)),
  }
}

/** 로그 한 줄. */
export function sessionLine(b: ReturnType<typeof sessionBlock>): string {
  const cap = b.cap_usd == null ? '상한 없음(기록만)' : `상한 $${b.cap_usd.toFixed(2)}(${b.cap_pct}%)`
  const win = b.window5h_usd == null ? '5시간 창 합산 확인 불가' : `5시간 창 합산 $${b.window5h_usd.toFixed(2)}(≈${b.window5h_pct ?? '?'}%p, 다른 실행 ${b.window5h_other_runs}건${b.window5h_unknown_runs ? ` · 비용 모름 ${b.window5h_unknown_runs}건` : ''})`
  const est = b.cost_unknown_calls ? ` (비용 모름 포함 판정값 ${b.spent_for_cap_usd == null ? '확인 불가' : `$${b.spent_for_cap_usd.toFixed(3)}`})` : ''
  return `세션 사용(${b.job}) $${b.spent_usd.toFixed(3)}${est} ≈${b.used_pct ?? '?'}%p / ${cap}${b.capped ? ' — 상한 도달로 멈춤' : ''} · claude 호출 ${b.claude_calls}회(비용 못 읽음 ${b.cost_unknown_calls}) · ${win}`
}

// ── T2 재시도 슬롯 ──────────────────────────────────────────────

/** nightly-relevance.yml 크론 → 슬롯. main(19:03Z)·s2(06:03Z)는 정규 2회(v71o 2, 간격 11h·13h), r1(02:03Z)은 한도 정지 뒤 재시도 전용(일이 없으면 기록 없이 끝난다). */
export const RELEVANCE_SLOTS: Readonly<Record<string, string>> = { '3 19 * * *': 'main', '3 2 * * *': 'r1', '3 6 * * *': 's2' }

/**
 * T2 재시도 슬롯이 일할 차례인가(순수함수). rows = 최근 relevance-judge 행.
 * 오늘(KST) 정규/재시도 실행 중 가장 최근 것이 한도로 멈췄고, 재시도를 maxRetries 번 덜 썼고,
 * 리셋 시각(있으면) 또는 정지 + cooldownMs 가 지났으면 돈다. 수동(-m)·로컬 실행은 세지 않는다.
 */
export function relevanceRetryDecision(
  rows: readonly RunRow[],
  o: { today: string; now: Date; cooldownMs: number; maxRetries: number },
): { run: boolean; reason: string; retriesDone: number; quotaPending: boolean; quotaProject: string | null } {
  const base = `relevance-judge-${o.today}`
  const mine = rows
    .filter(r => r.run_key === base || (r.run_key.startsWith(base) && /^-r\d+$/.test(r.run_key.slice(base.length))))
    .filter(r => r.status !== 'running')
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))
  const retriesDone = mine.filter(r => r.run_key !== base).length
  const last = mine[0]
  // quotaPending = 마지막 기록이 한도 정지로 남아 있다 — r2(그날 마지막 재시도 자리)가 이 상태로 쉬면 경보한다.
  // quotaProject = 한도로 멈춘 그 프로젝트(summary.quota_project) — 재시도는 그것부터 돈다(v32 #4).
  const qp = last?.summary?.quota_project
  const out = (run: boolean, reason: string, quotaPending: boolean) => ({ run, reason, retriesDone, quotaPending, quotaProject: typeof qp === 'string' ? qp : null })
  if (!last) return out(false, '오늘 정규 T2 실행 기록 없음 — 재시도할 것이 없다', false)
  if (!isQuotaBlocked(last)) return out(false, `최근 실행(${last.run_key})이 한도 정지가 아니다(${last.status}) — 재시도 불필요`, false)
  if (retriesDone >= o.maxRetries) return out(false, `재시도 ${retriesDone}/${o.maxRetries}회 소진 — 오늘은 더 안 돈다`, true)
  const reset = Date.parse(String(last.summary?.quota_reset_at ?? ''))
  const stopped = Date.parse(last.finished_at ?? last.started_at ?? '')
  const due = Number.isFinite(reset) ? reset : Number.isFinite(stopped) ? stopped + o.cooldownMs : NaN
  if (!Number.isFinite(due)) return out(false, '정지 시각 확인 불가 — 재시도하지 않는다', true)
  if (o.now.getTime() < due) return out(false, `아직 이르다 — ${new Date(due).toISOString()} 이후(${Number.isFinite(reset) ? 'CLI 리셋 시각' : `정지 + ${o.cooldownMs / 3_600_000}시간`})`, true)
  return out(true, `한도 정지 뒤 재시도 ${retriesDone + 1}/${o.maxRetries}`, true)
}

/**
 * 자동 재개(수동 전용 relevance-resume.yml, 남헌 v67 §2-1-5) — 체인이 멈춰 있고 이어 가도 안전할 때만 새 실행을 시작한다(순수함수).
 * 규칙: 가장 최근 relevance-judge 행(수동·재시도·재개 포함) 하나만 본다.
 *  · 실행 중(running): 3시간 안이면 쉼, 넘으면 죽은 실행이라 재개.
 *  · 한도(quota) 정지: CLI 리셋 시각(있으면) 또는 정지 + cooldownMs 가 지나면 재개, 아니면 쉼(다음 30분에 다시 본다).
 *  · 체인이 "이어 가라"(relaunch=true)를 남겼는데 20분~6시간 사이 다음 실행이 없으면 체인이 끊긴 것 — 재개(6시간 넘으면 옛 체인이라 쉼).
 *  · 로컬 실행(-local) 행은 보지 않는다. 한도 정지는 CLI 리셋 시각이 있어도 정지 후 최소 30분은 쉰다.
 *  · 사람이 Cancel 한 실행은 running 으로 남아 3시간 뒤 재개된다 — 멈추려면 RELEVANCE_CHAIN=off.
 *  · relaunch=false 이면 전부 쉼(오류율·하드 캡·설정 확인 불가·미판정 0건·연속 0건·hop 상한은 사람이 볼 대상 — hop 상한 뒤 자동 재개는 상한을 무력화한다, 독립 검토 2번).
 *  · 행이 없거나 위에 안 걸리면 쉼. 킬 스위치(RELEVANCE_CHAIN=off)·만료는 호출부가 본다.
 */
export function relevanceResumeDecision(
  rows: readonly RunRow[],
  o: { now: Date; cooldownMs: number; runningStaleMs?: number; relaunchGraceMs?: number },
): { run: boolean; reason: string } {
  const stale = o.runningStaleMs ?? 3 * 3_600_000
  const grace = o.relaunchGraceMs ?? 20 * 60_000
  // 로컬 실행(-local)이 남긴 행으로 Actions 체인을 되살리지 않는다.
  const last = rows
    .filter(r => r.run_key.startsWith('relevance-judge-') && !r.run_key.endsWith('-local'))
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))[0]
  if (!last) return { run: false, reason: '판정 실행 기록 없음 — 재개할 것이 없다' }
  const started = Date.parse(last.started_at ?? '')
  const finished = Date.parse(last.finished_at ?? '')
  const now = o.now.getTime()
  if (last.status === 'running') {
    if (!Number.isFinite(started)) return { run: false, reason: '실행 중 행의 시작 시각 확인 불가 — 재개하지 않는다' }
    return now - started > stale
      ? { run: true, reason: `최근 실행(${last.run_key})이 ${Math.round((now - started) / 60_000)}분째 running — 죽은 실행으로 보고 재개` }
      : { run: false, reason: `최근 실행(${last.run_key})이 아직 돌고 있다` }
  }
  if (isQuotaBlocked(last)) {
    const reset = Date.parse(String(last.summary?.quota_reset_at ?? ''))
    // 리셋 시각이 있어도 정지 직후(최소 30분)에는 재개하지 않는다 — 파싱 오류로 과거 시각이 들어와도 한도 소진 상태에서 바로 부르지 않게(독립 검토 1번).
    const minGap = 30 * 60_000
    const due = Number.isFinite(reset) ? (Number.isFinite(finished) ? Math.max(reset, finished + minGap) : reset) : Number.isFinite(finished) ? finished + o.cooldownMs : NaN
    if (!Number.isFinite(due)) return { run: false, reason: '한도 정지 시각 확인 불가 — 재개하지 않는다' }
    return now >= due
      ? { run: true, reason: `한도 정지(${last.run_key}) 뒤 ${Number.isFinite(reset) ? 'CLI 리셋 시각' : `${o.cooldownMs / 3_600_000}시간`} 경과 — 재개` }
      : { run: false, reason: `한도 정지 중 — ${new Date(due).toISOString()} 이후에 본다` }
  }
  const chain = (last.summary?.chain ?? null) as { relaunch?: unknown; reason?: unknown } | null
  if (chain?.relaunch === true) {
    if (!Number.isFinite(finished)) return { run: false, reason: '체인 이어 가기 표시는 있으나 종료 시각 확인 불가 — 재개하지 않는다' }
    // chainCarryOf 의 이어받기 창(6시간)과 맞춘다 — 오래전에 멈춘 체인(예: 킬 스위치를 하루 켰다 푼 경우)을 hop 0 으로 되살리지 않는다.
    if (now - finished > 6 * 3_600_000) return { run: false, reason: `${last.run_key} 의 이어 가기 표시가 6시간 넘게 지났다 — 옛 체인이라 재개하지 않는다` }
    return now - finished > grace
      ? { run: true, reason: `${last.run_key} 가 이어 가라고 남겼는데 ${Math.round((now - finished) / 60_000)}분째 다음 실행이 없다 — 체인이 끊겨 재개` }
      : { run: false, reason: '체인이 곧 다음 실행을 부른다' }
  }
  if (chain?.relaunch === false) {
    const why = String(chain.reason ?? '')
    return { run: false, reason: `체인 정지 사유가 사람 확인 대상이거나 끝이다 — 재개하지 않는다 (${why || '사유 없음'})` }
  }
  return { run: false, reason: `최근 실행(${last.run_key}, ${last.status})에 체인 정보 없음 — 재개하지 않는다` }
}

/** gh run list --json createdAt,updatedAt,status,conclusion,event 한 행. */
export type GhRun = { createdAt: string; updatedAt?: string | null; status: string; conclusion?: string | null; event?: string | null }

export type StallKind = 'ok' | 'busy' | 'unknown' | 'quota_wait' | 'quota_resume' | 'quota_retried' | 'fail_rerun' | 'fail_alert' | 'zero_progress'
export type StallDecision = { kind: StallKind; rerun: boolean; alert: boolean; limit: boolean; reason: string }

const BUSY = ['queued', 'pending', 'waiting', 'requested', 'in_progress']
const FAILED = ['failure', 'cancelled', 'timed_out', 'startup_failure']

/**
 * 판정 정체 감시(v71bb ⑮) — "미판정이 남았는데 처리가 멈췄다"를 세 갈래로 가른다(순수함수).
 * rows = 최근 agent_runs(loadRecentRuns), gh = nightly-relevance 실행 이력(null = 못 읽음 → 실행 이력이 필요한 갈래는 확인 불가).
 *  1. 한도 정지(quota): 리셋(또는 정지+cooldown, 정지 후 최소 30분)이 지났고 그 뒤 수동(dispatch) 실행이 없으면 1회 재실행. 지난 뒤
 *     dispatch 가 이미 있는데도 마지막 기록이 그 정지면 재실행 안 함(quota_retried — 1회 한정). 아직 전이면 대기(quota_wait).
 *     v30 §5 "한도 정지 뒤 리셋 시각에 재시도" 의 연장이다 — 재시도 슬롯(r1 02:03Z)이 리셋 전에 지나가 버린 날을 메운다.
 *  2. 연속 실패/취소: 최근 끝난 실행 2건이 연속 실패면 1회 재실행(60분 안 dispatch 가 없을 때). 3건 이상이면 재실행 안 하고 경보만
 *     — relevance-resume.yml 과 같은 "3연속 실패는 사람이 본다" 선(실행이 기록 전에 죽는 루프 방지).
 *  3. 처리 0: 미판정 ≥ minUnjudged 인데 stallHours 동안 판정 0건 → 경보만. 재실행하지 않는다 — 체인이 멈춘 사유(hop 상한·주간 안전선·
 *     오류율·확인 불가)는 일부러 건 정지라 기계가 되살리면 안전선을 무력화한다(relevanceResumeDecision 과 같은 판단).
 * 진행/대기 중인 실행이 있으면 아무것도 안 한다. 로컬(-local) 행은 보지 않는다.
 */
export function relevanceStallDecision(
  rows: readonly RunRow[] | null,
  gh: readonly GhRun[] | null,
  o: { now: Date; cooldownMs: number; stallHours?: number; minUnjudged?: number },
): StallDecision {
  const now = o.now.getTime()
  const stallMs = (o.stallHours ?? 6) * 3_600_000
  const minUnjudged = o.minUnjudged ?? 500
  const d = (kind: StallKind, reason: string, x: Partial<StallDecision> = {}): StallDecision => ({ kind, rerun: false, alert: false, limit: false, reason, ...x })
  if (gh && gh.some(r => BUSY.includes(r.status))) return d('busy', '판정 실행이 진행/대기 중 — 보지 않는다')
  if (!rows) return d('unknown', '실행 이력(agent_runs) 조회 실패 — 확인 불가라 건드리지 않는다')
  const mine = rows
    .filter(r => r.run_key.startsWith('relevance-judge-') && !r.run_key.endsWith('-local'))
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))
  const last = mine[0]
  if (!last) return d('unknown', '판정 실행 기록 없음(7일) — 확인 불가')
  const dispatchedSince = (t: number) => (gh ?? []).some(r => r.event === 'workflow_dispatch' && Date.parse(r.createdAt) >= t)

  if (last.status !== 'running' && isQuotaBlocked(last)) {
    const reset = Date.parse(String(last.summary?.quota_reset_at ?? ''))
    const fin = Date.parse(last.finished_at ?? '')
    const due = Number.isFinite(reset) ? (Number.isFinite(fin) ? Math.max(reset, fin + 30 * 60_000) : reset) : Number.isFinite(fin) ? fin + o.cooldownMs : NaN
    if (!Number.isFinite(due)) return d('unknown', `한도 정지(${last.run_key}) 시각 확인 불가 — 건드리지 않는다`, { limit: true })
    const src = Number.isFinite(reset) ? 'CLI 리셋 시각' : `정지 + ${o.cooldownMs / 3_600_000}시간`
    if (now < due) return d('quota_wait', `한도 정지(${last.run_key}) — ${new Date(due).toISOString()}(${src}) 이후 재개 가능`, { limit: true })
    if (!gh) return d('unknown', `한도 정지(${last.run_key}) 재개 시각 지남 — 실행 이력(gh) 미조회라 재실행 여부 확인 불가`, { limit: true })
    if (dispatchedSince(due)) return d('quota_retried', `한도 정지(${last.run_key}) 뒤 ${new Date(due).toISOString()} 이후 수동 실행이 이미 있었다 — 1회 한정이라 더 안 건다`, { limit: true })
    return d('quota_resume', `한도 정지(${last.run_key}) 뒤 ${src} ${new Date(due).toISOString()} 지남 · 그 뒤 실행 없음 — 1회 재실행`, { rerun: true, alert: true, limit: true })
  }

  if (gh) {
    const done = gh.filter(r => r.status === 'completed').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    let streak = 0
    while (streak < done.length && FAILED.includes(String(done[streak].conclusion))) streak += 1
    if (streak >= 3) {
      // 경보는 새 사건일 때만(가장 최근 실패가 45분 안에 끝남) — 30분 감시가 같은 사건을 매번 올리지 않게. 대장에는 매번 남는다.
      const fresh = now - Date.parse(done[0].updatedAt ?? done[0].createdAt) <= 45 * 60_000
      return d('fail_alert', `최근 끝난 판정 실행 ${streak}건 연속 실패/취소 — 자동 재실행 안 함(사람이 볼 것)`, { alert: fresh })
    }
    if (streak === 2) {
      if (dispatchedSince(now - 60 * 60_000)) return d('fail_alert', '연속 2건 실패 · 60분 안에 수동 실행이 이미 있다 — 더 안 건다')
      return d('fail_rerun', '최근 끝난 판정 실행 2건 연속 실패/취소 — 1회 재실행', { rerun: true, alert: true })
    }
  }

  const left = Number(last.summary?.unjudged_after)
  if (Number.isFinite(left) && left >= minUnjudged) {
    const inWin = mine.filter(r => now - Date.parse(r.started_at ?? '') <= stallMs)
    const judged = inWin.reduce((s, r) => s + (Number(r.summary?.judged) || 0), 0)
    const lastWork = mine.find(r => (Number(r.summary?.judged) || 0) > 0)
    const since = lastWork ? Date.parse(lastWork.finished_at ?? lastWork.started_at ?? '') : NaN
    if (judged === 0 && (!Number.isFinite(since) || now - since >= stallMs)) {
      // 경보는 정체가 막 stallHours 를 넘은 45분 창에서만(새 사건). 마지막 처리 기록조차 없으면 매번 대장에만.
      const fresh = Number.isFinite(since) && now - since < stallMs + 45 * 60_000
      const why = String((last.summary?.chain as { reason?: unknown } | undefined)?.reason ?? last.status)
      return d('zero_progress', `미판정 ${left}건인데 ${o.stallHours ?? 6}시간 판정 0건 — 마지막 정지 사유: ${why}. 자동 재실행 안 함(의도된 정지일 수 있다)`, { alert: fresh })
    }
  }
  return d('ok', `정상 — 마지막 ${last.run_key}(${last.status})${Number.isFinite(left) ? ` · 남은 미판정 ${left}` : ''}`)
}

/** 대장·요약 한 줄. */
export function stallLine(s: StallDecision): string {
  const tag = s.kind === 'ok' ? '정상' : s.kind === 'busy' ? '진행 중' : s.kind === 'unknown' ? '확인 불가' : s.limit ? '한도' : '정체'
  return `- 판정 정체(⑮ v71bb): [${tag}] ${s.reason}${s.rerun ? ' → 재실행 1회' : ''}`
}

/**
 * nightly-relevance 한 실행의 run_key 접미사 — 판정(relevance-judge)과 뒤 스텝(2차·자동 승인·ca-v1)이 한 벌로 쓴다.
 * 정규 '' · 정규 2회차 '-s2' · 재시도 '-r1' · 수동 '-m<run_id>' · 로컬 '-local'. 재시도·수동이 같은 날 정규 행을 덮지 않게 한다(createTracker 는 run_key upsert).
 * 표에 없는 크론은 throw — yml 과 코드가 갈라진 것을 조용히 정규로 접지 않는다.
 */
export function relevanceRunSuffix(env: { eventName?: string; slotCron?: string; runId?: string; actions?: string }): string {
  if (env.eventName === 'schedule') {
    const slot = RELEVANCE_SLOTS[(env.slotCron ?? '').trim()]
    if (!slot) throw new Error(`슬롯 표에 없는 크론 '${env.slotCron ?? ''}' — nightly-relevance.yml 과 RELEVANCE_SLOTS 를 맞춰라`)
    return slot === 'main' ? '' : `-${slot}`
  }
  return env.actions ? `-m${env.runId ?? ''}` : '-local'
}

/** 위 접미사를 process.env 에서 — 스크립트 3곳(2차·자동 승인·ca-v1)이 한 줄로 쓴다. */
export const relevanceRunSuffixFromEnv = () => relevanceRunSuffix({
  eventName: process.env.GITHUB_EVENT_NAME, slotCron: process.env.RELEVANCE_SLOT_CRON, runId: process.env.GITHUB_RUN_ID, actions: process.env.GITHUB_ACTIONS,
})
