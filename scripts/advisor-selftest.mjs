#!/usr/bin/env node
// lib/cases/advisor.ts 셀프테스트. 네트워크·DB 없음.
//
// 고정하는 것: 태그·키워드 매칭이 맞는가 · §7.1 3상태(matched/no_match/not_run)를
// 지키는가 · 근거 0건일 때 "관련 사례 없음"을 명시하는가(끼워맞추기 금지) ·
// Corpus B 가 실패 서술(outcome)로 우연히 걸리지 않는가 · 추정(is_estimate)이
// 사실 그대로인 사례보다 뒤로 밀리는가.

import { advise, matchPrinciples, matchCaseMoves, matchFailedAngles, toTerms } from '../lib/cases/advisor.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 픽스처 ───────────────────────────────────────────────────────
const PRINCIPLES = [
  { sp_id: 'SP-001', tags: ['pricing', 'hybrid'], statement: '하이브리드 프라이싱이 채택률 1위', evidence_grade: 'B', evidence_grade_note: '3자 서베이', source_ref: '§0-1' },
  { sp_id: 'SP-002', tags: ['pricing', 'antipattern'], statement: '크레딧 절벽은 이탈 유발', evidence_grade: 'B', evidence_grade_note: null, source_ref: '§3' },
  { sp_id: 'SP-007', tags: ['channel', 'legal'], statement: 'G2 이용약관은 스크래핑 금지', evidence_grade: 'A', evidence_grade_note: '원문 확인', source_ref: '§18-2' },
]

