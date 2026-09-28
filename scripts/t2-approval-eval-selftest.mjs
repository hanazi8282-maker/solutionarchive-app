#!/usr/bin/env node
// rr-v2 평가 하네스 순수 부품 셀프테스트 — gold·채점·재확인 추출·옛 프롬프트 일치. 네트워크·DB·LLM 없음.
//   node scripts/t2-approval-eval-selftest.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EVAL_GATE, goldOf, predictA, scoreEval, verdictAgreement } from '../lib/analysis/t2-approval-eval.ts'
import { INFORMATIVE_EXAMPLE_INPUT_IDS, RR39_NARROW_IRRELEVANT_INPUT_IDS } from '../lib/analysis/relevance-criteria.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`) } }

const T = '2026-09-28T01:00:00Z'
const R = { verdict: 'relevant', product_informative: true }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n, hv, hi, first = R, second = R) => ({ input_id: id(n), human_verdict: hv, human_product_informative: hi, human_graded_at: hv ? T : null, first, second })

// gold — 정보 열 있으면 감사 킬스위치 잣대, 없으면 관련=true 추정
const g = (x) => (x === null ? null : `${x.value}${x.estimated ? '~' : ''}`)
ok(g(goldOf(row(1, 'relevant', true))) === 'true', 'gold: 관련∧정보 → true(확정)')
ok(g(goldOf(row(1, 'relevant', false))) === 'false' && g(goldOf(row(1, 'irrelevant', true))) === 'false', 'gold: 정보 없음·무관 → false')
ok(g(goldOf(row(1, 'relevant', null))) === 'true~', 'gold: 관련 ∧ 정보 빔 → true 추정')
ok(g(goldOf(row(1, 'irrelevant', null))) === 'false', 'gold: 무관 ∧ 정보 빔 → false(확정)')
ok(goldOf(row(1, 'unknown', null)) === null && goldOf(row(1, 'unknown', true)) === null && goldOf(row(1, null, null)) === null, 'gold: 모름·미채점 → null')
const narrow = RR39_NARROW_IRRELEVANT_INPUT_IDS[0]
ok(goldOf({ ...row(1, 'irrelevant', null), input_id: narrow }) === null && goldOf({ ...row(1, 'relevant', null), input_id: narrow }) === null, 'gold: 좁은 기준 8건은 재확인(정보 열) 전 미정')
ok(g(goldOf({ ...row(1, 'relevant', true), input_id: narrow })) === 'true', 'gold: 좁은 기준 8건도 재확인 뒤엔 믿는다')

// 예측
ok(predictA(R, R) === true, 'A: 둘 다 관련∧정보')
ok(predictA(R, { verdict: 'relevant', product_informative: null }) === false && predictA({ verdict: 'unknown', product_informative: true }, R) === false, 'A 아님: 정보 null·1차 unknown')
ok(predictA(null, R) === null && predictA(R, null) === null, '판정 없음 → 예측 불가(null)')

// 채점
const X = { verdict: 'irrelevant', product_informative: false }
const rows = [
  row(1, 'relevant', true), row(2, 'relevant', true), row(3, 'relevant', true, R, X), // 양성 3, A 2
  row(4, 'relevant', false),                                                         // A 인데 정보 없음 → 오류
  row(5, 'irrelevant', true, X, X),                                                  // 음성·not A
  row(6, 'unknown', null),                                                           // gold 없음 + A → 재확인 a
  row(7, null, null, R, X),                                                          // 사람 없음·not A → 재확인 아님
  row(8, 'relevant', true, null, R),                                                 // 판정 빠짐
  { ...row(9, 'relevant', true), input_id: INFORMATIVE_EXAMPLE_INPUT_IDS[1] },       // 예시(#13) — 채점 제외
]
const r = scoreEval(rows)
ok(r.excluded_examples === 1, `예시 id 제외 1 (실제 ${r.excluded_examples})`)
ok(r.unjudged === 1, `판정 빠짐 1 (실제 ${r.unjudged})`)
ok(r.n_A === 3 && r.errors === 1, `n_A 3 · 오류 1 (실제 ${r.n_A}·${r.errors})`)
ok(Math.abs(r.precision - 2 / 3) < 1e-9 && Math.abs(r.recall - 2 / 3) < 1e-9, `정밀도·재현율 2/3 (실제 ${r.precision}·${r.recall})`)
const rc = new Map(r.recheck.map((x) => [x.input_id, x.reason]))
ok(rc.get(id(6)) === 'a' && !rc.has(id(7)) && !rc.has(INFORMATIVE_EXAMPLE_INPUT_IDS[1]), '재확인 a: 사람 모름인데 A, 예시는 빼고')
ok(r.gold_estimated === 0, `정보 열 채운 행만 A → 추정 0 (실제 ${r.gold_estimated})`)

