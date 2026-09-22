#!/usr/bin/env node
// lib/cases/grade-queue.ts 셀프테스트 — 카드 채점 모드의 순수 로직. 네트워크·DB 없음.
//   node scripts/cases-grade-selftest.mjs
//
// 왜 여기에 검사가 붙나: 줄 세우기가 틀려도 화면은 멀쩡해 보인다(카드 10장은 그대로 나온다).
// 틀린 10장을 사람이 하루 30분 채점하면 그 하루가 통째로 잘못된 재고로 간다.

import {
  GRADE_PAGE_SIZE, approvedMovesByBottleneck, caseApproveDefault, countReviewedToday,
  gradeQueuePage, kstDate, readGradeSubmission, sortGradeQueue,
} from '../lib/cases/grade-queue.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

const mv = (id, review_status = 'draft', transfer_note = '해 보기') => ({ id, review_status, transfer_note })
const cs = (id, o = {}) => ({
  id, created_at: o.created_at ?? '2026-09-01T00:00:00Z', business_model: o.business_model ?? 'D2C',
  bottleneck: o.bottleneck ?? 'ACQUISITION', review_status: o.review_status ?? 'draft',
  reviewed_at: o.reviewed_at ?? null, moves: o.moves ?? [mv(`${id}-m1`)],
})

// ── 1. KST 날짜 — 못 읽은 것과 오늘이 아닌 것을 가른다(§7.1) ──────────────
t('KST: UTC 15:00 은 다음 날', kstDate('2026-09-22T15:00:00Z') === '2026-09-23')
t('KST: UTC 14:59 은 같은 날', kstDate('2026-09-22T14:59:00Z') === '2026-09-22')
t('KST: null 은 null(오늘 아님으로 접지 않는다)', kstDate(null) === null)
t('KST: 파싱 불가도 null', kstDate('어제') === null)

// ── 2. 오늘 몇 장 했나 ─────────────────────────────────────────────────
const reviewedToday = [
  cs('a', { review_status: 'approved', reviewed_at: '2026-09-23T01:00:00Z' }), // KST 10:00
  cs('b', { review_status: 'rejected', reviewed_at: '2026-09-22T15:30:00Z' }), // KST 09-23 00:30
  cs('c', { review_status: 'approved', reviewed_at: '2026-09-21T01:00:00Z' }), // 어제
  cs('d', { review_status: 'draft', reviewed_at: '2026-09-23T02:00:00Z' }),    // 아직 draft 면 안 센다
  cs('e', { review_status: 'approved', reviewed_at: null }),                   // CLI 옛 행(시각 없음)
]
t('오늘 결정 2건(승인+반려, draft·어제·시각없음 제외)', countReviewedToday(reviewedToday, '2026-09-23') === 2)
t('결정 0건인 날은 0', countReviewedToday(reviewedToday, '2026-09-25') === 0)

// ── 3. 병목별 승인 무브 재고 ────────────────────────────────────────────
const stockSet = [
  cs('s1', { review_status: 'approved', bottleneck: 'RETENTION', moves: [mv('x', 'approved'), mv('y', 'approved'), mv('z', 'draft')] }),
  cs('s2', { review_status: 'approved', bottleneck: 'ACQUISITION', moves: [mv('p', 'approved')] }),
  cs('s3', { review_status: 'draft', bottleneck: 'ACQUISITION', moves: [mv('q', 'approved')] }), // 케이스가 draft 면 매칭에 못 든다
]
const stock = approvedMovesByBottleneck(stockSet)
t('승인 케이스의 승인 무브만 센다(RETENTION 2)', stock.get('RETENTION') === 2)
t('draft 케이스의 승인 무브는 재고가 아니다(ACQUISITION 1)', stock.get('ACQUISITION') === 1)
t('없는 병목은 undefined(0 으로 꾸미지 않는다)', stock.get('PRICING') === undefined)

