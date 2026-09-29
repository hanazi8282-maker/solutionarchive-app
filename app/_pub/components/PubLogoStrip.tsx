import { LOGO_NOTICE, WORDMARK_HEIGHT, wordmarkFor, type LogoInput } from '@/lib/cases/logo'
import { LogoImg } from '../../_ds/components/LogoImg'

/** 띠는 한 줄에 들어갈 만큼만, 듬성듬성하면 안 그린다(B2). */
const MIN = 5
const MAX = 12
/** 표시 상자(px). 워드마크 비율이 브랜드마다 달라 상자를 고정하고 `object-fit: contain` 으로 맞춘다(CLS 0). */
const BOX_W = 96
const BOX_H = WORDMARK_HEIGHT / 2

/**
 * 로고 띠(B2) — 우리가 분석한 브랜드의 워드마크 한 줄.
 * ⚠️ 고객·후원 표시가 아니다. "Trusted by" 류 문구를 쓰지 않고 캡션을 여기 고정한다(상표 오인 방지, 남헌 2026-09-30).
 * ⚠️ Brandfetch 약관: CDN 핫링크만(내려받기·캐싱·재호스팅 금지) — src 를 그대로 `<img>` 에 건다. 판정은 `wordmarkFor`.
 * 워드마크가 없는 브랜드는 404 → `LogoImg` 가 그 이미지를 지운다(파비콘·이니셜 폴백을 섞지 않는다).
 * 5개 미만이면 띠 자체를 그리지 않는다 — 클라이언트 ID·도메인이 없으면 전부 null 이라 자동으로 여기 걸린다.
 */
export function PubLogoStrip({ studies }: { studies: (LogoInput & { approved_at?: string | null })[] }) {
  const items = studies
    .map((s) => ({ name: s.brand_name?.trim() || '', src: wordmarkFor(s), at: s.approved_at ?? '' }))
    .filter((x): x is { name: string; src: string; at: string } => Boolean(x.src && x.name))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX)
  if (items.length < MIN) return null

  return (
    <div className="pub-logostrip">
      <p className="pub-logostrip-label" id="pub-logostrip-label">우리가 분석한 브랜드</p>
      <ul className="pub-logostrip-row" tabIndex={0} translate="no" aria-labelledby="pub-logostrip-label">
        {items.map((x) => (
          <li key={x.src}><LogoImg src={x.src} alt={x.name} width={BOX_W} height={BOX_H} /></li>
        ))}
      </ul>
      <p className="pub-caption">{LOGO_NOTICE}</p>
    </div>
  )
}
