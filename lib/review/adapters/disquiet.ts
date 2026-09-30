// 디스콰이엇(disquiet.io) 게시글·댓글 어댑터.
//
// ⛔ **약관이 자동 수집을 금지한다. 남헌이 그 리스크를 알고 켰다(2026-09-28).**
//    `disquiet.io/terms` → `www.relate.kr/terms`(픽셀릭코리아 통합 약관) 금지행위 조항:
//      "회사의 사전 허락 없이 자동화된 수단(매크로·스크래퍼 등)으로 가입·로그인·게시·수집"
//    근거: docs/review-source-findings-round5-b.md §디스콰이엇. 이 파일을 넓히는 사람은
//    그 결정이 "이 범위(공개 글·댓글, 목록 1페이지, 보수적 상한)"에 대한 것임을 알고 넓혀라.
//    우회(UA 위장·IP 로테이션·로그인)는 하지 않는다 — 403/429 가 오면 러너가 그 실행을
//    멈추고 소스를 끈다(runner.ts `aborted` · health.ts 차단 → store.ts enabled=false).
//
// 실측(2026-09-28, 우리 UA `solutionarchive-review-collector/0.1`, 요청 6회 · 간격 4초):
//   GET /robots.txt     → 200 · 88B · `Allow: /` + `Disallow: /passwordless` 뿐
//   GET /               → 200 · 131,003B · 서버 렌더 피드. `<article id="disquiet_post_<숫자>">` 20건,
//                         숫자 id 가 연속 내림차순(6568→6549) = 전체 글 최신순이다. 인기순이 아니다.
//   GET /posts/<slug>   → 200 · 24~25KB · 본문 `.disquiet-prose` + 댓글 `#comments_list` 가 정적 HTML.
//                         로그인 없이 댓글까지 보인다(댓글 **쓰기**만 로그인 필요).
//   GET /posts/zzzzzz   → 404 · Relate "Page not found"
//   픽스처: fixtures/review/disquiet/ (본문 영역은 원본 그대로, svg·사이드바만 걷었다)
//   2026-09-25 프로브(scripts/voc-probe-disquiet.mjs)는 개편 전 마크업이었다 — 그때 링크는
//   `href="/posts/<id>"` 였고 지금 카드는 `data-disquiet--post-card-url-value` 에 담긴다.
//
// 타깃 형식이 둘이다(clien.ts 와 같은 규약 — types.ts 의 `board:` 블록):
//   `url:/posts/D1CXy9`  글 1건
//   `board:feed`         홈 피드 1페이지 → 새 글 → 그 글의 댓글. 증분은 숫자 글 id(`last`).
//     ⚠️ 피드 2페이지(`/?format=turbo_stream&page=2`)는 가지 않는다. robots 는 막지 않지만
//        하루 새 글이 ~10건이라 1페이지(20건)로 충분하고, 요청을 늘릴 이유가 없다.
//
// ⚠️ **글 경로 slug 는 숫자 id 에서 조립할 수 없다**(`/posts/D1CXy9` ↔ `disquiet_post_6550`).
//    그래서 types.ts 규약 4("href 를 믿지 말고 id 로 조립")를 그대로 못 지킨다. 대신 slug 를
//    `[A-Za-z0-9_-]{1,32}` 로만 받아 `/posts/<slug>` 로 **다시 조립**한다 — 호스트·`..`·`//` 가
//    낄 자리가 없다. 순서 비교(`last`)에는 slug 가 아니라 숫자 id 를 쓴다.
//
// ⚠️ **글 페이지에는 댓글 개수 마커가 없다.** 목록 카드에만 "댓글 N개" 가 있다. 그래서
//    "댓글 0건"과 "댓글 영역 소실"은 `#comments_list` 컨테이너 유무로만 가른다.
//    ponytail: 댓글 몇 개가 조용히 빠지는 변화는 못 잡는다. 필요해지면 목록의 N 을
//    커서 큐에 같이 실어 대조해라.
//
// 작성자 이름은 저장하지 않는다(authorMasked=null). 디스콰이엇은 실명·프로필 링크가 붙는다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { type BoardListItem, decodeBoardCursor, encodeBoardCursor, nextBoardCursor, parseBoardRef } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'
import { kstDate } from './velog.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://disquiet.io'

