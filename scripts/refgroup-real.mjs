#!/usr/bin/env node
// v71cg 게이트를 실제 사례은행(case_bank 뷰) 위에서 재는 시험(v71ck 5). 결과는 통과/미통과와 이유만 낸다 — DB 쓰기 없음.
//   node --env-file=.env.local scripts/refgroup-real.mjs
import { createClient } from '@supabase/supabase-js'
import { estimate, timeSplit, kappa, nTier, wilson } from '../lib/consult/refgroup.ts'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const data = []
for (let from = 0; ; from += 1000) {
  const { data: part, error } = await sb.from('case_bank').select('case_id,source,outcome,category_l1,mechanism,founded,ended,result_period,grade').order('case_id').range(from, from + 999)
  if (error) throw error
  data.push(...part); if (part.length < 1000) break
}
const yr = (r) => Number(r.ended ?? r.founded ?? String(r.result_period ?? '').slice(0, 4)) || null
const rows = data.filter((r) => r.outcome && yr(r))
console.log(`case_bank ${data.length}행 · 성공/실패 라벨 + 연도 있음 ${rows.length}행`)
const bySrc = rows.reduce((a, r) => { const k = r.source + ':' + r.outcome; a[k] = (a[k] ?? 0) + 1; return a }, {})
console.log('출처×결과', JSON.stringify(bySrc))
// 1) 라벨 독립성: 성공은 ss_* 출처에서만, 실패는 failure_ledger/vcbacked 에서만 오면 출처가 곧 정답이라 기저율이 의미 없다.
const succSrc = new Set(rows.filter((r) => r.outcome === 'success').map((r) => r.source)), failSrc = new Set(rows.filter((r) => r.outcome !== 'success').map((r) => r.source))
const overlap = [...succSrc].filter((s) => failSrc.has(s))
const confounded = overlap.length === 0
console.log(`성공 출처 ${[...succSrc]} / 실패 출처 ${[...failSrc]} → 출처 겹침 ${overlap.length ? overlap.join(',') : '없음(출처=정답, 선택 편향)'}`)
// 2) κ: 두 번째 독립 판정자 라벨이 없다. 출처(ss/failure)를 첫 번째 판정으로 보고 outcome 필드와 비교하면 같은 정보라 의미 없음 → 계산 불가로 처리.
console.log('κ: 두 독립 판정자의 성공·실패 라벨이 사례은행에 없다 → 계산 불가(통과로 접지 않는다)')
// 3) 시간분할 Brier — 구조=category_l1, 표면=mechanism. 선택 편향이 있어도 숫자는 낸다(해석 주의).
const cases = rows.map((r) => ({ structure: { cat: r.category_l1 ?? '-' }, surface: r.mechanism ?? [], outcome: r.outcome === 'success' ? 1 : 0, year: yr(r) }))
const years = cases.map((c) => c.year).sort((a, b) => a - b)
const cut = years[Math.floor(years.length * 0.7)]
const ts = timeSplit(cases, cut, 30)
console.log(`시간분할(cut ${cut}): 검증 ${ts.n}건 Brier ${ts.brier.toFixed(3)} vs 기준선 ${ts.baseline.toFixed(3)}`)
// 4) 민감도·n 임계값: 큰 범주별 n 등급
const cats = Object.entries(cases.reduce((a, c) => ((a[c.structure.cat] = (a[c.structure.cat] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 8)
console.log('범주별 n 등급: ' + cats.map(([k, n]) => `${k}=${n}(${nTier(n)})`).join(' · '))
const e30 = estimate({ structure: { cat: cats[0][0] }, surface: [] }, cases, 30), e90 = estimate({ structure: { cat: cats[0][0] }, surface: [] }, cases, 90)
console.log(`민감도(${cats[0][0]}): k=30 p=${e30.p.toFixed(2)} · k=90 p=${e90.p.toFixed(2)}`)
const pass = { kappa: false, brier: ts.brier < ts.baseline && !confounded, sensitivity: Math.abs(e30.p - e90.p) < 0.1, nMin: cats[0][1] >= 30 }
console.log(`게이트 판정: ${Object.values(pass).every(Boolean) ? '통과' : '미통과'} — κ ${pass.kappa ? 'ok' : '계산 불가'} · Brier ${pass.brier ? 'ok' : confounded ? '선택 편향으로 무효' : '기준선 미달'} · 민감도 ${pass.sensitivity ? 'ok' : '흔들림'} · n ${pass.nMin ? 'ok' : '부족'}`)
