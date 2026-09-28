#!/usr/bin/env node
// lib/cases/deleted.ts 셀프테스트 — 네트워크·DB·env 없음.
//
// 고정하는 것:
//   1. 숨긴 케이스와 **그 무브**가 빠진다(무브는 부모를 따라 숨는다)
//   2. 숨김 목록을 못 읽으면(null) 케이스·무브 둘 다 null — "내렸다"를 모르는 채 공개하지 않는다(§7.1)
//   3. 컬럼 없음(42703/PGRST204) = 마이그 미적용 = 숨긴 것 없음(빈 집합) / 그 밖의 오류 = null
//   4. 숨김 요청 검증 — id 꼴·사유 필수·길이 상한
//   5. 공개로 나가는 조회 자리가 전부 이 필터를 탄다(소스 정적 확인 — 한 곳만 빠져도 거기로 샌다)

import fs from 'node:fs'
import { checkDeleteInput, deletedIdsOf, loadDeletedCaseIds, withoutDeleted, DELETE_REASON_MAX } from '../lib/cases/deleted.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${w}\n   실제 ${g}`) }
}
const quiet = async (fn) => { const w = console.warn, e = console.error; console.warn = console.error = () => {}; try { return await fn() } finally { console.warn = w; console.error = e } }

// 1) 순수 필터
const studies = [{ id: 's1', deleted_at: null }, { id: 's2', deleted_at: '2026-09-28T00:00:00Z' }, { id: 's3' }]
const moves = [{ id: 'm1', case_study_id: 's1' }, { id: 'm2', case_study_id: 's2' }, { id: 'm3', case_study_id: null }]
const del = deletedIdsOf(studies)
t('deletedIdsOf — deleted_at 있는 것만', [...del], ['s2'])
t('deletedIdsOf — 컬럼 없음(undefined)은 숨김 아님', deletedIdsOf([{ id: 'x' }]).size, 0)
const v = withoutDeleted(studies, moves, del)
t('숨긴 케이스 빠짐', v.studies.map((s) => s.id), ['s1', 's3'])
t('숨긴 케이스의 무브도 빠짐', v.moves.map((m) => m.id), ['m1', 'm3'])
t('숨김 목록 확인 불가 → 둘 다 null', withoutDeleted(studies, moves, null), { studies: null, moves: null })
t('케이스 조회 실패(null)는 null 그대로', withoutDeleted(null, moves, new Set()).studies, null)
t('무브 조회 실패(null)는 null 그대로', withoutDeleted(studies, null, new Set()).moves, null)

// 2) loadDeletedCaseIds — 3상태
const mock = (r) => ({ from: () => ({ select: () => Promise.resolve(r) }) })
t('조회 정상 → 숨긴 id', [...await loadDeletedCaseIds(mock({ data: studies, error: null }), 'selftest')], ['s2'])
t('42703(마이그 미적용) → 빈 집합', (await quiet(() => loadDeletedCaseIds(mock({ data: null, error: { code: '42703', message: 'column deleted_at does not exist' } }), 'selftest'))).size, 0)
t('PGRST204 → 빈 집합', (await quiet(() => loadDeletedCaseIds(mock({ data: null, error: { code: 'PGRST204', message: 'x' } }), 'selftest'))).size, 0)
t('그 밖의 오류 → null(확인 불가)', await quiet(() => loadDeletedCaseIds(mock({ data: null, error: { code: '57014', message: 'timeout' } }), 'selftest')), null)

// 3) 입력 검증
const ID = '0b7c2c1e-7f7a-4b1a-9a53-3c2b1d4e5f60'
t('정상', checkDeleteInput({ id: ID, reason: '자동 승인 오판' }), null)
t('사유 없음 거절', typeof checkDeleteInput({ id: ID, reason: '   ' }), 'string')
t('사유 상한 초과 거절', typeof checkDeleteInput({ id: ID, reason: 'x'.repeat(DELETE_REASON_MAX + 1) }), 'string')
t('id 꼴 아님 거절', typeof checkDeleteInput({ id: 'abc', reason: 'x' }), 'string')
t('id 비문자열 거절', typeof checkDeleteInput({ id: null, reason: 'x' }), 'string')

// 4) 조회 자리 정적 확인 — 새 공개 조회를 만들고 필터를 빠뜨리면 여기서 걸린다.
const SITES = {
  'lib/cases/corpus-db.ts': /withoutDeleted\(rawStudies, rawMoves, deleted\)/, // 검색·리포트·어드바이저
  'lib/cases/library.ts': /withoutDeleted\(rawStudies, rawMoves,/, //             /library · 랜딩
  'lib/cases/detail.ts': /withoutDeleted\(rawStudies, rawMoves,/, //              /library/<slug> · OG
  'app/library/saved/page.tsx': /withoutDeleted\(/, //                            저장함
  'lib/cases/pmf-run.ts': /loadDeletedCaseIds\(/, //                              PMF 진단
  'lib/cases/remedy-db.ts': /loadDeletedCaseIds\(/, //                            처방 카드
  'lib/onboarding/quiz-store.ts': /loadDeletedCaseIds\(/, //                      공개 퀴즈
  'app/cases/grade/page.tsx': /loadDeletedCaseIds\(/, //                          채점 큐
  'scripts/cmo-daily.mjs': /loadDeletedCaseIds\(/, //                             앵글 선택
  'scripts/case-draft-stage.mjs': /loadDeletedCaseIds\(/, //                      초안 스테이징
  'app/dashboard/actions.ts': /loadDeletedCaseIds\(/, //                          즉시발행
}
for (const [f, re] of Object.entries(SITES)) t(`필터 적용 — ${f}`, re.test(fs.readFileSync(f, 'utf-8')), true)
const actions = fs.readFileSync('app/cases/actions.ts', 'utf-8')
t('숨김 액션은 허용목록 가드를 먼저 탄다', /export async function deleteCase[\s\S]{0,120}requireAllowedUser\(\)/.test(actions), true)
t('복원 액션은 허용목록 가드를 먼저 탄다', /export async function restoreCase[\s\S]{0,120}requireAllowedUser\(\)/.test(actions), true)
t('하드 DELETE 경로 없음(case_studies .delete())', /from\('case_studies'\)\s*\.delete\(/.test(actions), false)

console.log(`case-soft-delete-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