/** 게시판 slug → 목록 경로. 표에 없는 slug 는 거절한다(0요청 타깃이 되지 않게). */
export const BOARDS: Record<string, string> = { feed: '/' }

const POST_RE = /^\/posts\/[A-Za-z0-9_-]{1,32}$/

/** `url:/posts/D1CXy9` → `/posts/D1CXy9`. 쿼리·다른 경로는 null. */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  return p !== null && POST_RE.test(p) ? p : null
}

/** 피드 카드. 숫자 id 와 글 slug 가 같은 여는 태그 안에 있다(속성 사이 개행 포함). */
const CARD_RE = /<article id="disquiet_post_(\d+)"[^>]*?data-disquiet--post-card-url-value="\/posts\/([A-Za-z0-9_-]{1,32})"/g
const TIME_RE = /<time datetime="([^"]+)"/
const COMMENT_RE = /<div id="disquiet_comment_(\d+)"/g
const COMMENT_TEXT_RE = /<p class="[^"]*whitespace-pre-wrap[^"]*">([\s\S]*?)<\/p>/

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&') // 맨 마지막 — 먼저 풀면 `&amp;lt;` 가 `<` 가 된다
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** `<div …>` 의 짝을 세어 안쪽만 자른다(clien.ts 와 같은 이유 — 비탐욕 정규식은 중첩에서 잘린다). */
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

function parseBoardList(body: string, prev: { q: string[]; last: string | null }, lastReviewAt: string | null | undefined): ParseResult {
  const anchors: Array<{ id: string; slug: string; at: number }> = []
  CARD_RE.lastIndex = 0
  for (let m = CARD_RE.exec(body); m; m = CARD_RE.exec(body)) anchors.push({ id: m[1], slug: m[2], at: m.index })

  const items: BoardListItem[] = anchors.map((a, i) => {
    const chunk = body.slice(a.at, i + 1 < anchors.length ? anchors[i + 1].at : body.length)
    const t = TIME_RE.exec(chunk)
    return { id: a.id, path: `/posts/${a.slug}`, writtenAt: t ? kstDate(t[1]) : null }
  })

  const next = nextBoardCursor(items, prev, lastReviewAt)
  return {
    reviews: [],
    nextCursor: encodeBoardCursor(next),
    // 카드가 0개 = 피드 마크업이 바뀌었거나 로그인 벽·챌린지 페이지다. "새 글 없음"이 아니다(§7.1).
    parseFailures: anchors.length === 0 ? 1 : 0,
    pauseRun: next.q.length === 0,
  }
}

/** 글 1건(본문 + 댓글). `url:` · `board:` 가 공유한다. */
function parsePost(body: string, p: string | null): ParseResult {
  const fail: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }
  if (!p) return fail

  // 우리가 요청한 글이 맞는가. 로그인 벽·404·챌린지 페이지는 canonical 이 없거나 다르다 —
  // 200 이라도 여기서 실패로 떨어진다(§7.1 사례 2: 상태 코드만 보지 않는다).
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(body)
  if (!canon || canon[1] !== `${HOST}${p}`) return fail

  const reviews: ParsedReview[] = []
  let parseFailures = 0

  const proseIdx = body.indexOf('class="prose prose-neutral disquiet-prose"')
  const prose = proseIdx < 0 ? null : sliceDiv(body, proseIdx)
  const text = prose === null ? '' : stripHtml(prose)
  if (!text) {
    // 본문 컨테이너 소실. 댓글만 읽히면 "수집은 되는데 글이 없는" 상태로 몇 주 간다.
    parseFailures++
  } else {
    // 글 머리(header)의 첫 <time> 이 작성 시각이다. 본문보다 앞에 있다.
    const t = TIME_RE.exec(body.slice(0, proseIdx))
    reviews.push({
      externalId: p,
      text,
      rating: null,
      seller: null,
      authorMasked: null,
      writtenAt: t ? kstDate(t[1]) : null,
      storyId: null,
    })
  }

  const listIdx = body.indexOf('id="comments_list"')
  if (listIdx < 0) {
    // 댓글 영역이 사라졌다. 이 사이트는 댓글 0건이어도 빈 컨테이너가 온다(실측 OGCwVp).
    return { reviews: reviews.map((r) => ({ ...r, sourceUrl: `${HOST}${p}` })), nextCursor: null, parseFailures: parseFailures + 1 }
  }

  const tail = body.slice(listIdx)
  const anchors: Array<{ id: string; at: number }> = []
  COMMENT_RE.lastIndex = 0
  for (let m = COMMENT_RE.exec(tail); m; m = COMMENT_RE.exec(tail)) anchors.push({ id: m[1], at: m.index })

  for (let i = 0; i < anchors.length; i++) {
    // 대댓글은 부모 안에 중첩되지만, 부모의 본문 <p> 가 대댓글 앵커보다 먼저 온다.
    // 그래서 "이 앵커 ~ 다음 앵커" 구간의 첫 <p> 가 그 댓글 것이다.
    const chunk = tail.slice(anchors[i].at, i + 1 < anchors.length ? anchors[i + 1].at : tail.length)
    const tm = COMMENT_TEXT_RE.exec(chunk)
    if (!tm) {
      parseFailures++
      continue
    }
    const ctext = stripHtml(tm[1])
    if (!ctext) continue // 컨테이너는 있는데 알맹이가 없다 — 파서 고장이 아니다
    const t = TIME_RE.exec(chunk)
    reviews.push({
      externalId: `${p}#${anchors[i].id}`,
      text: ctext,
      rating: null,
      seller: null,
      authorMasked: null,
      writtenAt: t ? kstDate(t[1]) : null,
      storyId: p,
    })
  }

  // 글·댓글 모두 글 주소로 간다(공개 VOC 카드의 "출처 보기").
  return { reviews: reviews.map((r) => ({ ...r, sourceUrl: `${HOST}${p}` })), nextCursor: null, parseFailures }
}

