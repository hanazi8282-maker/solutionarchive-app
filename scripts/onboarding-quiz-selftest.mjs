#!/usr/bin/env node
// lib/onboarding/quiz.ts 셀프테스트. 네트워크·DB 없음.
//
// 고정하는 것 (깨지면 실패해야 하는 것):
//   1) 정답은 항상 case_moves(성공) 쪽이다 — 순서를 섞어도, 수천 번 돌려도.
//   2) 응답자 30명 미만이면 퍼센타일이 절대 나오지 않는다(AC-4, §7.1).
//   3) 집계를 못 읽었을 때(null)를 "응답자 0명"으로 접지 않는다.
//   4) failed_angles 건수(6이냐 12냐)에 로직이 의존하지 않는다.
//   5) case_moves 의 negative 는 쓰지 않는다(§13-2 트랙 분리).

import {
  PERCENTILE_MIN_N,
  QUESTION_COUNT,
  buildQuiz,
  isCorrectPick,
  scoreHeadline,
  summarizeScore,
} from '../lib/onboarding/quiz.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 픽스처 ───────────────────────────────────────────────────────
const moves = Array.from({ length: 28 }, (_, i) => ({
  id: `m${i}`,
  claim: `성공 소구점 ${i}`,
  outcome_direction: 'positive',
}))
// 방법론 트랙 소재. 제품 트랙 퀴즈에 새어 들어오면 안 된다.
const negativeMoves = Array.from({ length: 23 }, (_, i) => ({
  id: `neg${i}`,
  claim: `실패 무브 ${i}`,
  outcome_direction: 'negative',
}))
const mkFailed = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    claimed_angle: `실패 소구점 ${i}`,
    product_category: `카테고리 ${i}`,
  }))

const moveClaims = new Set(moves.map((m) => m.claim))

// ── 1) 정답은 항상 성공(case_moves) 쪽 ───────────────────────────
// 결정적 rng 여러 개로 순서 분기를 양쪽 다 태운다.
let sawMoveFirst = false
let sawAngleFirst = false
let bothSidesSeen = 0
for (let seed = 0; seed < 300; seed++) {
  let s = seed + 1
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const qs = buildQuiz(moves, mkFailed(6), QUESTION_COUNT, rand)
  if (qs.length !== QUESTION_COUNT) { fail++; console.log(`❌ seed ${seed}: 문항 수 ${qs.length}`); break }
  for (const q of qs) {
    const correct = q.options.find((o) => o.side === q.correct_side)
    const wrong = q.options.find((o) => o.side !== q.correct_side)
    if (!moveClaims.has(correct.text)) {
      fail++; console.log(`❌ seed ${seed}: 정답 쪽이 case_moves 가 아니다 — ${correct.text}`); break
    }
    if (moveClaims.has(wrong.text)) {
      fail++; console.log(`❌ seed ${seed}: 오답 쪽에 case_moves 가 들어갔다 — ${wrong.text}`); break
    }
    if (q.correct_side === 'a') sawMoveFirst = true
    else sawAngleFirst = true
    bothSidesSeen++
  }
}
ok('정답은 항상 case_moves 쪽 (300 seed × 10문항)', bothSidesSeen === 3000)
ok('순서가 실제로 섞인다: 정답이 a 인 문항이 있다', sawMoveFirst)
ok('순서가 실제로 섞인다: 정답이 b 인 문항이 있다', sawAngleFirst)

// 옵션은 항상 a, b 두 장
{
  const qs = buildQuiz(moves, mkFailed(6))
  ok('모든 문항이 옵션 2장', qs.every((q) => q.options.length === 2))
  ok("옵션 side 는 a,b 순", qs.every((q) => q.options[0].side === 'a' && q.options[1].side === 'b'))
  ok('문항마다 서로 다른 case_move', new Set(qs.map((q) => q.case_move_id)).size === qs.length)
}

// ── 2) 건수 독립 (failed_angles 6건 → 12건) ──────────────────────
t('failed_angles 6건에서도 10문항', buildQuiz(moves, mkFailed(6)).length, 10)
t('failed_angles 12건에서도 10문항', buildQuiz(moves, mkFailed(12)).length, 10)
t('failed_angles 1건에서도 10문항(순환 재사용)', buildQuiz(moves, mkFailed(1)).length, 10)
t('성공 3건뿐이면 3문항(없는 문항을 만들지 않는다)', buildQuiz(moves.slice(0, 3), mkFailed(6)).length, 3)
t('성공 0건이면 0문항', buildQuiz([], mkFailed(6)).length, 0)
t('실패 0건이면 0문항', buildQuiz(moves, []).length, 0)

