import Link from 'next/link'
import { impactFrequencyTags } from '@/lib/analysis/relevance-judge'
import { SIGNAL_LABEL, type SignalItem } from '@/lib/signals/feed'
import { faviconUrl } from '@/lib/cases/logo'
import { LogoImg } from '../../_ds/components/LogoImg'
import { IconSignal } from '../icons'
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
 *
 * 머리(B3-7): 소스 파비콘 16 + 소스명 + 신호 라벨 칩. 파비콘은 원문 링크(`link`)의 도메인에서만 만든다 —
 * 링크를 못 되살린 소스는 도메인을 지어내지 않고 `signal` 아이콘이 그 자리를 채운다(이미지 실패 때도 같은 아이콘).
 */
export function PubSignalCard({ item, showSignal = true }: { item: SignalItem; showSignal?: boolean }) {
  const tags = impactFrequencyTags(item)
  const labeled = item.community_signal || tags.length > 0 || item.wtp_mentioned !== null
  const fav = faviconUrl(item.link)
  return (
    <Link className="pub-card" href={`/signals/card?id=${item.input_id}`}>
      <div className="pub-card-body">
        <div className="pub-signal-head">
          <span className="pub-evid-fav" aria-hidden="true"><IconSignal />{fav ? <LogoImg src={fav} width={16} height={16} /> : null}</span>
          <span className="pub-card-brand">{item.source_name ?? '소스 미기재'}</span>
          {showSignal && item.community_signal ? <Chip tone="solid">{SIGNAL_LABEL[item.community_signal]}</Chip> : null}
        </div>
        <div className="pub-chiprow">
          {tags.map((t) => <Chip key={t}>{t}</Chip>)}
          {item.wtp_mentioned === true ? <Chip>지불 의사 언급</Chip> : null}
          {labeled ? null : <Chip title="야간 판정이 새 행부터 라벨을 채운다">라벨 없음</Chip>}
        </div>
        <p className="pub-text pub-signal-excerpt">{item.excerpt || '(발췌할 본문이 없다)'}</p>
        <div className="pub-card-meta">
          {item.project ? <span>대상 {item.project}</span> : null}
          <span>{judgedOn(item.judged_at)}</span>
        </div>
      </div>
    </Link>
  )
}
