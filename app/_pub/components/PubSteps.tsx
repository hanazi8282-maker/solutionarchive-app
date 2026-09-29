import Link from 'next/link'
import type { ReactNode } from 'react'
import { IconArrowRight } from '../icons'
import { PubIconTile } from './PubIconTile'

export type PubStepItem = { icon: ReactNode; title: string; body: string; caption?: string; href?: string }

/**
 * 작동원리 단계(B4). 문구는 페이지가 넘긴다(랜딩·방법론이 캡션을 다르게 쓴다).
 * 순서는 `<ol>` 이 말하고 화살표는 장식(`aria-hidden`). `compact` 는 캡션·링크를 그리지 않는다(방법론 압축판).
 * ≥1024 가로 + 화살표 · 768~1023 2×2 · <768 세로 레일 — 전부 CSS.
 */
export function PubSteps({ steps, compact = false }: { steps: PubStepItem[]; compact?: boolean }) {
  return (
    <ol className={compact ? 'pub-steps pub-steps--compact' : 'pub-steps'}>
      {steps.map((s, i) => (
        <li key={s.title} className="pub-step">
          {/* 띠가 이미 ice 면이라 타일은 accent 면(ice 위 ice 는 타일이 안 보인다). */}
          <PubIconTile icon={s.icon} />
          <div className="pub-step-main">
            <h3 className="pub-step-t">{s.title}</h3>
            <p className="pub-step-b">{s.body}</p>
            {!compact && s.caption
              ? <p className="pub-step-cap">{s.href ? <Link href={s.href}>{s.caption}</Link> : s.caption}</p>
              : null}
          </div>
          {i < steps.length - 1 ? <span className="pub-step-arrow" aria-hidden="true"><IconArrowRight /></span> : null}
        </li>
      ))}
    </ol>
  )
}
