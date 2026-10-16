#!/usr/bin/env node
// 후보 생성기 1단계 dry-run(남헌 v71aa 1-4) — 설계 reports/2026-10-16/candidate-generator-design.md.
//
// 입력은 파일뿐이다. DB·네트워크를 import 하지 않는다(셀프테스트가 정적으로 검사). 등록·마이그 초안을 만들지 않는다.
//   --targets=<json>   review_targets 행 [{source_key, product_ref}] — 중복 판정 재료. 없으면 중단(못 읽은 것을 "중복 없음"으로 접지 않는다, §7.1)
//   --sources=<json>   review_sources 행 [{key, enabled, robots_status, tos_status, override}]. 없으면 중단
//   --candidates=<json> 갈래 ①~④ 가 낸 후보 [{generator, source_key, product_ref, label, expected_yield}] (선택)
//   --window-ledger=<json> 창문 대장(기본 reports/window-adopted.json) — pending 을 window 후보로 더한다. --no-window 로 끈다
//   --write [--date=YYYY-MM-DD] [--reports-dir=reports] → <reports-dir>/<date>/candidate-generator-dryrun.json
// 종료 코드: 0 · 1(입력 실패)

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { dailyMetrics, filterCandidates, fromWindowLedger, pickDaily } from '../lib/discovery/candidate-generator.ts'

const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)

export function main(argv, { log = console.log, now = new Date() } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const read = (p, what) => {
    if (!p) throw new Error(`--${what}=<json> 필요`)
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  const targets = read(opt('targets'), 'targets')
  const sources = read(opt('sources'), 'sources')
  if (!Array.isArray(targets) || !Array.isArray(sources)) throw new Error('--targets·--sources 는 배열이어야 한다')
  const cands = opt('candidates') ? read(opt('candidates'), 'candidates') : []
  if (!argv.includes('--no-window')) {
    const lp = opt('window-ledger') ?? 'reports/window-adopted.json'
    cands.push(...fromWindowLedger(read(lp, 'window-ledger')))
  }
  const { passed, rejected } = filterCandidates(cands, { targets, sources })
  const picked = pickDaily(passed)
  const out = { at: now.toISOString(), mode: 'dry_run', ...dailyMetrics(cands, passed, picked), rejected, picked_rows: picked.map((c) => ({ generator: c.generator, source_key: c.source_key, product_ref: c.product_ref, label: c.label, expected_yield: c.expected_yield })) }
  log(`[후보 생성기 dry-run] 후보 ${out.generated} · 적합성 통과 ${out.passed} · 오늘 몫 ${out.picked} · 등록 0 · 평균 기대 수확 ${out.avg_expected_yield ?? '확인 불가'}(모름 ${out.yield_unknown})`)
  log(`갈래 ${JSON.stringify(out.by_generator)} · 기각 ${JSON.stringify(rejected)} · 영역 ${JSON.stringify(out.by_area)}`)
  if (argv.includes('--write')) {
    const f = path.join(opt('reports-dir') ?? 'reports', opt('date') ?? kstDate(now), 'candidate-generator-dryrun.json')
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n')
    log(`파일: ${f}`)
  }
  return out
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(`❌ candidate-generator: ${e.message}`)
    process.exit(1)
  }
}
