import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchInsights } from '@/lib/threads/insights'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const token = process.env.THREADS_ACCESS_TOKEN!

  // 발행된 글 중 threads_media_id 있는 것들
  const { data: posts } = await supabase
    .from('thread_posts')
    .select('id, threads_media_id, published_at')
    .eq('status', 'published')
    .not('threads_media_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(50)   // 최근 50건만 수집 (오래된 건 안정화됨)

  if (!posts?.length) return NextResponse.json({ ok: true, collected: 0 })

  const results = []
  for (const post of posts) {
    try {
      const metrics = await fetchInsights(post.threads_media_id!, token)
      await supabase.from('thread_metrics').insert({
        post_id: post.id,
        ...metrics,
      })
      results.push({ id: post.id, ok: true })
    } catch (e) {
      results.push({ id: post.id, ok: false, error: String(e) })
    }
    // 레이트 리밋 방지
    await new Promise(r => setTimeout(r, 200))
  }

  return NextResponse.json({ ok: true, collected: results.filter(r => r.ok).length, results })
}
