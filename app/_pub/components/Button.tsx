import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * `_pub` 버튼 — primary(채운 알약) / ghost(테두리). 색은 테마와 패널이 정한다
 * (`--pub-cta`·`--pub-cta-ink`), 그래서 다크 캔버스 위에서는 흰 알약, 흰 패널
 * 안에서는 검은 알약이 **같은 props 로** 나온다.
 *
 * 두 벌인 이유: 링크는 `<a>`, 폼 제출은 `<button>` 이어야 한다(로그인·로그아웃이
 * 서버 액션 POST 폼이다). onClick 을 받지 않는다 — 받으면 'use client' 가 되어
 * 서버 컴포넌트에서 못 쓴다.
 */

type Variant = 'primary' | 'ghost'
/** sm 은 A2 에서 붙었다 — 목록·상세의 인라인 액션 줄에서 44px 알약이 문장을 밀어낸다. */
type Size = 'sm' | 'md' | 'lg'

const cls = (variant: Variant, size: Size) =>
  ['pub-btn', `pub-btn--${variant}`, size === 'md' ? '' : `pub-btn--${size}`].filter(Boolean).join(' ')

export function PubButtonLink({ href, children, variant = 'primary', size = 'md', external = false }: {
  href: string
  children: ReactNode
  variant?: Variant
  size?: Size
  /** 새 탭으로 여는 외부 링크. next/link 대신 <a> 로 나간다. */
  external?: boolean
}) {
  if (external) {
    return (
      <a className={cls(variant, size)} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }
  return <Link className={cls(variant, size)} href={href}>{children}</Link>
}

export function PubButton({ children, variant = 'primary', size = 'md', type = 'submit', name, value }: {
  children: ReactNode
  variant?: Variant
  size?: Size
  type?: 'submit' | 'button'
  name?: string
  value?: string
}) {
  return (
    <button className={cls(variant, size)} type={type} name={name} value={value}>
      {children}
    </button>
  )
}
