/**
 * 채점 화면 아이콘 5종 — 인라인 SVG(DESIGN.md §1: 유니코드·이모지 아이콘 금지). 20px 그리드 · stroke 1.5~1.75 ·
 * currentColor · 장식이라 aria-hidden. 뜻은 옆 글자가 말한다. `app/_pub/icons.tsx` 와 같은 규격이지만
 * 내부 화면이 `_pub` 를 import 하지 않는 규칙(_pub/README §1) 때문에 여기 따로 둔다.
 */
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}
export const IconCheck = () => <Svg><path d="M4 10.5l4 4 8-9" /></Svg>
export const IconChevronRight = () => <Svg><path d="M8 5l5 5-5 5" /></Svg>
export const IconExternal = () => <Svg><path d="M11 4h5v5M16 4l-8 8M14 11v5H4V6h5" /></Svg>
export const IconUndo = () => <Svg><path d="M7 5L3 9l4 4M3 9h8a5 5 0 0 1 0 10" /></Svg>
export const IconClock = () => <Svg><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2" /></Svg>
