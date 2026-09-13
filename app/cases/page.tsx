import type { CSSProperties, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { gradeMove, type Evidence, type Move } from '@/lib/cases/draft'
import { caseApprovalWarning, moveApprovalWarning } from '@/lib/cases/review'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell } from '../_ds/components/Shell'
import { DecisionForm, ReviewerScope } from './decision-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: '케이스 검수' }

// 이 파일은 읽기만 한다. 쓰기는 ./actions.ts(사람이 누르는 서버 액션) 하나다.
// 등급은 여기서 계산해 **보여주기만** 한다 — 산식은 lib/cases/draft.ts gradeMove 한 벌이고,
// 저장 등급을 바꾸는 건 사람이 CLI regrade 로 한다(CLAUDE.md §10.1).

type EvidenceRow = Evidence & { id: string; case_move_id: string | null; domain: string | null }
type MoveRow = Move & {
  id: string
  evidence_grade: string
  review_status: string
  review_note?: string | null
  reviewed_by?: string | null
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

function EvidenceList({ rows }: { rows: EvidenceRow[] }) {
  if (rows.length === 0) return <p style={muted}>근거 0건</p>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
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
  )
}

function MoveBlock({ m, i, evidence, locked }: { m: MoveRow; i: number; evidence: EvidenceRow[]; locked: boolean }) {
  const g = gradeMove(m, evidence)
  const metric = m.metric_after == null
    ? '수치 없음'
    : `${m.metric_name}: ${m.metric_before ?? '?'} → ${m.metric_after}${m.metric_unit ?? ''}`
  const warn = moveApprovalWarning(m)
  return (
    <section style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {/* 번호는 CLI `case-review.mjs --move <n>` 인덱스와 같다(created_at, id 순). */}
        <b style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>#{i}</b>
        <Badge tone="neutral" size="sm">{m.lever}</Badge>
        <Badge tone={GRADE_TONE[m.evidence_grade] ?? 'neutral'} size="sm">등급 {m.evidence_grade}</Badge>
        <Badge tone={m.outcome_direction === 'negative' ? 'danger' : 'neutral'} size="sm">{m.outcome_direction ?? 'positive'}</Badge>
        <ReviewBadge status={m.review_status} />
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{m.claim}</p>
      <p style={muted}>{metric} · 관측 {m.observed_period_start ?? '?'} ~ {m.observed_period_end ?? '?'}</p>
      <p style={muted}>
        현재 산식 {g.grade} — {g.reason}
        {g.provisional && <> · <b style={{ color: 'var(--warning-fg)' }}>잠정(미기재 {g.unkeyed ?? 0}건 — 약하다가 아니라 아직 안 적었다)</b></>}
      </p>
      {g.grade !== m.evidence_grade && (
        <Notice tone="warning">
          저장 등급 {m.evidence_grade} ≠ 현재 산식 {g.grade}. 등급은 이 화면에서 바꾸지 않는다 — 사람이{' '}
          <code>case-review.mjs regrade --slug …</code> 로 재채점한 뒤 판단한다.
        </Notice>
      )}
      <EvidenceList rows={evidence} />
      {m.review_status === 'draft' ? (
        <DecisionForm kind="move" id={m.id} locked={locked} approveWarning={warn} />
      ) : (
        <p style={muted}>
          {REVIEW[m.review_status]?.label ?? m.review_status}
          {m.reviewed_by ? ` · ${m.reviewed_by}` : ' · 검수자 기록 없음(CLI 결정)'}
          {m.review_note ? ` · ${m.review_note}` : ''}
          {m.review_status === 'approved' && warn ? ` · ⚠️ ${warn}` : ''}
        </p>
      )}
    </section>
  )
}

function Chip({ k, v, tone }: { k: string; v: ReactNode; tone?: Tone }) {
  return <Badge tone={tone ?? 'neutral'} size="sm">{k} {v ?? '—'}</Badge>
}

