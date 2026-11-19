#!/usr/bin/env node
// rr-v2 자동 승인 평가 하네스 — 사람 채점 행(+ --sample 행)을 현재 기준 1차·2차로 다시 판정하고, rr-v2 가 승인할 행(A)을
// 사람 기준(gold = auto-approval.ts scoreApproval, 운영 감사와 같은 잣대)으로 채점한다. 플래그는 켜지 않는다(문턱은 문서화만).
//
//   node --env-file=.env.local scripts/t2-approval-eval.mjs [--sample ops/state/t2-retest-2026-09-28/r2-sample.json]
//        [--saas-only] [--local-claude] [--baseline <옛 1차 json>] [--out <eval.json>]
//        [--criteria old|v21|v22|v23|v24 (기본 v22 = 운영 기본값)] [--info v1|v2 (기본 v2 = 운영 기본값)] [--no-fewshot]
//
// v71cu P3(2026-11-19): 운영 프롬프트와 맞춘다. 09-28 가동 근거는 criteria·few-shot 없이(t2d) 쟀는데 운영은 10-13 부터 v22 + few-shot 이었다.
// 1차 = judgeRelevanceBatch(project, batch, few-shot, call, { criteria, areas, info }) — 운영 relevance-judge-auto.mjs 와 같은 옵션·같은 few-shot 로더
//   (lib/analysis/relevance-examples.ts). few-shot 으로 실린 input_id 는 채점에서 뺀다(누설). --local-claude 면 로컬 claude 로그인으로 호출(CLAUDE_CLI_PATH).
// 2차 = Gemini + 같은 기준의 2차 지시문(old|v21 → SECOND_OPINION_INSTRUCTIONS, v22 → _V22, v23/v24 → 영역 함수) + 같은 info 블록.
//   503 은 체인이 안 넘기므로 모델을 하나씩 고정해 돌고, 4바퀴까지 쉬었다 다시.
// 가드 = rr-v2 내용 가드(passesRrV2ContentGuard)를 결과에 오프라인으로 대 본 "A∧가드" 채점도 낸다. 영역·소비재 제외(loadScope)는 대지 않는다.
// 캐시 = ops/state/t2-eval/<TAG>-{first,second}.json, TAG = 기준 버전 + info 접미사 + few-shot(+fs). old·v1·--no-fewshot 이면 옛 t2d 캐시와 같은 이름이다.
//   호출 실패(unknown)는 캐시하지 않는다 — 다음 실행이 다시 부른다.
// 예시 id(INFORMATIVE_EXAMPLE_INPUT_IDS)는 프롬프트에 실렸으니 채점에서 뺀다(excluded_examples).
// 출력 = ops/state/t2-eval/<version>-eval.json + reports/<KST>/t2-approval-eval.md. DB 는 읽기만 한다.
// 종료코드: 0 완료 · 2 설정/조회 실패·원본 건수 불일치 · 3 판정이 빠진 행 있음(평가 불완전 — 다시 돌리면 캐시로 이어간다)

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '../lib/supabase/server.ts'
import { judgeRelevanceBatch, chunkReviews, MAX_REVIEW_CHARS } from '../lib/analysis/relevance-judge.ts'
import { callGeminiRotating, parseJsonObject, resolveProvider } from '../lib/analysis/llm.ts'
import { SECOND_OPINION_INSTRUCTIONS, SECOND_OPINION_INSTRUCTIONS_V22, secondOpinionInstructionsV23, secondOpinionInstructionsV24, validateOpinions, toExportRow, secondOpinionUserPrompt } from '../lib/analysis/second-opinion.ts'
import { RELEVANCE_CRITERIA_VERSION, RELEVANCE_V21_VERSION, RELEVANCE_V22_VERSION, RELEVANCE_V23_VERSION, RELEVANCE_V24_VERSION, criteriaKindOf, infoVersionSuffix, withInfoCriteria } from '../lib/analysis/relevance-criteria.ts'
import { EVAL_GATE, scoreEval, verdictAgreement } from '../lib/analysis/t2-approval-eval.ts'
import { passesRrV2ContentGuard } from '../lib/analysis/auto-approval.ts'
import { loadRelevanceExamples } from '../lib/analysis/relevance-examples.ts'
import { loadAreasConfig, scorableAreas } from '../lib/analysis/areas-config.ts'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
const localClaude = args.includes('--local-claude')
const saasOnly = args.includes('--saas-only')
const fewShot = !args.includes('--no-fewshot')
const die = (m) => { console.error(`✗ ${m}`); process.exit(2) }
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

