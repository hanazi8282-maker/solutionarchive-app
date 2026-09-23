import type { ReactNode } from 'react'

/**
 * 페이지 첫 블록. **h1 은 이 컴포넌트만 만든다** — 한 페이지에 Hero 는 하나다
 * (두 개 쓰면 h1 이 둘이 되어 문서 구조가 깨진다).
 *
 * 높이를 100vh 로 잡지 않는다: 첫 스크롤 전에 다음 섹션의 머리가 보여야 한다.
 */
export function Hero({ eyebrow, title, lead, actions, note }: {
  eyebrow?: string
  title: string
  lead?: string
  /** CTA 버튼들. 없으면 줄 자체가 안 나온다. */
  actions?: ReactNode
  /** CTA 아래 한 줄 — 조건·제약을 적는 자리(과장 방지). */
  note?: string
}) {
  return (
    <header className="pub-hero">
      {eyebrow ? <span className="pub-eyebrow">{eyebrow}</span> : null}
      <h1 className="pub-hero-title">{title}</h1>
      {lead ? <p className="pub-lead">{lead}</p> : null}
      {actions ? <div className="pub-actions">{actions}</div> : null}
      {note ? <p className="pub-caption">{note}</p> : null}
    </header>
  )
}
