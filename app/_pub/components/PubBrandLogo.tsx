import { logoFor, LOGO_NOTICE, type LogoInput } from '@/lib/cases/logo'
import { LogoImg } from '../../_ds/components/LogoImg'

/**
 * 브랜드 플레이트. 판정은 `lib/cases/logo.ts logoFor` 재사용(새로 쓰지 않는다).
 * sm 44(색인 줄) · md 56(기록 머리) · lg 72 · cover(카드 띠, /library/saved 만 남았다).
 * 인라인 스타일 금지의 유일한 예외였던 듀오톤 hue 는 슬롯 클래스(`pub-logo--s0..5`)로 내린다.
 */
const SIZE_CLASS = { sm: 'pub-logo--sm', md: '', lg: 'pub-logo--lg', cover: 'pub-logo--cover' } as const

export function PubBrandLogo({ study, size = 'md' }: {
  study: LogoInput
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

export function PubBrandLogoNotice() {
  return <p className="pub-caption">{LOGO_NOTICE}</p>
}
