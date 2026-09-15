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
  // 전에는 /agents 의 사람 대기함 링크로만 들어갈 수 있었다. 매일 승인 버튼을 누르는 화면이
  // 네비에 없어서, 대기함이 0건인 날에는 가는 길 자체가 사라졌다.
  { href: '/cases', match: '/cases', label: '케이스 검수' },
  { href: '/columns', match: '/columns', label: '칼럼·스레드 검수' },
] as const

/**
 * 사용설명서. 화면 이름과 실제로 하는 일이 다른 곳이 여럿이라(예: "발행 기록"은
 * 기록 열람이 아니라 어긋난 연결을 고치는 수리소다) 처음 보는 사람이 헤맨다.
 *
 * 위 LINKS 와 **다른 자리에 둔다** — 이건 앱 화면이 아니라 앱 밖으로 나가는 링크다.
 * 화면 이동 메뉴에 섞으면 뒤로가기로 돌아올 수 있는 곳처럼 보인다.
 *
 * ⚠️ claude.ai 아티팩트라 **작성자 계정으로 로그인해야 열린다.** 팀이 늘어 공유가
 *    필요해지면 아티팩트 공유를 켜거나 문서를 앱 안으로 옮긴다.
 */
const MANUAL_URL = 'https://claude.ai/code/artifact/775a2ae2-108f-4664-b093-4f9f3e8bb437'

/** email 은 레이아웃이 판정해 넘긴다. 허용된 로그인일 때만 값이 있다. */
export function AppNav({ email }: { email: string | null }) {
  const path = usePathname() ?? ''
  // 온보딩 퀴즈는 로그인 이전(익명) 화면이다. 내부 도구 네비를 보여주지 않는다.
  // 로그인 화면도 마찬가지 — 들어갈 수 없는 화면 링크를 보여주지 않는다.
  if (path.startsWith('/onboarding') || path === '/login') return null

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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* 설명서 — 화면 이동이 아니라 새 탭이다. 아이콘으로 그 사실을 먼저 알린다. */}
          <a
            href={MANUAL_URL}
            target="_blank"
            rel="noreferrer"
            title="처음 보는 사람용 사용설명서 — 화면별로 무엇을 하는 곳인지, 내가 뭘 눌러야 하는지 (새 탭)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px',
              borderRadius: 'var(--radius-md)', fontSize: 13, whiteSpace: 'nowrap', textDecoration: 'none',
              border: '1px solid var(--sidebar-border)', background: 'transparent', color: 'var(--sidebar-fg)',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>↗</span>
            설명서
          </a>
          {email && (
          <>
            <span
              title={email}
              style={{ color: 'var(--sidebar-fg)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}
            >
              {email}
            </span>
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                style={{
                  height: 30, padding: '0 10px', borderRadius: 'var(--radius-md)', fontSize: 13, whiteSpace: 'nowrap',
                  border: '1px solid var(--sidebar-border)', background: 'transparent', color: 'var(--sidebar-fg)', cursor: 'pointer',
                }}
              >
                로그아웃
              </button>
            </form>
          </>
          )}
        </div>
      </div>
    </nav>
  )
}
