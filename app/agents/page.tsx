import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../_ds/components/Shell'
import {
  LOOPS, classify, renderStepBar, isStale, staleMinutes, truncate, cronToLabel,
  UNAVAILABLE_TEXT, EMPTY_TEXT, PULL_GRACE_MS, nextDailyFire, pullState,
  type Classified, type LoopDef, type Step,
} from '@/lib/agents/status'

export const dynamic = 'force-dynamic'
export const metadata = { title: '에이전트' }

// 읽기 전용 화면이다. 이 파일에 DB 쓰기 호출을 넣지 마라 — select 만 쓴다.

type LoopCard = {
  def: LoopDef
  cls: Classified
  headline: string | null
  status: string | null   // 배지 색만 정한다. 문구는 headline 이 정본이다.
  dryRun: boolean
  bar: string
  barLabel: string
  startedAt: string | null
  finishedAt: string | null
  stale: boolean
  staleMin: number
  note: string | null
  /** 실행 로그가 아닌 루프(노션: 페이지당 1행)는 시각 라벨이 다르다. 없으면 시작/종료. */
  timeLabels?: [string, string]
  /** finishedAt 이 없을 때의 문구. 없으면 '진행중'. */
  pendingEnd?: string
  /** stale(running 미갱신)과 다른 경고. 있으면 경고 배지 + 본문 안내. */
  warn?: string | null
}

type Supa = NonNullable<Awaited<ReturnType<typeof createClient>>>

const parse = (iso?: string | null) => Date.parse(iso ?? '') || 0

const blank = (def: LoopDef, cls: Classified): LoopCard => ({
  def, cls, headline: null, status: null, dryRun: false, bar: '', barLabel: '',
  startedAt: null, finishedAt: null, stale: false, staleMin: 0, note: cls.detail,
})

const def = (key: string) => LOOPS.find((l) => l.key === key)!

async function loadCmo(sb: Supa, now: number): Promise<LoopCard> {
  const d = def('cmo')
  const runs = await sb.from(d.table)
    .select('id,run_key,dept,status,dry_run,started_at,finished_at')
    .eq('dept', d.deptFilter!)
    .order('started_at', { ascending: false })
    .limit(1)
  const cls = classify({ error: runs.error, rows: runs.data })
  if (cls.state !== 'OK') return blank(d, cls)

  const run = runs.data![0]
  const st = await sb.from('agent_run_steps')
    .select('seq,step_key,status,blocker,detail,started_at,updated_at')
    .eq('run_id', run.id)
  const steps: Step[] = st.error ? [] : (st.data ?? [])
  const lastTouch = (st.data ?? []).reduce(
    (acc: number, s: { updated_at?: string; started_at?: string }) =>
      Math.max(acc, parse(s.updated_at ?? s.started_at)),
    Math.max(parse(run.finished_at), parse(run.started_at)),
  )
  const bad = (st.data ?? []).filter((s: { status?: string }) => s.status === 'failed' || s.status === 'blocked')
  const okN = steps.filter((s) => s.status === 'ok').length

  return {
    def: d, cls,
    headline: `${run.status} · ${okN}/${steps.length} 스텝 · ${run.run_key}${run.dry_run ? ' · dry-run' : ''}`,
    status: run.status, dryRun: !!run.dry_run,
    bar: renderStepBar(steps),
    barLabel: st.error ? `스텝 확인 불가 — ${truncate(st.error.message)}` : '스텝',
    startedAt: run.started_at, finishedAt: run.finished_at,
    stale: isStale(run.status, lastTouch, now), staleMin: staleMinutes(lastTouch, now),
    note: bad.length
      ? bad.map((s: { step_key: string; status: string; blocker?: string | null; detail?: unknown }) =>
          `${s.status === 'blocked' ? '▲' : '✕'} ${s.step_key} — ${truncate(s.blocker ?? (s.detail as { error?: string } | null)?.error ?? '사유 미기록')}`).join(' / ')
      : null,
  }
}

