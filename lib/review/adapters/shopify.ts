// Shopify 앱스토어 리뷰 어댑터 — `apps.shopify.com/<앱>/reviews` 서버 렌더 HTML.
//
// ⛔ 약관 금지를 알고 남헌이 켠 소스다(owner override, 2026-10-08). 근거·문구: reports/2026-10-08/five-arm-sources-notes.md,
//    reports/2026-10-08/five-b-terms-check.md (B), docs/review-collection-design.md §1.3.
//   약관: Shopify Terms of Service(2026-08-01) 1조 9항 "You agree not to access the Services or monitor any material or information
//     from the Services using any robot, spider, scraper, or other automated means." · 1조 7항(무단 복제·이용 금지)
//     → review_sources.tos_status='prohibited' · override='owner_2026-10-08' · quote_policy='none' · quote_allowed=false.
//   robots(2026-10-08 실측): apps.shopify.com/robots.txt `*` Disallow = /internal/ · /services/ · `*q=*` · `/*?*shpxid=*` · `/*?*auth=*`.
//     `/<앱>/reviews?sort_by=newest&page=N` 는 허용 → robots_status='allowed'. 러너가 매 실행 다시 판정하고, 금지·확인 불가면 0요청이다.
//     ⚠️ 러너 OWNER_ROBOTS_OVERRIDES(robots 금지 예외)에 이 소스의 override 값을 **넣지 않는다** — robots 가 금지로 바뀌면 멈춰야 한다.
//     ⚠️ 러너 robots 판정은 pathname 만 본다(SP-026). 그래서 쿼리 금지 규칙(`*q=*`·`shpxid=`·`auth=`)은 이 어댑터가 직접 지킨다:
//        URL 은 이 파일이 조립한 `?sort_by=newest&page=<정수>` 하나뿐이고, isAllowedReviewUrl 이 다시 검사해 어긋나면 null(0요청).
//
// 중단 조건(우회 없음 — UA 러너 고정, 쿠키·프록시·헤더 위장·캡차 풀이 없음):
//   403·429 → 러너 차단(quotaMarkers 미선언). 2xx 빈 응답·캡차 → abortOnChallenge(runner isStrictBlock). 실행 전체가 멈춘다.
//   리뷰 페이지 표지(<title>Reviews:)가 없는 200(로그인 벽·다른 화면) → parseFailures 1 + 그 타깃 종료 → 누적되면 러너 파싱 브레이크.
//
// 블록 구조(2026-10-08 loox ?page=2 실측 1회, 리뷰 10개 · rel="next" 있음 · 캡차 표지 0):
//   <div data-merchant-review="" data-review-content-id="2316238"> … aria-label="5 out of 5 stars" … <div> August 9, 2026 </div>
//     <div data-truncate-content-copy><p>본문</p></div> … <span title="상점명">(저장 안 함) … <div>국가</div>(저장 안 함)
//     <div data-merchant-review-reply> 개발사 답글 </div>  ← 리뷰가 아니다, 본문에서 뺀다.
//   다음 페이지: `rel="next"` 링크. href 는 쓰지 않고 페이지 번호를 우리가 조립한다(SSRF 경계, types.ts 규약 4).
// ⚠️ 실측하지 않은 것: `sort_by=newest` 가 실제로 최신순인지(정렬이 아니면 증분 종료가 늦어질 뿐, 중복은 지문이 막는다),
//    리뷰별 고유 주소(`/reviews/<id>` 공유 링크) — 그래서 sourceUrl 은 비운다.

import type { ParseContext, ParseResult, ParsedReview, ReviewRequest, ReviewSourceAdapter, TargetState } from '../types.ts'

export const HOST = 'https://apps.shopify.com'
/** 앱 slug — 소문자·숫자·하이픈. 경로에 그대로 들어가므로 이것만 받는다(점·슬래시·쿼리 불가). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/
/** 페이지 상한 — 폭주 방지. 첫 수집도 실행당 maxPagesPerRun(2) 이라 여기까지 가려면 여러 날이 걸린다. */
export const MAX_PAGE = 50

/** product_ref = `app:<slug>`. 아니면 null. */
export function parseProductRef(productRef: string): string | null {
  const m = /^app:(.+)$/.exec((productRef ?? '').trim())
  return m && SLUG_RE.test(m[1]) ? m[1] : null
}

export const reviewsUrl = (slug: string, page: number) => `${HOST}/${slug}/reviews?sort_by=newest&page=${page}`

/**
 * robots 쿼리 규칙을 어댑터가 지킨다(러너는 pathname 만 본다). 허용 = 우리 호스트 · `/<slug>/reviews` · 쿼리 키가 정확히 sort_by·page.
 * `q=`·`shpxid=`·`auth=` 가 어디든 섞이면 false.
 */
export function isAllowedReviewUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.origin !== HOST || !/^\/[a-z0-9][a-z0-9-]{0,99}\/reviews$/.test(u.pathname)) return false
  // 부분일치로 막는다(`*q=*` 는 키 이름 끝이 q 인 것까지 막는 규칙이다).
  if (/q=|shpxid=|auth=/i.test(u.search)) return false
  const keys = [...u.searchParams.keys()].sort().join(',')
  return keys === 'page,sort_by' && u.searchParams.get('sort_by') === 'newest' && /^\d{1,3}$/.test(u.searchParams.get('page') ?? '')
}

