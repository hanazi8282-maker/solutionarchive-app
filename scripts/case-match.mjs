// 병목 매칭 + PMF 근접도 실행기 (M1).
//
//   node --env-file=.env.local scripts/case-match.mjs --bottleneck UNIT_ECONOMICS
//   node --env-file=.env.local scripts/case-match.mjs --slug casper-dtc-unit-economics
//   node --env-file=.env.local scripts/case-match.mjs --slug casper-dtc-unit-economics --project <uuid>
//   node --env-file=.env.local scripts/case-match.mjs --coverage
//
// --slug 를 주면 그 케이스의 병목·패싯을 쓰고 **자기 자신은 결과에서 뺀다.**
// --project 를 주면 analysis_aspects 의 opportunity_score 를 읽어 수요축을
// 만들고 사분면까지 낸다. 없으면 선례축만 낸다 (사분면은 안 그린다).
//
// 종료 코드: 0 matched / 1 no_match(음성) / 2 not_run(확인 불가)
//   ★ 1 과 2 를 반드시 나눈다. "선례가 없다"와 "못 찾아봤다"는 다른 사건이다.

import { createClient } from '../lib/supabase/server.ts'
import { matchMoves, demandAxis, precedentAxis, quadrantOf } from '../lib/cases/match.ts'

const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] ?? null : null }
const flag = (n) => argv.includes(`--${n}`)

// ⚠️ createClient 는 async 다. await 를 빼면 Promise 가 들어와
//    supabase.from is not a function 으로 죽는다 (case-review.mjs 와 동일 규약).
let supabase
try { supabase = await createClient() }
catch (e) { console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`); process.exit(2) }

// DB 조회는 실패를 null 로 돌린다. 빈 배열([])과 절대 섞지 않는다 —
// 그 둘을 섞는 순간 매칭기가 "확인 불가"를 "선례 없음"으로 접는다.
async function q(table, select, what) {
  const { data, error } = await supabase.from(table).select(select)
  if (error) {
    console.error(`⚠️ ${what} 조회 실패 — ${error.code ?? ''} ${error.message}`)
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.error('   마이그레이션 20260906000001 미적용일 수 있다. §12-5 대시보드에서 실행한다.')
    }
    return null
  }
  return data
}

const STUDY_COLS = 'id,slug,brand_name,bottleneck,business_model,buyer_type,price_band,outcome_status,review_status'
const MOVE_COLS = 'id,case_study_id,lever,claim,evidence_grade,outcome_direction,review_status,metric_name,metric_before,metric_after,metric_unit'

const studies = await q('case_studies', STUDY_COLS, 'case_studies')
const moves = await q('case_moves', MOVE_COLS, 'case_moves')

// ── --coverage: 병목별 커버리지만 찍는다 ──────────────────────
if (flag('coverage')) {
  if (!studies || !moves) { console.error('⚠️ 확인 불가 — 커버리지를 셀 수 없다'); process.exit(2) }
  const BOTTLENECKS = ['AWARENESS', 'TRUST', 'CONVERSION', 'RETENTION', 'UNIT_ECONOMICS', 'DISTRIBUTION', 'SUPPLY']
  console.log('# 병목별 승인 커버리지\n')
  console.log('  (매칭이 성립하려면 **서로 다른 케이스 2곳 이상**이 필요하다)\n')
  let pairable = 0
  for (const b of BOTTLENECKS) {
    const r = matchMoves(b, studies, moves)
    const n = new Set(r.moves.map((m) => m.study.id)).size
    if (n >= 2) pairable++
    const mark = n >= 2 ? '✅' : n === 1 ? '△' : '❌'
    const names = [...new Set(r.moves.map((m) => m.study.brand_name))].join(', ')
    console.log(`  ${mark} ${b.padEnd(15)} 케이스 ${n}곳 · 무브 ${r.moves.length}건${names ? ` — ${names}` : ''}`)
  }
  console.log(`\n매칭 가능 병목 ${pairable} / 7`)
  process.exit(pairable > 0 ? 0 : 1)
}

// ── 대상 정하기 ───────────────────────────────────────────────
let bottleneck = opt('bottleneck')
let selfId = null
let selfFacets = {}
const slug = opt('slug')

if (slug) {
  if (!studies) { console.error('⚠️ 확인 불가 — case_studies 를 못 읽어 기준 케이스를 정할 수 없다'); process.exit(2) }
  const self = studies.find((s) => s.slug === slug)
  if (!self) { console.error(`✗ 음성: slug=${slug} 인 케이스가 없다`); process.exit(1) }
  bottleneck = self.bottleneck
  selfId = self.id
  selfFacets = { business_model: self.business_model, buyer_type: self.buyer_type, price_band: self.price_band }
  console.log(`# 기준: ${self.brand_name} (${slug}) · 병목 ${bottleneck}`)
  console.log(`  패싯 ${self.business_model} / ${self.buyer_type} / ${self.price_band}`)
  console.log('  ★ 자기 자신의 무브는 선례에서 뺀다\n')
} else if (bottleneck) {
  console.log(`# 병목: ${bottleneck}\n`)
} else {
  console.error('사용: --bottleneck <어휘> | --slug <slug> | --coverage')
  process.exit(2)
}

