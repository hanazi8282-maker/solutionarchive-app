'use client'

import { demandAxis, quadrantOf, PMF_QUADRANT_ADVICE, PMF_QUADRANT_LABELS, noQuadrantAdvice, type Quadrant } from '@/lib/cases/match'
import { Card } from '../../../_ds/components/Card'
import { Badge, type Tone } from '../../../_ds/components/Badge'
import { AdvisorLoader } from '../advisor-cards'

// ── PMF 2축 진단 패널 ──────────────────────────────────────────
// 이 제품의 핵심 가치("이 소구점, 팔릴 것인가")를 보여주는 화면이 전에는 0개였다 —
// 수요축·선례축·사분면은 CLI(scripts/pmf-assess.mjs)가 pmf_assessments 에만 남겼다.
// 여기서는 **읽어서 보여주기만** 한다. 산식은 lib/cases/match.ts 한 벌이고 재계산하지 않는다.
// 두 축을 한 숫자로 합치지 않는다 — 합치면 "선례가 없어서 낮음"과 "수요가 없어서 낮음"이
// 같은 값이 되는데 다음 행동은 정반대다(pmf-assess.mjs 헤더).

export type PmfLatest = {
  demand_axis: number | string | null
  precedent_axis: number | string | null
  quadrant: Quadrant | null
  match_status: 'matched' | 'no_match' | 'not_run'
  match_reason: string | null
  created_at: string | null
}

const TONE: Record<Quadrant, Tone> = {
  PROVEN_DEMAND: 'success', UNCHARTED_DEMAND: 'warning', CROWDED_NO_DEMAND: 'neutral', PARK: 'neutral',
}

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))
const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(2))

/**
 * 선례축 MatchWhy — 저장된 `match_reason` 문장에서 숫자만 뽑아 한 줄로 되읽는다.
 *
 * ⚠️ `matchMoves()` 가 돌려주는 `excluded`(자기 케이스 / 미승인 / 등급 D / 반면교사)는 **저장되지 않는다**
 *    — `pmf_assessments` 에 컬럼이 없다. 그래서 여기서 "제외 N건" 을 만들어 내지 않고,
 *    match_reason 에 적혀 있는 만큼만 그대로 보여주고 출처를 밝힌다(§7.1: 없는 걸 있는 척하지 않는다).
 */
function precedentWhy(reason: string | null): string | null {
  if (!reason) return null
  const moves = reason.match(/선례 (\d+)건/)
  const studies = reason.match(/케이스 (\d+)곳/)
  const excluded = reason.match(/\(([^()]*제외[^()]*)\)/)
  const parts = [
    moves ? `무브 ${moves[1]}건` : null,
    studies ? `케이스 ${studies[1]}곳` : null,
    excluded ? excluded[1] : null,
  ].filter(Boolean)
  return parts.length ? `매칭 근거 · ${parts.join(' · ')} (진단 기록 match_reason 에 적힌 값)` : null
}

function Axis({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="v2-box v2-box--edge v2-grow-200">
      <div className="dgy-caps">{label}</div>
      <div className="v2-num">
        {value}
      </div>
      <p className="v2-note">{note}</p>
    </div>
  )
}

