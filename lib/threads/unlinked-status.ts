// "발행됐는데 초안에 안 붙은 Threads 게시물" 확인 결과의 기록·표시.
//
// 왜 이 파일이 있나 — 권한 경계(CLAUDE.md §10.1).
//   이 수를 세려면 GET /me/threads 가 필요하고, 그건 Threads 토큰이 필요하다.
//   무인 루프(cmo-daily, GitHub Actions)에는 그 토큰이 없어야 한다. 그래서
//   토큰을 이미 가진 매처 크론(app/api/threads/match-posts)이 매 실행 결과를
//   agent_run_steps 에 남기고, 데일리 다이제스트는 DB 에서 그 최신 행만 읽는다.
//   다이제스트 쪽에서 토큰을 읽어 직접 조회하게 바꾸지 마라.
//
// 기록 자리: agent_runs(dept='cto', trigger='cron') 1행/UTC일 + 그 아래
//   step_key='threads_unlinked' 1행. 매시 같은 행을 upsert 한다(행이 안 불어난다).
//
// ⚠️ 이 파일은 scripts/cmo-daily.mjs 가 Node 타입 스트립으로 직접 import 한다.
//    값 import 를 넣지 마라(`import type` 만 허용 — 스트립 시 지워진다).

import type { SupabaseClient } from '@supabase/supabase-js'

export const UNLINKED_STEP_KEY = 'threads_unlinked'

// 매처는 매시 정각에 돈다. 2회 연속 누락까지는 봐주고 그 이상이면 수치를 믿지 않는다.
export const UNLINKED_STALE_MS = 3 * 60 * 60 * 1000

// 기록하는 분류는 lib/threads/match.ts 의 UnmatchedKind 와 1:1 이다.
//   unlinked      = manual_link    — 대시보드에서 바로 연결할 대상. ⚠️
//   columnEpisode = column_episode — 칼럼 연재 편의 발행본. posts 행부터 만들어야 한다. ⚠️
//   offPipeline   = off_pipeline   — 초안 없이 직접 쓴 글. 경고는 아니지만 건수는 남긴다.
//   undecidable   = undecidable    — 비교 불가. 0 으로 접지 않는다(§7.1).
export type UnlinkedCheck =
  | {
      status: 'ok'
      unlinked: number
      columnEpisode: number
      offPipeline: number
      undecidable: number
      /** 조치 대상(manual_link + column_episode) 중 가장 오래된 게시물 시각. */
      oldestTimestamp: string | null
      threadsChecked: number
      applyFailed: number
      /** 미연결 게시물별 분류 근거(유사도·1등 후보). 임계값을 다시 정할 실측점이 여기 쌓인다. */
      candidates?: unknown[]
    }
  | { status: 'failed' | 'skipped'; reason: string }

/**
 * 매처 한 번의 확인 결과를 남긴다. 절대 throw 하지 않는다 — 기록 실패로 매칭을 망치지 않는다.
 * 대신 조용히 넘기지도 않는다: 로그를 남기고, 다이제스트는 기록이 오래되면 '확인 불가'로 떨어진다.
 */
