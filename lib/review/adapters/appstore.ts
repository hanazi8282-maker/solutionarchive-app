// App Store 고객 리뷰 어댑터 — 애플이 공식 제공하는 RSS.
//
// 실측 근거: docs/review-source-findings.md "2차 소스 실측"
//
// ⚠️ 이 소스가 SaaS 확장의 본체다. 다나와는 물리 제품만 담고, SaaS·앱은
//    한 건도 없다(§1.1). Slack·Notion·Figma·토스는 전부 여기 있다.
//
// 키도, 인증도, 우회도 필요 없다. `itunes.apple.com/robots.txt` 는 이 경로를
// 막지 않는다(실측: 일치하는 규칙 없음).
//
// 다나와에 없는 축이 하나 더 온다 — **앱 버전**(`im:version`).
// "어느 버전부터 불만이 늘었나"를 볼 수 있다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'

/**
 * 애플이 강제하는 페이지 상한.
 *
 * ⚠️ **11페이지부터 HTTP 400 이다**(실측 2026-09-02). 러너의
 *    `MAX_PAGES_PER_TARGET`(20)보다 낮으므로, 어댑터가 스스로 멈추지 않으면
 *    400 을 받고 러너가 그 타깃을 `failed` 로 찍는다. 정상적인 경계를
 *    고장으로 기록하는 형태다(CLAUDE.md §7.2).
 */
export const MAX_PAGE = 10

/** 페이지당 리뷰 수는 애플이 정한다(실측 35건 = 그 앱의 전량). 상수로 쓰지 않는다. */

/**
 * 타깃의 `product_ref` 형식: `<국가코드>:<앱ID>` 또는 `<앱ID>`.
 *
 * 국가를 붙이는 이유는 **같은 앱이라도 스토어 국가마다 리뷰가 다르기**
 * 때문이다. 한국 사용자 목소리를 보려면 `kr` 이어야 하고, 글로벌 반응을
 * 보려면 `us` 다. 국가를 생략하면 `kr` 로 본다 — 이 프로젝트의 기본 시장이다.
 */
export function parseProductRef(productRef: string): { country: string; appId: string } | null {
  const raw = (productRef ?? '').trim()
  if (!raw) return null

  const idx = raw.indexOf(':')
  const country = idx >= 0 ? raw.slice(0, idx).trim().toLowerCase() : 'kr'
  const appId = idx >= 0 ? raw.slice(idx + 1).trim() : raw

  // 앱 ID 는 숫자다. 아니면 URL 을 잘못 넣은 것이므로 조용히 넘기지 않는다.
  if (!/^\d+$/.test(appId)) return null
  if (!/^[a-z]{2}$/.test(country)) return null

  return { country, appId }
}

/** 첫 페이지는 1이다(0 이 아니다). 커서는 "방금 읽은 페이지 번호"를 담는다. */
function nextPage(cursor: string | null): number {
  if (!cursor) return 1
  const n = Number(cursor)
  return Number.isFinite(n) && n >= 1 ? n + 1 : 1
}

/** 값이 `{label: "..."}` 형태로 감싸여 온다. 없으면 null. */
function label(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null
  const v = (node as { label?: unknown }).label
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * RSS 엔트리 하나를 ParsedReview 로.
 *
 * 필수는 **본문과 리뷰 ID** 다. 둘 중 하나라도 없으면 파싱 실패로 센다 —
 * 제목만 읽고 "정상 수집"으로 보고하던 다나와 파서의 첫 버그와 같은 형태를
 * 만들지 않기 위해서다(§7.1 사례 1번).
 */
function toReview(entry: Record<string, unknown>): ParsedReview | null {
  const externalId = label(entry['id'])
  const text = label(entry['content'])
  if (!externalId || !text) return null

  const ratingRaw = label(entry['im:rating'])
  const rating = ratingRaw !== null && /^\d+$/.test(ratingRaw) ? Number(ratingRaw) : null

  const updated = label(entry['updated'])
  // `2026-08-28T07:30:34-07:00` → `2026-08-28`. 다나와도 날짜만 담는다.
  const writtenAt = updated && /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : null

  const author = entry['author']
  const authorName =
    author && typeof author === 'object' ? label((author as Record<string, unknown>)['name']) : null

  const title = label(entry['title'])
  const version = label(entry['im:version'])

  return {
    externalId,
    // 제목과 앱 버전을 본문에 붙인다. 제목에 결론이 들어가는 경우가 많고,
    // 버전은 "언제부터 나빠졌나"를 분석 단계가 읽을 수 있어야 한다.
    text: [title ? `[${title}]` : null, version ? `(v${version})` : null, text]
      .filter(Boolean)
      .join(' '),
    rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
    // 애플 RSS 에는 판매처 개념이 없다. 다나와가 몰별 비교 축을 주는 것과 다르다.
    seller: null,
    authorMasked: authorName,
    writtenAt,
  }
}

export const appstoreAdapter: ReviewSourceAdapter = {
  key: 'appstore',
  displayName: 'App Store 고객 리뷰',

  nextRequest(target: TargetState): { url: string } | null {
    const ref = parseProductRef(target.productRef)
    if (!ref) return null

    const page = nextPage(target.cursor)
    // 애플이 11페이지부터 400 을 준다. 그 전에 우리가 멈춘다.
    if (page > MAX_PAGE) return null

    return {
      url:
        `https://itunes.apple.com/${ref.country}/rss/customerreviews` +
        `/id=${ref.appId}/sortBy=mostRecent/page=${page}/json`,
    }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const page = nextPage(ctx.cursor)

    let doc: unknown
    try {
      doc = JSON.parse(body)
    } catch {
      // JSON 이 아니면 구조가 바뀐 것이다. 0건 파싱이 아니라 **실패 1건**으로
      // 센다 — 둘을 합치면 건강도 판정이 구조 변경을 못 본다.
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const feed = (doc as { feed?: Record<string, unknown> })?.feed
    if (!feed || typeof feed !== 'object') {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    // ⚠️ 종료 신호는 `feed.entry` 의 부재다(실측: 마지막 페이지 다음은
    //    HTTP 200 인데 entry 키가 아예 없다). `link[rel=last]` 는 쓰지 않는다 —
    //    실측에서 entry 가 35건 있는 1페이지가 자기를 last 라고 하면서
    //    동시에 next 로 2페이지를 가리켰다. 서로 모순이라 믿을 수 없다.
    const raw = feed['entry']
    if (raw === undefined || raw === null) {
      return { reviews: [], nextCursor: null, parseFailures: 0 }
    }

    // 리뷰가 1건이면 배열이 아니라 객체로 올 수 있는 형태다(RSS→JSON 변환의
    // 흔한 성질). 배열로 정규화한다.
    const entries = Array.isArray(raw) ? raw : [raw]
    if (entries.length === 0) {
      return { reviews: [], nextCursor: null, parseFailures: 0 }
    }

    const reviews: ParsedReview[] = []
    let parseFailures = 0

    for (const e of entries) {
      if (!e || typeof e !== 'object') {
        parseFailures++
        continue
      }
      const r = toReview(e as Record<string, unknown>)
      if (r) reviews.push(r)
      else parseFailures++
    }

    // 이번 페이지가 상한이면 더 갈 곳이 없다. 다음 요청에서 400 을 받지 않는다.
    const nextCursor = page >= MAX_PAGE ? null : String(page)

    return { reviews, nextCursor, parseFailures }
  },

  // 애플 RSS 는 쿼터 개념이 없다. 403 이 오면 그건 진짜 차단이다.
  // (quotaMarkers 를 선언하지 않으면 모든 403/429 가 차단으로 판정된다)
}
