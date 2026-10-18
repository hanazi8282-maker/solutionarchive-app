#!/usr/bin/env node
// v71ay C1 — 새 출시·차트·Product Hunt·Shopify 후보 → discovery_candidates 대장 SQL 초안(origin='new_release'). DB 에 쓰지 않는다.
// 앱 ID 가 이미 붙은 후보라 이름→ID 변환·Search 가 없다(동명이앱 오탐 경로 자체가 없음). 검증은 verdict='unverified' 로 두고 ⑧ 등록 모드가 area_fit·약관 게이트를 건다.
//   node scripts/new-release-ledger.mjs --picked=reports/<KST>/new-product-candidates.json [--ph=reports/<KST>/new-release-candidates.json]
//        [--dictionary=reports/<KST>/new-release-dictionary.json] [--input=<mention-input.json>] [--date=YYYY-MM-DD] [--write]
// 쓰기: reports/<date>/new-release-ledger.sql (+ _rollback.sql, 롤백은 행을 지우지 않고 verdict='rejected' 로만 접는다) · new-release-candidates.md
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { areaHint, loadAreas } from './new-product-candidates.mjs'

export const DAILY_CAP = 45
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)

/** 세 입력을 한 후보 목록으로. 이름 정규화 키로 중복 제거(앞선 입력 우선: 차트 → PH → Shopify), 이미 대장에 있는 이름은 제외. */
export function buildRows({ picked = [], ph = [], shopify = [], regShopify = new Set(), knownNames = new Set(), areas, cap = DAILY_CAP }) {
  const seen = new Set(knownNames)
  const rows = []
  const push = (r) => { const k = norm(r.name); if (k && !seen.has(k)) { seen.add(k); rows.push(r) } }
  for (const c of picked) push({ name: c.name, area: c.area, source: 'chart', probe_source_key: 'appstore', probe_ref: `${c.appstore_country}:${c.appstore_id}`, probe_hits: c.rating_count, why: `애플 국가별 차트 상위 신규 후보 — ${c.developer ?? '?'} · ${c.genre} · 평점 ${c.rating_count}` })
  for (const l of ph) {
    if (!l.appstore_id && !l.play_pkg) continue
    const area = areaHint(`${l.name} ${l.tagline ?? ''} ${(l.topics ?? []).join(' ')}`, areas)
    if (!area) continue
    push({ name: l.name, area, source: 'producthunt', probe_source_key: l.appstore_id ? 'appstore' : 'googleplay', probe_ref: l.appstore_id ? `us:${l.appstore_id}` : `us:en:${l.play_pkg}`, probe_hits: l.votes ?? null, why: `Product Hunt 90일 내 출시 — ${l.tagline ?? ''} (홈페이지 스토어 앵커)` })
  }
  for (const a of shopify) {
    if (regShopify.has(`app:${a.handle}`)) continue
    const area = areaHint(a.name, areas)
    if (!area) continue
    push({ name: a.name, area, source: 'shopify', probe_source_key: 'shopify_apps', probe_ref: `app:${a.handle}`, probe_hits: null, why: `Shopify 앱스토어 ${a.category} 목록 — 이름 힌트만(평점 미확인)` })
  }
  return rows.slice(0, cap)
}

export function renderSql(rows, date) {
  if (!rows.length) return '-- 새 출시 후보 없음\n'
  const vals = rows.map((r) => `  ('saas', ${q(r.name)}, ${q(r.why)}, ${q(r.probe_source_key)}, ${q(r.probe_ref)}, ${r.probe_hits ?? 'NULL'}, 'unverified', ${q(`새 출시 입력(${r.source}) — 앱 ID 는 공식 목록에서 직접 받음, area_fit·약관 게이트 전`)}, 'new_release', ${q(r.area)}, ${q(`${date}T00:00:00+09:00`)})`)
  return (
    `-- 새 출시 대장 ${date} — discovery_candidates(origin='new_release'). 사람·역할 세션이 적용(CLAUDE.md §10.1 발굴 적재 — discovery_candidates 전체 INSERT).\n` +
    `-- 같은 이름(대소문자 무시)이 이미 있으면 넣지 않는다. 롤백: ${`new-release-ledger_rollback.sql`}\n` +
    `INSERT INTO public.discovery_candidates (kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, area_code, last_seen_at)\n` +
    `SELECT v.* FROM (VALUES\n${vals.join(',\n')}\n) AS v(kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, area_code, last_seen_at)\n` +
    `WHERE NOT EXISTS (SELECT 1 FROM public.discovery_candidates d WHERE lower(d.name) = lower(v.name));\n`
  )
}

/** 롤백: 행을 지우지 않고 기각으로 접는다(삭제 없음). */
export function renderRollback(rows, date) {
  if (!rows.length) return '-- 롤백할 행 없음\n'
  return `-- 새 출시 대장 ${date} 롤백 — 이 입력이 넣은 행만(origin='new_release', 이름 일치, 아직 사람 검토 전) 기각으로 접는다. 삭제하지 않는다.\n` +
    `UPDATE public.discovery_candidates SET verdict = 'rejected', verdict_reason = 'v71ay 롤백(new_release ${date})'\n` +
    ` WHERE origin = 'new_release' AND human_review = 'pending' AND lower(name) IN (${rows.map((r) => q(r.name.toLowerCase())).join(', ')});\n`
}

export function markdown({ date, counts, rows }) {
  return [`# 새 출시 후보 ${date} (v71ay C1·C3, new-release-ledger.mjs)`, '',
    '| 단계 | 건수 |', '|---|---|', ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`), '',
    '## 영역별', ...['1', '2', '3', '4', '5'].map((a) => `- 영역 ${a}: ${rows.filter((r) => r.area === a).length}`), '',
    '## 후보', ...rows.map((r) => `- [영역 ${r.area}] ${r.name} — ${r.source} · ${r.probe_source_key}:${r.probe_ref}`), ''].join('\n')
}

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const readJson = (f) => (f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null)

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const date = arg('date', new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10))
  const pickedJ = readJson(arg('picked')), phJ = readJson(arg('ph')), dictJ = readJson(arg('dictionary')), inp = readJson(arg('input'))
  const areas = loadAreas()
  const knownNames = new Set((inp?.discovery ?? []).map((d) => norm(d.name)))
  const regShopify = new Set((inp?.targets ?? []).filter((t) => t.source_key === 'shopify_apps').map((t) => t.product_ref))
  const rows = buildRows({ picked: pickedJ?.picked ?? [], ph: phJ?.candidates ?? [], shopify: dictJ?.shopify ?? [], regShopify, knownNames, areas })
  const counts = {
    '차트 후보(영역 힌트 통과)': pickedJ?.picked?.length ?? 0, '차트 후보(영역 힌트 없음 hold)': pickedJ?.hold?.length ?? 0,
    'Product Hunt 출시 읽음': phJ?.candidates?.length ?? '확인 불가', 'Product Hunt 스토어 앵커': (phJ?.candidates ?? []).filter((c) => c.appstore_id || c.play_pkg).length,
    'Shopify 목록': dictJ?.shopify?.length ?? 0, '대장 행(중복·이미 있음 제외)': rows.length,
  }
  const md = markdown({ date, counts, rows })
  console.log(md)
  if (process.argv.includes('--write')) {
    const dir = path.join('reports', date)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'new-release-ledger.sql'), renderSql(rows, date))
    fs.writeFileSync(path.join(dir, 'new-release-ledger_rollback.sql'), renderRollback(rows, date))
    fs.writeFileSync(path.join(dir, 'new-release-candidates.md'), md)
  }
}
