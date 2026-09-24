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
import { EvidenceCaption } from '../../../_ds/components/EvidenceCaption'
import { Notice, PageHeader, PageShell } from '../../../_ds/components/Shell'
import { AdvisorLoader } from '../advisor-cards'
import { CopySummary } from './copy-summary'
import { PmfRunCard, type Facets } from './pmf-run-card'
import { RemedySection } from './remedy-section'
import { WtpCard } from './wtp-card'

// ── /analyze/[id]/result — 진단 보고서 한 장 (docs/pmf-product-design.md §3-1) ──
//
// 읽기는 서버에서 한 번에 한다(목록 화면과 같은 service_role 클라이언트). 클라이언트로 내려가는 건
// 액션 3개뿐이다: 진단 실행 · 문제 해결 제안 · 요약 복사.
//
// 섹션 순서는 "결론 → 근거 → 행동". 두 축을 한 숫자로 합치지 않고, 축이 비면 사분면을 그리지 않는다
// (lib/cases/match.ts). 값이 없는 자리는 빈칸이 아니라 "왜 없는지 + 어떻게 채우는지" 로 채운다(§7.1).
//
// 첫 뷰포트는 히어로 하나다(docs/ui-redesign-plan-2026-09-21.md B-1): 사분면 · 한 줄 결론 ·
// 두 축 숫자 · 기준 캡션. 진단 이력이 있으면 입력 폼(PmfRunCard)은 맨 아래로 내리고 히어로
// 우상단 "다시 진단" 앵커로 간다 — 이미 답이 나온 화면에서 폼이 첫 화면을 먹지 않게.
// 패싯이 비어 진단을 아직 못 돌리는 프로젝트는 폼이 곧 첫 행동이므로 위에 둔다.

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

/** 진단 입력 폼(맨 아래) 앵커. 히어로 우상단 "다시 진단" 이 여기로 뛴다. */
const RUN_ANCHOR = 'pmf-run'

const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))
const fmt = (v: number | null) => (v == null ? '확인 불가' : v.toFixed(2))
const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

/** M2 v2 스코프 — 조기 반환 2곳과 정상 화면이 같은 껍데기를 쓴다(폭만 다르다). */
function Shell({ maxWidth, children }: { maxWidth: number; children: React.ReactNode }) {
  return <div className="sa-v2"><PageShell maxWidth={maxWidth}>{children}</PageShell></div>
}

function Axis({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="v2-box v2-box--edge">
      <div className="dgy-caps">{label}</div>
      <div className="v2-num">{value}</div>
      {children}
    </div>
  )
}

/**
 * 2×2 미니 사분면. **우리 위치만 채운다** — 나머지 칸은 라벨만 회색으로 두고, 빈 칸이 무슨 뜻인지
 * 한 줄로 말한다. 네 칸을 다 칠하면 어디가 우리인지 사라지고, 빈 칸을 지우면 축이 안 읽힌다.
 * 축이 하나라도 확인 불가면(quadrant === null) 어느 칸도 채우지 않는다.
 */
const MINI_ROWS: PmfQuadrant[][] = [
  ['CROWDED_NO_DEMAND', 'PROVEN_DEMAND'],
  ['PARK', 'UNCHARTED_DEMAND'],
]

