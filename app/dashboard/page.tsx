import '../_ds/styles.css'
import { createClient } from '@/lib/supabase/server'
import { Card } from '../_ds/components/Card'
import { Badge } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
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
    <main style={{
      fontFamily: 'var(--font-sans)',
      background: 'var(--bg-app)',
      color: 'var(--text-body)',
      minHeight: '100vh',
      padding: '28px clamp(16px, 4vw, 32px) 56px',
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* 2줄 헤더 */}
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 20,
        }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-strong)', margin: 0 }}>
              발행 기록 대시보드
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              발행한 글을 등록하고, 자동 매칭이 놓친 초안을 잇고, 성과를 손으로 메운다.
            </p>
          </div>
          <a
            href="/agents"
            style={{
              flex: 'none', fontSize: 13, fontWeight: 500, color: 'var(--text-link)',
              textDecoration: 'none', padding: '7px 12px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              background: 'var(--surface-card)',
            }}
          >
            AI 에이전트 진행상황 →
          </a>
        </header>

        {loadError && (
          <div style={{
            background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
            color: 'var(--danger-fg)', padding: '14px 16px', borderRadius: 'var(--radius-lg)',
            fontSize: 14, lineHeight: 1.6, marginBottom: 20, overflowWrap: 'anywhere',
          }}>
            데이터 로드 오류: {loadError}
          </div>
        )}

        <div style={{ display: 'grid', gap: 20 }}>
          <Card
            title="1. 글 등록"
            subtitle="발행한 글을 기록한다. 소재·가설을 붙여 두면 나중에 성과와 엮인다."
          >
            <PostForm contentItems={contentItems} hypotheses={hypotheses} />
          </Card>

          <Card
            title="2. 미매칭 초안 연결"
            subtitle="자동 매처가 못 고른 초안을 실제 게시물에 잇는다."
            action={drafts.length > 0 ? <Badge tone="warning">{drafts.length}건</Badge> : null}
            bodyStyle={drafts.length === 0 ? { padding: 0 } : undefined}
          >
            {drafts.length === 0 ? (
              <EmptyState compact title="연결 대기 중인 초안이 없습니다." />
            ) : (
              <DraftLinkForm drafts={drafts} />
            )}
          </Card>

          <Card
            title="3. 성과 입력 (수기)"
            subtitle={
              <>
                평상시에는 크론(/api/threads/collect-metrics)이 자동 수집합니다. 이 폼은 크론이
                놓친 시점을 사람이 메우는 백업입니다. 같은 시점을 다시 넣으면 덮어씁니다.
              </>
            }
            bodyStyle={posts.length === 0 ? { padding: 0 } : undefined}
          >
            {posts.length === 0 ? (
              <EmptyState
                compact
                title="발행된 글이 없습니다."
                description="위에서 글을 먼저 등록하거나 초안을 연결하세요."
              />
            ) : (
              <MetricForm posts={posts} />
            )}
          </Card>
        </div>
      </div>
    </main>
  )
}
