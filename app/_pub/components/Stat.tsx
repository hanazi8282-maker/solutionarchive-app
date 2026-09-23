import type { ReactNode } from 'react'

/**
 * 숫자 한 칸. `value` 를 문자열로 받는다 — **못 읽은 것을 0 으로 접지 않기 위해서다**
 * (CLAUDE.md §7.1). 집계에 실패하면 페이지가 `value="집계 불가"` 를 넘기고,
 * 이 컴포넌트는 숫자인지 아닌지 판단하지 않는다.
 */
export function Stat({ label, value, caption }: {
  label: string
  value: string
  caption?: string
}) {
  return (
    <div className="pub-stat">
      <span className="pub-stat-label">{label}</span>
      <strong className="pub-stat-value">{value}</strong>
      {caption ? <span className="pub-stat-caption">{caption}</span> : null}
    </div>
  )
}

/** Stat 여러 칸을 한 줄로. 280px 이하에서는 자동으로 쌓인다. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="pub-statrow">{children}</div>
}
