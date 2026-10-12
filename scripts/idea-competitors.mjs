#!/usr/bin/env node
// 아이디어 → 경쟁 서비스 자동 발굴 — 남헌 v56 §C-2 6(idea-backlog 보류 해제, 2026-10-12). 드라이런 기본.
//
// 흐름: 아이디어 텍스트 → 키워드(규칙) → 공식 목록 소스별 법적 점검(약관 · robots 3상태) → 통과한 소스만 검색
//       → 후보 이름·출시일 → 부류 3갈래(product-name-candidates.mjs tierOf 와 같은 어휘: anchor·small·new) · 이미 아는 이름 표시.
//
// 소스(2026-10-12 실측 — 상태는 --run 때 robots 를 다시 읽어 판정한다, 표는 계획 표시용):
//   appstore_search  itunes.apple.com/search      robots `Disallow: /search*` · apps.apple.com `Disallow: */search?*` → 금지. 약관 미확인.
//   googleplay_search play.google.com/store/search robots `Disallow: /store/search` → 금지. 약관 3.3조 자동화 금지(CLAUDE.md §7.1).
//   shopify_search   apps.shopify.com/search?q=    robots `Disallow: *q=*` → 금지. 약관 1조 9항 자동화 금지(lib/review/adapters/shopify.ts).
//   hn_show          hn.algolia.com/api/v1/search?tags=show_hn  HN 공식 검색 API — robots 404 는 리포 기존 예외
//                    (lib/review/adapters/hackernews.ts proceedWhenRobotsUnverified · scripts/discovery-run.mjs ROBOTS_EXEMPT_HOSTS).
//   → 스토어 3곳은 요청 0. 소유자 예외(override)는 리뷰 수집 경로(RSS·상세)용이라 검색에 넓히지 않는다 — 켜려면 남헌 판단(§10.2 예외 4).
//
// 쓰기: DB 0(코드에 경로 없음). --run 일 때만 reports/<KST>/idea-competitors.md + .json(tier_rows — competitor-anchor-compare.mjs --ledger 로 넘길 수 있다).
//   두 파일은 아이디어 원문이 들어가 .gitignore(공개 리포).
//
// 사용법:
//   node scripts/idea-competitors.mjs --idea="AI meeting notes for small sales teams"           # 드라이런: 키워드·소스 판정 계획만, 네트워크 0
//   node scripts/idea-competitors.mjs --idea-file=idea.txt --run [--area=1] [--keywords=a,b] [--max-requests=6]
//   --keywords: 키워드를 직접 준다(다른 키워드 생성기 출력 연결 지점 — feat/discovery-c1). 없으면 규칙 추출.
//   --area: 결과 행의 영역 코드(비교 한 장에 넘길 때). 없으면 'unknown'.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { RobotsCache } from '../lib/review/runner.ts'
import { hackernewsAdapter } from '../lib/review/adapters/hackernews.ts'
import { buildRegistry, domainName, kstDate, loadConfig, loadFileRegistry, normKey, REPORTS_DIR, TIER_KO, tierOf } from './product-name-candidates.mjs'

export const PRODUCT_TOKEN = 'solutionarchive-discovery'
const USER_AGENT = `${PRODUCT_TOKEN}/0.1 (+https://github.com/hanazi8282-maker/solutionarchive-app)`
export const DEFAULT_MAX_REQUESTS = 6
const HITS = 20
const DAY_MS = 86_400_000

/**
 * 공식 목록 소스. tos: ok | prohibited | unverified. 요청은 tos=ok ∧ robots(실행 때 다시 읽음)=allowed 일 때만.
 * proceedUnverified: robots 404 를 이미 리포가 실측 근거와 함께 예외로 둔 호스트만(새로 넣지 않는다).
 */
