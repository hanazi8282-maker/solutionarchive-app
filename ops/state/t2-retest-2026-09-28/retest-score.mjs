import fs from 'node:fs'
import path from 'node:path'
const REPO = process.argv[2], D = process.argv[3]
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const sample = rd(path.join(D, 'sample.json'))
const oldSO = new Map(rd(path.join(REPO, 'ops/state/relevance-second-opinion-2026-09-27.json')).rows.map((r) => [r.input_id, r.verdict]))
const exp = new Map(rd(path.join(REPO, 'ops/state/relevance-export-2026-09-27.json')).rows.map((r) => [r.input_id, r]))
const f = fs.existsSync(path.join(D, 'first-result.json')) ? new Map(rd(path.join(D, 'first-result.json')).map((r) => [r.input_id, r])) : null
const s = new Map(rd(path.join(D, 'second-result.json')).rows.map((r) => [r.input_id, r]))
function agree(a, b) {
  let exact = 0, cmp = 0, cmpAgree = 0, rr = 0, ii = 0, split = 0, unk = 0
  for (const x of sample) {
    const va = a(x.input_id), vb = b(x.input_id)
    if (va === vb) exact++
    if (va === 'unknown' || vb === 'unknown') { unk++; continue }
    cmp++; if (va === vb) cmpAgree++
    if (va === 'relevant' && vb === 'relevant') rr++
    else if (va === 'irrelevant' && vb === 'irrelevant') ii++
    else split++
  }
  return { n: sample.length, exact, cmp, cmpAgree, pct: +(100 * cmpAgree / cmp).toFixed(1), exactPct: +(100 * exact / sample.length).toFixed(1), rr, ii, split, unk }
}
const cnt = (g) => sample.reduce((m, x) => ((m[g(x.input_id)] = (m[g(x.input_id)] ?? 0) + 1), m), {})
console.log('before v1(DB,all relevant) vs old v2:', agree(() => 'relevant', (id) => oldSO.get(id)), cnt((id) => oldSO.get(id)))
console.log('new second counts', cnt((id) => s.get(id)?.verdict))
if (f) {
  console.log('new first counts', cnt((id) => f.get(id)?.verdict))
  console.log('AFTER new v1 vs new v2:', agree((id) => f.get(id)?.verdict, (id) => s.get(id)?.verdict))
  console.log('new v1 vs old v2:', agree((id) => f.get(id)?.verdict, (id) => oldSO.get(id)))
  console.log('old v1 vs new v2:', agree(() => 'relevant', (id) => s.get(id)?.verdict))
  // per project
  const byP = {}
  for (const x of sample) { const k = x.pitch; byP[k] ??= { n: 0, a: 0, c: 0 }; byP[k].n++; const va = f.get(x.input_id)?.verdict, vb = s.get(x.input_id)?.verdict; if (va !== 'unknown' && vb !== 'unknown') { byP[k].c++; if (va === vb) byP[k].a++ } }
  console.log('per project', byP)
  console.log('--- disagreements')
  for (const x of sample) { const a = f.get(x.input_id), b = s.get(x.input_id); if (a?.verdict !== b?.verdict) console.log(`${x.input_id.slice(0, 8)} ${x.pitch} 1=${a?.verdict} 2=${b?.verdict} old2=${oldSO.get(x.input_id)}\n  T: ${exp.get(x.input_id).text.slice(0, 220)}\n  1: ${a?.reason}\n  2: ${b?.reason}`) }
}
