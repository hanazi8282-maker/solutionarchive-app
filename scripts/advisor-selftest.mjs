#!/usr/bin/env node
// lib/cases/advisor.ts 셀프테스트. 네트워크·DB 없음.
//
// 고정하는 것: 태그·키워드 매칭이 맞는가 · §7.1 3상태(matched/no_match/not_run)를
// 지키는가 · 근거 0건일 때 "관련 사례 없음"을 명시하는가(끼워맞추기 금지) ·
// Corpus B 자리를 억지로 안 채우는가.

import { advise, matchPrinciples, matchCaseMoves, toTerms } from '../lib/cases/advisor.ts'

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

// ── advise (통합) ───────────────────────────────────────────────
{
  const r = advise({ category: 'SaaS 요금제', angleDescription: '하이브리드 pricing 전환' }, { principles: PRINCIPLES, studies: STUDIES, moves: MOVES })
  t('advise: 둘 다 걸림 → matched', r.status, 'matched')
  ok('advise: 선례·원칙 카드 둘 다 있음', r.corpus_a.cards.length > 0 && r.corpus_c.cards.length > 0)
  t('advise: corpus_b 는 pending', r.corpus_b.status, 'pending')
  ok('advise: corpus_b 자리만, 카드 없음', !('cards' in r.corpus_b))
  ok('advise: terms 에 pricing', r.terms.includes('pricing'))
}
{
  const r = advise({ category: 'zzznope', angleDescription: 'zzznope' }, { principles: PRINCIPLES, studies: STUDIES, moves: MOVES })
  t('advise: 둘 다 0건 → no_match', r.status, 'no_match')
  ok('advise: reason 에 "관련 사례 없음"', r.reason.includes('관련 사례 없음'))
  ok('advise: 억지로 안 채운다', r.corpus_a.cards.length === 0 && r.corpus_c.cards.length === 0)
}
{
  const r = advise({ category: null, angleDescription: null }, { principles: PRINCIPLES, studies: STUDIES, moves: MOVES })
  t('advise: 질의어 없음 → not_run', r.status, 'not_run')
}
{
  const r = advise({ category: 'pricing' }, { principles: null, studies: null, moves: null })
  t('advise: 모든 코퍼스 조회 실패 → not_run', r.status, 'not_run')
}
{
  // 한쪽만 살아있으면 그쪽으로 matched (반쪽이라도 근거를 준다)
  const r = advise({ category: 'pricing' }, { principles: PRINCIPLES, studies: null, moves: null })
  t('advise: 원칙만 살아있음 → matched', r.status, 'matched')
  t('advise: 선례는 not_run 으로 표시', r.corpus_a.status, 'not_run')
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('어드바이저 매칭/3상태가 틀렸다.'); process.exitCode = 1 }
else console.log('어드바이저 정상 — 태그·키워드 매칭 · 3상태 · "관련 사례 없음" 명시 · Corpus B 자리만.')
