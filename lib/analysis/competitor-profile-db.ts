// 경쟁사 프로필 스냅샷 생성 — DB 왕복 + LLM 호출. 순수 계산은 competitor-profile.ts.
//
// 부르는 곳: extract-run.ts(추출 성공 직후) · scripts/competitor-profile-backfill.mjs(기존 프로젝트 소급).
// 결과는 항상 돌려준다(던지지 않는다) — 프로필 실패가 멀쩡히 끝난 추출을 failed 로 뒤집지 않게(§7.1).
// 시간·비용(durationMs·costUsd)을 싣는다: 배치가 agent_run_steps 에 extract 스텝과 같은 모양으로 남겨
// "프로필을 붙인 뒤 extract 처리량이 달라졌나"를 주간 점검에서 셀 수 있다(남헌 2026-09-29).
//
// 끄기: COMPETITOR_PROFILE=off — 호출 없이 skipped 로 돌아온다(사유 기록).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { callLlmWithModel, describeFailure, isQuotaFailure, type LlmProvider } from './llm.ts'
import { selectInputs } from './extract-select.ts'
import { dropIrrelevant, type RelevanceRow } from './relevance-judge.ts'
import {
  PROFILE_MAX_CHARS_PER_INPUT,
  PROFILE_MAX_CHARS_TOTAL,
  PROFILE_PROMPT_VERSION,
  SECTIONS,
  buildProfilePrompt,
  inputWindow,
  resolveProfile,
  validateProfile,
  type ProfileInput,
  type ProfileStatus,
} from './competitor-profile.ts'

export type ProfileTrigger = 'extract' | 'backfill' | 'manual'

export interface ProfileOutcome {
  status: ProfileStatus | 'skipped'
  reason: string | null
  /** 저장된 행 id. 저장 실패·skipped 면 null. */
  snapshotId: string | null
  model: string | null
  durationMs: number
  /** claude-cli 봉투 total_cost_usd(명목). 못 읽음·다른 프로바이더는 null. */
  costUsd: number | null
  claims: number
  droppedClaims: number
  inputs: number
  /** 오늘 다시 불러도 같은 실패(한도). 배치는 여기서 멈춘다. */
  quotaExhausted: boolean
}

type InputRow = ProfileInput & {
  review_sources?: { display_name: string | null } | null
  review_fingerprints?: { product_ref: string | null }[] | null
}