// ── 3) negative 는 절대 쓰지 않는다 (§13-2) ──────────────────────
t('negative 만 주면 0문항', buildQuiz(negativeMoves, mkFailed(6)).length, 0)
{
  const qs = buildQuiz([...moves, ...negativeMoves], mkFailed(6), 10)
  const negIds = new Set(negativeMoves.map((m) => m.id))
  ok('섞여 들어와도 negative 무브는 출제되지 않는다', qs.every((q) => !negIds.has(q.case_move_id)))
}

// ── 4) 채점 ──────────────────────────────────────────────────────
t('정답 일치 → true', isCorrectPick('a', 'a'), true)
t('정답 불일치 → false', isCorrectPick('a', 'b'), false)

// ── 5) 퍼센타일 임계값 (AC-4) ────────────────────────────────────
t('PERCENTILE_MIN_N 은 30', PERCENTILE_MIN_N, 30)
const nines = (n) => Array.from({ length: n }, () => 9)
{
  // 29명: 만점이어도 퍼센타일 없음
  const s = summarizeScore(10, 10, [...nines(28), 10])
  t('N=29 → 퍼센타일 null', s.percentile, null)
  t('N=29 → 응답자 수는 보여준다', s.respondents, 29)
  t('N=29 → 표기에 "상위" 없음', /상위/.test(scoreHeadline(s)), false)
  ok('N=29 → 표기에 원 수치', scoreHeadline(s).includes('정답 10/10') && scoreHeadline(s).includes('29명'))
}
{
  // 30명: 전환
  const s = summarizeScore(10, 10, [...nines(29), 10])
  t('N=30 → 퍼센타일 나옴', s.percentile, 1) // 나보다 높은 사람 0명 → 최소 1%
  ok('N=30 → 표기가 "상위 N%"', scoreHeadline(s).includes('상위 1%'))
}
{
  // 100명 중 30명이 나보다 높다 → 상위 30%
  const scores = [...Array.from({ length: 30 }, () => 10), ...Array.from({ length: 70 }, () => 5)]
  const s = summarizeScore(5, 10, scores)
  t('나보다 높은 30/100 → 상위 30%', s.percentile, 30)
}
{
  // 동점자는 같은 등수 — 만점 동점 50명 중 1명이어도 상위 1%
  const s = summarizeScore(10, 10, Array.from({ length: 50 }, () => 10))
  t('전원 동점이면 상위 1%', s.percentile, 1)
}
{
  // 최하점: 나보다 높은 사람이 전부 → 100% 를 넘지 않는다
  const s = summarizeScore(0, 10, [0, ...Array.from({ length: 49 }, () => 10)])
  ok('최하점 퍼센타일은 1~100 범위', s.percentile > 0 && s.percentile <= 100)
}
{
  // 작은 표본에서 퍼센타일이 새어나오지 않는지 전수 확인
  let leak = 0
  for (let n = 1; n < PERCENTILE_MIN_N; n++) {
    const s = summarizeScore(10, 10, Array.from({ length: n }, (_, i) => i % 11))
    if (s.percentile !== null || /상위/.test(scoreHeadline(s))) leak++
  }
  t('N=1..29 전부 퍼센타일 없음', leak, 0)
}

// ── 6) 확인 불가(null)를 0명으로 접지 않는다 (§7.1) ──────────────
{
  const s = summarizeScore(7, 10, null)
  t('집계 확인 불가 → respondents null', s.respondents, null)
  t('집계 확인 불가 → 퍼센타일 null', s.percentile, null)
  t('집계 확인 불가 → 표기는 점수만', scoreHeadline(s), '정답 7/10')
  ok('집계 확인 불가 → "0명"이라고 쓰지 않는다', !scoreHeadline(s).includes('0명'))
}
{
  const s = summarizeScore(7, 10, [])
  t('응답자 0명(조회 성공) → respondents 0', s.respondents, 0)
  ok('응답자 0명 → 표기에 0명 명시', scoreHeadline(s).includes('응답자 0명'))
}

// ── 결과 ─────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✅' : '❌'} onboarding-quiz-selftest: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
