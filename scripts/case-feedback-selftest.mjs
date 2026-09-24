#!/usr/bin/env node
// lib/cases/feedback.ts 셀프테스트 — 네트워크·DB 없음. 순수 함수만 부른다.
//   node scripts/case-feedback-selftest.mjs
//
// 배경: 남헌 2026-09-23 명시 승인 — 익명 피드백 허용, 하루 1회 제한.
//   로그인 가드가 없는 쓰기 경로라서 **제한 판정이 유일한 방어선**이다. 그래서 이 검사가 있다.
//
// 고정하는 것 (하나가 접히면 화면은 멀쩡한데 제한이 없어진다):
//   1. 같은 IP 해시 / 같은 쿠키 세션 — 둘 중 하나만 걸려도 거부(OR 판정).
//   2. 다른 케이스는 막지 않는다 — 제한은 케이스 1건 단위다.
//   3. 하루 경계는 **KST 자정**이다. UTC 자정으로 세면 오전 9시에 두 표가 된다.
//   4. 3상태. "못 읽었다"(rows null · 시각 파싱 실패 · 축 둘 다 없음)를 allow 로 접지 않는다.
//   5. 마이그 미적용(42703/PGRST204/42P01/PGRST205)은 일반 오류와도 가른다 — 사람이 할 일이 다르다.
//   6. 솔트 없는 해시를 만들지 않는다 — 그건 IP 평문 저장이다.

import {
  classifyFeedbackError, clientIp, kstDayStart, voterKey, withinDailyLimit,
  DAILY_LIMIT_MESSAGE, FEEDBACK_VOTER_MIGRATION,
  tallyFeedback, feedbackDigestLines, FEEDBACK_NOTES_SHOWN,
} from '../lib/cases/feedback.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const CASE_A = '11111111-1111-1111-1111-111111111111'
const CASE_B = '22222222-2222-2222-2222-222222222222'
const HASH = 'a'.repeat(64)
const SESSION = '33333333-3333-3333-3333-333333333333'
const me = { caseStudyId: CASE_A, voterHash: HASH, sessionId: SESSION }
const row = (over) => ({ case_study_id: CASE_A, voter_hash: HASH, session_id: SESSION, created_at: '2026-09-23T05:00:00.000Z', ...over })
const NOW = new Date('2026-09-23T05:30:00.000Z') // KST 2026-09-23 14:30

// ── 1. 하루 1회: 6건 ────────────────────────────────────────────
t('① 오늘 표가 0건 → 허용', withinDailyLimit([], NOW, me).state, 'allow')
t('② 같은 IP 해시가 오늘 이미 있다(쿠키는 달라도) → 거부',
  withinDailyLimit([row({ session_id: 'other-session' })], NOW, me).state, 'deny')
t('③ 같은 쿠키 세션이 오늘 이미 있다(해시는 달라도 — 회선 바꿔도 잡힌다) → 거부',
  withinDailyLimit([row({ voter_hash: 'b'.repeat(64) })], NOW, me).state, 'deny')
t('④ 다른 케이스의 표는 이 케이스를 막지 않는다 → 허용',
  withinDailyLimit([row({ case_study_id: CASE_B })], NOW, me).state, 'allow')
t('⑤ 자정 경계(KST): 어제 23:59(KST) 표는 오늘을 막지 않는다 → 허용',
  // 2026-09-22 23:59 KST = 2026-09-22T14:59Z
  withinDailyLimit([row({ created_at: '2026-09-22T14:59:00.000Z' })], NOW, me).state, 'allow')
t('⑥ 자정 경계(KST): 오늘 00:01(KST) 표는 막는다 — UTC 자정으로 세면 이게 어제가 된다 → 거부',
  // 2026-09-23 00:01 KST = 2026-09-22T15:01Z (UTC 로는 어제다)
  withinDailyLimit([row({ created_at: '2026-09-22T15:01:00.000Z' })], NOW, me).state, 'deny')
t('거부 문구는 한 곳에서 온다', withinDailyLimit([row()], NOW, me).message, DAILY_LIMIT_MESSAGE)

// ── 2. 3상태: "못 읽었다"를 허용으로 접지 않는다 ────────────────
t('rows null(조회 실패) = 확인 불가 (allow 아님)', withinDailyLimit(null, NOW, me).state, 'unknown')
t('축이 둘 다 없으면 셀 수 없다 = 확인 불가',
  withinDailyLimit([], NOW, { caseStudyId: CASE_A, voterHash: null, sessionId: null }).state, 'unknown')
