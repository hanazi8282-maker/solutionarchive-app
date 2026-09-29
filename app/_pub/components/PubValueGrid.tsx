import type { ReactNode } from 'react'
import { PubIconTile } from './PubIconTile'

export type PubValueItem = { icon: ReactNode; title: string; body: string; stat: string; source: string }

/**
 * 가치제안 격자(B5) — 면(plane-accent) 위 흰 카드, 3열(≥1024) / 2열(≥600) / 1열.
 * `stat` 은 문자열이다: 라이브 숫자는 페이지가 조립해 넘기고, 못 세면 "집계 불가" 를 그대로 넘긴다(0 으로 접지 않는다).
 * `source` 는 숫자 캡션의 `title` 툴팁(원 수치·출처 경로).
 */
export function PubValueGrid({ items }: { items: PubValueItem[] }) {
  return (
    <ul className="pub-values">
      {items.map((it) => (
        <li key={it.title} className="pub-value">
          <PubIconTile icon={it.icon} />
          <h3 className="pub-value-t">{it.title}</h3>
          <p className="pub-value-b">{it.body}</p>
          <p className="pub-value-stat" title={it.source}>{it.stat}</p>
        </li>
      ))}
    </ul>
  )
}
