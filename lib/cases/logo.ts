// 브랜드 썸네일 한 벌 — 상세 히어로와 카드가 같은 판정을 쓴다. 순수 함수만.
//
// 3단계, 순서가 곧 신뢰도다 (남헌 2026-09-23 Q4 승인: 외부 API 기본 + logo_url 폴백):
//   1) logo_url     — 사람이 확정한 이미지. 있으면 무조건 이것.
//   2) brand_domain — Brandfetch Logo CDN(NEXT_PUBLIC_BRANDFETCH_CLIENT_ID 필요, 남헌 2026-09-24).
//                     fallback/404 로 불러서 모르는 브랜드면 404 → 화면이 Google 파비콘으로
//                     한 번 갈아탄다(fallbackSrc). 클라이언트 ID 가 없으면 처음부터 Google 파비콘.
//                     도메인이 틀리면 남의 로고가 붙으므로 추측하지 않는다 — DB 에 적힌 값만 쓴다.
//   3) 둘 다 없음   — 브랜드 이니셜 듀오톤. "로고를 못 불러왔다"가 아니라 "없다"다.
//
// ⚠️ `<img>` 로 그린다. next/image 는 외부 호스트를 next.config 의 images.remotePatterns 에
//    등록해야 하는데, 여기 오는 호스트는 브랜드마다 다르다 — 화이트리스트를 유지할 수 없고,
//    빠진 호스트는 런타임 에러가 된다. 썸네일 하나에 그 비용을 지지 않는다.
//    ESLint 의 no-img-element 는 사용처에서 한 줄 주석으로 끈다.
//
// ⚠️ Brandfetch 약관: attribution 요구 없음, 대신 CDN 직접 임베드(핫링크) 필수·이미지 캐싱/재호스팅 금지
//    (docs.brandfetch.com/logo-api, 2026-09-24 확인). 그래서 src 를 내려받지 않고 <img> 에 그대로 건다.
//
// ⚠️ 상표: 로고는 각 브랜드 소유다. 고지 문구가 이 파일에 함께 있는 이유 — 썸네일을 쓰는
//    화면이 고지를 빼먹지 않게 같은 모듈에서 가져가게 한다.

export const LOGO_NOTICE = '각 브랜드 로고·상표는 해당 기업의 소유입니다.'

/** 파비콘 API. 키·계정이 필요 없고 도메인 하나로 끝난다. Brandfetch 가 없거나 404 일 때의 폴백. */
const FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons'
/** Brandfetch Logo CDN. 경로 순서는 문서 그대로: identifier/w/h/fallback. type 기본값은 icon. */
const BRANDFETCH_ENDPOINT = 'https://cdn.brandfetch.io/domain'
export const LOGO_SIZE = 128

const faviconSrc = (domain: string) =>
  `${FAVICON_ENDPOINT}?domain=${encodeURIComponent(domain)}&sz=${LOGO_SIZE}`

export type LogoInput = {
  brand_name?: string | null
  /** 마이그 20260930000001 미적용이면 `undefined` 로 온다 — 미기재와 구분해 다루지 않는다(둘 다 이니셜). */
  logo_url?: string | null
  brand_domain?: string | null
}

export type LogoVerdict =
  /** 사람이 확정한 이미지. */
  | { kind: 'url'; src: string; initial: string; hue: number }
  /**
   * 도메인으로 외부 API 에서 가져온 로고. 틀릴 수 있으므로 화면이 그 사실을 알 수 있게 kind 를 가른다.
   * provider 'brandfetch' 면 fallbackSrc(Google 파비콘)가 붙는다 — 404 면 화면이 그걸로 갈아탄다.
   */
  | { kind: 'favicon'; provider: 'brandfetch' | 'google'; src: string; fallbackSrc?: string; domain: string; initial: string; hue: number }
  /** 로고 없음. 이니셜 듀오톤을 그린다. */
  | { kind: 'initial'; initial: string; hue: number }

/** 도메인 정리 — 스킴·www·경로·포트를 떼고 소문자. 도메인 꼴이 아니면 null(짐작하지 않는다). */
export function normalizeDomain(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  const host = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].split(':')[0].replace(/^www\./, '')
  // 점 하나는 있어야 도메인이다. "acme" 같은 값으로 파비콘을 부르면 엉뚱한 이미지가 온다.
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host) ? host : null
}

/** http(s) 절대주소 또는 사이트 내부 경로만 통과. javascript: 같은 스킴을 화면에 그대로 넘기지 않는다. */
export function safeImageUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('/') && !s.startsWith('//')) return s
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : null
}

/** 이니셜 1자. 한글·영문 첫 글자를 그대로 쓴다. 빈 브랜드명은 '?' — 빈 칸을 그리지 않는다. */
export function brandInitial(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (!s) return '?'
  return [...s][0].toUpperCase()
}

/**
 * 듀오톤 색상(HSL hue). 병목이 있으면 병목별 고정색, 없으면 브랜드명 해시.
 * 병목별로 두는 이유: 카드 그리드에서 같은 병목이 같은 색으로 묶여 보인다(§4 Atria 방식).
 */
const BOTTLENECK_HUE: Record<string, number> = {
  AWARENESS: 265, TRUST: 210, CONVERSION: 330, RETENTION: 160,
  UNIT_ECONOMICS: 25, DISTRIBUTION: 195, SUPPLY: 45,
}

export function duotoneHue(bottleneck: string | null | undefined, brandName: string | null | undefined): number {
  const b = (bottleneck ?? '').trim().toUpperCase()
  if (BOTTLENECK_HUE[b] != null) return BOTTLENECK_HUE[b]
  let h = 0
  for (const ch of (brandName ?? '')) h = (h * 31 + ch.codePointAt(0)!) % 360
  return h
}

/** 썸네일 판정. 이 함수 밖에서 폴백 순서를 다시 쓰지 않는다. */
export function logoFor(
  study: LogoInput,
  bottleneck?: string | null,
  // NEXT_PUBLIC_ 는 문자 그대로 적어야 빌드 때 인라인된다. 셀프테스트는 세 번째 인자로 넣는다.
  brandfetchClientId: string | undefined = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID,
): LogoVerdict {
  const initial = brandInitial(study.brand_name)
  const hue = duotoneHue(bottleneck, study.brand_name)

  const url = safeImageUrl(study.logo_url)
  if (url) return { kind: 'url', src: url, initial, hue }

  const domain = normalizeDomain(study.brand_domain)
  if (domain) {
    const clientId = brandfetchClientId?.trim()
    if (clientId) {
      return {
        kind: 'favicon',
        provider: 'brandfetch',
        src: `${BRANDFETCH_ENDPOINT}/${encodeURIComponent(domain)}/w/${LOGO_SIZE}/h/${LOGO_SIZE}/fallback/404?c=${encodeURIComponent(clientId)}`,
        fallbackSrc: faviconSrc(domain),
        domain,
        initial,
        hue,
      }
    }
    return { kind: 'favicon', provider: 'google', src: faviconSrc(domain), domain, initial, hue }
  }
  return { kind: 'initial', initial, hue }
}
