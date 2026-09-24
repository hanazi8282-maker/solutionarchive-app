import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { productKindOf } from '@/lib/cases/advisor'
import { gradeMove, READER_PROBLEM_LABEL, type Evidence, type Move } from '@/lib/cases/draft'
import { classifyFeedbackError, tallyFeedback, type FeedbackTally, type FeedbackVoteRow } from '@/lib/cases/feedback'
import { caseApprovalWarning, moveApprovalWarning, TRANSFERABILITY_LABEL, type Transferability } from '@/lib/cases/review'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { ButtonLink } from '../_ds/components/Button'
import { EmptyState } from '../_ds/components/EmptyState'
import { EvidenceCaption } from '../_ds/components/EvidenceCaption'
import { FilterChip } from '../_ds/components/FilterChip'
import { GradeLegend } from '../_ds/components/GradeLegend'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../_ds/components/Shell'
import { DecisionForm } from './decision-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: '케이스 검수' }

// 이 파일은 읽기만 한다. 쓰기는 ./actions.ts(사람이 누르는 서버 액션) 하나다.
// 등급은 여기서 계산해 **보여주기만** 한다 — 산식은 lib/cases/draft.ts gradeMove 한 벌이고,
// 저장 등급을 바꾸는 건 사람이 CLI regrade 로 한다(CLAUDE.md §10.1).

type EvidenceRow = Evidence & { id: string; case_move_id: string | null; domain: string | null }
type MoveRow = Move & {
  id: string
  /** 독자 인사이트 등급(2026-09-16 재설계) — transfer_note·preconditions 기반. */
  evidence_grade: string
  /** 사실확인 등급(옛 evidence_grade 산식) — CG-1/CG-2 발행 게이트 전용. */
  fact_check_grade: string
  review_status: string
  review_note?: string | null
  reviewed_by?: string | null
  /** 마이그 20260915000001 미적용이면 undefined 로 온다 — null(미판정)과 다른 상태다. */
  transferability?: Transferability | null
  transferability_by?: string | null
  created_at: string
}
type CaseRow = {
  id: string
  slug: string
  brand_name: string
  market: string | null
  geo: string | null
  business_model: string | null
  buyer_type: string | null
  purchase_frequency: string | null
  price_band: string | null
  bottleneck: string | null
  reader_problem?: string | null
  outcome_status: string
  period_start: string | null
  period_end: string | null
  summary: string | null
  tags: string[] | null
  review_status: string
  review_note?: string | null
  researched_by: string | null
  created_at: string
  case_moves: MoveRow[] | null
  case_evidence: EvidenceRow[] | null
}
/** 화면용으로 무브를 정렬하고 근거를 펴 놓은 행. 필터·타일·카드가 같은 배열을 본다. */
type ViewCase = CaseRow & { moves: MoveRow[]; evidence: EvidenceRow[] }

/** 상태 칩. 기본은 검수 대기 — 이 화면에 오는 이유가 그것이다. */
const STATUS_FILTERS = [
  { key: 'pending', label: '검수 대기' },
  { key: 'approved', label: '승인됨' },
  { key: 'rejected', label: '반려됨' },
  { key: 'all', label: '전체' },
] as const
const GRADES = ['A', 'B', 'C', 'D'] as const
/**
 * 종류 칩. **이 화면의 기본은 '전체'다** — 검수자는 소비재 케이스도 봐야 승인·반려를 할 수 있다
 * (셀러가 보는 /cases/search 는 반대로 기본이 'saas' 다. 화면의 목적이 다르니 기본값도 다르다).
 */
const KIND_FILTERS = [
  { key: 'all', label: '종류 전체' },
  { key: 'saas', label: 'SaaS' },
  { key: 'consumer', label: '소비재' },
] as const

const REVIEW: Record<string, { label: string; tone: Tone }> = {
  draft: { label: '검수 대기', tone: 'warning' },
  approved: { label: '승인됨', tone: 'success' },
  rejected: { label: '반려됨', tone: 'danger' },
}
const GRADE_TONE: Record<string, Tone> = { A: 'success', B: 'info', C: 'warning', D: 'neutral' }
const TIER: Record<string, string> = { primary: '1차', secondary: '2차', tertiary: '3차' }

const muted: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }
const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

