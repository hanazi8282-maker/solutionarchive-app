#!/usr/bin/env node
// 앵커 검증 실행기(v70 L-09) — 이름 목록을 iTunes Search 로 조회해 판정한다. 읽기 전용(공개 API, 키 없음), DB 쓰기 없음.
// 사용: node scripts/anchor-verify.mjs "InVideo AI" "Fera=fera.ai" [--country=us]
//       node scripts/anchor-verify.mjs --input=list.json --out=result.json      # [{slug,name,expected_domain,country}]
//
// ⚠️ robots(v71aj 정정): itunes.apple.com/robots.txt 는 `Disallow: /search*` 다. 이 스크립트가 부르는 /search 는 robots 금지 경로다.
//    예전 주석의 "robots 대상 아님 — 공식 검색 API" 는 틀렸다(scripts/idea-competitors.mjs 8행이 맞다).
//    호출 근거는 소유자 예외 — 남헌 2026-10-17 v71aj D-43 정책 A "제한 허용"(docs/migration-exceptions.md 같은 날짜 항목).
//    Apple 이 Search API 를 공식 문서로 안내하는 것과 robots 금지가 서로 어긋난다는 걸 알고 켠 예외다.
// 정책 A 조건 — 전부 이 파일이 강제한다(셀프테스트 scripts/anchor-selftest.mjs 가 고정):
//   · 한 실행(프로세스)당 SEARCH_RUN_MAX(60). 하루 상한 SEARCH_DAILY_CAP(KST 날짜 기준, reports/<KST>/itunes-search-log.jsonl 의 n 합). 넘으면 호출 0, 'cap' 으로 멈춘다.
//   · 호출 간격 ≥ SEARCH_MIN_INTERVAL_MS(같은 프로세스 안 마지막 호출부터).
//   · UA = lib/review/runner.ts USER_AGENT(우리 서비스 식별, 위장 없음).
//   · 4xx·429·5xx·캡차(HTML/“captcha”)·빈 응답(본문 없음·JSON 아님·results 비었거나 배열 아님) 1건이면 즉시 중단 — 그 뒤 이 프로세스의 호출은 전부 거부.
//   · 모든 호출을 로그 파일에 한 줄씩 남긴다(무엇을·언제·결과).
//   경로는 /search 하나뿐이다. /lookup(ID 조회)은 D-45 로 허용됐고 appstore-same-developer.mjs --allow-lookup 이 부른다.
// 롤백 = 이 호출 경로 비활성화: SEARCH_DAILY_CAP 를 0 으로(또는 env ITUNES_SEARCH_DISABLED=1).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { USER_AGENT } from '../lib/review/runner.ts'
import { verifyAnchor } from '../lib/review/anchor.ts'

// v71am D-44(남헌 2026-10-18): 하루 상한 변수 ITUNES_SEARCH_DAILY_MAX(기본 300) · 간격 6초(분당 ≤10) · 한 실행(프로세스)당 60.
export const SEARCH_DAILY_CAP = Number(process.env.ITUNES_SEARCH_DAILY_MAX ?? 300)
export const SEARCH_MIN_INTERVAL_MS = 6000
export const SEARCH_RUN_MAX = 60
const REPORTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports')
export const kstDay = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)

