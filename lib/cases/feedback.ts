// 케이스 피드백(👍/👎) 하루 1회 제한 — **순수 함수 한 벌.** DB·네트워크·헤더를 직접 만지지
// 않는다(그건 app/library/[slug]/actions.ts 가 한다). 그래서 이 파일의 판정은
// `scripts/case-feedback-selftest.mjs` 가 Supabase 없이 그대로 돌려 볼 수 있다.
//
// 배경: 남헌 2026-09-23 **명시 승인 — 익명 피드백 허용, 하루 1회 제한.**
//   로그인 없이 표를 받는다. 그래서 "누가 이미 냈나"를 이메일 대신 두 축으로 센다:
//     voter_hash — sha256(IP + 서버 솔트). 원본 IP 는 저장하지 않는다.
//     session_id — 쿠키 `sa_vid`.
//   둘을 **OR** 로 본다. 하나만 쓰면 각각 다른 방향으로 틀린다(마이그레이션
//   20260930000007 주석 참조: hash 만 = NAT 과잉 차단, session 만 = 쿠키 지우면 무제한).
//
// ★ §7.1 3상태. 이 파일의 존재 이유가 그것이다:
//     allow   — 오늘 이 케이스에 아직 안 냈다
//     deny    — 오늘 이미 냈다
//     unknown — **못 읽었다** (마이그 20260930000007 미적용 / 조회 실패 / IP·솔트 없음)
//   `unknown` 을 `allow` 로 접으면 "제한이 있다고 적혀 있는데 실제로는 없는" 상태가 된다.
//   그래서 호출자는 unknown 에서 **저장하지 않는다.** 확인 불가를 허용으로 접지 않는다.

import { createHash } from 'node:crypto'

/** 이 기능을 켜는 마이그레이션. 화면 문구가 파일명을 그대로 말한다(사람이 찾아 실행할 수 있게). */
export const FEEDBACK_VOTER_MIGRATION = '20260930000007_case_feedback_voter.sql'

/** 거절 문구는 한 곳에 둔다 — 폼·셀프테스트가 같은 문장을 본다. */
export const DAILY_LIMIT_MESSAGE = '오늘은 이미 남겼습니다 — 내일 다시.'

export type FeedbackRow = {
  case_study_id: string
  voter_hash: string | null
  session_id: string | null
  created_at: string
}

/** 이 요청을 낸 사람을 가리키는 두 축. 둘 다 null 이면 셀 수 없다(= unknown). */
export type Voter = {
  caseStudyId: string
  voterHash: string | null
  sessionId: string | null
}

export type LimitVerdict =
  | { state: 'allow' }
  | { state: 'deny'; message: string }
  | { state: 'unknown'; reason: string }

// ────────────────────────────────────────────────────────────
// 1) 투표자 키 (순수)
// ────────────────────────────────────────────────────────────
/**
 * sha256(솔트 + IP) 16진수. 원본 IP 를 저장하지 않으려고 존재한다.
 *
 * 솔트가 없으면 **null 을 돌려준다** — 소금 없는 sha256(IP) 는 IPv4 43억 개를 전부
 * 미리 해시해 대조할 수 있어 사실상 평문 IP 저장이다. 호출자는 null 을 받으면
 * 익명 저장을 거부한다(env `FEEDBACK_SALT`, 없으면 `CRON_SECRET` 폴백).
 *
 * IP 도 없으면 null. "IP 를 못 읽었다"를 "제한 없음"으로 접지 않기 위한 자리다.
 */
export function voterKey(ip: string | null | undefined, salt: string | null | undefined): string | null {
  const addr = (ip ?? '').trim()
  const key = (salt ?? '').trim()
  if (!addr || !key) return null
  return createHash('sha256').update(`${key}:${addr}`).digest('hex')
}

/**
 * 프록시 헤더 → IP 하나. `x-forwarded-for` **첫 값** 이 클라이언트다(뒤는 프록시들).
 * 없으면 `x-real-ip`, 그것도 없으면 null.
 *
 * 모양 검사를 한다 — 이 헤더는 클라이언트가 보내는 값이라 신뢰 경계다. 걸러내지 않으면
 * 수십 KB 짜리 문자열이 그대로 해시 입력이 되고, 매 요청 다른 값을 보내면 제한이 무력해진다.
 * (모양이 맞아도 위조는 가능하다 — Vercel 이 맨 앞 값을 자기가 쓴다는 것에 의존한다.
 *  ponytail: 위조가 실제로 문제가 되면 `x-vercel-forwarded-for` 로 좁힌다.)
 */
