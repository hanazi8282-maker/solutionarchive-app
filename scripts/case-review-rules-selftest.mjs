#!/usr/bin/env node
// lib/cases/review.ts 셀프테스트. 네트워크·DB 없음.
//   node scripts/case-review-rules-selftest.mjs

import {
  checkDecisionInput, moveApprovalWarning, caseApprovalWarning,
  readTransferability, isTransferability, TRANSFERABILITY, TRANSFERABILITY_LABEL, TRANSFERABILITY_UNRATED_HINT,
} from '../lib/cases/review.ts'
import {
  planReaderAxisBackfill, assertBackfillColumns, pairKey,
  MOVE_BACKFILL_COLUMNS, STUDY_BACKFILL_COLUMNS,
} from '../lib/cases/backfill.ts'

let fail = 0
const t = (name, cond) => { if (!cond) { fail++; console.log(`❌ ${name}`) } }

t('검수자 없으면 거절', checkDecisionInput({ decision: 'approved', by: '  ', note: '' }) !== null)
t('반려 사유 없으면 거절', checkDecisionInput({ decision: 'rejected', by: '남헌', note: ' ' }) !== null)
t('반려 + 사유 통과', checkDecisionInput({ decision: 'rejected', by: '남헌', note: '근거가 자기보고뿐' }) === null)
t('승인은 메모 없이 통과', checkDecisionInput({ decision: 'approved', by: '남헌', note: '' }) === null)
t('draft 로 되돌리기 거절', checkDecisionInput({ decision: 'draft', by: '남헌', note: 'x' }) !== null)
t('결정값 없음 거절', checkDecisionInput({ decision: null, by: '남헌', note: 'x' }) !== null)

// 2026-09-16: evidence_grade(독자 인사이트) 가 아니라 fact_check_grade(사실확인) 를 본다.
t('부정 + 사실확인 B 승인 → 경고', moveApprovalWarning({ outcome_direction: 'negative', fact_check_grade: 'B' }) !== null)
t('부정 + 사실확인 A → 경고 없음', moveApprovalWarning({ outcome_direction: 'negative', fact_check_grade: 'A' }) === null)
t('긍정 + 사실확인 C → 경고 없음', moveApprovalWarning({ outcome_direction: 'positive', fact_check_grade: 'C' }) === null)

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

// ── 전이축 백필 짝짓기 (lib/cases/backfill.ts) ──
//
// 가장 틀리기 쉬운 지점이 짝짓기다. case_moves 에 초안 인덱스 컬럼이 없어서
// created_at 정렬에 의존하면 같은 lever 가 둘일 때(purple·oatly 는 무브 2개가 둘 다
// OPERATIONS) 조용히 엇갈린다. 그래서 lever+metric_name 으로 맞추고, 애매하면
// **건너뛰고 확인 불가로 보고한다** — 추측으로 쓰지 않는다 (§7.1).

const mv = (lever, metric_name, extra = {}) => ({ lever, metric_name, ...extra })
const dbrow = (id, lever, metric_name, extra = {}) => ({ id, lever, metric_name, ...extra })
const plan1 = (draft, study, rows, opt) => planReaderAxisBackfill(draft, study, rows, opt)

// (1) purple·oatly 모양 — 같은 케이스에 OPERATIONS 무브가 2개. 수치명이 갈라 준다.
{
  const p = plan1(
    { moves: [
      mv('OPERATIONS', '매출총이익률', { transfer_note: '주문이 몰리기 전에 외주 설비의 최소 물량 계약을 먼저 확인한다', preconditions: '외주 가능한 공정이 있어야 한다' }),
      mv('OPERATIONS', '생산설비 취득원가', { transfer_note: '설비 투자 전에 수요 지속 3개월치를 실측으로 확인한다', preconditions: '월별 실판매 데이터' }),
    ] },
    {},
    [dbrow('r-b', 'OPERATIONS', '생산설비 취득원가'), dbrow('r-a', 'OPERATIONS', '매출총이익률')],
  )
  t('같은 lever 2개 — 수치명으로 각각 짝이 잡힌다',
    p.moves[0].row_id === 'r-a' && p.moves[1].row_id === 'r-b' && p.moves.every(m => m.status === 'matched'))
  t('같은 lever 2개 — DB 행 순서가 뒤바뀌어도 안 엇갈린다', p.moves[0].key !== p.moves[1].key && p.orphanRows.length === 0)
  t('짝이 맞으면 두 컬럼을 쓴다', p.writeCount === 4 && !p.negative)
  t('쓰는 컬럼은 전이축 2개뿐이다',
    p.moves.every(m => m.write.every(f => MOVE_BACKFILL_COLUMNS.includes(f.column))))
}

