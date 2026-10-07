// 구독 세션 한도 가드(남헌 v30 §5, A안). 토큰을 쓰는 작업 단위(야간 T2 1회 · extract 슬롯 1회)마다
// "5시간 세션의 N%"(config/session-guard.json session_cap_pct, 시작 15%)를 **상한**으로 둔다. 목표가 아니다.
//
// 돈 단위: claude-cli 봉투 total_cost_usd(API 환산 명목값, llm.ts cliSpent()가 프로세스 단위로 합산).
// %p 환산: usd_per_session_pct(설정값 — 남헌이 수동으로 잰 %p 와 대조해 고친다. 절차는 docs/session-limit-guard.md).
// 하루 합산 상한은 두지 않는다(남헌 결정). 대신 5시간 슬라이딩 창의 합산 사용률을 로그·summary 에 남겨 눈에 보이게만 한다.
//
// 기존 장치와의 경계(중복 구현 금지):
//   · 한도 소진 오류 판정 = llm.ts isQuotaFailure / 리셋 시각 = extract-auto.ts parseQuotaResetAt
//   · 재시도 간격·횟수 = extract-auto.ts QUOTA_COOLDOWN_MS · BLOCKED_ALARM_STREAK(원래 1회 + 재시도 2회)
//   이 파일은 "상한에 닿기 전에 멈춘다"와 "얼마나 썼나를 남긴다"만 더한다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 스크립트 전용(앱 번들에 넣지 않는다).

import fs from 'node:fs'
import path from 'node:path'
import { isQuotaBlocked } from './extract-auto.ts'

export type GuardConfig = {
  capPct: number | null
  usdPerPct: number | null
  weeklyStopPct: number | null
  usdPerWeeklyPct: number | null
}

const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export function parseGuardConfig(raw: Record<string, unknown> | null | undefined): GuardConfig {
  const r = raw ?? {}
  return {
    capPct: pos(r.session_cap_pct),
    usdPerPct: pos(r.usd_per_session_pct),
    weeklyStopPct: pos(r.weekly_stop_pct),
    usdPerWeeklyPct: pos(r.usd_per_weekly_pct),
  }
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
 * 다음 단위(프로젝트 1건·판정 묶음 1개)를 시작하기 **전에** 부른다.
 * 지금까지 쓴 돈 + 지금까지 본 가장 비싼 단위 하나가 상한을 넘으면 멈춘다 — 상한을 "넘고 나서" 멈추면
 * 단위 1개(extract 최대 ~$0.3+프로필)만큼 넘친다. 첫 단위는 크기를 모르므로 spent ≥ cap 일 때만 막는다.
 */
export function capReached(spentUsd: number, maxUnitUsd: number, capUsd: number): boolean {
  return spentUsd >= capUsd || (maxUnitUsd > 0 && spentUsd + maxUnitUsd > capUsd)
}

/**
 * 상한 판정에 쓸 지출($). 비용을 못 읽은 호출(timeout SIGKILL·2MB 초과 출력·봉투 없음)을 0 으로 접지 않는다(§7.1):
 *   · unknown 이 없으면 읽은 합 그대로
 *   · unknown 이 있고 읽은 호출이 하나라도 있으면 unknown × 지금까지 본 호출 1회 최대 비용을 더한다(보수적 추정)
 *   · unknown 이 있는데 비교할 호출이 하나도 없으면 null = 확인 불가 → 호출부는 멈춘다
 * 왜 "unknown>0 이면 무조건 멈춤"이 아닌가: timeout 은 입력이 큰 프로젝트 하나의 문제라(llm.ts isCliLimitError) 한 건마다
 * 슬롯 전체를 세우면 남은 프로젝트가 매번 밀린다. 근거(본 호출의 최대값)가 있을 때는 추정하고, 근거가 없을 때만 멈춘다.
 * ponytail: timeout 호출은 600초를 다 쓴 것이라 실제로는 최대값보다 클 수 있다 — 넘침이 보이면 계수를 2배로 올린다.
 */
export function spendForCap(t: { usd: number; unknown: number; maxCallUsd: number }): number | null {
  if (t.unknown === 0) return t.usd
  return t.maxCallUsd > 0 ? t.usd + t.unknown * t.maxCallUsd : null
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
}) {
  const capUsd = i.job === 'translate' ? null : capUsdOf(i.cfg) // 번역은 기록만(남헌 결정 전 상한 없음)
  const winUsd = i.window5h ? Number((i.window5h.usd + i.spentUsd).toFixed(4)) : null
  return {
    job: i.job,
    spent_usd: Number(i.spentUsd.toFixed(4)),
    spent_for_cap_usd: i.spentForCapUsd === undefined ? Number(i.spentUsd.toFixed(4)) : i.spentForCapUsd == null ? null : Number(i.spentForCapUsd.toFixed(4)),
    used_pct: pctOf(i.spentUsd, i.cfg.usdPerPct),
    cap_usd: capUsd == null ? null : Number(capUsd.toFixed(4)),
    cap_pct: i.job === 'translate' ? null : i.cfg.capPct,
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

/** nightly-relevance.yml 크론 → 슬롯. main 은 정규 1회, r1·r2 는 한도 정지 뒤 재시도 전용(일이 없으면 기록 없이 끝난다). */
export const RELEVANCE_SLOTS: Readonly<Record<string, string>> = { '3 19 * * *': 'main', '3 2 * * *': 'r1', '3 6 * * *': 'r2' }

/**
 * T2 재시도 슬롯이 일할 차례인가(순수함수). rows = 최근 relevance-judge 행.
 * 오늘(KST) 정규/재시도 실행 중 가장 최근 것이 한도로 멈췄고, 재시도를 maxRetries 번 덜 썼고,
 * 리셋 시각(있으면) 또는 정지 + cooldownMs 가 지났으면 돈다. 수동(-m)·로컬 실행은 세지 않는다.
 */
export function relevanceRetryDecision(
  rows: readonly RunRow[],
  o: { today: string; now: Date; cooldownMs: number; maxRetries: number },
): { run: boolean; reason: string; retriesDone: number; quotaPending: boolean } {
  const base = `relevance-judge-${o.today}`
  const mine = rows
    .filter(r => r.run_key === base || (r.run_key.startsWith(base) && /^-r\d+$/.test(r.run_key.slice(base.length))))
    .filter(r => r.status !== 'running')
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))
  const retriesDone = mine.filter(r => r.run_key !== base).length
  const last = mine[0]
  // quotaPending = 마지막 기록이 한도 정지로 남아 있다 — r2(그날 마지막 재시도 자리)가 이 상태로 쉬면 경보한다.
  const out = (run: boolean, reason: string, quotaPending: boolean) => ({ run, reason, retriesDone, quotaPending })
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
 * nightly-relevance 한 실행의 run_key 접미사 — 판정(relevance-judge)과 뒤 스텝(2차·자동 승인·ca-v1)이 한 벌로 쓴다.
 * 정규 '' · 재시도 '-r1'/'-r2' · 수동 '-m<run_id>' · 로컬 '-local'. 재시도·수동이 같은 날 정규 행을 덮지 않게 한다(createTracker 는 run_key upsert).
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
