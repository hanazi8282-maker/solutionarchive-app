#!/usr/bin/env node
// 한국어 케이스 글 전수 스캔 — AI 호출 0 · 네트워크 0 · DB 0. 지표는 lib/content/ko-style.ts metrics() 한 벌(산식 두 벌 금지).
//   node scripts/ko-style-scan.mjs --in all.json --out scan.json
//   입력: [{ key, kind, slug, brand?, bottleneck?, text }]  (리포 밖 로컬 파일. 원문은 커밋하지 않는다 — 리포는 공개다)
//   출력: --out 에 글별 지표 JSON(원문 미포함), stdout 에 요약. 원문 인용은 40자 이내로만 찍는다.
//
// 판정 두 층(따로 센다):
//   [기계적] 조사 앞 공백(PARTICLE_SPACE_RE) · 화살표 · em-dash · 이모지 · 굵은 글씨 중 하나라도 ≥1
//   [문체]   패턴 A+B+C ≥1 · 같은 어미 연속 ≥1 · '이러한' ≥2 · 3개 나열 ≥1 중 하나라도
// 점수 = A+B+C+E 패턴 합(E 에 화살표·em-dash·이모지·굵은 글씨·병기 반복 포함) + 같은 어미 연속 건수 + max(0, 이러한−1) + 조사 앞 공백 건수. 가중치는 전부 1.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { metrics, PATTERNS } from '../lib/content/ko-style.ts'
import { particleSpaceCount } from '../lib/content/ko-normalize.ts'

export function scanOne(row) {
  const m = metrics(row.text)
  const runs = m.plainRuns + m.politeRuns
  const particleSpace = particleSpaceCount(row.text)
  const mech = { particleSpace, arrows: m.arrows, emDash: m.emDash, emoji: m.emoji, bold: m.bold }
  const abc = m.patterns.A.total + m.patterns.B.total + m.patterns.C.total
  const mechanical = Object.values(mech).some((v) => v > 0)
  const stylistic = abc >= 1 || runs >= 1 || m.ireohan >= 2 || m.triads >= 1
  const breakdown = { A: m.patterns.A.total, B: m.patterns.B.total, C: m.patterns.C.total, E: m.patterns.E.total, runs, ireohanExcess: Math.max(0, m.ireohan - 1), particleSpace }
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
  const byId = { ...m.patterns.A.byId, ...m.patterns.B.byId, ...m.patterns.C.byId, ...m.patterns.E.byId }
  return {
    key: row.key, kind: row.kind, slug: row.slug,
    metrics: { sentences: m.sentences, commasPerSentence: m.commasPerSentence, commaSentenceRatio: m.commaSentenceRatio, lengthMean: m.lengthMean, lengthStd: m.lengthStd, openingConjCount: m.openingConjCount, runs, maxRun: m.maxRun, ireohan: m.ireohan, triads: m.triads, groups: { A: breakdown.A, B: breakdown.B, C: breakdown.C, E: breakdown.E }, byId, ...mech },
    mechanical, stylistic, score, breakdown,
  }
}

// 분포 요약: 해당 글 수(>0)·비율·평균·최댓값·상위 5
const r3 = (n) => Math.round(n * 1000) / 1000
function dist(rows, get) {
  const v = rows.map((r) => ({ key: r.key, x: get(r) }))
  const hit = v.filter((e) => e.x > 0)
  return { docs: hit.length, pct: r3((hit.length / rows.length) * 100), mean: r3(v.reduce((a, e) => a + e.x, 0) / rows.length), sum: r3(v.reduce((a, e) => a + e.x, 0)), max: Math.max(0, ...v.map((e) => e.x)), top5: [...hit].sort((a, b) => b.x - a.x).slice(0, 5).map((e) => `${e.key}=${e.x}`) }
}
export function summarize(rows) {
  const M = (k) => (r) => r.metrics[k]
  const metricsDist = {
    'A 번역투(합)': (r) => r.metrics.groups.A, 'B 구조(합)': (r) => r.metrics.groups.B, 'C 상투구(합)': (r) => r.metrics.groups.C, 'E 서식(합)': (r) => r.metrics.groups.E,
    '쉼표/문장': M('commasPerSentence'), '쉼표 문장 비율': M('commaSentenceRatio'), '문장 길이 평균': M('lengthMean'), '문장 길이 표준편차': M('lengthStd'),
    '문두 접속사': M('openingConjCount'), '같은 어미 연속(건)': M('runs'), '이러한': M('ireohan'), '3개 나열': M('triads'),
    'em-dash': M('emDash'), '화살표': M('arrows'), '이모지': M('emoji'), '굵은 글씨': M('bold'), '조사 앞 공백': M('particleSpace'),
  }
  const out = { n: rows.length, metrics: {}, patternIds: {} }
  for (const [k, f] of Object.entries(metricsDist)) out.metrics[k] = dist(rows, f)
  for (const p of PATTERNS) out.patternIds[p.id] = dist(rows, (r) => r.metrics.byId[p.id] ?? 0)
  const mech = rows.filter((r) => r.mechanical).length
  const style = rows.filter((r) => r.stylistic).length
  const either = rows.filter((r) => r.mechanical || r.stylistic).length
  const both = rows.filter((r) => r.mechanical && r.stylistic).length
  const pct = (k) => r3((k / rows.length) * 100)
  out.layers = { mechanical: { docs: mech, pct: pct(mech) }, stylistic: { docs: style, pct: pct(style) }, union: { docs: either, pct: pct(either) }, intersection: { docs: both, pct: pct(both) } }
  out.byKind = {}
  for (const k of [...new Set(rows.map((r) => r.kind))]) {
    const rs = rows.filter((r) => r.kind === k)
    out.byKind[k] = { n: rs.length, mechanical: rs.filter((r) => r.mechanical).length, stylistic: rs.filter((r) => r.stylistic).length }
  }
  return out
}

