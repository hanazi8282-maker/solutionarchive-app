#!/usr/bin/env node
// `/cases/report` 앵글 검증(옵션 B, I4) 셀프테스트 — 네트워크·DB·실제 claude 0. 가짜 CLI · 가짜 Supabase · 픽스처.
//   node scripts/idea-angles-selftest.mjs            (정상 — 전부 통과해야 한다)
//   node scripts/idea-angles-selftest.mjs --mutate   (뮤테이션 — 코드를 일부러 깨면 해당 검사가 **실패**해야 한다)
//
// 고정하는 것:
//   1. 순수 부품: 해시 정규화 · 코퍼스 우선순위 · 상한 판정 · summarizeVerdicts · staleRunning · 인용→출처
//   2. 잡 전체: POST(startAngles) → after(runAngles) → 앵글마다 저장(부분 결과) → done / 한도 429 → limited /
//      타임아웃 → failed(부분 유지) / 잘못된 JSON → failed / 토큰 없음 → failed(호출 0) / 게으른 청소
//   3. 상한: 사용자 10건/일 · 사용자 동시 1 · 전역 동시 2 — 넘으면 limited, LLM 호출 0
//   4. 캐시: 같은 질의(대소문자·공백 달라도) 두 번째 POST → 같은 run_id, llm 호출 증가 0
//   5. 질의 로그: POST 1회 = idea_query_log 1행(new · cache_hit · limited · failed 전부)
//   6. 프로브: 토큰 값이 응답 문자열에 0회(에러 문구에 섞여 들어와도)
// 뮤테이션(--mutate): 상한 끄기 · 캐시 끄기 · 로그 끄기 · 프로브 가리기 끄기 — 각각 해당 그룹이 실패해야 통과.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ClaudeCliError, cliFailure, CLAUDE_CLI_DEFAULT_MODEL } from '../lib/analysis/llm.ts'
import {
  IDEA_LIMITS, IDEA_STALE_MS, buildIdeaCorpus, limitReason, normalizeIdeaQuery, queryHash, refForQuote,
  staleRunning, summarizeVerdicts,
} from '../lib/cases/idea-angles.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUN_SRC = path.join(ROOT, 'lib/cases/idea-angles-run.ts')
const MUTATE = process.argv.includes('--mutate')
console.log = ((orig) => (...a) => { if (process.env.VERBOSE) orig(...a) })(console.log) // [idea-angles] 단계 로그는 VERBOSE=1 때만
console.warn = ((orig) => (...a) => { if (process.env.VERBOSE) orig(...a) })(console.warn)
console.error = ((orig) => (...a) => { if (process.env.VERBOSE) orig(...a) })(console.error)

let pass = 0
let fail = 0
const say = (s) => process.stdout.write(`${s}\n`)
const ok = (name, cond) => { if (cond) pass++; else { fail++; say(`❌ ${name}`) } }

// ── 1. 순수 부품 ─────────────────────────────────────────────────
if (!MUTATE) {
  ok('해시: 대소문자·공백만 다른 질의는 같은 키', (await queryHash('  Invoice   자동 발송 ', 'saas')) === (await queryHash('invoice 자동 발송', 'saas')))
  ok('해시: kind 가 다르면 다른 키', (await queryHash('invoice', 'saas')) !== (await queryHash('invoice', 'all')))
  ok('해시: 64자 16진', /^[0-9a-f]{64}$/.test(await queryHash('x', 'saas')))
  ok('정규화: 소문자·공백 축약', normalizeIdeaQuery(' A  b\tC ') === 'a b c')
  const card = { case_study_id: 's1', slug: 'acme', brand_name: 'Acme', claim: 'C', transfer_note: 'T', case_move_id: 'm1' }
  const rows = buildIdeaCorpus([card],
    [{ case_study_id: 's1', case_move_id: null, snippet: '보조 근거', supports_claim: false },
     { case_study_id: 's1', case_move_id: 'm1', snippet: '주 근거', supports_claim: true },
     { case_study_id: 'sX', case_move_id: null, snippet: '매칭 밖', supports_claim: true }],
    [{ claimed_angle: 'A', outcome: 'O' }])
  ok('코퍼스: 근거(detail_page, supports_claim 먼저) → 무브(ad) → 실패(review), 매칭 밖 근거 제외',
    rows.map((r) => `${r.source_type}:${String(r.raw_text).slice(0, 4)}`).join('|') === 'detail_page:주 근거|detail_page:보조 근|ad:[Acm|review:[실패]')
  ok('인용→출처: 근거 문장 인용은 그 케이스 슬러그', refForQuote(rows, ' 주   근거 ')?.slug === 'acme')
  ok('인용→출처: 실패 원장 인용은 링크 없음(null)', refForQuote(rows, 'A: O') === null)
  ok('상한: 오늘 10건째면 막는다', limitReason({ userToday: IDEA_LIMITS.perUserDaily, userActive: 0, globalActive: 0 })?.includes('10건'))
  ok('상한: 내 실행이 도는 중이면 막는다', Boolean(limitReason({ userToday: 0, userActive: 1, globalActive: 1 })))
  ok('상한: 전역 2건이 돌면 막는다 · 1건이면 통과', Boolean(limitReason({ userToday: 0, userActive: 0, globalActive: 2 })) && limitReason({ userToday: 9, userActive: 0, globalActive: 1 }) === null)
  const s = summarizeVerdicts([{ verdict: 'SUBSTANTIATED' }, { verdict: 'UNSUBSTANTIATED' }, { verdict: 'UNSUBSTANTIATED' }])
  ok('요약: 3판정 합 = 앵글 수', s.SUBSTANTIATED === 1 && s.EXPERIENTIAL === 0 && s.UNSUBSTANTIATED === 2 && s.total === 3)
  const T = Date.parse('2026-10-01T00:00:00Z')
  ok('staleRunning: running 7분 → true · 5분 → false · done → false',
    staleRunning({ status: 'running', started_at: new Date(T - 7 * 60_000).toISOString(), created_at: new Date(T - 8 * 60_000).toISOString() }, T)
    && !staleRunning({ status: 'running', started_at: new Date(T - 5 * 60_000).toISOString(), created_at: new Date(T - 5 * 60_000).toISOString() }, T)
    && !staleRunning({ status: 'done', started_at: new Date(T - 60 * 60_000).toISOString(), created_at: new Date(T - 60 * 60_000).toISOString() }, T))
}

