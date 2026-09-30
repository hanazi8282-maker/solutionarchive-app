// 소스 건강도를 읽는 자리 — review_collection_runs.health_after(소스별 가장 최근 비-dry-run 실행).
//
// 2026-09-30(#373)부터 러너는 review_sources.health·health_detail·health_checked_at 을 쓰지 않는다. 그 컬럼은
// 낡은 값에 고정돼 있으므로 화면·경보는 여기서만 읽는다(/agents · insight-loop · /api/analyze/targets).
//   · dry-run 실행은 판정하지 않으니 제외한다.
//   · 실행 기록이 없거나, 최근 실행에 판정이 없거나(실패·건너뜀·진행 중), 조회가 실패하면 'unknown'(확인 불가).
//     ok 로 접지 않는다(CLAUDE.md §7.1).
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
  health: LatestHealth
  /** 판정한 실행의 시작 시각. 실행이 없으면 null. */
  at: string | null
  /** health='unknown' 일 때만 — 왜 확인 불가인지. */
  reason: string | null
}

const VERDICTS = new Set<string>(['ok', 'degraded', 'broken'])

/** 순수 함수 — 소스 키마다 가장 최근 비-dry-run 실행의 health_after. runs 는 순서·소스가 섞여 있어도 된다. */
export function latestHealthBySource(keys: string[], runs: RunRow[] | null, readError: string | null = null): SourceHealth[] {
  return keys.map((key) => {
    if (readError || !runs) return { key, health: 'unknown', at: null, reason: `실행 기록 조회 실패${readError ? ` — ${readError}` : ''}` }
    const latest = runs
      .filter((r) => r.source_key === key && r.dry_run !== true)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
    if (!latest) return { key, health: 'unknown', at: null, reason: '실행 기록 없음' }
    if (latest.health_after && VERDICTS.has(latest.health_after)) {
      return { key, health: latest.health_after as Health, at: latest.started_at, reason: null }
    }
    const why = !latest.finished_at ? '실행 중' : latest.status === 'failed' ? '실행 실패' : '판정 없음(건너뜀)'
    return { key, health: 'unknown', at: latest.started_at, reason: `최근 실행 ${why}` }
  })
}

/** 화면용 한 단어. 확인 불가는 ok 와 다른 글자로. */
export function healthLabel(h: LatestHealth): string {
  return h === 'unknown' ? '확인 불가' : h
}

/**
 * insight-loop 경보 줄. ok 는 줄이 없다. broken·degraded 는 늘 올리고, 확인 불가는 **켜진 소스만** 올린다 —
 * 꺼진 소스는 러너가 건너뛰어 판정이 안 생기는 게 정상이라서다(꺼진 사실은 /agents 에 보인다).
 */
export function sourceAlertLines(sources: { key: string; enabled: boolean }[], hs: SourceHealth[]): string[] {
  const byKey = new Map(hs.map((h) => [h.key, h]))
  return sources.flatMap((s) => {
    const h = byKey.get(s.key) ?? { key: s.key, health: 'unknown' as const, at: null, reason: '실행 기록 조회 안 됨' }
    if (h.health === 'ok' || (h.health === 'unknown' && !s.enabled)) return []
    const icon = h.health === 'broken' ? '🚨' : '⚠️'
    const stopped = s.enabled ? '' : ' · 소스가 꺼져 있다'
    const when = h.at ? ` (${h.at.slice(0, 16).replace('T', ' ')} 실행)` : ''
    const why = h.health === 'unknown' ? h.reason : '사유 문구는 실행 기록에 없다 — 그 실행의 Actions 요약 참조'
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
 * 소스마다 최근 비-dry-run 실행 1건을 읽어 판정한다. 소스별 질의라 오래 안 돈 소스도 빠지지 않는다.
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
      const { data, error } = await q.limit(1)
      return latestHealthBySource([key], data, error ? error.message : null)[0]
    }),
  )
}
