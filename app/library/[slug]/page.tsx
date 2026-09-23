import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthVerdict } from '@/lib/auth/session'
import {
  evidenceTally, gradeChecklist, groupEvidence, loadCaseDetail, metricTiles, pickLeadMove,
  detailTitle, type CaseDetail, type DetailEvidenceRow, type DetailMoveRow,
} from '@/lib/cases/detail'
import { displayGradeLabel, factCheckLabel } from '@/lib/cases/grade-display'
import { READER_PROBLEM_LABEL } from '@/lib/cases/draft'
import { Badge } from '../../_ds/components/Badge'
import { BrandLogo, BrandLogoNotice } from '../../_ds/components/BrandLogo'
import { ButtonLink } from '../../_ds/components/Button'
import { Card } from '../../_ds/components/Card'
import { CaseCard } from '../../_ds/components/CaseCard'
import { EmptyState } from '../../_ds/components/EmptyState'
import { EvidenceCaption } from '../../_ds/components/EvidenceCaption'
import { GradeLegend } from '../../_ds/components/GradeLegend'
import { Notice, PageShell } from '../../_ds/components/Shell'
import { isSaved } from '@/lib/cases/saves'
import { FeedbackForm } from './feedback-form'
import { SaveButton } from './save-button'
import { ShareLinkButton } from './share-button'

// 공개 케이스 상세. **승인된 케이스만** 그린다 — 미승인·없는 slug 는 똑같이 404 다.
// 조회 실패는 404 로 접지 않는다(§7.1): "없다"와 "못 읽었다"는 다음 행동이 정반대다.
//
// 구조는 reports/2026-09-23/ui-overhaul-reference-plan.md §3 의 11블록이다. 블록 7(VOC 인용)은
// **만들지 않았다** — 케이스의 `reader_problem` 을 리뷰(analysis_inputs)로 잇는 깨끗한 키가
// 스키마에 없다. `analysis_projects` 에 `reader_problem` 컬럼이 없고(lib/analysis/relevance-judge.ts
// 의 주석이 그걸 "미래 대비"로 명시한다), 병목·문제 유형으로 프로젝트를 고르는 축도 없다.
// 짐작 매핑으로 남의 리뷰를 이 케이스의 VOC 라고 붙이는 것이 그 블록을 비워 두는 것보다 나쁘다.
//
// 이 화면은 읽기 전용이다. 쓰기는 ./actions.ts 의 피드백 INSERT 하나뿐이다.

export const dynamic = 'force-dynamic'

const muted: CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-muted)' }
const body: CSSProperties = { margin: 0, fontSize: 'var(--fs-base)', lineHeight: 1.75, color: 'var(--text-body)' }
const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const day = (v: string | null | undefined) => (v ? KST.format(new Date(v)) : null)

const OUTCOME_LABEL: Record<string, string> = {
  active: '지금도 영업 중', pivoted: '사업을 틀었다', shutdown: '문 닫았다',
  unknown: '지금 어떤지 확인하지 않았다',
}

const TOC = [
  ['grade', '왜 이 등급인가'],
  ['metrics', '수치'],
  ['moves', '무엇을 했나'],
  ['evidence', '근거'],
  ['split', '갈린 사례 · 실패 경고'],
  ['feedback', '의견 남기기'],
  ['related', '관련 케이스'],
] as const

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sb = await createClient()
  if (!sb) return { title: '케이스' }
  const res = await loadCaseDetail(sb, slug, 'library/[slug]/metadata')
  if (res.status !== 'ok') return { title: '케이스' }
  return {
    title: detailTitle(res.detail.study),
    description: res.detail.study.summary ?? undefined,
  }
}

