// 앵커 검증 — 임시 등록 후보(회사/앱 이름)가 **공식 앱·도메인**과 이름이 맞는지 확인한다. v70 §4-5 · L-09. 순수 함수만(네트워크는 scripts/anchor-verify.mjs).
//
// 왜: 리뷰 속에서 규칙으로 뽑은 이름은 동음이의어·일반 구·플랫폼일 수 있다(B① 실측: "ask AI"·"the Auburn Affirmation"). 공식 스토어에서
//     이름이 맞는 **단일** 앱이 있고 평가 수가 충분해야 "실제 제품"이라고 본다. 불일치·모호는 자동 등록 금지.
//
// ⚠️ 3상태(§7.1): anchored(맞는 단일 앱) · no_match(조회는 됐고 맞는 앱 없음) · ambiguous(맞는 앱이 서로 다른 판매자로 둘 이상) · lookup_failed(조회 못 함).
//    lookup_failed 는 no_match 가 아니다 — 호출부는 '확인 불가'로 다루고 등록하지 않는다.

export type AppResult = {
  trackId?: number
  trackName?: string
  sellerName?: string
  sellerUrl?: string
  bundleId?: string
  userRatingCount?: number
  primaryGenreName?: string
  trackViewUrl?: string
}

export type AnchorVerdict =
  | { state: 'anchored'; appId: number; trackName: string; sellerName: string | null; domain: string | null; ratingCount: number; reason: string }
  | { state: 'no_match' | 'ambiguous' | 'lookup_failed'; reason: string }

/** 평가 수 하한 — 이보다 적으면 '실제로 쓰이는 제품'이라는 근거가 약하다. */
export const ANCHOR_MIN_RATINGS = 50
/** 이름 뒤에 붙어도 같은 제품으로 보는 꼬리말(정규화 후). 그 밖의 꼬리(예: "AI Photo Editor")는 다른 제품일 수 있어 일치로 안 센다. */
const SUFFIX_OK = new Set(['app', 'ai', 'mobile', 'ios', 'pro', 'lite', 'official'])

export function normName(s: string): string {
  return s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')
}

/** 앱스토어 제목은 "Name - Tagline" · "Name: Tagline" · "Name | Tagline" 꼴이 흔하다. 첫 토막이 제품명이다. */
function headOf(trackName: string): string {
  return trackName.split(/\s[-–—|:]\s|:\s|\s\|\s/)[0] ?? trackName
}

/** 후보 이름이 이 앱 제목과 같은 제품을 가리키는가. */
export function nameMatches(candidate: string, trackName: string): boolean {
  const c = normName(candidate)
  if (c.length < 3) return false
  const full = normName(trackName)
  const head = normName(headOf(trackName))
  if (c === full || c === head) return true
  // 첫 토막 = 후보 + 허용된 꼬리말들(예: "Fera" ↔ "Fera App")
  if (head.startsWith(c)) {
    let rest = head.slice(c.length)
    // 꼬리말을 순서 상관없이 다 벗길 때까지 반복한다("aiapp" → "app" → "").
    for (let again = true; again && rest !== ''; ) {
      again = false
      for (const w of SUFFIX_OK) {
        if (rest.startsWith(w)) {
          rest = rest.slice(w.length)
          again = true
        }
      }
    }
    return rest === ''
  }
  return false
}

export function domainOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * iTunes Search `results` → 판정. `results` 가 배열이 아니면 lookup_failed.
 * 맞는 앱이 여럿이어도 **판매자가 같으면 한 제품**(같은 회사의 iPhone/iPad 앱)이고, 판매자가 다르면 ambiguous.
 */
export function verifyAnchor(candidateName: string, results: unknown, opts: { expectedDomain?: string | null } = {}): AnchorVerdict {
  if (!Array.isArray(results)) return { state: 'lookup_failed', reason: '조회 결과가 배열이 아니다' }
  const apps = (results as AppResult[]).filter((r) => r && typeof r.trackName === 'string' && typeof r.trackId === 'number')
  const hits = apps.filter((a) => nameMatches(candidateName, a.trackName as string))
  if (hits.length === 0) return { state: 'no_match', reason: `이름이 맞는 앱 없음(조회 ${apps.length}건)` }

  const sellers = new Set(hits.map((a) => normName(a.sellerName ?? String(a.trackId))))
  if (sellers.size > 1) return { state: 'ambiguous', reason: `이름이 맞는 앱 ${hits.length}개가 서로 다른 판매자(${[...sellers].slice(0, 3).join(', ')})` }

  const best = [...hits].sort((a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0))[0]
  const ratings = best.userRatingCount ?? 0
  if (ratings < ANCHOR_MIN_RATINGS) return { state: 'no_match', reason: `이름은 맞지만 평가 ${ratings}건 < ${ANCHOR_MIN_RATINGS}(실사용 근거 약함)` }
  // v70 Fable 검수 #4: 후보의 공식 도메인을 알면 판매자 도메인과 맞아야 한다. 이름만 같은 무관한 앱(웹 전용 제품의 동명 앱)에 걸리는 것을 막는다.
  const want = opts.expectedDomain ? domainOf(opts.expectedDomain.includes('://') ? opts.expectedDomain : `https://${opts.expectedDomain}`) : null
  if (want) {
    const got = domainOf(best.sellerUrl)
    const same = got !== null && (got === want || got.endsWith(`.${want}`) || want.endsWith(`.${got}`))
    if (!same) return { state: 'no_match', reason: `이름은 맞지만 판매자 도메인(${got ?? '없음'}) ≠ 후보 도메인(${want}) — 동명 앱 가능성` }
  }
  return {
    state: 'anchored',
    appId: best.trackId as number,
    trackName: best.trackName as string,
    sellerName: best.sellerName ?? null,
    domain: domainOf(best.sellerUrl),
    ratingCount: ratings,
    reason: `앱 ${best.trackId} "${best.trackName}" · 평가 ${ratings}건`,
  }
}