function ReviewBadge({ status }: { status: string }) {
  const r = REVIEW[status]
  return <Badge tone={r?.tone ?? 'neutral'} dot size="sm">{r?.label ?? status}</Badge>
}

/**
 * 근거는 접어 둔다. 검수 대기 12건 × 무브 2~3개 × 근거 2~5건이 전부 펼쳐져 있으면 한 케이스가
 * 세 화면이고 결정 버튼은 그 맨 아래에 있었다(2026-09-15 실화면). 요약 줄에 등급 산식이 세는 것
 * (1차·자기보고·수치 뒷받침)을 그대로 적어, 펼치지 않아도 "왜 이 등급인가"는 보이게 한다.
 */
// total 은 이 목록과 **같은 범위**의 분모일 때만 넘긴다(케이스 전체 근거 블록에 무브 근거까지 합친 수를 주면
// "2/5건" 이 빠진 3건처럼 읽힌다 — 리뷰에서 잡힘). 모르면 생략해 "N건" 으로만 적는다.
function EvidenceList({ rows, total, label = '근거' }: { rows: EvidenceRow[]; total?: number; label?: string }) {
  const primary = rows.filter((e) => e.source_tier === 'primary').length
  const selfReported = rows.filter((e) => e.is_self_reported).length
  const metric = rows.filter((e) => e.supports_metric === true).length
  // 근거 0건과 조회 실패를 같은 문장으로 내지 않는다(§7.1) — 조회 실패는 위쪽 danger 배너 자리다.
  const caption = (
    <EvidenceCaption
      n={rows.length}
      total={total ?? null}
      noun="근거"
      source={rows.length > 0 ? `1차 ${primary} · 자기보고 ${selfReported} · 수치 뒷받침 ${metric}` : undefined}
      method={rows.length > 0 ? '케이스 근거 행에서 셈' : `${label} 행이 없다 — 조회는 정상이다`}
    />
  )
  if (rows.length === 0) return caption
  return (
    <div style={{ display: 'grid', gap: 4 }}>
    <details>
      <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-body)', userSelect: 'none' }}>
        {label} <b>{rows.length}건</b>
        <span style={{ color: 'var(--text-muted)' }}> — 펼쳐서 원문 확인</span>
      </summary>
    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
      {rows.map((e) => (
        <li key={e.id} style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--surface-muted)', fontSize: 13, overflowWrap: 'anywhere' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Badge tone="neutral" size="sm">{TIER[e.source_tier ?? ''] ?? e.source_tier ?? '등급 없음'}</Badge>
            {e.is_self_reported && <Badge tone="warning" size="sm">자기보고</Badge>}
            {e.is_estimate && <Badge tone="warning" size="sm">추정치</Badge>}
            {e.is_regulatory_filing && <Badge tone="info" size="sm">법정 공시</Badge>}
            {e.is_issuer_defined_metric && <Badge tone="warning" size="sm">발행사 정의 지표</Badge>}
            {/* NULL 은 "아니다"가 아니라 "안 적었다"다(§7.1) — 세 가지를 다르게 보인다. */}
            {e.supports_metric === true ? <Badge tone="success" size="sm">수치 뒷받침</Badge>
              : e.supports_metric === false ? <Badge tone="neutral" size="sm">서술만</Badge>
                : <Badge tone="neutral" size="sm">수치 뒷받침 미기재</Badge>}
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              원문 {e.published_at ?? '시점 없음'} · 관측 {e.observation_key ?? '키 미기재'}
            </span>
          </div>
          <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 4 }}>
            {e.domain ?? e.url}
          </a>
          {e.snippet && <blockquote style={{ margin: '4px 0 0', paddingLeft: 8, borderLeft: '2px solid var(--border-strong)', color: 'var(--text-body)' }}>{e.snippet}</blockquote>}
          {e.supports_claim && <p style={{ ...muted, marginTop: 4 }}>뒷받침: {e.supports_claim}</p>}
        </li>
      ))}
    </ul>
    </details>
    {caption}
    </div>
  )
}

/** 카드 앵커. 점프 목록·다음 케이스 링크가 같은 규칙으로 만든다. */
const caseAnchor = (slug: string) => `case-${slug}`

/**
 * 결정 영역 박스. 무브 결정과 케이스 결정이 같은 배경·같은 간격으로 이어져 있어서
 * 무브 승인을 케이스 승인으로 착각하는 자리였다(둘 다 approved 여야 매칭에 잡힌다 —
 * lib/cases/match.ts). 두 결정을 배경·테두리로 눈에 띄게 가른다. 안내 문구는 헤더 부제 그대로.
 */
