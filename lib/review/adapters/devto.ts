// dev.to(DEV Community) 태그 글 본문·댓글 어댑터 — 공개 Forem API(JSON).
//
// ⛔ **약관이 상업적 이용·복제를 금지한다. 남헌이 그 리스크를 알고 강행을 결정했다(2026-09-30).**
//    dev.to 약관 §2: "Permission is granted to temporarily download one copy of the materials …
//    for personal, non-commercial transitory viewing only … you may not: modify or copy the materials;
//    use the materials for any commercial purpose" (ops/state/source-review-queue.md).
//    우회(UA 위장·IP 로테이션·로그인·API 키)는 하지 않는다 — 403/429 가 오면 러너가 멈추고 소스를 끈다.
//
// 실측(2026-09-30, 우리 UA, 요청 5회 · 간격 6.5초):
//   GET /robots.txt                        → 200 · 450B · `*` 는 /search?q=·/admin/·/mod/·/reactions? 등만 Disallow.
//                                            /api/articles · /api/comments 는 막지 않는다(허용).
//   GET /api/articles?tag=saas&per_page=5  → 200 JSON 배열 5건. id·published_at·comments_count·user. 본문 없음.
//   GET /api/articles/4773546              → 200 JSON · body_markdown 4,461자.
//   GET /api/articles?tag=saas&top=30&…    → 200 JSON (댓글 있는 글을 찾으려고)
//   GET /api/comments?a_id=4590483         → 200 JSON 배열 6건 · body_html · children(대댓글 트리) · user.
//   로그인·키 없이 전부 온다. 픽스처: fixtures/review/devto/ (user 객체는 가렸다)
//
// 타깃 형식: `board:<slug>` 하나뿐이다(글 1건 `url:` 은 만들지 않았다 — 필요해지면 그때).
//   목록 1요청 → 새 글마다 본문 1요청 + (목록에서 댓글이 있던 글만) 댓글 1요청.
//   ⚠️ 글 id 는 전역 증가 숫자다 → 증분 `last` 로 그대로 쓴다.
//   ponytail: 댓글은 "목록에서 처음 봤을 때 이미 달린 것"만 받는다(disquiet·velog 와 같은 한계).
//   나중에 달린 댓글이 필요해지면 며칠 지난 글을 한 번 더 도는 두 번째 패스를 붙여라.
//
// 작성자는 저장하지 않는다(authorMasked=null). API 가 이름·핸들·깃허브 계정을 준다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { BOARD_QUEUE_MAX, type BoardListItem, decodeBoardCursor, encodeBoardCursor, nextBoardCursor, parseBoardRef } from '../types.ts'
import { kstDate } from './velog.ts'
import { __internal as disquiet } from './disquiet.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://dev.to'

/** 게시판 slug → dev.to 태그. 표에 없는 slug 는 거절한다(0요청 타깃이 되지 않게). 실측한 태그만 둔다. */
export const BOARDS: Record<string, string> = { saas: 'saas' }

/** 큐에 담기는 경로는 이 두 형태뿐이다. 숫자 id 로 어댑터가 조립한다(types.ts 규약 4). */
const ARTICLE_RE = /^\/api\/articles\/(\d{1,12})$/
const COMMENTS_RE = /^\/api\/comments\?a_id=(\d{1,12})$/

const listPath = (tag: string) => `/api/articles?tag=${encodeURIComponent(tag)}&per_page=30`

interface DevtoComment {
  id_code?: unknown
  created_at?: unknown
  body_html?: unknown
  children?: unknown
}

function parseList(body: string, prev: { q: string[]; last: string | null }, lastReviewAt: string | null | undefined): ParseResult {
  let arr: unknown
  try {
    arr = JSON.parse(body)
  } catch {
    arr = null
  }
  // 배열이 아니다 = 에러 JSON·HTML·챌린지. "새 글 0건"이 아니다(§7.1).
  if (!Array.isArray(arr)) return { reviews: [], nextCursor: encodeBoardCursor(prev), parseFailures: 1, pauseRun: true }

  const withComments = new Set<string>()
  const items: BoardListItem[] = []
  let parseFailures = 0
  for (const a of arr as Array<Record<string, unknown>>) {
    const id = typeof a?.id === 'number' && Number.isSafeInteger(a.id) ? String(a.id) : null
    if (!id) {
      parseFailures++
      continue
    }
    if (typeof a.comments_count === 'number' && a.comments_count > 0) withComments.add(id)
    items.push({ id, path: `/api/articles/${id}`, writtenAt: kstDate(a.published_at) })
  }

  const next = nextBoardCursor(items, prev, lastReviewAt)
  // 본문 경로 뒤에 (댓글이 있던 글만) 댓글 경로를 끼운다. 큐 상한은 요청 수 기준이라 다시 자른다.
  const q = next.q
    .flatMap((p) => {
      const id = ARTICLE_RE.exec(p)![1]
      return withComments.has(id) ? [p, `/api/comments?a_id=${id}`] : [p]
    })
    .slice(0, BOARD_QUEUE_MAX)

  return { reviews: [], nextCursor: encodeBoardCursor({ q, last: next.last }), parseFailures, pauseRun: q.length === 0 }
}