// 기준 — 운영과 같은 스위치. 모르는 값은 조용히 바꾸지 않고 멈춘다(§7.1).
const criteria = (opt('criteria') ?? 'v22').toLowerCase()
const info = (opt('info') ?? 'v2').toLowerCase()
const CRITERIA_VERSIONS = { old: RELEVANCE_CRITERIA_VERSION, v21: RELEVANCE_V21_VERSION, v22: RELEVANCE_V22_VERSION, v23: RELEVANCE_V23_VERSION, v24: RELEVANCE_V24_VERSION }
if (!(criteria in CRITERIA_VERSIONS)) die(`--criteria 는 old|v21|v22|v23|v24 다: ${criteria}`)
if (info !== 'v1' && info !== 'v2') die(`--info 는 v1|v2 다: ${info}`)
const areas = criteria === 'v23' || criteria === 'v24' ? (() => {
  const { cfg, error } = loadAreasConfig()
  if (!cfg) die(`${criteria} 기준인데 config/areas.json 을 못 읽었다: ${error}`)
  const names = scorableAreas(cfg).map((a) => a.name)
  if (names.length === 0) die(`${criteria} 기준인데 활성 영역이 0개다`)
  return names
})() : undefined
const firstOpts = criteria === 'old' ? { info } : { criteria, areas, info }
const secondInstructions = withInfoCriteria(
  criteria === 'v24' ? secondOpinionInstructionsV24(areas) : criteria === 'v23' ? secondOpinionInstructionsV23(areas)
    : criteria === 'v22' ? SECOND_OPINION_INSTRUCTIONS_V22 : SECOND_OPINION_INSTRUCTIONS,
  info)
const VERSION = `${CRITERIA_VERSIONS[criteria]}${infoVersionSuffix(info)}${fewShot ? '+fs' : ''}`

const DIR = 'ops/state/t2-eval'
const outPath = opt('out') ?? path.join(DIR, `${VERSION}-eval.json`)
const baselinePath = opt('baseline') ?? 'ops/state/t2-retest-2026-09-28/ops-first.json'

if (!localClaude && resolveProvider() === 'mock') die('LLM_PROVIDER=mock — mock 은 전부 unknown 이라 평가가 되지 않는다. --local-claude 또는 실제 프로바이더를 써라')
if (localClaude && !process.env.CLAUDE_CLI_PATH) die('--local-claude 에는 CLAUDE_CLI_PATH 가 필요하다')

