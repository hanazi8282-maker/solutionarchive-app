import { createClient } from '@/lib/supabase/server'
import { maturityStageOf } from '@/lib/analysis/types'
import { aspectVerdict, opportunityBreakdown } from '@/lib/analysis/aspect-verdict'
import {
  demandAxis, PMF_QUADRANT_ADVICE, PMF_QUADRANT_LABELS, noQuadrantAdvice,
  type Quadrant as PmfQuadrant,
} from '@/lib/cases/match'
import { DRAFT_NOTICE, topAspects } from '@/lib/cases/summary'
import { Badge, type Tone } from '../../../_ds/components/Badge'
import { ButtonLink } from '../../../_ds/components/Button'
import { Card } from '../../../_ds/components/Card'
import { EmptyState } from '../../../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell } from '../../../_ds/components/Shell'
import { AdvisorLoader } from '../advisor-cards'
import { CopySummary } from './copy-summary'
import { PmfRunCard, type Facets } from './pmf-run-card'
import { RemedySection } from './remedy-section'

// ── /analyze/[id]/result — 진단 보고서 한 장 (docs/pmf-product-design.md §3-1) ──
//
// 읽기는 서버에서 한 번에 한다(목록 화면과 같은 service_role 클라이언트). 클라이언트로 내려가는 건
// 액션 3개뿐이다: 진단 실행 · 문제 해결 제안 · 요약 복사.
//
// 섹션 순서는 "결론 → 근거 → 행동". 두 축을 한 숫자로 합치지 않고, 축이 비면 사분면을 그리지 않는다
// (lib/cases/match.ts). 값이 없는 자리는 빈칸이 아니라 "왜 없는지 + 어떻게 채우는지" 로 채운다(§7.1).

export const dynamic = 'force-dynamic'
export const metadata = { title: 'PMF 진단 결과' }

type AspectRow = {
  id: string
  name: string
  notes: string | null
  importance: number | string | null
  satisfaction: number | string | null
  opportunity_score: number | string | null
  evidence_quotes: { text?: string | null; source_type?: string | null }[] | null
  human_confirmed: boolean | null
}

type PmfRow = {
  demand_axis: number | string | null
  precedent_axis: number | string | null
  quadrant: PmfQuadrant | null
  match_status: 'matched' | 'no_match' | 'not_run'
  match_reason: string | null
  created_at: string | null
}

const QUADRANT_TONE: Record<PmfQuadrant, Tone> = {
  PROVEN_DEMAND: 'success', UNCHARTED_DEMAND: 'warning', CROWDED_NO_DEMAND: 'neutral', PARK: 'neutral',
}

/** 퍼센타일을 내려면 필요한 최소 표본. 퀴즈 결과 화면과 같은 규칙 — 적은 표본으로 순위를 말하지 않는다. */
const PERCENTILE_MIN_SAMPLE = 30

const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))
const fmt = (v: number | null) => (v == null ? '확인 불가' : v.toFixed(2))
const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

const muted: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 'var(--lh-normal)' }
const bodyText: React.CSSProperties = { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-body)', lineHeight: 'var(--lh-relaxed)', overflowWrap: 'anywhere' }

function Axis({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
      background: 'var(--surface-muted)', minWidth: 0, display: 'grid', gap: 4,
    }}>
      <div className="dgy-caps">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)' }}>{value}</div>
      {children}
    </div>
  )
}

