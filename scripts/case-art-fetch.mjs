#!/usr/bin/env node
// 로고를 구할 수 없는 케이스(브랜드 폐업·도메인 소멸)의 카드 썸네일 — Pexels 무료 스톡사진 1장을
// 카테고리 검색어로 받아 public/case-art/<slug>.jpg 에 저장한다. (남헌 2026-09-25: AI 생성 취소, 무료 스톡으로.)
//
//   node --env-file=.env.local scripts/case-art-fetch.mjs <slug> "<카테고리 검색어>" [--pick N] [--run]
//   예) node --env-file=.env.local scripts/case-art-fetch.mjs homejoy-discount-conversion-collapse "home cleaning service" --run
//
// 기본은 드라이런: 후보 5장의 URL·촬영자만 출력하고 저장하지 않는다. --run 이면 --pick 번째(기본 1)를 내려받는다.
//
// 지키는 것
//   · 브랜드명은 검색어에 넣지 않는다 — 카테고리 이미지 원칙(로고·상표 흉내 금지). 인자로 받은 검색어를 그대로 쓴다.
//   · 저장 위치는 리포 public/case-art/ (Supabase Storage 아님). logo.ts safeImageUrl 이 '/case-art/<slug>.jpg' 를 통과시킨다.
//   · 사진 출처는 public/case-art/credits.json 에 append(사진 id·촬영자·URL). Pexels 약관: 눈에 띄는 Pexels 링크 + 가능하면 촬영자 크레딧.
//   · DB 는 건드리지 않는다. logo_url 채우기는 사람이 확인한 뒤(1단계 "사람이 확정한 이미지"):
//       UPDATE case_studies SET logo_url='/case-art/<slug>.jpg' WHERE slug='<slug>' AND logo_url IS NULL;
//   · 키: PEXELS_API_KEY (pexels.com/api 무료 발급, 신용카드 불필요, 200회/시간·20,000회/월).
//
// 종료코드: 0 정상 · 2 설정/인자/조회 실패 · 3 저장 실패

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const run = args.includes('--run')
const pickIdx = args.includes('--pick') ? Number(args[args.indexOf('--pick') + 1]) : 1
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--pick')
const [slug, query] = positional
const key = process.env.PEXELS_API_KEY

if (!slug || !query) { console.error('사용: case-art-fetch.mjs <slug> "<카테고리 검색어>" [--pick N] [--run]'); process.exit(2) }
if (!/^[a-z0-9-]+$/.test(slug)) { console.error(`slug 형식 아님: ${slug}`); process.exit(2) }
if (!key) { console.error('✗ PEXELS_API_KEY 가 없다 — pexels.com/api 에서 무료 발급 후 .env.local 에 넣어라. 시작하지 않는다.'); process.exit(2) }
if (!Number.isInteger(pickIdx) || pickIdx < 1 || pickIdx > 5) { console.error('--pick 은 1~5'); process.exit(2) }

const outDir = 'public/case-art'
const outPath = path.join(outDir, `${slug}.jpg`)
const creditsPath = path.join(outDir, 'credits.json')

const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=square&size=medium`
const res = await fetch(url, { headers: { Authorization: key } })
if (!res.ok) { console.error(`✗ Pexels 조회 실패: HTTP ${res.status} ${await res.text().catch(() => '')}`); process.exit(2) }
const data = await res.json()
const photos = data.photos ?? []
console.log(`검색 "${query}" → 후보 ${photos.length}장 (남은 한도 ${res.headers.get('x-ratelimit-remaining') ?? '?'})`)
if (!photos.length) { console.error('✗ 후보 0장 — 검색어를 바꿔라(영어·일반명사 권장).'); process.exit(2) }
photos.forEach((p, i) => console.log(`  ${i + 1}. ${p.url}  by ${p.photographer}  (${p.width}×${p.height}, avg ${p.avg_color})`))

if (!run) { console.log(`\n--dry: 저장 안 함. 고르려면 --pick N --run (기본 1번).`); process.exit(0) }

const p = photos[pickIdx - 1]
// medium = 세로 350px 고정, 카드 썸네일(128px)엔 충분하고 리포에 큰 파일을 넣지 않는다.
const img = await fetch(p.src.medium)
if (!img.ok) { console.error(`✗ 이미지 다운로드 실패: HTTP ${img.status}`); process.exit(3) }
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, Buffer.from(await img.arrayBuffer()))

let credits = []
try { credits = JSON.parse(fs.readFileSync(creditsPath, 'utf8')) } catch { /* 첫 기록 */ }
credits = credits.filter((c) => c.slug !== slug)
credits.push({ slug, query, pexels_id: p.id, pexels_url: p.url, photographer: p.photographer, photographer_url: p.photographer_url, saved_at: new Date().toISOString() })
fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + '\n')

console.log(`\n✅ 저장: ${outPath} (${fs.statSync(outPath).size} bytes) · 크레딧: ${creditsPath}`)
console.log(`다음(사람 확인 뒤): UPDATE case_studies SET logo_url='/case-art/${slug}.jpg' WHERE slug='${slug}' AND logo_url IS NULL;`)