async function loadInsight(sb: Supa, now: number): Promise<LoopCard> {
  const d = def('insight')
  const res = await sb.from(d.table)
    .select('started_at,finished_at,ok,error,steps,dry_run,analyzed_count,pattern_count')
    .order('started_at', { ascending: false })
    .limit(1)
  const cls = classify({ error: res.error, rows: res.data })
  if (cls.state !== 'OK') return blank(d, cls)

  const r = res.data![0]
  const raw = Array.isArray(r.steps) ? (r.steps as { name?: string; ok?: boolean; detail?: { skipped?: boolean } }[]) : []
  const steps: Step[] = raw.map((s, i) => ({
    seq: i,
    status: s.ok === false ? 'failed' : s.detail?.skipped ? 'skipped' : 'ok',
  }))
  const status = r.finished_at ? (r.ok ? 'ok' : 'failed') : 'running'

  return {
    def: d, cls,
    headline: `${status} · 분석 ${r.analyzed_count ?? 0}건 · 패턴 ${r.pattern_count ?? 0}건${r.dry_run ? ' · dry-run' : ''}`,
    status, dryRun: !!r.dry_run,
    bar: renderStepBar(steps),
    barLabel: raw.length ? `스텝(${raw.map((s) => s.name ?? '?').join('·')})` : '스텝 기록 없음',
    startedAt: r.started_at, finishedAt: r.finished_at,
    stale: isStale(status, Math.max(parse(r.finished_at), parse(r.started_at)), now),
    staleMin: staleMinutes(Math.max(parse(r.finished_at), parse(r.started_at)), now),
    note: r.error ? `✕ ${truncate(r.error)}` : null,
  }
}

async function loadReview(sb: Supa, now: number): Promise<LoopCard> {
  const d = def('review')
  const res = await sb.from(d.table)
    .select('source_key,started_at,finished_at,status,error,new_reviews,dry_run')
    .order('started_at', { ascending: false })
    .limit(5)
  const cls = classify({ error: res.error, rows: res.data })
  if (cls.state !== 'OK') return blank(d, cls)

  const rows = res.data!
  const r = rows[0]
  const status = r.finished_at ? r.status : 'running'
  const src = await sb.from('review_sources').select('key,enabled,health,disabled_reason')
  const srcCls = classify({ error: src.error, rows: src.data })
  const srcLine = srcCls.state === 'OK'
    ? (src.data ?? []).map((s: { key: string; enabled: boolean; health: string }) =>
        `${s.key}${s.enabled ? '' : '(비활성)'}:${s.health}`).join(' · ')
    : `소스 ${UNAVAILABLE_TEXT[srcCls.reason ?? 'query_failed']}`

  return {
    def: d, cls,
    headline: `${status} · ${r.source_key} · 신규 ${r.new_reviews ?? 0}건${r.dry_run ? ' · dry-run' : ''}`,
    status, dryRun: !!r.dry_run,
    bar: renderStepBar(rows.map((x: { status?: string; finished_at?: string | null }, i: number) =>
      ({ seq: i, status: x.finished_at ? x.status : 'running' }))),
    barLabel: '최근 실행 5회(좌=최신)',
    startedAt: r.started_at, finishedAt: r.finished_at,
    stale: isStale(status, Math.max(parse(r.finished_at), parse(r.started_at)), now),
    staleMin: staleMinutes(Math.max(parse(r.finished_at), parse(r.started_at)), now),
    note: `소스 ${srcLine}${r.error ? ` / ✕ ${truncate(r.error)}` : ''}`,
  }
}

const DIFF_LABEL: Record<string, string> = { unchanged: '무변경', edited: '편집됨', adopted: '채택', held: '보류' }

