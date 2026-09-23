import type { ReactNode } from 'react'

/**
 * 흰 섹션 카드 = "흰 섬". 다크 캔버스 위에 띄우는 Foreplay 리듬의 핵심이고,
 * 라이트 화면에서는 그냥 카드가 된다.
 *
 * ★ 패널 안에서는 테마 변수가 라이트로 뒤집힌다(`pub.css` 의 `.pub-panel` 변수 재선언).
 *   그래서 패널 안의 Button·Chip·Stat 은 **테마를 따지지 않고** 흰 배경용 색을 쓴다.
 *   컴포넌트에 `onDark` 같은 prop 을 만들지 않은 이유다.
 *
 * tone: card(기본 radius 16) · banner(radius 32 + 가운데 정렬, 하단 CTA) ·
 *       alert(왼쪽 굵은 선, 로그인 화면의 오류·잠김 안내).
 *
 * `titleAs` 는 제목 단계다. 기본 h3(섹션 h2 아래), 배너는 스스로 한 블록이라 h2.
 * 단계를 건너뛰면 스크린리더의 제목 목록이 어긋난다 — 크기는 CSS 가 정하므로
 * 태그를 크기 때문에 고르지 않는다.
 */
export function Panel({ title, eyebrow, tone = 'card', titleAs, children, id }: {
  title?: string
  eyebrow?: string
  tone?: 'card' | 'banner' | 'alert'
  titleAs?: 'h2' | 'h3'
  children?: ReactNode
  id?: string
}) {
  const cls = ['pub-panel', tone === 'card' ? '' : `pub-panel--${tone}`].filter(Boolean).join(' ')
  const Heading = titleAs ?? (tone === 'banner' ? 'h2' : 'h3')
  return (
    <section className={cls} id={id}>
      {eyebrow ? <span className="pub-eyebrow">{eyebrow}</span> : null}
      {title ? <Heading className="pub-panel-title">{title}</Heading> : null}
      {children}
    </section>
  )
}
