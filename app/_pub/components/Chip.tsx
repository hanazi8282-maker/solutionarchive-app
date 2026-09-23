import type { ReactNode } from 'react'

/**
 * 작은 알약 라벨. 색으로 뜻을 만들지 않는다(quiet/solid 두 모양뿐) — 등급·상태를
 * 색으로만 말하면 색을 못 보는 사람에게는 아무 말도 안 한 것이 된다. 뜻은 글자로 적는다.
 * `title` 은 마우스 설명용이고, 그것 없이도 라벨만으로 읽혀야 한다.
 */
export function Chip({ children, tone = 'quiet', title }: {
  children: ReactNode
  tone?: 'quiet' | 'solid'
  title?: string
}) {
  return (
    <span className={tone === 'solid' ? 'pub-chip pub-chip--solid' : 'pub-chip'} title={title}>
      {children}
    </span>
  )
}