function DecisionBox({ label, tone, children }: { label: string; tone: 'move' | 'case'; children: ReactNode }) {
  return (
    <section style={{
      display: 'grid', gap: 8,
      padding: tone === 'case' ? '12px 14px' : '10px 12px',
      borderRadius: 'var(--radius-md)',
      background: tone === 'case' ? 'var(--surface-muted)' : 'var(--surface-card)',
      border: tone === 'case' ? '2px solid var(--border-strong)' : '1px dashed var(--border-strong)',
    }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{label}</p>
      {children}
    </section>
  )
}

function MoveBlock({ m, i, evidence, caseEvidenceTotal, locked, transferabilityLocked }: {
  m: MoveRow; i: number; evidence: EvidenceRow[]; caseEvidenceTotal: number; locked: boolean; transferabilityLocked: boolean
}) {
  const g = gradeMove(m, evidence)
  const metric = m.metric_after == null
    ? '수치 없음'
    : `${m.metric_name}: ${m.metric_before ?? '?'} → ${m.metric_after}${m.metric_unit ?? ''}`
  const warn = moveApprovalWarning(m)
  return (
    <section style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'grid', gap: 8 }}>
      {/* ★ 등급 배지는 **오른쪽 끝**이다. 정보는 그대로 두되 시선 1순위만 이식성에 양보한다.
          읽는 사람이 먼저 물어야 할 것은 "이걸 내가 옮길 수 있나"이고, 등급은 그 무브에
          붙는 성질이지 판단의 출발점이 아니다. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {/* 번호는 CLI `case-review.mjs --move <n>` 인덱스와 같다(created_at, id 순). */}
        <b style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>#{i}</b>
        <Badge tone="neutral" size="sm">{m.lever}</Badge>
        <Badge tone={m.outcome_direction === 'negative' ? 'danger' : 'neutral'} size="sm">{m.outcome_direction ?? 'positive'}</Badge>
        <ReviewBadge status={m.review_status} />
        {!transferabilityLocked && (
          m.transferability
            ? <Badge tone={m.transferability === 'HIGH' ? 'success' : m.transferability === 'MEDIUM' ? 'info' : 'neutral'} size="sm">이식성 {m.transferability}</Badge>
            : <Badge tone="warning" size="sm">이식성 미판정</Badge>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {/* 두 축의 이름을 화면마다 같게 쓴다 — "등급"만 적혀 있으면 어느 축인지 알 수 없다(GradeLegend). */}
          <Badge tone={GRADE_TONE[m.evidence_grade] ?? 'neutral'} size="sm" title="인사이트 등급 — 독자가 옮겨 쓸 게 있나">인사이트 {m.evidence_grade}</Badge>
          <Badge tone="neutral" size="sm" title="사실확인 등급 — 그 수치를 믿을 수 있나. CG-1/CG-2 발행 게이트가 이걸 본다">사실확인 {m.fact_check_grade}</Badge>
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{m.claim}</p>
      {/* 본문급. 독자가 내일 할 수 있는 행동 1개가 이 파이프라인의 산출물이다. */}
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>
        {m.transfer_note
          ? <>→ {m.transfer_note}</>
          : <span style={{ color: 'var(--warning-fg)' }}>→ 옮길 행동 미기재 — 이게 없으면 독자가 가져갈 게 없다</span>}
      </p>
      <p style={muted}>
        {m.preconditions ? `전제: ${m.preconditions}` : '전제: 미기재 (— "전제 없음"이 아니다)'}
      </p>
      <p style={muted}>{metric} · 관측 {m.observed_period_start ?? '?'} ~ {m.observed_period_end ?? '?'}</p>
      <p style={muted}>
        현재 산식(인사이트) {g.grade} — {g.reason}
        {g.provisional && <> · <b style={{ color: 'var(--warning-fg)' }}>잠정(미기재 {g.unkeyed ?? 0}건 — 약하다가 아니라 아직 안 적었다)</b></>}
      </p>
      {g.grade !== m.evidence_grade && (
        <Notice tone="warning">
          저장 등급 {m.evidence_grade} ≠ 현재 산식 {g.grade}. 등급은 이 화면에서 바꾸지 않는다 — 사람이{' '}
          <code>case-review.mjs regrade --slug …</code> 로 재채점한 뒤 판단한다.
        </Notice>
      )}
      <EvidenceList rows={evidence} total={caseEvidenceTotal} />
      <DecisionBox label={`무브 #${i} 결정`} tone="move">
        {m.review_status === 'draft' ? (
          <DecisionForm kind="move" id={m.id} locked={locked} approveWarning={warn} transferabilityLocked={transferabilityLocked} />
        ) : (
          <p style={muted}>
            {REVIEW[m.review_status]?.label ?? m.review_status}
            {m.reviewed_by ? ` · ${m.reviewed_by}` : ' · 검수자 기록 없음(CLI 결정)'}
            {m.review_note ? ` · ${m.review_note}` : ''}
            {m.transferability ? ` · 이식성 ${TRANSFERABILITY_LABEL[m.transferability]}${m.transferability_by ? ` (${m.transferability_by})` : ''}` : ''}
            {m.review_status === 'approved' && warn ? ` · ⚠️ ${warn}` : ''}
          </p>
        )}
      </DecisionBox>
    </section>
  )
}

/**
 * 공개 상세의 👍/👎(case_feedback) — T3 사람 신호. 받기만 하고 읽는 곳이 없던 표를 검수자가 본다.
 * 3상태: 못 읽음(fbError) / 0건("피드백 없음") / 집계. 빈칸으로 두지 않는다(§7.1).
 */
function FeedbackLine({ tally, fbError }: { tally: FeedbackTally | undefined; fbError: string | null }) {
  if (fbError) return <p style={{ ...muted, color: 'var(--warning-fg)' }}>독자 피드백 확인 불가 — {fbError}</p>
  if (!tally) return <p style={muted}>독자 피드백 없음 (조회는 정상 — 👍/👎 0건)</p>
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        독자 피드백 <b>👍 {tally.up} · 👎 {tally.down}</b>
        <span style={{ color: 'var(--text-muted)' }}> · 코멘트 {tally.noted}건{tally.noted > tally.notes.length ? ` 중 최근 ${tally.notes.length}` : ''}</span>
      </p>
      {tally.notes.map((n, i) => (
        <p key={i} style={muted}>{n.vote > 0 ? '👍' : '👎'} {n.note} · {KST.format(Date.parse(n.at))}</p>
      ))}
    </div>
  )
}

