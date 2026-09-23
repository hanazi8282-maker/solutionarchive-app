import type { CSSProperties } from 'react'
import { logoFor, LOGO_NOTICE, type LogoInput } from '@/lib/cases/logo'

/**
 * 브랜드 썸네일 — 카드와 상세 히어로가 같은 것을 쓴다(둘이 갈라지면 같은 케이스가
 * 카드에서는 로고, 상세에서는 이니셜로 보인다).
 *
 * 판정(무엇을 그릴지)은 `lib/cases/logo.ts` 한 벌이고 여기는 그리기만 한다 — A2 는
 * 그 판정을 새로 쓰지 않는다(`_ds/BrandLogo` 와 같은 함수를 부르므로 모양만 바뀐다).
 *
 * ⚠️ 인라인 스타일 금지 규칙의 유일한 예외: 듀오톤 hue 두 개를 **CSS 변수로** 내린다.
 *    병목·브랜드명에서 계산되는 데이터값이라 `pub.css` 에 미리 적을 수 없다. 모양(크기·곡률·
 *    그라디언트 방향)은 전부 `.pub-logo` 가 정한다.
 * ⚠️ `<img>` 를 쓴다 — 이유는 lib/cases/logo.ts 주석(외부 호스트가 브랜드마다 달라
 *    next.config images 화이트리스트를 유지할 수 없다).
 * ⚠️ 파비콘이 404 여도 깨진 이미지 아이콘을 보여주지 않는다: 듀오톤 배경 위에 이니셜을
 *    깔고 그 위에 이미지를 얹는다. 이미지가 없으면 이니셜이 그대로 보인다(JS 없이).
 */
export function PubBrandLogo({ study, bottleneck, size = 'md' }: {
  study: LogoInput
  bottleneck?: string | null
  /** md 56px(카드) · lg 72px(상세 히어로). 두 자리뿐이라 px 를 받지 않는다. */
  size?: 'md' | 'lg'
}) {
  const logo = logoFor(study, bottleneck)
  const hues = {
    '--pub-logo-hue': String(logo.hue),
    '--pub-logo-hue-2': String((logo.hue + 28) % 360),
  } as CSSProperties

  return (
    <span
      className={size === 'lg' ? 'pub-logo pub-logo--lg' : 'pub-logo'}
      style={hues}
      aria-hidden={logo.kind === 'initial' ? undefined : true}
      title={logo.kind === 'favicon' ? `${logo.domain} 파비콘` : undefined}
    >
      {logo.initial}
      {logo.kind === 'initial' ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      )}
    </span>
  )
}

/** 상표 고지 한 줄. 썸네일을 쓰는 화면은 이걸 같이 내보낸다(문구 정본은 lib/cases/logo.ts). */
export function PubBrandLogoNotice() {
  return <p className="pub-caption">{LOGO_NOTICE}</p>
}
