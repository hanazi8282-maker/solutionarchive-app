// ⚠️ 크론에서 의도적으로 제외됨 — 되돌리기 전에 읽을 것.
//
// 이 라우트가 읽고 쓰는 thread_posts / thread_metrics 테이블이 이 프로젝트의
// Supabase 에 아직 없다. 크론에 걸어두면 매일 no-op 을 돌면서 성공처럼 보인다
// (아래 쿼리가 error 를 삼켜 ok:true, collected:0 을 반환하기 때문 — 실측 확인함).
// 테이블 마이그레이션이 끝나면 vercel.json 에 다시 추가한다: "30 12 * * *" (21:30 KST).
//
// vercel.json 은 순수 JSON 이라 주석을 못 넣는다(주석·미지원 키 모두 배포를 깨뜨림).
// 그래서 이 설명이 라우트 파일에 있다.

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
  // TODO(테이블 마이그레이션 때 같이 고칠 것): error 를 구조분해하지 않아 삼키고 있다.
  //   thread_posts 가 없으면 PostgREST 가 PGRST205 를 주는데, posts 는 null 이 되고
  //   아래 `if (!posts?.length)` 가 이를 "수집할 글 없음"으로 오인해 ok:true 를 반환한다.
  //   테이블 부재·권한 오류가 정상 응답으로 위장되므로, error 를 받아 500 으로 올릴 것.
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
