// 네이버 블로그 글 본문 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "VOC 소스 3종 실측 — tumblbug · naver_blog · bobaedream (2026-09-17)"
//
// ⚠️⚠️ **이 소스는 이 리포에서 법적 리스크가 가장 높다. SP-030 을 읽고 써라.**
//
//    네이버 서비스 이용약관(2025-07-10 시행)이 우리 행위를 **문장으로 직접
//    지목해 금지**한다:
//
//      "네이버의 사전 허락 없이 자동화된 수단(예: 매크로 프로그램, 로봇(봇),
//       스파이더, 스크래퍼 등)을 이용하여 … 네이버 서비스에 게재된 회원의
//       아이디(ID), 게시물 등을 수집하거나 … 해서는 안 됩니다."
//
//    robots.txt 본문에도 같은 의사가 적혀 있다:
//
//      # BOT ACCESS FOR THE PURPOSES OF AI TRAINING AND RETRIEVAL-AUGMENTED
//      # GENERATION (RAG) IS STRICTLY PROHIBITED.
//      User-agent: ClaudeBot        Disallow: /
//      User-agent: Claude-SearchBot Disallow: /
//
//    우리 UA 토큰은 그 목록에 없고 `/PostView.naver` 도 Disallow 에 없어서
//    **기계 판정은 allowed** 다. 그 판정을 근거로 쓰지 마라 — robots allowed 가
//    약관 allowed 를 뜻하지 않는다. 다모앙(SP-025)은 robots 의 의사 표시였고
//    여기는 약관 본문이다. **상위 리스크다.**
//
//    남헌이 2026-09-17 이 사실을 인지한 채로 수집 진행을 결정했다.
//    그래서 `enabled=false` 로 등록해 사람이 켜야 시작한다. 이 파일을 손대는
//    사람이 맥락을 모르고 확장하지 않도록 여기 적어 둔다.
//
// ── 본문 1건만 수집한다. 댓글은 안 받는다 ─────────────────────────
//
// 댓글은 `https://apis.naver.com/commentBox/cbox9` 라는 **다른 호스트**의 XHR
// 로만 온다(실측: 페이지에 `cbox` 문자열이 99번 나오지만 전부 CSS·설정이고
// `u_cbox_contents` 는 0개다). 어댑터 상수 HOST 원칙에 어긋나고 그 호스트
// robots 를 따로 재야 한다. 그래서 **댓글 수집 경로를 아예 만들지 않았다.**
//
// 그래서 "댓글 영역 소실" 판정 로직도 넣지 않는다. 건강도는 **본문 컨테이너
// 소실 하나**에만 건다 — 없는 기능의 실패를 세면 신호가 흐려진다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://blog.naver.com'

/**
 * 경로를 `/PostView.naver` **하나로** 한정하고 blogId·logNo 를 둘 다 요구한다.
 *
 * ⚠️ 이 가드가 이 어댑터에서 가장 중요한 줄이다. 이유가 둘이다.
 *
 * 1. **예쁜 URL 은 빈 껍데기다.** `blog.naver.com/<blogId>/<logNo>` 는
 *    HTTP 200 에 **2,817 bytes** 짜리 iframe 프레임셋을 준다(실측). 같은 글의
 *    PostView 응답은 276,193 bytes 다. 예쁜 URL 을 허용하면 "200 인데 내용 0"
 *    을 조용히 수집한다(CLAUDE.md §7.1 사례 2와 같은 함정).
 *
 * 2. **robots 금지 경로가 구조적으로 못 들어온다.** robots 가 막은
 *    `/PostList.naver` `/PostPrint.naver` `/NBlogPostPreview.naver`
 *    `/PostPreview.naver` `comment.naver` `/prologue/` 등이 전부 여기서 걸린다.
 *    러너의 robots 판정은 쿼리를 떼고 보므로(SP-026) 공용 안전장치만 믿을 수 없다.
 */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  if (!p) return null

  const qi = p.indexOf('?')
  if (qi < 0) return null
  if (p.slice(0, qi) !== '/PostView.naver') return null

  const q = new URLSearchParams(p.slice(qi + 1))
  const blogId = q.get('blogId')
  const logNo = q.get('logNo')
  // blogId 는 네이버 아이디 규칙(영숫자·`_`). 경로 조작 문자가 낄 자리를 없앤다.
  if (!blogId || !/^[A-Za-z0-9_]+$/.test(blogId)) return null
  if (!logNo || !/^\d+$/.test(logNo)) return null

  // 파라미터 순서·군더더기를 정규화한다. 안 하면 같은 글이 서로 다른
  // externalId 로 두 번 쌓인다.
  return `/PostView.naver?blogId=${blogId}&logNo=${logNo}`
}

