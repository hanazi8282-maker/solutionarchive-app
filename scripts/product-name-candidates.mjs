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
//   node scripts/product-name-candidates.mjs --run    # 영역별 표·나머지·대장 파일 생성
//   node scripts/product-name-candidates.mjs --approval-sheet   # 승인 시트(영역별 상위 3) product-candidates-approval.md
//   옵션: --date=YYYY-MM-DD(출력 폴더, 기본 오늘 KST) · --per-area N(영역 표 상위 N, 기본 config area_table.per_area)
//
// v52(2026-10-12, 남헌 v50 §3 / v52 §1-3): 제외 6갈래(config exclude — acronym·general_noun·site_ui·tool_not_target·hardware·person_name),
//   대표 영역(+비율)별 표, 승인 시트. 시트에서 사람이 N 으로 답한 키는 다음 실행이 읽어 human_rejected 로 재제안을 막고,
//   영역별 오탐률(기각 ÷ 제시)은 approvalMode 가 판정한다(10% 초과·미답·제시 0 → 승인 모드 강제).
//
// v53(2026-10-12, 남헌 v53 §1): 사람 기각 4건 영구 제외(human_rejected_v53) · 지표 용어(metric_term) · CDN·이미지 호스트(cdn_host) ·
//   거대 기업·대형 서비스 단독 = 경쟁 기준점(status 'benchmark', 본문 밖 별도 소절, 승인 시트·기각 대장 밖) ·
//   정렬 가중치(대안 맥락 언급 · 앱스토어 출시 ≤90일 — 출시일은 --release-dates=<json> 이 있을 때만, 없으면 '확인 불가') ·
//   노트·지식관리 칸(config notes_area.products → 대표 영역 'notes', 소절 '영역 외-노트·지식관리').
//   옵션: --release-dates=<json> — {"appstore:id123": "2026-09-01"} 꼴 또는 iTunes lookup 응답({results:[{trackId, releaseDate}]}) 그대로.
//   등록(채택) 초안은 scripts/candidate-register-draft.mjs(승인 시트 → approved.json → 마이그 초안).
//
// pnc-v4(2026-10-12, 남헌 v56 §C-2): 대형 서비스는 빼지 않는다 — 경쟁 기준점(anchor) 후보로 승인 시트 별도 소절(영역 칸 'N 기준점',
//   신규 회사 하루 영역 상한·오탐률과 따로 센다). 단독 기업명(Adobe·Google 류)은 exclude.company_only 로 계속 기각.
//   부류 3갈래 tierOf(anchor·small·new) · 부류별 집계 tierStats(L4 는 정의 없음 → 미확인) · 가중 +1~3인 팀·+저가 플랜(config tiers).
//   대장 rejected-candidates.json 에 tier_stats·tier_rows(채택·기준점 행)를 더한다 — 비교 산출 scripts/competitor-anchor-compare.mjs 입력.

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

