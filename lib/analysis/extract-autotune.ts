// extract 하루 건수 자동 조정(남헌 v36 §2, 2026-10-08). 순수함수만 — DB 조회·쓰기는 scripts/extract-auto.mjs 가 한다.
//
// 조정 대상은 **하루 추출 건수 D** 하나다. 슬롯당 건수 = ceil(D÷3). 시작 48 · 범위 24~72 · 슬롯 상한 24(= 72÷3).
// 스위치 리포 변수 EXTRACT_AUTOTUNE(기본 off). off 면 이 파일은 cap_binding 기록(capBindingOf)만 쓰이고 결정은 기존과 같다.
//
// 저장은 마이그 없이 agent_runs.summary.autotune 한 곳(§10.1 허용 테이블). 모든 run 이 유효 D 를 복사하고 다음 run 이 읽는다.
// 하루 1회(KST 그날 첫 스케줄 run)만 평가한다. 근거(윈도 run_key·사용률·cap_binding·대기 수)를 같은 블록에 남긴다.
//
// 규칙(남헌 v36 원문 요지):
//   올리기 +20%: 직전 3회(스케줄 s1~s3 · decision=run · 비용 전부 읽힘 · 마지막 조정 이후 · 7일 이내) 평균 사용률 < 8%
//               ∧ 각 run 의 cap_binding ∈ slot/daily/none ∧ 처리 대기 프로젝트 > 0(이 슬롯이 쉬지 않는다).
//               ∧ (남헌 v40 §1 조건 B) 윈도에 slot·daily 로 끝난 run 이 1건 이상 — D 가 처리량을 막은 증거. none 만이면 올리지 않는다.
//   내리기 −20%: hard 캡 도달 · 세션 한도 오류(quota) · 주간 사용률 > 안전선. soft 한도(cost)로 멈춘 run 은 근거에서 뺀다.
//   사용률 = run 전 호출 합(summary.session.spent_usd — llm.ts 누적기) ÷ usd_per_session_pct. 분모는 세션 100%.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { isQuotaBlocked } from './extract-auto.ts'

export const AUTOTUNE = {
  start: 48,
  min: 24,
  max: 72,
  slotCeil: 24,
  stepPct: 0.2,
  upBelowPct: 8,
  window: 3,
  windowDays: 7,
} as const

/** 리포 변수 EXTRACT_AUTOTUNE — 'on'(또는 'true')일 때만 켠다. 그 밖의 값·미설정은 off. */
export const autotuneOn = (v = process.env.EXTRACT_AUTOTUNE) => ['on', 'true'].includes(String(v ?? '').trim().toLowerCase())

export const clampD = (d: number) => Math.min(AUTOTUNE.max, Math.max(AUTOTUNE.min, Math.round(d)))
/** 한 스텝 = round(D × 20%), 최소 1. */
export const stepOf = (d: number) => Math.max(1, Math.round(d * AUTOTUNE.stepPct))
export const slotMaxOf = (d: number) => Math.min(AUTOTUNE.slotCeil, Math.ceil(d / 3))

export type CapBinding = 'slot' | 'daily' | 'cost' | 'hard' | 'none'

/**
 * 이 run 이 왜 멈췄나(§7.2 — 걸려 끝난 run 이 이유를 남긴다). 스위치와 무관하게 매 run 기록한다.
 * slot=슬롯 상한 · daily=하루 상한 · cost=소프트 한도(15%, 비용 확인 불가 정지 포함) · hard=하드 캡 · none=대기 소진으로 자연 종료.
 * 다섯에 안 드는 정지(구독 한도 quota · 주간 스위치 · 가드 설정 깨짐 · 쿨다운/확인 불가로 쉼)는 null — 이유는 stop_reason·reason 에 있다.
 */
export function capBindingOf(i: {
  decision: 'run' | 'skip'
  /** decideSlot 의 cap — 하루 상한으로 쉰 것만 'daily'. */
  skipCap?: string | null
  /** decideSlot 의 warn — 쿨다운·이력 확인 불가로 쉰 것. */
  skipWarn?: boolean
  stopReason?: string | null
  remaining?: number
  gateMax?: number
  slotMax?: number
}): CapBinding | null {
  if (i.decision === 'skip') return i.skipCap === 'daily' ? 'daily' : i.skipWarn ? null : 'none'
  if (i.stopReason === 'session_cap' || i.stopReason === 'cost_unknown') return 'cost'
  if (i.stopReason === 'hard_cap') return 'hard'
  if (i.stopReason) return null
  if ((i.remaining ?? 0) > 0) return (i.gateMax ?? 0) >= (i.slotMax ?? 0) ? 'slot' : 'daily'
  return 'none'
}

