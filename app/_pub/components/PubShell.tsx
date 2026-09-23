import type { ReactNode } from 'react'
import '../pub.css'
import { Footer } from './Footer'
import { PubNav } from './PubNav'
import { getAuthVerdict } from '@/lib/auth/session'

/**
 * 공개 화면 한 장의 껍데기 — 테마 스코프 + 헤더 + 본문 + 푸터.
 *
 * `theme` 이 `data-pub-theme` 로 내려가 팔레트 전체를 뒤집는다(tokens.css).
 * 다크는 랜딩·CTA 중심 화면, 라이트는 읽고 조작하는 화면(로그인·라이브러리)이다.
 *
 * ⚠️ 이 컴포넌트가 `_pub` 의 CSS 진입점이다(`import '../pub.css'`). 페이지가 CSS 를
 *    따로 import 하지 않게 한 곳으로 모았다 — `app/layout.tsx` 는 병렬 작업 중이라
 *    건드리지 않는다(그래서 `_pub` CSS 는 전역이 아니라 이 컴포넌트를 통해 들어온다).
 *
 * ⚠️ `_ds/AppNav` 는 `/` 와 `/login` 에서 스스로 null 을 돌려준다. 그 두 화면 밖에서
 *    `PubShell` 을 쓰면 헤더가 두 개 겹친다 — A2(`/library` 등)는 그 처리를 먼저 정해야
 *    한다(README 의 "A2·A3 주의" 참고).
 */
export async function PubShell({ theme, children, footerNote }: {
  theme: 'dark' | 'light'
  children: ReactNode
  footerNote?: string
}) {
  // 판정은 한 벌만 — getAuthVerdict 는 요청 단위로 캐시된다(lib/auth/session.ts).
  const verdict = await getAuthVerdict()
  return (
    <div className="pub-root" data-pub-theme={theme}>
      <PubNav email={verdict.kind === 'allowed' ? verdict.email : null} />
      <main className="pub-main">{children}</main>
      <Footer note={footerNote} />
    </div>
  )
}
