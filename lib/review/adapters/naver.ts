// 네이버 검색 오픈API 어댑터 — 블로그 / 카페글 / 지식iN.
//
// 실측 근거: docs/review-source-findings.md "3차 소스 실측 (2026-09-16)"
//
// ⚠️ **이 소스가 주는 것은 리뷰 전문이 아니라 검색 스니펫이다.**
//
//    `description` 은 질의어 주변을 잘라 준 요약이고, 전체 글이 아니다.
//    그래서 적재 본문 맨 앞에 `[네이버 … 검색 스니펫 · <link>]` 를 박는다 —
//    "짧은 글"과 "잘린 글"은 다른 사건이고, 분석 단계가 이걸 모르면
//    "고객이 짧게만 말한다"는 엉뚱한 결론이 나온다(CLAUDE.md §7.1).
//
// ⚠️ 인증은 **헤더**다(`X-Naver-Client-Id` / `X-Naver-Client-Secret`).
//    쿼리 파라미터로 보내면 안 된다 — URL 은 로그·robots 판정·에러 메시지에
//    그대로 남는다. 러너가 헤더를 요청에만 싣고 robots.txt 에는 안 싣는다.
//
// ⚠️ `sort=date` 가 **필수**다. 러너의 증분 종료(연속 STALE 5건)가 시간 역순
//    정렬을 전제한다. 기본값인 관련도순(`sim`)으로 두면 오래된 글이 앞에
//    섞여 나와 첫 페이지에서 조기 종료하거나 반대로 끝없이 훑는다.
//    HN 이 `search` 대신 `search_by_date` 를 쓰는 것과 같은 이유다.
//
// ⚠️ `robotsPolicy: 'official-api'` 다. `openapi.naver.com/robots.txt` 는
//    `Disallow: /` 라서 그대로 두면 **정식 키로 약관에 동의하고 쓰는 API 가
//    전건 robots-skip 으로 죽는다.** 예외는 러너가 `robotsExempt` 로 세고
//    수집 보고에 그대로 찍는다(숨기지 않는다).

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { htmlStrip } from '../html.ts'

/** 한 번에 받을 건수. 네이버 검색 API 의 `display` 상한이 100 이다. */
export const DISPLAY = 100

/**
 * `start` 의 상한. 네이버가 정한 값이고, 넘기면 HTTP 400 이다.
 *
 * ⚠️ 애플 RSS 11페이지·Algolia 1000건과 **같은 형태**의 경계다. 어댑터가
 *    스스로 안 멈추면 정상적인 경계에서 받은 400 을 러너가 `failed` 로
 *    찍는다 — 고장이 아닌 것을 고장으로 기록하는 형태다(§7.2).
 *
 * 판정을 `start + DISPLAY > START_LIMIT` 로 두어 **경계 앞에서 멈춘다.**
 * 마지막 100건을 손해 보지만, 400 을 한 번도 안 받는 쪽을 택한다.
 */
export const START_LIMIT = 1000

/** 타깃의 `product_ref` 형식: `q:<검색어>`. HN 과 같다 — 질의 자체가 대상이다. */
export function parseProductRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!raw.toLowerCase().startsWith('q:')) return null
  const keyword = raw.slice(2).trim()
  return keyword.length > 0 ? keyword : null
}

