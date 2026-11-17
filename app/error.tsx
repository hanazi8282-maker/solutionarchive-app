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
          <Panel tone="alert" titleAs="h2" title="잠시 문제가 생겼습니다">
            <p className="pub-text">{error.digest ? `문의하실 때 알려 주세요: ${error.digest}` : '잠시 뒤 다시 시도해 주세요.'}</p>
            <div className="pub-actions">
              <button type="button" className="pub-btn pub-btn--primary" onClick={reset}>다시 시도</button>
              <PubButtonLink href="/" variant="ghost">첫 화면으로</PubButtonLink>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  )
}
