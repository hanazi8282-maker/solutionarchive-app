#!/usr/bin/env node
// v71dm — 판정 기준 v2.4(운영) ↔ v2.6(후보) 비교. DB 접근 없음·서비스 키 불필요. v2.6 은 운영에 적용되지 않는다.
//   node scripts/v26-compare.mjs <rows.json> [--dry]                     ← 기본: 모델 호출 0회, 입력 검증·프롬프트 길이만
//   node scripts/v26-compare.mjs <rows.json> --run --out <result.json>   ← 실제 호출(v24·v26 각 1회씩), 뒤집힌 글을 출력
//   (--in <rows.json> 으로 줘도 된다.)
// 입력: [{ key | input_id, text, project?: { purpose?, pitch?, business_model? } | project_purpose?, project_pitch?, business_model?,
//          source_key?, gold?: { verdict: 'relevant'|'irrelevant', informative: boolean } }]   — v25-compare 입력도 그대로 받는다.
// 호출 방식은 v25-compare 와 같다(운영 1차 judgeRelevanceBatch · 프로젝트 단위 BATCH_SIZE · few-shot 없음 · 영역 config/areas.json).
// v26 은 relevance-judge.ts 를 건드리지 않고 운영 v24 시스템 프롬프트를 systemV26FromV24 로 바꿔 끼워 부른다(운영 선택 로직 무변경).
// 결과에 개발자 대상 가드 패턴(devAudienceReason)도 함께 적는다 — 규칙 가드와 v26 이 같은 글을 보는지 대조용.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { BATCH_SIZE, buildRelevancePrompt, chunkReviews, judgeRelevanceBatch } from '../lib/analysis/relevance-judge.ts'
import { RELEVANCE_V24_VERSION } from '../lib/analysis/relevance-criteria.ts'
import { RELEVANCE_V26_VERSION, systemV26FromV24 } from '../lib/analysis/relevance-criteria-v26.ts'
import { devAudienceReason } from '../lib/analysis/dev-audience-guard.ts'

export const CRITERIA = /** @type {const} */ (['v24', 'v26'])
const VERSION = { v24: RELEVANCE_V24_VERSION, v26: RELEVANCE_V26_VERSION }

const keyOf = (r) => (typeof r?.key === 'string' && r.key.trim() ? r.key : typeof r?.input_id === 'string' && r.input_id.trim() ? r.input_id : null)
const projectOf = (r) => (r.project && typeof r.project === 'object'
  ? { purpose: r.project.purpose ?? null, product_elevator_pitch: r.project.pitch ?? null, business_model: r.project.business_model ?? null }
  : { purpose: r.project_purpose ?? null, product_elevator_pitch: r.project_pitch ?? null, business_model: r.business_model ?? null })

/** 입력 검증. 하나라도 틀리면 전부 거부한다(§7.1). gold 는 있으면 검사하고 없어도 된다(뒤집힘만 본다). */
export function validateRows(raw) {
  const errors = []
  if (!Array.isArray(raw)) return { rows: [], errors: ['입력이 배열이 아니다'] }
  if (raw.length === 0) return { rows: [], errors: ['입력이 비었다'] }
  const seen = new Set()
  raw.forEach((r, i) => {
    const at = `#${i}`
    if (!r || typeof r !== 'object') { errors.push(`${at}: 객체가 아니다`); return }
    const k = keyOf(r)
    if (!k) errors.push(`${at}: key·input_id 없음`)
    else if (seen.has(k)) errors.push(`${at}: key 중복 ${k}`)
    else seen.add(k)
    if (typeof r.text !== 'string' || !r.text.trim()) errors.push(`${at}: text 없음`)
    const p = projectOf(r)
    if (!p.purpose && !p.product_elevator_pitch) errors.push(`${at}: 프로젝트 목적(project.purpose|pitch 또는 project_purpose|project_pitch) 없음`)
    if (r.gold !== undefined && r.gold !== null) {
      if (!['relevant', 'irrelevant'].includes(r.gold.verdict)) errors.push(`${at}: gold.verdict 는 relevant|irrelevant`)
      if (typeof r.gold.informative !== 'boolean') errors.push(`${at}: gold.informative 는 boolean`)
    }
  })
  return { rows: errors.length ? [] : raw.map((r) => ({ ...r, key: keyOf(r) })), errors }
}

