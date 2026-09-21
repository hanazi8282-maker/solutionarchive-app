'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FacetKey } from '@/lib/analysis/facets'
import { Card } from '../../_ds/components/Card'
import { Button, ButtonLink } from '../../_ds/components/Button'
import { Field, Input, Textarea } from '../../_ds/components/Field'
import { FacetSelects, type FacetValues } from '../../_ds/components/FacetSelects'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'

// 판매자 프로필 — seller_profiles 1행(로그인 이메일당 1행)을 편집한다.
// 여기 저장한 값이 /analyze/new 1단계를 프리필한다. 매번 같은 값을 다시 고르는 일을 없애려는 화면이다.
//
// 3상태(§7.1): 불러오는 중 / 프로필 없음(첫 방문) / 조회 실패. 셋째를 둘째로 접으면
// 빈 폼이 뜨고, 사람이 그 위에 입력해 멀쩡한 행을 덮어쓴다. 그래서 조회 실패면 폼을 안 그린다.

type Profile = {
  pitch: string | null
  market: string | null
  updated_at: string | null
} & Partial<Record<FacetKey, string | null>>

/** 필드 아래 프리필 설명 한 줄. 필드와 붙어 보이게 위 여백을 줄인다. */
const fillNote = { margin: '-10px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)' } as const

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

export default function ProfileSettingsPage() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [loadError, setLoadError] = useState('')
  const [existed, setExisted] = useState(false)

  const [pitch, setPitch] = useState('')
  const [market, setMarket] = useState('')
  const [facets, setFacets] = useState<FacetValues>({})

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  // 이번 화면에서 실제로 저장에 성공했나. savedAt 은 처음 불러온 프로필의 updated_at 으로도
  // 채워지므로, 그걸로 "저장됐다"를 판정하면 아무것도 안 눌러도 다음 걸음이 떠 버린다.
  const [justSaved, setJustSaved] = useState(false)

  const setFacet = useCallback((key: FacetKey, value: string) => {
    setFacets((prev) => ({ ...prev, [key]: value }))
  }, [])

  const apply = useCallback((p: Profile) => {
    setPitch(p.pitch ?? '')
    setMarket(p.market ?? '')
    setFacets({
      bottleneck: p.bottleneck ?? '',
      business_model: p.business_model ?? '',
      buyer_type: p.buyer_type ?? '',
      price_band: p.price_band ?? '',
      purchase_frequency: p.purchase_frequency ?? '',
    })
    setSavedAt(p.updated_at ?? null)
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!alive) return
        if (!res.ok) {
          setLoadError(json?.error ?? `프로필을 불러오지 못했다 (HTTP ${res.status})`)
          setPhase('unavailable')
          return
        }
        if (json?.profile) { apply(json.profile as Profile); setExisted(true) }
        setPhase('ready')
      } catch {
        if (!alive) return
        setLoadError('네트워크 오류로 프로필을 불러오지 못했다.')
        setPhase('unavailable')
      }
    })()
    return () => { alive = false }
  }, [apply])

  async function save() {
    setSaving(true); setSaveError(''); setJustSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch: pitch.trim(), market: market.trim(), ...facets }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) { setSaveError(json?.error ?? `저장에 실패했다 (HTTP ${res.status})`); return }
      apply(json.profile as Profile)
      setExisted(true)
      setJustSaved(true)
    } catch {
      setSaveError('네트워크 오류가 발생했다. 저장되지 않았다.')
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <PageHeader
      title="내 프로필"
      subtitle="여기 저장한 값이 새 분석 1단계를 미리 채운다. 매번 같은 걸 다시 고르지 않으려는 자리다."
    />
  )

  if (phase === 'loading') {
    return <PageShell maxWidth={640}>{header}<Card><p style={{ margin: 0, color: 'var(--text-muted)' }}>불러오는 중…</p></Card></PageShell>
  }

  if (phase === 'unavailable') {
    return (
      <PageShell maxWidth={640}>
        {header}
        <Notice tone="danger" title="확인 불가 — 프로필 조회 실패">
          {loadError} · 프로필이 없다는 뜻이 아니다. 지금 저장하면 기존 값을 덮어쓸 수 있어 폼을 열지 않는다.
        </Notice>
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth={640}>
      {header}

      <Card
        title="판매자 프로필"
        subtitle={existed ? undefined : '아직 저장된 프로필이 없다 (조회는 정상). 지금 채우면 다음 분석부터 자동으로 들어간다.'}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="상품 한 줄 소개" htmlFor="pitch" hint="무엇을 누구에게 파는지 한 문장. 새 분석의 한 줄 소개 기본값이 된다.">
            <Textarea id="pitch" rows={2} value={pitch} onChange={(e) => setPitch(e.target.value)} />
          </Field>

          <p style={fillNote}>↑ 이 값이 새 분석 1단계의 &ldquo;상품 한 줄 소개&rdquo;를 프리필한다.</p>

          <Field label="시장" htmlFor="market" hint="예: 국내 유산균 건기식. 선례를 고를 때 낱말이 겹치는지 보는 데 쓴다.">
            <Input id="market" type="text" value={market} onChange={(e) => setMarket(e.target.value)} />
          </Field>
          <p style={fillNote}>↑ 이 값이 새 분석 1단계의 &ldquo;시장&rdquo;을 프리필한다.</p>

          {/* 칸마다 프리필 설명 — hintSuffix 는 이 화면만 준다(/analyze/new 는 이미 1단계라 같은 말이 필요 없다). */}
          <FacetSelects values={facets} onChange={setFacet} idPrefix="profile_" hintSuffix="새 분석 1단계를 프리필한다" />
          <p style={fillNote}>↑ 비어 있는 칸만 프리필하므로 1단계에서 고쳐 쓸 수 있다.</p>

          {saveError && <Notice tone="danger">{saveError}</Notice>}

          <Button variant="primary" size="lg" fullWidth onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '프로필 저장'}
          </Button>

          {/* 저장 다음 걸음. 여기까지 왔으면 할 일은 하나다 — 이 값으로 분석을 돌리는 것. */}
          {justSaved && !saveError && (
            <Notice tone="success" title="저장했다 — 다음 분석 1단계가 이 값으로 채워진다"
              action={<ButtonLink href="/analyze/new" variant="primary" size="sm">새 분석 시작</ButtonLink>}
            />
          )}

          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }} aria-live="polite">
            {savedAt
              ? `마지막 저장 ${KST.format(Date.parse(savedAt))} KST`
              : '아직 저장한 적 없음'}
            {' · '}고른 값은 선례를 거르는 데 쓰지 않고 정렬에만 쓴다. 틀리게 골라도 사례가 사라지지는 않는다.
          </p>
        </div>
      </Card>
    </PageShell>
  )
}
