'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import {
  ASPECT_LAYERS,
  ATTRIBUTIONS,
  PAIN_TIMINGS,
  PURPOSE_LABELS,
  type AnalysisPurpose,
  type AspectLayer,
  type Attribution,
  type PainTiming,
} from '@/lib/analysis/types'
import { canStart } from '@/lib/analysis/extract-gate'
import { Card } from '../../../_ds/components/Card'
import { Badge, type Tone } from '../../../_ds/components/Badge'
import { Button, ButtonLink } from '../../../_ds/components/Button'
import { EmptyState } from '../../../_ds/components/EmptyState'
import { Choice, Field, Input, Select, Textarea, labelStyle } from '../../../_ds/components/Field'
import { ProgressBar } from '../../../_ds/components/ProgressBar'
import { Notice, PageHeader, PageShell } from '../../../_ds/components/Shell'
import { PmfPanel, type PmfLatest } from './pmf-panel'

type AspectRow = {
  id: string
  name: string
  aspect_layer: AspectLayer | null
  importance: number | null
  satisfaction: number | null
  opportunity_score: number | null // DB 계산 컬럼 — 읽기 전용
  attribution: Attribution | null
  pain_timing: PainTiming | null
  persona_role: string | null
  proxy_consumption: boolean | null
  is_segmentation_axis: boolean | null
  value_realization_frequency: string | null
  human_confirmed: boolean
  notes: string | null
}

type ProjectRow = {
  id: string
  competitor_url: string
  product_elevator_pitch: string
  purpose: AnalysisPurpose
  seller_own_guess: string | null
  status: string
  maturity_stage: number | null
  maturity_notes: string | null
  m_meta_signal: boolean | null
  extract_error: string | null
  extract_started_at: string | null
  extract_finished_at: string | null
}

// 검수(저장)가 가능한 상태. 추출 진행중/실패는 제외한다.
const REVIEWABLE = ['extracted', 'reviewed', 'scored', 'angled', 'done']

// 추출 완료를 기다리는 폴링. extract 라우트의 maxDuration=300 보다 짧게 잡는다 —
// 여기서 포기해도 잡은 계속 도므로, 끝난 게 아니라 "확인 못 했다"로 안내한다(§7.1).
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 150 // 2초 × 150 = 5분

const STATUS_LABELS: Record<string, string> = {
  collecting: '수집 중 — 아직 분석하지 않음',
  processing: '분석 진행 중',
  extracted: '추출 완료 — 검수 대기',
  failed: '분석 실패',
  reviewed: '검수 완료',
}

const LAYER_LABELS: Record<AspectLayer, string> = {
  PRODUCT: 'PRODUCT (제품 물성)',
  PROCESS: 'PROCESS (구매·사용)',
  OUTCOME: 'OUTCOME (결과·정체성)',
}

const ATTRIBUTION_LABELS: Record<Attribution, string> = {
  PRODUCT_FAULT: 'PRODUCT_FAULT (제품 탓)',
  USER_FAULT: 'USER_FAULT (사용자 탓)',
  ENVIRONMENT: 'ENVIRONMENT (환경)',
}

const PAIN_TIMING_LABELS: Record<PainTiming, string> = {
  PRE_PURCHASE: 'PRE_PURCHASE (구매 전 인지)',
  POST_PURCHASE: 'POST_PURCHASE (구매 후 인지)',
}

const MATURITY_LABELS: Record<number, string> = {
  1: '1 · 시장창출',
  2: '2 · 주장확장',
  3: '3 · 고유 메커니즘 등장',
  4: '4 · 메커니즘 정제',
  5: '5 · 정체성·재창출',
}

// 전에는 Tailwind 클래스로 짜여 있었지만 이 리포에는 Tailwind 가 없어 브라우저 기본
// 스타일로 떴다. 표시만 디자인 시스템 컴포넌트로 바꿨다 — 상태·fetch·저장 로직은 그대로.

const muted = { margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)' } as const

function statusTone(status: string): Tone {
  if (status === 'failed') return 'danger'
  if (status === 'processing' || status === 'collecting') return 'info'
  if (status === 'extracted') return 'warning'
  return 'success'
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{k}</dt>
      <dd style={{ margin: 0, color: 'var(--text-body)', overflowWrap: 'anywhere' }}>{children}</dd>
    </>
  )
}

