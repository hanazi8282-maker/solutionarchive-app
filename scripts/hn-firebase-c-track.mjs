#!/usr/bin/env node
// HN Firebase 옵션 C(댓글 전건 상세) 지속측정.
//
// 배경: Stage 2 실측에서 C 의 원래 목적(Algolia 인덱스 지연으로 남은 dead/deleted
//   댓글 걸러내기)은 1회 실행으론 값이 안 나왔다 — 수집 시점 최근 댓글 50건 중
//   stale 0건. docs/review-source-findings.md 가설이 맞다면 **며칠 지나야** 그
//   댓글들이 dead/deleted 로 바뀐다. 그래서 같은 표본을 날짜마다 다시 재서
//   reports/hn-firebase-c-dead-tracking.md 에 append 한다.
//
// ⚠️ DB 를 건드리지 않는다. review_sources / review_collection_runs / analysis_inputs
//    어느 것도 읽거나 쓰지 않는다. 순수 측정이다.
// ⚠️ 프로덕션 나이틀리 수집 워크플로와 무관하다. 전용 workflow_dispatch 로만 돈다.
// ⚠️ robots 는 실제 lib/review/robots.ts 로 판정한다.
//
// 사용:
//   node scripts/hn-firebase-c-track.mjs            # stdout 에만
//   node scripts/hn-firebase-c-track.mjs --append   # 리포트에 덧붙인다

import fs from 'node:fs'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'

const QUERIES = ['Airtable', 'Zapier'] // 통제 비교용 고정 표본
const HITS_PER_PAGE = 50
const GAP_MS = 300 // 1회성 측정 간격. 나이틀리 예산(2000ms)은 아래에서 별도 산정.
const NIGHTLY_GAP_MS = 2000
const DAILY_CAP = 200
const PRODUCT_TOKEN = 'solutionarchive-review-collector'
const REPORT = 'reports/hn-firebase-c-dead-tracking.md'

const append = process.argv.includes('--append')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const robotsCache = new Map()
async function robotsAllows(url) {
  const u = new URL(url)
  const origin = `${u.protocol}//${u.host}`
  if (!robotsCache.has(origin)) {
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': PRODUCT_TOKEN } })
      robotsCache.set(origin, res.status === 200 ? parseRobots(await res.text()) : [])
    } catch {
      robotsCache.set(origin, null)
    }
  }
  const g = robotsCache.get(origin)
  if (g === null) return { allowed: false, reason: 'robots.txt 를 못 읽음' }
  return robotsVerdict(g, u.pathname, PRODUCT_TOKEN)
}

let requests = 0
async function getJson(url) {
  const v = await robotsAllows(url)
  if (!v.allowed) return { skipped: true, reason: v.reason }
  requests++
  const res = await fetch(url, { headers: { 'user-agent': PRODUCT_TOKEN }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) return { status: res.status }
  return { status: res.status, json: await res.json() }
}

const fb = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`

const perQuery = []

for (const query of QUERIES) {
  const algoliaUrl =
    `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}` +
    `&tags=comment&hitsPerPage=${HITS_PER_PAGE}&page=0`
  const a = await getJson(algoliaUrl)
  if (a.skipped || !a.json) {
    perQuery.push({ query, error: a.skipped ? a.reason : `HTTP ${a.status}` })
    continue
  }
  const hits = a.json.hits ?? []
  await sleep(GAP_MS)

  // 댓글 전건 상세
  let dead = 0
  let deleted = 0
  let gone = 0
  let withKids = 0
  let checked = 0
  for (const h of hits) {
    const r = await getJson(fb(h.objectID))
    await sleep(GAP_MS)
    if (r.skipped || r.status == null || r.status >= 400) continue
    checked++
    if (r.json == null) {
      gone++
      continue
    }
    if (r.json.dead) dead++
    if (r.json.deleted) deleted++
    if ((r.json.kids || []).length > 0) withKids++
  }

  // 스토리 score 분포
  const storyIds = [...new Set(hits.map((h) => h.story_id).filter(Boolean))]
  const scores = []
  for (const sid of storyIds) {
    const r = await getJson(fb(sid))
    await sleep(GAP_MS)
    if (r.json && Number.isFinite(r.json.score)) scores.push(r.json.score)
  }
  scores.sort((x, y) => x - y)
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : null

  perQuery.push({
    query,
    hits: hits.length,
    checked,
    dead,
    deleted,
    gone,
    stale: dead + deleted + gone,
    withKids,
    uniqueStories: storyIds.length,
    scoreMin: scores[0] ?? null,
    scoreMax: scores[scores.length - 1] ?? null,
    scoreMedian: median,
  })
}

// ── 마크다운 엔트리 ──────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const L = []
L.push(`## ${today}`)
L.push('')
L.push(`- 총 실측 요청: ${requests}건 · 표본: search_by_date page 0 × ${QUERIES.length} 쿼리`)
L.push('')
L.push('| 쿼리 | 댓글 | 확인 | dead | deleted | 사라짐 | **stale 합** | 자식답글 | 스토리 | score(min–med–max) |')
L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|')
for (const q of perQuery) {
  if (q.error) {
    L.push(`| ${q.query} | — | — | — | — | — | — | — | — | 실패: ${q.error} |`)
    continue
  }
  L.push(
    `| ${q.query} | ${q.hits} | ${q.checked} | ${q.dead} | ${q.deleted} | ${q.gone} | **${q.stale}** | ${q.withKids} | ${q.uniqueStories} | ${q.scoreMin ?? '—'}–${q.scoreMedian ?? '—'}–${q.scoreMax ?? '—'} |`,
  )
}
L.push('')
// 나이틀리 예산 참고(측정 간격과 별개)
const avgStories = perQuery.filter((q) => !q.error).reduce((s, q) => s + q.uniqueStories, 0) / Math.max(1, perQuery.filter((q) => !q.error).length)
L.push(
  `- 나이틀리 예산(간격 ${NIGHTLY_GAP_MS}ms, 상한 ${DAILY_CAP}): C 는 타깃당 P페이지에 요청 ≈ P + 50P건. ` +
    `1페이지면 ${1 + 50}건(${((1 + 50) * NIGHTLY_GAP_MS) / 1000 / 60 | 0}분), 5페이지면 255건(상한 초과).`,
)
L.push(`  (B 는 P + 스토리 ${avgStories.toFixed(0)}개 ≈ ${1 + Math.round(avgStories)}건/페이지)`)
L.push('')

const entry = L.join('\n')
console.log(entry)

if (append) {
  let existing = ''
  try {
    existing = fs.readFileSync(REPORT, 'utf8')
  } catch {
    existing =
      '# HN Firebase 옵션 C — dead/deleted 지속측정\n\n' +
      '같은 표본(Airtable·Zapier, search_by_date page 0)을 날짜마다 다시 재서 append 한다.\n' +
      'Algolia 인덱스가 라이브 HN 보다 지연된다면 시간이 지나며 stale 합이 커져야 한다.\n' +
      '측정 스크립트: `scripts/hn-firebase-c-track.mjs` · 트리거: workflow_dispatch 전용.\n'
  }
  // 같은 날짜 엔트리가 이미 있으면 덮어쓰지 않고 그냥 하나 더 붙인다 — 이력이니까.
  fs.writeFileSync(REPORT, existing.replace(/\s*$/, '') + '\n\n' + entry + '\n')
  console.log(`\n→ ${REPORT} 에 덧붙였다.`)
}
