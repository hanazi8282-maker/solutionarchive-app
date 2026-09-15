'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'
import { normalizeBody, diceSimilarity } from '@/lib/threads/match'

export type ActionState = { ok: boolean; message: string } | null

// datetime-local 입력은 시간대 없는 문자열("2026-09-12T19:54")을 보낸다. ES 규칙상
// 그건 **서버의 로컬 시간**으로 해석되는데 Vercel 함수는 UTC 라, 한국 시각으로 적은
// 값이 9시간 늦게 저장된다(로컬 개발 PC 는 KST 라 재현이 안 된다). 오프셋이 없으면
// KST 로 읽는다. Threads API 가 준 타임스탬프("...+0000")는 오프셋이 있어 그대로 둔다.
function parseKstDateTime(s: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s}+09:00`)
}

// ── 글 등록 → posts INSERT ────────────────────────────────────────
export async function createPost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  const supabase = await createClient()
  if (!supabase) {
    return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다 (.env.local 확인).' }
  }

  const content_code = String(formData.get('content_code') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const published_at = String(formData.get('published_at') ?? '').trim()
  const patternRaw = String(formData.get('pattern') ?? '').trim()
  const hook_type = String(formData.get('hook_type') ?? '').trim()
  const closing_type = String(formData.get('closing_type') ?? '').trim()
  const hypothesis_code = String(formData.get('hypothesis_code') ?? '').trim()

  // 화면이 소재·가설 목록을 못 읽은 채 제출된 요청이다. 선택지가 비어 "선택 안 함"만 보낼 수
  // 있었으므로, 참조 없이 저장하면 "확인 불가"가 "참조 없음"으로 접힌다(§7.1). 화면도 버튼을
  // 막지만 서버가 최종 방어다 — 오래 열린 탭이나 폼을 거치지 않은 POST 도 여기서 걸린다.
  if (formData.get('refs_loaded') !== '1') {
    return { ok: false, message: '소재·가설 목록을 확인하지 못한 화면에서 제출됐습니다. 새로고침 후 다시 등록하세요.' }
  }

  if (!body) return { ok: false, message: '본문(body)은 필수입니다.' }
  if (!published_at) return { ok: false, message: '발행일시(published_at)는 필수입니다.' }
  const when = parseKstDateTime(published_at)
  if (Number.isNaN(when.getTime())) return { ok: false, message: '발행일시 형식이 올바르지 않습니다.' }

  // 자사(self) 채널을 기본 귀속. 벤치마크/학습이 channel 단위로 집계되므로 비워두면 안 된다.
  // 참조값은 조회 실패(확인 불가)와 없음(음성)을 가른다. 전에는 채널 조회 에러도
  // "채널 못 찾음"으로 접혀 channel_id 없이 저장됐다.
  const [channelRes, contentRes, hypoRes] = await Promise.all([
    supabase.from('channels').select('id').eq('owner_type', 'self').eq('platform', 'threads').limit(1).maybeSingle(),
    content_code ? supabase.from('content_items').select('code').eq('code', content_code).maybeSingle() : null,
    hypothesis_code ? supabase.from('hypotheses').select('code').eq('code', hypothesis_code).maybeSingle() : null,
  ])
  if (channelRes.error) {
    return { ok: false, message: `자사 채널 조회 실패 — 확인하지 못해 저장하지 않았습니다: ${channelRes.error.message}` }
  }
  if (contentRes?.error) {
    return { ok: false, message: `소재 조회 실패 — 확인하지 못해 저장하지 않았습니다: ${contentRes.error.message}` }
  }
  if (contentRes && !contentRes.data) return { ok: false, message: `없는 소재 코드입니다: ${content_code}` }
  if (hypoRes?.error) {
    return { ok: false, message: `가설 조회 실패 — 확인하지 못해 저장하지 않았습니다: ${hypoRes.error.message}` }
  }
  if (hypoRes && !hypoRes.data) return { ok: false, message: `없는 가설 코드입니다: ${hypothesis_code}` }
  const channel = channelRes.data

  const { error } = await supabase.from('posts').insert({
    channel_id: channel?.id ?? null,
    content_code: content_code || null,
    body,
    published_at: when.toISOString(),
    pattern: patternRaw ? Number(patternRaw) : null,
    hook_type: hook_type || null,
    closing_type: closing_type || null,
    hypothesis_code: hypothesis_code || null,
    // 이 화면은 "이미 발행한 글을 사후에 기록"하는 용도다. status 를 생략하면
    // 컬럼 기본값 'draft' 가 들어가고, 매처가 이 글을 초안으로 착각해
    // 엉뚱한 Threads 게시물에 붙이려 든다. 명시적으로 published 로 넣는다.
    status: 'published',
  })

  if (error) return { ok: false, message: `저장 실패: ${error.message}` }

  revalidatePath('/dashboard')
  return {
    ok: true,
    message: channel?.id
      ? '글이 등록되었습니다.'
      : '글이 등록되었습니다. (주의: self 채널을 찾지 못해 channel_id가 비어 있습니다)',
  }
}

// ── 성과 입력 → metric_snapshots UPSERT ──────────────────────────
// 스키마에 unique(post_id, hours_since_publish)가 걸려 있어 같은 시점을 다시 넣으면
// 중복 에러가 난다. 수치 정정 입력을 허용하기 위해 upsert로 처리한다.
export async function createSnapshot(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  const supabase = await createClient()
  if (!supabase) {
    return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다 (.env.local 확인).' }
  }

  const post_id = String(formData.get('post_id') ?? '').trim()
  const hoursRaw = String(formData.get('hours_since_publish') ?? '').trim()

  if (!post_id) return { ok: false, message: '대상 글을 선택하세요.' }
  if (!hoursRaw) return { ok: false, message: '경과 시간을 선택하세요.' }

  const num = (key: string) => {
    const v = String(formData.get(key) ?? '').trim()
    return v === '' ? null : Number(v)
  }

  const { error } = await supabase.from('metric_snapshots').upsert(
    {
      post_id,
      hours_since_publish: Number(hoursRaw),
      views: num('views'),
      likes: num('likes'),
      replies: num('replies'),
      reposts: num('reposts'),
      profile_clicks: num('profile_clicks'),
      follows: num('follows'),
      source: 'manual',
      captured_at: new Date().toISOString(),
    },
    { onConflict: 'post_id,hours_since_publish' },
  )

  if (error) return { ok: false, message: `저장 실패: ${error.message}` }

  revalidatePath('/dashboard')
  return { ok: true, message: `${hoursRaw}시간 시점 성과가 저장되었습니다.` }
}

// ── 미매칭 초안 수동 연결 → posts UPDATE ─────────────────────────
// 매처(/api/threads/match-posts)가 자동으로 붙이지 못한 초안을 사람이 직접
// Threads 게시물에 연결한다. 매처가 보류하는 경우는 A/B 변형처럼 텍스트만으로
// 구분이 안 되거나, 발행 전에 본문을 통째로 다시 써서 점수가 임계값에 한참
// 못 미치는 경우다. 어느 초안의 발행본인지 아는 건 사람뿐이다.
//
// ⛔ 여기서도 발행은 하지 않는다(CLAUDE.md §10). 이미 사람이 올린 글의
//    id 를 받아 적는 것뿐이다.
//
// 연결 대상 상태는 매처의 SCANNED_STATUSES 와 같아야 한다. 매처가 pending_review 로
// 확장된 뒤(#44) 여기만 draft 로 남아 있어서, 지금 발행되는 글(거의 전부
// pending_review)은 수동 연결이 0행 갱신 → "이미 연결된 글" 오류로 막혀 있었다.
const LINKABLE_STATUSES = ['draft', 'pending_review']

export async function linkDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }
  const supabase = await createClient()
  if (!supabase) {
    return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다 (.env.local 확인).' }
  }

  const draft_id = String(formData.get('draft_id') ?? '').trim()
  const external_id = String(formData.get('external_id') ?? '').trim()
  const published_at = String(formData.get('published_at') ?? '').trim()
  const permalink = String(formData.get('permalink') ?? '').trim()
  // 대시보드 "초안에 안 붙은 게시물" 목록에서 온 요청에만 있다(API 가 준 발행본 텍스트).
  // 게시물 ID 를 손으로 입력하는 폼에는 없어서, 그 경로는 body 를 초안 그대로 둔다.
  const published_body = String(formData.get('published_body') ?? '').trim()

  if (!draft_id) return { ok: false, message: '연결할 초안을 고르세요.' }
  if (!external_id) return { ok: false, message: 'Threads 게시물 ID를 입력하세요.' }

  // published_at 이 없으면 posts_published_at_required_check 에 걸려 저장이 실패한다.
  // DB 에러 메시지 대신 여기서 먼저 알려준다.
  if (!published_at) {
    return { ok: false, message: '발행일시를 입력하세요. status=published 인 행은 published_at 이 반드시 있어야 합니다.' }
  }

  const when = parseKstDateTime(published_at)
  if (Number.isNaN(when.getTime())) {
    return { ok: false, message: '발행일시 형식이 올바르지 않습니다.' }
  }

  // 매처(route.ts)와 같은 규약: 먼저 읽고, 읽은 상태를 UPDATE 조건으로 되돌려 쓴다.
  const { data: row, error: readErr } = await supabase
    .from('posts')
    .select('status, body, notes')
    .eq('id', draft_id)
    .maybeSingle()

  if (readErr) return { ok: false, message: `초안 조회 실패: ${readErr.message}` }
  if (!row) return { ok: false, message: '초안을 찾지 못했습니다. 새로고침 후 확인하세요.' }
  if (!LINKABLE_STATUSES.includes(row.status)) {
    return { ok: false, message: `이미 ${row.status} 상태라 연결하지 않습니다. 새로고침 후 확인하세요.` }
  }

  // 📌 매처와 같다: body 는 독자가 실제로 본 발행본으로 덮어쓰고(성과 숫자와 본문이
  //    같은 글을 가리켜야 한다), 경위와 수정 폭은 notes 에 남긴다. body 를 덮어쓰고
  //    나면 이 유사도 말고는 얼마나 고쳐 썼는지 알 방법이 없다.
  const score = published_body
    ? diceSimilarity(normalizeBody(row.body), normalizeBody(published_body))
    : null
  const notes = [
    row.notes,
    `[manual-link] ${row.status} → published — 대시보드 수동 연결, Threads 게시물 ${external_id}`,
    score !== null && score < 1 ? `[manual-link] 유사도 ${score.toFixed(3)} — 발행본이 초안과 다름` : null,
  ].filter(Boolean).join('\n')

  const { data, error } = await supabase
    .from('posts')
    .update({
      external_id,
      published_at: when.toISOString(),
      permalink: permalink || null,
      status: 'published',
      ...(published_body ? { body: published_body } : {}),
      notes,
    })
    .eq('id', draft_id)
    // 읽은 뒤 크론 매처가 먼저 붙였거나 상태가 바뀐 행은 건드리지 않는다.
    .eq('status', row.status)
    .select('id')

  if (error) {
    // 23505 = unique_violation. posts_external_id_key 는 같은 게시물을 두 초안에
    // 붙이는 걸 막는다 — 오타이거나, 매처가 이미 다른 행에 연결한 경우다.
    if (error.code === '23505') {
      return { ok: false, message: `이 Threads 게시물 ID는 이미 다른 글에 연결돼 있습니다 (${external_id}).` }
    }
    return { ok: false, message: `저장 실패: ${error.message}` }
  }

  if (!data || data.length === 0) {
    return { ok: false, message: '이미 연결된 글입니다. 새로고침 후 확인하세요.' }
  }

  revalidatePath('/dashboard')
  return { ok: true, message: `연결 완료 — external_id ${external_id}` }
}

// ── 발행 전 검수(승인/반려) — pending_review 초안 ────────────────────
//
// ⛔ 사람 전용 쓰기 경로 (CLAUDE.md §10.1 — 사람만 한다). /dashboard 화면의 버튼으로만
// 부른다. API 라우트로 만들지 않는다 — /cases·/columns 의 actions.ts 와 같은 규약.
//
// 승인은 status 를 바꾸지 않는다 — pending_review 자체가 이미 "발행 대기"(마이그
// 20260906000002 주석). 승인은 (필요하면 수정한) 본문을 확정하고 reviewed_at/by 를
// 남긴다. 반려는 status='discarded' — 이 초안은 발행하지 않는다.
export type ReviewActionState = { ok: boolean; message: string } | null

export async function reviewPost(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }

  const id = String(fd.get('id') ?? '').trim()
  const decision = String(fd.get('decision') ?? '')
  const body = String(fd.get('body') ?? '').trim()
  const note = String(fd.get('note') ?? '').trim()
  if (!id) return { ok: false, message: '대상 초안이 없습니다. 새로고침 후 다시 시도하세요.' }
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, message: '승인 또는 반려 중 하나를 골라야 합니다.' }
  if (decision === 'approved' && !body) return { ok: false, message: '승인하려면 본문이 비어 있으면 안 됩니다.' }

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: post, error: readErr } = await sb
    .from('posts').select('id, status').eq('id', id).maybeSingle()
  if (readErr) return { ok: false, message: `조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!post) return { ok: false, message: '초안을 찾지 못했습니다. 새로고침 후 확인하세요.' }
  if (post.status !== 'pending_review') {
    return { ok: false, message: `이미 ${post.status} 상태입니다. 새로고침 후 확인하세요.` }
  }

  const patch = decision === 'approved'
    ? { body, reviewed_by: auth.email, reviewed_at: new Date().toISOString(), review_note: note || null }
    : { status: 'discarded', reviewed_by: auth.email, reviewed_at: new Date().toISOString(), review_note: note || null }

  const { data, error } = await sb
    .from('posts').update(patch).eq('id', id).eq('status', 'pending_review').select('id')

  if (error) return { ok: false, message: `저장 실패: ${error.message}` }
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.' }

  revalidatePath('/dashboard')
  return { ok: true, message: decision === 'approved' ? '승인 완료 — 이 내용 그대로 Threads 에 게시하세요.' : '반려 완료 — 발행 대기에서 빠졌습니다.' }
}
