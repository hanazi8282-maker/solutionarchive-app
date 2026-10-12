#!/usr/bin/env node
// 경쟁 기준점(anchor) 프로파일 + 소형·신규 비교 한 장 — 남헌 v56 §C-2 4·5(2026-10-12). 읽기 전용, LLM 0회, 네트워크 0회.
//
// 의도: 대형 서비스의 위치·마케팅을 알아야 소형·신규의 장단점과 "우리가 파고들 경쟁 장점"을 그것과 비교해 뽑을 수 있다.
//
// 입력(전부 이미 있는 것만 — 새로 긁지 않는다):
//   기준점 = 제품 사전(reports/2026-10-05/product-dictionary) × 영역 지도(data/area-map-v26.json)에서 영역별 상위 N.
//            순위 근거 = 사전 selection_basis 의 앱스토어 평가 수("평가 N건", iTunes Lookup 2026-10-05 실측). 평가 수가 없는 제품은
//            순위에 안 넣는다(규모 미확인 — 지어내지 않는다).
//   위치    = 핵심 기능 주장: 사전 summary_ko(사전 조사 시 공식 홈페이지 근거) · 가격대·타깃: competitor_profile_snapshots 최신 행의
//            pricing·positioning 주장(근거 input_id 포함) — --db 일 때만 읽는다(SELECT). 없으면 '미확인'.
//   마케팅  = 채널: 사전 sources 중 status '확인'(스토어 URL) · 랜딩 문구·요금제 구조·무료 체험·스토어 설명 핵심 문구:
//            --public-notes=<json>(사람·세션이 공개 페이지에서 옮겨 적은 것, 항목마다 url 필수)에서만. 없으면 '미확인'.
//   소형·신규 = 후보 대장 reports/<날짜>/rejected-candidates.json 의 tier_rows(scripts/product-name-candidates.mjs --run, pnc-v4).
// 비교 = 근거 인용(원문 120자)에서 갈아타기 방향을 규칙으로 읽는다: "X 에서 Y 로 / switched from X to Y / Y instead of X / X 대신 Y".
//   기준점 → 후보 = 후보 장점 근거, 후보 → 다른 것 = 후보 단점 근거. 방향이 안 읽히면 '미확인'(판정하지 않는다).
//
// 사용법:
//   node scripts/competitor-anchor-compare.mjs                     # 드라이런(기본): 건수만 콘솔, 파일·DB·네트워크 0
//   node scripts/competitor-anchor-compare.mjs --run [--db]        # reports/<KST>/anchor-compare-<영역>.md (영역 기본 config anchor_profile.areas)
//   옵션: --areas=1,2 · --ledger=<rejected-candidates.json>(기본: reports/ 아래 최신) · --public-notes=<json> · --date=YYYY-MM-DD
// 출력 파일은 리뷰 원문 인용이 들어가 .gitignore(reports/*/anchor-compare-*.md) — 커밋하지 않는다.
//
// ⚠️ DB 는 --db 일 때 SELECT 만(셀프테스트가 쓰기 경로 0 을 정적으로 검사). 서브에이전트·무인 루프는 --db 없이 돈다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { kstDate, loadConfig, normKey, REPORTS_DIR, TIER_KO } from './product-name-candidates.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DICT_DIR = path.join(repoRoot, 'reports', '2026-10-05', 'product-dictionary')
const AREA_MAP_PATH = path.join(repoRoot, 'data', 'area-map-v26.json')
const AREAS_PATH = path.join(repoRoot, 'config', 'areas.json')
export const UNKNOWN = '미확인'
const NOTE_FIELDS = { landing_copy: '공개 랜딩 문구', plans: '요금제 구조', free_trial: '무료 체험', store_copy: '스토어 설명 핵심 문구' }
const CHANNEL_KO = { appstore: 'App Store', googleplay: 'Google Play', shopify_apps: 'Shopify 앱스토어', capterra: 'Capterra', trustradius: 'TrustRadius' }

// ── 기준점 고르기 ───────────────────────────────────────────────────────
/** selection_basis → 앱스토어 평가 수. 못 읽으면 null(0 이 아니다). */
export function ratingCountOf(basis) {
  const m = /평가\s*([\d,]+)\s*건/.exec(String(basis ?? ''))
  return m ? Number(m[1].replace(/,/g, '')) : null
}

export function loadDictionary(dir = DICT_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^area-\d{2}-.*\.json$/.test(f))
    .flatMap((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      return (j.products ?? []).map((p) => ({ ...p, _file: f, _researched_at: j.researched_at ?? null }))
    })
}

