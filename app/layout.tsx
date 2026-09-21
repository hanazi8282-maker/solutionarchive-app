import type { ReactNode } from 'react'
import './_ds/styles.css'
import { AppNav } from './_ds/components/AppNav'
import { getAuthVerdict } from '@/lib/auth/session'

export const metadata = {
  title: { default: 'SolutionArchive', template: '%s · SolutionArchive' },
  description: '솔루션아카이브 내부 운영 도구 — 소구점 분석, 발행 연결 수리, 에이전트 상태',
}

// 전에는 body 에 인라인 fontFamily(system-ui)를 박아 두어 디자인 시스템의 Pretendard 를
// 덮었다. 이제 base.css 의 body 규칙(폰트·배경·글자색)이 전 라우트에 그대로 적용된다.
//
// 네비의 이메일은 표시용이다. 접근 차단은 proxy.ts 와 서버 액션 가드가 한다 — 여기서 판정이
// 실패하면 이메일이 안 보일 뿐, 통과시키는 게 아니다.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const verdict = await getAuthVerdict()
  return (
    <html lang="ko">
      <body>
        <AppNav email={verdict.kind === 'allowed' ? verdict.email : null} />
        {/* .sa-main — ≥1024px 에서만 고정 사이드바 폭만큼 본문을 민다(styles.css). */}
        <div className="sa-main">{children}</div>
      </body>
    </html>
  )
}
