// lib/consult/viability.ts 자체 검증. config/viability_rules_v1.json 수치 그대로, 네트워크·DB 없이 돈다.
//
//   node scripts/viability-selftest.mjs
//
import { readFileSync } from 'node:fs'
import { scorePlan, scoreAdvice } from '../lib/consult/viability.ts'

const rules = JSON.parse(readFileSync(new URL('../config/viability_rules_v1.json', import.meta.url)))

let pass = 0, fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL:', name) } }

// 결론서 v5 샘플(슬기로운 알바관리) 재현 — V 12/39, A 24/24
const sample = rules.conclusion_sample_benchmark
const v = scorePlan(rules, sample.v_items)
t('V 합계 12/39 재현', v.total === sample.v_score && v.max === sample.v_max)
t('V 밴드 = 근본 미검증', v.band === sample.v_band)

const a = scoreAdvice(rules, sample.a_items, { isFirstMonth: true })
t('A 합계 24/24 재현', a.total === sample.a_score && a.max === sample.a_max)
t('A gate 통과(첫 달 17 기준)', a.passesGate === true)

// cap 규칙: V1~V4 가 1점 이하면 V6~V10 은 최대 1로 눌린다
const capped = scorePlan(rules, { V1: 1, V2: 1, V3: 1, V4: 1, V6: 3, V7: 3, V8: 3, V9: 3, V10: 3 })
t('cap 규칙이 V6~V10 을 1로 누른다', capped.items.V6 === 1 && capped.items.V10 === 1 && capped.capped.length === 5)
t('cap 규칙은 V1~V4 가 전부 2 이상이면 안 걸린다', scorePlan(rules, { V1: 2, V2: 2, V3: 2, V4: 2, V6: 3 }).items.V6 === 3)

// 미응답은 0점(추정 금지)
t('미응답 항목은 0점', scorePlan(rules, {}).total === 0)

// A 등급 경계: 첫 달 17 vs 이후 20
t('첫 달 임계값 17', rules.advice_rubric_a1_a12.gate_thresholds.first_month === 17)
t('이후 임계값 20', rules.advice_rubric_a1_a12.gate_thresholds.after_first_month === 20)
const borderline = { A1: 2, A2: 2, A3: 2, A4: 2, A5: 2, A6: 2, A7: 2, A8: 2, A9: 1, A10: 0, A11: 0, A12: 0 } // 합계 17
t('17점은 첫 달 통과, 이후 미달', scoreAdvice(rules, borderline, { isFirstMonth: true }).passesGate === true && scoreAdvice(rules, borderline, { isFirstMonth: false }).passesGate === false)

// 규칙 개수(지시서 숫자와 일치해야 함)
t('F1~F13 13개', Object.keys(rules.failure_modes).length === 13)
t('V1~V13 13개', Object.keys(rules.viability_rubric_v1_v13.items).length === 13)
t('A1~A12 12개', Object.keys(rules.advice_rubric_a1_a12.items).length === 12)
t('kill_criteria 10개', rules.kill_criteria_top10.length === 10)

console.log(`통과 ${pass} / 실패 ${fail}`)
if (fail > 0) process.exit(1)
console.log('✓ v71cl-엔진 채점기 자체 검증 통과')
