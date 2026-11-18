#!/usr/bin/env node
// [v71cu S8] 유튜브 발굴 층: 분야 제품 이름 × 의도 낱말(후기·리뷰·비교·단점·vs·review·alternative·honest) 검색 → 댓글 30개 이상 영상만 `v:` 타깃으로 임시 등록.
// 할당량: 검색 YT_SEARCH_DAILY(기본 60)회, 그 밖 YT_UNITS_DAILY(기본 2000)단위. 호출마다 api_quota_log 에 더한다. 할당량 초과 응답(403 quotaExceeded)이면 그날은 끝 — 증액 신청 없음.
// 채널 이름·작성자는 저장하지 않는다(영상 ID·검색어만). q:·ch: 타깃은 프런티어(collect_frontier layer=query/channel)에만 적는다 — 어댑터가 아직 v: 만 읽는다.
// 사용: node --env-file=.env.local scripts/youtube-discover.mjs [--dry] [--max-search N]
import { createClient } from '@supabase/supabase-js'
const DRY = process.argv.includes('--dry')
const KEY = process.env.YOUTUBE_API_KEY
if (!KEY) { console.error('YOUTUBE_API_KEY 없음 — needs_key'); process.exit(3) }
const SEARCH_CAP = Number(process.env.YT_SEARCH_DAILY || 60), UNITS_CAP = Number(process.env.YT_UNITS_DAILY || 2000)
const MAX_SEARCH = Number(process.argv[process.argv.indexOf('--max-search') + 1]) || 12
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const today = new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 10) // 구글 할당량은 미국 태평양 자정에 초기화
const BATCH = `yt_${today.replace(/-/g, '')}`
const INTENTS = ['후기', '리뷰', '단점', 'review', 'alternative', 'honest review', 'vs']

async function quota(bucket) { const { data } = await sb.from('api_quota_log').select('used').eq('date', today).eq('api', 'youtube').eq('bucket', bucket).maybeSingle(); return data?.used ?? 0 }
async function addQuota(bucket, n, limit) { const used = (await quota(bucket)) + n; await sb.from('api_quota_log').upsert({ date: today, api: 'youtube', bucket, used, limit }, { onConflict: 'date,api,bucket' }) }

const searchUsed = await quota('search'), unitsUsed = await quota('other')
let searchBudget = Math.min(MAX_SEARCH, SEARCH_CAP - searchUsed)
console.log(`오늘 사용 search ${searchUsed}/${SEARCH_CAP} · other ${unitsUsed}/${UNITS_CAP} · 이번 검색 ${searchBudget}회`)
if (searchBudget <= 0) process.exit(0)

// 제품 이름: 4분야 타깃 라벨 'slug:name' 에서(앱스토어 kr 타깃 기준), 분야당 앞쪽 몇 곳을 날마다 돌린다.
const { data: tg } = await sb.from('review_targets').select('id,project_id,label,area,product_ref').eq('source_key', 'appstore').in('area', ['payments_billing_accounting', 'booking_scheduling_forms', 'marketing_automation', 'sales_crm']).like('product_ref', 'us:%').limit(400)
const products = [...new Map((tg ?? []).map((t) => [t.project_id, { project_id: t.project_id, area: t.area, name: String(t.label ?? '').split(':').pop().trim() }])).values()].filter((p) => p.name.length >= 3)
const dayIdx = Math.floor(Date.now() / 864e5)
const queries = []
for (let i = 0; i < products.length && queries.length < searchBudget; i++) {
  const p = products[(i + dayIdx * 3) % products.length]
  queries.push({ p, q: `${p.name} ${INTENTS[(i + dayIdx) % INTENTS.length]}` })
}
let stop = false, regs = 0, spentOther = 0
for (const { p, q } of queries) {
  if (stop) break
  const sr = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=8&q=${encodeURIComponent(q)}&key=${KEY}`)
  if (!DRY) await addQuota('search', 1, SEARCH_CAP)
  if (sr.status === 403 || sr.status === 429) { console.log(`검색 ${sr.status} — 할당량/차단, 그날은 끝(재시도 없음)`); stop = true; break }
  if (!sr.ok) { console.log('검색 오류', sr.status); continue }
  const ids = ((await sr.json()).items ?? []).map((x) => x.id?.videoId).filter(Boolean)
  const { data: qf } = DRY ? { data: null } : await sb.from('collect_frontier').upsert({ layer: 'query', source_key: 'youtube', ref: `q:${q}`, title: q, area_guess: p.area, discovered_by: 'youtube-discover', onboard_batch: BATCH }, { onConflict: 'source_key,layer,ref' }).select('id').single()
  if (!ids.length) continue
  const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(',')}&key=${KEY}`)
  spentOther += 1; if (!DRY) await addQuota('other', 1, UNITS_CAP)
  if (vr.status === 403 || vr.status === 429) { console.log(`videos.list ${vr.status} — 그날은 끝`); stop = true; break }
  for (const v of (await vr.json()).items ?? []) {
    if (Number(v.statistics?.commentCount ?? 0) < 30) continue
    const ref = `v:${v.id}`
    if (DRY) { console.log('후보', ref, q, v.statistics.commentCount); continue }
    const { data: dup } = await sb.from('review_targets').select('id').eq('source_key', 'youtube').eq('product_ref', ref).limit(1)
    if (dup?.length) continue
    const { data: t, error } = await sb.from('review_targets').insert({ project_id: p.project_id, source_key: 'youtube', product_ref: ref, label: `${p.area}:${p.name}`, area: p.area, status: 'active', onboard_batch: BATCH, layer: 'video' }).select('id').single()
    if (error) { console.log('target', error.message); continue }
    const { data: vf } = await sb.from('collect_frontier').upsert({ layer: 'video', source_key: 'youtube', ref, parent_id: qf?.id ?? null, discovered_by: 'youtube-discover', target_id: t.id, area_guess: p.area, onboard_batch: BATCH }, { onConflict: 'source_key,layer,ref' }).select('id').single()
    if (vf) await sb.from('collect_frontier_events').insert({ frontier_id: vf.id, state: 'provisional', reason: `댓글 ${v.statistics.commentCount}`, stats: { comments: Number(v.statistics.commentCount) } })
    regs++
  }
}
console.log(`검색 ${queries.length}회 · 임시 등록 영상 타깃 ${regs} · other 단위 ${spentOther}`)
