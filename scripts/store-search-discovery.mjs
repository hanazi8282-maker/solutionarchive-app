#!/usr/bin/env node
// 자율 발굴 C-1 ②④(남헌 v56 §C-1 · v61) — 검색 기반 신규 제품 발견 제안 + 영역별 키워드·국가·정렬 조합.
//
// 하는 일: 영역마다 (스토어 × 언어 × 키워드 × 국가 × 정렬) 조합을 만들고(lib/discovery/store-search.ts combos),
//   오늘 몫을 영역별 하루 N 개(config/product-name-discovery.json approval.daily_cap_per_area — 승인 모드 상한과 같은 값)만 고른다.
//   스토어마다 게이트(review_sources 의 enabled·tos_status + 그 검색 경로의 robots 실측)를 돌려 'collect'|'suggest' 를 정한다.
//
// 요청: robots.txt GET 만(스토어당 1회, 쿼리까지 넣어 판정 — robotsFor).검색 페이지·API 는 **어느 경우에도 요청하지 않는다** —
//   2026-10-12 네 스토어 모두 검색 경로가 robots 금지라 수집기를 만들지 않았다. 게이트가 collect 를 내면 'collect_ready(수집기 없음)'
//   로 보고만 한다(조용히 넘어가지 않는다).
// DB: --from-db 일 때 review_sources SELECT 만. 쓰기 경로 없음(셀프테스트가 정적으로 검사).
//
//   node scripts/store-search-discovery.mjs [--sources=<json>|--from-db] [--date=YYYY-MM-DD] [--no-network] [--write] [--reports-dir=reports]
//   기본 = 드라이런(콘솔만). --write = reports/<date>/store-search-proposals.md 를 쓴다(덮어쓰기).
// 종료 코드: 0 · 1(입력 실패)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { combos, dailyPick, proposalMarkdown, storeGate, storeSearchLine } from '../lib/discovery/store-search.ts'
import { looksLikeMarkup, parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN } from '../lib/review/runner.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
export const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)

/**
 * 검색 URL 하나의 robots 판정 — **쿼리까지 넣어** 본다. 러너 RobotsCache 는 pathname 만 본다(SP-026)라
 * shopify `Disallow: *q=*` 같은 쿼리 규칙을 놓친다 — 검색 경로는 쿼리가 본체라 여기서는 쓰지 않는다.
 * 못 읽음(비200·마크업·다른 origin 으로 리다이렉트)은 'unverified'(§7.1).
 */
export async function robotsFor(url, fetchText) {
  const u = new URL(url)
  const res = await fetchText(`${u.origin}/robots.txt`)
  if (res.status !== 200 || looksLikeMarkup(res.body)) return 'unverified'
  if (res.finalUrl && new URL(res.finalUrl).origin !== u.origin) return 'unverified'
  return robotsVerdict(parseRobots(res.body), u.pathname + u.search, PRODUCT_TOKEN).state
}

/** 스토어별 robots 판정 — 그 스토어 첫 조합의 실제 검색 URL 로 묻는다. fetchText 가 없으면 전부 미확인(null). */
export async function robotsByStore(cfg, fetchText) {
  const out = {}
  const all = Object.keys(cfg.areas).flatMap((a) => combos(cfg, a))
  for (const store of Object.keys(cfg.stores).sort()) {
    const sample = all.find((c) => c.store === store)
    out[store] = fetchText && sample ? await robotsFor(sample.url, fetchText) : null
  }
  return out
}

/** 순수 계획: 조합·오늘 몫·게이트. */
export function plan({ cfg, sources, robots, date, capPerArea, areaCodes }) {
  const picks = {}
  let totalCombos = 0
  for (const area of areaCodes) {
    const all = combos(cfg, area)
    totalCombos += all.length
    picks[area] = dailyPick(all, date, capPerArea)
  }
  const gates = {}
  for (const [store, def] of Object.entries(cfg.stores)) gates[store] = storeGate(sources.find((s) => s.key === def.source_key), robots[store] ?? null)
  return { date, picks, gates, totalCombos }
}

export async function main(argv, { fetchText = null, now = new Date(), log = console.log, db = null } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const date = opt('date') ?? kstDate(now)
  const cfg = readJson(path.join(repoRoot, 'config', 'discovery-c1.json'))
  const areas = readJson(path.join(repoRoot, 'config', 'areas.json')).areas
  const areaNames = Object.fromEntries(areas.map((a) => [a.code, a.name]))
  const areaCodes = areas.filter((a) => a.kind === 'area' && a.active && cfg.areas[a.code]).map((a) => a.code)
  const capPerArea = readJson(path.join(repoRoot, 'config', 'product-name-discovery.json')).approval.daily_cap_per_area
  if (!Number.isInteger(capPerArea) || capPerArea < 1) throw new Error(`approval.daily_cap_per_area 읽기 실패: ${capPerArea}`)

  let sources
  if (opt('sources')) sources = readJson(opt('sources'))
  else if (argv.includes('--from-db')) {
    const sb = db ?? (await (await import('./target-supply.mjs')).openDb())
    const { data, error } = await sb.from('review_sources').select('key, enabled, tos_status, robots_status').in('key', Object.values(cfg.stores).map((s) => s.source_key))
    if (error) throw new Error(`review_sources 조회 실패: ${error.message}`)
    sources = data
  } else sources = [] // 행 없음 = 약관 기록 확인 불가 → 전부 suggest(§7.1)
  if (!Array.isArray(sources)) throw new Error('--sources 는 배열 JSON 이어야 한다')

  const net = argv.includes('--no-network') ? null : (fetchText ?? (await import('./window-probe.mjs')).realFetch)
  const robots = await robotsByStore(cfg, net)
  const r = plan({ cfg, sources, robots, date, capPerArea, areaCodes })
  const line = storeSearchLine(r)
  const ready = Object.entries(r.gates).filter(([, g]) => g.mode === 'collect').map(([s]) => s)
  log(line)
  if (ready.length) log(`⚠️ collect_ready(수집기 없음): ${ready.join(', ')} — 게이트는 열렸지만 이 스크립트는 검색을 요청하지 않는다. 수집기는 별건.`)
  let file = null
  if (argv.includes('--write')) {
    file = path.join(opt('reports-dir') ?? path.join(repoRoot, 'reports'), date, 'store-search-proposals.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, proposalMarkdown(r, areaNames, cfg.rule_ver))
    log(`파일: ${file}`)
  } else log('드라이런 — 파일 안 씀(--write)')
  return { ...r, line, ready, file, robots }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ store-search-discovery: ${e.message}`)
    process.exit(1)
  })
}