// ── 가짜 Supabase(쓰는 빌더 메서드만) ────────────────────────────
function fakeDb(clock) {
  const tables = { idea_angle_runs: [], idea_query_log: [], case_evidence: [] }
  const updates = []
  const failSelect = new Set()
  let seq = 0
  const defaults = {
    idea_angle_runs: { angles: [], llm_calls: 0, models: [], cost_usd: null, cache_read_tokens: null, matched_case_ids: [], error: null, started_at: null, finished_at: null },
    idea_query_log: { run_id: null },
  }
  const from = (t) => {
    const st = { op: 'select', filters: [], opts: {}, payload: null, order: null, limit: null, one: null }
    const exec = () => {
      const rows = tables[t]
      if (!rows) return { data: null, error: { code: '42P01', message: `relation ${t} does not exist` }, count: null }
      if (st.op === 'select' && failSelect.has(t)) return { data: null, error: { code: 'X', message: 'boom' }, count: null }
      if (st.op === 'insert') {
        const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: new Date(clock()).toISOString(), ...(defaults[t] ?? {}), ...structuredClone(st.payload) }
        rows.push(row)
        return { data: st.one ? { ...row } : [{ ...row }], error: null }
      }
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      if (st.op === 'update') {
        for (const r of hit) Object.assign(r, structuredClone(st.payload))
        updates.push({ t, payload: structuredClone(st.payload), n: hit.length })
        return { data: null, error: null }
      }
      if (st.opts.head) return { data: null, count: hit.length, error: null }
      let out = hit.map((r) => ({ ...r }))
      if (st.order) out.sort((a, b) => (a[st.order[0]] < b[st.order[0]] ? -1 : 1) * (st.order[1] ? 1 : -1))
      if (st.limit !== null) out = out.slice(0, st.limit)
      if (st.one) return { data: out[0] ?? null, error: null }
      return { data: out, error: null }
    }
    const b = {
      select(cols, opts = {}) { if (st.op === 'select') st.opts = opts; return b },
      insert(p) { st.op = 'insert'; st.payload = p; return b },
      update(p) { st.op = 'update'; st.payload = p; return b },
      eq(k, v) { st.filters.push((r) => r[k] === v); return b },
      in(k, vs) { st.filters.push((r) => vs.includes(r[k])); return b },
      gte(k, v) { st.filters.push((r) => r[k] >= v); return b },
      lt(k, v) { st.filters.push((r) => r[k] < v); return b },
      order(k, o) { st.order = [k, o?.ascending !== false]; return b },
      limit(n) { st.limit = n; return b },
      maybeSingle() { st.one = 'maybe'; return b },
      single() { st.one = 'single'; return b },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej) },
    }
    return b
  }
  return { sb: { from }, tables, updates, failSelect }
}

