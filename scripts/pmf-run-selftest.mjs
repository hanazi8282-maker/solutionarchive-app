// PMF 진단 실행 + 원문 인용 검증 셀프테스트 — 순수 부분만. 네트워크·DB 없음.
//   node scripts/pmf-run-selftest.mjs
//
// 여기서 지키는 두 가지
//   1) 저장 행이 DB CHECK 와 어긋나지 않는다. not_run 인데 축이 채워져 있으면 INSERT 가 23514 로
//      죽고 진단 기록 자체가 사라진다 — 제약에 맡기지 않고 만들 때 지운다.
//   2) 지어낸 인용을 저장하지 않는다. 모델이 매끄럽게 만든 문장은 화면에서 가장 믿음직한 자리에 앉는다.

import { buildAssessmentRow, buildMoveRows, missingFacets, MAX_LINKED_MOVES } from '../lib/cases/pmf-run.ts'
import { matchMoves, demandAxis, precedentAxis, quadrantOf } from '../lib/cases/match.ts'
import { normalizeEvidenceQuotes, QUOTE_MAX_CHARS, QUOTE_MAX_COUNT } from '../lib/analysis/evidence-quotes.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

// ── 픽스처 ───────────────────────────────────────────────────
const study = (over = {}) => ({
  id: 's1', slug: 'acme', brand_name: '에이스', bottleneck: 'TRUST',
  business_model: 'D2C', buyer_type: 'B2C', price_band: 'MID',
  outcome_status: 'active', review_status: 'approved', ...over,
})
const move = (over = {}) => ({
  id: 'm1', case_study_id: 's1', lever: 'CONTENT', claim: '리뷰 원문을 상세페이지에 붙였다',
  evidence_grade: 'A', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved', ...over,
})

// ── 1. 진단 입력이 없으면 돌리지 않는다 ─────────────────────
t('병목 없으면 missing (추정하지 않는다)', JSON.stringify(missingFacets({ bottleneck: null })), '["bottleneck"]')
t('병목 있으면 missing 0건', missingFacets({ bottleneck: 'TRUST' }).length, 0)
t('나머지 패싯이 비어도 진단은 돈다(정렬 재료일 뿐)', missingFacets({ bottleneck: 'TRUST', price_band: null }).length, 0)

// ── 2. not_run 이면 축·사분면이 전부 NULL ───────────────────
const notRunMatch = matchMoves('TRUST', null, null, null, {})
t('케이스 조회 실패 → not_run (0건이 아니다)', notRunMatch.status, 'not_run')
const notRunRow = buildAssessmentRow({
  input: {}, facets: { bottleneck: 'TRUST' }, targetProjectId: 'p1',
  match: notRunMatch, demand: { value: 0.7 }, quadrant: 'PROVEN_DEMAND', createdBy: 'test',
})
t('not_run — demand_axis NULL', notRunRow.demand_axis, null)
t('not_run — precedent_axis NULL', notRunRow.precedent_axis, null)
t('not_run — quadrant NULL', notRunRow.quadrant, null)
t('not_run — match_status 그대로', notRunRow.match_status, 'not_run')

// ── 3. 정상 판정 행 ─────────────────────────────────────────
const match = matchMoves('TRUST', [study()], [move(), move({ id: 'm2', case_study_id: 's2' })], null,
  { business_model: 'D2C', buyer_type: 'B2C', price_band: 'MID' })
t('맥락 없는 무브는 빠진다', match.moves.length, 1)
const demand = demandAxis([14, 9])
const quad = quadrantOf(demand.value, precedentAxis(match).value)
const row = buildAssessmentRow({
  input: { item: '샴푸' }, facets: { bottleneck: 'TRUST' }, targetProjectId: 'p1',
  match, demand, quadrant: quad.quadrant, createdBy: 'app',
})
t('축은 0~1 안에 있다', row.demand_axis >= 0 && row.demand_axis <= 1 && row.precedent_axis >= 0 && row.precedent_axis <= 1, true)
t('사분면은 두 축이 다 있을 때만', row.quadrant !== null, row.demand_axis !== null && row.precedent_axis !== null)
t('제외 건수를 match_reason 에 남긴다 (담을 컬럼이 없다)', /제외: 자기 \d+ · 미승인 \d+ · 등급D \d+ · 반면교사 \d+/.test(row.match_reason), true)
t('created_by 그대로', row.created_by, 'app')

