import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  ANGLE_READY_STATUSES, MODE_LABELS, PURPOSE_LABELS,
  type AnalysisMode, type AnalysisPurpose,
} from '@/lib/analysis/types'
import { demandAxis, PMF_QUADRANT_LABELS, type Quadrant as PmfQuadrant } from '@/lib/cases/match'
import { DWELL_FIELD_LABEL, STALL_DAYS, funnelStats, stallOf } from '@/lib/analysis/list-signals'
import { DismissBanner } from './dismiss-banner'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { ButtonLink } from '../_ds/components/Button'
import { EmptyState } from '../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../_ds/components/Shell'
import { FilterChip } from '../_ds/components/FilterChip'

export const dynamic = 'force-dynamic'
export const metadata = { title: '소구점 분석' }

// 읽기 전용 목록. 쓰기는 /analyze/new 와 각 상세 화면이 한다.

type Row = {
  id: string
  status: string
  created_at: string | null
  /** 체류 시간의 기준 시각. 상태마다 다른 걸 쓴다 — lib/analysis/list-signals.ts */
  extract_started_at: string | null
  extract_finished_at: string | null
  purpose: AnalysisPurpose
  mode: AnalysisMode | null
  competitor_url: string | null
  product_elevator_pitch: string
  /** PostgREST 임베디드 count — FK(analysis_inputs.project_id) 로 묶인 원문 수. */
  analysis_inputs: { count: number }[] | null
  /** 수요축 재료. opportunity_score 는 DB 생성 컬럼 — 읽기만 한다(재계산 금지, lib/cases/match.ts). */
  analysis_aspects: { opportunity_score: number | string | null }[] | null
  /** 선례축. FK(pmf_assessments.target_project_id). 진단이 여러 번이면 최신 1건만 쓴다. */
  pmf_assessments: {
    demand_axis: number | string | null
    precedent_axis: number | string | null
    quadrant: PmfQuadrant | null
    match_status: 'matched' | 'no_match' | 'not_run'
    created_at: string | null
  }[] | null
}

// ── 2축 (수요 · 선례) ──────────────────────────────────────────
// 전에는 목록이 opportunity_score 를 아예 읽지 않아 "어느 프로젝트에 수요가 있나"를 상세에
// 들어가기 전엔 알 수 없었다. 산식은 lib/cases/match.ts 한 벌뿐이다 — 여기서 다시 만들지 않는다.
// 두 축을 한 숫자로 합치지 않는다(pmf-assess.mjs 헤더의 이유와 같다).
const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))
const fmt1 = (v: number | null) => (v == null ? '—' : v.toFixed(2))

function axesOf(r: Row) {
  const demand = demandAxis(r.analysis_aspects == null ? null : r.analysis_aspects.map((a) => num(a.opportunity_score)))
  const latest = [...(r.pmf_assessments ?? [])]
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0] ?? null
  const precedent = latest == null ? null : num(latest.precedent_axis)
  return { demand, latest, precedent }
}

const QUADRANT_TONE: Record<PmfQuadrant, Tone> = {
  PROVEN_DEMAND: 'success', UNCHARTED_DEMAND: 'warning', CROWDED_NO_DEMAND: 'neutral', PARK: 'neutral',
}

function AxisStrip({ r }: { r: Row }) {
  const { demand, latest, precedent } = axesOf(r)
  const cell: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }
  const strong: CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text-strong)' }
  // 세 상태를 문장으로 가른다(§7.1): 값 / 0건 / 확인 불가·미진단.
  const demandText = demand.value == null
    ? (r.analysis_aspects?.length ? '확인 불가' : '속성 없음')
    : fmt1(demand.value)
  const precedentText = latest == null ? '미진단' : latest.match_status === 'not_run' ? '확인 불가' : fmt1(precedent)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px' }}>
      <span style={cell} title={demand.reason}>수요축 <span style={strong}>{demandText}</span></span>
      <span style={cell} title={latest ? `${latest.match_status} · ${latest.created_at ? `${KST.format(Date.parse(latest.created_at))} KST` : ''}` : 'pmf-assess 로 선례 진단을 돌린 적이 없다'}>
        선례축 <span style={strong}>{precedentText}</span>
      </span>
      {latest?.quadrant && (
        <Badge tone={QUADRANT_TONE[latest.quadrant]} size="sm">{PMF_QUADRANT_LABELS[latest.quadrant]}</Badge>
      )}
    </div>
  )
}

