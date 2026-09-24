'use client'

import { useEffect, useRef } from 'react'

/**
 * 하루 한 번만 뜨는 배너. 닫으면 그 날짜 키로 localStorage 에 기록해 다시 안 띄운다 —
 * 날짜가 키에 들어 있어서 다음 날 발굴 결과는 다시 뜬다(영구히 끄는 게 아니다).
 *
 * 상태를 안 쓰고 DOM 을 직접 켠다. 서버 렌더에는 localStorage 가 없어서 서버는 늘 숨긴 채로
 * 그리고, 마운트 후에 읽어 보고 안 닫았으면 그때 켠다 — 반대로 하면 이미 닫은 배너가
 * 새로고침마다 한 번씩 깜빡인다.
 *
 * localStorage 가 막힌 브라우저(프라이빗 모드)에서는 매번 보인다. 못 읽은 것을 "닫았다"로
 * 읽지 않는다 — 숨기는 쪽이 안전해 보이지만 그러면 아무도 후보를 못 본다(§7.1).
 */
export function DismissBanner({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(storageKey) === '1' } catch { dismissed = false }
    if (ref.current) ref.current.style.display = dismissed ? 'none' : 'flex'
  }, [storageKey])

  return (
    <div
      ref={ref}
      // 스크린리더에 읽히게. 이 배너는 "어젯밤 발굴 결과"라는 상태 알림이고, Notice 와 같은 취급이다.
      role="status"
      // 처음엔 .v2-banner 가 display:none 으로 숨긴다 — 위 useEffect 가 안 닫았으면 flex 로 켠다.
      className="v2-banner"
    >
      <span className="v2-grow">{children}</span>
      <button
        type="button"
        aria-label="오늘은 닫기"
        onClick={() => {
          try { localStorage.setItem(storageKey, '1') } catch { /* 못 써도 이번 화면에서는 닫힌다 */ }
          if (ref.current) ref.current.style.display = 'none'
        }}
        className="v2-banner-close"
      >
        오늘은 닫기
      </button>
    </div>
  )
}