/** 순수 함수: 영역 → 기준점 상위 topN(평가 수 내림차순). 평가 수 없는 제품 수도 함께 돌려준다(미확인 건수). */
export function pickAnchors(dictionary, areaMap, area, topN) {
  const inArea = dictionary.filter((p) => String(areaMap[p.slug]) === String(area))
  const ranked = inArea
    .map((p) => ({ p, ratings: ratingCountOf(p.selection_basis) }))
    .filter((x) => x.ratings != null)
    .sort((a, b) => b.ratings - a.ratings || a.p.slug.localeCompare(b.p.slug))
  return { anchors: ranked.slice(0, topN), inArea: inArea.length, unranked: inArea.length - ranked.length }
}

// ── 프로파일 ────────────────────────────────────────────────────────────
const claimsCell = (claims) =>
  claims?.length ? claims.map((c) => `${c.claim} (근거 ${c.evidence.map((e) => e.input_id).join(', ')})`).join('<br>') : null

/**
 * 순수 함수: 기준점 1개 → 프로파일 칸 목록 [{ group, field, value, source }]. 값이 없으면 value '미확인' + 왜 없는지 source.
 * snapshot = { status, created_at, sections } | { missing: '사유' } | undefined(--db 아님).
 */
export function profileOf(anchor, { snapshot, notes } = {}) {
  const p = anchor.p
  const snapWhy = snapshot === undefined ? '--db 없이 실행(스냅샷 안 읽음)' : snapshot.missing ?? null
  const snapSrc = snapshot && !snapshot.missing ? `competitor_profile_snapshots ${snapshot.created_at?.slice(0, 10)} (${snapshot.status})` : null
  const fromSnap = (sec) => {
    const v = snapSrc ? claimsCell(snapshot.sections?.[sec]) : null
    return v ? { value: v, source: snapSrc } : { value: UNKNOWN, source: snapWhy ?? `스냅샷에 ${sec} 주장 없음` }
  }
  const channels = Object.entries(p.sources ?? {}).filter(([, s]) => s?.status === '확인' && s.url)
  const note = (k) => {
    const n = notes?.[k]
    return n ? { value: n.text, source: n.url } : { value: UNKNOWN, source: '공개 자료 메모(--public-notes)에 없음' }
  }
  return [
    { group: '규모 근거', field: '앱스토어 평가 수', value: anchor.ratings.toLocaleString('en-US'), source: `제품 사전 selection_basis: ${p.selection_basis}` },
    { group: '위치', field: '핵심 기능 주장', value: p.summary_ko || UNKNOWN, source: p.summary_ko ? `제품 사전 ${p._file}(${p._researched_at ?? '조사일 미기재'}) · ${p.official_url ?? '공식 URL 없음'}` : '사전에 요약 없음' },
    { group: '위치', field: '가격대', ...fromSnap('pricing') },
    { group: '위치', field: '타깃', ...fromSnap('positioning') },
    ...Object.entries(NOTE_FIELDS).map(([k, label]) => ({ group: '마케팅', field: label, ...note(k) })),
    {
      group: '마케팅',
      field: '채널',
      value: channels.length ? channels.map(([k]) => CHANNEL_KO[k] ?? k).join(' · ') : UNKNOWN,
      source: channels.length ? channels.map(([, s]) => s.url).join('<br>') : '사전에 확인된 스토어 채널 없음',
    },
  ]
}

