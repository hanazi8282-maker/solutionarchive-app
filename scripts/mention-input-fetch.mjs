#!/usr/bin/env node
// 언급 루프 입력 추출(v71au ①) — mention-loop.mjs --input 용 JSON. SELECT 만(PostgREST 읽기), DB 쓰기 없음.
//   node scripts/mention-input-fetch.mjs --out=<json>     env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
// 읽기 SQL (A') 와 같은 조건: 판정 relevant 이거나 '대안 탐색' 문구가 있는 글 + 전환·이사 문구. raw_text 가 들어 있으니 결과 파일을 커밋하지 않는다.
import fs from 'node:fs'
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const out = arg('out')
if (!out) throw new Error('--out 필요')
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!baseUrl || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 필요 — 못 읽은 것을 빈 입력으로 접지 않는다')
const base = baseUrl + '/rest/v1/'
const H = { apikey: key, authorization: 'Bearer ' + key }
async function all(path, order) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(base + path + (path.includes('?') ? '&' : '?') + 'order=' + order, { headers: { ...H, range: `${from}-${from + 999}`, 'range-unit': 'items' } })
    if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200))
    const j = await r.json(); out.push(...j); if (j.length < 1000) break
  }
  return out
}
const projects = await all('analysis_projects?select=id,product_elevator_pitch,competitor_url,area_code', 'id')
const pm = new Map(projects.map(p => [p.id, p]))
const verd = await all('review_relevance_verdicts?select=input_id,verdict,human_verdict,auto_approved_at', 'input_id')
const vm = new Map(verd.map(v => [v.input_id, v]))
const inputs = await all('analysis_inputs?select=id,project_id,source_key,raw_text&purged_at=is.null&raw_text=not.is.null', 'id')
const SW = /(switch|moved|moving|migrat|transition|came over|jump|alternative|instead of|rather than|better than|worse than|compared (to|with)|replac|갈아|넘어|옮겨|옮김|옮겼|바꿨|바꿈|바꿔|바꾸|이사|대신|대안|대체|보다|쓰다가|사용하다가|이용하다가|만한)/i
const ALT = /(looking for (an? )?(\w+ )?alternative|(any|good|better) alternatives?|alternatives? (to|for)|recommend(ed)? (an? )?(alternative|replacement)|갈아\s*탈\s*만한|대신\s*쓸\s*만한|대안\s*(앱|어플|을|이|찾|추천|없)|대체\s*(앱|어플)|다른\s*(앱|어플)\s*(추천|찾))/i
const posts = []
for (const i of inputs) {
  const ap = pm.get(i.project_id); if (!ap || ap.area_code === 'hold' || !SW.test(i.raw_text)) continue
  const v = vm.get(i.id); const eff = v ? (v.human_verdict ?? v.verdict) : null
  if (!(eff === 'relevant' || ALT.test(i.raw_text))) continue
  const kind = v && (v.human_verdict === 'relevant' || v.auto_approved_at) ? 'approved' : eff === 'relevant' ? 'relevant' : 'alt_seek'
  posts.push({ id: i.id, project_id: i.project_id, source_key: i.source_key, area_code: ap.area_code, raw_text: i.raw_text, verdict_kind: kind })
}
const targets = await all('review_targets?select=project_id,source_key,label,product_ref,status,total_collected', 'id')
const srcs = new Map((await all('review_sources?select=key,enabled', 'key')).map(s => [s.key, s.enabled]))
targets.forEach(t => t.source_enabled = srcs.get(t.source_key))
// v71ba: origin·mention_count·probe_* 는 새 출시 소급(new-release-backfill.mjs)이 대상 행(origin=mention ∧ 집계 NULL)을 고르는 데 쓴다
const discovery = await all('discovery_candidates?select=id,name,homepage_url,verdict,verdict_reason,origin,mention_count,probe_source_key,probe_ref,human_review', 'id')
fs.writeFileSync(out, JSON.stringify({ posts, projects, targets, discovery }))
console.log({ inputs: inputs.length, posts: posts.length, projects: projects.length, targets: targets.length, discovery: discovery.length })
