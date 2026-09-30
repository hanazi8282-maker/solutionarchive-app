'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconExternal } from '../icons'
import { NavDropdown } from './NavDropdown'

/**
 * "관리자 전환" 드롭다운 — 로그인 상태에서 `PubNav` 오른쪽 끝(남헌 2026-09-30 IA 재편).
 * 좌측 사이드바(`_ds/AppNav`, 삭제)의 목적지를 그룹형 패널 하나로 옮겼다.
 *
 * ⚠️ 화면 전환 UI 일 뿐 권한 분기가 아니다. 접근 차단은 `proxy.ts` 와 서버 액션 가드가 한다.
 *
 * 열고 닫기·키보드·포커스는 `NavDropdown` 한 벌이다("아이디어 리소스"와 공용, 2026-10-01 남헌 v9-2).
 */
type Item = { href: string; match: string; label: string }

const GROUPS: readonly { label: string; items: readonly Item[] }[] = [
  {
    label: '정보 수집 현황',
    items: [
      { href: '/agents', match: '/agents', label: '에이전트 현황' },
      // 야간 발굴 루프가 스스로 고른 후보를 사람이 뒤집는 자리. 여기 없으면 자동 채택이 그대로 굳는다.
      { href: '/discovery', match: '/discovery', label: '브랜드 후보 발굴' },
    ],
  },
  {
    label: 'PMF 분석',
    items: [
      { href: '/analyze', match: '/analyze', label: '소구점 분석' },
      // 관련성 판정 기준을 사람이 채점해 되먹이는 자리(요약은 /relevance/feedback).
      { href: '/relevance/grade', match: '/relevance', label: 'VOC 분석' },
    ],
  },
  {
    label: '검수·운영',
    items: [{ href: '/cases', match: '/cases', label: '케이스 검수' }],
  },
  {
    label: '칼럼&SNS',
    items: [
      { href: '/columns', match: '/columns', label: '칼럼·스레드 검수' },
      { href: '/dashboard', match: '/dashboard', label: '발행 연결 수리' },
    ],
  },
]

// 계정 쪽 — 사이드바 하단에 있던 것. 없애면 로그아웃·프로필로 가는 길이 사라진다.
const PROFILE: Item = { href: '/settings/profile', match: '/settings', label: '내 프로필' }
// claude.ai 아티팩트라 작성자 계정으로 로그인해야 열린다.
const MANUAL_URL = 'https://claude.ai/code/artifact/775a2ae2-108f-4664-b093-4f9f3e8bb437'

/** 공개 화면(`/cases/report`·`/columns/read`)은 이 메뉴의 목적지가 아니다 — 거기서 켜지지 않게 뺀다. */
function activeItem(path: string): Item | undefined {
  if (path.startsWith('/cases/report') || path.startsWith('/columns/read')) return undefined
  return [...GROUPS.flatMap((g) => g.items), PROFILE]
    .filter((i) => path === i.match || path.startsWith(i.match + '/'))
    .sort((a, b) => b.match.length - a.match.length)[0]
}

export function AdminMenu({ email }: { email: string }) {
  const active = activeItem(usePathname() ?? '')
  return (
    <NavDropdown label="관리자 전환" triggerClassName="pub-btn">
      {GROUPS.map((g, n) => (
        <div key={g.label} className="pub-admin-group">
          <p className="pub-admin-h" id={`admin-g${n}`}>{g.label}</p>
          <ul aria-labelledby={`admin-g${n}`}>
            {g.items.map((i) => (
              <li key={i.href}>
                <Link className="pub-admin-link" href={i.href} aria-current={i === active ? 'page' : undefined}>
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="pub-admin-account">
        <p className="pub-admin-email" title={email} translate="no">{email}</p>
        <Link className="pub-admin-link" href={PROFILE.href} aria-current={PROFILE === active ? 'page' : undefined}>
          {PROFILE.label}
        </Link>
        <a className="pub-admin-link" href={MANUAL_URL} target="_blank" rel="noreferrer">
          사용설명서 <IconExternal /><span className="pub-sr">(새 탭)</span>
        </a>
        <form action="/auth/logout" method="post">
          <button type="submit" className="pub-admin-link">로그아웃</button>
        </form>
      </div>
    </NavDropdown>
  )
}
