// 클리앙(clien.net) 게시글·댓글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 round-3 — brunch · clien · fmkorea (2026-09-17)"
//
// ⚠️ **클리앙은 우리에게 robots.txt 를 안 보여 준다(SP-027).**
//    2026-09-17 실측:
//      우리 봇 UA  → www.clien.net/robots.txt = 404, clien.net = 404
//      브라우저 UA → www.clien.net/robots.txt = 200 (규칙 있음), clien.net = 404
//    즉 규칙은 존재하는데 **UA 로 게이팅**돼 있다. 러너는 4xx 를
//    "규칙 없음 = 허용"으로 캐시하므로(runner.ts), 클리앙이 실제로 건 규칙이
//    판정에 **단 한 번도 반영되지 않는다.** 안전장치가 초록불을 띄우는
//    형태다(CLAUDE.md §7.2). UA 를 위장해서 읽어 오는 건 하지 않는다.
//
//    그래서 82cook 의 ROBOTS_DENY 선례대로 **규칙을 어댑터가 코드로
//    내재화**한다. 아래 parseProductRef 의 가드가 그것이고, 이게 유일한
//    방어선이다. 손대기 전에 위 실측을 다시 해라.
//
//    브라우저 UA 로 읽은 `User-agent: *` 그룹 원문(실측):
//      Allow:/service/board/
//      Disallow:/service/group/   /service/board/sold/   /service/board/hongbo/
//      Disallow:/service/mypage/  /service/message/      /service/popup/
//      Disallow:/service/search/  /service/search*       /service/cs/
//      Disallow:/service/recommend
//      Disallow: /*?*
//
// ⚠️ **1글=1요청이다.** 댓글 페이지네이션을 붙이지 마라. 쿼리를 붙이는 순간
//    위 `Disallow: /*?*` 위반인데, 러너는 robots 판정에 쿼리를 안 넘기고
//    (SP-026) 애초에 위 규칙을 읽지도 못한다. 안전장치가 **둘 다** 없다.
//
// 수집 단위는 상품이 아니라 글 1건이다. 글 본문 1건 + 댓글 N건 = 리뷰 N+1건.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/**
 * 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다.
 *
 * apex(`clien.net`)를 쓰지 않는다 — 거기는 robots 도 404 고, 글 주소가 www
 * 로 리다이렉트된다. 크로스호스트 리다이렉트라는 변수를 새로 만들 이유가 없다.
 */
export const HOST = 'https://www.clien.net'

/** 허용 범위. robots 의 `Allow:/service/board/` 를 그대로 옮긴 것. */
const ALLOW_PREFIX = '/service/board/'

/**
 * 허용 접두 **안쪽**에서 다시 막히는 경로들. robots 원문 그대로다.
 * 중고장터·직접홍보는 VOC 도 아니고 개인 거래글이라 애초에 담을 이유도 없다.
 */
const DENY_PREFIXES = ['/service/board/sold/', '/service/board/hongbo/']

/**
 * `url:/service/board/park/19264755` → 그 경로. 규칙 위반이면 null.
 *
 * 세 겹을 전부 통과해야 한다:
 *   (a) 공용 규칙(`..` `//` `@` `\` 공백 차단 — SSRF 경계)
 *   (b) 쿼리스트링 없음        ← robots `Disallow: /*?*` 의 **의도**
 *   (c) `/service/board/` 로 시작하고 sold·hongbo 가 아님
 *                              ← robots `Allow:` / `Disallow:`
 *
 * ⚠️ (b)는 robots 기계 판정보다 **일부러 더 엄격하다.** 최장 일치 규칙상
 *    `Allow:/service/board/`(20자)가 `Disallow: /*?*`(4자)를 이겨서, 표준대로
 *    판정하면 `?po=2` 가 붙은 글도 허용이 된다. 그래도 사이트가 저 줄을 쓴
 *    의도는 명백하고, 어차피 1글=1요청이라 쿼리를 만들 이유가 없다. 이 차이는
 *    scripts/review-robots-selftest.mjs 에 그대로 적어 뒀다 — 감추지 않는다.
 */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  if (p === null) return null
  if (p.includes('?')) return null
  if (!p.startsWith(ALLOW_PREFIX)) return null
  if (DENY_PREFIXES.some((bad) => p.startsWith(bad))) return null
  return p
}

