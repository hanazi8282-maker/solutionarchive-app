'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 앱 상단 네비. 목적지가 셋뿐이라 디자인 시스템의 236px 사이드바 대신
 * 같은 다크 크롬 토큰(--sidebar-*)을 쓰는 상단 바로 둔다 — 모바일 드로어 JS 가 필요 없다.
 * 전에는 /dashboard ↔ /agents 사이 링크 하나뿐이었고 /analyze 로 가는 길이 없었다.
 */
const LINKS = [
  { href: '/dashboard', match: '/dashboard', label: '발행 기록' },
  { href: '/agents', match: '/agents', label: '에이전트' },
  // 목록(/analyze)이 입구다. 새 분석은 목록 상단 버튼에서 간다.
  { href: '/analyze', match: '/analyze', label: '소구점 분석' },
] as const

export function AppNav() {
  const path = usePathname() ?? ''
  // 온보딩 퀴즈는 로그인 이전(익명) 화면이다. 내부 도구 네비를 보여주지 않는다.
  if (path.startsWith('/onboarding')) return null

  return (
    <nav
      aria-label="주요 화면"
      className="dgy-nav"
      style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)',
      }}
    >
      {/* 폭 제한 없음 — 페이지 본문 폭이 라우트마다 달라(720~1040) 가운데 정렬하면 어긋나 보인다. */}
      <div style={{
        height: 52,
        padding: '0 clamp(16px, 4vw, 32px)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <Link
          href="/dashboard"
          className="dgy-nav-brand"
          style={{
            color: 'var(--text-on-dark)', fontSize: 12, fontWeight: 700,
            letterSpacing: 'var(--ls-wider)', whiteSpace: 'nowrap',
          }}
        >
          SOLUTION ARCHIVE
        </Link>
        <ul style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0, overflowX: 'auto', minWidth: 0 }}>
          {LINKS.map((l) => {
            const active = path.startsWith(l.match)
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', height: 36, padding: '0 12px',
                    borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap',
                    color: active ? 'var(--sidebar-active-fg)' : 'var(--sidebar-fg)',
                    background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                  }}
                >
                  {l.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
