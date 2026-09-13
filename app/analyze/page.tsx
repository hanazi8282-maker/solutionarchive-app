import Link from 'next/link'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  ANGLE_READY_STATUSES, MODE_LABELS, PURPOSE_LABELS,
  type AnalysisMode, type AnalysisPurpose,
} from '@/lib/analysis/types'
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
}

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

export default async function AnalyzeListPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const filter = (await searchParams).status ?? DEFAULT_FILTER
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
    .select('id,status,created_at,purpose,mode,competitor_url,product_elevator_pitch')
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

  const rows = filter === 'all' ? all
    : filter === DEFAULT_FILTER ? all.filter((r) => r.status !== 'collecting')
      : all.filter((r) => r.status === filter)

  return (
    <PageShell maxWidth={960}>
      {header}

      {all.length >= LIMIT && (
        <Notice tone="warning">최근 {LIMIT}건까지만 불러왔다. 건수는 그 안에서 센 값이다.</Notice>
      )}

      <nav aria-label="상태 필터" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <FilterLink href="/analyze" active={filter === DEFAULT_FILTER}>
          수집 중 제외 {all.length - collectingN}
        </FilterLink>
        {[...counts.entries()].map(([s, n]) => (
          <FilterLink key={s} href={`/analyze?status=${encodeURIComponent(s)}`} active={filter === s}>
            {STATUS[s]?.label ?? s} {n}
          </FilterLink>
        ))}
        <FilterLink href="/analyze?status=all" active={filter === 'all'}>전체 {all.length}</FilterLink>
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
            description={`전체 ${all.length}건 중${filter === DEFAULT_FILTER ? ` 수집 중 ${collectingN}건만 있다` : ''}.`}
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
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', ...wrap }}>
                      {r.product_elevator_pitch}
                    </div>
                    <div style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', ...wrap }}>
                      {r.competitor_url}
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
