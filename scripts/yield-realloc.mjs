#!/usr/bin/env node
// [v71cu S13] 주 1회 예산 재배분. v_source_yield_30d 등급으로 review_source_ramp.daily_request_target 을 한 등급씩만 움직인다.
// A: 유지(공급 모자라면 발굴 호출 = frontier 이벤트) / B: 유지 / C: 현재 기준(cap_base)의 50% / D: 25%(바닥).  unknown 은 안 움직인다.
// 0으로 내리지 않는다·소스를 끄지 않는다(바닥 = max(cap_base × COLLECT_FLOOR_SHARE, COLLECT_FLOOR_MIN_REQUESTS)). daily_request_cap 은 안 건드린다.
// 모든 변경은 review_source_cap_log 에 reason='yield:...' 행을 남긴다(로그 없이 바꾸지 않는다). 기본은 드라이런.
// 사용: node --env-file=.env.local scripts/yield-realloc.mjs [--apply]
import { createClient } from '@supabase/supabase-js'
const APPLY = process.argv.includes('--apply')
const FLOOR_SHARE = Number(process.env.COLLECT_FLOOR_SHARE || 0.25)
const FLOOR_MIN = Number(process.env.COLLECT_FLOOR_MIN_REQUESTS || 5)
const SHARE = { A: 1, B: 1, C: 0.5, D: FLOOR_SHARE }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

export function targetFor(grade, capBase, current) {
  if (!SHARE[grade] || !capBase) return null // unknown·모름은 그대로
  const want = Math.max(Math.round(capBase * SHARE[grade]), FLOOR_MIN)
  if (want === current) return null
  // 한 번에 한 등급만: 현재값에서 한 칸(절반 단위) 이상 벗어나지 않게 자른다.
  const lo = Math.max(FLOOR_MIN, Math.round(current * 0.5)), hi = Math.round(current * 2)
  return Math.min(Math.max(want, lo), hi)
}

// 뷰가 느려(11초) PostgREST 가 시간초과 → 그날 굳힌 collect_daily_report(collect_build_report 함수) 를 읽는다.
await sb.rpc('collect_build_report', { p_date: new Date().toISOString().slice(0, 10) })
const { data: rep, error: e1 } = await sb.from('collect_daily_report').select('payload').order('report_date', { ascending: false }).limit(1).single()
const y = rep?.payload?.source_yield_30d ?? []
const { data: r, error: e2 } = await sb.from('review_source_ramp').select('source_key,cap_base,daily_request_target,supply_state')
if (e1 || e2) { console.error((e1 ?? e2).message); process.exit(2) }
const ramp = new Map(r.map((x) => [x.source_key, x]))
const out = []
for (const s of y) {
  const rp = ramp.get(s.source_key); if (!rp || !rp.cap_base || !rp.daily_request_target) continue
  const to = targetFor(s.grade, rp.cap_base, rp.daily_request_target)
  const callDiscovery = (s.grade === 'A' || s.grade === 'B') && ['short', 'none'].includes(rp.supply_state)
  // 올리는 쪽은 소스 하루 한도·예의(요청 간격) 문제라 이번엔 보류 — 내리기(C·D)와 발굴 호출만 반영(한도 상향은 남헌 결정).
  const down = to != null && to < rp.daily_request_target
  if (!down && !callDiscovery) continue
  out.push({ source: s.source_key, grade: s.grade, yield: s.yield_pct, from: rp.daily_request_target, to: down ? to : null, callDiscovery })
}
console.table(out)
if (!APPLY) { console.log('드라이런 — 쓰기 없음'); process.exit(0) }
for (const o of out) {
  if (o.to != null) {
    const { error: le } = await sb.from('review_source_cap_log').insert({ source_key: o.source, previous_cap: o.from, new_cap: o.to, need: o.to, recommended: o.to, reason: `yield:${o.grade} ${o.yield}% daily_request_target`, applied_by: 'yield-realloc' })
    if (le) { console.error('로그 실패 — 반영 안 함:', le.message); process.exit(2) }
    const { error: ue } = await sb.from('review_source_ramp').update({ daily_request_target: o.to }).eq('source_key', o.source)
    if (ue) { console.error(ue.message); process.exit(2) }
  }
  if (o.callDiscovery) {
    const { data: f } = await sb.from('collect_frontier').upsert({ layer: 'community', source_key: o.source, ref: `supply:${o.source}`, discovered_by: 'yield-realloc' }, { onConflict: 'source_key,layer,ref' }).select('id').single()
    if (f) await sb.from('collect_frontier_events').insert({ frontier_id: f.id, state: 'candidate', reason: `supply short/none, grade ${o.grade} — 발굴 호출`, stats: { grade: o.grade } })
  }
}
console.log(`적용 ${out.length}`)
