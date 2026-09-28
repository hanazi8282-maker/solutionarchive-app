#!/usr/bin/env node
// T2 기준 통일 + 완전 동의 자동 승인 셀프테스트 — 픽스처만(네트워크·DB·LLM 없음).
//   node scripts/auto-approval-selftest.mjs
//
// 지키는 것
//   1) 1차·2차 프롬프트가 **같은 기준 상수**를 싣는다(복붙이 아니라 import). export 가 그 지시문을 쓴다.
//   2) 완전 동의(둘 다 relevant)만 승인 대상. 하나뿐·unknown·irrelevant·사람 채점·옛 기준 판정은 아니다.
//   3) 게이트는 기본 꺼짐. 시행일 없음·감사 조회 실패·킬스위치면 꺼진다. 기계는 켜지 못한다.
//   4) 킬스위치 수치(창 50 · p0 7% → 오류 8건) 와 워밍업·확인 불가 경로.
//   5) 채점표 `모름` 칸 — 새 표(세 칸)와 옛 표(두 칸) 둘 다 읽는다.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RELEVANCE_CRITERIA, RELEVANCE_CRITERIA_VERSION, criteriaKindOf } from '../lib/analysis/relevance-criteria.ts'
import { buildRelevancePrompt, parseGradingMarkdown } from '../lib/analysis/relevance-judge.ts'
import { SECOND_OPINION_INSTRUCTIONS, isCurrentCriteria } from '../lib/analysis/second-opinion.ts'
import { AUDIT_DAILY, KILL, autoApprovalGate, isFullAgreement, killSwitch, tripThreshold } from '../lib/analysis/auto-approval.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`) } }
const src = (p) => readFileSync(ROOT + p, 'utf8')

// 1) 기준 한 벌
const { system, user } = buildRelevancePrompt({ product_elevator_pitch: 'ConvertKit', business_model: 'SAAS' }, [{ input_id: 'x', text: 'hi' }])
ok(system.includes(RELEVANCE_CRITERIA), '1차 SYSTEM 이 기준 상수를 그대로 싣는다')
ok(SECOND_OPINION_INSTRUCTIONS.includes(RELEVANCE_CRITERIA), '2차 지시문이 같은 기준 상수를 싣는다')
ok(SECOND_OPINION_INSTRUCTIONS.includes(RELEVANCE_CRITERIA_VERSION), '2차 지시문이 기준 버전을 되돌려 적게 한다')
ok(user.includes('business_model=SAAS') && user.includes('SaaS'), '1차 user 에 사업유형이 들어간다')
ok(criteriaKindOf('SAAS') === 'saas' && criteriaKindOf('D2C') === 'consumer' && criteriaKindOf(null) === 'unspecified', '사업유형 분류')
ok(!src('lib/analysis/relevance-judge.ts').includes('불만이든 칭찬이든 상관없다'), '1차에 옛 기준 문구가 남아 있지 않다(두 벌 금지)')
ok(/SECOND_OPINION_INSTRUCTIONS/.test(src('scripts/relevance-export.mjs')) && /criteria_version/.test(src('scripts/relevance-export.mjs')), 'export 가 공유 지시문·버전을 쓴다')
ok(isCurrentCriteria({ criteria_version: RELEVANCE_CRITERIA_VERSION, rows: [] }), '현재 버전 파일은 통과')
ok(!isCurrentCriteria({ rows: [] }) && !isCurrentCriteria({ criteria_version: 'old' }) && !isCurrentCriteria(null), '버전 없음·다름은 거부')

// 2) 완전 동의
const since = new Date('2026-10-01T00:00:00+09:00')
const base = { input_id: 'a', verdict: 'relevant', second_verdict: 'relevant', human_verdict: null, judged_at: '2026-10-02T00:00:00Z', auto_approved_at: null }
ok(isFullAgreement(base, since), 'RR → 대상')
ok(!isFullAgreement({ ...base, second_verdict: null }, since), '2차 없음 → 아님')
ok(!isFullAgreement({ ...base, second_verdict: 'unknown' }, since), 'R·U → 아님')
ok(!isFullAgreement({ ...base, verdict: 'unknown' }, since), 'U·R → 아님')
ok(!isFullAgreement({ ...base, second_verdict: 'irrelevant' }, since), 'R·I → 아님')
ok(!isFullAgreement({ ...base, human_verdict: 'relevant' }, since), '사람 채점 있음 → 아님(사람이 이긴다)')
ok(!isFullAgreement({ ...base, auto_approved_at: '2026-10-03T00:00:00Z' }, since), '이미 승인 → 아님')
ok(!isFullAgreement({ ...base, judged_at: '2026-09-27T00:00:00Z' }, since), '시행일 전 판정(옛 기준) → 아님')
ok(!isFullAgreement({ ...base, judged_at: null }, since), '판정 시각 모름 → 아님')

