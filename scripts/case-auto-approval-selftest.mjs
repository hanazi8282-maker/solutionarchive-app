#!/usr/bin/env node
// 케이스 무브 자동 승인 ca-v1 셀프테스트 — 픽스처만(네트워크·DB·LLM 없음).
//   node scripts/case-auto-approval-selftest.mjs
//
// 지키는 것
//   1) 무브 규칙 6조건(연결 ≥3·같은 project·전부 승인·수치 없음·부정 아님·행동/전제·사람 미개입 draft) + 시행일
//   2) 케이스 따라가기(무브 전부 approved·축 기재·ca-v1 무브 ≥1)
//   3) 게이트: 기본 off · 연결 테이블 없음/조회 실패 → 닫힘 · rr-v1 닫히면 닫힘(되돌리지 않음) · 감사 조회 실패 → 닫힘
//   4) 킬스위치 수치(창 30 · p0 5% → 4건 · 확인 불가 8건) → 3단계는 되돌리기, 2단계는 멈춤만(60건 중 7건)
//   5) 되돌리기는 자기 태그 ∧ 사람 미개입만
//   6) 검증중은 목록 아래·오늘의 케이스 제외, 사람 승인 케이스는 영향 없음

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tripThreshold } from '../lib/analysis/auto-approval.ts'
import {
  CA_KILL, CA_CANDIDATE_KILL, CASE_AUTO_APPROVAL_RULE as RULE, caseAutoApprovalGate, caseEligibility, caseExposure,
  moveEligibility, parseStage, selectRevert,
} from '../lib/cases/case-auto-approval.ts'
import { pickTodayCase, sortLibrary } from '../lib/cases/library.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`) } }
const src = (p) => readFileSync(ROOT + p, 'utf8')

// 1) 무브 규칙
const since = new Date('2026-10-01T00:00:00+09:00')
const mv = { id: 'm1', case_study_id: 's1', review_status: 'draft', reviewed_by: null, metric_after: null, outcome_direction: 'positive', transfer_note: '가격표를 바꾼다', preconditions: '월 구독', created_at: '2026-10-02T00:00:00Z' }
const v = (o = {}) => ({ project_id: 'p1', human_verdict: null, auto_approved_at: '2026-10-02T00:00:00Z', ...o })
const L3 = [v(), v(), v({ auto_approved_at: null, human_verdict: 'relevant' })]
const el = (m, l = L3) => moveEligibility({ ...mv, ...m }, l, since).ok
ok(el({}), '조건 전부 충족 → 후보')
ok(!el({}, L3.slice(0, 2)), '연결 2건 → 아님')
ok(!el({}, []), '연결 0건 → 영구 사람 몫')
ok(!el({}, [...L3.slice(0, 2), v({ project_id: 'p2' })]), '다른 project_id 섞임 → 아님')
ok(!el({}, [v({ project_id: null }), v({ project_id: null }), v({ project_id: null })]), 'project_id NULL → 아님')
ok(!el({}, [...L3, null]), '판정 행 없는 연결 → 아님')
ok(!el({}, [...L3, v({ auto_approved_at: null })]), '미승인 연결 1건 → 아님(과반 아님)')
ok(!el({}, [...L3, v({ human_verdict: 'irrelevant' })]), '사람 irrelevant → 아님(자동 승인 있어도)')
ok(!el({}, [...L3, v({ human_verdict: 'unknown' })]), '사람 unknown → 아님')
ok(!el({ metric_after: 12 }), '수치 있음 → 아님')
ok(!el({ metric_after: undefined }), 'metric_after 못 읽음 → 아님(NULL 과 다르다)')
ok(!el({ outcome_direction: 'negative' }), '부정 사례 → 아님')
ok(!el({ outcome_direction: null }), 'outcome_direction NULL → 아님(SQL <> 와 같게)')
ok(el({ outcome_direction: 'mixed' }), 'mixed → 후보')
ok(!el({ transfer_note: '  ' }), '행동 미기재 → 아님')
ok(!el({ preconditions: null }), '전제 미기재 → 아님')
ok(!el({ reviewed_by: '남헌' }), '사람이 봤다 → 아님')
ok(!el({ reviewed_by: undefined }), 'reviewed_by 못 읽음 → 아님')
ok(!el({ review_status: 'approved' }), '이미 approved → 아님')
ok(!el({ created_at: '2026-09-20T00:00:00Z' }), '시행일 전 적립 → 아님(백필 불가)')
ok(!el({ created_at: null }), '적립일 모름 → 아님')