export default async function PmfResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  if (!supabase) {
    return (
      <PageShell maxWidth={860}>
        <PageHeader title="진단 결과" />
        <Notice tone="danger">DB 연결에 실패했습니다 — 결과가 없다는 뜻이 아닙니다.</Notice>
      </PageShell>
    )
  }

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch, market, status, maturity_stage, maturity_notes, m_meta_signal, bottleneck, business_model, buyer_type, price_band, purchase_frequency')
    .eq('id', id)
    .maybeSingle()

  if (projectError || !project) {
    return (
      <PageShell maxWidth={720}>
        <PageHeader title="진단 결과" />
        <Card padded={false}>
          <EmptyState
            tone="danger"
            title="진단 결과를 불러오지 못했습니다"
            description={`${projectError?.message ?? '프로젝트를 찾지 못했습니다.'} — 진단이 없다는 뜻이 아닙니다.`}
            action={<ButtonLink href="/analyze" variant="neutral">프로젝트 목록으로</ButtonLink>}
          />
        </Card>
      </PageShell>
    )
  }

  const { data: aspectRows, error: aspectsError } = await supabase
    .from('analysis_aspects')
    .select('id, name, notes, importance, satisfaction, opportunity_score, evidence_quotes, human_confirmed')
    .eq('project_id', id)
    .order('opportunity_score', { ascending: false, nullsFirst: false })
  const aspects: AspectRow[] | null = aspectsError ? null : ((aspectRows ?? []) as AspectRow[])

  const { data: pmfRows, error: pmfError } = await supabase
    .from('pmf_assessments')
    .select('demand_axis, precedent_axis, quadrant, match_status, match_reason, created_at')
    .eq('target_project_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
  const pmf: PmfRow | null = pmfError ? null : ((pmfRows?.[0] ?? null) as PmfRow | null)

  // 수요축 퍼센타일 재료 — 다른 프로젝트의 속성 점수. 지금 DB 는 수십 행 규모다.
  // ponytail: 전수 조회 후 앱에서 집계한다. 프로젝트가 수백 개가 되면 뷰나 RPC 로 옮긴다.
  const { data: allAspects, error: allAspectsError } = await supabase
    .from('analysis_aspects')
    .select('project_id, opportunity_score')

  // 앵글이 있으면 "앵글로" 링크를 1차로 올린다.
  const { count: angleCount } = await supabase
    .from('analysis_angles')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id)

  // ── 두 축 ────────────────────────────────────────────────
  // 수요축은 지금 속성으로 다시 낸다(저장 시 DB 가 opportunity_score 를 갱신하므로 항상 최신).
  // 선례축은 저장된 진단을 읽기만 한다 — 남의 케이스를 보는 축이라 화면에서 다시 낼 수 없다.
  const demand = demandAxis(aspects === null ? null : aspects.map((a) => num(a.opportunity_score)))
  const precedent = pmf === null || pmf.match_status === 'not_run' ? null : num(pmf.precedent_axis)
  const quadrant = pmf?.quadrant ?? null
  const advice = quadrant ? PMF_QUADRANT_ADVICE[quadrant] : noQuadrantAdvice(demand.value, precedent)

  // 퍼센타일 — 표본이 얇으면 순위를 말하지 않는다.
  let percentileText: string
  if (allAspectsError || !allAspects) {
    percentileText = '다른 프로젝트 조회에 실패했다 — 퍼센타일을 내지 않는다(0 이 아니다).'
  } else {
    const byProject = new Map<string, (number | null)[]>()
    for (const r of allAspects as { project_id: string; opportunity_score: number | string | null }[]) {
      const list = byProject.get(r.project_id) ?? []
      list.push(num(r.opportunity_score))
      byProject.set(r.project_id, list)
    }
    const others: number[] = []
    for (const [pid, scores] of byProject) {
      if (pid === id) continue
      const v = demandAxis(scores).value
      if (v !== null) others.push(v)
    }
    if (demand.value === null) {
      percentileText = '우리 수요축이 확인 불가라 퍼센타일을 내지 않는다.'
    } else if (others.length < PERCENTILE_MIN_SAMPLE) {
      percentileText = `표본 ${others.length}건이라 퍼센타일을 내지 않는다 (${PERCENTILE_MIN_SAMPLE}건 이상부터). 비교 대신 값 자체를 봐라.`
    } else {
      const below = others.filter((v) => v < demand.value!).length
      percentileText = `다른 프로젝트 ${others.length}건 중 상위 ${Math.max(1, 100 - Math.round((below / others.length) * 100))}% (우리보다 낮은 프로젝트 ${below}건)`
    }
  }

  const stage = maturityStageOf(project.maturity_stage)
  const facets: Facets = {
    market: project.market ?? null,
    bottleneck: project.bottleneck ?? null,
    business_model: project.business_model ?? null,
    buyer_type: project.buyer_type ?? null,
    price_band: project.price_band ?? null,
    purchase_frequency: project.purchase_frequency ?? null,
  }
  const top3 = aspects === null ? [] : topAspects(aspects, 3) as AspectRow[]

  return (
    <PageShell maxWidth={860}>
      <PageHeader
        title="PMF 진단 결과"
        subtitle={project.product_elevator_pitch ?? '(상품 한 줄 소개 없음)'}
        action={<ButtonLink href={`/analyze/${id}/review`} variant="outline">검수로 →</ButtonLink>}
      />

      {/* ── 1. 한 줄 결론 ─────────────────────────────────── */}
      <Card
        title="한 줄 결론"
        action={quadrant
          ? <Badge tone={QUADRANT_TONE[quadrant]} dot>{PMF_QUADRANT_LABELS[quadrant]}</Badge>
          : <Badge tone="neutral">사분면 없음</Badge>}
      >
        <p style={{ ...bodyText, fontSize: 'var(--fs-md)' }}>{advice}</p>
        <p style={{ ...muted, marginTop: 8, fontSize: 'var(--fs-xs)' }}>
          권고이지 보장이 아니다 — 같은 조건에서 남이 그렇게 했다는 기록일 뿐, 우리 결과를 약속하지 않는다.
        </p>
        {pmfError && <Notice tone="warning" style={{ marginTop: 10 }}>진단 이력 조회에 실패했다 — 진단이 없다는 뜻이 아니다.</Notice>}
      </Card>

      {/* ── 2. 진단 실행 ──────────────────────────────────── */}
      <PmfRunCard projectId={id} facets={facets} lastAssessedAt={pmf?.created_at ?? null} />

      {/* ── 3. 시장 성숙도 ────────────────────────────────── */}
      <Card
        title="시장 성숙도"
        action={project.m_meta_signal
          ? <Badge tone="info" size="sm">소비자가 카테고리 전체를 비교하고 있다</Badge>
          : null}
      >
        {stage ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: 'var(--text-strong)' }}>{stage.stage}</span>
              <strong style={{ fontSize: 'var(--fs-md)', color: 'var(--text-strong)' }}>{stage.name}</strong>
            </div>
            <p style={bodyText}>{stage.meaning}</p>
            <p style={{ ...bodyText, fontWeight: 600 }}>지금 할 일 · {stage.action}</p>
            {project.maturity_notes && <p style={muted}>판단 근거 · {project.maturity_notes}</p>}
          </div>
        ) : (
          <p style={muted}>미판정 — 분석(Stage2)을 돌리면 채워진다. 0단계가 아니다.</p>
        )}
      </Card>

      {/* ── 4. 두 축 ──────────────────────────────────────── */}
      <Card
        title="두 축 — 수요 · 선례"
        subtitle="한 숫자로 합치지 않는다. 출처가 다르고 틀리는 방식도 달라서, 합치면 정반대 행동이 같은 값이 된다."
      >
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
          <Axis label="수요축 (0~1)" value={demand.value == null ? (aspects?.length ? '확인 불가' : '속성 없음') : fmt(demand.value)}>
            <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>{demand.reason}</p>
            <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>우리 DB 안에서 · {percentileText}</p>
          </Axis>
          <Axis label="선례축 (0~1)" value={pmf == null ? '미진단' : pmf.match_status === 'not_run' ? '확인 불가' : fmt(precedent)}>
            <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>
              {pmf == null
                ? '아직 진단을 돌리지 않았다. 위 "진단 실행" 을 눌러라.'
                : `${pmf.match_reason ?? pmf.match_status}`}
            </p>
            {pmf?.created_at && (
              <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>{KST.format(Date.parse(pmf.created_at))} KST 진단 · 병목 {facets.bottleneck ?? '미입력'}</p>
            )}
          </Axis>
        </div>
      </Card>

      {/* ── 5. 상위 소구점 3 ──────────────────────────────── */}
      <Card
        title="상위 소구점 3"
        subtitle="판정은 (중요도, 만족도) 두 값만으로 낸다 — 선례와 섞지 않는다."
      >
        {aspects === null ? (
          <p style={{ ...muted, color: 'var(--danger-fg)' }}>속성 조회에 실패했다 — 0개가 아니라 확인 불가다.</p>
        ) : aspects.length === 0 ? (
          <EmptyState
            compact
            title="추출된 속성이 0개입니다"
            description={
              project.status === 'collecting' ? '아직 분석하지 않았습니다. 검수 화면에서 분석을 시작하세요.'
                : project.status === 'processing' ? '분석이 진행 중입니다. 끝나면 여기에 채워집니다.'
                  : project.status === 'failed' ? '분석이 실패했습니다. 검수 화면에서 원인을 보고 다시 시도하세요.'
                    : '원문을 모아 분석을 돌리면 채워집니다.'
            }
            action={<ButtonLink href={`/analyze/${id}/review`} variant="primary">검수 화면에서 분석하기 →</ButtonLink>}
          />
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {top3.map((a) => {
              const v = aspectVerdict(a.importance, a.satisfaction)
              const b = opportunityBreakdown(a.importance, a.satisfaction, a.opportunity_score)
              const quotes = (a.evidence_quotes ?? []).map((q) => q?.text).filter(Boolean).slice(0, 2)
              return (
                <div key={a.id} id={`aspect-${a.id}`} style={{
                  display: 'grid', gap: 6, padding: '12px 14px',
                  background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <strong style={{ fontSize: 'var(--fs-md)', color: 'var(--text-strong)' }}>{a.name}</strong>
                    <Badge tone={v.code === 'PUSH' ? 'danger' : v.code === 'TABLE_STAKES' ? 'success' : v.code === 'DROP' ? 'neutral' : 'warning'} size="sm">
                      {v.label}
                    </Badge>
                    <Badge tone={a.human_confirmed ? 'success' : 'neutral'} size="sm">
                      {a.human_confirmed ? '사람 확인 완료' : '사람 확인 전'}
                    </Badge>
                  </div>
                  <p style={muted}>
                    기회점수 {b.stored ?? b.computed ?? '—'} = {b.reading}
                    {b.mismatch && <span style={{ color: 'var(--warning-fg)' }}> · DB 값과 계산이 어긋난다(DB 가 정본)</span>}
                  </p>
                  <p style={bodyText}>{v.reading}</p>
                  {quotes.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                      {quotes.map((q, i) => (
                        <li key={i} style={{ ...bodyText, color: 'var(--text-muted)' }}>“{q}”</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ ...muted, fontSize: 'var(--fs-xs)' }}>인용 없음 — 재분석하면 채워진다.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── 6. 문제 해결 제안 ─────────────────────────────── */}
      <RemedySection projectId={id} />

      {/* ── 7. 어드바이저 3버튼 ───────────────────────────── */}
      <Card
        title="더 물어보기"
        subtitle="같은 코퍼스를 질문별로 한 덩어리씩 편다. 겹친 낱말이 하나뿐인 매칭은 “신뢰도 낮음” 으로 표시된다."
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <AdvisorLoader query={`project_id=${encodeURIComponent(id)}`} focus="a" label="남들은 어떻게 풀었나 (선례)" />
          <AdvisorLoader query={`project_id=${encodeURIComponent(id)}`} focus="b" label="이 소구점으로 망한 적 있나 (실패 사례)" />
          <AdvisorLoader query={`project_id=${encodeURIComponent(id)}`} focus="c" label="원칙은 뭐라고 하나 (원칙 원장)" />
        </div>
      </Card>

      {/* ── 8. 행동 ───────────────────────────────────────── */}
      <Card title="다음 행동">
        <CopySummary projectId={id} />
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <ButtonLink href={`/analyze/${id}/review`} variant="outline" fullWidth>검수로 — 속성을 고치거나 확인하기</ButtonLink>
          <ButtonLink href={`/analyze/${id}/angles`} variant="outline" fullWidth>
            앵글로 — {angleCount ? `만들어 둔 앵글 ${angleCount}건 보기` : '소구 앵글 만들기'}
          </ButtonLink>
        </div>
        <Notice tone="warning" style={{ marginTop: 12 }}>{DRAFT_NOTICE}</Notice>
      </Card>
    </PageShell>
  )
}