/** 호출 가드. 파일 로그로 하루 사용량을 센다. 테스트는 logFile=null(메모리) 로 만든다. */
export function makeGuard({ logFile = path.join(REPORTS_DIR, kstDay(), 'itunes-search-log.jsonl'), cap = SEARCH_DAILY_CAP, runMax = SEARCH_RUN_MAX, intervalMs = SEARCH_MIN_INTERVAL_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const mem = []
  const lines = () => (logFile ? (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []) : mem)
  let last = null
  let runCalls = 0
  const g = {
    stopped: null,
    used: () => lines().reduce((s, e) => s + (e.path === '/search' ? (e.n ?? 1) : 0), 0),
    async before() {
      if (process.env.ITUNES_SEARCH_DISABLED === '1') return '비활성(ITUNES_SEARCH_DISABLED=1)'
      if (g.stopped) return `이미 중단됨: ${g.stopped}`
      if (g.used() >= cap) return `하루 상한 ${cap} 도달`
      if (runCalls >= runMax) return `한 실행 상한 ${runMax} 도달`
      runCalls++
      const wait = last === null ? 0 : last + intervalMs - now()
      if (wait > 0) await sleep(wait)
      last = now()
      return null
    },
    log(entry) {
      const e = { at: new Date().toISOString(), path: '/search', n: 1, ...entry }
      if (!logFile) return void mem.push(e)
      fs.mkdirSync(path.dirname(logFile), { recursive: true })
      fs.appendFileSync(logFile, JSON.stringify(e) + '\n')
    },
  }
  return g
}

let defaultGuard = null

/** 응답 → 중단 사유(있으면) 또는 results 배열. */
export async function readSearch(res) {
  if (res.status !== 200) return { stop: `HTTP ${res.status}` }
  const ctype = res.headers?.get?.('content-type') ?? ''
  const text = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json())
  if (!text || !text.trim()) return { stop: '빈 응답(본문 없음)' }
  if (/captcha/i.test(text) || /text\/html/i.test(ctype)) return { stop: '캡차/HTML 응답' }
  let j
  try { j = JSON.parse(text) } catch { return { stop: '빈 응답(JSON 아님)' } }
  if (!Array.isArray(j?.results)) return { stop: '빈 응답(results 없음)' }
  if (j.results.length === 0) return { stop: '빈 응답(results 0건)' }
  return { results: j.results }
}

/**
 * 이름 1개 조회·판정. 가드가 막거나 중단 신호가 나오면 lookup_failed(+stop) — no_match 로 접지 않는다(§7.1).
 * opts: { expectedDomain, descriptionDomain, guard, keepResults }
 */
export async function lookup(name, country = 'us', fetchFn = fetch, opts = {}) {
  const guard = opts.guard ?? (defaultGuard ??= makeGuard())
  const blocked = await guard.before()
  if (blocked) return { state: 'lookup_failed', reason: blocked, stop: true }
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&limit=8&country=${country}`
  let r
  try {
    r = await readSearch(await fetchFn(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20000) }))
  } catch (e) {
    r = { stop: `네트워크 오류: ${String(e?.message ?? e)}` }
  }
  if (r.stop) {
    guard.stopped = r.stop
    guard.log({ term: name, country, outcome: 'stop', reason: r.stop })
    return { state: 'lookup_failed', reason: r.stop, stop: true }
  }
  const v = verifyAnchor(name, r.results, { expectedDomain: opts.expectedDomain, descriptionDomain: opts.descriptionDomain })
  guard.log({ term: name, country, outcome: v.state, results: r.results.length })
  return opts.keepResults ? { ...v, results: r.results } : v
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const args = process.argv.slice(2)
  const country = args.find((a) => a.startsWith('--country='))?.slice(10) ?? 'us'
  const input = args.find((a) => a.startsWith('--input='))?.slice(8)
  const out = args.find((a) => a.startsWith('--out='))?.slice(6)
  const rows = input
    ? JSON.parse(fs.readFileSync(input, 'utf8'))
    : args.filter((a) => !a.startsWith('--')).map((a) => ({ name: a.split('=')[0], expected_domain: a.split('=')[1] ?? null }))
  const done = []
  for (const row of rows) {
    const v = await lookup(row.name, row.country ?? country, fetch, { expectedDomain: row.expected_domain, descriptionDomain: true, keepResults: true })
    const top = (v.results ?? []).slice(0, 3).map((a) => ({ id: a.trackId, name: a.trackName, seller: a.sellerName, seller_url: a.sellerUrl ?? null, ratings: a.userRatingCount ?? 0 }))
    delete v.results
    done.push({ ...row, verdict: v, top3_seen: top })
    console.log(`${row.name.padEnd(28)} ${v.state.padEnd(13)} ${v.reason}${v.domain ? ` · ${v.domain}` : ''}`)
    if (v.stop) {
      console.error(`⛔ 중단: ${v.reason} — 남은 ${rows.length - done.length}건은 호출하지 않는다`)
      break
    }
  }
  if (out) fs.writeFileSync(out, JSON.stringify(done, null, 1) + '\n')
  if (done.some((d) => d.verdict.stop)) process.exit(2)
}
