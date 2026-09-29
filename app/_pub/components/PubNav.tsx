import Link from 'next/link'
import { PubButtonLink } from './Button'

/**
 * 공개 화면 헤더. 메뉴는 4개 — 라이브러리 · 매칭 리포트 · 칼럼 · 신호(2026-09-25) — 이고,
 * 로그인(또는 대시보드)은 메뉴 줄에서 떼어 오른쪽 끝 버튼 하나로 둔다(메뉴와 헷갈리지 않게).
 * `/cases/report` 는 `lib/auth/policy.ts` PUBLIC_EXACT 정확일치 공개라 익명도 들어간다(남헌 09-25 결정 2).
 * 내부 검수 화면 링크는 넣지 않는다: 익명 방문자에게 들어갈 수 없는 문을 보여주지 않는다
 * (내부 네비는 `_ds/AppNav` 가 따로 한다. 그쪽은 `/` 와 `/login` 에서 스스로 숨는다).
 *
 * `email` 은 판정 결과를 **받아서** 쓴다. 판정은 `lib/auth/session.ts` 의 `getAuthVerdict`
 * 한 벌이고 `PubShell` 이 부른다 — 여기서 또 물으면 같은 요청에서 판정이 두 곳에 생긴다.
 * ⚠️ 이 이메일은 표시용이다. 접근 차단은 `proxy.ts` 와 서버 액션 가드가 한다.
 */
export function PubNav({ email }: { email: string | null }) {
  return (
    <nav className="pub-nav" aria-label="공개 화면">
      <Link className="pub-nav-brand" href="/">SOLUTION ARCHIVE</Link>
      <div className="pub-nav-links">
        <Link className="pub-nav-link" href="/library">케이스 라이브러리</Link>
        <Link className="pub-nav-link" href="/cases/report">매칭 리포트</Link>
        <Link className="pub-nav-link" href="/columns/read">칼럼</Link>
        <Link className="pub-nav-link" href="/signals">신호</Link>
      </div>
      {email
        ? <PubButtonLink href="/dashboard" variant="outline" size="sm">대시보드</PubButtonLink>
        : <PubButtonLink href="/login" variant="primary" size="sm">로그인</PubButtonLink>}
    </nav>
  )
}
