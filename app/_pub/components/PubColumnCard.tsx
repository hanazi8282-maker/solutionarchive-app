import Link from 'next/link'

/**
 * 칼럼 목록 한 장. `.pub-case`(랜딩의 케이스 줄)를 재사용하지 않는다 — 그쪽은 A2 가
 * 케이스 그리드 카드로 키우는 중이라, 같은 클래스를 쓰면 한 화면을 고칠 때 다른 화면이
 * 따라 바뀐다.
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
    <Link className="pub-column-card" href={href}>
      <span className="pub-column-card-meta">
        <span className="pub-chip">{readerType}</span>
        <span className="pub-caption">{date}</span>
      </span>
      <h3 className="pub-column-card-title">{title}</h3>
      {summary ? <span className="pub-text">{summary}</span> : null}
    </Link>
  )
}
