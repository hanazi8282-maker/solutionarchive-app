'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 앱 네비. 같은 목적지 목록을 두 벌 렌더한다.
 *  - ≥1024px: 좌측 고정 사이드바(`--sidebar-w`). 목적지가 7개로 늘어 상단바가 overflowX 로
 *    넘치고 있었고, 그룹을 나눌 자리도 없었다.
 *  - <1024px: 기존 상단바 그대로(375px 가로 스크롤 없음 실측). 하단 탭바는 안 만든다 —
 *    review 의 sticky 저장바(bottom:12px)와 충돌하고, 폰 사용 근거가 아직 없다.
 * 어느 쪽을 보이는지는 CSS 미디어쿼리(`.sa-sidebar`/`.sa-topbar`, styles.css)가 정한다.
 * JS 로 화면 폭을 재면 SSR 과 첫 페인트가 어긋나 깜빡인다.
 */
type NavLink = { href: string; match: string; label: string }

const NAV_GROUPS: readonly { label: string; links: readonly NavLink[] }[] = [
  {
    label: '분석',
    links: [
      // 목록(/analyze)이 입구다. 새 분석은 목록 상단 버튼에서 간다.
      { href: '/analyze', match: '/analyze', label: '소구점 분석' },
      // 야간 발굴 루프가 스스로 고른 후보를 사람이 뒤집는 자리. 네비에 없으면 매일 밤
      // 쌓이는 후보를 아무도 안 보고, 자동 채택이 그대로 굳는다.
      { href: '/discovery', match: '/discovery', label: '발굴 후보 검증' },
      // 셀러가 자기 말로 묻는 유일한 입구. 네비에 없으면 만든 화면이 없는 화면이다.
      { href: '/cases/search', match: '/cases/search', label: '유사 케이스 검색' },
    ],
  },
  {
    label: '검수·운영',
    links: [
      // 전에는 /agents 의 사람 대기함 링크로만 들어갈 수 있었다. 매일 승인 버튼을 누르는 화면이
      // 네비에 없어서, 대기함이 0건인 날에는 가는 길 자체가 사라졌다.
      { href: '/cases', match: '/cases', label: '케이스 검수' },
      { href: '/columns', match: '/columns', label: '칼럼·스레드 검수' },
      // 이름을 바꿨다: 열람 화면이 아니라 어긋난 연결을 고치는 수리소다(화면 안 문구는 PR6).
      { href: '/dashboard', match: '/dashboard', label: '발행 연결 수리' },
      { href: '/agents', match: '/agents', label: '에이전트' },
    ],
  },
]

// 새 분석 1단계를 프리필하는 값이 사는 곳. 네비에 없으면 한 번 저장하고 영영 못 고친다.
const PROFILE_LINK: NavLink = { href: '/settings/profile', match: '/settings', label: '내 프로필' }

/** 상단바용 평면 목록 — 사이드바와 같은 상수에서 나온다(둘이 갈라지지 않게). */
const LINKS: readonly NavLink[] = [...NAV_GROUPS.flatMap((g) => g.links), PROFILE_LINK]

/**
 * 사용설명서. 화면 이름과 실제로 하는 일이 다른 곳이 여럿이라 처음 보는 사람이 헤맨다.
 *
 * 위 목적지 목록과 **다른 자리에 둔다** — 이건 앱 화면이 아니라 앱 밖으로 나가는 링크다.
 * 화면 이동 메뉴에 섞으면 뒤로가기로 돌아올 수 있는 곳처럼 보인다.
 *
 * ⚠️ claude.ai 아티팩트라 **작성자 계정으로 로그인해야 열린다.** 팀이 늘어 공유가
 *    필요해지면 아티팩트 공유를 켜거나 문서를 앱 안으로 옮긴다.
 */
const MANUAL_URL = 'https://claude.ai/code/artifact/775a2ae2-108f-4664-b093-4f9f3e8bb437'

const MANUAL_TITLE = '처음 보는 사람용 사용설명서 — 화면별로 무엇을 하는 곳인지, 내가 뭘 눌러야 하는지 (새 탭)'

const chromeBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px',
  borderRadius: 'var(--radius-md)', fontSize: 13, whiteSpace: 'nowrap', textDecoration: 'none',
  border: '1px solid var(--sidebar-border)', background: 'transparent', color: 'var(--sidebar-fg)',
}

const brandStyle: CSSProperties = {
  color: 'var(--text-on-dark)', fontSize: 12, fontWeight: 700,
  letterSpacing: 'var(--ls-wider)', whiteSpace: 'nowrap',
}

