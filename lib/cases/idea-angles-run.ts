// `/cases/report` 앵글 검증(옵션 B, I4) — 잡 본체. HTTP 껍데기는 app/api/cases/report/angles/route.ts.
//
// 흐름: POST(startAngles — 상한·캐시·행 insert, LLM 0) → after(runAngles — writer 1 + 앵글마다 judge 1(+재작성·재판정)) →
//       GET(readRun — 게으른 청소) 4초 폴링.
// ★ 프로바이더는 'claude-cli' **리터럴**(Vercel LLM_PROVIDER 무시, 폴백 0 — docs/llm-provider-policy.md).
// ★ 모든 앵글 요청(POST 1회 = idea_query_log 1행, 캐시 히트·limited·failed 포함)을 원문과 함께 남긴다(남헌 확정 2).
//   삭제·TTL 코드는 만들지 않는다. **로그(console)에는 원문·이메일을 남기지 않는다** — run id·단계·호출 수·모델만.
// ★ 셀프테스트(scripts/idea-angles-selftest.mjs)가 sb(가짜 Supabase)·raw(가짜 CLI)·now·env·resolveBinary 를 주입한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ClaudeCliError,
  CLAUDE_CLI_DEFAULT_MODEL,
  callLlmJsonWithModel,
  callLlmWithModel,
  describeFailure,
  isCliLimitError,
  requiredKeyFor,
} from '../analysis/llm.ts'
import { judgeHeadline, pickEnum, type JsonCall } from '../analysis/judge.ts'
import { buildEvidenceCorpus } from '../analysis/judge-prompt.ts'
import { ANGLE_TYPES } from '../analysis/types.ts'
import { resolveClaudeBinary, CLAUDE_CLI_VERSION } from '../insight/claude-cli.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import { parseSearchQuery, searchMoves, type SearchCorpora } from './search.ts'
import { toTerms } from './advisor.ts'
import {
  IDEA_ACTIVE, IDEA_ANCHOR_MOVES, IDEA_CACHE_DAYS, IDEA_COUNTED, IDEA_RUN_DEADLINE_MS, IDEA_STALE_MS,
  IDEA_REWRITE_SYSTEM, IDEA_WRITER_SYSTEM,
  buildIdeaCorpus, buildIdeaRewritePrompt, buildIdeaWriterPrompt, limitReason, parseWriterAngles, queryHash,
  refForQuote, staleRunning,
  type IdeaAngle, type IdeaEvidenceRow, type IdeaRunStatus,
} from './idea-angles.ts'

const PROVIDER = 'claude-cli' as const
const RUN_COLS = 'id, status, angles, llm_calls, models, cost_usd, cache_read_tokens, error, created_at, started_at, finished_at'

export type AngleDeps = {
  sb: SupabaseClient
  /** 매칭 코퍼스(케이스·무브·실패). 라우트는 loadCaseCorpus 를 넘긴다(next/cache 라 node 에서 못 부른다). */
  loadCorpus: () => Promise<SearchCorpora>
  now?: () => number
  env?: Record<string, string | undefined>
  /** 가짜 CLI 주입점. 기본 callLlmWithModel. */
  raw?: typeof callLlmWithModel
  resolveBinary?: typeof resolveClaudeBinary
}

type RunRow = {
  id: string; status: IdeaRunStatus; angles: IdeaAngle[] | null; llm_calls: number; models: string[] | null
  cost_usd: number | null; cache_read_tokens: number | null; error: string | null
  created_at: string; started_at: string | null; finished_at: string | null
}

/** GET·POST 응답 한 모양. 원문·요청자는 싣지 않는다. */
export function publicRun(r: RunRow) {
  return {
    run_id: r.id, status: r.status, angles: r.angles ?? [], llm_calls: r.llm_calls, models: r.models ?? [],
    cost_usd: r.cost_usd, cache_read_tokens: r.cache_read_tokens, error: r.error,
    created_at: r.created_at, started_at: r.started_at, finished_at: r.finished_at,
  }
}
export type PublicRun = ReturnType<typeof publicRun>

const iso = (ms: number) => new Date(ms).toISOString()
const slog = (run: string, step: string, extra: Record<string, string | number | null | undefined> = {}) =>
  console.log(`[idea-angles] run=${run} step=${step}${Object.entries(extra).map(([k, v]) => ` ${k}=${v ?? '-'}`).join('')}`)

type LogOutcome = 'new' | 'cache_hit' | 'limited' | 'failed'

