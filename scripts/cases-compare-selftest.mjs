#!/usr/bin/env node
// lib/cases/compare.ts 셀프테스트 — 네트워크·DB 없음.
//
// 고정하는 것: 짝의 4조건(같은 병목·레버 / 방향 반대 / 케이스 다름 / 양쪽 승인) ·
// §7.1 3상태 · SaaS 짝 0일 때의 문구(가짜로 채우지 않는다).

import { pairMoves, pairsForMoves, saasPairNotice } from '../lib/cases/compare.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const S = (id, bm, status = 'approved', bottleneck = 'TRUST') =>
  ({ id, slug: id, brand_name: id.toUpperCase(), bottleneck, business_model: bm, review_status: status })
const M = (id, sid, dir, lever = 'OPERATIONS', status = 'approved') =>
  ({ id, case_study_id: sid, lever, claim: `${id} 주장`, evidence_grade: 'B', outcome_direction: dir, review_status: status })

const STUDIES = [
  S('c1', 'D2C'), S('c2', 'D2C'),            // 소비재 성공 ↔ 실패
  S('c3', 'SAAS'), S('c4', 'D2C'),           // 섞인 짝(SaaS 끼리 아님)
  S('c5', 'D2C', 'draft'),                   // 미승인 케이스
  S('c6', 'D2C', 'approved', 'SUPPLY'),      // 병목이 다르다
]

// ── 1. 기본 짝 ───────────────────────────────────────────────────
{
  const r = pairMoves(STUDIES, [M('a1', 'c1', 'positive'), M('a2', 'c2', 'negative')])
  t('짝: 같은 병목·레버·방향 반대·케이스 다름 → matched', r.status, 'matched')
  t('짝: 1묶음', r.pairs.length, 1)
  t('짝: SaaS 끼리는 0묶음', r.saas_pairs, 0)
  ok('짝: 키가 병목|레버', r.pairs[0].key === 'TRUST|OPERATIONS')
}

// ── 2. 빠져야 하는 것들 ──────────────────────────────────────────
{
  t('같은 케이스 안에서 갈린 것은 짝이 아니다',
    pairMoves(STUDIES, [M('b1', 'c1', 'positive'), M('b2', 'c1', 'negative')]).status, 'no_match')
  t('레버가 다르면 짝이 아니다',
    pairMoves(STUDIES, [M('b3', 'c1', 'positive', 'PRICING'), M('b4', 'c2', 'negative', 'CONTENT')]).status, 'no_match')
  t('병목이 다르면 짝이 아니다',
    pairMoves(STUDIES, [M('b5', 'c1', 'positive'), M('b6', 'c6', 'negative')]).status, 'no_match')
  t('미승인 케이스는 짝이 아니다',
    pairMoves(STUDIES, [M('b7', 'c1', 'positive'), M('b8', 'c5', 'negative')]).status, 'no_match')
  t('미승인 무브는 짝이 아니다',
    pairMoves(STUDIES, [M('b9', 'c1', 'positive'), M('b10', 'c2', 'negative', 'OPERATIONS', 'draft')]).status, 'no_match')
  t('mixed 방향은 짝이 아니다(positive↔negative 만)',
    pairMoves(STUDIES, [M('b11', 'c1', 'positive'), M('b12', 'c2', 'mixed')]).status, 'no_match')
  t('성공만 있으면 짝이 아니다',
    pairMoves(STUDIES, [M('b13', 'c1', 'positive'), M('b14', 'c2', 'positive')]).status, 'no_match')
}

// ── 3. SaaS 판정 · 정렬 ──────────────────────────────────────────
{
  const mixedPair = pairMoves(STUDIES, [M('d1', 'c3', 'positive'), M('d2', 'c4', 'negative')])
  t('한쪽만 SaaS 면 SaaS 짝이 아니다', mixedPair.saas_pairs, 0)
  const saasStudies = [...STUDIES, S('c7', 'SAAS')]
  const both = pairMoves(saasStudies, [M('e1', 'c3', 'positive'), M('e2', 'c7', 'negative'), M('e3', 'c1', 'positive', 'PRICING'), M('e4', 'c2', 'negative', 'PRICING')])
  t('양쪽 SaaS → SaaS 짝 1묶음', both.saas_pairs, 1)
  ok('정렬: SaaS 묶음이 먼저', both.pairs[0].saas === true)
}

// ── 4. 3상태 · 문구 ──────────────────────────────────────────────
{
  const nr = pairMoves(null, null)
  t('조회 실패 → not_run', nr.status, 'not_run')
  ok('not_run 사유가 "확인 불가"', nr.reason.includes('확인 불가'))
  t('SaaS 0일 때 문구', saasPairNotice(3), 'SaaS 비교 사례 축적 중 — 지금은 소비재 짝 3묶음')
}

// ── 5. 리포트용 좁히기(pairsForMoves) — 내 매칭과 같은 병목·레버만 ──────────
{
  const saasStudies = [...STUDIES, S('c7', 'SAAS')]
  const all = pairMoves(saasStudies, [M('f1', 'c3', 'positive'), M('f2', 'c7', 'negative'), M('f3', 'c1', 'positive', 'PRICING'), M('f4', 'c2', 'negative', 'PRICING')])
  const hit = pairsForMoves(all, [{ case_study_id: 'c1', lever: 'PRICING' }], saasStudies)
  t('좁히기: 같은 병목·레버 1묶음만 남는다', hit.pairs.length, 1)
  t('좁히기: 남은 묶음 키', hit.pairs[0]?.key, 'TRUST|PRICING')
  const miss = pairsForMoves(all, [{ case_study_id: 'c1', lever: 'CONTENT' }], saasStudies)
  t('좁히기: 겹치는 짝이 없으면 no_match', miss.status, 'no_match')
  ok('좁히기: 0묶음 사유에 코퍼스 전체 묶음 수를 밝힌다', miss.reason.includes('코퍼스 전체로는 2묶음'))
  t('좁히기: 매칭 무브 0장이면 no_match', pairsForMoves(all, [], saasStudies).status, 'no_match')
  t('좁히기: 조회 실패는 not_run 그대로', pairsForMoves(pairMoves(null, null), [], null).status, 'not_run')
}

console.log(fail === 0 ? `\n통과 ${pass}건\n성공/실패 비교 정상 — 짝 4조건 · 3상태 · SaaS 축적 중 문구.` : `\n통과 ${pass}건, 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
