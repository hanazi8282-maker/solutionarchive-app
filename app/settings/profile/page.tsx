'use client'

import { useCallback, useEffect, useState } from 'react'
import { FACET_FIELDS, FACET_KEYS, type FacetKey } from '@/lib/analysis/facets'
import { Card } from '../../_ds/components/Card'
import { Button, ButtonLink } from '../../_ds/components/Button'
import { Field, Input, Select, Textarea } from '../../_ds/components/Field'
import { type FacetValues } from '../../_ds/components/FacetSelects'
import { Notice, PageHeader, PageShell } from '../../_ds/components/Shell'

// 판매자 프로필 — seller_profiles 1행(로그인 이메일당 1행)을 편집한다.
// 여기 저장한 값이 /analyze/new 1단계를 프리필한다. 매번 같은 값을 다시 고르는 일을 없애려는 화면이다.
//
// 3상태(§7.1): 불러오는 중 / 프로필 없음(첫 방문) / 조회 실패. 셋째를 둘째로 접으면
// 빈 폼이 뜨고, 사람이 그 위에 입력해 멀쩡한 행을 덮어쓴다. 그래서 조회 실패면 폼을 안 그린다.

type Profile = {
  pitch: string | null
  market: string | null
  /** 마이그 20260930000003 미적용이면 키 자체가 없다 — undefined 는 "안 적었다"가 아니다. */
  competitor_url?: string | null
  updated_at: string | null
} & Partial<Record<FacetKey, string | null>>

/**
 * 어휘 칸 몇 개만 골라 그린다. `_ds/FacetSelects` 는 6개를 통째로 그리는데, 이 화면은
 * **추천에 쓰이는 칸을 위로, 안 쓰이는 칸을 접힘 안으로** 나눠야 한다(설계 §UX 노트).
 * 옵션 목록은 여기서 다시 적지 않고 FACET_FIELDS 를 그대로 읽는다 — 두 곳이 갈라지면
 * 한쪽만 어휘가 늘어나 조용히 어긋난다.
 */
function FacetGroup({ keys, values, onChange, hintSuffix }: {
  keys: readonly FacetKey[]
  values: FacetValues
  onChange: (key: FacetKey, value: string) => void
  hintSuffix?: string
}) {
  return (
    <>
      {FACET_FIELDS.filter((f) => keys.includes(f.key)).map((f) => {
        const v = values[f.key] ?? ''
        const picked = f.options.find((o) => o.value === v)
        const id = `profile_${f.key}`
        const base = picked && picked.hint ? picked.hint : f.hint
        const hint = hintSuffix ? `${base} · ${hintSuffix}` : base
        return (
          <Field key={f.key} label={f.label} htmlFor={id} hint={hint}>
            <Select id={id} value={v} onChange={(e) => onChange(f.key, e.target.value)}>
              <option value="">선택 안 함</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        )
      })}
    </>
  )
}

