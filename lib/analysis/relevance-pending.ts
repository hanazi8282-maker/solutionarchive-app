// T2 판정 대상(pendingFor) — scripts/relevance-judge-auto.mjs 에서 떼어 냈다(v31 항목 5 검토 6번).
// 조회(평점 컬럼 42703 폴백) → T1 선별 → 평점 우선 자르기 → 판정 캐시 제외 → 사전필터(shadow/enforce)까지의 연결부를
// 모의 supabase 로 실행 검사할 수 있게 하려는 분리다. 로직은 스크립트에 있던 그대로다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { selectInputs, timestampOf } from './extract-select.ts'
import { MAX_REVIEW_CHARS, pickSampleByRating, type RatingSampleStats } from './relevance-judge.ts'
import { applyPrefilter, prefilterInputs, summarizePrefilter, type PrefilterConfig } from './prefilter.ts'
import { DEFAULT_EXCLUDED_SOURCES, DEFAULT_LAST_SOURCES, fetchAllPages, orderForJudge } from './relevance-judge-all.ts'

export interface PendingResult {
  /** 이번 실행 표본 수(미판정 중 상한까지 고른 것, 사전필터 전). */
  total: number
  /** 그중 아직 판정이 없는 수 — 이번 실행 상한(sampleSize)과 무관한 전체 남은 양. 체인이 "남았나"를 이걸로 본다. */
  unjudged?: number
  /** 제외 소스(기본 youtube)라 뺀 수. */
  excluded?: number
  reviews: { input_id: string; text: string }[]
  /** 평점 표본 통계. 입력 0건이면 null(대상이 안 되므로 로그가 읽지 않는다). */
  rating: RatingSampleStats | null
}

type Log = (m: string) => void
type PendingInputRow = { id: string; raw_text: string | null; created_at: string | null; collected_at: string | null; source_key?: string | null; rating?: number | null }

