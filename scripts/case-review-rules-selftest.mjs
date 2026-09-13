#!/usr/bin/env node
// lib/cases/review.ts 셀프테스트. 네트워크·DB 없음.
//   node scripts/case-review-rules-selftest.mjs

import { checkDecisionInput, moveApprovalWarning, caseApprovalWarning } from '../lib/cases/review.ts'

let fail = 0
const t = (name, cond) => { if (!cond) { fail++; console.log(`❌ ${name}`) } }

t('검수자 없으면 거절', checkDecisionInput({ decision: 'approved', by: '  ', note: '' }) !== null)
t('반려 사유 없으면 거절', checkDecisionInput({ decision: 'rejected', by: '남헌', note: ' ' }) !== null)
t('반려 + 사유 통과', checkDecisionInput({ decision: 'rejected', by: '남헌', note: '근거가 자기보고뿐' }) === null)
t('승인은 메모 없이 통과', checkDecisionInput({ decision: 'approved', by: '남헌', note: '' }) === null)
t('draft 로 되돌리기 거절', checkDecisionInput({ decision: 'draft', by: '남헌', note: 'x' }) !== null)
t('결정값 없음 거절', checkDecisionInput({ decision: null, by: '남헌', note: 'x' }) !== null)

t('부정 + B 승인 → 경고', moveApprovalWarning({ outcome_direction: 'negative', evidence_grade: 'B' }) !== null)
t('부정 + A → 경고 없음', moveApprovalWarning({ outcome_direction: 'negative', evidence_grade: 'A' }) === null)
t('긍정 + C → 경고 없음', moveApprovalWarning({ outcome_direction: 'positive', evidence_grade: 'C' }) === null)

t('draft 무브 1건 남은 케이스 승인 → 경고', caseApprovalWarning([{ review_status: 'draft' }, { review_status: 'approved' }])?.includes('1건'))
t('무브 전부 결정됨 → 경고 없음', caseApprovalWarning([{ review_status: 'approved' }, { review_status: 'rejected' }]) === null)
t('무브 0건 → 경고 없음', caseApprovalWarning([]) === null)

console.log(fail ? `실패 ${fail}건` : '통과 12건 — 검수 입력 검증 · 승인 경고 규칙')
process.exitCode = fail ? 1 : 0