type Row = { run_key: string; status: string; summary?: Record<string, unknown> | null; started_at?: string | null }

const tuneOf = (r: Row) => (r.summary?.autotune ?? null) as Record<string, unknown> | null
const at = (r: Row) => Date.parse(r.started_at ?? '')
/** 스케줄 슬롯 run 인가 — run_key 로 가른다(수동 slot=s1 입력도 run_key 는 m<run_id>). */
export const isScheduledKey = (k: string) => /-s[123]$/.test(k)
const ran = (r: Row) => r.status !== 'running' && r.summary?.decision === 'run'
/** 옛 행(cap_binding 없음)도 stop_reason 으로 cost 정지를 알아본다 — 내리기 근거에서 빼야 하므로. */
const isCostStop = (r: Row) => r.summary?.cap_binding === 'cost' || ['session_cap', 'cost_unknown'].includes(String(r.summary?.stop_reason ?? ''))
const isHard = (r: Row) => r.summary?.cap_binding === 'hard' || r.summary?.stop_reason === 'hard_cap'

/**
 * 한 run 의 세션 사용률(%). null(윈도 제외) = session 블록 없음 · 비용 못 읽은 호출 있음 · claude 호출 0회.
 * 호출 0회(대상 전부 claim 건너뜀 등)는 "적게 썼다"가 아니라 "안 썼다"다 — 0% 로 평균을 끌어내리지 않는다(§7.1).
 */
export function runUsedPct(r: Row, usdPerPct: number | null): number | null {
  const s = (r.summary?.session ?? null) as Record<string, unknown> | null
  if (!s || !usdPerPct) return null
  if (typeof s.cost_unknown_calls !== 'number' || s.cost_unknown_calls !== 0) return null
  if (typeof s.claude_calls !== 'number' || s.claude_calls <= 0) return null
  return typeof s.spent_usd === 'number' && Number.isFinite(s.spent_usd) ? Number((s.spent_usd / usdPerPct).toFixed(2)) : null
}

/**
 * 직전 기록된 유효 D. 없으면 시작값 48(최초). 행은 시각 내림차순이 아니어도 된다.
 * source='unreadable' 행(이력을 못 읽어 하한 24 로 돈 run)의 d 는 잇지 않는다 — 한 번의 조회 실패가 근거 없는 −조정으로 굳지 않게.
 */
export function carriedD(rows: readonly Row[]): { d: number; source: 'chain' | 'initial'; from: string | null } {
  const hit = [...rows].sort((a, b) => at(b) - at(a))
    .find(r => typeof tuneOf(r)?.d === 'number' && Number.isFinite(tuneOf(r)?.d) && tuneOf(r)?.source !== 'unreadable')
  return hit ? { d: clampD(tuneOf(hit)?.d as number), source: 'chain', from: hit.run_key } : { d: AUTOTUNE.start, source: 'initial', from: null }
}

export type WeeklySafety = { state: 'disabled' | 'ok' | 'over' | 'unknown'; pct: number | null; safe_pct: number | null }

/**
 * 주간 안전선. safePct(config autotune_weekly_safe_pct) 가 null 이면 'disabled' — 평가하지 않는다(남헌이 N 을 정할 때까지).
 * 설정됐는데 계수·이력을 모르면 'unknown' — 올리지 않는다(내리지도 않는다).
 */
export function weeklySafety(safePct: number | null, usdPerWeeklyPct: number | null, weekUsd: number | null): WeeklySafety {
  if (safePct == null) return { state: 'disabled', pct: null, safe_pct: null }
  if (usdPerWeeklyPct == null || weekUsd == null) return { state: 'unknown', pct: null, safe_pct: safePct }
  const pct = Number((weekUsd / usdPerWeeklyPct).toFixed(2))
  return { state: pct > safePct ? 'over' : 'ok', pct, safe_pct: safePct }
}

