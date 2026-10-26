#!/usr/bin/env node
// v71bj §5 — review_topic_labels 의 대분류를 정규화한다(원본 category_group 은 그대로, category_group_norm 열만 NULL 칸에 채움).
//   1) 괄호 설명을 뗀 이름을 config/topic-group-norm.json 사전으로 대표 이름에 합친다.
//   2) 같은 제품(product_name 소문자)이 2개 이상 대분류로 갈렸으면 다수결 대분류로 모은다(unknown·창업가 일반 고민·실물 소비재는 투표·대상에서 뺀다).
//   부수 산출물: 갈린 제품 상위 20(건수·이름만) → reports/2026-10-27/topic-split-products.json
//   node --env-file=.env.local scripts/topic-group-norm.mjs [--apply]   (기본은 드라이런: 집계만, DB 쓰기 0)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
const apply = process.argv.includes('--apply'); const PV = 'topic-v1-2026-10-26'
const dict = JSON.parse(readFileSync('config/topic-group-norm.json', 'utf8')); const NOVOTE = new Set(dict.no_vote)
const strip = (g) => String(g ?? 'unknown').replace(/\s*[(（].*?[)）]/g, '').replace(/\s+/g, ' ').trim() || 'unknown'
const step1 = (g) => { const s = strip(g); return dict.map[s] ?? s }
const sb = await createClient()
const rows = []; for (let f = 0; ; f += 1000) { const { data, error } = await sb.from('review_topic_labels').select('id, category_group, product_name, category_group_norm').eq('prompt_version', PV).order('id').range(f, f + 999); if (error) { console.error(error); process.exit(2) } rows.push(...data); if (data.length < 1000) break }
const pk = (r) => (r.product_name ?? '').toLowerCase().trim()
const votes = new Map()
for (const r of rows) { const g = step1(r.category_group); if (!pk(r) || NOVOTE.has(g)) continue; const m = votes.get(pk(r)) ?? new Map(); m.set(g, (m.get(g) ?? 0) + 1); votes.set(pk(r), m) }
const winner = new Map(); const split = []
for (const [p, m] of votes) { if (m.size < 2) continue; const e = [...m.entries()].sort((a, b) => b[1] - a[1]); split.push({ product: p, groups: e.map(([g, n]) => ({ group: g, n })), total: e.reduce((s, [, n]) => s + n, 0) }); if (e[0][1] > e[1][1]) winner.set(p, e[0][0]) }
const norm = (r) => { const g = step1(r.category_group); return !NOVOTE.has(g) && winner.has(pk(r)) ? winner.get(pk(r)) : g }
const result = rows.map((r) => ({ id: r.id, norm: norm(r), prev: r.category_group_norm }))
const before = new Set(rows.map((r) => strip(r.category_group))).size, after = new Set(result.map((r) => r.norm)).size
const changedByVote = rows.filter((r) => norm(r) !== step1(r.category_group)).length
split.sort((a, b) => b.total - a.total); mkdirSync('reports/2026-10-27', { recursive: true })
writeFileSync('reports/2026-10-27/topic-split-products.json', JSON.stringify({ about: '같은 제품이 2개 이상 대분류로 갈린 상위 20(건수·이름만, 사전 합친 뒤 기준)', split_products_total: split.length, top20: split.slice(0, 20) }, null, 1))
console.log(`행 ${rows.length} · 대분류 ${before}종 → ${after}종 · 다수결로 옮긴 행 ${changedByVote} · 갈린 제품 ${split.length}개`)
if (!apply) process.exit(0)
const todo = result.filter((r) => r.prev == null); const byNorm = new Map(); for (const r of todo) (byNorm.get(r.norm) ?? byNorm.set(r.norm, []).get(r.norm)).push(r.id)
let n = 0; for (const [g, ids] of byNorm) for (let i = 0; i < ids.length; i += 200) { const { error } = await sb.from('review_topic_labels').update({ category_group_norm: g }).in('id', ids.slice(i, i + 200)).is('category_group_norm', null); if (error) { console.error(error); process.exit(3) } n += Math.min(200, ids.length - i) }
console.log(`category_group_norm 채움 ${n}행(이미 값 있던 ${rows.length - todo.length}행은 건드리지 않음)`)