/** idea_query_log 1행. 실패해도 요청은 계속 간다(분석용 기록이 기능을 멈추지 않게) — 대신 에러 로그를 남긴다. */
async function logQuery(sb: SupabaseClient, row: { query_text: string; query_hash: string; kind: string; requested_by: string; run_id: string | null; outcome: LogOutcome }) {
  const { error } = await sb.from('idea_query_log').insert(row)
  if (error) console.error(`[idea-angles] query_log insert failed outcome=${row.outcome}: ${error.code ?? ''} ${error.message}`)
}

async function countRuns(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await q
  if (error || count === null) throw new Error(`상한 집계 실패: ${error?.message ?? 'count null'}`)
  return count
}

export type StartResult =
  | { http: 400 | 500; body: { error: string } }
  | { http: 200; body: PublicRun; outcome: LogOutcome; schedule: { runId: string; q: string; kind: 'saas' | 'all' } | null }

/**
 * POST 본체. LLM 을 부르지 않는다 — 상한 → 캐시 → 행 insert 뒤 즉시 반환하고, 새 행이면 schedule 을 돌려
 * 라우트가 after() 로 runAngles 를 건다.
 *
 * 순서가 문서(I4-9: 상한 → 캐시)와 다르다: **캐시 먼저.** 캐시 히트는 LLM 0회라 구독 창을 안 쓰고 run 행도 안 만든다 —
 * 하루 10건을 다 쓴 사용자도 이미 만들어진 리포트(공유 링크)는 본다. 상한은 LLM 을 부를 새 행에만 건다.
 */
export async function startAngles(deps: AngleDeps, input: { q: unknown; kind: unknown; email: string }): Promise<StartResult> {
  const { sb } = deps
  const now = (deps.now ?? Date.now)()
  const { query, errors } = parseSearchQuery({ q: typeof input.q === 'string' ? input.q : null, kind: typeof input.kind === 'string' ? input.kind : null })
  // 원문이 없거나 매칭 낱말이 0개면 리포트 자체가 안 나온다(패널도 안 뜬다). 기록할 질의가 없다 — 로그 행 없음.
  if (errors.length || !query.q || toTerms(query.q).length === 0) {
    return { http: 400, body: { error: errors.join(' / ') || '아이디어 한 줄이 필요하다' } }
  }
  const q = query.q
  const kind = query.kind
  const hash = await queryHash(q, kind)
  const base = { query_text: q, query_hash: hash, kind, requested_by: input.email }
  const fail = async (msg: string): Promise<StartResult> => {
    await logQuery(sb, { ...base, run_id: null, outcome: 'failed' })
    return { http: 500, body: { error: msg } }
  }

  // 게으른 청소 — after() 가 잘려 queued·running 으로 남은 행이 동시 상한을 영영 막지 않게(크론 0).
  const stale = await sb.from('idea_angle_runs')
    .update({ status: 'failed', error: '시간 초과', finished_at: iso(now) })
    .in('status', [...IDEA_ACTIVE]).lt('created_at', iso(now - IDEA_STALE_MS))
  if (stale.error) return fail('앵글 검증 기록을 읽지 못했다')

  // 1. 캐시: 7일 안 done, 또는 지금 같은 질의로 도는 행.
  const cached = await sb.from('idea_angle_runs').select(RUN_COLS)
    .eq('query_hash', hash).eq('kind', kind).in('status', ['done', ...IDEA_ACTIVE])
    .gte('created_at', iso(now - IDEA_CACHE_DAYS * 86_400_000))
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (cached.error) return fail('앵글 검증 기록을 읽지 못했다')
  if (cached.data) {
    const row = cached.data as RunRow
    await logQuery(sb, { ...base, run_id: row.id, outcome: 'cache_hit' })
    slog(row.id, 'cache_hit', { status: row.status, llm_calls: row.llm_calls })
    return { http: 200, body: publicRun(row), outcome: 'cache_hit', schedule: null }
  }

  // 2. 상한(행 count). ponytail: 같은 순간 두 요청이면 1건 넘길 수 있다 — 허용목록 한 자리 수라 둔다.
  //    외부 사용자가 생기면 pg_advisory_xact_lock 1줄(RPC)로 바꾼다.
  let reason: string | null
  try {
    const runs = () => sb.from('idea_angle_runs').select('id', { count: 'exact', head: true })
    const [userToday, userActive, globalActive] = await Promise.all([
      countRuns(runs().eq('requested_by', input.email).in('status', [...IDEA_COUNTED]).gte('created_at', iso(now - 86_400_000))),
      countRuns(runs().eq('requested_by', input.email).in('status', [...IDEA_ACTIVE])),
      countRuns(runs().in('status', [...IDEA_ACTIVE])),
    ])
    reason = limitReason({ userToday, userActive, globalActive })
  } catch (e) {
    console.error(`[idea-angles] limit count failed: ${e instanceof Error ? e.message : String(e)}`)
    return fail('상한을 확인하지 못해 시작하지 않았다')
  }

  const status: IdeaRunStatus = reason ? 'limited' : 'queued'
  const ins = await sb.from('idea_angle_runs')
    .insert({ ...base, status, error: reason, finished_at: reason ? iso(now) : null })
    .select(RUN_COLS).single()
  if (ins.error || !ins.data) return fail('앵글 검증을 시작하지 못했다')
  const row = ins.data as RunRow
  const outcome: LogOutcome = reason ? 'limited' : 'new'
  await logQuery(sb, { ...base, run_id: row.id, outcome })
  slog(row.id, outcome, { llm_calls: 0 })
  return { http: 200, body: publicRun(row), outcome, schedule: reason ? null : { runId: row.id, q, kind } }
}