// 2) 케이스 따라가기
const st = { id: 's1', review_status: 'draft', reviewed_by: null, bottleneck: 'PRICING', reader_problem: 'pricing' }
const A = { review_status: 'approved', auto_approval_rule: RULE }, H = { review_status: 'approved', auto_approval_rule: null }
ok(caseEligibility(st, [A, H]).ok, '무브 전부 approved(자동+사람) → 케이스 따라감')
ok(!caseEligibility(st, [A, { review_status: 'draft' }]).ok, 'draft 무브 남음 → 아님')
ok(!caseEligibility(st, [H, H]).ok, 'ca-v1 무브 없음 → 기계가 케이스 버튼을 대신 누르지 않는다')
ok(!caseEligibility({ ...st, reader_problem: null }, [A]).ok, '매칭 축 미기재 → 아님')
ok(!caseEligibility({ ...st, reviewed_by: '남헌' }, [A]).ok, '사람이 본 케이스 → 아님')
ok(!caseEligibility(st, []).ok, '무브 0개 → 아님')

// 3) 게이트
const now = new Date('2026-10-05T00:00:00+09:00')
const rrOn = { on: true, reason: 'ok' }
const G = (o = {}) => caseAutoApprovalGate({ stage: 'approve', since: '2026-10-01', now, rr: rrOn, linkTable: 'present', audits: [], ...o })
ok(parseStage(undefined) === 'off' && parseStage('APPROVE') === 'approve' && parseStage('approv') === 'off', '단계 파싱 — 어휘 밖은 off')
ok(!G({ stage: undefined }).on && !G({ stage: 'true' }).on, '단계 없음·오타 → 꺼짐(기본)')
ok(!G({ since: undefined }).on, '시행일 없음 → 꺼짐')
ok(!G({ since: '2026-10-09' }).on, '시행일 미래 → 꺼짐')
ok(!G({ linkTable: 'absent' }).on && /미적용/.test(G({ linkTable: 'absent' }).reason), 'case_move_inputs 없음 → 확인 불가로 닫힘')
ok(!G({ linkTable: 'unverifiable' }).on, '연결 테이블 조회 실패 → 닫힘')
const rrOff = G({ rr: { on: false, reason: '킬스위치: 감사 최근 50건 중 오류 8건' } })
ok(!rrOff.on && !rrOff.revert, 'rr-v1 닫힘 → ca 닫힘, 되돌리지는 않음(로드맵 §4-1)')
ok(!G({ rr: null }).on, 'rr-v1 상태 모름 → 닫힘')
ok(!G({ audits: null }).on && !G({ audits: null }).revert, 'ca 감사 조회 실패 → 닫힘(오류 0 으로 접지 않음)')
ok(G().on && G().kill.state === 'warmup', '시행 4일째·감사 0건 → 워밍업으로 열림')

// 4) 킬스위치
ok(tripThreshold(CA_KILL.window, CA_KILL.p0) === 4 && tripThreshold(60, CA_CANDIDATE_KILL.p0) === 7, `문턱 30→4 · 60→7 (실제 ${tripThreshold(30, 0.05)}·${tripThreshold(60, 0.05)})`)
const au = (good, bad, day = 4) => [...Array(good)].map(() => ({ review_status: 'approved', reviewed_at: `2026-10-${String(day).padStart(2, '0')}T01:00:00Z` }))
  .concat([...Array(bad)].map((_, i) => ({ review_status: i % 2 ? 'rejected' : 'draft', reviewed_at: `2026-10-${String(day).padStart(2, '0')}T01:00:00Z` })))
ok(G({ audits: au(27, 3) }).on, '30건 중 반려 3 → 유지')
const tripped = G({ audits: au(26, 4) })
ok(!tripped.on && tripped.revert && tripped.kill.state === 'tripped', '30건 중 반려 4 → 끔 + 되돌리기')
const later = new Date('2026-10-30T00:00:00+09:00')
const unv = G({ now: later, audits: au(7, 0, 25) })
ok(!unv.on && unv.revert && unv.kill.state === 'unverifiable', '워밍업 뒤 최근 14일 감사 7건 → 확인 불가로 끔 + 되돌리기')
ok(G({ now: later, audits: au(8, 0, 25) }).on, '워밍업 뒤 최근 감사 8건 → 유지')
const cand = G({ stage: 'candidate', audits: au(53, 7) })
ok(!cand.on && !cand.revert, '2단계 60건 중 반려 7 → 표시만 멈춤(되돌리기 없음)')
ok(G({ stage: 'candidate', audits: au(54, 6) }).on, '2단계 60건 중 반려 6 → 유지')
ok(G({ stage: 'candidate', now: later, audits: [] }).on, '2단계는 감사 부족으로 끄지 않는다(표시는 위험 없음)')

