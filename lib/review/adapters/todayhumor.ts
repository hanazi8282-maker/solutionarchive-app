// 오늘의유머(todayhumor) 게시글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 round-2 — theqoo · todayhumor (2026-09-16)"
//
// ⚠️ **호스트를 www 로 고정한 건 취향이 아니다.**
//    `https://todayhumor.co.kr/...` 은 **`http://www.todayhumor.co.kr/...` 로
//    리다이렉트한다 — https 가 http 로 내려간다**(실측 2026-09-16).
//    러너의 fetchText 는 `redirect: 'follow'` 라 그 다운그레이드를 조용히
//    따라가고, 그때부터 우리 요청은 평문이다. www 오리진은 https 에서 그대로
//    종단한다(robots.txt 404, 글 페이지 200, 리다이렉트 0회).
//    설계 단계에서 걱정한 www↔무www **순환 리다이렉트는 없었다** — 있었다면
//    fetchText 가 throw → status null → 러너가 그 오리진을 'unreadable' 로
//    캐시 → 전 요청 스킵이고, 로그에는 robotsSkips 만 남았을 것이다(§7.2).
//
// ⚠️ **댓글은 수집하지 않는다. 정적 HTML 에 없다.**
//    `<!--댓글 자리--><div id='memoContainerDiv'></div>` 가 비어 있고
//    `loadMoreReply()` 가 AJAX 로 채운다(실측: 댓글 5개인 글에서도 빈 div).
//    개수 마커(`<div>댓글 : 5개</div>`)만 정적이다. 그래서 **본문 전용**이고,
//    댓글 0건은 파싱 실패가 아니다 — 설계된 결정이다.
//
// ⚠️ robots.txt 가 **없다**(2026-09-16 실측: 양 오리진 모두 HTTP 404).
//    못 볼 규칙이 없으니 SP-026(러너가 쿼리를 떼고 판정하는 구멍)도 지금은
//    무해하다. 하지만 이 소스의 글 주소는 **쿼리형**이라, 나중에 robots 가
//    생기고 거기에 쿼리 규칙이 들어가면 **우리 안전장치가 그 규칙을 못 본다.**
//    그때는 러너부터 고쳐라.
//
// ⚠️ 이용약관 페이지를 찾지 못했다. 푸터에 링크가 없고
//    `/member/agreement.php` · `/member/join_agreement.php` 는 404,
//    `/member/privacy.php`(200, 평문 3,123자)에는 크롤링·봇·AI 조항이 0건이다.
//    **이건 "허용"이 아니라 "확인 불가"다**(CLAUDE.md §7.1). 그래서 이 소스는
//    enabled=false 로 등록하고, 켜는 판단은 사람이 한다.
//
// ⚠️ **1글=1요청이다.** 페이지네이션을 붙이지 마라.

import type { ParseContext, ParseResult, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://www.todayhumor.co.kr'

/** `url:/board/view.php?table=bestofbest&no=483825` → 그 경로. 규칙 위반이면 null. */
export function parseProductRef(productRef: string): string | null {
  return parseUrlRef(productRef)
}

/** 본문 컨테이너. 닫는 자리를 사이트가 주석으로 표시해 준다 — div 를 셀 필요가 없다. */
const CONTENT_OPEN = '<div class="viewContent">'
const CONTENT_CLOSE = '</div><!--viewContent-->'

/** 제목. og:title 이 유일하게 평문이다(`<title>` 은 `오늘의유머 - ` 접두가 붙는다). */
const OG_TITLE_RE = /<meta property="og:title" content="([^"]*)"/

/**
 * 작성일. 4자리 연도라 82cook 의 2자리 피벗(parseShortDate)이 필요 없다.
 *
 * 베스트 보드(bestofbest)는 두 시각을 준다:
 *   `베오베  등록시간 : 2026/09/16 23:15:47`  ← 베스트로 올라온 시각
 *   `원글작성시간 : 2026/09/15 10:28:42`      ← 글이 쓰인 시각
 * 우리가 원하는 건 뒤쪽이다. 일반 보드에는 원글작성시간 칸이 비어 있어
 * (`<div></div>`) 그때만 등록시간으로 내려간다.
 */
const ORIGIN_DATE_RE = /원글작성시간\s*:\s*(\d{4})\/(\d{2})\/(\d{2})/
const POSTED_DATE_RE = /등록시간\s*:\s*(\d{4})\/(\d{2})\/(\d{2})/

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
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

export const todayhumorAdapter: ReviewSourceAdapter = {
  key: 'todayhumor',
  displayName: '오늘의유머 게시글',

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)

    const open = body.indexOf(CONTENT_OPEN)
    if (open < 0) {
      // 본문 컨테이너 소실. 제목만 읽고 "정상"으로 넘기지 않는다(§7.1 사례 1).
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }
    const from = open + CONTENT_OPEN.length
    const close = body.indexOf(CONTENT_CLOSE, from)
    const text = stripHtml(body.slice(from, close < 0 ? body.length : close))

    const tm = OG_TITLE_RE.exec(body)
    const title = tm ? stripHtml(tm[1]) : ''

    // 이 사이트는 사진만 올리는 글이 흔하다(실측). 그건 제목만 남기고 통과시킨다.
    // 제목까지 없으면 그건 구조가 바뀐 것이다.
    if (!title && !text) {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const d = ORIGIN_DATE_RE.exec(body) ?? POSTED_DATE_RE.exec(body)

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
}

export const __internal = { stripHtml }