/** 추천에 쓰이는 칸(위)과 지금 추천 순서를 바꾸지 않는 칸(접힘). 숨기지 않고 접기만 한다. */
const RANKING_KEYS: readonly FacetKey[] = ['reader_problem', 'bottleneck']
const SORTING_KEYS: readonly FacetKey[] = ['business_model']
const UNUSED_KEYS: readonly FacetKey[] = FACET_KEYS.filter(
  (k) => !RANKING_KEYS.includes(k) && !SORTING_KEYS.includes(k),
)

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
  const [competitorUrl, setCompetitorUrl] = useState('')
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
    setCompetitorUrl(p.competitor_url ?? '')
    // 키를 하나씩 적지 않는다 — FACET_KEYS 가 늘었을 때 여기만 안 늘어나면 그 칸은
    // 저장은 되는데 다시 열면 비어 보인다(가장 늦게 발견되는 형태다).
    setFacets(Object.fromEntries(FACET_KEYS.map((k) => [k, p[k] ?? ''])) as FacetValues)
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
        body: JSON.stringify({ pitch: pitch.trim(), market: market.trim(), competitor_url: competitorUrl.trim(), ...facets }),
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
      subtitle="내 제품이 어떤 모양인지 한 번 적어 두는 자리다. 여기 저장한 값이 새 분석 1단계를 미리 채우고, 비슷한 상황의 선례를 고르는 순서에 쓰인다."
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
          {/* 칸 순서 = 추천에 미치는 영향이 큰 순. 문제 유형이 맨 위인 이유는 그것만이 하드필터라서다. */}
          <FacetGroup keys={RANKING_KEYS} values={facets} onChange={setFacet} />
          <p style={fillNote}>↑ 이 둘이 추천을 좁힌다. 문제 유형은 케이스 단위 조건이고, 병목은 검색 화면에서 직접 고를 수도 있다.</p>

          {/* 예시만 SaaS 로 바꿨다. 라벨("상품 한 줄 소개")은 /analyze/new 1단계와 같은 말이어야
              아래 프리필 안내가 가리키는 칸을 찾을 수 있어 그대로 둔다. */}
          <Field label="상품 한 줄 소개" htmlFor="pitch" hint="무엇을 누구에게 파는지 한 문장. 예: 1인 개발자용 구독 결제 대시보드. 새 분석의 한 줄 소개 기본값이 된다.">
            <Textarea id="pitch" rows={2} value={pitch} onChange={(e) => setPitch(e.target.value)} />
          </Field>

          <p style={fillNote}>↑ 이 값이 새 분석 1단계의 &ldquo;상품 한 줄 소개&rdquo;를 프리필하고, 케이스 추천의 검색어가 된다.</p>

          <Field label="시장" htmlFor="market" hint="예: 국내 1인 개발자용 SaaS 도구. 선례를 고를 때 낱말이 겹치는지 보는 데 쓴다.">
            <Input id="market" type="text" value={market} onChange={(e) => setMarket(e.target.value)} />
          </Field>
          <p style={fillNote}>↑ 한 줄 소개와 합쳐 케이스 추천의 검색어(200자까지)가 된다.</p>

          <FacetGroup keys={SORTING_KEYS} values={facets} onChange={setFacet} hintSuffix="같은 종류 선례를 먼저 보여주는 데 쓴다" />

          <Field label="경쟁사·비교 대상 URL" htmlFor="competitor_url"
            hint="선택. 비워 둬도 된다. 새 분석 1단계의 경쟁사 URL 칸을 미리 채우는 데만 쓴다 — 주소창으로 넘기지 않는다.">
            <Input id="competitor_url" type="url" inputMode="url" value={competitorUrl}
              onChange={(e) => setCompetitorUrl(e.target.value)} />
          </Field>
          <p style={fillNote}>↑ 비우고 저장하면 지워진다.</p>

          {/* 숨기지 않고 접는다. "왜 물어봤는데 안 쓰냐"에 답이 있어야 한다(§4-C). */}
          <details className="dgy-details">
            <summary>지금 추천 순서를 바꾸지 않는 항목 — 나중에 2축 진단에서 쓴다</summary>
            <div style={{ display: 'grid', gap: 18, padding: '10px 0 0' }}>
              <FacetGroup keys={UNUSED_KEYS} values={facets} onChange={setFacet} hintSuffix="지금 추천 순서를 바꾸지 않는다" />
            </div>
          </details>
          <p style={fillNote}>↑ 위 칸들도 새 분석 1단계를 프리필한다. 비어 있는 칸만 채우므로 1단계에서 고쳐 쓸 수 있다.</p>

          {saveError && <Notice tone="danger">{saveError}</Notice>}

          <Button variant="primary" size="lg" fullWidth onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '프로필 저장'}
          </Button>

          {/* 저장 다음 걸음. 여기까지 왔으면 할 일은 하나다 — 이 값으로 분석을 돌리는 것. */}
          {justSaved && !saveError && (
            <Notice tone="success" title="저장했다 — 이 값으로 선례를 좁혀 보거나, 새 분석을 시작할 수 있다"
              action={(
                <>
                  <ButtonLink href="/cases/search" variant="primary" size="sm">이 프로필로 케이스 추천 보기</ButtonLink>
                  <ButtonLink href="/analyze/new" size="sm">새 분석 시작</ButtonLink>
                </>
              )}
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
