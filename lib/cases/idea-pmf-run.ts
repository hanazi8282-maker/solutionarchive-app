// `/cases/report` PMF 판정 사분면 자가진단(P3) — 잡 본체. HTTP 껍데기는 app/api/cases/report/pmf/route.ts.
// 정본: reports/2026-10-01/design-direction-pmf-judgment.md A2~A7 · P3. 순수 부품은 ./idea-pmf.ts(P2).
//
// 흐름: POST(startPmf — 검증·청소·캐시·상한·행 insert, LLM 0) → after(runQuestions — 병목 1(override 면 0) → matchMoves →
//       질문 1) → awaiting_answers(무기한) → PUT(submitAnswers — 조건부 UPDATE) → after(runScoring — 점수 1) → done.
// ★ 매칭 키는 병목 하나다. 구조화 4필드는 병목 추출 프롬프트 재료로만 쓰고 matchMoves 에는 selfFacets={} 를 넘긴다.
// ★ 사분면 산식은 lib/cases/match.ts 그대로(matchMoves·precedentAxis·demandAxis·quadrantOf — idea-pmf.ts 경유).
// ★ 확인 불가 ≠ 없음(§7.1): 코퍼스·근거 조회 실패는 failed('… 조회 실패'), 조회는 정상인데 선례 0건만 no_match.
// ★ 프로바이더는 'claude-cli' 리터럴(폴백 0). 429 → limited, 뒤 호출 안 함.
// ★ 행은 본인만 읽는다(.eq('requested_by')) — 답변은 창업자의 사업 계획 원문이다(A7, 확인 질문 3).
// ★ console 에는 원문·이메일·답변을 남기지 않는다 — run id·단계·호출 수·모델만.
// ★ 셀프테스트(scripts/idea-pmf-run-selftest.mjs)가 sb·raw·now·env 를 주입한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ClaudeCliError, callLlmWithModel, describeFailure, isCliLimitError, requiredKeyFor } from '../analysis/llm.ts'
import { matchFailedAngles, productKindOf, toTerms } from './advisor.ts'
import { IDEA_ACTIVE, IDEA_CACHE_DAYS, IDEA_STALE_MS, queryHash, staleRunning, type IdeaEvidenceRow } from './idea-angles.ts'
import { meter, redactSecrets } from './idea-angles-run.ts'
import {
  IDEA_PMF_QUESTION_SYSTEM, IDEA_PMF_SCORE_SYSTEM, PMF_ACTIVE, PMF_COUNTED,
  buildQuestionPrompt, buildScorePrompt, inputHash, parsePmfAnswers, parsePmfInput, parsePmfQuestions, parsePmfScores,
  planAfterMatch, pmfAnswerRows, pmfCacheKey, pmfLimitReason, pmfQuadrant, resolveBottleneck,
  type PmfAnswer, type PmfInput, type PmfQuestion, type PmfRunStatus, type PmfSalient,
} from './idea-pmf.ts'
import { matchMoves } from './match.ts'
import { parseSearchQuery, type SearchCorpora } from './search.ts'

const PROVIDER = 'claude-cli' as const
// 한 줄 리터럴로 둔다 — 이어 붙이면 supabase-js 의 select 타입 추론이 GenericStringError 로 떨어진다.
const RUN_COLS = 'id, status, kind, bottleneck, bottleneck_source, bottleneck_confidence, bottleneck_reason, match_status, match_reason, matched_case_move_ids, salient, questions, precedent_axis, demand_axis, is_self_reported, quadrant, llm_calls, models, cost_usd, cache_read_tokens, error, created_at, started_at, answered_at, finished_at'
const ANSWER_COLS = 'question_id, factor, question, anchor_move_id, answer_text, importance, satisfaction, opportunity_score, evidence_quote, notes, is_self_reported'
/** 캐시가 돌려주는 상태 — failed·limited 는 다시 돌릴 수 있어야 해서 뺀다. */
const CACHEABLE = ['queued', 'running', 'awaiting_answers', 'scoring', 'done', 'no_match'] as const

