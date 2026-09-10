#!/usr/bin/env node
// ── HN Firebase 상세조회 A/B/C 실측 (1회성 dry-run) ─────────────────────────
//
// 목적: "Algolia 단독(A) vs +스토리 score 배치(B) vs +댓글 상세 전건(C)" 셋을
//       같은 샘플 쿼리로 나란히 붙여, 케이스 품질 차이와 요청 예산을 측정한다.
//       **결정은 사람이 한다. 이 스크립트는 숫자만 낸다.**
//
// 안전:
//   - 프로덕션 나이틀리 워크플로와 무관. review_sources / review_collection_runs /
//     review_targets / review_fingerprints 어느 것도 읽거나 쓰지 않는다. DB 미접속.
//   - robots: Algolia(hn.algolia.com/robots.txt = 404 = 규칙없음),
//             Firebase(hacker-news.firebaseio.com: Allow /*.json$) 둘 다 실제
//             lib/review/robots.ts 로 판정하고, 금지면 그 요청을 건너뛴다.
//   - 요청 간격: 샘플 실측은 SAMPLE_GAP_MS(기본 300ms). 나이틀리 예산 projection 은
//     소스 등록값(min_interval_ms=2000, daily_request_cap=200)으로 따로 계산해 출력.
//
// 사용: node scripts/hn-firebase-ab-probe.mjs [query1] [query2] ...
//       (인자 없으면 DEFAULT_QUERIES)

import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { hackernewsAdapter } from '../lib/review/adapters/hackernews.ts'

const DEFAULT_QUERIES = ['Airtable', 'Zapier']
const QUERIES = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_QUERIES

const HITS_PER_PAGE = 50 // 어댑터 등록값과 동일
const PAGES_PER_QUERY = 1 // 통제 비교용. 1페이지(=50댓글)면 충분하다.
const C_CAP_PER_QUERY = 25 // C 는 댓글 1건당 1요청이라 샘플에서 상한을 둔다(초과분은 선형 추정).
const SAMPLE_GAP_MS = 300 // 실측 실행 간격. 나이틀리 예산과 별개(아래 projection 참고).
const NIGHTLY_GAP_MS = 2000 // review_sources.min_interval_ms
const DAILY_CAP = 200 // review_sources.daily_request_cap
const PRODUCT_TOKEN = 'solutionarchive-review-collector'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// robots 캐시 (호스트별 1회)
const robotsCache = new Map()
async function robotsAllows(url) {
  const u = new URL(url)
  const origin = `${u.protocol}//${u.host}`
  if (!robotsCache.has(origin)) {
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': PRODUCT_TOKEN } })
      robotsCache.set(origin, res.status === 200 ? parseRobots(await res.text()) : [])
    } catch {
      robotsCache.set(origin, null) // 못 읽음
    }
  }
  const groups = robotsCache.get(origin)
  if (groups === null) return { allowed: false, reason: 'robots.txt 를 읽지 못함' }
  return robotsVerdict(groups, u.pathname, PRODUCT_TOKEN)
}

let reqCount = 0
async function get(url) {
  const v = await robotsAllows(url)
  if (!v.allowed) {
    return { skipped: true, reason: v.reason, status: null, body: null }
  }
  reqCount++
  const t0 = performance.now()
  const res = await fetch(url, { headers: { 'user-agent': PRODUCT_TOKEN } })
  const body = await res.text()
  return { skipped: false, status: res.status, body, ms: performance.now() - t0 }
}

function fbItemUrl(id) {
  return `https://hacker-news.firebaseio.com/v0/item/${id}.json`
}

// ── 실행 ──────────────────────────────────────────────────────────────────
const perQuery = []

