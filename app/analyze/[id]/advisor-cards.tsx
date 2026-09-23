'use client'

import { useState } from 'react'
import { Badge } from '../../_ds/components/Badge'
import { GradeLegend } from '../../_ds/components/GradeLegend'
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
type AdvisorCorpus<Card> = { status: AdvisorStatus; reason: string; cards: Card[] }
/** 매칭 근거 — 왜 이 사례가 나왔는지. 세 코퍼스 카드가 전부 갖는다 (SP-024). */
type AdvisorMatchInfo = { matched_terms: string[]; score: number; low_confidence: boolean }
export type AdvisorCaseMoveCard = AdvisorMatchInfo & {
  case_move_id: string; slug: string; brand_name: string; lever: string
  claim: string; evidence_grade: string
  /** 사실확인 등급. null = 미기재(조회에 없었거나 안 적힘)이고 등급 D 와 다르다. */
  fact_check_grade: string | null
  outcome_direction: string
}
export type AdvisorFailedAngleCard = AdvisorMatchInfo & {
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

const muted: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }
const body: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)' }

function fmtScore(v: number | string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '—'
}

/**
 * 세 코퍼스 = 셀러가 묻는 세 가지 질문. 버튼 문구와 섹션 제목이 같은 질문을 가리킨다.
 * a = 남들은 어떻게 풀었나 / b = 이 소구점으로 망한 적 있나 / c = 원칙은 뭐라고 하나
 */
export const ADVISOR_FOCUS = ['a', 'b', 'c'] as const
export type AdvisorFocus = (typeof ADVISOR_FOCUS)[number]

const FOCUS_BUTTON: Record<AdvisorFocus, string> = {
  a: '남들은 어떻게 풀었나(선례)',
  b: '이 소구점으로 망한 적 있나(실패 사례)',
  c: '원칙은 뭐라고 하나(원칙)',
}

const FOCUS_TITLE: Record<AdvisorFocus, string> = {
  a: '선례 · 성공 사례',
  b: '실패 사례 · 이 소구점은 이미 실패한 적 있다',
  c: '원칙',
}

/**
 * 코퍼스 한 칸. 한 벌만 펼치고 나머지는 접되 **건수는 접힌 채로도 보인다** —
 * 접힌 0건과 "안 찾아봤다"가 같아 보이면 안 된다(§7.1). 펼침은 native <details> 가 한다.
 */
