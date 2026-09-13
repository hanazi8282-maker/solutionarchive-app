import type { CSSProperties, ReactNode } from 'react'
import type { Tone } from './Badge'

/**
 * 앱 공용 페이지 골격 — PageShell / PageHeader / Notice / StatTile.
 *
 * 라우트마다 main 래퍼·2줄 헤더·오류 배너·숫자 타일을 인라인 스타일로 따로
 * 복붙하고 있었다(/dashboard, /agents, /analyze/*, /onboarding/quiz). 모양이
 * 조금씩 갈라져서 한 곳으로 모은다. 로직 없음, 서버·클라이언트 어디서든 렌더된다.
 */

/** 페이지 본문 래퍼. 자식 사이 간격을 grid gap 하나로 통일한다. */
export function PageShell({ maxWidth = 960, children }: { maxWidth?: number; children: ReactNode }) {
  return (
    <main style={{ padding: '24px clamp(16px, 4vw, 32px) 64px' }}>
      <div style={{
        maxWidth, margin: '0 auto', display: 'grid', gap: 20,
        // minmax(0,…) 가 없으면 긴 URL·ID 한 줄이 모바일 폭을 밀어낸다.
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}>
        {children}
      </div>
    </main>
  )
}

/** 2줄 헤더(제목 + 범위를 좁히는 회색 부제) — 디자인 시스템의 페이지 헤더 규칙. */
export function PageHeader({ title, subtitle, action }: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          margin: 0, fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-bold)',
          letterSpacing: 'var(--ls-tight)', lineHeight: 'var(--lh-tight)', color: 'var(--text-strong)',
        }}>
          {title}
        </h1>
        {subtitle ? (
          <p style={{
            margin: '6px 0 0', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)',
            color: 'var(--text-muted)', overflowWrap: 'anywhere',
          }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{action}</div> : null}
    </header>
  )
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger'

/** 페이지·섹션 단위 배너. danger 는 스크린리더에 즉시 읽히도록 role=alert. */
export function Notice({ tone = 'info', title, children, action, style }: {
  tone?: NoticeTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        background: `var(--${tone}-bg)`,
        border: `1px solid var(--${tone}-border)`,
        borderLeft: `3px solid var(--${tone})`,
        color: `var(--${tone}-fg)`,
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        fontSize: 'var(--fs-sm)',
        lineHeight: 'var(--lh-relaxed)',
        overflowWrap: 'anywhere',
        ...style,
      }}
    >
      {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
      {children}
      {action ? <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>{action}</div> : null}
    </div>
  )
}

const TILE_VALUE_COLOR: Partial<Record<Tone, string>> = {
  danger: 'var(--danger-fg)', warning: 'var(--warning-fg)', success: 'var(--success-fg)', info: 'var(--info-fg)',
}

/**
 * 숫자 한 칸. 숫자만 두지 않는다 — caption 에 기준(몇 건 중·어느 기간·어디서 셌나)을 적는다.
 * href 가 있으면 타일 전체가 해당 섹션으로 가는 링크가 된다.
 */
export function StatTile({ label, value, caption, tone, href }: {
  label: ReactNode
  value: ReactNode
  caption?: ReactNode
  tone?: Tone
  href?: string
}) {
  const body = (
    <>
      <span style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 500, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        display: 'block', marginTop: 4, fontSize: 28, fontWeight: 700, lineHeight: 1.15,
        letterSpacing: 'var(--ls-tight)', fontVariantNumeric: 'tabular-nums',
        color: (tone && TILE_VALUE_COLOR[tone]) || 'var(--text-strong)',
      }}>
        {value}
      </span>
      {caption ? (
        <span style={{ display: 'block', marginTop: 4, fontSize: 'var(--fs-xs)', lineHeight: 1.5, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
          {caption}
        </span>
      ) : null}
    </>
  )
  const style: CSSProperties = {
    display: 'block',
    background: 'var(--surface-card)',
    border: '1px solid var(--border)',
    borderTop: `3px solid ${tone && tone !== 'neutral' ? `var(--${tone})` : 'var(--border)'}`,
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
    padding: '12px 16px 14px',
    minWidth: 0,
    color: 'inherit',
  }
  return href
    ? <a href={href} className="dgy-tile" style={style}>{body}</a>
    : <div style={style}>{body}</div>
}

/** StatTile 묶음. 400px 폭에서는 2열, 넓으면 자동으로 늘어난다. */
export function StatGrid({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return (
    <section style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}>
      {children}
    </section>
  )
}
