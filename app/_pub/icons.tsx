/**
 * `_pub` 아이콘 — 인라인 SVG. **외부 아이콘 라이브러리를 쓰지 않는다**
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

/* ── DS v1(2026-09-29) 추가 — 등급 근거 체크·엑스·대시, 접이식 셰브런, 링크 복사, 의견 엄지 ── */
export function IconX({ className }: IconProps) {
  return <Svg className={className}><path d="M5 5l10 10M15 5L5 15" /></Svg>
}
export function IconMinus({ className }: IconProps) {
  return <Svg className={className}><path d="M5 10h10" /></Svg>
}
export function IconChevronRight({ className }: IconProps) {
  return <Svg className={className}><path d="M8 5l5 5-5 5" /></Svg>
}
export function IconCopy({ className }: IconProps) {
  return <Svg className={className}><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6A1.5 1.5 0 0 0 5.5 12.5H7" /></Svg>
}
export function IconThumbUp({ className }: IconProps) {
  return <Svg className={className}><path d="M6 9v7H3V9zM6 9l3.5-5.5a1.5 1.5 0 0 1 2.8 1L11.5 9H16a1 1 0 0 1 1 1.2l-1.2 5a1 1 0 0 1-1 .8H6" /></Svg>
}
export function IconThumbDown({ className }: IconProps) {
  return <Svg className={className}><path d="M6 11V4H3v7zM6 11l3.5 5.5a1.5 1.5 0 0 0 2.8-1L11.5 11H16a1 1 0 0 0 1-1.2l-1.2-5a1 1 0 0 0-1-.8H6" /></Svg>
}

/* ── G1(2026-09-30, reports/2026-09-30/design-direction-decisions.md B2) — 이름 고정 10종. 자체 작도(외부 path 없음). ── */
/** 2축 도장 — 등급. */
export function IconGrade({ className }: IconProps) {
  return <Svg className={className}><path d="M7.5 3.5h5v3l-1.5 2.5h-2L7.5 6.5z" /><path d="M4 12h12v3H4zM4 17.5h12" /></Svg>
}
/** 체크 위 화살표 — 내일 할 행동. */
export function IconAction({ className }: IconProps) {
  return <Svg className={className}><path d="M3.5 12.5l3 3 5-5.5" /><path d="M12 4h4.5v4.5M16.5 4L11 9.5" /></Svg>
}
/** 인용 부호 + 밑줄 링크 — 근거. */
export function IconEvidence({ className }: IconProps) {
  return <Svg className={className}><path d="M4.5 5h3v3L6 11M10.5 5h3v3L12 11" /><path d="M4 15.5h12" /></Svg>
}
/** 갈림길 — 갈린 사례. */
export function IconSplit({ className }: IconProps) {
  return <Svg className={className}><path d="M10 17.5V11L5 4M10 11l5-7" /><path d="M5 7.5V4h3.5M15 7.5V4h-3.5" /></Svg>
}
/** 깔때기 — 문제 유형. */
export function IconProblem({ className }: IconProps) {
  return <Svg className={className}><path d="M3 4h14l-5.5 6.5V16l-3 1.5v-7z" /></Svg>
}
/** 파형 — 신호. */
export function IconSignal({ className }: IconProps) {
  return <Svg className={className}><path d="M2.5 10h3l2-5 3 10 2-5h5" /></Svg>
}
/** 받은함 — 찾는다(수집). */
export function IconCollect({ className }: IconProps) {
  return <Svg className={className}><path d="M3 11.5l2-7h10l2 7v4H3z" /><path d="M3 11.5h4.5l1 2h3l1-2H17" /></Svg>
}
/** 저울 — 전제·판정. */
export function IconJudge({ className }: IconProps) {
  return <Svg className={className}><path d="M10 3.5v13M6.5 16.5h7M4 6h12" /><path d="M4 6l-2 5h4zM16 6l-2 5h4z" /></Svg>
}
/** 체크 배지 — 사람이 승인. */
export function IconApprove({ className }: IconProps) {
  return <Svg className={className}><circle cx="10" cy="10" r="7" /><path d="M7 10.2l2 2 4-4.4" /></Svg>
}
/** 원 안 화살표 — CTA 전용. */
export function IconArrowCircle({ className }: IconProps) {
  return <Svg className={className}><circle cx="10" cy="10" r="7.5" /><path d="M6.5 10h7M10.5 7l3 3-3 3" /></Svg>
}