/** `<blogId>:<logNo>`. 지문의 1순위다. */
function externalIdOf(path: string | null): string | null {
  if (!path) return null
  const q = new URLSearchParams(path.slice(path.indexOf('?') + 1))
  return `${q.get('blogId')}:${q.get('logNo')}`
}

/** 본문 컨테이너. 스마트에디터 ONE 이 내는 마커다. */
const BODY_OPEN = /<div class="se-main-container"[^>]*>/

/** 제목. `<meta property="og:title" content="…"/>` */
const TITLE_RE = /<meta property="og:title" content="([^"]*)"/

/** 발행일. `<span class="se_publishDate pcol2">2026. 8. 4. 11:00</span>` */
const DATE_RE = /<span class="se_publishDate[^"]*">\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
}

function stripHtml(s: string): string {
  return decodeEntities(
    s
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*>/g, ''),
  )
    // 스마트에디터가 빈 줄 자리에 제로폭 공백을 넣는다. 지우지 않으면
    // 본문이 "글자는 있는데 읽을 수 없는" 상태가 된다.
    .replace(/​/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * `<div ...>` 의 짝을 세어 내용만 잘라낸다.
 *
 * 본문이 `se-component` > `se-section` > … 으로 깊게 중첩돼 있어서,
 * 비탐욕 정규식으로 자르면 **첫 문단에서 끊긴다.** 잘린 본문은 텍스트가
 * 있으니 실패로도 안 잡혀 조용히 데이터가 상한다(damoang.ts 와 같은 이유).
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

export const naverBlogAdapter: ReviewSourceAdapter = {
  key: 'naver_blog_post',
  displayName: '네이버 블로그 본문',

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

    const bm = BODY_OPEN.exec(body)
    const inner = bm ? sliceDiv(body, bm.index) : null

    if (inner === null) {
      // 본문 컨테이너가 없다. 예쁜 URL 껍데기(200/2.8KB)·404 껍데기·
      // 스킨 변경이 전부 여기 걸린다. **이 소스의 유일한 건강도 신호다.**
      parseFailures++
    } else {
      const tm = TITLE_RE.exec(body)
      const title = tm ? decodeEntities(tm[1]).trim() : ''
      const text = [title, stripHtml(inner)].filter(Boolean).join('\n\n')
      const d = DATE_RE.exec(body)

      if (!text) {
        // 컨테이너는 있는데 알맹이가 없다 — 구조가 바뀐 쪽에 가깝다.
        parseFailures++
      } else {
        reviews.push({
          externalId: externalIdOf(p),
          text,
          rating: null,
          seller: null,
          authorMasked: null,
          writtenAt: d ? `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}` : null,
          // 댓글을 안 받으므로 상위 문서 개념이 없다.
          storyId: null,
        })
      }
    }

    // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
    return { reviews, nextCursor: null, parseFailures }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
  // 공식 API 가 아니다. 403 이 오면 그게 답이다.
}

export const __internal = { stripHtml, sliceDiv, externalIdOf, decodeEntities }
