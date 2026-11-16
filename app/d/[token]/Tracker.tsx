'use client'
import { useEffect } from 'react'

// 열람 1회 + 읽은 깊이(%) 기록. 실패해도 화면은 그대로다(기록은 보너스). 같은 화면을 열 때마다 열람 1회로 센다.
export function Tracker({ token }: { token: string }) {
  useEffect(() => {
    const url = `/d/${token}/event`
    const send = (b: object) => { try { navigator.sendBeacon(url, JSON.stringify(b)) } catch { /* 기록 실패는 무시 */ } }
    send({ type: 'view' })
    let max = 0, sent = 0
    const calc = () => {
      const h = document.documentElement
      const total = Math.max(1, h.scrollHeight)
      max = Math.max(max, Math.min(100, Math.round(((window.scrollY + window.innerHeight) / total) * 100)))
      if (max >= sent + 20) { sent = max; send({ type: 'depth', depth: max }) }
    }
    const flush = () => { if (max > sent) { sent = max; send({ type: 'depth', depth: max }) } }
    window.addEventListener('scroll', calc, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    calc()
    return () => { window.removeEventListener('scroll', calc); window.removeEventListener('pagehide', flush) }
  }, [token])
  return null
}
