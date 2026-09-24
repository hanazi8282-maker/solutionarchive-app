'use client'

import { useEffect } from 'react'
import './_pub/pub.css'
import { Hero } from './_pub/components/Hero'
import { Panel } from './_pub/components/Panel'
import { PubButtonLink } from './_pub/components/Button'

// 서버 컴포넌트가 던지면 Next 기본 오류 화면(영문) 대신 이 화면이 뜬다.
// "데이터가 없다"와 헷갈리지 않게, 확인하지 못한 상태라고 명시한다(CLAUDE.md §7.1).
//
// 공개(_pub)·내부(M2 .sa-v2) 두 레이어가 같이 쓰는 파일이라 공개 톤(토큰 v2 라이트)으로 그린다
// (남헌 2026-09-25 결정 4번). M2 값은 _pub 라이트 값을 옮긴 것이라(app/_ds/v2/v2.css 머리말)
// 내부 화면에서 떠도 캔버스·표면·반경이 같다. 레이아웃은 /login 한 장 카드(.pub-solo) 재사용.
// PubShell 은 async 서버 컴포넌트라 여기(클라이언트)서 못 쓴다 — 스코프 div 만 직접 둔다.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] render failed', error)
  }, [error])

  return (
    <div className="pub-root" data-pub-theme="light">
      <main className="pub-main">
        <div className="pub-solo">
          <Hero
            title="화면을 불러오지 못했습니다"
            lead="조회나 렌더링 중 오류가 나서 확인하지 못한 상태입니다. 데이터가 0건이라는 뜻이 아닙니다."
          />
          <Panel tone="alert" titleAs="h2" title="오류">
            <p className="pub-text">
              {error.message || '알 수 없는 오류'}
              {error.digest ? ` (서버 로그 digest ${error.digest})` : ''}
            </p>
            <div className="pub-actions">
              {/* PubButton 은 onClick 을 안 받는다(README) — 클라이언트 버튼은 클래스를 직접 붙인다. */}
              <button type="button" className="pub-btn pub-btn--primary" onClick={reset}>새로고침</button>
              {/* 로그인 세션이 끊겨도 같은 화면이 뜬다 — 그때 여기가 출구다. */}
              <PubButtonLink href="/login" variant="ghost">로그인 다시 하기 · 문의</PubButtonLink>
              <PubButtonLink href="/" variant="ghost">홈으로</PubButtonLink>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  )
}