export const disquietAdapter: ReviewSourceAdapter = {
  key: 'disquiet',
  displayName: '디스콰이엇 게시글·댓글',

  // clien·okky 와 같다(남헌 2026-09-23 Q3(a)): board: 타깃은 큐를 비워도 닫지 않고,
  // 연속 0건 3회 안전장치(runner.ts emptyClose)만 닫는다.
  incrementalOnly: true,

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    if (slug) {
      if (!(slug in BOARDS)) return null
      const cur = decodeBoardCursor(target.cursor)
      if (cur.q.length === 0) return { url: `${HOST}${BOARDS[slug]}` }
      const p = parseProductRef(`url:${cur.q[0]}`)
      return p ? { url: `${HOST}${p}` } : null
    }
    const p = parseProductRef(target.productRef)
    if (!p || target.cursor) return null // 1글=1요청
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const slug = parseBoardRef(ctx.productRef)
    if (slug) {
      const cur = decodeBoardCursor(ctx.cursor)
      if (cur.q.length > 0) {
        // 큐가 있으면 이 응답은 큐 맨 앞 글이다. 본문을 보고 추측하지 않는다(types.ts 규약 2).
        const rest = { q: cur.q.slice(1), last: cur.last }
        const res = parsePost(body, parseProductRef(`url:${cur.q[0]}`))
        return { ...res, nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
      }
      return parseBoardList(body, cur, ctx.lastReviewAt)
    }
    return parsePost(body, parseProductRef(ctx.productRef))
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다(스크래핑 소스).
}

export const __internal = { parseBoardList, parsePost, stripHtml }
