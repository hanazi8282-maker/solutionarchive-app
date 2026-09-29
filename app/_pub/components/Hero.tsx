import { Fragment, type CSSProperties, type ReactNode } from 'react'

/**
 * 페이지 첫 블록. **h1 은 이 컴포넌트만 만든다** — 한 페이지에 Hero 는 하나다
 * (두 개 쓰면 h1 이 둘이 되어 문서 구조가 깨진다).
 *
 * 높이를 100vh 로 잡지 않는다: 첫 스크롤 전에 다음 섹션의 머리가 보여야 한다.
 *
 * A2 에서 `media`·`meta`·`variant` 세 개가 붙었다 — 케이스 상세 히어로가 로고 + 칩 두 줄을
 * 제목과 같은 블록에 둬야 하는데, 그걸 페이지에서 직접 마크업하면 h1 이 이 컴포넌트 밖으로
 * 나간다(그 순간 "h1 은 하나" 규칙을 지킬 자리가 없어진다).
 */
export function Hero({ eyebrow, title, lead, actions, note, media, meta, aside, animateTitle = false, variant = 'page' }: {
  eyebrow?: string
  title: string
  lead?: string
  /** CTA 버튼들. 없으면 줄 자체가 안 나온다. */
  actions?: ReactNode
  /** CTA 아래 한 줄 — 조건·제약을 적는 자리(과장 방지). */
  note?: string
  /** 제목 왼쪽 썸네일(상세의 `PubBrandLogo`). 없으면 마크업 자체가 안 생긴다. */
  media?: ReactNode
  /** 제목 아래 칩 줄들. 페이지가 `.pub-chiprow` 로 감싼 것을 그대로 받는다. */
  meta?: ReactNode
  /** detail = 제목 한 단 작게 + 위 여백 줄임(긴 케이스 제목이 화면을 덮지 않게). */
  variant?: 'page' | 'detail'
  /** G2 랜딩: 제목 아래 오른쪽 열(≥1024). <1024 에서는 note 아래로 쌓인다. */
  aside?: ReactNode
  /**
   * G2 랜딩: 제목을 공백 단위 `.pub-word` 로 쪼개 등장시킨다(B6-3, h1 한 곳만). 스크린리더는 aria-label 원문 한 줄.
   * 인라인 style 은 색·크기가 아니라 순번(`--i`)뿐이다 — README 규칙 3 의 명시 예외.
   */
  animateTitle?: boolean
}) {
  // media 가 없으면 감싸는 div 를 만들지 않는다 — 랜딩·로그인 마크업이 A1 그대로 남는다.
  const head = (
    <>
      {eyebrow ? <span className="pub-eyebrow">{eyebrow}</span> : null}
      {animateTitle ? (
        <h1 className="pub-hero-title" aria-label={title}>
          {title.split(' ').map((w, i) => (
            <Fragment key={i}>{i ? ' ' : ''}<span className="pub-word" aria-hidden="true" style={{ '--i': i } as CSSProperties}>{w}</span></Fragment>
          ))}
        </h1>
      ) : (
        <h1 className="pub-hero-title">{title}</h1>
      )}
    </>
  )

  return (
    <header className={['pub-hero', variant === 'detail' ? 'pub-hero--detail' : '', aside ? 'pub-hero--split' : ''].filter(Boolean).join(' ')}>
      {media
        ? <div className="pub-hero-head">{media}<div className="pub-hero-headtext">{head}</div></div>
        : head}
      {meta}
      {lead ? <p className="pub-lead">{lead}</p> : null}
      {actions ? <div className="pub-actions">{actions}</div> : null}
      {note ? <p className="pub-caption">{note}</p> : null}
      {aside ? <div className="pub-hero-aside">{aside}</div> : null}
    </header>
  )
}
