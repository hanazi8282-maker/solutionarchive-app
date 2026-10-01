#!/usr/bin/env node
// 케이스 글 전수 정규화(드라이런) — AI 0 · 네트워크 0 · DB 0. DB 에 쓰지 않는다. 결과는 --outdir 의 파일로만 낸다.
//   node scripts/ko-normalize-run.mjs --in all.json --outdir <폴더>
//   → <폴더>/normalized.json  [{ key, before, after, changes, manual }]   (원문 포함 — 리포 밖 폴더에만 쓴다)
//     <폴더>/scan-after.json  정규화한 글에 ko-style-scan 과 같은 스캔
// 요약(stdout): 바뀐 글·곳(규칙별) · 예시 5개(전/후 60자 이내) · manual 규모(규칙별·사유별) · 전/후 지표 · 불변 롤백 · 멱등 · 전체 gate
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeKo } from '../lib/content/ko-normalize.ts'
import { gate } from '../lib/content/ko-style.ts'
import { load, scanOne, summarize } from './ko-style-scan.mjs'

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const say = (s) => process.stdout.write(`${s}\n`)
if (!arg('--in') || !arg('--outdir')) { console.error('사용법: --in all.json --outdir 폴더'); process.exit(2) }
let input
try { input = load(arg('--in')) } catch (e) { console.error(`확인 불가: ${e.message}`); process.exit(2) }

const out = input.map((r) => {
  const opts = { knownProper: r.brand ? [r.brand] : [] }
  const n = normalizeKo(r.text, opts)
  const again = normalizeKo(n.text, opts)
  const g = n.text === r.text ? null : gate(r.text, n.text, opts)
  return { key: r.key, kind: r.kind, slug: r.slug, before: r.text, after: n.text, changes: n.changes, manual: n.manual, idempotent: again.text === n.text && again.changes.length === 0, gatePassed: g ? g.passed : true }
})
writeFileSync(path.join(arg('--outdir'), 'normalized.json'), JSON.stringify(out.map(({ key, before, after, changes, manual }) => ({ key, before, after, changes, manual })), null, 2))
const beforeRows = input.map(scanOne)
const afterRows = input.map((r, i) => scanOne({ ...r, text: out[i].after }))
const sb = summarize(beforeRows)
const sa = summarize(afterRows)
writeFileSync(path.join(arg('--outdir'), 'scan-after.json'), JSON.stringify({ summary: sa, rows: afterRows }, null, 2))

const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m }, {})
const changes = out.flatMap((o) => o.changes.map((c) => ({ ...c, key: o.key })))
const manual = out.flatMap((o) => o.manual.map((m) => ({ ...m, key: o.key })))
const rollbacks = manual.filter((m) => m.reason.startsWith('roll-back'))
say(`\n== 정규화 ${out.length}개 ==`)
say(`- 바뀐 글 ${out.filter((o) => o.after !== o.before).length}개 · 바뀐 곳 ${changes.length}곳`)
for (const [k, v] of Object.entries(count(changes, (c) => c.rule))) say(`  - ${k}: ${v}곳 (${new Set(changes.filter((c) => c.rule === k).map((c) => c.key)).size}개 글)`)
say('- 변환 예시 5개(규칙마다 고르게):')
const picks = []
for (const rule of ['particle-space', 'arrow', 'em-dash', 'bold', 'emoji']) picks.push(...changes.filter((c) => c.rule === rule).slice(0, rule === 'particle-space' ? 2 : 2))
for (const c of picks.slice(0, 5)) say(`  - [${c.rule}] "${c.before.slice(0, 60)}" → "${c.after.slice(0, 60)}"`)
say(`- manual ${manual.length}건 (${new Set(manual.map((m) => m.key)).size}개 글)`)
for (const [k, v] of Object.entries(count(manual, (m) => `${m.rule} · ${m.reason.startsWith('roll-back') ? 'roll-back' : m.reason}`)).sort((a, b) => b[1] - a[1])) say(`  - ${k}: ${v}`)
say(`- 불변 롤백 ${rollbacks.length}건`)
for (const r of rollbacks.slice(0, 5)) say(`  - [${r.rule}] ${r.key} "${r.excerpt.slice(0, 40)}" · ${r.reason.match(/\[실패 [^\]]+\]/g)?.join(' ') ?? ''}`)
say(`- 멱등(두 번 돌려도 동일): ${out.filter((o) => o.idempotent).length}/${out.length}`)
say(`- 원문↔결과 전체 gate 통과: ${out.filter((o) => o.gatePassed).length}/${out.length}`)

say('\n- 정규화 전 → 후 (평균 / 합)')
const sumOf = (rows, f) => rows.reduce((a, r) => a + f(r), 0)
const r3 = (n) => Math.round(n * 1000) / 1000
const KEYS = {
  '패턴 합계(A+B+C+E)': (r) => r.metrics.groups.A + r.metrics.groups.B + r.metrics.groups.C + r.metrics.groups.E,
  'A+B+C': (r) => r.metrics.groups.A + r.metrics.groups.B + r.metrics.groups.C,
  '쉼표/문장': (r) => r.metrics.commasPerSentence, '문장 수': (r) => r.metrics.sentences, '문장 길이 평균': (r) => r.metrics.lengthMean, '문장 길이 표준편차': (r) => r.metrics.lengthStd,
  '같은 어미 연속': (r) => r.metrics.runs, 'em-dash': (r) => r.metrics.emDash, '화살표': (r) => r.metrics.arrows, '조사 앞 공백': (r) => r.metrics.particleSpace, '점수': (r) => r.score,
}
for (const [k, f] of Object.entries(KEYS)) {
  const b = sumOf(beforeRows, f), a = sumOf(afterRows, f)
  say(`  - ${k}: 평균 ${r3(b / out.length)} → ${r3(a / out.length)} · 합 ${r3(b)} → ${r3(a)}`)
}
say(`- 고칠 게 있음: [기계적] ${sb.layers.mechanical.docs} → ${sa.layers.mechanical.docs} · [문체] ${sb.layers.stylistic.docs} → ${sa.layers.stylistic.docs} · 합집합 ${sb.layers.union.docs} → ${sa.layers.union.docs}`)
say(`\nJSON → ${path.join(arg('--outdir'), 'normalized.json')} · ${path.join(arg('--outdir'), 'scan-after.json')}`)
process.exitCode = out.every((o) => o.idempotent && o.gatePassed) ? 0 : 1