/** 섹션 한 칸. 제목에 id 를 달아 TOC 앵커가 된다(스크롤 여백은 styles.css 의 `[id]`). */
function Section({ id, title, subtitle, children }: {
  id: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} style={{ display: 'grid', gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-strong)' }}>{title}</h2>
        {subtitle ? <p style={{ ...muted, marginTop: 4 }}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** 근거 1줄. 도메인·게시일·인용·원문 링크. 인용은 DB 에서 이미 300자로 잘려 온다. */
function EvidenceRow({ e }: { e: DetailEvidenceRow }) {
  return (
    <li style={{ display: 'grid', gap: 4, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>{e.domain ?? '도메인 미기재'}</span>
        <span>{day(e.published_at) ?? '게시일 미상'}</span>
        {e.is_estimate ? <Badge tone="warning" size="sm">추정</Badge> : null}
        {e.is_regulatory_filing ? <Badge tone="info" size="sm">공시</Badge> : null}
      </div>
      {e.snippet ? <p style={{ ...body, fontSize: 13 }}>&ldquo;{e.snippet}&rdquo;</p> : <p style={muted}>인용 미기재</p>}
      <a href={e.url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{e.url}</a>
    </li>
  )
}

/** 무브 한 칸 — 번호·시점·무엇을 했나·전제·내일 할 행동. 화살표를 쓰지 않는다(번호로 순서를 말한다). */
function MoveBlock({ move, index, total }: { move: DetailMoveRow; index: number; total: number }) {
  const from = day(move.observed_period_start)
  const to = day(move.observed_period_end)
  const when = from ? (to && to !== from ? `${from} ~ ${to}` : from) : '시점 미확인'
  const pre = (move.preconditions ?? '').trim()
  const note = (move.transfer_note ?? '').trim()

  return (
    <div style={{ display: 'grid', gap: 8, padding: '12px 0', borderTop: index === 0 ? 'none' : '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Badge tone="neutral" size="sm">{total === 1 ? '무브 1개' : `${index + 1} / ${total}`}</Badge>
        <Badge tone="neutral" size="sm">{move.lever}</Badge>
        <span style={{ fontSize: 12, color: from ? 'var(--text-muted)' : 'var(--warning-fg)' }}>{when}</span>
        <Badge tone="info" size="sm">인사이트 {displayGradeLabel(move)}</Badge>
        <Badge tone="neutral" size="sm">사실확인 {factCheckLabel(move)}</Badge>
      </div>

      <p style={body}><b>무엇을 했나</b> · {move.claim}</p>

      {/* 미기재를 "전제 없음"으로 쓰지 않는다 — 이 축엔 "없음"이라는 양성 값이 없다(§7.1). */}
      <p style={muted}>
        <b>전제</b> · {pre || '미기재 — 무엇이 있어야 옮길 수 있는지 아직 안 적혔다'}
      </p>

      {note ? (
        <div style={{
          padding: '10px 12px', borderRadius: 'var(--radius-md)',
          background: 'var(--info-bg)', border: '1px solid var(--info-border)',
        }}>
          <p style={{ ...body, color: 'var(--info-fg)' }}><b>내일 할 행동</b> · {note}</p>
        </div>
      ) : (
        <p style={{ ...muted, color: 'var(--warning-fg)' }}>
          내일 할 행동이 안 적혀 있다 — 사실이 맞아도 지금 가져갈 게 없다(인사이트 등급 D).
        </p>
      )}
    </div>
  )
}

/** 저장 상태 — 서버가 읽어 초기값으로 내려 준다. `unavailable` 은 "저장 안 됨"이 아니다(§7.1). */
type SaveView = { saved: boolean; unavailable: string | null }

function Detail({ d, signedIn, save }: { d: CaseDetail; signedIn: boolean; save: SaveView }) {
  const s = d.study
  const lead = pickLeadMove(d.moves)
  const leadEvidence = lead ? (d.evidence_by_move.get(lead.id) ?? []) : []
  const checklist = gradeChecklist(lead, leadEvidence.length > 0 ? leadEvidence : d.evidence)
  const tiles = metricTiles(d.moves, d.evidence_by_move)
  const groups = groupEvidence(d.evidence)
  const reviewedOn = day(s.reviewed_at)
  const period = [day(s.period_start), day(s.period_end)].filter(Boolean).join(' ~ ')
  const levers = [...new Set(d.moves.map((m) => m.lever))]
  const problemHref = s.reader_problem ? `/cases/search?problem=${encodeURIComponent(s.reader_problem)}` : '/cases/search'

  return (
    <div className="sa-detail">
      {/* 11) 사이드 TOC — 데스크톱 sticky, 모바일 상단 가로 칩. CSS 만(styles.css `.sa-toc`). */}
      <nav className="sa-toc" aria-label="이 페이지 목차">
        {TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <div className="sa-body" style={{ display: 'grid', gap: 24, minWidth: 0 }}>
        {/* ── 1) 히어로 ───────────────────────────────────────── */}
        <header style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <BrandLogo study={s} bottleneck={s.bottleneck} size={72} />
            <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
              <h1 style={{
                margin: 0, fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-bold)',
                lineHeight: 'var(--lh-snug)', letterSpacing: 'var(--ls-tight)',
                color: 'var(--text-strong)', overflowWrap: 'anywhere',
              }}>
                {detailTitle(s)}
              </h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {s.reader_problem
                  ? <Badge tone="violet" size="sm">{READER_PROBLEM_LABEL[s.reader_problem] ?? s.reader_problem}</Badge>
                  : <Badge tone="neutral" size="sm">문제 유형 미지정</Badge>}
                <Badge tone="neutral" size="sm">병목 {s.bottleneck ?? '미기재'}</Badge>
                {levers.map((l) => <Badge key={l} tone="neutral" size="sm">{l}</Badge>)}
                <Badge tone="neutral" size="sm">{period || '기간 미기재'}</Badge>
                <Badge tone={s.outcome_status === 'shutdown' ? 'danger' : 'neutral'} size="sm">
                  {OUTCOME_LABEL[s.outcome_status ?? 'unknown'] ?? s.outcome_status}
                </Badge>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Badge tone="info" size="sm" title="인사이트 등급 — 내가 옮겨 쓸 게 있나">
                  인사이트 {displayGradeLabel(lead)}
                </Badge>
                <Badge tone="neutral" size="sm" title="사실확인 등급 — 그 수치를 믿을 수 있나. 미기재는 D 가 아니다">
                  사실확인 {factCheckLabel(lead)}
                </Badge>
                {/* "사람 검토 완료" 는 검수자·시각이 **둘 다** 있을 때만 말한다 — 없으면 승인 사실만 말한다. */}
                <Badge tone={s.reviewed_by && reviewedOn ? 'success' : 'warning'} size="sm">
                  근거 {d.evidence.length}건 · {s.reviewed_by && reviewedOn
                    ? `사람 검토 완료 (${s.reviewed_by}, ${reviewedOn})`
                    : '검토 기록 미기재 (승인은 됐다)'}
                </Badge>
              </div>
            </div>
          </div>

          {s.summary ? <p style={body}>{s.summary}</p> : <p style={muted}>한 줄 요약이 아직 없다.</p>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <ButtonLink href={problemHref} variant="primary" size="sm">내 상황으로 옮기기</ButtonLink>
            <SaveButton
              caseStudyId={s.id}
              slug={s.slug}
              signedIn={signedIn}
              initialSaved={save.saved}
              unavailable={save.unavailable}
            />
            <ShareLinkButton />
          </div>
          <BrandLogoNotice />

          {d.logo_columns === 'missing' && (
            <Notice tone="warning" title="로고 컬럼 미적용">
              마이그레이션 20260930000001 이 아직 적용되지 않아 브랜드 로고를 <b>읽지 못했다</b>.
              로고가 없는 것이 아니라 확인 불가다 — 지금은 이니셜을 그린다.
            </Notice>
          )}
          {d.excluded_moves > 0 && (
            <p style={muted}>
              이 케이스의 무브 {d.moves.length + d.excluded_moves}개 중 {d.excluded_moves}개는 아직 승인 전이라 이 화면에 없다.
            </p>
          )}
        </header>

        {/* ── 2) 왜 이 등급인가 ──────────────────────────────── */}
        <Section
          id="grade"
          title="왜 이 등급인가"
          subtitle={lead
            ? `대표 무브(${lead.lever})를 기준으로 본 항목별 통과·미달이다. 합계 점수를 만들지 않는다 — 등급 4단계가 이 아카이브의 판정이고, 점수는 근거 없는 숫자가 된다.`
            : '승인된 무브가 없어 항목을 셀 수 없다.'}
        >
          <Card>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {checklist.map((item) => (
                <li key={item.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Badge tone={item.pass ? 'success' : item.required ? 'warning' : 'neutral'} size="sm">
                    {item.pass ? '통과' : item.required ? '미달' : '없음'}
                  </Badge>
                  <span style={{ fontSize: 13, lineHeight: 1.6 }}>
                    <b style={{ color: 'var(--text-strong)' }}>{item.label}</b>
                    <span style={{ color: 'var(--text-muted)' }}> — {item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p style={{ ...muted, marginTop: 12 }}>
              산식 정본은 <Link href="/library/methodology">방법론 페이지</Link>(사실확인) ·{' '}
              <code>lib/cases/draft.ts gradeMove</code>(인사이트) 이고, 재채점으로 바뀐다.
            </p>
            <div style={{ marginTop: 8 }}><GradeLegend /></div>
          </Card>
        </Section>

        {/* ── 3) 수치 타일 ───────────────────────────────────── */}
        <Section id="metrics" title="수치" subtitle="무브가 적은 지표의 before → after. 이름·단위가 없는 숫자는 타일이 되지 않는다(DB 제약이 그 조합을 막는다).">
          {tiles.length === 0 ? (
            <Card bodyStyle={{ padding: 0 }}>
              <EmptyState compact title="수치가 적힌 무브가 0건 (조회는 정상)"
                description="서술만 있는 케이스다. 없는 숫자를 만들지 않는다 — 인사이트 등급은 수치와 별개 축이다." />
            </Card>
          ) : (
            <div className="sa-cardgrid">
              {tiles.map((t) => (
                <div key={`${t.move_id}-${t.name}`} style={{
                  padding: '12px 16px', background: 'var(--surface-card)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.name}</div>
                  <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)' }}>
                    {t.before == null ? '?' : t.before.toLocaleString()} → {t.after.toLocaleString()}
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}> {t.unit}</span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {t.estimate_only && <Badge tone="warning" size="sm">추정</Badge>}
                    {t.no_evidence && <Badge tone="warning" size="sm">근거 0건</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── 4) 무브 타임라인 ───────────────────────────────── */}
        <Section
          id="moves"
          title="무엇을 했나"
          subtitle={`승인된 무브 ${d.moves.length}개 · 관측 시점 순(시점 미확인은 뒤). 순서는 인과가 아니라 시간이다.`}
        >
          <Card>
            {d.moves.length === 0
              ? <p style={muted}>승인된 무브가 0개다 — 케이스는 승인됐지만 무브 승인이 아직 없다.</p>
              : d.moves.map((m, i) => <MoveBlock key={m.id} move={m} index={i} total={d.moves.length} />)}
          </Card>
        </Section>

        {/* ── 5) 근거 목록 ───────────────────────────────────── */}
        <Section id="evidence" title="근거" subtitle="출처 성격별로 묶었다. 2차 보도와 추정치는 독립 확인으로 세지 않는다(docs/evidence-rules.md §1).">
          <Card>
            <EvidenceCaption
              n={d.evidence.length}
              total={null}
              noun="근거"
              source={d.evidence.length > 0 ? evidenceTally(d.evidence) : undefined}
              method={d.evidence.length > 0 ? '이 케이스의 근거 행에서 셈' : '근거 행이 없다 — 조회는 정상이다'}
            />
            {groups.map((g) => (
              <div key={g.key} style={{ marginTop: 14 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {g.label} {g.rows.length}건
                </p>
                <p style={{ ...muted, fontSize: 12 }}>{g.note}</p>
                <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
                  {g.rows.map((e) => <EvidenceRow key={e.id} e={e} />)}
                </ul>
              </div>
            ))}
          </Card>
        </Section>

        {/* ── 6) 갈린 사례 + 실패 경고 ───────────────────────── */}
        <Section
          id="split"
          title="갈린 사례 · 실패 경고"
          subtitle="같은 병목·레버인데 방향이 반대인 다른 케이스, 그리고 같은 소구점으로 이미 실패한 기록."
        >
          <Card title="같은 수를 썼는데 갈렸다" subtitle={d.splits_reason}>
            {d.splits.length === 0 ? (
              <EmptyState compact title="이 케이스와 갈린 짝이 0묶음 (조회는 정상)"
                description="같은 병목·레버로 반대 결과가 승인된 다른 케이스가 아직 없다. 없는 것을 비슷한 사례로 채우지 않는다." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {d.splits.map((sp) => (
                  <div key={sp.ours.id} style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-muted)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <Badge tone="neutral" size="sm">{sp.bottleneck}</Badge>
                      <Badge tone="neutral" size="sm">{sp.lever}</Badge>
                    </div>
                    <p style={{ margin: 0, fontSize: 13 }}>
                      <b>이 케이스({sp.ours.outcome_direction === 'positive' ? '됐다' : '안 됐다'})</b> — {sp.ours.claim}
                    </p>
                    {sp.others.map((o) => (
                      <p key={o.move.id} style={{ margin: 0, fontSize: 13, color: o.move.outcome_direction === 'negative' ? 'var(--danger-fg)' : 'var(--text-body)' }}>
                        <b>
                          <Link href={`/library/${o.study.slug}`}>{o.study.brand_name}</Link>
                          {o.move.outcome_direction === 'positive' ? '는 됐다' : '는 안 됐다'}
                        </b> — {o.move.claim}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="이 소구점으로 망한 적 있나" subtitle="실패 앵글 원장(failed_angles)에서 이 케이스의 요약·주장과 낱말이 겹치는 행">
            {d.failed_angles.status === 'not_run' ? (
              <p style={{ ...muted, color: 'var(--warning-fg)' }}>찾지 못했다 — {d.failed_angles.reason}</p>
            ) : d.failed_angles.cards.length === 0 ? (
              <EmptyState compact title="겹치는 실패 기록이 0건 (조회는 정상)" description={d.failed_angles.reason} />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {d.failed_angles.cards.map((c) => (
                  <div key={c.case_key} style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <Badge tone="neutral" size="sm">{c.product_category}</Badge>
                      <Badge tone="neutral" size="sm">{c.source_tier}</Badge>
                      {c.is_estimate && <Badge tone="warning" size="sm">추정</Badge>}
                      {c.low_confidence && <Badge tone="warning" size="sm">신뢰도 낮음</Badge>}
                    </div>
                    <p style={{ ...body, fontSize: 13 }}>내세웠던 소구점 · {c.claimed_angle}</p>
                    <p style={{ ...body, fontSize: 13, color: 'var(--danger-fg)' }}>결과 · {c.outcome}</p>
                    <p style={{ ...muted, fontSize: 12 }}>
                      겹친 낱말 · {c.matched_terms.map((t) => `“${t}”`).join(', ')}
                      {c.low_confidence && ' — 낱말 하나로 걸렸다. 우연인지 직접 확인하라.'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Section>

        {/* ── 7) VOC 인용: 만들지 않았다. 이유는 파일 상단 주석. ── */}

        {/* ── 8) 피드백 위젯 ─────────────────────────────────── */}
        <Section id="feedback" title="의견 남기기" subtitle="이 케이스가 옮길 만했는지 한 번만 눌러 주면 다음 조사 순서가 바뀐다. 집계는 화면에 내지 않는다 — 앞사람의 표를 따라가지 않게.">
          <Card>
            <FeedbackForm caseStudyId={s.id} signedIn={signedIn} />
          </Card>
        </Section>

        {/* ── 9) 관련 케이스 3장 ─────────────────────────────── */}
        <Section id="related" title="관련 케이스" subtitle="같은 문제 유형 → 같은 병목 → 같은 종류 순. 3장을 못 채우면 비슷한 것으로 메우지 않는다.">
          {d.related.length === 0 ? (
            <Card bodyStyle={{ padding: 0 }}>
              <EmptyState compact title="관련 케이스 0건 (조회는 정상)"
                description="같은 문제 유형·병목·종류로 승인 무브가 있는 다른 케이스가 아직 없다." />
            </Card>
          ) : (
            <>
              <div className="sa-cardgrid">
                {d.related.map((r) => (
                  <CaseCard key={r.study.id} study={r.study} move={r.move} moveCount={r.move_count} reason={r.reason} />
                ))}
              </div>
              <BrandLogoNotice />
            </>
          )}
        </Section>

        {/* ── 10) CTA 배너 ───────────────────────────────────── */}
        <section style={{
          display: 'grid', gap: 10, padding: '24px 20px',
          borderRadius: 'var(--lib-radius-banner, 32px)',
          background: 'linear-gradient(135deg, var(--slate-900), var(--violet-700))',
          color: '#fff',
        }}>
          <p style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 700, lineHeight: 1.35 }}>
            같은 곳에 막혀 있다면, 내 문제로 검색해 보라.
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.8)' }}>
            승인된 케이스·무브만 나온다. 없으면 없다고 말한다.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <ButtonLink href={problemHref} variant="neutral" size="sm" style={{ background: '#fff', color: 'var(--slate-900)' }}>
              내 문제로 검색하기
            </ButtonLink>
            {!signedIn && (
              <ButtonLink href="/" variant="ghost" size="sm" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}>
                베타 신청
              </ButtonLink>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default async function LibraryCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sb = await createClient()
  if (!sb) {
    return (
      <PageShell maxWidth={1100}>
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">
          케이스를 읽지 못했다. 이 케이스가 없다는 뜻이 아니다.
        </Notice>
      </PageShell>
    )
  }

  const res = await loadCaseDetail(sb, slug)
  if (res.status === 'error') {
    return (
      <PageShell maxWidth={1100}>
        <Notice tone="danger" title="확인 불가 — 케이스 조회 실패">
          {res.reason} · 404 로 접지 않는다. 다시 시도해도 같으면 로그를 봐야 한다.
        </Notice>
      </PageShell>
    )
  }
  if (res.status === 'not_found') notFound()

  // 로그인 여부는 **표시용**이다(피드백·저장 가드는 서버 액션이 스스로 한다).
  const verdict = await getAuthVerdict()

  // 저장 여부는 로그인한 사람에게만 묻는다. 못 읽었으면 "저장 안 됨"이 아니라 사유를 넘긴다 —
  // 마이그 20260930000002 미적용 상태에서 버튼이 눌리는 것처럼 보이면 안 된다(§7.1).
  const saveState = verdict.kind === 'allowed' ? await isSaved(sb, res.detail.study.id, verdict.email) : null
  const save = {
    saved: saveState?.state === 'saved',
    unavailable: saveState?.state === 'unavailable' ? saveState.reason : null,
  }

  return (
    <div className="sa-lib">
      <PageShell maxWidth={1100}>
        <Detail d={res.detail} signedIn={verdict.kind === 'allowed'} save={save} />
      </PageShell>
    </div>
  )
}
