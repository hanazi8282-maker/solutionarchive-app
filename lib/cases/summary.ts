// 진단 요약 마크다운 — 결과 화면의 "요약 복사" 가 붙여 넣는 한 덩어리.
//
// 순수 함수다. 조회는 app/api/analyze/summary 가 하고 여기엔 행을 넘긴다(remedy.ts 와 같은 규약).
//
// ★ 공개 URL 을 만들지 않는다(docs/pmf-product-design.md §6). 요약은 사용자가 스스로 복사해 가는
//   텍스트이고, 링크로 남으면 로그인 벽 밖에 근거가 새어 나간다.
//
// ★ 값이 없는 자리를 빈칸으로 두지 않는다. "확인 불가" 와 "없음" 을 문장으로 가른다(§7.1) —
//   요약본은 화면 밖으로 나가는 유일한 산출물이라, 여기서 접히면 되돌릴 자리가 없다.

import { aspectVerdict, opportunityBreakdown } from '../analysis/aspect-verdict.ts'
import { maturityStageOf } from '../analysis/types.ts'
import { PMF_QUADRANT_ADVICE, PMF_QUADRANT_LABELS, noQuadrantAdvice, type Quadrant } from './match.ts'
import { failureLine, fixLine, type RemedyResult } from './remedy.ts'

export interface SummaryAspect {
  name: string
  importance: number | string | null
  satisfaction: number | string | null
  opportunity_score: number | string | null
  evidence_quotes?: { text?: string | null }[] | null
  human_confirmed?: boolean | null
}

export interface SummaryProject {
  product_elevator_pitch?: string | null
  market?: string | null
  maturity_stage?: number | null
  maturity_notes?: string | null
  m_meta_signal?: boolean | null
}

export interface SummaryPmf {
  demand_axis: number | string | null
  precedent_axis: number | string | null
  quadrant: Quadrant | null
  match_status: 'matched' | 'no_match' | 'not_run'
  match_reason: string | null
  created_at: string | null
}

export const DRAFT_NOTICE =
  '여기까지가 초안이다. 상세페이지 문구는 사실 확인·표시광고 검토·자사 톤 조정을 거쳐야 하고 이 도구는 그걸 하지 않는다.'

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)

const fmt = (v: number | null) => (v == null ? '확인 불가' : v.toFixed(2))

/** 상위 소구점 N개 — 기회점수 내림차순. 값이 없는 속성은 뒤로 민다(0 으로 접지 않는다). */
export function topAspects(aspects: SummaryAspect[], n = 3): SummaryAspect[] {
  return [...aspects]
    .sort((a, b) => (num(b.opportunity_score) ?? -1) - (num(a.opportunity_score) ?? -1))
    .slice(0, n)
}

