// 수집 램프 — 소스별 "1회 타깃 수" 계단과 현재 단계 읽기.
//
// 근거: reports/2026-09-28/cowork-four-orders.md §2-2 (남헌 2026-09-28 확정). 테이블은 마이그 20260930000034.
// 러너 배선(2026-10-05): scripts/review-collect.mjs → collectWithRamp — 현재 단계의 1회 타깃 수로 돌리고,
// 차단 응답이 나오면 직전 단계로 내리고 RAMP_FREEZE_DAYS(3일, 2026-10-05 남헌 v22) 동결한다(CLAUDE.md §10.1 '수집 램프 단계 자동 기록').
// **올리는 엔진은 아직 없다** — 단계를 올리는 코드는 이 리포에 없다(값을 올리는 건 사람·역할 세션).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTableError } from '../agents/status.ts'
import { runCollection, type RunnerPorts, type RunResult } from './runner.ts'
import type { ReviewSourceAdapter } from './types.ts'

/** level 0~3 의 1회 타깃 수. 주 1회 약 +50%. level 0 = 기본값(램프 행 없음·확인 불가 폴백 10). */
export const RAMP_STEPS = [10, 15, 22, 30] as const

export const RAMP_MIGRATION = '20260930000034_review_source_ramp'

export type SourceRamp = {
  sourceKey: string
  level: number
  targetsPerRun: number
  frozenUntil: string | null
  changedAt: string
  reason: string
}

/**
 * 3상태: ramp(행 있음) / none(행 없음 = 램프 미적용, 기본 타깃 수) / unavailable(테이블 없음·조회 실패).
 * unavailable 을 none 으로 접지 마라 — 되돌리기로 내려둔 단계를 못 읽고 기본값으로 돌면 동결이 풀린다(§7.1).
 */
export async function loadSourceRamp(
  sb: Pick<SupabaseClient, 'from'>,
  sourceKey: string,
): Promise<{ state: 'ramp'; ramp: SourceRamp } | { state: 'none' } | { state: 'unavailable'; reason: string }> {
  const { data, error } = await sb
    .from('review_source_ramp')
    .select('source_key, level, targets_per_run, frozen_until, changed_at, reason')
    .eq('source_key', sourceKey)
    .maybeSingle()
  if (error) {
    return {
      state: 'unavailable',
      reason: isMissingTableError(error.code, error.message) ? `테이블 없음 — 마이그 ${RAMP_MIGRATION} 미적용` : `조회 실패 — ${error.message}`,
    }
  }
  if (!data) return { state: 'none' }
  return {
    state: 'ramp',
    ramp: {
      sourceKey: data.source_key,
      level: data.level,
      targetsPerRun: data.targets_per_run,
      frozenUntil: data.frozen_until,
      changedAt: data.changed_at,
      reason: data.reason,
    },
  }
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

/**
 * 안전 되돌리기: 차단 응답 ≥1 이면 직전 단계로 내리고 RAMP_FREEZE_DAYS(3일) 동결. 로그 행을 **먼저** 쓰고, 로그가 실패하면
 * 단계를 바꾸지 않는다(§10.1 — 로그 없이 바꾸지 않는다). 대상이 아니면 null.
 */
export async function rollbackOnBlock(
  sb: Pick<SupabaseClient, 'from'>,
  sourceKey: string,
  loaded: Loaded,
  blockedResponses: number,
  now: Date,
  dryRun: boolean,
): Promise<string | null> {
  if (blockedResponses <= 0 || loaded.state !== 'ramp' || RAMP_EXCLUDED.has(sourceKey)) return null
  const { level } = loaded.ramp
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
      frozen_until: new Date(now.getTime() + RAMP_FREEZE_DAYS * 86_400_000).toISOString(),
      changed_at: now.toISOString(),
      reason,
    })
    .eq('source_key', sourceKey)
  if (upd.error) return `❌ 램프 되돌리기 실패 — 로그는 남았고 단계 갱신 실패(${upd.error.message})`
  return reason
}

/**
 * review-collect.mjs 의 소스 1개 실행 = 램프 읽기 → 러너 → 차단이면 되돌리기. 셀프테스트가 이 경계를 그대로 탄다.
 * 러너 예외는 fatal 로 돌려준다(기존 try/catch 와 같다).
 */
export async function collectWithRamp(args: {
  sb: Pick<SupabaseClient, 'from'>
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
  let result: RunResult | null = null
  let fatal: string | null = null
  try {
    result = await runCollection(adapter, { dryRun, targetLimit: limit }, ports)
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e)
  }
  const rb = await rollbackOnBlock(sb, adapter.key, loaded, result?.stats.blockedResponses ?? 0, ports.now(), dryRun)
  if (rb) notes.push(rb)
  return { result, fatal, targetLimit: limit, notes }
}
