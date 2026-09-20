// 문제 해결 제안 셀프테스트 — 픽스처만 쓴다(네트워크·DB 없음).
//   node scripts/remedy-selftest.mjs
//
// 지키는 것
//   1) 처방 대상은 (중요도, 만족도)만으로 고른다. 선례가 많다고 대상이 되지 않는다.
//   2) 3상태를 속성마다 유지한다 — "관련 사례 없음" 과 "조회를 못 했다" 를 같은 빈 배열로 접지 않는다.
//   3) 문장 템플릿이 한 곳이다. 여기서 깨지면 요약 마크다운과 화면이 갈라진다.
//   4) 겹친 낱말이 하나뿐인 매칭(SP-024)의 저신뢰 표시가 카드까지 살아서 올라온다.

import { buildRemedies, fixLine, failureLine, principleLine, MAX_FIXES, MAX_FAILURES, MAX_PRINCIPLES } from '../lib/cases/remedy.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

const project = { market: '탈모 샴푸', product_elevator_pitch: '두피 진정 샴푸' }

const studies = [
  { id: 's1', slug: 'acme', brand_name: '두피랩', bottleneck: 'TRUST', business_model: 'D2C', buyer_type: 'B2C', price_band: 'MID', review_status: 'approved' },
]
const moves = [
  { id: 'm1', case_study_id: 's1', lever: 'CONTENT', claim: '두피 가려움 리뷰를 상세페이지에 그대로 붙였다', evidence_grade: 'A', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm2', case_study_id: 's1', lever: 'OFFER', claim: '가려움 개선 안 되면 환불', evidence_grade: 'B', fact_check_grade: 'C', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm3', case_study_id: 's1', lever: 'PRICING', claim: '가려움 완화 정기구독 할인', evidence_grade: 'C', fact_check_grade: 'D', outcome_direction: 'mixed', review_status: 'approved' },
  { id: 'm4', case_study_id: 's1', lever: 'CHANNEL', claim: '가려움 키워드 검색광고', evidence_grade: 'C', fact_check_grade: 'C', outcome_direction: 'positive', review_status: 'approved' },
]
const failedAngles = [
  { case_key: 'f1', product_category: '샴푸', claimed_angle: '가려움 즉시 사라짐', outcome: '과장광고로 제재', evidence_source: 'x', source_tier: 'primary', is_estimate: false },
  { case_key: 'f2', product_category: '샴푸', claimed_angle: '가려움 없는 두피', outcome: '반품률 상승', evidence_source: 'y', source_tier: 'secondary', is_estimate: true },
  { case_key: 'f3', product_category: '샴푸', claimed_angle: '가려움 완전 정복', outcome: '재구매 없음', evidence_source: 'z', source_tier: 'tertiary', is_estimate: false },
]
const principles = [
  { sp_id: 'SP-001', tags: ['가려움', '샴푸'], statement: '가려움은 증상이지 원인이 아니다', evidence_grade: 'A', evidence_grade_note: null, source_ref: 'docs' },
  { sp_id: 'SP-002', tags: ['샴푸'], statement: '샴푸 시장은 향으로 갈린다', evidence_grade: 'B', evidence_grade_note: null, source_ref: 'docs' },
  { sp_id: 'SP-003', tags: ['가려움'], statement: '가려움 주장은 근거를 요구받는다', evidence_grade: 'C', evidence_grade_note: null, source_ref: 'docs' },
]
const corpora = { principles, studies, moves, failedAngles }

const aspects = [
  { id: 'a1', name: '가려움', notes: '두피 가려움 불만이 반복된다', importance: 9, satisfaction: 2 },  // PUSH
  { id: 'a2', name: '향', notes: '향 호불호', importance: 8, satisfaction: 8 },                        // TABLE_STAKES
  { id: 'a3', name: '용량', notes: '용량 언급', importance: 3, satisfaction: 2 },                       // DROP
  { id: 'a4', name: '거품', notes: '거품 반반', importance: 7, satisfaction: 5 },                       // WATCH
]

// ── 1. 대상 선별 ─────────────────────────────────────────────
const r = buildRemedies({ aspects, project, corpora })
t('PUSH · WATCH 만 카드가 된다', r.cards.map((c) => c.aspect_id).join(','), 'a1,a4')
t('PUSH 가 먼저다', r.cards[0].verdict.code, 'PUSH')
t('TABLE_STAKES 는 제외', r.cards.some((c) => c.aspect_id === 'a2'), false)
t('DROP 은 제외', r.cards.some((c) => c.aspect_id === 'a3'), false)
t('헤드라인 템플릿', r.cards[0].headline, "'가려움' 문제 — 비슷한 문제를 이렇게 보완한 사례가 있다")

