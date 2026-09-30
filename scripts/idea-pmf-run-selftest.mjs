#!/usr/bin/env node
// PMF 판정 사분면 자가진단(P3) 잡 본체 셀프테스트 — 네트워크·DB·실제 claude 0. 가짜 CLI · 가짜 Supabase · 픽스처.
//   node scripts/idea-pmf-run-selftest.mjs            (정상 — 전부 통과해야 한다)
//   node scripts/idea-pmf-run-selftest.mjs --mutate   (뮤테이션 — 코드를 일부러 깨면 해당 그룹이 **실패**해야 한다)
//
// 고정하는 것(정본 reports/2026-10-01/design-direction-pmf-judgment.md P3-5 ①~⑩):
//   ① 캐시는 본인 행만 ② 캐시 히트 → insert 0·LLM 0 ③ override 면 병목 호출 0 ④ no_match 종결(질문 0·선례축 0·수요축 null)
//   ⑤ matched → 질문 행 insert·awaiting_answers ⑥ PUT 409·400·404 ⑦ 수요축 = GENERATED 를 다시 읽은 최대/20, 사분면 = quadrantOf
//   ⑧ 답변 행 payload 에 is_self_reported false 0회 ⑨ 429 → limited·뒤 호출 0 ⑩ 남의 행 GET 404
//   + 확인 불가 ≠ 없음(코퍼스·근거 조회 실패는 failed) · 상한(10/일·동시·전역 합) · 청소 · 질의 로그(pmf_api·pmf_run_id) · 콘솔 원문 0
// 뮤테이션(--mutate): m1 캐시에서 requested_by 빼기 → cache · m2 사분면을 'PARK' 상수로 → score ·
//                    m3 parsePmfScores 인용 검증 우회(idea-pmf.ts) → quote. 각각 해당 그룹이 실패해야 통과.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cliFailure, CLAUDE_CLI_DEFAULT_MODEL } from '../lib/analysis/llm.ts'
import { IDEA_STALE_MS, queryHash } from '../lib/cases/idea-angles.ts'
import { inputHash, parsePmfInput } from '../lib/cases/idea-pmf.ts'
import { demandAxis, matchMoves, precedentAxis, quadrantOf } from '../lib/cases/match.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUN_SRC = path.join(ROOT, 'lib/cases/idea-pmf-run.ts')
const PMF_SRC = path.join(ROOT, 'lib/cases/idea-pmf.ts')
const MUTATE = process.argv.includes('--mutate')
const lines = []
for (const k of ['log', 'warn', 'error']) console[k] = (...a) => { lines.push(a.map(String).join(' ')); if (process.env.VERBOSE) process.stdout.write(`${a.join(' ')}\n`) }

let pass = 0
let fail = 0
const say = (s) => process.stdout.write(`${s}\n`)
const ok = (name, cond) => { if (cond) pass++; else { fail++; say(`❌ ${name}`) } }