/** email 은 레이아웃이 판정해 넘긴다. 허용된 로그인일 때만 값이 있다. */
export function AppNav({ email }: { email: string | null }) {
  const path = usePathname() ?? ''
  // 온보딩 퀴즈는 로그인 이전(익명) 화면이다. 내부 도구 네비를 보여주지 않는다.
  // 로그인 화면·랜딩(`/`)도 마찬가지 — 들어갈 수 없는 화면 링크를 보여주지 않는다
  // (로그인돼 있으면 랜딩은 /dashboard 로 보내므로 네비가 사라지는 일이 없다).
  if (path.startsWith('/onboarding') || path === '/login' || path === '/') return null

  // match 가 겹칠 때(/cases 와 /cases/search) **가장 긴 것 하나만** 켠다 — 둘 다 켜지면 지금 어디인지 안 보인다.
  const best = [...NAV_GROUPS.flatMap((g) => g.links), PROFILE_LINK]
    .filter((l) => path.startsWith(l.match))
    .sort((a, b) => b.match.length - a.match.length)[0]
  const isActive = (l: NavLink) => l === best

  return (
    <>
      {/* ---- ≥1024px: 좌측 고정 사이드바 ---- */}
      <nav
        aria-label="주요 화면"
        className="dgy-nav sa-sidebar"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 'var(--sidebar-w)', zIndex: 20,
          background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)',
          overflowY: 'auto', padding: '16px 12px 12px',
          // display 는 styles.css 가 정한다 — 인라인으로 박으면 좁은 화면에서 숨길 수 없다.
        }}
      >
        <Link href="/dashboard" className="dgy-nav-brand" style={{ ...brandStyle, display: 'block', padding: '0 8px 16px' }}>
          SOLUTION ARCHIVE
        </Link>
        {NAV_GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: 16 }}>
            <div className="dgy-caps" style={{ padding: '0 8px 6px', color: 'var(--sidebar-fg-muted)' }}>{g.label}</div>
            <ul style={{ display: 'grid', gap: 2, listStyle: 'none', margin: 0, padding: 0 }}>
              {g.links.map((l) => {
                const active = isActive(l)
                return (
                  <li key={l.href}>
                    <Link href={l.href} aria-current={active ? 'page' : undefined} style={sidebarItem(active)}>
                      {l.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {/* 하단 고정 — 매일 쓰는 목적지가 아니라 계정·문서 쪽 */}
        <div style={{
          marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--sidebar-border)',
          display: 'grid', gap: 6, minWidth: 0,
        }}>
          <Link
            href={PROFILE_LINK.href}
            aria-current={isActive(PROFILE_LINK) ? 'page' : undefined}
            style={sidebarItem(isActive(PROFILE_LINK))}
          >
            {PROFILE_LINK.label}
          </Link>
          <AccountBlock email={email} layout="sidebar" />
        </div>
      </nav>

      {/* ---- <1024px: 기존 상단바 ---- */}
      <nav
        aria-label="주요 화면"
        className="dgy-nav sa-topbar"
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
          <Link href="/dashboard" className="dgy-nav-brand" style={brandStyle}>
            SOLUTION ARCHIVE
          </Link>
          <ul style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0, overflowX: 'auto', minWidth: 0 }}>
            {LINKS.map((l) => {
              const active = isActive(l)
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
          {/* flexShrink 0 — 375px 에서 이 묶음이 눌리면 nowrap 인 설명서·로그아웃이 밖으로 삐져나와
              페이지 전체에 가로 스크롤이 생겼다(2026-09-21 실측). 줄어드는 쪽은 스크롤되는 링크 목록이어야 한다. */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 0 }}>
            {/* 설명서 — 화면 이동이 아니라 새 탭이다. 아이콘으로 그 사실을 먼저 알린다. */}
            <AccountBlock email={email} layout="topbar" />
          </div>
        </div>
      </nav>
    </>
  )
}

/**
 * 설명서 링크 + 이메일 + 로그아웃 — 사이드바와 상단바가 같은 한 벌을 쓴다(두 벌이면 로그아웃 문구·
 * 설명서 URL 을 고칠 때 한쪽을 빠뜨린다 — 실제로 이메일 스타일이 벌써 갈라져 있었다).
 * layout 은 배치만 가른다: 사이드바는 세로 스택·로그아웃 전폭, 상단바는 가로 행·이메일 220px 상한.
 */
function AccountBlock({ email, layout }: { email: string | null; layout: 'sidebar' | 'topbar' }) {
  const sidebar = layout === 'sidebar'
  return (
    <>
      <a href={MANUAL_URL} target="_blank" rel="noreferrer" title={MANUAL_TITLE} style={chromeBtn}>
        <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>↗</span>
        설명서
      </a>
      {email && (
        <>
          <span
            title={email}
            className={sidebar ? undefined : 'dgy-nav-email'}
            style={{
              color: 'var(--sidebar-fg)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              ...(sidebar ? { padding: '0 8px' } : { maxWidth: 220 }),
            }}
          >
            {email}
          </span>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              title={`${email} 로그아웃`}
              style={{ ...chromeBtn, cursor: 'pointer', ...(sidebar ? { width: '100%', justifyContent: 'center' } : {}) }}
            >
              로그아웃
            </button>
          </form>
        </>
      )}
    </>
  )
}

function sidebarItem(active: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', minHeight: 34, padding: '0 8px',
    borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500,
    color: active ? 'var(--sidebar-active-fg)' : 'var(--sidebar-fg)',
    background: active ? 'var(--sidebar-active-bg)' : 'transparent',
  }
}
