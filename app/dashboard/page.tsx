import { createClient } from '@/lib/supabase/server'
import { Card } from '../_ds/components/Card'
import { Badge } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../_ds/components/Shell'
import PostForm, { type ContentItem, type Hypothesis } from './post-form'
import MetricForm, { type PostOption } from './metric-form'
import DraftLinkForm, { UnlinkedThreadList, type DraftOption, type UnlinkedThread } from './draft-link-form'
import { ensureValidToken } from '@/lib/threads/token'
import { fetchRecentThreads, LOOKBACK_DAYS } from '@/lib/threads/recent'
import { matchDrafts, rankDraftsFor } from '@/lib/threads/match'

export const dynamic = 'force-dynamic'
export const metadata = { title: '발행 기록' }

const oneLine = (s: string | null, n: number) => (s ?? '').replace(/\s+/g, ' ').slice(0, n)

export default async function DashboardPage() {
  const supabase = await createClient()

  let contentItems: ContentItem[] = []
  let hypotheses: Hypothesis[] = []
  let posts: PostOption[] = []
  let drafts: DraftOption[] = []
  let loadError = ''
  // 소재·가설 조회 실패 사유. 있으면 글 등록 폼이 제출을 막는다(선택지가 비어도 "없음"이 아니다).
  let refsError = ''
  // 표시용 플래그. 조회 실패 시 목록이 [] 로 떨어져 "없습니다"로 보이던 것을 가른다(§7.1).
  let draftsOk = false
  let postsOk = false

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
    refsError = 'Supabase 연결이 없어 소재·가설 목록을 읽지 못했습니다.'
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
    postsOk = !po.error
    draftsOk = !dr.error

    const errs = [ci.error, hy.error, po.error, dr.error, ln.error].filter(Boolean)
    if (errs.length) loadError = errs.map(e => e!.message).join(' / ')
    const refErrs = [ci.error, hy.error].filter(Boolean)
    if (refErrs.length) refsError = `소재·가설 목록을 읽지 못했습니다 (${refErrs.map(e => e!.message).join(' / ')}).`

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

  const pendingN = drafts.filter(d => d.status === 'pending_review').length
  const DRAFT_LIMIT = 50

  return (
    <PageShell maxWidth={960}>
      <PageHeader
        title="발행 기록"
        subtitle="자동 매칭이 놓친 발행 글을 초안에 잇고, 크론이 놓친 성과를 메운다. 사람이 처리할 일이 위에 있다."
      />

      {loadError && (
        <Notice tone="danger" title="데이터 일부를 읽지 못했습니다 — ‘확인 불가’로 표시된 항목은 0건이 아닙니다.">
          {loadError}
        </Notice>
      )}

      {/* 지금 할 일 — 숫자마다 기준(몇 건 중·어디서 셌나)을 붙인다. 누르면 해당 섹션으로 간다. */}
      <StatGrid min={160}>
        <StatTile
          href="#unlinked"
          label="초안에 안 붙은 발행 글"
          tone={unlinked === null ? 'danger' : unlinked.length > 0 ? 'warning' : 'success'}
          value={unlinked === null ? '확인 불가' : `${unlinked.length}건`}
          caption={unlinked === null ? '아래 사유 참고' : `최근 ${LOOKBACK_DAYS}일 Threads 게시물 ${threadsChecked}건 중`}
        />
        <StatTile
          href="#drafts"
          label="발행 연결 대기 초안"
          tone={draftsOk ? undefined : 'danger'}
          value={draftsOk ? `${drafts.length}건` : '확인 불가'}
          caption={draftsOk ? `검토 대기 ${pendingN}건 · 작성 중 ${drafts.length - pendingN}건` : '초안 목록을 읽지 못함'}
        />
        <StatTile
          href="#metrics"
          label="성과 입력 가능한 발행 글"
          tone={postsOk ? undefined : 'danger'}
          value={postsOk ? `${posts.length}건` : '확인 불가'}
          caption={postsOk ? (posts.length >= 50 ? '최근 발행 50건까지만 불러옴' : '발행 완료로 기록된 글 전체') : '발행 글 목록을 읽지 못함'}
        />
      </StatGrid>
      {/* 전일 대비를 붙이지 않은 이유. 되짚을 수 없는 값을 0·"변화 없음"으로 채우지 않는다(§7.1). */}
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>
        전일 대비 없음 — 세 숫자 모두 어제 이 시각 값을 되짚을 기록이 없다. 안 붙은 발행 글은 Threads 실시간 조회라 과거 값이 없고,
        초안·발행 글 수는 글 상태가 바뀐 시각이 남지 않는다(발행일시는 Threads 게시 시각이지 초안에 연결된 시각이 아니다).
      </p>

      <Card
        id="unlinked"
        title="초안에 안 붙은 발행 글"
        subtitle={`최근 ${LOOKBACK_DAYS}일 Threads 게시물 중 매처가 어떤 초안에도 자동 연결하지 않은 글. 발행 전에 본문을 크게 고쳐 쓰면 여기로 온다.`}
        action={
          unlinked === null ? <Badge tone="danger">확인 불가</Badge>
            : unlinked.length > 0 ? <Badge tone="warning" dot>처리 필요 {unlinked.length}건</Badge>
              : <Badge tone="success">0건</Badge>
        }
        bodyStyle={unlinked?.length === 0 ? { padding: 0 } : undefined}
      >
        {unlinked === null ? (
          <Notice tone="danger" title="확인하지 못했습니다 — 0건이라는 뜻이 아닙니다.">{unlinkedError}</Notice>
        ) : unlinked.length === 0 ? (
          <EmptyState
            compact
            title="초안에 안 붙은 발행 글 없음 ✓"
            description={`최근 ${LOOKBACK_DAYS}일 게시물 ${threadsChecked}건을 확인했습니다.`}
          />
        ) : (
          <UnlinkedThreadList items={unlinked} />
        )}
      </Card>

      <Card
        id="drafts"
        title="게시물 ID로 직접 연결"
        subtitle={`위 목록에 안 뜨는 글(${LOOKBACK_DAYS}일이 지난 글 등)을 초안에 손으로 잇는다.`}
        action={draftsOk ? <Badge tone="neutral">{drafts.length}건</Badge> : <Badge tone="danger">확인 불가</Badge>}
        bodyStyle={draftsOk && drafts.length === 0 ? { padding: 0 } : undefined}
      >
        {!draftsOk ? (
          <Notice tone="danger">초안 목록을 읽지 못했습니다. 연결 대기 초안이 없다는 뜻이 아닙니다.</Notice>
        ) : drafts.length === 0 ? (
          <EmptyState compact title="연결 대기 중인 초안이 없습니다." />
        ) : (
          // 초안마다 입력 폼이 하나씩 붙어 길다. 위 "안 붙은 글" 경로가 우선이라 기본은 접어 둔다.
          <details className="dgy-details">
            <summary>
              초안 {Math.min(drafts.length, DRAFT_LIMIT)}건 펼치기
              {drafts.length > DRAFT_LIMIT ? ` (전체 ${drafts.length}건 중 최근 ${DRAFT_LIMIT}건)` : ''}
            </summary>
            <div style={{ marginTop: 12 }}>
              {/* ponytail: 최근 50건만 보여준다. 더 오래된 초안이 필요해지면 검색을 붙인다. */}
              <DraftLinkForm drafts={drafts.slice(0, DRAFT_LIMIT)} />
            </div>
          </details>
        )}
      </Card>

      <Card
        id="post"
        title="발행 글 직접 등록"
        subtitle="발행한 글을 기록한다. 소재·가설을 붙여 두면 나중에 성과와 엮인다."
      >
        <details className="dgy-details">
          <summary>등록 폼 열기</summary>
          <div style={{ marginTop: 12 }}>
            <PostForm contentItems={contentItems} hypotheses={hypotheses} refsError={refsError || null} />
          </div>
        </details>
      </Card>

      <Card
        id="metrics"
        title="성과 수기 입력 (백업)"
        subtitle={
          <>
            평상시에는 크론(<code>/api/threads/collect-metrics</code>)이 자동 수집한다. 크론이 놓친 시점을
            사람이 메우는 백업이며, 같은 시점을 다시 넣으면 덮어쓴다.
          </>
        }
        action={postsOk ? null : <Badge tone="danger">확인 불가</Badge>}
        bodyStyle={postsOk && posts.length === 0 ? { padding: 0 } : undefined}
      >
        {!postsOk ? (
          <Notice tone="danger">발행 글 목록을 읽지 못했습니다. 발행 글이 없다는 뜻이 아닙니다.</Notice>
        ) : posts.length === 0 ? (
          <EmptyState
            compact
            title="발행된 글이 없습니다."
            description="위에서 초안을 연결하거나 글을 등록하면 여기서 고를 수 있습니다."
          />
        ) : (
          <details className="dgy-details">
            <summary>입력 폼 열기</summary>
            <div style={{ marginTop: 12 }}>
              <MetricForm posts={posts} />
            </div>
          </details>
        )}
      </Card>
    </PageShell>
  )
}