// ── 가짜 Supabase(쓰는 빌더 메서드만) ────────────────────────────
function fakeDb(clock) {
  const tables = { idea_pmf_runs: [], idea_pmf_answers: [], idea_angle_runs: [], idea_query_log: [], case_evidence: [] }
  const writes = [] // { t, op, payload }
  const failSelect = new Set()
  let seq = 0
  const defaults = {
    idea_pmf_runs: {
      bottleneck: null, bottleneck_source: null, bottleneck_confidence: null, bottleneck_reason: null, match_status: null, match_reason: null,
      matched_case_move_ids: [], salient: [], questions: [], precedent_axis: null, demand_axis: null, is_self_reported: true, quadrant: null,
      llm_calls: 0, models: [], cost_usd: null, cache_read_tokens: null, error: null, started_at: null, answered_at: null, finished_at: null,
    },
    idea_pmf_answers: { answer_text: null, importance: null, satisfaction: null, evidence_quote: null, notes: null, is_self_reported: true },
    idea_query_log: { run_id: null, pmf_run_id: null },
  }
  // opportunity_score GENERATED ALWAYS AS (importance + greatest(importance - satisfaction, 0)) — Postgres greatest 는 NULL 을 무시한다.
  const generated = (t, r) => {
    if (t !== 'idea_pmf_answers') return
    const I = r.importance, S = r.satisfaction
    r.opportunity_score = I == null ? null : S == null ? I : I + Math.max(I - S, 0)
  }
  const from = (t) => {
    const st = { op: 'select', filters: [], opts: {}, payload: null, order: null, limit: null, one: null, returning: false }
    const exec = () => {
      const rows = tables[t]
      if (!rows) return { data: null, error: { code: '42P01', message: `relation ${t} does not exist` }, count: null }
      if (st.op === 'select' && failSelect.has(t)) return { data: null, error: { code: 'X', message: 'boom' }, count: null }
      if (st.op === 'insert') {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload]
        const made = list.map((p) => {
          writes.push({ t, op: 'insert', payload: structuredClone(p) })
          const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: new Date(clock()).toISOString(), ...(defaults[t] ?? {}), ...structuredClone(p) }
          generated(t, row)
          rows.push(row)
          return row
        })
        return { data: st.one ? { ...made[0] } : made.map((r) => ({ ...r })), error: null }
      }
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      if (st.op === 'update') {
        writes.push({ t, op: 'update', payload: structuredClone(st.payload) })
        for (const r of hit) { Object.assign(r, structuredClone(st.payload)); generated(t, r) }
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null }
      }
      if (st.opts.head) return { data: null, count: hit.length, error: null }
      let out = hit.map((r) => ({ ...r }))
      if (st.order) out.sort((a, b) => (a[st.order[0]] < b[st.order[0]] ? -1 : 1) * (st.order[1] ? 1 : -1))
      if (st.limit !== null) out = out.slice(0, st.limit)
      if (st.one) return { data: out[0] ?? null, error: null }
      return { data: out, error: null }
    }
    const b = {
      select(cols, opts = {}) { if (st.op === 'select') st.opts = opts; else st.returning = true; return b },
      insert(p) { st.op = 'insert'; st.payload = p; return b },
      update(p) { st.op = 'update'; st.payload = p; return b },
      eq(k, v) { st.filters.push((r) => r[k] === v); return b },
      match(o) { for (const [k, v] of Object.entries(o)) st.filters.push((r) => r[k] === v); return b },
      in(k, vs) { st.filters.push((r) => vs.includes(r[k])); return b },
      gte(k, v) { st.filters.push((r) => r[k] >= v); return b },
      lt(k, v) { st.filters.push((r) => r[k] != null && r[k] < v); return b },
      order(k, o) { st.order = [k, o?.ascending !== false]; return b },
      limit(n) { st.limit = n; return b },
      maybeSingle() { st.one = 'maybe'; return b },
      single() { st.one = 'single'; return b },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej) },
    }
    return b
  }
  return { sb: { from }, tables, writes, failSelect }
}

