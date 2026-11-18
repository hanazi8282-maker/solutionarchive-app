#!/usr/bin/env node
// [v71cu S10] 성공·실패 사례 소스 수집 → case_feed_items(추가 전용, (source,url) 유일). 원문(응답)은 ground 폴더에만, DB 에는 제목·주소·요약·라벨(숫자 구간)만.
// - TrustMRR: 공식 API(TRUSTMRR_API_KEY, 값 출력 금지), 분당 10회 이하(7초 간격). 이용 정책상 대량 재게시 금지 → DB 에는 이름·카테고리·국가·매출 '구간'만.
// - RSS 소스: 소스당 요청 1회(간격 10초). 403·429·캡차 → 그 소스 실행 중단(우회 없음). 로그인·유료 벽 글은 제목·주소만.
// 사용: node --env-file=.env.local scripts/case-feed-collect.mjs [--max-per-source 50] [--dry]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry')
const MAX = Number(process.argv[process.argv.indexOf('--max-per-source') + 1]) || 50
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GROUND = path.join(os.homedir(), 'sa-private/ground/case-feeds')
const UA = 'solutionarchive-review-collector'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const band = (n) => (n == null ? null : n < 1000 ? '<1k' : n < 10_000 ? '1k-10k' : n < 100_000 ? '10k-100k' : n < 1_000_000 ? '100k-1M' : '1M+')
const hash = (s) => crypto.createHash('md5').update(s).digest('hex')

// source → feed URL, 간격(ms). 약관·robots 라벨은 source_candidates 에 있다(전부 unverified/forbids… 라벨을 붙인 채 켬 — 남헌 11-19).
const RSS = {
  saastr: { url: 'https://www.saastr.com/feed/', gap: 3000 },
  startups_for_the_rest_of_us: { url: 'https://www.startupsfortherestofus.com/feed', gap: 10000 },
  lennys_newsletter: { url: 'https://www.lennysnewsletter.com/feed', gap: 3000 },
  failory: { url: 'https://www.failory.com/rss.xml', gap: 3000 },
  baremetrics_blog: { url: 'https://baremetrics.com/blog/rss.xml', gap: 3000 },
  geeknews: { url: 'https://news.hada.io/rss/news', gap: 3000 },
  venturesquare: { url: 'https://www.venturesquare.net/feed', gap: 3000 },
  microconf: { url: 'https://microconf.com/feed', gap: 3000 },
  eoplanet: { url: 'https://eopla.net/feed', gap: 3000 },
  platum: { url: 'https://platum.kr/feed', gap: 2000 },
}

const rows = []
const status = {}

async function trustmrr() {
  const key = process.env.TRUSTMRR_API_KEY
  if (!key) { status.trustmrr = 'needs_key'; return }
  const pages = Math.ceil(MAX / 25)
  for (let p = 1; p <= pages; p++) {
    const r = await fetch(`https://trustmrr.com/api/v1/startups?limit=25&page=${p}`, { headers: { authorization: `Bearer ${key}`, 'user-agent': UA } })
    if (r.status === 403 || r.status === 429) { status.trustmrr = `중단 ${r.status}`; return }
    if (!r.ok) { status.trustmrr = `오류 ${r.status}`; return }
    const j = await r.json()
    fs.mkdirSync(path.join(GROUND, 'trustmrr'), { recursive: true })
    const gp = path.join(GROUND, 'trustmrr', `${new Date().toISOString().slice(0, 10)}-p${p}.json`)
    if (!DRY) fs.writeFileSync(gp, JSON.stringify(j))
    for (const s of j.data ?? []) {
      rows.push({ source: 'trustmrr', url: s.url, title: s.name, published_at: s.foundedDate ?? null, content_hash: hash(JSON.stringify([s.slug, s.category])), ground_path: gp,
        summary: `${s.category ?? '-'} · ${s.country ?? '-'} · 결제 ${s.paymentProvider ?? '-'}`,
        labels: { category: s.category ?? null, country: s.country ?? null, mrr_band: band(s.revenue?.mrr), revenue_30d_band: band(s.revenue?.last30Days), on_sale: !!s.onSale, rank: s.rank ?? null } })
    }
    status.trustmrr = `ok ${rows.filter((x) => x.source === 'trustmrr').length}`
    if (!j.meta?.hasMore) break
    await sleep(7000)
  }
}

async function rss(source, cfg) {
  const r = await fetch(cfg.url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' } })
  if (r.status === 403 || r.status === 429) { status[source] = `중단 ${r.status}`; return }
  const body = await r.text()
  if (!r.ok || !/<(rss|feed|rdf)/i.test(body.slice(0, 2000))) { status[source] = `피드 아님/오류 ${r.status}`; return }
  fs.mkdirSync(path.join(GROUND, source), { recursive: true })
  const gp = path.join(GROUND, source, `${new Date().toISOString().slice(0, 10)}.xml`)
  if (!DRY) fs.writeFileSync(gp, body)
  const items = [...body.matchAll(/<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi)].slice(0, MAX)
  const tag = (x, t) => (x.match(new RegExp(`<${t}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${t}>`, 'i')) ?? [])[1]?.trim()
  for (const [, , x] of items) {
    const link = (tag(x, 'link') || (x.match(/<link[^>]*href=["']([^"']+)["']/i) ?? [])[1] || '').replace(/&amp;/g, '&')
    const title = tag(x, 'title')
    if (!link || !title) continue
    const pub = tag(x, 'pubDate') || tag(x, 'published') || tag(x, 'updated')
    const d = pub ? new Date(pub) : null
    rows.push({ source, url: link, title: title.slice(0, 300), published_at: d && !isNaN(d) ? d.toISOString() : null, content_hash: hash(title + link), ground_path: gp, summary: null, labels: null })
  }
  status[source] = `ok ${items.length}`
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
async function hnShow() {
  for (const tagName of ['show_hn', 'ask_hn']) {
    const r = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=${tagName}&hitsPerPage=${MAX}`, { headers: { 'user-agent': UA } })
    if (!r.ok) { status['hn_' + tagName] = '오류 ' + r.status; continue }
    const j = await r.json()
    for (const h of j.hits ?? []) rows.push({ source: 'hn_' + tagName, url: 'https://news.ycombinator.com/item?id=' + h.objectID, title: (h.title ?? '').slice(0, 300), published_at: h.created_at ?? null, content_hash: hash(String(h.objectID)), ground_path: null, summary: null, labels: { points: h.points ?? null, comments: h.num_comments ?? null } })
    status['hn_' + tagName] = 'ok ' + (j.hits?.length ?? 0)
    await sleep(1000)
  }
}
if (!ONLY || ONLY.includes('trustmrr')) await trustmrr()
if (!ONLY || ONLY.includes('hn')) await hnShow()
for (const [s, cfg] of Object.entries(RSS)) {
  if (ONLY && !ONLY.includes(s)) continue
  try { await rss(s, cfg) } catch (e) { status[s] = `오류 ${e.message}` }
  await sleep(cfg.gap)
}
console.log(status)
console.log(`items ${rows.length}`)
if (DRY || !rows.length) process.exit(0)
for (let i = 0; i < rows.length; i += 100) {
  const { error } = await sb.from('case_feed_items').upsert(rows.slice(i, i + 100), { onConflict: 'source,url', ignoreDuplicates: true })
  if (error) { console.error('case_feed_items 쓰기 실패:', error.message); process.exit(2) }
}
const { data } = await sb.from('case_feed_items').select('source')
const by = {}; for (const x of data ?? []) by[x.source] = (by[x.source] ?? 0) + 1
console.log('DB 소스별', by)
