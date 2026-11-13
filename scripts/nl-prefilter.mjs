#!/usr/bin/env node
// 뉴스레터 아카이브 케이스 추출 1단계: 사전 필터 (싸게).
// "회사 이름 + 수치/결정/실패 단서"가 있는 글만 남겨 Haiku 추출 대상을 줄인다.
// 사용: node scripts/nl-prefilter.mjs --source saastr|trendsvc|lenny|saasplaybook
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const GROUND = path.join(os.homedir(), 'sa-private', 'ground', 'newsletters')
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const SOURCE = arg('source')
if (!SOURCE) { console.error('--source saastr|trendsvc|lenny|saasplaybook 필요'); process.exit(64) }

const NUMERIC = /\$[\d,.]+\s?(?:[MBK]|million|billion|thousand)?\b|\d{1,3}%|\bMRR\b|\bARR\b|\d+x\s+growth/i
const SIGNAL = /\b(raised|acquired|acquihire|shut\s?down|shutting down|pivot(?:ed)?|bankrupt|laid off|layoffs|IPO|exit(?:ed)?|sold|failed|failure|churn|went out of business|closed down|funding round|seed round|Series [A-Z]|valuation|revenue|profitable|unprofitable)\b/i

async function listMd(dir) {
  const out = []
  let years
  try { years = await readdir(dir) } catch { return out }
  for (const y of years) {
    const yd = path.join(dir, y)
    let files
    try { files = await readdir(yd) } catch { continue }
    for (const f of files) if (f.endsWith('.md')) out.push(path.join(yd, f))
  }
  return out
}

const files = await listMd(path.join(GROUND, SOURCE))
let kept = 0, skipped = 0
const keptList = []
for (const f of files) {
  const text = await readFile(f, 'utf8')
  const head = text.slice(0, 2000) // 제목+본문 앞부분만 (싸게)
  if (NUMERIC.test(head) && SIGNAL.test(head)) { kept++; keptList.push(f) } else skipped++
}

const outFile = path.join(GROUND, `${SOURCE}-prefilter-pass.txt`)
await writeFile(outFile, keptList.join('\n') + '\n', 'utf8')
console.log(`[prefilter:${SOURCE}] 전체 ${files.length} 통과 ${kept} 탈락 ${skipped} 통과율 ${(100 * kept / files.length).toFixed(1)}%`)
console.log(`[prefilter:${SOURCE}] 통과 목록 -> ${outFile}`)