/** --public-notes JSON 검증: { slug: { landing_copy|plans|free_trial|store_copy: { text, url } } }. url 없는 항목은 던진다(출처 없는 칸 금지). */
export function parsePublicNotes(json) {
  const out = {}
  for (const [slug, fields] of Object.entries(json ?? {})) {
    if (slug.startsWith('_')) continue
    for (const [k, v] of Object.entries(fields ?? {})) {
      if (!NOTE_FIELDS[k]) throw new Error(`--public-notes ${slug}.${k}: 모르는 칸(허용 ${Object.keys(NOTE_FIELDS).join('·')})`)
      if (!v?.text || !/^https?:\/\//.test(v.url ?? '')) throw new Error(`--public-notes ${slug}.${k}: text 와 http(s) url 이 둘 다 있어야 한다`)
    }
    out[slug] = fields
  }
  return out
}

// ── 갈아타기 방향 ───────────────────────────────────────────────────────
const W = "[\\w.+'’-]+"
const KO = '[가-힣A-Za-z0-9.+-]+?'
const JOSA = /(을|를|이|가|은|는|으로|로|에서)$/
const k = (s) => normKey(String(s ?? '').replace(JOSA, ''))
/** 순수 함수: 인용 1건 → { from:Set, to:Set }(정규화 키). 방향이 명시된 표현만 읽는다. */
export function switchSides(quote) {
  const from = new Set()
  const to = new Set()
  const q = String(quote ?? '')
  for (const m of q.matchAll(new RegExp(`\\b(?:switched|moved|migrated|came over|came)\\s+from\\s+(${W})(?:\\s+to\\s+(${W}))?`, 'gi'))) {
    from.add(k(m[1]))
    if (m[2]) to.add(k(m[2]))
  }
  for (const m of q.matchAll(new RegExp(`(${W})\\s+instead\\s+of\\s+(${W})`, 'gi'))) (to.add(k(m[1])), from.add(k(m[2])))
  for (const m of q.matchAll(new RegExp(`(${KO})에서\\s*(${KO})(?:으로|로)\\s*(?:갈아|넘어|옮|바꿨|바꾸)`, 'g'))) (from.add(k(m[1])), to.add(k(m[2])))
  for (const m of q.matchAll(new RegExp(`(${KO})\\s*(?:대신(?:에)?|말고)\\s+(${KO})(?=\\s|$|[,.!?])`, 'g'))) (from.add(k(m[1])), to.add(k(m[2])))
  return { from, to }
}

// ── 비교 ────────────────────────────────────────────────────────────────
/** 인용 → 단어 1~3개 묶음의 정규화 키 집합. 부분 문자열로 찾으면 'rev'(Rev)가 'review' 에 걸린다 — 단어 경계로만 본다. */
export function nameGrams(quote) {
  const w = String(quote ?? '').split(/[^\p{L}\p{N}.+-]+/u).map((x) => k(x)).filter(Boolean)
  const out = new Set()
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 3 && i + n <= w.length; n++) out.add(w.slice(i, i + n).join(''))
  return out
}

const cell = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')

/**
 * 순수 함수: 영역 1개 비교. anchorKeys = 기준점 이름 정규화 키 → 표시명. rows = tier_rows 중 이 영역.
 * → { table: [{ row, pros: [{text, id}], cons: [...], coAnchors: Set }], edges }
 */
export function compareArea(rows, anchorKeys) {
  const out = []
  for (const r of rows) {
    const pros = []
    const cons = []
    const co = new Set()
    for (const e of r.evidence ?? []) {
      const { from, to } = switchSides(e.quote)
      const grams = nameGrams(e.quote)
      for (const [ak, label] of anchorKeys) if (grams.has(ak)) co.add(label)
      const fromAnchor = [...from].filter((x) => anchorKeys.has(x)).map((x) => anchorKeys.get(x))
      if (to.has(r.key) && fromAnchor.length) pros.push({ text: `${fromAnchor.join('·')} → ${r.name} 갈아타기`, id: e.input_id })
      else if (to.has(r.key) && from.size) pros.push({ text: `${[...from].join('·')} → ${r.name} 갈아타기(기준점 아님)`, id: e.input_id })
      if (from.has(r.key)) cons.push({ text: `${r.name} → ${[...to].join('·') || '다른 것'} 떠남`, id: e.input_id })
    }
    out.push({ row: r, pros, cons, coAnchors: co })
  }
  return out
}