t('시각을 못 읽은 내 표가 있으면 = 확인 불가 (오늘 아님으로 넘기지 않는다)',
  withinDailyLimit([row({ created_at: 'not-a-date' })], NOW, me).state, 'unknown')
ok('확인 불가 사유는 "저장하지 않았습니다"를 말한다',
  withinDailyLimit(null, NOW, me).reason.includes('저장하지 않았습니다'))
t('한쪽 축만 있어도 센다(쿠키만)', withinDailyLimit([row()], NOW, { caseStudyId: CASE_A, voterHash: null, sessionId: SESSION }).state, 'deny')
t('한쪽 축만 있으면 다른 축의 일치는 무시한다(해시만 · 쿠키 불일치 행)',
  withinDailyLimit([row({ voter_hash: 'c'.repeat(64) })], NOW, { caseStudyId: CASE_A, voterHash: HASH, sessionId: null }).state, 'allow')

// ── 3. KST 자정 계산 ────────────────────────────────────────────
t('KST 자정 = 전날 15:00Z', kstDayStart(NOW).toISOString(), '2026-09-22T15:00:00.000Z')
t('KST 00:00 정각에도 그날의 시작이다', kstDayStart(new Date('2026-09-22T15:00:00.000Z')).toISOString(), '2026-09-22T15:00:00.000Z')
t('KST 23:59 도 같은 날 시작', kstDayStart(new Date('2026-09-23T14:59:00.000Z')).toISOString(), '2026-09-22T15:00:00.000Z')

// ── 4. 마이그 미적용 3상태 (컬럼·테이블·일반 오류) ──────────────
t('오류 없음 = null (거부와 섞지 않는다)', classifyFeedbackError(null), null)
t('42703(컬럼 없음) = 마이그 미적용', classifyFeedbackError({ code: '42703', message: 'column case_feedback.voter_hash does not exist' })?.kind, 'migration_missing')
t('PGRST204(스키마 캐시에 컬럼 없음) = 마이그 미적용', classifyFeedbackError({ code: 'PGRST204', message: "Could not find the 'voter_hash' column" })?.kind, 'migration_missing')
t('코드가 비고 메시지만 와도 마이그 미적용으로 읽는다', classifyFeedbackError({ message: "Could not find the 'session_id' column of 'case_feedback'" })?.kind, 'migration_missing')
t('42P01(테이블 없음) = 마이그 미적용(선행 20260930000001)', classifyFeedbackError({ code: '42P01', message: 'relation "public.case_feedback" does not exist' })?.kind, 'migration_missing')
t('PGRST205 도 마이그 미적용', classifyFeedbackError({ code: 'PGRST205', message: "Could not find the table 'public.case_feedback' in the schema cache" })?.kind, 'migration_missing')
t('그 밖의 실패는 error (마이그 미적용으로 위장하지 않는다)', classifyFeedbackError({ code: '08006', message: 'connection failure' })?.kind, 'error')
t('권한 오류도 error — 마이그를 다시 돌리라고 말하면 안 된다', classifyFeedbackError({ code: '42501', message: 'permission denied for table case_feedback' })?.kind, 'error')
ok('컬럼 미적용 문구는 파일명을 그대로 말한다', classifyFeedbackError({ code: '42703', message: 'x' })?.reason.includes(FEEDBACK_VOTER_MIGRATION))
ok('테이블 미적용 문구는 선행 마이그 파일명을 말한다', classifyFeedbackError({ code: '42P01', message: 'x' })?.reason.includes('20260930000001'))
ok('사유 미상도 빈 문장으로 내보내지 않는다', classifyFeedbackError({})?.reason.includes('사유 미상'))

// ── 5. 투표자 키 · IP 추출 ──────────────────────────────────────
t('솔트 없으면 해시를 만들지 않는다(= IP 평문 저장 방지)', voterKey('1.2.3.4', undefined), null)
t('빈 솔트도 마찬가지', voterKey('1.2.3.4', '   '), null)
t('IP 없으면 null — "제한 없음"으로 접지 않는다', voterKey(null, 'salt'), null)
t('같은 IP·같은 솔트 = 같은 키', voterKey('1.2.3.4', 'salt'), voterKey(' 1.2.3.4 ', 'salt'))
ok('솔트가 다르면 키가 다르다(솔트 교체로 과거 해시를 무효화할 수 있다)', voterKey('1.2.3.4', 'a') !== voterKey('1.2.3.4', 'b'))
ok('다른 IP 는 다른 키', voterKey('1.2.3.4', 's') !== voterKey('1.2.3.5', 's'))
t('키는 sha256 16진수 64자', voterKey('1.2.3.4', 's')?.length, 64)
ok('원본 IP 가 키에 남지 않는다', !voterKey('1.2.3.4', 's').includes('1.2.3.4'))

