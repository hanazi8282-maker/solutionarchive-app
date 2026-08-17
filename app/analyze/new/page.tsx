'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ANALYSIS_PURPOSES,
  ANALYSIS_SOURCE_TYPES,
  PURPOSE_LABELS,
  SOURCE_TYPE_LABELS,
  type AnalysisPurpose,
  type AnalysisSourceType,
} from '@/lib/analysis/types'

type InputRow = {
  id: string
  source_type: AnalysisSourceType
  raw_text: string
}

export default function AnalyzeNewPage() {
  const router = useRouter()

  // 1단계: 프로젝트
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

  // 3단계: 분석 시작
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')

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

  async function startAnalysis() {
    if (!projectId || inputs.length === 0) return

    setExtracting(true); setExtractError('')
    try {
      const res = await fetch('/api/analyze/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) { setExtractError(json.error ?? '분석에 실패했습니다.'); return }
      router.push(`/analyze/${projectId}/review`)
    } catch {
      setExtractError('네트워크 오류가 발생했습니다.')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-xl font-semibold">새 소구점 분석 프로젝트 시작</h1>

      {/* ── 1단계 ───────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-medium">1단계. 분석 대상 입력</h2>

        {projectError && (
          <div className="border border-red-300 bg-red-50 text-red-700 rounded p-2 text-sm">{projectError}</div>
        )}

        <div className="space-y-1">
          <label htmlFor="competitor_url" className="block text-sm">경쟁사 상품 URL</label>
          <input
            id="competitor_url"
            type="text"
            className="w-full border rounded p-2 text-sm"
            value={competitorUrl}
            onChange={e => setCompetitorUrl(e.target.value)}
            disabled={locked}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="product_elevator_pitch" className="block text-sm">만들려는/파는 상품 한 줄 소개</label>
          <textarea
            id="product_elevator_pitch"
            className="w-full border rounded p-2 text-sm"
            rows={2}
            value={pitch}
            onChange={e => setPitch(e.target.value)}
            disabled={locked}
          />
        </div>

        <fieldset className="space-y-1" disabled={locked}>
          <legend className="text-sm">분석 목적</legend>
          {ANALYSIS_PURPOSES.map(p => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="purpose"
                value={p}
                checked={purpose === p}
                onChange={() => setPurpose(p)}
                disabled={locked}
              />
              {PURPOSE_LABELS[p]}
            </label>
          ))}
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="seller_own_guess" className="block text-sm">본인이 생각하는 소구점 (없어도 됨)</label>
          <textarea
            id="seller_own_guess"
            className="w-full border rounded p-2 text-sm"
            rows={2}
            value={guess}
            onChange={e => setGuess(e.target.value)}
            disabled={locked}
          />
        </div>

        <button
          type="button"
          className="border rounded px-4 py-2 text-sm disabled:opacity-50"
          onClick={createProject}
          disabled={creating || locked}
        >
          {creating ? '생성 중...' : '프로젝트 생성'}
        </button>

        {locked && <p className="text-sm text-green-700">프로젝트가 생성되었습니다.</p>}
      </section>

      {/* ── 2단계 ───────────────────────────────────────── */}
      {locked && (
        <section className="space-y-4 border-t pt-6">
          <h2 className="text-base font-medium">2단계. 수집 원문 추가</h2>

          {inputError && (
            <div className="border border-red-300 bg-red-50 text-red-700 rounded p-2 text-sm">{inputError}</div>
          )}

          <div className="space-y-1">
            <label htmlFor="source_type" className="block text-sm">수집 유형</label>
            <select
              id="source_type"
              className="w-full border rounded p-2 text-sm"
              value={sourceType}
              onChange={e => setSourceType(e.target.value as AnalysisSourceType)}
            >
              {ANALYSIS_SOURCE_TYPES.map(s => (
                <option key={s} value={s}>{SOURCE_TYPE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="raw_text" className="block text-sm">수집 원문</label>
            <textarea
              id="raw_text"
              className="w-full border rounded p-2 text-sm"
              rows={6}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="border rounded px-4 py-2 text-sm disabled:opacity-50"
            onClick={addInput}
            disabled={adding}
          >
            {adding ? '추가 중...' : '추가'}
          </button>

          <div className="space-y-2">
            <p className="text-sm">총 {inputs.length}개</p>
            {inputs.length === 0 ? (
              <p className="text-sm text-gray-500">아직 추가된 입력이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {inputs.map(row => (
                  <li key={row.id} className="border rounded p-2 text-sm">
                    <span className="font-medium">[{SOURCE_TYPE_LABELS[row.source_type]}]</span>{' '}
                    <span>{row.raw_text.slice(0, 100)}{row.raw_text.length > 100 ? '...' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ── 하단 CTA ────────────────────────────────────── */}
      <section className="space-y-1 border-t pt-6">
        {extractError && (
          <div className="border border-red-300 bg-red-50 text-red-700 rounded p-2 text-sm">{extractError}</div>
        )}

        <button
          type="button"
          className="border rounded px-4 py-2 text-sm disabled:opacity-50"
          disabled={inputs.length === 0 || extracting}
          onClick={startAnalysis}
        >
          {extracting ? '분석 중...' : '다음: 분석 시작'}
        </button>
        <p className="text-sm text-gray-500">
          {inputs.length === 0
            ? '수집 원문을 1개 이상 추가해야 합니다.'
            : extracting
              ? '속성 추출과 시장 성숙도 진단을 진행 중입니다. 1분 정도 걸릴 수 있습니다.'
              : '수집한 원문에서 소구점 후보를 추출합니다.'}
        </p>
      </section>
    </main>
  )
}