/**
 * 댓글 수 마커. `<a href="#comment_write_point">… 댓글 • [<strong>17</strong>]</a>`
 *
 * ⚠️ 이 마커가 **"댓글 0건"과 "댓글 영역이 사라짐"을 가르는 유일한 근거**다.
 *    댓글 0건인 글에도 `[0]` 으로 남아 있다(실측). 마커도 항목도 없으면
 *    구조가 바뀐 것이다(CLAUDE.md §7.1).
 */
const COUNT_RE = /댓글\s*•\s*\[<strong>(\d+)<\/strong>\]/

/** 댓글 앵커. `<div class="comment_row  " data-role="comment-row" … data-comment-sn="152397724">` */
const ROW_OPEN = /<div class="comment_row[^"]*" data-role="comment-row"[^>]*data-comment-sn="(\d+)"/g

/** 댓글 본문 컨테이너. `<div class="comment_view" data-comment-view="152397724">` */
const VIEW_OPEN = 'class="comment_view"'

/** 댓글 작성일. `<span class="timestamp">2026-09-16 23:37:50` — 4자리 연도가 있다. */
const CMT_TIME_RE = /<span class="timestamp">\s*(\d{4})-(\d{2})-(\d{2})/

/** 글 제목. `<h3 class="post_subject" …><span>제목</span></h3>` */
const SUBJECT_RE = /class="post_subject"[^>]*>\s*<span>([\s\S]*?)<\/span>/

/** 글 작성일. `<span class="view_count date">…<span class="fa fa-clock-o"></span> 2026-09-16 23:34:27</span>` */
const POST_DATE_RE = /class="view_count date">[\s\S]{0,200}?(\d{4})-(\d{2})-(\d{2})\s+\d{2}:\d{2}/

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

/**
 * `<div ...>` 의 짝을 세어 내용만 잘라낸다.
 *
 * 비탐욕 정규식(`[\s\S]*?</div>`)으로 자르면 **중첩 div 가 하나만 생겨도
 * 본문이 앞에서 잘린다.** 클리앙 본문은 `post_article` 안에 `<html><body>`
 * 를 통째로 품고 있어서 중첩이 기본값이다. 그래서 세면서 간다.
 */
function sliceDiv(html: string, openIdx: number): string | null {
  const start = html.indexOf('>', openIdx)
  if (start < 0) return null

  let depth = 1
  const tag = /<\/?div\b/gi
  tag.lastIndex = start + 1
  for (;;) {
    const m = tag.exec(html)
    if (!m) return null
    depth += m[0][1] === '/' ? -1 : 1
    if (depth === 0) return html.slice(start + 1, m.index)
  }
}

