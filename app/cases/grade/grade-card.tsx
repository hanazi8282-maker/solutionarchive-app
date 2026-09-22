'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { gradeCase, type ReviewActionState } from '../actions'
import { caseApproveDefault } from '@/lib/cases/grade-queue'
import { TRANSFERABILITY, TRANSFERABILITY_LABEL, TRANSFERABILITY_UNRATED_HINT, caseApprovalWarning, moveApprovalWarning } from '@/lib/cases/review'
import { Badge, type Tone } from '../../_ds/components/Badge'
import { Button } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { Choice } from '../../_ds/components/Field'
import { Notice } from '../../_ds/components/Shell'

// 카드 1장 = 케이스 1건 = 폼 1개 = 제출 1회. 클릭은 무브당 체크 1 + 라디오 1뿐이다.
// 반려 버튼을 일부러 두지 않았다 — 체크 안 한 무브는 draft 로 남고, 반려는 /cases 에서 사유와 함께 한다.

export type GradeEvidence = { id: string; url: string; domain: string | null; case_move_id: string | null }
export type GradeMove = {
  id: string
  lever: string
  claim: string
  outcome_direction: string | null
  transfer_note: string | null
  preconditions: string | null
  evidence_grade: string
  fact_check_grade: string | null
  review_status: string
  evidence: GradeEvidence[]
}
export type GradeCaseData = {
  id: string
  slug: string
  brand_name: string
  business_model: string | null
  bottleneck: string | null
  reader_problem: string | null
  summary: string | null
  review_status: string
  moves: GradeMove[]
}

const GRADE_TONE: Record<string, Tone> = { A: 'success', B: 'info', C: 'warning', D: 'neutral' }
const muted: React.CSSProperties = { margin: 0, fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }
const clamp1: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }

/** 등급 배지 2종. `app/analyze/[id]/advisor-cards.tsx` 의 GradeBadge 와 같은 모양(Badge size="sm"). */
function GradeBadges({ m }: { m: GradeMove }) {
  return (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
      <Badge tone={GRADE_TONE[m.evidence_grade] ?? 'neutral'} size="sm">근거 {m.evidence_grade}</Badge>
      <Badge tone="neutral" size="sm">사실확인 {m.fact_check_grade ?? '미기재'}</Badge>
    </span>
  )
}

