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
import { aspectVerdict, opportunityBreakdown, type AspectVerdictCode } from '@/lib/analysis/aspect-verdict'
import { extractStatsLabel, type ExtractStats } from '@/lib/analysis/extract-stats'
import { Card } from '../../../_ds/components/Card'
import { Badge, type Tone } from '../../../_ds/components/Badge'
import { Button, ButtonLink } from '../../../_ds/components/Button'
import { EmptyState } from '../../../_ds/components/EmptyState'
import { EvidenceCaption } from '../../../_ds/components/EvidenceCaption'
import { Field, Input, Select, Textarea, labelStyle } from '../../../_ds/components/Field'
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
  /** 원문 인용. 서버가 아직 안 보내면 undefined — "0건"과 다르다(§7.1). */
  evidence_quotes?: { text: string; source_type?: string | null }[] | null
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

// 순위 테이블 셀. 40행을 카드로 쌓으면 이름이 첫 화면에 다 안 들어와서 표로 바꿨다.
const th = {
  textAlign: 'left', padding: '8px 10px', fontSize: 'var(--fs-xs)', fontWeight: 600,
  color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
} as const
const td = { padding: '8px 10px', verticalAlign: 'middle', color: 'var(--text-body)' } as const
const tdNum = { ...td, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const

// 판정 배지 색. PUSH 만 눈에 띄게 — 나머지는 "지금 할 일이 아니다" 쪽이라 조용히 둔다.
const VERDICT_TONE: Record<AspectVerdictCode, Tone> = {
  PUSH: 'info',
  TABLE_STAKES: 'success',
  WATCH: 'warning',
  DROP: 'neutral',
  UNKNOWN: 'neutral',
}

function statusTone(status: string): Tone {
  if (status === 'failed') return 'danger'
  if (status === 'processing' || status === 'collecting') return 'info'
  if (status === 'extracted') return 'warning'
  return 'success'
}

/** 속성 카드 앵커. "다음 미확인 속성 ↓" 이 같은 규칙으로 만든다(/cases 의 caseAnchor 와 같은 패턴). */
const aspectAnchor = (id: string) => `aspect-${id}`

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{k}</dt>
      <dd style={{ margin: 0, color: 'var(--text-body)', overflowWrap: 'anywhere' }}>{children}</dd>
    </>
  )
}

