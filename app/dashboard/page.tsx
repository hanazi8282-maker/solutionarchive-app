import { createClient } from '@/lib/supabase/server'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../_ds/components/Shell'
import PostForm, { type ContentItem, type Hypothesis } from './post-form'
import MetricForm, { type PostOption } from './metric-form'
import DraftLinkForm, { UnlinkedThreadList, type DraftOption, type UnlinkedThread } from './draft-link-form'
import { ensureValidToken } from '@/lib/threads/token'
import { fetchRecentThreads, LOOKBACK_DAYS } from '@/lib/threads/recent'
import { matchDrafts, rankDraftsFor, classifyUnmatched, OFF_PIPELINE_MAX, type UnmatchedKind } from '@/lib/threads/match'
import { flattenEpisodes, asCandidates, type ColumnRow } from '@/lib/threads/column-episodes'
import { checkThreadPost } from '@/lib/threads/voice-check'
import { PostReviewCard, type PendingPost } from './post-review-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: '발행 연결 수리' }

const oneLine = (s: string | null, n: number) => (s ?? '').replace(/\s+/g, ' ').slice(0, n)
const muted = { margin: 0, fontSize: 12, color: 'var(--text-muted)' } as const

/**
 * 어긋난 연결의 원인 유형 라벨. **새 분류를 만들지 않는다** — 매처 크론이
 * `agent_run_steps` 에 남기는 `classifyUnmatched().kind` 네 값 그대로다(lib/threads/match.ts).
 * 목록을 이 값으로 묶어 각 묶음에 배지를 달면, "왜 이 글이 여기 있나"를 행 위에서 바로 읽는다.
 */
const CAUSE: Record<UnmatchedKind, { label: string; tone: Tone }> = {
  manual_link: { label: '원인 · 닮은 초안은 있는데 매처가 확신 못 함', tone: 'warning' },
  column_episode: { label: '원인 · 1등 후보가 칼럼 연재 편 (posts 행 없음)', tone: 'warning' },
  off_pipeline: { label: '원인 · 어느 후보와도 안 닮음 (파이프라인 외)', tone: 'neutral' },
  undecidable: { label: '원인 · 유사도 비교 자체를 못 함', tone: 'neutral' },
}

/** 원인 라벨 + 그 원인의 목록. 라벨만 다르고 연결 폼은 어느 묶음이든 같다. */
function CauseGroup({ kind, items, intro }: {
  kind: UnmatchedKind
  items: (UnlinkedThread & { kind: UnmatchedKind })[]
  intro?: string
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Badge tone={CAUSE[kind].tone} size="sm">{CAUSE[kind].label} · {items.length}건</Badge>
      </div>
      <UnlinkedThreadList items={items} intro={intro} />
    </div>
  )
}