for (const query of QUERIES) {
  console.log(`\n${'='.repeat(70)}\nQUERY: "${query}"\n${'='.repeat(70)}`)

  // --- Algolia 검색 (A 의 입력) ---
  const algoliaReqStart = reqCount
  const rawHits = []
  let nbPagesReported = null
  for (let page = 0; page < PAGES_PER_QUERY; page++) {
    const url =
      `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}` +
      `&tags=comment&hitsPerPage=${HITS_PER_PAGE}&page=${page}`
    const r = await get(url)
    if (r.skipped) {
      console.log(`  Algolia page ${page}: SKIPPED (${r.reason})`)
      break
    }
    const doc = JSON.parse(r.body)
    nbPagesReported = doc.nbPages
    rawHits.push(...(doc.hits || []))
    await sleep(SAMPLE_GAP_MS)
  }
  const algoliaReqs = reqCount - algoliaReqStart

  // --- A: 어댑터 parse 그대로 ---
  const parsed = hackernewsAdapter.parse(
    JSON.stringify({ hits: rawHits, nbPages: nbPagesReported }),
    { productRef: query, cursor: null },
  )
  const A = {
    reviews: parsed.reviews.length,
    parseFailures: parsed.parseFailures,
    requests: algoliaReqs,
    avgTextLen: Math.round(
      parsed.reviews.reduce((s, r) => s + r.text.length, 0) / Math.max(1, parsed.reviews.length),
    ),
  }

  // --- B: 스토리 단위 배치 (unique story_id → Firebase score/descendants) ---
  const storyIds = [...new Set(rawHits.map((h) => h.story_id).filter(Boolean))]
  const bReqStart = reqCount
  const bT0 = performance.now()
  const storyMeta = new Map()
  let bSkipped = 0
  for (const sid of storyIds) {
    const r = await get(fbItemUrl(sid))
    if (r.skipped) {
      bSkipped++
      continue
    }
    try {
      const d = JSON.parse(r.body)
      if (d) storyMeta.set(sid, { score: d.score ?? null, descendants: d.descendants ?? null, title: d.title ?? null })
    } catch {}
    await sleep(SAMPLE_GAP_MS)
  }
  const B = {
    requests: reqCount - bReqStart,
    wallMs: Math.round(performance.now() - bT0),
    uniqueStories: storyIds.length,
    skipped: bSkipped,
    storiesWithScore: [...storyMeta.values()].filter((m) => m.score != null).length,
    scoreRange: (() => {
      const s = [...storyMeta.values()].map((m) => m.score).filter((x) => x != null).sort((a, b) => a - b)
      return s.length ? `${s[0]}–${s[s.length - 1]} (median ${s[Math.floor(s.length / 2)]})` : 'n/a'
    })(),
  }

  // --- C: 댓글 전건 상세 (deleted/dead 필터 + kids/parent) ---
  const cTargets = rawHits.slice(0, C_CAP_PER_QUERY)
  const cReqStart = reqCount
  const cT0 = performance.now()
  let cDead = 0
  let cDeleted = 0
  let cWithKids = 0
  let cGone = 0 // Firebase 가 null 을 준 것 (인덱스엔 있는데 실물이 없음)
  let cSkipped = 0
  for (const h of cTargets) {
    const r = await get(fbItemUrl(h.objectID))
    if (r.skipped) {
      cSkipped++
      continue
    }
    try {
      const d = JSON.parse(r.body)
      if (d == null) cGone++
      else {
        if (d.dead) cDead++
        if (d.deleted) cDeleted++
        if ((d.kids || []).length > 0) cWithKids++
      }
    } catch {}
    await sleep(SAMPLE_GAP_MS)
  }
  const C = {
    sampled: cTargets.length,
    requests: reqCount - cReqStart,
    wallMs: Math.round(performance.now() - cT0),
    dead: cDead,
    deleted: cDeleted,
    gone: cGone,
    staleInIndex: cDead + cDeleted + cGone, // A 가 증거로 쓰지만 실제로는 철회/삭제된 것
    withChildReplies: cWithKids,
    skipped: cSkipped,
    perCommentRequest: true,
  }

  perQuery.push({ query, A, B, C })

  console.log(`\n  [A] Algolia 단독`)
  console.log(`      리뷰 ${A.reviews}건 · 파싱실패 ${A.parseFailures} · 요청 ${A.requests} · 평균 본문 ${A.avgTextLen}자`)
  console.log(`\n  [B] +스토리 score 배치`)
  console.log(`      unique 스토리 ${B.uniqueStories}개 → 요청 ${B.requests} (스토리당 1) · ${B.wallMs}ms`)
  console.log(`      score 있는 스토리 ${B.storiesWithScore}/${B.uniqueStories} · score 범위 ${B.scoreRange}`)
  console.log(`\n  [C] +댓글 상세 전건 (샘플 상한 ${C_CAP_PER_QUERY})`)
  console.log(`      요청 ${C.requests} (댓글당 1) · ${C.wallMs}ms`)
  console.log(`      인덱스엔 있으나 실제 dead/deleted/삭제됨: ${C.staleInIndex}/${C.sampled}  (dead ${C.dead} · deleted ${C.deleted} · null ${C.gone})`)
  console.log(`      자식 답글 있는 댓글: ${C.withChildReplies}/${C.sampled}`)
}

// ── 나이틀리 요청 예산 projection ─────────────────────────────────────────
console.log(`\n${'='.repeat(70)}\n나이틀리 요청 예산 (min_interval_ms=${NIGHTLY_GAP_MS}, daily_request_cap=${DAILY_CAP})\n${'='.repeat(70)}`)
const avgStoriesPerPage =
  perQuery.reduce((s, q) => s + q.B.uniqueStories, 0) / Math.max(1, perQuery.length)
console.log(`샘플 기준 1페이지(50댓글)당 unique 스토리 ≈ ${avgStoriesPerPage.toFixed(1)}`)
console.log(`\n타깃 1개가 P페이지(50P댓글) 수집한다고 할 때, 소스 전체 하루 요청 수:`)
for (const P of [1, 3, 5, 10]) {
  const stories = Math.round(avgStoriesPerPage * P)
  const a = P
  const b = P + stories
  const c = P + 50 * P
  const fmt = (n) => `${n}건 (${(n * NIGHTLY_GAP_MS / 1000 / 60).toFixed(1)}분${n > DAILY_CAP ? ' ⚠️상한초과' : ''})`
  console.log(`  P=${P.toString().padStart(2)}  A ${fmt(a).padEnd(24)} B ${fmt(b).padEnd(28)} C ${fmt(c)}`)
}
console.log(`\n타깃이 여러 개면 위 숫자 × 타깃수. daily_request_cap 은 소스 전체 합계에 걸린다.`)
console.log(`\n총 실측 요청 수: ${reqCount}`)

// 아티팩트
const fs = await import('node:fs')
const out = { ranAt: new Date().toISOString(), queries: QUERIES, sampleGapMs: SAMPLE_GAP_MS, perQuery, totalRequests: reqCount }
const path = `.tmp-hn-ab-probe-${Date.now()}.json`
fs.writeFileSync(path, JSON.stringify(out, null, 2))
console.log(`\n결과 JSON: ${path}`)
