'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ANALYSIS_PURPOSES,
  ANALYSIS_MODES,
  ANALYSIS_SOURCE_TYPES,
  PURPOSE_LABELS,
  MODE_LABELS,
  SOURCE_TYPE_LABELS,
  type AnalysisPurpose,
  type AnalysisMode,
  type AnalysisSourceType,
} from '@/lib/analysis/types'
import { Card } from '../../_ds/components/Card'
import { Badge } from '../../_ds/components/Badge'
import { Button } from '../../_ds/components/Button'
import { Choice, Field, Input, Select, Textarea, labelStyle } from '../../_ds/components/Field'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'

type InputRow = {
  id: string
  source_type: AnalysisSourceType
  raw_text: string
}

// 전에는 Tailwind 클래스로 짜여 있었지만 이 리포에는 Tailwind 가 없어 브라우저 기본
// 스타일로 떴다. 표시만 디자인 시스템 컴포넌트로 바꿨다 — 상태·fetch·폴링 로직은 그대로.

const REQ = <span style={{ color: 'var(--danger-fg)' }}> · 필수</span>
const fieldsetReset = { border: 'none', margin: 0, padding: 0, minWidth: 0 } as const
const muted = { margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)' } as const

const STEPS = ['분석 대상', '수집 원문', '분석 시작'] as const

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="진행 단계" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px 0 6px',
              borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 500,
              background: active ? 'var(--info-bg)' : 'var(--surface-card)',
              border: `1px solid ${active ? 'var(--info-border)' : 'var(--border)'}`,
              color: active ? 'var(--info-fg)' : done ? 'var(--text-body)' : 'var(--text-muted)',
            }}
          >
            <span aria-hidden style={{
              width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--slate-200)',
              color: done || active ? '#fff' : 'var(--text-muted)',
            }}>
              {done ? '✓' : n}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