export function printSummary(sum, rows, texts, say = (s) => process.stdout.write(`${s}\n`)) {
  say(`\n== 전수 스캔 ${sum.n}개 ==`)
  say('점수 = A+B+C+E 패턴 합(E=화살표·em-dash·이모지·굵은 글씨·병기 반복) + 같은 어미 연속 건수 + max(0, 이러한−1) + 조사 앞 공백. 가중치 전부 1')
  say('\n(1) 지표 분포 — 해당 글 수(>0) · 비율 · 평균 · 합 · 최댓값 · 상위 5')
  for (const [k, d] of Object.entries(sum.metrics)) say(`- ${k}: ${d.docs}개(${d.pct}%) · 평균 ${d.mean} · 합 ${d.sum} · 최대 ${d.max} · ${d.top5.join(', ') || '-'}`)
  say('  패턴 id별(0건 제외):')
  for (const [k, d] of Object.entries(sum.patternIds)) if (d.docs) say(`  - ${k}: ${d.docs}개(${d.pct}%) · 합 ${d.sum} · 최대 ${d.max} · ${d.top5.join(', ')}`)
  say(`  패턴 id 0건: ${Object.entries(sum.patternIds).filter(([, d]) => !d.docs).map(([k]) => k).join(', ')}`)
  const L = sum.layers
  say('\n(2) 고칠 게 있음 — 두 층')
  say(`- [기계적] ${L.mechanical.docs}개 (${L.mechanical.pct}%)`)
  say(`- [문체] ${L.stylistic.docs}개 (${L.stylistic.pct}%)`)
  say(`- 합집합 ${L.union.docs}개 (${L.union.pct}%) · 교집합 ${L.intersection.docs}개 (${L.intersection.pct}%)`)
  for (const [k, v] of Object.entries(sum.byKind)) say(`  - ${k}: ${v.n}개 중 기계적 ${v.mechanical} · 문체 ${v.stylistic}`)
  say('\n(3) 점수 상위 20')
  const top = [...rows].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 20)
  for (const r of top) {
    const b = r.breakdown
    const parts = Object.entries(b).filter(([, v]) => v > 0).map(([k, v]) => `${k}${v}`).join(' ')
    const ids = Object.entries(r.metrics.byId).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(',')
    say(`- ${r.score}점 ${r.key} [${r.kind}] ${r.slug} | ${parts} | ${ids} | "${(texts.get(r.key) ?? '').replace(/\s+/g, ' ').slice(0, 40)}…"`)
  }
}

export function load(path) {
  const rows = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(rows) || rows.some((r) => typeof r?.text !== 'string' || !r.key)) throw new Error('입력은 [{key, text, ...}] 배열이어야 한다')
  return rows
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
  if (!arg('--in') || !arg('--out')) { console.error('사용법: --in all.json --out scan.json'); process.exit(2) }
  let input
  try { input = load(arg('--in')) } catch (e) { console.error(`확인 불가: ${e.message}`); process.exit(2) }
  const rows = input.map(scanOne)
  const summary = summarize(rows)
  writeFileSync(arg('--out'), JSON.stringify({ summary, rows }, null, 2))
  printSummary(summary, rows, new Map(input.map((r) => [r.key, r.text])))
  process.stdout.write(`\nJSON → ${arg('--out')}\n`)
}
