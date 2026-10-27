#!/usr/bin/env node
// v71bj §2 — v2.3 사후 검증(읽기 전용, DB 쓰기 0). 영역 ①~⑤ 프로젝트의 기존 판정 글을 자연 분포로 고정 seed 에서 뽑아
// v2.2 를 2회, v2.3 을 1회 판정한다. 합격: v2.3 변동률 ≤ v2.2 재실행 잡음 + 3%p. 방향(relevant↔irrelevant)도 센다. 원문은 출력하지 않는다.
//   node --env-file=.env.local scripts/criteria-v23-verify.mjs [--n=320] [--out=reports/2026-10-27/v23-verify.json]
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { judgeRelevanceBatch } from '../lib/analysis/relevance-judge.ts'
import { loadAreasConfig, scorableAreas } from '../lib/analysis/areas-config.ts'

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const N = Number(arg('n', 320)); const OUT = arg('out', 'reports/2026-10-27/v23-verify.json'); const SEED = 'v71bj-verify'; const CRIT = arg('criteria', 'v23')
const h = (id) => createHash('sha1').update(SEED + id).digest('hex')
const sb = await createClient(); const { cfg, error } = loadAreasConfig(); if (!cfg) { console.error(error); process.exit(2) }
const areas = scorableAreas(cfg).map((a) => a.name)
const projects = new Map(); for (let f = 0; ; f += 1000) { const { data } = await sb.from('analysis_projects').select('id, area_code, business_model, product_elevator_pitch').range(f, f + 999); data.forEach((p) => projects.set(p.id, p)); if (data.length < 1000) break }
const inIds = [...projects.values()].filter((p) => ['1', '2', '3', '4', '5'].includes((p.area_code ?? '').trim())).map((p) => p.id)
const pool = []
for (let i = 0; i < inIds.length; i += 40) for (let f = 0; ; f += 1000) {
  const { data, error: e } = await sb.from('review_relevance_verdicts').select('input_id, project_id, verdict').in('project_id', inIds.slice(i, i + 40)).not('verdict', 'is', null).order('input_id').range(f, f + 999)
  if (e) { console.error(e); process.exit(2) } pool.push(...data); if (data.length < 1000) break
}
console.log(`영역 ①~⑤ 판정 풀 ${pool.length}건`)
const pick = pool.sort((a, b) => (h(a.input_id) < h(b.input_id) ? -1 : 1)).slice(0, Math.ceil(N * 1.15))
const raw = new Map(); for (let i = 0; i < pick.length; i += 100) { const { data } = await sb.from('analysis_inputs').select('id, raw_text, purged_at').in('id', pick.slice(i, i + 100).map((r) => r.input_id)); data.forEach((x) => raw.set(x.id, x)) }
const sample = pick.filter((r) => { const x = raw.get(r.input_id); return x && !x.purged_at && (x.raw_text ?? '').trim() }).slice(0, N)
console.log(`표본 ${sample.length}건 · 기존 판정 분포 ${JSON.stringify(sample.reduce((m, r) => (m[r.verdict] = (m[r.verdict] ?? 0) + 1, m), {}))}`)

