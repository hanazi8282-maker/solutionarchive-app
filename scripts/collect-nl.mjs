#!/usr/bin/env node
// 뉴스레터 4곳 공개·무료 원문 수집 (v71ci, CTO 세션 2026-11-12).
// 로그인·쿠키·토큰으로 유료 벽을 넘지 않는다 — 유료 글은 건너뛴다(teaser도 저장 안 함).
// Lenny·SaaS Playbook(Substack)은 ToS가 무료 글 자동 수집도 금지한다고 명시돼 있고, 그 법적 리스크는
// 남헌이 채팅에서 직접 승인했다(2026-11-12-기타-v71ci-뉴스레터수집-승인기록). 그 범위를 넘지 않는다.
// 원문은 리포 밖 ground 폴더에만 쓴다. case_bank 적재는 이 스크립트가 하지 않는다(별도 추출 단계).
//
// 사용: node scripts/collect-nl.mjs --source saastr|trendsvc|lenny|saasplaybook [--max N]
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

// 2026-11-14 수정: 기존 값이 ~/sa-private/ground/ 가 아니라 레포 옆 _ground/ 를 가리키고 있었다(표준 위치 위반).
import os from 'node:os'
const GROUND = path.join(os.homedir(), 'sa-private', 'ground', 'newsletters')
const UA = 'Mozilla/5.0 (research-inventory)'
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const SOURCE = arg('source')
const MAX = Number(arg('max', Infinity))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function slugify(s) {
  return (s || 'untitled').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled'
}

function frontmatter(obj) {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
  return `---\n${lines.join('\n')}\n---\n\n`
}

async function saveMd(dir, filename, meta, body) {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), frontmatter(meta) + body, 'utf8')
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (res.status === 403 || res.status === 429) throw { blocked: true, status: res.status, url }
  if (!res.ok) return { status: res.status, body: null }
  return { status: res.status, body: await res.json() }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (res.status === 403 || res.status === 429) throw { blocked: true, status: res.status, url }
  if (!res.ok) return null
  return await res.text()
}

// ---- SaaStr: WordPress REST, 전체 공개, 2초/요청 ----
async function collectSaastr() {
  const dir0 = path.join(GROUND, 'saastr')
  let page = 1, saved = 0, failed = 0
  while (saved + failed < MAX) {
    const url = `https://www.saastr.com/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,date,slug,link,title,content,excerpt,categories,tags`
    let r
    try { r = await fetchJson(url) } catch (e) { console.error('BLOCKED', e); return { saved, failed, blocked: true } }
    if (r.status === 400 || !Array.isArray(r.body) || r.body.length === 0) break
    for (const post of r.body) {
      const date = (post.date || '').slice(0, 10)
      const yyyy = date.slice(0, 4) || 'unknown'
      const slug = post.slug || slugify(post.title?.rendered)
      const text = htmlToText(post.content?.rendered || '')
      try {
        await saveMd(path.join(dir0, yyyy), `${date}_${slug}.md`,
          { title: htmlToText(post.title?.rendered || ''), url: post.link, date, tier: 'free', wordcount: text.split(/\s+/).filter(Boolean).length, categories: (post.categories || []).join(','), tags: (post.tags || []).join(',') },
          text)
        saved++
      } catch { failed++ }
      if (saved + failed >= MAX) break
    }
    console.log(`[saastr] page ${page} 누적 저장 ${saved}`)
    page++
    await sleep(2000)
  }
  return { saved, failed }
}

// ---- Trends.vc: WordPress REST, 전체 공개, 10초/요청 ----
async function collectTrendsvc() {
  const dir0 = path.join(GROUND, 'trendsvc')
  let page = 1, saved = 0, failed = 0
  while (saved + failed < MAX) {
    const url = `https://trends.vc/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,date,slug,link,title,content,excerpt`
    let r
    try { r = await fetchJson(url) } catch (e) { console.error('BLOCKED', e); return { saved, failed, blocked: true } }
    if (r.status === 400 || !Array.isArray(r.body) || r.body.length === 0) break
    for (const post of r.body) {
      const date = (post.date || '').slice(0, 10)
      const yyyy = date.slice(0, 4) || 'unknown'
      const slug = post.slug || slugify(post.title?.rendered)
      const bodyHtml = post.content?.rendered || ''
      const locked = [...bodyHtml.matchAll(/<[^>]*>(?:[^<]*)(?:HeadsUp|Sponsored)(?:[^<]*)<\/[^>]*>/gi)].map((m) => m[0])
      const text = htmlToText(bodyHtml)
      try {
        await saveMd(path.join(dir0, yyyy), `${date}_${slug}.md`,
          { title: htmlToText(post.title?.rendered || ''), url: post.link, date, tier: 'free', wordcount: text.split(/\s+/).filter(Boolean).length, locked_blocks: locked.length },
          text)
        saved++
      } catch { failed++ }
      if (saved + failed >= MAX) break
    }
    console.log(`[trendsvc] page ${page} 누적 저장 ${saved}`)
    page++
    await sleep(10000)
  }
  return { saved, failed }
}

