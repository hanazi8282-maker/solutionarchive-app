import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
const T = process.env.TEMP
const flips = JSON.parse(fs.readFileSync(`${T}/flips.json`, 'utf8'))
let seed = 20261012
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
const bySrc = {}
for (const f of flips) (bySrc[f.source] ??= []).push(f)
const pick = []
for (const [src, rows] of Object.entries(bySrc)) {
  if (rows.length <= 30) { pick.push(...rows); continue }
  const a = shuffle(rows.filter((r) => r.old === 'relevant')), b = shuffle(rows.filter((r) => r.old !== 'relevant'))
  const half = 15
  let ta = a.slice(0, Math.min(half, a.length)), tb = b.slice(0, Math.min(half, b.length))
  if (ta.length < half) tb = b.slice(0, Math.min(b.length, 30 - ta.length))
  if (tb.length < half) ta = a.slice(0, Math.min(a.length, 30 - tb.length))
  pick.push(...ta, ...tb)
}
const sb = await createClient()
const pids = [...new Set(pick.map((p) => p.project_id))]
const { data: projs } = await sb.from('analysis_projects').select('id, product_elevator_pitch, purpose, business_model').in('id', pids)
const pm = new Map((projs ?? []).map((p) => [p.id, p]))
const shuffled = shuffle(pick)
const key = [], blind = []
shuffled.forEach((p, i) => {
  const n = i + 1
  const pr = pm.get(p.project_id) ?? {}
  blind.push({ n, source: p.source, project_purpose: (pr.purpose || pr.product_elevator_pitch || '').slice(0, 500), business_model: pr.business_model ?? null, text: (p.text || '').slice(0, 700) })
  key.push({ n, input_id: p.input_id, source: p.source, old: p.old, neu: p.neu, info_new: p.info_new, project_id: p.project_id })
})
fs.writeFileSync(`${T}/blind_items.json`, JSON.stringify(blind, null, 1))
fs.writeFileSync(`${T}/blind_key.json`, JSON.stringify(key))
const cnt = {}; for (const k of key) cnt[k.source] = (cnt[k.source] ?? 0) + 1
console.log('sample', key.length, JSON.stringify(cnt), 'old=relevant', key.filter((k) => k.old === 'relevant').length, 'old=irrelevant', key.filter((k) => k.old === 'irrelevant').length)
