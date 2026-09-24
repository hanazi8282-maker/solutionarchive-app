'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../../../_ds/components/Button'
import { Card } from '../../../_ds/components/Card'
import { Field, Input, Select } from '../../../_ds/components/Field'
import { Notice } from '../../../_ds/components/Shell'

// ── 진단 실행 카드 (docs/pmf-product-design.md §3-1 2) ──────────────
// 패싯이 비어 있으면 여기서 받아 저장하고 바로 진단을 돌린다. 이미 있으면 "다시 진단" 만 보인다.
//
// ★ 패싯 없이 진단을 돌리지 않는다. 그럴듯한 병목을 골라 주면 결과가 사용자가 넣지 않은 전제 위에서
//   나오는데 화면에서는 구분이 안 된다(lib/cases/pmf-run.ts 헤더). 그래서 저장이 실패하면 진단도 안 한다.
//
// ★ 저장 라우트(PATCH /api/analyze/projects)는 다른 세션이 붙이는 중이다. 아직 없으면 404/405 가
//   오는데, 그걸 "저장 실패" 로 뭉뚱그리면 사용자가 자기 입력을 의심한다. 그 경우만 따로 말한다.

export type Facets = {
  market: string | null
  bottleneck: string | null
  business_model: string | null
  buyer_type: string | null
  price_band: string | null
  purchase_frequency: string | null
}

// 어휘 정본은 lib/cases/draft.ts = DB CHECK 다. 여기 라벨은 화면용 사본이고 값은 바꾸지 않는다.
const OPTIONS: Record<Exclude<keyof Facets, 'market'>, { label: string; items: [string, string][] }> = {
  bottleneck: {
    label: '가설 병목 (필수) — 지금 가장 막혀 있는 곳',
    items: [
      ['AWARENESS', '인지 — 아무도 모른다'],
      ['TRUST', '신뢰 — 알지만 안 믿는다'],
      ['CONVERSION', '전환 — 보긴 보는데 안 산다'],
      ['RETENTION', '재구매 — 한 번 사고 안 온다'],
      ['UNIT_ECONOMICS', '단위경제 — 팔수록 남는 게 없다'],
      ['DISTRIBUTION', '유통 — 놓을 자리가 없다'],
      ['SUPPLY', '공급 — 만들 수가 없다'],
    ],
  },
  business_model: {
    label: '사업 모델',
    items: [
      ['D2C', 'D2C 자사몰'], ['MARKETPLACE_SELLER', '오픈마켓 셀러'], ['SUBSCRIPTION', '구독'],
      ['SAAS', 'SaaS'], ['CREATOR', '크리에이터'], ['SERVICE', '서비스'], ['WHOLESALE', '도매'], ['OTHER', '그 밖'],
    ],
  },
  buyer_type: { label: '구매자', items: [['B2C', '개인(B2C)'], ['B2B', '기업(B2B)'], ['B2B2C', 'B2B2C']] },
  price_band: {
    label: '가격대',
    items: [['LOW', '저가'], ['MID', '중가'], ['HIGH', '고가'], ['ENTERPRISE', '엔터프라이즈']],
  },
  purchase_frequency: {
    label: '구매 빈도',
    items: [['ONE_OFF', '단발'], ['OCCASIONAL', '가끔'], ['REPEAT', '반복 구매'], ['CONTRACT', '계약']],
  },
}

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