// (2) 수치명 불일치 → 음성. 비슷한 행에 추측으로 쓰지 않는다.
{
  const p = plan1(
    { moves: [mv('CHANNEL', '재구매율', { transfer_note: '첫 구매 30일 뒤 리마인드 한 통을 직접 보내 본다' })] },
    {},
    [dbrow('r-1', 'CHANNEL', '재구매율 (90일)')],
  )
  t('수치명 불일치는 no_match', p.moves[0].status === 'no_match' && p.moves[0].row_id === null)
  t('수치명 불일치면 아무것도 쓰지 않는다', p.writeCount === 0 && p.negative)
  t('짝이 안 된 DB 행은 orphan 으로 보고된다', p.orphanRows.length === 1 && p.orphanRows[0].id === 'r-1')
}

// (3) 초안 3무브 / DB 2행 — 남는 무브만 건너뛰고 나머지는 쓴다.
{
  const p = plan1(
    { moves: [
      mv('CONTENT', 'a', { transfer_note: '같은 질문을 받은 고객 문의 10건을 먼저 모아 본다' }),
      mv('PRICING', 'b', { transfer_note: '가격을 올리기 전에 상위 10% 고객에게만 먼저 물어본다' }),
      mv('OFFER', 'c', { transfer_note: '묶음 구성을 하나만 만들어 2주 돌려 본다' }),
    ] },
    {},
    [dbrow('r-1', 'CONTENT', 'a'), dbrow('r-2', 'PRICING', 'b')],
  )
  t('DB 에 없는 무브 1개만 no_match', p.moves.filter(m => m.status === 'no_match').length === 1)
  t('나머지 2개는 짝이 잡혀 쓴다', p.moves.filter(m => m.status === 'matched').length === 2 && p.writeCount === 2)
  t('초안이 더 많아도 orphan 은 0', p.orphanRows.length === 0)
  t('일부라도 짝을 못 지으면 음성이다 (종료코드 1)', p.negative)
}

// (4) 이미 값이 있는 필드는 덮지 않는다. 덮으려면 --overwrite.
{
  const draft = { moves: [mv('CONTENT', 'a', { transfer_note: '새로 채우려는 구체적 행동 문장이다', preconditions: '새 전제' })] }
  const rows = [dbrow('r-1', 'CONTENT', 'a', { transfer_note: '이미 적혀 있던 행동', preconditions: null })]
  const keep = plan1(draft, {}, rows)
  t('이미 값이 있으면 그 필드만 건너뛴다', keep.moves[0].write.length === 1 && keep.moves[0].write[0].column === 'preconditions')
  t('건너뛴 이유와 현재 값을 같이 보고한다',
    keep.moves[0].skip.some(s => s.column === 'transfer_note' && s.from === '이미 적혀 있던 행동' && s.reason.includes('이미 값이 있다')))
  const over = plan1(draft, {}, rows, { overwrite: true })
  t('--overwrite 면 둘 다 쓴다', over.moves[0].write.length === 2)
  const same = plan1({ moves: [mv('CONTENT', 'a', { transfer_note: '이미 적혀 있던 행동' })] }, {}, rows, { overwrite: true })
  t('같은 값이면 --overwrite 라도 UPDATE 를 내지 않는다', same.writeCount === 0)
  const empty = plan1({ moves: [mv('CONTENT', 'a', {})] }, {}, [dbrow('r-1', 'CONTENT', 'a')])
  t('초안에 값이 없으면 쓸 게 없다 (null 로 지우지 않는다)', empty.writeCount === 0)
}

// (5) 짝이 둘 이상 매칭 → 확인 불가.
{
  const p = plan1(
    { moves: [mv('OPERATIONS', '가동 공장 수', { transfer_note: '증설 결정 전에 가동률 6개월 추이를 먼저 본다' })] },
    {},
    [dbrow('r-1', 'OPERATIONS', '가동 공장 수'), dbrow('r-2', 'OPERATIONS', '가동 공장 수')],
  )
  t('DB 행이 2개 매칭되면 ambiguous', p.moves[0].status === 'ambiguous' && p.moves[0].row_id === null)
  t('ambiguous 면 아무것도 쓰지 않는다', p.writeCount === 0 && p.negative)
  t('ambiguous 보고에 후보 행 id 가 들어간다', p.moves[0].reason.includes('r-1') && p.moves[0].reason.includes('r-2'))
}

