import type { ReactNode } from 'react'

/**
 * 아이콘 타일(B2) — 40×40(sm 32) 면 위에 20px 아이콘. 장식이라 `aria-hidden`, 뜻은 옆 글자가 말한다.
 * 다크 면 안에서는 CSS(`.pub-panel--dark .pub-icontile`)가 색을 뒤집는다 — 여기서 테마를 분기하지 않는다(README 규칙 5).
 */
export function PubIconTile({ icon, tone = 'accent', size = 40 }: {
  icon: ReactNode
  tone?: 'accent' | 'ice' | 'lilac'
  size?: 40 | 32
}) {
  const cls = ['pub-icontile', tone === 'accent' ? '' : `pub-icontile--${tone}`, size === 32 ? 'pub-icontile--sm' : '']
    .filter(Boolean).join(' ')
  return <span className={cls} aria-hidden="true">{icon}</span>
}
