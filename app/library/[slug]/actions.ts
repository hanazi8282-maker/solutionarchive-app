'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'
// 'use server' 파일은 async 함수만 export 할 수 있어 상한 상수는 lib 에 둔다(DB CHECK 와 한 벌).
import { FEEDBACK_NOTE_MAX } from '@/lib/cases/detail'

// 공개 상세의 피드백 위젯 쓰기 경로. `case_feedback` INSERT 하나뿐이다.
//
// ⚠️ 지금은 **로그인(허용 목록) 사용자만** 저장된다. 익명 저장은 구현하지 않았다.
//    이유: `scripts/auth-selftest.mjs` §4 가 `'use server'` 파일의 모든 export 에 대해
//    "DB 접근 전에 requireAllowedUser() 를 부르고 거절을 돌려주는가" 를 강제한다. 그 검사는
//    "새로 만든 서버 액션은 기본 잠김"이라는 fail-closed 기본값을 지키는 자리다. 익명 쓰기를
//    열려면 그 검사에 예외를 내야 하고, 그건 **인증 경계를 넓히는 변경**이라 CLAUDE.md §10.2 의
//    사람 판단 예외(3번)다 — 서브에이전트가 결정할 자리가 아니다.
//
//    익명까지 받기로 결정되면 바뀌는 것은 두 줄이다:
//      1) 아래 가드를 `const auth = await getAuthVerdict()` 로 바꿔
//         `user_email: auth.kind === 'allowed' ? auth.email : null`
//      2) `scripts/auth-selftest.mjs` §4 에 이 액션을 "공개 쓰기" 로 명시 예외 + 음성 검사 추가
//    마이그레이션은 이미 그 형태를 받는다(`case_feedback.user_email` nullable, NULL = 익명).
//    스팸 방어가 같이 필요하다 — 익명 쓰기는 레이트리밋 없이 열면 안 된다.

export type FeedbackState = { ok: boolean; message: string } | null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 테이블·컬럼이 없을 때(마이그 미적용)를 "저장됨"으로 접지 않는다(§7.1). */
function writeFailure(error: { code?: string; message: string }): string {
  if (error.code === '42P01' || error.code === 'PGRST205' || /case_feedback/.test(error.message)) {
    return '피드백 테이블이 DB 에 없습니다 — 마이그레이션 20260930000001_case_detail_logo_feedback.sql 미적용. 저장하지 않았습니다.'
  }
  return `저장 실패: ${error.message}`
}

export async function submitCaseFeedback(_prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: `${auth.message} (지금은 로그인한 사용자만 의견을 남길 수 있습니다)` }

  const caseStudyId = String(fd.get('case_study_id') ?? '').trim()
  const caseMoveId = String(fd.get('case_move_id') ?? '').trim()
  const vote = Number(String(fd.get('vote') ?? ''))
  const note = String(fd.get('note') ?? '').trim()

  if (!UUID_RE.test(caseStudyId)) return { ok: false, message: '어느 케이스인지 알 수 없습니다. 저장하지 않았습니다.' }
  if (vote !== 1 && vote !== -1) return { ok: false, message: '👍 또는 👎 를 골라 주세요. 저장하지 않았습니다.' }
  if (note.length > FEEDBACK_NOTE_MAX) return { ok: false, message: `한 줄은 ${FEEDBACK_NOTE_MAX}자까지입니다. 저장하지 않았습니다.` }

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수 미설정 — 저장하지 않았습니다.' }

  const { error } = await sb.from('case_feedback').insert({
    case_study_id: caseStudyId,
    case_move_id: UUID_RE.test(caseMoveId) ? caseMoveId : null,
    vote,
    note: note || null,
    user_email: auth.email,
  })
  if (error) {
    console.error('[library/feedback] insert error:', error.code ?? '', error.message)
    return { ok: false, message: writeFailure(error) }
  }

  // 다시 읽어 보여 줄 것이 없다(집계를 화면에 내지 않는다) — revalidate 하지 않는다.
  return { ok: true, message: vote === 1 ? '고맙습니다. 도움이 됐다고 기록했습니다.' : '고맙습니다. 아쉬웠다고 기록했습니다.' }
}
