'use client'

import type { ReactNode } from 'react'
import { IconArrowRight } from '../icons'

/**
 * 선택지 한 장(온보딩 퀴즈의 A/B 카드). 진짜 `<button type="button">` 이라
 * Tab·Enter·Space·포커스 링이 전부 공짜다 — div + onClick 으로 만들지 않는다.
 *
 * `PubButton` 과 나눈 이유: 저쪽은 **onClick 을 일부러 안 받는다**(서버 컴포넌트에서
 * 쓰려고). 이건 클라이언트 전용이고, 모양도 알약이 아니라 흰 카드다.
 *
 * 카드 안에서 테마 변수가 라이트로 뒤집힌다(`.pub-panel` 과 같은 규칙) — 다크 캔버스
 * 위에 놓아도 글자색·포커스 링이 알아서 맞는다.
 */
export function PubChoice({ eyebrow, children, onClick, disabled }: {
  eyebrow?: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button className="pub-choice" type="button" onClick={onClick} disabled={disabled}>
      {eyebrow ? <span className="pub-eyebrow">{eyebrow}</span> : null}
      <span className="pub-choice-text">{children}</span>
      {/* [A] 카드 하단 행동 줄 — 카드 전체가 버튼이라는 것을 글자로도 말한다(아이콘만 두지 않는다). */}
      <span className="pub-choice-cta">이걸 고른다<IconArrowRight /></span>
    </button>
  )
}
