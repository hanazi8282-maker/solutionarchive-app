#!/usr/bin/env node
// shadow-rejudge-v71c.mjs 가 쓴 JSON 을 읽어 비교표를 낸다(읽기 전용, DB 없음).
//   node scripts/shadow-rejudge-report-v71c.mjs reports/2026-10-14/shadow-rejudge-v71c-post.json
import fs from 'node:fs'
import { wilson } from './shadow-rejudge-v71c.mjs'

const pct = (k, n) => (n ? `${((100 * k) / n).toFixed(1)}%` : '-')
const ci = (k, n) => { const [a, b] = wilson(k, n); return a == null ? '-' : `[${(100 * a).toFixed(1)}–${(100 * b).toFixed(1)}%]` }

export function summarize(rows) {
  const judged = rows.filter((r) => r.new_first != null)
  const both = judged.filter((r) => r.new_second != null)
  const rel = judged.filter((r) => r.new_first === 'relevant')
  const relInfo = rel.filter((r) => r.new_first_info === true)
  const full = both.filter((r) => r.new_first === 'relevant' && r.new_first_info === true && r.new_second === 'relevant' && r.new_second_info === true)
  const outReason = judged.filter((r) => (r.new_first_reason ?? '').startsWith('영역 밖'))
  return { n: rows.length, judged: judged.length, second: both.length, rel: rel.length, relInfo: relInfo.length, full: full.length, irrelevant: judged.filter((r) => r.new_first === 'irrelevant').length, unknown: judged.filter((r) => r.new_first === 'unknown').length, outReason: outReason.length, nonSaas: judged.filter((r) => (r.business_model ?? '').toUpperCase() !== 'SAAS').length }
}

function by(rows, key) {
  const m = new Map()
  for (const r of rows) { const k = r[key] ?? 'null'; if (!m.has(k)) m.set(k, []); m.get(k).push(r) }
  return [...m].map(([k, v]) => ({ k, ...summarize(v) })).sort((a, b) => b.n - a.n)
}

if (process.argv[1] && process.argv[1].endsWith('shadow-rejudge-report-v71c.mjs')) {
  const f = process.argv[2]
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  const s = summarize(j.rows)
  const L = []
  L.push(`# ${f}`, `시드 ${j.seed} · 기준 ${j.criteria} · 모집단 ${j.population} · 표본 ${s.n} · 1차 판정 도착 ${s.judged} · 2차 도착 ${s.second} · 소요 ${j.elapsed_s}s · 오류 ${JSON.stringify(j.stats)}`)
  L.push(`옛 1차는 전부 relevant 였다.`)
  L.push(`새 1차: relevant ${s.rel} (${pct(s.rel, s.judged)} ${ci(s.rel, s.judged)}) · irrelevant ${s.irrelevant} (${pct(s.irrelevant, s.judged)} ${ci(s.irrelevant, s.judged)}) · unknown ${s.unknown} (${pct(s.unknown, s.judged)})`)
  L.push(`새 1차 relevant ∧ 정보있음: ${s.relInfo} (${pct(s.relInfo, s.judged)} ${ci(s.relInfo, s.judged)})`)
  L.push(`새 1차·2차 완전 동의(자동 승인 후보): ${s.full} / 2차 도착 ${s.second} (${pct(s.full, s.second)} ${ci(s.full, s.second)})`)
  L.push(`"영역 밖:" 사유 irrelevant: ${s.outReason} (${pct(s.outReason, s.judged)}) · 비-SaaS 프로젝트 행 ${s.nonSaas} (${pct(s.nonSaas, s.judged)})`)
  const t = (title, g) => { L.push('', `## ${title}`, '키 | n | 새 relevant | relevant∧정보 | 완전동의/2차 | irrelevant | unknown'); for (const x of g) L.push(`${x.k} | ${x.n} | ${pct(x.rel, x.judged)} | ${pct(x.relInfo, x.judged)} | ${x.full}/${x.second} | ${pct(x.irrelevant, x.judged)} | ${pct(x.unknown, x.judged)}`) }
  t('소스별', by(j.rows, 'source'))
  t('영역별', by(j.rows, 'area'))
  console.log(L.join('\n'))
}
