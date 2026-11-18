#!/usr/bin/env node
// [v71ct] 라벨 실행 결과 집계(읽기 전용): node --env-file=.env.local scripts/story-label-report.mjs <label_run>   예) v1_sonnet
// 출력: reports/2026-11-18/story-label-<run>-report.json — 장별 에피소드·결과 분포, 상황 채움, 카드 수(R1~R3), 새 장 제안, 비용.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const RUN = process.argv[2] ?? 'v1_sonnet'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
async function all(table, cols, run) {
  const out = []
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from(table).select(cols).eq('label_run', run).order('slug').order(table === 'ss_episode_tags' ? 'episode_idx' : 'slug').range(p * 1000, p * 1000 + 999)
    if (error) { console.error(table, error.message); process.exit(2) }
    out.push(...data); if (data.length < 1000) break
  }
  return out
}
const stories = await all('ss_story_labels', 'slug,customer,pricing_model,price_band,stage,team_size,revenue_band,focus,causal_chain,success_tier,relevance_tier', RUN)
const eps = await all('ss_episode_tags', 'slug,episode_idx,chapter,role,sub_topic,result_class,result_grain,evidence_strength,mechanism,move_id,quote_orig', RUN)
const pct = (n, d) => (d ? Number((100 * n / d).toFixed(1)) : null)
const cnt = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m }, {})
const byChapter = {}
for (const e of eps) {
  const c = (byChapter[e.chapter] ??= { episodes: 0, primary: 0, positive: 0, negative: 0, mixed: 0, none: 0, unknown: 0, signal: 0, metric: 0, qual: 0, learned: 0, quotes: 0 })
  c.episodes++; if (e.role === 'primary') c.primary++; c[e.result_class]++; if (e.result_grain) c[e.result_grain]++; if (e.quote_orig) c.quotes++
}
// 흐름 카드(스토리×장, 비중 ≥ 30, 그 장에 결과 positive·negative·mixed 에피소드 ≥ 1) — R 등급별
const epBy = new Map(); for (const e of eps) { const k = `${e.slug}|${e.chapter}`; if (!epBy.has(k)) epBy.set(k, []); epBy.get(k).push(e) }
const cards = {}
for (const s of stories) for (const f of s.focus ?? []) {
  if (f.weight < 30) continue
  const e = epBy.get(`${s.slug}|${f.chapter}`) ?? []
  if (!e.some((x) => ['positive', 'negative', 'mixed'].includes(x.result_class))) continue
  const c = (cards[f.chapter] ??= { R1: 0, R2: 0, R3: 0, withFailure: 0 }); c[s.relevance_tier]++
  if (e.some((x) => ['negative', 'mixed'].includes(x.result_class))) c.withFailure++
}
const n = stories.length
const report = {
  run: RUN, stories: n, episodes: eps.length, episodes_per_story: Number((eps.length / Math.max(1, n)).toFixed(1)),
  linked_to_existing_move: eps.filter((e) => e.move_id).length, new_episodes: eps.filter((e) => !e.move_id).length,
  situation_fill_pct: { customer: pct(stories.filter((s) => s.customer !== 'unknown').length, n), price_band: pct(stories.filter((s) => s.price_band !== 'unknown').length, n), stage: pct(stories.filter((s) => s.stage !== 'unknown').length, n), team_size: pct(stories.filter((s) => s.team_size !== 'unknown').length, n), pricing_model: pct(stories.filter((s) => s.pricing_model !== 'unknown').length, n), revenue_band: pct(stories.filter((s) => s.revenue_band !== 'unknown').length, n) },
  success_tier: cnt(stories, (s) => s.success_tier), relevance_tier: cnt(stories, (s) => s.relevance_tier),
  focus_chapters_per_story: cnt(stories, (s) => (s.focus ?? []).length), stories_with_chain: stories.filter((s) => (s.causal_chain ?? []).length).length,
  result_class: cnt(eps, (e) => e.result_class), result_grain: cnt(eps.filter((e) => e.result_grain), (e) => e.result_grain), evidence: cnt(eps, (e) => e.evidence_strength),
  by_chapter: byChapter, flow_cards_by_chapter: cards,
  top_sub_topics: Object.entries(cnt(eps.filter((e) => e.sub_topic), (e) => `${e.chapter}:${e.sub_topic}`)).sort((a, b) => b[1] - a[1]).slice(0, 25),
  mechanisms_distinct: new Set(eps.map((e) => e.mechanism).filter(Boolean)).size,
}
fs.writeFileSync(`reports/2026-11-18/story-label-${RUN}-report.json`, JSON.stringify(report, null, 1))
console.log(JSON.stringify(report, null, 1))
