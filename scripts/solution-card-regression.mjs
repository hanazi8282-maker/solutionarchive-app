#!/usr/bin/env node
// 2-7 회귀 시험 세트(v71eg-3): 실제 12곳의 카드 결과를 기준본으로 저장하고, 코드·사전·라벨이 바뀌면 같은 입력으로 다시 돌려 달라진 카드를 보여준다.
//   기준본 저장:  node --env-file=.env.local scripts/solution-card-regression.mjs --save-baseline <결과폴더>   (결과폴더 = solution-pipeline.mjs --company real12 --out 의 폴더)
//   회귀 시험:    node --env-file=.env.local scripts/solution-card-regression.mjs [--out 폴더] [--a-used N]       (모델 호출이 든다 — 12곳 약 $3~4)
//   비교만:       node scripts/solution-card-regression.mjs --compare <새결과폴더>                               (모델 호출 없음)
// 카드의 정체성 = 회사 + 근거 사례(case id). 달라진 것: 추가 · 사라짐 · 같은 사례의 제목(②) 변경 · 자동 판정 변경 · 회사 상태(카드 없음 ↔ ok) 변경.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const BASE = opt('baseline', 'reports/2026-11-25/solution-pipeline/baseline-real12.json')

export const summarize = (results) => Object.fromEntries(results.map((r) => [r.id, { status: r.status, note: r.note ?? '', cards: r.cards.filter((x) => x.card).map((x) => ({ case: x.cand.case.id, slug: x.cand.case.slug, dir: x.cand.direction, title: x.card.direction, auto: x.auto })) }]))
export function diff(base, now) {
  const out = []
  for (const id of new Set([...Object.keys(base), ...Object.keys(now)])) {
    const b = base[id], n = now[id]
    if (!b) { out.push({ company: id, change: '회사 추가', detail: `카드 ${n.cards.length}` }); continue }
    if (!n) { out.push({ company: id, change: '회사 빠짐', detail: '' }); continue }
    if (b.status !== n.status) out.push({ company: id, change: '상태 변경', detail: `${b.status} → ${n.status}${n.note ? ' (' + n.note + ')' : ''}` })
    const bm = new Map(b.cards.map((c) => [c.case, c])), nm = new Map(n.cards.map((c) => [c.case, c]))
    for (const [k, c] of nm) { const o = bm.get(k); if (!o) out.push({ company: id, change: '카드 추가', detail: `${c.slug} — ${c.title}` }); else { if (o.title !== c.title) out.push({ company: id, change: '제목 변경', detail: `${c.slug}: "${o.title}" → "${c.title}"` }); if (o.auto !== c.auto) out.push({ company: id, change: '자동 판정 변경', detail: `${c.slug}: ${o.auto} → ${c.auto}` }) } }
    for (const [k, c] of bm) if (!nm.has(k)) out.push({ company: id, change: '카드 사라짐', detail: `${c.slug} — ${c.title}` })
  }
  return out
}
const load = (dir) => summarize(JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')).results)

if (process.argv[1] && /solution-card-regression\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const sv = opt('save-baseline'), cmp = opt('compare')
  if (sv) { fs.mkdirSync(path.dirname(BASE), { recursive: true }); fs.writeFileSync(BASE, JSON.stringify({ saved_at: new Date().toISOString(), from: sv, companies: load(sv) }, null, 1)); console.log(`기준본 저장 ${BASE} (${Object.keys(load(sv)).length}곳)`); process.exit(0) }
  let dir = cmp
  if (!dir) {
    dir = opt('out', 'reports/solution-pipeline/regression-run')
    const r = spawnSync(process.execPath, ['--env-file=.env.local', 'scripts/solution-pipeline.mjs', '--company', 'real12', '--out', dir, '--a-used', opt('a-used', '0')], { stdio: 'inherit' })
    if (r.status !== 0) { console.error('파이프라인 실행 실패'); process.exit(2) }
  }
  if (!fs.existsSync(BASE)) { console.error(`기준본이 없다(${BASE}) — 먼저 --save-baseline`); process.exit(2) }
  const d = diff(JSON.parse(fs.readFileSync(BASE, 'utf8')).companies, load(dir))
  fs.writeFileSync(path.join(dir, 'regression-diff.json'), JSON.stringify(d, null, 1))
  console.log(d.length ? d.map((x) => `- ${x.company}: ${x.change} ${x.detail}`).join('\n') : '달라진 카드 없음')
  process.exit(0)
}
