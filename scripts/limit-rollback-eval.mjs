#!/usr/bin/env node
// 한도 변경 24h 재평가 + 자율 상향 가능 판정 (v71au ⑮, v71am §2-3). **읽기 전용** — DB·변수에 쓰지 않는다.
// CLAUDE.md §10.1: 요청 상한을 내리는 변경은 자동으로 하지 않는다 → 롤백 판정은 SQL/안내 파일로만 낸다. 적용은 사람·역할 세션.
//   node scripts/limit-rollback-eval.mjs [--out=<파일>]
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { usdFor } from '../lib/analysis/budget.ts'
import { openDb } from './target-supply.mjs'

const H = 3_600_000
export const KEEP_RATIO = 0.7 // 변경 뒤 요청당 신규가 변경 전의 70% 미만이면 효과 없음 → 롤백 후보
export const MIN_REQ = 10 // 변경 뒤 요청이 이보다 적으면 판정하지 않는다(확인 불가, §7.1)

const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
const per = (rows) => (sum(rows, 'requests') > 0 ? sum(rows, 'new_reviews') / sum(rows, 'requests') : null)

/**
 * 변경 1건 판정. change = review_source_cap_log 행, runs = 그 소스의 review_collection_runs(dry_run 제외, started_at 포함).
 * 차단·쿼터 신호가 변경 뒤 한 건이라도 있으면 즉시 rollback. 24h 안이면 pending.
 */
export function evaluateChange(change, runs, now) {
  const t = Date.parse(change.created_at)
  const age = (now.getTime() - t) / H
  if (age < 24) return { verdict: 'pending', why: `변경 ${Math.round(age)}h 경과 — 24h 뒤 재평가` }
  const before = runs.filter((r) => Date.parse(r.started_at) < t && Date.parse(r.started_at) >= t - 24 * H)
  const after = runs.filter((r) => Date.parse(r.started_at) >= t && Date.parse(r.started_at) < t + 24 * H)
  const sig = sum(after, 'blocked_responses') + sum(after, 'quota_responses')
  if (sig > 0) return { verdict: 'rollback', why: `변경 뒤 24h 차단·쿼터 신호 ${sig}건` }
  if (sum(after, 'requests') < MIN_REQ) return { verdict: 'unknown', why: `변경 뒤 요청 ${sum(after, 'requests')}건 < ${MIN_REQ} — 확인 불가(공급이 병목이면 효과 0)` }
  const b = per(before), a = per(after)
  if (b === null) return { verdict: 'keep', why: `변경 전 기준 없음, 변경 뒤 요청당 신규 ${a.toFixed(1)}`, new_per_req: a }
  if (a < b * KEEP_RATIO) return { verdict: 'rollback', why: `요청당 신규 ${b.toFixed(1)} → ${a.toFixed(1)} (${Math.round((a / b) * 100)}% < ${KEEP_RATIO * 100}%)` }
  return { verdict: 'keep', why: `요청당 신규 ${b.toFixed(1)} → ${a.toFixed(1)}`, new_per_req: a }
}

/** 롤백 안내: workflow 가 쓴 cap 행은 SQL, 사람/세션이 쓴 행은 reason 의 '롤백 …' 문구를 그대로 인용. */
export function rollbackNote(change) {
  if (String(change.applied_by).startsWith('workflow:') && change.previous_cap != null && change.new_cap != null)
    return `UPDATE public.review_sources SET daily_request_cap = ${Number(change.previous_cap)} WHERE key = '${String(change.source_key).replace(/[^a-z0-9_]/g, '')}' AND daily_request_cap = ${Number(change.new_cap)};`
  const m = /롤백[^.]*\.?/.exec(change.reason ?? '')
  return m ? `-- reason 인용: ${m[0].trim()}` : '-- 롤백법이 reason 에 없음 — 한도 대장 확인'
}

/**
 * 자율 상향 가능 판정(제안만): 차단 0 AND 천장 내 AND 한 단계(현재의 ≤2배) AND 24h 내 다른 변경 없음 AND 목표의 90% 이상 소진.
 * state = {cap, requests24, blocked24, ceiling, lastChangeAgeH}. 상향은 적용하지 않는다.
 */
export function canRaise(state) {
  const why = []
  if (state.blocked24 > 0) why.push(`차단·쿼터 ${state.blocked24}건`)
  if (state.lastChangeAgeH != null && state.lastChangeAgeH < 24) why.push(`마지막 변경 ${Math.round(state.lastChangeAgeH)}h 전`)
  if (state.requests24 < 0.9 * state.cap) why.push(`사용률 ${Math.round((state.requests24 / state.cap) * 100)}% < 90%`)
  const next = Math.min(state.cap * 2, state.ceiling)
  if (next <= state.cap) why.push('천장 도달')
  return why.length ? { ok: false, why: why.join(' · ') } : { ok: true, next, why: `사용 ${state.requests24}/${state.cap}, 차단 0, 한 단계 ${state.cap} → ${next}` }
}