export function createPendingFor(deps: {
   
  supabase: any; sampleSize: number; highRatingShare: number; prefilterCfg: PrefilterConfig | null; log: Log; warn: Log
  /** 판정에서 뺄 소스(기본 youtube) · 맨 뒤로 미룰 소스(기본 카카오 카페·블로그). */
  excludedSources?: readonly string[]; lastSources?: readonly string[]
}) {
  const { supabase, sampleSize, highRatingShare, log, warn } = deps
  const excludedSources = deps.excludedSources ?? DEFAULT_EXCLUDED_SOURCES
  const lastSources = deps.lastSources ?? DEFAULT_LAST_SOURCES
  let prefilterCfg = deps.prefilterCfg
  /** analysis_inputs.rating 컬럼(20261005000001) 존재 3상태. 'absent' 면 평점 우선 자르기·평점 규칙이 안 돈다. */
  const state = { ratingColumn: 'unknown' as 'unknown' | 'present' | 'absent' }
  /** project_id → 사전필터 기록 — select 스텝 detail.prefilter 로 남는다(DB 스키마 변경 없음, §10.1 agent_run_steps). */
  const prefilterByProject: Record<string, unknown> = {}

  /** 이 프로젝트에서 판정할 리뷰 목록. 실패는 null 로 올려 "0건" 과 가른다(§7.1). */
  async function pendingFor(project: { id: string }): Promise<PendingResult | null> {
    // 페이지로 전부 읽는다(PostgREST 기본 1,000행 상한 제거 — 전량 판정). id 로 정렬해야 페이지가 겹치거나 빠지지 않는다.
    const inputsQuery = (cols: string) => fetchAllPages<PendingInputRow>(() =>
      supabase.from('analysis_inputs').select(cols).eq('project_id', project.id).is('purged_at', null).order('id', { ascending: true }))
    const BASE_COLS = 'id, raw_text, created_at, collected_at, source_key'
    let got = await inputsQuery(state.ratingColumn === 'absent' ? BASE_COLS : `${BASE_COLS}, rating`)
    if (got.error?.code === '42703' && state.ratingColumn !== 'absent') {
      state.ratingColumn = 'absent'
      warn('analysis_inputs.rating 컬럼이 없다(42703, 마이그 20261005000001 미적용) — 평점 우선 자르기·사전필터 평점 규칙이 안 돈다')
      got = await inputsQuery(BASE_COLS)
    } else if (!got.error && state.ratingColumn === 'unknown') state.ratingColumn = 'present'
    if (got.error) {
      console.error(`⚠️ 원문 조회 실패 project=${project.id}: ${got.error.message}`)
      return null
    }
    if (got.truncated) warn(`원문 ${got.data?.length}행에서 읽기를 멈췄다(project=${project.id}, 상한) — 그 뒤 원문은 이번 실행에서 안 보인다`)
    const inputs = got.data
    if (!inputs || inputs.length === 0) return { total: 0, unjudged: 0, reviews: [], rating: null }

    const judgedGot = await fetchAllPages<{ input_id: string }>(() =>
      supabase.from('review_relevance_verdicts').select('input_id').eq('project_id', project.id).order('input_id', { ascending: true }))
    if (judgedGot.error || judgedGot.truncated) {
      // 판정 캐시를 (전부) 못 읽었는데 그대로 돌리면 이미 판정한 것을 다시 태운다. 건너뛴다(저장은 insert-only 라 덮지는 않는다).
      console.error(`⚠️ 판정 캐시 조회 실패 project=${project.id}: ${judgedGot.error?.message ?? '상한 초과로 일부만 읽음'}`)
      return null
    }
    const done = new Set((judgedGot.data ?? []).map((r) => r.input_id))

    // 판정 전용 경로: T1(selectInputs)의 빈 본문·머리말만 거르기는 그대로 쓰되 12만 자 상한은 풀고(maxCharsTotal 무한),
    // **판정된 것을 먼저 뺀 뒤** 자른다 — 예전엔 상위 N 을 자른 뒤 판정된 것을 빼서, 상위 N 이 다 판정되면 그 프로젝트는 영영 0건이었다.
    // 순서(v·전량 판정): 소스 라운드로빈 · 소스 안은 최신 먼저 · 제외 소스(youtube) 빼고 · 카카오 카페·블로그는 맨 뒤.
    // 자르기는 평점 우선(v31 §2.3): 1~3점 먼저, 4~5점은 표본의 highRatingShare 만(모자라면 4~5점으로 채움 — 버리지 않고 다음 실행으로 미룬다).
    const rows = inputs as PendingInputRow[]
    const eligible = selectInputs(rows, { maxCharsTotal: Number.POSITIVE_INFINITY }).selected
    const ordered = orderForJudge(eligible.filter((s) => !done.has(s.input.id)), {
      sourceOf: (s) => s.input.source_key, tsOf: (s) => timestampOf(s.input), excluded: excludedSources, last: lastSources,
    })
    const { sample: head, stats: rating } = pickSampleByRating(ordered.main, sampleSize, highRatingShare, (s) => s.input.rating)
    const selected = [...head, ...ordered.last.slice(0, Math.max(0, sampleSize - head.length))]
    const unjudged = ordered.main.length + ordered.last.length
    const reviews = selected.map((s) => ({ input_id: s.input.id as string, text: s.text.slice(0, MAX_REVIEW_CHARS) }))
    const base = { total: selected.length, unjudged, excluded: ordered.excludedCount }
    if (!prefilterCfg) return { ...base, reviews, rating }

    // 사전필터(v31 항목 5) — T1 뒤 · T2 전. 중복은 조회된 입력 전체에서 센다. 효과는 T2 대상(reviews)에만.
    // 필터가 던지면 shadow 든 enforce 든 T2 를 죽이지 않는다 — 경고하고 이번 실행은 필터를 끈다(전부 통과).
    let verdicts
    try {
      verdicts = prefilterInputs(rows, prefilterCfg, project.id)
    } catch (e) {
      warn(`사전필터 예외 — 이번 실행은 필터 꺼짐(전부 통과): ${e instanceof Error ? e.message : String(e)}`)
      prefilterCfg = null
      return { ...base, reviews, rating }
    }
    const { kept, wouldDrop } = applyPrefilter(reviews, verdicts, prefilterCfg.mode)
    prefilterByProject[project.id] = {
      mode: prefilterCfg.mode,
      rating_column: state.ratingColumn,
      project_all: summarizePrefilter(verdicts),
      t2_pending: reviews.length,
      t2_would_drop: wouldDrop.length,
      t2_dropped: reviews.length - kept.length,
      would_drop: wouldDrop.map((w) => [w.input_id, w.rule]),
    }
    if (wouldDrop.length > 0) {
      log(`  사전필터 ${project.id}: T2 대상 ${reviews.length}건 중 ${wouldDrop.length}건 걸림(${prefilterCfg.mode === 'shadow' ? '표시만 — 판정은 그대로' : 'enforce — 판정에서 뺌'})`)
    }
    return { ...base, unjudged: unjudged - (reviews.length - kept.length), reviews: kept, rating }
  }

  /** 필터가 실행 중 꺼졌는지(예외)까지 반영한 현재 설정. select 스텝 detail 이 읽는다. */
  const currentPrefilter = () => prefilterCfg
  return { pendingFor, prefilterByProject, state, currentPrefilter }
}