export type PmfDeps = {
  sb: SupabaseClient
  /** 매칭 코퍼스. 라우트는 loadCaseCorpus 를 넘긴다(next/cache 라 node 에서 못 부른다). */
  loadCorpus: () => Promise<SearchCorpora>
  now?: () => number
  env?: Record<string, string | undefined>
  /** 가짜 CLI 주입점. 기본 callLlmWithModel. */
  raw?: typeof callLlmWithModel
}

type Num = number | string | null
export type PmfRunRow = {
  id: string; status: PmfRunStatus; kind: 'saas' | 'all'
  bottleneck: string | null; bottleneck_source: 'llm' | 'user' | null; bottleneck_confidence: 'high' | 'low' | null; bottleneck_reason: string | null
  match_status: 'matched' | 'no_match' | 'not_run' | null; match_reason: string | null; matched_case_move_ids: string[] | null
  salient: PmfSalient[] | null; questions: PmfQuestion[] | null
  precedent_axis: Num; demand_axis: Num; is_self_reported: boolean; quadrant: string | null
  llm_calls: number; models: string[] | null; cost_usd: Num; cache_read_tokens: number | null; error: string | null
  created_at: string; started_at: string | null; answered_at: string | null; finished_at: string | null
}
type AnswerRow = {
  question_id: string; factor: string; question: string; anchor_move_id: string | null; answer_text: string | null
  importance: Num; satisfaction: Num; opportunity_score: Num; evidence_quote: string | null; notes: string | null; is_self_reported: boolean
}

/** PostgREST 는 numeric 을 문자열로 줄 수 있다 — 숫자로 고정(null 은 null). */
const num = (v: Num | undefined): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

/** 응답 한 모양. 원문(query_text)·구조화 입력(input)·요청자는 싣지 않는다. 답변은 본인이라 싣는다. */
export function publicPmfRun(r: PmfRunRow, answers: AnswerRow[] = []) {
  return {
    run_id: r.id, status: r.status, kind: r.kind,
    bottleneck: r.bottleneck, bottleneck_source: r.bottleneck_source, bottleneck_confidence: r.bottleneck_confidence, bottleneck_reason: r.bottleneck_reason,
    match_status: r.match_status, match_reason: r.match_reason, matched_case_move_ids: r.matched_case_move_ids ?? [],
    salient: r.salient ?? [], questions: r.questions ?? [],
    precedent_axis: num(r.precedent_axis), demand_axis: num(r.demand_axis), is_self_reported: true as const, quadrant: r.quadrant,
    answers: answers.map((a) => ({
      ...a, importance: num(a.importance), satisfaction: num(a.satisfaction), opportunity_score: num(a.opportunity_score), is_self_reported: true as const,
    })),
    llm_calls: r.llm_calls, models: r.models ?? [], cost_usd: num(r.cost_usd), cache_read_tokens: r.cache_read_tokens, error: r.error,
    created_at: r.created_at, started_at: r.started_at, answered_at: r.answered_at, finished_at: r.finished_at,
  }
}
export type PublicPmfRun = ReturnType<typeof publicPmfRun>

const iso = (ms: number) => new Date(ms).toISOString()
const slog = (run: string, step: string, extra: Record<string, string | number | null | undefined> = {}) =>
  console.log(`[idea-pmf] run=${run} step=${step}${Object.entries(extra).map(([k, v]) => ` ${k}=${v ?? '-'}`).join('')}`)

type LogOutcome = 'new' | 'cache_hit' | 'limited' | 'failed'

/** idea_query_log 1행(source='pmf_api', pmf_run_id — run_id 는 앵글 FK 라 비운다, 마이그 000050 CHECK). 실패해도 요청은 계속 간다. */
async function logQuery(sb: SupabaseClient, row: { query_text: string; query_hash: string; kind: string; requested_by: string; pmf_run_id: string | null; outcome: LogOutcome }) {
  const { error } = await sb.from('idea_query_log').insert({ ...row, run_id: null, source: 'pmf_api' })
  if (error) console.error(`[idea-pmf] query_log insert failed outcome=${row.outcome}: ${error.code ?? ''}`)
}