// 5) 되돌리기
const sel = selectRevert(
  [{ id: 's1', reviewed_by: null, auto_approval_rule: RULE }, { id: 's2', reviewed_by: '남헌', auto_approval_rule: RULE }, { id: 's3', reviewed_by: null, auto_approval_rule: null }],
  [
    { id: 'a', case_study_id: 's1', review_status: 'approved', reviewed_by: null, auto_approval_rule: RULE },
    { id: 'b', case_study_id: 's1', review_status: 'approved', reviewed_by: '남헌', auto_approval_rule: RULE },
    { id: 'c', case_study_id: 's2', review_status: 'approved', reviewed_by: null, auto_approval_rule: RULE },
    { id: 'd', case_study_id: 's3', review_status: 'approved', reviewed_by: null, auto_approval_rule: null },
    { id: 'e', case_study_id: 's3', review_status: 'approved', reviewed_by: null, auto_approval_rule: 'ca-v1:reverted' },
  ],
)
ok(sel.moveIds.join() === 'a,c', `무브: ca-v1 ∧ 사람 미개입만 (실제 ${sel.moveIds})`)
ok(sel.studyIds.join() === 's1', `케이스: ca-v1 ∧ 사람 미개입 ∧ draft 무브 생김 (실제 ${sel.studyIds})`)

// 6) 노출
ok(caseExposure({ auto_approval_rule: RULE, reviewed_by: null }) === 'verifying', '자동 승인·미검수 → 검증중')
ok(caseExposure({ auto_approval_rule: RULE, reviewed_by: '남헌' }) === 'verified', '불시검수 통과(reviewed_by) → 정식')
ok(caseExposure({ reviewed_by: '남헌' }) === 'verified' && caseExposure({}) === 'verified', '사람 승인·컬럼 없음(마이그 미적용) → 영향 없음')
const card = (slug, study = {}) => ({ study: { id: slug, slug, review_status: 'approved', reviewed_at: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z', ...study }, move: { evidence_grade: 'A' }, move_count: 1, evidence_count: 1 })
const auto = card('auto', { auto_approval_rule: RULE, reviewed_by: null, reviewed_at: null, created_at: '2026-10-04T00:00:00Z' })
const human = card('human', { reviewed_at: '2026-09-02T00:00:00Z' })
for (const sort of ['recent', 'grade', 'moves']) {
  ok(sortLibrary([auto, human], sort).map((c) => c.study.slug).join() === 'human,auto', `정렬 ${sort}: 검증중은 검증된 카드 아래`)
}
ok(sortLibrary([auto, { ...auto, study: { ...auto.study, slug: 'auto2', reviewed_by: 'x' } }], 'recent')[0].study.slug === 'auto2', '승격된 카드는 위로')
ok(pickTodayCase([auto], now) === null && pickTodayCase([auto, human], now)?.study.slug === 'human', '검증중은 오늘의 케이스로 안 올린다')

// 배선
const script = src('scripts/case-auto-approve.mjs')
ok(/caseAutoApprovalGate/.test(script) && /moveEligibility/.test(script) && /selectRevert/.test(script) && /caseEligibility/.test(script), '집행 스크립트가 순수 함수 넷을 쓴다')
ok(/stage === 'off'[\s\S]{0,200}process\.exit\(0\)/.test(script) && script.indexOf("stage === 'off'") < script.indexOf('createClient()'), '꺼져 있으면 DB 를 열기 전에 끝난다')
ok(!/CREATE TABLE[^;]*case_move_inputs/i.test(src('supabase/migrations/20260930000029_case_auto_approval.sql')), '이 마이그는 case_move_inputs 를 만들지 않는다')
ok(!/reviewed_by\s*:/.test(script.replace(/^\s*\/\/.*$/gm, '')), '집행 스크립트는 reviewed_by 를 쓰지 않는다(사람 판별자)')
ok(/reviewed_by: by/.test(src('scripts/case-review.mjs').split("from('case_moves').update(")[1] ?? ''), 'CLI 무브 승인이 reviewed_by 를 쓴다(연결 설계 §8)')
const wf = src('.github/workflows/nightly-relevance.yml')
ok(/CASE_AUTO_APPROVAL_STAGE: \$\{\{ vars\.CASE_AUTO_APPROVAL_STAGE \|\| 'off' \}\}/.test(wf) && /case-auto-approve\.mjs/.test(wf), '워크플로 기본값 off')

console.log(`\n${fail ? '❌' : '✅'} 케이스 자동 승인 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