/** 커서 = 방금 읽은 페이지 번호. null 이면 1쪽. */
function pageOf(cursor: string | null): number {
  const n = Number(cursor)
  return cursor && Number.isInteger(n) && n >= 1 ? n + 1 : 1
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…' }
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}
const strip = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** "August 9, 2026" → "2026-08-09". 못 읽으면 null(추정하지 않는다). */
export function parseShopifyDate(s: string): string | null {
  const m = /\b([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b/.exec(s)
  if (!m) return null
  const mo = MONTHS.indexOf(m[1].toLowerCase())
  const d = Number(m[2])
  if (mo < 0 || d < 1 || d > 31) return null
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 리뷰 블록 1개. 필수 = 리뷰 id 와 본문. 개발사 답글(data-merchant-review-reply) 이후는 보지 않는다. */
function toReview(block: string): ParsedReview | null {
  const id = /data-review-content-id="(\d{1,15})"/.exec(block)?.[1]
  const own = block.split('data-merchant-review-reply')[0]
  const copy = /data-truncate-content-copy[^>]*>([\s\S]*?)<\/div>/.exec(own)?.[1]
  const text = copy ? strip(copy) : ''
  if (!id || !text) return null
  const stars = /aria-label="(\d) out of 5 stars"/.exec(own)?.[1]
  // 날짜는 별점 줄 바로 뒤 div 의 "Month D, YYYY". 본문 안의 날짜를 잡지 않게 본문 앞 구간에서만 찾는다.
  const head = own.split('data-truncate-content-copy')[0]
  return {
    externalId: id,
    text,
    rating: stars ? Number(stars) : null,
    seller: null,
    // 작성자(상점명)·국가는 싣지 않는다 — googleplay·kakao·wordpress 와 같은 정책.
    authorMasked: null,
    writtenAt: parseShopifyDate(strip(head.replace(/<svg[\s\S]*?<\/svg>/gi, ''))),
    sourceUrl: null,
    lang: null,
  }
}

const FAIL: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }

export const shopifyAdapter: ReviewSourceAdapter = {
  key: 'shopify_apps',
  displayName: 'Shopify 앱스토어 리뷰',

  /** true — data-review-content-id 의 전역 유일성을 실측하지 않았다. 한 리뷰는 한 앱에만 달려 좁혀도 잃는 것이 없다(appstore 와 같은 판단). */
  productScopedExternalId: true,
  /** 약관 금지 소스 — 2xx 빈 응답·캡차도 차단으로 보고 즉시 멈춘다(우회 없음, runner isStrictBlock). */
  abortOnChallenge: true,
  /**
   * 캡차 판정 = 리뷰 페이지 표지(<title>Reviews:) **없이** 사람 확인 표지(captcha·challenge·Cloudflare)가 보인다.
   * 리뷰 본문의 "captcha" 낱말(리뷰 앱 후기에 흔하다)로 정상 페이지를 차단 처리하지 않게(types.ts isChallenge).
   * 표지 없는 다른 200 화면은 parse 가 실패로 센다(그 타깃만 끝).
   */
  isChallenge: (body: string) =>
    !/<title>\s*Reviews:/i.test(body ?? '') && /captcha|cf-chl|challenge-platform|unusual traffic|are you a robot/i.test(body ?? ''),
  /** 앱 리뷰는 계속 붙는다 — 끝까지 읽어도 닫지 않고 매 실행 최신부터(googleplay 와 같은 형태). */
  incrementalOnly: true,
  /** 타깃당 실행 1회 2페이지(20건). 요청 간격 8초(review_sources.min_interval_ms)와 함께 낮게 시작한다. */
  maxPagesPerRun: 2,

  nextRequest(target: TargetState): ReviewRequest | null {
    const slug = parseProductRef(target.productRef)
    if (!slug) return null
    const page = pageOf(target.cursor)
    if (page > MAX_PAGE) return null
    const url = reviewsUrl(slug, page)
    // 조립 결과를 robots 쿼리 규칙으로 한 번 더 본다 — 어긋나면 요청하지 않는다.
    return isAllowedReviewUrl(url) ? { url } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    if (!parseProductRef(ctx.productRef)) return FAIL
    const html = body ?? ''
    // 리뷰 페이지 표지가 없으면(로그인 벽·오류 화면·다른 페이지) 0건이 아니라 못 읽음이다(§7.1 사례 2).
    if (!/<title>\s*Reviews:/i.test(html)) return FAIL
    const blocks = html.split(/data-merchant-review=""/).slice(1)
    const reviews: ParsedReview[] = []
    let parseFailures = 0
    for (const b of blocks) {
      const r = toReview(b)
      if (r) reviews.push(r)
      else parseFailures++
    }
    const page = pageOf(ctx.cursor)
    let nextCursor: string | null = /rel="next"/.test(html) && blocks.length > 0 && page < MAX_PAGE ? String(page) : null
    // 이미 본 구간에 닿았으면 더 내려가지 않는다(최신순 전제 — 다음 실행은 1쪽부터, incrementalOnly).
    if (ctx.lastReviewAt && reviews.some((r) => r.writtenAt != null && r.writtenAt < ctx.lastReviewAt!)) nextCursor = null
    return { reviews, nextCursor, parseFailures }
  },
}
