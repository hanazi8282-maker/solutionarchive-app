#!/usr/bin/env node
// v71dx — v2.4(운영) ↔ v2.6b(후보) 재생. DB 접근 없음. 운영에 적용되지 않는다.
//   node scripts/v26b-compare.mjs <rows.json> --dry                          ← 모델 호출 0회(프롬프트 치환 검증)
//   node scripts/v26b-compare.mjs <rows.json> --run --out <result.json> --call <caller.mjs>
// v26-compare.mjs 의 runCompare 를 그대로 쓰되, v26 칸에 가는 시스템 프롬프트를 v2.6b 로 바꿔 끼운다(결과의 v26 열 = v2.6b).
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runCompare, validateRows } from './v26-compare.mjs'
import { RELEVANCE_V26B_VERSION, systemV26bFromV26 } from '../lib/analysis/relevance-criteria-v26b.ts'
import { loadAreasConfig, scorableAreas } from '../lib/analysis/areas-config.ts'

const args = process.argv.slice(2)
const inPath = args.find((a) => !a.startsWith('--'))
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
if (!inPath) { console.error('사용: node scripts/v26b-compare.mjs <rows.json> [--dry | --run --out <result.json> --call <caller.mjs>]'); process.exit(2) }
const { rows, errors } = validateRows(JSON.parse(fs.readFileSync(inPath, 'utf8')))
if (errors.length) { console.error('✗ 입력 오류\n' + errors.join('\n')); process.exit(2) }
const { cfg } = loadAreasConfig()
const areas = scorableAreas(cfg).map((a) => a.name)
if (args.includes('--dry') || !args.includes('--run')) {
  // 치환이 실제로 되는지: 가짜 call 이 받은 system 에 (24) 가 들어 있고 v24 호출에는 없어야 한다.
  const seen = { v26b: 0, v24: 0 }
  const call = async (system) => { if (system.includes('(24) 앱스토어')) seen.v26b++; else seen.v24++; return { text: '[]', model: 'dry' } }
  try { await runCompare(rows.slice(0, 1), areas, { call: wrap(call), log: () => {} }) } catch { /* 파싱 실패는 무시 — 치환 검사만 */ }
  console.log(JSON.stringify({ version: RELEVANCE_V26B_VERSION, rows: rows.length, ...seen }))
  process.exit(seen.v26b > 0 && seen.v24 > 0 ? 0 : 1)
}
function wrap(base) { return (system, user) => base(system.includes('(23) 약한 정보도 정보다') ? systemV26bFromV26(system) : system, user) }
const caller = (await import(pathToFileURL(get('--call')).href)).default
const result = await runCompare(rows, areas, { call: wrap(caller), log: (m) => console.log(m) })
fs.writeFileSync(get('--out'), JSON.stringify({ ...result, v26_column_is: RELEVANCE_V26B_VERSION }, null, 1))
console.log(JSON.stringify(result.summary), 'flipped', result.flipped.length)
