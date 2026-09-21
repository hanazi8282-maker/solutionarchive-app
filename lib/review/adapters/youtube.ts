// YouTube 댓글 어댑터 — Data API v3 `commentThreads.list`.
//
// 실측 근거: docs/review-source-findings.md "3차 소스 실측 (2026-09-16)"
//
// ⚠️ **`search.list` 를 쓰지 않는다.** 유닛 비용 때문이 아니다 — 지금 공식
//    문서는 검색도 읽기도 똑같이 1유닛이라고 적는다. 진짜 이유는 버킷이
//    다르다는 것이다: `search.list` 는 **10,000유닛 풀과 별개인 하루 100회
//    전용 버킷**을 쓴다. 풀에 9,000유닛이 남아 있어도 101번째 검색은 막히고,
//    늘리려면 별도 증량 신청이 필요하다.
//      출처(2026-09-16 확인, developers.google.com/youtube/v3/getting-started
//      · /determine_quota_cost): "Projects that enable the YouTube Data API
//      have a default quota allocation of 100 search.list calls, 100
//      videos.insert calls, and 10,000 units per day combined for all other
//      endpoints."
//    ⛔ "검색 1회 = 100유닛"은 폐기된 옛 값이다. 그 숫자를 근거로 "몇 번만
//       쓰면 싸다"고 되돌리지 마라 — 싼 것과 버킷이 있는 것은 다른 문제다.
//    그래서 "어느 영상을 볼지"는 시스템이 검색하지 않고 **사람이 고른다** —
//    다나와 pcode 를 사람이 고르는 것과 같은 모양이다(product_ref = `v:<영상ID>`).
//    `commentThreads.list` 는 10,000유닛 풀을 쓰므로 여유가 있다.
//
// ⚠️ 하루 요청 상한은 이 파일이 아니라 `review_sources.daily_request_cap`(=200)
//    이 건다. 러너가 `budget = dailyRequestCap - requestsToday` 로 계산해
//    타깃마다·페이지마다 검사한다(lib/review/runner.ts, 셀프테스트
//    review-runner-selftest.mjs "일일 상한"). 200요청 × 1유닛 = 하루 최대
//    200유닛으로 10,000유닛 풀의 2% 다. 상한을 조이는 데 코드 배포가 필요
//    없도록 DB 에 둔 값이니, 여기에 두 번째 카운터를 만들지 마라.
//
// ⚠️ `order=time` 이 필수다. 기본값은 관련도순(`relevance`)이고, 그러면
//    러너의 증분 종료(연속 STALE 5건)가 전제하는 시간 역순이 깨진다.
//
// ⚠️ 🔴 **댓글이 꺼진 영상을 타깃으로 넣지 마라.** 그 영상은 HTTP 403 에
//    `commentsDisabled` 를 준다. 쿼터 표지가 아니므로 러너는 이걸 **차단**으로
//    분류하고 소스를 꺼 버린다. 영상 하나 잘못 고른 것이 소스 전체를 멈추게
//    한다. 타깃 등록 전 사람이 그 영상의 댓글창을 눈으로 확인한다.
//    (쿼터로 분류하게 만들면 "쿼터 소진"이라는 거짓 이유가 로그에 남는다 —
//     원인을 다르게 적는 건 §7.1 위반이라 하지 않는다.)
//
// ⚠️ 🔴 약관 제약이 크다. YouTube API Services Developer Policies §III.E.4.d 는
//    비인증 API 데이터를 **30일 넘게 저장하지 못하게** 하고, 같은 문서가
//    "API Data 로 새로운/파생 데이터를 만들지 말 것"을 요구한다. 우리 파이프라인은
//    댓글에서 소구점을 추출한다 = 파생 데이터다. 그래서 이 소스는
//    `enabled=false` 로 등록하고, 켜는 판단은 사람이 한다
//    (docs/strategy-principles.md SP-026).

// 2026-09-21 PR #106(feat/review-sources-expand) 에서 이식. 그 브랜치의 `robotsPolicy: 'official-api'`
// (robots 조회 생략)는 main 의 러너에 없다 — main 은 2026-09-18(#152) 부터 robots 확인 불가를
// fail-closed 로 다루고, 예외는 호스트 단위 표식 `proceedWhenRobotsUnverified` 뿐이다.
// `www.googleapis.com/robots.txt` 는 **404** 다(2026-09-16 프로브 · 2026-09-21 재확인) → 확인 불가 →
// 아래 표식으로만 통과한다. robots 가 생겨서 규칙이 파싱되면 표식은 자동으로 무력화된다(types.ts).

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
// 같은 정규식을 어댑터마다 복사하지 않는다 — hackernews.ts 가 export 하는 것을 그대로 쓴다.
import { htmlStrip } from './hackernews.ts'

/** 한 번에 받을 댓글 스레드 수. API 상한이 100 이다. */
export const MAX_RESULTS = 100

