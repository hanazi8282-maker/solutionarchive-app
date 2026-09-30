import type { ReactNode } from 'react'
import '../pub.css'
import { Footer } from './Footer'

/**
 * 공개 화면 한 장의 껍데기 — 테마 스코프 + 본문 + 푸터.
 *
 * `theme` 이 `data-pub-theme` 로 내려가 팔레트 전체를 뒤집는다(tokens.css).
 * 다크는 랜딩·CTA 중심 화면, 라이트는 읽고 조작하는 화면(로그인·라이브러리)이다.
 *
 * 헤더(`PubNav`)는 여기 없다 — 2026-09-30 IA 재편부터 `app/layout.tsx` 가 모든 화면에 한 번 렌더한다
 * (공개·내부 화면이 같은 nav 하나를 쓴다). 그래서 이 컴포넌트는 더 이상 로그인 판정을 하지 않는다.
 */
export function PubShell({ theme, children, footerNote }: {
  theme: 'dark' | 'light'
  children: ReactNode
  footerNote?: string
}) {
  return (
    <div className="pub-root" data-pub-theme={theme}>
      <main className="pub-main">{children}</main>
      <Footer note={footerNote} />
    </div>
  )
}