// 회귀(09-28 실데이터 A 0 · 재확인 57): 사람 정보 열이 전부 NULL 이어도 채점된다. 재확인은 부딪치는 행만.
const nul = scoreEval([
  row(11, 'relevant', null), row(12, 'relevant', null),       // A ∧ 관련 → 추정 정답, 재확인 아님
  row(13, 'irrelevant', null),                                 // A ∧ 무관 → 오류, 재확인 a
  row(14, 'unknown', null),                                    // A ∧ 모름 → 미정, 재확인 a
  row(15, 'relevant', null, R, X),                             // not A ∧ 관련 → 재확인 c
  row(16, 'irrelevant', null, X, X),                           // not A ∧ 무관 → 일치, 재확인 아님
  row(17, null, null, X, X),                                   // 사람 없음 → 재확인 아님
  { ...row(18, 'irrelevant', null, X, X), input_id: narrow },  // 좁은 8건 → 미정, b
])
const nrc = new Map(nul.recheck.map((x) => [x.input_id, x.reason]))
ok(nul.n_A === 3 && nul.errors === 1 && nul.gold_estimated === 2, `정보 열 전부 NULL: n_A 3 · 오류 1 · 추정 2 (실제 ${nul.n_A}·${nul.errors}·${nul.gold_estimated})`)
ok(Math.abs(nul.recall - 2 / 3) < 1e-9, `정보 열 전부 NULL: 재현율 2/3 (실제 ${nul.recall})`)
ok(nrc.get(id(13)) === 'a' && nrc.get(id(14)) === 'a' && nrc.get(id(15)) === 'c' && nrc.get(narrow) === 'b', '재확인: 부딪치는 행 a·c + 좁은 b')
ok(nul.recheck.length === 3 + RR39_NARROW_IRRELEVANT_INPUT_IDS.length, `재확인 = 부딪치는 3 + 좁은 8 (실제 ${nul.recheck.length})`)
ok(RR39_NARROW_IRRELEVANT_INPUT_IDS.every((x) => nrc.get(x) === 'b'), '정보 열 NULL 입력에서도 좁은 8건 항상 b')
ok(RR39_NARROW_IRRELEVANT_INPUT_IDS.every((x) => rc.get(x) === 'b'), '좁은 기준 8건은 표본에 없어도 항상 b 로 들어간다')
ok(RR39_NARROW_IRRELEVANT_INPUT_IDS.length === 8 && new Set(r.recheck.map((x) => x.input_id)).size === r.recheck.length, '8건·중복 없음')
ok(!r.meets_gate, '문턱 미달(n_A<40)')
const big = scoreEval([...Array(40)].map((_, i) => row(100 + i, 'relevant', true)))
ok(big.meets_gate && big.n_A === 40 && big.errors === 0, '40건 오류 0 재현율 100% → 문턱 충족')
const gap = scoreEval([...[...Array(40)].map((_, i) => row(200 + i, 'relevant', true)), row(300, 'relevant', true, null, R)])
ok(!gap.meets_gate, '판정 빠진 행이 있으면 문턱 판정을 하지 않는다(§7.1)')
ok(EVAL_GATE.minNA === 40 && EVAL_GATE.maxErrors === 2 && EVAL_GATE.minRecall === 0.5, '문턱 수치 n_A≥40·오류≤2·재현율≥50%')

// 옛 프롬프트 대비 1차 일치
const ag = verdictAgreement(new Map([['a', 'relevant'], ['b', 'irrelevant'], ['c', 'relevant']]), new Map([['a', 'relevant'], ['b', 'relevant']]))
ok(ag.n === 2 && ag.agree === 1 && ag.flips[0].input_id === 'b', '일치율은 양쪽에 다 있는 id 만, 바뀐 행을 돌려준다')

// 배선
const h = readFileSync(`${ROOT}scripts/t2-approval-eval.mjs`, 'utf8')
ok(h.includes('scoreEval(') && h.includes('verdictAgreement(') && !/[0-9a-f]{8}-[0-9a-f]{4}-4/.test(h), '하네스가 순수 부품을 쓴다(예시·재확인 id 는 lib 에서만)')
ok(h.includes("원문 ${raw.size}/${ids.length}건만 읽힘") && h.includes('process.exit(2)'), '원본 읽기 건수 불일치 → 비0 종료')
ok(h.includes("if (o.error)") && h.includes('캐시 안 함'), '호출 실패는 캐시하지 않는다')
// 순환·4바퀴 로직은 야간 2차와 같은 헬퍼다 — 하네스에 복사본이 다시 생기면 실패(동작 검사는 relevance-second-judge-selftest).
ok(h.includes('callGeminiRotating(') && !h.includes('round < 4'), '2차 503 모델 순환 4바퀴 = 공용 헬퍼')
ok(!/\.(update|upsert|insert|delete)\(/.test(h), '하네스는 DB 에 쓰지 않는다')

console.log(`\n${fail ? '❌' : '✅'} rr-v2 평가 하네스 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