// 3) 게이트
const now = new Date('2026-10-05T00:00:00+09:00')
ok(!autoApprovalGate({ enabled: undefined, since: '2026-10-01', now, audits: [] }).on, '플래그 없음 → 꺼짐(기본)')
ok(!autoApprovalGate({ enabled: 'false', since: '2026-10-01', now, audits: [] }).on, '플래그 false → 꺼짐')
ok(!autoApprovalGate({ enabled: 'true', since: undefined, now, audits: [] }).on, '시행일 없음 → 꺼짐')
ok(!autoApprovalGate({ enabled: 'true', since: '2026-10-09', now, audits: [] }).on, '시행일 미래 → 꺼짐')
ok(!autoApprovalGate({ enabled: 'true', since: '2026-10-01', now, audits: null }).on, '감사 조회 실패 → 꺼짐(오류 0 으로 접지 않는다)')
const g = autoApprovalGate({ enabled: 'true', since: '2026-10-01', now, audits: [] })
ok(g.on && g.kill.state === 'warmup', '시행 4일째·감사 0건 → 워밍업으로 열림')

// 4) 킬스위치
ok(tripThreshold(10) === 3 && tripThreshold(50) === 8, `문턱 10건→3 · 50건→8 (실제 ${tripThreshold(10)}·${tripThreshold(50)})`)
ok(KILL.window === 50 && AUDIT_DAILY === 5, '창 50 · 하루 감사 5')
const at = (d, v) => ({ human_verdict: v, human_graded_at: `2026-10-${String(d).padStart(2, '0')}T01:00:00Z` })
const mk = (good, bad, day = 4) => [...Array(good)].map(() => at(day, 'relevant')).concat([...Array(bad)].map(() => at(day, 'irrelevant')))
ok(killSwitch(mk(43, 7), { now, since }).state === 'ok', '50건 중 오류 7 → 유지')
ok(killSwitch(mk(42, 8), { now, since }).state === 'tripped', '50건 중 오류 8 → 끔')
ok(killSwitch(mk(7, 3), { now, since }).state === 'tripped', '10건 중 오류 3 → 끔(워밍업 중에도)')
ok(killSwitch(mk(8, 2), { now, since }).state === 'ok', '10건 중 오류 2 → 유지')
ok(killSwitch(mk(3, 1), { now, since }).state === 'warmup', '4건 → 워밍업')
ok(killSwitch([...mk(40, 0), at(4, 'unknown'), at(4, 'unknown')], { now, since }).n === 40, '사람 모름은 창에 안 들어간다')
const later = new Date('2026-10-30T00:00:00+09:00')
ok(killSwitch(mk(19, 0), { now: later, since }).state === 'unverifiable', '워밍업 뒤 최근 14일 감사 19건 → 확인 불가로 끔')
ok(killSwitch(mk(20, 0, 25), { now: later, since }).state === 'ok', '워밍업 뒤 최근 감사 20건 → 유지')
ok(!autoApprovalGate({ enabled: 'true', since: '2026-10-01', now, audits: mk(42, 8) }).on, '킬스위치 → 게이트 닫힘(플래그가 켜져 있어도)')

// 5) 채점표
const U = '0f000000-0000-4000-8000-000000000001', V = '0f000000-0000-4000-8000-000000000002', W = '0f000000-0000-4000-8000-000000000003'
const three = [
  `| 1 | p | t | x | ☐ | ☐ | 관련 | \`${U}\` |`,
  `| 2 | p | t | ☐ | ☐ | x | 관련 | \`${V}\` |`,
  `| 3 | p | t | x | ☐ | x | 관련 | \`${W}\` |`,
].join('\n')
const r3 = parseGradingMarkdown(three)
ok(r3.marks.length === 2 && r3.marks[0].verdict === 'relevant' && r3.marks[1].verdict === 'unknown', '세 칸 표: 관련·모름')
ok(r3.conflict.length === 1 && r3.conflict[0] === W, '두 칸 체크 → 충돌')
const r2 = parseGradingMarkdown(`| 1 | p | t | ☐ | x | 무관 | \`${U}\` |\n| 2 | p | t | ☐ | ☐ | 관련 | \`${V}\` |`)
ok(r2.marks.length === 1 && r2.marks[0].verdict === 'irrelevant' && r2.blank === 1, '옛 두 칸 표 호환')

// 배선
ok(/--audit/.test(src('scripts/relevance-grading-sample.mjs')) && /AUDIT_DAILY/.test(src('scripts/relevance-grading-sample.mjs')), '채점표가 감사 표본을 섞는다')
ok(/isFullAgreement/.test(src('scripts/relevance-auto-approve.mjs')) && /autoApprovalGate/.test(src('scripts/relevance-auto-approve.mjs')), '집행 스크립트가 게이트·판정 함수를 쓴다')
ok(!/case_studies|case_moves/.test(src('scripts/relevance-auto-approve.mjs').replace(/^\/\/.*$/gm, '')), '집행 스크립트는 케이스 테이블을 쓰지 않는다(조건 5)')

console.log(`\n${fail ? '❌' : '✅'} 자동 승인 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
