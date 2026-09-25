#!/usr/bin/env node
// Product Hunt VOC 실측 프로브 — 공식 GraphQL API(v2) 로 최근 런칭의 댓글을 받아 "페인 신호" 적중률을 잰다.
//
//   PRODUCTHUNT_TOKEN=<developer token> node scripts/voc-probe-producthunt.mjs [--posts 20] [--out reports/2026-09-25/voc-probe-producthunt.md]
//
// ⛔ 토큰은 남헌이 개인 계정에서 발급해 전달한다(api.producthunt.com → API dashboard → Developer Token).
//    스크립트는 토큰을 만들지도 추정하지도 않는다 — 없으면 종료코드 2 로 멈춘다.
// ⛔ 실측까지만 승인됐다(남헌 2026-09-25). review_sources 에 행을 만들지 않고 DB 에 아무것도 쓰지 않는다.
//    정식 편입은 결과 보고 뒤 별도 승인(§10.2 신규 소스).
//
// 재는 것
//   · 최근 런칭 N건의 댓글(각 최대 20개) → 총 댓글 수 · 페인 신호 적중(lib/analysis/extract-select.ts painHits ≥ 1) 비율
//   · 발견 이슈: 인증 오류·레이트리밋·빈 댓글
// API: POST https://api.producthunt.com/v2/api/graphql  (Authorization: Bearer <token>). 무료, 시간당 요청 상한 있음(복잡도 기반).
// 종료코드: 0 정상 · 2 토큰 없음/인증 실패/조회 실패

import fs from 'node:fs'
import path from 'node:path'
import { painHits } from '../lib/analysis/extract-select.ts'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const POSTS = Number(opt('posts', 20))
const outPath = opt('out', null)
const token = process.env.PRODUCTHUNT_TOKEN

if (!token) {
  console.error('✗ PRODUCTHUNT_TOKEN 이 없다 — 남헌이 발급해 전달하면 그 값으로 실행한다. 토큰을 만들거나 가정하지 않는다.')
  process.exit(2)
}

const query = `query($first: Int!) {
  posts(first: $first, order: NEWEST) {
    edges { node {
      id name tagline url createdAt votesCount commentsCount
      comments(first: 20) { edges { node { id body createdAt } } }
    } }
  }
}`

const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': 'solutionarchive-voc-probe/0.1 (+https://github.com/hanazi8282-maker/solutionarchive-app)' },
  body: JSON.stringify({ query, variables: { first: Math.min(Math.max(POSTS, 1), 50) } }),
})
const j = await res.json().catch(() => ({}))
if (!res.ok || j.errors) {
  console.error(`✗ Product Hunt API 실패 HTTP ${res.status}: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`)
  process.exit(2)
}
const posts = (j.data?.posts?.edges ?? []).map((e) => e.node)
let comments = 0, hits = 0
const samples = []
for (const p of posts) {
  for (const c of (p.comments?.edges ?? []).map((e) => e.node)) {
    comments++
    const h = painHits(c.body ?? '')
    if (h > 0) { hits++; if (samples.length < 8) samples.push({ post: p.name, body: (c.body ?? '').replace(/\s+/g, ' ').slice(0, 140), h }) }
  }
}
const rate = comments ? Math.round((hits / comments) * 1000) / 10 : null
const L = [
  `## Product Hunt VOC 프로브 (${new Date().toISOString().slice(0, 16)} UTC)`,
  '',
  `- 런칭 ${posts.length}건 · 댓글 ${comments}건 · 페인 신호 적중 ${hits}건 (${rate ?? '—'}%)`,
  `- 댓글 0건인 런칭 ${posts.filter((p) => (p.comments?.edges ?? []).length === 0).length}건 · 평균 votes ${posts.length ? Math.round(posts.reduce((a, p) => a + (p.votesCount ?? 0), 0) / posts.length) : 0}`,
  '- 판정: 적중 30건 미만이면 후보 제외(발굴 엔진 원칙). 정식 편입은 남헌 별도 승인.',
  '',
  ...samples.map((s) => `  - [${s.post}] (${s.h}) ${s.body}`),
  '',
]
const md = L.join('\n') + '\n'
if (outPath) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, md); console.log(`✅ ${outPath}`) }
process.stdout.write(md)