export const SOURCES = [
  { key: 'appstore_search', name: 'App Store 검색', tos: 'unverified', tosNote: '검색 경로 약관 미확인', robotsNote: 'itunes `Disallow: /search*` · apps.apple.com `Disallow: */search?*` (2026-10-12)', url: (kw) => `https://itunes.apple.com/search?entity=software&limit=${HITS}&term=${encodeURIComponent(kw)}` },
  { key: 'googleplay_search', name: 'Google Play 검색', tos: 'prohibited', tosNote: '약관 3.3조 자동화 금지', robotsNote: '`Disallow: /store/search` (2026-10-12)', url: (kw) => `https://play.google.com/store/search?c=apps&q=${encodeURIComponent(kw)}` },
  { key: 'shopify_search', name: 'Shopify 앱스토어 검색', tos: 'prohibited', tosNote: '약관 1조 9항 자동화 금지', robotsNote: '`Disallow: *q=*` (2026-10-12)', url: (kw) => `https://apps.shopify.com/search?q=${encodeURIComponent(kw)}` },
  { key: 'hn_show', name: 'Hacker News Show HN(Algolia 공식 API)', tos: 'ok', tosNote: '공개 API — 리포 기존 사용(discovery-run·hackernews 어댑터)', robotsNote: 'robots 404 — hackernews 어댑터 기존 예외', proceedUnverified: hackernewsAdapter.proceedWhenRobotsUnverified ?? [], url: (kw) => `https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=${HITS}&query=${encodeURIComponent(kw)}` },
]

// ── 키워드 ──────────────────────────────────────────────────────────────
const EN_STOP = new Set(['for', 'and', 'the', 'a', 'an', 'to', 'of', 'with', 'in', 'on', 'that', 'my', 'our', 'your', 'who', 'app', 'tool', 'service', 'platform', 'based', 'using', 'small', 'simple', 'easy', 'new', 'like', 'which', 'help', 'helps', 'people'])
const KO_TAIL = /(을|를|이|가|은|는|의|에|에서|으로|로|와|과|도|만|용|하는|해주는|위한|같은|서비스|도구|앱)$/
/**
 * 순수 함수: 아이디어 → 키워드(최대 max). 영문 2~3단어 구(불용어 사이 덩어리) 먼저, 그다음 단어. 한글은 조사·접미 한 번 떼고 2자 이상.
 * ponytail: 규칙 추출이라 동의어·번역은 못 한다 — 한글 아이디어로 영어 소스(HN)를 찾으려면 --keywords 로 영어 키워드를 준다.
 */
export function ideaKeywords(idea, max = 4) {
  const text = String(idea ?? '').normalize('NFKC')
  const phrases = []
  const words = []
  for (const chunk of text.toLowerCase().split(/[^a-z0-9가-힣\s-]+/)) {
    let run = []
    const flush = () => {
      if (run.length >= 2) phrases.push(run.slice(0, 3).join(' '))
      run = []
    }
    for (const raw of chunk.split(/\s+/).filter(Boolean)) {
      if (/^[a-z0-9-]+$/.test(raw)) {
        if (EN_STOP.has(raw) || raw.length < 3) flush()
        else (run.push(raw), words.push(raw))
      } else {
        flush()
        const ko = raw.replace(KO_TAIL, '')
        if (/^[가-힣]{2,}$/.test(ko)) words.push(ko)
      }
    }
    flush()
  }
  return [...new Set([...phrases, ...words])].slice(0, max)
}

