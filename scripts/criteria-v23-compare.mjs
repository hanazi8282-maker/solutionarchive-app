#!/usr/bin/env node
// v71bi §4-2 — 판정 기준 v2.2 와 v2.3 을 같은 표본에 돌려 기존 ①~⑤ 글의 판정이 달라지는 비율을 잰다(읽기 전용, DB 쓰기 0).
//   node --env-file=.env.local scripts/criteria-v23-compare.mjs [--in=60] [--cand=40]
// 표본: (A) 영역 ①~⑤ 프로젝트의 기존 판정 글 --in 건(고정 seed) · (B) 영역 밖 중 라벨이 work/design/5 인 글 --cand 건.
// 기준선: v2.2 를 한 번 더 돌려(재실행 잡음) v2.2→v2.3 변화가 잡음 이상인지 본다. 5% 초과면 적용 중단 보고.
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { judgeRelevanceBatch } from '../lib/analysis/relevance-judge.ts'
import { loadAreasConfig, scorableAreas } from '../lib/analysis/areas-config.ts'

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const NIN = arg('in', 60), NCAND = arg('cand', 40); const SEED = 'v71bi-compare'
const h = (id) => createHash('sha1').update(SEED + id).digest('hex')
const sb = await createClient()
const { cfg, error } = loadAreasConfig(); if (!cfg) { console.error(error); process.exit(2) }
const areas = scorableAreas(cfg).map((a) => a.name)
const projects = new Map(); for (let f = 0; ; f += 1000) { const { data } = await sb.from('analysis_projects').select('id, area_code, business_model, product_elevator_pitch').range(f, f + 999); data.forEach((p) => projects.set(p.id, p)); if (data.length < 1000) break }

// (A) 영역 안 — 기존 1차 판정이 있는 글. 관련/무관/unknown 이 섞이게 판정 종류별로 고르게.
const inProj = [...projects.values()].filter((p) => ['1', '2', '3', '4', '5'].includes((p.area_code ?? '').trim()))
const A = []
const { data: vs } = await sb.from('review_relevance_verdicts').select('input_id, project_id, verdict').in('project_id', inProj.map((p) => p.id).slice(0, 200)).limit(5000)
for (const kind of ['relevant', 'irrelevant', 'unknown']) A.push(...vs.filter((v) => v.verdict === kind).sort((a, b) => (h(a.input_id) < h(b.input_id) ? -1 : 1)).slice(0, Math.ceil(NIN / 3)))
// (B) 영역 밖인데 제품이 ⑤노트·⑧·⑨ 로 라벨된 글
const { data: lb } = await sb.from('review_topic_labels').select('input_id, project_id, area_guess').in('area_guess', ['work', 'design', '5']).eq('prompt_version', 'topic-v1-2026-10-26').limit(3000)
const B = (lb ?? []).sort((a, b) => (h(a.input_id) < h(b.input_id) ? -1 : 1)).slice(0, NCAND)
const rows = [...A.slice(0, NIN).map((r) => ({ ...r, grp: 'A' })), ...B.map((r) => ({ ...r, grp: 'B' }))]
const raw = new Map(); for (let i = 0; i < rows.length; i += 100) { const { data } = await sb.from('analysis_inputs').select('id, raw_text, purged_at').in('id', rows.slice(i, i + 100).map((r) => r.input_id)); data.forEach((x) => raw.set(x.id, x)) }
const sample = rows.filter((r) => { const x = raw.get(r.input_id); return x && !x.purged_at && (x.raw_text ?? '').trim() && projects.has(r.project_id) })
console.log(`표본 A ${sample.filter((r) => r.grp === 'A').length} · B ${sample.filter((r) => r.grp === 'B').length}`)

async function run(criteria) {
  const out = new Map(); const byProj = new Map(); for (const r of sample) (byProj.get(r.project_id) ?? byProj.set(r.project_id, []).get(r.project_id)).push(r)
  for (const [pid, rs] of byProj) for (let i = 0; i < rs.length; i += 20) {
    const batch = rs.slice(i, i + 20); const p = projects.get(pid)
    const res = await judgeRelevanceBatch({ product_elevator_pitch: p.product_elevator_pitch, business_model: p.business_model }, batch.map((r) => ({ input_id: r.input_id, text: raw.get(r.input_id).raw_text.slice(0, 1500) })), [], undefined, { criteria, areas })
    if (res.error) console.log(`⚠ ${criteria} 호출 문제: ${res.error.slice(0, 100)}`)
    for (const v of res.verdicts) out.set(v.input_id, v.verdict)
  }
  return out
}
const v22a = await run('v22'), v22b = await run('v22'), v23 = await run('v23')
const diff = (x, y, grp) => { const s = sample.filter((r) => r.grp === grp && x.get(r.input_id) && y.get(r.input_id)); return { n: s.length, changed: s.filter((r) => x.get(r.input_id) !== y.get(r.input_id)).length } }
const rep = { sample_n: sample.length, A_v22_vs_v22rerun: diff(v22a, v22b, 'A'), A_v22_vs_v23: diff(v22a, v23, 'A'), B_v22_vs_v22rerun: diff(v22a, v22b, 'B'), B_v22_vs_v23: diff(v22a, v23, 'B'),
  B_irrelevant_to_relevant: sample.filter((r) => r.grp === 'B' && v22a.get(r.input_id) === 'irrelevant' && v23.get(r.input_id) === 'relevant').length,
  B_v22_dist: sample.filter((r) => r.grp === 'B').reduce((m, r) => { const k = v22a.get(r.input_id) ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m }, {}),
  B_v23_dist: sample.filter((r) => r.grp === 'B').reduce((m, r) => { const k = v23.get(r.input_id) ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m }, {}) }
rep.A_flip_pct = rep.A_v22_vs_v23.n ? Number(((100 * rep.A_v22_vs_v23.changed) / rep.A_v22_vs_v23.n).toFixed(1)) : null
rep.A_noise_pct = rep.A_v22_vs_v22rerun.n ? Number(((100 * rep.A_v22_vs_v22rerun.changed) / rep.A_v22_vs_v22rerun.n).toFixed(1)) : null
mkdirSync('reports/2026-10-26', { recursive: true }); writeFileSync('reports/2026-10-26/criteria-v23-compare.json', JSON.stringify(rep, null, 1))
console.log(JSON.stringify(rep, null, 1))
