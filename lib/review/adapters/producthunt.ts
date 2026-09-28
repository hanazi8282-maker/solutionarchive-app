// Product Hunt 런칭 댓글 어댑터 — 공식 GraphQL API v2 (`POST https://api.producthunt.com/v2/api/graphql`).
//
// ⛔ 비활성으로 출하한다(review_sources.enabled=false, 20260930000025). PH API 문서가
//    "must not be used for commercial purposes" 라고 적는다 — 상업 이용 허가(hello@producthunt.com)
//    또는 남헌 판단 전까지 켜지 않는다(2026-09-28 CEO-STAFF). 실측 근거는 scripts/voc-probe-producthunt.mjs.
//
// 타깃: product_ref = `post:<슬러그>` — 런칭(post) 하나의 댓글 = 리뷰. 어느 런칭을 볼지는 사람이 고른다
//    (YouTube `v:<영상ID>` 와 같은 모양. 검색·목록 순회는 하지 않는다).
//
// ⚠️ 러너의 기본 요청은 GET 인데 이 API 는 POST 만 받는다(2026-09-28 실측: GET → 404).
//    그래서 types.ts `ReviewRequest.init` 으로 POST 본문·Authorization 헤더를 싣는다. robots(api 호스트
//    robots.txt 는 로컬에서 200, /v2/api/graphql 을 막지 않는다 — 2026-09-28 실측. Actions 에선 403 → 아래
//    proceedWhenRobotsUnverified)·간격·일일 상한은 러너가 그대로 건다.
//    토큰은 헤더에만 싣는다 — URL·커서에 넣으면 로그와 DB 에 남는다.
//
// ⚠️ 댓글 순서는 `order: NEWEST` 다. 러너의 증분 종료(연속 STALE)가 시간 역순을 전제한다.
//    ⚠️ 이 인자는 실토큰으로 아직 한 번도 돌려 보지 않았다 — 스키마가 거부하면 200 + errors 가 오고
//       parse 가 파싱 실패 1건으로 센다(0건 정상으로 접지 않는다, §7.1). 켜기 전에 1회 실측할 것.
//
// 작성자는 싣지 않는다(authorMasked=null) — YouTube 와 같은 규약.

import type { ParseContext, ParseResult, ParsedReview, ReviewRequest, ReviewSourceAdapter, TargetState } from '../types.ts'
import { htmlStrip } from './hackernews.ts'

export const PH_GRAPHQL_URL = 'https://api.producthunt.com/v2/api/graphql'
/** 한 페이지 댓글 수. 프로브(voc-probe-producthunt.mjs)가 20 으로 복잡도 한도에 안 걸렸다. */
export const PAGE_SIZE = 20

const QUERY = `query($slug: String!, $after: String) {
  post(slug: $slug) {
    comments(first: ${PAGE_SIZE}, after: $after, order: NEWEST) {
      edges { node { id body createdAt } }
      pageInfo { endCursor hasNextPage }
    }
  }
}`

/** `post:<슬러그>` → 슬러그. 슬러그는 영숫자·하이픈만 받는다(GraphQL 변수로 넘기지만 규칙은 좁게 둔다). */
export function parseProductRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!/^post:/i.test(raw)) return null
  const slug = raw.slice(5).trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(slug) ? slug : null
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function toReview(node: Record<string, unknown>, slug: string): ParsedReview | null {
  const id = str(node['id'])
  const raw = str(node['body'])
  if (!id || !raw) return null
  const body = htmlStrip(raw)
  if (!body) return null
  const created = str(node['createdAt'])
  return {
    externalId: id,
    text: `[Product Hunt 댓글 · ${slug}] ${body}`,
    rating: null,
    seller: null,
    authorMasked: null,
    writtenAt: created && /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : null,
  }
}

export const producthuntAdapter: ReviewSourceAdapter = {
  key: 'producthunt',
  displayName: 'Product Hunt 런칭 댓글 (GraphQL v2)',
  requiredEnv: ['PRODUCT_HUNT_API_TOKEN'],
  // 429 본문 표지. 그 밖의 403/429 는 차단으로 본다(안전한 쪽, health.ts).
  quotaMarkers: ['rate_limit_reached', 'rate limit'],
  // api.producthunt.com/robots.txt 는 로컬에선 200 인데 GitHub Actions 러너에선 403 이다(2026-09-28
  // 시험수집 실측 — 클라우드 IP 차단으로 보인다). 토큰 인증 공식 API 라 토큰·레이트리밋·약관이 이 호스트의
  // 규율이다(CLAUDE.md §7.1 예외, 남헌 2026-09-29). 5xx·타임아웃은 이 표식으로도 통과하지 않는다.
  proceedWhenRobotsUnverified: ['api.producthunt.com'],

  nextRequest(target: TargetState): ReviewRequest | null {
    const slug = parseProductRef(target.productRef)
    const token = process.env.PRODUCT_HUNT_API_TOKEN
    if (!slug || !token) return null
    return {
      url: PH_GRAPHQL_URL,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: QUERY, variables: { slug, after: target.cursor ?? null } }),
      },
    }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const slug = parseProductRef(ctx.productRef) ?? '?'
    let doc: Record<string, unknown> | null
    try {
      doc = obj(JSON.parse(body))
    } catch {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }
    // 200 + errors(스키마 거부·인증) 와 post=null(슬러그 없음)은 "못 읽음"이다. 0건 정상이 아니다.
    const comments = obj(obj(obj(doc?.['data'])?.['post'])?.['comments'])
    const edges = comments?.['edges']
    if (Array.isArray(doc?.['errors']) || !comments || !Array.isArray(edges)) {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const reviews: ParsedReview[] = []
    let parseFailures = 0
    for (const e of edges) {
      const node = obj(obj(e)?.['node'])
      const r = node ? toReview(node, slug) : null
      if (r) reviews.push(r)
      else parseFailures++
    }

    const pageInfo = obj(comments['pageInfo'])
    const nextCursor = pageInfo?.['hasNextPage'] === true ? str(pageInfo['endCursor']) : null
    return { reviews, nextCursor, parseFailures }
  },
}
