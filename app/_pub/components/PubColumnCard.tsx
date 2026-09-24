import Link from 'next/link'
import { Chip } from './Chip'
import { IconArrowRight } from '../icons'

/**
 * 칼럼 목록 한 장. M1(토큰 v2)에서 케이스 카드와 같은 [A] 카드 클래스(`.pub-card`)로 옮겼다 —
 * 라벨 칩 → 제목(head-sm) → 2줄 요약 → 메타. 공개 화면에서 "카드"는 한 모양이다.
 * 케이스 카드와 달리 듀오톤 띠가 없다: 칼럼에는 브랜드 로고가 없고, 지어 넣지 않는다.
 *
 * 제목은 h3 다: 목록 제목(h2) 아래 단계. 크기 때문에 태그를 고르지 않는다.
 */
export function PubColumnCard({ href, title, summary, readerType, date }: {
  href: string
  title: string
  summary: string
  readerType: string
  /** 이미 포맷된 날짜 문자열. 시간대 판단은 화면이 하고 카드는 받아 적는다. */
  date: string
}) {
  return (
    <Link className="pub-card" href={href}>
      <div className="pub-card-body">
        <div className="pub-chiprow"><Chip>{readerType}</Chip></div>
        <h3 className="pub-card-title">{title}</h3>
        {summary ? <p className="pub-card-note">{summary}</p> : null}
        <div className="pub-card-meta">
          <span>{date}</span>
          <span className="pub-card-go">읽기<IconArrowRight /></span>
        </div>
      </div>
    </Link>
  )
}