// 수집 중인데 원문이 이미 있는 프로젝트. 야간 수집 루프가 리뷰를 수백 건 쌓아 둔 프로젝트가
// 기본 보기(수집 중 제외)에서는 안 보여, 분석할 재료가 있다는 사실 자체를 화면에서 알 수 없었다.
const READY_FILTER = 'ready'
const inputCount = (r: Row) => r.analysis_inputs?.[0]?.count ?? 0
const isReady = (r: Row) => r.status === 'collecting' && inputCount(r) > 0

// DB CHECK(analysis_projects_status_check) 어휘. 모르는 값은 원문 그대로 보여준다.
const STATUS: Record<string, { label: string; tone: Tone }> = {
  collecting: { label: '수집 중', tone: 'neutral' },
  processing: { label: '분석 중', tone: 'info' },
  failed: { label: '분석 실패', tone: 'danger' },
  extracted: { label: '검수 대기', tone: 'warning' },
  scored: { label: '점수 산출', tone: 'info' },
  reviewed: { label: '검수 완료', tone: 'success' },
  angled: { label: '앵글 생성됨', tone: 'success' },
  done: { label: '완료', tone: 'success' },
}

// 기본 보기는 collecting 제외 — 원문만 받아 두고 분석을 안 돌린 껍데기가 목록을 덮는다.
const DEFAULT_FILTER = 'active'
const LIMIT = 500

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
const KST_DAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const dayOf = (v: string | null | undefined) => {
  const t = v ? Date.parse(v) : NaN
  return Number.isFinite(t) ? KST_DAY.format(t) : null
}

const wrap: CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 }
/** 한 줄로 자른다 — 밴드 폭이 좁아 상품 설명·URL 이 두세 줄로 번지면 행 높이가 제각각이 된다. 전문은 title 로. */
const oneLine: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }

// ── 목록 행 = 4열 밴드 ─────────────────────────────────────────
// 상품 / 원문 / 두 축 / 상태·경과. 폭이 좁아지면 auto-fit 이 열을 줄여 375px 에서 1열로 접힌다
// (미디어쿼리 없이 — 인라인 스타일에는 못 쓴다). min(100%, …) 가 없으면 좁은 화면에서 행이 넘친다.
const BANDS: CSSProperties = {
  flex: '1 1 min(100%, 520px)', minWidth: 0,
  display: 'grid', gap: 12, alignItems: 'start',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
}
const BAND_LABEL: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: 'var(--ls-tight)',
  color: 'var(--text-muted)', marginBottom: 4,
}