// 제외 사유가 실제로 세어지는지 — 미승인·등급D
const excludedMatch = matchMoves('TRUST', [study()],
  [move({ id: 'm3', review_status: 'draft' }), move({ id: 'm4', evidence_grade: 'D' })], null, {})
t('승인 안 된 무브는 no_match 로 (확인 불가 아님)', excludedMatch.status, 'no_match')
const exRow = buildAssessmentRow({
  input: {}, facets: {}, targetProjectId: null, match: excludedMatch,
  demand: { value: 0.5 }, quadrant: null, createdBy: 'test',
})
t('no_match 여도 수요축은 살아 있다', exRow.demand_axis, 0.5)
t('no_match 선례축은 0 (확인 불가가 아니라 확인해보니 없다)', exRow.precedent_axis, 0)
t('제외 건수 문장', /미승인 1 · 등급D 1 · 반면교사 0/.test(exRow.match_reason), true)

// ── 4. 인용 무브 연결 ───────────────────────────────────────
const links = buildMoveRows('a1', match)
t('연결 행 수 = 매칭 무브 수', links.length, match.moves.length)
t('matched_by 는 facet 뿐 (어휘만 열려 있다)', links.every((l) => l.matched_by === 'facet'), true)
t('상한 20건', buildMoveRows('a1', { ...match, moves: Array.from({ length: 50 }, (_, i) => ({ ...match.moves[0], id: `m${i}` })) }).length, MAX_LINKED_MOVES)
t('무브 0건이면 연결도 0건', buildMoveRows('a1', excludedMatch).length, 0)

// ── 5. 원문 인용 — 없는 문장은 저장하지 않는다 ──────────────
const inputs = [
  { source_type: 'review', raw_text: '세 통째 쓰는 중인데 머리 감고 나면 두피가 안 당긴다. 향은 취향을 탄다.' },
  { source_type: 'ad', raw_text: '임상시험 완료. 4주 만에 굵기 12% 개선.' },
]
const q1 = normalizeEvidenceQuotes(['머리 감고 나면 두피가 안 당긴다'], inputs)
t('원문에 있는 인용은 통과', q1.length, 1)
t('통과한 인용의 source_type 은 그 입력의 것', q1[0].source_type, 'review')
t('지어낸 인용은 버린다', normalizeEvidenceQuotes(['이 제품은 모든 탈모를 치료해 줍니다'], inputs).length, 0)
t('공백만 다른 인용은 살린다', normalizeEvidenceQuotes(['머리  감고\n나면 두피가 안 당긴다'], inputs).length, 1)
t('뒤를 다듬은 인용도 앞 20자가 맞으면 살린다', normalizeEvidenceQuotes(['세 통째 쓰는 중인데 머리 감고 나면 두피가 안 당겨요'], inputs).length, 1)
t('객체 형태도 받는다', normalizeEvidenceQuotes([{ text: '임상시험 완료. 4주 만에 굵기 12% 개선.' }], inputs)[0].source_type, 'ad')
t('최대 3건', normalizeEvidenceQuotes(Array.from({ length: 6 }, (_, i) => `세 통째 쓰는 중인데 머리 감고 나면 두피가 안 당긴다.${i}`), inputs).length, QUOTE_MAX_COUNT)
t('중복은 한 번만', normalizeEvidenceQuotes(['머리 감고 나면 두피가 안 당긴다', '머리 감고 나면 두피가 안 당긴다'], inputs).length, 1)
t('300자 상한', normalizeEvidenceQuotes([`세 통째 쓰는 중인데 ${'가'.repeat(500)}`], [{ raw_text: `세 통째 쓰는 중인데 ${'가'.repeat(500)}` }])[0].text.length, QUOTE_MAX_CHARS)
t('배열이 아니면 빈 배열', normalizeEvidenceQuotes('문자열', inputs).length, 0)
t('입력 원문이 없으면 어떤 인용도 통과하지 못한다', normalizeEvidenceQuotes(['아무 말'], []).length, 0)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('진단 저장 행이 CHECK 제약과 맞고, 원문에 없는 인용은 저장되지 않는다.')