export default function AnalyzeReviewPage() {
  const params = useParams<{ id: string }>()
  const projectId = params?.id ?? ''

  const [project, setProject] = useState<ProjectRow | null>(null)
  const [aspects, setAspects] = useState<AspectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [starting, setStarting] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // PMF 선례축(pmf_assessments 최신 1건). null 은 "진단 없음", 조회 실패는 별도 플래그(§7.1).
  const [pmf, setPmf] = useState<PmfLatest | null>(null)
  const [pmfLookupFailed, setPmfLookupFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/analyze/review?project_id=${encodeURIComponent(projectId)}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '불러오지 못했습니다.'); return }
      setProject(json.project)
      setAspects(json.aspects)
      setPmf(json.pmf ?? null)
      setPmfLookupFailed(Boolean(json.pmf_lookup_failed))
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

  function patchAspect(id: string, patch: Partial<AspectRow>) {
    setAspects(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)))
  }

  function confirmAll() {
    setAspects(prev => prev.map(a => ({ ...a, human_confirmed: true })))
  }

  async function save() {
    setSaving(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/analyze/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          aspects: aspects.map(a => ({
            id: a.id,
            name: a.name,
            aspect_layer: a.aspect_layer,
            importance: a.importance,
            satisfaction: a.satisfaction,
            attribution: a.attribution,
            pain_timing: a.pain_timing,
            human_confirmed: a.human_confirmed,
            notes: a.notes,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '저장에 실패했습니다.'); return }

      // 서버가 계산한 opportunity_score 로 갱신
      setAspects(json.aspects)
      setProject(prev => (prev ? { ...prev, status: json.status ?? prev.status } : prev))
      setNotice(
        json.all_confirmed
          ? `저장했습니다. 전체 검수 완료 — 상태가 '${json.status}' 로 변경되었습니다.`
          : `저장했습니다. (미확인 속성이 남아 있어 상태는 '${json.status}' 유지)`,
      )
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 추출(Stage1~2) 시작. 전에는 이 버튼이 새 분석 마법사(app/analyze/new)에만 있어서,
  // 배치로 만들어 둔 collecting 프로젝트는 원문이 아무리 쌓여도 돌릴 방법이 없었다.
  async function startExtract() {
    setStarting(true); setError(''); setNotice(''); setElapsedSec(0)
    try {
      const res = await fetch('/api/analyze/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      // 409(이미 진행 중)는 잡이 이미 돌고 있다는 뜻이라 그대로 기다린다.
      if (!res.ok && res.status !== 409) {
        setError(json.error ?? '분석을 시작하지 못했습니다.')
        return
      }

      for (let i = 1; i <= MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        setElapsedSec(Math.round((i * POLL_INTERVAL_MS) / 1000))

        const poll = await fetch(
          `/api/analyze/extract?project_id=${encodeURIComponent(projectId)}`,
          { cache: 'no-store' },
        )
        const pj = await poll.json()
        if (!poll.ok) { setError(pj.error ?? '상태 확인에 실패했습니다.'); return }
        if (pj.status === 'processing') continue

        await load() // 서버가 남긴 상태·실패 원인·속성을 그대로 다시 읽는다
        if (pj.status === 'failed') setError(pj.error ?? '분석에 실패했습니다.')
        else setNotice(`분석 완료 — 속성 ${pj.aspects_count}개를 추출했습니다.`)
        return
      }

      // 폴링 상한에 걸린 것은 성공도 실패도 아니다(§7.2). 몇 초 기다렸는지 함께 남긴다.
      setError(
        `${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}초 동안 결과를 확인하지 못했습니다 — 실패한 게 아니라 확인 불가입니다. ` +
        '분석은 계속 돌고 있을 수 있으니 잠시 후 새로고침해 상태를 확인하세요.',
      )
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setStarting(false)
    }
  }

  // 앵글 생성은 검수가 끝난(reviewed) 프로젝트에서만 시작할 수 있다.
  // 성공하면 서버가 status 를 'angled' 로 올리므로 결과 화면으로 넘긴다.
  async function generateAngles() {
    setGenerating(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/analyze/angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '앵글 생성에 실패했습니다.')
        return
      }
      window.location.href = `/analyze/${projectId}/angles`
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const confirmedCount = aspects.filter(a => a.human_confirmed).length
  const reviewable = project ? REVIEWABLE.includes(project.status) : false
  // 버튼 노출 판정은 서버 게이트와 같은 함수다(lib/analysis/extract-gate.ts).
  // force 는 쓰지 않는다 — 검수해 둔 aspects 를 화면에서 실수로 날리지 않게, 재분석은 여기서 안 연다.
  const canExtract = project ? canStart(project.status, project.extract_started_at).ok : false
  const canGenerateAngles = project?.status === 'reviewed'
  const hasAngles = project ? ['angled', 'done'].includes(project.status) : false
  const anglesHref = `/analyze/${projectId}/angles`

  if (loading) {
    return (
      <PageShell maxWidth={1040}>
        <PageHeader title="소구점 검수" />
        <p role="status" style={muted}>불러오는 중…</p>
      </PageShell>
    )
  }

  // 프로젝트를 못 읽었으면 "속성 0개 · 추출된 속성이 없습니다"를 그리지 않는다.
  // 전에는 조회 실패와 진짜 0개가 같은 화면이었다(§7.1).
  if (!project) {
    return (
      <PageShell maxWidth={720}>
        <PageHeader title="소구점 검수" />
        <Card padded={false}>
          <EmptyState
            tone="danger"
            title="검수 데이터를 불러오지 못했습니다"
            description={`${error || '프로젝트를 찾지 못했습니다.'} — 속성이 없다는 뜻이 아닙니다.`}
            action={<Button variant="neutral" onClick={load}>다시 시도</Button>}
          />
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        title="소구점 검수"
        subtitle="AI 가 뽑은 속성을 사람이 확인하고 고친다. 전부 확인해 저장하면 앵글을 만들 수 있다."
        action={hasAngles ? <ButtonLink href={anglesHref} variant="outline">앵글 결과 보기 →</ButtonLink> : null}
      />

      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {/* ── 프로젝트 요약 + Stage2 결과 ───────────────────────── */}
      <Card
        title="프로젝트"
        action={<Badge tone={statusTone(project.status)} dot>{STATUS_LABELS[project.status] ?? project.status}</Badge>}
      >
        <dl style={{
          display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '6px 16px',
          margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)',
        }}>
          <Row k="경쟁사 URL">{project.competitor_url}</Row>
          <Row k="상품 한 줄 소개">{project.product_elevator_pitch}</Row>
          <Row k="분석 목적">{PURPOSE_LABELS[project.purpose] ?? project.purpose}</Row>
          {project.seller_own_guess && <Row k="판매자 가설">{project.seller_own_guess}</Row>}
          {project.status === 'failed' && project.extract_error && (
            <Row k="실패 원인"><span style={{ color: 'var(--danger-fg)' }}>{project.extract_error}</span></Row>
          )}
          <Row k="시장 성숙도">
            {project.maturity_stage ? (MATURITY_LABELS[project.maturity_stage] ?? project.maturity_stage) : '미판정'}
            {project.m_meta_signal ? ' · 카테고리 비교 발화 있음' : ''}
          </Row>
          {project.maturity_notes && <Row k="근거">{project.maturity_notes}</Row>}
        </dl>

        {canExtract && (
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <Button variant="primary" onClick={startExtract} disabled={starting}>
              {starting
                ? `분석 중… ${elapsedSec}초`
                : project.status === 'collecting' ? '분석 시작' : '다시 분석'}
            </Button>
            <p style={{ ...muted, fontSize: 'var(--fs-xs)', flex: '1 1 240px' }} aria-live="polite">
              {starting
                ? '수집 원문을 모델에 넘겨 속성을 뽑는 중입니다. 이 화면을 열어 두세요.'
                : '수집된 원문으로 속성(Stage1)·시장 성숙도(Stage2)를 추출합니다. 몇 분 걸립니다.'}
            </p>
          </div>
        )}
      </Card>

      {/* ── PMF 진단 (수요축 · 선례축) + 프로젝트 단위 어드바이저 ──────────── */}
      {/* 속성이 있을 때만 — 추출 전 프로젝트에 "속성 없음 / 미진단" 두 칸을 먼저 보여 주면 첫 행동(분석 시작)을 가린다. */}
      {aspects.length > 0 && (
        <PmfPanel
          projectId={projectId}
          opportunityScores={aspects.map(a => a.opportunity_score)}
          pmf={pmf}
          pmfLookupFailed={pmfLookupFailed}
        />
      )}

      {/* ── 속성 검수 ──────────────────────────────────────────── */}
      <section aria-labelledby="aspects-title" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="aspects-title" style={{ margin: 0, fontSize: 'var(--fs-h3)', fontWeight: 600, color: 'var(--text-strong)' }}>
              속성 {aspects.length}개
            </h2>
            <p style={{ ...muted, fontSize: 'var(--fs-xs)', marginTop: 4 }}>
              기회점수(O = 중요도 + max(중요도 − 만족도, 0))는 DB가 계산합니다. 저장하면 다시 계산됩니다.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={confirmAll}
            disabled={aspects.length === 0 || confirmedCount === aspects.length}
          >
            전체 확인 표시
          </Button>
        </div>

        {aspects.length > 0 && (
          <div>
            <div style={{ ...muted, fontSize: 'var(--fs-xs)', marginBottom: 4 }}>
              검수 완료 {confirmedCount}/{aspects.length}
            </div>
            <ProgressBar
              value={confirmedCount}
              max={aspects.length}
              tone={confirmedCount === aspects.length ? 'success' : 'info'}
              showLabel
            />
          </div>
        )}

        {aspects.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              compact
              tone={project.status === 'failed' ? 'danger' : 'neutral'}
              title={project.status === 'processing' ? '분석 진행 중' : project.status === 'failed' ? '분석 실패' : '추출된 속성 없음'}
              description={project.status === 'processing'
                ? '분석이 진행 중입니다. 완료되면 이 화면을 새로고침하세요.'
                : project.status === 'failed'
                  ? '분석이 실패해 추출된 속성이 없습니다. 위 "다시 분석" 으로 재시도하세요.'
                  : '추출된 속성이 없습니다. 위 "분석 시작" 으로 추출을 실행하세요.'}
            />
          </Card>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {aspects.map(a => (
              <li key={a.id} style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${a.human_confirmed ? 'var(--success)' : 'var(--border-strong)'}`,
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-sm)',
                padding: 16,
                display: 'grid',
                gap: 12,
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                  <Field label="속성 이름" htmlFor={`${a.id}-name`} style={{ flex: '1 1 240px' }}>
                    <Input
                      id={`${a.id}-name`}
                      value={a.name}
                      onChange={e => patchAspect(a.id, { name: e.target.value })}
                      style={{ fontWeight: 600 }}
                    />
                  </Field>
                  <div style={{ minWidth: 72 }}>
                    <div style={labelStyle}>기회점수</div>
                    <div style={{
                      fontSize: 22, fontWeight: 700, lineHeight: '36px',
                      fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)',
                    }}>
                      {a.opportunity_score ?? '—'}
                    </div>
                  </div>
                  <Choice
                    type="checkbox"
                    checked={a.human_confirmed}
                    onChange={e => patchAspect(a.id, { human_confirmed: e.target.checked })}
                    label={a.human_confirmed ? '확인함' : '확인'}
                  />
                </div>

                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
                  <Field label="레이어" htmlFor={`${a.id}-layer`}>
                    <Select
                      id={`${a.id}-layer`}
                      value={a.aspect_layer ?? ''}
                      onChange={e => patchAspect(a.id, { aspect_layer: (e.target.value || null) as AspectLayer | null })}
                    >
                      <option value="">(미지정)</option>
                      {ASPECT_LAYERS.map(l => <option key={l} value={l}>{LAYER_LABELS[l]}</option>)}
                    </Select>
                  </Field>

                  <Field label="중요도 (0~10)" htmlFor={`${a.id}-importance`}>
                    <Input
                      id={`${a.id}-importance`}
                      type="number" min={0} max={10} step={0.5}
                      value={a.importance ?? ''}
                      onChange={e => patchAspect(a.id, { importance: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </Field>

                  <Field label="만족도 (0~10)" htmlFor={`${a.id}-satisfaction`}>
                    <Input
                      id={`${a.id}-satisfaction`}
                      type="number" min={0} max={10} step={0.5}
                      value={a.satisfaction ?? ''}
                      onChange={e => patchAspect(a.id, { satisfaction: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </Field>

                  <Field label="귀인" htmlFor={`${a.id}-attribution`}>
                    <Select
                      id={`${a.id}-attribution`}
                      value={a.attribution ?? ''}
                      onChange={e => patchAspect(a.id, { attribution: (e.target.value || null) as Attribution | null })}
                    >
                      <option value="">(미지정)</option>
                      {ATTRIBUTIONS.map(v => <option key={v} value={v}>{ATTRIBUTION_LABELS[v]}</option>)}
                    </Select>
                  </Field>

                  <Field label="인지 시점" htmlFor={`${a.id}-pain`}>
                    <Select
                      id={`${a.id}-pain`}
                      value={a.pain_timing ?? ''}
                      onChange={e => patchAspect(a.id, { pain_timing: (e.target.value || null) as PainTiming | null })}
                    >
                      <option value="">(미지정)</option>
                      {PAIN_TIMINGS.map(v => <option key={v} value={v}>{PAIN_TIMING_LABELS[v]}</option>)}
                    </Select>
                  </Field>
                </div>

                <Field label="판단 근거" htmlFor={`${a.id}-notes`}>
                  <Textarea
                    id={`${a.id}-notes`}
                    rows={2}
                    value={a.notes ?? ''}
                    onChange={e => patchAspect(a.id, { notes: e.target.value })}
                  />
                </Field>

                <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>
                  페르소나 {a.persona_role ?? '—'}
                  {a.proxy_consumption ? ' · 대리소비' : ''}
                  {a.is_segmentation_axis ? ' · 세그먼트 축' : ''}
                  {a.value_realization_frequency ? ` · 가치실현 ${a.value_realization_frequency}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 저장 — 속성 목록이 길어서 스크롤 중에도 바닥에 붙어 있게 ───────── */}
      <div style={{
        position: 'sticky', bottom: 12, zIndex: 10,
        background: 'var(--surface-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
        padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      }}>
        <Button variant="primary" onClick={save} disabled={saving || aspects.length === 0 || !reviewable}>
          {saving ? '저장 중…' : '검수 결과 저장'}
        </Button>
        <p style={{ ...muted, flex: '1 1 240px' }}>
          {!reviewable
            ? `현재 상태(${project.status})에서는 검수를 저장할 수 없습니다.`
            : aspects.length === 0
              ? '저장할 속성이 없습니다.'
              : confirmedCount === aspects.length
                ? "저장하면 상태가 'reviewed' 로 바뀝니다."
                : `아직 ${aspects.length - confirmedCount}개가 미확인입니다. 전부 확인해야 'reviewed' 로 넘어갑니다.`}
        </p>
      </div>

      {/* ── 앵글 생성 (Stage4) ─────────────────────────────────── */}
      <Card title="앵글 생성" subtitle="차별화 속성별로 카피 초안을 만들고 실증 게이트를 통과시킨다.">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Button
              variant={canGenerateAngles ? 'primary' : 'outline'}
              onClick={generateAngles}
              disabled={generating || !canGenerateAngles}
            >
              {generating ? '앵글 생성 중… (1~2분)' : '앵글 생성'}
            </Button>
            {hasAngles && <ButtonLink href={anglesHref} variant="outline">앵글 결과 보기</ButtonLink>}
          </div>
          <p style={muted} aria-live="polite">
            {canGenerateAngles
              ? '기존 앵글은 교체됩니다.'
              : hasAngles
                ? '이미 앵글이 생성된 프로젝트입니다. 다시 만들려면 검수를 저장해 reviewed 로 되돌리세요.'
                : `앵글 생성은 검수 완료(reviewed) 상태에서만 가능합니다. 현재 상태는 '${project.status}' 입니다.`}
          </p>
        </div>
      </Card>
    </PageShell>
  )
}
