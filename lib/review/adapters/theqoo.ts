// 더쿠(theqoo) 게시글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 round-2 — theqoo · todayhumor (2026-09-16)"
//
// ⚠️ **댓글은 수집하지 않는다. 정적 HTML 에 없고, 그 AJAX 는 우리 요청
//    계약으로 표현할 수 없다.** 글 페이지의 댓글 영역은 `<div id="cmtPosition">`
//    이 비어 있고 `loadReply(<글id>, 0, false, false)` 가 AJAX 로 채운다.
//    남는 건 개수 마커(`댓글 <b>7</b>개`)뿐이라 **본문 전용**이고, 댓글 0건은
//    파싱 실패가 아니다 — 설계된 결정이다.
//
//    2026-09-17 에 그 XHR 을 실측했다. **되긴 된다**(로그인 불필요):
//      POST https://theqoo.net/index.php · Content-Type: application/json
//      {"act":"dispTheqooContentCommentListTheqoo","document_srl":"<id>","cpage":"1"}
//      + 글 페이지 GET 으로 받은 세션 쿠키(PHPSESSID, rx_login_status=none)
//      + Referer: <글 URL>
//      → 200 {"comment_list":[{"srl":…,"ct":"<html>","rd":"YYYYMMDDHHMMSS"}], …}
//    쿠키나 Referer 가 없으면 {"errorDetail":"ERR_CSRF_CHECK_FAILED"} 다.
//    쿠키 없는 우회로는 없었다 — GET 으로 같은 act 를 부르면 301 을 거쳐 글
//    페이지 HTML 이 오고, form-encoded POST 도 마찬가지다(둘 다 실측).
//
//    ⛔ 그런데 **이 어댑터는 그 요청을 만들 수 없다.** 세 군데가 동시에 막는다:
//       1. nextRequest 의 반환형이 `{ url }` 뿐이다 — method·body·headers 가 없다.
//       2. RunnerPorts.fetchText(url) 은 GET 전용이고 헤더가 고정이다.
//       3. FetchOutcome 에 **응답 헤더가 없다** — Set-Cookie 가 parse() 에
//          닿지 않으므로 세션 쿠키를 커서에 실어 나르는 우회도 불가능하다.
//    셋 다 공용 코드(types.ts·runner.ts·scripts/review-collect.mjs)를 고쳐야
//    풀리고, 그건 이 소스 하나를 위해 요청 계약을 넓히는 일이라 사람이
//    판단한다. **여기서 임시로 fetch 를 부르지 마라** — robots·간격·상한이
//    전부 러너에 있다(types.ts 의 ⛔ 참조).
//
// ⚠️ robots.txt 가 **없다**(2026-09-16 실측: `https://theqoo.net/robots.txt`
//    → HTTP 404, 본문은 Rhymix 에러 HTML).
//
//    ⚠️ 2026-09-18 정정. 그 전까지 이 주석은 "러너는 4xx 를 규칙 없음 = 허용으로
//       본다"고 적었고 그게 실제 동작이었다. **지금은 아니다** — 4xx 는
//       `unverified` 이고 러너는 요청하지 않는다(SP-032). 이 소스가 도는 것은
//       아래 `proceedWhenRobotsUnverified` 표식 덕이다.
//       404 가 200 으로 바뀌어 같은 HTML 이 와도 `looksLikeMarkup` 이 잡는다.
//
//    못 볼 규칙이 없으므로 SP-026(쿼리 미판정)도 이 소스에는 해당 사항이 없다 —
//    **나중에 robots 가 생기면 그때부터는 쿼리 규칙을 우리가 못 본다.**
//    그 전에 러너를 고쳐라. 트립와이어는 scripts/review-robots-selftest.mjs 에 있다.
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

  // 남헌 2026-09-23 Q3(a): 이 소스의 타깃은 페이지 상한에 닿아도 닫지 않는다.
  //
  // ⚠️ **types.ts 의 incrementalOnly 주석이 "커뮤니티 url: 에는 켜지 마라"고 적어 둔
  //    바로 그 자리다.** 그 경고는 유효하고, 남헌이 그걸 알고 뒤집었다. 전제가 바뀐 게 아니다 —
  //    대가(같은 글을 매일 1요청씩 다시 읽는다)를 받아들인 것이다. 근거:
  //    커뮤니티 타깃 85개 중 80개가 "성과 없어서"가 아니라 "끝까지 읽어서" 닫혔고,
  //    되살리는 코드가 리포에 없어 그 질의는 영영 다시 안 돌았다
  //    (reports/2026-09-23/voc-expansion-investigation.md §3).
  //
  // 게시글에 댓글이 계속 달린다 — 대상이 고정된 문서가 아니라 자라는 스레드다.
  //
  // 비용: 1글 = 1요청이므로 실행당 타깃 수만큼이다(커서가 첫 페이지에 null 이 되어
  // 20페이지를 훑지 않는다). 새 글이 안 달리면 consecutive_empty 만 늘고 닫히지 않는다 —
  // 그 상한은 아직 없다. 늘어나면 재활성화 조건(empty<3)을 러너에 넣어야 한다.
  incrementalOnly: true,

  // robots 확인 불가여도 진행하는 호스트 (types.ts 의 필드 주석이 규칙 정본).
  //
  // ⚠️ `https://theqoo.net/robots.txt` 는 **HTTP 404 에 Rhymix 기본 HTML** 이다
  //    (2026-09-16 실측, 본문 원문은 scripts/review-robots-selftest.mjs 의
  //    `theqooSoft404` 에 그대로 있다). 채택 근거는 robots 가 아니라 이용약관
  //    전문 6,315자 확인이다 — 크롤링·봇·AI·재가공 조항 0건.
  //    `review_sources.disabled_reason` 에도 "robots.txt 없음(실측 404)"로 적혀 있다.
  proceedWhenRobotsUnverified: ['theqoo.net'],

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
