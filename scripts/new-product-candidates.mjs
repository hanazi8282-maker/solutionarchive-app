#!/usr/bin/env node
// 자율 발굴 ⑥ (남헌 v71au, 2026-10-19) — 공식 차트 피드에서 '아직 타깃이 없는' 제품 후보를 만든다. 후보 생성만 — 등록은 ⑧(candidate-register-draft)이 한다.
//
// 입력: ① --dictionary=<appstore-chart-dictionary.json> (scripts/appstore-chart-dictionary.mjs 가 공식 차트 피드 rss.marketingtools.apple.com 에서 만든 것)
//       ② --registered=<json [product_ref…]> (review_targets 의 appstore 행 — 읽기 SQL 로 뽑아 넘긴다. 이 스크립트는 DB 에 접근하지 않는다)
// 요청: iTunes lookup(ID 조회, D-45 허용) — 150 ID 묶음당 1요청, 간격 6초, robots(/lookup) 먼저. 403·429·빈 응답이면 그 자리에서 멈춘다(우회 없음).
//   검색 경로(/search)는 어느 경우에도 부르지 않는다. 앱 이름→ID 변환이 없다(차트 피드가 ID 를 준다).
// 걸러내기: 이미 타깃이 있는 앱 ID 제외 · 업무용 장르(Business·Productivity·Finance)만 · 평점 수 ≥ MIN_RATINGS · 영역 힌트(이름+설명이 config/discovery-c1.json 영역 씨앗 낱말을 포함).
//   영역 힌트가 없으면 area=null(hold) — 영역 ①~⑤ 밖은 등록 후보로 올리지 않고 표에만 남긴다.
// 쓰기: 파일뿐 — reports/<KST>/new-product-candidates.{json,md}. 하루 상한 DAILY_CAP(45, ⑧ 등록 상한과 같다).
//
//   node scripts/new-product-candidates.mjs --dictionary=reports/2026-10-18/appstore-chart-dictionary.json --registered=<json> [--write] [--no-network]
// 종료 코드: 0 · 1(입력 실패) · 3(차단 신호로 중단)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN, USER_AGENT } from '../lib/review/runner.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DAILY_CAP = 45
export const MIN_RATINGS = 500
export const BATCH = 150
export const GAP_MS = 6000
export const GENRES = new Set(['Business', 'Productivity', 'Finance'])
const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)

// ── 순수 ─────────────────────────────────────────────

/** product_ref 목록 → 앱 ID 집합. 'kr:123' 처럼 국가 접두가 붙은 것도, 접두 없는 것도 받는다. */
export function registeredIds(refs) {
  return new Set((Array.isArray(refs) ? refs : []).map((r) => String(r).split(':').pop()).filter((x) => /^\d+$/.test(x)))
}

/** 사전 {key: [{id,name,artist,country}]} → 아직 타깃 없는 앱 [{id,name,artist,country}] (id 중복 제거, 첫 등장 국가 유지). */
export function unregistered(dictionary, regIds) {
  const seen = new Set(), out = []
  for (const list of Object.values(dictionary ?? {})) for (const e of list) {
    if (!e?.id || regIds.has(String(e.id)) || seen.has(String(e.id))) continue
    seen.add(String(e.id)); out.push(e)
  }
  return out
}

/** 영역 씨앗 낱말(한/영)에서 이름+설명에 걸리는 첫 영역. 못 찾으면 null. areas: {code: {ko:[], en:[]}} */
export function areaHint(text, areas) {
  const t = String(text ?? '').toLowerCase()
  for (const [code, a] of Object.entries(areas)) {
    if (code === 'design') continue
    if ([...(a.en ?? []), ...(a.ko ?? [])].some((k) => k && t.includes(k.toLowerCase()))) return code
  }
  return null
}

/** lookup 결과 한 건 + 사전 항목 → 후보 행. 장르·평점 문턱을 못 넘으면 null. */
export function toCandidate(entry, r, areas) {
  if (!r || !GENRES.has(r.primaryGenreName)) return null
  const ratings = Number(r.userRatingCount ?? 0)
  if (!(ratings >= MIN_RATINGS)) return null
  return {
    name: r.trackName ?? entry.name, appstore_id: String(entry.id), appstore_country: entry.country, developer: r.sellerName ?? entry.artist ?? null,
    genre: r.primaryGenreName, rating_count: ratings, area: areaHint(`${r.trackName} ${r.description ?? ''}`.slice(0, 1500), areas), source: 'chart',
  }
}

