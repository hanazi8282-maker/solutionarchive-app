import React from 'react'
import Link from 'next/link'

/**
 * Button — the primary interactive control. Solid blue for prominent CTAs,
 * near-black neutral for default actions, outline/ghost for secondary.
 *
 * 원본: "Dothegy Works Design System/components/core/Button.jsx" — 스타일/로직 그대로,
 * TypeScript 타입만 보강. ButtonLink 는 앱에서 추가했다 — 페이지 이동을
 * `<button onClick={location.href=…}>` 로 하던 자리(키보드·새 탭 열기 불가)를 링크로 바꾼다.
 */
type Variant = 'primary' | 'neutral' | 'outline' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

type ButtonProps = {
  variant?: Variant
  size?: Size
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  children?: React.ReactNode
  style?: React.CSSProperties
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'children'>

const SIZES = {
  sm: { height: 30, padding: '0 10px', fontSize: 13, gap: 6 },
  md: { height: 36, padding: '0 14px', fontSize: 14, gap: 7 },
  lg: { height: 42, padding: '0 18px', fontSize: 15, gap: 8 },
}

const VARIANTS = {
  primary: { background: 'var(--primary)', color: 'var(--primary-fg)', border: '1px solid transparent' },
  neutral: { background: 'var(--neutral-btn)', color: 'var(--neutral-btn-fg)', border: '1px solid transparent' },
  outline: { background: 'var(--surface-card)', color: 'var(--text-body)', border: '1px solid var(--border-strong)' },
  ghost: { background: 'transparent', color: 'var(--text-body)', border: '1px solid transparent' },
  destructive: { background: 'var(--danger)', color: '#fff', border: '1px solid transparent' },
}

const HOVER_BG: Record<Variant, string> = {
  primary: 'var(--primary-hover)',
  neutral: 'var(--neutral-btn-hover)',
  outline: 'var(--slate-50)',
  ghost: 'var(--slate-100)',
  destructive: 'var(--red-600)',
}

function baseStyle(variant: Variant, size: Size, disabled: boolean, fullWidth: boolean): React.CSSProperties {
  const sz = SIZES[size] || SIZES.md
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sz.gap,
    height: sz.height,
    padding: sz.padding,
    fontSize: sz.fontSize,
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    lineHeight: 1,
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
    whiteSpace: 'nowrap',
    transition: 'background var(--dur-fast) var(--ease-standard), opacity var(--dur-fast)',
    userSelect: 'none',
    ...(VARIANTS[variant] || VARIANTS.neutral),
  }
}

export function Button({
  variant = 'neutral',
  size = 'md',
  leftIcon = null,
  rightIcon = null,
  disabled = false,
  fullWidth = false,
  type = 'button',
  children,
  style = {},
  ...rest
}: ButtonProps) {
  const vr = VARIANTS[variant] || VARIANTS.neutral
  const hoverBg = HOVER_BG[variant]

  const onEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && hoverBg) e.currentTarget.style.background = hoverBg
  }
  const onLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) e.currentTarget.style.background = vr.background
  }

  return (
    <button
      type={type}
      disabled={disabled}
      style={{ ...baseStyle(variant, size, disabled, fullWidth), ...style }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      {...rest}
    >
      {leftIcon ? <span style={{ display: 'inline-flex' }}>{leftIcon}</span> : null}
      {children}
      {rightIcon ? <span style={{ display: 'inline-flex' }}>{rightIcon}</span> : null}
    </button>
  )
}

type ButtonLinkProps = {
  href: string
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  children?: React.ReactNode
  style?: React.CSSProperties
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'style' | 'children'>

/** 버튼 모양의 링크. 앱 내부 경로는 next/link, 그 밖(다운로드·API)은 일반 a. hover 는 `.dgy-btnlink` CSS. */
export function ButtonLink({ href, variant = 'outline', size = 'md', fullWidth = false, children, style = {}, ...rest }: ButtonLinkProps) {
  const s = { ...baseStyle(variant, size, false, fullWidth), textDecoration: 'none', ...style }
  const internal = href.startsWith('/') && !href.startsWith('/api/') && rest.download === undefined
  return internal
    ? <Link href={href} className="dgy-btnlink" style={s} {...rest}>{children}</Link>
    : <a href={href} className="dgy-btnlink" style={s} {...rest}>{children}</a>
}
