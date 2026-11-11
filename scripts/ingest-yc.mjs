#!/usr/bin/env node
// YC 회사 공개 JSON → yc_companies(v71cj 작업 6 C2). 원자료는 DB 에만 둔다(공개 리포에 올리지 않음).
//   node --env-file=.env.local scripts/ingest-yc.mjs [--dry]
// 출처: https://yc-oss.github.io/api/companies/all.json (공개 JSON, robots 제한 없음). 단일 출처 = 등급 C(E-10).
import { createClient } from '@supabase/supabase-js'
const dry = process.argv.includes('--dry')
const res = await fetch('https://yc-oss.github.io/api/companies/all.json', { headers: { 'user-agent': 'Mozilla/5.0' } })
if (!res.ok) { console.error(`받기 실패 ${res.status}`); process.exit(2) }
const all = await res.json()
if (!Array.isArray(all) || all.length < 1000) { console.error(`형식 이상: ${Array.isArray(all) ? all.length : typeof all}건`); process.exit(2) }
const rows = all.map((c) => ({
  yc_id: c.id, name: String(c.name ?? '').slice(0, 200), slug: c.slug ?? null, website: c.website ?? null,
  one_liner: c.one_liner ? String(c.one_liner).slice(0, 400) : null, batch: c.batch ?? null, status: c.status ?? 'unknown',
  industry: c.industry ?? null, subindustry: c.subindustry ?? null, tags: Array.isArray(c.tags) ? c.tags.slice(0, 20) : [],
  team_size: Number.isFinite(c.team_size) ? c.team_size : null, location: c.all_locations ? String(c.all_locations).slice(0, 200) : null,
  launched_year: c.launched_at ? new Date(c.launched_at * 1000).getUTCFullYear() : null, source_url: c.url ?? null, grade: 'C',
})).filter((r) => r.yc_id && r.name)
const by = (k) => rows.reduce((a, r) => ((a[r[k] ?? '-'] = (a[r[k] ?? '-'] ?? 0) + 1), a), {})
console.log(`받음 ${all.length} · 적재 대상 ${rows.length} · 상태 ${JSON.stringify(by('status'))}`)
if (dry) process.exit(0)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
let n = 0
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await sb.from('yc_companies').upsert(rows.slice(i, i + 500), { onConflict: 'yc_id' })
  if (error) { console.error(`적재 실패 @${i}: ${error.message}`); process.exit(2) }
  n += Math.min(500, rows.length - i)
}
const { count } = await sb.from('yc_companies').select('*', { count: 'exact', head: true })
console.log(`적재 ${n} · 표 행 수 ${count} · 등급 분포 ${JSON.stringify(by('grade'))}`)
