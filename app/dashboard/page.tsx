import '../_ds/styles.css'
import { createClient } from '@/lib/supabase/server'
import { Card } from '../_ds/components/Card'
import { Badge } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
import PostForm, { type ContentItem, type Hypothesis } from './post-form'
import MetricForm, { type PostOption } from './metric-form'
import DraftLinkForm, { UnlinkedThreadList, type DraftOption, type UnlinkedThread } from './draft-link-form'
import { ensureValidToken } from '@/lib/threads/token'
import { fetchRecentThreads, LOOKBACK_DAYS } from '@/lib/threads/recent'
import { matchDrafts, rankDraftsFor } from '@/lib/threads/match'

export const dynamic = 'force-dynamic'

const oneLine = (s: string | null, n: number) => (s ?? '').replace(/\s+/g, ' ').slice(0, n)

export default async function DashboardPage() {
  const supabase = await createClient()

  let contentItems: ContentItem[] = []
  let hypotheses: Hypothesis[] = []
  let posts: PostOption[] = []
  let drafts: DraftOption[] = []
  let loadError = ''

  // "발행됐는데 어떤 초안에도 안 붙은 게시물". 3상태(§7.1):
  //   null = 확인 불가(사유 unlinkedError) / [] = 확인했고 없음 / [..] = 있음
  // 매처 크론은 이런 글을 200 응답의 skipped 에만 남기고 아무도 보지 않는다.
  let unlinked: UnlinkedThread[] | null = null
  let unlinkedError = ''
  let threadsChecked = 0

  if (!supabase) {
    loadError =
      'Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 채우세요.'
    unlinkedError = 'Supabase 연결이 없어 확인하지 못했습니다.'
  } else {
    const [ci, hy, po, dr, ln] = await Promise.all([
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
      // 아직 Threads 게시물과 연결되지 않은 초안. 매처와 같은 상태·같은 범위(제한 없음)로
      // 읽는다 — 범위가 다르면 크론이 붙일 글을 화면이 "안 붙은 글"로 잘못 띄운다.
      supabase
        .from('posts')
        .select('id, body, created_at, notes, status, content_code')
        .in('status', ['draft', 'pending_review'])
        .order('created_at', { ascending: false }),
      // 이미 연결된 Threads id (매처 route.ts 2단계와 같다).
      supabase.from('posts').select('external_id').not('external_id', 'is', null),
    ])

    contentItems = ci.data ?? []
    hypotheses = hy.data ?? []
    posts = po.data ?? []
    drafts = dr.data ?? []

    const errs = [ci.error, hy.error, po.error, dr.error, ln.error].filter(Boolean)
    if (errs.length) loadError = errs.map(e => e!.message).join(' / ')

    if (dr.error || ln.error) {
      unlinkedError = '초안 또는 기연결 게시물 조회에 실패해 확인하지 못했습니다.'
    } else {
      // ensureValidToken 은 DB 조회 실패도 null 로 돌려준다 — "토큰 없음"으로 단정하지 않는다.
      const creds = await ensureValidToken()
      if (!creds) {
        unlinkedError = 'Threads 토큰을 읽지 못했습니다(만료·미등록 또는 DB 조회 실패). 서버 로그 [threads] 를 확인하세요.'
      } else {
        const recent = await fetchRecentThreads(creds.accessToken)
        if (!recent.ok) {
          unlinkedError = `Threads 게시물 조회 실패 (HTTP ${recent.status}).`
        } else {
          const linked = new Set((ln.data ?? []).map(r => r.external_id as string))
          const threads = recent.data.filter(t => t.id && !linked.has(t.id))
          threadsChecked = recent.data.length
          // 매처가 다음 정각에 스스로 붙일 글은 빼고, 매처가 포기한 글만 올린다.
          const { unmatchedThreads } = matchDrafts(drafts, threads)
          const byId = new Map(drafts.map(d => [d.id, d]))
          unlinked = threads
            .filter(t => unmatchedThreads.includes(t.id))
            .map(t => ({
              id: t.id,
              text: t.text ?? '',
              permalink: t.permalink ?? null,
              timestamp: t.timestamp ?? null,
              whenKst: t.timestamp
                ? new Date(t.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                : '시각 없음',
              // 점수가 낮아도 전부 고를 수 있어야 한다. 자동 선택은 하지 않는다.
              candidates: rankDraftsFor(t, drafts).map(({ draftId, score }) => {
                const d = byId.get(draftId)!
                return {
                  id: draftId,
                  label: `${score.toFixed(3)} · ${d.content_code ?? d.status} · ${oneLine(d.body, 40)}`,
                }
              }),
            }))
        }
      }
    }
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
            title="2. 발행됐는데 초안에 안 붙은 게시물"
            subtitle={`최근 ${LOOKBACK_DAYS}일 Threads 게시물 중 매처가 어떤 초안에도 자동 연결하지 않은 글. 발행 전에 본문을 크게 고쳐 쓰면 여기로 온다.`}
            action={
              unlinked === null ? <Badge tone="danger">확인 불가</Badge>
                : unlinked.length > 0 ? <Badge tone="warning">{unlinked.length}건</Badge>
                  : null
            }
            bodyStyle={unlinked?.length === 0 ? { padding: 0 } : undefined}
          >
            {unlinked === null ? (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--danger-fg)', overflowWrap: 'anywhere' }}>
                {unlinkedError}
              </p>
            ) : unlinked.length === 0 ? (
              <EmptyState compact title={`초안에 안 붙은 게시물이 없습니다 (최근 ${LOOKBACK_DAYS}일 게시물 ${threadsChecked}건 확인).`} />
            ) : (
              <UnlinkedThreadList items={unlinked} />
            )}
          </Card>

          <Card
            title="3. 게시물 ID 직접 입력"
            subtitle={`위 목록에 안 뜨는 글(${LOOKBACK_DAYS}일이 지난 글 등)을 초안에 손으로 잇는다.`}
            bodyStyle={drafts.length === 0 ? { padding: 0 } : undefined}
          >
            {drafts.length === 0 ? (
              <EmptyState compact title="연결 대기 중인 초안이 없습니다." />
            ) : (
              // ponytail: 최근 50건만 보여준다. 더 오래된 초안이 필요해지면 검색을 붙인다.
              <DraftLinkForm drafts={drafts.slice(0, 50)} />
            )}
          </Card>

          <Card
            title="4. 성과 입력 (수기)"
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
