'use client'

import { useState } from 'react'
import { Badge } from '../../_ds/components/Badge'
import { Button } from '../../_ds/components/Button'

// ── 크로스섹션 어드바이저 — 화면 한 벌 ─────────────────────────
// 선례(A)·실패사례(B)·원칙(C) 세 코퍼스에서 겹치는 근거를 보여준다. 전에는 앵글 화면
// (angles/page.tsx) 안에만 있어서 목록 → 앵글 → "유사 사례 보기" 두 단 아래 숨어 있었다.
// 검수 화면이 프로젝트 단위(`project_id=`)로 같은 API 를 부르게 되면서 렌더링을 여기로 뺐다.
// 카드 모양·3상태 문장·SP-024 표시는 그대로다 — 두 화면이 각자 그리면 곧 갈라진다.
//
// 자동으로 fetch 하지 않는다. 사용자가 눌렀을 때만 한 번 부른다(앵글마다 자동이면 화면 하나에
// 앵글 수만큼 요청이 나간다).

type AdvisorStatus = 'matched' | 'no_match' | 'not_run'
/** 어느 코퍼스 한 덩어리만 펼칠지. a 선례 · b 실패사례 · c 원칙 (lib/cases/advisor.ts 의 이름 그대로). */
export type AdvisorFocus = 'a' | 'b' | 'c'
type AdvisorCorpus<Card> = { status: AdvisorStatus; reason: string; cards: Card[] }
/** 매칭 근거 — 왜 이 사례가 나왔는지. 세 코퍼스 카드가 전부 갖는다 (SP-024). */
type AdvisorMatchInfo = { matched_terms: string[]; score: number; low_confidence: boolean }
type AdvisorCaseMoveCard = AdvisorMatchInfo & {
  case_move_id: string; slug: string; brand_name: string; lever: string
  claim: string; evidence_grade: string; outcome_direction: string
}
type AdvisorFailedAngleCard = AdvisorMatchInfo & {
  case_key: string; product_category: string; claimed_angle: string
  outcome: string; source_tier: string; is_estimate: boolean
}
type AdvisorPrincipleCard = AdvisorMatchInfo & {
  sp_id: string; statement: string; evidence_grade: string
  evidence_grade_note: string | null; source_ref: string
}
export type AdvisorPayload = {
  status: AdvisorStatus
  reason: string
  corpus_a: AdvisorCorpus<AdvisorCaseMoveCard>
  corpus_b: AdvisorCorpus<AdvisorFailedAngleCard>
  corpus_c: AdvisorCorpus<AdvisorPrincipleCard>
}

const BOX: React.CSSProperties = {
  marginTop: 10,
  background: 'var(--surface-muted)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-4)',
  display: 'grid',
  gap: 'var(--space-3)',
}

const FOCUS_TITLE: Record<AdvisorFocus, string> = {
  a: '선례 · 남들은 어떻게 풀었나',
  b: '실패 사례 · 이 소구점으로 망한 적 있나',
  c: '원칙 · 원칙은 뭐라고 하나',
}

const muted: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }
const body: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }

function fmtScore(v: number | string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '—'
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div className="dgy-caps">{title}</div>
      {children}
    </div>
  )
}

/**
 * "왜 이 사례가 나왔나" — 겹친 낱말과 점수를 그대로 보여준다 (SP-024).
 * 낱말 하나로만 걸린 매칭은 점수로 걸러지지 않으므로 숨기지 않고 표시만 한다.
 */
function MatchWhy({ m }: { m: AdvisorMatchInfo }) {
  return (
    <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
      매칭 근거 · {m.matched_terms.map(t => `“${t}”`).join(', ')} · 점수 {fmtScore(m.score)}
      {m.low_confidence && ' — 겹친 낱말이 하나뿐입니다. 이 낱말이 우연히 겹친 것은 아닌지 직접 확인하세요.'}
    </p>
  )
}

function LowConfidenceBadge({ m }: { m: AdvisorMatchInfo }) {
  if (!m.low_confidence) return null
  return <Badge tone="warning" size="sm">신뢰도 낮음</Badge>
}

/**
 * 응답 본문만 그린다. 3상태를 문장으로 가른다 — 0건은 0건이라고 말한다(§13-7 AC-2).
 * focus 를 주면 그 코퍼스 한 덩어리만 편다(a 선례 · b 실패사례 · c 원칙). 안 주면 셋 다 — 기존 동작.
 */