/** 실제 호출 수·모델·명목 비용을 JSON 재요청까지 포함해 센다(호출 **전에** 올려 실패한 호출도 센다). */
function meter(runId: string, raw: typeof callLlmWithModel) {
  const m = { calls: 0, models: [] as string[], cost: null as number | null, cacheRead: null as number | null }
  const counted: typeof callLlmWithModel = async (p, s, u, label) => {
    m.calls++
    slog(runId, `llm:${label}`, { llm_calls: m.calls })
    const r = await raw(p, s, u, label)
    m.models.push(r.model)
    if (typeof r.costUsd === 'number') m.cost = (m.cost ?? 0) + r.costUsd
    if (typeof r.cacheReadTokens === 'number') m.cacheRead = (m.cacheRead ?? 0) + r.cacheReadTokens
    slog(runId, `llm:${label}:ok`, { llm_calls: m.calls, model: r.model })
    return r
  }
  const call: JsonCall = (s, u, label) => callLlmJsonWithModel(PROVIDER, s, u, label, counted)
  return { m, call }
}

/** after() 안에서 도는 본체. 던지지 않는다 — 모든 실패를 행에 남긴다. */
export async function runAngles(deps: AngleDeps, job: { runId: string; q: string; kind: 'saas' | 'all' }): Promise<void> {
  const { sb } = deps
  const { runId } = job
  const clock = deps.now ?? Date.now
  const env = deps.env ?? process.env
  const t0 = clock()
  const { m, call } = meter(runId, deps.raw ?? callLlmWithModel)
  const angles: IdeaAngle[] = []
  let matched: string[] = []
  const save = async (patch: Record<string, unknown>) => {
    const { error } = await sb.from('idea_angle_runs').update({
      angles, llm_calls: m.calls, models: m.models, cost_usd: m.cost, cache_read_tokens: m.cacheRead,
      matched_case_ids: matched, ...patch,
    }).eq('id', runId)
    if (error) console.error(`[idea-angles] run=${runId} save failed: ${error.code ?? ''} ${error.message}`)
  }
  const finish = async (status: IdeaRunStatus, error: string | null) => {
    // 에러 문구는 GET 으로 화면에 나간다 — CLI stderr 에 비밀값이 섞여도 값은 지운다.
    await save({ status, error: error === null ? null : redactSecrets(error, env), finished_at: iso(clock()) })
    slog(runId, status, { llm_calls: m.calls, model: m.models.at(-1), angles: angles.length, ms: clock() - t0 })
  }

  await save({ status: 'running', started_at: iso(t0) })
  slog(runId, 'start', { kind: job.kind })
  const key = requiredKeyFor(PROVIDER)
  if (key && !env[key]) return finish('failed', `${key} 미설정`)

  try {
    const { query } = parseSearchQuery({ q: job.q, kind: job.kind })
    const result = searchMoves(query, await deps.loadCorpus())
    if (result.moves.status === 'not_run') return finish('failed', '선례 조회 실패')
    const cards = result.moves.cards.slice(0, IDEA_ANCHOR_MOVES)
    if (cards.length === 0) return finish('failed', '매칭된 선례 무브가 0건이라 선례 근거로 판정할 수 없다')
    matched = [...new Set(cards.map((c) => c.case_study_id))]
    const evq = await sb.from('case_evidence').select('case_study_id, case_move_id, snippet, supports_claim').in('case_study_id', matched)
    // 코퍼스 없이 돌리지 않는다 — 돌리면 판정이 구조적으로 "근거 없음"만 나온다(I4-1).
    if (evq.error) return finish('failed', '근거 조회 실패')
    const evidence = (evq.data ?? []) as IdeaEvidenceRow[]
    const rows = buildIdeaCorpus(cards, evidence, result.failed_angles.cards.slice(0, IDEA_ANCHOR_MOVES))
    const corpus = buildEvidenceCorpus(rows)
    const refByMove = new Map(cards.map((c) => [c.case_move_id, { slug: c.slug, case_move_id: c.case_move_id }]))
    const ideaAspect = [{ name: job.q, aspect_layer: null, notes: null }]
    const late = () => clock() - t0 > IDEA_RUN_DEADLINE_MS

    // writer 1회로 앵글 3개(문서 추정은 앵글마다 writer 1회 = 3회).
    const { data: w } = await call(IDEA_WRITER_SYSTEM, buildIdeaWriterPrompt(job.q, cards, evidence), 'idea:write')
    const planned = parseWriterAngles(w)
    if (planned.length === 0) return finish('failed', '앵글 문구를 만들지 못했다')
    slog(runId, 'writer:done', { planned: planned.length, llm_calls: m.calls })

    for (const p of planned) {
      if (late()) return finish('failed', `시간 초과 (${angles.length}/${planned.length}개 판정)`)
      const models: string[] = []
      const before = m.models.length
      // judge 는 앵글마다 따로 1회 — 3개를 한 프롬프트로 몰아 판정하면 앵글끼리 앵커링된다(판정 품질 절충 금지, 남헌 확정 1).
      let judged = await judgeHeadline(call, p.headline, ideaAspect, 'COPY', corpus, 'idea:judge')
      let headline = p.headline
      let headlineBefore: string | null = null
      // 마감이 지났으면 재작성을 건너뛴다 — 이 앵글은 "근거 없음(재작성 전)" 으로 남고 루프 머리에서 시간 초과로 끝난다.
      if (judged.verdict === 'UNSUBSTANTIATED' && !late()) {
        const { data: rw } = await call(IDEA_REWRITE_SYSTEM, buildIdeaRewritePrompt(headline, judged.reason, corpus.text, job.q), 'idea:rewrite')
        const next = typeof rw.headline_draft === 'string' ? rw.headline_draft.trim() : ''
        if (next) {
          headlineBefore = headline
          headline = next
          // 재판정. 안 하면 성과 주장을 걷어낸 문구에 "근거 없음" 이 그대로 붙는다(원 라우트와 같은 이유). 루프 금지 — 1회.
          judged = await judgeHeadline(call, headline, ideaAspect, 'COPY', corpus, 'idea:rejudge')
        }
      }
      models.push(...m.models.slice(before))
      angles.push({
        angle_type: pickEnum(p.angle_type, ANGLE_TYPES),
        headline, headline_before: headlineBefore, verdict: judged.verdict, reason: judged.reason,
        evidence_quote: judged.evidenceQuote, evidence_ref: judged.evidenceQuote ? refForQuote(rows, judged.evidenceQuote) : null,
        anchor: p.anchor_move_id ? refByMove.get(p.anchor_move_id) ?? null : null,
        rewritten: headlineBefore !== null, models,
      })
      // 앵글 1개 끝날 때마다 저장 — 부분 결과("3개 중 1개 완료")가 폴링에 바로 보인다.
      await save({})
      slog(runId, 'angle:done', { n: angles.length, verdict: judged.verdict, llm_calls: m.calls, model: judged.model })
    }
    if (late() && angles.at(-1)?.verdict === 'UNSUBSTANTIATED' && !angles.at(-1)?.rewritten) {
      return finish('failed', `시간 초과 (${angles.length}/${planned.length}개 판정, 마지막 앵글 재작성 전)`)
    }
    return finish('done', null)
  } catch (e) {
    // 한도(429·문구) → limited, 뒤 앵글은 돌리지 않는다(다음 호출도 429). 폴백 0.
    if (e instanceof ClaudeCliError && isCliLimitError(e)) {
      const m2 = /result=([\s\S]*)$/.exec(e.message)
      return finish('limited', `구독 사용량 한도다. ${(m2?.[1] ?? e.message).trim().slice(0, 200)}`)
    }
    if (e instanceof ClaudeCliError && e.timedOut) return finish('failed', `시간 초과 (${angles.length}개 판정)`)
    return finish('failed', describeFailure(e).slice(0, 300))
  }
}