// notion_sync_log 는 실행 로그가 아니라 페이지당 1행이다. pulled_at NULL 은 "진행중인 실행"이 아니라
// "밤 풀백이 아직 안 읽은 페이지"다 — 풀백은 사람을 기다리지 않으므로 예정 시각+유예가 지나면 경고다.
async function loadNotion(sb: Supa, now: number): Promise<LoopCard> {
  const d = def('notion')
  const [res, pend] = await Promise.all([
    sb.from(d.table)
      .select('pushed_at,pulled_at,diff_status')
      .order('pushed_at', { ascending: false })
      .limit(5),
    // 미회수는 최근 5건이 아니라 전체에서 센다 — 풀백 스크립트도 pulled_at IS NULL 전체를 집는다.
    sb.from(d.table).select('pushed_at').is('pulled_at', null).order('pushed_at', { ascending: true }),
  ])
  const cls = classify({ error: res.error, rows: res.data })
  if (cls.state !== 'OK') return blank(d, cls)

  const rows = res.data!
  const r = rows[0]
  const kst = (ms: number | null) => (ms ? `${KST_FMT.format(ms)} KST` : '시각 모름')

  let pendingLine: string
  let warn: string | null = null
  if (pend.error || !pend.data) {
    pendingLine = `미회수 건수 확인 불가${pend.error ? ` — ${truncate(pend.error.message)}` : ''}`
  } else {
    const states = pend.data.map((x: { pushed_at: string }) => pullState(parse(x.pushed_at), now, d.cronExpr))
    const overdue = states.filter((s) => s === 'overdue').length
    const unknown = states.filter((s) => s === 'unknown').length
    pendingLine = [
      `밤 풀백 대기 ${states.length - overdue - unknown}건`,
      overdue ? `풀백 지났는데 미회수 ${overdue}건` : null,
      unknown ? `회수 예정 판정 불가 ${unknown}건` : null,
    ].filter(Boolean).join(' · ')
    if (overdue) {
      warn = `예정 풀백(${cronToLabel(d.cronExpr)}) 뒤 ${PULL_GRACE_MS / 3_600_000}시간 유예까지 지났는데 회수되지 않은 페이지 ${overdue}건 `
        + `(가장 오래된 푸시 ${kst(parse(pend.data[0].pushed_at))}). 풀백은 사람 피드백을 기다리지 않는다 — `
        + `Notion 읽기 실패 · DB 갱신 실패 · 워크플로 미실행 중 하나다. ${d.workflow} 실행 로그를 확인한다.`
    }
  }

  const latestState = r.pulled_at ? null : pullState(parse(r.pushed_at), now, d.cronExpr)

  return {
    def: d, cls,
    headline: `최근 페이지 ${r.pulled_at ? `회수됨 · ${DIFF_LABEL[r.diff_status] ?? r.diff_status ?? '분류 없음'}` : '회수 전'} · ${pendingLine}`,
    status: null, dryRun: false,
    bar: renderStepBar(rows.map((x: { pulled_at?: string | null }, i: number) => ({ seq: i, status: x.pulled_at ? 'ok' : 'pending' }))),
    barLabel: '최근 푸시한 페이지 5건 회수 여부(좌=최신 · ● 회수 · ○ 미회수)',
    startedAt: r.pushed_at, finishedAt: r.pulled_at,
    timeLabels: ['최근 푸시', '회수'],
    pendingEnd: latestState === 'overdue'
      ? '안 됨 — 예정 풀백이 지났다'
      : latestState === 'waiting'
        ? `대기 — ${kst(nextDailyFire(d.cronExpr, parse(r.pushed_at)))} 밤 풀백 예정`
        : '대기 — 풀백 예정 시각 판정 불가',
    stale: false, staleMin: 0,
    note: null,
    warn,
  }
}

// 사람 대기함 한 칸. count 를 못 받으면(에러 없이 null 이어도) 확인 불가다.
async function countOf(sb: Supa, table: string, apply: (q: ReturnType<Supa['from']>) => unknown) {
  const res = await (apply(sb.from(table)) as Promise<{ error: { code?: string; message?: string } | null; count: number | null }>)
  return { cls: classify({ error: res.error, count: res.count }), count: res.count ?? 0 }
}

// ── 프레젠테이션 (Dothegy Works Design System) ────────────────────────────
// color = signal. 상태 어휘 → tone. blocked 는 amber다 — 안전장치가 걸린 것이지 사고가 아니다.
const STATUS_TONE: Record<string, Tone> = {
  ok: 'success', running: 'info', failed: 'danger', blocked: 'warning',
}
const STATUS_LABEL: Record<string, string> = {
  ok: '정상', running: '실행중', failed: '실패', blocked: '막힘',
}

