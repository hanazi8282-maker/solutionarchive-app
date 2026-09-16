// 더쿠(theqoo) 게시글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 round-2 — theqoo · todayhumor (2026-09-16)"
//
// ⚠️ **댓글은 수집하지 않는다. 못 하는 게 아니라 정적 HTML 에 없다.**
//    글 페이지의 댓글 영역은 `<div id="cmtPosition">` 이 비어 있고
//    `loadReply(<글id>, 0, false, false)` 가 나중에 AJAX 로 채운다.
//    `?listStyle=viewer` 변형도 같았다(실측 2026-09-16, 4개 글).
//    남는 건 개수 마커(`댓글 <b>7</b>개`)뿐이라 **본문 전용**으로 간다.
//    따라서 댓글 0건은 파싱 실패가 아니다 — 설계된 결정이다.
//    되살리려면 XHR 엔드포인트를 따로 실측해야 하고, 그건 1글=1요청 계약을
//    깨는 일이라 사람이 판단한다.
//
// ⚠️ robots.txt 가 **없다**(2026-09-16 실측: `https://theqoo.net/robots.txt`
//    → HTTP 404, 본문은 Rhymix 에러 HTML). 러너는 4xx 를 "규칙 없음 = 허용"
//    으로 본다(RFC 9309). 못 볼 규칙이 없으므로 SP-026(쿼리 미판정)도
//    이 소스에는 해당 사항이 없다 — **나중에 robots 가 생기면 그때부터는
//    쿼리 규칙을 우리가 못 본다.** 그 전에 러너를 고쳐라.
//    404 가 200 으로 바뀌면 parseRobots 가 HTML 을 먹고 "규칙 없음"이라는
//    같은 답을 낸다(groups=0). 그걸 잡는 트립와이어가
//    scripts/review-robots-selftest.mjs 에 있다.
//
// ⚠️ **1글=1요청이다.** 페이지네이션을 붙이지 마라.
//
// ⚠️ 공지글도 일반 글과 같은 `/square/<id>` 에 산다(`/notice/` 같은 별도
//    경로가 없다 — 실측). 경로로는 가려낼 수 없으므로 어떤 글을 담을지는
//    product_ref 를 넣는 사람이 정한다.

import type { ParseContext, ParseResult, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://theqoo.net'

/** `url:/square/4347529638` → `/square/4347529638`. 규칙 위반이면 null. */
export function parseProductRef(productRef: string): string | null {
  return parseUrlRef(productRef)
}

/** 본문 컨테이너. `<article itemprop="articleBody">` — 페이지당 정확히 1개(실측). */
const ARTICLE_OPEN = '<article itemprop="articleBody">'
const ARTICLE_CLOSE = '</article>'

/**
 * 제목. `<title>더쿠 - 늙크크들은 …</title>`
 *
 * og:* 가 없고, 화면의 `<span class="title">` 은 공지글에서 안쪽에 또
 * `<span style=…>` 을 품는다(실측). `<title>` 이 유일하게 평문이다.
 */
const TITLE_RE = /<title>([^<]*)<\/title>/
const TITLE_PREFIX = /^더쿠\s*-\s*/

/** 작성일. `<div class="side fr"><span>2026.09.16 23:23</span></div>` — 4자리 연도다. */
const DATE_RE = /<div class="side fr">\s*<span>\s*(\d{4})\.(\d{2})\.(\d{2})/

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const theqooAdapter: ReviewSourceAdapter = {
  key: 'theqoo',
  displayName: '더쿠 게시글',

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)

    const open = body.indexOf(ARTICLE_OPEN)
    if (open < 0) {
      // 본문 컨테이너가 통째로 사라졌다. 제목만 읽고 "정상 수집"으로
      // 보고하던 그 사고다(CLAUDE.md §7.1 사례 1). 실패로 센다.
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }
    const from = open + ARTICLE_OPEN.length
    const close = body.indexOf(ARTICLE_CLOSE, from)
    const text = stripHtml(body.slice(from, close < 0 ? body.length : close))

    const tm = TITLE_RE.exec(body)
    const title = tm ? stripHtml(tm[1]).replace(TITLE_PREFIX, '').trim() : ''

    // 컨테이너는 멀쩡한데 제목도 본문도 없다 = 구조가 바뀐 쪽이다.
    // 사진만 올린 글(본문 텍스트 0, 제목 있음)은 여기 안 걸린다 — 그건 정상이다.
    if (!title && !text) {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const d = DATE_RE.exec(body)

    return {
      reviews: [
        {
          externalId: p,
          text: [title, text].filter(Boolean).join('\n\n'),
          rating: null,
          seller: null,
          authorMasked: null,
          writtenAt: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
          storyId: null,
        },
      ],
      // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
      nextCursor: null,
      parseFailures: 0,
    }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
  // (실측: 로그인이 필요한 act 는 실제로 403 을 준다. 글 페이지는 200.)
}

export const __internal = { stripHtml }
