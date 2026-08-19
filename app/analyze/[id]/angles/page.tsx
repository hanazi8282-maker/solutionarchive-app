'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import '../../../../Dothegy Works Design System/styles.css'
import { Badge } from '../../../../Dothegy Works Design System/components/core/Badge.jsx'
import { Card } from '../../../../Dothegy Works Design System/components/core/Card.jsx'
import { Button } from '../../../../Dothegy Works Design System/components/core/Button.jsx'
import { EmptyState } from '../../../../Dothegy Works Design System/components/feedback/EmptyState.jsx'
import {
  ANGLE_TYPE_LABELS,
  OUTPUT_TYPE_LABELS,
  PERSONA_ROLE_LABELS,
  PURPOSE_LABELS,
  QUADRANT_SHORT_LABELS,
  SUBSTANTIATION_VERDICT_LABELS,
  isInternalOutput,
  type AnalysisPurpose,
  type AngleType,
  type OutputType,
  type PainTiming,
  type PersonaRole,
  type Quadrant,
  type SubstantiationVerdict,
} from '@/lib/analysis/types'

type AngleRow = {
  id: string
  aspect_id: string | null
  angle_type: AngleType | null
  output_type: OutputType | null
  headline_draft: string | null
  substantiation_verdict: SubstantiationVerdict | null
  substantiation_reason: string | null
  substantiation_evidence: string | null
  headline_original: string | null
  gate_rewritten: boolean | null
  created_at: string | null
  aspect_name: string | null
  aspect_quadrant: Quadrant | null
  aspect_persona_role: PersonaRole | null
  aspect_pain_timing: PainTiming | null
  aspect_attribution: string | null
  aspect_opportunity_score: number | string | null
}

type TableStakesAspect = {
  id: string
  name: string
  quadrant: Quadrant | null
  persona_role: PersonaRole | null
  opportunity_score: number | string | null
}

type ProjectRow = {
  id: string
  status: string
  purpose: AnalysisPurpose
  maturity_stage: number | null
  competitor_url: string
  product_elevator_pitch: string
}

// 앵글이 만들어지려면 검수가 끝나 있어야 한다(status 전이: reviewed → angled → done).
const ANGLE_READY = ['reviewed', 'angled', 'done']

// 사분면 중 이 화면에 노출하지 않는 것. 카피 소재가 아니다.
const HIDDEN_QUADRANTS: Quadrant[] = ['OVER_INVESTED', 'IGNORE']

const VERDICT_TONE: Record<SubstantiationVerdict, 'success' | 'info' | 'warning'> = {
  SUBSTANTIATED:   'success',
  EXPERIENTIAL:    'info',
  UNSUBSTANTIATED: 'warning',
}

function scoreOf(a: AngleRow): number {
  return a.aspect_opportunity_score == null ? -Infinity : Number(a.aspect_opportunity_score)
}

function fmtScore(v: number | string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '—'
}

// 내부 메모로 빠진 이유를 셀러 언어로 설명한다.
// 이게 없으면 "왜 이건 카피가 아니지?" 에서 막힌다.
function internalReason(a: AngleRow): string {
  if (a.output_type === 'BASELINE_SPEC') {
    return '이미 시장 표준이라 설득할 대상이 아닙니다. 경쟁하듯 어필하지 말고 신뢰 확보용으로만 쓰세요.'
  }
  if (a.aspect_pain_timing === 'POST_PURCHASE') {
    return '구매 후에야 겪는 불만이라 상세페이지 카피에서 자동 제외됐습니다. 카피가 아니라 제품 개선 과제로 다루세요.'
  }
  return '카피 소재가 아니라 제품 개선 과제로 분류됐습니다.'
}

