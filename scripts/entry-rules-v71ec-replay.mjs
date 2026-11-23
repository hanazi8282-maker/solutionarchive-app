#!/usr/bin/env node
// v71ec 입구 규칙 보강 2차(er-v1.3) 리플레이 — 파일만 읽는다(DB·네트워크·LLM 없음). 가볍게: 한 번에 한 파일, 결과는 표준 출력.
//   node scripts/entry-rules-v71ec-replay.mjs --dir <principle-pilot/v71cx> [--baseline <er-v1.2 entry-rules.ts>] [--write]
// (i)  라벨 학습 행(rows60 + 6차 30행, 애매 제외): er-v1.2(ENTRY_BOOST_CHOSEN) · +tagMatch · +devRelease · +둘 다 — 소스 묶음별 오류 막음/놓침/좋은 글 잘못 막음
// (ii) hn-approved-past.json 의 사람 채점 안 된 행: er-v1.2 · er-v1.3 막힘/통과 개수(개수만 — 좋은 글 손실 추정 없음)
// (iii) --write: v71ec/hn-past-er13.json(전 행 er-v1.3 판정) · v71ec/sheet-past-candidates.json(seed 71153, mulberry32, id 정렬 풀 Fisher-Yates, 막힘 30 + 통과 30, 7차 후보 60 id 제외)
// 8차 표본(sheet8.json)은 라벨이 없어 진단(막힘 개수·이유)만 찍는다.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { entryVerdict, ENTRY_BOOST_CHOSEN, ENTRY_BOOST_V13 } from '../lib/analysis/entry-rules.ts'

const args = process.argv.slice(2)
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const DIR = opt('--dir'), baseline = opt('--baseline'), WRITE = args.includes('--write')
if (!DIR) { console.error('사용법: node scripts/entry-rules-v71ec-replay.mjs --dir <v71cx> [--baseline f] [--write]'); process.exit(2) }
const load = (p) => JSON.parse(readFileSync(join(DIR, p), 'utf8'))

const lab = load('v71dy/rows6-labels.json')
const ERR = new Set(lab.error), AMB = new Set(lab.ambiguous ?? [])
const rows = [
  ...load('v71dx/rows60-labeled.json').map((r) => ({ key: `60#${r.n}`, src: r.source, project: r.project, text: r.text, label: r.label === 'error' ? 'error' : 'good', guard: r.existing_guard != null })),
  ...load('v71dy/rows6-sheet.json').filter((r) => !AMB.has(r.id8)).map((r) => ({ key: `6#${r.n}`, src: 'hackernews', project: r.project, text: r.text, label: ERR.has(r.id8) ? 'error' : 'good', guard: false })),
]
const group = (s) => (s === 'hackernews' ? 'HN' : s === 'suitecrm_community' ? 'SuiteCRM' : s === 'mautic_forum' ? 'Mautic' : 'others')
const G = ['HN', 'SuiteCRM', 'Mautic', 'others', 'total']
const V = { 'er-v1.2': ENTRY_BOOST_CHOSEN, '+tagMatch': { ...ENTRY_BOOST_CHOSEN, tagMatch: true }, '+devRelease': { ...ENTRY_BOOST_CHOSEN, devRelease: true }, 'er-v1.3 (both)': ENTRY_BOOST_V13 }
const cell = (s) => `${s.eb}/${s.e - s.eb}/${s.gb}`

console.log(`# (i) 라벨 학습 행 ${rows.length}행(애매 ${AMB.size} 제외) · 칸 = 오류 막음/놓친 오류/좋은 글 잘못 막음(손실)\n`)
console.log(`| 변형 | ${G.join(' | ')} |\n|---|${G.map(() => '---').join('|')}|`)
const diffs = {}
for (const [name, B] of Object.entries(V)) {
  const s = Object.fromEntries(G.map((g) => [g, { e: 0, eb: 0, g: 0, gb: 0 }]))
  diffs[name] = []
  for (const r of rows) {
    const v = entryVerdict(r.text, r.src, r.project, B)
    const blocked = !v.pass || r.guard
    for (const k of [group(r.src), 'total']) { if (r.label === 'error') { s[k].e++; if (blocked) s[k].eb++ } else { s[k].g++; if (blocked) s[k].gb++ } }
    const base = !entryVerdict(r.text, r.src, r.project, ENTRY_BOOST_CHOSEN).pass || r.guard
    if (base !== blocked) diffs[name].push(`${r.key}[${r.label}] now ${blocked ? 'BLOCK' : 'PASS'} · ${v.reasons.filter((x) => /^(?:tag-match|dev-release)/.test(x)).join(' · ')}`)
  }
  console.log(`| ${name} | ${G.map((g) => cell(s[g])).join(' | ')} |`)
}
console.log('\n## er-v1.2 대비 바뀐 학습 행')
for (const [k, d] of Object.entries(diffs)) if (d.length) console.log(`- ${k}:\n    ${d.join('\n    ')}`)

