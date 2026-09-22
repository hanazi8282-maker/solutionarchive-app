'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
// 디자인 시스템 원본 폴더(JSX)를 직접 import 하던 것을 앱 사본(app/_ds, TSX)으로 통일한다 —
// 같은 모양이지만 다른 화면들과 한 벌을 쓰고 타입 검사를 받는다.
import { Badge } from '../../../_ds/components/Badge'
import { Card } from '../../../_ds/components/Card'
import { Button, ButtonLink } from '../../../_ds/components/Button'
import { EmptyState } from '../../../_ds/components/EmptyState'
import { Field, Textarea } from '../../../_ds/components/Field'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../../../_ds/components/Shell'
import { VERDICT_LABEL } from '@/lib/analysis/aspect-verdict'
import { AdvisorLoader } from '../advisor-cards'
import {
  ANGLE_READY_STATUSES,
  ANGLE_TYPE_LABELS,
  OUTPUT_TYPE_LABELS,
  PERSONA_ROLE_LABELS,
  PURPOSE_LABELS,
  QUADRANT_SHORT_LABELS,
  SUBSTANTIATION_VERDICT_LABELS,
  isInternalOutput,
  type AnalysisMode,
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
  adaptation_suggestion: string | null
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
  mode: AnalysisMode
  maturity_stage: number | null
  competitor_url: string | null
  product_elevator_pitch: string
}

// 앵글이 만들어지려면 검수가 끝나 있어야 한다(status 전이: reviewed → angled → done).
const ANGLE_READY = ANGLE_READY_STATUSES

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

// ── 각색 제안 (reverse 모드 전용) ──────────────────────────────
// 경쟁사 앵글을 역산한 것이므로, forward 모드 프로젝트에서는 애초에 백엔드가
// null 로 두고 보내지도 않는다. project.mode 로도 한 번 더 가드한다.
function AdaptationSuggestion({ a, isReverse }: { a: AngleRow; isReverse: boolean }) {
  if (!isReverse || !a.adaptation_suggestion) return null
  return (
    <div style={{
      marginTop: 10,
      background: 'var(--surface-muted)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)',
    }}>
      <div className="dgy-caps" style={{ marginBottom: 4 }}>각색 제안 · 경쟁사 앵글 → 내 상품</div>
      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>
        {a.adaptation_suggestion}
      </p>
    </div>
  )
}

// ── 실전 채택 표시 ────────────────────────────────────────────
// 사람이 명시적으로 "이 앵글 실전에서 써봤고 됐다"고 기록하는 지점. 자동
// 트리거 없음 — 이 버튼을 눌러야만 validated_angles_corpus 에 쌓인다.
// 화려한 UI 불필요(남헌 혼자 쓸 내부 도구) — 확인 다이얼로그 대신 인라인
// 확장 패널 + outcome_note 입력칸 하나로 충분하다.
function ValidateAction({ a }: { a: AngleRow }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!note.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/analyze/angle/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angle_id: a.id, outcome_note: note.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? '저장하지 못했습니다.')
        return
      }
      setDone(true)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ marginTop: 10 }}>
        <Badge tone="success" size="sm" dot>실전 채택으로 기록됨</Badge>
      </div>
    )
  }

  // 행동은 배지가 아니라 버튼으로 — 배지는 상태 표시용이다(디자인 시스템 규칙).
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} style={{ marginTop: 10, marginRight: 8 }}>
        실전 채택 표시
      </Button>
    )
  }

  return (
    <div style={{
      marginTop: 10,
      background: 'var(--surface-muted)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)',
      display: 'grid',
      gap: 'var(--space-2)',
    }}>
      {/* 전에는 라벨 없는 textarea 에 존재하지 않는 토큰(--surface)을 배경으로 썼다. */}
      <Field label="실전에서 어떻게 됐나요? (필수)" htmlFor={`validate-${a.id}`}>
        <Textarea
          id={`validate-${a.id}`}
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          placeholder="예: 이 카피로 바꾼 뒤 클릭률이 올랐다"
        />
      </Field>
      {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--danger-fg)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={submit} disabled={submitting || !note.trim()}>
          {submitting ? '저장 중...' : '기록'}
        </Button>
        <Button variant="neutral" onClick={() => setOpen(false)}>취소</Button>
      </div>
    </div>
  )
}

