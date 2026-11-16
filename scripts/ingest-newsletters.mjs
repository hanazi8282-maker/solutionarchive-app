#!/usr/bin/env node
// v71cp §2: ground 뉴스레터 4곳(free 티어만) → newsletter_items. 본문은 DB 에 넣지 않는다(summary NULL, 원문은 ground 전용).
//   node --env-file=.env.local scripts/ingest-newsletters.mjs [--dry] [--ground <dir>]
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const dry = process.argv.includes('--dry')
const gi = process.argv.indexOf('--ground')
const root = gi > 0 ? process.argv[gi + 1] : '../_ground/newsletters'
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [] })
const fm = (t) => { const m = /^---\n([\s\S]*?)\n---/.exec(t.replace(/\r/g, '')); if (!m) return null
  return Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] })) }
const rows = []; const skip = { paid: 0, nofm: 0, baddate: 0 }
for (const f of walk(root)) {
  const m = fm(readFileSync(f, 'utf8'))
  if (!m || !m.url || !m.title) { skip.nofm++; continue }
  if (m.tier !== 'free') { skip.paid++; continue }            // 유료 티저는 적재하지 않는다
  const t = Date.parse(m.date); if (!Number.isFinite(t)) { skip.baddate++; continue }
  rows.push({ sender: new URL(m.url).hostname.toLowerCase(), subject: m.title.slice(0, 300), received_at: new Date(t).toISOString(),
    url: m.url, summary: null, content_hash: createHash('sha256').update(m.url).digest('hex') })
}
const by = rows.reduce((a, r) => ((a[r.sender] = (a[r.sender] ?? 0) + 1), a), {})
console.log(`적재 대상 ${rows.length} · 제외 ${JSON.stringify(skip)} · 발신자 ${JSON.stringify(by)}`)
if (dry) process.exit(0)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const labels = Object.keys(by).map((s) => ({ sender: s, label: s.replace(/^www\./, '').split('.')[0], note: 'v71cp ground 적재(free 티어, 본문 미적재)' }))
let r = await sb.from('newsletter_sender_labels').upsert(labels, { onConflict: 'sender' })
if (r.error) { console.error(`라벨 실패: ${r.error.message}`); process.exit(2) }
const lab = Object.fromEntries(labels.map((l) => [l.sender, l.label]))
for (let i = 0; i < rows.length; i += 500) {
  r = await sb.from('newsletter_items').upsert(rows.slice(i, i + 500).map((x) => ({ ...x, sender_label: lab[x.sender] })), { onConflict: 'content_hash', ignoreDuplicates: true })
  if (r.error) { console.error(`적재 실패 @${i}: ${r.error.message}`); process.exit(2) }
}
const { count } = await sb.from('newsletter_items').select('*', { count: 'exact', head: true })
console.log(`완료 · 표 행 수 ${count}`)
