// lib/cases/match.ts 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/case-match-selftest.mjs
//
// 매칭기가 조용히 틀리는 지점은 전부 여기다. 매칭 결과는 PMF 사분면으로
// 바로 흘러 들어가고, 사분면은 "무엇을 다음에 할까"를 정한다. 여기가
// 틀리면 화면에는 아무 에러 없이 잘못된 우선순위가 뜬다.
//
// 특히 붙잡아야 하는 것:
//   1) 같은 브랜드 자기매칭 배제 — 자기 무브를 선례로 세지 않는가
//   2) no_match vs not_run — "선례가 없다"와 "안 찾아봤다"를 섞지 않는가 (§7.1)
//   3) 케이스 승인 ≠ 무브 승인 — 둘 다 approved 여야 통과하는가
//   4) 등급 D 배제 — 수치 없는 무브가 선례로 새어 들어가지 않는가
//   5) 축이 비었을 때 사분면을 그리지 않는가

import {
  GRADE_RANK, matchMoves, demandAxis, precedentAxis, quadrantOf,
} from '../lib/cases/match.ts'

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}

// ── 픽스처 ────────────────────────────────────────────────────
const study = (id, slug, over = {}) => ({
  id, slug, brand_name: slug, bottleneck: 'UNIT_ECONOMICS',
  business_model: 'D2C', buyer_type: 'B2C', price_band: 'MID',
  outcome_status: 'active', review_status: 'approved', ...over,
})
const move = (id, case_study_id, over = {}) => ({
  id, case_study_id, lever: 'CHANNEL', claim: `${id} 주장`,
  evidence_grade: 'A', outcome_direction: 'positive', review_status: 'approved',
  metric_name: '재구매율', metric_before: 10, metric_after: 20, metric_unit: '%', ...over,
})

const S_A = study('s-a', 'casper')
const S_B = study('s-b', 'kurly', { business_model: 'MARKETPLACE_SELLER' })
const S_C = study('s-c', 'notion', { bottleneck: 'CONVERSION', business_model: 'SAAS' })

const STUDIES = [S_A, S_B, S_C]
const MOVES = [
  move('m-a1', 's-a'),
  move('m-a2', 's-a', { lever: 'OFFER' }),
  move('m-b1', 's-b', { evidence_grade: 'C', lever: 'OPERATIONS' }),
  move('m-c1', 's-c'),
]

// ── 1) 기본 매칭 ──────────────────────────────────────────────
{
  const r = matchMoves('UNIT_ECONOMICS', STUDIES, MOVES)
  eq('1-1 상태 matched', r.status, 'matched')
  eq('1-2 UNIT_ECONOMICS 무브 3건', r.moves.length, 3)
  check('1-3 다른 병목(CONVERSION) 무브는 안 섞인다',
    r.moves.every(m => m.study.bottleneck === 'UNIT_ECONOMICS'),
    r.moves.map(m => m.study.bottleneck).join(','))
  eq('1-4 등급 A 가 C 보다 먼저 온다', r.moves[r.moves.length - 1].evidence_grade, 'C')
}

// ── 2) ★ 같은 브랜드 자기매칭 배제 ────────────────────────────
{
  const r = matchMoves('UNIT_ECONOMICS', STUDIES, MOVES, 's-a')
  eq('2-1 자기 케이스 무브가 빠진다', r.moves.length, 1)
  check('2-2 남은 건 다른 케이스다', r.moves.every(m => m.case_study_id !== 's-a'),
    r.moves.map(m => m.case_study_id).join(','))
  eq('2-3 제외 카운트가 보고된다', r.excluded.self, 2)
  eq('2-4 상태는 여전히 matched', r.status, 'matched')
}
{
  // 자기 자신밖에 없으면 → 0건인데, 그건 "선례 없음(음성)"이지 "확인 불가"가 아니다.
  const r = matchMoves('UNIT_ECONOMICS', [S_A], [MOVES[0], MOVES[1]], 's-a')
  eq('2-5 자기밖에 없으면 no_match', r.status, 'no_match')
  eq('2-6 제외 사유가 남는다', r.excluded.self, 2)
  check('2-7 사유 문구에 "자기 케이스"가 들어간다', /자기 케이스 2건 제외/.test(r.reason), r.reason)
}