const sb = await createClient()
if (!sb) die('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

// ── 1. 대상 행 ─────────────────────────────────────────────
// 정보 열(마이그 000031)이 없으면 그 필드만 빼고 읽는다 — gold 가 전부 null 이 되고 재확인 목록으로 간다(숨기지 않는다).
let infoColumn = 'present'
async function pageVerdicts(filter) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const cols = `input_id, project_id, human_verdict, human_graded_at${infoColumn === 'present' ? ', human_product_informative' : ''}`
    const { data, error } = await filter(sb.from('review_relevance_verdicts').select(cols)).order('input_id').range(from, from + 999)
    if (error && infoColumn === 'present' && (error.code === '42703' || error.code === 'PGRST204')) {
      infoColumn = 'absent'
      console.warn('⚠️ human_product_informative 컬럼 없음(마이그 20260930000031 미적용) — 사람 정보 판정 없이 읽는다. gold 가 전부 비어 재확인 목록으로 간다.')
      return pageVerdicts(filter)
    }
    if (error) die(`판정 행 조회 실패: ${error.code ?? ''} ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const human = await pageVerdicts((q) => q.not('human_verdict', 'is', null))
const byId = new Map(human.map((r) => [r.input_id, r]))

const samplePath = opt('sample')
if (samplePath) {
  const sample = rd(samplePath)
  if (!Array.isArray(sample)) die(`--sample 은 [{input_id, project_id}] 배열이어야 한다: ${samplePath}`)
  const extra = sample.filter((s) => !byId.has(s.input_id))
  for (let i = 0; i < extra.length; i += 200) {
    const ids = extra.slice(i, i + 200).map((s) => s.input_id)
    for (const r of await pageVerdicts((q) => q.in('input_id', ids))) byId.set(r.input_id, r)
  }
  for (const s of extra) if (!byId.has(s.input_id)) byId.set(s.input_id, { input_id: s.input_id, project_id: s.project_id, human_verdict: null, human_graded_at: null, human_product_informative: null })
}

// 프로젝트 — 1차 운영 입력과 같게(reader_problem 은 있으면).
const pids = [...new Set([...byId.values()].map((r) => r.project_id))]
let proj = await sb.from('analysis_projects').select('id, product_elevator_pitch, purpose, business_model, reader_problem').in('id', pids)
if (proj.error?.code === '42703') proj = await sb.from('analysis_projects').select('id, product_elevator_pitch, purpose, business_model').in('id', pids)
if (proj.error) die(`프로젝트 조회 실패: ${proj.error.message}`)
const projects = new Map(proj.data.map((p) => [p.id, p]))
if (projects.size !== pids.length) die(`프로젝트 ${projects.size}/${pids.length}건만 읽힘 — 중단(§7.1)`)

let targets = [...byId.values()]
if (saasOnly) targets = targets.filter((r) => criteriaKindOf(projects.get(r.project_id).business_model) === 'saas')

// ── 2. 원문(DB 원본) — 행이 빠지면 중단, 폐기된 원문(raw_text 비어 있음)은 따로 센다 ──
const raw = new Map()
const sourceOf = new Map()
const ids = targets.map((r) => r.input_id)
for (let i = 0; i < ids.length; i += 100) {
  const { data, error } = await sb.from('analysis_inputs').select('id, raw_text, source_key').in('id', ids.slice(i, i + 100))
  if (error) die(`원문 조회 실패(${i + 1}~): ${error.message}`)
  for (const x of data) { raw.set(x.id, x.raw_text ?? ''); sourceOf.set(x.id, x.source_key ?? null) }
}
if (raw.size !== ids.length) die(`원문 ${raw.size}/${ids.length}건만 읽힘 — 중단(§7.1). 빠진 id: ${ids.filter((x) => !raw.has(x)).slice(0, 5).join(', ')}`)
const purged = targets.filter((r) => !raw.get(r.input_id).trim()).map((r) => r.input_id)
targets = targets.filter((r) => raw.get(r.input_id).trim())
console.log(`대상 ${targets.length}행 (사람 채점 ${human.length} · --sample ${samplePath ?? '없음'} · SaaS만 ${saasOnly} · 원문 폐기로 제외 ${purged.length})`)

// ── 3. 캐시 ──────────────────────────────────────────────
fs.mkdirSync(DIR, { recursive: true })
const cacheFile = (k) => path.join(DIR, `${VERSION}-${k}.json`)
const loadCache = (k) => (fs.existsSync(cacheFile(k)) ? new Map(Object.entries(rd(cacheFile(k)))) : new Map())
const saveCache = (k, m) => fs.writeFileSync(cacheFile(k), JSON.stringify(Object.fromEntries(m), null, 1))
const first = loadCache('first')
const second = loadCache('second')

// ── 4. 1차 ───────────────────────────────────────────────
const localCall = async (system, user) => {
  // 운영 callClaudeCli 는 자식 env 를 격리해(CI 토큰 전제) 로컬 로그인을 못 본다 — 프롬프트·모델은 같게, 인증만 로컬로.
  const r = spawnSync(process.env.CLAUDE_CLI_PATH, ['-p', '--output-format', 'json', '--max-turns', '1', '--model', 'claude-sonnet-5-5'],
    { input: `${system}\n\n---\n\n${user}`, encoding: 'utf8', timeout: 600_000, maxBuffer: 20_000_000 })
  const env = JSON.parse(r.stdout || '{}')
  if (r.status !== 0 || env.is_error) throw new Error(`claude 로컬 실패 exit=${r.status} ${String(env.result ?? r.stderr).slice(0, 200)}`)
  return { text: env.result, model: `claude-cli-local:${Object.keys(env.modelUsage ?? {}).join('+') || 'claude-sonnet-5-5'}` }
}
// few-shot — 운영과 같은 로더. 실린 id 는 캐시 여부와 상관없이 채점에서 뺀다(이번 실행이 아니라 그 판정을 만든 실행의 예시일 수도 있어서
// 프로젝트별로 매 실행 다시 읽고 모은다 — 사람 채점이 늘면 예시가 바뀐다. 캐시된 옛 판정의 예시와 다를 수 있는 것은 한계로 남긴다).
const fewShotIds = new Set()
const examplesByPid = new Map()
if (fewShot) for (const pid of pids) {
  const ex = await loadRelevanceExamples(sb, pid, (m) => console.warn(m))
  examplesByPid.set(pid, ex)
  for (const e of ex) fewShotIds.add(e.input_id)
}
firstLoop: for (const pid of pids) {
  const todo = targets.filter((r) => r.project_id === pid && !first.has(r.input_id))
    .map((r) => ({ input_id: r.input_id, text: raw.get(r.input_id).slice(0, MAX_REVIEW_CHARS) }))
  for (const batch of chunkReviews(todo)) {
    const o = await judgeRelevanceBatch(projects.get(pid), batch, examplesByPid.get(pid) ?? [], localClaude ? localCall : undefined, firstOpts)
    if (o.error) {
      console.error(`1차 ${pid.slice(0, 8)} ${batch.length}건 실패(캐시 안 함): ${o.error}`)
      if (o.quotaExhausted) break firstLoop
      continue
    }
    for (const v of o.verdicts) first.set(v.input_id, { verdict: v.verdict, product_informative: v.product_informative, reason: v.reason, model: o.model })
    saveCache('first', first)
    console.log(`1차 ${projects.get(pid).product_elevator_pitch ?? pid.slice(0, 8)} ${batch.length}건 model=${o.model}`)
  }
}

// ── 5. 2차 (Gemini) ──────────────────────────────────────
if (!process.env.GEMINI_API_KEY) console.warn('⚠️ GEMINI_API_KEY 없음 — 2차를 건너뛴다. 2차가 없는 행은 unjudged 로 남는다(평가 불완전).')
else {
  delete process.env.GEMINI_MODEL
  const exhausted = new Set()
  for (const batch of chunkReviews(targets.filter((r) => !second.has(r.input_id)), 20)) {
    const rows = batch.map((r) => {
      const p = projects.get(r.project_id)
      return toExportRow({ input_id: r.input_id, project_id: r.project_id, raw_text: raw.get(r.input_id), pitch: p.product_elevator_pitch, business_model: p.business_model })
    })
    // 503 순환·4바퀴 백오프는 야간 2차와 같은 헬퍼다(lib/analysis/llm.ts callGeminiRotating).
    const res = await callGeminiRotating(secondInstructions, secondOpinionUserPrompt(rows), 't2-eval-second', { exhausted })
    if (!res.ok) {
      console.error(`2차 ${batch.length}건 실패 — ${res.reason}(캐시 안 함). 최근: ${res.failures.slice(-3).join(' | ')}`)
      if (res.stop) break
      continue
    }
    let obj
    try { obj = parseJsonObject(res.text) } catch { console.error(`2차 JSON 파싱 실패(캐시 안 함) model=${res.model}`); continue }
    const { ok, rejected } = validateOpinions(obj)
    const asked = new Set(batch.map((r) => r.input_id))
    for (const o of ok.filter((x) => asked.has(x.input_id))) second.set(o.input_id, { verdict: o.verdict, product_informative: o.product_informative, reason: o.reason, model: res.model })
    saveCache('second', second)
    console.log(`2차 ${batch.length}건 model=${res.model} 유효 ${ok.length} · 거부 ${rejected.length}`)
  }
}

// ── 6. 채점 ──────────────────────────────────────────────
const judg = (m, id) => { const x = m.get(id); return x ? { verdict: x.verdict, product_informative: x.product_informative } : null }
const evalRows = targets.map((r) => ({
  input_id: r.input_id,
  human_verdict: r.human_verdict,
  human_product_informative: infoColumn === 'present' ? r.human_product_informative : null,
  human_graded_at: r.human_graded_at,
  first: judg(first, r.input_id),
  second: judg(second, r.input_id),
}))
const result = scoreEval(evalRows, fewShotIds)
// A∧가드 — 가드에 걸리는 행은 rr-v2 가 승인하지 않는다 → 판정이 있으면 not-A 로 둔다(판정 없음은 그대로 unjudged).
const NOT_A = { verdict: 'irrelevant', product_informative: false }
const guarded = scoreEval(evalRows.map((r) => (r.first && r.second && !passesRrV2ContentGuard({ source_key: sourceOf.get(r.input_id), raw_text: raw.get(r.input_id) }) ? { ...r, first: NOT_A } : r)), fewShotIds)
const bySource = {}
for (const r of evalRows) { const k = sourceOf.get(r.input_id) ?? '(없음)'; bySource[k] = (bySource[k] ?? 0) + 1 }

// 옛 프롬프트 대비 1차 verdict 일치 — 추가 질문이 관련성 분포를 흔드는지.
let drift = null
if (fs.existsSync(baselinePath)) {
  const b = rd(baselinePath)
  const base = new Map((Array.isArray(b) ? b : b.rows ?? []).map((x) => [x.input_id, x.verdict]))
  const fresh = new Map(targets.filter((r) => first.has(r.input_id)).map((r) => [r.input_id, first.get(r.input_id).verdict]))
  drift = { baseline: baselinePath, ...verdictAgreement(fresh, base) }
} else console.warn(`⚠️ 옛 1차 기준선 파일 없음(${baselinePath}) — 프롬프트 변경 영향은 확인 불가`)

const pct = (x) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`)
const out = {
  generated_at: new Date().toISOString(), criteria_version: VERSION, criteria, info, few_shot: fewShot, few_shot_excluded_ids: fewShotIds.size,
  gate: EVAL_GATE, human_info_column: infoColumn, purged_excluded: purged.length, ...result, prompt_drift: drift,
  with_content_guard: { n_A: guarded.n_A, errors: guarded.errors, precision: guarded.precision, recall: guarded.recall, gold_estimated: guarded.gold_estimated },
  by_source: bySource,
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))

