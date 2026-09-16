'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'

// ⛔ 사람 전용 쓰기 경로 (CLAUDE.md §10.1 — 승인·반려는 사람만 한다). /columns 화면의
// 버튼으로만 부른다. API 라우트로 만들지 않는다 — /cases 의 actions.ts 와 같은 이유다.
//
// 결정 단위는 칼럼 1건이다(스레드는 그 칼럼에 딸려서 같이 승인·반려된다 — 편별 승인 없음,
// 케이스처럼 무브 단위로 쪼갤 만큼 편 수가 많지 않다).

export type ReviewActionState = { ok: boolean; message: string } | null

const LABEL: Record<'approved' | 'rejected', string> = { approved: '승인', rejected: '반려' }

export async function decideColumn(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }

  const id = String(fd.get('id') ?? '').trim()
  const decisionRaw = String(fd.get('decision') ?? '')
  const note = String(fd.get('note') ?? '').trim()
  if (!id) return { ok: false, message: '대상 칼럼이 없습니다. 새로고침 후 다시 시도하세요.' }
  if (decisionRaw !== 'approved' && decisionRaw !== 'rejected') return { ok: false, message: '승인 또는 반려 중 하나를 골라야 합니다.' }
  if (decisionRaw === 'rejected' && !note) return { ok: false, message: '반려 사유를 적어야 합니다.' }
  const decision = decisionRaw

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: col, error: readErr } = await sb
    .from('content_columns')
    .select('id, review_status')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return { ok: false, message: `조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!col) return { ok: false, message: '칼럼을 찾지 못했습니다. 새로고침 후 확인하세요.' }
  // draft 에서만 결정한다 — 동시 클릭·낡은 화면으로 이미 결정된 행을 덮어쓰지 않는다(/cases 와 같은 방어).
  if (col.review_status !== 'draft') {
    return { ok: false, message: `이미 ${col.review_status} 상태입니다. 새로고침 후 확인하세요.` }
  }

  const { data, error: writeErr } = await sb
    .from('content_columns')
    .update({
      review_status: decision,
      review_note: note || null,
      reviewed_by: auth.email,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('review_status', 'draft') // 낙관적 락 — 읽은 뒤 사이에 바뀌었으면 0행 갱신.
    .select('id')

  if (writeErr) return { ok: false, message: `저장 실패: ${writeErr.message}` }
  // update() 는 0행이 바뀌어도 error 를 주지 않는다 — select() 로 실제 갱신 여부를 본다.
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.' }

  revalidatePath('/columns')
  return { ok: true, message: `${LABEL[decision]} 완료.` }
}

// ── 검수 피드백 제안 (column_review_patterns) ────────────────────────────────
//
// scripts/column-feedback.mjs 가 review_note 배치에서 뽑아 적립한 "가이드 반영 제안"을
// 사람이 결정한다. 위 decideColumn 과 같은 방어를 그대로 쓴다 — 로그인 확인 → 현재 상태
// 읽기 → 낙관적 락 → select() 로 실제 갱신행 확인.
//
// ⛔ "가이드에 반영함"은 **기록일 뿐이다.** 이 액션은 가이드 문서를 고치지 않는다.
//    문서는 사람이 직접 연다 — 코드가 content/guides 를 쓰는 경로는 이 리포에 없다.

const PATTERN_LABEL: Record<'applied' | 'dismissed', string> = { applied: '가이드 반영', dismissed: '기각' }

export async function decideColumnPattern(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }

  const id = String(fd.get('id') ?? '').trim()
  const decisionRaw = String(fd.get('decision') ?? '')
  const note = String(fd.get('note') ?? '').trim()
  if (!id) return { ok: false, message: '대상 제안이 없습니다. 새로고침 후 다시 시도하세요.' }
  if (decisionRaw !== 'applied' && decisionRaw !== 'dismissed') {
    return { ok: false, message: '반영 또는 기각 중 하나를 골라야 합니다.' }
  }
  // 기각 사유는 필수다 — 사유가 없으면 다음 배치 프롬프트가 "왜 안 되는지"를 못 되먹인다.
  if (decisionRaw === 'dismissed' && !note) return { ok: false, message: '기각 사유를 적어야 합니다.' }
  const decision = decisionRaw

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: row, error: readErr } = await sb
    .from('column_review_patterns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return { ok: false, message: `조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!row) return { ok: false, message: '제안을 찾지 못했습니다. 새로고침 후 확인하세요.' }
  if (row.status !== 'proposed') {
    return { ok: false, message: `이미 ${row.status} 상태입니다. 새로고침 후 확인하세요.` }
  }

  const { data, error: writeErr } = await sb
    .from('column_review_patterns')
    .update({
      status: decision,
      decision_note: note || null,
      decided_by: auth.email,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'proposed') // 낙관적 락 — 읽은 뒤 사이에 바뀌었으면 0행 갱신.
    .select('id')

  if (writeErr) return { ok: false, message: `저장 실패: ${writeErr.message}` }
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.' }

  revalidatePath('/columns')
  return { ok: true, message: `${PATTERN_LABEL[decision]} 완료. 가이드 문서는 직접 고쳐야 합니다.` }
}