export function AdvisorResult({ data, focus }: { data: AdvisorPayload; focus?: AdvisorFocus }) {
  if (data.status === 'not_run') return <p style={muted}>판정 불가 — {data.reason}</p>
  if (data.status === 'no_match') {
    return <p style={muted}>관련 사례 없음 — 세 코퍼스 모두 조회는 정상인데 겹치는 근거가 0건입니다.</p>
  }
  // 한 코퍼스만 펼친 경우, 다른 코퍼스가 걸려서 전체가 matched 여도 이 창은 비어 있을 수 있다.
  // 빈 상자를 보여주면 "없다" 와 "못 찾았다" 가 같아진다 — 그 코퍼스의 문장을 그대로 쓴다.
  if (focus) {
    const c = focus === 'a' ? data.corpus_a : focus === 'b' ? data.corpus_b : data.corpus_c
    if (c.cards.length === 0) {
      return <p style={muted}>{c.status === 'not_run' ? '판정 불가' : '관련 사례 없음'} — {c.reason}</p>
    }
  }
  return (
    <>
      {(!focus || focus === 'a') && data.corpus_a.cards.length > 0 && (
        <Section title="선례 · 성공 사례">
          {data.corpus_a.cards.map(c => (
            <div key={c.case_move_id} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Badge tone="neutral" size="sm">{c.brand_name}</Badge>
                <Badge tone="neutral" size="sm">{c.lever}</Badge>
                <Badge tone="success" size="sm">근거 {c.evidence_grade}</Badge>
                <LowConfidenceBadge m={c} />
              </div>
              <p style={body}>{c.claim}</p>
              <MatchWhy m={c} />
            </div>
          ))}
        </Section>
      )}

      {/* 실패 사례는 "무엇을 내세웠고(claimed_angle) 왜 안 됐는지(outcome)"를 함께
          보여줘야 회피 조언이 된다. 둘 중 하나만 보이면 쓸모가 없다. */}
      {(!focus || focus === 'b') && data.corpus_b.cards.length > 0 && (
        <Section title="실패 사례 · 이 소구점은 이미 실패한 적 있다">
          {data.corpus_b.cards.map(c => (
            <div key={c.case_key} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Badge tone="neutral" size="sm">{c.product_category}</Badge>
                <Badge tone="neutral" size="sm">{c.source_tier}</Badge>
                {c.is_estimate && <Badge tone="warning" size="sm">추정</Badge>}
                <LowConfidenceBadge m={c} />
              </div>
              <p style={body}>내세웠던 소구점 · {c.claimed_angle}</p>
              <p style={{ ...body, color: 'var(--danger-fg)' }}>결과 · {c.outcome}</p>
              <MatchWhy m={c} />
            </div>
          ))}
        </Section>
      )}

      {(!focus || focus === 'c') && data.corpus_c.cards.length > 0 && (
        <Section title="원칙">
          {data.corpus_c.cards.map(c => (
            <div key={c.sp_id} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Badge tone="neutral" size="sm">{c.sp_id}</Badge>
                <Badge tone="success" size="sm">근거 {c.evidence_grade}</Badge>
                <Badge tone="neutral" size="sm">{c.source_ref}</Badge>
                <LowConfidenceBadge m={c} />
              </div>
              <p style={body}>{c.statement}</p>
              {c.evidence_grade_note && (
                <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{c.evidence_grade_note}</p>
              )}
              <MatchWhy m={c} />
            </div>
          ))}
        </Section>
      )}
    </>
  )
}

/**
 * 열림·닫힘 + 1회 fetch. `query` 는 `/api/analyze/advisor?` 뒤에 붙는 문자열
 * (`angle_id=…` 또는 `project_id=…`). 라우트가 둘 다 받는다(app/api/analyze/advisor/route.ts).
 */
export function AdvisorLoader({ query, label = '유사 사례 보기', variant = 'outline', focus }: {
  query: string
  label?: string
  variant?: 'outline' | 'primary'
  /** 한 코퍼스만 펼친다. 결과 화면의 질문 3버튼이 쓴다(같은 응답, 다른 창). */
  focus?: AdvisorFocus
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AdvisorPayload | null>(null)

  const load = async () => {
    setOpen(true)
    if (data || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analyze/advisor?${query}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? '유사 사례를 불러오지 못했습니다.')
        return
      }
      setData(json.advisor as AdvisorPayload)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button variant={variant} size="sm" onClick={load} aria-expanded={false} style={{ marginTop: 10 }}>
        {label}
      </Button>
    )
  }

  return (
    <div style={BOX}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="dgy-caps">{focus ? FOCUS_TITLE[focus] : '유사 사례 · 선례 · 실패 · 원칙'}</div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-expanded>접기</Button>
      </div>
      {loading && <p role="status" style={muted}>찾는 중…</p>}
      {error && <p role="alert" style={{ ...muted, color: 'var(--danger-fg)' }}>{error}</p>}
      {!loading && !error && data && <AdvisorResult data={data} focus={focus} />}
    </div>
  )
}
