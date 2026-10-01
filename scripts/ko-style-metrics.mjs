#!/usr/bin/env node
// 한국어 윤문 전/후 측정 — AI 호출 0 · 네트워크 0 · DB 0. 로직은 lib/content/ko-style.ts 하나(산식 두 벌 금지).
//   node scripts/ko-style-metrics.mjs --before 전.txt --after 후.txt
//   node scripts/ko-style-metrics.mjs --pairs pairs.json        # [{ "id": "...", "before": "...", "after": "..." }]
//
// 출력: JSON 은 stdout, 사람이 읽는 요약은 stderr (`> out.json` 으로 JSON 만 받는다).
// 종료 코드: 0 = 전부 게이트 통과 / 1 = 실패한 쌍이 있음(음성) / 2 = 확인 불가(입력 오류·계산 못 한 검사). 1 과 2 를 나눈다.
import { readFileSync } from 'node:fs'
import { compare, gate } from '../lib/content/ko-style.ts'

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const die = (msg) => { console.error(`확인 불가: ${msg}`); process.exit(2) }

let pairs
try {
  if (arg('--pairs')) {
    pairs = JSON.parse(readFileSync(arg('--pairs'), 'utf8'))
    if (!Array.isArray(pairs)) die('--pairs 파일이 JSON 배열이 아니다')
  } else if (arg('--before') && arg('--after')) {
    pairs = [{ id: 'input', before: readFileSync(arg('--before'), 'utf8'), after: readFileSync(arg('--after'), 'utf8') }]
  } else die('사용법: --before 파일 --after 파일 | --pairs 파일.json')
} catch (e) { die(e.message) }

const results = pairs.map((p, i) => {
  const id = p?.id ?? `#${i}`
  const g = gate(p?.before, p?.after)
  const m = typeof p?.before === 'string' && typeof p?.after === 'string' ? compare(p.before, p.after) : null
  return { id, gate: g, metrics: m }
})

const DELTA_LABEL = {
  commasPerSentence: '문장당 쉼표', commaSentenceRatio: '쉼표 문장 비율', lengthMean: '문장 길이 평균', lengthStd: '문장 길이 표준편차',
  openingConjRatio: '문두 접속사 비율', plainRuns: '같은 어미 연속', patternsA: 'A 번역투', patternsB: 'B 구조', patternsC: 'C 상투구', patternsE: 'E 서식',
  patternsTotal: '패턴 합계', ireohan: '이러한', triads: '3개 나열', emDash: 'em-dash', arrows: '화살표', emoji: '이모지', bold: '굵은 글씨',
}
for (const r of results) {
  const state = r.gate.passed ? (r.gate.warn ? '통과(경고)' : '통과') : r.gate.checks.some((c) => c.status === 'fail') ? '실패' : '확인 불가'
  console.error(`\n[${r.id}] 게이트 ${state}`)
  for (const s of r.gate.reasons) console.error(`  - ${s}`)
  if (r.metrics) {
    const { before: b, after: a, delta } = r.metrics
    const val = (k) => (k.startsWith('patterns') ? (k === 'patternsTotal' ? [b.patterns.total, a.patterns.total] : [b.patterns[k.slice(-1)].total, a.patterns[k.slice(-1)].total]) : [b[k], a[k]])
    for (const [k, label] of Object.entries(DELTA_LABEL)) { const [x, y] = val(k); console.error(`  · ${label}: ${x} → ${y} (${delta[k] > 0 ? '+' : ''}${delta[k]})`) }
  }
}
process.stdout.write(JSON.stringify(results, null, 2) + '\n')
const anyFail = results.some((r) => r.gate.checks.some((c) => c.status === 'fail'))
const anyUnknown = results.some((r) => r.gate.checks.some((c) => c.status === 'unknown'))
process.exitCode = anyFail ? 1 : anyUnknown ? 2 : 0