export default function AnalyzeNewPage() {
  const router = useRouter()

  // 1단계: 프로젝트
  const [mode, setMode] = useState<AnalysisMode>('forward')
  const [competitorUrl, setCompetitorUrl] = useState('')
  const [pitch, setPitch] = useState('')
  const [purpose, setPurpose] = useState<AnalysisPurpose | ''>('')
  const [guess, setGuess] = useState('')
  const [projectId, setProjectId] = useState('')
  const [creating, setCreating] = useState(false)
  const [projectError, setProjectError] = useState('')

  // 2단계: 수집 원문
  const [sourceType, setSourceType] = useState<AnalysisSourceType>('review')
  const [rawText, setRawText] = useState('')
  const [inputs, setInputs] = useState<InputRow[]>([])
  const [adding, setAdding] = useState(false)
  const [inputError, setInputError] = useState('')

  // 3단계: 분석 시작 (202 → 폴링)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [timedOut, setTimedOut] = useState(false)

  // 폴링 자원 — 리렌더와 무관하게 유지하고 언마운트 시 전부 정리한다.
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollsRef = useRef(0)

  const locked = Boolean(projectId)

  async function createProject() {
    if (!competitorUrl.trim()) { setProjectError('경쟁사 상품 URL을 입력해주세요.'); return }
    if (!pitch.trim()) { setProjectError('상품 한 줄 소개를 입력해주세요.'); return }
    if (!purpose) { setProjectError('분석 목적을 선택해주세요.'); return }

    setCreating(true); setProjectError('')
    try {
      const res = await fetch('/api/analyze/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_url:         competitorUrl.trim(),
          product_elevator_pitch: pitch.trim(),
          purpose,
          mode,
          seller_own_guess:       guess.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setProjectError(json.error ?? '프로젝트 생성에 실패했습니다.'); return }
      setProjectId(json.project.id)
    } catch {
      setProjectError('네트워크 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }

  async function addInput() {
    if (!rawText.trim()) { setInputError('수집 원문을 입력해주세요.'); return }

    setAdding(true); setInputError('')
    try {
      const res = await fetch('/api/analyze/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:  projectId,
          source_type: sourceType,
          raw_text:    rawText.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setInputError(json.error ?? '입력 추가에 실패했습니다.'); return }
      setInputs(prev => [...prev, {
        id:          json.input.id,
        source_type: json.input.source_type,
        raw_text:    json.input.raw_text,
      }])
      setRawText('')
    } catch {
      setInputError('네트워크 오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }

  // ── 폴링 ────────────────────────────────────────────────────────
  const POLL_INTERVAL_MS = 2000
  const MAX_POLLS = 150 // 2초 × 150 = 5분

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  /** 상태를 한 번 확인한다. 완료/실패면 폴링을 끝낸다. */
  const pollOnce = useCallback(async (id: string) => {
    // 탭이 백그라운드면 요청을 건너뛴다(카운트도 늘리지 않는다).
    if (typeof document !== 'undefined' && document.hidden) return

    if (pollsRef.current >= MAX_POLLS) {
      stopPolling(); setExtracting(false); setTimedOut(true)
      return
    }
    pollsRef.current += 1

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(
        `/api/analyze/extract?project_id=${encodeURIComponent(id)}`,
        { signal: controller.signal, cache: 'no-store' },
      )
      const json = await res.json()
      if (!res.ok) {
        stopPolling(); setExtracting(false)
        setExtractError(json.error ?? '상태 확인에 실패했습니다.')
        return
      }

      if (json.status === 'processing') {
        setElapsedSec(Math.max(0, Math.round((json.elapsed_ms ?? 0) / 1000)))
        return // 계속 폴링
      }
      if (json.status === 'failed') {
        stopPolling(); setExtracting(false)
        setExtractError(json.error ?? '분석에 실패했습니다.')
        return
      }
      // extracted 이후 단계 — 완료
      stopPolling(); setExtracting(false)
      router.push(`/analyze/${id}/review`)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return // 정리 중이면 조용히 무시
      stopPolling(); setExtracting(false)
      setExtractError('네트워크 오류가 발생했습니다.')
    }
  }, [router, stopPolling])

  const beginPolling = useCallback((id: string) => {
    stopPolling()
    pollsRef.current = 0
    timerRef.current = setInterval(() => { void pollOnce(id) }, POLL_INTERVAL_MS)
  }, [pollOnce, stopPolling])

  // 언마운트 시 타이머/요청 정리
  useEffect(() => stopPolling, [stopPolling])

  async function startAnalysis() {
    if (!projectId || inputs.length === 0) return

    setExtracting(true); setExtractError(''); setTimedOut(false); setElapsedSec(0)
    try {
      const res = await fetch('/api/analyze/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()

      // 409(이미 진행 중)도 폴링 대상이다 — 잡은 이미 돌고 있으므로 결과를 기다리면 된다.
      if (!res.ok && res.status !== 409) {
        setExtracting(false)
        setExtractError(json.error ?? '분석에 실패했습니다.')
        return
      }
      beginPolling(projectId)
    } catch {
      setExtracting(false)
      setExtractError('네트워크 오류가 발생했습니다.')
    }
  }

  /** 5분 초과 후 "계속 확인" */
  function keepWaiting() {
    setTimedOut(false); setExtracting(true); beginPolling(projectId)
  }

  const step: 1 | 2 | 3 = !locked ? 1 : inputs.length === 0 ? 2 : 3

  return (
    <PageShell maxWidth={760}>
      <PageHeader
        title="새 소구점 분석"
        subtitle="분석 대상을 정하고, 리뷰 같은 수집 원문을 붙인 뒤 분석을 돌리면 검수 화면으로 넘어간다."
      />

      <StepIndicator current={step} />

      {/* ── 1단계 ───────────────────────────────────────── */}
      <Card
        title="1단계 · 분석 대상"
        subtitle={locked ? '프로젝트가 생성되어 더 이상 수정할 수 없습니다.' : undefined}
        action={locked ? <Badge tone="success" dot>생성됨</Badge> : null}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <fieldset style={fieldsetReset} disabled={locked}>
            <legend style={{ ...labelStyle, padding: 0, marginBottom: 8 }}>분석 방향</legend>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
              {ANALYSIS_MODES.map(m => (
                <Choice
                  key={m}
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  disabled={locked}
                  label={MODE_LABELS[m]}
                  hint={m === 'reverse' ? '남의 성공을 역설계' : undefined}
                />
              ))}
            </div>
          </fieldset>

          <Field
            label={<>{mode === 'reverse' ? '역설계할 성공 상품 URL (다나와)' : '경쟁사 상품 URL'}{REQ}</>}
            htmlFor="competitor_url"
            hint={mode === 'reverse'
              ? '지금은 다나와 상품 상세 URL만 역방향 분석이 가능합니다. 스마트스토어·쿠팡·G2·Capterra 등은 아직 지원하지 않습니다.'
              : undefined}
          >
            <Input
              id="competitor_url"
              type="text"
              inputMode="url"
              placeholder="https://"
              value={competitorUrl}
              onChange={e => setCompetitorUrl(e.target.value)}
              disabled={locked}
            />
          </Field>

          <Field
            label={<>{mode === 'reverse' ? '내 상품 한 줄 소개 (역설계 결과를 어디에 적용할지)' : '만들려는/파는 상품 한 줄 소개'}{REQ}</>}
            htmlFor="product_elevator_pitch"
          >
            <Textarea id="product_elevator_pitch" rows={2} value={pitch} onChange={e => setPitch(e.target.value)} disabled={locked} />
          </Field>

          <fieldset style={fieldsetReset} disabled={locked}>
            <legend style={{ ...labelStyle, padding: 0, marginBottom: 8 }}>분석 목적{REQ}</legend>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
              {ANALYSIS_PURPOSES.map(p => (
                <Choice
                  key={p}
                  type="radio"
                  name="purpose"
                  value={p}
                  checked={purpose === p}
                  onChange={() => setPurpose(p)}
                  disabled={locked}
                  label={PURPOSE_LABELS[p]}
                />
              ))}
            </div>
          </fieldset>

          <Field label="본인이 생각하는 소구점 (없어도 됨)" htmlFor="seller_own_guess">
            <Textarea id="seller_own_guess" rows={2} value={guess} onChange={e => setGuess(e.target.value)} disabled={locked} />
          </Field>

          {projectError && <Notice tone="danger">{projectError}</Notice>}

          {!locked && (
            <div>
              <Button variant="primary" onClick={createProject} disabled={creating}>
                {creating ? '생성 중…' : '프로젝트 생성'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ── 2단계 ───────────────────────────────────────── */}
      {locked && (
        <Card
          title="2단계 · 수집 원문"
          subtitle="리뷰·문의 등 원문을 한 덩어리씩 추가한다. 여러 번 추가할 수 있다."
          action={<Badge tone={inputs.length ? 'info' : 'neutral'}>{inputs.length}개</Badge>}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <Field label="수집 유형" htmlFor="source_type">
              <Select id="source_type" value={sourceType} onChange={e => setSourceType(e.target.value as AnalysisSourceType)}>
                {ANALYSIS_SOURCE_TYPES.map(s => (
                  <option key={s} value={s}>{SOURCE_TYPE_LABELS[s]}</option>
                ))}
              </Select>
            </Field>

            <Field label={<>수집 원문{REQ}</>} htmlFor="raw_text">
              <Textarea id="raw_text" rows={6} value={rawText} onChange={e => setRawText(e.target.value)} />
            </Field>

            {inputError && <Notice tone="danger">{inputError}</Notice>}

            <div>
              <Button variant="neutral" onClick={addInput} disabled={adding}>
                {adding ? '추가 중…' : '원문 추가'}
              </Button>
            </div>

            {inputs.length === 0 ? (
              <p style={muted}>아직 추가된 원문이 없습니다.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {inputs.map(row => (
                  <li key={row.id} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-muted)', fontSize: 'var(--fs-sm)', lineHeight: 1.55,
                  }}>
                    <Badge tone="neutral" size="sm" style={{ flex: 'none', marginTop: 1 }}>{SOURCE_TYPE_LABELS[row.source_type]}</Badge>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {row.raw_text.slice(0, 100)}{row.raw_text.length > 100 ? '…' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {/* ── 3단계 ───────────────────────────────────────── */}
      <Card title="3단계 · 분석 시작">
        <div style={{ display: 'grid', gap: 12 }}>
          {extractError && (
            <Notice tone="danger" action={<Button variant="outline" size="sm" onClick={startAnalysis}>다시 시도</Button>}>
              {extractError}
            </Notice>
          )}

          {timedOut && (
            <Notice tone="warning" action={<Button variant="outline" size="sm" onClick={keepWaiting}>계속 확인</Button>}>
              5분이 지났는데 아직 끝나지 않았습니다. 분석은 계속 진행 중일 수 있습니다.
            </Notice>
          )}

          <div>
            <Button variant="primary" size="lg" disabled={inputs.length === 0 || extracting} onClick={startAnalysis}>
              {extracting ? `분석 중… ${elapsedSec}초` : '분석 시작'}
            </Button>
          </div>
          <p style={muted} aria-live="polite">
            {!locked
              ? '1단계에서 프로젝트를 먼저 만들어야 합니다.'
              : inputs.length === 0
                ? '수집 원문을 1개 이상 추가해야 합니다.'
                : extracting
                  ? '속성 추출과 시장 성숙도 진단을 진행 중입니다. 창을 닫아도 분석은 계속되며, 나중에 검수 화면에서 결과를 볼 수 있습니다.'
                  : '수집한 원문에서 소구점 후보를 추출합니다.'}
          </p>
        </div>
      </Card>
    </PageShell>
  )
}
