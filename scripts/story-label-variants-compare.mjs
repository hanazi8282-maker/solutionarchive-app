#!/usr/bin/env node
// [v71ct-4 §2] 비용 절감 변형 비교(읽기 전용). 기준 = DB 의 v1_sonnet 라벨(같은 50편), 변형 = story-label-test_cv_<이름>_sonnet.jsonl(dry).
// 핵심 칸 일치율 = 평균( 장: 초점 장 집합 자카드 · 결과 판정: 장별 대표 결과 일치 · 인과: 사슬 유무 일치 ).
// 'rerun'(같은 방법을 한 번 더 돌림)이 기준 대비 일치율의 잡음 바닥이다 — 같은 모델도 다시 돌리면 달라지므로, 변형의 하락은 rerun 대비로 잰다.
// 채택: 핵심 칸 하락(rerun 대비) ≤ 2%p ∧ 인용 일치 ≥ 98% ∧ 숫자 일치 ≥ 98%.
// 사용: node --env-file=.env.local scripts/story-label-variants-compare.mjs rerun sys slim clean batch3 [조합이름...]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DIR = 'reports/2026-11-18'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const slugs = JSON.parse(fs.readFileSync(`${DIR}/story-label-var-sample50.json`, 'utf8'))
const names = process.argv.slice(2)

const { data: sl, error: e1 } = await sb.from('ss_story_labels').select('slug,focus,causal_chain').eq('label_run', 'v1_sonnet').in('slug', slugs)
const { data: ep, error: e2 } = await sb.from('ss_episode_tags').select('slug,chapter,role,result_class').eq('label_run', 'v1_sonnet').in('slug', slugs)
if (e1 || e2) { console.error((e1 ?? e2).message); process.exit(2) }
const base = new Map(sl.map((s) => [s.slug, { focus: s.focus ?? [], chain: s.causal_chain ?? [], eps: ep.filter((x) => x.slug === s.slug) }]))

const COUNTED = ['positive', 'negative', 'mixed']
const dominant = (eps, ch) => { const c = {}; for (const e of eps.filter((x) => x.chapter === ch && COUNTED.includes(x.result_class))) c[e.result_class] = (c[e.result_class] ?? 0) + 1; const k = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return k ? k[0] : null }
const jac = (a, b) => { const i = [...a].filter((x) => b.has(x)).length, u = new Set([...a, ...b]).size; return u ? i / u : 1 }

function load(name) {
  const f = `${DIR}/story-label-test_cv_${name}_sonnet.jsonl`
  if (!fs.existsSync(f)) return null
  const m = new Map(); for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); m.set(r.slug, r) }
  const sf = fs.readdirSync(DIR).filter((x) => x.startsWith(`story-label-test_cv_${name}_sonnet.summary`)).sort().pop()
  return { m, sum: sf ? JSON.parse(fs.readFileSync(`${DIR}/${sf}`, 'utf8')).summary : null }
}
const out = []
for (const name of names) {
  const v = load(name); if (!v) { console.log(`${name}: 결과 없음`); continue }
  let n = 0, chap = 0, resN = 0, resAgree = 0, chainAgree = 0
  for (const slug of slugs) {
    const b = base.get(slug), r = v.m.get(slug)
    if (!b || !r?.ok) continue
    n++
    chap += jac(new Set(b.focus.map((x) => x.chapter)), new Set((r.story.focus ?? []).map((x) => x.chapter)))
    const chs = new Set([...b.eps.map((x) => x.chapter), ...r.episodes.map((x) => x.chapter)])
    for (const ch of chs) { const x = dominant(b.eps, ch), y = dominant(r.episodes, ch); if (x == null && y == null) continue; resN++; if (x === y) resAgree++ }
    chainAgree += ((b.chain.length > 0) === ((r.story.causal_chain ?? []).length > 0)) ? 1 : 0
  }
  const c1 = chap / Math.max(1, n), c2 = resAgree / Math.max(1, resN), c3 = chainAgree / Math.max(1, n)
  const s = v.sum ?? {}
  out.push({ name, compared: n, ok: s.ok, chapter: +(100 * c1).toFixed(1), result: +(100 * c2).toFixed(1), causal: +(100 * c3).toFixed(1), core: +(100 * (c1 + c2 + c3) / 3).toFixed(1),
    quote_ok: s.quote_fail_rate != null ? +(100 * (1 - s.quote_fail_rate)).toFixed(1) : null, number_ok: s.number_fail_rate != null ? +(100 * (1 - s.number_fail_rate)).toFixed(1) : null,
    usd_per_story: s.per_story_usd, tokens_out_per_story: s.tokens ? Math.round(s.tokens.out / Math.max(1, s.n)) : null, cache_write_per_story: s.tokens ? Math.round(s.tokens.cache_write / Math.max(1, s.n)) : null })
}
const floor = out.find((x) => x.name === 'rerun')?.core
for (const x of out) {
  x.core_drop_vs_rerun = floor != null && x.name !== 'rerun' ? +(floor - x.core).toFixed(1) : null
  x.adopt = x.name === 'rerun' ? '(기준 잡음)' : (x.core_drop_vs_rerun != null && x.core_drop_vs_rerun <= 2 && x.quote_ok >= 98 && x.number_ok >= 98 && x.ok >= 0.9 * 50) ? '채택' : '불채택'
}
console.log(JSON.stringify(out, null, 1))
fs.writeFileSync(`${DIR}/story-label-variants-compare.json`, JSON.stringify(out, null, 1))