// ── 판정·파싱 ───────────────────────────────────────────────────────────
/** 순수 함수: Show HN 제목 → 제품 이름("Show HN: Foo – bar" → Foo). 못 읽으면 null. */
export function showHnName(title) {
  const m = /^show hn:\s*(.+)$/i.exec(String(title ?? '').trim())
  if (!m) return null
  const name = m[1].split(/\s+[–—-]\s+|:\s|,\s|\s\(|\s\|\s/)[0].trim()
  const words = name.split(/\s+/)
  // 설명 문구 제목("AI meeting notes", "100% Free, private …")은 이름이 아니다 — 글자로 시작 · % 없음 · 두 번째 단어부터 소문자 시작이면 버린다.
  if (!/^[A-Za-z가-힣]/.test(name) || name.includes('%') || words.slice(1).some((w) => /^[a-z]/.test(w))) return null
  return name.length <= 40 && words.length <= 4 ? name : null
}

/** 순수 함수: Algolia 응답 → 후보. 응답에 hits 배열이 없으면 실패(0건이 아니다, §7.1). */
export function parseHnShow(body, { keyword, now }) {
  let j
  try {
    j = JSON.parse(body)
  } catch {
    return { ok: false, error: 'JSON 아님' }
  }
  if (!Array.isArray(j?.hits)) return { ok: false, error: 'hits 배열 없음' }
  const items = []
  for (const h of j.hits) {
    const name = showHnName(h.title)
    if (!name) continue
    const created = h.created_at ? new Date(h.created_at) : null
    items.push({
      name,
      key: normKey(name),
      homepage: h.url ?? null,
      domain: domainName(h.url),
      created_at: h.created_at ?? null,
      days: created && !Number.isNaN(created.getTime()) ? Math.floor((now - created) / DAY_MS) : null,
      points: h.points ?? null,
      comments: h.num_comments ?? null,
      evidence: { input_id: `hn:${h.objectID}`, source: 'hn_show', quote: String(h.title).slice(0, 120) },
      keyword,
    })
  }
  return { ok: true, items, total: j.hits.length }
}

/**
 * 순수 함수: 후보 → 부류·이미 앎. 같은 key 는 합친다(키워드 여러 개에 걸린 것).
 * anchor = config benchmark.services 또는 사전 기준점 이름 · new = Show HN 게시 ≤ new_release_days(Show HN 날짜를 출시일 대용으로 쓴다 — 표에 그렇게 적는다) · 그 밖 small.
 */
export function classify(items, { registry, anchorKeys, maxDays, area = 'unknown' }) {
  const by = new Map()
  for (const it of items) {
    const prev = by.get(it.key)
    if (prev) {
      prev.keywords.add(it.keyword)
      continue
    }
    by.set(it.key, { ...it, keywords: new Set([it.keyword]) })
  }
  return [...by.values()].map((c) => {
    const isAnchor = anchorKeys.has(c.key) || (c.domain && anchorKeys.has(normKey(c.domain)))
    const release = c.days == null ? { state: 'unverified', days: null, why: 'no_date' } : { state: c.days <= maxDays ? 'new' : 'old', days: c.days, why: null }
    const known = registry.get(c.key) ?? (c.domain ? registry.get(normKey(c.domain)) : undefined) ?? null
    return {
      key: c.key,
      name: c.name,
      status: isAnchor ? 'benchmark' : 'idea_found',
      tier: tierOf(isAnchor ? 'benchmark' : 'idea_found', release, 0),
      area,
      release,
      known,
      homepage: c.homepage,
      points: c.points,
      comments: c.comments,
      keywords: [...c.keywords],
      score: (c.points ?? 0) + (c.comments ?? 0),
      altN: 0,
      launchN: 1, // Show HN 자체가 출시 글이다
      indieN: 0,
      priceN: 0,
      refs: c.domain ? [c.homepage] : [],
      evidence: [c.evidence],
    }
  })
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function rawFetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
    return { status: res.status, body: await res.text(), finalUrl: res.url }
  } catch (e) {
    return { status: null, body: '', error: e.message }
  }
}

const cell = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')

export function renderReport({ date, idea, keywords, plan, rows, requests }) {
  const L = [
    `# 아이디어 → 경쟁 서비스 후보 — ${date}`,
    '',
    `아이디어: ${cell(idea)}`,
    `키워드: ${keywords.join(', ')} · 요청 ${requests}회 · DB 쓰기 0 · LLM 0회`,
    '',
    '## 소스 판정(공식 목록 · 약관 · robots)',
    '',
    '| 소스 | 약관 | robots | 결과 |',
    '|---|---|---|---|',
    ...plan.map((p) => `| ${p.name} | ${p.tos} — ${cell(p.tosNote)} | ${cell(p.robots)} | ${cell(p.result)} |`),
    '',
    `## 후보 ${rows.length} (부류: ${Object.values(TIER_KO).join(' · ')})`,
    '',
  ]
  if (!rows.length) L.push('후보 없음(요청한 소스에서 0건이거나, 요청할 수 있는 소스가 없었다).', '')
  else {
    L.push('| 후보 | 부류 | 게시 경과(Show HN 날짜 = 출시일 대용) | 이미 앎 | 반응(점수·댓글) | 키워드 | 근거 |', '|---|---|---|---|---|---|---|')
    for (const r of rows) L.push(`| ${cell(r.name)} \`${cell(r.key)}\` | ${TIER_KO[r.tier]} | ${r.release.days == null ? '미확인' : `${r.release.days}일`} | ${r.known ?? '새 이름'} | ${r.points ?? '-'}·${r.comments ?? '-'} | ${cell(r.keywords.join(', '))} | ${r.evidence.map((e) => `${e.input_id} "${cell(e.quote)}"`).join('<br>')} |`)
    L.push('', '새 이름을 후보 대장에 올리려면 사람이 승인 시트 경로(product-name-candidates.mjs → candidate-register-draft.mjs)를 탄다 — 이 스크립트는 등록하지 않는다.', '')
  }
  return L.join('\n')
}