/** 같은 프로젝트끼리 묶어 BATCH_SIZE 로 자른다. 순서는 입력 순서. */
export function planBatches(rows) {
  const groups = new Map()
  for (const r of rows) {
    const p = projectOf(r)
    const k = JSON.stringify(p)
    if (!groups.has(k)) groups.set(k, { purpose: p, reviews: [] })
    groups.get(k).reviews.push({ input_id: r.key, text: r.text })
  }
  return [...groups.values()].flatMap((g) => chunkReviews(g.reviews, BATCH_SIZE).map((reviews) => ({ purpose: g.purpose, reviews })))
}

/** --dry: 모델을 부르지 않는다. 기준별 system 길이·묶음 수·user 길이만. v26 system 은 v24 system 을 바꿔 끼운 것이다. */
export function promptStats(rows, areas) {
  const batches = planBatches(rows)
  const ps = batches.map((b) => buildRelevancePrompt(b.purpose, b.reviews, [], { criteria: 'v24', areas }))
  const user = ps.reduce((n, p) => n + p.user.length, 0)
  const sys24 = ps[0]?.system ?? ''
  return {
    v24: { prompt_version: VERSION.v24, batches: ps.length, system_chars: sys24.length, user_chars_total: user },
    v26: { prompt_version: VERSION.v26, batches: ps.length, system_chars: sys24 ? systemV26FromV24(sys24, areas).length : 0, user_chars_total: user },
  }
}

/** rel 또는 info 가 바뀐 글. 호출 오류(rel=null)인 글은 뒤집힘으로 세지 않는다. */
export function flips(resultRows) {
  return resultRows.filter((r) => r.v24 && r.v26 && r.v24.rel != null && r.v26.rel != null && (r.v24.rel !== r.v26.rel || r.v24.info !== r.v26.info))
}

function score(rows, out, c) {
  let n = 0, rel = 0, info = 0, both = 0, errors = 0
  for (const r of rows) {
    if (!r.gold) continue
    const o = out.get(r.key)?.[c]
    if (!o || o.rel == null) { errors++; continue }
    n++
    const relOk = o.rel === r.gold.verdict, infoOk = o.info === r.gold.informative
    if (relOk) rel++
    if (infoOk) info++
    if (relOk && infoOk) both++
  }
  return { judged_with_gold: n, errors, rel_correct: rel, info_correct: info, both_correct: both }
}

/**
 * --run 본체. call(system, user) 은 셀프테스트가 가짜를 꽂는 자리 — 없으면 운영과 같은 LLM 호출.
 * v24 는 call 그대로, v26 은 같은 call 에 systemV26FromV24 로 바꾼 system 을 넘긴다(user 는 같다).
 */