export function PmfRunCard({ projectId, facets, lastAssessedAt }: {
  projectId: string
  facets: Facets
  /** 마지막 진단 시각(ISO). null = 진단 이력 없음. */
  lastAssessedAt: string | null
}) {
  const router = useRouter()
  const hasFacets = Boolean(facets.bottleneck)
  const [editing, setEditing] = useState(!hasFacets)
  const [form, setForm] = useState<Facets>(facets)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState('')
  const [done, setDone] = useState('')

  const set = (k: keyof Facets) => (v: string) => setForm((f) => ({ ...f, [k]: v || null }))

  const runAssessment = async () => {
    const res = await fetch('/api/analyze/pmf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? '진단에 실패했습니다.'); return false }
    setDone(`진단을 돌렸습니다 — ${json.advice ?? ''}`)
    router.refresh()
    return true
  }

  const saveAndRun = async () => {
    setBusy(true); setError(''); setPending(''); setDone('')
    try {
      if (!form.bottleneck) { setError('가설 병목은 반드시 골라야 합니다. 비워 두면 진단하지 않습니다.'); return }
      const res = await fetch('/api/analyze/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...form }),
      })
      if (res.status === 404 || res.status === 405) {
        // 저장 라우트가 아직 없다. 여기서 진단을 돌리면 저장 안 된 입력으로 도는 셈이라 멈춘다.
        setPending('저장 API 준비 중입니다 — 진단 입력을 아직 저장할 수 없습니다. 이 화면을 열어 두고 잠시 뒤 다시 시도하세요.')
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? '진단 입력 저장에 실패했습니다.'); return }
      if (await runAssessment()) setEditing(false)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const rerun = async () => {
    setBusy(true); setError(''); setPending(''); setDone('')
    try { await runAssessment() } catch { setError('네트워크 오류가 발생했습니다.') } finally { setBusy(false) }
  }

  return (
    <Card
      title="진단 실행"
      subtitle={hasFacets
        ? '같은 입력으로 다시 돌리면 그 사이 늘어난 리뷰·승인된 케이스가 반영된다.'
        : '진단 입력이 비어 있다. 아래를 채우면 선례축을 낼 수 있다 — 비운 채로 추정하지 않는다.'}
    >
      {error && <div className="v2-mb"><Notice tone="danger">{error}</Notice></div>}
      {pending && <div className="v2-mb"><Notice tone="warning">{pending}</Notice></div>}
      {done && <div className="v2-mb"><Notice tone="success">{done}</Notice></div>}

      {editing ? (
        <div className="v2-stack">
          <Field label="시장 한 줄 (선택)" htmlFor="facet-market" hint="예: 탈모·두피 케어. 비워도 진단은 돈다.">
            <Input
              id="facet-market"
              value={form.market ?? ''}
              onChange={(e) => set('market')(e.target.value)}
              placeholder="어떤 시장에서 파는가"
            />
          </Field>
          {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map((k) => (
            <Field key={k} label={OPTIONS[k].label} htmlFor={`facet-${k}`}>
              <Select id={`facet-${k}`} value={form[k] ?? ''} onChange={(e) => set(k)(e.target.value)}>
                <option value="">선택 안 함</option>
                {OPTIONS[k].items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          ))}
          <p className="v2-note">
            병목 말고는 걸러내는 데 쓰지 않는다 — 같은 조건의 선례를 위로 올리는 정렬 재료다.
          </p>
          <Button variant="primary" size="lg" fullWidth onClick={saveAndRun} disabled={busy}>
            {busy ? '진단 중…' : '저장하고 진단 실행'}
          </Button>
          {hasFacets && (
            <Button variant="ghost" size="sm" fullWidth onClick={() => setEditing(false)} disabled={busy}>취소</Button>
          )}
        </div>
      ) : (
        <div className="v2-stack">
          <p className="v2-text">
            입력 · {[facets.bottleneck, facets.business_model, facets.buyer_type, facets.price_band, facets.purchase_frequency]
              .filter(Boolean).join(' · ') || '병목만 있음'}
            {facets.market ? ` · ${facets.market}` : ''}
          </p>
          <p className="v2-note">
            마지막 진단 · {lastAssessedAt ? `${KST.format(Date.parse(lastAssessedAt))} KST` : '없음'}
          </p>
          <Button variant="primary" size="lg" fullWidth onClick={rerun} disabled={busy}>
            {busy ? '진단 중…' : '다시 진단'}
          </Button>
          <Button variant="ghost" size="sm" fullWidth onClick={() => setEditing(true)} disabled={busy}>진단 입력 고치기</Button>
        </div>
      )}
    </Card>
  )
}