async function countRows(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await q
  if (error || count === null) throw new Error(`limit count failed: ${error?.message ?? 'count null'}`)
  return count
}

/**
 * 게으른 청소(크론 0). queued 는 생성 시각, running·scoring 은 시작 시각 기준 6분.
 * scoring 을 created_at 으로 재면 며칠 전에 만든 행이 답을 내자마자 청소된다 — 그래서 둘로 나눈다.
 */
async function sweepStale(sb: SupabaseClient, now: number) {
  const patch = { status: 'failed', error: '시간 초과', finished_at: iso(now) }
  const cut = iso(now - IDEA_STALE_MS)
  const a = await sb.from('idea_pmf_runs').update(patch).eq('status', 'queued').lt('created_at', cut)
  const b = await sb.from('idea_pmf_runs').update(patch).in('status', ['running', 'scoring']).lt('started_at', cut)
  return a.error ?? b.error
}

export type PmfJob = { runId: string; q: string; kind: 'saas' | 'all'; input: PmfInput }
export type StartResult =
  | { http: 400 | 500; body: { error: string; field?: string } }
  | { http: 200; body: PublicPmfRun; outcome: LogOutcome; schedule: PmfJob | null }

/**
 * POST 본체. LLM 0. 검증(400) → 청소 → 캐시(본인 행만, fresh 면 건너뜀) → 상한 → insert → 로그.
 * 캐시가 상한보다 먼저다(앵글과 같은 이유 — 캐시 히트는 구독 창을 안 쓴다).
 */
export async function startPmf(
  deps: PmfDeps,
  input: { q: unknown; kind: unknown; input: unknown; fresh?: unknown; email: string },
): Promise<StartResult> {
  const { sb } = deps
  const now = (deps.now ?? Date.now)()
  const { query, errors } = parseSearchQuery({ q: typeof input.q === 'string' ? input.q : null, kind: typeof input.kind === 'string' ? input.kind : null })
  if (errors.length || !query.q) return { http: 400, body: { error: errors.join(' / ') || '아이디어 한 줄이 필요하다' } }
  const parsed = parsePmfInput(input.input)
  if (!parsed.ok) return { http: 400, body: { error: parsed.error, field: parsed.field } }
  const q = query.q
  const kind = query.kind
  const hash = await queryHash(q, kind)
  const ih = await inputHash(parsed.input)
  const base = { query_text: q, query_hash: hash, kind, requested_by: input.email }
  const fail = async (msg: string): Promise<StartResult> => {
    await logQuery(sb, { ...base, pmf_run_id: null, outcome: 'failed' })
    return { http: 500, body: { error: msg } }
  }

  if (await sweepStale(sb, now)) return fail('PMF 판정 기록을 읽지 못했다')

  // 1. 캐시 — 본인 행만(pmfCacheKey 가 requested_by 를 싣는다). 남의 행을 주면 남의 답변이 보인다.
  if (input.fresh !== true) {
    const cached = await sb.from('idea_pmf_runs').select(RUN_COLS)
      .match(pmfCacheKey(input.email, hash, ih)).in('status', [...CACHEABLE])
      .gte('created_at', iso(now - IDEA_CACHE_DAYS * 86_400_000))
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (cached.error) return fail('PMF 판정 기록을 읽지 못했다')
    if (cached.data) {
      const row = cached.data as PmfRunRow
      const answers = await readAnswers(sb, row.id)
      if (!answers) return fail('답변을 읽지 못했다')
      await logQuery(sb, { ...base, pmf_run_id: row.id, outcome: 'cache_hit' })
      slog(row.id, 'cache_hit', { status: row.status, llm_calls: row.llm_calls })
      return { http: 200, body: publicPmfRun(row, answers), outcome: 'cache_hit', schedule: null }
    }
  }

  // 2. 상한. 하루·동시는 idea_pmf_runs 로, 전역 동시는 PMF + 앵글 합. ponytail: 같은 순간 두 요청이면 1건 넘길 수 있다
  //    (허용목록 한 자리 수라 둔다 — 외부 사용자가 생기면 pg_advisory_xact_lock RPC).
  let reason: string | null
  try {
    const runs = () => sb.from('idea_pmf_runs').select('id', { count: 'exact', head: true })
    const [userToday, userActive, pmfActive, angleActive] = await Promise.all([
      countRows(runs().eq('requested_by', input.email).in('status', [...PMF_COUNTED]).gte('created_at', iso(now - 86_400_000))),
      countRows(runs().eq('requested_by', input.email).in('status', [...PMF_ACTIVE])),
      countRows(runs().in('status', [...PMF_ACTIVE])),
      countRows(sb.from('idea_angle_runs').select('id', { count: 'exact', head: true }).in('status', [...IDEA_ACTIVE])),
    ])
    reason = pmfLimitReason({ userToday, userActive, pmfActive, angleActive })
  } catch (e) {
    console.error(`[idea-pmf] ${e instanceof Error ? e.message : String(e)}`)
    return fail('상한을 확인하지 못해 시작하지 않았다')
  }

  const status: PmfRunStatus = reason ? 'limited' : 'queued'
  const ins = await sb.from('idea_pmf_runs')
    .insert({ ...base, input: parsed.input, input_hash: ih, status, error: reason, finished_at: reason ? iso(now) : null })
    .select(RUN_COLS).single()
  if (ins.error || !ins.data) return fail('PMF 판정을 시작하지 못했다')
  const row = ins.data as PmfRunRow
  const outcome: LogOutcome = reason ? 'limited' : 'new'
  await logQuery(sb, { ...base, pmf_run_id: row.id, outcome })
  slog(row.id, outcome, { llm_calls: 0 })
  return { http: 200, body: publicPmfRun(row), outcome, schedule: reason ? null : { runId: row.id, q, kind, input: parsed.input } }
}

