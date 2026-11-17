'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 초안 만드는 중 화면: 생성을 한 번 시작시키고(이미 시작됐으면 서버가 아무것도 안 한다), 8초마다 상태를 다시 읽는다.
export function Starter({ token, start }: { token: string; start: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (start) fetch(`/d/${token}/generate`, { method: 'POST' }).then(() => router.refresh()).catch(() => router.refresh())
    const t = setInterval(() => router.refresh(), 8000)
    return () => clearInterval(t)
  }, [token, start, router])
  return null
}
