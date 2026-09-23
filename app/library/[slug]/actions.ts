'use server'

import { randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAuthVerdict } from '@/lib/auth/session'
// 'use server' 파일은 async 함수만 export 할 수 있어 상한 상수는 lib 에 둔다(DB CHECK 와 한 벌).
import { FEEDBACK_NOTE_MAX } from '@/lib/cases/detail'
import {
  classifyFeedbackError, clientIp, voterKey, withinDailyLimit,
  FEEDBACK_VOTER_MIGRATION, type FeedbackRow,
} from '@/lib/cases/feedback'

// 공개 상세의 피드백 위젯 쓰기 경로. `case_feedback` INSERT 하나뿐이다.
//
// ★ **남헌 2026-09-23 명시 승인: 익명 피드백 허용, 하루 1회 제한.**
//   이 승인이 `scripts/auth-selftest.mjs` §4(모든 서버 액션에 `requireAllowedUser()` 강제)
//   의 예외를 내는 근거다. 그 검사는 "새로 만든 서버 액션은 기본 잠김"이라는 fail-closed
//   기본값을 지키는 자리이고, 예외는 이 액션 **하나뿐**이다(§4 의 예외 목록이 그걸 고정한다).
//   승인 없이 다른 액션을 그 목록에 더하지 마라 — 인증 경계 변경은 CLAUDE.md §10.2 사람 판단이다.
//
// 로그인은 **막는 조건이 아니라 붙는 정보**다: 로그인돼 있으면 `user_email` 도 같이 저장한다.
// 제한은 익명·로그인 모두 같게 적용한다(로그인했다고 하루 두 번이 되지 않는다).
//
// 스팸 방어 = 하루 1회. 축이 둘이다(IP 해시 + 쿠키 세션, OR 판정) — 하나만으로는 각각
// 다른 방향으로 틀린다(lib/cases/feedback.ts 헤더 참조).
//
// ★ §7.1: "확인 불가"를 허용으로 접지 않는다. 제한을 셀 수 없으면(마이그 미적용 · 조회 실패 ·
//   IP 없음 · 솔트 없음) **저장하지 않고 그 사실을 화면에 말한다.** 제한이 있다고 적혀 있는데
//   실제로는 없는 상태가 제일 나쁘다.

export type FeedbackState = { ok: boolean; message: string } | null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 브라우저를 잇는 쿠키. httpOnly — 이 값은 JS 가 읽을 이유가 없다. */
const VOTER_COOKIE = 'sa_vid'
const ONE_YEAR = 60 * 60 * 24 * 365

export async function submitCaseFeedback(_prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const caseStudyId = String(fd.get('case_study_id') ?? '').trim()
  const caseMoveId = String(fd.get('case_move_id') ?? '').trim()
  const vote = Number(String(fd.get('vote') ?? ''))
  const note = String(fd.get('note') ?? '').trim()

  if (!UUID_RE.test(caseStudyId)) return { ok: false, message: '어느 케이스인지 알 수 없습니다. 저장하지 않았습니다.' }
  if (vote !== 1 && vote !== -1) return { ok: false, message: '👍 또는 👎 를 골라 주세요. 저장하지 않았습니다.' }
  if (note.length > FEEDBACK_NOTE_MAX) return { ok: false, message: `한 줄은 ${FEEDBACK_NOTE_MAX}자까지입니다. 저장하지 않았습니다.` }

  // ── 누가 냈나 (두 축) ────────────────────────────────────────
  const h = await headers()
  const ip = clientIp(h.get('x-forwarded-for'), h.get('x-real-ip'))
  if (!ip) {
    return { ok: false, message: '요청한 곳(IP)을 확인할 수 없어 하루 1회 제한을 셀 수 없습니다 — 저장하지 않았습니다.' }
  }
  // 솔트 없이 sha256(IP) 를 쓰면 IPv4 를 전부 미리 해시해 대조할 수 있어 사실상 IP 평문 저장이다.
  const salt = process.env.FEEDBACK_SALT || process.env.CRON_SECRET
  const voterHash = voterKey(ip, salt)
  if (!voterHash) {
    return { ok: false, message: '서버 설정 누락 — 환경변수 FEEDBACK_SALT(없으면 CRON_SECRET)가 없어 저장하지 않았습니다.' }
  }

  const jar = await cookies()
  const existing = jar.get(VOTER_COOKIE)?.value ?? ''
  // 쿠키는 클라이언트가 보내는 값이다 — 모양이 UUID 가 아니면 쓰지 않고 새로 발급한다.
  const sessionId = UUID_RE.test(existing) ? existing : randomUUID()

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수 미설정 — 저장하지 않았습니다.' }

  // ── 하루 1회 (KST) ──────────────────────────────────────────
  // 오늘 이 케이스에 이 사람(해시 또는 쿠키)의 표가 있나. 판정은 순수 함수가 한다.
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString() // KST 자정을 넉넉히 덮는 창
  const { data, error: readError } = await sb
    .from('case_feedback')
    .select('case_study_id, voter_hash, session_id, created_at')
    .eq('case_study_id', caseStudyId)
    .gte('created_at', since)
    .or(`voter_hash.eq.${voterHash},session_id.eq.${sessionId}`)

  if (readError) {
    const f = classifyFeedbackError(readError)
    console.error('[library/feedback] read error:', readError.code ?? '', readError.message)
    return {
      ok: false,
      message: f?.kind === 'migration_missing'
        ? `${f.reason}. 저장하지 않았습니다 — 하루 1회 제한을 셀 수 없기 때문입니다.`
        : `확인 불가 — 오늘 남긴 표를 읽지 못했습니다(${f?.reason ?? '사유 미상'}). 저장하지 않았습니다.`,
    }
  }

  const verdict = withinDailyLimit((data ?? null) as FeedbackRow[] | null, new Date(), {
    caseStudyId, voterHash, sessionId,
  })
  if (verdict.state === 'deny') return { ok: false, message: verdict.message }
  if (verdict.state === 'unknown') return { ok: false, message: `확인 불가 — ${verdict.reason}` }

  // ── 저장 ────────────────────────────────────────────────────
  const auth = await getAuthVerdict()
  const { error } = await sb.from('case_feedback').insert({
    case_study_id: caseStudyId,
    case_move_id: UUID_RE.test(caseMoveId) ? caseMoveId : null,
    vote,
    note: note || null,
    // NULL = 익명. "확인 실패"가 아니다 — 확인 실패면 위에서 이미 돌아갔다.
    user_email: auth.kind === 'allowed' ? auth.email : null,
    voter_hash: voterHash,
    session_id: sessionId,
  })
  if (error) {
    const f = classifyFeedbackError(error)
    console.error('[library/feedback] insert error:', error.code ?? '', error.message)
    return {
      ok: false,
      message: f?.kind === 'migration_missing'
        ? `${f.reason}(${FEEDBACK_VOTER_MIGRATION}). 저장하지 않았습니다.`
        : `저장 실패: ${f?.reason ?? error.message}`,
    }
  }

  // 표가 저장된 뒤에만 쿠키를 심는다 — 저장 안 된 사람에게 1년짜리 쿠키를 남기지 않는다.
  jar.set(VOTER_COOKIE, sessionId, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: ONE_YEAR,
    secure: process.env.NODE_ENV === 'production',
  })

  // 다시 읽어 보여 줄 것이 없다(집계를 화면에 내지 않는다) — revalidate 하지 않는다.
  return { ok: true, message: vote === 1 ? '고맙습니다. 도움이 됐다고 기록했습니다.' : '고맙습니다. 아쉬웠다고 기록했습니다.' }
}
