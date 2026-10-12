// T2 판정 대상(pendingFor) — scripts/relevance-judge-auto.mjs 에서 떼어 냈다(v31 항목 5 검토 6번).
// 조회(평점 컬럼 42703 폴백) → T1 선별 → 평점 우선 자르기 → 판정 캐시 제외 → 사전필터(shadow/enforce)까지의 연결부를
// 모의 supabase 로 실행 검사할 수 있게 하려는 분리다. 로직은 스크립트에 있던 그대로다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { selectInputs, timestampOf } from './extract-select.ts'
import { MAX_REVIEW_CHARS, pickSampleByRating, type RatingSampleStats } from './relevance-judge.ts'
import { applyPrefilter, prefilterInputs, summarizePrefilter, type PrefilterConfig } from './prefilter.ts'
import { DEFAULT_EXCLUDED_SOURCES, DEFAULT_LAST_SOURCES, fetchAllPages, orderForJudge } from './relevance-judge-all.ts'
import { consumerReasonOf, consumerSkipEnabled, loadAllowIds, loadConsumerTagged, loadProjectArea } from './consumer-material.ts'

export interface PendingResult {
  /** 이번 실행 표본 수(미판정 중 상한까지 고른 것, 사전필터 전). */
  total: number
  /** 그중 아직 판정이 없는 수 — 이번 실행 상한(sampleSize)과 무관한 전체 남은 양. 체인이 "남았나"를 이걸로 본다. */
  unjudged?: number
  /** 제외 소스(기본 youtube)라 뺀 수. */
  excluded?: number
  /** 소비재(태그 표 ∪ 파생 out-consumer·youtube)라 뺀 미판정 수(남헌 v61). 이미 판정된 것은 세지 않는다. */
  consumer?: number
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
  /** 소비재 태그 입력을 대기열에서 뺄지(기본 env RELEVANCE_SKIP_CONSUMER — off 만 끈다, 재개 스위치). */
  skipConsumer?: boolean
  /** 파생 제외를 풀 input_id(기본 config/consumer-allow-ids.txt · env RELEVANCE_CONSUMER_ALLOW_FILE). 태그 표 제외는 풀지 않는다. */
  allowIds?: ReadonlySet<string>
}) {
  const { supabase, sampleSize, highRatingShare, log, warn } = deps
  const excludedSources = deps.excludedSources ?? DEFAULT_EXCLUDED_SOURCES
  const lastSources = deps.lastSources ?? DEFAULT_LAST_SOURCES
  const skipConsumer = deps.skipConsumer ?? consumerSkipEnabled()
  let allowIds: ReadonlySet<string> | undefined = deps.allowIds
  const areaCache = new Map<string, string | null>()
  /**
   * 소비재 판정(남헌 v61) = (1) 태그 표 ∪ (2) 파생 — 프로젝트 area_code='out-consumer' 또는 소스 youtube(DB 쓰기 없음, 태그 전 신규 글도 막는다).
   * 파생은 허용 목록으로 풀리고, 제외 소스(RELEVANCE_EXCLUDE_SOURCES)에 이미 걸린 글은 그쪽 집계에 둔다. 스위치 off → 둘 다 꺼짐(항상 false).
   * 조회 실패는 null — 판정 캐시 실패와 같이 이 프로젝트를 건너뛴다(모르는 채 소비재를 태우지 않는다, §7.1).
   */
  async function consumerOf(projectId: string): Promise<((id: string, src: string | null | undefined) => boolean) | null> {
    if (!skipConsumer) return () => false
    const tagged = await loadConsumerTagged(supabase, projectId, { enabled: true, warn })
    let area = areaCache.get(projectId)
    if (area === undefined) {
      const a = await loadProjectArea(supabase, projectId, warn)
      if (a !== undefined) areaCache.set(projectId, (area = a))
    }
    if (!tagged || area === undefined) {
      console.error(`⚠️ 소비재 ${!tagged ? '태그' : '영역'} 조회 실패 project=${projectId} — 이번 실행은 건너뛴다`)
      return null
    }
    allowIds ??= await loadAllowIds()
    const allow = allowIds
    return (id, src) => tagged.has(id) || (!allow.has(id) && !excludedSources.includes(src ?? '(none)') && consumerReasonOf(area, src) !== null)
  }
  let prefilterCfg = deps.prefilterCfg
  /** analysis_inputs.rating 컬럼(20261005000001) 존재 3상태. 'absent' 면 평점 우선 자르기·평점 규칙이 안 돈다. */
  const state = { ratingColumn: 'unknown' as 'unknown' | 'present' | 'absent' }
  /** project_id → 사전필터 기록 — select 스텝 detail.prefilter 로 남는다(DB 스키마 변경 없음, §10.1 agent_run_steps). */
  const prefilterByProject: Record<string, unknown> = {}

  /** 판정 캐시 input_id 전부(페이지). 못 읽거나 상한에 걸리면 null. */
  async function judgedIdsOf(projectId: string): Promise<Set<string> | null> {
    const got = await fetchAllPages<{ input_id: string }>(() =>
      supabase.from('review_relevance_verdicts').select('input_id').eq('project_id', projectId).order('input_id', { ascending: true }))
    if (got.error || got.truncated) {
      // 판정 캐시를 (전부) 못 읽었는데 그대로 돌리면 이미 판정한 것을 다시 태운다. 건너뛴다(저장은 insert-only 라 덮지는 않는다).
      console.error(`⚠️ 판정 캐시 조회 실패 project=${projectId}: ${got.error?.message ?? '상한 초과로 일부만 읽음'}`)
      return null
    }
    return new Set((got.data ?? []).map((r) => r.input_id))
  }

  /**
   * 미판정 수만 센다 — raw_text 를 읽지 않는다(id·source_key 만). 후보 전부의 순서·체인 "남았나" 산정용.
   * 원문을 실제로 읽는 pendingFor 는 이번에 돌 프로젝트에만 부른다(hop 마다 6.7만 행 원문 전송 방지).
   * 근사: 본문이 머리말뿐인 입력도 센다(pendingFor 가 거르는 것) → 상한 쪽 추정. 실패는 null(§7.1).
   */
  async function countFor(project: { id: string }): Promise<{ unjudged: number; excluded: number; consumer: number; sources: string[] } | null> {
    const got = await fetchAllPages<{ id: string; source_key: string | null }>(() =>
      supabase.from('analysis_inputs').select('id, source_key').eq('project_id', project.id).is('purged_at', null).order('id', { ascending: true }))
    if (got.error || got.truncated) {
      console.error(`⚠️ 원문 수 조회 실패 project=${project.id}: ${got.error?.message ?? '상한 초과'}`)
      return null
    }
    if (!got.data?.length) return { unjudged: 0, excluded: 0, consumer: 0, sources: [] }
    const done = await judgedIdsOf(project.id)
    if (!done) return null
    const isConsumer = await consumerOf(project.id)
    if (!isConsumer) return null
    let unjudged = 0
    let excluded = 0
    let consumer = 0
    const sources = new Set<string>()
    for (const r of got.data) {
      sources.add(r.source_key ?? '(none)')
      if (done.has(r.id)) continue
      if (isConsumer(r.id, r.source_key)) consumer += 1
      else if (excludedSources.includes(r.source_key ?? '(none)')) excluded += 1
      else unjudged += 1
    }
    return { unjudged, excluded, consumer, sources: [...sources] }
  }

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

    const done = await judgedIdsOf(project.id)
    if (!done) return null
    const isConsumer = await consumerOf(project.id)
    if (!isConsumer) return null

    // 판정 전용 경로: T1(selectInputs)의 빈 본문·머리말만 거르기는 그대로 쓰되 12만 자 상한은 풀고(maxCharsTotal 무한),
    // **판정된 것을 먼저 뺀 뒤** 자른다 — 예전엔 상위 N 을 자른 뒤 판정된 것을 빼서, 상위 N 이 다 판정되면 그 프로젝트는 영영 0건이었다.
    // 순서(v·전량 판정): 소스 라운드로빈 · 소스 안은 최신 먼저 · 제외 소스(youtube) 빼고 · 카카오 카페·블로그는 맨 뒤.
    // 자르기는 평점 우선(v31 §2.3): 1~3점 먼저, 4~5점은 표본의 highRatingShare 만(모자라면 4~5점으로 채움 — 버리지 않고 다음 실행으로 미룬다).
    const rows = inputs as PendingInputRow[]
    const eligible = selectInputs(rows, { maxCharsTotal: Number.POSITIVE_INFINITY }).selected
    // 소비재(태그 ∪ 파생, 남헌 v61)는 미판정에서만 뺀다 — 이미 판정된 것(done)은 원래대로 빠지고 판정 행은 건드리지 않는다.
    const undone = eligible.filter((s) => !done.has(s.input.id))
    const isC = (s: (typeof undone)[number]) => isConsumer(s.input.id, s.input.source_key)
    const consumer = undone.filter(isC).length
    const ordered = orderForJudge(consumer ? undone.filter((s) => !isC(s)) : undone, {
      sourceOf: (s) => s.input.source_key, tsOf: (s) => timestampOf(s.input), excluded: excludedSources, last: lastSources,
    })
    const { sample: head, stats: rating } = pickSampleByRating(ordered.main, sampleSize, highRatingShare, (s) => s.input.rating)
    const selected = [...head, ...ordered.last.slice(0, Math.max(0, sampleSize - head.length))]
    const unjudged = ordered.main.length + ordered.last.length
    const reviews = selected.map((s) => ({ input_id: s.input.id as string, text: s.text.slice(0, MAX_REVIEW_CHARS) }))
    const base = { total: selected.length, unjudged, excluded: ordered.excludedCount, consumer }
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
  return { pendingFor, countFor, prefilterByProject, state, currentPrefilter }
}