function Corpus({ k, status, reason, count, focus, children }: {
  k: AdvisorFocus
  status: AdvisorStatus
  reason: string
  count: number
  /** null = 전부 펼친다(기존 동작). */
  focus: AdvisorFocus | null
  children: React.ReactNode
}) {
  const tally = status === 'not_run' ? '판정 불가' : `${count}건`
  return (
    <details className="dgy-details" open={focus === null || focus === k}>
      <summary>{FOCUS_TITLE[k]} · {tally}</summary>
      <div style={{ display: 'grid', gap: 'var(--space-2)', padding: '6px 0 0' }}>
        {status === 'not_run'
          ? <p style={muted}>판정 불가 — {reason}</p>
          : count === 0
            ? <p style={muted}>관련 사례 없음 — 조회는 정상인데 겹치는 근거가 0건입니다. 억지로 끼워 맞추지 않습니다.</p>
            : children}
      </div>
    </details>
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

/**
 * 근거 등급 배지 — 초록(success)을 쓰지 않는다. 초록·빨강은 감성/판정 전용이라
 * (app/_ds/tokens/colors.css `--sent-*`) 등급에 쓰면 "근거 C" 도 초록이라 좋게 읽힌다.
 * 등급은 감성이 아니라 분류다 → 정보 톤(파랑).
 */
function GradeBadge({ grade }: { grade: string }) {
  return <Badge tone="info" size="sm">근거 {grade}</Badge>
}

/**
 * 무브 등급 두 벌 — 인사이트와 사실확인은 **다른 질문**이다(2026-09-16 축 분리).
 * 2026-09-23 까지 셀러 화면에는 인사이트 등급만 나갔다. 데이터는 API 응답에 있었는데
 * 렌더 타입에 없어서 조용히 버려지고 있었다 — "검증됐나"를 묻는 사람에게 답이 없었다.
 * 뜻은 툴팁 한 줄, 자세한 것은 GradeLegend 가 답한다.
 */
function MoveGradeBadges({ grade, factCheck }: { grade: string; factCheck: string | null }) {
  return (
    <>
      <Badge tone="info" size="sm" title="인사이트 등급 — 내가 옮겨 쓸 게 있나(옮길 행동·전제가 적혀 있나)">인사이트 {grade}</Badge>
      <Badge tone="neutral" size="sm" title="사실확인 등급 — 그 수치를 믿을 수 있나(출처가 몇 겹인가). 미기재는 D 가 아니다">
        사실확인 {factCheck ?? '미기재'}
      </Badge>
    </>
  )
}

function LowConfidenceBadge({ m }: { m: AdvisorMatchInfo }) {
  if (!m.low_confidence) return null
  return <Badge tone="warning" size="sm">신뢰도 낮음</Badge>
}

/**
 * 선례 카드 목록. 어드바이저 패널과 /cases/search 가 **같은 카드**를 쓴다 —
 * 두 화면이 각자 그리면 배지·매칭 근거 표시가 곧 갈라진다(그 자리를 이미 한 번 겪었다).
 */
export function CaseMoveCards({ cards }: { cards: AdvisorCaseMoveCard[] }) {
  return (
    <>
      {cards.map((c) => (
        <div key={c.case_move_id} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {/* 전용 상세 라우트(/cases/<slug>)는 아직 없다 — 목록의 앵커로 보낸다. */}
            <a href={`/cases?status=approved#case-${c.slug}`} style={{ textDecoration: 'none' }}
              title="케이스 목록에서 이 케이스 보기">
              <Badge tone="neutral" size="sm">{c.brand_name} ↗</Badge>
            </a>
            <Badge tone="neutral" size="sm">{c.lever}</Badge>
            <MoveGradeBadges grade={c.evidence_grade} factCheck={c.fact_check_grade} />
            <LowConfidenceBadge m={c} />
          </div>
          <p style={body}>{c.claim}</p>
          <MatchWhy m={c} />
        </div>
      ))}
    </>
  )
}

/** 실패 앵글 카드 목록. 내세웠던 소구점과 결과를 **같이** 보여줘야 회피 조언이 된다. */
export function FailedAngleCards({ cards }: { cards: AdvisorFailedAngleCard[] }) {
  return (
    <>
      {cards.map((c) => (
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
    </>
  )
}

/** 응답 본문만 그린다. 3상태를 문장으로 가른다 — 0건은 0건이라고 말한다(§13-7 AC-2). */
export function AdvisorResult({ data, focus = null }: { data: AdvisorPayload; focus?: AdvisorFocus | null }) {
  if (data.status === 'not_run') return <p style={muted}>판정 불가 — {data.reason}</p>
  if (data.status === 'no_match') {
    return <p style={muted}>관련 사례 없음 — 세 코퍼스 모두 조회는 정상인데 겹치는 근거가 0건입니다.</p>
  }
  return (
    <>
      <Corpus k="a" status={data.corpus_a.status} reason={data.corpus_a.reason} count={data.corpus_a.cards.length} focus={focus}>
        <CaseMoveCards cards={data.corpus_a.cards} />
      </Corpus>

      {/* 실패 사례는 "무엇을 내세웠고(claimed_angle) 왜 안 됐는지(outcome)"를 함께
          보여줘야 회피 조언이 된다. 둘 중 하나만 보이면 쓸모가 없다. */}
      <Corpus k="b" status={data.corpus_b.status} reason={data.corpus_b.reason} count={data.corpus_b.cards.length} focus={focus}>
        <FailedAngleCards cards={data.corpus_b.cards} />
      </Corpus>

      <GradeLegend />

      <Corpus k="c" status={data.corpus_c.status} reason={data.corpus_c.reason} count={data.corpus_c.cards.length} focus={focus}>
        {data.corpus_c.cards.map(c => (
            <div key={c.sp_id} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Badge tone="neutral" size="sm">{c.sp_id}</Badge>
                <GradeBadge grade={c.evidence_grade} />
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
      </Corpus>
    </>
  )
}

/**
 * 열림·닫힘 + 1회 fetch. `query` 는 `/api/analyze/advisor?` 뒤에 붙는 문자열
 * (`angle_id=…` 또는 `project_id=…`). 라우트가 둘 다 받는다(app/api/analyze/advisor/route.ts).
 *
 * 버튼이 세 개인 이유: "유사 사례 보기" 한 개는 셀러가 무엇을 얻는지 말해 주지 않았다.
 * 세 버튼이 곧 세 질문이고, 어느 걸 눌러도 **요청은 한 번**이다(세 코퍼스가 한 응답에 온다).
 * 누른 질문만 펼치고 나머지는 접히되 건수는 보인다.
 *
 * `focus` 를 주면 그 코퍼스 전용 버튼 하나만 그린다(결과 화면이 속성 카드마다 쓰는 형태).
 * `label` 을 주면 전처럼 버튼 하나로 전부 펼친다 — 기존 호출부가 그대로 돈다.
 */
export function AdvisorLoader({ query, label, variant = 'outline', focus }: {
  query: string
  label?: string
  variant?: 'outline' | 'primary'
  focus?: AdvisorFocus
}) {
  const [open, setOpen] = useState(false)
  // 펼칠 코퍼스. null = 전부 펼친다(label 로 부른 기존 동작).
  const [active, setActive] = useState<AdvisorFocus | null>(focus ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AdvisorPayload | null>(null)

  const load = async (k: AdvisorFocus | null) => {
    setOpen(true)
    setActive(k)
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

  // 트리거. focus → 그 질문 하나 / label → 옛 단일 버튼 / 그 밖 → 세 질문.
  const triggers: (AdvisorFocus | null)[] = focus ? [focus] : label ? [null] : [...ADVISOR_FOCUS]

  if (!open) {
    return (
      // ≤480px 에서는 세로로 쌓고 각 버튼이 풀폭이 된다(app/_ds/styles.css).
      <div className="dgy-btnrow" style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {triggers.map((k, i) => (
          <Button
            key={k ?? 'all'}
            variant={i === 0 ? variant : 'outline'}
            size="sm"
            onClick={() => load(k)}
            aria-expanded={false}
          >
            {k ? FOCUS_BUTTON[k] : (label ?? '유사 사례 보기')}
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div style={BOX}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="dgy-caps">{active ? FOCUS_TITLE[active] : '유사 사례 · 선례 · 실패 · 원칙'}</div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-expanded>접기</Button>
      </div>
      {loading && <p role="status" style={muted}>찾는 중…</p>}
      {error && <p role="alert" style={{ ...muted, color: 'var(--danger-fg)' }}>{error}</p>}
      {!loading && !error && data && <AdvisorResult data={data} focus={active} />}
    </div>
  )
}
