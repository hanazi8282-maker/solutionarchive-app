import type { ReactNode } from 'react'

export const metadata = {
  title: 'SolutionArchive',
  description: '발행 글 등록 및 성과 기록',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