export function clientIp(xff: string | null | undefined, xRealIp: string | null | undefined): string | null {
  const first = (xff ?? '').split(',')[0]?.trim()
  const candidate = first || (xRealIp ?? '').trim()
  if (!candidate || candidate.length > 45) return null
  // IPv4 · IPv6(압축형 포함) 에 쓰이는 글자만. 호스트명·경로·공백이 섞이면 버린다.
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null
}

// ────────────────────────────────────────────────────────────
// 2) 오류 분류 (순수)
// ────────────────────────────────────────────────────────────
export type FeedbackFailure = {
  /** migration_missing = 테이블·컬럼이 아직 없다. error = 그 밖의 조회/쓰기 실패. */
  kind: 'migration_missing' | 'error'
  reason: string
}

/**
 * PostgREST 오류 → 둘 중 어느 것인가. 오류가 아니면 null.
 *
 * 컬럼(`42703` / `PGRST204`)과 테이블(`42P01` / `PGRST205`)을 같은 칸에 넣는다 —
 * 사람이 할 일이 같다(마이그레이션 실행). 다른 실패와는 가른다: 그쪽은 로그를 봐야 한다.
 *
 * ⚠️ 메시지 낱말로도 걸러낸다: PostgREST 버전에 따라 코드가 비고 메시지만 오는 응답이 있다.
 *    코드가 비었다고 일반 오류로 내리면 "저장 실패: ..." 라는 막다른 문구가 뜨고,
 *    실제 할 일(마이그 실행)이 화면에서 사라진다.
 */
export function classifyFeedbackError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): FeedbackFailure | null {
  if (!error) return null
  const code = (error.code ?? '').trim()
  const message = (error.message ?? '').trim()
  const missingColumn =
    code === '42703' || code === 'PGRST204' ||
    /column .*(voter_hash|session_id).* does not exist/i.test(message) ||
    /could not find the '?(voter_hash|session_id)'? column/i.test(message)
  if (missingColumn) {
    return {
      kind: 'migration_missing',
      reason: `하루 1회 제한 컬럼이 DB 에 없습니다 — 마이그레이션 ${FEEDBACK_VOTER_MIGRATION} 미적용`,
    }
  }
  const missingTable =
    code === '42P01' || code === 'PGRST205' ||
    /relation .*case_feedback.* does not exist/i.test(message) ||
    /could not find the table .*case_feedback/i.test(message)
  if (missingTable) {
    return {
      kind: 'migration_missing',
      reason: '피드백 테이블이 DB 에 없습니다 — 마이그레이션 20260930000001_case_detail_logo_feedback.sql 미적용',
    }
  }
  return { kind: 'error', reason: message || '사유 미상' }
}

// ────────────────────────────────────────────────────────────
// 3) 하루 1회 판정 (순수)
// ────────────────────────────────────────────────────────────
/**
 * "오늘"의 시작 = **KST 자정**. UTC 자정이 아니다.
 * UTC 로 세면 한국 사람에게 하루 경계가 오전 9시에 생겨, 09:00 전후로 두 표가 된다.
 *
 * 타임존 오프셋을 상수로 더한다(KST 는 DST 가 없어 항상 +09:00). `Intl` 로 포맷해
 * 문자열을 다시 파싱하지 않는다 — 이 머신의 `date` 가 TZ 를 무시한 전례가 있고,
 * 상수 덧셈은 그런 환경 차이가 없다.
 */
export function kstDayStart(now: Date): Date {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const shifted = now.getTime() + KST_OFFSET_MS
  return new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - KST_OFFSET_MS)
}

/**
 * 같은 케이스에 **오늘(KST)** 이미 표가 있나.
 *
 * @param rows 이 케이스의 최근 표. **null = 못 읽었다** → unknown. 빈 배열은 "0건"(allow)이다.
 *             이 둘을 가르는 것이 이 함수의 핵심이다(§7.1).
 * @param voter 두 축. 둘 다 null 이면 셀 수 없으므로 unknown — 허용으로 접지 않는다.
 *
 * 판정은 voter_hash **또는** session_id 일치다. 한쪽만 보면 쿠키를 지우거나(hash만 봐야 잡힘)
 * 회선을 바꿔서(session만 봐야 잡힘) 빠져나간다.
 */
