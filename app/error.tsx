'use client'

import { useEffect } from 'react'
import { PageHeader, PageShell, Notice } from './_ds/components/Shell'
import { Button } from './_ds/components/Button'

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
        action={<Button variant="neutral" onClick={reset}>다시 시도</Button>}
      >
        {error.message || '알 수 없는 오류'}
        {error.digest ? ` (서버 로그 digest ${error.digest})` : ''}
      </Notice>
    </PageShell>
  )
}
