import { createClient } from '@/lib/supabase/server'
import PostForm, { type ContentItem, type Hypothesis } from './post-form'
import MetricForm, { type PostOption } from './metric-form'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  let contentItems: ContentItem[] = []
  let hypotheses: Hypothesis[] = []
  let posts: PostOption[] = []
  let loadError = ''

  if (!supabase) {
    loadError =
      'Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 채우세요.'
  } else {
    const [ci, hy, po] = await Promise.all([
      supabase.from('content_items').select('code, title').order('code'),
      supabase.from('hypotheses').select('code, statement').order('code'),
      supabase
        .from('posts')
        .select('id, body, published_at')
        .order('published_at', { ascending: false })
        .limit(50),
    ])

    contentItems = ci.data ?? []
    hypotheses = hy.data ?? []
    posts = po.data ?? []

    const errs = [ci.error, hy.error, po.error].filter(Boolean)
    if (errs.length) loadError = errs.map(e => e!.message).join(' / ')
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 800 }}>
      <h1>발행 기록 대시보드</h1>

      {loadError && (
        <p style={{ color: 'red' }}>데이터 로드 오류: {loadError}</p>
      )}

      <section>
        <h2>1. 글 등록</h2>
        <PostForm contentItems={contentItems} hypotheses={hypotheses} />
      </section>

      <hr style={{ margin: '2rem 0' }} />

      <section>
        <h2>2. 성과 입력 (수기)</h2>
        {posts.length === 0 ? (
          <p>등록된 글이 없습니다. 위에서 글을 먼저 등록하세요.</p>
        ) : (
          <MetricForm posts={posts} />
        )}
      </section>
    </main>
  )
}