export async function recordUnlinkedCheck(supabase: SupabaseClient, r: UnlinkedCheck, now = new Date()): Promise<void> {
  const iso = now.toISOString()
  const day = iso.slice(0, 10)
  try {
    const run = await supabase.from('agent_runs').upsert({
      run_key: `cto-threads-match-${day}`,
      dept: 'cto',
      trigger: 'cron',
      status: r.status === 'failed' ? 'failed' : 'ok',
      dry_run: false,
      // started_at 을 그날 00:00Z 로 고정한다. DB now() 에 맡기면 Vercel 시계가 조금만
      // 뒤처져도 agent_runs_finish_order(finished_at >= started_at) 에 걸린다.
      started_at: `${day}T00:00:00Z`,
      finished_at: iso,
    }, { onConflict: 'run_key' }).select('id').single()
    if (run.error) throw new Error(`agent_runs ${run.error.code ?? ''} ${run.error.message}`)

    const ok = r.status === 'ok'
    const step = await supabase.from('agent_run_steps').upsert({
      run_id: run.data.id,
      seq: 1,
      step_key: UNLINKED_STEP_KEY,
      label: '발행됐는데 초안에 안 붙은 게시물 확인',
      status: r.status,
      counts: ok
        ? {
            unlinked: r.unlinked,
            column_episode: r.columnEpisode,
            off_pipeline: r.offPipeline,
            undecidable: r.undecidable,
            threads_checked: r.threadsChecked,
            apply_failed: r.applyFailed,
          }
        : {},
      detail: ok
        ? { oldest_timestamp: r.oldestTimestamp, candidates: r.candidates ?? [] }
        : { reason: r.reason },
      updated_at: iso,
    }, { onConflict: 'run_id,step_key' })
    if (step.error) throw new Error(`agent_run_steps ${step.error.code ?? ''} ${step.error.message}`)
  } catch (e) {
    console.error(`[match] unlinked check record failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export type UnlinkedRead = {
  row: { status: string; counts: Record<string, unknown> | null; detail: Record<string, unknown> | null; updated_at: string } | null
  error: string | null
}

const hoursSince = (iso: unknown, now: number) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 3_600_000))
}

/** counts 의 건수 칸. 정수·0 이상만 인정한다. 그 밖이면 null = 못 읽은 것. */
const countOf = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null

/**
 * 다이제스트 한 줄. 3상태(§7.1): N건 / 0건 / 확인 불가 — 확인 불가를 0건으로 접지 않는다.
 *
 * ⚠️ 는 **조치 대상(manual_link + column_episode)에만 붙인다.** 파이프라인 외 게시물과
 * 판정 불가는 같은 줄의 뒤쪽에 건수로만 남는다 — 경고에서 빼되 조용히 지우지는 않는다.
 * (섞어 놓으면 매시 같은 ⚠️ 가 떠서 진짜 미연결을 못 보게 된다. 그게 이 분류의 이유다.)
 */
export function unlinkedDigestLine({ row, error }: UnlinkedRead, now = Date.now()): string {
  const head = '발행됐는데 연결 안 된 Threads 게시물'
  const unknown = (why: string) => `${head}: 확인 불가(${why}) — /dashboard 에서 직접 확인`
  if (error) return unknown(`매처 기록 조회 실패 — ${error}`)
  if (!row) return unknown('매처 기록 없음')
  const age = hoursSince(row.updated_at, now)
  if (age === null || now - Date.parse(row.updated_at) > UNLINKED_STALE_MS) {
    return unknown(`매처 기록 없음 — 마지막 기록 ${age === null ? '시각 모름' : `${age}시간 전`}`)
  }
  if (row.status !== 'ok') return unknown(`매처가 조회 못 함 — ${String(row.detail?.reason ?? row.status)}`)
  const n = countOf(row.counts?.unlinked)
  if (n === null) return unknown('매처 기록 형식 이상')
  const failed = Number(row.counts?.apply_failed ?? 0)
  const col = countOf(row.counts?.column_episode)
  const off = countOf(row.counts?.off_pipeline)
  const und = countOf(row.counts?.undecidable)
  // 분류 이전 버전의 매처가 남긴 행. 없는 칸을 "0건"으로 읽히게 두지 않는다 —
  // 그 해석이 §7.1 위반이고, 다음 정각 실행이 채운다.
  const legacy = col === null || off === null || und === null
  const tail = [
    failed > 0 ? `자동 연결 실패 ${failed}건` : null,
    legacy ? '분류 없음(매처 구버전 기록 — 다음 정각에 채워진다)' : null,
    col ? `그중 칼럼 연재 편 ${col}건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs)` : null,
    off ? `파이프라인 외 게시물 ${off}건(초안 없이 직접 쓴 글 — 연결 대상 아님)` : null,
    und ? `판정 불가 ${und}건(본문 없는 게시물·후보 조회 실패 — /dashboard 확인)` : null,
  ].filter(Boolean).join(' · ')
  const suffix = tail ? ` · ${tail}` : ''
  // 조치 대상 = 바로 연결할 것 + 칼럼 편(스테이징 후 연결). 둘 다 늦으면 views_1h 창을 잃는다.
  const actionable = n + (col ?? 0)
  if (actionable === 0) return `${head} 0건${suffix}`
  const oldest = hoursSince(row.detail?.oldest_timestamp, now)
  return `⚠️ ${head} ${actionable}건(가장 오래된 것 ${oldest === null ? '경과 시간 모름' : `${oldest}시간 경과`}) — /dashboard 에서 연결${suffix}`
}
