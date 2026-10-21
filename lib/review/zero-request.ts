// 요청 0 사유 판정 — "최근 24시간 요청이 0 인 enabled 소스는 사유 코드가 있어야 하고, 없으면 경보"(남헌 v51 §1 항목 10).
//
// 순수 함수만. DB·네트워크는 scripts/cron-watchdog.mjs 가 읽어서 넘긴다(셀프테스트: scripts/zero-request-selftest.mjs).
//
// 왜: enabled 인데 하루 동안 요청이 0 인 소스는 둘 중 하나다 — 설명되는 정지(타깃 소진·램프 0·상한 0·robots 금지·차단 뒤)
// 거나, 아무도 모르는 고장(어댑터 미배선·러너가 조용히 건너뜀). 후자는 에러를 안 낸다. 그래서 "사유 없는 0" 을
// 불변식 위반으로 올린다(§7.1). status='ok' 인데 타깃 0·요청 0 인 실행은 정상이 아니라 확인 대상이다(§7.2) —
// 그 실행이 있어도 사유 계산은 똑같이 하고, 줄에 횟수를 남긴다.
//
// ⚠️ 요청 > 0 인 소스는 건드리지 않는다(여기서 판정하지 않는다).

import { isOwnerRobotsOverride } from './runner.ts'
import { RAMP_EXCLUDED } from './ramp.ts'

export const ZERO_WINDOW_MS = 24 * 60 * 60 * 1000

export type ZeroReason =
  | 'no_active_targets' // 활성 타깃 0 — 전부 exhausted/failed
  | 'source_excluded' // robots 금지 확정(소유자 예외 없음) — 러너가 매 실행 0요청
  | 'ramp_frozen' // review_source_ramp.frozen_until > now
  | 'ramp_target_zero' // 퍼센트 램프 오늘 목표 0
  | 'cap_exhausted' // 일일 상한이 0 이하(요청 0 인 날엔 "오늘 이미 상한" 이 이것뿐이다)
  | 'blocked_recent' // 마지막 실제 실행이 차단(403/429) 또는 broken — soft-skip 으로 실행 행이 없다
  | 'unknown'

export type ZeroSourceRow = { key: string; enabled: boolean | null; daily_request_cap: number | null; robots_status: string | null; override: string | null }
export type ZeroRampRow = { source_key: string; frozen_until: string | null; daily_request_target: number | null; supply_state: string | null; cap_base: number | null }
export type ZeroRunRow = { source_key: string; started_at: string; requests: number | null; targets_visited: number | null; status: string | null; dry_run?: boolean | null }
export type LastRunRow = { started_at: string; status: string | null; blocked_responses: number | null; health_after: string | null }

export type ZeroInput = {
  now: Date
  sources: ZeroSourceRow[]
  /** null = review_source_ramp 확인 불가. */
  ramps: ZeroRampRow[] | null
  /** 최근 24h 실행(dry_run=false). 창 밖·dry_run 행이 섞여 와도 여기서 다시 거른다. */
  runs: ZeroRunRow[]
  /** 요청 0 소스별 활성 타깃 수. 키 없음 = 확인 불가. */
  activeTargets: Record<string, number>
  /** 요청 0 소스별 마지막 실제 실행(창과 무관). null = 실행 기록 없음, 키 없음 = 확인 불가. */
  lastRun: Record<string, LastRunRow | null>
}

export type ZeroVerdict = { key: string; reasons: ZeroReason[]; runs: number; idleOk: number; failed: number; notes: string[] }

/**
 * 일감 없음 skip(v71ba P0-3) — 스케줄(--source=all) 실행에서 실행 행을 만들기 전에 건너뛸 사유. 없으면 null(지금처럼 돈다).
 * 2026-10-22 실측: 활성 타깃 0 인 enabled 소스 14곳 + 꺼진 소스 2곳이 3일 9~16회씩 "타깃 0·요청 0" 실행 행만 남겼다(§7.2 확인 대상 소음).
 * 3상태(§7.1): enabled 를 못 읽음(undefined)·활성 수를 못 읽음(null)은 skip 사유가 아니다 — 러너가 지금처럼 판정한다.
 * 요청 0 감시(judgeZeroRequests)는 실행 행이 아니라 활성 타깃 수로 사유(no_active_targets)를 내므로 행이 없어도 경보가 나지 않는다.
 */
export function idleSkipReason(enabled: boolean | null | undefined, activeTargets: number | null): string | null {
  if (enabled === false) return '소스 꺼짐(enabled=false) — 실행 행 없이 건너뜀'
  if (enabled === true && activeTargets === 0) return '일감 없음 — 활성 타깃 0(되살리기·발굴 뒤 다음 슬롯에 다시 본다)'
  return null
}

