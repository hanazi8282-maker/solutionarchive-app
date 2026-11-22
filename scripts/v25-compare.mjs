#!/usr/bin/env node
// v71db — 판정 기준 v2.4 ↔ v2.5 비교(DB 접근 없음, 서비스 키 불필요).
//   node scripts/v25-compare.mjs --in <rows.json> [--out <result.json>] [--dry]   ← 기본: 모델 호출 0회, 입력 검증·프롬프트 길이만
//   node scripts/v25-compare.mjs --in <rows.json> --out <result.json> --run      ← 실제 호출(v24·v25 각 1회씩)
// 입력: [{ key, text, project: { purpose?, pitch?, business_model? }, source_key?, gold: { verdict: 'relevant'|'irrelevant', informative: boolean } }]
// 호출 방식은 운영 1차(relevance-judge-auto.mjs)와 같다: judgeRelevanceBatch(project, batch, examples, undefined, { criteria, areas }) — 프로젝트 단위 BATCH_SIZE 묶음,
// provider 는 LLM_PROVIDER(없으면 운영 워크플로 기본 claude-cli), 영역은 config/areas.json scorableAreas. 운영과 다른 점 하나: few-shot 예시(DB 사람 채점)는 쓰지 않는다(빈 배열).
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { BATCH_SIZE, buildRelevancePrompt, chunkReviews, judgeRelevanceBatch } from '../lib/analysis/relevance-judge.ts'
import { RELEVANCE_V24_VERSION, RELEVANCE_V25_VERSION } from '../lib/analysis/relevance-criteria.ts'

export const CRITERIA = /** @type {const} */ (['v24', 'v25'])
const VERSION = { v24: RELEVANCE_V24_VERSION, v25: RELEVANCE_V25_VERSION }

/** 입력 검증. 하나라도 틀리면 전부 거부한다(§7.1 — 반쯤 맞는 입력으로 돌지 않는다). */
export function validateRows(raw) {
  const errors = []
  if (!Array.isArray(raw)) return { rows: [], errors: ['입력이 배열이 아니다'] }
  if (raw.length === 0) return { rows: [], errors: ['입력이 비었다'] }
  const seen = new Set()
  raw.forEach((r, i) => {
    const at = `#${i}`
    if (!r || typeof r !== 'object') { errors.push(`${at}: 객체가 아니다`); return }
    if (typeof r.key !== 'string' || !r.key.trim()) errors.push(`${at}: key 없음`)
    else if (seen.has(r.key)) errors.push(`${at}: key 중복 ${r.key}`)
    else seen.add(r.key)
    if (typeof r.text !== 'string' || !r.text.trim()) errors.push(`${at}: text 없음`)
    if (!r.project || typeof r.project !== 'object') errors.push(`${at}: project 없음`)
    if (!r.gold || !['relevant', 'irrelevant'].includes(r.gold.verdict)) errors.push(`${at}: gold.verdict 는 relevant|irrelevant`)
    if (!r.gold || typeof r.gold.informative !== 'boolean') errors.push(`${at}: gold.informative 는 boolean`)
  })
  return { rows: errors.length ? [] : raw, errors }
}

const purposeOf = (p) => ({ purpose: p.purpose ?? null, product_elevator_pitch: p.pitch ?? null, business_model: p.business_model ?? null })

/** 같은 project 끼리 묶어 BATCH_SIZE 로 자른다(운영은 프로젝트 단위로 부른다). 순서는 입력 순서. */
export function planBatches(rows) {
  const groups = new Map()
  for (const r of rows) {
    const k = JSON.stringify(purposeOf(r.project))
    if (!groups.has(k)) groups.set(k, { purpose: purposeOf(r.project), reviews: [] })
    groups.get(k).reviews.push({ input_id: r.key, text: r.text })
  }
  return [...groups.values()].flatMap((g) => chunkReviews(g.reviews, BATCH_SIZE).map((reviews) => ({ purpose: g.purpose, reviews })))
}

/** --dry: 모델을 부르지 않는다. 기준별 system 길이·묶음별 user 길이만. */
export function promptStats(rows, areas) {
  const batches = planBatches(rows)
  return Object.fromEntries(CRITERIA.map((c) => {
    const ps = batches.map((b) => buildRelevancePrompt(b.purpose, b.reviews, [], { criteria: c, areas }))
    return [c, { prompt_version: VERSION[c], batches: ps.length, system_chars: ps[0]?.system.length ?? 0, user_chars_total: ps.reduce((n, p) => n + p.user.length, 0) }]
  }))
}

/** 정답 대비 집계. 호출 오류(rel=null)는 분모에서 빼고 따로 센다. */
function score(rows, out, c) {
  let n = 0, rel = 0, info = 0, both = 0, errors = 0
  for (const r of rows) {
    const o = out.get(r.key)?.[c]
    if (!o || o.rel == null) { errors++; continue }
    n++
    const relOk = o.rel === r.gold.verdict
    const infoOk = o.info === r.gold.informative
    if (relOk) rel++
    if (infoOk) info++
    if (relOk && infoOk) both++
  }
  return { judged: n, errors, rel_correct: rel, info_correct: info, both_correct: both }
}

/** --run 본체. call 은 셀프테스트가 가짜를 꽂는 자리(undefined = 운영과 같은 LLM 호출). budget 은 운영처럼 묶음을 지갑으로 감싼다. */
export async function runCompare(rows, areas, { call, budget = (fn) => fn(), log = () => {} } = {}) {
  const batches = planBatches(rows)
  const out = new Map(rows.map((r) => [r.key, {}]))
  const models = new Set()
  for (const c of CRITERIA) {
    for (const [i, b] of batches.entries()) {
      const res = await budget(() => judgeRelevanceBatch(b.purpose, b.reviews, [], call, { criteria: c, areas }))
      models.add(res.model)
      for (const v of res.verdicts) {
        // 호출 오류면 verdicts 가 전부 unknown 으로 채워진다 — 판정 결과로 접지 않는다(§7.1).
        out.get(v.input_id)[c] = res.error ? { rel: null, info: null, error: res.error } : { rel: v.verdict, info: v.product_informative }
      }
      log(`${c} 묶음 ${i + 1}/${batches.length} — ${b.reviews.length}건${res.error ? ` · 오류: ${res.error}` : ''}`)
      if (res.quotaExhausted) throw new Error(`한도/예산 소진 — ${c} 묶음 ${i + 1} 에서 멈춤: ${res.error ?? ''}`)
    }
  }
  return {
    prompt_versions: VERSION,
    models: [...models],
    n: rows.length,
    summary: Object.fromEntries(CRITERIA.map((c) => [c, score(rows, out, c)])),
    rows: rows.map((r) => ({ key: r.key, v24: out.get(r.key).v24, v25: out.get(r.key).v25, gold: r.gold })),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined }
  const run = args.includes('--run')
  const inPath = arg('in'), outPath = arg('out')
  if (!inPath) { console.error('✗ --in <path> 가 필요하다'); process.exit(2) }
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
