// Poll metric_snapshots for the T3-1 h1 snapshot until it lands or the h1 window closes.
import { createClient } from './lib/supabase/server.ts'
const POST_ID = '272910ea-e6ae-4ad5-9898-0f0a778abea6'
const PUBLISHED = new Date('2026-09-07T10:24:14Z').getTime()
const db = await createClient()
if (!db) { console.log('POLL-H1: no DB client'); process.exit(1) }

for (;;) {
  const ageH = (Date.now() - PUBLISHED) / 3600000
  const { data, error } = await db
    .from('metric_snapshots')
    .select('hours_since_publish, source, views, likes, replies, reposts, shares, clicks, captured_at')
    .eq('post_id', POST_ID)
    .order('hours_since_publish', { ascending: true })
  if (error) { console.log(`POLL-H1: query error ${error.code} ${error.message}`); process.exit(1) }

  const h1 = (data || []).find(r => r.hours_since_publish === 1)
  if (h1) {
    console.log(`POLL-H1: ✅ h1 스냅샷 도착 (age ${ageH.toFixed(2)}h) — source=${h1.source} views=${h1.views} likes=${h1.likes} replies=${h1.replies} reposts=${h1.reposts} shares=${h1.shares} clicks=${h1.clicks} captured_at=${h1.captured_at}`)
    console.log(`POLL-H1: 전체 스냅샷 ${data.length}행: ${data.map(r => 'h' + r.hours_since_publish).join(' ')}`)
    process.exit(0)
  }
  if (ageH > 2.05) {
    console.log(`POLL-H1: ⚠️ h1 창(0.5~1.9h) 닫힘 (age ${ageH.toFixed(2)}h) — 스냅샷 ${(data || []).length}행, h1 없음. 스케줄 크론이 11:30 UTC 에 안 돈 것으로 보임. spread_multiple/H3 이 글로는 측정 불가.`)
    process.exit(2)
  }
  await new Promise(r => setTimeout(r, 240000)) // 4 min
}
