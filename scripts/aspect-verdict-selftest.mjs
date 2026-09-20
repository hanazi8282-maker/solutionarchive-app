// 속성 판정 어휘 셀프테스트 — (I,S) 만으로 판정하고, 기회점수 분해가 DB 생성 컬럼과 같은 식인지.
//   node scripts/aspect-verdict-selftest.mjs
import { aspectVerdict, opportunityBreakdown, VERDICT_CUT } from '../lib/analysis/aspect-verdict.ts'
import { MATURITY_STAGES, maturityStageOf } from '../lib/analysis/types.ts'
import { PMF_QUADRANT_ADVICE, QUADRANT, noQuadrantAdvice } from '../lib/cases/match.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

t('경계값 고정 — 중요도 6 / 만족도 4·6', JSON.stringify(VERDICT_CUT), '{"importanceHigh":6,"satisfactionLow":4,"satisfactionHigh":6}')
t('I8 S2 → PUSH', aspectVerdict(8, 2).code, 'PUSH')
t('I6 S4 → PUSH (경계 포함)', aspectVerdict(6, 4).code, 'PUSH')
t('I8 S8 → TABLE_STAKES', aspectVerdict(8, 8).code, 'TABLE_STAKES')
t('I6 S6 → TABLE_STAKES (경계 포함)', aspectVerdict(6, 6).code, 'TABLE_STAKES')
t('I5 S1 → DROP (만족도와 무관)', aspectVerdict(5, 1).code, 'DROP')
t('I8 S5 → WATCH', aspectVerdict(8, 5).code, 'WATCH')
t('I null → UNKNOWN (0 으로 접지 않는다)', aspectVerdict(null, 5).code, 'UNKNOWN')
t('S undefined → UNKNOWN', aspectVerdict(8, undefined).code, 'UNKNOWN')
t('문자열 숫자도 받는다', aspectVerdict('8', '2').code, 'PUSH')
t('판정 문장에 선례·사분면 낱말이 없다(두 축 분리)', /선례|사분면/.test([8, 2, 8, 8, 4, 2, 8, 5].reduce((s, _, i, a) => i % 2 ? s : s + aspectVerdict(a[i], a[i + 1]).reading, '')), false)

const b = opportunityBreakdown(8, 2, 14)
t('분해 — 격차 max(I−S,0)', b.gap, 6)
t('분해 — 합계 I+gap = DB 값', b.computed, 14)
t('분해 — DB 와 일치', b.mismatch, false)
t('분해 — 만족도가 중요도 이상이면 격차 0', opportunityBreakdown(5, 9, 5).gap, 0)
t('분해 — DB 값이 다르면 mismatch 를 숨기지 않는다', opportunityBreakdown(8, 2, 13).mismatch, true)
t('분해 — 값 없으면 null (0 아님)', opportunityBreakdown(null, 2, 5).gap, null)

t('성숙도 5단계 전부', MATURITY_STAGES.length, 5)
t('성숙도 단계마다 행동 1줄', MATURITY_STAGES.every((m) => m.action.length > 10), true)
t('성숙도 6 → null', maturityStageOf(6), null)
t('성숙도 null → null', maturityStageOf(null), null)
t('사분면 처방 4개 전부', QUADRANT.every((q) => PMF_QUADRANT_ADVICE[q]?.length > 10), true)
t('처방에 보장 낱말 없음', QUADRANT.some((q) => /확실|보장|성공한다/.test(PMF_QUADRANT_ADVICE[q])), false)
t('사분면 없음 — 선례축 빈 경우 진단 실행 안내', /진단/.test(noQuadrantAdvice(0.5, null)), true)
t('사분면 없음 — 수요축 빈 경우 원문 안내', /원문/.test(noQuadrantAdvice(null, 0.5)), true)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('판정 어휘 정상 — (I,S) 만으로 판정, 분해는 표시용, 처방은 권고.')
