#!/usr/bin/env node
// [v71cu S2-1] 수집 직전 pre-step: 빈 타깃 방문 간격(2^n일, 최대 14일)·휴면 표시. 쓰는 칸은 next_visit_at·dormant_at·dormant_reason 뿐(status 불변).
// 롤백 JSON 을 UPDATE 전에 reports/ 에 쓴다. 사용: node --env-file=.env.local scripts/target-visit-schedule.mjs [--dry]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { planVisits } from '../lib/review/visit-schedule.ts'
const DRY = process.argv.includes('--dry')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const rows = []
for (let o = 0; ; o += 1000) {
  const { data, error } = await sb.from('review_targets').select('id,source_key,product_ref,status,consecutive_empty,last_run_at,last_review_at,total_collected,dormant_at,next_visit_at').order('id').range(o, o + 999)
  if (error) { console.error(error.message); process.exit(2) }
  rows.push(...data); if (data.length < 1000) break
}
const { plans, dormantNew, skippedHalfRule } = planVisits(rows)
const byId = new Map(rows.map((r) => [r.id, r]))
const changed = plans.filter((p) => { const r = byId.get(p.id); return r.next_visit_at !== p.next_visit_at || (p.dormant_at && !r.dormant_at) || (p.wake && r.dormant_at) })
console.log(`targets ${rows.length} · 계획 ${plans.length} · 변경 ${changed.length} · 새 휴면 ${dormantNew} · 절반규칙으로 멈춘 소스 ${skippedHalfRule.join(',') || '-'}`)
if (DRY || !changed.length) process.exit(0)
const stamp = new Date().toISOString().slice(0, 10)
fs.mkdirSync('reports/visit-schedule', { recursive: true })
fs.writeFileSync(`reports/visit-schedule/rollback-${stamp}-${Date.now()}.json`, JSON.stringify(changed.map((p) => { const r = byId.get(p.id); return { id: p.id, next_visit_at: r.next_visit_at, dormant_at: r.dormant_at } })))
let n = 0
for (const p of changed) {
  const patch = { next_visit_at: p.next_visit_at }
  if (p.dormant_at) { patch.dormant_at = p.dormant_at; patch.dormant_reason = p.dormant_reason }
  if (p.wake) { patch.dormant_at = null; patch.dormant_reason = null }
  const { error } = await sb.from('review_targets').update(patch).eq('id', p.id); if (error) { console.error(error.message); process.exit(2) } n++
}
console.log(`적용 ${n}`)