/** 숫자·낱말 옆 물음표. 읽기 문장은 lib/analysis/aspect-verdict.ts 가 만든 것을 그대로 쓴다. */
function Hint({ text }: { text: string }) {
  return (
    <abbr
      title={text}
      style={{ marginLeft: 4, cursor: 'help', textDecoration: 'none', color: 'var(--text-faint)', fontSize: 'var(--fs-xs)' }}
    >
      ?
    </abbr>
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
  // "분석 시작" 옆 실측 소요시간 문장. 빈 문자열 = 아직 묻지 않았다(버튼이 없는 상태).
  const [statsLabel, setStatsLabel] = useState('')
  // 상세 패널에 펼친 행. 표시 전용이다 — 저장 payload 에 들어가지 않는다.
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

      // 시작 버튼이 뜰 때만 "보통 얼마나 걸리나"를 묻는다. 못 읽으면 숫자 대신 확인 불가라고 말한다.
      if (canStart(json.project?.status, json.project?.extract_started_at).ok) {
        const s = await fetch('/api/analyze/extract?stats=1', { cache: 'no-store' })
          .then(async r => (r.ok ? ((await r.json()) as ExtractStats) : null))
          .catch(() => null)
        setStatsLabel(extractStatsLabel(s && typeof s.samples === 'number'
          ? { samples: s.samples, median_seconds: s.median_seconds ?? null, p90_seconds: s.p90_seconds ?? null }
          : null))
      }
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

  useEffect(() => {
    // 결과 화면의 `#aspect-<id>` 링크로 들어오면 그 행을 상세 패널에 연다. 스크롤은 브라우저가
    // 앵커로 하고, 여기서는 선택만 맞춘다 — 안 맞추면 스크롤은 그 행인데 패널은 1위 행이라 어긋난다.
    const pick = () => {
      const m = /^#aspect-(.+)$/.exec(window.location.hash)
      if (m) setSelectedId(decodeURIComponent(m[1]))
    }
    pick()
    window.addEventListener('hashchange', pick)
    return () => window.removeEventListener('hashchange', pick)
  }, [])

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

  // 표의 순서 = 순위. 서버가 GET·PUT 양쪽에서 opportunity_score 내림차순(nulls last)으로
  // 내려주므로(app/api/analyze/review/route.ts) 화면에서 다시 정렬하지 않는다 — 정렬을 두 벌
  // 두면 "다음 미확인 속성 ↓" 이 보이는 순서와 어긋난다.
  // 선택한 행이 없으면 1위 행을 편다. 새 useEffect 를 만들지 않으려고 파생값으로만 정한다.
  const selected = aspects.find(a => a.id === selectedId) ?? aspects[0] ?? null
  const selectedIndex = selected ? aspects.findIndex(a => a.id === selected.id) : -1
  // 결정을 내린 자리에서 바로 다음 미확인 속성으로(/cases 의 "다음 케이스 ↓" 와 같은 규칙).
  const nextUnconfirmed = selectedIndex >= 0
    ? aspects.slice(selectedIndex + 1).find(x => !x.human_confirmed)
    : undefined

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
        // 기준 캡션 — 있는 값만 적는다. "원문 N건" 은 이 화면에 오지 않는다(검수 API 가
        // analysis_inputs 를 세지 않고, 이 PR 은 app/api 를 건드리지 않는다). 0 으로 접지 않는다(§7.1).
        meta={aspects.length > 0 ? `소구점 ${aspects.length}개 · 확인 ${confirmedCount}/${aspects.length}` : undefined}
        action={<><ButtonLink href={`/analyze/${projectId}/result`} variant="primary">진단 결과 보기 →</ButtonLink>{hasAngles ? <ButtonLink href={anglesHref} variant="outline">앵글 결과 보기 →</ButtonLink> : null}</>}
      />

      {/* 확인율은 헤더에 붙인다 — 목록 중간에 있으면 스크롤해야 남은 양을 알 수 있었다. */}
      {aspects.length > 0 && (
        <ProgressBar
          value={confirmedCount}
          max={aspects.length}
          tone={confirmedCount === aspects.length ? 'success' : 'info'}
          showLabel
        />
      )}

      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {/* ── 프로젝트 요약 — 한 줄로 접는다. 검수 중에 매번 읽을 값이 아니다 ───── */}
      <Card
        title="프로젝트"
        action={<Badge tone={statusTone(project.status)} dot>{STATUS_LABELS[project.status] ?? project.status}</Badge>}
      >
        {/* 실패 원인은 접지 않는다 — 접힌 칸 안에 있으면 실패한 줄 모르고 검수를 시작한다. */}
        {project.status === 'failed' && project.extract_error && (
          <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-sm)', color: 'var(--danger-fg)', overflowWrap: 'anywhere' }}>
            실패 원인 — {project.extract_error}
          </p>
        )}
        <details className="dgy-details">
          <summary>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.product_elevator_pitch} · {PURPOSE_LABELS[project.purpose] ?? project.purpose}
              {' · 성숙도 '}
              {project.maturity_stage ? (MATURITY_LABELS[project.maturity_stage] ?? project.maturity_stage) : '미판정'}
            </span>
          </summary>
          <dl style={{
            display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '6px 16px',
            margin: '8px 0 0', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)',
          }}>
            <Row k="경쟁사 URL">{project.competitor_url}</Row>
            <Row k="상품 한 줄 소개">{project.product_elevator_pitch}</Row>
            <Row k="분석 목적">{PURPOSE_LABELS[project.purpose] ?? project.purpose}</Row>
            {project.seller_own_guess && <Row k="판매자 가설">{project.seller_own_guess}</Row>}
            <Row k="시장 성숙도">
              {project.maturity_stage ? (MATURITY_LABELS[project.maturity_stage] ?? project.maturity_stage) : '미판정'}
              {project.m_meta_signal ? ' · 카테고리 비교 발화 있음' : ''}
            </Row>
            {project.maturity_notes && <Row k="근거">{project.maturity_notes}</Row>}
          </dl>
        </details>

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
                : '수집된 원문으로 속성(Stage1)·시장 성숙도(Stage2)를 추출합니다.'}
              {/* 실측값이다. 표본 없는 숫자는 내보내지 않는다(lib/analysis/extract-stats.ts). */}
              {!starting && statsLabel ? ` ${statsLabel}. 원문 분량에 따라 더 걸릴 수 있습니다.` : ''}
            </p>
          </div>
        )}
      </Card>

      {/* ── 속성 검수 — 순위 테이블 + 상세 패널 ──────────────────── */}
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
          // ≥1024px 2열(표 | 상세), 좁으면 상세가 표 아래로 — 분기는 styles.css .sa-review-grid (사이드바와 같은 폭)
          <div className="sa-review-grid">
            {/* 표 자체만 가로로 스크롤한다 — 페이지에는 가로 스크롤이 생기지 않는다. */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                overflowX: 'auto', background: 'var(--surface-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
              }}>
                <table
                  aria-labelledby="aspects-title"
                  style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}
                >
                  <thead>
                    <tr>
                      <th scope="col" style={th}>소구점</th>
                      <th scope="col" style={th}>기회점수</th>
                      <th scope="col" style={th}>중요도</th>
                      <th scope="col" style={th}>만족도</th>
                      <th scope="col" style={th}>판정</th>
                      <th scope="col" style={th}>인용</th>
                      <th scope="col" style={th}>확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aspects.map(a => {
                      // 판정은 (중요도, 만족도) 두 값만으로. 선례·사분면과 섞지 않는다(lib/analysis/aspect-verdict.ts).
                      const verdict = aspectVerdict(a.importance, a.satisfaction)
                      // 기회점수 분해는 표시용이다 — DB 생성 컬럼을 덮어쓰지 않는다.
                      const bd = opportunityBreakdown(a.importance, a.satisfaction, a.opportunity_score)
                      const quotes = a.evidence_quotes
                      const isSelected = selected?.id === a.id
                      return (
                        <tr
                          key={a.id}
                          id={aspectAnchor(a.id)}
                          onClick={() => setSelectedId(a.id)}
                          style={{
                            cursor: 'pointer',
                            borderTop: '1px solid var(--border)',
                            background: isSelected ? 'var(--info-bg)' : undefined,
                          }}
                        >
                          <td style={{
                            ...td, minWidth: 160,
                            borderLeft: `3px solid ${a.human_confirmed ? 'var(--success)' : 'transparent'}`,
                          }}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(a.id)}
                              aria-current={isSelected ? 'true' : undefined}
                              style={{
                                background: 'none', border: 0, padding: 0, font: 'inherit', textAlign: 'left',
                                fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer', overflowWrap: 'anywhere',
                              }}
                            >
                              {a.name || '(이름 없음)'}
                            </button>
                            <Hint text={verdict.reading} />
                          </td>
                          <td style={tdNum}>
                            {a.opportunity_score ?? '—'}
                            <Hint text={bd.reading} />
                          </td>
                          <td style={tdNum}>{a.importance ?? '—'}</td>
                          <td style={tdNum}>{a.satisfaction ?? '—'}</td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <Badge tone={VERDICT_TONE[verdict.code]} size="sm" title={verdict.reading}>{verdict.label}</Badge>
                          </td>
                          {/* 인용: 서버가 안 보냈으면(undefined/null) "—", 빈 배열이면 "0". 같은 표시로 뭉개지 않는다(§7.1). */}
                          <td style={tdNum} title={quotes == null ? '서버가 인용을 보내지 않았다 — 확인 불가' : `검증된 인용 ${quotes.length}건`}>
                            {quotes == null ? '—' : quotes.length}
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={a.human_confirmed}
                              onChange={e => patchAspect(a.id, { human_confirmed: e.target.checked })}
                              aria-label={`${a.name || '이름 없는 속성'} 확인`}
                              style={{ accentColor: 'var(--ring)', width: 18, height: 18 }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── 상세 패널 — 표에서 고른 행 하나를 여기서 고친다 ─────────── */}
            {selected && (() => {
              const verdict = aspectVerdict(selected.importance, selected.satisfaction)
              const bd = opportunityBreakdown(selected.importance, selected.satisfaction, selected.opportunity_score)
              const quotes = selected.evidence_quotes
              // 인용의 세 상태를 문장으로 가른다 — 못 받았다 / 없었다 / 있다.
              const quoteMethod = quotes == null
                ? '재분석하면 채워진다'
                : quotes.length === 0
                  ? '추출이 인용을 남기지 않았다'
                  : '최대 2건만 표시'
              return (
                <div style={{
                  minWidth: 0, display: 'grid', gap: 12,
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${selected.human_confirmed ? 'var(--success)' : 'var(--border-strong)'}`,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  padding: 16,
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                    <Field label="속성 이름" htmlFor={`${selected.id}-name`} style={{ flex: '1 1 200px' }}>
                      <Input
                        id={`${selected.id}-name`}
                        value={selected.name}
                        onChange={e => patchAspect(selected.id, { name: e.target.value })}
                        style={{ fontWeight: 600 }}
                      />
                    </Field>
                    <div style={{ minWidth: 72 }}>
                      <div style={labelStyle}>기회점수</div>
                      <div style={{
                        fontSize: 22, fontWeight: 700, lineHeight: '36px',
                        fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)',
                      }}>
                        {selected.opportunity_score ?? '—'}
                      </div>
                    </div>
                  </div>

                  {/* 판정 한 줄 + 점수 분해. 숫자 옆에 "그래서 뭘 해라"가 없으면 검수자가 매번 다시 해석한다. */}
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <Badge tone={VERDICT_TONE[verdict.code]} size="sm" title={verdict.reading}>{verdict.label}</Badge>
                      <span style={{ ...muted, fontSize: 'var(--fs-xs)' }}>{verdict.reading}</span>
                    </div>
                    <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>
                      기회점수 {selected.opportunity_score ?? '—'} = {bd.reading}
                    </p>
                    {bd.mismatch && (
                      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--warning-fg)' }}>
                        저장된 기회점수({bd.stored})와 지금 값으로 다시 푼 값({bd.computed})이 다릅니다 —
                        DB 값이 정본이고, 저장하면 다시 계산됩니다.
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
                    <Field label="레이어" htmlFor={`${selected.id}-layer`}>
                      <Select
                        id={`${selected.id}-layer`}
                        value={selected.aspect_layer ?? ''}
                        onChange={e => patchAspect(selected.id, { aspect_layer: (e.target.value || null) as AspectLayer | null })}
                      >
                        <option value="">(미지정)</option>
                        {ASPECT_LAYERS.map(l => <option key={l} value={l}>{LAYER_LABELS[l]}</option>)}
                      </Select>
                    </Field>

                    <Field label="중요도 (0~10)" htmlFor={`${selected.id}-importance`}>
                      <Input
                        id={`${selected.id}-importance`}
                        type="number" min={0} max={10} step={0.5}
                        value={selected.importance ?? ''}
                        onChange={e => patchAspect(selected.id, { importance: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </Field>

                    <Field label="만족도 (0~10)" htmlFor={`${selected.id}-satisfaction`}>
                      <Input
                        id={`${selected.id}-satisfaction`}
                        type="number" min={0} max={10} step={0.5}
                        value={selected.satisfaction ?? ''}
                        onChange={e => patchAspect(selected.id, { satisfaction: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </Field>

                    <Field label="귀인" htmlFor={`${selected.id}-attribution`}>
                      <Select
                        id={`${selected.id}-attribution`}
                        value={selected.attribution ?? ''}
                        onChange={e => patchAspect(selected.id, { attribution: (e.target.value || null) as Attribution | null })}
                      >
                        <option value="">(미지정)</option>
                        {ATTRIBUTIONS.map(v => <option key={v} value={v}>{ATTRIBUTION_LABELS[v]}</option>)}
                      </Select>
                    </Field>

                    <Field label="인지 시점" htmlFor={`${selected.id}-pain`}>
                      <Select
                        id={`${selected.id}-pain`}
                        value={selected.pain_timing ?? ''}
                        onChange={e => patchAspect(selected.id, { pain_timing: (e.target.value || null) as PainTiming | null })}
                      >
                        <option value="">(미지정)</option>
                        {PAIN_TIMINGS.map(v => <option key={v} value={v}>{PAIN_TIMING_LABELS[v]}</option>)}
                      </Select>
                    </Field>
                  </div>

                  <Field label="판단 근거" htmlFor={`${selected.id}-notes`}>
                    <Textarea
                      id={`${selected.id}-notes`}
                      rows={2}
                      value={selected.notes ?? ''}
                      onChange={e => patchAspect(selected.id, { notes: e.target.value })}
                    />
                  </Field>

                  {/* 원문 인용 — 점수의 출처다. 없으면 "없다"고 말하고 채우는 방법을 같이 준다. */}
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={labelStyle}>원문 인용</div>
                    {quotes && quotes.length > 0
                      ? quotes.slice(0, 2).map((q, qi) => (
                        <blockquote key={qi} style={{
                          margin: 0, paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--border-strong)',
                          fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-body)',
                          overflowWrap: 'anywhere',
                        }}>
                          “{q.text}”
                          {q.source_type ? <span style={{ ...muted, fontSize: 'var(--fs-xs)' }}> — {q.source_type}</span> : null}
                        </blockquote>
                      ))
                      : null}
                    <EvidenceCaption
                      n={quotes == null ? null : Math.min(quotes.length, 2)}
                      total={quotes == null ? null : quotes.length}
                      source="analysis_aspects.evidence_quotes"
                      method={quoteMethod}
                    />
                  </div>

                  <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>
                    페르소나 {selected.persona_role ?? '—'}
                    {selected.proxy_consumption ? ' · 대리소비' : ''}
                    {selected.is_segmentation_axis ? ' · 세그먼트 축' : ''}
                    {selected.value_realization_frequency ? ` · 가치실현 ${selected.value_realization_frequency}` : ''}
                  </p>

                  {nextUnconfirmed ? (
                    <a
                      href={`#${aspectAnchor(nextUnconfirmed.id)}`}
                      onClick={() => setSelectedId(nextUnconfirmed.id)}
                      style={{ fontSize: 'var(--fs-sm)', justifySelf: 'start' }}
                    >
                      다음 미확인 속성 ↓ {nextUnconfirmed.name}
                    </a>
                  ) : (
                    <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>
                      {aspects.some(x => !x.human_confirmed) ? '아래로는 미확인 속성이 없다.' : '미확인 속성이 없다.'}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </section>

      {/* ── PMF 진단 (수요축 · 선례축) + 프로젝트 단위 어드바이저 ──────────── */}
      {/* 속성이 있을 때만 — 추출 전 프로젝트에 "속성 없음 / 미진단" 두 칸을 먼저 보여 주면 첫 행동(분석 시작)을 가린다. */}
      {/* 표 아래에 둔다 — 검수 중 매번 쓰는 것은 표이고, 이 카드가 위에 있으면 첫 화면에서 속성 이름이 밀린다. */}
      {aspects.length > 0 && (
        <PmfPanel
          projectId={projectId}
          opportunityScores={aspects.map(a => a.opportunity_score)}
          pmf={pmf}
          pmfLookupFailed={pmfLookupFailed}
        />
      )}

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