/** 순수 함수: 영역 1장 마크다운. */
export function renderAreaSheet({ area, areaName, date, picked, profiles, compared, ledgerFile, topN }) {
  const L = [
    `# 경쟁 기준점 대비 소형·신규 비교 — ${areaName} (${date})`,
    '',
    `읽기 전용 · LLM 0회 · 네트워크 0회. 확인 못 한 칸은 '${UNKNOWN}'. 근거 글 ID = analysis_inputs.id.`,
    `기준점 = 제품 사전 × 영역 지도에서 앱스토어 평가 수 상위 ${topN}(이 영역 사전 제품 ${picked.inArea}개 중 평가 수 미확인 ${picked.unranked}개는 순위 밖).`,
    `소형·신규 = 후보 대장 ${ledgerFile ?? '없음 — scripts/product-name-candidates.mjs --run 먼저'}.`,
    '',
    '## 1. 경쟁 기준점 프로파일',
    '',
  ]
  if (!picked.anchors.length) L.push(`기준점 ${UNKNOWN} — 평가 수가 있는 사전 제품이 없다.`, '')
  for (const [i, a] of picked.anchors.entries()) {
    L.push(`### ${i + 1}. ${a.p.name}${a.p.name_ko ? ` (${a.p.name_ko})` : ''} · ${a.p.region ?? '지역 미기재'}`, '', '| 구분 | 항목 | 값 | 출처 |', '|---|---|---|---|')
    for (const f of profiles[i]) L.push(`| ${f.group} | ${f.field} | ${cell(f.value)} | ${cell(f.source)} |`)
    L.push('')
  }
  L.push('## 2. 기준점 대비 소형·신규 장단점', '')
  if (!compared.length) L.push(`이 영역의 소형·신규 채택 후보 ${UNKNOWN} — 대장에 행이 없다.`, '')
  else {
    L.push('| 후보 | 부류 | 가중 신호(대안·1~3인 팀·저가·출시 표현) | 같이 언급된 기준점 | 장점 근거(글 ID) | 단점 근거(글 ID) |', '|---|---|---|---|---|---|')
    for (const c of compared) {
      const r = c.row
      const ev = (xs) => (xs.length ? xs.map((x) => `${cell(x.text)} (${x.id})`).join('<br>') : UNKNOWN)
      L.push(`| ${cell(r.name)} \`${cell(r.key)}\` | ${TIER_KO[r.tier] ?? r.tier} | 대안 ${r.altN ?? 0} · 1~3인 ${r.indieN ?? 0} · 저가 ${r.priceN ?? 0} · 출시 ${r.launchN ?? 0} | ${[...c.coAnchors].join(', ') || '-'} | ${ev(c.pros)} | ${ev(c.cons)} |`)
    }
    L.push('', '판정 규칙: 근거 인용 안에서 갈아타기 방향이 명시된 것만 센다. 방향이 없으면 장점도 단점도 아니다(미확인).', '')
  }
  // 경쟁 장점 후보: 기준점 약점(스냅샷) · 기준점에서 넘어온 지점 · 저가·소규모 팀 신호. 결론이 아니라 파고들 후보다.
  const ideas = []
  for (const [i, a] of picked.anchors.entries()) {
    const weak = profiles[i]._weaknesses
    for (const w of weak ?? []) ideas.push(`${a.p.name} 약점: ${w.claim} (근거 ${w.evidence.map((e) => e.input_id).join(', ')})`)
  }
  for (const c of compared) for (const p of c.pros) if (!/기준점 아님/.test(p.text)) ideas.push(`${p.text} — 넘어온 이유를 원문에서 확인 (${p.id})`)
  const cheap = compared.filter((c) => (c.row.priceN ?? 0) > 0 || (c.row.indieN ?? 0) > 0).map((c) => c.row.name)
  if (cheap.length) ideas.push(`저가·1~3인 팀 신호가 있는 후보: ${cheap.join(', ')} — 기준점 가격대와 대조(가격대가 '${UNKNOWN}'이면 대조 불가)`)
  L.push('## 3. 우리가 파고들 경쟁 장점 후보', '', ...(ideas.length ? ideas.map((x) => `- ${cell(x)}`) : [`- ${UNKNOWN} — 근거(기준점 약점 스냅샷·갈아타기 인용·저가 신호)가 아직 없다.`]), '')
  return L.join('\n')
}

// ── 파일·DB ─────────────────────────────────────────────────────────────
/** reports/ 아래 날짜 폴더 중 tier_rows 가 있는 최신 대장. 없으면 null. */
export function latestLedger(reportsDir) {
  if (!fs.existsSync(reportsDir)) return null
  for (const d of fs.readdirSync(reportsDir).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse()) {
    const f = path.join(reportsDir, d, 'rejected-candidates.json')
    if (fs.existsSync(f) && Array.isArray(JSON.parse(fs.readFileSync(f, 'utf8')).tier_rows)) return f
  }
  return null
}

const slugOfLabel = (label) => String(label ?? '').split(':').pop().split('|').pop()

async function supabasePort() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  return {
    /** slug → 최신 스냅샷 | { missing }. */
    async snapshotsBySlug(slugs) {
      const { data: targets, error } = await sb.from('review_targets').select('project_id, label').limit(5000)
      if (error) throw new Error(`review_targets 조회 실패: ${error.message}`)
      const pids = new Map()
      for (const t of targets ?? []) if (t.project_id && slugs.includes(slugOfLabel(t.label))) (pids.get(slugOfLabel(t.label)) ?? pids.set(slugOfLabel(t.label), new Set()).get(slugOfLabel(t.label))).add(t.project_id)
      const all = [...new Set([...pids.values()].flatMap((s) => [...s]))]
      const out = new Map(slugs.map((s) => [s, { missing: '이 제품의 수집 타깃(project) 없음' }]))
      if (!all.length) return out
      const { data: snaps, error: e2 } = await sb.from('competitor_profile_snapshots').select('project_id, created_at, status, sections').in('project_id', all).neq('status', 'failed').order('created_at', { ascending: false })
      if (e2) {
        const why = e2.code === '42P01' ? '스냅샷 테이블 미적용(마이그 000037)' : `스냅샷 조회 실패: ${e2.message}`
        return new Map(slugs.map((s) => [s, { missing: why }]))
      }
      for (const [slug, set] of pids) {
        const s = (snaps ?? []).find((x) => set.has(x.project_id))
        out.set(slug, s ?? { missing: '스냅샷 없음(ok·unverified 0건)' })
      }
      return out
    },
  }
}