export async function runCompare(rows, areas, { call, budget = (fn) => fn(), log = () => {} } = {}) {
  let base = call
  if (!base) {
    const { callLlmWithModel, resolveProvider } = await import('../lib/analysis/llm.ts')
    base = (s, u) => callLlmWithModel(resolveProvider(), s, u, 'relevance-judge')
  }
  const calls = { v24: base, v26: (s, u) => base(systemV26FromV24(s, areas), u) }
  const batches = planBatches(rows)
  const out = new Map(rows.map((r) => [r.key, {}]))
  const models = new Set()
  for (const c of CRITERIA) {
    for (const [i, b] of batches.entries()) {
      const res = await budget(() => judgeRelevanceBatch(b.purpose, b.reviews, [], calls[c], { criteria: 'v24', areas }))
      models.add(res.model)
      for (const v of res.verdicts) out.get(v.input_id)[c] = res.error ? { rel: null, info: null, error: res.error } : { rel: v.verdict, info: v.product_informative, why: v.reason ?? null }
      log(`${c} 묶음 ${i + 1}/${batches.length} — ${b.reviews.length}건${res.error ? ` · 오류: ${res.error}` : ''}`)
      if (res.quotaExhausted) throw new Error(`한도/예산 소진 — ${c} 묶음 ${i + 1} 에서 멈춤: ${res.error ?? ''}`)
    }
  }
  const resultRows = rows.map((r) => ({ key: r.key, source_key: r.source_key ?? null, dev_audience: devAudienceReason(r.text, r.source_key ?? null), v24: out.get(r.key).v24, v26: out.get(r.key).v26, gold: r.gold ?? null }))
  return {
    prompt_versions: VERSION,
    models: [...models],
    n: rows.length,
    summary: Object.fromEntries(CRITERIA.map((c) => [c, score(rows, out, c)])),
    flipped: flips(resultRows).map((r) => r.key),
    rows: resultRows,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined }
  const run = args.includes('--run')
  if (run && args.includes('--dry')) { console.error('✗ --run 과 --dry 는 함께 쓸 수 없다'); process.exit(2) }
  const valueArgs = new Set([arg('in'), arg('out')].filter(Boolean))
  const inPath = arg('in') ?? args.find((a) => !a.startsWith('--') && !valueArgs.has(a))
  const outPath = arg('out')
  if (!inPath) { console.error('✗ 입력 JSON 경로가 필요하다: node scripts/v26-compare.mjs <rows.json> [--dry | --run --out <result.json>]'); process.exit(2) }
  if (run && !outPath) { console.error('✗ --run 에는 --out <path> 가 필요하다'); process.exit(2) }
  const { rows, errors } = validateRows(JSON.parse(fs.readFileSync(inPath, 'utf8')))
  if (errors.length) { console.error(`✗ 입력 오류 ${errors.length}건:\n  ${errors.slice(0, 20).join('\n  ')}`); process.exit(2) }
  const { loadAreasConfig, scorableAreas } = await import('../lib/analysis/areas-config.ts')
  const { cfg, error } = loadAreasConfig()
  if (!cfg) { console.error(`✗ config/areas.json 을 못 읽었다: ${error}`); process.exit(2) }
  const areas = scorableAreas(cfg).map((a) => a.name)
  console.log(`입력 ${rows.length}건 · 활성 영역 ${areas.length}개 · ${JSON.stringify(promptStats(rows, areas))}`)
  if (!run) { console.log('--dry(기본): 모델 호출 0회. 실제 비교는 --run --out <path>.'); return }

  process.env.LLM_PROVIDER ??= 'claude-cli' // 운영 nightly-relevance 기본과 같다
  const { resolveProvider } = await import('../lib/analysis/llm.ts')
  if (resolveProvider() === 'mock') { console.error('✗ LLM_PROVIDER=mock 은 판정을 흉내내지 않는다(전부 unknown) — 비교가 무의미해 시작하지 않는다'); process.exit(2) }
  const { withLlmBudget } = await import('../lib/analysis/budget.ts')
  const result = await runCompare(rows, areas, { budget: withLlmBudget, log: (m) => console.log(`[${new Date().toISOString()}] ${m}`) })
  fs.writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), provider: resolveProvider(), areas, ...result }, null, 1))
  console.log(`✓ ${outPath} — ${JSON.stringify(result.summary)}`)
  console.log(`뒤집힘 ${result.flipped.length}건 / ${result.n}건:`)
  for (const r of result.rows.filter((x) => result.flipped.includes(x.key))) {
    console.log(`- ${r.key} [${r.source_key ?? '?'}] v24 ${r.v24.rel}/${r.v24.info} → v26 ${r.v26.rel}/${r.v26.info}${r.dev_audience ? ` · 가드 ${r.dev_audience}` : ''}${r.gold ? ` · 정답 ${r.gold.verdict}/${r.gold.informative}` : ''}${r.v26.why ? ` · v26 근거: ${r.v26.why}` : ''}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
