'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { CASE_CORPUS_TAG } from '@/lib/cases/corpus-db'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'
import { checkDecisionInput, moveApprovalWarning, caseApprovalWarning, readTransferability, type ReviewDecision } from '@/lib/cases/review'
import { readGradeSubmission } from '@/lib/cases/grade-queue'

// ⛔ 사람 전용 쓰기 경로 (CLAUDE.md §10.1 — 승인·반려는 사람만 한다).
//    /cases 화면의 버튼으로만 부른다. API 라우트로 만들지 않는다 — 무인 루프·에이전트는
//    앱을 HTTP 로 부르지 않고, 그들이 쓸 수 있는 승인 경로를 새로 만들지 않기 위해서다.
//    evidence_grade 는 건드리지 않는다(검수와 별개 축, regrade 는 CLI 에서 사람이).
//
// 누가: 두 액션 모두 맨 앞에서 로그인 세션 + 허용 목록을 확인하고(requireAllowedUser),
//    reviewed_by 에는 폼 값이 아니라 **로그인한 이메일**을 쓴다. 폼 입력은 아무 이름이나 적을 수 있어 기록이 못 된다.
//    CLI(scripts/case-review.mjs --by)로 결정한 행에는 이름이 남아 있어 두 형식이 섞인다.
//
// 규칙은 scripts/case-review.mjs 와 같다(lib/cases/review.ts 공유): 검수자 필수, 승인 단위는
// 무브, 케이스 승인 ≠ 무브 승인(경고만), 부정 사례 비A 승인은 경고. 화면만의 추가 규칙은
// 반려 사유 필수와 draft 에서만 결정(동시 클릭·낡은 화면 방지) 두 가지다.

export type ReviewActionState = { ok: boolean; message: string } | null

const LABEL: Record<ReviewDecision, string> = { approved: '승인', rejected: '반려' }

