import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 2026-10-01 남헌 지시: 공개 피드 `/signals*` → `/voc*` 개명. 외부 공유·북마크가 깨지지 않게 옛 주소를 301 로 넘긴다.
  // config redirects 는 proxy.ts(인증)보다 먼저 돈다 — 익명이 /login 으로 튕기지 않는다. 질의(?id= 등)는 그대로 따라간다.
  // `permanent: true` 는 308 이라 statusCode 로 301 을 못박는다.
  async redirects() {
    return [
      { source: '/signals', destination: '/voc', statusCode: 301 },
      { source: '/signals/:path*', destination: '/voc/:path*', statusCode: 301 },
    ]
  },
}

export default nextConfig
