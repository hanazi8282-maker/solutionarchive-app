#!/usr/bin/env node
// 리뷰 속 언급 앱 → 새 앱 후보 루프 dry-run(남헌 v71ad §1, D-36). 설계 reports/2026-10-17/mention-loop-design.md.
//
// DB 를 import 하지 않는다(셀프테스트가 정적으로 검사). 입력은 읽기 SQL 결과 JSON 파일 하나 — CEO-staff 가 설계 문서 §9 쿼리로 뽑아 넘긴다.
//   --input=<json>      {posts, projects, targets, discovery}. `supabase db query` 출력([{input:{…}}])도 그대로 받는다. 필수.
//   --min-posts=N       기본 통과 기준(서로 다른 글 수, 기본 3)
//   --ledger=<json>     지난 대장(기각 재제안 방지·등록 이력). 기본 reports/mention-ledger.json — 기본 경로가 없으면 빈 대장, 지정했는데 없으면 중단
//   --lookups=<json>    {"<앱 ID>": iTunes results[]} — 미리 조회해 둔 결과(재현용)
//   --searched=<json>   {"<norm_key>": iTunes search results[]} — 이름 검색 결과. 검색 경로는 robots 금지라 사람 판단 뒤에만 채워진다
//   --lookup            근거 글 속 앱스토어 링크 ID 를 iTunes lookup(루트 /lookup?id=)으로 직접 조회. robots 를 먼저 읽고 '허용'일 때만,
//                       ID 당 1회·3초 간격·최대 --max-lookups(기본 30), 200 아닌 응답·빈 본문이면 그 즉시 이 경로만 중단
//   --write [--date=YYYY-MM-DD] [--reports-dir=reports]
//                       → <dir>/<date>/mention-loop.json(지표·행) · mention-approved.json(candidate-register-draft.mjs --approved 입력)
//                         · mention-ledger.sql(discovery_candidates 대장 INSERT, 마이그 20261017000020 적용 뒤 사람·세션이 실행) · 대장 파일 갱신
// 등록은 하지 않는다. 등록 = mention-approved.json → `node scripts/candidate-register-draft.mjs --approved=…` → 마이그 PR → 사람·역할 세션 적용.
// 종료 코드: 0 · 1(입력 실패)

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  MIN_POSTS_DEFAULT, aggregate, altSeekEffect, countryOf, gateState, harvestPerApp, judge, metricsLine, planGate, renderLedgerSql, safetyAlerts, thresholdTable, toApproved, verifyCandidate,
} from '../lib/discovery/mention-loop.ts'
import { normKey, loadConfig, loadFileRegistry } from './product-name-candidates.mjs'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN, USER_AGENT } from '../lib/review/runner.ts'

const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
const DEFAULT_LEDGER = 'reports/mention-ledger.json'

/** `supabase db query` 는 [{<열이름>: {...}}] 로 준다 — 한 행·한 열이면 벗긴다. */
export function unwrap(j) {
  if (Array.isArray(j) && j.length === 1 && j[0] && typeof j[0] === 'object' && Object.keys(j[0]).length === 1) j = Object.values(j[0])[0]
  if (typeof j === 'string') j = JSON.parse(j)
  for (const k of ['posts', 'projects', 'targets']) if (!Array.isArray(j?.[k])) throw new Error(`입력에 ${k} 배열이 없다 — 못 읽은 것을 0건으로 접지 않는다`)
  return { posts: j.posts, projects: j.projects, targets: j.targets, discovery: Array.isArray(j.discovery) ? j.discovery : [] }
}

