import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import { Inter } from 'next/font/google'
import './_ds/styles.css'
import { AppNav } from './_ds/components/AppNav'
import { getAuthVerdict } from '@/lib/auth/session'

export const metadata = {
  title: { default: 'SolutionArchive', template: '%s · SolutionArchive' },
  description: '솔루션아카이브 내부 운영 도구 — 소구점 분석, 발행 연결 수리, 에이전트 상태',
}

/**
 * Pretendard 셀프호스팅 (남헌 2026-09-23 결정).
 *
 * 전에는 `app/_ds/tokens/fonts.css` 가 jsDelivr CDN 에서 받아 왔다. 외부 CDN 을 쓰지 않기로
 * 해서 파일(`public/fonts/PretendardVariable.woff2`, 리포에 커밋)로 옮겼고, @font-face 는
 * next/font/local 이 만든다 — 그래야 Next 가 preload 링크까지 붙인다.
 *
 * `variable` 로 나온 `--font-pretendard` 를 tokens/typography.css 의 `--font-sans` 가 읽는다.
 * 클래스는 <html> 에 붙는다 — :root 에서 정의되는 `--font-sans` 와 같은 요소여야 변수가 보인다.
 *
 * ponytail: variable woff2 한 장(2.0MB)이다. dynamic-subset(파일 100여 개, unicode-range 로
 *   실제 전송 ~150KB)이 더 빠르지만 next/font/local 에 src 를 100줄 적어야 한다.
 *   첫 화면 지연이 실측으로 문제가 되면 그때 서브셋으로 내린다.
 */
const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-pretendard',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Apple SD Gothic Neo', 'Segoe UI', 'Roboto', 'sans-serif'],
})

/**
 * Inter — `app/_pub` 공개 화면의 영문·숫자·디스플레이 서체 (남헌 2026-09-24 확정).
 * 레퍼런스 4곳(Foreplay·Trend Seeker·BigIdeasDB·Atria) 본문이 전부 Inter 다.
 *
 * `next/font/google` 은 **빌드 때 받아 셀프호스팅**한다 — 런타임에 구글 CDN 을 때리지 않는다
 * (Pretendard 를 CDN 에서 내린 것과 같은 이유). variable 축이라 굵기 300~600 이 파일 한 장이다.
 *
 * 한글은 그대로 Pretendard 다. `_pub` 의 스택이 `var(--font-inter), var(--font-pretendard)`
 * 라서 **글리프 단위로** 떨어진다 — 라틴·숫자는 Inter, 한글은 Pretendard 가 그린다.
 * subsets 에 'latin' 만 넣는 이유가 그것이다(한글을 Inter 로 받을 일이 없다).
 *
 * ⚠️ `_ds`(두더지웍스) 화면은 이 변수를 읽지 않는다 — `--font-sans` 는 Pretendard 그대로다.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// 전에는 body 에 인라인 fontFamily(system-ui)를 박아 두어 디자인 시스템의 Pretendard 를
// 덮었다. 이제 base.css 의 body 규칙(폰트·배경·글자색)이 전 라우트에 그대로 적용된다.
//
// 네비의 이메일은 표시용이다. 접근 차단은 proxy.ts 와 서버 액션 가드가 한다 — 여기서 판정이
// 실패하면 이메일이 안 보일 뿐, 통과시키는 게 아니다.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const verdict = await getAuthVerdict()
  return (
    <html lang="ko" className={`${pretendard.variable} ${inter.variable}`}>
      <body>
        <AppNav email={verdict.kind === 'allowed' ? verdict.email : null} />
        {/* .sa-main — ≥1024px 에서만 고정 사이드바 폭만큼 본문을 민다(styles.css). */}
        <div className="sa-main">{children}</div>
      </body>
    </html>
  )
}
