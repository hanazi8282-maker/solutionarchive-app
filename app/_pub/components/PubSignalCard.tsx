import Link from 'next/link'
import { impactFrequencyTags } from '@/lib/analysis/relevance-judge'
import { SIGNAL_LABEL, type SignalItem } from '@/lib/signals/feed'
import { IconSignal } from '../icons'
import { Chip } from './Chip'

const KST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
/** 발췌가 빈 이유 — 본문이 없어서가 아니라 출처 정책(quote_allowed)이라서다. 둘을 같은 글자로 쓰지 않는다. */
export const NO_QUOTE = '(원문 인용 비공개 — 출처 정책상 직접 인용하지 않는다)'
export const judgedOn =(at: string) => `판정 ${KST.format(new Date(at))}`

/**
 * 리뷰 1건 카드(VOC 피드 · 3열 공용). 카드 전체가 페인 카드 상세(`/voc/card?id=`)로 가는 링크다 —
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
  return (
    <Link className="pub-card" href={`/voc/card?id=${item.input_id}`}>
      <div className="pub-card-body">
        <div className="pub-signal-head">
          {/* D안(2026-10-05): 소스 이름·파비콘(링크 도메인)은 고객 화면에 내지 않는다. */}
          <span className="pub-evid-fav" aria-hidden="true"><IconSignal /></span>
          {showSignal && item.community_signal ? <Chip tone="solid">{SIGNAL_LABEL[item.community_signal]}</Chip> : null}
        </div>
        <div className="pub-chiprow">
          {tags.map((t) => <Chip key={t}>{t}</Chip>)}
          {item.wtp_mentioned === true ? <Chip>지불 의사 언급</Chip> : null}
          {labeled ? null : <Chip title="야간 판정이 새 행부터 라벨을 채운다">라벨 없음</Chip>}
        </div>
        {/* 2026-10-01 남헌: 판정 사유(review_relevance_verdicts.reason)를 크게 — 한눈에 무슨 불만·니즈인지. 2줄 넘으면 말줄임, 전문은 상세. */}
        {item.reason ? (
          <>
            <p className="pub-card-title">{item.reason}</p>
            {item.excerpt ? <p className="pub-card-note pub-signal-excerpt">발췌 · {item.excerpt}</p> : null}
          </>
        ) : (
          <>
            <p className="pub-card-note pub-card-note--empty">판정 사유 없음 — 발췌로 대체</p>
            <p className="pub-text pub-signal-excerpt">{item.excerpt || NO_QUOTE}</p>
          </>
        )}
        <div className="pub-card-meta">
          {item.project ? <span>대상 {item.project}</span> : null}
          <span>{judgedOn(item.judged_at)}</span>
        </div>
      </div>
    </Link>
  )
}
