import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchInsights } from '@/lib/threads/insights'
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
  // 토큰이 없으면 200 으로 조용히 빠진다(publish 와 동일한 이유).
  const creds = await ensureValidToken()
  if (!creds) return NextResponse.json({ ok: true, skipped: 'threads 토큰 없음' })
  const token = creds.accessToken

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