// (6) 초안 쪽에 같은 키가 둘이면 그것도 확인 불가다 (역방향 애매함).
{
  const p = plan1(
    { moves: [
      mv('OPERATIONS', '가동 공장 수', { transfer_note: '증설 결정 전에 가동률 6개월 추이를 먼저 본다' }),
      mv('OPERATIONS', '가동 공장 수', { transfer_note: '장기 임차 대신 단기 외주로 한 분기를 먼저 넘긴다' }),
    ] },
    {},
    [dbrow('r-1', 'OPERATIONS', '가동 공장 수'), dbrow('r-2', 'OPERATIONS', '가동 공장 수')],
  )
  t('초안에 같은 키가 둘이면 둘 다 ambiguous', p.moves.every(m => m.status === 'ambiguous') && p.writeCount === 0)
}

// (7) 수치명 없는 무브 / 공백 차이.
{
  const ok = plan1(
    { moves: [mv('COMMUNITY', null, { transfer_note: '단골 20명만 따로 모아 한 달 굴려 본다' })] },
    {}, [dbrow('r-1', 'COMMUNITY', null), dbrow('r-2', 'CONTENT', null)],
  )
  t('수치명 null 도 lever 로 유일하면 짝이 된다', ok.moves[0].status === 'matched' && ok.moves[0].row_id === 'r-1')
  t('공백 차이는 같은 키로 본다',
    pairKey({ lever: 'CONTENT', metric_name: ' 재구매율  (90일) ' }) === pairKey({ lever: 'CONTENT', metric_name: '재구매율 (90일)' }))
}

// (8) 케이스 reader_problem — 어휘 밖은 조용히 넘기지 않는다 (DB CHECK 전에 잡는다).
{
  const good = plan1({ reader_problem: 'MAKE_BUT_NO_MONEY', moves: [] }, {}, [])
  t('빈칸이면 reader_problem 을 쓴다', good.study.status === 'write' && good.study.to === 'MAKE_BUT_NO_MONEY' && !good.negative)
  const dup = plan1({ reader_problem: 'MAKE_BUT_NO_MONEY', moves: [] }, { reader_problem: 'NO_CHANNEL' }, [])
  t('이미 값이 있으면 reader_problem 도 안 덮는다', dup.study.status === 'skip' && dup.writeCount === 0)
  const bad = plan1({ reader_problem: 'MONEY_PROBLEM', moves: [] }, {}, [])
  t('어휘 밖 reader_problem 은 음성 (23514 를 맞기 전에 잡는다)', bad.study.status === 'skip' && bad.study.negative && bad.negative)
}

// (9) 쓰는 컬럼은 정확히 셋뿐이다 — 주석이 아니라 코드가 막는다.
t('백필 컬럼은 정확히 3개', MOVE_BACKFILL_COLUMNS.length === 2 && STUDY_BACKFILL_COLUMNS.length === 1
  && [...MOVE_BACKFILL_COLUMNS, ...STUDY_BACKFILL_COLUMNS].join(',') === 'transfer_note,preconditions,reader_problem')
t('화이트리스트 밖 컬럼은 던진다 (review_status)', (() => {
  try { assertBackfillColumns({ transfer_note: 'x', review_status: 'approved' }, MOVE_BACKFILL_COLUMNS); return false }
  catch { return true }
})())
t('등급 컬럼도 던진다 (evidence_grade)', (() => {
  try { assertBackfillColumns({ evidence_grade: 'A' }, MOVE_BACKFILL_COLUMNS); return false }
  catch { return true }
})())
t('허용 컬럼만 있으면 통과', assertBackfillColumns({ transfer_note: 'x' }, MOVE_BACKFILL_COLUMNS).transfer_note === 'x')
t('계획이 승인·등급 컬럼을 아예 만들지 않는다', (() => {
  const p = plan1(
    { reader_problem: 'NO_CHANNEL', moves: [mv('CONTENT', 'a', { transfer_note: '구체적인 행동 문장을 하나 적어 둔다', preconditions: '전제' })] },
    {}, [dbrow('r-1', 'CONTENT', 'a')])
  const cols = [...p.moves.flatMap(m => m.write.map(f => f.column)), p.study.column]
  return cols.every(c => ['transfer_note', 'preconditions', 'reader_problem'].includes(c))
})())

console.log(fail ? `실패 ${fail}건` : '통과 48건 — 검수 입력 검증 · 승인 경고 규칙 · 이식성 판정 입력 · 전이축 백필 짝짓기')
process.exitCode = fail ? 1 : 0