// ── 3) ★ no_match 와 not_run 을 섞지 않는가 (§7.1) ────────────
{
  const r = matchMoves('SUPPLY', STUDIES, MOVES)
  eq('3-1 진짜 없으면 no_match', r.status, 'no_match')
  check('3-2 "확인해보니 없다"로 말한다', /확인해보니 없다/.test(r.reason), r.reason)
  eq('3-3 no_match 의 moves 는 빈 배열', r.moves.length, 0)
}
{
  const r = matchMoves('UNIT_ECONOMICS', null, MOVES)
  eq('3-4 조회 실패는 not_run', r.status, 'not_run')
  check('3-5 "선례 0건이 아니다"라고 말한다', /확인 불가/.test(r.reason), r.reason)
}
{
  const r = matchMoves(null, STUDIES, MOVES)
  eq('3-6 병목이 없으면 not_run', r.status, 'not_run')
}
{
  const r = matchMoves('UNIT_ECONOMICS', STUDIES, null)
  eq('3-7 무브 조회 실패도 not_run', r.status, 'not_run')
}
{
  // 빈 배열은 조회가 된 것이다 — null 과 다르다.
  const r = matchMoves('UNIT_ECONOMICS', [], [])
  eq('3-8 빈 배열은 no_match (조회는 됐다)', r.status, 'no_match')
}

// ── 4) 케이스 승인 ≠ 무브 승인 ────────────────────────────────
{
  const r = matchMoves('UNIT_ECONOMICS', [S_A, study('s-d', 'draft-case', { review_status: 'draft' })],
    [move('m-d1', 's-d')], null)
  eq('4-1 케이스가 draft 면 뺀다', r.status, 'no_match')
  eq('4-2 미승인 카운트', r.excluded.not_approved, 1)
}
{
  const r = matchMoves('UNIT_ECONOMICS', [S_A], [move('m-a3', 's-a', { review_status: 'draft' })], null)
  eq('4-3 무브가 draft 면 뺀다 (케이스는 approved 인데도)', r.status, 'no_match')
  eq('4-4 미승인 카운트', r.excluded.not_approved, 1)
}

// ── 5) 등급 D 배제 ────────────────────────────────────────────
{
  const r = matchMoves('UNIT_ECONOMICS', [S_A], [move('m-a4', 's-a', { evidence_grade: 'D' })], null)
  eq('5-1 등급 D 는 선례로 안 쓴다', r.status, 'no_match')
  eq('5-2 D 제외 카운트', r.excluded.grade_d, 1)
  check('5-3 사유에 등급 D 가 적힌다', /등급 D 1건 제외/.test(r.reason), r.reason)
}

// ── 6) 패싯은 거르지 않고 정렬만 한다 ─────────────────────────
{
  const r = matchMoves('UNIT_ECONOMICS', STUDIES, MOVES, null,
    { business_model: 'MARKETPLACE_SELLER', buyer_type: 'B2C', price_band: 'MID' })
  eq('6-1 패싯이 달라도 후보에서 안 빠진다', r.moves.length, 3)
  const kurly = r.moves.find(m => m.study.slug === 'kurly')
  eq('6-2 일치 패싯이 기록된다', kurly.facet_hits.length, 3)
  check('6-3 그래도 등급이 패싯보다 세다 (A 가 먼저)',
    r.moves[0].evidence_grade === 'A', r.moves[0].evidence_grade)
}

