import Link from 'next/link'
import { PubButtonLink } from './Button'
import { AdminMenu } from './AdminMenu'
import { NavDropdown, NavLink } from './NavDropdown'

/**
 * 모든 화면(공개·로그인·관리자)의 **유일한** 상단 nav (남헌 2026-09-30 IA 재편 — 좌측 사이드바 폐기).
 * `app/layout.tsx` 가 한 번 렌더한다. `PubShell` 은 더 이상 헤더를 들고 오지 않는다.
 *
 * 링크 줄(남헌 v9-2, 2026-10-01): "아이디어 리소스 ▾"(라이브러리·VOC·칼럼 드롭다운) · "PMF 판정" ·
 * 로그인 후에만 "인사이트"(`/insights`, 유료 핵심 화면이라 리소스에 묶지 않는다).
 * 로그인 전에는 오른쪽 끝 "로그인" 버튼, 로그인 후에는 "관리자 전환" 드롭다운(`AdminMenu`)이다.
 * 두 드롭다운은 `NavDropdown` 한 벌을 쓴다.
 * "PMF 판정"(구 매칭 리포트)의 라우트는 `/cases/report` 그대로다 — `lib/auth/policy.ts` PUBLIC_EXACT 정확일치 공개라
 * 익명도 들어간다(남헌 09-25 결정 2). 이름만 바꿨다(2026-10-01 v9).
 *
 * `email` 은 판정 결과를 **받아서** 쓴다. 판정은 `lib/auth/session.ts` 의 `getAuthVerdict` 한 벌이고
 * 레이아웃이 부른다. ⚠️ 표시용이다 — 접근 차단은 `proxy.ts` 와 서버 액션 가드가 한다.
 */
const RESOURCES: readonly { href: string; label: string }[] = [
  { href: '/library', label: '케이스 라이브러리' },
  { href: '/voc', label: 'VOC' },
  { href: '/columns/read', label: '칼럼' },
]

export function PubNav({ email }: { email: string | null }) {
  return (
    <nav className="pub-nav" aria-label="주요 화면">
      <Link className="pub-nav-brand" href="/" translate="no">SOLUTION ARCHIVE</Link>
      <div className="pub-nav-links">
        <NavDropdown label="아이디어 리소스" className="pub-res" triggerClassName="pub-nav-link" current={RESOURCES.map((r) => r.href)}>
          <ul>
            {RESOURCES.map((r) => (
              <li key={r.href}><NavLink className="pub-admin-link" href={r.href}>{r.label}</NavLink></li>
            ))}
          </ul>
        </NavDropdown>
        <NavLink className="pub-nav-link" href="/cases/report">PMF 판정</NavLink>
        {/* 로그인후 전용(I1). email 이 있을 때만 렌더한다 — 익명 HTML 에는 링크 자체가 없다. */}
        {email && <NavLink className="pub-nav-link" href="/insights">인사이트</NavLink>}
      </div>
      {email
        ? <AdminMenu email={email} />
        : <PubButtonLink href="/login" variant="primary">로그인</PubButtonLink>}
    </nav>
  )
}
