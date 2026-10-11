#!/usr/bin/env node
// 리뷰·VOC 글에서 아직 등록 안 된 제품·회사 이름 후보 표(읽기 전용). 남헌 v48 §2-B 단계 1(2026-10-11).
//
// 입력 = 최종 라벨 relevant 인 글(human_verdict 가 이기고, 없으면 verdict — lib/signals/feed.ts base 와 같은 규칙)
//      ∪ 영역 프로젝트(analysis_projects.area_code ∈ config/areas.json kind=area, 마이그 20261009000020) 의 글.
//      area_code 열이 없으면(42703) 타깃 라벨 접두 `^[1-5]:`(target-supply.ts areaOf 와 같은 판독)로 대신한다.
//      폐기된 원문(purged_at·raw_text NULL)은 건너뛴다.
// 추출 = 규칙 기반만(앱스토어·플레이 링크, 도메인, 문장 중간 대문자 토큰, 비교 패턴 "X 대신 Y"·"alternative to X"·"X vs Y",
//      따옴표·백틱 이름, 한영 병기 "노션(Notion)"). LLM 호출은 붙이지 않는다.
//      확장 지점(후속 단계): extractMentions 뒤에 Sonnet 보강(한글 자유문 고유명·여러 단어 이름)을 꽂는다 — 여기서는 하지 않는다.
// 대조 = 제품 사전(reports/2026-10-05/product-dictionary — dictionary-targets.mjs 가 쓰는 사전) · data/area-map-v26.json slug ·
//      analysis_projects(소개문 앞 제품명·competitor_url 도메인) · review_targets(label slug·product_ref 앱 ID) ·
//      discovery_candidates(accepted 이름·홈페이지). 이미 있는 키는 표에 올리지 않는다(건수만).
// 출력 = --run 일 때만 reports/<KST 날짜>/product-name-candidates.md + rejected-candidates.json(기각·확인불가 대장, 재제안 방지).
//      두 파일은 .gitignore 로 커밋하지 않는다. 지난 대장에서 rejected 였던 키는 다시 올리지 않는다(previously_rejected).
//
// ⚠️ DB 는 SELECT 만 한다(--dry·--run 둘 다). 쓰기 경로가 코드에 없다는 것을 셀프테스트가 정적으로 검사한다.
//
// 사용법:
//   node scripts/product-name-candidates.mjs          # --dry(기본): 건수만 콘솔에, 파일 안 씀
//   node scripts/product-name-candidates.mjs --run    # 표·대장 파일 생성
//   옵션: --date=YYYY-MM-DD(출력 폴더, 기본 오늘 KST)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONFIG_PATH = path.join(repoRoot, 'config', 'product-name-discovery.json')
const DICT_DIR = path.join(repoRoot, 'reports', '2026-10-05', 'product-dictionary')
const AREA_MAP_PATH = path.join(repoRoot, 'data', 'area-map-v26.json')
const AREAS_PATH = path.join(repoRoot, 'config', 'areas.json')
export const REPORTS_DIR = path.join(repoRoot, 'reports')

export const loadConfig = (file = CONFIG_PATH) => JSON.parse(fs.readFileSync(file, 'utf8'))