/** 실행 중 CLI 예외 → 행 상태. 429 → limited(폴백 0), 타임아웃 → failed('시간 초과'). */
function classify(e: unknown): { status: PmfRunStatus; error: string } {
  if (e instanceof ClaudeCliError && isCliLimitError(e)) {
    const m = /result=([\s\S]*)$/.exec(e.message)
    return { status: 'limited', error: `구독 사용량 한도다. ${(m?.[1] ?? e.message).trim().slice(0, 200)}` }
  }
  if (e instanceof ClaudeCliError && e.timedOut) return { status: 'failed', error: '시간 초과' }
  return { status: 'failed', error: describeFailure(e).slice(0, 300) }
}

/** 잡 1(after 안). 던지지 않는다 — 모든 실패를 행에 남긴다. */
export async function runQuestions(deps: PmfDeps, job: PmfJob): Promise<void> {
  const { sb } = deps
  const { runId } = job
  const clock = deps.now ?? Date.now
  const env = deps.env ?? process.env
  const t0 = clock()
  const { m, call } = meter(runId, deps.raw ?? callLlmWithModel)
  const save = async (patch: Record<string, unknown>) => {
    const { error } = await sb.from('idea_pmf_runs').update({
      llm_calls: m.calls, models: m.models, cost_usd: m.cost, cache_read_tokens: m.cacheRead, ...patch,
    }).eq('id', runId)
    if (error) console.error(`[idea-pmf] run=${runId} save failed: ${error.code ?? ''}`)
  }
  const finish = async (status: PmfRunStatus, error: string | null, patch: Record<string, unknown> = {}) => {
    // awaiting_answers 는 끝이 아니다(잡 2 가 남았다) — finished_at 을 찍지 않는다.
    const done = status !== 'awaiting_answers'
    await save({ ...patch, status, error: error === null ? null : redactSecrets(error, env), ...(done ? { finished_at: iso(clock()) } : {}) })
    slog(runId, status, { llm_calls: m.calls, model: m.models.at(-1), ms: clock() - t0 })
  }

  await save({ status: 'running', started_at: iso(t0) })
  slog(runId, 'start', { kind: job.kind, override: job.input.bottleneck_override ? 1 : 0 })
  const key = requiredKeyFor(PROVIDER)
  if (key && !env[key]) return finish('failed', `${key} 미설정`)

  try {
    // 코퍼스를 먼저 읽는다 — 못 읽었으면 병목 호출(구독 창)을 쓰기 전에 멈춘다. null = 확인 불가(선례 0건이 아니다).
    const corpus = await deps.loadCorpus()
    if (!corpus.studies || !corpus.moves || !corpus.failedAngles) return finish('failed', '선례 조회 실패')

    const b = await resolveBottleneck(job.q, job.input, async (s, u) => (await call(s, u, 'pmf:bottleneck')).data)
    const bPatch = { bottleneck: b.bottleneck, bottleneck_source: b.source, bottleneck_confidence: b.confidence, bottleneck_reason: b.reason || null }
    if (!b.bottleneck) return finish('failed', '병목을 읽지 못했다', bPatch)

    // kind 스코프(searchMoves 와 같은 방식): SaaS 만이면 케이스를 먼저 좁히고 그 id 로 무브를 좁힌다.
    const studies = job.kind === 'saas' ? corpus.studies.filter((s) => productKindOf(s.business_model) === 'software') : corpus.studies
    const hidden = corpus.studies.filter((s) => !studies.includes(s) && s.review_status === 'approved').length
    const ids = new Set(studies.map((s) => s.id))
    const match = matchMoves(b.bottleneck, studies, corpus.moves.filter((mv) => ids.has(mv.case_study_id)), null, {})
    const plan = planAfterMatch(match)
    const scopeNote = hidden ? ` (소비재 ${hidden}건 숨김(kind=all 로 보기))` : ''
    if (plan.next === 'failed') return finish('failed', plan.error, { ...bPatch, match_status: match.status })
    if (plan.next === 'no_match') {
      return finish('no_match', null, { ...bPatch, match_status: 'no_match', match_reason: plan.match_reason + scopeNote, precedent_axis: plan.precedent_axis })
    }
    const mPatch = {
      ...bPatch, match_status: 'matched', match_reason: plan.match_reason + scopeNote,
      matched_case_move_ids: plan.anchor_move_ids, precedent_axis: plan.precedent_axis,
    }
    const anchors = match.moves.filter((mv) => plan.anchor_move_ids.includes(mv.id))
    const evq = await sb.from('case_evidence').select('case_study_id, case_move_id, snippet, supports_claim')
      .in('case_study_id', [...new Set(anchors.map((mv) => mv.case_study_id))])
    // 근거 없이 질문을 만들지 않는다 — 만들면 선례에 묶이지 않은 질문이 된다(I4-1 과 같은 이유).
    if (evq.error) return finish('failed', '근거 조회 실패', mPatch)
    const failedCards = matchFailedAngles(toTerms(job.q), corpus.failedAngles).cards.slice(0, 3)

    const { data } = await call(IDEA_PMF_QUESTION_SYSTEM,
      buildQuestionPrompt(job.q, job.input, anchors, (evq.data ?? []) as IdeaEvidenceRow[], failedCards), 'pmf:questions')
    const parsedQ = parsePmfQuestions(data, plan.anchor_move_ids)
    if (!parsedQ.ok) return finish('failed', parsedQ.error, mPatch)

    const ins = await sb.from('idea_pmf_answers').insert(pmfAnswerRows(runId, parsedQ.questions))
    if (ins.error) return finish('failed', '질문을 저장하지 못했다', mPatch)
    return finish('awaiting_answers', null, { ...mPatch, salient: parsedQ.salient, questions: parsedQ.questions })
  } catch (e) {
    const c = classify(e)
    return finish(c.status, c.error)
  }
}