function readInput(fd: FormData, by: string) {
  return {
    id: String(fd.get('id') ?? '').trim(),
    decision: String(fd.get('decision') ?? ''),
    by,
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

type Sb = NonNullable<Awaited<ReturnType<typeof createClient>>>

/**
 * 무브 한 건의 결정 쓰기. 개별 결정(decideMove)과 카드 채점(gradeCase)이 같이 쓴다 —
 * 경로가 둘이어도 "무엇을 어떻게 기록하는가"는 한 벌이어야 한다.
 *
 * 이식성 값이 있을 때만 `_by`/`_at` 을 남긴다. 값 없이 사람 이름만 찍히면
 * "누가 미판정을 골랐다"는 기록이 되는데, 그건 판정이 아니다.
 * 이식성 컬럼(마이그 20260915000001)이 없으면 축 없이 한 번 더 쓰고 `axisMissing` 으로 알린다 —
 * 승인 자체를 막지는 않되 **조용히 넘어가지 않는다**(§7.2).
 */
async function writeMove(sb: Sb, id: string, d: { decision: ReviewDecision; by: string; note: string; transferability: string | null }) {
  const now = new Date().toISOString()
  const base = { review_status: d.decision, review_note: d.note || null, reviewed_by: d.by, reviewed_at: now }
  const patch = d.decision === 'approved' && d.transferability !== null
    ? { ...base, transferability: d.transferability, transferability_by: d.by, transferability_at: now }
    : base

  const write = (row: Record<string, unknown>) => sb
    .from('case_moves')
    .update(row)
    .eq('id', id)
    .eq('review_status', 'draft') // 읽은 뒤 다른 탭에서 먼저 결정했으면 덮어쓰지 않는다
    .select('id')

  let { data, error } = await write(patch)
  let axisMissing = false
  if (error && patch !== base && /transferability/.test(error.message)) {
    axisMissing = true
    ;({ data, error } = await write(base))
  }
  return { data, error, axisMissing }
}

export async function decideMove(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  const input = readInput(fd, auth.email)
  const bad = checkDecisionInput(input)
  if (bad) return { ok: false, message: bad }
  if (!input.id) return { ok: false, message: '대상 무브가 없습니다. 새로고침 후 다시 시도하세요.' }
  const decision = input.decision as ReviewDecision

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: move, error: readErr } = await sb
    .from('case_moves')
    // fact_check_grade 는 moveApprovalWarning 이 보는 컬럼이다. 빠져 있던 동안 부정 사례 경고가
    // 등급을 undefined 로 읽어 A 여도 경고를 냈다 — 화면(page.tsx)은 같은 함수를 제대로 부르고 있었다.
    .select('id, review_status, lever, outcome_direction, evidence_grade, fact_check_grade')
    .eq('id', input.id)
    .maybeSingle()
  if (readErr) return { ok: false, message: `무브 조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!move) return { ok: false, message: '무브를 찾지 못했습니다. 새로고침 후 확인하세요.' }
  if (move.review_status !== 'draft') {
    return { ok: false, message: `이미 ${move.review_status} 상태입니다. 새로고침 후 확인하세요.` }
  }

  // ── 이식성 판정 — 같은 승인 트랜잭션에 얹는다 ─────────────────────────
  //
  // 별도 버튼·별도 API 를 만들지 않는다. 경로가 늘면 §10.1 의 "사람만 쓴다"를
  // 지키는 자리도 늘어난다. 미선택이면 NULL(미판정)로 남고 승인은 그대로 된다.
  const transfer = readTransferability(fd.get('transferability'))
  if (transfer.error) return { ok: false, message: transfer.error }

  const { data, error, axisMissing } = await writeMove(sb, input.id, {
    decision, by: input.by, note: input.note, transferability: transfer.value,
  })
  if (error) return { ok: false, message: writeFailure(error) }
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.' }

  revalidatePath('/cases')
  revalidateTag(CASE_CORPUS_TAG, { expire: 0 }) // 검색·리포트·어드바이저 코퍼스 캐시 즉시 만료(stale 안 줌)
  const warn = decision === 'approved' ? moveApprovalWarning(move) : null
  const axisNote = axisMissing
    ? ' · ⚠️ 이식성 축 미적용(마이그 20260915000001) — 고른 이식성은 저장되지 않았습니다. 승인만 반영됐습니다.'
    : transfer.value ? ` · 이식성 ${transfer.value}` : ''
  return { ok: true, message: `무브 ${LABEL[decision]} — [${move.evidence_grade}] ${move.lever} · 검수자 ${input.by}${warn ? ` · ⚠️ ${warn}` : ''}${axisNote}` }
}

export async function decideCase(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  const input = readInput(fd, auth.email)
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
  revalidateTag(CASE_CORPUS_TAG, { expire: 0 }) // 검색·리포트·어드바이저 코퍼스 캐시 즉시 만료(stale 안 줌)
  const warn = decision === 'approved' ? caseApprovalWarning(study.case_moves ?? []) : null
  return { ok: true, message: `케이스 ${LABEL[decision]} — ${study.brand_name} · 검수자 ${input.by}${warn ? ` · ⚠️ ${warn}` : ''}` }
}

// ── 카드 채점 모드(/cases/grade) — 케이스 1건을 폼 1개·제출 1회로 ──────────────
//
// 기존 경로와 다른 것은 **묶는 단위**뿐이다. 판정 규칙(lib/cases/review.ts)·검수자(로그인 이메일)·
// draft 에서만 결정·이식성 저장 방식은 위 decideMove/decideCase 와 같은 코드를 쓴다.
// 여기에 반려는 없다 — 체크 안 한 무브는 손대지 않고 draft 로 남는다(반려는 /cases 에서).
//
// ⚠️ PostgREST 에는 다건 트랜잭션이 없다. 무브 N건 + 케이스 1건을 순서대로 쓰고, 중간에 실패하면
//    "몇 건까지 반영됐는지"를 그대로 보고한다 — 부분 반영을 성공으로도 실패로도 접지 않는다(§7.1).
type GradeMoveRow = { id: string; review_status: string; lever: string; outcome_direction: string | null; fact_check_grade: string | null }

/**
 * 승인 뒤에 얹는 **맥락 필드**. 승인(writeMove)과 분리한 이유가 둘이다.
 *
 * 1. 저장 컬럼이 서로 다른 마이그레이션에서 온다 — 이유는 20260930000005(이 트랙),
 *    `pmf_signal`·`metric_kind` 는 20260930000004(D 트랙). 한쪽이 미적용일 때
 *    다른 쪽까지 같이 버리면 안 되므로 묶음별로 따로 쓴다.
 * 2. `writeMove` 는 `decideMove`(개별 결정 화면)도 쓴다. 그 경로에는 이 칸들이 없다.
 *
 * 컬럼 없음(42703 / PGRST204)은 **조용히 넘기지 않는다** — `missing` 으로 올려서 화면
 * 메시지에 "저장 안 됨 + 어느 마이그가 미적용인지"를 적는다(§7.1 · §7.2).
 * 승인은 이미 끝났으므로 여기서 실패해도 되돌리지 않는다.
 */
async function writeMoveContext(sb: Sb, id: string, row: Record<string, unknown>) {
  if (Object.keys(row).length === 0) return { missing: false, error: null as null | { code?: string; message: string } }
  const { error } = await sb.from('case_moves').update(row).eq('id', id)
  if (!error) return { missing: false, error: null }
  const missing = error.code === '42703' || error.code === 'PGRST204'
  return { missing, error: missing ? null : error }
}

export async function gradeCase(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }

  const sub = readGradeSubmission({
    caseId: fd.get('case_id'),
    moveIds: fd.getAll('move'),
    transferabilityOf: (id) => fd.get(`transferability:${id}`),
    transferabilityReasonOf: (id) => fd.get(`transferability_reason:${id}`),
    pmfSignalOf: (id) => fd.get(`pmf_signal:${id}`),
    metricKindOf: (id) => fd.get(`metric_kind:${id}`),
    approveCase: fd.get('approve_case'),
  })
  if (!sub.value) return { ok: false, message: sub.error ?? '제출 내용을 읽지 못했습니다.' }
  const { caseId, moves, approveCase } = sub.value

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: study, error: readErr } = await sb
    .from('case_studies')
    .select('id, review_status, brand_name, case_moves(id, review_status, lever, outcome_direction, fact_check_grade)')
    .eq('id', caseId)
    .maybeSingle()
  if (readErr) return { ok: false, message: `케이스 조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!study) return { ok: false, message: '케이스를 찾지 못했습니다. 새로고침 후 확인하세요.' }
  const rows = (study.case_moves ?? []) as GradeMoveRow[]

  // 쓰기 전에 전부 확인한다. 한 건이라도 남의 무브이거나 이미 결정된 것이면 아무것도 바꾸지 않는다.
  for (const m of moves) {
    const row = rows.find((r) => r.id === m.id)
    if (!row) return { ok: false, message: '이 케이스의 무브가 아닙니다 — 아무것도 바꾸지 않았습니다. 새로고침 후 확인하세요.' }
    if (row.review_status !== 'draft') return { ok: false, message: `무브가 이미 ${row.review_status} 상태입니다 — 아무것도 바꾸지 않았습니다. 새로고침하세요.` }
  }
  if (approveCase && study.review_status !== 'draft') {
    return { ok: false, message: `케이스가 이미 ${study.review_status} 상태입니다 — 아무것도 바꾸지 않았습니다. 새로고침하세요.` }
  }

  const done: string[] = []
  const warns: string[] = []
  let axisMissing = false
  let reasonMissing = false   // 마이그 20260930000005 미적용
  let pmfMissing = false      // 마이그 20260930000004 미적용 (D 트랙)
  for (const m of moves) {
    const res = await writeMove(sb, m.id, { decision: 'approved', by: auth.email, note: '', transferability: m.transferability })
    const stopped = `무브 ${done.length}/${moves.length}건 승인 후 중단`
    if (res.error) return { ok: false, message: `${stopped} — ${writeFailure(res.error)}` }
    if (!res.data || res.data.length === 0) return { ok: false, message: `${stopped} — 방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.` }
    done.push(m.id)
    axisMissing = axisMissing || res.axisMissing

    // 맥락 필드 — 승인 뒤에 묶음 2개로 얹는다. 빈 값은 아예 안 쓴다(기존 값을 NULL 로 덮지 않는다).
    if (m.transferabilityReason !== null) {
      const r = await writeMoveContext(sb, m.id, {
        transferability_reason: m.transferabilityReason,
        transferability_reason_at: new Date().toISOString(),
      })
      if (r.error) warns.push(`이식성 이유 저장 실패 — ${r.error.message}`)
      reasonMissing = reasonMissing || r.missing
    }
    const pmfRow: Record<string, unknown> = {}
    if (m.pmfSignal !== null) pmfRow.pmf_signal = Number(m.pmfSignal)
    if (m.metricKind !== null) pmfRow.metric_kind = m.metricKind
    const p = await writeMoveContext(sb, m.id, pmfRow)
    if (p.error) warns.push(`S·지표종류 저장 실패 — ${p.error.message}`)
    pmfMissing = pmfMissing || p.missing

    const row = rows.find((r) => r.id === m.id)
    const w = row ? moveApprovalWarning(row) : null
    if (w) warns.push(`${row?.lever} — ${w}`)
  }

  let caseApproved = false
  if (approveCase) {
    const { data, error } = await sb
      .from('case_studies')
      // review_note 는 건드리지 않는다. 이 화면에는 메모 칸이 없어서, null 로 덮으면 남의 기록이 사라진다.
      .update({ review_status: 'approved', reviewed_by: auth.email, reviewed_at: new Date().toISOString() })
      .eq('id', caseId)
      .eq('review_status', 'draft')
      .select('id')
    if (error) return { ok: false, message: `무브 ${done.length}건은 승인됐습니다 — 케이스 승인 실패: ${writeFailure(error)}` }
    if (!data || data.length === 0) return { ok: false, message: `무브 ${done.length}건은 승인됐습니다 — 케이스는 방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.` }
    caseApproved = true
    // 승인 뒤 상태로 경고를 낸다 — "케이스 승인 = 무브 전부 승인"이 아니라는 걸 남은 draft 수로 말한다.
    const after = rows.map((r) => (done.includes(r.id) ? { review_status: 'approved' } : r))
    const cw = caseApprovalWarning(after)
    if (cw) warns.push(cw)
  }

  // 성공하면 이 카드는 큐에서 빠지고 다음 카드가 위로 온다 — 아래 message 도 카드와 함께 사라진다.
  // 그래서 승인 경고는 **누르기 전에** 카드 안에서 보여 준다(grade-card.tsx). 실패는 revalidate 가 없어 그대로 남는다.
  revalidatePath('/cases/grade')
  revalidatePath('/cases')
  revalidateTag(CASE_CORPUS_TAG, { expire: 0 }) // 검색·리포트·어드바이저 코퍼스 캐시 즉시 만료(stale 안 줌)
  const axisNote = (axisMissing
    ? ' · ⚠️ 이식성 축 미적용(마이그 20260915000001) — 고른 이식성은 저장되지 않았습니다.'
    : '')
    + (reasonMissing ? ' · ⚠️ 이유는 저장 안 됨(마이그 20260930000005 미적용) — 승인은 반영됐습니다.' : '')
    + (pmfMissing ? ' · ⚠️ S·지표종류는 저장 안 됨(마이그 20260930000004 미적용) — 승인은 반영됐습니다.' : '')
  return {
    ok: true,
    message: `${study.brand_name} — 무브 ${done.length}건 승인${caseApproved ? ' · 케이스 승인' : ' · 케이스는 그대로(draft)'} · 검수자 ${auth.email}`
      + warns.map((w) => ` · ⚠️ ${w}`).join('')
      + axisNote,
  }
}