// ── 2. 상한 ──────────────────────────────────────────────────
t('보완 선례 3건 상한', r.cards[0].fixes.length, MAX_FIXES)
t('막힌 사례 2건 상한', r.cards[0].failures.length, MAX_FAILURES)
t('원칙 2건 상한', r.cards[0].principles.length, MAX_PRINCIPLES)

// ── 3. 문장 템플릿 ───────────────────────────────────────────
const fx = r.cards[0].fixes.find((f) => f.case_move_id === 'm1')
t('보완 선례 한 줄 — 사실확인·인사이트 등급을 둘 다 적는다',
  fixLine(fx), '두피랩 가 CONTENT 로 "두피 가려움 리뷰를 상세페이지에 그대로 붙였다" (사실확인 B · 인사이트 A · positive)')
t('사실확인 등급이 조회에 없으면 "미기재" (D 와 다르다)',
  fixLine({ ...fx, fact_check_grade: null }).includes('사실확인 미기재'), true)
t('fixLine — negative 무브는 반면교사로 명시(이렇게 하지 마라)',
  fixLine({ ...fx, brand_name: 'Zenefits', lever: 'OPERATIONS', claim: '라이선스 교육을 매크로로 건너뛰었다', outcome_direction: 'negative' }).startsWith('⛔ 반면교사 — 이렇게 하지 마라: Zenefits 는 OPERATIONS 로'), true)
t('fixLine — negative 는 "보완" 어투(가 … 로)를 쓰지 않는다',
  /Zenefits 가 /.test(fixLine({ ...fx, brand_name: 'Zenefits', outcome_direction: 'negative' })), false)
const est = r.cards[0].failures.find((f) => f.case_key === 'f2')
t('막힌 사례 한 줄 — 추정 표시', est ? failureLine(est) : '', '가려움 없는 두피 → 반품률 상승 (secondary · 추정 포함)')
t('막힌 사례 한 줄 — 추정 아님',
  failureLine({ claimed_angle: '가려움 즉시 사라짐', outcome: '과장광고로 제재', source_tier: 'primary', is_estimate: false }),
  '가려움 즉시 사라짐 → 과장광고로 제재 (primary)')
t('원칙 한 줄', principleLine(r.cards[0].principles[0]).startsWith('SP-'), true)
t('원칙 한 줄에 등급', /\([ABCD]\)$/.test(principleLine(r.cards[0].principles[0])), true)

// ── 4. 저신뢰 전달 (SP-024) ──────────────────────────────────
const single = buildRemedies({
  aspects: [{ id: 'z1', name: '가려움', notes: null, importance: 9, satisfaction: 1 }],
  project: { market: null, product_elevator_pitch: null },
  corpora: { principles: [principles[2]], studies: [], moves: [], failedAngles: [] },
})
t('겹친 낱말 1개면 저신뢰가 카드까지 올라온다', single.cards[0].principles[0].low_confidence, true)

// ── 5. 3상태 ─────────────────────────────────────────────────
const noMatch = buildRemedies({
  aspects: [{ id: 'n1', name: '배송', notes: null, importance: 9, satisfaction: 1 }],
  project: { market: null, product_elevator_pitch: null },
  corpora: { principles: [], studies: [], moves: [], failedAngles: [] },
})
t('조회 정상 + 0건 = no_match', noMatch.status, 'no_match')
t('no_match 여도 카드는 나온다 (문제는 있다)', noMatch.cards.length, 1)
t('no_match 카드 문장', noMatch.cards[0].status, 'no_match')

const notRun = buildRemedies({
  aspects: [{ id: 'n1', name: '배송', notes: null, importance: 9, satisfaction: 1 }],
  project: null,
  corpora: { principles: null, studies: null, moves: null, failedAngles: null },
})
t('코퍼스 조회 실패 = not_run (0건이 아니다)', notRun.status, 'not_run')

t('속성 조회 실패 = not_run', buildRemedies({ aspects: null, project, corpora }).status, 'not_run')
t('속성 조회 실패면 카드 0장', buildRemedies({ aspects: null, project, corpora }).cards.length, 0)

const noPain = buildRemedies({ aspects: [aspects[1], aspects[2]], project, corpora })
t('페인 속성 0건 = no_match (확인 불가가 아니다)', noPain.status, 'no_match')
t('페인 속성 0건이면 카드 0장', noPain.cards.length, 0)
t('페인 0건 사유에 속성 수를 적는다', /속성 2건/.test(noPain.reason), true)

t('판정 없는 속성(값 null)은 대상이 아니다',
  buildRemedies({ aspects: [{ id: 'u1', name: '가려움', notes: null, importance: null, satisfaction: null }], project, corpora }).cards.length, 0)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('처방 대상은 (I,S)로만 고르고, 3상태와 저신뢰 표시가 카드까지 살아 있다.')