export const clienAdapter: ReviewSourceAdapter = {
  key: 'clien',
  displayName: '클리앙 게시글·댓글',

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
  // ⚠️ **이건 "robots 가 없다"가 아니다. 우리에게만 안 보여 준다**(SP-027).
  //    2026-09-17 실측 4조합: 우리 봇 UA → www 404 · apex 404 /
  //    브라우저 UA → www 200(1,691B 규칙) · apex 404.
  //    UA 를 위장해 읽지 않는다(프로브 규칙). 그래서 규칙을 이 파일의
  //    `parseProductRef` 가 코드로 내재화하고 있고 **그게 유일한 방어선이다**
  //    — ROBOTS_DENY / 쿼리 금지 / `/service/board/` 접두 가드.
  //    표식을 달아 진행하는 근거는 그 가드이고, 사람이 인지한 리스크다.
  proceedWhenRobotsUnverified: ['www.clien.net'],

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)
    const reviews: ParsedReview[] = []
    let parseFailures = 0

    // ── 글 본문 ───────────────────────────────────────────────────
    const articleIdx = body.indexOf('class="post_article"')
    const article = articleIdx < 0 ? null : sliceDiv(body, articleIdx)
    const sm = SUBJECT_RE.exec(body)
    const title = sm ? stripHtml(sm[1]) : ''
    const text = article === null ? '' : stripHtml(article)

    if (article === null || (!title && !text)) {
      // 본문 컨테이너가 통째로 사라졌다. 댓글만 읽히면 "수집은 되는데 글이
      // 없는" 상태로 몇 주가 간다(CLAUDE.md §7.1 사례 1).
      parseFailures++
    } else {
      const d = POST_DATE_RE.exec(body)
      reviews.push({
        externalId: p,
        text: [title, text].filter(Boolean).join('\n\n'),
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
        storyId: null,
      })
    }

    // ── 댓글 ──────────────────────────────────────────────────────
    const countMatch = COUNT_RE.exec(body)
    const declared = countMatch ? Number(countMatch[1]) : null

    const anchors: Array<{ id: string; at: number }> = []
    ROW_OPEN.lastIndex = 0
    for (;;) {
      const m = ROW_OPEN.exec(body)
      if (!m) break
      anchors.push({ id: m[1], at: m.index })
    }

    if (declared === null && anchors.length === 0) {
      // 마커도 항목도 없다 = 댓글 영역이 사라졌다. "댓글 0건"과 **다른 사건**이다.
      parseFailures++
    }

    for (let i = 0; i < anchors.length; i++) {
      const chunk = body.slice(anchors[i].at, i + 1 < anchors.length ? anchors[i + 1].at : body.length)
      const vi = chunk.indexOf(VIEW_OPEN)
      if (vi < 0) {
        // 앵커는 있는데 본문 컨테이너가 없다 = 클래스명이 바뀌었다.
        parseFailures++
        continue
      }
      const inner = sliceDiv(chunk, vi)
      if (inner === null) {
        parseFailures++
        continue
      }
      // 댓글 본문 옆에 수정용 hidden input 이 같은 텍스트를 value 로 한 번 더
      // 들고 있다. value 는 태그 **안**이라 stripHtml 의 `<[^>]*>` 에 통째로
      // 지워진다(속성값의 개행 포함). 따로 걷어내지 않는 이유가 그것이다 —
      // 셀프테스트가 "두 번 적히지 않는다"로 이걸 붙잡아 둔다.
      const t = CMT_TIME_RE.exec(chunk)
      const text = stripHtml(inner)
      // 컨테이너는 멀쩡한데 알맹이가 없는 경우(이모티콘만 단 댓글)다.
      // 파서가 깨진 게 아니므로 실패로 세지 않는다 — 저장할 텍스트가 없을 뿐이다.
      if (!text) continue

      reviews.push({
        externalId: `${p}#${anchors[i].id}`,
        text,
        rating: null,
        seller: null,
        authorMasked: null,
        // 다모앙과 달리 댓글에도 **4자리 연도가 붙은 절대시각**이 있다
        // (`<span class="timestamp">2026-09-16 23:37:50`). 화면 표기(`26-09-16`)
        // 말고 이쪽을 읽는다. 없으면 추정하지 않고 null.
        writtenAt: t ? `${t[1]}-${t[2]}-${t[3]}` : null,
        storyId: p,
      })
    }

    // 마커가 말한 수보다 적게 읽혔으면 그 차이가 곧 못 읽은 수다.
    // 클리앙은 댓글 페이저가 없고 한 페이지에 전부 내려준다(실측 0·7·17건).
    // 나중에 페이지네이션이 생기면 여기서 실패로 터진다 — 조용히 누락되지 않는다.
    if (declared !== null && anchors.length < declared) {
      parseFailures += declared - anchors.length
    }

    // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
    return { reviews, nextCursor: null, parseFailures }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { stripHtml, sliceDiv, DENY_PREFIXES }
