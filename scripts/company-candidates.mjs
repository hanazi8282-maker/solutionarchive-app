#!/usr/bin/env node
// v71cu S14 — 집계 결과 JSON(scripts/sql/company-candidates.sql 의 출력)을 받아 기준 적용 + 근거 얇음 계산 → 표·UPSERT SQL 출력.
// DB 에 접근하지 않는다(--dry 와 동일). 사용: node scripts/company-candidates.mjs <rows.json> [--sql] [--legacy]
//   기본 = 새 기준(전체 1~2점 150+, 한국어 50+; env COMPANY_MIN_LOW_TOTAL / COMPANY_MIN_KO 로 조정). --legacy = 원래 기준(한국어 100+, 한국어 1~2점 30+).
import { readFileSync } from 'node:fs'
import { criteria, toRow, passesLegacy } from '../lib/consult/company-table.ts'

const file = process.argv[2]
if (!file) { console.error('사용법: node scripts/company-candidates.mjs <rows.json> [--sql] [--legacy]'); process.exit(64) }
const rows = JSON.parse(readFileSync(file, 'utf8')).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, /^(project_id|area_slug|company_name)$/.test(k) ? v : Number(v)])))
const legacy = process.argv.includes('--legacy')
const out = []
for (const r of rows) {
  if (legacy) { if (!passesLegacy(r)) continue; out.push({ ...r, thin_evidence: false, thin_reasons: [], passes_legacy: true }); continue }
  const t = toRow(r, criteria())
  if (t) out.push({ ...r, ...t })
}
console.log(`후보 ${out.length}곳 (입력 ${rows.length}) · 근거 얇음 ${out.filter((x) => x.thin_evidence).length}곳 · 기준=${legacy ? 'legacy' : JSON.stringify(criteria())}`)
for (const x of out) console.log(`- ${x.company_name} [${x.area_slug}] 전체1~2점 ${x.low_total} · 한국어 ${x.ko} · 한국어1~2점 ${x.ko_low}${x.thin_evidence ? ' · 근거 얇음(' + x.thin_reasons.join(',') + ')' : ''}`)
if (process.argv.includes('--sql')) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  for (const x of out) console.log(`INSERT INTO public.company_candidates (project_id, area_slug, company_name, total, ko, low_total, ko_low, criteria, thin_evidence, thin_reasons) VALUES (${q(x.project_id)}, ${q(x.area_slug)}, ${q(x.company_name)}, ${x.total}, ${x.ko}, ${x.low_total}, ${x.ko_low}, ${q(legacy ? 'legacy' : 'new_v2')}, ${x.thin_evidence}, ARRAY[${x.thin_reasons.map(q).join(',')}]::text[]) ON CONFLICT (project_id) DO UPDATE SET area_slug=EXCLUDED.area_slug, company_name=EXCLUDED.company_name, total=EXCLUDED.total, ko=EXCLUDED.ko, low_total=EXCLUDED.low_total, ko_low=EXCLUDED.ko_low, criteria=EXCLUDED.criteria, thin_evidence=EXCLUDED.thin_evidence, thin_reasons=EXCLUDED.thin_reasons, computed_at=now();`)
}