function MiniQuadrant({ here }: { here: PmfQuadrant | null }) {
  return (
    <div className="v2-stack-tight">
      <div className="v2-quad">
        {MINI_ROWS.flat().map((q) => {
          const on = q === here
          return (
            <div key={q} className={on ? 'v2-quad-cell v2-quad-cell--on' : 'v2-quad-cell'}>
              <span className="v2-quad-name">
                {PMF_QUADRANT_LABELS[q]}
              </span>
              <span className="v2-quad-hint">
                {on ? '여기가 우리다' : '이쪽이 비어 있다 = 다음에 채울 여지'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="v2-note">가로 = 수요축, 세로 = 선례축. 오른쪽·위가 높다.</p>
    </div>
  )
}

export default async function PmfResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  if (!supabase) {
    return (
      <Shell maxWidth={860}>
        <PageHeader title="진단 결과" />
        <Notice tone="danger">DB 연결에 실패했습니다 — 결과가 없다는 뜻이 아닙니다.</Notice>
      </Shell>
    )
  }

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch, market, status, maturity_stage, maturity_notes, m_meta_signal, bottleneck, business_model, buyer_type, price_band, purchase_frequency')
    .eq('id', id)
    .maybeSingle()

  if (projectError || !project) {
    return (
      <Shell maxWidth={720}>
        <PageHeader title="진단 결과" />
        <Card padded={false}>
          <EmptyState
            tone="danger"
            title="진단 결과를 불러오지 못했습니다"
            description={`${projectError?.message ?? '프로젝트를 찾지 못했습니다.'} — 진단이 없다는 뜻이 아닙니다.`}
            action={<ButtonLink href="/analyze" variant="neutral">프로젝트 목록으로</ButtonLink>}
          />
        </Card>
      </Shell>
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
  // 기준 캡션용 원문 건수는 앵글 수와 독립이라 같이 기다린다(직렬 왕복 하나 절약).
  // 못 세면(null) 캡션에서 그 조각만 빼고, 0 으로 적지 않는다(§7.1).
  const [{ count: angleCount }, { count: inputCount }] = await Promise.all([
    supabase.from('analysis_angles').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('analysis_inputs').select('id', { count: 'exact', head: true }).eq('project_id', id),
  ])

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
  const reviewHref = `/analyze/${id}/review`

  // 기준 캡션 — 무엇을 몇 건 중에서 셌나. 못 센 조각은 빼고 적는다.
  const basis = [
    aspects === null ? null : `소구점 ${aspects.length}개`,
    inputCount == null ? null : `원문 ${inputCount}건`,
  ].filter(Boolean).join(' · ')
  const metaCaption = [
    basis ? `${basis} 기준` : null,
    pmf?.created_at ? `마지막 진단 ${KST.format(Date.parse(pmf.created_at))} KST` : null,
  ].filter(Boolean).join(', ')

  // 진단 입력 폼 자리. 이력이 있고 패싯이 차 있으면 맨 아래, 그 밖(첫 진단·패싯 비었음)은 위.
  const runCardAtBottom = Boolean(pmf && facets.bottleneck)
  const runCard = (
    <div id={RUN_ANCHOR}>
      <PmfRunCard projectId={id} facets={facets} lastAssessedAt={pmf?.created_at ?? null} />
    </div>
  )

  return (
    <Shell maxWidth={860}>
      <PageHeader
        title="PMF 진단 결과"
        subtitle={project.product_elevator_pitch ?? '(상품 한 줄 소개 없음)'}
        meta={metaCaption || null}
        action={
          <>
            <ButtonLink href={reviewHref} variant="outline">검수로 →</ButtonLink>
            {/* 요약 복사는 화면 맨 아래가 아니라 결론 옆에 둔다 — 남에게 보낼 때 여기서 바로 집는다.
                클립보드가 막히면 이 자리에 원문이 펴지므로 폭을 묶어 둔다. */}
            <div className="v2-copy-slot">
              <CopySummary projectId={id} />
            </div>
          </>
        }
      />

      {/* ── 1. 히어로 — 사분면 · 한 줄 결론 · 두 축 (카드 1·4 병합) ───── */}
      <Card
        title="한 줄 결론"
        action={
          <div className="v2-actions">
            {quadrant
              ? <Badge tone={QUADRANT_TONE[quadrant]} dot>{PMF_QUADRANT_LABELS[quadrant]}</Badge>
              : <Badge tone="neutral">사분면 없음</Badge>}
            {runCardAtBottom && (
              <ButtonLink href={`#${RUN_ANCHOR}`} variant="outline" size="sm">다시 진단</ButtonLink>
            )}
          </div>
        }
      >
        <div className="v2-stack">
          <p className="v2-body v2-body--md">{advice}</p>

          <div className="v2-grid-240">
            <Axis label="수요축 (0~1)" value={demand.value == null ? (aspects?.length ? '확인 불가' : '속성 없음') : fmt(demand.value)}>
              <p className="v2-note">{demand.reason}</p>
              <p className="v2-note">우리 DB 안에서 · {percentileText}</p>
            </Axis>
            <Axis label="선례축 (0~1)" value={pmf == null ? '미진단' : pmf.match_status === 'not_run' ? '확인 불가' : fmt(precedent)}>
              <p className="v2-note">
                {pmf == null
                  ? '아직 진단을 돌리지 않았다. 위 "진단 실행" 을 눌러라.'
                  : `${pmf.match_reason ?? pmf.match_status}`}
              </p>
              {pmf?.created_at && (
                <p className="v2-note">{KST.format(Date.parse(pmf.created_at))} KST 진단 · 병목 {facets.bottleneck ?? '미입력'}</p>
              )}
            </Axis>
            <MiniQuadrant here={quadrant} />
          </div>

          <p className="v2-note">
            두 축을 한 숫자로 합치지 않는다. 출처가 다르고 틀리는 방식도 달라서, 합치면 정반대 행동이 같은 값이 된다.
          </p>
          <p className="v2-note">
            권고이지 보장이 아니다 — 같은 조건에서 남이 그렇게 했다는 기록일 뿐, 우리 결과를 약속하지 않는다.
          </p>
          {pmfError && <Notice tone="warning">진단 이력 조회에 실패했다 — 진단이 없다는 뜻이 아니다.</Notice>}
        </div>
      </Card>

      {/* ── 2. 진단 실행 — 첫 진단이거나 패싯이 비었을 때만 위에 ──────── */}
      {!runCardAtBottom && runCard}

      {/* ── 3. 시장 성숙도 ────────────────────────────────── */}
      <Card
        title="이 시장은 어디까지 왔나"
        action={project.m_meta_signal
          ? <Badge tone="info" size="sm">소비자가 카테고리 전체를 비교하고 있다</Badge>
          : null}
      >
        {stage ? (
          <div className="v2-stack-tight">
            <div className="v2-inline">
              <span className="v2-num v2-num--lg">{stage.stage}</span>
              <strong className="v2-h3">{stage.name}</strong>
            </div>
            <p className="v2-body">{stage.meaning}</p>
            <p className="v2-body v2-fig">지금 할 일 · {stage.action}</p>
            {project.maturity_notes && <p className="v2-text v2-text--muted">판단 근거 · {project.maturity_notes}</p>}
          </div>
        ) : (
          <p className="v2-text v2-text--muted">미판정 — 분석(Stage2)을 돌리면 채워진다. 0단계가 아니다.</p>
        )}
      </Card>

      {/* ── 4. 상위 소구점 3 ──────────────────────────────── */}
      <Card
        title="무엇이 가장 아픈가"
        subtitle="판정은 (중요도, 만족도) 두 값만으로 낸다 — 선례와 섞지 않는다."
      >
        {aspects === null ? (
          <p className="v2-danger-text">속성 조회에 실패했다 — 0개가 아니라 확인 불가다.</p>
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
            action={<ButtonLink href={reviewHref} variant="primary">검수 화면에서 분석하기 →</ButtonLink>}
          />
        ) : (
          <div className="v2-stack">
            {top3.map((a) => {
              const v = aspectVerdict(a.importance, a.satisfaction)
              const b = opportunityBreakdown(a.importance, a.satisfaction, a.opportunity_score)
              // 검수 화면의 같은 속성으로. 앵커 규칙은 review/page.tsx aspectAnchor() 와 같다.
              const href = `${reviewHref}#aspect-${a.id}`
              const quoteList = a.evidence_quotes
              const quotes = (quoteList ?? []).map((q) => q?.text).filter(Boolean).slice(0, 2)
              return (
                <div key={a.id} id={`aspect-${a.id}`} className="v2-box v2-box--edge">
                  <div className="v2-chiprow">
                    <a href={href} className="v2-h3 v2-link-accent">{a.name}</a>
                    <Badge tone={v.code === 'PUSH' ? 'danger' : v.code === 'TABLE_STAKES' ? 'success' : v.code === 'DROP' ? 'neutral' : 'warning'} size="sm">
                      {v.label}
                    </Badge>
                    <Badge tone={a.human_confirmed ? 'success' : 'neutral'} size="sm">
                      {a.human_confirmed ? '사람 확인 완료' : '사람 확인 전'}
                    </Badge>
                  </div>
                  <p className="v2-text v2-text--muted">
                    <a href={href}>기회점수 {b.stored ?? b.computed ?? '—'}</a> = {b.reading}
                    {b.mismatch && <span className="v2-warn-text"> · DB 값과 계산이 어긋난다(DB 가 정본)</span>}
                  </p>
                  <p className="v2-body">{v.reading}</p>
                  {/* 인용 3상태: 있음 / 셌는데 0건 / 아예 못 읽음. 셋을 같은 문장으로 내지 않는다(§7.1). */}
                  {quotes.length > 0 ? (
                    <>
                      <ul className="v2-olist">
                        {quotes.map((q, i) => (
                          <li key={i} className="v2-body v2-muted">“{q}”</li>
                        ))}
                      </ul>
                      <EvidenceCaption n={quotes.length} total={quoteList?.length ?? null} method="리뷰 원문 인용" />
                    </>
                  ) : quoteList == null ? (
                    <EvidenceCaption n={null} total={null} method="리뷰 원문 인용" />
                  ) : (
                    <p className="v2-note">인용 없음 — 재분석하면 채워진다.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── 5. 문제 해결 제안 ─────────────────────────────── */}
      <RemedySection projectId={id} />

      {/* ── 6. 어드바이저 3버튼 ───────────────────────────── */}
      <Card
        title="남들은 어떻게 풀었나"
        subtitle="같은 코퍼스를 질문별로 한 덩어리씩 편다. 겹친 낱말이 하나뿐인 매칭은 “신뢰도 낮음” 으로 표시된다."
      >
        <div className="v2-stack-sm">
          <AdvisorLoader query={`project_id=${encodeURIComponent(id)}`} focus="a" label="남들은 어떻게 풀었나 (선례)" />
          <AdvisorLoader query={`project_id=${encodeURIComponent(id)}`} focus="b" label="이 소구점으로 망한 적 있나 (실패 사례)" />
          <AdvisorLoader query={`project_id=${encodeURIComponent(id)}`} focus="c" label="원칙은 뭐라고 하나 (원칙 원장)" />
        </div>
      </Card>

      {/* ── 7. 지불의사 신호 ──────────────────────────────── */}
      <WtpCard projectId={id} />

      {/* ── 8. 행동 ───────────────────────────────────────── */}
      <Card title="다음 행동">
        <div className="v2-stack-sm">
          <ButtonLink href={reviewHref} variant="outline" fullWidth>검수로 — 속성을 고치거나 확인하기</ButtonLink>
          <ButtonLink href={`/analyze/${id}/angles`} variant="outline" fullWidth>
            앵글로 — {angleCount ? `만들어 둔 앵글 ${angleCount}건 보기` : '소구 앵글 만들기'}
          </ButtonLink>
        </div>
        <div className="v2-mt"><Notice tone="warning">{DRAFT_NOTICE}</Notice></div>
      </Card>

      {/* ── 9. 진단 실행 — 이미 답이 나온 화면에서는 맨 아래 ──────────── */}
      {runCardAtBottom && runCard}
    </Shell>
  )
}
