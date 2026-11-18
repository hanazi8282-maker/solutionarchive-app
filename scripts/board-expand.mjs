#!/usr/bin/env node
// [v71cu S5-2] 게시판 펼침(Discourse): 켜진 포럼 13곳의 /categories.json(+하위, 요청 1회·간격 6초)을 받아 공개 게시판 전부를 collect_frontier(layer=board)에 적는다.
// 최근 1년 글이 있는 게시판은 상태 'candidate', 없으면 'dormant'(끄기 아님 — 비어 있음만 근거). 403·429·JSON 아님 → 그 포럼 중단.
// 임시 타깃 승격은 어댑터의 boards 지도(lib/review/adapters/discourse.ts)에 슬러그가 있어야 하므로 아직 하지 않는다(미완 — S5-2).
// 사용: node --env-file=.env.local scripts/board-expand.mjs [--dry]
import { createClient } from '@supabase/supabase-js'
const DRY = process.argv.includes('--dry')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const FORUMS = {
  n8n_community: 'https://community.n8n.io', make_community: 'https://community.make.com', bubble_forum: 'https://forum.bubble.io', retool_community: 'https://community.retool.com',
  glide_community: 'https://community.glideapps.com', softr_community: 'https://community.softr.io', mautic_forum: 'https://forum.mautic.org', frappe_forum: 'https://discuss.frappe.io',
  suitecrm_community: 'https://community.suitecrm.com', invoiceninja_forum: 'https://forum.invoiceninja.com', obsidian_forum: 'https://forum.obsidian.md', ghost_forum: 'https://forum.ghost.org',
  shopify_community: 'https://community.shopify.com',
}
let total = 0
for (const [key, host] of Object.entries(FORUMS)) {
  try {
    const r = await fetch(`${host}/categories.json?include_subcategories=true`, { headers: { 'user-agent': 'solutionarchive-review-collector', accept: 'application/json' } })
    const t = await r.text()
    if (r.status === 403 || r.status === 429 || !t.trimStart().startsWith('{')) { console.log(key, `중단 ${r.status}`); await new Promise((x) => setTimeout(x, 6000)); continue }
    const cats = []
    for (const c of JSON.parse(t).category_list?.categories ?? []) { cats.push(c); for (const s of c.subcategory_list ?? []) cats.push(s) }
    const rows = cats.filter((c) => !c.read_restricted).map((c) => ({ layer: 'board', source_key: key, ref: `/c/${c.slug}/${c.id}`, engine: 'discourse', title: c.name, discovered_by: 'board-expand', _y: c.topics_year ?? 0, _t: c.topic_count ?? 0 }))
    total += rows.length
    console.log(key, rows.length, '게시판')
    if (!DRY && rows.length) {
      const { data, error } = await sb.from('collect_frontier').upsert(rows.map(({ _y, _t, ...x }) => x), { onConflict: 'source_key,layer,ref', ignoreDuplicates: false }).select('id,ref')
      if (error) { console.log('쓰기 실패', error.message); continue }
      const by = new Map(rows.map((x) => [x.ref, x]))
      const { data: have } = await sb.from('collect_frontier_events').select('frontier_id').in('frontier_id', data.map((d) => d.id))
      const done = new Set((have ?? []).map((h) => h.frontier_id))
      const ev = data.filter((d) => !done.has(d.id)).map((d) => ({ frontier_id: d.id, state: by.get(d.ref)._y > 0 ? 'candidate' : 'dormant', reason: by.get(d.ref)._y > 0 ? `최근 1년 글 ${by.get(d.ref)._y}` : '최근 1년 글 0(비어 있음)', stats: { topics_year: by.get(d.ref)._y, topic_count: by.get(d.ref)._t } }))
      if (ev.length) await sb.from('collect_frontier_events').insert(ev)
    }
  } catch (e) { console.log(key, '오류', e.message) }
  await new Promise((x) => setTimeout(x, 6000))
}
console.log('게시판 총', total)
