import React from 'react'
import type { Tone } from './Badge'

/**
 * 원본: "Dothegy Works Design System/components/core/ProgressBar.jsx" — 스타일/로직 그대로,
 * TypeScript 타입만 보강.
 */

/** Maps an achievement % to the spec's status hue (0–69 red, 70–99 amber, 100+ green). */
export function achievementTone(pct: number): Tone {
  if (pct >= 100) return 'success'
  if (pct >= 70) return 'warning'
  return 'danger'
}

const TONE_COLOR: Partial<Record<Tone, string>> = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--success)',
  info: 'var(--info)',
  neutral: 'var(--slate-400)',
}

type ProgressBarProps = {
  value?: number
  max?: number
  tone?: Tone | 'auto'
  height?: number
  showLabel?: boolean
  style?: React.CSSProperties
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'style'>

/**
 * ProgressBar — horizontal track + fill. `tone="auto"` colours the fill
 * by the achievement-rate rule; otherwise pass an explicit tone.
 */
export function ProgressBar({
  value = 0,
  max = 100,
  tone = 'auto',
  height = 8,
  showLabel = false,
  style = {},
  ...rest
}: ProgressBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0
  const clamped = Math.max(0, Math.min(100, pct))
  const resolved = tone === 'auto' ? achievementTone(pct) : tone
  const color = TONE_COLOR[resolved] || TONE_COLOR.neutral

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)', ...style }} {...rest}>
      <div style={{
        flex: 1,
        height,
        background: 'var(--slate-100)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clamped}%`,
          height: '100%',
          background: color,
          borderRadius: 'var(--radius-full)',
          transition: 'width var(--dur-slow) var(--ease-out)',
        }} />
      </div>
      {showLabel ? (
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-body)',
          fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right',
        }}>
          {Math.round(pct)}%
        </span>
      ) : null}
    </div>
  )
}