// ── 7) 수요축 ─────────────────────────────────────────────────
{
  eq('7-1 조회 실패는 null', demandAxis(null).value, null)
  eq('7-2 유효값 0건도 null', demandAxis([null, undefined, NaN]).value, null)
  eq('7-3 기본 척도 1~10 → 상한 20, 최고 20 이 만점', demandAxis([3, 20, 5]).value, 1)
  eq('7-4 최고 10 은 0.5', demandAxis([10, 1]).value, 0.5)
  check('7-5 0 은 null 이 아니다 (음성과 확인 불가 구분)', demandAxis([0]).value === 0)
  // ★ 척도 상한을 넘으면 1.0 으로 포화시키지 않는다 — 그건 "최대 수요"가 아니라
  //   "척도 가정이 틀렸다"는 신호다. 실데이터(opportunity_score 17, 가정 max 5)에서 걸렸다.
  eq('7-6 상한 초과는 포화 아닌 확인 불가', demandAxis([17], 5).value, null)
  check('7-7 그 사유에 척도 얘기가 적힌다', /척도 가정이 틀렸다/.test(demandAxis([17], 5).reason),
    demandAxis([17], 5).reason)
  eq('7-8 척도를 맞게 주면 값이 나온다', Number(demandAxis([17], 10).value.toFixed(3)), 0.85)
}

// ── 8) 선례축 ─────────────────────────────────────────────────
{
  eq('8-1 not_run 이면 null', precedentAxis(matchMoves(null, STUDIES, MOVES)).value, null)
  eq('8-2 no_match 면 0 (null 아님)', precedentAxis(matchMoves('SUPPLY', STUDIES, MOVES)).value, 0)
  const full = precedentAxis(matchMoves('UNIT_ECONOMICS', STUDIES, MOVES))
  eq('8-3 A등급 2케이스면 1.0', full.value, 1)
  const one = precedentAxis(matchMoves('UNIT_ECONOMICS', [S_A], [MOVES[0]]))
  eq('8-4 A등급 1케이스는 0.8 (비교 짝이 없다)', Number(one.value.toFixed(4)), 0.8)
}

// ── 9) 사분면 ─────────────────────────────────────────────────
{
  eq('9-1 수요 확인 불가면 사분면 없음', quadrantOf(null, 1).quadrant, null)
  eq('9-2 선례 확인 불가면 사분면 없음', quadrantOf(1, null).quadrant, null)
  eq('9-3 둘 다 높으면 PROVEN_DEMAND', quadrantOf(0.8, 0.8).quadrant, 'PROVEN_DEMAND')
  eq('9-4 수요만 높으면 UNCHARTED_DEMAND', quadrantOf(0.8, 0.2).quadrant, 'UNCHARTED_DEMAND')
  eq('9-5 선례만 높으면 CROWDED_NO_DEMAND', quadrantOf(0.2, 0.8).quadrant, 'CROWDED_NO_DEMAND')
  eq('9-6 둘 다 낮으면 PARK', quadrantOf(0.2, 0.2).quadrant, 'PARK')
  check('9-7 선례 0(음성)은 사분면을 낸다 — 확인 불가와 다르다',
    quadrantOf(0.9, 0).quadrant === 'UNCHARTED_DEMAND')
}

// ── 10) 등급 순위 ─────────────────────────────────────────────
{
  check('10-1 A > B > C > D', GRADE_RANK.A > GRADE_RANK.B && GRADE_RANK.B > GRADE_RANK.C && GRADE_RANK.C > GRADE_RANK.D)
  eq('10-2 D 는 0 (배제 기준)', GRADE_RANK.D, 0)
  eq('10-3 모르는 등급은 undefined → 배제', GRADE_RANK.X, undefined)
}

// ── 결과 ──────────────────────────────────────────────────────
console.log(`\n통과 ${passed} / 실패 ${failures.length}`)
if (failures.length > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`)
  console.log('\n✗ 매칭기 자체 검증 실패')
  process.exit(1)
}
console.log('✓ 케이스 매칭·PMF 자체 검증 통과')
