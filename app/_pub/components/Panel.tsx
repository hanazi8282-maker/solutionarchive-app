import type { ReactNode } from 'react'

/**
 * 흰 섬(패널). `card` 반경 16 / `banner` 반경 24 + 가운데 정렬 / `alert` 왼쪽 굵은 선 /
 * `dark` 다크 면(DESIGN.md §4: 랜딩·상세의 유일한 다크 면, CTA 배너). 제목 기본 h3(배너·다크는 h2).
 * `eyebrow` 는 남아 있지만 DS v1 공개 화면은 쓰지 않는다(DESIGN.md §5: 눈썹 라벨 없음).
 */
export function Panel({ title, eyebrow, tone = 'card', titleAs, children, id }: {
  title?: string
  eyebrow?: string
  tone?: 'card' | 'banner' | 'alert' | 'dark'
  titleAs?: 'h2' | 'h3'
  children?: ReactNode
  id?: string
}) {
  const cls = ['pub-panel', tone === 'card' ? '' : `pub-panel--${tone}`].filter(Boolean).join(' ')
  const Heading = titleAs ?? (tone === 'banner' || tone === 'dark' ? 'h2' : 'h3')
  return (
    <section className={cls} id={id}>
      {eyebrow ? <span className="pub-eyebrow">{eyebrow}</span> : null}
      {title ? <Heading className="pub-panel-title">{title}</Heading> : null}
      {children}
    </section>
  )
}