export function PmfPanel({ projectId, opportunityScores, pmf, pmfLookupFailed }: {
  projectId: string
  opportunityScores: (number | string | null)[]
  /** pmf_assessments 최신 1건. null = 진단 이력 없음(음성). */
  pmf: PmfLatest | null
  /** 조회 자체가 실패했으면 true — "진단 없음"과 절대 섞지 않는다(§7.1). */
  pmfLookupFailed: boolean
}) {
  // 수요축은 지금 화면의 속성으로 계산한다(저장 시 DB 가 opportunity_score 를 다시 계산하므로 항상 최신).
  const demand = demandAxis(opportunityScores.map(num))
  const demandText = demand.value == null ? (opportunityScores.length ? '확인 불가' : '속성 없음') : fmt(demand.value)

  // 선례축은 CLI 진단 결과를 읽는다. 세 상태: 값 / 미진단 / 확인 불가.
  const precedent = pmfLookupFailed ? null : pmf == null ? null : pmf.match_status === 'not_run' ? null : num(pmf.precedent_axis)
  const precedentText = pmfLookupFailed ? '확인 불가' : pmf == null ? '미진단' : pmf.match_status === 'not_run' ? '확인 불가' : fmt(precedent)
  const precedentNote = pmfLookupFailed
    ? 'pmf_assessments 조회에 실패했다 — 진단이 없다는 뜻이 아니다'
    : pmf == null
      ? `선례 진단은 아직 CLI 로만 돌린다: node scripts/pmf-assess.mjs --input <파일> (target_project_id 에 이 프로젝트 id ${projectId.slice(0, 8)}… 를 넣으면 여기 표시된다)`
      : `${pmf.match_reason ?? pmf.match_status}${pmf.created_at ? ` · ${KST.format(Date.parse(pmf.created_at))} KST 진단` : ''}`

  // 사분면은 지금 화면의 수요축 + 저장된 선례축으로 다시 내지 않는다 — 저장된 진단의 사분면을 그대로 보인다.
  // 다만 수요축이 진단 시점과 달라졌을 수 있으니, 두 축 다 있을 때 quadrantOf 의 문장으로 "지금이라면" 을 덧붙인다.
  const stored = pmf?.quadrant ?? null
  const now = quadrantOf(demand.value, precedent)

  // 처방은 "지금 값" 기준이다 — 저장 시점 이후 검수로 수요축이 바뀌었을 수 있고,
  // 화면이 이미 "지금 값으로 보면" 을 말하고 있다. 둘 다 없으면 어느 축이 비었는지 말한다.
  const advised = now.quadrant ?? stored
  const advice = advised ? PMF_QUADRANT_ADVICE[advised] : noQuadrantAdvice(demand.value, precedent)

  const assessedAt = pmf?.created_at ? `${KST.format(Date.parse(pmf.created_at))} KST` : null
  const why = precedentWhy(pmf?.match_reason ?? null)

  return (
    <Card
      title="PMF 진단 — 수요축 · 선례축"
      subtitle="우리 리뷰에서 나온 수요(기회점수)와 남이 푼 선례(케이스 매칭)를 따로 본다. 한 점수로 합치지 않는다."
      action={stored ? <Badge tone={TONE[stored]} dot>{PMF_QUADRANT_LABELS[stored]}</Badge> : null}
    >
      <div className="v2-actions">
        <Axis label="수요축 (0~1)" value={demandText} note={demand.reason} />
        <Axis label="선례축 (0~1)" value={precedentText} note={precedentNote} />
      </div>
      <p className="v2-text v2-mt">
        {now.quadrant
          ? `지금 값으로 보면 · ${PMF_QUADRANT_LABELS[now.quadrant]} — ${now.reason}`
          : `사분면 없음 — ${now.reason}`}
        {stored && now.quadrant && stored !== now.quadrant && (
          <span className="v2-warn-text"> · 저장된 진단({PMF_QUADRANT_LABELS[stored]})과 다르다. 수요축이 그 뒤 바뀌었다.</span>
        )}
      </p>

      {/* 처방 — 라벨만 보여주면 분류지 판정이 아니다. 문장 끝의 한 줄은 톤을 고정한다(설계 §3-1 1). */}
      <p className="v2-body v2-strong v2-mt-sm">
        {advice}
      </p>
      <p className="v2-note v2-mt-xs">
        권고이지 보장이 아니다 — 같은 사분면이어도 상품·시점이 다르면 결과가 달라진다.
      </p>

      {/* 선례축 근거와 마지막 진단 시각. "미진단" 과 "오래된 진단" 은 다른 사건이다. */}
      <p className="v2-note v2-mt-sm">
        {why ? `${why} · ` : ''}
        {pmfLookupFailed
          ? '마지막 진단 시각 확인 불가 — 조회가 실패했다'
          : assessedAt
            ? `마지막 진단 ${assessedAt}`
            : '마지막 진단 없음 — 선례축은 아직 한 번도 돌지 않았다'}
      </p>
      {/* 프로젝트 단위 어드바이저 — 전에는 앵글 화면(2단 아래)에만 있었다. 상품 소개·판매자 가설로 매칭한다. */}
      {/* 질문 3개. 어느 걸 눌러도 요청은 한 번이고, 누른 질문만 펼쳐진다. */}
      <AdvisorLoader query={`project_id=${encodeURIComponent(projectId)}`} variant="primary" />
    </Card>
  )
}