async function readRow(sb: SupabaseClient, runId: string, email: string) {
  return sb.from('idea_pmf_runs').select(RUN_COLS).eq('id', runId).eq('requested_by', email).maybeSingle()
}
async function readAnswers(sb: SupabaseClient, runId: string): Promise<AnswerRow[] | null> {
  const { data, error } = await sb.from('idea_pmf_answers').select(ANSWER_COLS).eq('run_id', runId).order('question_id', { ascending: true })
  return error ? null : ((data ?? []) as AnswerRow[])
}

export type SubmitResult =
  | { http: 400 | 404 | 409 | 500; body: { error: string } }
  | { http: 200; body: PublicPmfRun; schedule: { runId: string } }

/**
 * PUT 본체. 본인 행 ∧ awaiting_answers 만. 상태 전환을 **조건부 UPDATE** 로 먼저 잡는다(두 번 누르면 두 번째는 409).
 * 답 저장이 실패하면 awaiting_answers 로 되돌려 다시 낼 수 있게 한다.
 */
export async function submitAnswers(deps: PmfDeps, input: { runId: string; answers: unknown; email: string }): Promise<SubmitResult> {
  const { sb } = deps
  const now = (deps.now ?? Date.now)()
  const cur = await readRow(sb, input.runId, input.email)
  if (cur.error) return { http: 500, body: { error: 'PMF 판정 기록을 읽지 못했다' } }
  if (!cur.data) return { http: 404, body: { error: '그런 실행이 없다' } }
  const row = cur.data as PmfRunRow
  if (row.status !== 'awaiting_answers') return { http: 409, body: { error: `지금은 답을 받는 단계가 아니다 (${row.status})` } }
  const parsed = parsePmfAnswers(input.answers, row.questions ?? [])
  if (!parsed.ok) return { http: 400, body: { error: parsed.error } }

  // started_at 을 여기서 찍는다 — 청소가 scoring 을 이 시각으로 잰다(after() 가 늦게 떠도 오래된 잡 1 시작 시각으로 재지 않게).
  const lock = await sb.from('idea_pmf_runs')
    .update({ status: 'scoring', answered_at: iso(now), started_at: iso(now), error: null })
    .eq('id', input.runId).eq('requested_by', input.email).eq('status', 'awaiting_answers')
    .select(RUN_COLS)
  if (lock.error) return { http: 500, body: { error: 'PMF 판정 기록을 쓰지 못했다' } }
  if (!lock.data?.length) return { http: 409, body: { error: '이미 제출됐다' } }

  for (const a of parsed.answers) {
    const up = await sb.from('idea_pmf_answers').update({ answer_text: a.text }).eq('run_id', input.runId).eq('question_id', a.id)
    if (up.error) {
      await sb.from('idea_pmf_runs').update({ status: 'awaiting_answers' }).eq('id', input.runId).eq('status', 'scoring')
      return { http: 500, body: { error: '답을 저장하지 못했다. 다시 제출해 달라' } }
    }
  }
  slog(input.runId, 'answered', { answered: parsed.answers.filter((a) => a.text).length, total: parsed.answers.length })
  return { http: 200, body: publicPmfRun(lock.data[0] as PmfRunRow, await readAnswers(sb, input.runId) ?? []), schedule: { runId: input.runId } }
}

