// Hacker News 댓글 어댑터 — Algolia 가 공식 제공하는 HN Search API.
//
// 실측 근거: docs/review-source-findings.md "Hacker News (Algolia) 실측"
//
// ⚠️ 이 소스가 **SaaS·디지털 경쟁사의 페인포인트 통로**다. 다나와는 물리
//    제품만, App Store 는 앱 사용자만 담는다. "Show HN" 스레드와 그 댓글은
//    개발자·창업자가 경쟁 도구를 왜 버렸는지 직접 말하는 자리다.
//
// 키도, 인증도, 우회도 필요 없다. `hn.algolia.com/robots.txt` 는 404 다
// (실측 2026-09-10). RFC 9309 §2.3.1.3 에 따라 4xx = 규칙 없음 = 허용이고,
// 러너의 RobotsCache 도 같게 판정한다(runner.ts — 404 등 4xx = 허용).
// **읽지 못한 것(5xx·네트워크 오류)과는 다른 사건이다**(CLAUDE.md §7.1).
//
// ⚠️ **1단계만 쓴다.** Algolia 응답의 `comment_text` 가 이미 본문 전체를
//    주므로 Firebase 상세조회(`hacker-news.firebaseio.com`)를 붙이지 않는다.
//    붙이면 댓글 1건당 요청 1건이 되어 일일 상한이 순식간에 마른다.
//
// ⚠️ 엔드포인트는 `search` 가 아니라 **`search_by_date`** 다. 러너의 증분
//    종료(연속 STALE 5건)가 **시간 역순 정렬을 전제**한다. 관련도순인
//    `search` 를 쓰면 오래된 댓글이 앞에 섞여 나와 첫 페이지에서 조기
//    종료하거나, 반대로 끝없이 훑는다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'

/** 한 페이지에 받을 댓글 수. Algolia 기본 상한은 1000 이지만 크게 받을 이유가 없다. */
export const HITS_PER_PAGE = 50

/**
 * Algolia 공개 인덱스의 페이지네이션 상한(`paginationLimitedTo=1000`).
 *
 * ⚠️ 이 값을 넘겨 요청하면 400 이 온다. 애플 RSS 의 11페이지 사건과 **같은
 *    형태**다(appstore.ts MAX_PAGE 주석) — 정상적인 경계인데 어댑터가 안
 *    멈추면 러너가 그 타깃을 `failed` 로 찍는다. 고장이 아닌 것을 고장으로
 *    기록하지 않으려고 우리가 먼저 멈춘다(CLAUDE.md §7.2).
 */
export const PAGINATION_LIMIT = 1000

/** 요청할 수 있는 마지막 페이지의 다음 번호. hitsPerPage=50 이면 20. */
export const MAX_PAGE = Math.floor(PAGINATION_LIMIT / HITS_PER_PAGE)

/**
 * 타깃의 `product_ref` 형식: `q:<키워드>`.
 *
 * ⚠️ 다나와 pcode·앱스토어 앱ID 와 성격이 다르다. **질의 자체가 대상**이고
 *    한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. 그래서 "키워드로
 *    검색해 후보 중 하나를 고르는" 단계가 아예 없다 — 사람이 정한 질의를
 *    그대로 쓴다(review_targets.product_ref 주석).
 */
export function parseProductRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!raw.toLowerCase().startsWith('q:')) return null

  const keyword = raw.slice(2).trim()
  return keyword.length > 0 ? keyword : null
}

/**
 * 커서 → 요청할 페이지 번호. Algolia 는 **0부터** 센다(애플 RSS 는 1부터다).
 *
 * 커서에는 "다음에 읽을 페이지"가 들어 있다. 첫 실행(null)은 0페이지다.
 */
function pageOf(cursor: string | null): number {
  if (!cursor) return 0
  const n = Number(cursor)
  return Number.isInteger(n) && n >= 0 ? n : 0
}