const mono: CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }
const wrap: CSSProperties = { overflowWrap: 'anywhere' }
const inset: CSSProperties = {
  margin: '12px 0 0', fontSize: 13, lineHeight: 1.55,
  background: 'var(--surface-muted)', color: 'var(--text-body)',
  padding: '8px 10px', borderRadius: 'var(--radius-md)', ...wrap,
}

// 운영자는 한국에 있다. 표시는 KST + 상대 시각, 정밀한 UTC 원문은 title 에 둔다.
const KST_FMT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
function When({ iso, now }: { iso: string | null | undefined; now: number }) {
  const t = parse(iso)
  if (!t) return <>—</>
  const mins = Math.floor((now - t) / 60000)
  const rel = mins < 1 ? '방금' : mins < 60 ? `${mins}분 전` : mins < 48 * 60 ? `${Math.floor(mins / 60)}시간 전` : `${Math.floor(mins / 1440)}일 전`
  return (
    <time dateTime={new Date(t).toISOString()} title={`${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`}>
      {KST_FMT.format(t)} KST ({rel})
    </time>
  )
}

function StatusBadges({ c }: { c: LoopCard }) {
  const badges: ReactNode[] = []
  if (c.cls.state === 'UNAVAILABLE') {
    badges.push(<Badge key="s" tone="danger">확인 불가</Badge>)
  } else if (c.cls.state === 'EMPTY') {
    badges.push(<Badge key="s" tone="neutral" dot>기록 0건</Badge>)
  } else if (c.status) {
    badges.push(
      <Badge key="s" tone={STATUS_TONE[c.status] ?? 'neutral'} dot>
        {STATUS_LABEL[c.status] ?? c.status}
      </Badge>,
    )
  } else {
    badges.push(<Badge key="s" tone="neutral" dot>조회 정상</Badge>)
  }
  if (c.stale) badges.push(<Badge key="stale" tone="warning" size="sm">응답 없음</Badge>)
  if (c.warn) badges.push(<Badge key="warn" tone="warning" size="sm">풀백 지남·미회수</Badge>)
  if (c.dryRun) badges.push(<Badge key="dry" tone="neutral" size="sm">dry-run</Badge>)
  if (!c.def.scheduleActive) badges.push(<Badge key="sch" tone="neutral" size="sm">스케줄 비활성</Badge>)
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>{badges}</div>
}

function LoopSubtitle({ d }: { d: LoopDef }) {
  return (
    <span style={wrap}>
      {cronToLabel(d.cronExpr)}
      {d.scheduleActive
        ? ' · 스케줄 활성'
        : <b style={{ color: 'var(--warning-fg)' }}> · 자동 스케줄 비활성 (수동 실행만)</b>}
      <br />
      <code style={{ ...mono, fontSize: 12 }}>{d.table}</code> · {d.workflow}
    </span>
  )
}