export default async function AnalyzeListPage({ searchParams }: { searchParams: Promise<{ status?: string; sort?: string }> }) {
  const sp = await searchParams
  const filter = sp.status ?? DEFAULT_FILTER
  // 정렬은 수요축 하나만 연다 — "어디부터 볼까"의 기본 질문이 그것이다. 선례축은 진단이 있는 행이 드물어 정렬 축으로는 아직 이르다.
  const byDemand = sp.sort === 'demand'
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const next = { status: filter === DEFAULT_FILTER ? undefined : filter, sort: byDemand ? 'demand' : undefined, ...patch }
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `/analyze?${s}` : '/analyze'
  }
  const sb = await createClient()

  // 데이터를 읽기 전(오류 분기)에도 같은 헤더를 쓴다 — 건수 캡션과 필터 행만 나중에 채운다.
  const header = (meta?: ReactNode, filters?: ReactNode) => (
    <PageHeader
      title="소구점 분석"
      subtitle="어느 프로젝트부터 볼까? 상태로 걸러 보고, 검수·앵글 화면으로 들어간다."
      meta={meta}
      filters={filters}
      action={<ButtonLink href="/analyze/new" variant="primary">새 분석</ButtonLink>}
    />
  )

  if (!sb) {
    return (
      <PageShell maxWidth={960}>
        {header()}
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">
          프로젝트 목록을 조회하지 못했다. 프로젝트가 없다는 뜻이 아니다.
        </Notice>
      </PageShell>
    )
  }

  // ponytail: 전체를 한 번에 읽어 상태별 건수와 필터를 같이 만든다. 500건을 넘기면 서버 필터·페이지네이션으로.
  const res = await sb
    .from('analysis_projects')
    .select('id,status,created_at,extract_started_at,extract_finished_at,purpose,mode,competitor_url,product_elevator_pitch,analysis_inputs(count),analysis_aspects(opportunity_score),pmf_assessments(demand_axis,precedent_axis,quadrant,match_status,created_at)')
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (res.error || !res.data) {
    return (
      <PageShell maxWidth={960}>
        {header()}
        <Notice tone="danger" title="확인 불가 — 프로젝트 목록 조회 실패">
          {res.error?.message ?? '응답에 행이 없다'} · 프로젝트가 없다는 뜻이 아니다.
        </Notice>
      </PageShell>
    )
  }

  const all = res.data as Row[]
  const counts = new Map<string, number>()
  for (const r of all) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  const collectingN = counts.get('collecting') ?? 0
  const readyN = all.filter(isReady).length
  // async 서버 컴포넌트다. 요청마다 한 번 서버에서 실행되고 재렌더가 없으므로
  // "재렌더할 때마다 값이 흔들린다"는 이 규칙의 전제가 성립하지 않는다(app/agents/page.tsx 와 같은 이유).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  // ── 어젯밤 발굴 배너 ────────────────────────────────────────
  // /discovery 와 같은 테이블·같은 세는 법(읽기만 한다). 조회가 실패하거나 테이블이 없으면
  // **아무것도 그리지 않는다** — "어젯밤 후보 0건"으로 그리면 발굴이 멈춘 날과 못 읽은 날이
  // 같은 화면이 되고, 사람은 전자로 읽는다(§7.1).
  const dc = await sb
    .from('discovery_candidates')
    .select('created_at,human_review')
    .order('created_at', { ascending: false })
    .limit(1000)
  const latestDay = dc.error || !dc.data?.length ? null : dayOf(dc.data[0].created_at)
  const discovery = latestDay && dc.data
    ? {
      day: latestDay,
      night: dc.data.filter((c) => dayOf(c.created_at) === latestDay).length,
      pending: dc.data.filter((c) => c.human_review === 'pending').length,
    }
    : null

  // ── 오늘 볼 것 1건 ─────────────────────────────────────────
  // 수요축이 가장 높은데 아직 검수가 안 끝난 프로젝트. 산식은 demandAxis 한 벌이다(재계산 금지).
  // 확인 불가(value=null)는 후보로 올리지 않는다 — 0 으로 접지도, 1등으로 올리지도 않는다.
  const todays = all
    .filter((r) => !ANGLE_READY_STATUSES.includes(r.status))
    .map((r) => ({ r, demand: axesOf(r).demand }))
    .filter((x): x is { r: Row; demand: { value: number; reason: string } } => x.demand.value != null)
    .sort((a, b) => b.demand.value - a.demand.value)[0] ?? null

  // ── 정체 한 줄 ─────────────────────────────────────────────
  const funnel = funnelStats(all, now)

  const filtered = filter === 'all' ? all
    : filter === DEFAULT_FILTER ? all.filter((r) => r.status !== 'collecting')
      : filter === READY_FILTER ? all.filter(isReady)
        : all.filter((r) => r.status === filter)
  // 수요축 정렬: 값 있는 행이 앞, 그 안에서 큰 값 순. 확인 불가·속성 없음은 뒤로(0 으로 접지 않는다).
  const rows = byDemand
    ? [...filtered].sort((a, b) => {
      const da = axesOf(a).demand.value, db = axesOf(b).demand.value
      if (da == null && db == null) return 0
      if (da == null) return 1
      if (db == null) return -1
      return db - da
    })
    : filtered

  // ── 타일 4개 ───────────────────────────────────────────────
  // 새 쿼리 0. 전부 위에서 이미 센 값이고, 필터 칩과 **같은 식**을 쓴다 — 타일과 칩의 숫자가
  // 어긋나면 사람은 둘 다 안 믿는다. caption 의 기준 건수는 LIMIT 경고와 같은 숫자여야 한다.
  const extractedN = counts.get('extracted') ?? 0
  const stalledN = all.filter((r) => stallOf(r, now).stalled).length
  const scope = `최근 ${LIMIT}건 안에서 센 값`

  const filters = (
    // nowrap + overflowX: 375px 에서 칩 행 **안쪽**만 가로로 스크롤된다(페이지는 안 밀린다).
    // 인라인 스타일에는 미디어쿼리를 못 써서, 넓은 화면에서도 같은 한 줄 스크롤 컨테이너다.
    <nav
      aria-label="상태 필터"
      style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, overflowX: 'auto', scrollbarWidth: 'thin' }}
    >
      <FilterChip href={qs({ status: undefined })} active={filter === DEFAULT_FILTER} count={all.length - collectingN}>
        수집 중 제외
      </FilterChip>
      {readyN > 0 && (
        <FilterChip href={qs({ status: READY_FILTER })} active={filter === READY_FILTER} count={readyN}>
          원문 있음·분석 전
        </FilterChip>
      )}
      {[...counts.entries()].map(([s, n]) => (
        <FilterChip key={s} href={qs({ status: s })} active={filter === s} count={n}>
          {STATUS[s]?.label ?? s}
        </FilterChip>
      ))}
      <FilterChip href={qs({ status: 'all' })} active={filter === 'all'} count={all.length}>전체</FilterChip>
    </nav>
  )

  return (
    <PageShell maxWidth={960}>
      {header(`전체 ${all.length}건 · 지금 보는 것 ${rows.length}건 · ${scope}`, filters)}

      {discovery && (
        <DismissBanner storageKey={`sa.analyze.discovery-banner.${discovery.day}`}>
          어젯밤({discovery.day}) 발굴 후보 {discovery.night}건 · 검토 대기 {discovery.pending}건{' '}
          <Link href="/discovery" style={{ color: 'inherit', fontWeight: 600 }}>보러 가기 →</Link>
        </DismissBanner>
      )}

      {all.length >= LIMIT && (
        <Notice tone="warning">최근 {LIMIT}건까지만 불러왔다. 건수는 그 안에서 센 값이다.</Notice>
      )}

      <StatGrid>
        <StatTile
          label="전체"
          value={all.length}
          caption={`${scope} · 수집 중 ${collectingN}건 포함`}
          href={qs({ status: 'all' })}
        />
        <StatTile
          label="검수 대기"
          value={extractedN}
          tone={extractedN > 0 ? 'warning' : undefined}
          caption={`${scope} · 분석은 끝났고 사람 검수만 남은 것`}
          href={qs({ status: 'extracted' })}
        />
        <StatTile
          label="원문 있음·분석 전"
          value={readyN}
          tone={readyN > 0 ? 'info' : undefined}
          caption={`${scope} · 수집 중인데 원문이 이미 쌓였다`}
          href={qs({ status: READY_FILTER })}
        />
        <StatTile
          label="오래 멈춤"
          value={stalledN}
          tone={stalledN > 0 ? 'danger' : undefined}
          // 필터 칩이 없는 유일한 타일이다 — 상태가 아니라 체류 시간으로 센 값이라 링크할 곳이 없다.
          caption={`${scope} · 검수 대기·분석 중으로 ${STALL_DAYS}일 이상`}
        />
      </StatGrid>

      {todays && (
        <Card
          title="오늘 볼 것 1건"
          action={<ButtonLink href={`/analyze/${todays.r.id}/review`} size="sm" variant="primary">상세·검수</ButtonLink>}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', ...wrap }}>
            {todays.r.product_elevator_pitch}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, ...wrap }}>
            왜 이것인가: 검수가 안 끝난 {all.filter((r) => !ANGLE_READY_STATUSES.includes(r.status)).length}건 중 수요축이 가장 높다
            ({fmt1(todays.demand.value)} · {todays.demand.reason}). 상태는 {STATUS[todays.r.status]?.label ?? todays.r.status}다.
            권고이지 순서를 정해 주는 것은 아니다.
          </p>
        </Card>
      )}

      {/*
        정체 한 줄. 건수만으로는 "3건이 3일째인지 3주째인지" 를 알 수 없어서 최장 체류를 같이 적고,
        그 숫자가 **어느 시각 기준**인지도 적는다 — 상태마다 기준 시각이 다르다(list-signals.ts).
      */}
      {funnel.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, ...wrap }}>
          {funnel.map((e) => {
            const label = STATUS[e.status]?.label ?? e.status
            const dwell = e.longestDays == null
              ? '최장 확인 불가'
              : `최장 ${e.longestDays}일(${DWELL_FIELD_LABEL[e.longestField!]} 기준)`
            return `${label} ${e.count}건 · ${dwell}${e.unknown ? ` · 시각 없음 ${e.unknown}건` : ''}`
          }).join(' | ')}
        </p>
      )}
      <nav aria-label="정렬" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        정렬
        <FilterChip href={qs({ sort: undefined })} active={!byDemand}>최근 생성 순</FilterChip>
        <FilterChip href={qs({ sort: 'demand' })} active={byDemand}>수요축 높은 순</FilterChip>
      </nav>

      <Card bodyStyle={{ padding: 0 }}>
        {all.length === 0 ? (
          <EmptyState
            title="아직 분석한 게 없다 — 괜찮다 (조회는 정상)"
            description="처음엔 다들 여기서 시작한다. 내 상품으로 바로 해도 되고, 남이 이미 푼 사례를 먼저 구경해도 된다. 첫 분석은 리뷰 몇 줄만 붙여넣어도 돈다."
            action={
              <div style={{ display: 'grid', gap: 8, width: 'min(100%, 320px)' }}>
                <ButtonLink href="/analyze/new" variant="primary" size="lg" fullWidth>첫 분석 시작</ButtonLink>
                <ButtonLink href="/cases" variant="ghost" size="sm">먼저 남의 사례 구경하기 →</ButtonLink>
              </div>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title="이 상태의 프로젝트 0건"
            description={`전체 ${all.length}건 중${filter === DEFAULT_FILTER ? ` 수집 중 ${collectingN}건만 있다${readyN ? ` (그중 ${readyN}건은 원문이 있어 분석을 시작할 수 있다)` : ''}` : ''}.`}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((r, i) => {
              const st = STATUS[r.status]
              const stall = stallOf(r, now)
              return (
                <li key={r.id} style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
                  padding: '14px 20px', borderTop: i ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={BANDS}>
                    {/* 1 — 상품 한 줄 + URL 작게 */}
                    <div style={{ minWidth: 0 }}>
                      <span style={BAND_LABEL}>상품</span>
                      <div
                        title={r.product_elevator_pitch}
                        style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', ...oneLine }}
                      >
                        {r.product_elevator_pitch}
                      </div>
                      <div
                        title={r.competitor_url ?? undefined}
                        style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', ...oneLine }}
                      >
                        {/* URL 은 선택이다 — 빈 줄을 두면 "수집 대상이 없는 프로젝트"처럼 보인다. */}
                        {r.competitor_url ?? '경쟁사 URL 없음'}
                      </div>
                    </div>

                    {/* 2 — 원문 N건 */}
                    <div style={{ minWidth: 0 }}>
                      <span style={BAND_LABEL}>원문</span>
                      <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)' }}>
                        {inputCount(r)}건
                      </div>
                      {isReady(r) && <div style={{ marginTop: 4 }}><Badge tone="warning" size="sm">분석 전</Badge></div>}
                    </div>

                    {/* 3 — 수요축 · 선례축 · 사분면 */}
                    <div style={{ minWidth: 0 }}>
                      <span style={BAND_LABEL}>두 축</span>
                      <AxisStrip r={r} />
                    </div>

                    {/* 4 — 상태 · 경과 */}
                    <div style={{ minWidth: 0 }}>
                      <span style={BAND_LABEL}>상태·경과</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                        <Badge tone={st?.tone ?? 'neutral'} dot size="sm">{st?.label ?? r.status}</Badge>
                        {/* 기준 시각을 title 에 적는다 — 어느 날짜로 센 숫자인지 확인할 수 없으면 사람이 안 믿는다. */}
                        {stall.stalled && (
                          <Badge
                            tone="danger"
                            size="sm"
                            title={`${DWELL_FIELD_LABEL[stall.field!]} 기준 ${stall.days}일째 ${st?.label ?? r.status} (기준 ${STALL_DAYS}일)`}
                          >
                            오래 멈춤 {stall.days}일
                          </Badge>
                        )}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, ...wrap }}>
                        {/* days == null 은 0일이 아니다 — 시각을 못 읽었다는 뜻이다(§7.1). */}
                        {stall.days == null ? '경과 확인 불가' : `${stall.days}일째 (${DWELL_FIELD_LABEL[stall.field!]} 기준)`}
                        <br />
                        {MODE_LABELS[r.mode ?? 'forward'] ?? r.mode} · {PURPOSE_LABELS[r.purpose] ?? r.purpose}
                        <br />
                        {r.created_at ? `${KST.format(Date.parse(r.created_at))} KST 생성` : '생성일 없음'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <ButtonLink href={`/analyze/${r.id}/review`} size="sm">상세·검수</ButtonLink>
                    {ANGLE_READY_STATUSES.includes(r.status) && (
                      <ButtonLink href={`/analyze/${r.id}/angles`} size="sm">앵글</ButtonLink>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </PageShell>
  )
}