export async function main(argv, { fetchText = rawFetchText, now = new Date(), reportsDir = REPORTS_DIR, cfg = loadConfig(), fileRegistry, log = console.log } = {}) {
  const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
  const run = argv.includes('--run')
  const ideaFile = opt('idea-file')
  const idea = ideaFile ? fs.readFileSync(ideaFile, 'utf8') : opt('idea')
  if (!idea?.trim()) throw new Error('--idea="..." 또는 --idea-file=<경로> 가 필요하다')
  const keywords = opt('keywords') ? opt('keywords').split(',').map((s) => s.trim()).filter(Boolean) : ideaKeywords(idea)
  if (!keywords.length) throw new Error('키워드 0개 — --keywords=a,b 로 직접 준다')
  const maxReq = Number(opt('max-requests') ?? DEFAULT_MAX_REQUESTS)
  if (!Number.isInteger(maxReq) || maxReq < 1) throw new Error(`--max-requests 는 1 이상 정수: ${opt('max-requests')}`)
  const area = opt('area') ?? 'unknown'
  const date = opt('date') ?? kstDate(now)

  const gate = new RobotsCache({ fetchText }, SOURCES.flatMap((s) => s.proceedUnverified ?? []), PRODUCT_TOKEN)
  const plan = []
  const items = []
  let requests = 0
  for (const s of SOURCES) {
    const p = { key: s.key, name: s.name, tos: s.tos, tosNote: s.tosNote, robots: s.robotsNote, result: '', urls: keywords.map((kw) => s.url(kw)) }
    plan.push(p)
    if (s.tos !== 'ok') {
      p.result = `요청 0 — 약관 ${s.tos}`
      continue
    }
    if (!run) {
      p.result = `드라이런 — --run 이면 robots 판정 후 키워드 ${keywords.length}개 요청`
      continue
    }
    const got = []
    for (const [i, kw] of keywords.entries()) {
      if (requests >= maxReq) {
        got.push(`상한 ${maxReq} 도달 — 키워드 ${keywords.length - i}개 미요청`)
        break
      }
      const d = await gate.decide(p.urls[i])
      if (d.state !== 'allowed') {
        got.push(`robots ${d.state} — ${d.reason}`)
        break
      }
      requests++
      const res = await fetchText(p.urls[i])
      if (res.status !== 200) {
        // 403·429·5xx·네트워크 실패 = 즉시 중단(우회 없음).
        got.push(`'${kw}' HTTP ${res.status ?? res.error} — 중단`)
        break
      }
      const parsed = parseHnShow(res.body, { keyword: kw, now })
      if (!parsed.ok) {
        got.push(`'${kw}' 파싱 실패(${parsed.error}) — 중단`)
        break
      }
      items.push(...parsed.items)
      got.push(`'${kw}' hits ${parsed.total}·이름 ${parsed.items.length}`)
    }
    p.result = got.join(' · ')
  }

  const reg = buildRegistry(fileRegistry ?? loadFileRegistry())
  const anchorKeys = new Set((cfg.benchmark?.services ?? []).map(normKey))
  const rows = classify(items, { registry: reg, anchorKeys, maxDays: cfg.weights?.new_release_days ?? 90, area }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))

  log(`${run ? 'RUN' : 'DRY'} ${date} 아이디어 → 경쟁 서비스 · 키워드 ${keywords.join(', ')} · 요청 ${requests}/${maxReq}`)
  for (const p of plan) log(`  [${p.key}] ${p.result}${run ? '' : ` · 계획 ${p.urls[0]}${p.urls.length > 1 ? ` 외 ${p.urls.length - 1}` : ''}`}`)
  const byTier = Object.fromEntries(Object.keys(TIER_KO).map((t) => [t, rows.filter((r) => r.tier === t).length]))
  log(`  후보 ${rows.length} · ${Object.entries(byTier).map(([t, n]) => `${TIER_KO[t]} ${n}`).join(' · ')} · 새 이름 ${rows.filter((r) => !r.known).length}`)

  let files = null
  if (run) {
    const dir = path.join(reportsDir, date)
    fs.mkdirSync(dir, { recursive: true })
    files = { md: path.join(dir, 'idea-competitors.md'), json: path.join(dir, 'idea-competitors.json') }
    fs.writeFileSync(files.md, renderReport({ date, idea, keywords, plan, rows, requests }))
    fs.writeFileSync(files.json, JSON.stringify({ generated_at: now.toISOString(), idea, keywords, plan, tier_rows: rows }, null, 2) + '\n')
    log(`  파일: ${files.md} (+ ${path.basename(files.json)} — competitor-anchor-compare.mjs --ledger=<json> --areas=${area})`)
  }
  return { keywords, plan, rows, requests, files }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
