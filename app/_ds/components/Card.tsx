import React from 'react'

/**
 * Card — the standard surface: white fill, hairline border, faint lift.
 * Optional title/subtitle header and right-aligned action slot.
 *
 * 원본: "Dothegy Works Design System/components/core/Card.jsx" — 스타일/로직 그대로,
 * TypeScript 타입만 보강.
 */
type CardProps = {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  padded?: boolean
  children?: React.ReactNode
  style?: React.CSSProperties
  bodyStyle?: React.CSSProperties
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'style' | 'children'>

export function Card({
  title = null,
  subtitle = null,
  action = null,
  padded = true,
  children,
  style = {},
  bodyStyle = {},
  ...rest
}: CardProps) {
  const hasHeader = title || subtitle || action
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {hasHeader ? (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '16px 20px',
          borderBottom: children ? '1px solid var(--border)' : 'none',
        }}>
          {/* minWidth:0 — 긴 부제가 오른쪽 action 을 화면 밖으로 밀지 않게.
              title 은 h2 — 스크린리더 제목 탐색에서 카드가 섹션으로 잡히게(앱에서 변경). */}
          <div style={{ minWidth: 0 }}>
            {title ? (
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.4, color: 'var(--text-strong)' }}>{title}</h2>
            ) : null}
            {subtitle ? (
              <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)', marginTop: title ? 2 : 0, overflowWrap: 'anywhere' }}>{subtitle}</div>
            ) : null}
          </div>
          {action ? <div style={{ flex: 'none' }}>{action}</div> : null}
        </div>
      ) : null}
      {children != null ? (
        <div style={{ padding: padded ? 'var(--card-pad)' : 0, ...bodyStyle }}>{children}</div>
      ) : null}
    </div>
  )
}
