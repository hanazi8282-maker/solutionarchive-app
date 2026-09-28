import { logoFor, LOGO_NOTICE, type LogoInput } from '@/lib/cases/logo'
import { LogoImg } from '../../_ds/components/LogoImg'

/**
 * 브랜드 썸네일 — 카드와 상세 히어로가 같은 것을 쓴다(둘이 갈라지면 같은 케이스가
 * 카드에서는 로고, 상세에서는 이니셜로 보인다).
 *
 * 판정(무엇을 그릴지)은 `lib/cases/logo.ts` 한 벌이고 여기는 그리기만 한다.
 * 모양 정본: reports/2026-09-27/library-thumbnail-spec.md §3 — **띠(band) + 흰 플레이트 두 층**.
 * 플레이트는 항상 있고 내용만 바뀐다(아이콘 / 이니셜). 사진(`/case-art/`)은 띠 배경이 될 뿐이다.
 *   cover  → 띠(팔레트 그라디언트, 사진이면 사진+틴트) 위 중앙에 플레이트
 *   md·lg  → 띠 없이 플레이트만(카드의 플레이트를 확대한 같은 물체, §3.4)
 *
 * ⚠️ 인라인 스타일 없음 — 띠 색은 팔레트 칸 `.pub-logo--s0…s5` 클래스로 정한다(6색 고정).
 * ⚠️ `<img>` 를 쓴다 — 이유는 lib/cases/logo.ts 주석(외부 호스트가 브랜드마다 달라
 *    next.config images 화이트리스트를 유지할 수 없다).
 * ⚠️ 플레이트 안에 이니셜을 깔고 그 위에 로고를 얹는다. Brandfetch 404 → Google 파비콘 →
 *    그것도 실패면 이미지를 치워 이니셜이 보인다(LogoImg 의 onError — 유일한 클라이언트 경계).
 *    사진이 404 면 사진만 빠지고 그라디언트 띠가 남는다.
 * ⚠️ filter·틴트는 자체 호스팅 사진에만 건다(pub.css). Brandfetch 아이콘은 변형하지 않는다(약관).
 */
const SIZE_CLASS = { md: '', lg: 'pub-logo--lg', cover: 'pub-logo--cover' } as const

export function PubBrandLogo({ study, size = 'md' }: {
  /** `slug` 가 띠 색 키다 — 카드·상세 모두 케이스 행을 그대로 넘기면 된다. */
  study: LogoInput
  /**
   * md 56px(인라인) · lg 72px(상세 히어로) · **cover**(카드 상단 16:9 띠).
   * 세 자리뿐이라 px 를 받지 않는다 — 모양은 `.pub-logo*` 가 정한다.
   */
  size?: keyof typeof SIZE_CLASS
}) {
  const logo = logoFor(study)
  const cover = size === 'cover'
  const icon = logo.kind === 'url' || logo.kind === 'favicon'
    ? <LogoImg src={logo.src} fallbackSrc={logo.kind === 'favicon' ? logo.fallbackSrc : undefined} />
    : null
  const cls = ['pub-logo', SIZE_CLASS[size], `pub-logo--s${logo.slot}`, cover && logo.kind === 'photo' ? 'pub-logo--photo' : '']
    .filter(Boolean).join(' ')

  return (
    <span
      className={cls}
      aria-hidden={logo.kind === 'initial' ? undefined : true}
      title={logo.kind === 'favicon' ? `${logo.domain} 로고` : undefined}
    >
      {cover ? (
        <>
          {logo.kind === 'photo' ? <LogoImg src={logo.src} /> : null}
          <span className="pub-logo-plate">{logo.initial}{icon}</span>
        </>
      ) : (
        <>{logo.initial}{icon}</>
      )}
    </span>
  )
}

/** 상표 고지 한 줄. 썸네일을 쓰는 화면은 이걸 같이 내보낸다(문구 정본은 lib/cases/logo.ts). */
export function PubBrandLogoNotice() {
  return <p className="pub-caption">{LOGO_NOTICE}</p>
}
