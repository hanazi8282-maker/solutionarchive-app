#!/usr/bin/env node
// v71ay C3 — Shopify 앱스토어 카테고리 목록(apps.shopify.com/categories/<slug>, robots 허용 경로)에서 앱 handle·이름을 모은다. DB 쓰기 없음, 파일만.
//   애플 장르별 차트 RSS(itunes.apple.com/<cc>/rss/…/genre=<id>)는 쓰지 않는다: 같은 호스트 robots.txt 가 `Disallow: /*/rss/*` 이고
//   남헌 D-44/45 허용은 /search·/lookup 뿐이다(2026-10-19 실측). 애플 입력은 appstore-chart-dictionary.mjs --countries=… (rss.marketingtools, 규칙 줄 0) 로 넓힌다.
// 출력: reports/<KST>/new-release-dictionary.json = { shopify:[{handle,name,category}], skipped, stopped }
// 요청: robots 먼저, '허용'일 때만. 간격 3초. 403/429/빈 응답 한 번이면 그 자리에서 멈춘다(우회 없음). 목록이 0개면 '못 읽음'(건너뜀)이지 0건 정상이 아니다(§7.1).
//   node scripts/new-release-feeds.mjs [--out=reports/<KST>/new-release-dictionary.json] [--no-network]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN, USER_AGENT } from '../lib/review/runner.ts'

export const SHOPIFY_CATEGORIES = ['store-management', 'marketing-and-conversion', 'sales', 'finances', 'customer-support', 'orders-and-shipping']
const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Shopify 카테고리 HTML → [{handle,name}] (data-app-card-handle-value / -name-value 쌍). 중복 handle 은 한 번. */
export function parseShopifyCategory(html) {
  const handles = [...html.matchAll(/data-app-card-handle-value="([^"]+)"/g)].map((m) => m[1])
  const names = [...html.matchAll(/data-app-card-name-value="([^"]*)"/g)].map((m) => decode(m[1]))
  const seen = new Set()
  return handles.flatMap((h, i) => (seen.has(h) || !names[i] ? [] : (seen.add(h), [{ handle: h, name: names[i] }])))
}

export async function collect({ fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  const shopify = [], skipped = []
  let stopped = null
  const rb = await fetchFn('https://apps.shopify.com/robots.txt', { headers: { 'user-agent': USER_AGENT } }).catch(() => null)
  const verdict = rb && rb.status === 200 ? robotsVerdict(parseRobots(await rb.text()), '/categories/store-management', PRODUCT_TOKEN) : { state: 'unverified' }
  if (verdict.state !== 'allowed') return { shopify, skipped: [`shopify: robots ${verdict.state}`], stopped }
  for (const cat of SHOPIFY_CATEGORIES) {
    await sleep(3000)
    const res = await fetchFn(`https://apps.shopify.com/categories/${cat}`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30000) }).catch(() => null)
    if (res && (res.status === 403 || res.status === 429)) { stopped = `HTTP ${res.status} shopify/${cat}`; break }
    const apps = res?.status === 200 ? parseShopifyCategory(await res.text()) : []
    if (!apps.length) { skipped.push(`shopify/${cat} (${res ? `HTTP ${res.status}` : '무응답'} 또는 카드 0개 — 못 읽음)`); continue }
    for (const a of apps) if (!shopify.some((x) => x.handle === a.handle)) shopify.push({ ...a, category: cat })
    log(`shopify/${cat} ${apps.length}`)
  }
  return { shopify, skipped, stopped }
}

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = arg('out', path.join('reports', kstDate(), 'new-release-dictionary.json'))
  const r = process.argv.includes('--no-network') ? { shopify: [], skipped: ['--no-network'], stopped: null } : await collect({ log: console.log })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...r }, null, 1))
  console.log(`[새 출시 입력] Shopify ${r.shopify.length}개 · 건너뜀 ${r.skipped.length}${r.stopped ? ` · ⚠️ 중단: ${r.stopped}` : ''}`)
  process.exit(r.stopped ? 3 : 0)
}