export function withinDailyLimit(
  rows: FeedbackRow[] | null,
  now: Date,
  voter: Voter,
): LimitVerdict {
  if (rows === null) {
    return { state: 'unknown', reason: '오늘 남긴 표를 읽지 못했습니다 — 저장하지 않았습니다.' }
  }
  if (!voter.voterHash && !voter.sessionId) {
    return { state: 'unknown', reason: '요청한 곳을 확인할 수 없어(IP·세션 모두 없음) 하루 1회 제한을 셀 수 없습니다 — 저장하지 않았습니다.' }
  }
  const since = kstDayStart(now).getTime()
  const mine = rows.filter((r) =>
    r.case_study_id === voter.caseStudyId && (
      (!!voter.voterHash && r.voter_hash === voter.voterHash) ||
      (!!voter.sessionId && r.session_id === voter.sessionId)
    ),
  )
  // 시각을 못 읽은 행은 "오늘 아님"으로 넘기지 않는다 — 그 한 줄이 제한을 조용히 없앤다.
  if (mine.some((r) => Number.isNaN(new Date(r.created_at).getTime()))) {
    return { state: 'unknown', reason: '이미 남긴 표의 시각을 읽지 못했습니다 — 저장하지 않았습니다.' }
  }
  const already = mine.some((r) => new Date(r.created_at).getTime() >= since)
  return already ? { state: 'deny', message: DAILY_LIMIT_MESSAGE } : { state: 'allow' }
}

// ────────────────────────────────────────────────────────────
// 4) 읽는 쪽 — T3 사람 신호로 소비 (순수)
// ────────────────────────────────────────────────────────────
// 표를 받기만 하고 읽는 곳이 없던 테이블을 `/cases` 검수 화면과 CMO 다이제스트가 읽는다.
// 집계 규칙은 여기 한 벌이다 — 두 화면이 각자 세면 숫자가 갈린다.

export type FeedbackVoteRow = {
  case_study_id: string
  vote: number
  note: string | null
  created_at: string
  /** 다이제스트가 임베드로 붙여 온다. /cases 는 이미 케이스를 들고 있어 안 붙인다. */
  case_studies?: { brand_name: string | null; slug: string | null } | null
}

export type FeedbackTally = {
  up: number
  down: number
  /** 코멘트가 달린 표 수(전체). notes 는 그중 최근 몇 개만 담는다. */
  noted: number
  /** 최근 순, 비어 있지 않은 코멘트만, 최대 FEEDBACK_NOTES_SHOWN 개. */
  notes: { vote: number; note: string; at: string }[]
}

export const FEEDBACK_NOTES_SHOWN = 3

/** 케이스별 👍/👎 수와 최근 코멘트. 표가 없는 케이스는 Map 에 없다(= "피드백 없음"). */
export function tallyFeedback(rows: FeedbackVoteRow[]): Map<string, FeedbackTally> {
  const out = new Map<string, FeedbackTally>()
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const r of sorted) {
    const t = out.get(r.case_study_id) ?? { up: 0, down: 0, noted: 0, notes: [] }
    if (r.vote > 0) t.up++
    else if (r.vote < 0) t.down++
    const note = (r.note ?? '').trim()
    if (note) t.noted++
    if (note &&t.notes.length < FEEDBACK_NOTES_SHOWN) t.notes.push({ vote: r.vote, note, at: r.created_at })
    out.set(r.case_study_id, t)
  }
  return out
}

/**
 * CMO 다이제스트 한 절의 본문 줄. **코멘트 원문은 싣지 않는다** — DIGEST 는 공개 리포에
 * 커밋되고(CLAUDE.md §2), 코멘트는 익명 입력이라 그대로 옮기면 익명 텍스트를 공개 재게시하게
 * 된다. 원문은 로그인 뒤 `/cases` 에서 본다.
 *
 * @param rows null = 못 읽었다. 빈 배열 = 0건. 둘을 다른 문장으로 낸다(§7.1).
 */
export function feedbackDigestLines(rows: FeedbackVoteRow[] | null, error: string | null): string[] {
  if (rows === null) return [`_확인 불가 — 케이스 피드백을 읽지 못했다(${error ?? '사유 미기록'}). "피드백 없음" 아님._`]
  if (rows.length === 0) return ['- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).']
  const tally = tallyFeedback(rows)
  const label = new Map<string, string>()
  for (const r of rows) {
    const name = r.case_studies?.brand_name || r.case_studies?.slug
    if (name || !label.has(r.case_study_id)) label.set(r.case_study_id, name || r.case_study_id.slice(0, 8))
  }
  const lines = [...tally.entries()]
    .sort(([, a], [, b]) => (b.up + b.down) - (a.up + a.down))
    .map(([id, t]) => `- ${label.get(id)} — 👍 ${t.up} · 👎 ${t.down}${t.noted ? ` · 코멘트 ${t.noted}건` : ''}`)
  const up = rows.filter((r) => r.vote > 0).length
  return [`- 합계 ${rows.length}표 (👍 ${up} · 👎 ${rows.length - up}) · 케이스 ${tally.size}곳. 코멘트 원문은 /cases 에서 본다(공개 리포에 싣지 않는다).`, ...lines]
}
