import Link from 'next/link'
import type { CaseMoveCard } from '@/lib/cases/advisor'
import { clipTransferNote } from '@/lib/cases/detail'
import type { LogoInput } from '@/lib/cases/logo'
import { Chip } from './Chip'
import { PubBrandLogo } from './PubBrandLogo'
import { PubStamp } from './PubStamp'

/**
 * 매칭 리포트(/cases/report)의 무브 한 줄(B7-2). 마크업은 색인 줄(`.pub-index-row`) 그대로다 —
 * 전문은 `/library/[slug]` 가 보여주고, 여기서는 줄 하나로 "무엇이 닮았나" 만 말한다.
 *
 * 매칭 점수는 화면에 숫자로 내지 않는다(공개 독자에게 3.2 는 뜻이 없다). 근거는 겹친 낱말로 말하고
 * (SP-024 표시 규칙), 점수는 `title` 툴팁에만 둔다.
 */
export function PubMatchRow({ card, study, moveCount }: {
  card: CaseMoveCard
  study: LogoInput
  moveCount: number
}) {
  const note = clipTransferNote(card.transfer_note, 120)
  return (
    <li>
      <Link className="pub-index-row" href={`/library/${card.slug}`} title={`매칭 점수 ${card.score}`}>
        <PubBrandLogo study={study} size="sm" />
        <span className="pub-index-main">
          <span className="pub-index-head">
            <span className="pub-index-t" translate="no">{card.brand_name}</span>
            <Chip>{card.lever}</Chip>
            <span className="pub-index-why">
              겹친 낱말 {card.matched_terms.map((t) => `“${t}”`).join(', ')}{card.low_confidence ? ' · 신뢰도 낮음' : ''}
            </span>
          </span>
          <span className="pub-index-s pub-index-s--2">{card.claim}</span>
          <span className="pub-index-act">
            {note ? <><b>내일 할 행동</b> {note}</> : '가져갈 행동이 아직 안 적혀 있다'}
          </span>
        </span>
        <span className="pub-index-side">
          <PubStamp move={card} size="sm" />
          <span>무브 {moveCount}개</span>
        </span>
      </Link>
    </li>
  )
}
