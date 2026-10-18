#!/usr/bin/env node
// ① 새 출시 병렬 입력(v71au): Product Hunt 최근 90일 출시 → 홈페이지에서 스토어 앵커 → 후보 JSON(DB 쓰기 없음).
//   PRODUCT_HUNT_API_TOKEN 이 있어야 돈다(GitHub Actions 시크릿에만 있다 — 로컬에는 없다. 없으면 '확인 불가'로 멈춘다).
//   node scripts/new-release-candidates.mjs [--out=reports/<KST>/new-release-candidates.json] [--max=40]
// 홈페이지는 robots 가 '허용'일 때만 읽는다(못 읽으면 건너뛴다 — §7.1). 3초 간격, 403/429 한 번이면 그 실행 중단.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractStoreIds, parsePhPosts, recentLaunches } from '../lib/discovery/new-release.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN, USER_AGENT } from '../lib/review/runner.ts'

const QUERY = (after) => `{ posts(order: NEWEST, first: 50, postedAfter: "${after}") { edges { node { name tagline website votesCount createdAt topics { edges { node { name } } } } } } }`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const NONE = { appstore_id: null, play_pkg: null }

export async function main(argv = process.argv.slice(2), { fetchFn = fetch, now = new Date(), log = console.log, gapMs = 3000 } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const token = process.env.PRODUCT_HUNT_API_TOKEN
  if (!token) {
    log('[새 출시] PRODUCT_HUNT_API_TOKEN 없음 — 확인 불가(0건으로 접지 않는다)')
    return { state: 'unavailable', candidates: [] }
  }
  const max = Number(opt('max') ?? 40)
  const after = new Date(now.getTime() - 90 * 86400_000).toISOString()
  const r = await fetchFn('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ query: QUERY(after) }),
  })
  if (r.status !== 200) {
    log(`[새 출시] Product Hunt ${r.status} — 중단`)
    return { state: 'blocked', candidates: [] }
  }
  const launches = recentLaunches(parsePhPosts(await r.json()), now).filter((l) => l.website).slice(0, max)
  const out = []
  let stopped = null
  for (const l of launches) {
    try {
      const home = await fetchFn(l.website, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
      if (home.status === 403 || home.status === 429) {
        stopped = `홈페이지 ${home.status}`
        break
      }
      if (home.status !== 200) {
        out.push({ ...l, state: 'unreadable', ...NONE })
        continue
      }
      const u = new URL(home.url)
      const rb = await fetchFn(`${u.origin}/robots.txt`, { headers: { 'user-agent': USER_AGENT } }).catch(() => null)
      const verdict = rb && rb.status === 200 ? robotsVerdict(parseRobots(await rb.text()), u.pathname || '/', PRODUCT_TOKEN) : { state: 'unverified' }
      if (verdict.state !== 'allowed') {
        out.push({ ...l, state: `robots_${verdict.state}`, ...NONE })
        continue
      }
      out.push({ ...l, state: 'read', ...extractStoreIds(await home.text()) })
    } catch {
      out.push({ ...l, state: 'unreadable', ...NONE })
    }
    await sleep(gapMs)
  }
  const withId = out.filter((o) => o.appstore_id || o.play_pkg)
  log(`[새 출시] PH 출시 ${launches.length} · 홈페이지 읽음 ${out.filter((o) => o.state === 'read').length} · 스토어 앵커 ${withId.length}${stopped ? ` · 중단(${stopped})` : ''}`)
  const f = opt('out')
  if (f) {
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify({ at: now.toISOString(), stopped, candidates: out }, null, 1))
  }
  return { state: stopped ? 'blocked' : 'ok', candidates: out }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
