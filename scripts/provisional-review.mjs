#!/usr/bin/env node
// ⑨ 임시 등록 승격·폐기 계획. v71au. DB 쓰기 없음 — 입력 JSON 을 받아 결정과 적용/롤백 SQL 만 낸다(쓰기는 대화형·역할 세션, CLAUDE.md §10.1: 무인 루프는 analysis_projects UPDATE 불가).
//   node scripts/provisional-review.mjs --input=<json [{id,name,judged,relevant}]> [--recent=P:D] [--out-dir=reports/<KST>]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { decideProvisional, renderReviewSql } from '../lib/review/provisional-review.ts'

export function main(argv = process.argv.slice(2)) {
  const arg = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
  const input = arg('input')
  if (!input) throw new Error('--input 필요')
  const [p = 0, d = 0] = (arg('recent') ?? '0:0').split(':').map(Number)
  const res = decideProvisional(JSON.parse(fs.readFileSync(input, 'utf8')), { promoted: p, discarded: d })
  const sql = renderReviewSql(res.decisions)
  const outDir = arg('out-dir')
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'provisional-review.sql'), `-- 적용\n${sql.apply}\n`)
    fs.writeFileSync(path.join(outDir, 'provisional-review-rollback.sql'), `-- 롤백\n${sql.rollback}\n`)
  }
  console.log(`[임시→정식] 승격 ${res.counts.promote} · 폐기 ${res.counts.discard} · 대기 ${res.counts.wait}${res.stopped ? ' · 자동 정지' : ''}`)
  return { ...res, sql }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
