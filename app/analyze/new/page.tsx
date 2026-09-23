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
import { FACET_KEYS, type FacetKey } from '@/lib/analysis/facets'
import { Card } from '../../_ds/components/Card'
import { Badge } from '../../_ds/components/Badge'
import { Button } from '../../_ds/components/Button'
import { Choice, Field, Input, Select, Textarea, labelStyle } from '../../_ds/components/Field'
import { FacetSelects, type FacetValues } from '../../_ds/components/FacetSelects'
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

/**
 * 이 분석이 답하는 질문. **화면 안내문이지 데이터가 아니다** — 어느 프로젝트에서도
 * 같은 세 줄이 뜬다. 결과 화면의 섹션 제목과 같은 질문을 미리 보여 주는 것이 목적이다.
 */
const ANSWERS = [
  '이 시장에서 무엇이 가장 아픈가?',
  '그중 아직 아무도 채우지 않은 자리는 어디인가?',
  '남들은 같은 문제를 어떻게 풀었나?',
] as const

/** 단계 진행 표시 — 카드 오른쪽 위 "n/3". StepIndicator 와 같은 값을 카드 안에서 다시 짚는다. */
function StepOf({ n }: { n: 1 | 2 | 3 }) {
  return <Badge tone="neutral" size="sm">{n}/{STEPS.length}</Badge>
}

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

  // 1단계: PMF 진단 입력(패싯 6개) — 전부 선택. 비어 있으면 결과 화면이 그 자리에서 다시 받는다.
  const [market, setMarket] = useState('')
  const [facets, setFacets] = useState<FacetValues>({})
  const [saveProfile, setSaveProfile] = useState(false)
  const [profileNote, setProfileNote] = useState('')
  // 프리필이 실제로 값을 넣었을 때만 출처를 적는다. 프로필이 없거나 조회가 실패한 경우에도
  // "프로필에서 왔다"고 적으면, 사람이 직접 친 값을 프로필 값으로 착각한다.
  const [prefilled, setPrefilled] = useState(false)

  // 2단계: 수집 원문
  const [sourceType, setSourceType] = useState<AnalysisSourceType>('review')
  const [rawText, setRawText] = useState('')
  const [inputs, setInputs] = useState<InputRow[]>([])
  const [adding, setAdding] = useState(false)
  const [inputError, setInputError] = useState('')

  // 2단계 두 번째 길: 다나와 URL 등록 → 야간 수집이 원문을 채운다.
  const [danawaUrl, setDanawaUrl] = useState('')
  const [registering, setRegistering] = useState(false)
  const [targetError, setTargetError] = useState('')
  const [targetNote, setTargetNote] = useState('')

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

  const setFacet = useCallback((key: FacetKey, value: string) => {
    setFacets((prev) => ({ ...prev, [key]: value }))
  }, [])

  /**
   * 저장된 프로필로 1단계를 미리 채운다. **비어 있는 칸만** 채운다 — 사람이 이미 친 값을
   * 나중에 도착한 응답이 덮으면, 고쳐 적은 내용이 눈앞에서 사라진다.
   * 프로필이 없거나 조회가 실패해도 새 분석은 그대로 돌아간다(막지 않는다).
   */
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json().catch(() => null)
        const p = json?.profile as Record<string, string | null> | null | undefined
        if (!p || !alive) return
        // "프로필 값으로 채웠다" 는 실제로 빈 칸을 채웠을 때만 참이다 — 사람이 먼저 친 값을 건너뛰었으면
        // 아무것도 안 채운 것이고, 그때 배너가 뜨면 이 주석 위의 걱정(덮어썼다는 오해)이 그대로 생긴다.
        let filled = false
        setPitch((v) => { if (v.trim() || !p.pitch) return v; filled = true; return p.pitch })
        setMarket((v) => { if (v.trim() || !p.market) return v; filled = true; return p.market })
        // 경쟁사 URL 은 **서버 경유로만** 온다 — 쿼리스트링으로 넘기면 사용자 입력 URL 이
        // 리퍼러·액세스 로그에 남는다. 여기서도 이미 친 값은 덮지 않는다.
        setCompetitorUrl((v) => { if (v.trim() || !p.competitor_url) return v; filled = true; return p.competitor_url as string })
        setFacets((prev) => {
          const next = { ...prev }
          // 키 목록을 이 파일에 다시 적지 않는다(전에는 5개를 손으로 적어 뒀다) — 패싯이 늘면
          // 여기만 안 늘어나고, 그 칸은 프로필에 있는데도 영영 프리필되지 않는다.
          for (const k of FACET_KEYS) {
            if (!next[k] && p[k]) { next[k] = p[k] as string; filled = true }
          }
          return next
        })
        // 위 updater 들은 다음 렌더 전에 돈다 — 그 뒤에 읽어야 filled 가 맞다.
        setPrefilled(() => filled)
      } catch {
        // 프리필 실패는 입력을 막지 않는다. 빈 폼으로 계속 쓴다.
      }
    })()
    return () => { alive = false }
  }, [])

  async function createProject() {
    // forward 는 URL 없이도 만든다(남헌 2026-09-23 Q4-A). reverse 는 역설계할 대상이
    // 곧 그 URL 이라 여전히 필수다 — 서버도 다나와 URL 을 다시 검사한다.
    if (mode === 'reverse' && !competitorUrl.trim()) {
      setProjectError('역설계할 성공 상품 URL(다나와)을 입력해주세요.')
      return
    }
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
          market:                 market.trim(),
          ...facets,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setProjectError(json.error ?? '프로젝트 생성에 실패했습니다.'); return }
      setProjectId(json.project.id)
      if (saveProfile) await saveToProfile()
    } catch {
      setProjectError('네트워크 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }

  /** 프로젝트가 만들어진 **뒤에** 프로필을 쓴다. 프로필 저장이 실패해도 프로젝트는 살아 있다. */
  async function saveToProfile() {
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch: pitch.trim(), market: market.trim(), ...facets }),
      })
      const json = await res.json().catch(() => null)
      setProfileNote(res.ok
        ? '프로필에도 저장했다. 다음 분석은 이 값으로 미리 채워진다.'
        : `프로젝트는 만들어졌지만 프로필 저장은 실패했다: ${json?.error ?? `HTTP ${res.status}`}`)
    } catch {
      setProfileNote('프로젝트는 만들어졌지만 프로필 저장은 네트워크 오류로 실패했다.')
    }
  }

  /**
   * 다나와 상품 URL 을 수집 대상으로 등록한다. 지금 원문이 생기는 게 아니라 **오늘 밤**
   * 수집 루프가 이 대상을 주워 간다. 소스는 danawa 하나만 연다 — 다른 소스는 robots·ToS
   * 판단이 들어가고, 그건 사람이 마이그레이션으로만 추가한다(CLAUDE.md §10.1).
   */
  async function registerTarget() {
    if (!danawaUrl.trim()) { setTargetError('다나와 상품 URL을 입력해주세요.'); return }

    setRegistering(true); setTargetError(''); setTargetNote('')
    try {
      const res = await fetch('/api/analyze/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:      projectId,
          source_key:      'danawa',
          product_ref_raw: danawaUrl.trim(),
        }),
      })
      const json = await res.json().catch(() => null)
      // 서버 메시지를 그대로 보여준다. 어떤 URL 이 왜 안 되는지는 그쪽이 정확히 안다.
      if (!res.ok) { setTargetError(json?.error ?? `수집 대상 등록에 실패했습니다. (HTTP ${res.status})`); return }
      setTargetNote(`${json?.created === false ? '이미 등록된 대상이다. ' : '등록했다. '}내일 아침 원문이 채워진다. 지금은 붙여넣기로도 시작할 수 있다.`)
      setDanawaUrl('')
    } catch {
      setTargetError('네트워크 오류가 발생했습니다.')
    } finally {
      setRegistering(false)
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
        action={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <StepOf n={1} />
            {locked ? <Badge tone="success" dot>생성됨</Badge> : null}
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          {/* 프리필 출처. 어디서 온 값인지 안 적으면, 사람이 안 친 값이 들어와 있는 것을 보고 멈춘다. */}
          {prefilled && (
            <p style={muted}>
              비어 있던 칸은 <a href="/settings/profile">내 프로필</a>에 저장된 값으로 미리 채웠다(이미 입력한 칸은 건드리지 않는다).
            </p>
          )}
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
            label={mode === 'reverse'
              ? <>역설계할 성공 상품 URL (다나와){REQ}</>
              : <>경쟁사·비교 대상 URL (선택)</>}
            htmlFor="competitor_url"
            // forward 에서만 선택이다 — reverse 는 그 URL 이 곧 분석 대상이라 서버가 다나와
            // URL 을 다시 요구한다. 빈 값은 서버가 NULL 로 저장한다.
            hint={mode === 'reverse'
              ? '지금은 다나와 상품 상세 URL만 역방향 분석이 가능합니다. 스마트스토어·쿠팡·G2·Capterra 등은 아직 지원하지 않습니다.'
              : '아직 제품이 없으면 비워 두고 아래에 고객 경험담을 붙여넣으세요. 경쟁사가 있으면 그 상품 URL을 적습니다.'}
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

          {/*
            PMF 진단 입력. 여기서 안 받아도 분석은 돌고, 결과 화면이 그 자리에서 다시 받는다.
            그래서 필수로 만들지 않는다 — 6칸을 먼저 세우면 첫 분석까지 가는 사람이 줄어든다.
          */}
          <fieldset style={fieldsetReset} disabled={locked}>
            <legend style={{ ...labelStyle, padding: 0, marginBottom: 4 }}>PMF 진단 입력</legend>
            <p style={{ ...muted, marginBottom: 12 }}>나중에 결과 화면에서도 채울 수 있다. 선례를 거르는 데 쓰지 않고 정렬에만 쓴다.</p>
            <div style={{ display: 'grid', gap: 14 }}>
              <Field label="시장" htmlFor="market" hint="예: 국내 유산균 건기식">
                <Input id="market" type="text" value={market} onChange={e => setMarket(e.target.value)} disabled={locked} />
              </Field>
              <FacetSelects values={facets} onChange={setFacet} disabled={locked} idPrefix="new_" />
              <Choice
                type="checkbox"
                checked={saveProfile}
                onChange={e => setSaveProfile(e.target.checked)}
                disabled={locked}
                label="이 값을 내 프로필로 저장"
                hint="다음 분석부터 1단계가 이 값으로 미리 채워진다. /설정 → 내 프로필에서 언제든 고친다."
              />
            </div>
          </fieldset>

          {projectError && <Notice tone="danger">{projectError}</Notice>}
          {profileNote && <Notice tone={profileNote.startsWith('프로필에도') ? 'success' : 'warning'}>{profileNote}</Notice>}

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
          subtitle="길은 둘이다. 지금 붙여넣거나, 다나와 상품 URL 을 걸어 두고 밤에 모은다. 둘 다 해도 된다."
          action={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <StepOf n={2} />
              <Badge tone={inputs.length ? 'info' : 'neutral'}>{inputs.length}개</Badge>
            </div>
          }
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <p style={{ ...muted, fontWeight: 600, color: 'var(--text-body)' }}>가. 지금 붙여넣기</p>
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

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

            {/*
              두 번째 길. 지금 원문이 생기는 게 아니다 — 대상만 등록하고 야간 수집 루프가 채운다.
              그걸 명시하지 않으면 사람이 등록 직후 "분석 시작"을 누르고 0건으로 실패한다.
              소스는 danawa 하나만 연다(review_sources.enabled).
            */}
            <p style={{ ...muted, fontWeight: 600, color: 'var(--text-body)' }}>나. 다나와 상품 URL 로 등록하고 밤에 수집</p>
            <Field
              label="다나와 상품 URL"
              htmlFor="danawa_url"
              hint="상품 상세 URL (예: https://prod.danawa.com/info/?pcode=252495223). 오늘 밤 수집 루프가 이 상품 리뷰를 모은다."
            >
              <Input
                id="danawa_url"
                type="text"
                inputMode="url"
                placeholder="https://prod.danawa.com/info/?pcode="
                value={danawaUrl}
                onChange={e => setDanawaUrl(e.target.value)}
              />
            </Field>

            {targetError && <Notice tone="danger">{targetError}</Notice>}
            {targetNote && <Notice tone="success">{targetNote}</Notice>}

            <div>
              <Button variant="neutral" onClick={registerTarget} disabled={registering}>
                {registering ? '등록 중…' : '수집 대상 등록'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── 3단계 ───────────────────────────────────────── */}
      <Card title="3단계 · 분석 시작" action={<StepOf n={3} />}>
        <div style={{ display: 'grid', gap: 12 }}>
          {/* 버튼을 누르기 전에 무엇이 돌아오는지 적는다. 결과 화면의 섹션 제목과 같은 질문이다. */}
          <div>
            <p style={{ ...muted, fontWeight: 600, color: 'var(--text-body)', marginBottom: 6 }}>이 분석이 답하는 질문</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              {ANSWERS.map((q) => <li key={q} style={muted}>{q}</li>)}
            </ul>
          </div>

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
                ? targetNote
                  ? '수집 대상은 등록됐지만 원문은 아직 0건이다. 원문 없이 시작하면 분석할 재료가 없다 — 내일 아침 목록에서 시작하거나, 지금 붙여넣는다.'
                  : '수집 원문을 1개 이상 추가해야 합니다.'
                : extracting
                  ? '속성 추출과 시장 성숙도 진단을 진행 중입니다. 창을 닫아도 분석은 계속되며, 나중에 검수 화면에서 결과를 볼 수 있습니다.'
                  : '수집한 원문에서 소구점 후보를 추출합니다.'}
          </p>
        </div>
      </Card>
    </PageShell>
  )
}