export function kstDate(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}`
}

// ── 정규화 ─────────────────────────────────────────────────────────────
const TLD = /\.(co\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$/i
/** 소문자 · 공백/하이픈/점/밑줄 제거 · 끝 TLD 제거("Otter.ai" → "otter"). */
export function normKey(s) {
  return String(s ?? '').normalize('NFKC').trim().replace(TLD, '').toLowerCase().replace(/[\s\-._·'’]/g, '')
}

/** 한영 병기 분리: "노션(Notion)" · "People.ai (현 Backstory)" → 원문 조각 + 라틴 덩어리 + 한글 덩어리. */
export function splitBilingual(name) {
  const out = new Set()
  for (const part of String(name ?? '').split(/[()（）/]/)) {
    const t = part.trim()
    if (!t) continue
    out.add(t)
    for (const m of t.match(/[A-Za-z][A-Za-z0-9 .+&-]*/g) ?? []) out.add(m.trim())
    for (const m of t.match(/[가-힣]+(?:\s[가-힣]+)*/g) ?? []) out.add(m.trim())
  }
  return [...out].filter(Boolean)
}

/** URL·호스트 → 제품명으로 쓸 도메인 라벨("https://www.notion.so/x" → "notion", "foo.co.kr" → "foo"). */
export function domainName(url) {
  if (!url) return null
  let host
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return null
  }
  const parts = host.replace(/^(www|m|app|apps|web)\./, '').split('.')
  if (parts.length < 2) return null
  const i = parts.length >= 3 && /^(co|or|ne|go|ac|com)$/.test(parts.at(-2)) ? parts.length - 3 : parts.length - 2
  return parts[i] || null
}

// ── 등록 사전(이미 있는 것) ─────────────────────────────────────────────
/** 파일 쪽 사전: 제품 사전 7개 파일의 products + 영역 지도 slug. */
export function loadFileRegistry(dir = DICT_DIR, areaMapFile = AREA_MAP_PATH) {
  const dictionary = fs
    .readdirSync(dir)
    .filter((f) => /^area-\d{2}-.*\.json$/.test(f))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).products ?? [])
  const areaMapSlugs = Object.keys(JSON.parse(fs.readFileSync(areaMapFile, 'utf8'))).filter((k) => !k.startsWith('_'))
  return { dictionary, areaMapSlugs }
}

const labelSlug = (label) => String(label ?? '').replace(/^([1-5]|\d{2}-[a-z0-9-]+):/, '').replace(/^(us-en|us)\|/, '')

/** 키 → 처음 등록된 출처. 앱 ID 키는 `appstore:id<digits>` · `googleplay:<pkg>`. */
export function buildRegistry({ dictionary = [], areaMapSlugs = [], projects = [], targets = [], discovery = [] }) {
  const reg = new Map()
  const add = (k, origin) => {
    if (k && k.length >= 2 && !reg.has(k)) reg.set(k, origin)
  }
  const addName = (name, origin) => {
    for (const p of splitBilingual(name)) {
      const k = normKey(p)
      add(k, origin)
      if (/[\s.-]ai$/i.test(p)) add(k.replace(/ai$/, ''), origin) // "Notion AI" → notion 도 등록
    }
  }
  const addDomain = (url, origin) => add(normKey(domainName(url)), origin)
  const addSlug = (slug, origin) => {
    add(normKey(slug), origin)
    add(normKey(String(slug ?? '').replace(/-(ai|io|app|hr)$/, '')), origin)
  }
  for (const p of dictionary) {
    addName(p.name, 'dictionary')
    addName(p.name_ko, 'dictionary')
    addSlug(p.slug, 'dictionary')
    addDomain(p.official_url, 'dictionary')
    if (p.sources?.appstore?.id) add(`appstore:id${p.sources.appstore.id}`, 'dictionary')
    if (p.sources?.googleplay?.id) add(`googleplay:${String(p.sources.googleplay.id).toLowerCase()}`, 'dictionary')
  }
  for (const s of areaMapSlugs) addSlug(s, 'area_map')
  for (const p of projects) {
    // 사전 투입 형식 "Name (한글) — 요약". 자유 문장 소개문은 앞 40자 이내 이름만 받는다.
    const pitch = p.product_elevator_pitch ?? ''
    const m = /^(.{2,40}?)\s—/.exec(pitch) ?? /^(.{2,40}?)\s\(/.exec(pitch)
    if (m) addName(m[1], 'analysis_projects')
    addDomain(p.competitor_url, 'analysis_projects')
  }
  for (const t of targets) {
    addSlug(labelSlug(t.label), 'review_targets')
    const ref = String(t.product_ref ?? '')
    let m
    if (t.source_key === 'appstore' && (m = /^[a-z]{2}:(\d+)$/.exec(ref))) add(`appstore:id${m[1]}`, 'review_targets')
    else if (t.source_key === 'googleplay' && (m = /^[a-z]{2}:[a-z]{2}:(.+)$/.exec(ref))) add(`googleplay:${m[1].toLowerCase()}`, 'review_targets')
    else if ((m = /^q:(.+)$/.exec(ref))) addName(m[1], 'review_targets')
  }
  for (const d of discovery) {
    addName(d.name, 'discovery_candidates')
    addDomain(d.homepage_url, 'discovery_candidates')
  }
  return reg
}

// ── 추출(규칙 기반) ─────────────────────────────────────────────────────
const TOK = '[가-힣A-Za-z0-9][가-힣A-Za-z0-9.+]{1,19}'
const EN_TOK = '[A-Za-z][\\w.+-]{1,29}'
const RULES = {
  apple: /apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:([^/\s?#]+)\/)?id(\d{5,})/gi,
  play: /play\.google\.com\/store\/apps\/details\?id=([A-Za-z0-9_.]+)/gi,
  url: /\bhttps?:\/\/([^\s/?#)"'<>\]]+)/gi,
  bareDomain: /(?<![\w@/.-])([A-Za-z0-9-]{2,})\.(?:co\.kr|com|io|ai|app|so|kr|net|dev)\b/g,
  capitalized: /(?<![\w@#/.'’-])([A-Z][A-Za-z0-9]*(?:[.+-][A-Za-z0-9]+)*(?:\sAI\b)?)/g,
  quoted: /[`"“「]([A-Za-z][\w .+-]{1,28})[`"”」]/g,
  koEn: /([가-힣]{2,12})\s*[(（]\s*([A-Za-z][\w .+-]{1,28}?)\s*[)）]/g,
  enKo: /([A-Za-z][\w.+-]{1,28})\s*[(（]\s*([가-힣]{2,12})\s*[)）]/g,
  // 비교 패턴 — 잡힌 이름은 compare=true
  enCompare1: new RegExp(`\\b(?:alternatives?\\s+to|instead\\s+of|switched\\s+from|moved\\s+from|migrated\\s+from|replaced|compared\\s+to)\\s+(${EN_TOK})`, 'gi'),
  vs: new RegExp(`(${TOK})\\s+(?:vs\\.?|versus)\\s+(${TOK})`, 'gi'),
  koInstead: new RegExp(`(${TOK})\\s*(?:대신(?:에)?|말고)\\s+(${TOK})`, 'g'),
  koMove: new RegExp(`(${TOK}?)에서\\s+(${TOK}?)(?:으로|로)\\s*(?:갈아|넘어|옮|바꿨|바꾸)`, 'g'),
  koUsedTo: new RegExp(`(${TOK}?)(?:을|를)?\\s*쓰다가`, 'g'),
}