// 일일 LLM 사용 추정(v71as $15). 과금되는 건 2차 판정(Gemini) 뿐 — 1차 claude-cli 는 구독 경로라 예산 밖(lib/analysis/llm.ts UNMETERED).
// 교차 실행 합계를 담는 지출 장부가 없어(budget.ts 는 프로세스 단위) 판정 행 수 × 보수 단가(budget.ts usdFor 기본값)로 추정한다 → [추정].
export const ASSUMED_INPUT_CHARS = 1200
export const ASSUMED_OUTPUT_TOKENS = 150
export function llmSpendLine({ metered24, budget, usdFor }) {
  const est = metered24 * usdFor(ASSUMED_INPUT_CHARS, ASSUMED_OUTPUT_TOKENS)
  return `- LLM 일일 사용(과금 경로 = 2차 판정 Gemini ${metered24}건 × 보수 단가) ≈ $${est.toFixed(2)} / 한도 $${budget} (${Math.round((est / budget) * 100)}%) [추정]`
}

export function evalBlock({ date, items, raises, llm }) {
  const L = [`[한도 재평가 ${date}]`]
  if (!items.length) L.push('- 최근 72h 한도 변경 없음')
  for (const i of items) L.push(`- ${i.c.source_key} ${i.c.previous_cap}→${i.c.new_cap} (${i.c.created_at.slice(0, 16)}Z, ${i.c.applied_by}): ${i.r.verdict} — ${i.r.why}${i.r.verdict === 'rollback' ? `\n    롤백(적용 안 함): ${rollbackNote(i.c)}` : ''}`)
  if (llm) L.push(llm)
  L.push('- 상향 가능 소스(제안만):')
  for (const [k, r] of Object.entries(raises)) if (r.ok) L.push(`  - ${k}: ${r.why}`)
  if (!Object.values(raises).some((r) => r.ok)) L.push('  - 없음')
  return L.join('\n')
}

export async function main(argv, { db, now = new Date() } = {}) {
  const sb = db ?? (await openDb())
  const q = async (b, what) => { const { data, error } = await b; if (error) throw new Error(`${what} 조회 실패: ${error.message}`); return data }
  const since72 = new Date(now.getTime() - 72 * H).toISOString()
  const changes = await q(sb.from('review_source_cap_log').select('source_key, previous_cap, new_cap, reason, applied_by, created_at').gte('created_at', since72).not('new_cap', 'is', null).order('created_at'), 'review_source_cap_log')
  const runs = await q(sb.from('review_collection_runs').select('source_key, started_at, requests, new_reviews, blocked_responses, quota_responses').gte('started_at', new Date(now.getTime() - 120 * H).toISOString()).eq('dry_run', false).limit(10000), 'review_collection_runs')
  const srcs = await q(sb.from('review_sources').select('key, daily_request_cap, enabled'), 'review_sources')
  const items = changes.map((c) => ({ c, r: evaluateChange(c, runs.filter((x) => x.source_key === c.source_key), now) }))
  const raises = {}
  for (const s of srcs.filter((x) => x.enabled)) {
    const r24 = runs.filter((x) => x.source_key === s.key && Date.parse(x.started_at) >= now.getTime() - 24 * H)
    const last = changes.filter((c) => c.source_key === s.key).at(-1)
    raises[s.key] = canRaise({ cap: s.daily_request_cap, requests24: sum(r24, 'requests'), blocked24: sum(r24, 'blocked_responses') + sum(r24, 'quota_responses'), ceiling: s.daily_request_cap * 2, lastChangeAgeH: last ? (now.getTime() - Date.parse(last.created_at)) / H : null })
  }
  const date = new Date(now.getTime() + 9 * H).toISOString().slice(0, 10)
  const { count: metered24, error: ce } = await sb.from('review_relevance_verdicts').select('input_id', { count: 'exact', head: true }).like('second_model', 'gemini%').gte('second_judged_at', new Date(now.getTime() - 24 * H).toISOString())
  const budget = Number(process.env.LLM_DAILY_BUDGET_USD) > 0 ? Number(process.env.LLM_DAILY_BUDGET_USD) : 5
  const llm = ce ? '- LLM 일일 사용: 확인 불가 — 판정 행 조회 실패' : llmSpendLine({ metered24: metered24 ?? 0, budget, usdFor })
  const block = evalBlock({ date, items, raises, llm })
  const out = argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (out) fs.writeFileSync(out, block + '\n')
  console.log(block)
  return block
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => { console.error(`❌ limit-rollback-eval: ${e.message}`); process.exit(1) })
}