let failedBatches = 0 // 호출이 에러로 끝난 배치 — 0 이 아니면 결과는 '확인 불가'다(실패 배치가 변동 0 으로 보이는 걸 막는다, §7.1)
async function run(criteria) {
  const out = new Map(); const byProj = new Map(); for (const r of sample) (byProj.get(r.project_id) ?? byProj.set(r.project_id, []).get(r.project_id)).push(r)
  const batches = []; for (const [pid, rs] of byProj) for (let i = 0; i < rs.length; i += 20) batches.push([pid, rs.slice(i, i + 20)])
  let next = 0
  await Promise.all(Array.from({ length: 3 }, async () => { while (next < batches.length) {
    const [pid, batch] = batches[next++]; const p = projects.get(pid)
    for (let attempt = 0; ; attempt++) {
      const res = await judgeRelevanceBatch({ product_elevator_pitch: p.product_elevator_pitch, business_model: p.business_model }, batch.map((r) => ({ input_id: r.input_id, text: raw.get(r.input_id).raw_text.slice(0, 1500) })), [], undefined, { criteria, areas })
      if (res.quotaExhausted) { console.log('한도 — 20분 대기'); await new Promise((r) => setTimeout(r, 20 * 60_000)); continue }
      if (res.error && attempt < 1) continue
      if (res.error || res.verdicts.length < batch.length) failedBatches++
      for (const v of res.verdicts) out.set(v.input_id, { verdict: v.verdict, why: v.reason ?? '' }); break
    }
  } }))
  return out
}
const a1 = await run('v22'), a2 = await run('v22'), b = await run(CRIT)
const both = (x, y) => sample.filter((r) => x.get(r.input_id) && y.get(r.input_id))
const diff = (x, y) => { const s = both(x, y); const ch = s.filter((r) => x.get(r.input_id).verdict !== y.get(r.input_id).verdict); const dir = {}; for (const r of ch) { const k = `${x.get(r.input_id).verdict}→${y.get(r.input_id).verdict}`; dir[k] = (dir[k] ?? 0) + 1 } return { n: s.length, changed: ch.length, pct: s.length ? Number(((100 * ch.length) / s.length).toFixed(1)) : null, dir } }
const noise = diff(a1, a2), change = diff(a1, b), change2 = diff(a2, b)
// 어느 규칙이 뒤집었나: v2.3 이유 문구에 "영역 밖"(규칙 10) 또는 노트/업무관리/디자인/(16) 언급이 있는 뒤집힘 건수. 원문·이유 문장은 저장하지 않는다.
const flipped = both(a1, b).filter((r) => a1.get(r.input_id).verdict !== b.get(r.input_id).verdict)
const rule = { rule10_v22: flipped.filter((r) => /영역 밖/.test(a1.get(r.input_id).why)).length, rule10_v23: flipped.filter((r) => /영역 밖/.test(b.get(r.input_id).why)).length, rule16_v23: flipped.filter((r) => /\(16\)|노트|업무관리|디자인/.test(b.get(r.input_id).why)).length }
// 영역(area_code)별 분해와 뒤집힌 글 id — 원인 추적용(이유 문장·원문은 저장하지 않는다).
const areaOf = (r) => (projects.get(r.project_id)?.area_code ?? '?')
const by_area = {}
for (const r of both(a1, b)) { const k = areaOf(r); const o = (by_area[k] ??= { n: 0, v22_vs_v23: 0, v22_vs_v22: 0, rel_to_irr: 0, irr_to_rel: 0, rule10_in_v23_reason: 0 }); o.n++
  const x = a1.get(r.input_id), y = b.get(r.input_id), z = a2.get(r.input_id)
  if (x.verdict !== y.verdict) { o.v22_vs_v23++; if (x.verdict === 'relevant' && y.verdict === 'irrelevant') o.rel_to_irr++; if (x.verdict === 'irrelevant' && y.verdict === 'relevant') o.irr_to_rel++; if (/영역 밖/.test(y.why)) o.rule10_in_v23_reason++ }
  if (z && x.verdict !== z.verdict) o.v22_vs_v22++ }
const flips = both(a1, b).filter((r) => a1.get(r.input_id).verdict !== b.get(r.input_id).verdict).map((r) => ({ input_id: r.input_id, area: areaOf(r), v22: a1.get(r.input_id).verdict, v23: b.get(r.input_id).verdict, out_of_area_v23: /영역 밖/.test(b.get(r.input_id).why) }))
const rep = { by_area, flips, n: sample.length, noise, change_vs_run1: change, change_vs_run2: change2, rule_attribution: rule, margin_pp: 3, failed_batches: failedBatches, status: failedBatches > 0 ? 'unverified' : 'ok', criteria: CRIT, pass: failedBatches === 0 && change.pct != null && noise.pct != null && change.pct <= noise.pct + 3 && change2.pct <= noise.pct + 3 }
mkdirSync('reports/2026-10-27', { recursive: true }); writeFileSync(OUT, JSON.stringify(rep, null, 1)); console.log(JSON.stringify(rep, null, 1))
if (failedBatches > 0) { console.error(`✗ 확인 불가: 실패 배치 ${failedBatches}건 — 합격·불합격을 말하지 않는다`); process.exit(2) }
