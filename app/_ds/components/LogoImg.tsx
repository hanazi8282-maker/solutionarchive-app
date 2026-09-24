'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * 로고 <img> 한 장 + 폴백 사다리. BrandLogo·PubBrandLogo 의 유일한 클라이언트 경계.
 * src 실패 → fallbackSrc(있으면) → 둘 다 실패면 아무것도 안 그린다(밑에 깔린 이니셜이 보인다).
 * 판정(어떤 주소를 쓸지)은 lib/cases/logo.ts 가 하고 여기는 onError 만 한다.
 */
export function LogoImg({ src, fallbackSrc, width, height, style }: {
  src: string
  fallbackSrc?: string
  width?: number
  height?: number
  style?: CSSProperties
}) {
  const [cur, setCur] = useState<string | null>(src)
  const ref = useRef<HTMLImageElement>(null)
  const fail = () => setCur(c => (c === src && fallbackSrc ? fallbackSrc : null))

  // 하이드레이션 전에 이미 실패한 이미지는 onError 가 안 온다 — 마운트 때 한 번 확인한다.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth === 0) fail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!cur) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={cur}
      alt=""
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      // Brandfetch 사용 지침: Referer(origin) 필수, no-referrer 는 허용 목록 밖. 이 값은 교차 출처에 origin 만 보낸다(경로 X).
      referrerPolicy="strict-origin-when-cross-origin"
      onError={fail}
      style={style}
    />
  )
}
