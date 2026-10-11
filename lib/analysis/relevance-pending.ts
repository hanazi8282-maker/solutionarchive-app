// T2 판정 대상(pendingFor) — scripts/relevance-judge-auto.mjs 에서 떼어 냈다(v31 항목 5 검토 6번).
// 조회(평점 컬럼 42703 폴백) → T1 선별 → 평점 우선 자르기 → 판정 캐시 제외 → 사전필터(shadow/enforce)까지의 연결부를
// 모의 supabase 로 실행 검사할 수 있게 하려는 분리다. 로직은 스크립트에 있던 그대로다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { selectInputs } from './extract-select.ts'
import { MAX_REVIEW_CHARS, pickSampleByRating, type RatingSampleStats } from './relevance-judge.ts'
import { applyPrefilter, prefilterInputs, summarizePrefilter, type PrefilterConfig } from './prefilter.ts'

export interface PendingResult {
  total: number
  reviews: { input_id: string; text: string }[]
  /** 평점 표본 통계. 입력 0건이면 null(대상이 안 되므로 로그가 읽지 않는다). */
  rating: RatingSampleStats | null
}

type Log = (m: string) => void
type PendingInputRow = { id: string; raw_text: string | null; created_at: string | null; collected_at: string | null; source_key?: string | null; rating?: number | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPendingFor(deps: { supabase: any; sampleSize: number; highRatingShare: number; prefilterCfg: PrefilterConfig | null; log: Log; warn: Log }) {
  const { supabase, sampleSize, highRatingShare, log, warn } = deps
  let prefilterCfg = deps.prefilterCfg
  /** analysis_inputs.rating 컬럼(20261005000001) 존재 3상태. 'absent' 면 평점 우선 자르기·평점 규칙이 안 돈다. */
  const state = { ratingColumn: 'unknown' as 'unknown' | 'present' | 'absent' }
  /** project_id → 사전필터 기록 — select 스텝 detail.prefilter 로 남는다(DB 스키마 변경 없음, §10.1 agent_run_steps). */
  const prefilterByProject: Record<string, unknown> = {}

  /** 이 프로젝트에서 판정할 리뷰 목록. 실패는 null 로 올려 "0건" 과 가른다(§7.1). */
  async function pendingFor(project: { id: string }): Promise<PendingResult | null> {
    // ⚠️ range 없음 — PostgREST 기본 상한(1,000행)까지만 온다. T1 선별·중복 규칙도 그 범위 안에서 돈다(docs/prefilter-shadow.md).
    const inputsQuery = (cols: string) => supabase.from('analysis_inputs').select(cols).eq('project_id', project.id).is('purged_at', null)
    const BASE_COLS = 'id, raw_text, created_at, collected_at, source_key'
    let { data: inputs, error } = await inputsQuery(state.ratingColumn === 'absent' ? BASE_COLS : `${BASE_COLS}, rating`)
    if (error?.code === '42703' && state.ratingColumn !== 'absent') {
      state.ratingColumn = 'absent'
      warn('analysis_inputs.rating 컬럼이 없다(42703, 마이그 20261005000001 미적용) — 평점 우선 자르기·사전필터 평점 규칙이 안 돈다')
      ;({ data: inputs, error } = await inputsQuery(BASE_COLS))
    } else if (!error && state.ratingColumn === 'unknown') state.ratingColumn = 'present'
    if (error) {
      console.error(`⚠️ 원문 조회 실패 project=${project.id}: ${error.message}`)
      return null
    }
    if (!inputs || inputs.length === 0) return { total: 0, reviews: [], rating: null }

    // T1 과 같은 선별기를 쓴다 — 판정 표본과 extract 가 보는 집합이 갈라지면 판정이 헛돈다.
    // 자르기는 평점 우선(v31 §2.3): 1~3점 먼저, 4~5점은 표본의 highRatingShare 만. 평점 없는 입력은 기존 순서 그대로.
    const rows = inputs as PendingInputRow[]
    const { sample: selected, stats: rating } = pickSampleByRating(selectInputs(rows).selected, sampleSize, highRatingShare, (s) => s.input.rating)

    const { data: judged, error: judgedError } = await supabase.from('review_relevance_verdicts').select('input_id').eq('project_id', project.id)
    if (judgedError) {
      // 판정 캐시를 못 읽었는데 그대로 돌리면 이미 판정한 것을 다시 태운다. 건너뛴다.
      console.error(`⚠️ 판정 캐시 조회 실패 project=${project.id}: ${judgedError.message}`)
      return null
    }
    const done = new Set((judged ?? []).map((r: { input_id: string }) => r.input_id))
    const reviews = selected
      .filter((s) => !done.has(s.input.id))
      .map((s) => ({ input_id: s.input.id as string, text: s.text.slice(0, MAX_REVIEW_CHARS) }))
    if (!prefilterCfg) return { total: selected.length, reviews, rating }

    // 사전필터(v31 항목 5) — T1 뒤 · T2 전. 중복은 조회된 입력 전체(최대 1,000행)에서 센다. 효과는 T2 대상(reviews)에만.
    // 필터가 던지면 shadow 든 enforce 든 T2 를 죽이지 않는다 — 경고하고 이번 실행은 필터를 끈다(전부 통과).
    let verdicts
    try {
      verdicts = prefilterInputs(rows, prefilterCfg, project.id)
    } catch (e) {
      warn(`사전필터 예외 — 이번 실행은 필터 꺼짐(전부 통과): ${e instanceof Error ? e.message : String(e)}`)
      prefilterCfg = null
      return { total: selected.length, reviews, rating }
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
    return { total: selected.length, reviews: kept, rating }
  }

  /** 필터가 실행 중 꺼졌는지(예외)까지 반영한 현재 설정. select 스텝 detail 이 읽는다. */
  const currentPrefilter = () => prefilterCfg
  return { pendingFor, prefilterByProject, state, currentPrefilter }
}