/** 커서 → 이번에 요청할 `start`. 네이버는 **1부터** 센다(0 이 아니다). */
function startOf(cursor: string | null): number {
  if (!cursor) return 1
  const n = Number(cursor)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * 블로그 응답의 `postdate` 는 `20260916` 형식이다. `YYYY-MM-DD` 로 바꾼다.
 *
 * ⚠️ 카페글·지식iN 응답에는 **작성일 필드가 없다.** 없는 것을 오늘 날짜로
 *    채우면 증분 기준선이 매 실행 앞으로 밀려 과거 글을 영영 못 읽는다.
 *    null 로 둔다 — 그 결과가 무엇인지는 이 파일 아래 NO_DATE 주석에 있다.
 */
function ymd(value: unknown): string | null {
  const raw = str(value)
  if (!raw || !/^\d{8}$/.test(raw)) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/**
 * ⚠️ NO_DATE — 카페글·지식iN 에 작성일이 없을 때 실제로 일어나는 일.
 *
 * 러너의 증분 종료는 `writtenAt` 비교로 돈다. 전부 null 이면 STALE 판정이
 * 한 번도 참이 되지 않아 **매 실행이 1페이지부터 다시 훑는다.** 다만
 *   · 지문(externalId = link)이 중복을 잡아내므로 **재적재는 없고**,
 *   · `MAX_PAGES_PER_TARGET`(20) 에서 멈춘다.
 * 즉 낭비는 요청 20건이고 데이터는 오염되지 않는다. 이 사실을 모른 채
 * "매일 도는데 신규 0건"만 보면 조용한 실패로 오진한다(§7.2).
 */

interface NaverVariant {
  key: string
  displayName: string
  /** 엔드포인트 경로 조각. `blog` / `cafearticle` / `kin`. */
  path: string
  /** 적재 본문 접두. 스니펫이라는 사실이 분석 단계까지 따라가야 한다. */
  prefix: string
  /** 작성일 필드가 있는가. 블로그만 true. */
  hasDate: boolean
}

/**
 * 검색 결과 항목 1건 → ParsedReview. 못 읽으면 null(= 파싱 실패 1건).
 *
 * 필수는 **link 와 description** 이다. link 가 없으면 externalId 가 없어
 * 지문이 폴백으로 떨어지고, description 이 없으면 본문이 없다. 둘 중 하나가
 * 비었는데 조용히 넘기면 "10건 보이는데 0건 파싱"이 "0건"과 같아 보인다.
 */
function toReview(item: Record<string, unknown>, v: NaverVariant): ParsedReview | null {
  const link = str(item['link'])
  const rawDesc = item['description']
  if (!link || typeof rawDesc !== 'string') return null

  // 질의어가 `<b>` 로 감싸여 오고 엔티티도 섞인다. 공용 정제기로 푼다.
  const body = htmlStrip(rawDesc)
  if (!body) return null
  const title = htmlStrip(str(item['title']) ?? '')

  return {
    externalId: link,
    text: `${v.prefix.replace('<link>', link)} ${title ? `${title} — ` : ''}${body}`,
    // 네이버 검색에는 별점이 없다. 없는 축을 채우면 만족도 계산이 거짓말을 한다.
    rating: null,
    // 판매처 개념도 없다(다나와만 주는 축이다).
    seller: null,
    // ⛔ bloggername·cafename 을 저장하지 않는다. link 가 externalId 라
    //    지문 폴백 재료로 필요하지도 않다. 필요 없는 개인 식별 재료는 안 받는다.
    authorMasked: null,
    writtenAt: v.hasDate ? ymd(item['postdate']) : null,
  }
}

function createAdapter(v: NaverVariant): ReviewSourceAdapter {
  return {
    key: v.key,
    displayName: v.displayName,
    robotsPolicy: 'official-api',
    requiredEnv: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'],

    nextRequest(target: TargetState): { url: string; headers?: Record<string, string> } | null {
      const keyword = parseProductRef(target.productRef)
      if (!keyword) return null

      const start = startOf(target.cursor)
      // 경계 앞에서 멈춘다. 넘기면 400 이고, 그건 우리 쪽 잘못이다.
      if (start + DISPLAY > START_LIMIT) return null

      const id = process.env.NAVER_CLIENT_ID
      const secret = process.env.NAVER_CLIENT_SECRET
      // requiredEnv 를 실행기가 먼저 검사하지만, 여기서도 막는다. 키 없이
      // 보낸 요청은 401 을 받고 러너가 그걸 "차단"으로 기록한다 —
      // 원인이 우리 설정인데 상대가 막은 것으로 남는다.
      if (!id || !secret) return null

      return {
        url:
          `https://openapi.naver.com/v1/search/${v.path}.json` +
          `?query=${encodeURIComponent(keyword)}` +
          `&display=${DISPLAY}` +
          `&start=${start}` +
          // ⚠️ 빼면 관련도순이 되어 증분 종료가 오작동한다.
          '&sort=date',
        headers: {
          'X-Naver-Client-Id': id,
          'X-Naver-Client-Secret': secret,
        },
      }
    },

    parse(body: string, ctx: ParseContext): ParseResult {
      const start = startOf(ctx.cursor)

      let doc: unknown
      try {
        doc = JSON.parse(body)
      } catch {
        // JSON 이 아니면 구조가 바뀐 것이다(에러 HTML 등). 0건이 아니라 실패 1건.
        return { reviews: [], nextCursor: null, parseFailures: 1 }
      }

      const items = (doc as { items?: unknown })?.items
      if (!Array.isArray(items)) {
        return { reviews: [], nextCursor: null, parseFailures: 1 }
      }
      // 결과 0건은 정상 종료다. 질의에 안 걸렸을 뿐 구조는 멀쩡하다.
      if (items.length === 0) {
        return { reviews: [], nextCursor: null, parseFailures: 0 }
      }

      const reviews: ParsedReview[] = []
      let parseFailures = 0

      for (const item of items) {
        if (!item || typeof item !== 'object') {
          parseFailures++
          continue
        }
        const r = toReview(item as Record<string, unknown>, v)
        if (r) reviews.push(r)
        else parseFailures++
      }

      const next = start + DISPLAY
      // 받은 건수가 요청보다 적으면 마지막 페이지다. 상한도 같이 본다.
      const exhausted = items.length < DISPLAY || next + DISPLAY > START_LIMIT

      return { reviews, nextCursor: exhausted ? null : String(next), parseFailures }
    },

    // 네이버는 일일 한도를 초과하면 429(SE01/012 계열)를 준다. 쿼터 표지를
    // 선언하지 않으므로 모든 403/429 가 **차단**으로 판정된다 — 안전한 쪽
    // 기본값이다. 실제 한도 소진 응답 본문을 실측한 뒤에 표지를 넣는다.
    // 짐작한 문자열을 넣으면 진짜 차단을 쿼터로 오인해 계속 두드리게 된다.
  }
}

export const naverBlogAdapter = createAdapter({
  key: 'naver_blog',
  displayName: '네이버 블로그 검색 (오픈API)',
  path: 'blog',
  prefix: '[네이버 블로그 검색 스니펫 · <link>]',
  hasDate: true,
})

export const naverCafeAdapter = createAdapter({
  key: 'naver_cafe',
  displayName: '네이버 카페글 검색 (오픈API)',
  path: 'cafearticle',
  prefix: '[네이버 카페 검색 스니펫 · <link>]',
  // 응답에 작성일이 없다. 위 NO_DATE 주석 참조.
  hasDate: false,
})

/**
 * 지식iN 검색.
 *
 * ⚠️ 응답 필드를 **실물로 확인하지 못했다**(자격증명 미발급, 2026-09-16).
 *    그래서 네이버 검색 API 전 계열이 공통으로 내는 `title`/`link`/
 *    `description` 만 읽는다. 지식iN 고유 필드(답변 채택 여부 등)는
 *    짐작으로 넣지 않았다 — 실물 응답을 받은 뒤에 추가한다.
 *    그 전까지 `review_sources.naver_kin` 은 `enabled=false` 다.
 */
export const naverKinAdapter = createAdapter({
  key: 'naver_kin',
  displayName: '네이버 지식iN 검색 (오픈API)',
  path: 'kin',
  prefix: '[네이버 지식iN · <link>]',
  hasDate: false,
})

/** 셀프테스트 전용. 프로덕션 코드에서 쓰지 않는다. */
export const __internal = { startOf, toReview, ymd }
