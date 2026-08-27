'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ActionState = { ok: boolean; message: string } | null

// ── 글 등록 → posts INSERT ────────────────────────────────────────
export async function createPost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

  if (!body) return { ok: false, message: '본문(body)은 필수입니다.' }
  if (!published_at) return { ok: false, message: '발행일시(published_at)는 필수입니다.' }

  // 자사(self) 채널을 기본 귀속. 벤치마크/학습이 channel 단위로 집계되므로 비워두면 안 된다.
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('owner_type', 'self')
    .eq('platform', 'threads')
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('posts').insert({
    channel_id: channel?.id ?? null,
    content_code: content_code || null,
    body,
    published_at: new Date(published_at).toISOString(),
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
// Threads 게시물에 연결한다. 매처가 보류하는 경우는 대개 A/B 변형처럼
// 텍스트만으로 구분이 안 되는 상황이라, 어느 쪽인지 아는 건 사람뿐이다.
//
// ⛔ 여기서도 발행은 하지 않는다(CLAUDE.md §10). 이미 사람이 올린 글의
//    id 를 받아 적는 것뿐이다.
export async function linkDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient()
  if (!supabase) {
    return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다 (.env.local 확인).' }
  }

  const draft_id = String(formData.get('draft_id') ?? '').trim()
  const external_id = String(formData.get('external_id') ?? '').trim()
  const published_at = String(formData.get('published_at') ?? '').trim()
  const permalink = String(formData.get('permalink') ?? '').trim()

  if (!draft_id) return { ok: false, message: '연결할 초안이 지정되지 않았습니다.' }
  if (!external_id) return { ok: false, message: 'Threads 게시물 ID를 입력하세요.' }

  // published_at 이 없으면 posts_published_at_required_check 에 걸려 저장이 실패한다.
  // DB 에러 메시지 대신 여기서 먼저 알려준다.
  if (!published_at) {
    return { ok: false, message: '발행일시를 입력하세요. status=published 인 행은 published_at 이 반드시 있어야 합니다.' }
  }

  const when = new Date(published_at)
  if (Number.isNaN(when.getTime())) {
    return { ok: false, message: '발행일시 형식이 올바르지 않습니다.' }
  }

  const { data, error } = await supabase
    .from('posts')
    .update({
      external_id,
      published_at: when.toISOString(),
      permalink: permalink || null,
      status: 'published',
    })
    .eq('id', draft_id)
    // 이미 published 로 바뀐 행(크론 매처가 방금 붙였을 수 있다)은 건드리지 않는다.
    .eq('status', 'draft')
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
