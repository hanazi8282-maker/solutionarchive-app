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