const atSentenceStart = (text, i) => /(^|[.!?:;\n])\s*$/.test(text.slice(Math.max(0, i - 200), i))

function stripJosa(tok, josa) {
  if (!/[가-힣]$/.test(tok)) return tok
  for (const j of josa) if (tok.endsWith(j) && tok.length - j.length >= 2) return tok.slice(0, -j.length)
  return tok
}

/**
 * 글 하나 → 언급 목록 + 별칭쌍. 언급 = { key, surface, start, compare, person, via }.
 * 같은 key·같은 시작 위치는 한 번만 센다(규칙이 겹쳐도 언급 수가 부풀지 않게), 겹치면 compare 는 OR.
 * ponytail: 대문자 토큰은 한 단어(+" AI")만 — 여러 단어 이름("Help Scout")·한글 자유문 고유명은 못 잡는다. 후속 Sonnet 보강 단계 몫.
 */
export function extractMentions(text, cfg) {
  const josa = cfg.josa ?? []
  const raw = []
  const aliases = []
  const push = (surface, start, via, compare = false, keyOverride = null) => {
    let s = String(surface).trim().replace(/[.,]+$/, '')
    const person = /[가-힣](님|씨)$/.test(s)
    if (/[가-힣]/.test(s)) s = stripJosa(s.replace(/(님|씨)$/, ''), josa)
    const key = keyOverride ?? normKey(s)
    if (!key || key.length < 2 || /^\d+$/.test(key)) return
    raw.push({ key, surface: s, start, compare, person, via })
  }
  const each = (re, fn) => {
    re.lastIndex = 0
    for (let m; (m = re.exec(text)); ) fn(m)
  }
  each(RULES.apple, (m) => {
    const key = `appstore:id${m[2]}`
    push(m[1] ? decodeURIComponent(m[1]).replace(/-/g, ' ') : key, m.index, 'appstore', false, key)
    if (m[1]) aliases.push([normKey(decodeURIComponent(m[1])), key])
  })
  each(RULES.play, (m) => push(m[1], m.index, 'googleplay', false, `googleplay:${m[1].toLowerCase()}`))
  each(RULES.url, (m) => {
    if (/apps\.apple\.com|play\.google\.com/i.test(m[1])) return
    const d = domainName(m[1])
    if (d) push(d, m.index + m[0].indexOf(m[1]), 'domain')
  })
  each(RULES.bareDomain, (m) => push(m[1], m.index, 'domain'))
  each(RULES.capitalized, (m) => {
    if (atSentenceStart(text, m.index)) return // 문장 첫 단어는 고유명 신호가 아니다
    if (/^[A-Z]{1,3}$/.test(m[1])) return // AI·API·UI 같은 짧은 약어
    push(m[1], m.index, 'capitalized')
  })
  each(RULES.quoted, (m) => {
    if (m[1].trim().split(/\s+/).length <= 3) push(m[1], m.index + 1, 'quoted')
  })
  each(RULES.koEn, (m) => {
    push(m[2], m.index + m[0].indexOf(m[2]), 'bilingual')
    aliases.push([normKey(m[1]), normKey(m[2])])
  })
  each(RULES.enKo, (m) => {
    push(m[1], m.index, 'bilingual')
    aliases.push([normKey(m[2]), normKey(m[1])])
  })
  each(RULES.enCompare1, (m) => push(m[1], m.index + m[0].lastIndexOf(m[1]), 'compare', true))
  for (const re of [RULES.vs, RULES.koInstead, RULES.koMove]) {
    each(re, (m) => {
      push(m[1], m.index, 'compare', true)
      push(m[2], m.index + m[0].indexOf(m[2], m[1].length), 'compare', true)
    })
  }
  each(RULES.koUsedTo, (m) => push(m[1], m.index, 'compare', true))

  const byPos = new Map()
  for (const r of raw) {
    const k = `${r.key}@${r.start}`
    const prev = byPos.get(k)
    if (!prev) byPos.set(k, r)
    else {
      prev.compare ||= r.compare
      prev.person ||= r.person
    }
  }
  return { mentions: [...byPos.values()], aliases }
}

