import { logoFor, LOGO_NOTICE, type LogoInput } from '@/lib/cases/logo'
import { LogoImg } from './LogoImg'

/**
 * 브랜드 썸네일 — 상세 히어로와 CaseCard 가 같은 것을 쓴다(둘이 갈라지면 같은 케이스가
 * 카드에서는 로고, 상세에서는 이니셜로 보인다).
 *
 * 판정(무엇을 그릴지)은 `lib/cases/logo.ts` 한 벌이고 여기는 그리기만 한다.
 *
 * ⚠️ `<img>` 를 쓴다 — 이유는 lib/cases/logo.ts 주석(외부 호스트가 브랜드마다 달라
 *    next.config images 화이트리스트를 유지할 수 없다).
 * ⚠️ 듀오톤 배경 위에 이니셜을 깔아 두고 그 위에 이미지를 얹는다. Brandfetch 404 → Google
 *    파비콘 → 그것도 실패면 이미지를 치워 이니셜이 보인다(LogoImg 의 onError).
 */
export function BrandLogo({ study, bottleneck, size = 56 }: {
  study: LogoInput
  bottleneck?: string | null
  size?: number
}) {
  const logo = logoFor(study, bottleneck)
  const pad = Math.round(size * 0.18)
  return (
    <span
      aria-hidden={logo.kind === 'initial' ? undefined : true}
      title={logo.kind === 'favicon' ? `${logo.domain} 로고` : undefined}
      style={{
        position: 'relative',
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        // 듀오톤 — 병목별 색(lib/cases/logo.ts duotoneHue). 사진이 없으니 오버레이만 쓴다(§4).
        background: `linear-gradient(135deg, hsl(${logo.hue} 62% 46%), hsl(${(logo.hue + 28) % 360} 68% 34%))`,
        color: '#fff',
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}
    >
      {logo.initial}
      {logo.kind === 'initial' ? null : (
        <LogoImg
          src={logo.src}
          fallbackSrc={logo.kind === 'favicon' ? logo.fallbackSrc : undefined}
          width={size - pad * 2}
          height={size - pad * 2}
          style={{
            position: 'absolute',
            inset: pad,
            width: size - pad * 2,
            height: size - pad * 2,
            objectFit: 'contain',
          }}
        />
      )}
    </span>
  )
}

/** 상표 고지 한 줄. 썸네일을 쓰는 화면은 이걸 같이 내보낸다. */
export function BrandLogoNotice() {
  return (
    <p style={{ margin: 0, fontSize: 'var(--fs-2xs)', lineHeight: 1.5, color: 'var(--text-muted)' }}>
      {LOGO_NOTICE}
    </p>
  )
}
