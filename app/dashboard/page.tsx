import { createClient } from '@/lib/supabase/server'
import PostForm, { type ContentItem, type Hypothesis } from './post-form'
import MetricForm, { type PostOption } from './metric-form'
import DraftLinkForm, { type DraftOption } from './draft-link-form'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  let contentItems: ContentItem[] = []
  let hypotheses: Hypothesis[] = []
  let posts: PostOption[] = []
  let drafts: DraftOption[] = []
  let loadError = ''

  if (!supabase) {
    loadError =
      'Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 채우세요.'
  } else {
    const [ci, hy, po, dr] = await Promise.all([
      supabase.from('content_items').select('code, title').order('code'),
      supabase.from('hypotheses').select('code, statement').order('code'),
      // 성과 입력 대상은 발행된 글뿐이다. 초안은 published_at 이 없어 경과 시간을
      // 계산할 수 없고, metric_snapshots 를 붙일 근거도 없다.
      supabase
        .from('posts')
        .select('id, body, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(50),
      // 아직 Threads 게시물과 연결되지 않은 초안.
      supabase
        .from('posts')
        .select('id, body, created_at, notes')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    contentItems = ci.data ?? []
    hypotheses = hy.data ?? []
    posts = po.data ?? []
    drafts = dr.data ?? []

    const errs = [ci.error, hy.error, po.error, dr.error].filter(Boolean)
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
        <h2>2. 미매칭 초안 연결 {drafts.length > 0 && `(${drafts.length})`}</h2>
        {drafts.length === 0 ? (
          <p>연결 대기 중인 초안이 없습니다.</p>
        ) : (
          <DraftLinkForm drafts={drafts} />
        )}
      </section>

      <hr style={{ margin: '2rem 0' }} />

      <section>
        <h2>3. 성과 입력 (수기)</h2>
        <p style={{ fontSize: '.85rem', color: '#666' }}>
          평상시에는 크론(/api/threads/collect-metrics)이 자동 수집합니다. 이 폼은 크론이
          놓친 시점을 사람이 메우는 백업입니다. 같은 시점을 다시 넣으면 덮어씁니다.
        </p>
        {posts.length === 0 ? (
          <p>발행된 글이 없습니다. 위에서 글을 먼저 등록하거나 초안을 연결하세요.</p>
        ) : (
          <MetricForm posts={posts} />
        )}
      </section>
    </main>
  )
}