// ── 집계·판정 ───────────────────────────────────────────────────────────
export function kindOf(sourceKey, cfg) {
  const s = sourceKey ?? '(manual)'
  for (const [kind, v] of Object.entries(cfg.adopt)) if (v.sources?.includes(s)) return kind
  return cfg.default_kind
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim()
function quoteAround(text, start, max = 120) {
  const from = Math.max(0, start - 40)
  const q = oneLine(text.slice(from, from + max * 2))
  return q.length > max ? q.slice(0, max - 1) + '…' : q
}

/**
 * 순수 함수 — 입력→후보 행·대장. DB·파일을 부르지 않는다.
 * inputs: [{ id, project_id, source_key, raw_text }]
 * projectArea: project_id → { code, via, basis } | undefined
 * prior: Map<key, { date, reason }> — 지난 대장에서 rejected 였던 키
 */
export function buildCandidates({ inputs, registry, cfg, projectArea = () => undefined, prior = new Map() }) {
  const common = new Set(cfg.common_words.map(normKey))
  const stop = new Set(cfg.stopwords.map(normKey))
  const stack = new Set(cfg.stack.map(normKey))
  const persons = new Set(cfg.person_first_names.map(normKey))

  const extracted = inputs.map((inp) => ({ inp, ...extractMentions(inp.raw_text ?? '', cfg) }))
  const alias = new Map()
  for (const e of extracted) for (const [from, to] of e.aliases) if (from && to && from !== to && !alias.has(from)) alias.set(from, to)

  const cands = new Map()
  let mentionsTotal = 0
  for (const { inp, mentions } of extracted) {
    const seenHere = new Set()
    for (const m of mentions) {
      const key = alias.get(m.key) ?? m.key
      if (common.has(key)) continue
      mentionsTotal++
      const c =
        cands.get(key) ??
        cands.set(key, { key, surfaces: new Map(), posts: new Set(), sources: new Set(), byKind: {}, compareAll: true, personHits: 0, n: 0, evidence: [], areaVotes: new Map() }).get(key)
      const src = inp.source_key ?? '(manual)'
      const kind = kindOf(inp.source_key, cfg)
      const k = (c.byKind[kind] ??= { posts: new Set(), mentions: 0 })
      c.n++
      c.surfaces.set(m.surface, (c.surfaces.get(m.surface) ?? 0) + 1)
      c.compareAll &&= m.compare
      if (m.person) c.personHits++
      k.mentions++
      k.posts.add(inp.id)
      c.sources.add(src)
      if (!seenHere.has(key)) {
        seenHere.add(key)
        c.posts.add(inp.id)
        c.evidence.push({ input_id: inp.id, source: src, quote: quoteAround(inp.raw_text, m.start) })
        const a = projectArea(inp.project_id)
        const v = a ? `${a.code}|${a.via}${a.basis ? `:${a.basis}` : ''}` : 'unknown'
        c.areaVotes.set(v, (c.areaVotes.get(v) ?? 0) + 1)
      }
    }
  }

  const C = cfg.candidate
  const counts = { inputs: inputs.length, mentions: mentionsTotal, keys: cands.size, registered: 0, below: 0 }
  const rows = []
  for (const c of cands.values()) {
    const reg = registry.get(c.key)
    if (reg) {
      counts.registered++
      continue
    }
    if (!(c.posts.size >= C.min_posts || c.sources.size >= C.min_sources)) {
      counts.below++
      continue
    }
    const name = [...c.surfaces.entries()].sort((a, b) => b[1] - a[1])[0][0]
    let status = 'adopt'
    let reason = ''
    const kindLine = Object.entries(c.byKind)
      .map(([kind, v]) => {
        const rule = cfg.adopt[kind]
        const got = rule.metric === 'posts' ? v.posts.size : v.mentions
        return { kind, got, min: rule.min, metric: rule.metric, ok: got >= rule.min }
      })
    if (prior.has(c.key)) [status, reason] = ['rejected', `previously_rejected(${prior.get(c.key).date}:${prior.get(c.key).reason})`]
    else if (stop.has(c.key)) [status, reason] = ['rejected', 'stopword']
    else if (stack.has(c.key)) [status, reason] = ['rejected', 'stack']
    else if (persons.has(c.key) || c.personHits * 2 >= c.n) [status, reason] = ['rejected', 'person_name']
    else if (c.posts.size < C.min_evidence) [status, reason] = ['hold', `insufficient_evidence(${c.posts.size}<${C.min_evidence})`]
    else if (!kindLine.some((x) => x.ok))
      [status, reason] = ['hold', `below_source_threshold(${kindLine.map((x) => `${x.kind}:${x.metric}=${x.got}/${x.min}`).join(',')})`]

    // 근거 3건: 소스가 겹치지 않게 먼저 고르고 나머지로 채운다.
    const ev = []
    const used = new Set()
    for (const e of c.evidence) if (!used.has(e.source) && ev.length < 3) (used.add(e.source), ev.push(e))
    for (const e of c.evidence) if (ev.length < 3 && !ev.includes(e)) ev.push(e)

    const votes = [...c.areaVotes.entries()].sort((a, b) => b[1] - a[1])
    const top = votes.find(([v]) => v !== 'unknown')
    rows.push({
      name,
      key: c.key,
      posts: c.posts.size,
      sources: c.sources.size,
      sourceList: [...c.sources].sort(),
      mentions: c.n,
      kinds: kindLine,
      area: top ? top[0].split('|')[0] : 'unknown',
      areaBasis: votes.map(([v, n]) => `${v}×${n}`).join(', '),
      evidence: ev,
      compareOnly: c.compareAll,
      status,
      reason,
    })
  }
  const order = { adopt: 0, hold: 1, rejected: 2 }
  rows.sort((a, b) => order[a.status] - order[b.status] || b.posts - a.posts || b.mentions - a.mentions || a.key.localeCompare(b.key))
  return { rows, counts }
}

// ── 출력 ────────────────────────────────────────────────────────────────
const cell = (s) => oneLine(s).replace(/\|/g, '\\|')
const STATUS_KO = { adopt: '채택', hold: '확인불가', rejected: '기각' }

export function renderMarkdown(rows, meta) {
  const head = [
    `# 제품·회사 이름 후보 표 — ${meta.date}`,
    '',
    `규칙 ${meta.ruleVer} · 읽기 전용(SELECT 만) · LLM 0회. 입력 글 ${meta.counts.inputs}건 · 언급 ${meta.counts.mentions}건 · 키 ${meta.counts.keys}개 · 이미 등록 ${meta.counts.registered} · 후보 문턱 미달 ${meta.counts.below}.`,
    `후보 문턱: 서로 다른 글 ≥${meta.cfg.candidate.min_posts} 또는 소스 ≥${meta.cfg.candidate.min_sources} · 근거 ≥${meta.cfg.candidate.min_evidence}건. 채택 문턱은 소스 종류별(config/product-name-discovery.json adopt).`,
    `영역 열: ${meta.areaColumn}${meta.areaColumn === 'absent' ? ' (마이그 20261009000020 미적용 — 타깃 라벨 접두로 대신)' : ''}.`,
    '',
    '| 상태 | 후보명 | 정규화키 | 언급 글 수 | 소스 수 | 영역 추정(근거) | 근거 3건 | 비교대상만 | 기각·확인불가 사유 |',
    '|---|---|---|---|---|---|---|---|---|',
  ]
  const body = rows.map((r) =>
    [
      STATUS_KO[r.status],
      cell(r.name),
      `\`${cell(r.key)}\``,
      r.posts,
      `${r.sources} (${cell(r.sourceList.join(', '))})`,
      `${r.area} (${cell(r.areaBasis)})`,
      r.evidence.map((e) => `${e.input_id} · ${cell(e.source)} · "${cell(e.quote)}"`).join('<br>'),
      r.compareOnly ? '예' : '아니오',
      cell(r.reason || '-'),
    ].join(' | '),
  )
  return [...head, ...body.map((b) => `| ${b} |`), ''].join('\n')
}

export function ledgerOf(rows, meta) {
  return {
    generated_at: meta.now.toISOString(),
    date: meta.date,
    rule_ver: meta.ruleVer,
    entries: rows
      .filter((r) => r.status !== 'adopt')
      .map((r) => ({ key: r.key, name: r.name, status: r.status === 'hold' ? 'unverifiable' : 'rejected', reason: r.reason, posts: r.posts, sources: r.sourceList, evidence: r.evidence })),
  }
}

/** 지난 대장(오늘 폴더 제외)에서 rejected 였던 키. 확인불가(unverifiable)는 다시 잰다. 대장을 못 읽으면 던진다(§7.1 — 재제안 방지를 조용히 끄지 않는다). */
export function loadPriorRejected(reportsDir, today) {
  const prior = new Map()
  if (!fs.existsSync(reportsDir)) return prior
  for (const d of fs.readdirSync(reportsDir).sort()) {
    if (d === today) continue
    const f = path.join(reportsDir, d, 'rejected-candidates.json')
    if (!fs.existsSync(f)) continue
    for (const e of JSON.parse(fs.readFileSync(f, 'utf8')).entries ?? []) if (e.status === 'rejected' && !e.reason?.startsWith('previously_rejected')) prior.set(e.key, { date: d, reason: e.reason })
  }
  return prior
}

// ── DB 포트(SELECT 만) ──────────────────────────────────────────────────
const RELEVANT = 'human_verdict.eq.relevant,and(human_verdict.is.null,verdict.eq.relevant)'
async function supabasePort() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  const pages = async (build, what) => {
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999)
      if (error) throw Object.assign(new Error(`${what} 조회 실패: ${error.message}`), { code: error.code })
      rows.push(...(data ?? []))
      if ((data ?? []).length < 1000) return rows
    }
  }
  const inputCols = 'id, project_id, source_key, raw_text, purged_at'
  return {
    loadRelevant: () => pages(() => sb.from('review_relevance_verdicts').select('input_id, project_id').or(RELEVANT).order('input_id'), 'review_relevance_verdicts'),
    async loadProjects() {
      try {
        const rows = await pages(() => sb.from('analysis_projects').select('id, product_elevator_pitch, competitor_url, area_code, area_basis').order('id'), 'analysis_projects')
        return { rows, areaColumn: 'present' }
      } catch (e) {
        if (e.code !== '42703') throw e
        const rows = await pages(() => sb.from('analysis_projects').select('id, product_elevator_pitch, competitor_url').order('id'), 'analysis_projects')
        return { rows, areaColumn: 'absent' }
      }
    },
    loadTargets: () => pages(() => sb.from('review_targets').select('project_id, source_key, label, product_ref').order('id'), 'review_targets'),
    loadDiscovery: () => pages(() => sb.from('discovery_candidates').select('name, homepage_url').eq('verdict', 'accepted').order('id'), 'discovery_candidates'),
    async loadInputsByIds(ids) {
      const out = []
      for (let i = 0; i < ids.length; i += 100) out.push(...(await pages(() => sb.from('analysis_inputs').select(inputCols).in('id', ids.slice(i, i + 100)).order('id'), 'analysis_inputs(id)')))
      return out
    },
    async loadInputsByProjects(pids) {
      const out = []
      for (let i = 0; i < pids.length; i += 20) out.push(...(await pages(() => sb.from('analysis_inputs').select(inputCols).in('project_id', pids.slice(i, i + 20)).order('id'), 'analysis_inputs(project)')))
      return out
    },
  }
}