/** 잡 2(after 안). 답변 → 점수 1회 → UPDATE → GENERATED opportunity_score 를 다시 읽어 수요축 → 사분면. 던지지 않는다. */
export async function runScoring(deps: PmfDeps, job: { runId: string }): Promise<void> {
  const { sb } = deps
  const { runId } = job
  const clock = deps.now ?? Date.now
  const env = deps.env ?? process.env
  const t0 = clock()
  const { m, call } = meter(runId, deps.raw ?? callLlmWithModel)
  // 잡 1 의 계측에 이어서 더한다(실행 1건 = 행 1개).
  let prior = { calls: 0, models: [] as string[], cost: null as number | null, cacheRead: null as number | null }
  const finish = async (status: PmfRunStatus, error: string | null, patch: Record<string, unknown> = {}) => {
    const cost = prior.cost === null && m.cost === null ? null : (prior.cost ?? 0) + (m.cost ?? 0)
    const cacheRead = prior.cacheRead === null && m.cacheRead === null ? null : (prior.cacheRead ?? 0) + (m.cacheRead ?? 0)
    const { error: e } = await sb.from('idea_pmf_runs').update({
      ...patch, status, error: error === null ? null : redactSecrets(error, env), finished_at: iso(clock()),
      llm_calls: prior.calls + m.calls, models: [...prior.models, ...m.models], cost_usd: cost, cache_read_tokens: cacheRead,
    }).eq('id', runId).eq('status', 'scoring')
    if (e) console.error(`[idea-pmf] run=${runId} save failed: ${e.code ?? ''}`)
    slog(runId, status, { llm_calls: prior.calls + m.calls, model: m.models.at(-1), ms: clock() - t0 })
  }

  const cur = await sb.from('idea_pmf_runs').select(RUN_COLS).eq('id', runId).maybeSingle()
  if (cur.error || !cur.data) {
    console.error(`[idea-pmf] run=${runId} scoring read failed`)
    return
  }
  const row = cur.data as PmfRunRow
  prior = { calls: row.llm_calls ?? 0, models: row.models ?? [], cost: num(row.cost_usd), cacheRead: row.cache_read_tokens }
  const precedent = num(row.precedent_axis)
  const questions = row.questions ?? []
  slog(runId, 'scoring:start', { questions: questions.length })
  if (precedent === null) return finish('failed', '선례축이 비어 사분면을 낼 수 없다')
  const key = requiredKeyFor(PROVIDER)
  if (key && !env[key]) return finish('failed', `${key} 미설정`)

  try {
    const stored = await readAnswers(sb, runId)
    if (!stored) return finish('failed', '답변을 읽지 못했다')
    const answers: PmfAnswer[] = questions.map((q) => ({ id: q.id, text: stored.find((a) => a.question_id === q.id)?.answer_text ?? null }))
    const { data } = await call(IDEA_PMF_SCORE_SYSTEM, buildScorePrompt(questions, answers), 'pmf:score')
    for (const s of parsePmfScores(data, questions, answers)) {
      const { question_id, ...patch } = s
      const up = await sb.from('idea_pmf_answers').update(patch).eq('run_id', runId).eq('question_id', question_id)
      if (up.error) return finish('failed', '점수를 저장하지 못했다')
    }
    // 산식은 DB GENERATED 한 곳이 갖는다 — 여기서 재계산하지 않고 다시 읽는다.
    const after = await readAnswers(sb, runId)
    if (!after) return finish('failed', '점수를 다시 읽지 못했다')
    const pq = pmfQuadrant(after.map((a) => num(a.opportunity_score)), precedent)
    if (!pq.ok) return finish('failed', pq.error)
    return finish('done', null, { demand_axis: pq.demand_axis, quadrant: pq.quadrant })
  } catch (e) {
    const c = classify(e)
    return finish(c.status, c.error)
  }
}