export function buildSummaryMarkdown(input: {
  project: SummaryProject | null
  aspects: SummaryAspect[] | null
  pmf: SummaryPmf | null
  pmfLookupFailed?: boolean
  remedies?: RemedyResult | null
  angles?: { headline_draft?: string | null; angle_type?: string | null }[] | null
}): string {
  const { project, aspects, pmf, remedies, angles } = input
  const L: string[] = []

  L.push(`# PMF 진단 요약 — ${project?.product_elevator_pitch?.trim() || '(상품 한 줄 소개 없음)'}`)
  L.push('')
  L.push(`- 시장: ${project?.market?.trim() || '미기재'}`)

  // ── 시장 성숙도 ──────────────────────────────────────────
  const stage = maturityStageOf(project?.maturity_stage ?? null)
  L.push('')
  L.push('## 시장 성숙도')
  if (!stage) {
    L.push('- 미판정 — 분석(Stage2)을 돌리면 채워진다. 0단계가 아니다.')
  } else {
    L.push(`- ${stage.stage}단계 · ${stage.name} — ${stage.meaning}`)
    L.push(`- 지금 할 일: ${stage.action}`)
    if (project?.maturity_notes) L.push(`- 판단 근거: ${project.maturity_notes}`)
    if (project?.m_meta_signal) L.push('- 소비자가 카테고리 전체를 비교하고 있다(메타 발화 감지)')
  }

  // ── 두 축 · 사분면 · 처방 ────────────────────────────────
  L.push('')
  L.push('## 두 축과 사분면')
  if (input.pmfLookupFailed) {
    L.push('- 진단 조회에 실패했다 — "진단이 없다" 는 뜻이 아니다(확인 불가).')
  } else if (!pmf) {
    L.push('- 진단을 아직 돌리지 않았다. 결과 화면의 "진단 실행" 을 눌러라.')
  } else {
    const d = pmf.match_status === 'not_run' ? null : num(pmf.demand_axis)
    const p = pmf.match_status === 'not_run' ? null : num(pmf.precedent_axis)
    L.push(`- 수요축 ${fmt(d)} · 선례축 ${fmt(p)} (매칭 ${pmf.match_status})`)
    if (pmf.match_reason) L.push(`- 선례 근거: ${pmf.match_reason}`)
    if (pmf.quadrant) {
      L.push(`- 사분면: ${PMF_QUADRANT_LABELS[pmf.quadrant]}`)
      L.push(`- 처방: ${PMF_QUADRANT_ADVICE[pmf.quadrant]}`)
    } else {
      L.push('- 사분면: 내지 않음 — 한 축이 확인 불가다.')
      L.push(`- 다음: ${noQuadrantAdvice(d, p)}`)
    }
  }

  // ── 상위 소구점 3 ────────────────────────────────────────
  L.push('')
  L.push('## 상위 소구점 3')
  if (aspects == null) {
    L.push('- 속성 조회에 실패했다 — 0개가 아니라 확인 불가다.')
  } else if (aspects.length === 0) {
    L.push('- 추출된 속성이 0개다. 원문을 모아 분석을 돌려라.')
  } else {
    topAspects(aspects, 3).forEach((a, i) => {
      const v = aspectVerdict(a.importance, a.satisfaction)
      const b = opportunityBreakdown(a.importance, a.satisfaction, a.opportunity_score)
      L.push(`${i + 1}. ${a.name} — ${v.label} (기회점수 ${b.stored ?? b.computed ?? '—'} · ${b.reading})`)
      L.push(`   - 읽기: ${v.reading}`)
      const quote = (a.evidence_quotes ?? []).map((q) => q?.text).filter(Boolean)[0]
      L.push(`   - 원문 인용: ${quote ? `"${quote}"` : '인용 없음 — 재분석하면 채워진다'}`)
      L.push(`   - 사람 확인: ${a.human_confirmed ? '완료' : '아직'}`)
    })
  }

  // ── 보완 사례 ────────────────────────────────────────────
  L.push('')
  L.push('## 보완 사례')
  if (!remedies || remedies.status === 'not_run') {
    L.push(`- 확인 불가 — ${remedies?.reason ?? '처방을 조회하지 못했다'}`)
  } else if (remedies.cards.length === 0) {
    L.push(`- ${remedies.reason}`)
  } else {
    for (const c of remedies.cards) {
      L.push(`- ${c.headline}`)
      if (c.status !== 'matched') {
        L.push(`  - ${c.status === 'no_match' ? '관련 사례 없음 — 억지로 끼워 맞추지 않는다.' : `확인 불가 — ${c.reason}`}`)
        continue
      }
      for (const f of c.fixes) L.push(`  - 보완: ${fixLine(f)}${f.low_confidence ? ' [신뢰도 낮음]' : ''}`)
      for (const f of c.failures) L.push(`  - 막힌 사례: ${failureLine(f)}${f.low_confidence ? ' [신뢰도 낮음]' : ''}`)
    }
  }

  // ── 앵글 3 ───────────────────────────────────────────────
  if (angles && angles.length > 0) {
    L.push('')
    L.push('## 앵글 3')
    angles.slice(0, 3).forEach((a, i) => {
      L.push(`${i + 1}. ${a.headline_draft?.trim() || '(문구 없음)'}${a.angle_type ? ` (${a.angle_type})` : ''}`)
    })
  }

  L.push('')
  L.push(`> ${DRAFT_NOTICE}`)
  L.push('')
  return L.join('\n')
}