// ── 실행 ────────────────────────────────────────────────────────────────
export async function main(argv, { port, now = new Date(), reportsDir = REPORTS_DIR, fileRegistry = loadFileRegistry(), cfg = loadConfig(), log = console.log } = {}) {
  const run = argv.includes('--run')
  const date = argv.find((a) => a.startsWith('--date='))?.slice(7) ?? kstDate(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date 형식 YYYY-MM-DD: ${date}`)
  const db = port ?? (await supabasePort())

  const areaCodes = new Set(JSON.parse(fs.readFileSync(AREAS_PATH, 'utf8')).areas.filter((a) => a.kind === 'area').map((a) => a.code))
  const [relevant, proj, targets, discovery] = await Promise.all([db.loadRelevant(), db.loadProjects(), db.loadTargets(), db.loadDiscovery()])

  // 프로젝트 영역: 열 값 → 없으면 타깃 라벨 접두(한 가지일 때만). 둘 다 없으면 모름.
  const labelAreas = new Map()
  for (const t of targets) {
    const m = /^([1-5]):/.exec(t.label ?? '')
    if (m && t.project_id) (labelAreas.get(t.project_id) ?? labelAreas.set(t.project_id, new Set()).get(t.project_id)).add(m[1])
  }
  const areaById = new Map()
  for (const p of proj.rows) {
    const ls = labelAreas.get(p.id)
    if (p.area_code) areaById.set(p.id, { code: p.area_code, via: 'column', basis: p.area_basis ?? null })
    else if (ls?.size === 1) areaById.set(p.id, { code: [...ls][0], via: 'label', basis: null })
  }
  const areaProjects = [...areaById.entries()].filter(([, a]) => areaCodes.has(a.code)).map(([id]) => id)

  const relevantIds = [...new Set(relevant.map((r) => r.input_id))]
  const fetched = [...(await db.loadInputsByIds(relevantIds)), ...(await db.loadInputsByProjects(areaProjects))]
  const byId = new Map()
  let purged = 0
  for (const i of fetched) {
    if (byId.has(i.id)) continue
    if (i.purged_at || !i.raw_text) {
      purged++
      continue
    }
    byId.set(i.id, i)
  }
  const inputs = [...byId.values()]
  // 0건 입력은 "후보 없음"이 아니라 확인 대상이다(§7.1) — 표를 비운 채 성공으로 내지 않는다.
  if (inputs.length === 0) throw new Error(`입력 글 0건(relevant ${relevantIds.length}·영역 프로젝트 ${areaProjects.length}·폐기 ${purged}) — 표를 만들지 않는다`)

  const registry = buildRegistry({ ...fileRegistry, projects: proj.rows, targets, discovery })
  const prior = loadPriorRejected(reportsDir, date)
  const { rows, counts } = buildCandidates({ inputs, registry, cfg, projectArea: (id) => areaById.get(id), prior })
  const by = { adopt: 0, hold: 0, rejected: 0 }
  for (const r of rows) by[r.status]++

  const meta = { date, now, ruleVer: cfg.rule_ver, counts, cfg, areaColumn: proj.areaColumn }
  const summary = [
    `${run ? 'RUN' : 'DRY'} ${date} 규칙 ${cfg.rule_ver} · 영역 열 ${proj.areaColumn}`,
    `입력: relevant ${relevantIds.length} · 영역 프로젝트 ${areaProjects.length}개 · 합집합 글 ${inputs.length}(폐기 제외 ${purged}) · 등록 사전 키 ${registry.size} · 지난 기각 ${prior.size}`,
    `추출: 언급 ${counts.mentions} · 키 ${counts.keys} · 이미 등록 ${counts.registered} · 후보 문턱 미달 ${counts.below}`,
    `후보: 채택 ${by.adopt} · 확인불가 ${by.hold} · 기각 ${by.rejected}`,
    ...rows.filter((r) => r.status === 'adopt').slice(0, 10).map((r) => `  - ${r.name} (${r.key}) 글 ${r.posts} · 소스 ${r.sources} · 영역 ${r.area}${r.compareOnly ? ' · 비교만' : ''}`),
  ]
  let files = null
  if (run) {
    const dir = path.join(reportsDir, date)
    fs.mkdirSync(dir, { recursive: true })
    files = { md: path.join(dir, 'product-name-candidates.md'), ledger: path.join(dir, 'rejected-candidates.json') }
    fs.writeFileSync(files.md, renderMarkdown(rows, meta))
    fs.writeFileSync(files.ledger, JSON.stringify(ledgerOf(rows, meta), null, 2) + '\n')
    summary.push(`파일: ${files.md}`, `대장: ${files.ledger}`)
  }
  for (const l of summary) log(l)
  return { rows, counts, by, files }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
