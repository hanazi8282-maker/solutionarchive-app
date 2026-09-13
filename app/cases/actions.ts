'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkDecisionInput, moveApprovalWarning, caseApprovalWarning, type ReviewDecision } from '@/lib/cases/review'

// ⛔ 사람 전용 쓰기 경로 (CLAUDE.md §10.1 — 승인·반려는 사람만 한다).
//    /cases 화면의 버튼으로만 부른다. API 라우트로 만들지 않는다 — 무인 루프·에이전트는
//    앱을 HTTP 로 부르지 않고, 그들이 쓸 수 있는 승인 경로를 새로 만들지 않기 위해서다.
//    evidence_grade 는 건드리지 않는다(검수와 별개 축, regrade 는 CLI 에서 사람이).
//
// ⚠️ 한계: 앱에 아직 로그인이 없다(lib/supabase/server.ts TODO — service_role).
//    서버 액션도 결국 POST 엔드포인트라 앱 URL 과 액션 ID 를 아는 누구나 부를 수 있다.
//    Google SSO 가 붙을 때 여기서 세션을 검사하고 by 를 세션 이름으로 바꾼다.
//
// 규칙은 scripts/case-review.mjs 와 같다(lib/cases/review.ts 공유): 검수자 필수, 승인 단위는
// 무브, 케이스 승인 ≠ 무브 승인(경고만), 부정 사례 비A 승인은 경고. 화면만의 추가 규칙은
// 반려 사유 필수와 draft 에서만 결정(동시 클릭·낡은 화면 방지) 두 가지다.

export type ReviewActionState = { ok: boolean; message: string } | null

const LABEL: Record<ReviewDecision, string> = { approved: '승인', rejected: '반려' }

function readInput(fd: FormData) {
  return {
    id: String(fd.get('id') ?? '').trim(),
    decision: String(fd.get('decision') ?? ''),
    by: String(fd.get('by') ?? '').trim(),
    note: String(fd.get('note') ?? '').trim(),
  }
}

// 컬럼이 없으면(마이그 미적용) PostgREST 가 PGRST204 / 42703 을 준다. 사유·검수자를 버리고
// 결정만 저장하는 폴백을 두지 않는다 — 그러면 "누가·왜"가 조용히 사라진다.
function writeFailure(error: { code?: string; message: string }): string {
  return /review_note|reviewed_by|reviewed_at/.test(error.message) || error.code === 'PGRST204' || error.code === '42703'
    ? '검수 기록 컬럼(review_note·reviewed_by)이 DB 에 없습니다 — 마이그레이션 20260914000001_case_review_note.sql 미적용. 기록 없이 결정하지 않았습니다.'
    : `저장 실패: ${error.message}`
}

export async function decideMove(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const input = readInput(fd)
  const bad = checkDecisionInput(input)
  if (bad) return { ok: false, message: bad }
  if (!input.id) return { ok: false, message: '대상 무브가 없습니다. 새로고침 후 다시 시도하세요.' }
  const decision = input.decision as ReviewDecision

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: move, error: readErr } = await sb
    .from('case_moves')
    .select('id, review_status, lever, outcome_direction, evidence_grade')
    .eq('id', input.id)
    .maybeSingle()
  if (readErr) return { ok: false, message: `무브 조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!move) return { ok: false, message: '무브를 찾지 못했습니다. 새로고침 후 확인하세요.' }
  if (move.review_status !== 'draft') {
    return { ok: false, message: `이미 ${move.review_status} 상태입니다. 새로고침 후 확인하세요.` }
  }

  const { data, error } = await sb
    .from('case_moves')
    .update({ review_status: decision, review_note: input.note || null, reviewed_by: input.by, reviewed_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('review_status', 'draft') // 읽은 뒤 다른 탭에서 먼저 결정했으면 덮어쓰지 않는다
    .select('id')
  if (error) return { ok: false, message: writeFailure(error) }
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.' }

  revalidatePath('/cases')
  const warn = decision === 'approved' ? moveApprovalWarning(move) : null
  return { ok: true, message: `무브 ${LABEL[decision]} — [${move.evidence_grade}] ${move.lever}${warn ? ` · ⚠️ ${warn}` : ''}` }
}

export async function decideCase(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const input = readInput(fd)
  const bad = checkDecisionInput(input)
  if (bad) return { ok: false, message: bad }
  if (!input.id) return { ok: false, message: '대상 케이스가 없습니다. 새로고침 후 다시 시도하세요.' }
  const decision = input.decision as ReviewDecision

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: study, error: readErr } = await sb
    .from('case_studies')
    .select('id, review_status, brand_name, case_moves(review_status)')
    .eq('id', input.id)
    .maybeSingle()
  if (readErr) return { ok: false, message: `케이스 조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!study) return { ok: false, message: '케이스를 찾지 못했습니다. 새로고침 후 확인하세요.' }
  if (study.review_status !== 'draft') {
    return { ok: false, message: `이미 ${study.review_status} 상태입니다. 새로고침 후 확인하세요.` }
  }

  const { data, error } = await sb
    .from('case_studies')
    .update({ review_status: decision, review_note: input.note || null, reviewed_by: input.by, reviewed_at: new Date().toISOString() })
    .eq('id', input.id)
    .eq('review_status', 'draft')
    .select('id')
  if (error) return { ok: false, message: writeFailure(error) }
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.' }

  revalidatePath('/cases')
  const warn = decision === 'approved' ? caseApprovalWarning(study.case_moves ?? []) : null
  return { ok: true, message: `케이스 ${LABEL[decision]} — ${study.brand_name}${warn ? ` · ⚠️ ${warn}` : ''}` }
}
