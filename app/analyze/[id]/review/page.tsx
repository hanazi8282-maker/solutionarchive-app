'use client'

import { useCallback, useEffect, useState } from 'react'
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

export default function AnalyzeReviewPage() {
  const params = useParams<{ id: string }>()
  const projectId = params?.id ?? ''

  const [project, setProject] = useState<ProjectRow | null>(null)
  const [aspects, setAspects] = useState<AspectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/analyze/review?project_id=${encodeURIComponent(projectId)}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '불러오지 못했습니다.'); return }
      setProject(json.project)
      setAspects(json.aspects)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
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

  const confirmedCount = aspects.filter(a => a.human_confirmed).length
  const reviewable = project ? REVIEWABLE.includes(project.status) : false

  if (loading) {
    return <main className="mx-auto max-w-5xl p-8"><p className="text-sm">불러오는 중...</p></main>
  }

  return (
    <main className="mx-auto max-w-5xl p-8 space-y-6">
      <h1 className="text-xl font-semibold">소구점 검수</h1>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-2 text-sm">{error}</div>
      )}
      {notice && (
        <div className="border border-green-300 bg-green-50 text-green-700 rounded p-2 text-sm">{notice}</div>
      )}

      {/* ── 프로젝트 요약 + Stage2 결과 ───────────────────────── */}
      {project && (
        <section className="border rounded p-4 space-y-1 text-sm">
          <p><span className="font-medium">경쟁사 URL</span> · {project.competitor_url}</p>
          <p><span className="font-medium">상품 한 줄 소개</span> · {project.product_elevator_pitch}</p>
          <p><span className="font-medium">분석 목적</span> · {PURPOSE_LABELS[project.purpose] ?? project.purpose}</p>
          {project.seller_own_guess && (
            <p><span className="font-medium">판매자 가설</span> · {project.seller_own_guess}</p>
          )}
          <p>
            <span className="font-medium">상태</span> ·{' '}
            {STATUS_LABELS[project.status] ?? project.status}
          </p>
          {project.status === 'failed' && project.extract_error && (
            <p className="text-red-700">실패 원인 · {project.extract_error}</p>
          )}
          <p>
            <span className="font-medium">시장 성숙도</span> ·{' '}
            {project.maturity_stage ? (MATURITY_LABELS[project.maturity_stage] ?? project.maturity_stage) : '미판정'}
            {project.m_meta_signal ? ' · 카테고리 비교 발화 있음' : ''}
          </p>
          {project.maturity_notes && (
            <p className="text-gray-600">근거 · {project.maturity_notes}</p>
          )}
        </section>
      )}

      {/* ── 속성 검수 ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-medium">속성 {aspects.length}개</h2>
          <span className="text-sm text-gray-500">검수 완료 {confirmedCount}/{aspects.length}</span>
          <button
            type="button"
            className="border rounded px-3 py-1 text-sm disabled:opacity-50"
            onClick={confirmAll}
            disabled={aspects.length === 0 || confirmedCount === aspects.length}
          >
            전체 확인 표시
          </button>
        </div>

        <p className="text-xs text-gray-500">
          기회점수(O = 중요도 + max(중요도 − 만족도, 0))는 DB가 계산합니다. 저장하면 다시 계산됩니다.
        </p>

        {aspects.length === 0 ? (
          <p className="text-sm text-gray-500">
            {project?.status === 'processing'
              ? '분석이 진행 중입니다. 완료되면 이 화면을 새로고침하세요.'
              : project?.status === 'failed'
                ? '분석이 실패해 추출된 속성이 없습니다. 시작 화면에서 재시도하세요.'
                : '추출된 속성이 없습니다. 먼저 분석을 실행하세요.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {aspects.map(a => (
              <li key={a.id} className="border rounded p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    className="flex-1 border rounded p-2 text-sm font-medium"
                    value={a.name}
                    onChange={e => patchAspect(a.id, { name: e.target.value })}
                  />
                  <div className="text-sm whitespace-nowrap pt-2">
                    기회점수 <span className="font-semibold">{a.opportunity_score ?? '—'}</span>
                  </div>
                  <label className="flex items-center gap-1 text-sm whitespace-nowrap pt-2">
                    <input
                      type="checkbox"
                      checked={a.human_confirmed}
                      onChange={e => patchAspect(a.id, { human_confirmed: e.target.checked })}
                    />
                    확인
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <label className="text-xs space-y-1">
                    <span className="block">레이어</span>
                    <select
                      className="w-full border rounded p-1 text-sm"
                      value={a.aspect_layer ?? ''}
                      onChange={e => patchAspect(a.id, { aspect_layer: (e.target.value || null) as AspectLayer | null })}
                    >
                      <option value="">(미지정)</option>
                      {ASPECT_LAYERS.map(l => <option key={l} value={l}>{LAYER_LABELS[l]}</option>)}
                    </select>
                  </label>

                  <label className="text-xs space-y-1">
                    <span className="block">중요도 (0~10)</span>
                    <input
                      type="number" min={0} max={10} step={0.5}
                      className="w-full border rounded p-1 text-sm"
                      value={a.importance ?? ''}
                      onChange={e => patchAspect(a.id, { importance: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>

                  <label className="text-xs space-y-1">
                    <span className="block">만족도 (0~10)</span>
                    <input
                      type="number" min={0} max={10} step={0.5}
                      className="w-full border rounded p-1 text-sm"
                      value={a.satisfaction ?? ''}
                      onChange={e => patchAspect(a.id, { satisfaction: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>

                  <label className="text-xs space-y-1">
                    <span className="block">귀인</span>
                    <select
                      className="w-full border rounded p-1 text-sm"
                      value={a.attribution ?? ''}
                      onChange={e => patchAspect(a.id, { attribution: (e.target.value || null) as Attribution | null })}
                    >
                      <option value="">(미지정)</option>
                      {ATTRIBUTIONS.map(v => <option key={v} value={v}>{ATTRIBUTION_LABELS[v]}</option>)}
                    </select>
                  </label>

                  <label className="text-xs space-y-1">
                    <span className="block">인지 시점</span>
                    <select
                      className="w-full border rounded p-1 text-sm"
                      value={a.pain_timing ?? ''}
                      onChange={e => patchAspect(a.id, { pain_timing: (e.target.value || null) as PainTiming | null })}
                    >
                      <option value="">(미지정)</option>
                      {PAIN_TIMINGS.map(v => <option key={v} value={v}>{PAIN_TIMING_LABELS[v]}</option>)}
                    </select>
                  </label>
                </div>

                <label className="text-xs space-y-1 block">
                  <span className="block">판단 근거</span>
                  <textarea
                    className="w-full border rounded p-2 text-sm"
                    rows={2}
                    value={a.notes ?? ''}
                    onChange={e => patchAspect(a.id, { notes: e.target.value })}
                  />
                </label>

                <p className="text-xs text-gray-500">
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

      {/* ── 저장 ───────────────────────────────────────────────── */}
      <section className="space-y-1 border-t pt-6">
        <button
          type="button"
          className="border rounded px-4 py-2 text-sm disabled:opacity-50"
          onClick={save}
          disabled={saving || aspects.length === 0 || !reviewable}
        >
          {saving ? '저장 중...' : '검수 결과 저장'}
        </button>
        <p className="text-sm text-gray-500">
          {!reviewable
            ? `현재 상태(${project?.status ?? '-'})에서는 검수를 저장할 수 없습니다.`
            : aspects.length === 0
            ? '저장할 속성이 없습니다.'
            : confirmedCount === aspects.length
              ? "저장하면 상태가 'reviewed' 로 바뀝니다."
              : `아직 ${aspects.length - confirmedCount}개가 미확인입니다. 전부 확인해야 'reviewed' 로 넘어갑니다.`}
        </p>
      </section>
    </main>
  )
}
