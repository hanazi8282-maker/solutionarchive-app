#!/usr/bin/env node
// v71bl B′ — v2.4 재검증(읽기 전용, DB 쓰기 0). 사전 등록: reports/2026-10-28/v24-bprime-prereg.md (결과 전 커밋).
//   --phase=judge : 새 자연 분포 표본(옛 320건과 겹치지 않음)을 v2.2 2회·v2.4 1회 판정 → 뒤집힘 목록, 채점용 파일(원문 포함, 리포 밖) 저장
//   --phase=score : Opus 블라인드 채점 결과(--grades=파일)로 (가)·(나) 판정
//   node --env-file=.env.local scripts/criteria-bprime-verify.mjs --phase=judge --grade-in=<리포 밖 경로>
//   원문·이유 문장은 리포에 저장하지 않는다(id·판정 값만).
import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const PHASE = arg('phase', 'judge'); const N = Number(arg('n', 320)); const OUT = arg('out', 'reports/2026-10-28/v24-bprime-verify.json')
const SEED = 'v71bl-verify'; const OLD_SEED = 'v71bj-verify'; const PICK_SEED = 'v71bl-pick40'
if (!['judge', 'score'].includes(PHASE)) { console.error(`✗ --phase=${PHASE} 는 judge|score 가 아니다`); process.exit(2) }
const h = (seed, id) => createHash('sha1').update(seed + id).digest('hex')
const byHash = (seed) => (a, b) => (h(seed, a.input_id) < h(seed, b.input_id) ? -1 : 1)

if (PHASE === 'score') {
  const rep = JSON.parse(readFileSync(OUT, 'utf8'))
  const grades = JSON.parse(readFileSync(arg('grades'), 'utf8')) // { input_id: 'relevant' | 'irrelevant' | 'ambiguous' }
  const picked = rep.pick40
  const graded = picked.filter((id) => grades[id] === 'relevant' || grades[id] === 'irrelevant')
  const ambiguous = picked.filter((id) => grades[id] === 'ambiguous').length
  const missing = picked.filter((id) => !grades[id]).length
  const v22ok = graded.filter((id) => rep.v22a[id] === grades[id]).length
  const v24ok = graded.filter((id) => rep.v24[id] === grades[id]).length
  const okState = missing === 0 && ambiguous * 2 <= picked.length // 절반 넘게 애매면 (가)는 확인 불가
  const partA = { picked: picked.length, graded: graded.length, ambiguous, missing, v22_correct: v22ok, v24_correct: v24ok, status: okState ? 'ok' : 'unverified', pass: okState && v24ok >= v22ok }
  const unverified = rep.failed_batches > 0 || !okState
  const pass = !unverified && partA.pass && rep.part_b.pass
  const final = { ...rep, part_a: partA, pass, status: unverified ? 'unverified' : pass ? 'pass' : 'fail' }
  writeFileSync(OUT, JSON.stringify(final, null, 1))
  console.log(JSON.stringify({ part_a: partA, part_b: rep.part_b, status: final.status }, null, 1))
  process.exit(final.status === 'unverified' ? 2 : pass ? 0 : 1)
}

const { createClient } = await import('../lib/supabase/server.ts')
const { judgeRelevanceBatch } = await import('../lib/analysis/relevance-judge.ts')
const { loadAreasConfig, scorableAreas } = await import('../lib/analysis/areas-config.ts')
const sb = await createClient(); const { cfg, error } = loadAreasConfig(); if (!cfg) { console.error(error); process.exit(2) }
const areas = scorableAreas(cfg).map((a) => a.name)
const projects = new Map(); for (let f = 0; ; f += 1000) { const { data } = await sb.from('analysis_projects').select('id, area_code, business_model, product_elevator_pitch').range(f, f + 999); data.forEach((p) => projects.set(p.id, p)); if (data.length < 1000) break }
const inIds = [...projects.values()].filter((p) => ['1', '2', '3', '4', '5'].includes((p.area_code ?? '').trim())).map((p) => p.id)
const pool = []
for (let i = 0; i < inIds.length; i += 40) for (let f = 0; ; f += 1000) {
  const { data, error: e } = await sb.from('review_relevance_verdicts').select('input_id, project_id, verdict').in('project_id', inIds.slice(i, i + 40)).not('verdict', 'is', null).order('input_id').range(f, f + 999)
  if (e) { console.error(e); process.exit(2) } pool.push(...data); if (data.length < 1000) break
}
// 옛 표본(v71bj, 320건) 제외 — 풀이 그 뒤 늘었을 수 있어 옛 seed 순서의 앞 1.5배(480건)를 통째로 뺀다.
const oldIds = new Set([...pool].sort(byHash(OLD_SEED)).slice(0, Math.ceil(N * 1.5)).map((r) => r.input_id))
const cand = pool.filter((r) => !oldIds.has(r.input_id)).sort(byHash(SEED)).slice(0, Math.ceil(N * 1.15))
console.log(`영역 ①~⑤ 판정 풀 ${pool.length}건 · 옛 표본 제외 ${oldIds.size}건 · 후보 ${cand.length}건`)
const raw = new Map(); for (let i = 0; i < cand.length; i += 100) { const { data } = await sb.from('analysis_inputs').select('id, raw_text, purged_at').in('id', cand.slice(i, i + 100).map((r) => r.input_id)); data.forEach((x) => raw.set(x.id, x)) }
const sample = cand.filter((r) => { const x = raw.get(r.input_id); return x && !x.purged_at && (x.raw_text ?? '').trim() }).slice(0, N)
const areaOf = (r) => (projects.get(r.project_id)?.area_code ?? '?').trim()
console.log(`표본 ${sample.length}건 · 영역 분포 ${JSON.stringify(sample.reduce((m, r) => (m[areaOf(r)] = (m[areaOf(r)] ?? 0) + 1, m), {}))}`)