export default async function CasesPage() {
  const sb = await createClient()
  const header = (
    <PageHeader
      title="케이스 검수"
      subtitle="에이전트가 draft 로 적립한 케이스를 사람이 보고 승인·반려한다. 승인 단위는 무브다 — 케이스 승인이 무브 승인이 아니다."
    />
  )

  if (!sb) {
    return (
      <PageShell maxWidth={960}>
        {header}
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">케이스를 조회하지 못했다. 검수할 케이스가 없다는 뜻이 아니다.</Notice>
      </PageShell>
    )
  }

  const [res, moveCols, caseCols] = await Promise.all([
    sb.from('case_studies').select('*, case_moves(*), case_evidence(*)').order('created_at', { ascending: false }),
    // 결정 기록 컬럼 존재 확인. select 에 없는 컬럼을 넣으면 에러가 온다(head:true 트랩과 달리 정직하다).
    sb.from('case_moves').select('review_note,reviewed_by,reviewed_at').limit(1),
    sb.from('case_studies').select('review_note').limit(1),
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

  const all = res.data as CaseRow[]
  const pending = all
    .map((c) => ({
      ...c,
      moves: [...(c.case_moves ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
      evidence: c.case_evidence ?? [],
    }))
    .filter((c) => c.review_status === 'draft' || c.moves.some((m) => m.review_status === 'draft'))
  const draftMoves = pending.reduce((n, c) => n + c.moves.filter((m) => m.review_status === 'draft').length, 0)

  return (
    <PageShell maxWidth={960}>
      {header}

      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-body)' }}>
        검수 대기 케이스 <b>{pending.length}건</b> · draft 무브 <b>{draftMoves}건</b>
        <span style={{ color: 'var(--text-muted)' }}> (전체 케이스 {all.length}건 중 · 케이스 draft 이거나 draft 무브가 남은 것)</span>
      </p>

      {locked && (
        <Notice tone="danger" title={colMissing ? '결정 버튼 잠김 — 검수 기록 컬럼 미적용' : '결정 버튼 잠김 — 검수 기록 컬럼 확인 불가'}>
          {colMissing
            ? <>반려 사유·무브 검수자를 남길 컬럼이 없다. 마이그레이션 <code>supabase/migrations/20260914000001_case_review_note.sql</code> 을 사람이 적용해야 한다. 기록 없이 결정하는 경로는 두지 않았다. 급하면 CLI <code>scripts/case-review.mjs approve|reject</code>.</>
            : <>{colErr?.message}</>}
        </Notice>
      )}

      {pending.length === 0 ? (
        <Card bodyStyle={{ padding: 0 }}>
          <EmptyState compact title="검수 대기 0건 (조회는 정상)" description={`전체 케이스 ${all.length}건이 모두 결정됐다.`} />
        </Card>
      ) : (
        <ReviewerScope>
          <div style={{ display: 'grid', gap: 16 }}>
            {pending.map((c) => (
              <Card
                key={c.id}
                title={c.brand_name}
                subtitle={<>{c.slug} · {[c.market, c.geo].filter(Boolean).join(' / ') || '시장 미기재'} · 조사 {c.researched_by ?? '미기재'} · 적립 {KST.format(Date.parse(c.created_at))}</>}
                action={<ReviewBadge status={c.review_status} />}
              >
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Chip k="병목" v={c.bottleneck} />
                    <Chip k="모델" v={c.business_model} />
                    <Chip k="구매자" v={c.buyer_type} />
                    <Chip k="가격대" v={c.price_band} />
                    <Chip k="구매빈도" v={c.purchase_frequency} />
                    <Chip k="결말" v={c.outcome_status} tone={c.outcome_status === 'unknown' ? 'warning' : undefined} />
                    <Chip k="기간" v={`${c.period_start ?? '?'} ~ ${c.period_end ?? '?'}`} />
                  </div>
                  {c.summary && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{c.summary}</p>}
                  {c.tags && c.tags.length > 0 && <p style={muted}>태그 {c.tags.join(' · ')}</p>}

                  <div>
                    <p style={{ ...muted, marginBottom: 6 }}>케이스 전체 근거</p>
                    <EvidenceList rows={c.evidence.filter((e) => !e.case_move_id)} />
                  </div>

                  <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600 }}>무브 {c.moves.length}건</p>
                  {c.moves.map((m, i) => (
                    <MoveBlock key={m.id} m={m} i={i} evidence={c.evidence.filter((e) => e.case_move_id === m.id)} locked={locked} />
                  ))}

                  <section style={{ borderTop: '2px solid var(--border-strong)', paddingTop: 14, display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>케이스 결정</p>
                    {c.review_status === 'draft' ? (
                      <DecisionForm kind="case" id={c.id} locked={locked} approveWarning={caseApprovalWarning(c.moves)} />
                    ) : (
                      <p style={muted}>케이스는 이미 {REVIEW[c.review_status]?.label ?? c.review_status}{c.review_note ? ` · ${c.review_note}` : ''} — draft 무브만 남아 있다.</p>
                    )}
                  </section>
                </div>
              </Card>
            ))}
          </div>
        </ReviewerScope>
      )}
    </PageShell>
  )
}
