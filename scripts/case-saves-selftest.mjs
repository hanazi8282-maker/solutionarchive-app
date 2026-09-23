#!/usr/bin/env node
// lib/cases/saves.ts 셀프테스트 — 네트워크·DB 없음. 순수 함수만 부른다.
//   node scripts/case-saves-selftest.mjs
//
// 고정하는 것 (이 중 하나가 접히면 화면은 멀쩡해 보이는데 내용이 틀린다 — 그게 이 검사의 이유다):
//   1. 3상태. "테이블이 아직 없다"(마이그 미적용)를 "저장 안 됨"으로도, 일반 오류로도 접지 않는다.
//      접히면 버튼이 "저장" 으로 보이고 눌러도 아무 일이 안 나거나, 사람이 할 일(마이그 실행)이
//      화면에서 사라진다(§7.1).
//   2. 23505(유니크 위반)는 실패가 아니라 "이미 저장됨"이다 — 더블클릭·두 탭에서만 난다.
//   3. 저장 목록: 승인 내려간 케이스를 조용히 빼지 않고 개수(hidden)로 돌려준다.

import { classifySaveError, isDuplicateSave, savedCards, SAVES_MIGRATION } from '../lib/cases/saves.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 1. 오류 3상태 ────────────────────────────────────────────────
t('오류 없음 = null (저장 안 됨과 섞지 않는다)', classifySaveError(null), null)
t('undefined 도 null', classifySaveError(undefined), null)
t('42P01(Postgres: 테이블 없음) = 마이그 미적용', classifySaveError({ code: '42P01', message: 'relation "public.case_saves" does not exist' })?.kind, 'migration_missing')
t('PGRST205(PostgREST 스키마 캐시) = 마이그 미적용', classifySaveError({ code: 'PGRST205', message: "Could not find the table 'public.case_saves' in the schema cache" })?.kind, 'migration_missing')
t('코드가 비고 메시지만 와도 마이그 미적용으로 읽는다', classifySaveError({ message: 'Could not find the table \'public.case_saves\' in the schema cache' })?.kind, 'migration_missing')
t('그 밖의 실패는 error (마이그 미적용으로 위장하지 않는다)', classifySaveError({ code: '08006', message: 'connection failure' })?.kind, 'error')
t('권한 오류도 error — 마이그를 다시 돌리라고 말하면 안 된다', classifySaveError({ code: '42501', message: 'permission denied for table case_saves' })?.kind, 'error')
ok('마이그 미적용 문구는 파일명을 그대로 말한다(사람이 찾아 실행할 수 있게)',
  classifySaveError({ code: '42P01', message: 'x' })?.reason.includes(SAVES_MIGRATION))
ok('사유 미상도 빈 문장으로 내보내지 않는다', classifySaveError({})?.reason.includes('사유 미상'))

// ⚠️ 42501(permission denied)이 'error' 인 것은 뜻이 있다 — RLS 가 붙었는데 service_role 이
//    아닌 키로 들어온 경우다. 그때 "마이그 미적용" 이라고 말하면 이미 적용된 마이그를 다시
//    돌리러 가게 되고, 진짜 원인(잘못된 키)은 계속 남는다.

// ── 2. 유니크 위반 = 이미 저장됨 ─────────────────────────────────
t('23505 는 실패가 아니라 이미 저장됨', isDuplicateSave({ code: '23505' }), true)
t('다른 코드는 아니다', isDuplicateSave({ code: '42P01' }), false)
t('오류 없음도 아니다', isDuplicateSave(null), false)

// ── 3. 저장 목록 분류 ────────────────────────────────────────────
const studies = [
  { id: 'c1', slug: 'a', brand_name: 'A', bottleneck: 'TRUST', review_status: 'approved' },
  { id: 'c2', slug: 'b', brand_name: 'B', bottleneck: 'TRUST', review_status: 'draft' }, // 승인 내려감
]
const moves = [
  { id: 'm1', case_study_id: 'c1', lever: 'PRICE', claim: 'x', evidence_grade: 'A', outcome_direction: 'positive', review_status: 'approved', transfer_note: '내일 할 것', created_at: '2026-09-01' },
  { id: 'm2', case_study_id: 'c1', lever: 'PRICE', claim: 'y', evidence_grade: 'C', outcome_direction: 'positive', review_status: 'draft', created_at: '2026-09-02' },
]
const rows = [
  { case_study_id: 'c1', created_at: '2026-09-20T00:00:00Z' },
  { case_study_id: 'c2', created_at: '2026-09-21T00:00:00Z' },
  { case_study_id: 'c9', created_at: '2026-09-22T00:00:00Z' }, // 케이스가 지워짐
]
const out = savedCards(rows, studies, moves)
t('승인된 케이스만 카드가 된다', out.cards.length, 1)
t('못 내는 것은 조용히 빼지 않고 센다(승인 내려감 + 지워짐)', out.hidden, 2)
t('무브 수는 승인된 것만 센다', out.cards[0].move_count, 1)
t('대표 무브는 승인된 것에서 고른다', out.cards[0].move?.id, 'm1')
t('저장 시각을 그대로 들고 온다', out.cards[0].saved_at, '2026-09-20T00:00:00Z')

const order = savedCards(
  [{ case_study_id: 'c1', created_at: '2026-09-01' }, { case_study_id: 'c3', created_at: '2026-09-30' }],
  [...studies, { id: 'c3', slug: 'c', brand_name: 'C', bottleneck: 'TRUST', review_status: 'approved' }],
  moves,
)
t('최근 저장이 먼저 (DB 정렬을 믿지 않고 한 번 더 고정)', order.cards[0].study.slug, 'c')
t('저장 0건은 카드 0장 · 숨김 0건 (둘을 섞지 않는다)', savedCards([], studies, moves).hidden, 0)

console.log(fail
  ? `실패 ${fail}건 / 통과 ${pass}건`
  : `통과 ${pass}건 — 오류 3상태(미적용/일반/정상) · 23505=이미 저장됨 · 저장 목록(미승인·삭제분을 개수로 보고 · 최근 먼저)`)
process.exitCode = fail ? 1 : 0