export async function main(argv, { port, now = new Date(), reportsDir = REPORTS_DIR, dictionary, areaMap, cfg = loadConfig(), log = console.log } = {}) {
  const run = argv.includes('--run')
  const useDb = argv.includes('--db')
  const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
  const AP = { top_n: 5, areas: ['1', '2'], ...cfg.anchor_profile }
  const areas = (opt('areas') ?? AP.areas.join(',')).split(',').map((s) => s.trim()).filter(Boolean)
  const date = opt('date') ?? kstDate(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date 형식 YYYY-MM-DD: ${date}`)
  const dict = dictionary ?? loadDictionary()
  const amap = areaMap ?? JSON.parse(fs.readFileSync(AREA_MAP_PATH, 'utf8'))
  const areaNames = Object.fromEntries(JSON.parse(fs.readFileSync(AREAS_PATH, 'utf8')).areas.map((a) => [a.code, a.name]))
  const notesFile = opt('public-notes')
  const notes = notesFile ? parsePublicNotes(JSON.parse(fs.readFileSync(notesFile, 'utf8'))) : {}
  const ledgerFile = opt('ledger') ?? latestLedger(reportsDir)
  const tierRows = ledgerFile ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).tier_rows ?? [] : []

  const picks = Object.fromEntries(areas.map((a) => [a, pickAnchors(dict, amap, a, AP.top_n)]))
  const allSlugs = [...new Set(Object.values(picks).flatMap((p) => p.anchors.map((x) => x.p.slug)))]
  const db = useDb ? port ?? (await supabasePort()) : null
  const snaps = db ? await db.snapshotsBySlug(allSlugs) : null

  const summary = [`${run ? 'RUN' : 'DRY'} ${date} 기준점 비교 · 영역 ${areas.join(',')} · 대장 ${ledgerFile ?? '없음'} · DB ${useDb ? 'SELECT' : '안 읽음'} · 공개 메모 ${Object.keys(notes).length}개`]
  const files = []
  const cfgBench = new Map((cfg.benchmark?.services ?? []).map((s) => [normKey(s), s]))
  for (const area of areas) {
    const picked = picks[area]
    const profiles = picked.anchors.map((a) => {
      const snapshot = snaps ? snaps.get(a.p.slug) : undefined
      const f = profileOf(a, { snapshot, notes: notes[a.p.slug] })
      f._weaknesses = snapshot && !snapshot.missing ? snapshot.sections?.weaknesses ?? [] : []
      return f
    })
    // 기준점 이름 키: 사전 기준점(이름·한글명·slug) + config 대형 서비스.
    const anchorKeys = new Map(cfgBench)
    for (const a of picked.anchors) for (const n of [a.p.name, a.p.name_ko, a.p.slug]) if (n && normKey(n).length >= 2) anchorKeys.set(normKey(n), a.p.name)
    const rows = tierRows
      .filter((r) => String(r.area) === area && r.status === 'adopt' && (r.tier === 'small' || r.tier === 'new'))
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
      .slice(0, AP.compare_top ?? 10)
    const compared = compareArea(rows, anchorKeys)
    summary.push(
      `[${areaNames[area] ?? area}] 기준점 ${picked.anchors.map((a) => `${a.p.name}(${a.ratings})`).join(', ') || UNKNOWN} · 평가 수 미확인 ${picked.unranked}/${picked.inArea} · 소형·신규 ${rows.length} · 장점 근거 ${compared.reduce((n, c) => n + c.pros.length, 0)} · 단점 근거 ${compared.reduce((n, c) => n + c.cons.length, 0)}`,
    )
    if (run) {
      const dir = path.join(reportsDir, date)
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `anchor-compare-${area}.md`)
      fs.writeFileSync(file, renderAreaSheet({ area, areaName: areaNames[area] ?? area, date, picked, profiles, compared, ledgerFile, topN: AP.top_n }))
      files.push(file)
    }
  }
  if (files.length) summary.push(`파일: ${files.join(', ')}`)
  for (const l of summary) log(l)
  return { picks, files, snaps }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
