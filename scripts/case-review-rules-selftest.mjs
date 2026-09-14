#!/usr/bin/env node
// lib/cases/review.ts 셀프테스트. 네트워크·DB 없음.
//   node scripts/case-review-rules-selftest.mjs

import {
  checkDecisionInput, moveApprovalWarning, caseApprovalWarning,
  readTransferability, isTransferability, TRANSFERABILITY, TRANSFERABILITY_LABEL, TRANSFERABILITY_UNRATED_HINT,
} from '../lib/cases/review.ts'

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

// ── 이식성 판정 — 관측은 조사원, 판정은 사람 (마이그 20260915000001) ──
//
// ★ 미선택도 승인된다. 판정을 필수로 걸면 검수 병목이 더 심해진다.
//   대신 미선택은 "낮음"이 아니라 "미판정"이고, 앵글 정렬에서 HIGH 아래·LOW 위다.
t('이식성 어휘 3개', TRANSFERABILITY.length === 3 && TRANSFERABILITY.every(isTransferability))
t('이식성 미선택은 null 로 저장되고 승인은 통과', readTransferability('').value === null && !readTransferability('').error)
t('이식성 undefined 도 미판정', readTransferability(undefined).value === null && !readTransferability(undefined).error)
t('이식성 공백만 있어도 미판정', readTransferability('   ').value === null)
t('이식성 HIGH 통과', readTransferability('HIGH').value === 'HIGH')
t('이식성 앞뒤 공백은 다듬는다', readTransferability(' LOW ').value === 'LOW')
t('이식성 어휘 밖은 error — 조용히 null 로 접지 않는다',
  readTransferability('MAYBE').error !== undefined && readTransferability('MAYBE').value === null)
t('이식성 소문자는 어휘 밖이다 (DB CHECK 와 같은 규칙)', readTransferability('high').error !== undefined)
t('미판정 안내가 순위를 그대로 말한다',
  TRANSFERABILITY_UNRATED_HINT.includes('HIGH 아래') && TRANSFERABILITY_UNRATED_HINT.includes('LOW 위'))
t('세 값 모두 사람이 읽을 라벨이 있다', TRANSFERABILITY.every((v) => TRANSFERABILITY_LABEL[v]?.length > 0))
t('승인 입력 검증은 이식성을 요구하지 않는다 (검수를 막지 않는다)',
  checkDecisionInput({ decision: 'approved', by: '남헌', note: '' }) === null)

console.log(fail ? `실패 ${fail}건` : '통과 23건 — 검수 입력 검증 · 승인 경고 규칙 · 이식성 판정 입력')
process.exitCode = fail ? 1 : 0