// ── 4. 줄 세우기: SAAS → 재고 적은 병목 → 오래된 것 ─────────────────────
const queue = [
  cs('old-d2c', { created_at: '2026-01-01T00:00:00Z', bottleneck: 'RICH' }),
  cs('saas-new', { created_at: '2026-09-20T00:00:00Z', business_model: 'SAAS', bottleneck: 'RICH' }),
  cs('saas-old', { created_at: '2026-08-01T00:00:00Z', business_model: 'SAAS', bottleneck: 'RICH' }),
  cs('saas-poor', { created_at: '2026-09-21T00:00:00Z', business_model: 'SAAS', bottleneck: 'POOR' }),
  cs('d2c-poor', { created_at: '2026-09-22T00:00:00Z', bottleneck: 'POOR' }),
]
const counts = new Map([['RICH', 9], ['POOR', 1]])
const sorted = sortGradeQueue(queue, counts).map((c) => c.id)
t('SAAS 3건이 앞', sorted.slice(0, 3).every((id) => id.startsWith('saas')))
t('SAAS 안에서는 재고 적은 병목 먼저', sorted[0] === 'saas-poor')
t('같은 병목이면 오래된 것 먼저', sorted[1] === 'saas-old' && sorted[2] === 'saas-new')
t('SAAS 아닌 것도 재고 적은 병목 먼저', sorted[3] === 'd2c-poor' && sorted[4] === 'old-d2c')
t('원본 배열을 바꾸지 않는다', queue[0].id === 'old-d2c')
t('재고 정보가 없으면(빈 맵) 날짜순', sortGradeQueue(queue, new Map()).map((c) => c.id)[0] === 'saas-old')

// ── 5. 10장 자르기 ──────────────────────────────────────────────────────
const many = Array.from({ length: 23 }, (_, i) => `c${i}`)
t('한 페이지 10장', GRADE_PAGE_SIZE === 10 && gradeQueuePage(many, 1).items.length === 10)
t('1페이지는 앞 10장', gradeQueuePage(many, 1).items[0] === 'c0' && gradeQueuePage(many, 1).items[9] === 'c9')
t('3페이지는 남은 3장', gradeQueuePage(many, 3).items.length === 3 && gradeQueuePage(many, 3).items[0] === 'c20')
t('전체·페이지 수', gradeQueuePage(many, 1).total === 23 && gradeQueuePage(many, 1).pages === 3)
t('범위 밖 페이지는 빈 목록(1 로 조용히 되돌리지 않는다)', gradeQueuePage(many, 9).items.length === 0 && gradeQueuePage(many, 9).page === 9)
t('0·음수·소수는 1페이지', gradeQueuePage(many, 0).page === 1 && gradeQueuePage(many, -3).page === 1 && gradeQueuePage(many, 1.5).page === 1)
t('빈 큐도 1페이지 1쪽', gradeQueuePage([], 1).pages === 1 && gradeQueuePage([], 1).items.length === 0)

// ── 6. 케이스 승인 체크박스 기본값 ──────────────────────────────────────
t('무브 1건 이상 체크 → 케이스 승인 기본 켬', caseApproveDefault(1) === true && caseApproveDefault(3) === true)
t('무브 0건 → 기본 끔', caseApproveDefault(0) === false)

// ── 7. 제출 payload ────────────────────────────────────────────────────
// ?? 를 쓰지 않는다 — null 을 넘기는 것과 안 넘기는 것을 가려야 "폼에 없음"을 검사할 수 있다.
const pick = (o, k, dflt) => (k in o ? o[k] : dflt)
const sub = (o = {}) => readGradeSubmission({
  caseId: pick(o, 'caseId', 'case-1'),
  moveIds: pick(o, 'moveIds', ['m1']),
  transferabilityOf: pick(o, 'transferabilityOf', () => 'HIGH'),
  approveCase: pick(o, 'approveCase', 'on'),
})
t('정상 제출', sub().value?.moves[0].transferability === 'HIGH' && sub().value?.approveCase === true)
t('케이스 미체크(폼에 없음) → approveCase false', sub({ approveCase: null }).value?.approveCase === false)
t('이식성 미선택도 통과(미판정 null)', sub({ transferabilityOf: () => '' }).value?.moves[0].transferability === null)
t('이식성 어휘 밖은 거절 — 조용히 null 로 접지 않는다', sub({ transferabilityOf: () => 'VERY_HIGH' }).error !== undefined)
t('케이스 id 없으면 거절', sub({ caseId: '  ' }).value === null && sub({ caseId: null }).error !== undefined)
t('아무것도 안 고르면 거절', sub({ moveIds: [], approveCase: null }).error !== undefined)
t('무브 0건 + 케이스 승인만도 통과', sub({ moveIds: [], approveCase: 'on' }).value?.moves.length === 0)
t('무브 id 중복은 한 번만', sub({ moveIds: ['m1', 'm1', 'm2'] }).value?.moves.length === 2)
t('빈 무브 id 는 거절', sub({ moveIds: ['m1', ' '] }).error !== undefined)
t('무브별로 다른 이식성이 붙는다', (() => {
  const v = sub({ moveIds: ['m1', 'm2'], transferabilityOf: (id) => (id === 'm1' ? 'LOW' : 'MEDIUM') }).value
  return v?.moves[0].transferability === 'LOW' && v?.moves[1].transferability === 'MEDIUM'
})())

console.log(`${fail === 0 ? '✅' : '❌'} cases-grade selftest: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
