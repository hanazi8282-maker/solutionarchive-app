// Reddit 어댑터 — Data API(OAuth) `/search`.
//
// 실측 근거: docs/review-source-findings.md "3차 소스 실측 (2026-09-16)"
// 약관·리스크: docs/strategy-principles.md SP-005 / SP-024 / SP-027
//
// ⚠️ **이 어댑터는 포스트를 가져온다. 댓글이 아니다.**
//
//    `/search` 응답의 children 은 전부 `t3`(링크/셀프포스트)이고, 각 항목은
//    `title` + `selftext` 만 준다. 댓글은 포스트마다 별도 요청
//    (`/comments/<id>`)이 필요해 **포스트 1건당 요청 1건**이 된다 — 일일
//    상한이 순식간에 마른다. 그래서 이번 범위는 포스트 본문까지다.
//    "불만 댓글 밀도"를 보려면 다음 라운드에서 별도 설계가 필요하다.
//    원 요청과 구현 범위가 다르다는 사실을 여기 남긴다(§7.1).
//
// ⛔ **이 어댑터는 OAuth 토큰을 직접 교환하지 않는다.** 토큰 교환은 실행기
//    (scripts/review-collect.mjs)가 러너 호출 **전에** 한 번 한다. 어댑터가
//    fetch 를 하기 시작하면 robots·간격·상한·커서가 어댑터마다 복사되고,
//    한 곳에서 빠뜨리는 순간 상대 서버를 규칙 없이 때린다(types.ts 주석).
//
// ⛔ **`www.reddit.com` 의 공개 `.json` 스크래핑 경로를 쓰지 않는다.**
//    대상 호스트는 `oauth.reddit.com` 하나뿐이다. 공개 경로는 robots 와
//    약관 판단이 완전히 다른 사건이고, 이번 범위 밖이다.
//
// ⚠️ `sort=new` 가 필수다. 기본 관련도순이면 러너의 증분 종료(연속 STALE
//    5건)가 전제하는 시간 역순이 깨진다.
//
// ⚠️ User-Agent 는 러너의 공용 `USER_AGENT`(제품토큰 + 리포 URL)를 그대로
//    쓴다. Reddit 은 범용 UA(`python-requests` 등)를 429 로 막는다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { htmlStrip } from '../html.ts'

/** 한 번에 받을 포스트 수. Reddit `limit` 상한이 100 이다. */
export const LIMIT = 100

/** 타깃의 `product_ref` 형식: `q:<검색어>`. HN·네이버와 같다. */
export function parseProductRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!raw.toLowerCase().startsWith('q:')) return null
  const keyword = raw.slice(2).trim()
  return keyword.length > 0 ? keyword : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** `created_utc`(초 단위 epoch) → `YYYY-MM-DD`. */