// ── 배지 묶음 ────────────────────────────────────────────────
// trailing 은 실증 판정 배지 바로 뒤에 붙는다. 재작성 보조 배지가 여기 들어가야
// 스캔 한 번에 "검증을 거쳐 조정됐다"가 읽힌다.
function AngleBadges({ a, trailing }: { a: AngleRow; trailing?: React.ReactNode }) {
  const internal = isInternalOutput(a.output_type)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {a.output_type && (
        <Badge tone={internal ? 'warning' : 'info'} solid={internal} size="sm">
          {internal ? `내부 · ${OUTPUT_TYPE_LABELS[a.output_type]}` : OUTPUT_TYPE_LABELS[a.output_type]}
        </Badge>
      )}
      {a.angle_type && (
        <Badge tone="neutral" size="sm">{ANGLE_TYPE_LABELS[a.angle_type]}</Badge>
      )}
      {a.aspect_name && (
        <Badge tone="neutral" size="sm">
          {a.aspect_name}
          {a.aspect_opportunity_score != null ? ` · 기회 ${fmtScore(a.aspect_opportunity_score)}` : ''}
        </Badge>
      )}
      {a.aspect_persona_role && (
        <Badge tone="violet" size="sm">{PERSONA_ROLE_LABELS[a.aspect_persona_role]}</Badge>
      )}
      {a.substantiation_verdict && (
        <Badge tone={VERDICT_TONE[a.substantiation_verdict]} size="sm" dot>
          {SUBSTANTIATION_VERDICT_LABELS[a.substantiation_verdict]}
        </Badge>
      )}
      {trailing}
    </div>
  )
}

// ── 재작성 이력 (하이브리드 공개) ─────────────────────────────
// gate_rewritten=true 인 앵글에만 보조 배지를 항상 노출한다(스캔만으로 전달).
// 원본/사유는 그 배지를 눌러야 펼쳐진다. false 면 배지 자체를 그리지 않는다.
function RewriteToggle({ a, open, onToggle }: { a: AngleRow; open: boolean; onToggle: () => void }) {
  if (!a.gate_rewritten) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        border: 'none', background: 'none', padding: 0, cursor: 'pointer',
        font: 'inherit', display: 'inline-flex', alignItems: 'center',
      }}
    >
      <Badge tone="warning" size="sm">재작성됨 {open ? '▴' : '▾'}</Badge>
    </button>
  )
}

function RewritePanel({ a, open }: { a: AngleRow; open: boolean }) {
  if (!a.gate_rewritten || !open) return null
  return (
    <div
      style={{
        marginTop: 10,
        background: 'var(--surface-muted)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <div>
        <div className="dgy-caps" style={{ marginBottom: 2 }}>원본</div>
        <p style={{
          margin: 0, fontSize: 'var(--fs-sm)',
          color: 'var(--text-faint)', textDecoration: 'line-through',
        }}>
          {a.headline_original ?? '기록되지 않음'}
        </p>
      </div>
      <div>
        <div className="dgy-caps" style={{ marginBottom: 2 }}>재작성 사유</div>
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>
          {a.substantiation_reason ?? '사유가 기록되지 않았습니다.'}
        </p>
      </div>
    </div>
  )
}

function EvidenceQuote({ a }: { a: AngleRow }) {
  if (!a.substantiation_evidence) return null
  return (
    <blockquote style={{
      margin: '10px 0 0',
      paddingLeft: 'var(--space-3)',
      borderLeft: '2px solid var(--success)',
      color: 'var(--text-muted)',
      fontSize: 'var(--fs-sm)',
    }}>
      원문 인용 · “{a.substantiation_evidence}”
    </blockquote>
  )
}

// ── 소비자 노출 앵글 카드 ─────────────────────────────────────
function ConsumerAngleCard({ a }: { a: AngleRow }) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <AngleBadges a={a} trailing={<RewriteToggle a={a} open={open} onToggle={() => setOpen(v => !v)} />} />
      <p style={{
        margin: '12px 0 0',
        fontSize: 'var(--fs-h2)',
        fontWeight: 'var(--fw-semibold)',
        lineHeight: 'var(--lh-snug)',
        color: 'var(--text-strong)',
      }}>
        {a.headline_draft ?? '(문구 없음)'}
      </p>
      <EvidenceQuote a={a} />
      <RewritePanel a={a} open={open} />
    </Card>
  )
}

// ── 내부 메모 카드 ────────────────────────────────────────────
// 소비자 노출 카피와 절대 헷갈리면 안 되므로 surface·테두리·타이포를 전부 다르게 준다.
function InternalMemoCard({ a }: { a: AngleRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: 'var(--surface-muted)',
      border: '1px dashed var(--border-strong)',
      borderLeft: '3px solid var(--warning)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <div style={{
        background: 'var(--warning-bg)',
        borderBottom: '1px solid var(--warning-border)',
        color: 'var(--warning-fg)',
        padding: '6px var(--space-4)',
        fontSize: 'var(--fs-xs)',
        fontWeight: 'var(--fw-semibold)',
      }}>
        내부 검토용 메모 — 소비자에게 노출하지 마세요
      </div>

      <div style={{ padding: 'var(--space-4)' }}>
        <AngleBadges a={a} trailing={<RewriteToggle a={a} open={open} onToggle={() => setOpen(v => !v)} />} />
        <p style={{
          margin: '10px 0 0',
          fontSize: 'var(--fs-base)',
          fontWeight: 'var(--fw-medium)',
          lineHeight: 'var(--lh-normal)',
          color: 'var(--text-body)',
        }}>
          {a.headline_draft ?? '(내용 없음)'}
        </p>
        <p style={{
          margin: '8px 0 0',
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
        }}>
          {internalReason(a)}
        </p>
        <EvidenceQuote a={a} />
        <RewritePanel a={a} open={open} />
      </div>
    </div>
  )
}

