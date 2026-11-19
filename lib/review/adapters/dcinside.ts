// 디시인사이드 공개 갤러리(gall.dcinside.com) 어댑터 — v71cu S5b. 남헌 2026-11-19 결정(override='owner_2026-11-19', quote_policy='none').
//
// 실측(2026-11-19, 우리 UA, 요청 3회·간격 8초): robots.txt 200 — `*` 은 Allow:/ 이고 갤러리별 Disallow(/board/lists/?id=47 …)만 있다.
//   AI 학습 봇(ClaudeBot 등)은 이름으로 전부 막혀 있다 — 우리 UA(solutionarchive-review-collector)는 `*` 그룹이다. 소스 행 라벨 '약관: 자동화 금지'.
//   GET /board/lists/?id=programming → 200 HTML(공지·광고 행은 `ub-content` 만, 진짜 글은 `ub-content us-post` + data-no).
//   GET /board/view/?id=programming&no=N → 200 HTML(제목 span.title_subject · 본문 div.write_div · 시각 td/span.gall_date[title]). 로그인·캡차 없음.
// 댓글은 POST(/board/comment/)라 받지 않는다(GET 전용 러너). 작성자·닉네임·IP 는 읽지도 저장하지도 않는다.
// 타깃: `board:<slug>`. 게시판 표의 갤러리만 — robots 의 Disallow 목록에 든 갤러리(47·cat·dog·stock_new …)는 표에 넣지 않는다.
// ponytail: 갤러리 1곳(programming)만 실측했다. 갤러리를 늘리려면 먼저 robots 의 Disallow 목록에 없는지 확인하고 표에 한 줄 더한다.

import type { ParseContext, ParseResult, ReviewSourceAdapter, TargetState } from '../types.ts'
import { BOARD_QUEUE_MAX, type BoardListItem, decodeBoardCursor, encodeBoardCursor, nextBoardCursor, parseBoardRef } from '../types.ts'
import { __internal as clien } from './clien.ts'

export const DCINSIDE_HOST = 'https://gall.dcinside.com'
/** slug → 갤러리 id. 값은 URL 쿼리에 박힌다. */
export const DCINSIDE_BOARDS: Record<string, string> = { programming: 'programming' }

const POST_RE = /^\/board\/view\/\?id=([a-z0-9_]{1,40})&no=(\d{1,12})$/
const ROW_RE = /<tr class="ub-content us-post"[^>]*?data-no="(\d{1,12})"/g
const DATE_RE = /class="gall_date"[^>]*title="(\d{4}-\d{2}-\d{2})/

/** 식별정보 제거(v70 §10): 이메일 → [email], @멘션 → @user. */
const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]').replace(/(^|[\s(])@[^\s,.)!?]{1,30}/g, '$1@user')

const postPath =(gall: string, no: string) => `/board/view/?id=${gall}&no=${no}`

function parseList(body: string, gall: string, prev: { q: string[]; last: string | null }, lastReviewAt: string | null | undefined): ParseResult {
  const items: BoardListItem[] = []
  const seen = new Set<string>()
  const anchors: Array<{ no: string; at: number }> = []
  ROW_RE.lastIndex = 0
  for (let m = ROW_RE.exec(body); m; m = ROW_RE.exec(body)) anchors.push({ no: m[1], at: m.index })
  for (let i = 0; i < anchors.length; i++) {
    const { no, at } = anchors[i]
    if (seen.has(no)) continue
    seen.add(no)
    const d = DATE_RE.exec(body.slice(at, i + 1 < anchors.length ? anchors[i + 1].at : body.length))
    items.push({ id: no, path: postPath(gall, no), writtenAt: d ? d[1] : null })
  }
  items.sort((a, b) => Number(b.id) - Number(a.id))
  const next = nextBoardCursor(items, prev, lastReviewAt)
  // 글 행이 하나도 없으면 "새 글 0건"이 아니라 마크업 변경·차단 화면이다(§7.1).
  return { reviews: [], nextCursor: encodeBoardCursor({ q: next.q.slice(0, BOARD_QUEUE_MAX), last: next.last }), parseFailures: anchors.length === 0 ? 1 : 0, pauseRun: next.q.length === 0 }
}

function parsePost(body: string, path: string): ParseResult {
  const at = body.indexOf('class="write_div"')
  const content = at < 0 ? null : clien.sliceDiv(body, at)
  if (content === null) {
    // 지워진 글은 200 + alert 스크립트로 온다 — 파서 고장이 아니라 "없는 글"이다.
    if (/alert\(['"][^'"]*(존재하지|삭제)/.test(body)) return { reviews: [], nextCursor: null, parseFailures: 0, missing: [path] }
    return { reviews: [], nextCursor: null, parseFailures: 1 }
  }
  const tm = /<span class="title_subject">([\s\S]*?)<\/span>/.exec(body)
  const title = tm ? clien.stripHtml(tm[1]) : ''
  const text = scrub(clien.stripHtml(content))
  if (!title && !text) return { reviews: [], nextCursor: null, parseFailures: 1 }
  const d = DATE_RE.exec(body)
  return {
    reviews: [{ externalId: path, text: [title, text].filter(Boolean).join('\n\n'), rating: null, seller: null, authorMasked: null, writtenAt: d ? d[1] : null, storyId: null }],
    nextCursor: null,
    parseFailures: 0,
  }
}

export const dcinsideAdapter: ReviewSourceAdapter = {
  key: 'dcinside',
  displayName: '디시인사이드 공개 갤러리',
  incrementalOnly: true,
  // 챌린지 화면은 즉시 중단(우회 없음). 403/429 는 quotaMarkers 가 없어 러너가 차단으로 본다.
  abortOnChallenge: true,
  isChallenge: (body: string) => body.trim() === '' || /Just a moment|challenges\.cloudflare\.com|cf-chl/i.test(body),

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    if (!slug || !(slug in DCINSIDE_BOARDS)) return null
    const gall = DCINSIDE_BOARDS[slug]
    const cur = decodeBoardCursor(target.cursor)
    if (cur.q.length === 0) return { url: `${DCINSIDE_HOST}/board/lists/?id=${gall}` }
    const m = POST_RE.exec(cur.q[0])
    return m && m[1] === gall ? { url: `${DCINSIDE_HOST}${cur.q[0]}` } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const slug = parseBoardRef(ctx.productRef)
    const gall = slug ? DCINSIDE_BOARDS[slug] : undefined
    if (!gall) return { reviews: [], nextCursor: null, parseFailures: 1 }
    const cur = decodeBoardCursor(ctx.cursor)
    if (cur.q.length === 0) return parseList(body, gall, cur, ctx.lastReviewAt)
    const rest = { q: cur.q.slice(1), last: cur.last }
    const res = parsePost(body, cur.q[0])
    return { ...res, nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
  },
}

export const __internal = { parseList, parsePost, POST_RE }
