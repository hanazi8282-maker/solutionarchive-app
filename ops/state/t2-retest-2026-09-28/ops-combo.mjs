// T2 운영 조합 재시험(2026-09-28) — 1차 = 실제 judgeRelevanceBatch(claude-cli Sonnet), 2차 = Gemini 무료 API(Actions 기본 체인).
// 표본은 r2-sample.json 100건(재시험 2회차와 같은 행). 결과: ops-first.json · ops-second.json(= import 가 읽는 형식) · 콘솔 일치율.
//   node --env-file=.env.local ops/state/t2-retest-2026-09-28/ops-combo.mjs [--only first|second]
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { judgeRelevanceBatch, chunkReviews, MAX_REVIEW_CHARS } from '../../../lib/analysis/relevance-judge.ts'
import { callLlmWithModel, parseJsonObject, geminiModelChain } from '../../../lib/analysis/llm.ts'
import { SECOND_OPINION_INSTRUCTIONS, validateOpinions, toExportRow, EXPORT_TEXT_MAX } from '../../../lib/analysis/second-opinion.ts'
import { RELEVANCE_CRITERIA_VERSION } from '../../../lib/analysis/relevance-criteria.ts'

const D = 'ops/state/t2-retest-2026-09-28'
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const sample = rd(path.join(D, 'r2-sample.json'))
const exp = new Map(rd('ops/state/relevance-export-2026-09-27.json').rows.map((r) => [r.input_id, r]))

