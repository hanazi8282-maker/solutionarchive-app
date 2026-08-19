import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { publishPostWithReply } from '@/lib/threads/publish'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const userId = process.env.THREADS_USER_ID!
  const token  = process.env.THREADS_ACCESS_TOKEN!

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