/** 초안 생성 시각을 KST 분 단위로. 없음과 형식 이상을 가른다(§7.1). */
function kstMinute(iso: string | null | undefined): string {
  if (!iso) return '생성일 없음'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '생성일 형식 이상'
  return new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })
}

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
  //
  // 목록 안에서 다시 네 분류로 갈린다(kind — lib/threads/match.ts classifyUnmatched).
  // 매처 크론이 agent_run_steps 에 남기는 분류와 **같은 함수·같은 후보 집합**으로 계산한다.
  // 다이제스트가 "N건"이라고 하면 이 카드 위쪽 목록에 같은 N건이 떠야 한다.
  let unlinked: (UnlinkedThread & { kind: UnmatchedKind })[] | null = null
  let unlinkedError = ''
  let threadsChecked = 0

  if (!supabase) {
    loadError =
      'Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 채우세요.'
    unlinkedError = 'Supabase 연결이 없어 확인하지 못했습니다.'
    refsError = 'Supabase 연결이 없어 소재·가설 목록을 읽지 못했습니다.'
  } else {
    const [ci, hy, po, dr, ln, cl] = await Promise.all([
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
        .select('id, body, created_at, notes, status, content_code, hook_type, closing_type, reviewed_at, reviewed_by, review_note')
        .in('status', ['draft', 'pending_review'])
        .order('created_at', { ascending: false }),
      // 이미 연결된 Threads id (매처 route.ts 2단계와 같다).
      supabase.from('posts').select('external_id, content_code').not('external_id', 'is', null),
      // 승인된 칼럼의 연재 편. 매처와 같은 후보 집합을 봐야 한다 — 이걸 빼면 칼럼
      // 연재의 발행본이 "파이프라인 외"로 오분류된다(2026-09-16 게시물).
      supabase.from('content_columns').select('id, slug, title, threads').eq('review_status', 'approved'),
    ])

    contentItems = ci.data ?? []
    hypotheses = hy.data ?? []
    posts = po.data ?? []
    drafts = dr.data ?? []
    postsOk = !po.error
    draftsOk = !dr.error

    const errs = [ci.error, hy.error, po.error, dr.error, ln.error, cl.error].filter(Boolean)
    if (errs.length) loadError = errs.map(e => e!.message).join(' / ')
    const refErrs = [ci.error, hy.error].filter(Boolean)
    if (refErrs.length) refsError = `소재·가설 목록을 읽지 못했습니다 (${refErrs.map(e => e!.message).join(' / ')}).`

    // 후보 집합(초안 + 칼럼 연재 편) 중 하나라도 못 읽으면 분류를 신뢰할 수 없다.
    // 빠진 후보를 "안 닮았다"로 읽는 순간 칼럼 발행본이 파이프라인 외로 내려간다(§7.1).
    if (dr.error || ln.error || cl.error) {
      unlinkedError = '초안·기연결 게시물·칼럼 연재 편 중 하나를 읽지 못해 확인하지 못했습니다.'
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
          const linkedCodes = new Set((ln.data ?? []).map(r => r.content_code as string | null).filter(Boolean))
          const threads = recent.data.filter(t => t.id && !linked.has(t.id))
          threadsChecked = recent.data.length
          // 매처와 같은 후보 집합: posts 초안 + 아직 연결 안 된 승인 칼럼 편.
          const episodes = flattenEpisodes((cl.data ?? []) as ColumnRow[]).filter(e => !linkedCodes.has(e.code))
          const episodeCandidates = asCandidates(episodes)
          // 매처가 다음 정각에 스스로 붙일 글은 빼고, 매처가 포기한 글만 올린다.
          const { unmatchedThreads } = matchDrafts(drafts, threads)
          const byId = new Map(drafts.map(d => [d.id, d]))
          unlinked = threads
            .filter(t => unmatchedThreads.includes(t.id))
            .map(t => {
              const info = classifyUnmatched(t, drafts, episodeCandidates)
              return {
                id: t.id,
                text: t.text ?? '',
                permalink: t.permalink ?? null,
                timestamp: t.timestamp ?? null,
                whenKst: t.timestamp
                  ? new Date(t.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                  : '시각 없음',
                kind: info.kind,
                // 분류 근거를 행에 같이 적는다. 사람이 "왜 여기 있나"를 물었을 때
                // 화면만 보고 답할 수 있어야 한다.
                why: info.bestScore !== null
                  ? `1등 후보 ${info.bestFrom === 'episode' ? `칼럼 편 ${info.bestId}` : '초안'} · 유사도 ${info.bestScore.toFixed(3)}`
                    + (info.kind === 'off_pipeline' ? ` (기준 ${OFF_PIPELINE_MAX} 미만)` : '')
                  : info.undecidable === 'no_text' ? '게시물 본문 없음 — 유사도 비교 불가'
                    : '비교 가능한 후보 0건 — 유사도 비교 불가',
                // 점수가 낮아도 전부 고를 수 있어야 한다. 자동 선택도, 여기서 잘라내는 것도
                // 하지 않는다 — 화면이 상위 몇 건만 펼치고 나머지 전체에는 검색으로 닿게 한다
                // (draft-link-form.tsx). 여기서 자르면 순위가 틀렸을 때 우회할 길이 사라진다.
                // ⚠️ 후보는 posts 초안뿐이다 — 칼럼 연재 편은 posts 행이 없어 여기 못 들어온다.
                //    그 편이 1등이면 아래 Notice 가 스테이징 명령을 안내한다.
                candidates: rankDraftsFor(t, drafts).map(({ draftId, score }) => {
                  const d = byId.get(draftId)!
                  return {
                    id: draftId,
                    score,
                    code: d.content_code ?? d.status,
                    createdKst: kstMinute(d.created_at),
                    // 판정 근거로 보여 주고, 동시에 검색 대상이 된다.
                    // ponytail: 본문 앞 90자만 내려보낸다(초안 × 게시물 만큼 복제되는 값이다).
                    //   본문 중간 문구로 찾아야 할 일이 생기면 서버 쪽 검색으로 바꾼다.
                    preview: oneLine(d.body, 90),
                  }
                }),
              }
            })
        }
      }
    }
  }

  // 분류별 목록. unlinked === null(확인 불가)이면 전부 빈 배열이 되므로, 화면에서는
  // 반드시 unlinked === null 분기를 먼저 본다 — 확인 불가를 0건으로 접지 않는다(§7.1).
  const ofKind = (...ks: UnmatchedKind[]) => (unlinked ?? []).filter(u => ks.includes(u.kind))
  // 조치 대상: 바로 연결할 것 + 칼럼 연재 편(posts 스테이징 후 연결).
  const actionable = ofKind('manual_link', 'column_episode')
  const manualLink = ofKind('manual_link')
  const columnEpisode = ofKind('column_episode')
  const offPipeline = ofKind('off_pipeline')
  const undecidable = ofKind('undecidable')
  const asideN = offPipeline.length + undecidable.length

  const pendingN = drafts.filter(d => d.status === 'pending_review').length
  const DRAFT_LIMIT = 50

  // 발행 전 검수 — pending_review 중 아직 결정(reviewed_at) 안 난 것만. 결정된 건
  // 아래 "결정됨" 접이단으로 뺀다(status 는 그대로 pending_review 다 — 승인은 상태를
  // 안 바꾼다, actions.ts 주석 참고). 문체 점검은 읽기 전용 표시일 뿐 필터링하지 않는다 —
  // 통과·확인·오류 세 그룹으로만 나눠 사람이 어디부터 볼지 고르게 한다.
  const pendingReview = drafts.filter((d): d is typeof d & { status: 'pending_review' } => d.status === 'pending_review')
  const toReviewPosts: PendingPost[] = pendingReview
    .filter((d) => !d.reviewed_at)
    .map((d) => ({
      id: d.id, body: d.body ?? '', content_code: d.content_code, hook_type: d.hook_type ?? null,
      closing_type: d.closing_type ?? null, notes: d.notes, created_at: d.created_at,
      check: checkThreadPost(d.body ?? '', d.created_at ?? new Date().toISOString()),
    }))
  const cleanPosts = toReviewPosts.filter((p) => p.check.errors.length === 0 && p.check.warns.length === 0)
  const warnPosts = toReviewPosts.filter((p) => p.check.errors.length === 0 && p.check.warns.length > 0)
  const errorPosts = toReviewPosts.filter((p) => p.check.errors.length > 0)
  const decidedPosts = pendingReview.filter((d) => d.reviewed_at)

  return (
    <PageShell maxWidth={960}>
      <PageHeader
        title="발행 연결 수리"
        subtitle="자동 매칭이 놓친 발행 글을 초안에 잇고, 크론이 놓친 성과를 메운다. 사람이 처리할 일이 위에 있다."
      />

      {loadError && (
        <Notice tone="danger" title="데이터 일부를 읽지 못했습니다 — ‘확인 불가’로 표시된 항목은 0건이 아닙니다.">
          {loadError}
        </Notice>
      )}

      {/* 지금 할 일 — 숫자마다 기준(몇 건 중·어디서 셌나)을 붙인다. 누르면 해당 섹션으로 간다. */}
      <StatGrid min={160}>
        {/* 숫자는 "사람이 조치할 것"만이다(연결 + 칼럼 편 스테이징). 파이프라인 외 게시물과
            판정 불가는 여기서 빼고 캡션에 건수만 남긴다 — 섞으면 매번 경고가 떠서 아무도 안 본다. */}
        <StatTile
          href="#unlinked"
          label="초안에 안 붙은 발행 글"
          tone={unlinked === null ? 'danger' : actionable.length > 0 ? 'warning' : 'success'}
          value={unlinked === null ? '확인 불가' : `${actionable.length}건`}
          caption={unlinked === null
            ? '아래 사유 참고'
            : `최근 ${LOOKBACK_DAYS}일 Threads 게시물 ${threadsChecked}건 중`
              + (asideN > 0 ? ` · 파이프라인 외·판정 불가 ${asideN}건 별도` : '')}
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
        subtitle={`최근 ${LOOKBACK_DAYS}일 Threads 게시물 중 매처가 어떤 초안에도 자동 연결하지 않은 글. 발행 전에 본문을 크게 고쳐 쓰면 여기로 온다. 후보는 초안 + 승인된 칼럼 연재 편이고, 그 어느 것과도 유사도가 ${OFF_PIPELINE_MAX} 미만인 글은 아래 접이단으로 따로 뺀다.`}
        action={
          unlinked === null ? <Badge tone="danger">확인 불가</Badge>
            : actionable.length > 0 ? <Badge tone="warning" dot>처리 필요 {actionable.length}건</Badge>
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
          <div style={{ display: 'grid', gap: 16 }}>
            {actionable.length > 0 ? (
              <>
                <CauseGroup kind="manual_link" items={manualLink} />
                <CauseGroup kind="column_episode" items={columnEpisode} />
                {columnEpisode.length > 0 && (
                  <Notice tone="warning" title={`칼럼 연재 편의 발행본 ${columnEpisode.length}건 — 연결할 초안 행이 아직 없습니다.`}>
                    1등 후보가 <code>COL-…</code> 코드면 그 글의 원본은 <code>content_columns.threads[]</code> 의 연재 편입니다.
                    그 편은 <code>posts</code> 행이 없어 위 드롭다운에 나오지 않습니다. 먼저
                    <code> node --env-file=.env.local scripts/column-threads-stage.mjs --slug &lt;slug&gt; --apply </code>
                    로 편을 발행 대기 초안으로 올린 다음 연결하세요(성과 수집은 <code>posts.status=&apos;published&apos;</code> 만 봅니다).
                  </Notice>
                )}
              </>
            ) : (
              <p style={muted}>
                사람이 연결할 게시물은 없습니다 — 아래 {asideN}건은 파이프라인 산출물로 보이지 않거나 판정할 수 없는 글입니다.
              </p>
            )}

            {/* 파이프라인 외·판정 불가. 경고에서는 뺐지만 사라지게 두지 않는다.
                연결 폼은 그대로 붙어 있다 — 분류가 사람의 판단을 막지 않는다. */}
            {asideN > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
                  파이프라인 외 게시물 {offPipeline.length}건 · 판정 불가 {undecidable.length}건 (조치 대상 아님 — 펼쳐서 확인)
                </summary>
                <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
                  <CauseGroup
                    kind="off_pipeline"
                    items={offPipeline}
                    intro={`초안·칼럼 연재 편 어느 것과도 유사도가 ${OFF_PIPELINE_MAX} 미만이라 파이프라인 산출물의 발행본으로 보기 어려운 글입니다(초안 없이 직접 쓴 글). 그래도 붙일 초안이 있으면 여기서 연결하면 됩니다 — 분류는 참고일 뿐입니다.`}
                  />
                  <CauseGroup
                    kind="undecidable"
                    items={undecidable}
                    intro={'유사도 비교 자체를 못 한 글입니다(게시물 본문 없음 또는 비교 가능한 후보 0건). '
                      + '‘닮은 초안이 없다’가 아니라 ‘닮았는지 볼 수 없다’입니다 — 맞는 초안을 아는 사람이 직접 고르세요.'}
                  />
                </div>
              </details>
            )}
          </div>
        )}
      </Card>

      <Card
        id="review"
        title="발행 전 검수"
        subtitle="본문 전체를 읽고 승인(그대로/수정)·반려한다. 승인해도 발행은 안 된다 — 승인 후 이 내용을 Threads 앱에 직접 붙여 넣는다(CLAUDE.md §10)."
        action={!draftsOk ? <Badge tone="danger">확인 불가</Badge> : <Badge tone={toReviewPosts.length > 0 ? 'warning' : 'success'} dot={toReviewPosts.length > 0}>{toReviewPosts.length}건</Badge>}
        bodyStyle={draftsOk && toReviewPosts.length === 0 && decidedPosts.length === 0 ? { padding: 0 } : undefined}
      >
        {!draftsOk ? (
          <Notice tone="danger">초안 목록을 읽지 못했습니다. 검수할 초안이 없다는 뜻이 아닙니다.</Notice>
        ) : toReviewPosts.length === 0 && decidedPosts.length === 0 ? (
          <EmptyState compact title="검수 대기 중인 초안이 없습니다." />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {cleanPosts.length > 0 && (
              <div>
                <p style={muted}>문체 점검 통과 {cleanPosts.length}건 — 여기부터 보면 됩니다.</p>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 12 }}>
                  {cleanPosts.map((p) => <PostReviewCard key={p.id} post={p} />)}
                </ul>
              </div>
            )}
            {warnPosts.length > 0 && (
              <details open={cleanPosts.length === 0}>
                <summary style={{ cursor: 'pointer', fontSize: 13 }}>확인할 점이 있는 초안 {warnPosts.length}건</summary>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 12 }}>
                  {warnPosts.map((p) => <PostReviewCard key={p.id} post={p} />)}
                </ul>
              </details>
            )}
            {errorPosts.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--danger-fg)' }}>문체 오류가 있는 초안 {errorPosts.length}건 — 고치거나 반려</summary>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 12 }}>
                  {errorPosts.map((p) => <PostReviewCard key={p.id} post={p} />)}
                </ul>
              </details>
            )}
            {decidedPosts.length > 0 && (
              <details>
                {/* 반려는 status 가 discarded 로 바뀌어 이 목록(pending_review만 조회)에서 아예 빠진다.
                    여기 남는 건 승인뿐이다 — pending_review 인 채 reviewed_at 만 찍힌 행. */}
                <summary style={{ cursor: 'pointer', fontSize: 13 }}>승인된 초안 {decidedPosts.length}건 — 게시 대기</summary>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                  {decidedPosts.map((d) => (
                    <li key={d.id} style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                      <Badge tone="success" size="sm">승인</Badge>
                      {' '}{d.content_code ?? '코드 없음'} · {d.reviewed_by ?? '검수자 기록 없음'} · {(d.reviewed_at ?? '').slice(0, 16).replace('T', ' ')}
                      {d.review_note ? ` · ${d.review_note}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
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