/** iTunes lookup(루트 경로). robots 허용 확인 → ID 당 1회. 차단 신호면 blocked=true 로 멈춘다(우회 없음). */
export async function liveLookups(ids, { fetchFn = fetch, max = 30, gapMs = 3000, log = console.log } = {}) {
  const out = new Map()
  const rb = await fetchFn('https://itunes.apple.com/robots.txt', { headers: { 'user-agent': USER_AGENT } }).catch(() => null)
  const verdict = rb && rb.status === 200 ? robotsVerdict(parseRobots(await rb.text()), '/lookup?id=1', PRODUCT_TOKEN) : { state: 'unverified', reason: `robots.txt ${rb?.status ?? '요청 실패'}` }
  if (verdict.state !== 'allowed') {
    log(`앱 조회 안 함: robots ${verdict.state} (${verdict.reason})`)
    return { out, requests: 0, blocked: verdict.state === 'disallowed' }
  }
  let requests = 0
  for (const id of ids.slice(0, max)) {
    if (requests) await new Promise((r) => setTimeout(r, gapMs))
    requests++
    const res = await fetchFn(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=software`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20000) }).catch(() => null)
    const body = res && res.status === 200 ? await res.text() : ''
    if (!res || res.status !== 200 || !body.trim()) {
      log(`앱 조회 중단: ${res ? `HTTP ${res.status}` : '요청 실패'}${res?.status === 200 ? ' 빈 본문' : ''} (id ${id})`)
      return { out, requests, blocked: !!res && [403, 429, 200].includes(res.status) }
    }
    out.set(id, JSON.parse(body).results ?? [])
  }
  return { out, requests, blocked: false }
}

export async function main(argv, { log = console.log, now = new Date(), fetchFn = fetch, fileRegistry = loadFileRegistry(), cfg = loadConfig() } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!opt('input')) throw new Error('--input=<json> 필요 (설계 문서 §9 읽기 SQL 결과)')
  const input = unwrap(readJson(opt('input')))
  const minPosts = Number(opt('min-posts') ?? MIN_POSTS_DEFAULT)
  if (!Number.isInteger(minPosts) || minPosts < 1) throw new Error(`--min-posts 는 1 이상 정수: ${opt('min-posts')}`)
  const date = opt('date') ?? kstDate(now)
  const ledgerPath = opt('ledger') ?? DEFAULT_LEDGER
  if (opt('ledger') && !fs.existsSync(ledgerPath)) throw new Error(`대장 파일 없음: ${ledgerPath}`)
  const ledger = fs.existsSync(ledgerPath) ? readJson(ledgerPath) : { entries: {} }

  // 재제안 방지: 지난 대장 기각 + 발굴 대장(discovery_candidates) 기각
  const prior = new Map()
  for (const [k, e] of Object.entries(ledger.entries ?? {})) if (e.status === 'rejected') prior.set(k, `ledger:${e.reason}`)
  for (const d of input.discovery) if (d.verdict === 'rejected') prior.set(normKey(d.name), `discovery_candidates:${d.verdict_reason ?? 'rejected'}`)

  const { rows, counts } = aggregate(input.posts, { ...input, ...fileRegistry, exclude: cfg.exclude })
  const judged = rows.map((a) => judge(a, { minPosts, prior }))
  const fit = judged.filter((j) => j.stage === 'area_fit')

  // ⑤ 검증
  const lookups = new Map(Object.entries(opt('lookups') ? readJson(opt('lookups')) : {}))
  const searched = new Map(Object.entries(opt('searched') ? readJson(opt('searched')) : {}))
  let live = { requests: 0, blocked: false }
  if (argv.includes('--lookup')) {
    const ids = [...new Set(fit.flatMap((j) => j.app_ids))].filter((id) => !lookups.has(id))
    live = await liveLookups(ids, { fetchFn, max: Number(opt('max-lookups') ?? 30), log })
    for (const [k, v] of live.out) lookups.set(k, v)
  }
  const verdicts = new Map()
  for (const j of judged) if (j.stage === 'area_fit' || j.stage === 'candidate') verdicts.set(j.key, verifyCandidate(j, { lookups, searched }))
  const ready = live.blocked ? [] : fit.filter((j) => verdicts.get(j.key)?.state === 'anchored').map((j) => ({ ...j, verdict: verdicts.get(j.key), play_pkg: null, country: countryOf(j) }))

  // ⑦ 게이트 · ⑨ 지표
  const plan = planGate(ready, gateState(input.targets))
  const approved = toApproved(plan)
  const registeredRefs = Object.values(ledger.entries ?? {}).flatMap((e) => e.refs ?? [])
  const harvest = harvestPerApp(input.targets, registeredRefs)
  const metrics = {
    date,
    extracted: counts.extracted,
    new_names: rows.filter((a) => !prior.has(a.key) && !a.reject).length,
    candidates: judged.filter((j) => j.stage === 'candidate' || j.stage === 'area_fit').length,
    area_fit: fit.length,
    registered: plan.register.length,
    harvest_avg: harvest.avg,
    harvest_n: harvest.n,
    by_area: Object.fromEntries(['1', '2', '3', '4', '5'].map((a) => [a, fit.filter((j) => j.area === a).length])),
    gate_blocked: plan.blocked.length,
    alt_seek_posts: counts.alt_seek_posts,
    lookups: live.requests,
    lookup_blocked: live.blocked,
  }
  const alerts = safetyAlerts(metrics, ready)
  const stateOf = new Map([...verdicts].map(([k, v]) => [k, v.state]))
  log(metricsLine(metrics))
  log(`입력 글 ${counts.posts} · 이름 나온 글 ${counts.posts_with_mention} · 이미 등록 ${counts.registered} · 자기 이름 ${counts.self} · 지난 기각 ${prior.size} · 기준 ${minPosts}글`)
  log(`기준 조정표: ${thresholdTable(rows, stateOf).map((r) => `k${r.k} 후보 ${r.candidates}(검증 ${r.anchored}/${r.candidates - r.unverified}, 확인불가 ${r.unverified})`).join(' · ')}`)
  for (const a of alerts) log(`⚠️ ${a}`)
  for (const j of judged.filter((x) => x.stage === 'area_fit' || x.stage === 'candidate').sort((x, y) => y.score - x.score).slice(0, 20))
    log(`  - ${j.name} (${j.key}) ${j.stage} · 글 ${j.posts.length} · 소스 ${j.sources.length} · 영역 ${j.area} ${j.area_fit} · 대안탐색 ${j.alt_seek_posts} · 검증 ${verdicts.get(j.key)?.state}`)

  const out = {
    at: now.toISOString(), mode: 'dry_run', min_posts: minPosts, metrics, alerts, counts,
    threshold_table: thresholdTable(rows, stateOf), alt_seek_effect: altSeekEffect(judged, stateOf),
    gate: { blocked: plan.blocked.map((b) => ({ key: b.c.key, reason: b.reason })), headroom_after: plan.headroom_after },
    rows: judged.map((j) => ({ key: j.key, name: j.name, stage: j.stage, reason: j.reason, posts: j.posts.length, sources: j.sources, area: j.area, area_fit: j.area_fit, roles: j.roles, alt_seek_posts: j.alt_seek_posts, evidence: j.posts.slice(0, 5), verify: verdicts.get(j.key) ?? null })),
  }
  if (argv.includes('--write')) {
    const dir = path.join(opt('reports-dir') ?? 'reports', date)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'mention-loop.json'), JSON.stringify(out, null, 2) + '\n')
    if (approved.length) fs.writeFileSync(path.join(dir, 'mention-approved.json'), JSON.stringify(approved, null, 2) + '\n')
    fs.writeFileSync(path.join(dir, 'mention-ledger.sql'), renderLedgerSql(judged, verdicts, new Set(plan.blocked.map((b) => b.c.key)), date))
    const entries = { ...(ledger.entries ?? {}) }
    for (const j of judged) {
      const prev = entries[j.key] ?? { first_seen: date }
      const reg = plan.register.find((r) => r.c.key === j.key)
      const v = verdicts.get(j.key)
      const status = reg ? 'planned' : j.stage === 'rejected' || v?.state === 'no_match' || v?.state === 'ambiguous' ? 'rejected' : prev.status === 'planned' ? 'planned' : 'open'
      entries[j.key] = { ...prev, name: j.name, status, reason: j.reason ?? (v ? v.state : null), last_seen: date, posts: j.posts.length, refs: reg ? [`${reg.source_key}|${countryOf(j)}:${reg.c.verdict.appId}`] : prev.refs ?? [] }
    }
    fs.writeFileSync(ledgerPath, JSON.stringify({ updated: date, entries }, null, 2) + '\n')
    log(`파일: ${dir}/mention-loop.json${approved.length ? ' · mention-approved.json' : ''} · mention-ledger.sql · 대장 ${ledgerPath}`)
  }
  return out
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ mention-loop: ${e.message}`)
    process.exit(1)
  })
}
