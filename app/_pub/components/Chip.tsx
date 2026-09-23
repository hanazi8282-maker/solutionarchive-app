import type { ReactNode } from 'react'

/**
 * 작은 알약 라벨.
 *
 * **색은 거들기만 한다.** 뜻은 항상 글자로 적는다 — 색으로만 말하면 색을 못 보는 사람에게는
 * 아무 말도 안 한 것이 된다. `title` 은 마우스 설명용이고, 그것 없이도 라벨만으로 읽혀야 한다.
 *
 * tone: quiet(기본 선) · solid(액센트 채움) · **판정 3색** positive/negative/mixed.
 * 판정 3색은 "됐다 / 안 됐다 / 갈렸다" 처럼 **결과 방향**에만 쓴다 — 등급(A~D)은 분류이지
 * 방향이 아니라서 색을 입히지 않는다. 값은 tokens.css 의 `--pub-verdict-*`
 * ([A] 라임 · [T] 코랄 · 앰버)이고 두더지웍스의 emerald/red 는 쓰지 않는다.
 */
const TONE_CLASS = {
  quiet: '',
  solid: 'pub-chip--solid',
  positive: 'pub-chip--pos',
  negative: 'pub-chip--neg',
  mixed: 'pub-chip--mix',
} as const

export function Chip({ children, tone = 'quiet', title }: {
  children: ReactNode
  tone?: keyof typeof TONE_CLASS
  title?: string
}) {
  const extra = TONE_CLASS[tone]
  return (
    <span className={extra ? `pub-chip ${extra}` : 'pub-chip'} title={title}>
      {children}
    </span>
  )
}