// ── 매칭 ──────────────────────────────────────────────────────
const match = matchMoves(bottleneck, studies, moves, selfId, selfFacets)

if (match.status === 'not_run') { console.error(`⚠️ 확인 불가 — ${match.reason}`); process.exit(2) }
if (match.status === 'no_match') {
  console.log(`✗ 음성 — ${match.reason}`)
  console.log('  이건 "선례가 없다"이지 "못 찾아봤다"가 아니다 (§7.1).')
  process.exit(1)
}

console.log(`✅ ${match.reason}\n`)
for (const m of match.moves) {
  const metric = m.metric_name
    ? ` [${m.metric_name} ${m.metric_before ?? '?'}→${m.metric_after ?? '?'}${m.metric_unit ?? ''}]`
    : ''
  const facets = m.facet_hits.length ? ` · 패싯일치 ${m.facet_hits.join('/')}` : ''
  console.log(`  [${m.evidence_grade}] ${m.study.brand_name} — ${m.lever} (${m.outcome_direction})${facets}`)
  console.log(`      ${m.claim.slice(0, 90)}`)
  if (metric) console.log(`     ${metric}`)
}
const excl = match.excluded
if (excl.self || excl.not_approved || excl.grade_d) {
  console.log(`\n  (제외: 자기 ${excl.self} / 미승인 ${excl.not_approved} / 등급D ${excl.grade_d})`)
}

// ── PMF 2축 ───────────────────────────────────────────────────
console.log('\n## PMF 근접도')

const projectId = opt('project')
let demand = { value: null, reason: '--project 를 주지 않았다 — 수요축을 계산하지 않았다 (0 이 아니다)' }
if (projectId) {
  const { data, error } = await supabase
    .from('analysis_aspects').select('name,opportunity_score').eq('project_id', projectId)
  if (error) demand = { value: null, reason: `analysis_aspects 조회 실패 — ${error.code ?? ''} ${error.message}` }
  // ⚠️ opportunity_score 는 DB 생성 컬럼이다. 읽기만 한다. 재계산 금지.
  else demand = demandAxis((data ?? []).map((a) => a.opportunity_score))
}
const precedent = precedentAxis(match)
const quad = quadrantOf(demand.value, precedent.value)

console.log(`  수요축   ${demand.value === null ? '확인 불가' : demand.value.toFixed(3)} — ${demand.reason}`)
console.log(`  선례축   ${precedent.value === null ? '확인 불가' : precedent.value.toFixed(3)} — ${precedent.reason}`)
console.log(`  사분면   ${quad.quadrant ?? '내지 않음'} — ${quad.reason}`)

process.exit(0)
