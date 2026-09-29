'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 진입 순차 등장(B6-1). 뷰포트 20% 에 들어오면 한 번 `data-in` 을 켠다 — 움직임은 전부 pub.css(`pub-rise`).
 * JS 가 없거나 reduced-motion 이면 `data-js` 를 안 붙이므로 처음부터 최종 상태다(숨김은 `[data-js]:not([data-in])` 에서만).
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    el.dataset.js = ''
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      el.dataset.in = ''
      io.disconnect()
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={className ? `pub-reveal ${className}` : 'pub-reveal'}>{children}</div>
}