// ── 픽스처 ──────────────────────────────────────────────────────
const M1 = '11111111-1111-4111-8111-111111111111'
const M2 = '22222222-2222-4222-8222-222222222222'
const M3 = '33333333-3333-4333-8333-333333333333'
const M4 = '44444444-4444-4444-8444-444444444444'
const study = (id, slug, bottleneck, bm = 'SAAS') => ({ id, slug, brand_name: slug.toUpperCase(), bottleneck, business_model: bm, review_status: 'approved' })
const move = (id, sid, lever, g = 'A') => ({
  id, case_study_id: sid, lever, claim: `${lever} 로 첫 거래 신뢰를 얻었다`, evidence_grade: g, insight_grade: g,
  outcome_direction: 'positive', review_status: 'approved', transfer_note: '보안 문서를 먼저 보여 준다', preconditions: 'B2B',
})
// s4 는 소비재 TRUST — kind=saas 면 숨겨지고(match_reason 에 건수), 앵커가 되면 안 된다.
const STUDIES = [study('s1', 'alpha', 'TRUST'), study('s2', 'beta', 'TRUST'), study('s3', 'gamma', 'CONVERSION'), study('s4', 'delta', 'TRUST', 'D2C')]
const MOVES = [move(M1, 's1', 'OFFER'), move(M2, 's2', 'CONTENT', 'B'), move(M3, 's3', 'PRICING'), move(M4, 's4', 'OFFER')]
const FAILED = [{ case_key: 'f1', product_category: '인보이스', claimed_angle: '인보이스 자동화로 시간 절약', outcome: '전환 0', source_tier: 'T3', is_estimate: false }]
const CORPORA = { studies: STUDIES, moves: MOVES, failedAngles: FAILED }
const EVIDENCE = [{ case_study_id: 's1', case_move_id: M1, snippet: '보안 백서를 먼저 보낸 뒤 첫 계약이 늘었다', supports_claim: true }]
const Q = '프리랜서용 인보이스 자동 발송 SaaS'
const INPUT = { core_feature: '인보이스 자동 발송', customer: '1인 프리랜서 디자이너', price: '월 9,900원', alternative: '엑셀과 메일' }
const EMAIL = 'a@x.io'
const OTHER = 'b@x.io'
const ENV = { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-SELFTEST-SECRET-VALUE-0123456789' }
const A1 = '첫 거래 전에 고객사 보안 담당자가 SOC2 문서를 요구한다. 우리는 가입 화면에서 바로 내려받게 한다.'
const A2 = '엑셀 템플릿은 무료라 가격 저항이 있다.'
const T0 = Date.parse('2026-10-01T03:00:00Z')
const at = (ms) => new Date(ms).toISOString()

/** 가짜 CLI(= callLlmWithModel 자리). failAt: { label, nth, err } 이면 그 호출에서 던진다. */
function fakeCli({ failAt = null, scores = null } = {}) {
  const calls = []
  const seen = {}
  const raw = async (provider, system, user, label) => {
    calls.push({ provider, label, user })
    seen[label] = (seen[label] ?? 0) + 1
    if (failAt && failAt.label === label && failAt.nth === seen[label]) throw failAt.err()
    let out
    if (label === 'pmf:bottleneck') out = { bottleneck: 'TRUST', confidence: 'high', reason: '첫 거래 신뢰' }
    else if (label === 'pmf:questions') out = {
      salient: [{ factor: '보안 문서', why: '첫 계약 전 요구', anchor_move_id: M1 }, { factor: '가격 저항', why: '실패 원장 경고', anchor_move_id: null }],
      questions: [
        { id: 'x9', factor: '보안 문서', question: '첫 거래 전에 고객이 요구하는 신뢰 자료를 어떻게 준비하나', anchor_move_id: M1 },
        { id: 'x8', factor: '가격 저항', question: '무료 대안 대비 가격 저항을 어떻게 넘나', anchor_move_id: M4 }, // M4 는 숨긴 소비재 → null, factor 로 묶임
      ],
    }
    else if (label === 'pmf:score') out = scores ?? { aspects: [
      { question_id: 'q1', importance: 8, satisfaction: 3, evidence_quote: '첫 거래 전에 고객사 보안 담당자가 SOC2 문서를 요구한다.', notes: 'n1' },
      { question_id: 'q2', importance: 6, satisfaction: 4, evidence_quote: '가격은 전혀 문제가 되지 않는다.', notes: 'n2' }, // 지어낸 인용
    ] }
    else out = {}
    return { text: JSON.stringify(out), model: CLAUDE_CLI_DEFAULT_MODEL, costUsd: 0.03, cacheReadTokens: 10 }
  }
  return { raw, calls }
}
const limit429 = () => cliFailure({ exitCode: 1, timedOut: false, stdout: '', stderr: '' },
  { is_error: true, subtype: 'error_during_execution', api_error_status: 429, result: '5-hour limit reached ∙ resets 3pm' })

function world(mod, opts = {}) {
  let t = T0
  const clock = () => t
  const db = fakeDb(clock)
  db.tables.case_evidence.push(...EVIDENCE)
  const cli = fakeCli(opts)
  const deps = { sb: db.sb, loadCorpus: async () => opts.corpora ?? CORPORA, now: clock, env: opts.env ?? ENV, raw: cli.raw }
  const post = async (body = {}, email = EMAIL) => {
    const r = await mod.startPmf(deps, { q: Q, kind: 'saas', input: INPUT, ...body, email })
    if (r.http === 200 && r.schedule) await mod.runQuestions(deps, r.schedule) // = after()
    return r
  }
  const put = async (runId, answers, email = EMAIL) => {
    const r = await mod.submitAnswers(deps, { runId, answers, email })
    if (r.http === 200) await mod.runScoring(deps, r.schedule) // = after()
    return r
  }
  return { db, cli, deps, post, put, tick: (ms) => { t += ms } }
}

/** 그룹별 검사. 반환 { group: 실패 수 }. 뮤테이션 모드에서는 그룹 단위로 "실패해야 한다"를 본다. */
async function suite(run) {
  const groups = {}
  const g = (group, name, cond) => { groups[group] ??= 0; if (!cond) groups[group]++; if (!MUTATE) ok(`${group}: ${name}`, cond) }
  const guard = async (group, fn) => { try { await fn() } catch (e) { g(group, `예외: ${e?.stack ?? e}`, false) } }
  const qh = await queryHash(Q, 'saas')
  const parsed = parsePmfInput(INPUT)
  const ih = await inputHash(parsed.input)

  // ⑤ matched 전체 흐름 + ⑦(흐름 안) + 로그 + ⑩
  await guard('flow', async () => {
    const w = world(run)
    const r = await w.post()
    const row = w.db.tables.idea_pmf_runs[0]
    g('flow', 'POST 는 queued 로 즉시 반환(LLM 0)', r.http === 200 && r.body.status === 'queued' && r.body.llm_calls === 0)
    g('flow', 'POST 응답에 원문·입력·요청자 없음', !('query_text' in r.body) && !('input' in r.body) && !('requested_by' in r.body))
    g('flow', '잡 1 뒤 awaiting_answers · 병목 1 + 질문 1 = 2호출(claude-cli)', row?.status === 'awaiting_answers' && row.llm_calls === 2
      && w.cli.calls.map((c) => c.label).join() === 'pmf:bottleneck,pmf:questions' && w.cli.calls.every((c) => c.provider === 'claude-cli'))
    g('flow', '병목 TRUST · 출처 llm · 확신 high', row?.bottleneck === 'TRUST' && row.bottleneck_source === 'llm' && row.bottleneck_confidence === 'high')
    const scoped = STUDIES.filter((s) => s.business_model === 'SAAS')
    const expected = precedentAxis(matchMoves('TRUST', scoped, MOVES.filter((m) => scoped.some((s) => s.id === m.case_study_id)), null, {}))
    g('flow', '선례축 = precedentAxis(matchMoves(병목)) 그대로', row?.match_status === 'matched' && row.precedent_axis === expected.value)
    g('flow', '앵커는 SaaS TRUST 무브만(소비재·다른 병목 제외)', row?.matched_case_move_ids.join() === [M1, M2].join())
    g('flow', 'match_reason 에 숨긴 소비재 건수', /소비재 1건 숨김/.test(row?.match_reason ?? ''))
    g('flow', '질문 프롬프트: 구조화 필드는 데이터 절에 · 숨긴 소비재 브랜드 없음 · 근거 문장 포함',
      (() => { const u = w.cli.calls[1]?.user ?? ''; return u.includes('1인 프리랜서 디자이너') && !u.includes('DELTA') && u.includes('보안 백서') })())
    const qs = row?.questions ?? []
    g('flow', '질문 id 는 서버가 q1..q2 로 다시 매김 · 선례 밖 anchor 는 null', qs.map((q) => q.id).join() === 'q1,q2' && qs[0].anchor_move_id === M1 && qs[1].anchor_move_id === null)
    const ans = w.db.tables.idea_pmf_answers.filter((a) => a.run_id === row?.id)
    g('flow', '질문 행 2개 insert(답 NULL)', ans.length === 2 && ans.every((a) => a.answer_text === null))
    const logs = w.db.tables.idea_query_log
    g('log', 'POST 1회 = 로그 1행(pmf_api · pmf_run_id · run_id NULL · outcome new)', logs.length === 1 && logs[0].source === 'pmf_api'
      && logs[0].pmf_run_id === row?.id && logs[0].run_id === null && logs[0].outcome === 'new' && logs[0].query_hash === qh)

    // PUT → 잡 2
    const p = await w.put(row.id, [{ id: 'q1', text: A1 }, { id: 'q2', text: A2 }])
    g('flow', 'PUT 200 → scoring 응답', p.http === 200 && p.body.status === 'scoring')
    g('log', 'PUT 은 질의 로그를 남기지 않는다', w.db.tables.idea_query_log.length === 1)
    const done = w.db.tables.idea_pmf_runs[0]
    const opp = w.db.tables.idea_pmf_answers.map((a) => a.opportunity_score)
    const d = demandAxis(opp, 10).value
    g('score', '흐름 끝 done · 수요축 = GENERATED 최대/20 · 사분면 = quadrantOf', done.status === 'done' && d === 13 / 20 && done.demand_axis === d
      && done.quadrant === quadrantOf(d, expected.value).quadrant)
    g('flow', '호출 누적 3 · models 3개 모두 claude-sonnet-5-5 · 비용 합', done.llm_calls === 3 && done.models.length === 3
      && done.models.every((m) => m === 'claude-sonnet-5-5') && Math.abs(done.cost_usd - 0.09) < 1e-9)
    const [a1, a2] = w.db.tables.idea_pmf_answers
    g('quote', '인용: 답변 원문에 있는 문장만 남는다(지어낸 인용 null)', a1.evidence_quote === '첫 거래 전에 고객사 보안 담당자가 SOC2 문서를 요구한다.' && a2.evidence_quote === null)
    g('self', '⑧ 답변 행 insert·update payload 에 is_self_reported false 0회 · 저장 행 전부 true',
      w.db.writes.filter((x) => x.t === 'idea_pmf_answers').every((x) => !('is_self_reported' in x.payload) || x.payload.is_self_reported === true)
      && w.db.tables.idea_pmf_answers.every((a) => a.is_self_reported === true))
    g('self', 'analysis_*·pmf_assessments 에 쓰지 않는다', w.db.writes.every((x) => x.t.startsWith('idea_')))

    // ⑥ 다시 PUT → 409
    g('submit', 'done 행에 PUT → 409', (await w.put(row.id, [{ id: 'q1', text: 'x' }])).http === 409)
    // ⑩ GET
    const mine = await run.readPmfRun(w.deps, row.id, EMAIL)
    g('read', 'GET 본인 → 200 · 답변 2행(점수 포함) · 원문·입력·요청자 없음', mine.http === 200 && mine.body.answers.length === 2
      && mine.body.answers[0].opportunity_score === 13 && !('query_text' in mine.body) && !('input' in mine.body) && !('requested_by' in mine.body))
    g('read', '⑩ GET 남의 행 → 404', (await run.readPmfRun(w.deps, row.id, OTHER)).http === 404)
    g('submit', 'PUT 남의 행 → 404', (await w.put(row.id, [{ id: 'q1', text: 'x' }], OTHER)).http === 404)

    // ② 캐시 히트
    const before = w.cli.calls.length
    const c = await w.post({ q: `  ${Q.toUpperCase()} `, input: { ...INPUT, customer: ' 1인  프리랜서 디자이너 ' } })
    g('cache', '② 같은 (q, input) → 같은 run_id · insert 0 · LLM 0', c.body.run_id === row.id && c.outcome === 'cache_hit'
      && w.db.tables.idea_pmf_runs.length === 1 && w.cli.calls.length === before)
    g('log', '캐시 히트도 로그 1행(cache_hit, 같은 pmf_run_id)', w.db.tables.idea_query_log.at(-1)?.outcome === 'cache_hit' && w.db.tables.idea_query_log.at(-1)?.pmf_run_id === row.id)
    const f = await w.post({ fresh: true })
    g('cache', 'fresh:true → 새 실행', f.body.run_id !== row.id && w.db.tables.idea_pmf_runs.length === 2)
  })

  // ① 캐시는 본인 행만
  await guard('cache', async () => {
    const w = world(run)
    w.db.tables.idea_pmf_runs.push({ id: 'theirs', query_hash: qh, input_hash: ih, kind: 'saas', requested_by: OTHER, status: 'done', created_at: at(T0 - 3_600_000), llm_calls: 3, models: [], questions: [], salient: [] })
    const r = await w.post()
    g('cache', '① 같은 입력의 남의 행이 있어도 내 행이 없으면 새로 insert', r.body.run_id !== 'theirs' && r.outcome === 'new' && w.db.tables.idea_pmf_runs.length === 2)
  })

  // ③ override → 병목 호출 0 / ④ no_match 종결
  await guard('flow', async () => {
    const w = world(run)
    await w.post({ input: { ...INPUT, bottleneck_override: 'TRUST' } })
    const row = w.db.tables.idea_pmf_runs[0]
    g('flow', '③ override → 병목 호출 0 · 질문 1회 · 출처 user', row.status === 'awaiting_answers' && row.llm_calls === 1
      && w.cli.calls.every((c) => c.label !== 'pmf:bottleneck') && row.bottleneck_source === 'user')
    const w2 = world(run)
    await w2.post({ input: { ...INPUT, bottleneck_override: 'SUPPLY' } })
    const n = w2.db.tables.idea_pmf_runs[0]
    g('flow', '④ 선례 0건 → no_match 종결 · LLM 0 · 선례축 0 · 수요축·사분면 null · 질문 행 0',
      n.status === 'no_match' && n.match_status === 'no_match' && n.precedent_axis === 0 && n.demand_axis === null && n.quadrant === null
      && w2.cli.calls.length === 0 && w2.db.tables.idea_pmf_answers.length === 0 && /SUPPLY 선례가 0건/.test(n.match_reason) && n.finished_at)
  })

  // 확인 불가 ≠ 없음
  await guard('unknown', async () => {
    const w = world(run, { corpora: { studies: null, moves: MOVES, failedAngles: FAILED } })
    await w.post()
    const r = w.db.tables.idea_pmf_runs[0]
    g('unknown', '코퍼스 조회 실패(null) → failed(선례 조회 실패) · no_match 아님 · LLM 0', r.status === 'failed' && r.error === '선례 조회 실패' && w.cli.calls.length === 0)
    const w2 = world(run, { corpora: { studies: STUDIES, moves: MOVES, failedAngles: null } })
    await w2.post()
    g('unknown', '실패 원장 조회 실패(null) → failed · LLM 0', w2.db.tables.idea_pmf_runs[0].status === 'failed' && w2.cli.calls.length === 0)
    const w3 = world(run)
    w3.db.failSelect.add('case_evidence')
    await w3.post()
    const r3 = w3.db.tables.idea_pmf_runs[0]
    g('unknown', '근거 조회 실패 → failed(근거 조회 실패) · 질문 호출 안 함', r3.status === 'failed' && r3.error === '근거 조회 실패' && w3.cli.calls.length === 1)
  })

  // ⑥ PUT 검증
  await guard('submit', async () => {
    const w = world(run)
    await w.post()
    const id = w.db.tables.idea_pmf_runs[0].id
    g('submit', '전부 null → 400', (await w.put(id, [{ id: 'q1', text: null }, { id: 'q2', text: '  ' }])).http === 400)
    g('submit', '501자 → 400', (await w.put(id, [{ id: 'q1', text: 'x'.repeat(501) }])).http === 400)
    g('submit', '없는 질문 id → 400', (await w.put(id, [{ id: 'q9', text: 'x' }])).http === 400)
    g('submit', '400 뒤에도 awaiting_answers 그대로', w.db.tables.idea_pmf_runs[0].status === 'awaiting_answers')
    const r = await w.put(id, [{ id: 'q1', text: A1 }])
    const skipped = w.db.tables.idea_pmf_answers.find((a) => a.question_id === 'q2')
    g('submit', '1개 건너뜀 → done · 건너뛴 행 점수·기회 null', r.http === 200 && w.db.tables.idea_pmf_runs[0].status === 'done'
      && skipped.answer_text === null && skipped.importance === null && skipped.opportunity_score === null)
  })

  // ⑦ 잡 2 단독: precedent 0.8 · opp [13, 8]
  await guard('score', async () => {
    const w = world(run)
    const id = 'run-score'
    w.db.tables.idea_pmf_runs.push({ id, requested_by: EMAIL, kind: 'saas', status: 'scoring', precedent_axis: 0.8, demand_axis: null, quadrant: null,
      questions: [{ id: 'q1', factor: 'f1', question: 'Q1', anchor_move_id: M1 }, { id: 'q2', factor: 'f2', question: 'Q2', anchor_move_id: null }],
      llm_calls: 2, models: ['claude-sonnet-5-5', 'claude-sonnet-5-5'], cost_usd: '0.06', cache_read_tokens: 20, created_at: at(T0 - 86_400_000), started_at: at(T0) })
    for (const [qid, text] of [['q1', A1], ['q2', A2]]) w.db.tables.idea_pmf_answers.push({ id: qid, run_id: id, question_id: qid, factor: qid, question: qid, anchor_move_id: null, answer_text: text, importance: null, satisfaction: null, opportunity_score: null, evidence_quote: null, notes: null, is_self_reported: true })
    await run.runScoring(w.deps, { runId: id })
    const r = w.db.tables.idea_pmf_runs[0]
    const expectQ = quadrantOf(13 / 20, 0.8).quadrant
    g('score', '⑦ opp [13, 8] → 수요축 0.65 · 사분면 = quadrantOf(0.65, 0.8)', r.status === 'done' && r.demand_axis === 0.65 && r.quadrant === expectQ
      && w.db.tables.idea_pmf_answers.map((a) => a.opportunity_score).join() === '13,8')
    g('score', '계측은 잡 1 에 이어 더한다(2+1 호출 · 문자열 비용도 숫자로)', r.llm_calls === 3 && r.models.length === 3 && Math.abs(r.cost_usd - 0.09) < 1e-9 && r.cache_read_tokens === 30)
    // 척도 밖·전부 null → failed(0 으로 접지 않는다)
    const w2 = world(run, { scores: { aspects: [{ question_id: 'q1', importance: 'high', satisfaction: null }] } })
    w2.db.tables.idea_pmf_runs.push({ ...structuredClone(w.db.tables.idea_pmf_runs[0]), status: 'scoring', demand_axis: null, quadrant: null, llm_calls: 2 })
    w2.db.tables.idea_pmf_answers.push({ id: 'a', run_id: id, question_id: 'q1', answer_text: A1, importance: null, satisfaction: null, opportunity_score: null, is_self_reported: true })
    await run.runScoring(w2.deps, { runId: id })
    const r2 = w2.db.tables.idea_pmf_runs[0]
    g('score', '유효 점수 0건 → failed(점수를 못 냈다) · 사분면 null', r2.status === 'failed' && /점수를 못 냈다/.test(r2.error ?? '') && r2.quadrant === null)
  })

  // ⑨ 429 · 토큰 없음
  await guard('llm', async () => {
    const w = world(run, { failAt: { label: 'pmf:questions', nth: 1, err: limit429 } })
    await w.post()
    const r = w.db.tables.idea_pmf_runs[0]
    g('llm', '⑨ 질문 호출 429 → limited(리셋 문구) · 뒤 호출 0 · 질문 행 0', r.status === 'limited' && /resets 3pm/.test(r.error ?? '')
      && w.cli.calls.length === 2 && w.db.tables.idea_pmf_answers.length === 0)
    const w2 = world(run, { failAt: { label: 'pmf:score', nth: 1, err: limit429 } })
    await w2.post()
    await w2.put(w2.db.tables.idea_pmf_runs[0].id, [{ id: 'q1', text: A1 }])
    g('llm', '점수 호출 429 → limited · 사분면 없음', w2.db.tables.idea_pmf_runs[0].status === 'limited' && w2.db.tables.idea_pmf_runs[0].quadrant === null)
    const w3 = world(run, { env: {} })
    await w3.post()
    g('llm', '토큰 없음 → failed(미설정) · LLM 0', w3.db.tables.idea_pmf_runs[0].error === 'CLAUDE_CODE_OAUTH_TOKEN 미설정' && w3.cli.calls.length === 0)
  })

  // 상한
  await guard('limit', async () => {
    const w = world(run)
    for (let i = 0; i < 10; i++) w.db.tables.idea_pmf_runs.push({ id: `d${i}`, query_hash: `h${i}`, input_hash: 'x', kind: 'saas', status: 'done', requested_by: EMAIL, created_at: at(T0 - 3_600_000) })
    const r = await w.post()
    g('limit', '11번째(24h) → limited · LLM 0 · 로그 limited', r.body.status === 'limited' && /10건/.test(r.body.error ?? '') && w.cli.calls.length === 0
      && w.db.tables.idea_query_log.at(-1)?.outcome === 'limited')
    const w2 = world(run)
    w2.db.tables.idea_pmf_runs.push({ id: 'aw', query_hash: 'h', input_hash: 'x', kind: 'saas', status: 'awaiting_answers', requested_by: EMAIL, created_at: at(T0 - 3 * 86_400_000) })
    g('limit', 'awaiting_answers 는 동시 상한에 안 든다', (await w2.post()).body.status === 'queued')
    const w3 = world(run)
    w3.db.tables.idea_angle_runs.push({ id: 'ga', status: 'running', requested_by: 'p@x.io' })
    w3.db.tables.idea_pmf_runs.push({ id: 'gp', query_hash: 'h', input_hash: 'x', status: 'running', requested_by: 'q@x.io', created_at: at(T0 - 60_000), started_at: at(T0 - 60_000) })
    g('limit', '전역 동시 = PMF 1 + 앵글 1 → limited', (await w3.post()).body.status === 'limited' && w3.cli.calls.length === 0)
  })

  // 청소
  await guard('stale', async () => {
    const w = world(run)
    w.db.tables.idea_pmf_runs.push(
      { id: 'sc', requested_by: EMAIL, status: 'scoring', created_at: at(T0 - 3 * 86_400_000), started_at: at(T0 - 7 * 60_000), llm_calls: 2 },
      { id: 'aw', requested_by: EMAIL, status: 'awaiting_answers', created_at: at(T0 - 3 * 86_400_000), started_at: at(T0 - 3 * 86_400_000), llm_calls: 2 },
      { id: 'fresh-sc', requested_by: OTHER, status: 'scoring', created_at: at(T0 - 3 * 86_400_000), started_at: at(T0 - 60_000), llm_calls: 2 })
    const g1 = await run.readPmfRun(w.deps, 'sc', EMAIL)
    g('stale', 'GET: scoring 7분 → failed(시간 초과)', g1.body.status === 'failed' && g1.body.error === '시간 초과')
    g('stale', 'GET: awaiting_answers 는 며칠 지나도 그대로', (await run.readPmfRun(w.deps, 'aw', EMAIL)).body.status === 'awaiting_answers')
    await w.post()
    g('stale', 'POST 청소: 오래 전에 만들었어도 방금 답한 scoring 은 건드리지 않는다', w.db.tables.idea_pmf_runs.find((r) => r.id === 'fresh-sc').status === 'scoring')
    w.tick(IDEA_STALE_MS + 1_000)
    await w.post({ fresh: true })
    g('stale', 'POST 청소: 6분 넘은 scoring → failed', w.db.tables.idea_pmf_runs.find((r) => r.id === 'fresh-sc').status === 'failed')
  })
  return groups
}

const real = await import(pathToFileURL(RUN_SRC).href)
if (!MUTATE) {
  lines.length = 0
  await suite(real)
  ok('console: 원문·이메일·답변 문자열 0회', lines.length > 0 && lines.every((l) => ![Q, EMAIL, OTHER, A1, A2, INPUT.customer].some((s) => l.includes(s))))
  say(fail ? `idea-pmf-run-selftest: 실패 ${fail}건 / 통과 ${pass}건` : `idea-pmf-run-selftest: 통과 ${pass}건 — 흐름 · 캐시(본인만) · override · no_match · 확인 불가 · PUT · 사분면 · 자가진단 플래그 · 429 · 상한 · 청소 · 로그 · 콘솔`)
  process.exitCode = fail ? 1 : 0
} else {
  // 뮤테이션: 사본을 같은 폴더에 잠깐 만들어(상대 import 유지) 불러오고 지운다.
  const src = fs.readFileSync(RUN_SRC, 'utf8')
  const pmf = fs.readFileSync(PMF_SRC, 'utf8')
  const QUOTE = 'const quoted = Boolean(answer && quote && normalizeWhitespace(answer).includes(quote))'
  const MUTANTS = [
    ['cache', 'm1 캐시에서 requested_by 빼기', src, '.match(pmfCacheKey(input.email, hash, ih))', '.match({ query_hash: hash, input_hash: ih })', null],
    ['score', "m2 사분면을 'PARK' 상수로", src, 'quadrant: pq.quadrant', "quadrant: 'PARK'", null],
    ['quote', 'm3 parsePmfScores 인용 검증 우회', pmf, QUOTE, 'const quoted = Boolean(quote)', 'pmf'],
  ]
  const baseline = await suite(real)
  ok('뮤테이션 전: 원본은 모든 그룹 통과', Object.values(baseline).every((n) => n === 0))
  for (const [i, [group, name, text, from, to, which]] of MUTANTS.entries()) {
    ok(`뮤테이션 대상 문자열이 원본에 있다: ${name}`, text.includes(from))
    const tmpRun = path.join(ROOT, 'lib/cases', `.mutant-idea-pmf-run-${i}.ts`)
    const tmpPmf = path.join(ROOT, 'lib/cases', `.mutant-idea-pmf-${i}.ts`)
    try {
      if (which === 'pmf') {
        fs.writeFileSync(tmpPmf, pmf.replace(from, to))
        fs.writeFileSync(tmpRun, src.replace("from './idea-pmf.ts'", `from './.mutant-idea-pmf-${i}.ts'`))
      } else fs.writeFileSync(tmpRun, src.replace(from, to))
      const res = await suite(await import(pathToFileURL(tmpRun).href))
      ok(`뮤테이션 "${name}" → ${group} 그룹이 실패한다(실제 ${res[group] ?? 0}건)`, (res[group] ?? 0) > 0)
    } finally {
      fs.rmSync(tmpRun, { force: true })
      fs.rmSync(tmpPmf, { force: true })
    }
  }
  say(fail ? `idea-pmf-run-selftest --mutate: 실패 ${fail}건 / 통과 ${pass}건` : `idea-pmf-run-selftest --mutate: 통과 ${pass}건 — 뮤테이션 ${MUTANTS.length}개 전부 잡힘`)
  process.exitCode = fail ? 1 : 0
}
