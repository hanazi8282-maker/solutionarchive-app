import Link from 'next/link'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  ANGLE_READY_STATUSES, MODE_LABELS, PURPOSE_LABELS,
  type AnalysisMode, type AnalysisPurpose,
} from '@/lib/analysis/types'
import { demandAxis, PMF_QUADRANT_LABELS, type Quadrant as PmfQuadrant } from '@/lib/cases/match'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { ButtonLink } from '../_ds/components/Button'
import { EmptyState } from '../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell } from '../_ds/components/Shell'

export const dynamic = 'force-dynamic'
export const metadata = { title: '소구점 분석' }

// 읽기 전용 목록. 쓰기는 /analyze/new 와 각 상세 화면이 한다.

type Row = {
  id: string
  status: string
  created_at: string | null
  purpose: AnalysisPurpose
  mode: AnalysisMode | null
  competitor_url: string
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
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginTop: 6 }}>
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

const wrap: CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 }

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 12px',
        borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
        border: `1px solid ${active ? 'var(--info-border)' : 'var(--border)'}`,
        background: active ? 'var(--info-bg)' : 'var(--surface-card)',
        color: active ? 'var(--info-fg)' : 'var(--text-body)',
      }}
    >
      {children}
    </Link>
  )
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

  const header = (
    <PageHeader
      title="소구점 분석"
      subtitle="분석 프로젝트 목록. 상태별로 걸러 보고, 검수·앵글 화면으로 들어간다."
      action={<ButtonLink href="/analyze/new" variant="primary">새 분석</ButtonLink>}
    />
  )

  if (!sb) {
    return (
      <PageShell maxWidth={960}>
        {header}
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">
          프로젝트 목록을 조회하지 못했다. 프로젝트가 없다는 뜻이 아니다.
        </Notice>
      </PageShell>
    )
  }

  // ponytail: 전체를 한 번에 읽어 상태별 건수와 필터를 같이 만든다. 500건을 넘기면 서버 필터·페이지네이션으로.
  const res = await sb
    .from('analysis_projects')
    .select('id,status,created_at,purpose,mode,competitor_url,product_elevator_pitch,analysis_inputs(count),analysis_aspects(opportunity_score),pmf_assessments(demand_axis,precedent_axis,quadrant,match_status,created_at)')
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (res.error || !res.data) {
    return (
      <PageShell maxWidth={960}>
        {header}
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

  return (
    <PageShell maxWidth={960}>
      {header}

      {all.length >= LIMIT && (
        <Notice tone="warning">최근 {LIMIT}건까지만 불러왔다. 건수는 그 안에서 센 값이다.</Notice>
      )}

      <nav aria-label="상태 필터" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <FilterLink href={qs({ status: undefined })} active={filter === DEFAULT_FILTER}>
          수집 중 제외 {all.length - collectingN}
        </FilterLink>
        {readyN > 0 && (
          <FilterLink href={qs({ status: READY_FILTER })} active={filter === READY_FILTER}>
            원문 있음·분석 전 {readyN}
          </FilterLink>
        )}
        {[...counts.entries()].map(([s, n]) => (
          <FilterLink key={s} href={qs({ status: s })} active={filter === s}>
            {STATUS[s]?.label ?? s} {n}
          </FilterLink>
        ))}
        <FilterLink href={qs({ status: 'all' })} active={filter === 'all'}>전체 {all.length}</FilterLink>
      </nav>
      <nav aria-label="정렬" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        정렬
        <FilterLink href={qs({ sort: undefined })} active={!byDemand}>최근 생성 순</FilterLink>
        <FilterLink href={qs({ sort: 'demand' })} active={byDemand}>수요축 높은 순</FilterLink>
      </nav>

      <Card bodyStyle={{ padding: 0 }}>
        {all.length === 0 ? (
          <EmptyState
            compact
            title="분석 프로젝트 0건 (조회는 정상)"
            action={<ButtonLink href="/analyze/new" variant="primary">새 분석 시작</ButtonLink>}
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
              return (
                <li key={r.id} style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '14px 20px', borderTop: i ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ ...wrap, flex: '1 1 420px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      <Badge tone={st?.tone ?? 'neutral'} dot size="sm">{st?.label ?? r.status}</Badge>
                      <Badge tone="neutral" size="sm">{MODE_LABELS[r.mode ?? 'forward'] ?? r.mode}</Badge>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {PURPOSE_LABELS[r.purpose] ?? r.purpose} · {r.created_at ? `${KST.format(Date.parse(r.created_at))} KST` : '생성일 없음'}
                        {' · '}원문 {inputCount(r)}건
                      </span>
                      {isReady(r) && <Badge tone="warning" size="sm">분석 전</Badge>}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', ...wrap }}>
                      {r.product_elevator_pitch}
                    </div>
                    <div style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', ...wrap }}>
                      {r.competitor_url}
                    </div>
                    <AxisStrip r={r} />
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