// ── 픽스처(cases-search-selftest 와 같은 모양) ────────────────────
const STUDIES = [{ id: 's1', slug: 'acme-saas', brand_name: 'Acme', bottleneck: 'CONVERSION', reader_problem: 'PRICE_TOO_LOW', business_model: 'SAAS', review_status: 'approved' }]
const MOVES = [{ id: 'm1', case_study_id: 's1', lever: 'PRICING', claim: '무료 플랜에 사용량 상한을 두고 결제 유도', transfer_note: '무료 플랜 상한을 정한다', evidence_grade: 'C', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved' }]
const CORPORA = { studies: STUDIES, moves: MOVES, failedAngles: [] }
const EVIDENCE = [{ case_study_id: 's1', case_move_id: 'm1', snippet: '무료 플랜 상한 도입 뒤 유료 전환율이 2배로 올랐다', supports_claim: true }]
const Q = '결제 전환 무료 플랜 SaaS'
const EMAIL = 'a@x.io'
const TOKEN = 'sk-ant-oat01-SELFTEST-SECRET-VALUE-0123456789'
const ENV = { CLAUDE_CODE_OAUTH_TOKEN: TOKEN }

/**
 * 가짜 CLI(= callLlmWithModel 자리). 라벨·심사 문구로 답을 고른다. failAt: { label, nth, err } 이면 그 호출에서 던진다.
 * 심사 문구: H1 → SUBSTANTIATED(코퍼스에 있는 인용) · H2 → EXPERIENTIAL · H3 → UNSUBSTANTIATED → 재작성 H3b → 재판정 UNSUBSTANTIATED.
 */
function fakeCli({ failAt = null, badJson = false } = {}) {
  const calls = []
  const seen = {}
  const raw = async (provider, system, user, label) => {
    calls.push({ provider, label })
    seen[label] = (seen[label] ?? 0) + 1
    if (failAt && failAt.label === label && failAt.nth === seen[label]) throw failAt.err()
    if (badJson) return { text: '설명문만 있고 JSON 은 없다', model: CLAUDE_CLI_DEFAULT_MODEL, costUsd: 0.001, cacheReadTokens: 0 }
    const head = /## 심사 대상 문구\n(.*)/.exec(user)?.[1] ?? ''
    let out
    if (label === 'idea:write') out = { angles: [
      { angle_type: 'PAS', headline_draft: 'H1 무료 상한으로 결제 전환', anchor_move_id: 'm1', reason: 'r' },
      { angle_type: 'MECHANISM', headline_draft: 'H2 쓰는 만큼만', anchor_move_id: null, reason: 'r' },
      { angle_type: 'NOT_A_TYPE', headline_draft: 'H3 전환율 3배 보장', anchor_move_id: 'zzz', reason: 'r' },
      { angle_type: 'PAS', headline_draft: 'H4 넘치는 앵글', anchor_move_id: null, reason: 'r' },
    ] }
    else if (label === 'idea:rewrite') out = { headline_draft: 'H3b 상한을 직접 확인해 보세요', reason: 'x' }
    else if (label === 'idea:probe') out = { ok: true, echo: '앵글검증프로브' }
    else if (head.startsWith('H1')) out = { verdict: 'SUBSTANTIATED', reason: 'r1', evidence_quote: '유료 전환율이 2배로 올랐다' }
    else if (head.startsWith('H2')) out = { verdict: 'EXPERIENTIAL', reason: 'r2', evidence_quote: null }
    else out = { verdict: 'UNSUBSTANTIATED', reason: 'r3', evidence_quote: null }
    return { text: JSON.stringify(out), model: CLAUDE_CLI_DEFAULT_MODEL, costUsd: 0.01, cacheReadTokens: 100 }
  }
  return { raw, calls }
}
const limit429 = () => cliFailure({ exitCode: 1, timedOut: false, stdout: '', stderr: '' },
  { is_error: true, subtype: 'error_during_execution', api_error_status: 429, result: '5-hour limit reached ∙ resets 3pm' })
const timeout = () => cliFailure({ exitCode: null, timedOut: true, stdout: '', stderr: '' }, null)

function world(mod, opts = {}) {
  let t = Date.parse('2026-10-01T03:00:00Z')
  const clock = () => t
  const db = fakeDb(clock)
  db.tables.case_evidence.push(...EVIDENCE)
  const cli = fakeCli(opts)
  const deps = { sb: db.sb, loadCorpus: async () => CORPORA, now: clock, env: opts.env ?? ENV, raw: cli.raw }
  const post = async (q = Q, email = EMAIL, kind = 'saas') => {
    const r = await mod.startAngles(deps, { q, kind, email })
    if (r.http === 200 && r.schedule) await mod.runAngles(deps, r.schedule) // = after()
    return r
  }
  return { db, cli, deps, post, tick: (ms) => { t += ms } }
}

/** 그룹별 검사. 반환: { group: 실패 수 }. 뮤테이션 모드에서 그룹 단위로 "실패해야 한다"를 본다. */
async function suite(mod) {
  const groups = {}
  const g = (group, name, cond) => { groups[group] ??= 0; if (!cond) { groups[group]++; if (!MUTATE) ok(`${group}: ${name}`, false) } else if (!MUTATE) ok(`${group}: ${name}`, true) }

  // A. 성공 경로 + 부분 저장 + 로그
  {
    const w = world(mod)
    const r = await w.post()
    const row = w.db.tables.idea_angle_runs[0]
    g('job', 'POST 는 queued 로 즉시 반환(LLM 대기 없음)', r.http === 200 && r.body.status === 'queued' && r.body.llm_calls === 0)
    g('job', 'after() 뒤 done', row?.status === 'done' && row.error === null)
    g('job', 'writer 1 + judge 3 + 재작성 1 + 재판정 1 = 6호출', row?.llm_calls === 6 && w.cli.calls.length === 6)
    g('job', 'provider 는 전부 claude-cli 리터럴', w.cli.calls.every((c) => c.provider === 'claude-cli'))
    g('job', 'writer 는 1회(앵글 3개를 한 번에)', w.cli.calls.filter((c) => c.label === 'idea:write').length === 1)
    g('job', 'judge 는 앵글마다 1회(몰아 판정 안 함)', w.cli.calls.filter((c) => c.label === 'idea:judge').length === 3)
    g('job', '앵글 상한 3(writer 가 4개 줘도)', row?.angles.length === 3)
    g('job', 'models 는 봉투 모델(claude-sonnet-5-5) 6개', row?.models.length === 6 && row.models.every((m) => m === 'claude-sonnet-5-5'))
    g('job', '명목 비용·캐시 읽기 토큰 합산', Math.abs(row?.cost_usd - 0.06) < 1e-9 && row.cache_read_tokens === 600)
    const [a1, a2, a3] = row?.angles ?? []
    g('job', 'H1: 선례 근거 있음 + 인용 + /library 슬러그 + 앵커', a1?.verdict === 'SUBSTANTIATED' && a1.evidence_quote && a1.evidence_ref?.slug === 'acme-saas' && a1.anchor?.slug === 'acme-saas')
    g('job', 'H2: 체험 기반, 인용 없음', a2?.verdict === 'EXPERIENTIAL' && a2.evidence_quote === null && a2.evidence_ref === null)
    g('job', 'H3: 재작성·재판정(순화됨), 어휘 밖 유형은 null, 모르는 앵커는 null', a3?.rewritten && a3.headline.startsWith('H3b') && a3.headline_before?.startsWith('H3') && a3.angle_type === null && a3.anchor === null && a3.models.length === 3)
    const partial = w.db.updates.filter((u) => u.t === 'idea_angle_runs' && Array.isArray(u.payload.angles)).map((u) => u.payload.angles.length)
    g('job', '앵글 1개 끝날 때마다 저장(부분 결과 1·2·3)', [1, 2, 3].every((n) => partial.includes(n)))
    g('job', 'matched_case_ids 에 매칭 케이스', row?.matched_case_ids?.includes('s1'))
    const logs = w.db.tables.idea_query_log
    g('log', 'POST 1회 = 로그 1행(outcome new, 원문·해시·요청자·run_id)', logs.length === 1 && logs[0].outcome === 'new' && logs[0].query_text === Q && logs[0].requested_by === EMAIL && logs[0].run_id === row?.id && /^[0-9a-f]{64}$/.test(logs[0].query_hash))

    // B. 캐시: 대소문자·공백만 다른 같은 질의 → 같은 run_id, 호출 증가 0
    const before = w.cli.calls.length
    const r2 = await w.post(`  ${Q.toUpperCase().replace(/ /g, '   ')} `)
    g('cache', '두 번째 POST 는 같은 run_id', r2.http === 200 && r2.body.run_id === row?.id && r2.body.status === 'done')
    g('cache', 'llm 호출 증가 0 · run 행 증가 0', w.cli.calls.length === before && w.db.tables.idea_angle_runs.length === 1)
    g('log', '캐시 히트도 로그 1행(outcome cache_hit, 같은 run_id)', logs.length === 2 && logs[1].outcome === 'cache_hit' && logs[1].run_id === row?.id)
    // 7일이 지나면 캐시가 아니다
    w.tick(8 * 86_400_000)
    const r3 = await w.post()
    g('cache', '7일 지난 done 은 재사용하지 않는다(새 run)', r3.body.run_id !== row?.id && w.db.tables.idea_angle_runs.length === 2)
  }

  // C. 상한
  {
    const w = world(mod)
    for (let i = 0; i < IDEA_LIMITS.perUserDaily; i++) w.db.tables.idea_angle_runs.push({ id: `d${i}`, query_hash: `h${i}`, kind: 'saas', status: 'done', requested_by: EMAIL, created_at: new Date(Date.parse('2026-10-01T02:00:00Z')).toISOString(), angles: [], llm_calls: 6, models: [] })
    const r = await w.post()
    g('limit', '11번째(사용자 24h) → limited + 한도 문장', r.body.status === 'limited' && /10건/.test(r.body.error ?? ''))
    g('limit', 'limited 는 LLM 호출 0', w.cli.calls.length === 0)
    g('log', 'limited 도 로그 1행', w.db.tables.idea_query_log.at(-1)?.outcome === 'limited')
    const other = await w.post(Q, 'b@x.io')
    g('limit', '다른 사용자는 통과(사용자별 상한)', other.body.status === 'queued' || other.body.status === 'done')
  }
  {
    const w = world(mod)
    w.db.tables.idea_angle_runs.push({ id: 'r1', query_hash: 'hx', kind: 'saas', status: 'running', requested_by: EMAIL, created_at: new Date(Date.parse('2026-10-01T02:59:00Z')).toISOString(), started_at: null, angles: [], llm_calls: 1, models: [] })
    const r = await w.post()
    g('limit', '내 실행이 도는 중(동시 1) → limited', r.body.status === 'limited' && w.cli.calls.length === 0)
  }
  {
    const w = world(mod)
    for (const [id, who] of [['g1', 'p@x.io'], ['g2', 'q@x.io']]) w.db.tables.idea_angle_runs.push({ id, query_hash: id, kind: 'saas', status: 'queued', requested_by: who, created_at: new Date(Date.parse('2026-10-01T02:59:30Z')).toISOString(), started_at: null, angles: [], llm_calls: 0, models: [] })
    const r = await w.post()
    g('limit', '전역 동시 2 → 세 번째 사용자 limited', r.body.status === 'limited' && w.cli.calls.length === 0)
    w.tick(IDEA_STALE_MS + 1_000)
    const r2 = await w.post()
    g('job', 'POST 가 6분 넘은 queued·running 을 먼저 청소 → 상한 풀림', r2.body.status === 'queued' && w.db.tables.idea_angle_runs.filter((x) => x.id.startsWith('g')).every((x) => x.status === 'failed' && x.error === '시간 초과'))
  }

  // D. 한도 429 — 두 번째 judge 에서. 부분 결과 1개 유지, 뒤 호출 없음.
  {
    const w = world(mod, { failAt: { label: 'idea:judge', nth: 2, err: limit429 } })
    await w.post()
    const row = w.db.tables.idea_angle_runs[0]
    g('job', '429 → limited + 리셋 문구', row.status === 'limited' && /resets 3pm/.test(row.error ?? ''))
    g('job', '429 뒤 앵글은 돌리지 않는다(부분 1개 유지)', row.angles.length === 1 && w.cli.calls.length === 3 && row.llm_calls === 3)
  }
  // E. 타임아웃 — 첫 재작성에서.
  {
    const w = world(mod, { failAt: { label: 'idea:rewrite', nth: 1, err: timeout } })
    await w.post()
    const row = w.db.tables.idea_angle_runs[0]
    g('job', '타임아웃 → failed(시간 초과), 한도 아님', row.status === 'failed' && /시간 초과/.test(row.error ?? ''))
    g('job', '타임아웃 전 부분 결과 2개 유지', row.angles.length === 2)
  }
  // F. 잘못된 JSON — writer 가 두 번(원 + JSON 재요청) 다 설명문.
  {
    const w = world(mod, { badJson: true })
    await w.post()
    const row = w.db.tables.idea_angle_runs[0]
    g('job', '잘못된 JSON → failed(JSON 해석 실패), 재요청 포함 2호출', row.status === 'failed' && /JSON/.test(row.error ?? '') && row.llm_calls === 2)
  }
  // G. 토큰 없음 — 호출 0.
  {
    const w = world(mod, { env: {} })
    await w.post()
    const row = w.db.tables.idea_angle_runs[0]
    g('job', 'CLAUDE_CODE_OAUTH_TOKEN 없음 → failed(미설정), LLM 호출 0', row.status === 'failed' && row.error === 'CLAUDE_CODE_OAUTH_TOKEN 미설정' && w.cli.calls.length === 0)
  }
  // H. 게으른 청소(GET) + 근거 조회 실패
  {
    const w = world(mod)
    w.db.tables.idea_angle_runs.push({ id: 'st', query_hash: 'h', kind: 'saas', status: 'running', requested_by: EMAIL, created_at: new Date(Date.parse('2026-10-01T02:52:00Z')).toISOString(), started_at: new Date(Date.parse('2026-10-01T02:53:00Z')).toISOString(), finished_at: null, angles: [{ verdict: 'EXPERIENTIAL', headline: 'p' }], llm_calls: 2, models: [], error: null, cost_usd: null, cache_read_tokens: null })
    const r = await mod.readRun(w.deps, 'st')
    g('job', 'GET: started_at 7분 전 running → failed(시간 초과), 부분 angles 유지', r.body.status === 'failed' && r.body.error === '시간 초과' && r.body.angles.length === 1 && w.db.tables.idea_angle_runs[0].status === 'failed')
    g('job', 'GET 응답에 원문·요청자 없음', !('query_text' in r.body) && !('requested_by' in r.body))
    g('job', 'GET: 없는 run → 404', (await mod.readRun(w.deps, 'nope')).http === 404)
    const w2 = world(mod)
    w2.db.failSelect.add('case_evidence')
    await w2.post()
    g('job', '근거 조회 실패 → failed(근거 조회 실패), 코퍼스 없이 LLM 안 부름', w2.db.tables.idea_angle_runs[0].error === '근거 조회 실패' && w2.cli.calls.length === 0)
  }
  // I. 로그 — failed 경로(상한 집계 실패)
  {
    const w = world(mod)
    w.db.failSelect.add('idea_angle_runs')
    const r = await w.post()
    g('log', 'POST 자체 실패(기록 조회 실패) → 500 + 로그 outcome failed', r.http === 500 && w.db.tables.idea_query_log.at(-1)?.outcome === 'failed')
  }
  // J. 프로브 — 토큰 값이 응답에 0회. 에러 문구에 값이 섞여 들어오는 최악을 만든다.
  {
    const bin = async () => ({ path: '/tmp/claude', source: 'tmp-cache', sizeBytes: 214_000_000, downloadMs: 0 })
    const good = await mod.runProbe({ env: { ...ENV, VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_REGION: 'icn1' }, raw: fakeCli().raw, resolveBinary: bin })
    g('probe', '성공: ok · 실제 모델 · 바이너리 출처 · 토큰 존재 true', good.ok === true && good.model === 'claude-sonnet-5-5' && good.binary?.source === 'tmp-cache' && good.token_present === true && good.runtime?.region === 'icn1')
    g('probe', '성공 응답에 토큰 값 0회', !JSON.stringify(good).includes(TOKEN))
    const leakyErr = () => new ClaudeCliError(`claude -p 실패 (exit 1): stderr=auth header Bearer ${TOKEN} rejected`)
    const bad = await mod.runProbe({ env: ENV, raw: fakeCli({ failAt: { label: 'idea:probe', nth: 1, err: leakyErr } }).raw, resolveBinary: bin })
    g('probe', '실패 문구에 토큰이 섞여도 응답에 값 0회(이름만)', bad.ok === false && !JSON.stringify(bad).includes(TOKEN) && JSON.stringify(bad).includes('[redacted]'))
    const none = await mod.runProbe({ env: {}, raw: fakeCli().raw, resolveBinary: bin })
    g('probe', '토큰 없음 → token_present false · 호출 안 함', none.token_present === false && none.ok === false && /미설정/.test(none.error))
  }
  return groups
}

// ── K. 매칭 리포트 질의 기록(report_view, 남헌 2026-10-01 — 익명 포함) ─────────────
// lib/cases/idea-angles-log.ts 를 가짜 Supabase 로 돌린다. page.tsx 배선은 텍스트로 고정(after() 안 · 익명 NULL).
const LOG_SRC = path.join(ROOT, 'lib/cases/idea-angles-log.ts')
const PAGE_SRC = path.join(ROOT, 'app/cases/report/page.tsx')
const LOG_KEYS = new Set(['id', 'created_at', 'run_id', 'query_text', 'query_hash', 'kind', 'requested_by', 'outcome', 'source'])

async function logSuite(mod, pageSrc) {
  const groups = {}
  const g = (group, name, cond) => { groups[group] ??= 0; if (!cond) groups[group]++; if (!MUTATE) ok(`report_view/${group}: ${name}`, cond) }
  const lines = []
  const saved = [console.log, console.warn, console.error]
  console.log = console.warn = console.error = (...a) => { lines.push(a.map(String).join(' ')) }
  try {
    const T0 = Date.parse('2026-10-01T03:00:00Z')
    const bucket = () => mod.newLogBucket(T0)
    // 익명: 식별자 없이 1행
    {
      const db = fakeDb(() => T0)
      const r = await mod.logReportView(db.sb, { q: Q, kind: 'saas', email: null }, { bucket: bucket(), now: T0 })
      const rows = db.tables.idea_query_log
      g('anon', '익명 질의 → logged · 1행', r === 'logged' && rows.length === 1)
      g('anon', 'requested_by NULL · source report_view · outcome view · run_id NULL · 원문·64자 해시', rows[0]?.requested_by === null && rows[0].source === 'report_view' && rows[0].outcome === 'view' && rows[0].run_id === null && rows[0].query_text === Q && /^[0-9a-f]{64}$/.test(rows[0].query_hash))
      g('anon', '개인 필드 0(허용 컬럼 밖 키 없음 — IP·UA·쿠키·Referer·이메일 자리 없음)', rows.length === 1 && Object.keys(rows[0]).every((k) => LOG_KEYS.has(k)))
    }
    // 로그인: 이메일 포함 1행
    {
      const db = fakeDb(() => T0)
      const r = await mod.logReportView(db.sb, { q: Q, kind: 'all', email: EMAIL }, { bucket: bucket(), now: T0 })
      const rows = db.tables.idea_query_log
      g('signed', '로그인 질의 → 1행 · requested_by 이메일 · kind all', r === 'logged' && rows.length === 1 && rows[0].requested_by === EMAIL && rows[0].kind === 'all')
      g('signed', '해시는 앵글 API 와 같은 키(queryHash)', rows[0]?.query_hash === await queryHash(Q, 'all'))
    }
    // 기록 실패: 던지지 않는다(에러 반환 · from() 자체가 던짐 둘 다)
    {
      const leaky = { from: () => ({ insert: async () => ({ error: { code: '23514', message: `Failing row contains (${Q}, ${EMAIL})`, details: `(${Q}, ${EMAIL})` } }) }) }
      const r1 = await mod.logReportView(leaky, { q: Q, kind: 'saas', email: EMAIL }, { bucket: bucket(), now: T0 }).catch(() => 'threw')
      const throwing = { from: () => { throw new Error(`boom ${Q}`) } }
      const r2 = await mod.logReportView(throwing, { q: Q, kind: 'saas', email: EMAIL }, { bucket: bucket(), now: T0 }).catch(() => 'threw')
      g('fail', 'insert 에러 → failed(던지지 않음)', r1 === 'failed')
      g('fail', 'from() 이 던져도 → failed(던지지 않음)', r2 === 'failed')
      g('fail', '실패는 console 경고 1줄 이상 남긴다(조용히 삼키지 않음)', lines.some((l) => l.includes('insert failed code=23514')) && lines.some((l) => l.includes('insert threw')))
    }
    // 플러드 천장: 분당 N 초과분은 기록 0 + 버려진 건수 경고, 시간이 지나면 다시 기록하고 누계를 말한다
    {
      const db = fakeDb(() => T0)
      const b = bucket()
      const N = mod.REPORT_LOG_PER_MIN
      const res = []
      for (let i = 0; i < N + 1; i++) res.push(await mod.logReportView(db.sb, { q: Q, kind: 'saas', email: null }, { bucket: b, now: T0 }))
      g('bucket', `같은 순간 ${N + 1}건 → ${N}건 기록 · 1건 dropped`, db.tables.idea_query_log.length === N && res.at(-1) === 'dropped')
      g('bucket', '버림 경고에 건수(dropped=1)', lines.some((l) => /flood ceiling .*dropped=1\b/.test(l)))
      for (let i = 0; i < 99; i++) await mod.logReportView(db.sb, { q: Q, kind: 'saas', email: null }, { bucket: b, now: T0 })
      g('bucket', '버린 건은 기록 0 · 100건째 누계 경고', db.tables.idea_query_log.length === N && lines.some((l) => /dropped=100\b/.test(l)))
      const back = await mod.logReportView(db.sb, { q: Q, kind: 'saas', email: null }, { bucket: b, now: T0 + 60_000 })
      g('bucket', '1분 뒤 다시 기록 + 재개 경고에 누계 100', back === 'logged' && db.tables.idea_query_log.length === N + 1 && lines.some((l) => /resumed — 100 /.test(l)))
    }
    // 콘솔: 원문·이메일 0회(위 실패 경로에서 에러 문구에 섞여 들어와도)
    g('console', `console ${lines.length}줄에 질의 원문 0회 · 이메일 0회`, lines.length > 0 && lines.every((l) => !l.includes(Q) && !l.includes(EMAIL)))
    // page 배선(텍스트): after() 안에서만 부르고, 이메일은 allowed 일 때만
    g('wire', 'page: logReportView 는 after() 안에서만(응답을 막지 않음)', /after\(\(\) => logReportView\(sb, logged\)\)/.test(pageSrc) && (pageSrc.match(/logReportView\(/g) ?? []).length === 1)
    g('wire', "page: email 은 verdict.kind === 'allowed' 일 때만, 아니면 null", /email: verdict\.kind === 'allowed' \? verdict\.email : null/.test(pageSrc))
    g('wire', 'page: 헤더(IP·UA·Referer)를 기록 행에 싣지 않는다', !/x-forwarded-for|user-agent|referer|cookie/i.test(pageSrc.slice(pageSrc.indexOf('const logged'), pageSrc.indexOf('after(() => logReportView'))))
  } finally {
    [console.log, console.warn, console.error] = saved
  }
  return groups
}

const real = await import(pathToFileURL(RUN_SRC).href)
const realLog = await import(pathToFileURL(LOG_SRC).href)
const pageSrc = fs.readFileSync(PAGE_SRC, 'utf8')
if (!MUTATE) {
  await suite(real)
  await logSuite(realLog, pageSrc)
  say(fail ? `idea-angles-selftest: 실패 ${fail}건 / 통과 ${pass}건` : `idea-angles-selftest: 통과 ${pass}건 — 순수 부품 · 잡 전체(가짜 CLI) · 상한 · 캐시 · 질의 로그 · 프로브 가리기 · 리포트 질의 기록(익명·로그인·실패·천장·콘솔)`)
  process.exitCode = fail ? 1 : 0
} else {
  // 뮤테이션: 원본을 문자열 치환한 사본을 같은 폴더에 잠깐 만들어(상대 import 유지) 불러오고 지운다.
  const src = fs.readFileSync(RUN_SRC, 'utf8')
  const MUTANTS = [
    ['limit', '상한 판정 끄기', 'reason = limitReason({ userToday, userActive, globalActive })', 'reason = null'],
    ['cache', '캐시 끄기', 'if (cached.data) {', 'if (false && cached.data) {'],
    ['log', '질의 로그 끄기', "const { error } = await sb.from('idea_query_log').insert(row)", 'const error = null as { code?: string; message: string } | null; void row'],
    ['probe', '프로브 가리기 끄기', 'redactSecrets(JSON.stringify(out), env)', 'JSON.stringify(out)'],
  ]
  const baseline = await suite(real)
  ok('뮤테이션 전: 원본은 모든 그룹 통과', Object.values(baseline).every((n) => n === 0))
  for (const [group, name, from, to] of MUTANTS) {
    ok(`뮤테이션 대상 문자열이 원본에 있다: ${name}`, src.includes(from))
    const tmp = path.join(ROOT, 'lib/cases', `.mutant-idea-angles-run-${group}.ts`)
    try {
      fs.writeFileSync(tmp, src.replace(from, to))
      const res = await suite(await import(pathToFileURL(tmp).href))
      ok(`뮤테이션 "${name}" → ${group} 그룹이 실패한다(실제 ${res[group] ?? 0}건)`, (res[group] ?? 0) > 0)
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  // 리포트 질의 기록 뮤테이션 — lib 사본(상대 import 유지)과 page 텍스트 치환.
  const logSrc = fs.readFileSync(LOG_SRC, 'utf8')
  const TAKE = 'if (!take(b, opts.now ?? Date.now())) {'
  const LOG_MUTANTS = [
    ['anon', '익명 기록 끄기', TAKE, 'if (row.email === null || !take(b, opts.now ?? Date.now())) {'],
    ['anon', '익명에 식별자 넣기', 'requested_by: row.email,', "requested_by: row.email ?? 'anonymous-visitor',"],
    ['bucket', '플러드 버킷 끄기', TAKE, 'if (false) {'],
    ['fail', '기록 실패를 다시 던지기', "console.warn(`[query-log] report_view insert threw ${e instanceof Error ? e.name : typeof e}`)", 'throw e'],
    ['console', '실패 경고에 에러 문구(원문 포함 가능) 싣기', "insert failed code=${error.code ?? '-'}`", "insert failed code=${error.code ?? '-'} ${error.message}`"],
  ]
  const PAGE_MUTANTS = [
    ['wire', 'page: after() 없이 바로 기다리기', 'after(() => logReportView(sb, logged))', 'await logReportView(sb, logged)'],
    ['wire', 'page: 허용목록 밖 로그인도 이메일 저장', "email: verdict.kind === 'allowed' ? verdict.email : null", "email: 'email' in verdict ? verdict.email : null"],
  ]
  const logBase = await logSuite(realLog, pageSrc)
  ok('뮤테이션 전: 리포트 질의 기록 원본은 모든 그룹 통과', Object.values(logBase).every((n) => n === 0))
  for (const [i, [group, name, from, to]] of LOG_MUTANTS.entries()) {
    ok(`뮤테이션 대상 문자열이 원본에 있다: ${name}`, logSrc.includes(from))
    const tmp = path.join(ROOT, 'lib/cases', `.mutant-idea-angles-log-${i}.ts`)
    try {
      fs.writeFileSync(tmp, logSrc.replace(from, to))
      const res = await logSuite(await import(pathToFileURL(tmp).href), pageSrc)
      ok(`뮤테이션 "${name}" → ${group} 그룹이 실패한다(실제 ${res[group] ?? 0}건)`, (res[group] ?? 0) > 0)
    } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  for (const [group, name, from, to] of PAGE_MUTANTS) {
    ok(`뮤테이션 대상 문자열이 원본에 있다: ${name}`, pageSrc.includes(from))
    const res = await logSuite(realLog, pageSrc.replace(from, to))
    ok(`뮤테이션 "${name}" → ${group} 그룹이 실패한다(실제 ${res[group] ?? 0}건)`, (res[group] ?? 0) > 0)
  }
  const total = MUTANTS.length + LOG_MUTANTS.length + PAGE_MUTANTS.length
  say(fail ? `idea-angles-selftest --mutate: 실패 ${fail}건 / 통과 ${pass}건` : `idea-angles-selftest --mutate: 통과 ${pass}건 — 뮤테이션 ${total}개 전부 잡힘`)
  process.exitCode = fail ? 1 : 0
}
