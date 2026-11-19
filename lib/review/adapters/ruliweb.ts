// 루리웹 공개 게시판(bbs.ruliweb.com) 어댑터 — v71cu S5b. 남헌 2026-11-19 결정(override='owner_2026-11-19', quote_policy='none').
//
// 실측(2026-11-19, 우리 UA, 요청 3회·간격 8초): robots.txt 200 — `*` 은 /search·/timeline·/allbbs·/member 와 정렬·분류·검색 쿼리(`*cate=`·`*view=`·`*orderby=`·`*range=` 등)를 Disallow.
//   → 우리는 쿼리 없는 `/community/board/<id>` 와 `/community/board/<id>/read/<n>` 만 부른다(소스 행 robots 라벨 'disallowed' 는 쿼리 금지 규칙 때문이다).
//   GET /community/board/300143 → 200 HTML: 일반 글 행 `tr.table_body.blocktarget`(공지는 `notice`, 타 게시판 베스트는 `best`), 글 링크 `.../board/<id>/read/<n>`.
//   GET /community/board/300143/read/N → 200 HTML: 제목 span.subject_inner_text · 본문 div.view_content(</article> 까지) · 시각 span.regdate. 로그인·캡차 없음.
// 댓글은 본문 HTML 에 없다(스크립트 렌더링) — 글 본문만 받는다. 작성자·닉네임·회원번호는 읽지 않는다.
// ponytail: 게시판 1곳(유머 300143)만 실측했다. 늘리려면 표에 한 줄 더하고 robots 의 쿼리 금지에 걸리지 않는 기본 주소만 쓴다.

import type { ParseContext, ParseResult, ReviewSourceAdapter, TargetState } from '../types.ts'
import { BOARD_QUEUE_MAX, type BoardListItem, decodeBoardCursor, encodeBoardCursor, nextBoardCursor, parseBoardRef } from '../types.ts'
import { __internal as clien } from './clien.ts'

export const RULIWEB_HOST = 'https://bbs.ruliweb.com'
/** slug → 게시판 번호. */
export const RULIWEB_BOARDS: Record<string, string> = { humor: '300143' }

const POST_RE = /^\/community\/board\/(\d{1,10})\/read\/(\d{1,12})$/

/** 식별정보 제거(v70 §10): 이메일 → [email], @멘션 → @user. */
const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]').replace(/(^|[\s(])@[^\s,.)!?]{1,30}/g, '$1@user')

const postPath =(board: string, no: string) => `/community/board/${board}/read/${no}`

function parseList(body: string, board: string, prev: { q: string[]; last: string | null }, lastReviewAt: string | null | undefined): ParseResult {
  // 일반 글 행만: class 가 정확히 `table_body blocktarget`. 공지(notice)·타 게시판 베스트(best)·광고 틀(list_inner)은 걸러진다.
  const rows = [...body.matchAll(/<tr class="table_body blocktarget">([\s\S]*?)<\/tr>/g)].map((m) => m[1])
  const items: BoardListItem[] = []
  const seen = new Set<string>()
  const linkRe = new RegExp(`/community/board/${board}/read/(\\d{1,12})`)
  for (const r of rows) {
    const m = linkRe.exec(r)
    if (!m || seen.has(m[1])) continue
    seen.add(m[1])
    const t = /<td class="time">\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(r)
    items.push({ id: m[1], path: postPath(board, m[1]), writtenAt: t ? `${t[1]}-${t[2]}-${t[3]}` : null })
  }
  items.sort((a, b) => Number(b.id) - Number(a.id))
  const next = nextBoardCursor(items, prev, lastReviewAt)
  return { reviews: [], nextCursor: encodeBoardCursor({ q: next.q.slice(0, BOARD_QUEUE_MAX), last: next.last }), parseFailures: rows.length === 0 ? 1 : 0, pauseRun: next.q.length === 0 }
}

function parsePost(body: string, path: string): ParseResult {
  const at = body.indexOf('class="view_content')
  const end = at < 0 ? -1 : body.indexOf('</article>', at)
  if (at < 0 || end < 0) return { reviews: [], nextCursor: null, parseFailures: 1 }
  const tm = /class="subject_inner_text">([\s\S]*?)<\/span>/.exec(body)
  const title = tm ? clien.stripHtml(tm[1]) : ''
  const text = scrub(clien.stripHtml(body.slice(body.indexOf('>', at) + 1, end)))
  if (!title && !text) return { reviews: [], nextCursor: null, parseFailures: 1 }
  const d = /class="regdate">\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(body)
  return {
    reviews: [{ externalId: path, text: [title, text].filter(Boolean).join('\n\n'), rating: null, seller: null, authorMasked: null, writtenAt: d ? `${d[1]}-${d[2]}-${d[3]}` : null, storyId: null }],
    nextCursor: null,
    parseFailures: 0,
  }
}

export const ruliwebAdapter: ReviewSourceAdapter = {
  key: 'ruliweb',
  displayName: '루리웹 공개 게시판',
  incrementalOnly: true,
  abortOnChallenge: true,
  isChallenge: (body: string) => body.trim() === '' || /Just a moment|challenges\.cloudflare\.com|cf-chl/i.test(body),

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    if (!slug || !(slug in RULIWEB_BOARDS)) return null
    const board = RULIWEB_BOARDS[slug]
    const cur = decodeBoardCursor(target.cursor)
    if (cur.q.length === 0) return { url: `${RULIWEB_HOST}/community/board/${board}` }
    const m = POST_RE.exec(cur.q[0])
    return m && m[1] === board ? { url: `${RULIWEB_HOST}${cur.q[0]}` } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const slug = parseBoardRef(ctx.productRef)
    const board = slug ? RULIWEB_BOARDS[slug] : undefined
    if (!board) return { reviews: [], nextCursor: null, parseFailures: 1 }
    const cur = decodeBoardCursor(ctx.cursor)
    if (cur.q.length === 0) return parseList(body, board, cur, ctx.lastReviewAt)
    const rest = { q: cur.q.slice(1), last: cur.last }
    return { ...parsePost(body, cur.q[0]), nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
  },
}

export const __internal = { parseList, parsePost, POST_RE }
