// ⛔ 크론 금지 — 사람 트리거 전용 (CLAUDE.md §10)
//
// CLAUDE.md §10: "자동 발행 API 사용 안 함 (계정 제재 리스크 회피). 사람 최종 검수 필수."
// 이 라우트는 사람이 초안을 검수한 뒤 직접 호출하는 수동 발행 API다.
// vercel.json 의 crons 에 절대 추가하지 말 것 — 추가하는 순간 §10 위반이 된다.
// 콘텐츠 초안 생성(generate)·성과 수집(collect-metrics)은 '발행'이 아니라서 크론 대상이다.
//
// 인증은 CRON_SECRET 을 그대로 쓴다(크론용으로 만든 이름이지만 여기서는 수동 호출용
// 공유 시크릿 역할). 호출 예:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://solutionarch.vercel.app/api/threads/publish

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createClient } from '@/lib/supabase/server'
import { publishPostWithReply } from '@/lib/threads/publish'
import { ensureValidToken } from '@/lib/threads/token'

// GET 은 발행을 트리거하지 않는다. 크론이던 시절엔 GET→POST alias 가 있었지만,
// 수동 전용이 된 지금은 시크릿을 아는 사람이 주소창에 URL 을 붙여넣는 것만으로
// 실제 발행이 나가는 사고 경로가 된다. 405 로 명시적으로 막는다.
export async function GET() {
  return NextResponse.json(
    { error: 'POST 전용입니다. 발행은 사람이 검수 후 POST 로 호출합니다. (CLAUDE.md §10)' },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  // 토큰은 api_tokens 가 정본이다. 만료가 가까우면 이 호출 안에서 갱신까지 끝난다.
  // 쓸 수 있는 토큰이 없으면 200 으로 조용히 빠진다 — 크론이 매일 500 을 뿜어도
  // 필요한 조치는 사람이 재인증하는 것뿐이라 알람이 소음이 되기 때문이다.
  const creds = await ensureValidToken()
  if (!creds) return NextResponse.json({ ok: true, skipped: 'threads 토큰 없음' })
  const { accessToken: token, userId } = creds

  // 발행 대기 중인 글 1건 가져오기
  const { data: posts, error: fetchErr } = await supabase
    .from('thread_posts')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!posts || posts.length === 0) return NextResponse.json({ ok: true, message: 'No queued posts' })

  const post = posts[0]

  try {
    const { postId, replyId } = await publishPostWithReply({
      userId,
      token,
      bodyText: post.body_text,
      imageUrl: post.image_url ?? undefined,
      commentText: post.comment_text ?? '',
    })

    await supabase.from('thread_posts').update({
      status: 'published',
      published_at: new Date().toISOString(),
      threads_media_id: postId,
      threads_reply_media_id: replyId,
      threads_permalink: `https://www.threads.net/t/${postId}`,
    }).eq('id', post.id)

    return NextResponse.json({ ok: true, slug: post.post_slug, postId, replyId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('thread_posts').update({
      status: 'failed', error_log: msg
    }).eq('id', post.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