t('x-forwarded-for 는 첫 값이 클라이언트다', clientIp('1.2.3.4, 10.0.0.1, 10.0.0.2', null), '1.2.3.4')
t('xff 없으면 x-real-ip', clientIp(null, '5.6.7.8'), '5.6.7.8')
t('xff 가 빈 문자열이어도 x-real-ip 로 넘어간다', clientIp('  ', '5.6.7.8'), '5.6.7.8')
t('둘 다 없으면 null (거부로 이어진다)', clientIp(null, null), null)
t('IPv6 도 받는다', clientIp('2001:db8::1', null), '2001:db8::1')
t('호스트명·쓰레기 값은 버린다', clientIp('evil.example.com', null), null)
t('or 필터를 깨는 쉼표·따옴표는 애초에 모양 검사에서 걸린다', clientIp('1.2.3.4")--', null), null)
t('과하게 긴 값은 버린다(해시 입력 폭주 방지)', clientIp('1'.repeat(200), null), null)

// ── 6. 읽는 쪽 — T3 사람 신호 집계(/cases · CMO 다이제스트) ──────────
const fb = (over) => ({ case_study_id: CASE_A, vote: 1, note: null, created_at: '2026-09-23T05:00:00.000Z', ...over })
const tally = tallyFeedback([
  fb({}), fb({ vote: -1, note: '가격대가 안 맞다', created_at: '2026-09-23T06:00:00.000Z' }),
  fb({ note: '  ', created_at: '2026-09-23T07:00:00.000Z' }),
  fb({ note: 'n1', created_at: '2026-09-23T08:00:00.000Z' }), fb({ note: 'n2', created_at: '2026-09-23T09:00:00.000Z' }),
  fb({ note: 'n3', created_at: '2026-09-23T10:00:00.000Z' }),
  fb({ case_study_id: CASE_B, vote: -1 }),
])
t('케이스별 👍 수', tally.get(CASE_A)?.up, 5)
t('케이스별 👎 수', tally.get(CASE_A)?.down, 1)
t('다른 케이스는 따로 센다', tally.get(CASE_B)?.down, 1)
t('표 없는 케이스는 Map 에 없다(= 피드백 없음)', tally.has('none'), false)
t('코멘트 수는 공백 코멘트를 빼고 전체를 센다', tally.get(CASE_A)?.noted, 4)
t(`코멘트는 최근 ${FEEDBACK_NOTES_SHOWN}개만`, tally.get(CASE_A)?.notes.length, FEEDBACK_NOTES_SHOWN)
t('코멘트는 최근 순', tally.get(CASE_A)?.notes.map((n) => n.note).join(','), 'n3,n2,n1')

ok('다이제스트: 못 읽음은 "확인 불가" — 피드백 없음으로 접지 않는다',
  feedbackDigestLines(null, 'PGRST205 x')[0].includes('확인 불가'))
ok('다이제스트: 0건은 "피드백 없음"(빈칸 아님)', feedbackDigestLines([], null)[0].includes('피드백 없음'))
const digestLines = feedbackDigestLines([fb({ note: '비밀 코멘트', case_studies: { brand_name: 'Notion', slug: 'notion' } }), fb({ vote: -1 })], null)
ok('다이제스트: 합계 줄', digestLines[0].includes('합계 2표') && digestLines[0].includes('👍 1 · 👎 1'))
ok('다이제스트: 케이스 줄은 브랜드명', digestLines.some((l) => l.startsWith('- Notion — 👍 1 · 👎 1 · 코멘트 1건')))
ok('다이제스트: 코멘트 원문은 싣지 않는다(공개 리포)', !digestLines.join('\n').includes('비밀 코멘트'))

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 하루 1회(해시·쿠키 OR · 케이스 단위 · KST 자정) · 3상태(확인 불가를 허용으로 접지 않음) · 마이그 미적용 분류 · 투표자 키(솔트 필수)`)
process.exitCode = fail ? 1 : 0