function AngleItem({ a }: { a: AngleRow }) {
  return isInternalOutput(a.output_type) ? <InternalMemoCard a={a} /> : <ConsumerAngleCard a={a} />
}

function SectionHeading({ title, desc, count }: { title: string; desc: string; count?: number }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{
          margin: 0, fontSize: 'var(--fs-h2)',
          fontWeight: 'var(--fw-semibold)', color: 'var(--text-strong)',
        }}>
          {title}
        </h2>
        {count != null && (
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{count}건</span>
        )}
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{desc}</p>
    </div>
  )
}

export default function AnalyzeAnglesPage() {
  const params = useParams<{ id: string }>()
  const projectId = params?.id ?? ''

  const [project, setProject] = useState<ProjectRow | null>(null)
  const [angles, setAngles] = useState<AngleRow[]>([])
  const [tableStakes, setTableStakes] = useState<TableStakesAspect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/analyze/angle?project_id=${encodeURIComponent(projectId)}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '불러오지 못했습니다.'); return }
      setProject(json.project)
      setAngles(json.angles ?? [])
      setTableStakes(json.table_stakes_aspects ?? [])
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  const page = (children: React.ReactNode) => (
    // app/layout.tsx 가 body 에 인라인 fontFamily 를 박아둬서 base.css 의
    // body 규칙이 이긴다. 인라인끼리 붙어야 하므로 여기서 다시 지정한다.
    <main style={{
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-body)',
      background: 'var(--bg-app)',
      minHeight: '100vh',
      padding: 'var(--space-8)',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 'var(--space-6)' }}>
        {children}
      </div>
    </main>
  )

  if (loading) {
    return page(<p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>불러오는 중...</p>)
  }

  if (error) {
    return page(
      <EmptyState
        tone="danger"
        title="앵글을 불러오지 못했습니다"
        description={error}
        action={<Button variant="neutral" onClick={load}>다시 시도</Button>}
      />,
    )
  }

  // ── 분류 ────────────────────────────────────────────────────
  const visible = angles.filter(
    a => !(a.aspect_quadrant && HIDDEN_QUADRANTS.includes(a.aspect_quadrant)),
  )

  // TABLE_STAKES 는 프로젝트당 BASELINE_SPEC 1건으로 묶이면서 aspect_id 가 null 이 된다.
  // 그래서 사분면만으로는 잡히지 않고 이 조합까지 같이 봐야 한다.
  const isTableStakesAngle = (a: AngleRow) =>
    a.aspect_quadrant === 'TABLE_STAKES' || (a.aspect_id === null && a.output_type === 'BASELINE_SPEC')

  const differentiators = visible
    .filter(a => a.aspect_quadrant === 'DIFFERENTIATOR')
    .sort((x, y) => scoreOf(y) - scoreOf(x))

  const tableStakesAngles = visible.filter(isTableStakesAngle)

  // 어디에도 안 걸리는 앵글을 조용히 버리지 않는다.
  const others = visible.filter(
    a => a.aspect_quadrant !== 'DIFFERENTIATOR' && !isTableStakesAngle(a),
  )

  const consumerAngles = differentiators.filter(a => !isInternalOutput(a.output_type))
  const internalAngles = differentiators.filter(a => isInternalOutput(a.output_type))
  const rewrittenCount = visible.filter(a => a.gate_rewritten).length

  // ── 빈 상태 ─────────────────────────────────────────────────
  if (project && !ANGLE_READY.includes(project.status)) {
    return page(
      <EmptyState
        tone="info"
        title="아직 검수가 끝나지 않았습니다"
        description={`앵글은 검수 완료(reviewed) 후에 생성됩니다. 현재 상태는 '${project.status}' 입니다.`}
        action={<Button variant="primary" onClick={() => { window.location.href = `/analyze/${projectId}/review` }}>검수 화면으로</Button>}
      />,
    )
  }

  if (angles.length === 0) {
    return page(
      <EmptyState
        title="생성된 앵글이 없습니다"
        description="검수 화면에서 '앵글 생성'을 실행하면 차별화 속성별 카피 초안이 만들어집니다."
        action={<Button variant="primary" onClick={() => { window.location.href = `/analyze/${projectId}/review` }}>검수 화면으로</Button>}
      />,
    )
  }

  return page(
    <>
      {/* ── 헤더 ───────────────────────────────────────────── */}
      <header>
        <h1 style={{
          margin: 0, fontSize: 'var(--fs-h1)',
          fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-tight)',
          color: 'var(--text-strong)',
        }}>
          소구 앵글
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
          차별화 기회에서 뽑은 카피 초안 · 실증 게이트 통과분
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'var(--space-3)' }}>
          <Badge tone="neutral" size="sm">앵글 {visible.length}건</Badge>
          <Badge tone="info" size="sm">차별화 {differentiators.length}</Badge>
          <Badge tone="neutral" size="sm">기본기 {tableStakes.length}</Badge>
          {rewrittenCount > 0 && <Badge tone="warning" size="sm">재작성 {rewrittenCount}</Badge>}
        </div>
      </header>

      {/* ── 프로젝트 요약 ──────────────────────────────────── */}
      {project && (
        <Card padded bodyStyle={{ display: 'grid', gap: 4 }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>
            <span style={{ color: 'var(--text-muted)' }}>상품</span> · {project.product_elevator_pitch}
          </p>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>
            <span style={{ color: 'var(--text-muted)' }}>경쟁사</span> · {project.competitor_url}
          </p>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>
            <span style={{ color: 'var(--text-muted)' }}>분석 목적</span> ·{' '}
            {PURPOSE_LABELS[project.purpose] ?? project.purpose}
          </p>
        </Card>
      )}

      {/* ── 차별화 앵글 ────────────────────────────────────── */}
      <section>
        <SectionHeading
          title="차별화 앵글"
          desc={`${QUADRANT_SHORT_LABELS.DIFFERENTIATOR} — 중요한데 아직 충족되지 않은 지점. 카피의 주인공입니다. 기회점수 높은 순.`}
          count={differentiators.length}
        />

        {differentiators.length === 0 ? (
          <EmptyState
            compact
            title="차별화 앵글 없음"
            description="DIFFERENTIATOR 로 분류된 속성이 없어 카피 초안이 만들어지지 않았습니다."
          />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {consumerAngles.map(a => <AngleItem key={a.id} a={a} />)}

            {internalAngles.length > 0 && (
              <>
                <p style={{
                  margin: 'var(--space-2) 0 0', fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                }}>
                  아래부터는 카피가 아니라 내부 검토용입니다.
                </p>
                {internalAngles.map(a => <AngleItem key={a.id} a={a} />)}
              </>
            )}
          </div>
        )}
      </section>

      {/* ── 기본기 ─────────────────────────────────────────── */}
      {(tableStakes.length > 0 || tableStakesAngles.length > 0) && (
        <section>
          <SectionHeading
            title="기본기"
            desc="이미 시장 표준이라 설득 대상이 아닙니다. 경쟁하듯 어필하지 말고 신뢰 배지 수준으로만 얹으세요."
            count={tableStakes.length}
          />

          {tableStakes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-4)' }}>
              {tableStakes.map(t => (
                <Badge key={t.id} tone="neutral" size="md">
                  {t.name}
                  {t.opportunity_score != null ? ` · ${fmtScore(t.opportunity_score)}` : ''}
                </Badge>
              ))}
            </div>
          )}

          {tableStakesAngles.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {tableStakesAngles.map(a => <AngleItem key={a.id} a={a} />)}
            </div>
          )}
        </section>
      )}

      {/* ── 미분류 ─────────────────────────────────────────── */}
      {others.length > 0 && (
        <section>
          <SectionHeading
            title="미분류"
            desc="속성이 삭제됐거나 사분면이 비어 있어 어느 섹션에도 속하지 않는 앵글입니다."
            count={others.length}
          />
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {others.map(a => <AngleItem key={a.id} a={a} />)}
          </div>
        </section>
      )}

      <footer style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-5)' }}>
        <Button variant="outline" onClick={() => { window.location.href = `/analyze/${projectId}/review` }}>
          검수 화면으로 돌아가기
        </Button>
      </footer>
    </>,
  )
}
