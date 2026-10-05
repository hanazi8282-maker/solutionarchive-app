import Link from 'next/link'
import {
  ANGLE_TYPE_LABELS, ASPECT_LAYER_LABELS, MODE_LABELS, OUTPUT_TYPE_LABELS, QUADRANT_SHORT_LABELS, SUBSTANTIATION_VERDICT_LABELS,
} from '@/lib/analysis/types'
import { excerptOf } from '@/lib/signals/feed'
import { axisLabel, type InsightItem } from '@/lib/insights/feed'
import type { InsightEvidence } from '@/lib/insights/evidence'
import { QUOTE_PENDING_NOTE } from '@/lib/analysis/evidence-quotes'
import { PubInsightEvidence } from './PubInsightEvidence'
import { IconArrowRight, IconChevronRight } from '../icons'
import { Chip } from './Chip'
import { KST } from './PubIndexRow'

/**
 * 인사이트 1건 카드(I1, reports/2026-09-30/design-direction-ia-insights-report.md) — `/insights` 전용.
 * 문구(= 인사이트) → 판정 칩 → 근거 인용(SUBSTANTIATED 만) → 메타 줄 → "왜 이 판정인가" 접힘.
 *
 * 카드 전체를 링크로 만들지 않는다 — 안에 `<details>` 가 있어 링크 안 인터랙티브가 된다.
 * 누를 곳은 메타 줄 끝 "프로젝트에서 보기"(+ 아래 처방의 보완 사례 줄 → /library/[slug]). 판정은 칩 테두리와 글자로 말한다(README 판정색 규칙).
 */
export function PubInsightCard({ item, evidence }: {
  item: InsightItem
  /** 이 카드 속성(item.aspect_id)의 인용·처방. undefined = 붙이지 않는다(조회 전·셀프테스트). */
  evidence?: InsightEvidence
}) {
  const verdictChip = item.verdict === 'SUBSTANTIATED'
    ? <Chip tone="positive">{SUBSTANTIATION_VERDICT_LABELS.SUBSTANTIATED}</Chip>
    : item.verdict === 'EXPERIENTIAL'
      ? <Chip>{SUBSTANTIATION_VERDICT_LABELS.EXPERIENTIAL}</Chip>
      : <Chip tone="negative">근거 없음</Chip>
  const judged = item.evidence ? evidence?.judged[item.id] : undefined
  const hasFold = Boolean(item.reason || (item.gate_rewritten && item.headline_original) || item.adaptation)
  return (
    <article className="pub-card">
      <div className="pub-card-body">
        <h3 className="pub-card-title">{item.headline}</h3>
        <div className="pub-chiprow">
          {verdictChip}
          {item.gate_rewritten ? <Chip tone="mixed" title="실증 게이트가 성능 주장을 걷어내고 다시 쓴 문구">순화됨</Chip> : null}
          {item.angle_type ? <Chip>{ANGLE_TYPE_LABELS[item.angle_type]}</Chip> : null}
          <Chip>{OUTPUT_TYPE_LABELS[item.output_type]}</Chip>
          {item.validated ? <Chip tone="solid">실전 채택</Chip> : null}
        </div>
        {/* 판정 인용은 item.evidence(원본)가 아니라 정책·원문 대조를 거친 judged 만 그린다(설계 v22 §3-2). 근거를 못 받았으면 줄 없음. */}
        {judged?.state === 'ok'
          ? <blockquote className="pub-insight-quote">{judged.text}</blockquote>
          : judged?.state === 'hidden' ? <p className="pub-caption">{QUOTE_PENDING_NOTE}</p> : null}
        <div className="pub-card-meta pub-insight-meta">
          <span className="pub-card-brand">{excerptOf(item.project_pitch ?? '(설명 없음)', 40)}</span>
          {item.aspect_name || item.layer
            ? <span>{[item.aspect_name, item.layer && `(${ASPECT_LAYER_LABELS[item.layer]})`].filter(Boolean).join(' ')}</span>
            : null}
          <span>{QUADRANT_SHORT_LABELS[item.aspect_quadrant]}</span>
          {/* 필터 4축 라벨은 값이 있을 때만 — "미지정" 을 카드마다 찍지 않는다(B3). */}
          {(['problem', 'bottleneck', 'model'] as const).map((k) => {
            const label = axisLabel(k, item[k])
            return label ? <span key={k}>{label}</span> : null
          })}
          {item.mode ? <span>{MODE_LABELS[item.mode]}</span> : null}
          {item.created_at ? <span>{KST.format(new Date(item.created_at))}</span> : null}
          <Link className="pub-card-go" href={`/analyze/${item.project_id}/angles`}>프로젝트에서 보기<IconArrowRight /></Link>
        </div>
        {hasFold ? (
          <details className="pub-fold pub-fold--inline">
            <summary><IconChevronRight />왜 이 판정인가</summary>
            <div className="pub-fold-body">
              {item.reason ? <p className="pub-text">{item.reason}</p> : null}
              {item.gate_rewritten && item.headline_original ? <p className="pub-text">재작성 전: {item.headline_original}</p> : null}
              {item.adaptation ? <p className="pub-text">각색 제안: {item.adaptation}</p> : null}
            </div>
          </details>
        ) : null}
        <PubInsightEvidence evidence={evidence} />
      </div>
    </article>
  )
}
