import Link from 'next/link'
import { impactFrequencyTags } from '@/lib/analysis/relevance-judge'
import { SIGNAL_LABEL, type SignalItem } from '@/lib/signals/feed'
import { Chip } from './Chip'

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
export const judgedOn = (at: string) => `판정 ${KST.format(new Date(at))}`

/**
 * 리뷰 1건 카드(신호 피드 · 3열 공용). 카드 전체가 페인 카드 상세(`/signals/card?id=`)로 가는 링크다 —
 * 외부 출처 링크는 상세에만 둔다(링크 안에 링크를 넣지 않는다).
 *
 * 라벨이 NULL 이면 칩을 만들지 않는다(빈 태그 금지 · `impactFrequencyTags`). 그 대신
 * "라벨 없음" 을 글자로 적는다 — 아무것도 안 보이면 "라벨이 비었다"와 "안 그렸다"가 구분되지 않는다.
 * 지불 의사는 true 일 때만 칩이다. false 와 NULL(모름)은 카드에서 말하지 않고 상세가 3상태로 적는다.
 */
export function PubSignalCard({ item, showSignal = true }: { item: SignalItem; showSignal?: boolean }) {
  const tags = impactFrequencyTags(item)
  const labeled = item.community_signal || tags.length > 0 || item.wtp_mentioned !== null
  return (
    <Link className="pub-card" href={`/signals/card?id=${item.input_id}`}>
      <div className="pub-card-body">
        <div className="pub-chiprow">
          {showSignal && item.community_signal ? <Chip tone="solid">{SIGNAL_LABEL[item.community_signal]}</Chip> : null}
          {tags.map((t) => <Chip key={t}>{t}</Chip>)}
          {item.wtp_mentioned === true ? <Chip>지불 의사 언급</Chip> : null}
          {labeled ? null : <Chip title="야간 판정이 새 행부터 라벨을 채운다">라벨 없음</Chip>}
        </div>
        <p className="pub-text pub-signal-excerpt">{item.excerpt || '(발췌할 본문이 없다)'}</p>
        <div className="pub-card-meta">
          <span className="pub-card-brand">{item.source_name ?? '소스 미기재'}</span>
          {item.project ? <span>대상 {item.project}</span> : null}
          <span>{judgedOn(item.judged_at)}</span>
        </div>
      </div>
    </Link>
  )
}
