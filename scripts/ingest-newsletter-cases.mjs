#!/usr/bin/env node
// v71cp: ground 뉴스레터 사례(cases-full.jsonl, 이미 추출됨) → case_bank_labels·case_bank_meta (source=nl_*) + newsletter_items.summary.
//   node --env-file=.env.local scripts/ingest-newsletter-cases.mjs [--dry] [--file <cases.jsonl>]
// 규칙: 유료 티저(is_paywalled_teaser) 제외 · newsletter_items(free)에 없는 URL 제외 · domain 은 category_l2 낱말이 분명할 때만(아니면 unknown).
// 연결 키: case_id = <source>:<sha256(post_url) 앞 16>:<n>  ↔  newsletter_items.content_hash = sha256(post_url).
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
const dry = process.argv.includes('--dry')
const fi = process.argv.indexOf('--file')
const file = fi > 0 ? process.argv[fi + 1] : '../_ground/newsletters/cases-full.jsonl'
const sha = (s) => createHash('sha256').update(s).digest('hex')
const SRC = [[/saastr\.com/, 'nl_saastr'], [/trends\.vc/, 'nl_trends_vc'], [/lennysnewsletter\.com/, 'nl_lenny'], [/thesaasplaybook/, 'nl_saas_playbook']]
const OUT = { 인수: 'acquired', 폐업: 'failure', 정체: 'zombie', 성장: 'success', '성장 구간': 'success' } // 피벗·unknown → unknown
const domainOf = (c) => { c = (c || '').toLowerCase()
  if (/payroll|attendance|human resource|\bhr\b|급여|근태|인사/.test(c)) return 'hr_attendance'
  if (/billing|payment|invoice|accounting|결제|정산|회계/.test(c)) return 'payments_billing_accounting'
  if (/\bcrm\b|sales|영업/.test(c)) return 'sales_crm'
  return 'unknown' }
const cases = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const sb = dry ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
// 무료 글 해시 집합(페이지네이션)
let free = new Set()
if (!dry) { for (let from = 0; ; from += 1000) { const { data, error } = await sb.from('newsletter_items').select('content_hash').range(from, from + 999)
  if (error) { console.error(error.message); process.exit(2) } data.forEach((r) => free.add(r.content_hash)); if (data.length < 1000) break } }
const skip = { teaser: 0, nosrc: 0, notfree: 0 }; const labels = []; const meta = []; const sums = new Map(); const seen = {}
for (const c of cases) {
  if (c.is_paywalled_teaser) { skip.teaser++; continue }
  const src = SRC.find(([re]) => re.test(c.post_url || ''))?.[1]; if (!src) { skip.nosrc++; continue }
  const h = sha(c.post_url); if (!dry && !free.has(h)) { skip.notfree++; continue }
  const n = (seen[h] = (seen[h] ?? 0) + 1); const case_id = `${src}:${h.slice(0, 16)}:${n}`
  const outcome = OUT[c.outcome_band] ?? 'unknown'
  labels.push({ case_id, source: src, domain: domainOf(c.category_l2), segment: 'unknown', buyer_type: 'unknown', channel_main: 'unknown', pricing_model: 'unknown',
    price_band_usd_mo: 'unknown', revenue_band: 'unknown', stage_at_snapshot: 'unknown', outcome, failure_mode: null, fit_broken: 'unknown', kill_flags: [],
    evidence_quote: null, confidence: c.grade === 'B' ? 'mid' : 'low', label_model: 'newsletter-extract(ground)', label_run: 'v71cp-2026-11-16' })
  meta.push({ case_id, source: src, source_url_count: 1, outcome, category_l2: c.category_l2 ? String(c.category_l2).slice(0, 120) : null, snapshot_date: /^\d{4}-\d\d-\d\d$/.test(c.post_date ?? '') ? c.post_date : null })
  if (c.evidence_summary) sums.set(h, [...(sums.get(h) ?? []), String(c.evidence_summary)])
}
const by = (a, k) => a.reduce((o, r) => ((o[r[k]] = (o[r[k]] ?? 0) + 1), o), {})
console.log(`대상 ${labels.length} · 제외 ${JSON.stringify(skip)} · source ${JSON.stringify(by(labels, 'source'))} · domain ${JSON.stringify(by(labels, 'domain'))} · outcome ${JSON.stringify(by(labels, 'outcome'))}`)
if (dry) process.exit(0)
for (let i = 0; i < labels.length; i += 300) {
  let r = await sb.from('case_bank_labels').upsert(labels.slice(i, i + 300), { onConflict: 'case_id', ignoreDuplicates: true }); if (r.error) { console.error(`labels @${i}: ${r.error.message}`); process.exit(2) }
  r = await sb.from('case_bank_meta').upsert(meta.slice(i, i + 300), { onConflict: 'case_id', ignoreDuplicates: true }); if (r.error) { console.error(`meta @${i}: ${r.error.message}`); process.exit(2) } }
let sn = 0
for (const [h, arr] of sums) { const { error } = await sb.from('newsletter_items').update({ summary: arr.slice(0, 2).join(' / ').slice(0, 500) }).eq('content_hash', h).is('summary', null); if (error) { console.error(`summary: ${error.message}`); process.exit(2) } sn++ }
console.log(`완료 · summary 갱신 ${sn}글`)