/** 코드포인트가 범위를 벗어나면 String.fromCodePoint 가 던진다. 버린다. */
function codePoint(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

/**
 * HN 댓글 본문의 HTML 을 평문으로.
 *
 * HN 은 본문을 HTML 조각으로 준다: `<p>` 로 문단을 나누고, 링크는 `<a>` 로
 * 감싸고, 따옴표·슬래시는 `&#x27;` `&#x2F;` 같은 수치 엔티티로 보낸다.
 * 그대로 두면 분석 단계가 태그를 본문으로 읽는다.
 *
 * ⚠️ **태그를 먼저 지우고 엔티티를 나중에 푼다.** 순서를 바꾸면 사람이
 *    실제로 쓴 `&lt;div&gt;` 가 `<div>` 로 풀린 뒤 태그로 오인돼 삭제된다.
 *    코드 이야기가 오가는 게시판이라 실제로 흔한 입력이다.
 *
 * ⚠️ `&amp;` 는 **맨 마지막**에 푼다. 먼저 풀면 `&amp;lt;` 가 `&lt;` 를 거쳐
 *    `<` 까지 이중 해제된다.
 *
 * 새 의존성을 넣지 않는다 — 이 정도는 정규식으로 충분하고, 파서는 순수
 * 함수여야 픽스처로 테스트할 수 있다.
 */
export function htmlStrip(html: string): string {
  return html
    // 문단 구분을 먼저 살린다. 안 하면 `끝<p>시작` 이 `끝시작` 으로 붙는다.
    .replace(/<\s*p\s*\/?\s*>/gi, '\n\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Algolia hit 하나를 ParsedReview 로. 못 읽으면 null(= 파싱 실패 1건).
 *
 * 필수는 **본문과 objectID** 다. `comment_text` 가 null/빈 문자열인 hit 을
 * 조용히 버리면 "10건 보이는데 0건 파싱"이 "0건 파싱"과 똑같아 보인다.
 * 그러면 건강도 판정이 구조 변경을 영영 못 본다(CLAUDE.md §7.1).
 */
function toReview(hit: Record<string, unknown>): ParsedReview | null {
  const externalId = str(hit['objectID'])
  const raw = hit['comment_text']
  if (!externalId || typeof raw !== 'string' || raw.trim() === '') return null

  const body = htmlStrip(raw)
  // 태그만 있고 알맹이가 없는 경우도 본문 없음이다.
  if (!body) return null

  // 어느 스레드에서 나온 말인지가 맥락의 절반이다. 제목이 없으면 빈 채로 둔다.
  const title = str(hit['story_title']) ?? str(hit['title']) ?? ''

  const created = str(hit['created_at'])
  const writtenAt = created && /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : null

  return {
    externalId,
    text: `[HN: ${title}] ${body}`,
    // HN 에는 별점이 없다. 없는 축을 0 이나 3 으로 채우면 만족도 계산이 거짓말을 한다.
    rating: null,
    // 판매처 개념도 없다(다나와만 주는 축이다).
    seller: null,
    authorMasked: str(hit['author']),
    writtenAt,
  }
}

export const hackernewsAdapter: ReviewSourceAdapter = {
  key: 'hackernews',
  displayName: 'Hacker News 댓글 (Algolia 검색)',

  nextRequest(target: TargetState): { url: string } | null {
    const keyword = parseProductRef(target.productRef)
    if (!keyword) return null

    const page = pageOf(target.cursor)
    // 상한을 넘기면 Algolia 가 400 을 준다. 그 전에 우리가 멈춘다.
    if (page * HITS_PER_PAGE >= PAGINATION_LIMIT) return null

    return {
      url:
        'https://hn.algolia.com/api/v1/search_by_date' +
        `?query=${encodeURIComponent(keyword)}` +
        '&tags=comment' +
        `&hitsPerPage=${HITS_PER_PAGE}` +
        `&page=${page}`,
    }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const page = pageOf(ctx.cursor)

    let doc: unknown
    try {
      doc = JSON.parse(body)
    } catch {
      // JSON 이 아니면 구조가 바뀐 것이다(에러 HTML 페이지 등). 0건 파싱이
      // 아니라 **실패 1건**으로 센다 — 둘을 합치면 건강도가 구조 변경을 못 본다.
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const hits = (doc as { hits?: unknown })?.hits
    if (!Array.isArray(hits)) {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    // 결과가 0건인 것은 정상 종료다. 질의에 안 걸렸을 뿐 구조는 멀쩡하다.
    if (hits.length === 0) {
      return { reviews: [], nextCursor: null, parseFailures: 0 }
    }

    const reviews: ParsedReview[] = []
    let parseFailures = 0

    for (const hit of hits) {
      if (!hit || typeof hit !== 'object') {
        parseFailures++
        continue
      }
      const r = toReview(hit as Record<string, unknown>)
      if (r) reviews.push(r)
      else parseFailures++
    }

    // ⚠️ 커서는 **다음에 읽을 페이지**다. `ctx.cursor` 를 그대로 돌려주면
    //    nextRequest 가 같은 페이지를 영원히 다시 요청한다. 다나와에서 실제로
    //    난 사고이고, 증분 종료와 페이지 상한이 폭주를 막아준 탓에 로그에는
    //    "정상 종료"로 찍혀 오래 안 보였다(CLAUDE.md §7.2).
    const next = page + 1

    // 마지막 페이지를 지나서 요청하지 않는다. nbPages 는 Algolia 가 이미
    // 상한(paginationLimitedTo)을 반영해 계산해 준 값이다.
    const nbPages = Number((doc as { nbPages?: unknown })?.nbPages)
    const beyondLastPage = Number.isFinite(nbPages) && next >= nbPages
    const beyondApiLimit = next * HITS_PER_PAGE >= PAGINATION_LIMIT

    return {
      reviews,
      nextCursor: beyondLastPage || beyondApiLimit ? null : String(next),
      parseFailures,
    }
  },

  // Algolia 공개 인덱스는 쿼터를 403 으로 알리지 않는다(과하면 429 다).
  // quotaMarkers 를 선언하지 않으면 모든 403/429 를 차단으로 본다 —
  // 안전한 쪽 기본값이다.
}

/** 셀프테스트 전용. 프로덕션 코드에서 쓰지 않는다. */
export const __internal = { pageOf, toReview, codePoint }