/** 최근 24h 요청 합이 0 인 enabled 소스 키. 창 안 실행이 없어도 0 이다. */
export function zeroRequestKeys(sources: ZeroSourceRow[], runs: ZeroRunRow[], now: Date): string[] {
  const since = now.getTime() - ZERO_WINDOW_MS
  const sum = new Map<string, number>()
  for (const r of runs) {
    if (r.dry_run === true || Date.parse(r.started_at) < since) continue
    sum.set(r.source_key, (sum.get(r.source_key) ?? 0) + Number(r.requests ?? 0))
  }
  return sources.filter((s) => s.enabled === true && (sum.get(s.key) ?? 0) === 0).map((s) => s.key).sort()
}

/** 요청 0 enabled 소스마다 사유 코드. 사유가 하나도 없으면 ['unknown'] — 경보 대상. */
export function judgeZeroRequests(input: ZeroInput): ZeroVerdict[] {
  const { now, sources, ramps, runs, activeTargets, lastRun } = input
  const since = now.getTime() - ZERO_WINDOW_MS
  const byKey = new Map(sources.map((s) => [s.key, s]))
  const rampOf = new Map((ramps ?? []).map((r) => [r.source_key, r]))
  return zeroRequestKeys(sources, runs, now).map((key) => {
    const s = byKey.get(key) as ZeroSourceRow
    const mine = runs.filter((r) => r.source_key === key && r.dry_run !== true && Date.parse(r.started_at) >= since)
    const reasons: ZeroReason[] = []
    const notes: string[] = []

    if (!(key in activeTargets)) notes.push('활성 타깃 확인 불가')
    else if (activeTargets[key] === 0) reasons.push('no_active_targets')

    if (s.robots_status === 'disallowed' && !isOwnerRobotsOverride(s.override, s.robots_status)) reasons.push('source_excluded')

    const ramp = rampOf.get(key)
    if (ramps === null) notes.push('램프 확인 불가')
    else if (ramp) {
      if (ramp.frozen_until && Date.parse(ramp.frozen_until) > now.getTime()) reasons.push('ramp_frozen')
      // 램프 제외 소스(danawa·todayhumor)는 러너가 목표를 안 본다 — 목표 0 이 사유가 되지 않는다.
      if (!RAMP_EXCLUDED.has(key) && typeof ramp.cap_base === 'number' && ramp.cap_base > 0 && ramp.daily_request_target === 0) reasons.push('ramp_target_zero')
      if (ramp.supply_state) notes.push(`공급 ${ramp.supply_state}`)
    }

    // 러너 예산 = min(cap, 목표) − 오늘 쓴 요청. 24h 요청이 0 이면 오늘 쓴 요청도 0 이라(KST 하루 ⊂ 24h 창) 남는 경우는 cap ≤ 0 뿐.
    if (typeof s.daily_request_cap === 'number' && s.daily_request_cap <= 0) reasons.push('cap_exhausted')

    if (!(key in lastRun)) notes.push('마지막 실행 확인 불가')
    else {
      const l = lastRun[key]
      if (l && (Number(l.blocked_responses ?? 0) > 0 || l.health_after === 'broken')) reasons.push('blocked_recent')
      if (!l) notes.push('실행 기록 없음')
    }

    const idleOk = mine.filter((r) => r.status === 'ok' && !Number(r.targets_visited ?? 0) && !Number(r.requests ?? 0)).length
    const failed = mine.filter((r) => r.status !== 'ok').length
    return { key, reasons: reasons.length ? reasons : ['unknown'], runs: mine.length, idleOk, failed, notes }
  })
}

const runPart = (v: ZeroVerdict) =>
  `24h 실행 ${v.runs}회${v.idleOk ? ` (ok 인데 타깃·요청 0 ${v.idleOk}회 — 정상 아님)` : ''}${v.failed ? ` · ok 아닌 실행 ${v.failed}회` : ''}${v.notes.length ? ` · ${v.notes.join(' · ')}` : ''}`

/** 판정 → { alerts: 경보 줄(사유 없는 0), lines: 요약 줄(사유 있는 0) }. */
export function zeroRequestReport(verdicts: ZeroVerdict[]): { alerts: string[]; lines: string[] } {
  const alerts: string[] = []
  const lines: string[] = []
  for (const v of verdicts) {
    if (v.reasons[0] === 'unknown') alerts.push(`요청 0(24h) enabled 소스 ${v.key}: 사유 코드 없음(unknown) — 불변식 위반, 원인 확인 필요 · ${runPart(v)}`)
    else lines.push(`요청 0(24h) ${v.key}: 사유 ${v.reasons.join('+')} · ${runPart(v)}`)
  }
  return { alerts, lines }
}