export function pickDaily(cands, cap = DAILY_CAP) {
  const ok = cands.filter((c) => c.area).sort((a, b) => b.rating_count - a.rating_count || a.appstore_id.localeCompare(b.appstore_id))
  return { picked: ok.slice(0, cap), hold: cands.filter((c) => !c.area) }
}

// ── 네트워크 ─────────────────────────────────────────

export async function lookupBatches(entries, { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  const out = new Map()
  const rb = await fetchFn('https://itunes.apple.com/robots.txt', { headers: { 'user-agent': USER_AGENT } }).catch(() => null)
  const verdict = rb && rb.status === 200 ? robotsVerdict(parseRobots(await rb.text()), '/lookup?id=1', PRODUCT_TOKEN) : { state: 'unverified' }
  if (verdict.state !== 'allowed') return { out, requests: 0, blocked: verdict.state === 'disallowed', stopped: `robots ${verdict.state}` }
  let requests = 0
  const byCountry = {}
  for (const e of entries) (byCountry[e.country || 'us'] ??= []).push(e)
  for (const [cc, list] of Object.entries(byCountry)) {
    for (let i = 0; i < list.length; i += BATCH) {
      if (requests > 0) await sleep(GAP_MS)
      requests++
      const ids = list.slice(i, i + BATCH).map((e) => e.id).join(',')
      const r = await fetchFn(`https://itunes.apple.com/lookup?id=${ids}&country=${cc}`, { headers: { 'user-agent': USER_AGENT } }).catch(() => null)
      const body = r && r.status === 200 ? await r.text() : ''
      let j = null
      try { j = JSON.parse(body) } catch { /* 아래에서 중단 */ }
      if (!r || r.status !== 200 || !Array.isArray(j?.results) || !body.trim()) return { out, requests, blocked: true, stopped: `lookup ${r?.status ?? '요청 실패'}` }
      for (const x of j.results) out.set(String(x.trackId), x)
      log(`lookup ${cc} ${i}/${list.length}`)
    }
  }
  return { out, requests, blocked: false, stopped: null }
}

export function markdown({ date, total, looked, picked, hold, stopped }) {
  return [`# 신규 제품 후보 ${date} (⑥, new-product-candidates.mjs)`, '',
    `차트 사전 미등록 ${total} · lookup 응답 ${looked} · 업무 장르·평점 문턱 통과 ${picked.length + hold.length} → 영역 힌트 있음 ${picked.length}(상한 ${DAILY_CAP}) · 영역 없음(hold) ${hold.length}${stopped ? ` · ⚠️ 중단: ${stopped}` : ''}`, '',
    '## 후보 (평점 수 큰 순)', ...picked.map((c) => `- [영역 ${c.area}] ${c.name} — ${c.developer} · ${c.genre} · 평점 ${c.rating_count} · ${c.appstore_country}:${c.appstore_id}`), ...(picked.length ? [] : ['- 없음']), '',
    '## 영역 힌트 없음(hold — 등록 후보 아님)', ...hold.slice(0, 20).map((c) => `- ${c.name} (${c.genre}, 평점 ${c.rating_count})`), ''].join('\n')
}

function arg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : def
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const dictionary = JSON.parse(fs.readFileSync(arg('dictionary'), 'utf8')).dictionary
    const regIds = registeredIds(JSON.parse(fs.readFileSync(arg('registered'), 'utf8')))
    const areas = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/discovery-c1.json'), 'utf8')).areas
    const todo = unregistered(dictionary, regIds)
    const { out, requests, stopped, blocked } = process.argv.includes('--no-network') ? { out: new Map(), requests: 0, stopped: '--no-network', blocked: false } : await lookupBatches(todo, { log: console.log })
    const cands = todo.map((e) => toCandidate(e, out.get(String(e.id)), areas)).filter(Boolean)
    const { picked, hold } = pickDaily(cands)
    const date = kstDate()
    const md = markdown({ date, total: todo.length, looked: out.size, picked, hold, stopped })
    console.log(md)
    if (process.argv.includes('--write')) {
      const dir = path.join(repoRoot, 'reports', date)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'new-product-candidates.json'), JSON.stringify({ date, requests, picked, hold }, null, 2) + '\n')
      fs.writeFileSync(path.join(dir, 'new-product-candidates.md'), md)
    }
    process.exit(blocked ? 3 : 0)
  } catch (e) { console.error(String(e?.message ?? e)); process.exit(1) }
}
