#!/usr/bin/env node
// 리뷰 속 언급 앱 → 새 앱 후보 루프 dry-run(남헌 v71ad §1, D-36). 설계 reports/2026-10-17/mention-loop-design.md.
//
// DB 를 import 하지 않는다(셀프테스트가 정적으로 검사). 입력은 읽기 SQL 결과 JSON 파일 하나 — CEO-staff 가 설계 문서 §9 쿼리로 뽑아 넘긴다.
//   --input=<json>      {posts, projects, targets, discovery}. `supabase db query` 출력([{input:{…}}])도 그대로 받는다. 필수.
//   --min-posts=N       기본 통과 기준(서로 다른 글 수, 기본 3). --criterion=N|N+S 와 같은 손잡이(N+S = N글 ∧ 서로 다른 소스 S곳)
//   --pool=approved|relevant|wide (v71aj 가) 입력 글의 verdict_kind 로 거른다. 기본 wide(전부). 판정 종류 없는 옛 입력(legacy)은 늘 남는다
//   --area-verdicts=<json|jsonl> (라) HN 글 단위 영역 재판정 결과 → 글 영역을 v_input_area_effective 와 같은 우선순위로 덮는다(메모리 안)
//   --similar=<json>    (다) 같은 개발사·비슷한 앱 후보 파일(appstore-same-developer collectSameDeveloper 결과 또는 Candidate[]).
//                       이름이 같은 언급 후보에 앱 ID 를 붙여 검증 재료로 쓴다. 무인 연결 없음 — 파일로만 받는다
//   --compare=3,2+2     (나) 기준별 후보 수·오탐률 비교표. --sample-out=<csv> [--sample-n=20] 이면 기준마다 표본을 뽑아 사람 채점 시트를 쓴다
//                       (원문 조각 포함 — 리포에 커밋 금지). --sample-labels=<csv> 를 주면 오탐률을 채운다
//   --anchor-verdicts=<json> anchor-verify.mjs --out 결과(이름 검색, 정책 A 하루 100). 링크·lookup 으로 못 정한 후보만 채운다.
//                       --write 면 확인 불가 후보를 anchor-verify-input.json(상한 100)으로 낸다 — 사람이 anchor-verify.mjs 를 돌려 잇는다(무인 연결 없음)
//   --register --review=<csv>  (마) 등록 모드: CEO-staff 가 채점한 표본(≥30, 적합 ≥90%)이 통과일 때만 mention-approved.json →
//                       candidate-register-draft 로 마이그 초안+롤백을 만든다(--migrations-dir, 기본 supabase/migrations). DB 에 쓰지 않는다
//   --ledger=<json>     지난 대장(기각 재제안 방지·등록 이력). 기본 reports/mention-ledger.json — 기본 경로가 없으면 빈 대장, 지정했는데 없으면 중단
//   --dictionary=<json> (v71am §1-A) appstore-chart-dictionary.mjs 결과 — 이름이 같은 후보에 차트 앱 ID 를 붙인다(링크 ID 와 같은 자리 → --lookup 검증을 탄다, 무검증 anchored 없음)
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
  MIN_POSTS_DEFAULT, REGISTER_MIN_POSTS, aggregate, applyAreaVerdicts, compareCriteria, filterPool, mergeSimilar, parseCriterion, parseSampleLabels, pickSample, reviewGate, snippet, toGeneratorCandidates, anchorVerdictMap, anchorVerifyInput, altSeekEffect, countryOf, gateState, harvestPerApp, judge, metricsLine, planGate, renderLedgerSql, safetyAlerts, thresholdTable, toApproved, verifyCandidate,
} from '../lib/discovery/mention-loop.ts'
import { normKey, loadConfig, loadFileRegistry } from './product-name-candidates.mjs'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN, USER_AGENT } from '../lib/review/runner.ts'
import { main as registerDraft } from './candidate-register-draft.mjs'
import { appendRejects, rejectLine } from './gate-reject-log.mjs'

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
  const readAny = (p) => (/\.jsonl$/i.test(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : readJson(p))
  const input = unwrap(readJson(opt('input')))
  const crit = parseCriterion(opt('criterion') ?? opt('min-posts') ?? String(MIN_POSTS_DEFAULT))
  const minPosts = crit.minPosts
  const pool = opt('pool') ?? 'wide'
  input.posts = filterPool(input.posts, pool)
  let lifted = null
  if (opt('area-verdicts')) {
    const av = readAny(opt('area-verdicts'))
    if (!Array.isArray(av)) throw new Error('--area-verdicts 는 배열(json) 또는 jsonl')
    ;({ posts: input.posts, lifted } = applyAreaVerdicts(input.posts, av))
  }
  const register = argv.includes('--register')
  if (register && !opt('review')) throw new Error('--register 는 --review=<채점 CSV> 가 필요하다(표본 ≥30·적합 ≥90%)')
  const date = opt('date') ?? kstDate(now)
  const ledgerPath = opt('ledger') ?? DEFAULT_LEDGER
  if (opt('ledger') && !fs.existsSync(ledgerPath)) throw new Error(`대장 파일 없음: ${ledgerPath}`)
  const ledger = fs.existsSync(ledgerPath) ? readJson(ledgerPath) : { entries: {} }

  // 재제안 방지: 지난 대장 기각 + 발굴 대장(discovery_candidates) 기각
  const prior = new Map()
  for (const [k, e] of Object.entries(ledger.entries ?? {})) if (e.status === 'rejected') prior.set(k, `ledger:${e.reason}`)
  for (const d of input.discovery) if (d.verdict === 'rejected') prior.set(normKey(d.name), `discovery_candidates:${d.verdict_reason ?? 'rejected'}`)

  const agg = aggregate(input.posts, { ...input, ...fileRegistry, exclude: cfg.exclude })
  const counts = agg.counts
  let rows = agg.rows
  let similar = []
  let similarMatched = null
  if (opt('similar')) {
    const sj = readJson(opt('similar'))
    similar = Array.isArray(sj) ? sj : sj?.candidates
    if (!Array.isArray(similar)) throw new Error('--similar 는 Candidate[] 또는 {candidates:[]}')
    ;({ rows, matched: similarMatched } = mergeSimilar(rows, similar))
  }
  // 경로별 해소 건수(v71an §1-D′ 일일 지표): 링크(근거 글의 스토어 링크) · 사전(차트 피드) — 검증 전 '앱 ID 확보' 기준
  const linkKeys = new Set(rows.filter((a) => a.app_ids.length || a.play_pkgs?.length).map((a) => a.key))
  let dictKeys = new Set()
  if (opt('dictionary')) {
    const dict = readJson(opt('dictionary'))?.dictionary
    if (!dict || typeof dict !== 'object') throw new Error('--dictionary 는 appstore-chart-dictionary.mjs 결과(.dictionary)')
    rows = rows.map((a) => {
      const hit = dict[a.key]
      if (!hit) return a
      if (!linkKeys.has(a.key)) dictKeys.add(a.key)
      return { ...a, app_ids: [...new Set([...a.app_ids, ...hit.map((h) => h.id)])] }
    })
  }
  const judged = rows.map((a) => judge(a, { minPosts, minSources: crit.minSources, prior }))
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
  // 이름 검색 판정(anchor-verify.mjs 정책 A 결과 파일) — 링크·lookup 으로 못 정한 것만 채운다
  const anchorMap = opt('anchor-verdicts') ? anchorVerdictMap(readJson(opt('anchor-verdicts'))) : new Map()
  for (const [k, a] of anchorMap) if (verdicts.get(k)?.state === 'lookup_failed') verdicts.set(k, a.verdict)
  // 등록 표본 채점(마): 사람이 N 이라 한 키는 등록에서 뺀다
  const review = opt('review') ? parseSampleLabels(fs.readFileSync(opt('review'), 'utf8')) : null
  const gateReview = review ? reviewGate(review) : null
  const humanNo = new Set(gateReview?.rejected_keys ?? [])
  const anchoredFit = fit.filter((j) => verdicts.get(j.key)?.state === 'anchored' && !humanNo.has(j.key))
  // 시험 기준(2글 등)으로만 통과한 것은 등록하지 않는다 — #561 CHECK·toApproved 하한 3 과 맞춘다
  const trialOnly = anchoredFit.filter((j) => j.posts.length < REGISTER_MIN_POSTS)
  const ready = live.blocked ? [] : anchoredFit.filter((j) => j.posts.length >= REGISTER_MIN_POSTS).map((j) => ({ ...j, verdict: verdicts.get(j.key), play_pkg: j.play_pkgs?.[0] ?? null, country: anchorMap.get(j.key)?.country ?? countryOf(j) }))

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
  const liveCand = judged.filter((j) => j.stage === 'candidate' || j.stage === 'area_fit')
  const pathCounts = { link: linkKeys.size, link_play: rows.filter((a) => a.play_pkgs?.length).length, link_candidates: liveCand.filter((j) => j.app_ids.length || j.play_pkgs?.length).length, dictionary: dictKeys.size, search: [...anchorMap.keys()].length, unresolved: judged.filter((j) => (j.stage === 'candidate' || j.stage === 'area_fit') && !j.app_ids.length && !j.play_pkgs?.length && !anchorMap.has(j.key)).length }
  log(`경로별 해소(후보 기준 아님·전체 이름): 링크 ${pathCounts.link}(플레이 ${pathCounts.link_play}) · 후보 중 링크로 해소 ${pathCounts.link_candidates}/${liveCand.length} · 사전 ${pathCounts.dictionary} · Search ${pathCounts.search} · 홈페이지/Wikidata 미구현 · 후보 중 못 찾음 ${pathCounts.unresolved}`)
  log(`입력 글 ${counts.posts} · 이름 나온 글 ${counts.posts_with_mention} · 이미 등록 ${counts.registered} · 자기 이름 ${counts.self} · 지난 기각 ${prior.size} · 기준 ${minPosts}글`)
  log(`풀 ${pool} · 종류별 글(이름 나온 글) ${Object.entries(counts.by_kind).map(([k, v]) => `${k} ${v.posts}(${v.with_mention})`).join(' · ')} · 글 단위 영역으로 올린 글 ${lifted ?? '-'} · 같은 개발사 고리 일치 ${similarMatched ?? '-'} · 기준 ${crit.id} · 시험 기준 전용(등록 안 함) ${trialOnly.length}`)
  const compareIds = (opt('compare') ?? '').split(',').filter(Boolean).map(parseCriterion)
  const sampleLabels = opt('sample-labels') ? parseSampleLabels(fs.readFileSync(opt('sample-labels'), 'utf8')) : undefined
  const comparison = compareIds.length ? compareCriteria(rows, compareIds, { prior, labels: sampleLabels }) : null
  for (const c of comparison ?? []) log(`기준 비교 ${c.criterion}: 후보 ${c.candidates} · 영역 적합 ${c.area_fit} · 표본 채점 ${c.labeled} · 오탐 ${c.false_pos} · 오탐률 ${c.fp_rate ?? '채점 전'}`)
  if (opt('sample-out')) {
    const n = Number(opt('sample-n') ?? 20)
    const crits = compareIds.length ? compareIds : [crit]
    const by = new Map()
    for (const c of crits) {
      const pool2 = rows.map((a) => judge(a, { minPosts: c.minPosts, minSources: c.minSources, prior })).filter((j) => j.stage === 'candidate' || j.stage === 'area_fit')
      for (const j of pickSample(pool2, n)) (by.get(j.key) ?? by.set(j.key, { j, sf: [] }).get(j.key)).sf.push(c.id)
    }
    const postById = new Map(input.posts.map((p) => [p.id, p]))
    const cell = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const lines = [...by.values()].map(({ j, sf }) =>
      [j.key, '', sf.join('|'), cell(j.name), j.posts.length, j.sources.join('|'), j.area, j.area_fit, verdicts.get(j.key)?.state ?? '-', ...j.posts.slice(0, 3).map((id) => cell(snippet(postById.get(id)?.raw_text ?? '', j.name)))].join(','))
    fs.writeFileSync(opt('sample-out'), 'key,human_ok,sampled_for,name,posts,sources,area,area_fit,verify,context1,context2,context3\n' + lines.join('\n') + '\n')
    log(`표본 ${by.size}행 → ${opt('sample-out')} (human_ok 칸에 Y=실제 앱 이름이고 그 영역 대안 / N. 원문 조각 포함 — 커밋 금지)`)
  }
  log(`기준 조정표: ${thresholdTable(rows, stateOf).map((r) => `k${r.k} 후보 ${r.candidates}(검증 ${r.anchored}/${r.candidates - r.unverified}, 확인불가 ${r.unverified})`).join(' · ')}`)
  for (const a of alerts) log(`⚠️ ${a}`)
  for (const j of judged.filter((x) => x.stage === 'area_fit' || x.stage === 'candidate').sort((x, y) => y.score - x.score).slice(0, 20))
    log(`  - ${j.name} (${j.key}) ${j.stage} · 글 ${j.posts.length} · 소스 ${j.sources.length} · 영역 ${j.area} ${j.area_fit} · 대안탐색 ${j.alt_seek_posts} · 검증 ${verdicts.get(j.key)?.state}`)

  const out = {
    at: now.toISOString(), paths: pathCounts, mode: register ? 'register_draft' : 'dry_run', min_posts: minPosts, criterion: crit.id, pool, area_lifted: lifted, similar_matched: similarMatched, trial_only: trialOnly.map((j) => j.key), comparison, review_gate: gateReview, metrics, alerts, counts,
    threshold_table: thresholdTable(rows, stateOf), alt_seek_effect: altSeekEffect(judged, stateOf),
    gate: { blocked: plan.blocked.map((b) => ({ key: b.c.key, reason: b.reason })), headroom_after: plan.headroom_after },
    rows: judged.map((j) => ({ key: j.key, name: j.name, stage: j.stage, reason: j.reason, posts: j.posts.length, sources: j.sources, area: j.area, area_fit: j.area_fit, roles: j.roles, alt_seek_posts: j.alt_seek_posts, evidence: j.posts.slice(0, 5), verify: verdicts.get(j.key) ?? null })),
  }
  if (argv.includes('--write')) {
    const dir = path.join(opt('reports-dir') ?? 'reports', date)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'mention-loop.json'), JSON.stringify(out, null, 2) + '\n')
    const avIn = anchorVerifyInput(judged, verdicts)
    if (avIn.length) fs.writeFileSync(path.join(dir, 'anchor-verify-input.json'), JSON.stringify(avIn, null, 2) + '\n')
    if (approved.length) fs.writeFileSync(path.join(dir, 'mention-approved.json'), JSON.stringify(approved, null, 2) + '\n')
    const genInput = [...toGeneratorCandidates(plan), ...similar]
    if (genInput.length) fs.writeFileSync(path.join(dir, 'candidate-input.json'), JSON.stringify(genInput, null, 2) + '\n')
    // v71ap: 게이트가 막은 언급 후보 기록(기록만 — 게이트 불변). 집계 = scripts/gate-reject-log.mjs
    const gs = gateState(input.targets)
    appendRejects(dir, plan.blocked.map((b) => rejectLine({ at: now, source: 'appstore', candidate: b.c.key, reason: b.reason, active: gs.appstore_active, totalActive: gs.total_active, headroom: 0 })))
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
    log(`파일: ${dir}/mention-loop.json${approved.length ? ' · mention-approved.json' : ''}${genInput.length ? ' · candidate-input.json' : ''} · mention-ledger.sql · 대장 ${ledgerPath}`)
  }
  if (register) {
    log(`등록 표본 채점: ${gateReview.n}건 · 적합 ${gateReview.ok} · 비율 ${gateReview.rate ?? '-'} → ${gateReview.decision}`)
    if (gateReview.decision !== 'pass') throw new Error(`등록 모드 중단: 표본 채점 ${gateReview.decision}(≥30건·적합 ≥90% 필요) — 초안 안 만듦`)
    if (!approved.length) {
      log('등록 모드: 게이트 안 anchored 후보 0 — 초안 없음')
      return out
    }
    const dir = path.join(opt('reports-dir') ?? 'reports', date)
    fs.mkdirSync(dir, { recursive: true })
    const ap = path.join(dir, 'mention-approved.json')
    fs.writeFileSync(ap, JSON.stringify(approved, null, 2) + '\n')
    out.register_draft = registerDraft([`--approved=${ap}`, `--date=${date}`, ...(opt('migrations-dir') ? [`--out-dir=${opt('migrations-dir')}`] : [])], { log, now })
  }
  return out
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ mention-loop: ${e.message}`)
    process.exit(1)
  })
}