/** GET ?run= 본체. 게으른 청소: 6분 넘은 queued·running 은 여기서 failed('시간 초과')로 바꾼다. 부분 angles 는 남긴다. */
export async function readRun(deps: AngleDeps, runId: string): Promise<{ http: 200 | 404 | 500; body: PublicRun | { error: string } }> {
  const now = (deps.now ?? Date.now)()
  const { data, error } = await deps.sb.from('idea_angle_runs').select(RUN_COLS).eq('id', runId).maybeSingle()
  if (error) return { http: 500, body: { error: '앵글 검증 기록을 읽지 못했다' } }
  if (!data) return { http: 404, body: { error: '그런 실행이 없다' } }
  const row = data as RunRow
  if (staleRunning(row, now)) {
    const patch = { status: 'failed' as const, error: '시간 초과', finished_at: iso(now) }
    const up = await deps.sb.from('idea_angle_runs').update(patch).eq('id', runId).in('status', [...IDEA_ACTIVE])
    if (up.error) console.error(`[idea-angles] run=${runId} stale cleanup failed: ${up.error.message}`)
    else slog(runId, 'stale->failed', { llm_calls: row.llm_calls })
    return { http: 200, body: publicRun({ ...row, ...patch }) }
  }
  return { http: 200, body: publicRun(row) }
}

