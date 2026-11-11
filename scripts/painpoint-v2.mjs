#!/usr/bin/env node
// 페인포인트 v2 실행기(v71ck 5) — 한 프로젝트의 리뷰에서 구조화 추출 → 군집 → 가중·보정 → 게이트.
//   node --env-file=.env.local scripts/painpoint-v2.mjs --project <analysis_projects.id> [--limit 240] [--minSources 3]
// 결과는 stdout 에만(DB 쓰기 없음). 시나리오 ②(시프티) 프로젝트 f6438c14-1e5f-4566-b10e-46ee2836a958.
import { createClient } from '@supabase/supabase-js'
import { consultLlmJson } from '../lib/consult/llm.ts'
import { score, gate, jCurveWeights } from '../lib/consult/painpoint.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const project = arg('project'), limit = Number(arg('limit', 240)), minSources = Number(arg('minSources', 3))
if (!project) { console.error('--project 필요'); process.exit(64) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: rows, error } = await sb.from('analysis_inputs').select('id,source_key,rating,raw_text').eq('project_id', project).is('purged_at', null).limit(2000)
if (error) throw error
// 표본: 출처별 비례 + 별점 구간이 한쪽으로 쏠리지 않게 앞에서부터가 아니라 id 정렬 후 균등 간격.
rows.sort((a, b) => a.id.localeCompare(b.id))
const step = Math.max(1, Math.floor(rows.length / limit))
const sample = rows.filter((_, i) => i % step === 0).slice(0, limit)
const src = (r) => r.source_key.split(':')[0]
console.log(`리뷰 ${rows.length}건 중 ${sample.length}건 추출 · 출처 ${[...new Set(sample.map(src))].join(',')}`)

const SYS = `당신은 제품 리뷰에서 고객의 불편을 구조화해 뽑습니다. 입력 각 줄은 "번호|별점|원문" 입니다. 불편·불만이 없는 줄(칭찬만·무의미)은 건너뜁니다.
각 불편마다 JSON 객체: {"i":번호,"outcome":"고객이 이루려던 결과를 '~을/를 ~하게 한다' 형태로 한 줄","severity":1~5,"workaround":"고객이 만든 우회행동이 원문에 있으면 한 줄, 없으면 null","kano":"must_be|one_dim|attractive|indifferent","obvious":true|false,"theme":"불편 주제 2~6단어"}
obvious=true 는 이 카테고리 어디에나 있는 일반 불만(느리다·버그·로그인 오류·비싸다)입니다. 원문에 없는 내용을 지어내지 않습니다. 출력은 {"items":[...]} JSON 하나.`
const items = []
for (let i = 0; i < sample.length; i += 30) {
  const batch = sample.slice(i, i + 30)
  const user = batch.map((r, k) => `${i + k}|${r.rating ?? '-'}|${String(r.raw_text).replace(/\s+/g, ' ').slice(0, 280)}`).join('\n')
  const r = await consultLlmJson({ runId: null, owner: 'painpoint-v2', purpose: 'judge', tag: 'haiku', system: SYS, user, maxTokens: 6000 })
  for (const it of r.data.items ?? []) {
    const row = sample[it.i]; if (!row || typeof it.outcome !== 'string') continue
    items.push({ id: row.id, source: src(row), rating: row.rating, outcome: it.outcome, severity: Math.min(5, Math.max(1, Number(it.severity) || 3)), workaround: typeof it.workaround === 'string' && it.workaround !== 'null' ? it.workaround : null, kano: ['must_be', 'one_dim', 'attractive', 'indifferent'].includes(it.kano) ? it.kano : 'indifferent', obvious: Boolean(it.obvious), theme: String(it.theme ?? '').slice(0, 40) })
  }
}
console.log(`구조화 추출 ${items.length}건`)

// 군집: 주제 문자열을 모델이 묶는다(ODI 결과 군집). 군집명 → 번호 매핑을 받는다.
const themes = [...new Set(items.map((x) => x.theme))].slice(0, 150)
const cr = await consultLlmJson({ runId: null, owner: 'painpoint-v2', purpose: 'judge', tag: 'sonnet', maxTokens: 6000,
  system: '주제 목록을 같은 결과(고객이 이루려는 일)를 막는 것끼리 8~14개 군집으로 묶습니다. 출력 {"clusters":[{"name":"군집명(결과 중심 한 줄)","themes":["주제",...]}]} JSON 하나. 모든 주제는 정확히 한 군집에 넣습니다.',
  user: themes.join('\n') })
const map = new Map()
for (const c of cr.data.clusters ?? []) for (const t of c.themes ?? []) map.set(t, c.name)
const ms = items.map((x) => ({ ...x, cluster: map.get(x.theme) ?? '기타' })).filter((m) => m.cluster !== '기타')
const clusters = score(ms)
const g = gate(clusters, { minSources })
const w = jCurveWeights(ms.map((m) => m.rating))
console.log(`군집 ${clusters.length}개 · J-curve 가중 ${JSON.stringify(w)}`)
console.log(`\n통과 ${g.passed.length}개 (출처 ≥${minSources}, 자명하지 않음)`)
for (const c of g.passed) console.log(`  ✔ ${c.name} — n=${c.n} 가중=${c.weighted} 심각도=${c.severity} 점수=${c.score} 우회=${c.workaroundShare} kano=${c.kano} 출처=${c.sources.join('+')}`)
console.log(`\n탈락 ${g.rejected.length}개`)
const by = g.rejected.reduce((a, r) => ((a[r.reason] = (a[r.reason] ?? 0) + 1), a), {})
console.log(`  사유 ${JSON.stringify(by)}`)
for (const r of g.rejected.slice(0, 8)) console.log(`  ✘ ${r.cluster.name} — n=${r.cluster.n} 점수=${r.cluster.score} 출처=${r.cluster.sources.join('+')} 사유=${r.reason}${r.cluster.workarounds[0] ? ' 우회:' + r.cluster.workarounds[0] : ''}`)