function Chip({ k, v, tone }: { k: string; v: ReactNode; tone?: Tone }) {
  return <Badge tone={tone ?? 'neutral'} size="sm">{k} {v ?? '—'}</Badge>
}

// 제목·부제는 한 벌이다. 오류 화면과 정상 화면이 다른 문장을 쓰면 안 된다.
const HEADER = {
  title: '케이스 검수',
  subtitle: '에이전트가 draft 로 적립한 케이스를 사람이 보고 승인·반려한다. 승인 단위는 무브다 — 케이스 승인이 무브 승인이 아니다.',
} as const

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string; grade?: string; kind?: string }> }) {
  const sp = await searchParams
  const status = STATUS_FILTERS.find((f) => f.key === sp.status)?.key ?? 'pending'
  const grade = (GRADES as readonly string[]).includes(sp.grade ?? '') ? String(sp.grade) : 'all'
  const kind = KIND_FILTERS.find((f) => f.key === sp.kind)?.key ?? 'all'
  const qs = (patch: { status?: string; grade?: string; kind?: string }) => {
    const next: Record<string, string> = { status, grade, kind, ...patch }
    const p = new URLSearchParams()
    if (next.status !== 'pending') p.set('status', next.status)
    if (next.grade !== 'all') p.set('grade', next.grade)
    if (next.kind !== 'all') p.set('kind', next.kind)
    const s = p.toString()
    return s ? `/cases?${s}` : '/cases'
  }

  const sb = await createClient()
  const header = <PageHeader {...HEADER} />

  if (!sb) {
    return (
      <PageShell maxWidth={960}>
        {header}
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">케이스를 조회하지 못했다. 검수할 케이스가 없다는 뜻이 아니다.</Notice>
      </PageShell>
    )
  }

  const [res, moveCols, caseCols, axisCols, fbRes] = await Promise.all([
    sb.from('case_studies').select('*, case_moves(*), case_evidence(*)').order('created_at', { ascending: false }),
    // 결정 기록 컬럼 존재 확인. select 에 없는 컬럼을 넣으면 에러가 온다(head:true 트랩과 달리 정직하다).
    sb.from('case_moves').select('review_note,reviewed_by,reviewed_at').limit(1),
    sb.from('case_studies').select('review_note').limit(1),
    // 이식성 축(마이그 20260915000001). 없으면 화면을 죽이지 않고 배너 + 기존 정보만 보인다.
    sb.from('case_moves').select('transferability,transfer_note,preconditions').limit(1),
    // ponytail: 표 전체를 읽어 JS 에서 센다. 수천 건을 넘으면 집계 뷰/RPC 로 옮긴다(limit 로 자르면 숫자가 조용히 틀린다).
    sb.from('case_feedback').select('case_study_id, vote, note, created_at'),
  ])

  if (res.error || !res.data) {
    return (
      <PageShell maxWidth={960}>
        {header}
        <Notice tone="danger" title="확인 불가 — 케이스 조회 실패">
          {res.error?.message ?? '응답에 행이 없다'} · 검수할 케이스가 없다는 뜻이 아니다.
        </Notice>
      </PageShell>
    )
  }

  const colErr = moveCols.error ?? caseCols.error
  const colMissing = colErr && (colErr.code === '42703' || colErr.code === 'PGRST204' || /review_note|reviewed_by|reviewed_at/.test(colErr.message))
  const locked = Boolean(colErr)
  // 이식성 컬럼이 없으면 그 칸만 잠근다. 검수 자체는 계속 돌아가야 한다 —
  // 새 축 하나 때문에 승인이 멈추면 이번 설계가 풀려던 바로 그 병목이 더 커진다.
  const transferabilityLocked = Boolean(axisCols.error)

  const all = res.data as CaseRow[]
  const cases: ViewCase[] = all.map((c) => ({
    ...c,
    moves: [...(c.case_moves ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
    evidence: c.case_evidence ?? [],
  }))
  const isPending = (c: ViewCase) => c.review_status === 'draft' || c.moves.some((m) => m.review_status === 'draft')
  const byStatus = (c: ViewCase, s: string) => (s === 'all' ? true : s === 'pending' ? isPending(c) : c.review_status === s)
  // 등급은 무브에 붙는다 — 케이스는 그 등급 무브를 하나라도 가지면 걸린다.
  const byGrade = (c: ViewCase, g: string) => (g === 'all' ? true : c.moves.some((m) => m.evidence_grade === g))
  // 종류 판정은 productKindOf 한 곳을 쓴다 — 검색 화면과 이 화면이 각자 계산하면 갈린다(business_model NULL 은 소비재).
  const byKind = (c: ViewCase, k: string) =>
    (k === 'all' ? true : k === 'saas' ? productKindOf(c.business_model) === 'software' : productKindOf(c.business_model) !== 'software')
  const pending = cases.filter(isPending)
  const shown = cases.filter((c) => byStatus(c, status) && byGrade(c, grade) && byKind(c, kind))
  const statusLabel = STATUS_FILTERS.find((f) => f.key === status)?.label ?? status
  const draftMoves = pending.reduce((n, c) => n + c.moves.filter((m) => m.review_status === 'draft').length, 0)
  // 이식성 미판정 = 승인된 무브 중 판정이 없는 것. 컬럼이 없으면 세지 않는다 —
  // "전부 미판정"과 "축이 없다"를 같은 숫자로 만들면 §7.1 위반이다.
  const unrated = transferabilityLocked
    ? null
    : all.reduce((n, c) => n + (c.case_moves ?? []).filter((m) => m.review_status === 'approved' && !m.transferability).length, 0)

  // 피드백을 못 읽어도 검수는 계속된다 — 그 칸만 "확인 불가"로 말한다.
  const fbError = fbRes.error
    ? (classifyFeedbackError(fbRes.error)?.reason ?? fbRes.error.message)
    : Array.isArray(fbRes.data) ? null : '응답에 행 배열이 없다'
  const feedback = tallyFeedback(fbError ? [] : (fbRes.data as FeedbackVoteRow[]))

  const totalMoves = all.reduce((n, c) => n + (c.case_moves ?? []).length, 0)

  return (
    <PageShell maxWidth={960}>
      {/* action = 카드 채점 모드로 가는 유일한 입구. 링크가 없으면 만든 화면이 없는 화면이다. */}
      <PageHeader
        {...HEADER}
        action={<ButtonLink href="/cases/grade">카드 채점 모드 (하루 10장)</ButtonLink>}
        meta={<>전체 케이스 {all.length}건 · 무브 {totalMoves}건 중에서 셈 · 지금 보는 것은 {statusLabel}{grade === 'all' ? '' : ` · 등급 ${grade}`}{kind === 'all' ? '' : ` · ${KIND_FILTERS.find((f) => f.key === kind)?.label}`} {shown.length}건</>}
        filters={
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {STATUS_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                href={qs({ status: f.key })}
                active={status === f.key}
                count={cases.filter((c) => byStatus(c, f.key) && byGrade(c, grade) && byKind(c, kind)).length}
              >
                {f.label}
              </FilterChip>
            ))}
            <span aria-hidden style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
            <FilterChip href={qs({ grade: 'all' })} active={grade === 'all'} count={cases.filter((c) => byStatus(c, status) && byKind(c, kind)).length}>
              등급 전체
            </FilterChip>
            {GRADES.map((g) => (
              <FilterChip
                key={g}
                href={qs({ grade: g })}
                active={grade === g}
                count={cases.filter((c) => byStatus(c, status) && byGrade(c, g) && byKind(c, kind)).length}
              >
                등급 {g}
              </FilterChip>
            ))}
            <span aria-hidden style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
            {KIND_FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                href={qs({ kind: f.key })}
                active={kind === f.key}
                count={cases.filter((c) => byStatus(c, status) && byGrade(c, grade) && byKind(c, f.key)).length}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
        }
      />

      <GradeLegend />

      {/* 숫자 3개. "확인 불가"는 0 이 아니다 — 이식성 컬럼이 없으면 세지 않고 그렇게 적는다(§7.1). */}
      <StatGrid min={180}>
        <StatTile
          label="승인 대기 무브"
          value={draftMoves}
          tone={draftMoves > 0 ? 'warning' : undefined}
          caption={`검수 대기 케이스 ${pending.length}건 안에서 셈`}
        />
        <StatTile
          label="검수 대기 케이스"
          value={pending.length}
          caption={`전체 ${all.length}건 중 · 케이스가 draft 이거나 draft 무브를 가진 것`}
        />
        <StatTile
          label="이식성 미판정"
          value={unrated === null ? '확인 불가' : unrated}
          tone={unrated === null ? 'danger' : unrated > 0 ? 'warning' : undefined}
          caption={unrated === null
            ? '이식성 컬럼 미적용(마이그 20260915000001) — 0건이 아니라 못 셌다'
            : '승인된 무브 중 이식성 판정이 없는 것'}
        />
      </StatGrid>

      {transferabilityLocked && (
        <Notice tone="warning" title="이식성 축 미적용 — 마이그레이션 20260915000001">
          <code>case_moves.transferability</code> · <code>transfer_note</code> · <code>preconditions</code> 컬럼이 아직 없다({axisCols.error?.code ?? '사유 미기록'}).
          승인·반려는 그대로 되지만 이식성 판정은 저장되지 않는다. 사람이{' '}
          <code>supabase db query --linked -f supabase/migrations/20260915000001_case_reader_axis.sql</code> 로 적용한다.
          이 배너가 보이는 동안 앵글 우선순위는 종전(등급순)이다 — &quot;이식성 HIGH 가 없다&quot;가 아니라 &quot;축이 아직 없다&quot;다.
        </Notice>
      )}

      {locked && (
        <Notice tone="danger" title={colMissing ? '결정 버튼 잠김 — 검수 기록 컬럼 미적용' : '결정 버튼 잠김 — 검수 기록 컬럼 확인 불가'}>
          {colMissing
            ? <>반려 사유·무브 검수자를 남길 컬럼이 없다. 마이그레이션 <code>supabase/migrations/20260914000001_case_review_note.sql</code> 을 사람이 적용해야 한다. 기록 없이 결정하는 경로는 두지 않았다. 급하면 CLI <code>scripts/case-review.mjs approve|reject</code>.</>
            : <>{colErr?.message}</>}
        </Notice>
      )}

      {shown.length === 0 ? (
        <Card bodyStyle={{ padding: 0 }}>
          {status === 'pending' && grade === 'all' ? (
            <EmptyState compact title="검수 대기 0건 (조회는 정상)" description={`전체 케이스 ${all.length}건이 모두 결정됐다.`} />
          ) : (
            <EmptyState compact title="이 필터에 맞는 케이스 0건 (조회는 정상)" description={`전체 ${all.length}건 중 ${statusLabel}${grade === 'all' ? '' : ` · 등급 ${grade}`} 에 걸리는 케이스가 없다.`} />
          )}
        </Card>
      ) : (
        <>
          <p style={muted}>승인·반려 기록의 검수자에는 로그인한 계정 이메일이 남는다.</p>

          {/* 점프 목록. 12건이 한 페이지에 세로로 이어져 있어 아래쪽 케이스는 스크롤로만 갈 수 있었다.
              칩 하나 = 케이스 하나, 숫자는 그 케이스에서 아직 결정 안 한 무브 수. */}
          <nav aria-label="케이스 점프 목록" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {shown.map((c) => (
              <FilterChip key={c.id} href={`#${caseAnchor(c.slug)}`} active={false} count={c.moves.filter((m) => m.review_status === 'draft').length} countTone="warning">
                {c.brand_name}
              </FilterChip>
            ))}
          </nav>

          <div style={{ display: 'grid', gap: 16 }}>
            {shown.map((c, idx) => (
              <Card
                key={c.id}
                id={caseAnchor(c.slug)}
                style={{ scrollMarginTop: 64 }}
                title={c.brand_name}
                subtitle={<>{c.slug} · {[c.market, c.geo].filter(Boolean).join(' / ') || '시장 미기재'} · 조사 {c.researched_by ?? '미기재'} · 적립 {KST.format(Date.parse(c.created_at))}</>}
                action={<ReviewBadge status={c.review_status} />}
              >
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Chip k="병목" v={c.bottleneck} />
                    {/* 선정 1순위 축. 빈칸으로 두지 않는다 — 빈칸은 "해당 없음"처럼 보인다. */}
                    <Chip k="독자 문제" v={c.reader_problem ? (READER_PROBLEM_LABEL[c.reader_problem] ?? c.reader_problem) : '미지정'} />
                    <Chip k="모델" v={c.business_model} />
                    <Chip k="구매자" v={c.buyer_type} />
                    <Chip k="가격대" v={c.price_band} />
                    <Chip k="구매빈도" v={c.purchase_frequency} />
                    <Chip k="결말" v={c.outcome_status} tone={c.outcome_status === 'unknown' ? 'warning' : undefined} />
                    <Chip k="기간" v={`${c.period_start ?? '?'} ~ ${c.period_end ?? '?'}`} />
                  </div>
                  {c.summary && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{c.summary}</p>}
                  {c.tags && c.tags.length > 0 && <p style={muted}>태그 {c.tags.join(' · ')}</p>}
                  <FeedbackLine tally={feedback.get(c.id)} fbError={fbError} />

                  <EvidenceList label="케이스 전체 근거" rows={c.evidence.filter((e) => !e.case_move_id)} />

                  <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600 }}>무브 {c.moves.length}건</p>
                  {c.moves.map((m, i) => (
                    <MoveBlock key={m.id} m={m} i={i} evidence={c.evidence.filter((e) => e.case_move_id === m.id)} caseEvidenceTotal={c.evidence.length} locked={locked} transferabilityLocked={transferabilityLocked} />
                  ))}

                  <DecisionBox label="케이스 결정" tone="case">
                    {c.review_status === 'draft' ? (
                      <DecisionForm kind="case" id={c.id} locked={locked} approveWarning={caseApprovalWarning(c.moves)} />
                    ) : (
                      <p style={muted}>케이스는 이미 {REVIEW[c.review_status]?.label ?? c.review_status}{c.review_note ? ` · ${c.review_note}` : ''} — draft 무브만 남아 있다.</p>
                    )}
                    {/* 결정을 내린 자리에서 바로 다음 케이스로. 위로 올라가 점프 목록을 다시 찾지 않게. */}
                    {shown[idx + 1] ? (
                      <a href={`#${caseAnchor(shown[idx + 1].slug)}`} style={{ fontSize: 13, justifySelf: 'start' }}>
                        다음 케이스 ↓ {shown[idx + 1].brand_name}
                      </a>
                    ) : (
                      <p style={muted}>마지막 케이스다.</p>
                    )}
                  </DecisionBox>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </PageShell>
  )
}