function toDate(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const d = new Date(value * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * 포스트 1건 → ParsedReview. 못 읽으면 null(= 파싱 실패 1건).
 *
 * ⚠️ **`selftext` 가 빈 문자열인 것과 필드 자체가 없는 것은 다른 사건이다.**
 *      · `selftext: ""`        → 링크 포스트다. 정상이고 제목이 본문 역할을 한다
 *      · `selftext` 키 없음    → 구조가 바뀐 것이다. **파싱 실패 1건**
 *    다나와의 "컨테이너 부재 = 구조 변경 / 내용 없음 = 정상"과 같은 갈래다
 *    (docs/review-collection-design.md §5.5). 둘을 합치면 건강도가 구조
 *    변경을 영영 못 본다.
 */
function toReview(data: Record<string, unknown>): ParsedReview | null {
  // fullname(`t3_<id>`). 지문이 seq 로 잡혀 폴백 경로를 안 탄다.
  const externalId = str(data['name'])
  const title = str(data['title'])
  if (!externalId || !title) return null

  // ⛔ 여기서 `in` 을 쓴다. `data['selftext']` 의 falsy 검사로 바꾸면
  //    빈 문자열(정상)과 키 부재(구조 변경)가 같아진다.
  if (!('selftext' in data)) return null
  const selftext = data['selftext']
  if (typeof selftext !== 'string') return null

  const subreddit = str(data['subreddit']) ?? '?'
  const permalink = str(data['permalink']) ?? ''
  const body = htmlStrip(selftext)

  return {
    externalId,
    // 링크 포스트는 본문이 비어 있고 제목이 전부다. 제목을 항상 싣는 이유다.
    text: `[Reddit r/${subreddit} · ${permalink}] ${htmlStrip(title)}${body ? `\n\n${body}` : ''}`,
    // 별점 없음. score(업보트)를 별점으로 환산하면 만족도 축이 거짓말을 한다.
    rating: null,
    seller: null,
    // ⛔ author 를 저장하지 않는다. externalId 가 있어 지문 폴백 재료로
    //    필요 없고, 필요 없는 개인 식별 재료는 안 받는다.
    authorMasked: null,
    writtenAt: toDate(data['created_utc']),
  }
}

/**
 * 토큰을 받아 어댑터를 만든다.
 *
 * `accessToken` 이 null 이면 `nextRequest` 가 항상 null 을 돌려준다 —
 * 요청을 한 건도 보내지 않는다. 실행기가 토큰 교환에 실패했을 때
 * "그 소스만 건너뛴다"가 코드로 보장되는 지점이다.
 */
export function createRedditAdapter(accessToken: string | null): ReviewSourceAdapter {
  return {
    key: 'reddit',
    displayName: 'Reddit 포스트 (Data API)',
    robotsPolicy: 'official-api',
    requiredEnv: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],

    nextRequest(target: TargetState): { url: string; headers?: Record<string, string> } | null {
      if (!accessToken) return null

      const keyword = parseProductRef(target.productRef)
      if (!keyword) return null

      // 커서는 fullname(`t3_xxx`) 문자열이다. 기존 문자열 커서 칸에 그대로 들어간다.
      const after = target.cursor ? `&after=${encodeURIComponent(target.cursor)}` : ''

      return {
        url:
          'https://oauth.reddit.com/search' +
          `?q=${encodeURIComponent(keyword)}` +
          // ⚠️ 빼면 관련도순이 되어 증분 종료가 오작동한다.
          '&sort=new' +
          '&t=all' +
          `&limit=${LIMIT}` +
          // HTML 엔티티 대신 원문 문자를 받는다.
          '&raw_json=1' +
          after,
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    },

    parse(body: string, _ctx: ParseContext): ParseResult {
      let doc: unknown
      try {
        doc = JSON.parse(body)
      } catch {
        return { reviews: [], nextCursor: null, parseFailures: 1 }
      }

      const data = (doc as { data?: unknown })?.data
      const children = (data as { children?: unknown })?.children
      if (!Array.isArray(children)) {
        return { reviews: [], nextCursor: null, parseFailures: 1 }
      }
      // 결과 0건은 정상 종료다.
      if (children.length === 0) {
        return { reviews: [], nextCursor: null, parseFailures: 0 }
      }

      const reviews: ParsedReview[] = []
      let parseFailures = 0

      for (const child of children) {
        const d = (child as { data?: unknown })?.data
        if (!d || typeof d !== 'object') {
          parseFailures++
          continue
        }
        const r = toReview(d as Record<string, unknown>)
        if (r) reviews.push(r)
        else parseFailures++
      }

      // 커서형 페이지네이션. `after` 가 null 이면 끝이다.
      const after = str((data as { after?: unknown })?.after)

      return { reviews, nextCursor: after, parseFailures }
    },

    // Reddit 은 한도 초과를 429 + `x-ratelimit-*` 헤더로 알린다. 러너가 본문만
    // 보므로 표지를 선언하지 않는다 = 모든 403/429 를 차단으로 본다(안전한 쪽).
    // 라이선스 리스크가 큰 소스라 여기서는 더 두드리지 않는 쪽이 맞다.
  }
}

/** 셀프테스트 전용. */
export const __internal = { toReview, toDate }