// 'notes:' = 노트·지식관리 타깃 라벨 접두(v53, candidate-register-draft.mjs).
const labelSlug = (label) => String(label ?? '').replace(/^([1-5]|notes|\d{2}-[a-z0-9-]+):/, '').replace(/^(us-en|us)\|/, '')

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
  // 대문자 단어 최대 3개 묶음("Help Scout", "Product Hunt", "Lemon Squeezy"). 두 번째부터는 2자 이상(“Zentrova I” 방지).
  capitalized: /(?<![\w@#/.'’-])([A-Z][A-Za-z0-9]*(?:[.+-][A-Za-z0-9]+)*(?:[ \t]+[A-Z][A-Za-z0-9]+(?:[.+-][A-Za-z0-9]+)*){0,2})/g,
  quoted: /[`"“「]([A-Za-z][\w .+-]{1,28})[`"”」]/g,
  koEn: /([가-힣]{2,12})\s*[(（]\s*([A-Za-z][\w .+-]{1,28}?)\s*[)）]/g,
  enKo: /([A-Za-z][\w.+-]{1,28})\s*[(（]\s*([가-힣]{2,12})\s*[)）]/g,
  // 비교 패턴 — 잡힌 이름은 compare=true. 그중 대안 맥락(갈아타기·대신·대안)은 alt=true 도(v53 정렬 가중).
  enAlt: new RegExp(`\\b(?:alternatives?\\s+to|instead\\s+of|switched\\s+from|moved\\s+from|migrated\\s+from)\\s+(${EN_TOK})`, 'gi'),
  enCompare1: new RegExp(`\\b(?:replaced|compared\\s+to)\\s+(${EN_TOK})`, 'gi'),
  vs: new RegExp(`(${TOK})\\s+(?:vs\\.?|versus)\\s+(${TOK})`, 'gi'),
  koInstead: new RegExp(`(${TOK})\\s*(?:대신(?:에)?|말고)\\s+(${TOK})`, 'g'),
  // "Evernote 대안" · "에버노트의 대안". 한글 이름은 '의' 가 붙을 때만 — "좋은 대안" 의 형용사를 이름으로 잡지 않게.
  koAlt: /([A-Za-z][\w.+-]{1,29})\s*(?:의\s*)?대안|([가-힣]{2,12})의\s*대안/g,
  koMove: new RegExp(`(${TOK}?)에서\\s+(${TOK}?)(?:으로|로)\\s*(?:갈아|넘어|옮|바꿨|바꾸)`, 'g'),
  koUsedTo: new RegExp(`(${TOK}?)(?:을|를)?\\s*쓰다가`, 'g'),
}

/** 문장 첫머리인가: 글 첫머리 또는 마지막 `. ! ? 줄바꿈` 뒤로 글자·숫자가 하나도 없다(따옴표·이모지·글머리표만 있어도 첫머리). */
const atSentenceStart = (text, i) => !/[\p{L}\p{N}]/u.test(text.slice(Math.max(0, i - 200), i).split(/[.!?\n]/).pop())

/** 수집기가 붙이는 글 머리 표식 `[YouTube 댓글 · <영상ID>]` 류를 지운다(ID·slug 가 이름으로 잡히던 오탐). 줄바꿈으로 바꿔 문장 경계로 둔다. */
export const stripHeader = (text) => String(text ?? '').replace(/\[[^[\]\n]{1,60}·[^[\]\n]{0,160}\]/g, '\n')

/**
 * 코퍼스 단어 통계(사전 없이 일반어 판별). 소문자 키 → { total, lower(전부 소문자로 나온 수), mid(문장 중간), midCap(문장 중간 대문자 시작) }.
 * 문장 = `. ! ? 줄바꿈` 으로 자른 조각, 그 첫 단어는 mid 에 안 넣는다.
 */
export function corpusStats(texts) {
  const s = new Map()
  for (const text of texts) {
    for (const sentence of text.split(/[.!?\n]/)) {
      let first = true
      for (const m of sentence.matchAll(/[\p{L}\p{N}]+/gu)) {
        const w = m[0]
        const isFirst = first
        first = false
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(w)) continue
        const lc = w.toLowerCase()
        const e = s.get(lc) ?? s.set(lc, { total: 0, lower: 0, mid: 0, midCap: 0 }).get(lc)
        e.total++
        if (w === lc) e.lower++
        if (!isFirst) {
          e.mid++
          if (w[0] !== lc[0]) e.midCap++
        }
      }
    }
  }
  return s
}

/** 영상 ID·해시 꼴: 숫자가 섞였거나, 8~12자 단일 토큰에 대문자 3개 이상(“KsmCwnvWixA” — “DocuSign”·“SurveyMonkey” 는 2개). */
export const idLike = (s) => /\d/.test(s) || (/^[A-Za-z0-9_-]{8,12}$/.test(s) && (s.match(/[A-Z]/g) ?? []).length >= 3 && /[a-z]/.test(s))

function stripJosa(tok, josa) {
  if (!/[가-힣]$/.test(tok)) return tok
  for (const j of josa) if (tok.endsWith(j) && tok.length - j.length >= 2) return tok.slice(0, -j.length)
  return tok
}

/**
 * 글 하나 → 언급 목록 + 별칭쌍. 언급 = { key, surface, start, compare, person, via }.
 * 같은 key·같은 시작 위치는 한 번만 센다(규칙이 겹쳐도 언급 수가 부풀지 않게), 겹치면 compare 는 OR.
 * ponytail: 한글 자유문 고유명(패턴·병기 밖)은 못 잡는다. 후속 Sonnet 보강 단계 몫.
 */
/** CDN·이미지 호스트인가(config cdn_host): 첫 라벨이 접두 목록이거나 등록 도메인 라벨에 contains 문자열("velcdn"). */
export function isCdnHost(host, cfg) {
  const h = String(host ?? '').toLowerCase().replace(/^www\./, '')
  const c = cfg.cdn_host ?? { prefixes: [], contains: [] }
  const reg = domainName(h) ?? ''
  return c.prefixes.includes(h.split('.')[0]) || c.contains.some((s) => reg.includes(s))
}

export function extractMentions(text, cfg) {
  const josa = cfg.josa ?? []
  const raw = []
  const aliases = []
  // ref = 등록 제안에 쓸 앱 ID·호스트(승인 시트 "제안" 칸). 이름만 잡힌 언급은 null.
  // compare: false | true | 'alt'(대안 맥락 — 비교이기도 하다).
  const push = (surface, start, via, compare = false, keyOverride = null, contraction = false, ref = null) => {
    let s = String(surface).trim().replace(/[.,]+$/, '')
    const person = /[가-힣](님|씨)$/.test(s)
    if (/[가-힣]/.test(s)) s = stripJosa(s.replace(/(님|씨)$/, ''), josa)
    const key = keyOverride ?? normKey(s)
    if (!key || key.length < 2 || /^\d+$/.test(key)) return
    raw.push({ key, surface: s, start, compare: !!compare, alt: compare === 'alt', person, contraction, vias: new Set([via]), refs: new Set(ref ? [ref] : []) })
  }
  const each = (re, fn) => {
    re.lastIndex = 0
    for (let m; (m = re.exec(text)); ) fn(m)
  }
  each(RULES.apple, (m) => {
    const key = `appstore:id${m[2]}`
    push(m[1] ? decodeURIComponent(m[1]).replace(/-/g, ' ') : key, m.index, 'appstore', false, key, false, key)
    if (m[1]) aliases.push([normKey(decodeURIComponent(m[1])), key])
  })
  each(RULES.play, (m) => push(m[1], m.index, 'googleplay', false, `googleplay:${m[1].toLowerCase()}`, false, `googleplay:${m[1].toLowerCase()}`))
  each(RULES.url, (m) => {
    if (/apps\.apple\.com|play\.google\.com/i.test(m[1])) return
    const d = domainName(m[1])
    if (!d) return
    // CDN·이미지 호스트는 제품 도메인 신호가 아니다(v53 velcdn) — 언급은 남기되 via cdn_host, ref 없음.
    if (isCdnHost(m[1], cfg)) push(d, m.index + m[0].indexOf(m[1]), 'cdn_host')
    else push(d, m.index + m[0].indexOf(m[1]), 'domain', false, null, false, m[1].toLowerCase().replace(/^www\./, ''))
  })
  each(RULES.bareDomain, (m) =>
    isCdnHost(m[0], cfg) ? push(m[1], m.index, 'cdn_host') : push(m[1], m.index, 'domain', false, null, false, m[0].toLowerCase()),
  )
  each(RULES.capitalized, (m) => {
    let s = m[1]
    let start = m.index
    if (atSentenceStart(text, start)) {
      // 문장 첫 단어는 고유명 신호가 아니다 — 묶음이면 첫 단어만 떼고 나머지를 본다.
      const rest = s.replace(/^\S+[ \t]+/, '')
      if (rest === s) return
      start += s.length - rest.length
      s = rest
    }
    if (/^[A-Z]{1,2}$/.test(s)) return // AI·UI 같은 2자 약어. 3자(LUX 같은 제품명)는 남기고 흔한 약어는 config common_words 로 거른다.
    const contraction = /^['’][a-z]/.test(text.slice(start + s.length, start + s.length + 2)) // Doesn't · Don't
    push(s, start, 'capitalized', false, null, contraction)
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
  each(RULES.enAlt, (m) => push(m[1], m.index + m[0].lastIndexOf(m[1]), 'compare', 'alt'))
  each(RULES.enCompare1, (m) => push(m[1], m.index + m[0].lastIndexOf(m[1]), 'compare', true))
  for (const [re, kind] of [[RULES.vs, true], [RULES.koInstead, 'alt'], [RULES.koMove, 'alt']]) {
    each(re, (m) => {
      push(m[1], m.index, 'compare', kind)
      push(m[2], m.index + m[0].indexOf(m[2], m[1].length), 'compare', kind)
    })
  }
  each(RULES.koAlt, (m) => push(m[1] ?? m[2], m.index, 'compare', 'alt'))
  each(RULES.koUsedTo, (m) => push(m[1], m.index, 'compare', 'alt'))

  const byPos = new Map()
  for (const r of raw) {
    const k = `${r.key}@${r.start}`
    const prev = byPos.get(k)
    if (!prev) byPos.set(k, r)
    else {
      prev.compare ||= r.compare
      prev.alt ||= r.alt
      prev.person ||= r.person
      prev.contraction ||= r.contraction
      for (const v of r.vias) prev.vias.add(v)
      for (const x of r.refs) prev.refs.add(x)
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
 * 출시일 파일(--release-dates) → Map<'appstore:id<digits>', Date>. 두 꼴을 받는다:
 *   {"appstore:id123" | "id123" | "123": "2026-09-01"} · iTunes lookup 응답 {results:[{trackId, releaseDate}]}.
 * 날짜를 못 읽는 항목은 던진다(조용히 빼면 '확인 불가'가 '오래됨'처럼 보인다).
 */
export function parseReleaseDates(json) {
  const out = new Map()
  const entries = Array.isArray(json?.results) ? json.results.map((r) => [String(r.trackId), r.releaseDate]) : Object.entries(json ?? {})
  for (const [k, v] of entries) {
    const id = /^(?:appstore:)?(?:id)?(\d{5,})$/.exec(String(k).trim())?.[1]
    const d = new Date(v)
    if (!id || Number.isNaN(d.getTime())) throw new Error(`--release-dates 항목을 못 읽음: ${k} = ${v}`)
    out.set(`appstore:id${id}`, d)
  }
  return out
}

/**
 * 순수 함수: 후보의 앱스토어 출시 신호. releaseDates=null(파일 없음)이면 확인 불가 — 가중하지 않는다.
 * → { state: 'new'|'old'|'unverified', days, why }
 */
export function releaseOf(appIds, releaseDates, now, maxDays) {
  if (!releaseDates) return { state: 'unverified', days: null, why: 'no_file' }
  if (appIds.length === 0) return { state: 'unverified', days: null, why: 'no_app_id' }
  const d = appIds.map((k) => releaseDates.get(k)).filter(Boolean).sort((a, b) => b - a)[0]
  if (!d) return { state: 'unverified', days: null, why: 'not_listed' }
  const days = Math.floor((now - d) / 86400000)
  return { state: days >= 0 && days <= maxDays ? 'new' : 'old', days, why: null }
}

/**
 * 순수 함수(pnc-v4, 남헌 v56 §C-2): 부류 3갈래.
 *   anchor = 경쟁 기준점(대형 서비스) · new = 출시 ≤N일 확인 또는 launch 표현 동반 · small = 그 밖(소형 성숙).
 * 출시일 확인 불가는 small 로 둔다 — '신규 아님'이 확인된 게 아니라 신규 근거가 없다는 뜻이다(표 칸에 확인 불가가 그대로 보인다).
 */
export function tierOf(status, release, launchN) {
  if (status === 'benchmark') return 'anchor'
  return release?.state === 'new' || launchN > 0 ? 'new' : 'small'
}
export const TIER_KO = { anchor: '(a) 경쟁 기준점', small: '(b) 소형 성숙', new: '(c) 신규·신규 창업가용' }
/** L4 는 리포에 정의가 없다(2026-10-12 grep: lib·scripts·docs·reports 0건) — 지어내지 않고 확인 불가로 둔다. 정의가 생기면 여기서 계산한다. */
export const L4_UNDEFINED = '미확인(L4 정의 없음)'

/**
 * 순수 함수: 부류별 집계 — 후보 수 · 근거 글 수(수집 건수, 부류 안 중복 제거) · 채택 · 채택률(채택 ÷ 후보) · L4 비율.
 * anchor 는 채택 판정 대상이 아니라(status benchmark) 채택률 null.
 */
export function tierStats(rows) {
  const out = {}
  for (const tier of ['anchor', 'small', 'new']) {
    const rs = rows.filter((r) => r.tier === tier)
    const posts = new Set(rs.flatMap((r) => r.postIds ?? r.evidence.map((e) => e.input_id)))
    const adopt = rs.filter((r) => r.status === 'adopt').length
    out[tier] = { candidates: rs.length, posts: posts.size, adopt, adopt_rate: tier === 'anchor' || rs.length === 0 ? null : adopt / rs.length, l4_rate: L4_UNDEFINED }
  }
  return out
}

/**
 * 순수 함수 — 입력→후보 행·대장. DB·파일을 부르지 않는다.
 * inputs: [{ id, project_id, source_key, raw_text }]
 * projectArea: project_id → { code, via, basis } | undefined
 * prior: Map<key, { date, reason }> — 지난 대장에서 rejected 였던 키
 * releaseDates: parseReleaseDates 결과 | null(파일 없음 → 출시 신호 확인 불가)
 */
export function buildCandidates({ inputs, registry, cfg, projectArea = () => undefined, prior = new Map(), releaseDates = null, now = new Date() }) {
  const common = new Set(cfg.common_words.map(normKey))
  const stop = new Set(cfg.stopwords.map(normKey))
  const stack = new Set(cfg.stack.map(normKey))
  const persons = new Set(cfg.person_first_names.map(normKey))
  // pnc-v4: 기준점은 대형 서비스만. 단독 기업명(companies)은 exclude.company_only 로 옮겨 기각한다(구 config 의 companies 는 무시).
  const bench = new Map((cfg.benchmark?.services ?? []).map((k) => [normKey(k), 'big_service']))
  const notes = new Set((cfg.notes_area?.products ?? []).map(normKey))
  const W = { alt_context: 0, new_release: 0, new_release_days: 90, indie: 0, low_price: 0, ...cfg.weights }
  const T = cfg.tiers ?? {}
  const ctxRe = Object.fromEntries(['launch', 'indie', 'low_price'].map((k) => [k, (T[k] ?? []).map((p) => new RegExp(p, 'i'))]))
  const ctxHas = (k, s) => ctxRe[k].some((re) => re.test(s))
  const cdnContains = cfg.cdn_host?.contains ?? []
  // exclude: 키 → 사유(목록 이름). 한 키가 여러 목록에 있으면 먼저 나온 목록이 이긴다(human_rejected_v53 이 맨 앞). acronym 만 조건부(아래 판정).
  const excl = new Map()
  for (const [why, list] of Object.entries(cfg.exclude ?? {})) for (const k of list) if (!excl.has(normKey(k))) excl.set(normKey(k), why)
  const acronymRe = new RegExp(cfg.acronym_rule?.pattern ?? '^$')
  const acronymExempt = new Set(cfg.acronym_rule?.exempt_signals ?? [])

  const texts = inputs.map((inp) => stripHeader(inp.raw_text))
  const stats = corpusStats(texts)
  const extracted = inputs.map((inp, i) => ({ inp, text: texts[i], ...extractMentions(texts[i], cfg) }))
  const alias = new Map()
  for (const e of extracted) for (const [from, to] of e.aliases) if (from && to && from !== to && !alias.has(from)) alias.set(from, to)

  const cands = new Map()
  let mentionsTotal = 0
  for (const { inp, text, mentions } of extracted) {
    const seenHere = new Set()
    for (const m of mentions) {
      const key = alias.get(m.key) ?? m.key
      if (common.has(key)) continue
      mentionsTotal++
      const c =
        cands.get(key) ??
        cands
          .set(key, { key, surfaces: new Map(), posts: new Set(), sources: new Set(), byKind: {}, compareAll: true, compareN: 0, altN: 0, launchN: 0, indieN: 0, priceN: 0, cdnHits: 0, vias: new Set(), refs: new Set(), personHits: 0, contrHits: 0, n: 0, evidence: [], areaVotes: new Map(), areaCodes: new Map() })
          .get(key)
      const src = inp.source_key ?? '(manual)'
      const kind = kindOf(inp.source_key, cfg)
      const k = (c.byKind[kind] ??= { posts: new Set(), mentions: 0 })
      c.n++
      c.surfaces.set(m.surface, (c.surfaces.get(m.surface) ?? 0) + 1)
      c.compareAll &&= m.compare
      if (m.compare) c.compareN++
      if (m.alt) c.altN++
      // pnc-v4 부류·가중 신호: 언급 앞뒤 window_chars 자 안의 표현(글 전체가 아니라 — 다른 제품 얘기가 섞인 긴 글에서 번지지 않게).
      const win = T.window_chars ?? 160
      const ctx = text.slice(Math.max(0, m.start - win), m.start + win)
      if (ctxHas('launch', ctx)) c.launchN++
      if (ctxHas('indie', ctx)) c.indieN++
      if (ctxHas('low_price', ctx)) c.priceN++
      if (m.vias.size === 1 && m.vias.has('cdn_host')) c.cdnHits++
      for (const v of m.vias) c.vias.add(v)
      for (const x of m.refs) c.refs.add(x)
      if (m.person) c.personHits++
      if (m.contraction) c.contrHits++
      k.mentions++
      k.posts.add(inp.id)
      c.sources.add(src)
      if (!seenHere.has(key)) {
        seenHere.add(key)
        c.posts.add(inp.id)
        c.evidence.push({ input_id: inp.id, source: src, quote: quoteAround(text, m.start) })
        const a = projectArea(inp.project_id)
        const v = a ? `${a.code}|${a.via}${a.basis ? `:${a.basis}` : ''}` : 'unknown'
        c.areaVotes.set(v, (c.areaVotes.get(v) ?? 0) + 1)
        const code = a?.code ?? 'unknown'
        c.areaCodes.set(code, (c.areaCodes.get(code) ?? 0) + 1)
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
    // 코퍼스 통계는 이름의 단어별로 본다(여러 단어 이름은 일반어 판별 = 전 단어가 일반어, 중간 대문자 = 한 단어라도).
    const words = name.split(/[ \t]+/).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    const st = words.map((w) => stats.get(w))
    const lowerRatio = st.every(Boolean) ? Math.min(...st.map((e) => e.lower / e.total)) : 0
    const midCapRatio = Math.max(0, ...st.filter((e) => e?.mid > 0).map((e) => e.midCap / e.mid))
    const fromId = c.key.includes(':') || c.vias.has('domain')
    // 제품 신호(채택 필수): 링크 · 도메인 · 비교 패턴 · 따옴표/백틱 · 문장 중간 대문자 비율 ≥ 0.8
    const signals = [
      (c.vias.has('appstore') || c.vias.has('googleplay')) && 'link',
      c.vias.has('domain') && 'domain',
      c.compareN > 0 && 'compare',
      c.vias.has('quoted') && 'quoted',
      midCapRatio >= C.midcap_ratio && 'midcap',
    ].filter(Boolean)

    const ex = excl.get(c.key)
    const toks = name.split(/[ \t]+/)
    // 성+이름 꼴: 두 토큰 모두 첫 글자만 대문자 ∧ 첫 토큰이 흔한 이름("Katherine Tingley"). "Apple Notes" 는 첫 토큰이 이름이 아니라 통과.
    const personPattern = toks.length === 2 && toks.every((w) => /^[A-Z][a-z]+$/.test(w)) && persons.has(normKey(toks[0]))
    const acronym = (ex === 'acronym' || acronymRe.test(name)) && !signals.some((s) => acronymExempt.has(s))

    // 경쟁 기준점이 맨 앞: 거대 기업·대형 서비스 단독 키는 후보가 아니라 기준점(사람 기각·불용어여도 이 소절에 보인다 — 승인 시트엔 안 나온다).
    if (bench.has(c.key)) [status, reason] = ['benchmark', bench.get(c.key)]
    else if (prior.has(c.key)) [status, reason] = ['rejected', `previously_rejected(${prior.get(c.key).date}:${prior.get(c.key).reason})`]
    else if (stop.has(c.key)) [status, reason] = ['rejected', 'stopword']
    else if (stack.has(c.key)) [status, reason] = ['rejected', 'stack']
    else if (ex && ex !== 'acronym') [status, reason] = ['rejected', ex]
    else if (persons.has(c.key) || personPattern || c.personHits * 2 >= c.n) [status, reason] = ['rejected', 'person_name']
    else if (c.contrHits * 2 >= c.n) [status, reason] = ['rejected', 'contraction']
    else if (c.cdnHits === c.n || cdnContains.some((s) => c.key.includes(s))) [status, reason] = ['rejected', 'cdn_host']
    else if (acronym) [status, reason] = ['rejected', 'acronym']
    else if (!fromId && idLike(name)) [status, reason] = ['rejected', 'id_like']
    // 도메인·앱 ID 로 잡힌 키는 소문자 비율로 거르지 않는다 — 도메인 표기("lux.io") 자체가 소문자라 비율이 스스로 오염된다.
    else if (!fromId && lowerRatio >= C.common_lower_ratio) [status, reason] = ['rejected', `common_word(lower=${lowerRatio.toFixed(2)})`]
    else if (c.posts.size < C.min_evidence) [status, reason] = ['hold', `insufficient_evidence(${c.posts.size}<${C.min_evidence})`]
    else if (signals.length === 0) [status, reason] = ['hold', `no_product_signal(midcap=${midCapRatio.toFixed(2)})`]
    else if (!kindLine.some((x) => x.ok))
      [status, reason] = ['hold', `below_source_threshold(${kindLine.map((x) => `${x.kind}:${x.metric}=${x.got}/${x.min}`).join(',')})`]

    // 근거 3건: 소스가 겹치지 않게 먼저 고르고 나머지로 채운다.
    const ev = []
    const used = new Set()
    for (const e of c.evidence) if (!used.has(e.source) && ev.length < 3) (used.add(e.source), ev.push(e))
    for (const e of c.evidence) if (ev.length < 3 && !ev.includes(e)) ev.push(e)

    const votes = [...c.areaVotes.entries()].sort((a, b) => b[1] - a[1])
    // 대표 영역 = 근거 글이 가장 많은 영역 코드(모름 제외, 동수면 코드순). 비율 분모는 모름 포함 전체 글.
    const top = [...c.areaCodes.entries()].filter(([k]) => k !== 'unknown').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    // 노트·지식관리 제품은 근거 글의 영역과 무관하게 'notes'(영역 ①~⑤ 로 억지로 넣지 않는다 — 남헌 v53). 비율 null = config 규칙.
    const isNotes = notes.has(c.key) || [...c.surfaces.keys()].some((s) => notes.has(normKey(s)))
    const refs = [...c.refs].sort()
    const release = releaseOf([c.key, ...refs].filter((k) => /^appstore:id\d+$/.test(k)), releaseDates, now, W.new_release_days)
    const score =
      signals.length + (c.altN > 0 ? W.alt_context : 0) + (release.state === 'new' ? W.new_release : 0) + (c.indieN > 0 ? W.indie : 0) + (c.priceN > 0 ? W.low_price : 0)
    rows.push({
      name,
      key: c.key,
      posts: c.posts.size,
      postIds: [...c.posts],
      sources: c.sources.size,
      sourceList: [...c.sources].sort(),
      mentions: c.n,
      kinds: kindLine,
      area: isNotes ? cfg.notes_area.code : top ? top[0] : 'unknown',
      areaShare: isNotes ? null : top ? top[1] / c.posts.size : 0,
      areaBasis: votes.map(([v, n]) => `${v}×${n}`).join(', '),
      refs,
      evidence: ev,
      compareOnly: c.compareAll,
      compareN: c.compareN,
      altN: c.altN,
      launchN: c.launchN,
      indieN: c.indieN,
      priceN: c.priceN,
      tier: tierOf(status, release, c.launchN),
      release,
      score,
      signals,
      status,
      reason,
    })
  }
  // 정렬: 상태 → 점수(신호 종류 수 + 대안 맥락 + 신규 출시) → 비교 패턴 언급 수 → 소스 수 → 글 수. 언급 수만으로 줄 세우지 않는다(일반어가 위로 온다).
  const order = { adopt: 0, hold: 1, benchmark: 2, rejected: 3 }
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      b.score - a.score ||
      b.compareN - a.compareN ||
      b.sources - a.sources ||
      b.posts - a.posts ||
      a.key.localeCompare(b.key),
  )
  return { rows, counts }
}

// ── 출력 ────────────────────────────────────────────────────────────────
const cell = (s) => oneLine(s).replace(/\|/g, '\\|')
const STATUS_KO = { adopt: '채택', hold: '확인불가', rejected: '기각', benchmark: '경쟁 기준점' }

/** 기각·확인불가 사유별 건수(괄호 안 세부값은 뗀다). 경쟁 기준점은 기각이 아니라 빼고 센다. */
export function reasonSummary(rows) {
  const by = {}
  for (const r of rows) if (r.status === 'hold' || r.status === 'rejected') by[r.reason.replace(/\(.*$/, '')] = (by[r.reason.replace(/\(.*$/, '')] ?? 0) + 1
  return Object.entries(by).sort((a, b) => b[1] - a[1])
}

// null = 비율이 아니라 config 규칙으로 정한 영역(notes).
const pct = (x) => (x == null ? 'config' : `${Math.round(x * 100)}%`)
const areaLabel = (code, names = {}) => names[code] ?? (code === 'unknown' ? '영역 모름' : code)
const RELEASE_KO = { no_file: '확인 불가(출시일 파일 없음)', no_app_id: '확인 불가(앱 ID 없음)', not_listed: '확인 불가(파일에 없음)' }
/** 가중 칸: "대안 n · 출시 …". */
const weightCell = (r) => `대안 ${r.altN ?? 0} · 1~3인팀 ${r.indieN ?? 0} · 저가 ${r.priceN ?? 0} · ${r.release?.state === 'new' ? `신규 출시 ${r.release.days}일` : r.release?.state === 'old' ? `출시 ${r.release.days}일 전` : RELEASE_KO[r.release?.why] ?? '확인 불가'}`

/** 채택 행을 대표 영역별로 묶는다(행 순서 = 이미 신호 강도 순). 순서: cfg.area_table.order → 그 밖(hold·unknown 등) 코드순. 각 영역 상위 limit. */
export function groupByArea(rows, order, limit = Infinity) {
  const by = new Map()
  for (const r of rows) if (r.status === 'adopt') (by.get(r.area) ?? by.set(r.area, []).get(r.area)).push(r)
  const codes = [...order.filter((c) => by.has(c)), ...[...by.keys()].filter((c) => !order.includes(c)).sort()]
  return codes.map((code) => ({ code, total: by.get(code).length, rows: by.get(code).slice(0, limit) }))
}

const COLS = [
  '| 상태 | 후보명 | 정규화키 | 언급 글 수 | 소스 수 | 제품 신호 | 가중(대안 맥락 · 1~3인 팀 · 저가 · 출시) | 대표 영역(비율 · 근거) | 근거 3건 | 비교대상만 | 기각·확인불가 사유 | 부류 |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
]
const rowLine = (r) =>
  `| ${[
    STATUS_KO[r.status],
    cell(r.name),
    `\`${cell(r.key)}\``,
    r.posts,
    `${r.sources} (${cell(r.sourceList.join(', '))})`,
    r.signals.join(', ') || '-',
    weightCell(r),
    `${r.area} ${pct(r.areaShare)} (${cell(r.areaBasis)})`,
    r.evidence.map((e) => `${e.input_id} · ${cell(e.source)} · "${cell(e.quote)}"`).join('<br>'),
    r.compareOnly ? '예' : '아니오',
    cell(r.reason || '-'),
    `${TIER_KO[r.tier] ?? '-'}${r.launchN ? ` (출시 표현 ${r.launchN})` : ''}`,
  ].join(' | ')} |`

/** 부류별 집계 표(pnc-v4). */
export function renderTierStats(rows) {
  const s = tierStats(rows)
  const rate = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`)
  return [
    '## 부류별 집계 (a 경쟁 기준점 · b 소형 성숙 · c 신규·신규 창업가용)',
    '',
    '부류 판정: (a) config benchmark.services · (c) 출시 ≤90일 확인(--release-dates) 또는 언급 앞뒤 launch 표현(config tiers.launch) · (b) 그 밖. 수집 건수 = 그 부류 후보들의 근거 글(중복 제거). 채택률 = 채택 ÷ 후보(기준점은 채택 판정 대상 아님).',
    '',
    '| 부류 | 후보 수 | 수집 건수(근거 글) | 채택 | 채택률 | L4 비율 |',
    '|---|---|---|---|---|---|',
    ...Object.entries(s).map(([k, v]) => `| ${TIER_KO[k]} | ${v.candidates} | ${v.posts} | ${k === 'anchor' ? '-' : v.adopt} | ${rate(v.adopt_rate)} | ${v.l4_rate} |`),
    '',
  ]
}

/** part: 'top'(요약 + 영역별 채택 상위 perArea) | 'rest'(영역 표에 안 오른 나머지 전부 — 채택 초과분·확인불가·기각). */
export function renderMarkdown(rows, meta, part = 'top') {
  const perArea = meta.perArea ?? meta.cfg.area_table.per_area
  const groups = groupByArea(rows, meta.cfg.area_table.order, perArea)
  const bench = rows.filter((r) => r.status === 'benchmark')
  const shownKeys = new Set([...groups.flatMap((g) => g.rows.map((r) => r.key)), ...bench.map((r) => r.key)])
  if (part === 'rest') {
    const rest = rows.filter((r) => !shownKeys.has(r.key))
    return [`# 제품·회사 이름 후보 표(나머지) — ${meta.date}`, '', `영역별 표에 안 오른 ${rest.length}행(영역당 상위 ${perArea} 초과 채택 · 확인불가 · 기각). 요약은 product-name-candidates.md.`, '', ...COLS, ...rest.map(rowLine), ''].join('\n')
  }
  const by = { adopt: 0, hold: 0, rejected: 0, benchmark: 0 }
  for (const r of rows) by[r.status]++
  const out = [
    `# 제품·회사 이름 후보 표 — ${meta.date}`,
    '',
    `규칙 ${meta.ruleVer} · 읽기 전용(SELECT 만) · LLM 0회. 입력 글 ${meta.counts.inputs}건 · 언급 ${meta.counts.mentions}건 · 키 ${meta.counts.keys}개 · 이미 등록 ${meta.counts.registered} · 후보 문턱 미달 ${meta.counts.below}.`,
    `후보 문턱: 서로 다른 글 ≥${meta.cfg.candidate.min_posts} 또는 소스 ≥${meta.cfg.candidate.min_sources} · 근거 ≥${meta.cfg.candidate.min_evidence}건. 채택 = 소스 종류별 문턱(config adopt) ∧ 제품 신호 ≥1(link·domain·compare·quoted·midcap) ∧ 제외 목록(config exclude) 밖.`,
    `영역 열: ${meta.areaColumn}${meta.areaColumn === 'absent' ? ' (마이그 20261009000020 미적용 — 타깃 라벨 접두로 대신)' : ''}. 대표 영역 = 근거 글이 가장 많은 영역, 비율 = 그 영역 글 ÷ 전체 근거 글.`,
    '',
    `**채택 ${by.adopt} · 확인불가 ${by.hold} · 기각 ${by.rejected} · 경쟁 기준점 ${by.benchmark}** — 기각·확인불가 사유별: ${reasonSummary(rows).map(([k, n]) => `${k} ${n}`).join(' · ') || '없음'}`,
    `영역별 채택 상위 ${perArea}(정렬: 점수 = 신호 종류 수 + 대안 맥락(${meta.cfg.weights?.alt_context ?? 0}) + 출시 ≤${meta.cfg.weights?.new_release_days ?? 90}일(${meta.cfg.weights?.new_release ?? 0}) → 비교 패턴 언급 수 → 소스 수 → 글 수). 출시일: ${meta.releaseFile ? `--release-dates ${meta.releaseFile}` : '파일 없음 → 전부 확인 불가(가중 0)'}. 나머지 ${rows.length - shownKeys.size}행은 product-name-candidates-rest.md.`,
    '',
    ...renderTierStats(rows),
  ]
  if (groups.length === 0) out.push('채택 후보 없음.', '')
  for (const g of groups) out.push(`## ${areaLabel(g.code, meta.areaNames)} — 채택 ${g.total}${g.total > g.rows.length ? ` (상위 ${g.rows.length})` : ''}`, '', ...COLS, ...g.rows.map(rowLine), '')
  if (bench.length) out.push(`## 경쟁 기준점(anchor) — ${bench.length}(대형 서비스 단독, config benchmark.services — 제외하지 않는다. 승인 시트 별도 소절에 영역당 ${meta.cfg.benchmark?.sheet_cap_per_area ?? 0}개까지)`, '', ...COLS, ...bench.map(rowLine), '')
  return out.join('\n')
}

// ── 승인 시트 · 오탐률 ───────────────────────────────────────────────────
export const SHEET_FILE = 'product-candidates-approval.md'
const ANSWER_BLANK = '승인 Y / 기각 N'

/** 답 칸 판독: 정확히 Y/승인 → approved, N/기각(뒤에 ":" 사유 허용) → rejected, 그 밖(빈칸·기본 문구) → unanswered. */
export function readAnswer(s) {
  const a = String(s ?? '').trim()
  if (/^(y|승인)$/i.test(a)) return 'approved'
  if (/^(n|기각)(\s*[:：-].*)?$/i.test(a)) return 'rejected'
  return 'unanswered'
}

export function renderApprovalSheet(rows, meta) {
  const A = meta.cfg.approval
  const groups = groupByArea(rows, meta.cfg.area_table.order, A.daily_cap_per_area)
  const prev = meta.priorSheet
  const out = [
    `# 제품 이름 후보 승인 시트 — ${meta.date}`,
    '',
    `규칙 ${meta.ruleVer} · 영역별 채택 상위 ${A.daily_cap_per_area}개만(하루 영역별 상한, config approval.daily_cap_per_area). 읽기 전용 실행 결과다 — 여기서 Y 를 적어도 DB 에 아무것도 등록되지 않는다.`,
    '',
    '**답 쓰는 법:** 마지막 칸 `승인 Y / 기각 N` 을 지우고 `Y` 또는 `N` 한 글자만(기각 사유는 `N: 사유`). 다른 칸은 고치지 않는다 — 다음 실행이 `정규화키` 칸으로 읽는다.',
    `**오탐률 = 사람이 기각(N)한 수 ÷ 제시한 수** (영역별·시트 하루 단위). ${pct(A.max_false_positive_rate)} 를 넘거나, 답이 빈 줄이 있거나, 제시가 0이면 그 영역은 승인 모드 강제(approval). N 으로 기각한 키는 다음 실행부터 후보에 다시 오르지 않는다(사유 human_rejected).`,
    '',
    prev
      ? `지난 시트(${prev.date}) 영역별: ${Object.entries(prev.stats).map(([a, s]) => { const m = approvalMode(a, prev.stats, A.max_false_positive_rate); return `${a} 제시 ${s.shown}·기각 ${s.rejected}·미답 ${s.unanswered} → ${m.mode}(${m.reason})` }).join(' · ') || '제시 없음'}`
      : '지난 시트 없음 — 모든 영역 승인 모드(측정 전).',
    '',
  ]
  if (groups.length === 0) out.push('제시할 채택 후보 없음.', '')
  let no = 0
  const HEAD = ['| 번호 | 후보명 | 정규화키 | 영역 | 근거 글 3건(원문 80자) | 신호 | 제안 | 답 |', '|---|---|---|---|---|---|---|---|']
  const line = (r, areaCell) => {
    const q = r.evidence.map((e) => `${cell(e.source)} · "${cell(e.quote.length > A.quote_chars ? e.quote.slice(0, A.quote_chars - 1) + '…' : e.quote)}"`).join('<br>')
    const proposal = r.refs.length ? `등록 후보: ${cell(r.refs.join(', '))}` : '등록 후보: 이름만(앱 ID·도메인 없음 — 수동 확인)'
    return `| ${++no} | ${cell(r.name)} | \`${cell(r.key)}\` | ${areaCell} | ${q} | ${r.signals.join(', ') || '-'} | ${proposal} | ${ANSWER_BLANK} |`
  }
  for (const g of groups) {
    out.push(`## ${areaLabel(g.code, meta.areaNames)} — 제시 ${g.rows.length} / 채택 ${g.total}`, '', ...HEAD)
    for (const r of g.rows) out.push(line(r, `${r.area} ${pct(r.areaShare)}`))
    out.push('')
  }
  // pnc-v4: 경쟁 기준점 후보는 별도 소절. 영역 칸에 '기준점' 표식 → parseApprovalSheet 가 anchor 로 읽고 sheetStats(오탐률·승인 모드)에서 뺀다.
  //   위 신규 회사 후보의 하루 영역 상한(daily_cap_per_area)과 따로 센다. 사람이 N 한 기준점은 다시 안 올린다.
  const capA = meta.cfg.benchmark?.sheet_cap_per_area ?? 0
  const anchors = groupByArea(
    rows.filter((r) => r.status === 'benchmark' && !meta.humanRejected?.has(r.key)).map((r) => ({ ...r, status: 'adopt' })),
    meta.cfg.area_table.order,
    capA,
  )
  if (capA > 0 && anchors.length) {
    out.push(`## 경쟁 기준점 후보(anchor) — 별도 표시 · 하루 영역 상한·오탐률에 안 셈 · 영역당 ${capA}개`, '', '승인(Y)하면 대형 서비스를 비교 기준점으로 등록·수집한다. 소형·신규 후보와 섞어 세지 않는다.', '', ...HEAD)
    for (const g of anchors) for (const r of g.rows) out.push(line(r, `${r.area} 기준점`))
    out.push('')
  }
  return out.join('\n')
}

/** 시트 마크다운 → [{ no, key, area, answer }]. 번호로 시작하는 표 줄만 읽는다. */
export function parseApprovalSheet(md) {
  const out = []
  for (const l of String(md).split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(l)) continue
    const c = l.split(/(?<!\\)\|/).slice(1, -1).map((x) => x.trim())
    if (c.length !== 8) continue
    out.push({ no: Number(c[0]), name: c[1].replace(/\\\|/g, '|'), key: c[2].replace(/^`|`$/g, '').replace(/\\\|/g, '|'), area: c[3].split(/\s+/)[0], anchor: /기준점/.test(c[3]), proposal: c[6].replace(/\\\|/g, '|'), answer: readAnswer(c[7]) })
  }
  return out
}

/** 시트 항목 → 영역별 { shown, approved, rejected, unanswered }. 경쟁 기준점(anchor) 줄은 신규 회사 후보 오탐률에 섞지 않는다(pnc-v4). */
export function sheetStats(entries) {
  const s = {}
  for (const e of entries) {
    if (e.anchor) continue
    const a = (s[e.area] ??= { shown: 0, approved: 0, rejected: 0, unanswered: 0 })
    a.shown++
    a[e.answer]++
  }
  return s
}

/**
 * 순수 함수: 영역의 승인 모드. approval(사람 승인 강제) | auto(오탐률 문턱 이하).
 * 측정 못 한 경우(제시 0·답 빈 줄)는 auto 로 접지 않는다(§7.1).
 */
export function approvalMode(area, stats, maxRate = 0.1) {
  const s = stats?.[area]
  if (!s || !s.shown) return { mode: 'approval', rate: null, reason: 'no_data' }
  if (s.unanswered > 0) return { mode: 'approval', rate: null, reason: 'unanswered' }
  const rate = s.rejected / s.shown
  return rate > maxRate ? { mode: 'approval', rate, reason: 'fp_rate' } : { mode: 'auto', rate, reason: 'fp_rate_ok' }
}

export function ledgerOf(rows, meta) {
  const prev = meta.priorSheet
  return {
    generated_at: meta.now.toISOString(),
    date: meta.date,
    rule_ver: meta.ruleVer,
    by_reason: Object.fromEntries(reasonSummary(rows)),
    entries: rows
      .filter((r) => r.status !== 'adopt')
      // benchmark 는 'rejected' 가 아니다 — 다음 실행이 previously_rejected 로 굳히지 않고 매번 다시 잰다.
      .map((r) => ({ key: r.key, name: r.name, status: r.status === 'hold' ? 'unverifiable' : r.status, reason: r.reason, posts: r.posts, sources: r.sourceList, evidence: r.evidence })),
    // 승인 시트에서 사람이 N 으로 기각한 키(지난 시트 전부). 시트 파일이 지워져도 재제안 방지가 남도록 대장에 옮겨 둔다.
    human_rejected: [...(meta.humanRejected ?? new Map()).entries()].map(([key, v]) => ({ key, name: v.name, area: v.area, sheet_date: v.date, reason: 'human_rejected' })),
    false_positive: prev
      ? { sheet_date: prev.date, by_area: Object.fromEntries(Object.entries(prev.stats).map(([a, s]) => [a, { ...s, ...approvalMode(a, prev.stats, meta.cfg.approval.max_false_positive_rate) }])) }
      : null,
    // pnc-v4: 부류별 집계 + 채택·기준점 행(비교 산출 scripts/competitor-anchor-compare.mjs 가 읽는다). entries(재제안 방지)와 의미가 달라 따로 둔다.
    tier_stats: tierStats(rows),
    tier_rows: rows
      .filter((r) => r.status === 'adopt' || r.status === 'benchmark')
      .map((r) => ({ key: r.key, name: r.name, status: r.status, tier: r.tier, area: r.area, score: r.score, altN: r.altN, launchN: r.launchN, indieN: r.indieN, priceN: r.priceN, release: r.release, refs: r.refs, evidence: r.evidence })),
  }
}

/**
 * 지난 실행(오늘 폴더 제외)의 기각 기록.
 * - 대장 rejected-candidates.json: entries 의 rejected(확인불가는 다시 잰다) + human_rejected.
 * - 승인 시트: N 답 → human_rejected. 가장 최근(오늘 이전) 시트의 영역별 통계는 latestSheet.
 * 파일을 못 읽으면 던진다(§7.1 — 재제안 방지를 조용히 끄지 않는다).
 */
export function loadPriorRejected(reportsDir, today) {
  const prior = new Map()
  const human = new Map()
  let latestSheet = null
  if (!fs.existsSync(reportsDir)) return { prior, human, latestSheet }
  for (const d of fs.readdirSync(reportsDir).sort()) {
    if (d === today) continue
    const f = path.join(reportsDir, d, 'rejected-candidates.json')
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'))
      for (const e of j.entries ?? []) if (e.status === 'rejected' && !e.reason?.startsWith('previously_rejected')) prior.set(e.key, { date: d, reason: e.reason })
      for (const e of j.human_rejected ?? []) human.set(e.key, { date: e.sheet_date ?? d, name: e.name, area: e.area })
    }
    const sf = path.join(reportsDir, d, SHEET_FILE)
    if (fs.existsSync(sf)) {
      const entries = parseApprovalSheet(fs.readFileSync(sf, 'utf8'))
      for (const e of entries) if (e.answer === 'rejected') human.set(e.key, { date: d, name: e.name, area: e.area })
      if (d < today) latestSheet = { date: d, stats: sheetStats(entries) }
    }
  }
  for (const [k, v] of human) prior.set(k, { date: v.date, reason: 'human_rejected' })
  return { prior, human, latestSheet }
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
  const sheet = argv.includes('--approval-sheet')
  const pa = argv.findIndex((a) => a === '--per-area' || a.startsWith('--per-area='))
  const perArea = pa < 0 ? cfg.area_table.per_area : Number(argv[pa].includes('=') ? argv[pa].split('=')[1] : argv[pa + 1])
  if (!Number.isInteger(perArea) || perArea < 1) throw new Error(`--per-area 는 1 이상 정수: ${argv[pa]}`)
  const date = argv.find((a) => a.startsWith('--date='))?.slice(7) ?? kstDate(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date 형식 YYYY-MM-DD: ${date}`)
  // 출시일 파일: 주면 반드시 읽혀야 한다(못 읽으면 던진다), 안 주면 null → 전부 '확인 불가'.
  const releaseFile = argv.find((a) => a.startsWith('--release-dates='))?.slice(16) ?? null
  const releaseDates = releaseFile ? parseReleaseDates(JSON.parse(fs.readFileSync(releaseFile, 'utf8'))) : null
  const db = port ?? (await supabasePort())

  const areasCfg = JSON.parse(fs.readFileSync(AREAS_PATH, 'utf8')).areas
  const areaCodes = new Set(areasCfg.filter((a) => a.kind === 'area').map((a) => a.code))
  const areaNames = { ...Object.fromEntries(areasCfg.map((a) => [a.code, a.name])), ...(cfg.notes_area ? { [cfg.notes_area.code]: cfg.notes_area.label } : {}) }
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
  const { prior, human, latestSheet } = loadPriorRejected(reportsDir, date)
  const { rows, counts } = buildCandidates({ inputs, registry, cfg, projectArea: (id) => areaById.get(id), prior, releaseDates, now })
  const by = { adopt: 0, hold: 0, rejected: 0, benchmark: 0 }
  for (const r of rows) by[r.status]++

  const meta = { date, now, ruleVer: cfg.rule_ver, counts, cfg, areaColumn: proj.areaColumn, areaNames, perArea, priorSheet: latestSheet, humanRejected: human, releaseFile }
  const summary = [
    `${run ? 'RUN' : sheet ? 'SHEET' : 'DRY'} ${date} 규칙 ${cfg.rule_ver} · 영역 열 ${proj.areaColumn}`,
    `입력: relevant ${relevantIds.length} · 영역 프로젝트 ${areaProjects.length}개 · 합집합 글 ${inputs.length}(폐기 제외 ${purged}) · 등록 사전 키 ${registry.size} · 지난 기각 ${prior.size}(사람 기각 ${human.size}) · 지난 시트 ${latestSheet?.date ?? '없음'}`,
    `추출: 언급 ${counts.mentions} · 키 ${counts.keys} · 이미 등록 ${counts.registered} · 후보 문턱 미달 ${counts.below}`,
    `후보: 채택 ${by.adopt} · 확인불가 ${by.hold} · 기각 ${by.rejected} · 경쟁 기준점 ${by.benchmark}(${rows.filter((r) => r.status === 'benchmark').map((r) => r.name).join(', ') || '-'}) · 출시일 ${releaseFile ? `${releaseDates.size}개 앱` : '파일 없음(확인 불가)'}`,
    `사유별: ${reasonSummary(rows).map(([k, n]) => `${k} ${n}`).join(' · ') || '없음'}`,
    `부류별: ${Object.entries(tierStats(rows)).map(([k, v]) => `${TIER_KO[k]} 후보 ${v.candidates}·글 ${v.posts}·채택 ${k === 'anchor' ? '-' : v.adopt}`).join(' · ')} · L4 ${L4_UNDEFINED}`,
    ...groupByArea(rows, cfg.area_table.order, 3).flatMap((g) => [
      `[${areaNames[g.code] ?? g.code}] 채택 ${g.total} · 승인 모드 ${approvalMode(g.code, latestSheet?.stats, cfg.approval.max_false_positive_rate).mode}`,
      ...g.rows.map((r) => `  - ${r.name} (${r.key}) 신호 ${r.signals.join('+')} · 글 ${r.posts} · 소스 ${r.sources} · 영역 ${r.area} ${pct(r.areaShare)}${r.compareOnly ? ' · 비교만' : ''}`),
    ]),
  ]
  let files = null
  const dir = path.join(reportsDir, date)
  if (run || sheet) {
    fs.mkdirSync(dir, { recursive: true })
    files = {}
  }
  if (run) {
    Object.assign(files, { md: path.join(dir, 'product-name-candidates.md'), rest: path.join(dir, 'product-name-candidates-rest.md'), ledger: path.join(dir, 'rejected-candidates.json') })
    fs.writeFileSync(files.md, renderMarkdown(rows, meta, 'top'))
    fs.writeFileSync(files.rest, renderMarkdown(rows, meta, 'rest'))
    fs.writeFileSync(files.ledger, JSON.stringify(ledgerOf(rows, meta), null, 2) + '\n')
    summary.push(`파일: ${files.md} (+ ${path.basename(files.rest)})`, `대장: ${files.ledger}`)
  }
  if (sheet) {
    files.sheet = path.join(dir, SHEET_FILE)
    // 사람이 이미 답을 적은 오늘 시트를 덮어쓰면 답이 사라진다 — 멈춘다.
    const answered = fs.existsSync(files.sheet) ? parseApprovalSheet(fs.readFileSync(files.sheet, 'utf8')).filter((e) => e.answer !== 'unanswered').length : 0
    if (answered > 0) throw new Error(`오늘 승인 시트에 답 ${answered}건이 있다 — 덮어쓰지 않는다: ${files.sheet}`)
    fs.writeFileSync(files.sheet, renderApprovalSheet(rows, meta))
    summary.push(`승인 시트: ${files.sheet}`)
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
