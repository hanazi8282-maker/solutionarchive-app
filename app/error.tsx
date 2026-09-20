'use client'

import { useEffect } from 'react'
import { PageHeader, PageShell, Notice } from './_ds/components/Shell'
import { Button, ButtonLink } from './_ds/components/Button'

// 서버 컴포넌트가 던지면 Next 기본 오류 화면(영문) 대신 이 화면이 뜬다.
// "데이터가 없다"와 헷갈리지 않게, 확인하지 못한 상태라고 명시한다(CLAUDE.md §7.1).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] render failed', error)
  }, [error])

  return (
    <PageShell maxWidth={720}>
      <PageHeader
        title="화면을 불러오지 못했습니다"
        subtitle="조회나 렌더링 중 오류가 나서 확인하지 못한 상태입니다. 데이터가 0건이라는 뜻이 아닙니다."
      />
      <Notice
        tone="danger"
        title="오류"
        action={
          // ≤480px 에서는 세로로 쌓고 각자 풀폭(app/_ds/styles.css .dgy-btnrow).
          <div className="dgy-btnrow" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
            <Button variant="primary" onClick={reset}>새로고침</Button>
            {/* 로그인 세션이 끊겨도 같은 화면이 뜬다 — 그때 여기가 출구다. */}
            <ButtonLink href="/login" variant="outline">로그인 다시 하기 · 문의</ButtonLink>
            <ButtonLink href="/" variant="outline">홈으로</ButtonLink>
          </div>
        }
      >
        {error.message || '알 수 없는 오류'}
        {error.digest ? ` (서버 로그 digest ${error.digest})` : ''}
      </Notice>
    </PageShell>
  )
}
