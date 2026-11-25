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
/**
 * JS 정규식 → Postgres ~* 용 문자열. JS 가 맞는 글은 반드시 맞아야 한다(상위집합). 허용 문법: 글자·공백·( | ) ?·\w+·\s*.
 * \s* 는 "영문·숫자·한글이 아닌 글자 0개 이상"으로 넓힌다(JS 공백에는 NBSP 처럼 Postgres [[:space:]] 가 빠뜨릴 수 있는 글자가 있다).
 * 그 밖의 문법이나 i 아닌 플래그면 null — 상위집합이라고 말할 수 없다.
 */
function serverRegex(re) {
  const rest = re.source.replaceAll('\\s*', '').replaceAll('\\w+', '')
  if (re.flags !== 'i' || rest.includes('(?') || /[\\.*+[\]{}^$]/.test(rest)) return null
  return re.source.replaceAll('\\s*', '[^a-z0-9가-힣]{0,}')
}
// 키셋 페이징(v71ci A3): 오프셋 페이징은 analysis_inputs(raw_text 포함 ~18만 행)에서 깊어질수록 느려져 57014(8초)로 죽었다.
//   order 열은 select 에 들어 있고 유일해야 한다(전부 id·key·input_id — 호출부 그대로).
async function all(path, order) {
  const out = []
  let last = null
  for (;;) {
    const cur = last === null ? '' : `&${order}=gt.${encodeURIComponent(last)}`
    const r = await fetch(base + path + (path.includes('?') ? '&' : '?') + 'order=' + order + '&limit=1000' + cur, { headers: H })
    if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200))
    const j = await r.json(); out.push(...j); if (j.length < 1000) break
    last = j[j.length - 1][order]
  }
  return out
}
const SW = /(switch|moved|moving|migrat|transition|came over|jump|alternative|instead of|rather than|better than|worse than|compared (to|with)|replac|갈아|넘어|옮겨|옮김|옮겼|바꿨|바꿈|바꿔|바꾸|이사|대신|대안|대체|보다|쓰다가|사용하다가|이용하다가|만한)/i
const ALT = /(looking for (an? )?(\w+ )?alternative|(any|good|better) alternatives?|alternatives? (to|for)|recommend(ed)? (an? )?(alternative|replacement)|갈아\s*탈\s*만한|대신\s*쓸\s*만한|대안\s*(앱|어플|을|이|찾|추천|없)|대체\s*(앱|어플)|다른\s*(앱|어플)\s*(추천|찾))/i
const projects = await all('analysis_projects?select=id,product_elevator_pitch,competitor_url,area_code', 'id')
const pm = new Map(projects.map(p => [p.id, p]))
// 서버에서 먼저 거른다(v71ek egress — 예전엔 판정 18만 행 + 원문 24만 행을 전부 받았다). 아래 JS 거르기(최종 판정)는 그대로이고,
//   서버가 보내는 것은 그 결과의 상위집합이다: 남는 글 = SW ∧ (사람?모델 판정 relevant ∨ ALT) →
//   ① SW ∧ 느슨한 ALT  ∪  ② SW ∧ relevant 판정. 서버 정규식(~*)이 JS 상위집합임을 말할 수 없으면 예전 방식(전부 받기)으로 간다.
const EMBED = 'v:review_relevance_verdicts'
const BASE = 'analysis_inputs?select=id,project_id,source_key,raw_text,'
const LIVE = '&purged_at=is.null&raw_text=not.is.null'
async function readFiltered() {
  const sw = serverRegex(SW), al = serverRegex(ALT)
  if (!sw || !al) throw new Error('SW·ALT 에 서버(Postgres)와 뜻이 다를 수 있는 정규식 문법이 있다')
  const rx = (s) => '&raw_text=imatch.' + encodeURIComponent(s)
  const alt = await all(BASE + EMBED + '(verdict,human_verdict,auto_approved_at)' + LIVE + rx(sw) + rx(al), 'id')
  const rel = await all(BASE + EMBED + '!inner(verdict,human_verdict,auto_approved_at)' + LIVE + rx(sw) + '&v.or=(human_verdict.eq.relevant,and(human_verdict.is.null,verdict.eq.relevant))', 'id')
  const byId = new Map()
  for (const r of [...rel, ...alt]) {
    if (!('v' in r)) throw new Error('응답에 판정 임베드(v)가 없다')
    byId.set(r.id, r)
  }
  const inputs = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  const vm = new Map()
  for (const r of inputs) { const v = Array.isArray(r.v) ? r.v[0] : r.v; if (v) vm.set(r.id, v) }
  return { inputs, vm, total: await countInputs().catch(() => '확인 불가') }
}
async function readEverything() {
  const verd = await all('review_relevance_verdicts?select=input_id,verdict,human_verdict,auto_approved_at', 'input_id')
  const inputs = await all(BASE.slice(0, -1) + LIVE, 'id')
  return { inputs, vm: new Map(verd.map(v => [v.input_id, v])), total: inputs.length }
}
/** 로그용 전체 원문 수(행은 1개만 받는다). 못 세면 '확인 불가' — 거른 수를 전체로 적지 않는다. */
async function countInputs() {
  const r = await fetch(base + 'analysis_inputs?select=id' + LIVE + '&limit=1', { headers: { ...H, prefer: 'count=exact' } })
  const n = Number(r.headers.get('content-range')?.split('/')[1] ?? NaN)
  await r.text()
  return r.ok && Number.isFinite(n) ? n : '확인 불가'
}
const { inputs, vm, total } = await readFiltered().catch((e) => {
  console.warn(`::warning::서버 거르기 실패 — 전부 받는 예전 방식으로 간다: ${e.message.slice(0, 300)}`)
  return readEverything()
})
const posts = []
for (const i of inputs) {
  const ap = pm.get(i.project_id); if (!ap || ap.area_code === 'hold' || !SW.test(i.raw_text)) continue
  const v = vm.get(i.id); const eff = v ? (v.human_verdict ?? v.verdict) : null
  if (!(eff === 'relevant' || ALT.test(i.raw_text))) continue
  const kind = v && (v.human_verdict === 'relevant' || v.auto_approved_at) ? 'approved' : eff === 'relevant' ? 'relevant' : 'alt_seek'
  posts.push({ id: i.id, project_id: i.project_id, source_key: i.source_key, area_code: ap.area_code, raw_text: i.raw_text, verdict_kind: kind })
}
const targets = await all('review_targets?select=id,project_id,source_key,label,product_ref,status,total_collected', 'id')
const srcs = new Map((await all('review_sources?select=key,enabled', 'key')).map(s => [s.key, s.enabled]))
targets.forEach(t => t.source_enabled = srcs.get(t.source_key))
// v71ba: origin·mention_count·probe_* 는 새 출시 소급(new-release-backfill.mjs)이 대상 행(origin=mention ∧ 집계 NULL)을 고르는 데 쓴다
const discovery = await all('discovery_candidates?select=id,name,homepage_url,verdict,verdict_reason,origin,mention_count,probe_source_key,probe_ref,human_review', 'id')
fs.writeFileSync(out, JSON.stringify({ posts, projects, targets, discovery }))
console.log({ inputs: total, fetched: inputs.length, posts: posts.length, projects: projects.length, targets: targets.length, discovery: discovery.length })