// 프로젝트 목적·사업유형은 DB 에서(운영 1차가 쓰는 입력과 같게). 원문도 DB 원본(export 는 600자로 잘려 있다).
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const get = async (q) => { const r = await fetch(`${U}/rest/v1/${q}`, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${q}`); return r.json() }
const pids = [...new Set(sample.map((s) => s.project_id))]
const projects = new Map((await get(`analysis_projects?select=id,product_elevator_pitch,purpose,business_model,reader_problem&id=in.(${pids.join(',')})`)).map((p) => [p.id, p]))
const ids = sample.map((s) => s.input_id)
const raw = new Map()
for (let i = 0; i < ids.length; i += 50) for (const x of await get(`analysis_inputs?select=id,raw_text&id=in.(${ids.slice(i, i + 50).join(',')})`)) raw.set(x.id, x.raw_text ?? '')
if (raw.size !== ids.length) throw new Error(`원문 ${raw.size}/${ids.length}건만 읽힘 — 중단(§7.1)`)
if (projects.size !== pids.length) throw new Error(`프로젝트 ${projects.size}/${pids.length}건만 읽힘 — 중단`)

// ── 1차: 운영 경로 그대로(provider=claude-cli). few-shot 은 운영에서 사람 채점을 넣지만 SaaS 사람 채점은 0건이라 비운다.
if (only !== 'second') {
  process.env.LLM_PROVIDER = 'claude-cli'
  // --retry-failed: 이전 결과에서 호출 실패(reason 없는 unknown)만 다시 판정하고 나머지는 그대로 둔다.
  const retry = process.argv.includes('--retry-failed')
  const prev = retry ? new Map(rd(path.join(D, 'ops-first.json')).map((r) => [r.input_id, r])) : null
  const failedPrev = (id) => { const r = prev.get(id); return !r || (r.verdict === 'unknown' && !r.reason) }
  const out = retry ? [...prev.values()].filter((r) => !failedPrev(r.input_id)) : []
  for (const pid of pids) {
    const reviews = sample.filter((s) => s.project_id === pid && (!retry || failedPrev(s.input_id))).map((s) => ({ input_id: s.input_id, text: raw.get(s.input_id).slice(0, MAX_REVIEW_CHARS) }))
    for (const batch of chunkReviews(reviews)) {
      // 운영 callClaudeCli 는 자식 env 를 격리해(CI 의 CLAUDE_CODE_OAUTH_TOKEN 전제) 로컬 로그인을 못 본다.
      // 프롬프트(buildRelevancePrompt)·모델(sonnet)·인자는 운영과 같게, 인증만 로컬 로그인으로 호출한다.
      const localCall = async (system, user) => {
        const r = spawnSync(process.env.CLAUDE_CLI_PATH, ['-p', '--output-format', 'json', '--max-turns', '1', '--model', 'sonnet'],
          { input: `${system}\n\n---\n\n${user}`, encoding: 'utf8', timeout: 600_000, maxBuffer: 20_000_000 })
        const env = JSON.parse(r.stdout || '{}')
        if (r.status !== 0 || env.is_error) throw new Error(`claude 로컬 실패 exit=${r.status} ${String(env.result ?? r.stderr).slice(0, 200)}`)
        return { text: env.result, model: `claude-cli-local:${Object.keys(env.modelUsage ?? {}).join('+') || 'sonnet'}` }
      }
      const o = await judgeRelevanceBatch(projects.get(pid), batch, [], localCall)
      if (o.error) console.error(`1차 ${pid.slice(0, 8)} 실패: ${o.error}`)
      for (const v of o.verdicts) out.push({ input_id: v.input_id, verdict: v.verdict, reason: v.reason, model: o.model })
      console.log(`1차 ${projects.get(pid).product_elevator_pitch} ${batch.length}건 model=${o.model}`)
    }
  }
  fs.writeFileSync(path.join(D, 'ops-first.json'), JSON.stringify(out, null, 1))
}

// ── 2차: Gemini(무료 키, Actions 기본 체인 — 로컬 .env 의 GEMINI_MODEL 덮어쓰기는 지운다). 입력은 export 행 형식 그대로.
if (only !== 'first') {
  delete process.env.GEMINI_MODEL
  const CHAIN = geminiModelChain() // 덮어쓰기 없는 기본 체인 = Actions 가 쓰는 것
  const failures = []
  const rowsFor = (xs) => xs.map((s) => {
    const p = projects.get(s.project_id)
    return toExportRow({ input_id: s.input_id, project_id: s.project_id, raw_text: raw.get(s.input_id), pitch: p.product_elevator_pitch, business_model: p.business_model })
  })
  const rows = [], models = new Set()
  for (const batch of chunkReviews(sample, 20)) {
    const user = `아래 행들을 판정하라. JSON 객체 하나만 출력: {"criteria_version":"${RELEVANCE_CRITERIA_VERSION}","rows":[{input_id,verdict,impact,frequency,community_signal,wtp_mentioned,reason}]}\n\n${JSON.stringify(rowsFor(batch))}`
    // 503(수요 과다)은 체인이 다음 모델로 넘기지 않는다 — 여기서 모델을 하나씩 고정해 돌고, 한 바퀴 실패하면 쉬었다 다시.
    let res = null
    for (let round = 0; round < 4 && !res; round++) {
      for (const m of CHAIN) {
        process.env.GEMINI_MODEL = m
        try { res = await callLlmWithModel('gemini', SECOND_OPINION_INSTRUCTIONS, user, 't2-second-gemini'); break }
        catch (e) { failures.push(`${m}: ${e.status ?? ''} ${String(e.message).slice(0, 60)}`) }
      }
      if (!res) await new Promise((r) => setTimeout(r, 30_000 * (round + 1)))
    }
    if (!res) { console.error(`2차 배치 실패 — 모든 모델·4바퀴 소진. 실패 ${failures.length}건: ${failures.slice(-4).join(' | ')}`); continue }
    models.add(res.model)
    const obj = parseJsonObject(res.text)
    rows.push(...(Array.isArray(obj.rows) ? obj.rows : []))
    console.log(`2차 ${batch.length}건 model=${res.model} 응답행 ${Array.isArray(obj.rows) ? obj.rows.length : 0}`)
  }
  const file = { generated_at: new Date().toISOString(), criteria_version: RELEVANCE_CRITERIA_VERSION, model: [...models].join(','), scope_note: 'T2 운영 조합 재시험 — r2-sample 100건, 2차=Gemini 무료 API', transient_failures: failures.length, count: rows.length, rows }
  const { ok, rejected } = validateOpinions(file)
  console.log(`2차 검증: 유효 ${ok.length} · 거부 ${rejected.length}${rejected.length ? ' — ' + rejected.slice(0, 5).map((r) => `#${r.index} ${r.reason}`).join(' / ') : ''}`)
  fs.writeFileSync(path.join(D, 'ops-second.json'), JSON.stringify(file, null, 1))
}

// ── 비교(재시험과 같은 셈법: unknown 이 한쪽이라도 끼면 분모에서 뺀다 + 3상태 그대로)
const f = new Map(rd(path.join(D, 'ops-first.json')).map((r) => [r.input_id, r.verdict]))
const s = new Map(rd(path.join(D, 'ops-second.json')).rows.map((r) => [r.input_id, r.verdict]))
let exact = 0, cmp = 0, agree = 0, rr = 0, ii = 0, split = 0, unk = 0, missing = 0
for (const x of sample) {
  const a = f.get(x.input_id), b = s.get(x.input_id)
  if (!a || !b) { missing++; continue }
  if (a === b) exact++
  if (a === 'unknown' || b === 'unknown') { unk++; continue }
  cmp++; if (a === b) agree++
  if (a === 'relevant' && b === 'relevant') rr++; else if (a === 'irrelevant' && b === 'irrelevant') ii++; else split++
}
console.log(JSON.stringify({ n: sample.length, missing, exact, exactPct: +(100 * exact / sample.length).toFixed(1), cmp, agree, pct: cmp ? +(100 * agree / cmp).toFixed(1) : null, rr, ii, split, unk }))
