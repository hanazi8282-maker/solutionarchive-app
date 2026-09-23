/**
 * `_pub` 아이콘 8종 — 인라인 SVG. **외부 아이콘 라이브러리를 쓰지 않는다**
 * (lucide/heroicons 를 넣으면 200KB 짜리 트리를 8개 때문에 들인다).
 *
 * 규격 한 벌: 20px 그리드 · stroke 1.5 · round cap/join · fill 없음 · `currentColor`.
 * 색을 prop 으로 받지 않는 이유 = 아이콘이 글자색을 따라가야 패널 안에서 테마가
 * 뒤집힐 때(--pub-ink 재선언) 같이 뒤집힌다. 여기서 색을 정하면 그게 안 된다.
 *
 * 크기도 prop 이 아니다 — `width/height: 1em` 이라 **옆 글자 크기를 따라간다**.
 * 칩(13px)과 버튼(15px)에서 각각 맞는 크기가 공짜로 나온다.
 *
 * ⚠️ 장식이다. `aria-hidden` 이 기본이고, 뜻은 옆 글자가 말한다. 아이콘만 있는 버튼을
 *    만들지 마라 — 만들면 그 버튼에 `aria-label` 이 필요해진다.
 */

type IconProps = { className?: string }

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={className ? `pub-icon ${className}` : 'pub-icon'}
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function IconArrowRight({ className }: IconProps) {
  return <Svg className={className}><path d="M3.5 10h13M11.5 5l5 5-5 5" /></Svg>
}

export function IconBookmark({ className }: IconProps) {
  return <Svg className={className}><path d="M5 3.5h10v13l-5-3.5-5 3.5z" /></Svg>
}

export function IconShare({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="15" cy="4.5" r="2" />
      <circle cx="5" cy="10" r="2" />
      <circle cx="15" cy="15.5" r="2" />
      <path d="M6.8 8.9l6.4-3.3M6.8 11.1l6.4 3.3" />
    </Svg>
  )
}

export function IconSearch({ className }: IconProps) {
  return <Svg className={className}><circle cx="8.75" cy="8.75" r="5.25" /><path d="M12.6 12.6l4 4" /></Svg>
}

export function IconFilter({ className }: IconProps) {
  return <Svg className={className}><path d="M3 5h14M5.5 10h9M8.5 15h3" /></Svg>
}

export function IconCheck({ className }: IconProps) {
  return <Svg className={className}><path d="M4 10.5l4 4 8-9" /></Svg>
}

export function IconExternal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11.5 4h4.5v4.5" />
      <path d="M16 4l-6.5 6.5" />
      <path d="M15 12v3.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 15.5v-9A1.5 1.5 0 014.5 5H8" />
    </Svg>
  )
}

export function IconChevronDown({ className }: IconProps) {
  return <Svg className={className}><path d="M5 7.5l5 5 5-5" /></Svg>
}
