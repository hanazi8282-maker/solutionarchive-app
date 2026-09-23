'use client'

import { useState } from 'react'
import { Button } from '../../_ds/components/Button'

/**
 * 링크 복사 버튼. "저장"·SNS 공유는 만들지 않았다 — 저장은 로그인·저장함이 있어야 뜻이 있고
 * (지금 없다), SNS 공유 버튼은 각 플랫폼 SDK 를 붙이는 값에 비해 링크 복사와 결과가 같다.
 *
 * 클립보드가 막힌 환경(비HTTPS·권한 거부)에서는 "복사했다"고 말하지 않는다 — 주소창을
 * 쓰라고 알려 준다(§7.1: 실패를 성공으로 접지 않는다).
 */
export function ShareLinkButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Button variant="outline" size="sm" onClick={copy}>링크 복사</Button>
      {state === 'copied' && <span role="status" style={{ fontSize: 12, color: 'var(--success-fg)' }}>복사했습니다</span>}
      {state === 'failed' && <span role="alert" style={{ fontSize: 12, color: 'var(--warning-fg)' }}>복사가 막혔습니다 — 주소창의 URL 을 쓰세요</span>}
    </span>
  )
}
