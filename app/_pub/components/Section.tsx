import type { ReactNode } from 'react'

/**
 * 섹션 하나 = 눈썹 라벨 + h2 + 리드 + 내용. 제목은 **h2 고정**이다
 * (h1 은 Hero 몫, 카드 제목은 Panel 의 h3).
 *
 * 섹션 사이 간격은 이 컴포넌트가 정하지 않는다 — `PubShell` 의 `.pub-main` 이
 * flex gap 으로 한 곳에서 준다. 그래야 섹션 리듬이 화면마다 갈라지지 않는다.
 */
export function Section({ eyebrow, title, lead, children, id }: {
  eyebrow?: string
  title?: string
  lead?: string
  children?: ReactNode
  id?: string
}) {
  return (
    <section className="pub-section" id={id}>
      {(eyebrow || title || lead) && (
        <div className="pub-section-head">
          {eyebrow ? <span className="pub-eyebrow">{eyebrow}</span> : null}
          {title ? <h2 className="pub-section-title">{title}</h2> : null}
          {lead ? <p className="pub-text">{lead}</p> : null}
        </div>
      )}
      {children}
    </section>
  )
}