/** GET ?run= 본체. 본인 행만(남의 행은 404 — 있는지도 말하지 않는다). 게으른 청소: 6분 넘은 queued·running·scoring → failed. */
export async function readPmfRun(deps: PmfDeps, runId: string, email: string): Promise<{ http: 200 | 404 | 500; body: PublicPmfRun | { error: string } }> {
  const now = (deps.now ?? Date.now)()
  const { data, error } = await readRow(deps.sb, runId, email)
  if (error) return { http: 500, body: { error: 'PMF 판정 기록을 읽지 못했다' } }
  if (!data) return { http: 404, body: { error: '그런 실행이 없다' } }
  let row = data as PmfRunRow
  if (staleRunning(row, now, PMF_ACTIVE)) {
    const patch = { status: 'failed' as const, error: '시간 초과', finished_at: iso(now) }
    const up = await deps.sb.from('idea_pmf_runs').update(patch).eq('id', runId).in('status', [...PMF_ACTIVE])
    if (up.error) console.error(`[idea-pmf] run=${runId} stale cleanup failed`)
    else { slog(runId, 'stale->failed', { llm_calls: row.llm_calls }); row = { ...row, ...patch } }
  }
  const answers = await readAnswers(deps.sb, runId)
  if (!answers) return { http: 500, body: { error: '답변을 읽지 못했다' } }
  return { http: 200, body: publicPmfRun(row, answers) }
}
