// 소스 건강도를 읽는 자리 — review_collection_runs.health_after(소스별 비-dry-run 실행).
//
// 2026-09-30(#373)부터 러너는 review_sources.health·health_detail·health_checked_at 을 쓰지 않는다. 그 컬럼은
// 낡은 값에 고정돼 있으므로(DEPRECATED — 정리는 다음 분기, 남헌 2026-09-30) 화면·경보는 여기서만 읽는다
// (/agents · insight-loop · /api/analyze/targets · review-source-health-report).
//
// 소스마다 두 값을 따로 돌려준다(남헌 2026-09-30 결정 (3)) — health_after=null 인 실행이 이전 broken 을 가리지 않게.
//   ① 최근(health·at·reason·unknownRuns): 가장 최근 실행의 판정. 판정이 없으면 'unknown'(확인 불가)과 몇 연속인지.
//   ② 마지막 확인(lastChecked): 판정(ok/degraded/broken)이 있었던 가장 최근 실행.
//   · dry-run 실행은 판정하지 않으니 둘 다에서 제외한다.
//   · 확인 불가를 ok 로 접지 않는다. 확인 불가가 이전 broken 을 덮지도 않는다(CLAUDE.md §7.1).
//   · 사유 문구(옛 health_detail)는 runs 에 없다(남헌 결정 — 당장 따라오지 않는 것을 감수). reason 은 판정이 없을 때의
//     이유만 담는다. 판정 사유는 그 실행의 Actions 요약에 있다.

import type { Health } from './health.ts'

export type LatestHealth = Health | 'unknown'

export interface RunRow {
  source_key: string
  started_at: string
  finished_at?: string | null
  status?: string | null
  dry_run?: boolean | null
  health_after?: string | null
}

export interface SourceHealth {
  key: string
  /** ① 최근 실행의 판정. */
  health: LatestHealth
  /** 최근 실행의 시작 시각. 실행이 없으면 null. */
  at: string | null
  /** health='unknown' 일 때만 — 왜 확인 불가인지. */
  reason: string | null
  /** 최근부터 연속으로 판정이 없는 실행 수(health≠unknown 이면 0). 기록 없음·조회 실패면 null. */
  unknownRuns: number | null
  /**
   * ② 판정이 있었던 가장 최근 실행.
   *   · 객체 — 찾았다
   *   · 'none' — 읽은 기록 전체에 판정이 없다(창이 꽉 차지 않았을 때만 — 그 너머는 모른다)
   *   · 'unknown' — 조회 실패, 또는 읽은 창(RUN_WINDOW)이 꽉 찼는데 그 안에 판정이 없다
   */
  lastChecked: { health: Health; at: string } | 'none' | 'unknown'
}

const VERDICTS = new Set<string>(['ok', 'degraded', 'broken'])

/** 소스당 읽는 최근 실행 수. 연속 확인 불가가 이만큼이면 "N회 이상"이고, 그 너머의 마지막 확인은 모른다고 적는다. */
export const RUN_WINDOW = 30

const isVerdict = (r: RunRow) => !!r.health_after && VERDICTS.has(r.health_after)

/**
 * 순수 함수 — 소스 키마다 ① 최근 실행 ② 판정이 있었던 마지막 실행. runs 는 순서·소스가 섞여 있어도 된다.
 * window = 소스당 읽은 행 수 상한(로더가 limit 한 값). 그 수만큼 읽었는데 판정이 없으면 'none' 이 아니라 'unknown'.
 */
export function latestHealthBySource(
  keys: string[],
  runs: RunRow[] | null,
  readError: string | null = null,
  window = Infinity,
): SourceHealth[] {
  return keys.map((key): SourceHealth => {
    if (readError || !runs) {
      return { key, health: 'unknown', at: null, reason: `실행 기록 조회 실패${readError ? ` — ${readError}` : ''}`, unknownRuns: null, lastChecked: 'unknown' }
    }
    const mine = runs
      .filter((r) => r.source_key === key && r.dry_run !== true)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
    const latest = mine[0]
    if (!latest) return { key, health: 'unknown', at: null, reason: '실행 기록 없음', unknownRuns: null, lastChecked: 'none' }

    const idx = mine.findIndex(isVerdict)
    const checked = idx >= 0 ? mine[idx] : null
    const lastChecked: SourceHealth['lastChecked'] = checked
      ? { health: checked.health_after as Health, at: checked.started_at }
      : mine.length >= window ? 'unknown' : 'none'

    if (idx === 0) return { key, health: latest.health_after as Health, at: latest.started_at, reason: null, unknownRuns: 0, lastChecked }
    const why = !latest.finished_at ? '실행 중' : latest.status === 'failed' ? '실행 실패' : '판정 없음(건너뜀)'
    return { key, health: 'unknown', at: latest.started_at, reason: `최근 실행 ${why}`, unknownRuns: idx >= 0 ? idx : mine.length, lastChecked }
  })
}