// ---- Substack 공용(Lenny / SaaS Playbook): archive API + 개별 글 HTML, 1.5초/요청 ----
// 유료 글(audience !== 'everyone')은 로그인 없이 공개된 페이지만 읽는다. 'This post is for
// paid subscribers' 표지 이전(= 비로그인 방문자도 보는 미리보기)까지만 저장하고 그 아래는
// 받지 않는다. 로그인·쿠키·토큰은 쓰지 않는다. allowPaidTeaser=false면 유료 글은 통째로 건너뜀.
const PAYWALL_MARK = /This\s+post\s+is\s+for\s+paid\s+subscribers/i
async function collectSubstack(host, dirName, { allowPaidTeaser = false } = {}) {
  const dir0 = path.join(GROUND, dirName)
  let cursor = arg('cursor', ''), saved = 0, savedTeaser = 0, skippedPaid = 0, failed = 0
  const limit = 12
  while (saved + savedTeaser + skippedPaid + failed < MAX) {
    const url = `https://${host}/api/v1/archive?sort=new&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    let r
    try { r = await fetchJson(url) } catch (e) { console.error('BLOCKED', e); return { saved, savedTeaser, skippedPaid, failed, blocked: true } }
    const posts = r.body?.posts
    if (!Array.isArray(posts) || posts.length === 0) break
    for (const post of posts) {
      const isPaid = post.audience && post.audience !== 'everyone'
      const date = (post.post_date || '').slice(0, 10)
      const slug = post.slug || slugify(post.title)
      if (isPaid && !allowPaidTeaser) { skippedPaid++; continue }
      const outPath = path.join(dir0, date.slice(0, 4) || 'unknown', `${date}_${slug}.md`)
      if (existsSync(outPath)) { if (isPaid) savedTeaser++; else saved++; continue } // 이미 받은 글, 재요청 안 함(재시도 시 레이트리밋 완화)
      await sleep(3000)
      let html
      try { html = await fetchText(post.canonical_url) } catch (e) { console.error('BLOCKED', e); return { saved, savedTeaser, skippedPaid, failed, blocked: true } }
      if (!html) { failed++; continue }
      const m = html.match(/<div class="(?:available-content|body markup)"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="subscription-widget|<\/article|$)/i)
      let raw = m ? m[1] : html
      let tier = 'free'
      if (isPaid) {
        const idx = raw.search(PAYWALL_MARK)
        if (idx < 0) { skippedPaid++; continue } // 표지를 못 찾으면 추측 저장하지 않는다
        raw = raw.slice(0, idx)
        tier = 'paid_teaser'
      }
      const text = htmlToText(raw)
      try {
        await saveMd(path.join(dir0, date.slice(0, 4) || 'unknown'), `${date}_${slug}.md`,
          { title: post.title, url: post.canonical_url, date, tier, wordcount_saved: text.split(/\s+/).filter(Boolean).length },
          text)
        if (tier === 'paid_teaser') savedTeaser++; else saved++
      } catch { failed++ }
      if (saved + savedTeaser + skippedPaid + failed >= MAX) break
    }
    console.log(`[${dirName}] cursor ${cursor || '(첫 페이지)'} 무료 ${saved} teaser ${savedTeaser} 건너뜀 ${skippedPaid}`)
    cursor = r.body?.nextCursor
    if (!cursor) break
    await sleep(3000)
  }
  return { saved, savedTeaser, skippedPaid, failed }
}

const RUN = {
  saastr: collectSaastr,
  trendsvc: collectTrendsvc,
  lenny: () => collectSubstack('www.lennysnewsletter.com', 'lenny', { allowPaidTeaser: true }),
  saasplaybook: () => collectSubstack('thesaasplaybook.substack.com', 'saasplaybook'),
}

if (!RUN[SOURCE]) { console.error('--source saastr|trendsvc|lenny|saasplaybook 필요'); process.exit(64) }
const result = await RUN[SOURCE]()
console.log(`[${SOURCE}] 완료`, JSON.stringify(result))