/** 근거는 펼치지 않아도 링크가 보인다 — 펼치기 클릭 1회가 케이스마다 붙던 자리다. */
function EvidenceLinks({ rows }: { rows: GradeEvidence[] }) {
  if (rows.length === 0) return <p style={muted}>근거 0건 — 조회는 정상이다(이 무브에 걸린 행이 없다)</p>
  return (
    <p style={{ ...muted, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <span>근거 {rows.length}건:</span>
      {rows.map((e) => (
        <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer">{e.domain ?? e.url}</a>
      ))}
    </p>
  )
}

export function GradeCard({ c, nextAnchor }: { c: GradeCaseData; nextAnchor: string | null }) {
  const [checked, setChecked] = useState<string[]>([])
  const [caseOverride, setCaseOverride] = useState<boolean | null>(null)
  const [openClaim, setOpenClaim] = useState<string[]>([])
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(gradeCase, null)

  const draftMoves = c.moves.filter((m) => m.review_status === 'draft')
  const caseChecked = caseOverride ?? caseApproveDefault(checked.length)
  // 제출 뒤 상태로 경고를 만든다 — "체크 안 한 무브는 그대로 draft" 라는 사실을 숫자로 보여준다.
  const caseWarn = caseChecked
    ? caseApprovalWarning(c.moves.map((m) => (checked.includes(m.id) ? { review_status: 'approved' } : m)))
    : null
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const row = (m: GradeMove, i: number) => {
    const on = checked.includes(m.id)
    const warn = on ? moveApprovalWarning(m) : null
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <b style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>#{i}</b>
          <Badge tone="neutral" size="sm">{m.lever}</Badge>
          {m.outcome_direction === 'negative' && <Badge tone="danger" size="sm">부정 사례</Badge>}
          <GradeBadges m={m} />
        </div>
        {/* claim 은 한 줄. 전체는 펼쳐서 본다 — 카드 10장이 한 화면에 들어와야 하는 게 이 모드의 목적이다. */}
        <p
          onClick={() => setOpenClaim((s) => toggle(s, m.id))}
          style={{ margin: 0, fontSize: 14, color: 'var(--text-strong)', overflowWrap: 'anywhere', cursor: 'pointer', ...(openClaim.includes(m.id) ? {} : clamp1) }}
          title="눌러서 전체 보기"
        >
          {m.claim}
        </p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
          {m.transfer_note
            ? <>→ {m.transfer_note}</>
            : <span style={{ color: 'var(--warning-fg)' }}>→ 옮길 행동 미기재</span>}
        </p>
        <p style={muted}>{m.preconditions ? `전제: ${m.preconditions}` : '전제: 미기재 (— "전제 없음"이 아니다)'}</p>
        <EvidenceLinks rows={m.evidence} />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Choice
            type="checkbox"
            name="move"
            value={m.id}
            checked={on}
            onChange={() => setChecked((s) => toggle(s, m.id))}
            disabled={pending}
            label={<b>이 무브 승인</b>}
          />
          {/* 이식성 — 사람만 고를 수 있는 유일한 값. 미선택도 승인된다(lib/cases/review.ts).
              라벨은 한 낱말만 쓴다(전문은 title). 카드 10장이 한 화면에 들어와야 하는 게 이 모드의 목적이다. */}
          {TRANSFERABILITY.map((v) => (
            <Choice
              key={v}
              type="radio"
              name={`transferability:${m.id}`}
              value={v}
              disabled={pending}
              title={TRANSFERABILITY_LABEL[v]}
              label={<span style={{ fontSize: 13 }}>{v} {TRANSFERABILITY_LABEL[v].split(' — ')[0]}</span>}
            />
          ))}
        </div>
        {warn && <p style={{ ...muted, color: 'var(--warning-fg)' }}>승인 시 주의 — {warn}</p>}
      </div>
    )
  }

  return (
    <Card
      id={`grade-${c.slug}`}
      style={{ scrollMarginTop: 64 }}
      title={c.brand_name}
      subtitle={<>{c.slug} · {c.business_model ?? '모델 미기재'} · 병목 {c.bottleneck ?? '미기재'} · 독자 문제 {c.reader_problem ?? '미지정'}</>}
      action={<Badge tone="warning" dot size="sm">검수 대기</Badge>}
    >
      <form action={action} style={{ display: 'grid', gap: 12 }}>
        <input type="hidden" name="case_id" value={c.id} />
        {c.summary && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-body)', overflowWrap: 'anywhere' }}>{c.summary}</p>}

        {draftMoves.length === 0 && <p style={muted}>검수 대기 무브 0건 — 케이스 승인만 남았다.</p>}
        {draftMoves.map((m, i) =>
          // transfer_note 가 없으면 독자가 가져갈 게 없다(등급 D 의 실체). 접어 두되 배지로 보인다 —
          // 승인을 막지는 않는다. 기계가 반려하지 않는 것과 같은 이유다(CLAUDE.md §10.1).
          m.transfer_note ? (
            <section key={m.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>{row(m, i)}</section>
          ) : (
            <details key={m.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <summary style={{ cursor: 'pointer', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <b style={{ fontFamily: 'var(--font-mono)' }}>#{i}</b>
                <Badge tone="neutral" size="sm">{m.lever}</Badge>
                <Badge tone="danger" size="sm">독자 행동 없음(D)</Badge>
                <span style={{ color: 'var(--text-muted)' }}>펼쳐서 채점</span>
              </summary>
              <div style={{ marginTop: 8 }}>{row(m, i)}</div>
            </details>
          ),
        )}

        <section style={{ display: 'grid', gap: 6, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-muted)', border: '2px solid var(--border-strong)' }}>
          <Choice
            type="checkbox"
            name="approve_case"
            checked={caseChecked}
            onChange={() => setCaseOverride(!caseChecked)}
            disabled={pending}
            label={<b>케이스 승인</b>}
            hint="무브를 하나라도 승인하면 기본으로 켜진다. 케이스와 무브가 둘 다 승인돼야 매칭에 들어간다."
          />
          {caseWarn && <p style={{ ...muted, color: 'var(--warning-fg)' }}>{caseWarn}</p>}
          <p style={muted}>{checked.length === 0 ? '고른 무브 0건 — 체크한 것만 반영된다.' : `고른 무브 ${checked.length}건 · ${TRANSFERABILITY_UNRATED_HINT}`}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <Button type="submit" variant="primary" size="sm" disabled={pending || (checked.length === 0 && !caseChecked)}>제출</Button>
            {nextAnchor
              ? <a href={`#${nextAnchor}`} style={{ fontSize: 13 }}>보류(다음에) ↓</a>
              : <span style={muted}>마지막 카드다.</span>}
            {pending && <span style={muted}>저장 중…</span>}
          </div>
        </section>

        {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
      </form>
    </Card>
  )
}