/** 화면용 한 단어. 확인 불가는 ok 와 다른 글자로. */
export function healthLabel(h: LatestHealth): string {
  return h === 'unknown' ? '확인 불가' : h
}

/** "오늘" / "N일 전". now 는 ms. */
export function daysAgo(at: string, now: number): string {
  const d = Math.floor((now - Date.parse(at)) / 86_400_000)
  return d <= 0 ? '오늘' : `${d}일 전`
}

/**
 * 두 값을 한 줄로 — 예) "최근: 확인 불가(3연속) · 마지막 확인: broken(2일 전)".
 * 최근 실행에 판정이 있으면 그게 곧 마지막 확인이라 한 값만 쓴다.
 */
export function healthSummary(h: SourceHealth, now: number): string {
  if (h.health !== 'unknown') return `최근: ${h.health}${h.at ? `(${daysAgo(h.at, now)})` : ''}`
  const n = h.unknownRuns == null ? '' : `(${h.unknownRuns}${h.unknownRuns >= RUN_WINDOW ? '회 이상' : '연속'})`
  const last =
    h.lastChecked === 'none' ? '없음'
      : h.lastChecked === 'unknown' ? (h.unknownRuns != null && h.unknownRuns >= RUN_WINDOW ? `확인 불가(최근 ${RUN_WINDOW}회 안에 판정 없음)` : '확인 불가')
        : `${h.lastChecked.health}(${daysAgo(h.lastChecked.at, now)})`
  return `최근: 확인 불가${n} · 마지막 확인: ${last}`
}

/**
 * insight-loop 경보 줄. ok 는 줄이 없다. broken·degraded 는 늘 올리고, 확인 불가는 **켜진 소스만** 올린다 —
 * 꺼진 소스는 러너가 건너뛰어 판정이 안 생기는 게 정상이라서다(꺼진 사실은 /agents 에 보인다, 남헌 2026-09-30 수용).
 * 켜진 소스가 최근 확인 불가인데 마지막 확인이 broken 이면 🚨 로 경보를 유지한다(확인 불가가 broken 을 덮지 않는다).
 */
export function sourceAlertLines(sources: { key: string; enabled: boolean }[], hs: SourceHealth[], now = Date.now()): string[] {
  const byKey = new Map(hs.map((h) => [h.key, h]))
  return sources.flatMap((s) => {
    const h: SourceHealth = byKey.get(s.key) ?? { key: s.key, health: 'unknown', at: null, reason: '실행 기록 조회 안 됨', unknownRuns: null, lastChecked: 'unknown' }
    if (h.health === 'ok' || (h.health === 'unknown' && !s.enabled)) return []
    const lastBroken = typeof h.lastChecked === 'object' && h.lastChecked.health === 'broken'
    const icon = h.health === 'broken' || (h.health === 'unknown' && lastBroken) ? '🚨' : '⚠️'
    const stopped = s.enabled ? '' : ' · 소스가 꺼져 있다'
    const when = h.at ? ` (${h.at.slice(0, 16).replace('T', ' ')} 실행)` : ''
    const why = h.health === 'unknown' ? `${h.reason} — ${healthSummary(h, now)}` : '사유 문구는 실행 기록에 없다 — 그 실행의 Actions 요약 참조'
    return [`${icon} 소스 경보: ${s.key} = ${healthLabel(h.health)} — ${why}${stopped}${when}`]
  })
}

type RunsQuery = {
  select(cols: string): RunsQuery
  eq(col: string, v: unknown): RunsQuery
  order(col: string, o: { ascending: boolean }): RunsQuery
  limit(n: number): PromiseLike<{ data: RunRow[] | null; error: { message: string } | null }>
}
export type RunsReader = { from(table: string): unknown }

/**
 * 소스마다 최근 비-dry-run 실행 RUN_WINDOW 건을 읽어 판정한다. 소스별 질의라 오래 안 돈 소스도 빠지지 않는다.
 * 조회 실패는 그 소스만 확인 불가로 둔다. throw 하지 않는다.
 */
export async function loadLatestHealth(sb: RunsReader, keys: string[]): Promise<SourceHealth[]> {
  return Promise.all(
    keys.map(async (key) => {
      const q = (sb.from('review_collection_runs') as RunsQuery)
        .select('source_key, started_at, finished_at, status, dry_run, health_after')
        .eq('source_key', key)
        .eq('dry_run', false)
        .order('started_at', { ascending: false })
      const { data, error } = await q.limit(RUN_WINDOW)
      return latestHealthBySource([key], data, error ? error.message : null, RUN_WINDOW)[0]
    }),
  )
}