export type AutotuneDecision = {
  /** 이번 run 이 쓰는 유효 D(조정 반영). */
  d: number
  slot_max: number
  /** 이번 run 이 그날의 평가를 했나(하루 1회). */
  evaluated: boolean
  action: 'up' | 'down' | 'hold' | null
  prev: number
  next: number
  reason: string
  source: 'chain' | 'initial' | 'unreadable'
  window: { run_key: string; used_pct: number | null; cap_binding: unknown }[]
  avg_pct: number | null
  pending: number
  slot_runs: boolean
  down_signals: string[]
  weekly: WeeklySafety
}

/**
 * 하루 1회 평가(순수함수). rows = 최근 7일 extract-auto 행(null = 조회 실패).
 * runKey 로 스케줄 여부를 가른다(수동 slot=s1 입력은 run_key 가 m<run_id> 라 평가하지 않는다).
 * slotRuns = 조정 전 D 로 이 슬롯 게이트가 돌 것인가 — false 면(쉬는 날) 올리지 않는다.
 */
export function decideAutotune(i: {
  rows: readonly Row[] | null
  runKey: string
  today: string
  now: Date
  pending: number
  slotRuns: boolean
  usdPerPct: number | null
  weekly: WeeklySafety
}): AutotuneDecision {
  const base = { window: [] as AutotuneDecision['window'], avg_pct: null, pending: i.pending, slot_runs: i.slotRuns, down_signals: [] as string[], weekly: i.weekly }
  const keep = (d: number, source: AutotuneDecision['source'], evaluated: boolean, action: AutotuneDecision['action'], reason: string, extra: Partial<AutotuneDecision> = {}): AutotuneDecision =>
    ({ ...base, d, slot_max: slotMaxOf(d), evaluated, action, prev: d, next: d, reason, source, ...extra })

  // 이력을 못 읽으면 지금 D 를 모른다 — 하한으로 돈다(올리는 쪽으로 접지 않는다). 평가도 안 한다.
  if (!i.rows) return keep(AUTOTUNE.min, 'unreadable', false, null, `실행 이력(agent_runs) 확인 불가 — 하한 ${AUTOTUNE.min} 으로 돈다, 평가 안 함`)

  const rows = [...i.rows].filter(r => r.run_key.startsWith('extract-auto-')).sort((a, b) => at(b) - at(a))
  const cur = carriedD(rows)
  if (!isScheduledKey(i.runKey)) return keep(cur.d, cur.source, false, null, '수동·로컬 실행 — 평가하지 않고 유효 D 만 이어 쓴다')
  if (rows.some(r => r.run_key.startsWith(`extract-auto-${i.today}-s`) && tuneOf(r)?.evaluated === true)) {
    return keep(cur.d, cur.source, false, null, `오늘(${i.today}) 이미 평가함 — 하루 1회`)
  }

  const nowMs = i.now.getTime()
  const weekAgo = nowMs - AUTOTUNE.windowDays * 86_400_000
  const lastEval = rows.find(r => tuneOf(r)?.evaluated === true)
  const lastAdj = rows.find(r => ['up', 'down'].includes(String(tuneOf(r)?.action)))

  // ── 내리기: 지난 평가 이후(없으면 24시간) 의 hard 캡·한도 오류. 수동 run 도 센다(한도는 구독 전체 사건). cost 정지는 뺀다.
  const downSince = Math.max(weekAgo, lastEval ? at(lastEval) : nowMs - 86_400_000)
  const signals = rows.filter(r => ran(r) && at(r) >= downSince && !isCostStop(r) && (isHard(r) || isQuotaBlocked(r)))
  const downWhy = [
    ...signals.map(r => `${r.run_key} ${isHard(r) ? 'hard 캡' : '한도 오류'}`),
    ...(i.weekly.state === 'over' ? [`주간 ${i.weekly.pct}% > 안전선 ${i.weekly.safe_pct}%`] : []),
  ]
  const move = (action: 'up' | 'down', reason: string, extra: Partial<AutotuneDecision>): AutotuneDecision => {
    const next = clampD(action === 'up' ? cur.d + stepOf(cur.d) : cur.d - stepOf(cur.d))
    if (next === cur.d) return keep(cur.d, cur.source, true, 'hold', `${reason} — 이미 ${action === 'up' ? '상한' : '하한'} ${cur.d}`, extra)
    return { ...base, ...extra, d: next, slot_max: slotMaxOf(next), evaluated: true, action, prev: cur.d, next, reason, source: cur.source }
  }
  if (downWhy.length) return move('down', `내리기 — ${downWhy.join(' · ')}`, { down_signals: signals.map(r => r.run_key) })

  // ── 올리기: 마지막 조정 이후 · 7일 이내 · 스케줄 · decision=run · 스위치 on 으로 돈 run(summary.autotune 있음)
  //    · cap_binding 기록 있음 · 비용 전부 읽힘 · claude 호출 ≥1 — 최근 3회.
  //    off 시절 run 은 다른 상한(변수값)으로 돈 것이라 근거가 아니다 — 켠 직후 첫 평가는 윈도 부족 무변경이 정상이다.
  const upSince = Math.max(weekAgo, lastAdj ? at(lastAdj) : -Infinity)
  // 180분 timeout 등으로 죽은 run 은 'running' 으로 남아 윈도에서 빠진다 — 직전 스케줄 run 3개 중 하나라도 그러면 올리지 않는다.
  const stale = rows
    .filter(r => isScheduledKey(r.run_key) && at(r) >= upSince && r.summary?.decision !== 'skip')
    .slice(0, AUTOTUNE.window)
    .filter(r => r.status === 'running')
  const window = rows
    .filter(r => ran(r) && isScheduledKey(r.run_key) && at(r) >= upSince && tuneOf(r) && r.summary && 'cap_binding' in r.summary)
    .map(r => ({ run_key: r.run_key, used_pct: runUsedPct(r, i.usdPerPct), cap_binding: r.summary?.cap_binding }))
    .filter(w => w.used_pct != null)
    .slice(0, AUTOTUNE.window)
  const avg = window.length ? Number((window.reduce((s, w) => s + (w.used_pct as number), 0) / window.length).toFixed(2)) : null
  const extra = { window, avg_pct: avg }
  if (window.length < AUTOTUNE.window) return keep(cur.d, cur.source, true, 'hold', `윈도 부족 ${window.length}/${AUTOTUNE.window}(마지막 조정 이후·비용 읽힌 스케줄 run) — 무변경`, extra)
  if (i.weekly.state === 'unknown') return keep(cur.d, cur.source, true, 'hold', '주간 안전선 설정됐는데 주간 사용률 확인 불가 — 올리지 않는다', extra)

  const bound = window.filter(w => !['slot', 'daily', 'none'].includes(String(w.cap_binding)))
  // 조건 B(남헌 v40 §1): none(대기 소진 종료)은 D 가 막지 않았다는 뜻 — slot·daily 종료가 1건은 있어야 D 를 올릴 근거가 된다.
  const dBound = window.filter(w => ['slot', 'daily'].includes(String(w.cap_binding)))
  const misses = [
    (avg as number) >= AUTOTUNE.upBelowPct ? `평균 ${avg}% ≥ ${AUTOTUNE.upBelowPct}%` : null,
    bound.length ? `cap_binding ${bound.map(w => `${w.run_key}=${w.cap_binding}`).join(',')}` : null,
    dBound.length === 0 ? `D 가 막은 증거 없음(윈도 ${window.length}건 중 slot·daily 종료 0건 — ${window.map(w => w.cap_binding).join('/')})` : null,
    i.pending <= 0 ? '처리 대기 0건' : null,
    i.pending > 0 && !i.slotRuns ? '이 슬롯이 쉰다(백로그가 문턱 미만)' : null,
    stale.length ? `끝나지 않은(running) 스케줄 run ${stale.map(r => r.run_key).join(',')} — timeout 으로 죽었을 수 있다` : null,
  ].filter(Boolean)
  if (misses.length) return keep(cur.d, cur.source, true, 'hold', `무변경 — ${misses.join(' · ')}`, extra)
  return move('up', `올리기 — 평균 ${avg}% < ${AUTOTUNE.upBelowPct}% · cap_binding ${window.map(w => w.cap_binding).join('/')} · 대기 ${i.pending}건`, extra)
}

/** 로그·Notion 한 줄. */
export function autotuneLine(t: AutotuneDecision): string {
  const head = t.action === 'up' || t.action === 'down' ? `D ${t.prev}→${t.next}(${t.action === 'up' ? '+' : '−'}${Math.abs(t.next - t.prev)})` : `D ${t.d}`
  const win = t.window.length ? ` · 윈도 ${t.window.map(w => `${w.run_key.replace('extract-auto-', '')} ${w.used_pct}% ${w.cap_binding}`).join(', ')}` : ''
  return `extract 자동 조정 ${head} · 슬롯 ${t.slot_max}건 · ${t.reason}${win} · 대기 ${t.pending}건 · 주간 ${t.weekly.state}`
}
