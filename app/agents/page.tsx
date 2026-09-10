import { createClient } from '@/lib/supabase/server'
import {
  LOOPS, classify, renderStepBar, isStale, staleMinutes, truncate, cronToLabel,
  UNAVAILABLE_TEXT, EMPTY_TEXT,
  type Classified, type LoopDef, type Step,
} from '@/lib/agents/status'

export const dynamic = 'force-dynamic'

// 읽기 전용 화면이다. 이 파일에 DB 쓰기 호출을 넣지 마라 — select 만 쓴다.

type Card = {
  def: LoopDef
  cls: Classified
  headline: string | null
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

const blank = (def: LoopDef, cls: Classified): Card => ({
  def, cls, headline: null, bar: '', barLabel: '', startedAt: null, finishedAt: null,
  stale: false, staleMin: 0, note: cls.detail,
})

const def = (key: string) => LOOPS.find((l) => l.key === key)!

async function loadCmo(sb: Supa, now: number): Promise<Card> {
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

async function loadInsight(sb: Supa, now: number): Promise<Card> {
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
    bar: renderStepBar(steps),
    barLabel: raw.length ? `스텝(${raw.map((s) => s.name ?? '?').join('·')})` : '스텝 기록 없음',
    startedAt: r.started_at, finishedAt: r.finished_at,
    stale: isStale(status, Math.max(parse(r.finished_at), parse(r.started_at)), now),
    staleMin: staleMinutes(Math.max(parse(r.finished_at), parse(r.started_at)), now),
    note: r.error ? `✕ ${truncate(r.error)}` : null,
  }
}

async function loadReview(sb: Supa, now: number): Promise<Card> {
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
    bar: renderStepBar(rows.map((x: { status?: string; finished_at?: string | null }, i: number) =>
      ({ seq: i, status: x.finished_at ? x.status : 'running' }))),
    barLabel: '최근 실행 5회(좌=최신)',
    startedAt: r.started_at, finishedAt: r.finished_at,
    stale: isStale(status, Math.max(parse(r.finished_at), parse(r.started_at)), now),
    staleMin: staleMinutes(Math.max(parse(r.finished_at), parse(r.started_at)), now),
    note: `소스 ${srcLine}${r.error ? ` / ✕ ${truncate(r.error)}` : ''}`,
  }
}

async function loadNotion(sb: Supa): Promise<Card> {
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

export default async function AgentsPage() {
  const now = Date.now()
  const sb = await createClient()

  let cards: Card[]
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
    <main style={{ padding: '2rem', maxWidth: 800, fontFamily: 'system-ui, sans-serif' }}>
      <h1>AI 에이전트 진행상황</h1>
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        읽기 전용 · 요청 시점 조회({ts(new Date(now).toISOString())}) · 기호 ● 완료 ◐ 진행 ○ 대기·건너뜀 ✕ 실패 ▲ 막힘
      </p>

      {!sb && (
        <p style={{ background: '#fee', border: '1px solid #c00', color: '#900', padding: '.75rem', borderRadius: 4 }}>
          ⚠️ {UNAVAILABLE_TEXT.env_missing} — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어
          아래 카드는 <b>하나도 조회되지 않았다</b>. 이것은 &ldquo;실행이 없었다&rdquo;는 뜻이 아니다.
        </p>
      )}

      <p style={{ fontSize: '.9rem' }}>
        루프 {cards.length}개 · 정상 {okN} · 실행중 {runningN} · <b>확인 불가 {naN}</b>
      </p>

      {cards.map((c) => (
        <section key={c.def.key} style={{
          border: '1px solid #ddd', borderLeft: `4px solid ${c.cls.state === 'OK' ? '#2a7' : c.cls.state === 'EMPTY' ? '#999' : '#c00'}`,
          borderRadius: 4, padding: '.75rem 1rem', margin: '.75rem 0',
        }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 .25rem' }}>{c.def.label}</h2>
          <p style={{ fontSize: '.8rem', color: '#666', margin: '0 0 .5rem' }}>
            <code>{c.def.table}</code> · {c.def.workflow} · {cronToLabel(c.def.cronExpr)}{' '}
            {c.def.scheduleActive
              ? '· 스케줄 활성'
              : <b style={{ color: '#a60' }}>· 자동 스케줄 비활성 (수동 실행만)</b>}
          </p>

          {c.cls.state === 'UNAVAILABLE' && (
            <p style={{ color: '#c00', margin: '.25rem 0' }}>
              {UNAVAILABLE_TEXT[c.cls.reason ?? 'query_failed']}
              {c.cls.detail && <span style={{ color: '#666' }}> — {c.cls.detail}</span>}
            </p>
          )}
          {c.cls.state === 'EMPTY' && <p style={{ color: '#666', margin: '.25rem 0' }}>{EMPTY_TEXT}</p>}

          {c.cls.state === 'OK' && (
            <>
              <p style={{ margin: '.25rem 0' }}>{c.headline}</p>
              <p style={{ margin: '.25rem 0', fontFamily: 'monospace' }}>
                {c.bar || '(스텝 없음)'} <span style={{ fontFamily: 'system-ui', fontSize: '.75rem', color: '#666' }}>{c.barLabel}</span>
              </p>
              <p style={{ margin: '.25rem 0', fontSize: '.8rem', color: '#666' }}>
                시작 {ts(c.startedAt)} · 종료 {c.finishedAt ? ts(c.finishedAt) : '진행중'}
              </p>
              {c.stale && (
                <p style={{ margin: '.25rem 0', color: '#a60' }}>
                  ⚠️ stale — running 인 채 {c.staleMin}분 미갱신. 돌고 있는 게 아니라 죽었을 수 있다.
                </p>
              )}
              {c.note && <p style={{ margin: '.25rem 0', fontSize: '.85rem' }}>{c.note}</p>}
            </>
          )}
        </section>
      ))}

      <h2 style={{ marginTop: '2rem' }}>사람 대기함</h2>
      {!queue ? (
        <p style={{ color: '#c00' }}>{UNAVAILABLE_TEXT.env_missing}</p>
      ) : (
        <ul style={{ lineHeight: 1.8 }}>
          <li>승인 대기 초안(posts pending_review): {cell(queue.posts)}</li>
          <li>승인 대기 케이스(case_studies draft): {cell(queue.cases)}</li>
          <li>
            미해소 조사 큐(research_queue): {cell(queue.research)}
            {queue.stuck > 0 && (
              <b style={{ color: '#c00' }}> · ⚠️ claimed 인 채 24시간 초과 {queue.stuck}건</b>
            )}
          </li>
        </ul>
      )}

      <p style={{ marginTop: '2rem', fontSize: '.85rem' }}>
        <a href="/dashboard">← 발행 기록 대시보드</a>
      </p>
    </main>
  )
}

function cell(x: { cls: Classified; count: number }) {
  if (x.cls.state === 'UNAVAILABLE') {
    return <span style={{ color: '#c00' }}>{UNAVAILABLE_TEXT[x.cls.reason ?? 'query_failed']}</span>
  }
  if (x.cls.state === 'EMPTY') return <span style={{ color: '#666' }}>0건 (조회 정상)</span>
  return <b>{x.count}건</b>
}