/** 타깃의 `product_ref` 형식: `v:<영상ID>`. */
export function parseProductRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!raw.toLowerCase().startsWith('v:')) return null
  const id = raw.slice(2).trim()
  // 영상 ID 는 11자 [A-Za-z0-9_-] 다. 아니면 URL 을 통째로 넣은 것이다.
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * commentThreads 항목 1건 → ParsedReview. 못 읽으면 null(= 파싱 실패 1건).
 *
 * 필수는 **본문과 댓글 id** 다. `topLevelComment` 컨테이너가 통째로 없으면
 * 구조가 바뀐 것이고, 그걸 조용히 버리면 "100건 보이는데 0건 파싱"이
 * "0건"과 똑같아 보인다(§7.1).
 */
function toReview(item: Record<string, unknown>, videoId: string): ParsedReview | null {
  const snippet = obj(item['snippet'])
  const top = obj(snippet?.['topLevelComment'])
  const cs = obj(top?.['snippet'])
  if (!cs) return null

  const externalId = str(top?.['id']) ?? str(item['id'])
  // textOriginal 이 평문이다. textDisplay 는 HTML(링크·<br>)이 섞여 온다.
  const raw = str(cs['textOriginal']) ?? str(cs['textDisplay'])
  if (!externalId || !raw) return null

  const body = htmlStrip(raw)
  if (!body) return null

  const published = str(cs['publishedAt'])
  const writtenAt = published && /^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : null

  return {
    externalId,
    text: `[YouTube 댓글 · ${videoId}] ${body}`,
    // 별점 없음. 좋아요 수를 별점처럼 쓰면 만족도 축이 거짓말을 한다.
    rating: null,
    seller: null,
    // ⛔ authorDisplayName 을 저장하지 않는다. externalId 가 있어 지문
    //    폴백 재료로 필요 없고, 필요 없는 개인 식별 재료는 안 받는다.
    authorMasked: null,
    writtenAt,
  }
}

export const youtubeAdapter: ReviewSourceAdapter = {
  key: 'youtube',
  displayName: 'YouTube 댓글 (Data API v3)',
  // 실행기(scripts/review-collect.mjs)가 러너를 부르기 전에 검사한다. 키 없이 돌리면 403 이
  // "차단"으로 기록되고 소스가 꺼진다 — 원인은 우리 설정인데 상대가 막은 것으로 남는다(§7.1).
  requiredEnv: ['YOUTUBE_API_KEY'],
  // www.googleapis.com/robots.txt = 404 (확인 불가). 공식 API 호스트라 규칙이 없는 것이 정상이고,
  // 키·쿼터·약관(SP-026)이 이 호스트의 규율이다. 5xx·타임아웃은 이 표식으로도 통과하지 않는다.
  proceedWhenRobotsUnverified: ['www.googleapis.com'],

  // 403 본문에 이 표지가 있으면 쿼터 소진이다 — 차단이 아니므로 소스를
  // 끄지 않는다. 정상적인 일일 한도 소진을 "차단당했다"로 기록하면
  // 다음날 아침 사람이 엉뚱한 곳을 본다(health.ts 주석).
  quotaMarkers: ['quotaexceeded', 'ratelimitexceeded'],

  nextRequest(target: TargetState): { url: string } | null {
    const videoId = parseProductRef(target.productRef)
    if (!videoId) return null

    const key = process.env.YOUTUBE_API_KEY
    // 키 없이 보내면 403 을 받고 러너가 그걸 차단으로 기록한다. 원인이
    // 우리 설정인데 상대가 막은 것으로 남는다. 그 전에 멈춘다.
    if (!key) return null

    // 커서는 nextPageToken 이다. 없으면 첫 페이지.
    const pageToken = target.cursor ? `&pageToken=${encodeURIComponent(target.cursor)}` : ''

    return {
      url:
        'https://www.googleapis.com/youtube/v3/commentThreads' +
        '?part=snippet' +
        `&videoId=${encodeURIComponent(videoId)}` +
        // ⚠️ 빼면 관련도순이 되어 증분 종료가 오작동한다.
        '&order=time' +
        `&maxResults=${MAX_RESULTS}` +
        '&textFormat=plainText' +
        pageToken +
        `&key=${encodeURIComponent(key)}`,
    }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const videoId = parseProductRef(ctx.productRef) ?? '?'

    let doc: unknown
    try {
      doc = JSON.parse(body)
    } catch {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const items = (doc as { items?: unknown })?.items
    if (!Array.isArray(items)) {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const reviews: ParsedReview[] = []
    let parseFailures = 0

    for (const item of items) {
      const o = obj(item)
      if (!o) {
        parseFailures++
        continue
      }
      const r = toReview(o, videoId)
      if (r) reviews.push(r)
      else parseFailures++
    }

    // ⚠️ 종료 신호는 `nextPageToken` 의 부재다. 있으면 그 문자열이 다음 커서다.
    //    페이지 번호를 우리가 계산하지 않는다 — 커서형 API 라 서버가 준 값만 쓴다.
    const next = str((doc as { nextPageToken?: unknown })?.nextPageToken)

    return { reviews, nextCursor: next, parseFailures }
  },
}

/** 셀프테스트 전용. */
export const __internal = { toReview }
