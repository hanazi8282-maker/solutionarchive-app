// 다모앙 게시글·댓글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 — damoang · 82cook (2026-09-16)"
//
// ⚠️ **남헌 2026-09-16 결정을 알고 써라(SP-025).** 다모앙 robots.txt 는
//    anthropic-ai·Claude-Web·GPTBot 등 AI 학습 크롤러와 `<이름>/0.1` 꼴의
//    자칭 수집기(trend-archive·CollectorHub)를 명시적으로 거부한다. 우리 UA 는
//    그 목록에 아직 없어 기계 판정은 allowed 지만, 사이트의 의사는 우리 용도를
//    덮는다. 그 사실을 인지한 채로 수집을 진행하기로 **사람이 결정**했다.
//    이 파일을 손대는 사람이 그 맥락을 모르고 확장하지 않도록 여기 적어 둔다.
//
// ⚠️ **1글=1요청이다.** 댓글 페이지네이션을 붙이지 마라.
//    robots 가 `Disallow: /*?page=` 와 `/*&page=` 를 걸어 뒀는데, 러너는
//    robots 판정에 쿼리스트링을 넘기지 않는다(runner.ts:153 — u.pathname 만).
//    즉 우리가 `?page=N` 을 만들면 **안전장치가 그 위반을 못 막는다.**
//    붙이려면 러너부터 고쳐라(SP-026).
//
// 수집 단위는 상품이 아니라 글 1건이다. 글 본문 1건 + 댓글 N건 = 리뷰 N+1건.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://damoang.net'

/** `url:/free/7341567` → `/free/7341567`. 규칙 위반이면 null. */
export function parseProductRef(productRef: string): string | null {
  return parseUrlRef(productRef)
}

/**
 * 댓글 수 마커. `<h2>댓글 <span ...>(13)</span></h2>`
 *
 * ⚠️ 이 마커가 **"댓글 0건"과 "댓글 영역이 사라짐"을 가르는 유일한 근거**다.
 *    마커도 없고 항목도 없으면 후자다(CLAUDE.md §7.1).
 */
const COUNT_RE = /댓글\s*<span[^>]*>\s*\((\d+)\)/

/** 댓글 앵커. `<li id="c_7341577" ... class="comment-item ...">` */
const LI_OPEN = /<li id="(c_\d+)"/g

const BODY_CLASS = 'class="comment-body'

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
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * `<div ...>` 의 짝을 세어 내용만 잘라낸다.
 *
 * 비탐욕 정규식(`[\s\S]*?</div>`)으로 자르면 **중첩 div 가 하나만 생겨도
 * 본문이 앞에서 잘린다.** 잘린 본문은 실패로도 안 잡혀서(텍스트가 있으니)
 * 조용히 데이터가 상한다. 그래서 세면서 간다.
 */
function sliceDiv(html: string, openIdx: number): string | null {
  const start = html.indexOf('>', openIdx)
  if (start < 0) return null

  let depth = 1
  let i = start + 1
  const tag = /<\/?div\b/gi
  tag.lastIndex = i
  for (;;) {
    const m = tag.exec(html)
    if (!m) return null
    depth += m[0][1] === '/' ? -1 : 1
    if (depth === 0) return html.slice(start + 1, m.index)
    i = tag.lastIndex
    if (i > html.length) return null
  }
}

/** 글 본문·작성일은 JSON-LD(schema.org DiscussionForumPosting)에서 읽는다. */
function readJsonLd(body: string): { headline: string; text: string; datePublished: string } | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  for (;;) {
    const m = re.exec(body)
    if (!m) return null
    let doc: unknown
    try {
      doc = JSON.parse(m[1])
    } catch {
      continue // 깨진 블록 하나가 다음 블록까지 버리게 두지 않는다
    }
    const list = Array.isArray(doc) ? doc : [doc]
    for (const node of list) {
      if (node && typeof node === 'object' && (node as Record<string, unknown>)['@type'] === 'DiscussionForumPosting') {
        const n = node as Record<string, unknown>
        return {
          headline: typeof n.headline === 'string' ? n.headline : '',
          text: typeof n.text === 'string' ? n.text : '',
          datePublished: typeof n.datePublished === 'string' ? n.datePublished : '',
        }
      }
    }
  }
}

export const damoangAdapter: ReviewSourceAdapter = {
  key: 'damoang',
  displayName: '다모앙 게시글·댓글',

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
    const ld = readJsonLd(body)
    if (!ld || (!ld.headline && !ld.text)) {
      // 본문 컨테이너가 통째로 사라진 것이다. 댓글만 읽히면 "수집은 되는데
      // 글이 없는" 상태로 몇 주가 간다(CLAUDE.md §7.1 사례 1).
      parseFailures++
    } else {
      // ponytail: JSON-LD 의 text 는 약 200자에서 잘린다(실측 160자).
      //   제목·작성일이 여기만 안정적으로 있어서 이걸 쓴다. 전문이 필요해지면
      //   HTML 의 `#...-post-content` / `.prose` 를 읽어라 — 다만 그 id 는
      //   게시판마다 달라 보이므로 그때 픽스처를 새로 떠야 한다.
      reviews.push({
        externalId: p,
        text: [ld.headline, ld.text].filter(Boolean).join('\n\n'),
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: /^\d{4}-\d{2}-\d{2}/.test(ld.datePublished) ? ld.datePublished.slice(0, 10) : null,
        storyId: null,
      })
    }

    // ── 댓글 ──────────────────────────────────────────────────────
    const countMatch = COUNT_RE.exec(body)
    const declared = countMatch ? Number(countMatch[1]) : null

    const anchors: Array<{ id: string; at: number }> = []
    LI_OPEN.lastIndex = 0
    for (;;) {
      const m = LI_OPEN.exec(body)
      if (!m) break
      anchors.push({ id: m[1], at: m.index })
    }

    if (declared === null && anchors.length === 0) {
      // 마커도 항목도 없다 = 댓글 영역이 사라졌다. "댓글 0건"과 **다른 사건**이다.
      parseFailures++
    }

    for (let i = 0; i < anchors.length; i++) {
      const chunk = body.slice(anchors[i].at, i + 1 < anchors.length ? anchors[i + 1].at : body.length)
      const bi = chunk.indexOf(BODY_CLASS)
      if (bi < 0) {
        // 앵커는 있는데 본문 컨테이너가 없다 = 클래스명이 바뀌었다.
        parseFailures++
        continue
      }
      const inner = sliceDiv(chunk, bi)
      if (inner === null) {
        parseFailures++
        continue
      }
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
        // 화면 표기가 `09.15` 라 **연도가 없다.** JSON-LD 의 comment[] 에는
        // ISO 가 있지만 일부만 실어 준다(실측: 댓글 13건 중 3건). 순서로
        // 맞추면 어긋난 값을 조용히 붙이게 되므로 채우지 않는다.
        writtenAt: null,
        storyId: p,
      })
    }

    // 마커가 말한 수보다 적게 읽혔으면 그 차이가 곧 못 읽은 수다.
    if (declared !== null && anchors.length < declared) {
      parseFailures += declared - anchors.length
    }

    // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
    // 나중에 달린 댓글을 다시 받으려면 사람이 DB 에서 status='active' 로
    // 되돌려야 한다(자동 재활성화는 만들지 않았다).
    return { reviews, nextCursor: null, parseFailures }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
  // 개인이 운영하는 커뮤니티라 "정상적인 쿼터 소진" 개념이 없다.
}

export const __internal = { stripHtml, sliceDiv, readJsonLd }
