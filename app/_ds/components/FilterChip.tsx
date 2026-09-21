import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * 목록·검수 화면의 필터 칩. /analyze · /discovery 에 같은 인라인 스타일이 `FilterLink` 로
 * 복붙되어 있던 것을 한 곳으로 모은 것이다(모양이 갈라지기 시작했다).
 *
 * active 는 브랜드 색을 쓴다 — info(파랑)는 "정보" 배너 색이라, 선택된 필터와 뜻이 겹쳤다.
 * count 는 숫자만 따로 받아 tabular-nums 로 붙인다(칩마다 자릿수가 달라 흔들리던 자리).
 *
 * ⚠️ 아직 소비처가 없다 — PR3(analyze) · PR5(cases·columns) · PR6(discovery)가 옮겨 붙인다.
 */
export function FilterChip({ href, active, count, children }: {
  href: string
  active: boolean
  count?: number
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
        borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
        border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
        background: active ? 'var(--brand)' : 'var(--surface-card)',
        color: active ? 'var(--brand-fg)' : 'var(--text-body)',
      }}
    >
      {children}
      {count == null ? null : (
        <span style={{ fontVariantNumeric: 'tabular-nums', opacity: active ? 0.9 : 0.7 }}>{count}</span>
      )}
    </Link>
  )
}