const STUDIES = [
  { id: 's1', slug: 'acme-pricing', brand_name: 'Acme', bottleneck: 'UNIT_ECONOMICS', business_model: 'SAAS', review_status: 'approved' },
  { id: 's2', slug: 'beta-trust', brand_name: 'Beta', bottleneck: 'TRUST', business_model: 'D2C', review_status: 'approved' },
  { id: 's3', slug: 'gamma-draft', brand_name: 'Gamma', bottleneck: 'UNIT_ECONOMICS', business_model: 'SAAS', review_status: 'draft' },
]
const MOVES = [
  { id: 'm1', case_study_id: 's1', lever: 'PRICING', claim: '하이브리드 요금제로 전환해 이탈률 개선', evidence_grade: 'A', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm2', case_study_id: 's2', lever: 'CONTENT', claim: '리뷰 투명성으로 신뢰 확보', evidence_grade: 'B', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm3', case_study_id: 's1', lever: 'PRICING', claim: '가격 실험', evidence_grade: 'D', outcome_direction: 'mixed', review_status: 'approved' },
  { id: 'm4', case_study_id: 's3', lever: 'PRICING', claim: '하이브리드 시도', evidence_grade: 'A', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm5', case_study_id: 's1', lever: 'PACKAGING', claim: '번들 구성', evidence_grade: 'B', outcome_direction: 'positive', review_status: 'draft' },
]

// Corpus B. product_category 가 서로 다르고, 그중 하나는 is_estimate=true.
// fa1/fa2 는 '프리미엄' 을 공유한다 — 매칭 수가 같을 때 추정이 뒤로 가는지 본다.
// fa3 의 outcome 에만 '규제' 를 둔다 — 실패 서술이 매칭 대상이 아님을 고정한다.
const FAILED_ANGLES = [
  { case_key: 'quibi-shortform', product_category: '모바일 숏폼 스트리밍', claimed_angle: '이동 중에만 보는 프리미엄 숏폼', outcome: '가입자가 목표에 못 미쳐 6개월 만에 종료', evidence_source: '다수 매체 보도', source_tier: '공개 보도', is_estimate: false },
  { case_key: 'segway-transporter', product_category: '개인용 이동수단', claimed_angle: '프리미엄 차세대 개인 이동수단', outcome: '가격과 실사용 편의성이 발목을 잡음', evidence_source: '다수 매체 보도', source_tier: '공개 보도', is_estimate: true },
  { case_key: 'juicero-press', product_category: '커넥티드 가전', claimed_angle: '앱 연동 착즙기', outcome: '각국 규제와 신뢰 붕괴로 폐업', evidence_source: '다수 매체 보도', source_tier: '공개 보도', is_estimate: false },
]

// ── toTerms ──────────────────────────────────────────────────────
ok('toTerms: 소문자·2자이상·중복제거', JSON.stringify(toTerms('Pricing pricing a', 'HYBRID')) === JSON.stringify(['pricing', 'hybrid']))
t('toTerms: 빈 입력 → []', toTerms(null, '', undefined).length, 0)
ok('toTerms: 한글 토큰', toTerms('하이브리드 요금제').includes('하이브리드'))

// ── matchPrinciples ─────────────────────────────────────────────
{
  const r = matchPrinciples(['pricing'], PRINCIPLES)
  t('원칙: pricing → matched', r.status, 'matched')
  t('원칙: pricing 태그 2건', r.cards.length, 2)
  ok('원칙: 카드에 evidence_grade 있음', r.cards.every((c) => ['A', 'B', 'C', 'D'].includes(c.evidence_grade)))
  ok('원칙: 카드에 source_ref 있음', r.cards.every((c) => c.source_ref.length > 0))
  ok('원칙: matched_terms 에 pricing', r.cards[0].matched_terms.includes('pricing'))
}
{
  const r = matchPrinciples(['존재하지않는키워드zzz'], PRINCIPLES)
  t('원칙: 겹침 0 → no_match', r.status, 'no_match')
  ok('원칙: no_match reason 에 "관련 사례 없음"', r.reason.includes('관련 사례 없음'))
  t('원칙: no_match 카드 0', r.cards.length, 0)
}
t('원칙: 질의어 없음 → not_run', matchPrinciples([], PRINCIPLES).status, 'not_run')
t('원칙: 조회 실패(null) → not_run', matchPrinciples(['pricing'], null).status, 'not_run')

// ── matchCaseMoves ──────────────────────────────────────────────
{
  const r = matchCaseMoves(['하이브리드'], STUDIES, MOVES)
  t('선례: 하이브리드 → matched', r.status, 'matched')
  // m1(approved, A) 만. m4 는 s3=draft, m3 은 D 등급.
  t('선례: 승인·비D 무브 1건', r.cards.length, 1)
  t('선례: m1', r.cards[0].case_move_id, 'm1')
  ok('선례: 카드에 slug·claim·grade', r.cards[0].slug === 'acme-pricing' && r.cards[0].evidence_grade === 'A')
}
{
  const r = matchCaseMoves(['nevermatchzzz'], STUDIES, MOVES)
  t('선례: 겹침 0 → no_match', r.status, 'no_match')
  ok('선례: no_match reason 에 "관련 사례 없음"', r.reason.includes('관련 사례 없음'))
}
t('선례: studies null → not_run', matchCaseMoves(['x'], null, MOVES).status, 'not_run')
t('선례: moves null → not_run', matchCaseMoves(['x'], STUDIES, null).status, 'not_run')

// ── matchFailedAngles ───────────────────────────────────────────
{
  const r = matchFailedAngles(['숏폼'], FAILED_ANGLES)
  t('실패사례: 카테고리 겹침 → matched', r.status, 'matched')
  t('실패사례: 1건', r.cards.length, 1)
  t('실패사례: quibi', r.cards[0].case_key, 'quibi-shortform')
  ok('실패사례: 카드에 claimed_angle·outcome 둘 다', r.cards[0].claimed_angle.length > 0 && r.cards[0].outcome.length > 0)
  ok('실패사례: kind 는 failed_angle', r.cards[0].kind === 'failed_angle')
  ok('실패사례: source_tier 있음', r.cards[0].source_tier === '공개 보도')
}
{
  const r = matchFailedAngles(['nevermatchzzz'], FAILED_ANGLES)
  t('실패사례: 겹침 0 → no_match', r.status, 'no_match')
  ok('실패사례: no_match reason 에 "관련 사례 없음"', r.reason.includes('관련 사례 없음'))
  t('실패사례: no_match 카드 0', r.cards.length, 0)
}
{
  // outcome 은 매칭 대상이 아니다 — '규제' 는 fa3 의 실패 서술에만 있다.
  const r = matchFailedAngles(['규제'], FAILED_ANGLES)
  t('실패사례: outcome 으로는 안 걸린다 → no_match', r.status, 'no_match')
}
t('실패사례: 질의어 없음 → not_run', matchFailedAngles([], FAILED_ANGLES).status, 'not_run')
t('실패사례: 조회 실패(null) → not_run', matchFailedAngles(['숏폼'], null).status, 'not_run')
{
  // 매칭 수가 같으면 is_estimate=false 가 앞. 과신 방지.
  const r = matchFailedAngles(['프리미엄'], FAILED_ANGLES)
  t('실패사례: 추정 가중 — 2건 매칭', r.cards.length, 2)
  t('실패사례: 사실 그대로가 먼저', r.cards[0].case_key, 'quibi-shortform')
  t('실패사례: 추정은 뒤로', r.cards[1].case_key, 'segway-transporter')
  ok('실패사례: 추정 카드 점수가 더 낮다', r.cards[0].score > r.cards[1].score)
  ok('실패사례: is_estimate 그대로 실린다', r.cards[1].is_estimate === true)
}

// ── advise (통합) ───────────────────────────────────────────────
{
  const r = advise({ category: 'SaaS 요금제', angleDescription: '하이브리드 pricing 전환' }, { principles: PRINCIPLES, studies: STUDIES, moves: MOVES, failedAngles: FAILED_ANGLES })
  t('advise: 둘 다 걸림 → matched', r.status, 'matched')
  ok('advise: 선례·원칙 카드 둘 다 있음', r.corpus_a.cards.length > 0 && r.corpus_c.cards.length > 0)
  t('advise: 무관한 실패사례는 no_match', r.corpus_b.status, 'no_match')
  ok('advise: corpus_b 도 cards 배열을 갖는다', Array.isArray(r.corpus_b.cards))
  t('advise: corpus_b 카드 0', r.corpus_b.cards.length, 0)
  ok('advise: terms 에 pricing', r.terms.includes('pricing'))
}
{
  // Corpus B 만 걸려도 전체 matched — 실패 회피 조언 하나만으로도 쓸모가 있다.
  const r = advise({ category: '모바일 숏폼 스트리밍' }, { principles: PRINCIPLES, studies: STUDIES, moves: MOVES, failedAngles: FAILED_ANGLES })
  t('advise: 실패사례만 걸림 → matched', r.status, 'matched')
  t('advise: corpus_b matched', r.corpus_b.status, 'matched')
  t('advise: corpus_a 는 no_match', r.corpus_a.status, 'no_match')
  t('advise: corpus_c 는 no_match', r.corpus_c.status, 'no_match')
  ok('advise: reason 에 실패사례 건수', r.reason.includes('실패사례 1'))
}
{
  const r = advise({ category: 'zzznope', angleDescription: 'zzznope' }, { principles: PRINCIPLES, studies: STUDIES, moves: MOVES, failedAngles: FAILED_ANGLES })
  t('advise: 셋 다 0건 → no_match', r.status, 'no_match')
  ok('advise: reason 에 "관련 사례 없음"', r.reason.includes('관련 사례 없음'))
  ok('advise: 억지로 안 채운다', r.corpus_a.cards.length === 0 && r.corpus_b.cards.length === 0 && r.corpus_c.cards.length === 0)
  t('advise: corpus_b 도 no_match', r.corpus_b.status, 'no_match')
}
{
  const r = advise({ category: null, angleDescription: null }, { principles: PRINCIPLES, studies: STUDIES, moves: MOVES, failedAngles: FAILED_ANGLES })
  t('advise: 질의어 없음 → not_run', r.status, 'not_run')
  t('advise: 질의어 없으면 corpus_b 도 not_run', r.corpus_b.status, 'not_run')
}
{
  const r = advise({ category: 'pricing' }, { principles: null, studies: null, moves: null, failedAngles: null })
  t('advise: 모든 코퍼스 조회 실패 → not_run', r.status, 'not_run')
  t('advise: failed_angles 조회 실패도 not_run', r.corpus_b.status, 'not_run')
}
{
  // 한쪽만 살아있으면 그쪽으로 matched (반쪽이라도 근거를 준다)
  const r = advise({ category: 'pricing' }, { principles: PRINCIPLES, studies: null, moves: null, failedAngles: null })
  t('advise: 원칙만 살아있음 → matched', r.status, 'matched')
  t('advise: 선례는 not_run 으로 표시', r.corpus_a.status, 'not_run')
  t('advise: 실패사례도 not_run 으로 표시', r.corpus_b.status, 'not_run')
}
{
  // 실패사례만 살아있는 반대 방향도 같은 규칙이어야 한다.
  const r = advise({ category: '모바일 숏폼 스트리밍' }, { principles: null, studies: null, moves: null, failedAngles: FAILED_ANGLES })
  t('advise: 실패사례만 살아있음 → matched', r.status, 'matched')
  t('advise: 원칙은 not_run 으로 표시', r.corpus_c.status, 'not_run')
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('어드바이저 매칭/3상태가 틀렸다.'); process.exitCode = 1 }
else console.log('어드바이저 정상 — 세 코퍼스 매칭 · 3상태 · "관련 사례 없음" 명시 · 추정 가중.')