/** 프로젝트 하나의 프로필 스냅샷을 만들어 competitor_profile_snapshots 에 넣는다. */
export async function generateCompetitorProfile(
  supabase: SupabaseClient,
  projectId: string,
  provider: LlmProvider,
  opts: { trigger: ProfileTrigger; version?: string } = { trigger: 'manual' },
): Promise<ProfileOutcome> {
  const t0 = Date.now()
  const version = opts.version ?? PROFILE_PROMPT_VERSION
  const done = (o: Partial<ProfileOutcome> & { status: ProfileOutcome['status'] }): ProfileOutcome => ({
    reason: null, snapshotId: null, model: null, costUsd: null, claims: 0, droppedClaims: 0, inputs: 0, quotaExhausted: false,
    ...o, durationMs: Date.now() - t0,
  })

  if ((process.env.COMPETITOR_PROFILE ?? '').trim().toLowerCase() === 'off') {
    return done({ status: 'skipped', reason: 'COMPETITOR_PROFILE=off' })
  }

  // 1. 재료 — 프로젝트 · 원문(소스 이름·product_ref 조인) · 관련성 판정
  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch, competitor_url, purpose, business_model')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError || !project) return done({ status: 'skipped', reason: `프로젝트 조회 실패: ${projectError?.message ?? '없음'}` })

  const { data: inputRows, error: inputsError } = await supabase
    .from('analysis_inputs')
    .select('id, source_key, raw_text, created_at, collected_at, review_sources(display_name), review_fingerprints(product_ref)')
    .eq('project_id', projectId)
    .is('purged_at', null)
    .order('created_at', { ascending: true })
  if (inputsError) return done({ status: 'skipped', reason: `원문 조회 실패: ${inputsError.message}` })
  const inputs: ProfileInput[] = ((inputRows ?? []) as unknown as InputRow[]).map((r) => ({
    id: r.id,
    source_key: r.source_key,
    source_name: r.review_sources?.display_name ?? null,
    raw_text: r.raw_text,
    product_ref: r.review_fingerprints?.[0]?.product_ref ?? null,
    created_at: r.created_at ?? null,
    collected_at: r.collected_at ?? null,
  }))
  if (inputs.length === 0) return done({ status: 'skipped', reason: '원문 0건' })

  // extract 와 같은 규칙: 판정 캐시를 못 읽으면 아무것도 빼지 않는다(§7.1).
  const { data: relevanceRows, error: relevanceError } = await supabase
    .from('review_relevance_verdicts')
    .select('input_id, verdict, human_verdict')
    .eq('project_id', projectId)
  const relevance = dropIrrelevant(inputs, relevanceError ? null : ((relevanceRows ?? []) as RelevanceRow[]))

  const selection = selectInputs(relevance.kept, { maxCharsTotal: PROFILE_MAX_CHARS_TOTAL, maxCharsPerInput: PROFILE_MAX_CHARS_PER_INPUT })
  if (selection.selected.length === 0) return done({ status: 'skipped', reason: '선별 뒤 원문 0건' })

  // 2. 호출
  const prompt = buildProfilePrompt(project, selection.selected, { collected: inputs.length, irrelevant: relevance.droppedIrrelevant })
  const used = selection.selected.map((s) => s.input)
  const window = inputWindow(used)
  const base = {
    project_id: projectId,
    prompt_version: version,
    trigger: opts.trigger,
    input_count: used.length,
    input_total: inputs.length,
    inputs_from: window.from,
    inputs_to: window.to,
  }

  let text = ''
  let model: string | null = null
  let costUsd: number | null = null
  try {
    const call = await callLlmWithModel(provider, prompt.system, prompt.user, 'competitor-profile')
    text = call.text
    model = call.model
    costUsd = call.costUsd ?? null
  } catch (e) {
    const reason = `호출 실패: ${describeFailure(e)}`.slice(0, 1000)
    // 실패도 행으로 남긴다 — "왜 프로필이 없나"에 답이 있어야 한다. 저장이 안 되면(마이그 미적용) 결과만 돌려준다.
    const { data: row } = await supabase.from('competitor_profile_snapshots')
      .insert({ ...base, status: 'failed', fail_reason: reason, sections: null, model, cost_usd: costUsd, duration_ms: Date.now() - t0 })
      .select('id').maybeSingle()
    return done({ status: 'failed', reason, snapshotId: row?.id ?? null, model, costUsd, inputs: used.length, quotaExhausted: isQuotaFailure(e) })
  }

  // 3. 해석 · 검증 · 저장
  const resolved = resolveProfile(text, prompt.refIndex)
  const verdict = validateProfile(resolved)
  const claims = SECTIONS.reduce((n, s) => n + resolved.sections[s].length, 0)
  const row = {
    ...base,
    status: verdict.status,
    fail_reason: verdict.reason,
    sections: verdict.status === 'failed' ? null : resolved.sections,
    dropped_claims: resolved.droppedClaims,
    cited_inputs: resolved.citedInputs,
    model,
    cost_usd: costUsd,
    duration_ms: Date.now() - t0,
  }
  const { data: saved, error: saveError } = await supabase.from('competitor_profile_snapshots').insert(row).select('id').maybeSingle()
  if (saveError) {
    // 마이그 미적용(42P01/PGRST205)이 여기로 온다. 생성은 됐지만 남지 않았다 — 성공으로 접지 않는다.
    return done({
      status: 'failed', reason: `저장 실패(${saveError.code ?? ''}): ${saveError.message}`.slice(0, 1000),
      model, costUsd, claims, droppedClaims: resolved.droppedClaims, inputs: used.length,
    })
  }
  return done({
    status: verdict.status, reason: verdict.reason, snapshotId: saved?.id ?? null,
    model, costUsd, claims, droppedClaims: resolved.droppedClaims, inputs: used.length,
  })
}