const date = kstDate()
fs.mkdirSync(path.join('reports', date), { recursive: true })
const mdPath = path.join('reports', date, 't2-approval-eval.md')
fs.writeFileSync(mdPath, [
  `# rr-v2 자동 승인 평가 (${date}, 기준 ${VERSION})`,
  '',
  `- 대상 ${result.n}행 · 예시 제외 ${result.excluded_examples} · 판정 빠짐(unjudged) ${result.unjudged} · 원문 폐기 제외 ${purged.length} · 사람 정보 열 ${infoColumn === 'present' ? '있음' : '없음(마이그 000031 미적용)'}`,
  `- gold 확정 ${result.gold_known}행(그중 승인해도 되는 행 ${result.gold_positive})`,
  `- **A(둘 다 관련 ∧ 둘 다 정보 있음) ${result.n_A}건 · 오류 ${result.errors}건 · 정밀도 ${pct(result.precision)} · 재현율 ${pct(result.recall)}**${result.gold_estimated ? ` — **잠정**: A 중 ${result.gold_estimated}건은 사람 정보 열이 비어 '관련=정보 있음'으로 추정한 정답` : ''}`,
  `- **A∧내용 가드 ${guarded.n_A}건 · 오류 ${guarded.errors}건 · 정밀도 ${pct(guarded.precision)} · 재현율 ${pct(guarded.recall)}** (가드 = github_issues·hackernews 제외 · 60자 미만 제외. 영역·소비재 제외는 안 댐)`,
  `- 기준 ${criteria} · 정보 ${info} · few-shot ${fewShot ? `켬(실린 ${fewShotIds.size}건 채점 제외)` : '끔'} · 소스 분포 ${JSON.stringify(bySource)}`,
  `- 가동 문턱(문서화만, 플래그는 사람이 켠다): n_A≥${EVAL_GATE.minNA} · 오류≤${EVAL_GATE.maxErrors} · 재현율≥${EVAL_GATE.minRecall * 100}% → ${result.meets_gate ? '충족' : '미충족'}`,
  `- 옛 프롬프트 대비 1차 verdict 일치: ${drift ? `${drift.agree}/${drift.n} (${pct(drift.pct)}) · 기준선 ${drift.baseline}` : '확인 불가(기준선 없음)'}`,
  '',
  `## 재확인 목록 ${result.recheck.length}건 (정보 열 미기재 ∧ 예측과 부딪침: a = 사람 무관·모름인데 예측 승인 · c = 사람 관련인데 예측 미승인 · b = 09-28 좁은 기준 무관, 항상 — 관련 열도 다시)`,
  ...result.recheck.map((r) => `- \`${r.input_id}\` · ${r.reason}`),
  '',
  `표 만들기: \`node --env-file=.env.local scripts/relevance-grading-sample.mjs --recheck ${outPath}\``,
  ...(drift && drift.flips.length ? ['', '## 1차 verdict 가 바뀐 행 (최대 30)', ...drift.flips.slice(0, 30).map((f) => `- \`${f.input_id}\` · ${f.from} → ${f.to}`)] : []),
  '',
].join('\n'))
console.log(`A ${result.n_A}(추정 정답 ${result.gold_estimated}) · 오류 ${result.errors} · 정밀도 ${pct(result.precision)} · 재현율 ${pct(result.recall)} · unjudged ${result.unjudged} · 재확인 ${result.recheck.length}`)
console.log(`✅ ${outPath}\n✅ ${mdPath}`)
process.exit(result.unjudged > 0 ? 3 : 0)
