#!/usr/bin/env node
// v71dy 입구 규칙 보강 비교 — 세 갈래(a 설정·개발 감점 · b 주제 관문 · c 제품명 문장 창)의 8개 조합을 라벨 행에 돌려 소스 묶음별 수치를 찍는다.
// DB·네트워크·LLM 없음(파일만 읽는다). 라벨 행은 규칙을 만들며 읽은 "학습 데이터"다 — 여기 수치는 학습 성적이다.
//   node scripts/entry-boost-compare.mjs <rows60-labeled.json> <rows6-sheet.json> <rows6-labels.json> [--baseline <er-v1.1 entry-rules.ts>] [--unlabeled <hn-approved-past.json>]
// rows60: 합친 판정(기존 가드 existing_guard ∨ 입구 규칙). rows6: 이미 승인된 HN 글이라 기존 가드는 통과한 상태 — 입구 규칙만.
// rows6-labels.json = { error: [id8…], ambiguous: [id8…] } (나머지는 좋은 글). 애매한 글은 세지 않는다.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { entryVerdict } from '../lib/analysis/entry-rules.ts'

const args = process.argv.slice(2)
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null }
const baseline = opt('--baseline'), unlabeled = opt('--unlabeled')
const [p60, p6, pLab] = args
if (!pLab) { console.error('사용법: node scripts/entry-boost-compare.mjs <rows60> <rows6-sheet> <rows6-labels> [--baseline f] [--unlabeled f]'); process.exit(2) }
const load = (p) => JSON.parse(readFileSync(p, 'utf8'))
const lab = load(pLab)
const ERR = new Set(lab.error), AMB = new Set(lab.ambiguous ?? [])
const group = (s) => (s === 'hackernews' ? 'HN' : s === 'suitecrm_community' ? 'SuiteCRM' : s === 'mautic_forum' ? 'Mautic' : 'others')
const rows = [
  ...load(p60).map((r) => ({ key: `60#${r.n}`, src: r.source, project: r.project, text: r.text, label: r.label === 'error' ? 'error' : 'good', guard: r.existing_guard != null })),
  ...load(p6).filter((r) => !AMB.has(r.id8)).map((r) => ({ key: `6#${r.n}`, src: 'hackernews', project: r.project, text: r.text, label: ERR.has(r.id8) ? 'error' : 'good', guard: false })),
]

const VARIANTS = { off: {}, a: { setupPenalty: true }, b: { topicGate: true }, c: { nameWindow: true }, 'a+b': { setupPenalty: true, topicGate: true }, 'a+c': { setupPenalty: true, nameWindow: true }, 'b+c': { topicGate: true, nameWindow: true }, 'a+b+c': { setupPenalty: true, topicGate: true, nameWindow: true } }
const G = ['HN', 'SuiteCRM', 'Mautic', 'others', 'total']
const cell = (s) => `${s.eb}/${s.e - s.eb}/${s.gb}(${s.g ? Math.round((s.gb / s.g) * 100) : 0}%)`
console.log(`# 보강 비교 — 라벨 ${rows.length}행(애매 ${AMB.size} 제외) · 칸 = 오류 막음/놓친 오류/좋은 글 잘못 막음(손실)\n`)
console.log(`| 변형 | ${G.join(' | ')} |`)
console.log(`|---|${G.map(() => '---').join('|')}|`)
const diffs = {}
for (const [name, B] of Object.entries(VARIANTS)) {
  const s = Object.fromEntries(G.map((g) => [g, { e: 0, eb: 0, g: 0, gb: 0 }]))
  diffs[name] = []
  for (const r of rows) {
    const v = entryVerdict(r.text, r.src, r.project, B)
    const blocked = !v.pass || r.guard
    for (const k of [group(r.src), 'total']) { if (r.label === 'error') { s[k].e++; if (blocked) s[k].eb++ } else { s[k].g++; if (blocked) s[k].gb++ } }
    const off = entryVerdict(r.text, r.src, r.project)
    if (name !== 'off' && (!off.pass || r.guard) !== blocked) diffs[name].push(`${r.key}[${r.label}] ${blocked ? 'now BLOCK' : 'now PASS'} s=${v.score} ${v.reasons.slice(0, 3).join(' · ')}`)
  }
  console.log(`| ${name} | ${G.map((g) => cell(s[g])).join(' | ')} |`)
}
console.log('\n## off 대비 바뀐 행')
for (const [k, d] of Object.entries(diffs)) if (d.length) console.log(`- ${k}:\n    ${d.join('\n    ')}`)

if (baseline) {
  const E1 = await import(pathToFileURL(baseline).href)
  const extra = unlabeled ? load(unlabeled).map((r) => ({ src: 'hackernews', project: r.project, text: r.text })) : []
  let same = 0, diff = 0
  for (const r of [...rows, ...extra]) { JSON.stringify(E1.entryVerdict(r.text, r.src, r.project)) === JSON.stringify(entryVerdict(r.text, r.src, r.project)) ? same++ : diff++ }
  console.log(`\n## 꺼짐 = er-v1.1 동일성(${baseline}): 같음 ${same} · 다름 ${diff}`)
  if (diff) process.exitCode = 1
}

if (unlabeled) {
  const u = load(unlabeled).filter((r) => r.human_graded !== true)
  console.log(`\n## 라벨 없는 HN 승인 글 ${u.length}행 — 변형별 막힘(정답 없음; 손실 상한 확인용)`)
  for (const [name, B] of Object.entries(VARIANTS)) {
    const b = u.filter((r) => !entryVerdict(r.text, 'hackernews', r.project, B).pass).length
    console.log(`- ${name}: 막힘 ${b} (${((b / u.length) * 100).toFixed(1)}%)`)
  }
}
