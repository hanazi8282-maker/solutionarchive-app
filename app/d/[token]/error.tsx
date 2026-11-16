'use client'
import { useEffect } from 'react'
import '../../_pub/pub.css'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButtonLink } from '../../_pub/components/Button'

// 열람·완성본 화면 일반 오류 — 손님 말로. 내부 오류 문구는 화면에 싣지 않고 콘솔에만 남긴다.
export default function LeadError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[lead] render failed', error) }, [error])
  return (
    <div className="pub-root" data-pub-theme="light">
      <main className="pub-main">
        <div className="pub-solo">
          <Hero eyebrow="잠시 문제가 생겼습니다" title="화면을 불러오지 못했습니다" lead="저장된 내용은 그대로입니다. 잠시 뒤 다시 열어 보세요. 계속 안 되면 받으신 메일에 답장으로 알려 주세요." />
          <Panel>
            <div className="pub-actions">
              <button type="button" className="pub-btn pub-btn--primary pub-btn--lg" onClick={reset}>다시 시도</button>
              <PubButtonLink href="/" variant="ghost">첫 화면으로</PubButtonLink>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  )
}
