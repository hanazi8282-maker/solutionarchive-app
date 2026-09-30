// 속성 판정 어휘 셀프테스트 — (I,S) 만으로 판정하고, 기회점수 분해가 DB 생성 컬럼과 같은 식인지.
//   node scripts/aspect-verdict-selftest.mjs
import { aspectVerdict, opportunityBreakdown, VERDICT_CUT, VERDICT_LABEL } from '../lib/analysis/aspect-verdict.ts'
import { MATURITY_STAGES, maturityStageOf } from '../lib/analysis/types.ts'
import { PMF_QUADRANT_ADVICE, QUADRANT, noQuadrantAdvice } from '../lib/cases/match.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

t('경계값 고정 — 중요도 6 / 만족도 3·5 (2026-10-01)', JSON.stringify(VERDICT_CUT), '{"importanceHigh":6,"satisfactionLow":3,"satisfactionHigh":5}')
t('라벨 — 슈퍼 니즈·니즈 포인트·기본기·버린다', [VERDICT_LABEL.PUSH, VERDICT_LABEL.WATCH, VERDICT_LABEL.TABLE_STAKES, VERDICT_LABEL.DROP].join('|'), '슈퍼 니즈|니즈 포인트|기본기|버린다')
// 중요도 경계 — 6 이상만 판정 대상, 5 는 만족도와 무관하게 버린다.
t('I6 S2 → PUSH (중요도 6 포함)', aspectVerdict(6, 2).code, 'PUSH')
t('I5 S2 → DROP (중요도 5 는 제외)', aspectVerdict(5, 2).code, 'DROP')
t('I5.9 S2 → DROP', aspectVerdict(5.9, 2).code, 'DROP')
t('I5 S1 → DROP (만족도와 무관)', aspectVerdict(5, 1).code, 'DROP')
// 만족도 2·3·4·5 각각 — 3 은 미만 비교라 슈퍼 니즈가 아니다(연산자 `<=` 로 되돌리면 여기서 걸린다).
t('I8 S2 → 슈퍼 니즈', aspectVerdict(8, 2).code, 'PUSH')
t('I8 S3 → 니즈 포인트 (3 은 미만 경계 밖)', aspectVerdict(8, 3).code, 'WATCH')
t('I8 S4 → 니즈 포인트', aspectVerdict(8, 4).code, 'WATCH')
t('I8 S5 → 기본기 (5 이상 포함)', aspectVerdict(8, 5).code, 'TABLE_STAKES')
t('I8 S8 → 기본기', aspectVerdict(8, 8).code, 'TABLE_STAKES')
// 소수값
t('I8 S2.9 → 슈퍼 니즈', aspectVerdict(8, 2.9).code, 'PUSH')
t('I8 S4.9 → 니즈 포인트', aspectVerdict(8, 4.9).code, 'WATCH')
t('I8 S3.0 → 니즈 포인트', aspectVerdict(8, 3.0).code, 'WATCH')
// 읽기 문장은 상수에서 숫자를 끌어온다
t('reading — 니즈 포인트 경계 문구', aspectVerdict(8, 4).reading.includes('3 이상 5 미만'), true)
t('reading — 슈퍼 니즈 경계 문구', aspectVerdict(8, 2).reading.includes('3 미만'), true)
t('reading — 기본기 경계 문구', aspectVerdict(8, 5).reading.includes('5 이상'), true)
t('판정 label 이 VERDICT_LABEL 과 같다', aspectVerdict(8, 3).label, VERDICT_LABEL.WATCH)
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

// 검수 화면 인용 번역(evidence_quotes_ko) — 워크플로를 고치지 않고 CI(build-check)에서 같이 돌린다. 실패하면 거기서 exit 1.
await import('./aspect-quotes-ko-selftest.mjs')
