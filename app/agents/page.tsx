import './_ds/styles.css'
import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card } from './_ds/components/Card'
import { Badge, type Tone } from './_ds/components/Badge'
import { ProgressBar } from './_ds/components/ProgressBar'
import { EmptyState } from './_ds/components/EmptyState'
import {
  LOOPS, classify, renderStepBar, isStale, staleMinutes, truncate, cronToLabel,
  UNAVAILABLE_TEXT, EMPTY_TEXT,
  type Classified, type LoopDef, type Step,
} from '@/lib/agents/status'

export const dynamic = 'force-dynamic'

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
}

type Supa = NonNullable<Awaited<ReturnType<typeof createClient>>>

const ts = (iso?: string | null) => (iso ? String(iso).slice(0, 16).replace('T', ' ') + ' UTC' : '—')
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

async function loadNotion(sb: Supa): Promise<LoopCard> {
  const d = def('notion')
  const res = await sb.from(d.table)
    .select('pushed_at,pulled_at,diff_status,pushed_status')
    .order('pushed_at', { ascending: false })
    .limit(5)
  const cls = classify({ error: res.error, rows: res.data })
  if (cls.state !== 'OK') return blank(d, cls)

  const rows = res.data!
  const r = rows[0]
  const pendingPull = rows.filter((x: { pulled_at?: string | null }) => !x.pulled_at).length

  return {
    def: d, cls,
    headline: `최근 동기화 ${r.diff_status ?? '—'} · 회수 대기 ${pendingPull}건`,
    status: null, dryRun: false,
    bar: renderStepBar(rows.map((x: { pulled_at?: string | null }, i: number) => ({ seq: i, status: x.pulled_at ? 'ok' : 'pending' }))),
    barLabel: '최근 동기화 5건(좌=최신)',
    startedAt: r.pushed_at, finishedAt: r.pulled_at,
    stale: false, staleMin: 0,
    note: null,
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

function StatTile({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <Card bodyStyle={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4,
        fontVariantNumeric: 'tabular-nums',
        color: tone === 'danger' && value > 0 ? 'var(--danger-fg)' : 'var(--text-strong)',
      }}>{value}</div>
    </Card>
  )
}

function StatusBadges({ c }: { c: LoopCard }) {
  const badges: ReactNode[] = []
  if (c.cls.state === 'UNAVAILABLE') {
    badges.push(<Badge key="s" tone="neutral">확인 불가</Badge>)
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
  if (c.stale) badges.push(<Badge key="stale" tone="warning" size="sm">stale</Badge>)
  if (c.dryRun) badges.push(<Badge key="dry" tone="neutral" size="sm">dry-run</Badge>)
  if (!c.def.scheduleActive) badges.push(<Badge key="sch" tone="neutral" size="sm">스케줄 비활성</Badge>)
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>{badges}</div>
}

function LoopSubtitle({ d }: { d: LoopDef }) {
  return (
    <span style={wrap}>
      <code style={{ ...mono, fontSize: 12, color: 'var(--text-body)' }}>{d.table}</code>
      {' · '}{d.workflow}{' · '}{cronToLabel(d.cronExpr)}{' '}
      {d.scheduleActive
        ? '· 스케줄 활성'
        : <b style={{ color: 'var(--warning-fg)' }}>· 자동 스케줄 비활성 (수동 실행만)</b>}
    </span>
  )
}

export default async function AgentsPage() {
  const now = Date.now()
  const sb = await createClient()

  let cards: LoopCard[]
  let queue: {
    posts: { cls: Classified; count: number }
    cases: { cls: Classified; count: number }
    research: { cls: Classified; count: number }
    stuck: number
  } | null = null

  if (!sb) {
    const cls: Classified = { state: 'UNAVAILABLE', reason: 'env_missing', detail: null }
    cards = LOOPS.map((d) => blank(d, cls))
  } else {
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const [cmo, insight, review, notion, posts, cases, research, stuckRes] = await Promise.all([
      loadCmo(sb, now), loadInsight(sb, now), loadReview(sb, now), loadNotion(sb),
      countOf(sb, 'posts', (q) => q.select('id', { count: 'exact' }).eq('status', 'pending_review').limit(1)),
      countOf(sb, 'case_studies', (q) => q.select('id', { count: 'exact' }).eq('review_status', 'draft').limit(1)),
      // 미해소 = 아직 사람/루프가 닫지 않은 것. done·failed 는 닫힌 것으로 본다.
      countOf(sb, 'research_queue', (q) => q.select('id', { count: 'exact' }).not('status', 'in', '(done,failed)').limit(1)),
      sb.from('research_queue').select('id', { count: 'exact' }).eq('status', 'claimed').lt('created_at', dayAgo).limit(1),
    ])
    cards = [cmo, insight, review, notion]
    queue = { posts, cases, research, stuck: stuckRes.error ? 0 : (stuckRes.count ?? 0) }
  }

  const okN = cards.filter((c) => c.cls.state === 'OK').length
  const naN = cards.filter((c) => c.cls.state === 'UNAVAILABLE').length
  const runningN = cards.filter((c) => c.headline?.startsWith('running')).length

  return (
    <main style={{
      fontFamily: 'var(--font-sans)',
      background: 'var(--bg-app)',
      color: 'var(--text-body)',
      minHeight: '100vh',
      padding: '28px clamp(16px, 4vw, 32px) 56px',
    }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        {/* 2줄 헤더 */}
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-strong)', margin: 0 }}>
            AI 에이전트 진행상황
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0', ...wrap }}>
            읽기 전용 · 요청 시점 조회({ts(new Date(now).toISOString())}) ·{' '}
            기호 <span style={mono}>●</span> 완료 <span style={mono}>◐</span> 진행{' '}
            <span style={mono}>○</span> 대기·건너뜀 <span style={mono}>✕</span> 실패{' '}
            <span style={mono}>▲</span> 막힘
          </p>
        </header>

        {!sb && (
          <div style={{
            background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
            color: 'var(--danger-fg)', padding: '14px 16px', borderRadius: 'var(--radius-lg)',
            fontSize: 14, lineHeight: 1.6, marginBottom: 20, ...wrap,
          }}>
            ⚠️ {UNAVAILABLE_TEXT.env_missing} — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어
            아래 카드는 <b>하나도 조회되지 않았다</b>. 이것은 &ldquo;실행이 없었다&rdquo;는 뜻이 아니다.
          </div>
        )}

        {/* 상단 요약 */}
        <section style={{
          display: 'grid', gap: 12, marginBottom: 24,
          gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
        }}>
          <StatTile label="루프 수" value={cards.length} />
          <StatTile label="정상" value={okN} />
          <StatTile label="실행중" value={runningN} />
          <StatTile label="확인 불가" value={naN} tone="danger" />
        </section>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            조회 성공 <span style={{ ...mono, fontWeight: 600, color: 'var(--text-body)' }}>{okN}/{cards.length}</span>
          </div>
          <ProgressBar value={okN} max={cards.length} showLabel />
        </div>

        {/* 루프 카드 */}
        <section style={{ display: 'grid', gap: 16 }}>
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
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-faint)', ...wrap }}>
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
                    <span style={{ ...mono, fontSize: 18, letterSpacing: '0.12em', color: 'var(--text-strong)', ...wrap }}>
                      {c.bar || '(스텝 없음)'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', ...wrap }}>{c.barLabel}</span>
                  </div>

                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)', ...mono, ...wrap }}>
                    시작 {ts(c.startedAt)} · 종료 {c.finishedAt ? ts(c.finishedAt) : '진행중'}
                  </p>

                  {c.stale && (
                    <p style={{
                      margin: '12px 0 0', fontSize: 13, lineHeight: 1.5,
                      background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                      color: 'var(--warning-fg)', padding: '8px 10px', borderRadius: 'var(--radius-md)', ...wrap,
                    }}>
                      ⚠️ stale — running 인 채 {c.staleMin}분 미갱신. 돌고 있는 게 아니라 죽었을 수 있다.
                    </p>
                  )}

                  {c.note && (
                    <p style={{
                      margin: '12px 0 0', fontSize: 13, lineHeight: 1.5,
                      background: 'var(--surface-muted)', color: 'var(--text-body)',
                      padding: '8px 10px', borderRadius: 'var(--radius-md)', ...wrap,
                    }}>
                      {c.note}
                    </p>
                  )}
                </>
              )}
            </Card>
          ))}
        </section>

        {/* 사람 대기함 */}
        <section style={{ marginTop: 32 }}>
          <Card
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
                  { label: '승인 대기 초안', sub: 'posts · pending_review', x: queue.posts, extra: null as ReactNode },
                  { label: '승인 대기 케이스', sub: 'case_studies · draft', x: queue.cases, extra: null as ReactNode },
                  {
                    label: '미해소 조사 큐', sub: 'research_queue · done·failed 제외', x: queue.research,
                    extra: queue.stuck > 0 ? (
                      <Badge tone="danger" size="sm">⚠️ claimed 인 채 24시간 초과 {queue.stuck}건</Badge>
                    ) : null,
                  },
                ].map((row) => (
                  <li key={row.sub} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 8, minHeight: 44,
                    padding: '12px 20px', borderTop: '1px solid var(--border)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--text-body)', ...wrap }}>{row.label}</div>
                      <div style={{ ...mono, fontSize: 11, color: 'var(--text-faint)', ...wrap }}>{row.sub}</div>
                      {row.extra && <div style={{ marginTop: 6 }}>{row.extra}</div>}
                    </div>
                    <div style={{ textAlign: 'right', ...wrap }}>{cell(row.x)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <p style={{ marginTop: 28, fontSize: 13 }}>
          <a href="/dashboard" style={{ color: 'var(--text-link)', textDecoration: 'none' }}>← 발행 기록 대시보드</a>
        </p>
      </div>
    </main>
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