// 8차 표본 진단(라벨 없음)
const s8 = load('v71dy/sheet8.json').rows
console.log(`\n# 8차 표본 ${s8.length}행 진단(라벨 없음 — er-v1.2 는 전부 통과로 뽑힌 표본) · er-v1.3 이 막는 행`)
const by8 = {}
for (const r of s8) {
  const v = entryVerdict(r.text, r.source, r.project, ENTRY_BOOST_V13)
  const g = group(r.source)
  by8[g] ??= { n: 0, blocked: 0, tag: 0, dev: 0 }
  by8[g].n++
  if (!v.pass) {
    by8[g].blocked++
    if (v.reasons.some((x) => x.startsWith('tag-match'))) by8[g].tag++
    if (v.reasons.some((x) => x.startsWith('dev-release'))) by8[g].dev++
    console.log(`  8#${r.n} ${g} ${r.project} · ${v.reasons.filter((x) => /^(?:tag-match|dev-release|score|passing)/.test(x)).join(' · ')}`)
  }
}
for (const [g, c] of Object.entries(by8)) console.log(`- ${g}: ${c.blocked}/${c.n} 막힘 (tagMatch ${c.tag} · devRelease ${c.dev})`)

// (ii) 사람 채점 안 된 과거 HN 승인 글
const past = load('v71dy/hn-approved-past.json').filter((r) => r.human_graded !== true)
const n12 = past.filter((r) => !entryVerdict(r.text, 'hackernews', r.project, ENTRY_BOOST_CHOSEN).pass).length
const out13 = past.map((r) => { const v = entryVerdict(r.text, 'hackernews', r.project, ENTRY_BOOST_V13); return { id: r.id, id8: r.id8, project: r.project, text: String(r.text ?? '').slice(0, 1500), verdict: v.pass ? 'pass' : 'block', score: v.score, reasons: v.reasons } })
const n13 = out13.filter((r) => r.verdict === 'block').length
console.log(`\n# (ii) 사람 채점 안 된 HN 승인 글 ${past.length}행 — 개수만(정답 없음)`)
console.log(`- er-v1.2: 막힘 ${n12} · 통과 ${past.length - n12}`)
console.log(`- er-v1.3: 막힘 ${n13} · 통과 ${past.length - n13}`)
const newly = out13.filter((r, i) => r.verdict === 'block' && entryVerdict(past[i].text, 'hackernews', past[i].project, ENTRY_BOOST_CHOSEN).pass)
const why = {}
for (const r of newly) for (const x of r.reasons) { const k = x.match(/^(tag-match: [a-z-]+|dev-release)/)?.[1]; if (k) why[k] = (why[k] ?? 0) + 1 }
console.log(`- er-v1.3 이 새로 막은 행 ${newly.length} · 이유별 ${JSON.stringify(why)}`)

// 꺼짐 동일성: 새 코드의 (보강 없음)·(ENTRY_BOOST_CHOSEN) 판정이 er-v1.2 파일과 한 글자도 같은가
if (baseline) {
  const E0 = await import(pathToFileURL(baseline).href)
  const all = [...rows.map((r) => [r.text, r.src, r.project]), ...s8.map((r) => [r.text, r.source, r.project]), ...past.map((r) => [r.text, 'hackernews', r.project])]
  let same = 0, diff = 0
  for (const [t, s, p] of all) for (const B of [undefined, ENTRY_BOOST_CHOSEN, { tagMatch: false, devRelease: false }]) {
    JSON.stringify(E0.entryVerdict(t, s, p, B)) === JSON.stringify(entryVerdict(t, s, p, B)) ? same++ : diff++
  }
  console.log(`\n## 꺼짐 = er-v1.2 동일성(${baseline}): 같음 ${same} · 다름 ${diff}`)
  if (diff) process.exitCode = 1
}

if (WRITE) {
  const rng = (s) => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
  const SEED = 71153
  const s7 = load('v71dy/sheet7-candidates.json')
  const excl = new Set([...s7.blocked, ...s7.passed].map((r) => r.id))
  const r = rng(SEED)
  const pick = (pool) => { const a = [...pool].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a.slice(0, 30) }
  const poolB = out13.filter((x) => x.verdict === 'block' && !excl.has(x.id)), poolP = out13.filter((x) => x.verdict === 'pass' && !excl.has(x.id))
  const blocked = pick(poolB), passed = pick(poolP)
  mkdirSync(join(DIR, 'v71ec'), { recursive: true })
  writeFileSync(join(DIR, 'v71ec/hn-past-er13.json'), JSON.stringify(out13, null, 1))
  writeFileSync(join(DIR, 'v71ec/sheet-past-candidates.json'), JSON.stringify({ seed: SEED, prng: 'mulberry32 (pools sorted by id, Fisher-Yates, blocked pool first then passed, front 30)', rule_version: 'er-v1.3', options: ENTRY_BOOST_V13, source_key: 'hackernews', note: 'ungraded hn-approved-past rows (human_graded!=true); excludes the 60 ids of v71dy/sheet7-candidates.json. text = first 1500 chars.', pool: { blocked: poolB.length, passed: poolP.length }, blocked, passed }, null, 1))
  const labelled = new Set([...load('v71dy/rows6-sheet.json').map((x) => x.id8), ...load('v71dy/rows5-sheet.json').map((x) => x.id8 ?? String(x.id ?? '').slice(0, 8))])
  console.log(`\n# (iii) 썼다: v71ec/hn-past-er13.json(${out13.length}행) · v71ec/sheet-past-candidates.json(막힘 ${blocked.length}/${poolB.length} · 통과 ${passed.length}/${poolP.length}) · 이미 라벨 붙은 5·6차 행과 겹침 ${[...blocked, ...passed].filter((x) => labelled.has(x.id8)).length}`)
}
