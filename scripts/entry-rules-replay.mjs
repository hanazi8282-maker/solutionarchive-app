#!/usr/bin/env node
// 입구 규칙(v71dx) 리플레이 — 사람 라벨 60행과 라벨 없는 433행에 규칙을 돌려 소스별 수치를 찍는다. DB·네트워크·LLM 없음(파일만 읽는다).
//   node scripts/entry-rules-replay.mjs <rows60-labeled.json> [rows433-unlabeled.json]
// 라벨: pass · weak(not error) = 좋은 글(막으면 손실), error = 막아야 할 글.
// "합친 판정" = 기존 가드(existing_guard 열) 또는 입구 규칙이 막음. github_issues 는 기존 내용 가드도 막는다(approved=false).

import { readFileSync } from 'node:fs'
import { ENTRY_RULES, entryVerdict } from '../lib/analysis/entry-rules.ts'

const [labeledPath, unlabeledPath] = process.argv.slice(2)
if (!labeledPath) { console.error('사용법: node scripts/entry-rules-replay.mjs <rows60-labeled.json> [rows433-unlabeled.json]'); process.exit(2) }
const load = (p) => { const j = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(j) ? j : j.rows }

console.log(`# 입구 규칙 리플레이 — ${ENTRY_RULES.version} · 문턱 ${JSON.stringify(ENTRY_RULES.thresholds)}\n`)
const rows = load(labeledPath)
const by = new Map()
const blockedLines = []
for (const r of rows) {
  const v = entryVerdict(r.text, r.source, r.project)
  const isErr = r.label === 'error'
  const existing = r.existing_guard != null
  const blocked = !v.pass || existing
  const s = by.get(r.source) ?? { n: 0, err: 0, good: 0, errBlockedRule: 0, errBlocked: 0, goodBlocked: 0, existingKept: 0, existing: 0 }
  s.n++
  if (isErr) { s.err++; if (!v.pass) s.errBlockedRule++; if (blocked) s.errBlocked++ } else { s.good++; if (blocked) s.goodBlocked++ }
  if (existing) { s.existing++; if (blocked) s.existingKept++ }
  by.set(r.source, s)
  if (blocked) blockedLines.push(`  #${r.n} ${r.source} [${r.label}]${existing ? ` 기존가드=${r.existing_guard}` : ''} score=${v.score} — ${v.reasons.slice(0, 3).join(' · ')}`)
}
let T = { n: 0, err: 0, good: 0, errBlocked: 0, goodBlocked: 0 }
console.log('## 라벨 60행 — 소스별 (합친 판정 = 기존 가드 ∨ 입구 규칙)')
for (const [src, s] of by) {
  for (const k of Object.keys(T)) T[k] += s[k]
  const loss = s.good ? ((s.goodBlocked / s.good) * 100).toFixed(0) : '-'
  console.log(`- ${src}: ${s.n}행 · 오류 ${s.err} 중 막음 ${s.errBlocked}(규칙 단독 ${s.errBlockedRule}) · 놓친 오류 ${s.err - s.errBlocked} · 좋은 글 ${s.good} 중 잘못 막음 ${s.goodBlocked}(손실 ${loss}%)${s.existing ? ` · 기존 가드 ${s.existing}건 중 유지 ${s.existingKept}` : ''}`)
}
console.log(`- 합계: 오류 ${T.err} 중 막음 ${T.errBlocked} · 놓친 오류 ${T.err - T.errBlocked} · 좋은 글 ${T.good} 중 잘못 막음 ${T.goodBlocked}(손실 ${((T.goodBlocked / T.good) * 100).toFixed(0)}%)`)
console.log('\n## 막힌 행(n · 한 줄 사유)')
console.log(blockedLines.join('\n'))

if (unlabeledPath) {
  const u = load(unlabeledPath)
  const c = new Map()
  for (const r of u) {
    const v = entryVerdict(r.text, r.source, r.project)
    const s = c.get(r.source) ?? { n: 0, pass: 0, block: 0, existing: 0 }
    s.n++; if (r.existing_guard != null) s.existing++
    if (v.pass && r.existing_guard == null) s.pass++; else s.block++
    c.set(r.source, s)
  }
  console.log('\n## 라벨 없는 433행 — 소스별 통과/막힘(합친 판정; 정답 없음, 분포·손실 상한 확인용)')
  for (const [src, s] of c) console.log(`- ${src}: ${s.n}행 · 통과 ${s.pass} · 막힘 ${s.block}(${((s.block / s.n) * 100).toFixed(0)}%, 기존 가드 ${s.existing})`)
}
