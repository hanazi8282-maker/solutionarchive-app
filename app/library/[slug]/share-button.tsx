'use client'

import { useState } from 'react'
import { IconCopy } from '../../_pub/icons'

/**
 * 링크 복사 버튼. SNS 공유는 만들지 않았다 — 각 플랫폼 SDK 를 붙이는 값에 비해 링크 복사와
 * 결과가 같다.
 *
 * 클립보드가 막힌 환경(비HTTPS·권한 거부)에서는 "복사했다"고 말하지 않는다 — 주소창을
 * 쓰라고 알려 준다(§7.1: 실패를 성공으로 접지 않는다). 상태는 버튼 글자 자체가 말한다(aria-live).
 *
 * ⚠️ 클라이언트 컴포넌트라 `_pub` 의 서버용 버튼을 못 쓴다 — `.pub-btn` 클래스를 직접 붙인다.
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
    setTimeout(() => setState('idle'), 2500)
  }

  return (
    <button className="pub-btn" type="button" onClick={copy} aria-live="polite">
      <IconCopy />
      {state === 'idle' ? '링크 복사' : state === 'copied' ? '복사됨' : '복사 안 됨. 주소창에서 복사'}
    </button>
  )
}
