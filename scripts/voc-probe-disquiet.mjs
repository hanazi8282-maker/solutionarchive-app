#!/usr/bin/env node
// disquiet.io VOC 실측 프로브 — 홈 피드·/articles 에 노출된 게시글(/posts/<id>)을 최대 N건 받아 "페인 신호" 적중률을 잰다.
//
//   node scripts/voc-probe-disquiet.mjs [--posts 30] [--out reports/2026-09-25/voc-probe-disquiet.md]
//
// 규칙(scripts/review-source-probe.mjs 와 같다): robots.txt 먼저(2026-09-25 실측 Disallow: /passwordless 뿐) · UA 정직하게 밝힘 ·
// 재시도·프록시 없음 · 요청 간 4초 · 본문은 저장하지 않고 길이·적중만 센다(표본 발췌 8건 140자만 리포트에).
// ⛔ 실측까지만 승인됐다(남헌 2026-09-25). review_sources 행·어댑터·DB 쓰기 없음. 정식 편입은 별도 승인(§10.2).
// 종료코드: 0 정상 · 2 robots 거부/홈 접근 실패

import fs from 'node:fs'
import path from 'node:path'
import { painHits } from '../lib/analysis/extract-select.ts'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const MAX_POSTS = Number(opt('posts', 30))
const outPath = opt('out', null)
const BASE = 'https://disquiet.io'
const UA = 'solutionarchive-voc-probe/0.1 (+https://github.com/hanazi8282-maker/solutionarchive-app; one-off VOC probe, robots-respecting)'
const GAP_MS = 4000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const get = async (p) => {
  const r = await fetch(BASE + p, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  return { status: r.status, text: r.ok ? await r.text() : '' }
}

// 1) robots
const robots = await get('/robots.txt')
const disallow = robots.text.split('\n').filter((l) => /^disallow:/i.test(l)).map((l) => l.split(':').slice(1).join(':').trim()).filter(Boolean)
const blocked = (p) => disallow.some((d) => d !== '/' ? p.startsWith(d) : true)
if (robots.status !== 200) { console.error(`✗ robots.txt ${robots.status} — 판단 불가, 가지 않는다`); process.exit(2) }
if (blocked('/posts/x') || blocked('/')) { console.error(`✗ robots 가 /posts 또는 / 를 막는다: ${disallow.join(' ')}`); process.exit(2) }

// 2) 게시글 링크 수집 — 홈 + /articles
const ids = new Set()
for (const p of ['/', '/articles']) {
  const r = await get(p)
  if (r.status !== 200) { console.error(`✗ ${p} → ${r.status}`); if (p === '/') process.exit(2); continue }
  for (const m of r.text.matchAll(/href="\/posts\/([A-Za-z0-9_-]+)"/g)) ids.add(m[1])
  await sleep(GAP_MS)
}
const list = [...ids].slice(0, MAX_POSTS)
console.log(`게시글 링크 ${ids.size}건 발견 → ${list.length}건 확인 (간격 ${GAP_MS / 1000}s)`)

// 3) 본문 텍스트 — 스크립트/스타일 제거 뒤 80자 이상 텍스트 블록만 합친다(정확한 셀렉터는 어댑터 단계에서).
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
const blocksOf = (h) => [...strip(h).matchAll(/>([^<>]{40,2000})</g)].map((m) => m[1].replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 40)
let fetched = 0, statusErr = 0, chars = 0, hitPosts = 0, hitBlocks = 0, totalBlocks = 0
const samples = []
for (const id of list) {
  const r = await get(`/posts/${id}`)
  if (r.status !== 200) { statusErr++; console.log(`  /posts/${id} → ${r.status}`); await sleep(GAP_MS); continue }
  fetched++
  const blocks = blocksOf(r.text)
  totalBlocks += blocks.length
  let postHit = 0
  for (const b of blocks) { chars += b.length; const h = painHits(b); if (h > 0) { hitBlocks++; postHit += h; if (samples.length < 8) samples.push({ id, h, t: b.slice(0, 140) }) } }
  if (postHit > 0) hitPosts++
  await sleep(GAP_MS)
}
const rate = fetched ? Math.round((hitPosts / fetched) * 1000) / 10 : null
const L = [
  `## disquiet.io VOC 프로브 (${new Date().toISOString().slice(0, 16)} UTC)`,
  '',
  `- robots: Disallow ${disallow.length}줄(${disallow.join(' ') || '없음'}) — /posts 허용`,
  `- 게시글 ${fetched}/${list.length}건 수신(비정상 응답 ${statusErr}) · 텍스트 블록 ${totalBlocks}개 · ${chars.toLocaleString()}자`,
  `- 페인 신호 적중: 게시글 ${hitPosts}건 (${rate ?? '—'}%) · 블록 ${hitBlocks}개`,
  '- 판정: 적중 게시글 30건 미만이면 후보 제외(발굴 엔진 원칙). 정식 편입은 남헌 별도 승인.',
  '',
  ...samples.map((s) => `  - /posts/${s.id} (${s.h}) ${s.t}`),
  '',
]
const md = L.join('\n') + '\n'
if (outPath) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, md); console.log(`✅ ${outPath}`) }
process.stdout.write(md)
