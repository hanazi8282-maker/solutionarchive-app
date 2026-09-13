import type { ReactNode } from 'react'
import './_ds/styles.css'
import { AppNav } from './_ds/components/AppNav'

export const metadata = {
  title: { default: 'SolutionArchive', template: '%s · SolutionArchive' },
  description: '솔루션아카이브 내부 운영 도구 — 발행 기록, 에이전트 상태, 소구점 분석',
}

// 전에는 body 에 인라인 fontFamily(system-ui)를 박아 두어 디자인 시스템의 Pretendard 를
// 덮었다. 이제 base.css 의 body 규칙(폰트·배경·글자색)이 전 라우트에 그대로 적용된다.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  )
}