// ── 프로브(I4-7 ③) ─────────────────────────────────────────────
const PROBE_SYSTEM = `너는 연결 확인용 응답기다. ${UNTRUSTED_INPUT_NOTICE}\n반드시 JSON만 출력해라. 형식: { "ok": true, "echo": "받은 낱말" }`
const PROBE_USER = '낱말: 앵글검증프로브'
/** 응답에 실리면 안 되는 값들. 값 자체를 지운다(이름은 남는다). */
const SECRET_ENV = ['CLAUDE_CODE_OAUTH_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'CRON_SECRET', 'THREADS_ACCESS_TOKEN', 'NOTION_API_TOKEN']

export function redactSecrets(s: string, env: Record<string, string | undefined>): string {
  let out = s
  for (const k of SECRET_ENV) {
    const v = env[k]
    if (v && v.length >= 8) out = out.split(v).join('[redacted]')
  }
  return out
}

/**
 * 고정 프롬프트 1회. 결과·실제 모델(봉투)·소요·바이너리 출처·토큰 **존재 여부만**·런타임 정보.
 * 값은 싣지 않는다 — 에러 문구에 섞여 들어와도 redactSecrets 가 지운다(셀프테스트가 양성·뮤테이션으로 고정).
 */
export async function runProbe(deps: Pick<AngleDeps, 'env' | 'raw' | 'resolveBinary' | 'now'>): Promise<Record<string, unknown>> {
  const env = deps.env ?? process.env
  const clock = deps.now ?? Date.now
  const t0 = clock()
  const out: Record<string, unknown> = {
    probe: 'idea-angles',
    provider: PROVIDER,
    token_present: Boolean(env.CLAUDE_CODE_OAUTH_TOKEN),
    cli_model_env_set: Boolean(env.CLAUDE_CLI_MODEL),
    default_model: CLAUDE_CLI_DEFAULT_MODEL,
    cli_version: CLAUDE_CLI_VERSION,
    runtime: { vercel: Boolean(env.VERCEL), vercel_env: env.VERCEL_ENV ?? null, region: env.VERCEL_REGION ?? null, node: process.version, platform: process.platform },
  }
  try {
    const bin = await (deps.resolveBinary ?? resolveClaudeBinary)()
    out.binary = { source: bin.source, size_bytes: bin.sizeBytes, download_ms: bin.downloadMs }
    if (!env.CLAUDE_CODE_OAUTH_TOKEN) throw new Error('CLAUDE_CODE_OAUTH_TOKEN 미설정')
    const t1 = clock()
    let model = ''
    let cost: number | null = null
    const raw = deps.raw ?? callLlmWithModel
    const { data } = await callLlmJsonWithModel(PROVIDER, PROBE_SYSTEM, PROBE_USER, 'idea:probe', async (p, s, u, l) => {
      const r = await raw(p, s, u, l); model = r.model; cost = r.costUsd ?? null; return r
    })
    Object.assign(out, { ok: data.ok === true, model, cost_usd: cost, llm_ms: clock() - t1, result: JSON.stringify(data).slice(0, 200) })
  } catch (e) {
    Object.assign(out, {
      ok: false,
      limited: e instanceof ClaudeCliError ? isCliLimitError(e) : false,
      timed_out: e instanceof ClaudeCliError ? e.timedOut : false,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 400),
    })
  }
  out.total_ms = clock() - t0
  console.log(`[idea-angles] probe ok=${String(out.ok)} model=${String(out.model ?? '-')} ms=${String(out.total_ms)} token_present=${String(out.token_present)}`)
  return JSON.parse(redactSecrets(JSON.stringify(out), env)) as Record<string, unknown>
}
