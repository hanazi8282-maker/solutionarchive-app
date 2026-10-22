#!/usr/bin/env node
// ① 새 출시 병렬 입력(v71au): Product Hunt 최근 90일 출시 → 홈페이지에서 스토어 앵커 → 후보 JSON(DB 쓰기 없음).
//   PRODUCT_HUNT_API_TOKEN 이 있어야 돈다(GitHub Actions 시크릿에만 있다 — 로컬에는 없다. 없으면 '확인 불가'로 멈춘다).
//   node scripts/new-release-candidates.mjs [--out=reports/<KST>/new-release-candidates.json] [--max=40]
// 홈페이지는 robots 가 '허용'일 때만 읽는다(못 읽으면 건너뛴다 — §7.1). 3초 간격, 403/429 한 번이면 그 실행 중단.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parsePhPosts, recentLaunches } from '../lib/discovery/new-release.ts'
import { USER_AGENT } from '../lib/review/runner.ts'
import { homepageAnchors } from './mention-loop.mjs'

const QUERY = (after) => `{ posts(order: NEWEST, first: 50, postedAfter: "${after}") { edges { node { name tagline website votesCount createdAt topics { edges { node { name } } } } } } }`
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
  // v71ba: 홈페이지 읽기는 mention-loop.mjs homepageAnchors 한 벌 — 예전엔 페이지를 먼저 받고 robots 를 나중에 봤다(금지여도 요청은 이미 나감, §7.1).
  const h = await homepageAnchors(launches.map((l) => l.website), { fetchFn, max: launches.length, gapMs, log })
  const out = launches.filter((l) => h.out.has(l.website)).map((l) => ({ ...l, ...NONE, ...h.out.get(l.website) }))
  const stopped = h.stopped ? `홈페이지 ${h.stopped}` : null
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
