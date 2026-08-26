import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { publishPostWithReply } from '@/lib/threads/publish'
import { ensureValidToken } from '@/lib/threads/token'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