function parseArticle(body: string, id: string): ParseResult {
  const fail: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }
  let a: Record<string, unknown> | null
  try {
    a = JSON.parse(body)
  } catch {
    return fail
  }
  // 요청한 글이 맞는가 + 본문이 있는가. 200 에 에러 JSON(`{"error":"not found"}`)이 와도 여기서 실패다.
  if (!a || String(a.id) !== id || typeof a.body_markdown !== 'string') return fail
  const title = typeof a.title === 'string' ? a.title.trim() : ''
  const text = [title, a.body_markdown.trim()].filter(Boolean).join('\n\n')
  if (!text) return fail
  return {
    reviews: [{ externalId: `article:${id}`, text, rating: null, seller: null, authorMasked: null, writtenAt: kstDate(a.published_at), storyId: id }],
    nextCursor: null,
    parseFailures: 0,
  }
}

function parseComments(body: string, id: string): ParseResult {
  let arr: unknown
  try {
    arr = JSON.parse(body)
  } catch {
    arr = null
  }
  if (!Array.isArray(arr)) return { reviews: [], nextCursor: null, parseFailures: 1 }

  const reviews: ParsedReview[] = []
  let parseFailures = 0
  // 대댓글까지 평탄화한다. API 가 트리 전체를 한 번에 준다.
  const walk = (list: DevtoComment[]) => {
    for (const c of list) {
      if (typeof c?.id_code !== 'string' || !/^[a-z0-9]{1,16}$/.test(c.id_code) || typeof c.body_html !== 'string') {
        parseFailures++
        continue
      }
      const text = disquiet.stripHtml(c.body_html)
      // 삭제된 댓글은 본문이 비거나 "[deleted]"/"[hidden by post author]" 로 온다 — 파서 고장이 아니다.
      if (text && !/^\[(deleted|hidden[^\]]*)\]$/i.test(text)) {
        reviews.push({ externalId: `article:${id}#${c.id_code}`, text, rating: null, seller: null, authorMasked: null, writtenAt: kstDate(c.created_at), storyId: id })
      }
      if (Array.isArray(c.children)) walk(c.children as DevtoComment[])
    }
  }
  walk(arr as DevtoComment[])
  return { reviews, nextCursor: null, parseFailures }
}

/** 큐 경로 → 본문 또는 댓글 파서. 모르는 형태면 null(요청하지 않는다). */
function queued(p: string): { kind: 'article' | 'comments'; id: string } | null {
  const a = ARTICLE_RE.exec(p)
  if (a) return { kind: 'article', id: a[1] }
  const c = COMMENTS_RE.exec(p)
  return c ? { kind: 'comments', id: c[1] } : null
}

export const devtoAdapter: ReviewSourceAdapter = {
  key: 'devto',
  displayName: 'dev.to 태그 글·댓글',

  // disquiet·velog 게시판과 같다: board: 타깃은 큐를 비워도 닫지 않는다.
  incrementalOnly: true,

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    if (!slug || !(slug in BOARDS)) return null
    const cur = decodeBoardCursor(target.cursor)
    if (cur.q.length === 0) return { url: `${HOST}${listPath(BOARDS[slug])}` }
    return queued(cur.q[0]) ? { url: `${HOST}${cur.q[0]}` } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const cur = decodeBoardCursor(ctx.cursor)
    if (cur.q.length === 0) return parseList(body, cur, ctx.lastReviewAt)
    // 큐가 있으면 이 응답은 큐 머리다. 본문을 보고 추측하지 않는다(types.ts 규약 2).
    const rest = { q: cur.q.slice(1), last: cur.last }
    const head = queued(cur.q[0])
    const res = !head
      ? { reviews: [], nextCursor: null, parseFailures: 1 }
      : head.kind === 'article'
        ? parseArticle(body, head.id)
        : parseComments(body, head.id)
    return { ...res, nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
  },

  // quotaMarkers 없음 = 모든 403/429 를 차단으로 본다(키 없는 공개 API).
}

export const __internal = { parseList, parseArticle, parseComments, queued }