// ── 크로스섹션 어드바이저 ─────────────────────────────────────
// 렌더링·fetch 는 ../advisor-cards.tsx 한 벌이다(검수 화면의 PMF 패널과 공유). 여기서는 앵글 id 만 넘긴다.
function AdvisorPanel({ a }: { a: AngleRow }) {
  return <AdvisorLoader query={`angle_id=${encodeURIComponent(a.id)}`} />
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
function ConsumerAngleCard({ a, isReverse }: { a: AngleRow; isReverse: boolean }) {
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
      <AdaptationSuggestion a={a} isReverse={isReverse} />
      <ValidateAction a={a} />
      <AdvisorPanel a={a} />
      <RewritePanel a={a} open={open} />
    </Card>
  )
}

// ── 내부 메모 카드 ────────────────────────────────────────────
// 소비자 노출 카피와 절대 헷갈리면 안 되므로 surface·테두리·타이포를 전부 다르게 준다.
function InternalMemoCard({ a, isReverse }: { a: AngleRow; isReverse: boolean }) {
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
        <AdaptationSuggestion a={a} isReverse={isReverse} />
        <ValidateAction a={a} />
        <AdvisorPanel a={a} />
        <RewritePanel a={a} open={open} />
      </div>
    </div>
  )
}

function AngleItem({ a, isReverse }: { a: AngleRow; isReverse: boolean }) {
  return isInternalOutput(a.output_type)
    ? <InternalMemoCard a={a} isReverse={isReverse} />
    : <ConsumerAngleCard a={a} isReverse={isReverse} />
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
    // load() 첫 줄의 setLoading(true) 가 동기라 규칙에 걸린다. projectId 가 바뀔
    // 때마다 다시 불러오면서 로딩 표시를 켜야 하므로 useState 초기값으로는
    // 대체되지 않는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (projectId) load()
  }, [projectId, load])

  const reviewHref = `/analyze/${projectId}/review`
  // 공용 PageShell — 전에는 모바일에서도 좌우 32px 고정 여백이었다.
  const page = (children: React.ReactNode) => <PageShell maxWidth={960}>{children}</PageShell>

  if (loading) {
    return page(
      <>
        <PageHeader title="소구 앵글" />
        <p role="status" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>불러오는 중…</p>
      </>,
    )
  }

  if (error) {
    return page(
      <>
        <PageHeader title="소구 앵글" />
        <Card padded={false}>
          <EmptyState
            tone="danger"
            title="앵글을 불러오지 못했습니다"
            description={`${error} — 앵글이 없다는 뜻이 아닙니다.`}
            action={<Button variant="neutral" onClick={load}>다시 시도</Button>}
          />
        </Card>
      </>,
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
  const isReverse = project?.mode === 'reverse'

  // ── 빈 상태 ─────────────────────────────────────────────────
  if (project && !ANGLE_READY.includes(project.status)) {
    return page(
      <EmptyState
        tone="info"
        title="아직 검수가 끝나지 않았습니다"
        description={`앵글은 검수 완료(reviewed) 후에 생성됩니다. 현재 상태는 '${project.status}' 입니다.`}
        action={<ButtonLink href={reviewHref} variant="primary">검수 화면으로</ButtonLink>}
      />,
    )
  }

  if (angles.length === 0) {
    return page(
      <EmptyState
        title="생성된 앵글이 없습니다"
        description="검수 화면에서 '앵글 생성'을 실행하면 차별화 속성별 카피 초안이 만들어집니다."
        action={<ButtonLink href={reviewHref} variant="primary">검수 화면으로</ButtonLink>}
      />,
    )
  }

  return page(
    <>
      {/* ── 헤더 ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <PageHeader
          title="소구 앵글"
          subtitle="차별화 기회에서 뽑은 카피 초안 · 실증 게이트 통과분"
          action={<ButtonLink href={reviewHref} variant="outline" size="sm">← 검수 화면</ButtonLink>}
        />
        {/* 배지 세 개로 흘려보내던 숫자를 타일로 올린다 — 숫자마다 무엇을 몇 건 중에서 셌는지 적는다. */}
        <StatGrid min={160}>
          <StatTile
            label="앵글"
            value={visible.length}
            caption={rewrittenCount > 0
              ? `게이트 재작성 ${rewrittenCount}건 포함 · 카피 소재가 아닌 사분면은 제외`
              : '카피 소재가 아닌 사분면은 제외'}
          />
          <StatTile
            label="차별화"
            value={differentiators.length}
            tone={differentiators.length > 0 ? 'info' : undefined}
            caption={`앵글 ${visible.length}건 중 · 카피의 주인공`}
          />
          <StatTile label="기본기" value={tableStakes.length} caption="이미 시장 표준인 속성" />
        </StatGrid>
      </div>

      {/* 고정 한 줄. 이 화면의 산출물이 어디까지인지 매번 같은 문장으로 못 박는다(설계 §3-1 8). */}
      <Notice tone="warning">
        여기까지가 초안이다. 실제 상세페이지 문구는 사실 확인·표시광고 검토·자사 톤 조정을 거쳐야 하고, 이 도구는 그걸 하지 않는다.
      </Notice>

      {/* ── 프로젝트 요약 ──────────────────────────────────── */}
      {project && (
        <Card padded bodyStyle={{ display: 'grid', gap: 4 }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>
            <span style={{ color: 'var(--text-muted)' }}>상품</span> · {project.product_elevator_pitch}
          </p>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }}>
            {/* URL 은 선택이다(2026-09-23) — 없으면 빈 줄 대신 없다고 적는다. */}
            <span style={{ color: 'var(--text-muted)' }}>경쟁사</span> · {project.competitor_url ?? '(없음)'}
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
          title={`무엇을 앞세울까 — 차별화 앵글 · ${VERDICT_LABEL.PUSH}`}
          desc={`${QUADRANT_SHORT_LABELS.DIFFERENTIATOR} — 중요한데 아직 충족되지 않은 지점. 검수 화면의 “${VERDICT_LABEL.PUSH}” 판정과 같은 뜻입니다. 카피의 주인공입니다. 기회점수 높은 순.`}
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
            {consumerAngles.map(a => <AngleItem key={a.id} a={a} isReverse={isReverse} />)}

            {internalAngles.length > 0 && (
              <>
                <p style={{
                  margin: 'var(--space-2) 0 0', fontSize: 'var(--fs-xs)',
                  color: 'var(--text-muted)',
                }}>
                  아래부터는 카피가 아니라 내부 검토용입니다.
                </p>
                {internalAngles.map(a => <AngleItem key={a.id} a={a} isReverse={isReverse} />)}
              </>
            )}
          </div>
        )}
      </section>

      {/* ── 기본기 ─────────────────────────────────────────── */}
      {(tableStakes.length > 0 || tableStakesAngles.length > 0) && (
        <section>
          <SectionHeading
            title={`무엇을 기본으로 깔까 — 기본기 · ${VERDICT_LABEL.TABLE_STAKES}`}
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
              {tableStakesAngles.map(a => <AngleItem key={a.id} a={a} isReverse={isReverse} />)}
            </div>
          )}
        </section>
      )}

      {/* ── 미분류 ─────────────────────────────────────────── */}
      {others.length > 0 && (
        <section>
          <SectionHeading
            title={`어디에도 못 넣은 것은 — 미분류 · ${VERDICT_LABEL.UNKNOWN}`}
            desc="속성이 삭제됐거나 사분면이 비어 있어 어느 섹션에도 속하지 않는 앵글입니다. 판정에 쓸 값이 없다는 뜻이지, 버리라는 뜻이 아닙니다."
            count={others.length}
          />
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {others.map(a => <AngleItem key={a.id} a={a} isReverse={isReverse} />)}
          </div>
        </section>
      )}

      <footer style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-5)' }}>
        <ButtonLink href={reviewHref} variant="outline">
          검수 화면으로 돌아가기
        </ButtonLink>
      </footer>
    </>,
  )
}