let failedBatches = 0 // 에러로 끝난 배치 — 0 이 아니면 '확인 불가'(§7.1)
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
      else for (const v of res.verdicts) out.set(v.input_id, v.verdict) // 실패 배치의 unknown 대체값은 담지 않는다
      break
    }
  } }))
  return out
}
const a1 = await run('v22'), a2 = await run('v22'), b = await run('v24')
const obj = (m) => Object.fromEntries(sample.filter((r) => m.has(r.input_id)).map((r) => [r.input_id, m.get(r.input_id)]))
const both = (x, y) => sample.filter((r) => x.has(r.input_id) && y.has(r.input_id))
const intended = (x, y, r) => areaOf(r) === '5' && x.get(r.input_id) === 'irrelevant' && y.get(r.input_id) === 'relevant' // 사전 등록의 '의도한 변화'
const cmp = (x, y) => {
  const s = both(x, y); const ch = s.filter((r) => x.get(r.input_id) !== y.get(r.input_id)); const un = ch.filter((r) => !intended(x, y, r)); const dir = {}
  for (const r of ch) { const k = `${x.get(r.input_id)}→${y.get(r.input_id)}`; dir[k] = (dir[k] ?? 0) + 1 }
  const pct = (n) => (s.length ? Number(((100 * n) / s.length).toFixed(1)) : null)
  return { n: s.length, changed: ch.length, pct: pct(ch.length), unwanted: un.length, unwanted_pct: pct(un.length), intended: ch.length - un.length, dir }
}
const noise = cmp(a1, a2), vs1 = cmp(a1, b), vs2 = cmp(a2, b)
const byArea = {}
for (const r of both(a1, b)) { const k = areaOf(r); const o = (byArea[k] ??= { n: 0, changed: 0, unwanted: 0, noise: 0 }); o.n++
  if (a1.get(r.input_id) !== b.get(r.input_id)) { o.changed++; if (!intended(a1, b, r)) o.unwanted++ }
  if (a2.has(r.input_id) && a1.get(r.input_id) !== a2.get(r.input_id)) o.noise++ }
const flips = both(a1, b).filter((r) => a1.get(r.input_id) !== b.get(r.input_id))
const pick40 = [...flips].sort(byHash(PICK_SEED)).slice(0, 40).map((r) => r.input_id)
const partB = { noise_pct: noise.pct, limit_pct: noise.pct == null ? null : Number((noise.pct + 3).toFixed(1)), unwanted_vs_run1_pct: vs1.unwanted_pct, unwanted_vs_run2_pct: vs2.unwanted_pct,
  pass: failedBatches === 0 && noise.pct != null && vs1.unwanted_pct <= noise.pct + 3 && vs2.unwanted_pct <= noise.pct + 3 }
const rep = { seed: SEED, n: sample.length, ids: sample.map((r) => r.input_id), failed_batches: failedBatches, noise, v24_vs_run1: vs1, v24_vs_run2: vs2, by_area: byArea, part_b: partB, flips: flips.length, pick40,
  v22a: obj(a1), v22b: obj(a2), v24: obj(b), area_of: Object.fromEntries(sample.map((r) => [r.input_id, areaOf(r)])) }
mkdirSync('reports/2026-10-28', { recursive: true }); writeFileSync(OUT, JSON.stringify(rep, null, 1))
// 채점용 파일 — 원문 포함이라 리포 밖에만 쓴다. 판정·규칙집 정보는 넣지 않는다(블라인드).
const gradeIn = arg('grade-in')
if (gradeIn) writeFileSync(gradeIn, JSON.stringify({ areas, items: pick40.map((id) => { const p = projects.get(sample.find((r) => r.input_id === id).project_id); return { input_id: id, product_pitch: p.product_elevator_pitch, text: raw.get(id).raw_text.slice(0, 1500) } }) }))
console.log(JSON.stringify({ noise: { n: noise.n, changed: noise.changed, pct: noise.pct }, v24_vs_run1: { changed: vs1.changed, unwanted: vs1.unwanted, unwanted_pct: vs1.unwanted_pct, intended: vs1.intended, dir: vs1.dir }, v24_vs_run2: { changed: vs2.changed, unwanted: vs2.unwanted, unwanted_pct: vs2.unwanted_pct, intended: vs2.intended }, by_area: byArea, part_b: partB, flips: flips.length, failed_batches: failedBatches }, null, 1))
if (failedBatches > 0) { console.error(`✗ 확인 불가: 실패 배치 ${failedBatches}건 — 합격·불합격을 말하지 않는다`); process.exit(2) }