export default async function AgentsPage() {
  // 이건 클라이언트 컴포넌트가 아니라 async 서버 컴포넌트다. 요청마다 한 번
  // 서버에서 실행되고 재렌더가 없으므로 "재렌더할 때마다 값이 흔들린다"는
  // 이 규칙의 전제가 성립하지 않는다.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const sb = await createClient()

  let cards: LoopCard[]
  let queue: {
    posts: { cls: Classified; count: number }
    cases: { cls: Classified; count: number }
    research: { cls: Classified; count: number }
    // null = 조회 실패. 전에는 0 으로 접혀 "초과 없음"과 구분되지 않았다(§7.1).
    stuck: number | null
  } | null = null

  if (!sb) {
    const cls: Classified = { state: 'UNAVAILABLE', reason: 'env_missing', detail: null }
    cards = LOOPS.map((d) => blank(d, cls))
  } else {
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const [cmo, insight, review, notion, posts, cases, research, stuckRes] = await Promise.all([
      loadCmo(sb, now), loadInsight(sb, now), loadReview(sb, now), loadNotion(sb, now),
      countOf(sb, 'posts', (q) => q.select('id', { count: 'exact' }).eq('status', 'pending_review').limit(1)),
      countOf(sb, 'case_studies', (q) => q.select('id', { count: 'exact' }).eq('review_status', 'draft').limit(1)),
      // 미해소 = 아직 사람/루프가 닫지 않은 것. done·failed 는 닫힌 것으로 본다.
      countOf(sb, 'research_queue', (q) => q.select('id', { count: 'exact' }).not('status', 'in', '(done,failed)').limit(1)),
      sb.from('research_queue').select('id', { count: 'exact' }).eq('status', 'claimed').lt('created_at', dayAgo).limit(1),
    ])
    cards = [cmo, insight, review, notion]
    queue = { posts, cases, research, stuck: stuckRes.error || stuckRes.count == null ? null : stuckRes.count }
  }

  const total = cards.length
  const naN = cards.filter((c) => c.cls.state === 'UNAVAILABLE').length
  const runningN = cards.filter((c) => c.headline?.startsWith('running')).length
  const badN = cards.filter((c) => c.status === 'failed' || c.status === 'blocked').length
  const staleN = cards.filter((c) => c.stale).length
  // 확인 불가 루프는 실패·실행중 집계에서 빠진다. 그걸 숫자 옆에 적지 않으면 0 이 "문제 없음"으로 읽힌다.
  const readN = total - naN
  const scope = naN === 0 ? `루프 ${total}개 중` : `조회된 ${readN}개 중 (확인 불가 ${naN}개 제외)`
  const counted = (n: number) => (readN === 0 ? '—' : n)

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        title="AI 에이전트 진행상황"
        subtitle={<>읽기 전용 · <When iso={new Date(now).toISOString()} now={now} /> 조회 · 새로고침하면 다시 읽는다</>}
      />

      {!sb && (
        <Notice tone="danger" title={UNAVAILABLE_TEXT.env_missing}>
          NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어 아래 카드는 <b>하나도 조회되지 않았다</b>.
          이것은 &ldquo;실행이 없었다&rdquo;는 뜻이 아니다.
        </Notice>
      )}

      {/* 막힌 루프가 먼저 보이게 — 실패·막힘과 응답 없음이 앞, 확인 불가는 별도 칸. */}
      <StatGrid min={160}>
        <StatTile label="실패·막힘" value={counted(badN)} tone={badN > 0 ? 'danger' : undefined} caption={scope} href="#loops" />
        <StatTile label="응답 없음 (5분+)" value={counted(staleN)} tone={staleN > 0 ? 'warning' : undefined} caption={scope} href="#loops" />
        <StatTile label="실행 중" value={counted(runningN)} tone={runningN > 0 ? 'info' : undefined} caption={scope} href="#loops" />
        <StatTile label="확인 불가" value={naN} tone={naN > 0 ? 'danger' : undefined} caption={`루프 ${total}개 중`} href="#loops" />
      </StatGrid>

      {/* 사람 대기함 — 에이전트가 만들고 사람 결정을 기다리는 것. */}
      <Card
        id="queue"
        title="사람 대기함"
        subtitle="에이전트가 만들어 두고 사람 결정을 기다리는 항목"
        bodyStyle={{ padding: 0 }}
      >
        {!queue ? (
          <EmptyState compact title={UNAVAILABLE_TEXT.env_missing}
            description="대기함 건수를 조회하지 못했다. 0건이라는 뜻이 아니다." />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[
              {
                label: '승인 대기 초안', sub: 'posts · pending_review', x: queue.posts,
                extra: <a href="/dashboard#drafts" style={{ fontSize: 13 }}>발행 기록에서 처리 →</a> as ReactNode,
              },
              { label: '승인 대기 케이스', sub: 'case_studies · draft', x: queue.cases, extra: null as ReactNode },
              {
                label: '미해소 조사 큐', sub: 'research_queue · done·failed 제외', x: queue.research,
                extra: queue.stuck === null
                  ? <Badge tone="danger" size="sm">claimed 24시간 초과 건수 확인 불가</Badge>
                  : queue.stuck > 0
                    ? <Badge tone="danger" size="sm">claimed 인 채 24시간 초과 {queue.stuck}건</Badge>
                    : null,
              },
            ].map((row, i) => (
              <li key={row.sub} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8, minHeight: 'var(--row-h)',
                padding: '12px 20px', borderTop: i ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', ...wrap }}>{row.label}</div>
                  <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', ...wrap }}>{row.sub}</div>
                  {row.extra && <div style={{ marginTop: 6 }}>{row.extra}</div>}
                </div>
                <div style={{ textAlign: 'right', ...wrap }}>{cell(row.x)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 루프 카드 */}
      <section id="loops" aria-labelledby="loops-title" style={{ display: 'grid', gap: 12 }}>
        <div>
          <h2 id="loops-title" style={{ margin: 0, fontSize: 'var(--fs-h3)', fontWeight: 600, color: 'var(--text-strong)' }}>
            무인 루프 {total}개
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', ...wrap }}>
            스텝 기호 <span style={mono}>●</span> 완료 · <span style={mono}>◐</span> 진행 ·{' '}
            <span style={mono}>○</span> 대기·건너뜀 · <span style={mono}>✕</span> 실패 · <span style={mono}>▲</span> 막힘
          </p>
        </div>

        {cards.map((c) => (
          <Card
            key={c.def.key}
            title={c.def.label}
            subtitle={<LoopSubtitle d={c.def} />}
            action={<StatusBadges c={c} />}
            style={c.cls.state === 'UNAVAILABLE' ? { background: 'var(--surface-muted)' } : undefined}
            bodyStyle={{ padding: '16px 20px' }}
          >
            {c.cls.state === 'UNAVAILABLE' && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', ...wrap }}>
                {UNAVAILABLE_TEXT[c.cls.reason ?? 'query_failed']}
                {c.cls.detail && <span> — {c.cls.detail}</span>}
              </p>
            )}

            {c.cls.state === 'EMPTY' && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', ...wrap }}>{EMPTY_TEXT}</p>
            )}

            {c.cls.state === 'OK' && (
              <>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-strong)', fontWeight: 500, ...wrap }}>
                  {c.headline}
                </p>

                <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, margin: '10px 0 0' }}>
                  <span
                    aria-label={`스텝 진행 ${c.bar || '없음'}`}
                    style={{ ...mono, fontSize: 18, letterSpacing: '0.12em', color: 'var(--text-strong)', ...wrap }}
                  >
                    {c.bar || '(스텝 없음)'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', ...wrap }}>{c.barLabel}</span>
                </div>

                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', ...wrap }}>
                  {c.timeLabels?.[0] ?? '시작'} <When iso={c.startedAt} now={now} /> · {c.timeLabels?.[1] ?? '종료'}{' '}
                  {c.finishedAt ? <When iso={c.finishedAt} now={now} /> : (c.pendingEnd ?? '진행중')}
                </p>

                {c.stale && (
                  <Notice tone="warning" style={{ marginTop: 12 }}>
                    응답 없음 — running 인 채 {c.staleMin}분 미갱신. 돌고 있는 게 아니라 죽었을 수 있다.
                  </Notice>
                )}

                {c.warn && <Notice tone="warning" style={{ marginTop: 12 }}>{c.warn}</Notice>}

                {c.note && <p style={inset}>{c.note}</p>}
              </>
            )}
          </Card>
        ))}
      </section>
    </PageShell>
  )
}

function cell(x: { cls: Classified; count: number }) {
  if (x.cls.state === 'UNAVAILABLE') {
    return <span style={{ fontSize: 13, color: 'var(--danger-fg)' }}>{UNAVAILABLE_TEXT[x.cls.reason ?? 'query_failed']}</span>
  }
  if (x.cls.state === 'EMPTY') return <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>0건 (조회 정상)</span>
  return (
    <b style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)' }}>
      {x.count}건
    </b>
  )
}
