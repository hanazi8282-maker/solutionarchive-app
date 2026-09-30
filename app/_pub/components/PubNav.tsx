import Link from 'next/link'
import { PubButtonLink } from './Button'
import { AdminMenu } from './AdminMenu'

/**
 * 모든 화면(공개·로그인·관리자)의 **유일한** 상단 nav (남헌 2026-09-30 IA 재편 — 좌측 사이드바 폐기).
 * `app/layout.tsx` 가 한 번 렌더한다. `PubShell` 은 더 이상 헤더를 들고 오지 않는다.
 *
 * 링크 줄은 공개 메뉴 4개 + 로그인 후에만 "인사이트"(`/insights`).로그인 전에는 오른쪽 끝 "로그인" 버튼, 로그인 후에는 "관리자 전환"
 * 드롭다운(`AdminMenu`, 내부 검수 화면 목적지 전부)이다.
 * `/cases/report` 는 `lib/auth/policy.ts` PUBLIC_EXACT 정확일치 공개라 익명도 들어간다(남헌 09-25 결정 2).
 *
 * `email` 은 판정 결과를 **받아서** 쓴다. 판정은 `lib/auth/session.ts` 의 `getAuthVerdict` 한 벌이고
 * 레이아웃이 부른다. ⚠️ 표시용이다 — 접근 차단은 `proxy.ts` 와 서버 액션 가드가 한다.
 */
const LINKS: readonly { href: string; label: string; authed?: true }[] = [
  { href: '/library', label: '케이스 라이브러리' },
  { href: '/cases/report', label: '매칭 리포트' },
  { href: '/columns/read', label: '칼럼' },
  { href: '/signals', label: '신호' },
  // 로그인후 전용(I1). authed 링크는 email 이 있을 때만 렌더한다 — 익명 HTML 에는 링크 자체가 없다.
  { href: '/insights', label: '인사이트', authed: true },
]

export function PubNav({ email }: { email: string | null }) {
  return (
    <nav className="pub-nav" aria-label="주요 화면">
      <Link className="pub-nav-brand" href="/" translate="no">SOLUTION ARCHIVE</Link>
      <div className="pub-nav-links">
        {LINKS.filter((l) => !l.authed || email).map((l) => <Link key={l.href} className="pub-nav-link" href={l.href}>{l.label}</Link>)}
      </div>
      {email
        ? <AdminMenu email={email} />
        : <PubButtonLink href="/login" variant="primary">로그인</PubButtonLink>}
    </nav>
  )
}
