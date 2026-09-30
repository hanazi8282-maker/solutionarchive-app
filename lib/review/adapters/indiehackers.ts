// Indie Hackers 편집팀 인터뷰(Case Studies Database, indiehackers.com/stories) 어댑터.
//
// ⛔ **법적 조항 인지, 남헌 승인 하 강행(2026-09-30).** 약관 "you won't use, copy, reproduce … or otherwise
//    exploit for any purpose any Content not owned by you, (i) without the prior consent of the owner of that
//    Content" (ops/state/source-review-queue.md). 승인 범위는 약관·법적 조항까지다.
//    **대상은 편집팀 인터뷰만**이다(남헌 결정 2026-09-30). 사용자 작성 글 경로는 요청하지 않는다 —
//    직전 점검에서 사용자 글 `/post/<slug>` 2건이 정적 요청에 404 였다.
//    봇 챌린지·로그인 벽은 우회하지 않는다. 오래된 인터뷰는 본문이 무료 가입 벽 뒤에 잘려 있다(아래) —
//    잘린 앞부분만 받고 가입·로그인은 하지 않는다.
//
// 실측(2026-09-30, 우리 UA, 요청 7회 · 간격 ≥6.5초):
//   GET /robots.txt       → 200 · 221B · `*`: `Disallow:`(빈 값 = 전체 허용). GPTBot·Google-Extended 만 `/` 금지.
//   GET /interviews       → 301 → /stories
//   GET /stories          → 200 · 758KB · 서버 렌더 "Case Studies Database" — `<a href="/post/<20자 id>"
//                           class="slick-story database__story">` 915건, 최신 인터뷰가 맨 위(날짜 표기 없음).
//   GET /post/<id>        → 301 → /post/tech/<slug>-<id>(같은 호스트). 러너 fetch 는 따라간다.
//   GET /post/tech/…-0B3b… → 200 · 42KB · `firestore-post--success-story-interview` · JSON-LD Article
//                           (headline · datePublished · mainEntityOfPage @id) · 본문 7.3K자 · 댓글 0(게시 다음 날).
//   GET /post/tech/…-2Kas… → 200 · 134KB · 같은 표식 + `post-page--paywalled` — 본문 1.9K자에서
//                           "To read the rest of this article, you'll need to subscribe"(`id="pw-cta"`)로 끊김.
//                           댓글 59개는 전부 서버 렌더(`comment__content` · `?commentId=<20자 id>`).
//   픽스처: fixtures/review/indiehackers/ (인터뷰이·작성자·댓글 작성자 이름은 가렸다)
//
// 타깃 형식: `board:stories` 하나. 목록 1요청 → 새 인터뷰 1요청(본문 + 그 시점 댓글).
//   ⚠️ id 가 Firebase 무작위 20자라 크기 비교가 안 된다 — types.ts nextBoardCursor(`last` 보다 큰 id)를
//      쓰지 않는다. 대신 `last` = 지난번 목록 맨 위 id 이고, 이번 목록에서 그 위치보다 위에 있는 것만 새 글이다.
//      `last` 가 목록에서 사라지면(삭제) 맨 위 19개를 다시 담는다 — 중복은 지문이 막는다.
//   ⚠️ 글 URL 은 목록 href 를 그대로 쓰지 않고 **20자 영숫자 id 로 조립**한다(types.ts 규약 4).
//   ⚠️ 페이지에 `firestore-post--success-story-interview` 표식이 없으면 편집 인터뷰가 아니다 — 받지 않고
//      filtered 로 센다(범위 밖 글이 목록에 섞여도 적재하지 않는다).
//
// 댓글 재방문(남헌 결정 2026-09-30 — 요청 2배 감수):
//   새 인터뷰는 게시 직후라 본문은 전부 열려 있지만 댓글이 거의 없다. 댓글은 나중에 붙고, 그때쯤엔 본문이
//   가입 벽 뒤로 간다(댓글은 전부 공개). 그래서 처음 읽은 인터뷰를 **한 번 더** 읽어 **댓글만** 넣는다.
//   · 상태는 커서 JSON 의 `w` = [[id, 남은 목록 실행 수], …] 다(스키마 변경 없음). 처음 읽을 때
//     REVISIT_AFTER_RUNS 로 넣고 목록을 읽을 때마다(= 실행마다) 1씩 줄인다. 하루 2회 실행이라 14 ≈ 7일.
//     날짜가 아니라 실행 수인 이유: 어댑터에는 시계가 없다(ParseContext 에 now 가 없다).
//   · 0 이 된 것 중 **먼저 넣은 것**부터 실행당 REVISIT_PER_RUN 건을 큐 **맨 뒤**에 `/post/<id>#c` 로 담고
//     `w` 에서 뺀다(= 재방문은 한 번뿐). 새 글이 큐를 채우면(19) 재방문은 다음 실행으로 밀린다 —
//     실행당 요청은 여전히 목록 1 + 글 ≤19 다(MAX_PAGES_PER_TARGET 20).
//   · 맨 뒤·실행당 1건인 이유: 재방문 댓글은 대개 러너의 증분 기준선(lastReviewAt)보다 오래돼서 5개를 넘으면
//     러너가 "이미 본 구간"으로 그 페이지 뒤에서 끊는다. 맨 뒤 1건이면 끊겨도 남는 큐가 없다.
//   · 재방문 응답에서는 본문(첫 항목)을 버리고 댓글만 낸다. 이미 받은 댓글은 지문
//     (`/post/<id>#<commentId>`)이 duplicate 로 막는다. 가입 벽 뒤(pw-cta)는 원래 안 읽는다.
//   · 목록 파싱이 실패하면(링크 0개) `w` 를 줄이지도 꺼내지도 않는다.
//   · ⚠️ 이 코드 이전에 읽은 인터뷰는 `w` 에 없어 재방문되지 않는다.
//
// 작성자는 저장하지 않는다(authorMasked=null).

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { BOARD_QUEUE_MAX, decodeBoardCursor, parseBoardRef } from '../types.ts'
import { htmlStrip } from './hackernews.ts'
import { kstDate } from './velog.ts'

export const HOST = 'https://www.indiehackers.com'

export const BOARDS: Record<string, string> = { stories: '/stories' }

// 뒤의 `#c` = 재방문(댓글만). 요청 URL 에는 붙이지 않는다.
const POST_RE = /^\/post\/([A-Za-z0-9]{20})(#c)?$/
const ID_RE = /^[A-Za-z0-9]{20}$/

/** 처음 읽은 뒤 재방문까지 기다릴 목록 실행 수(하루 2회 → ≈7일). */
export const REVISIT_AFTER_RUNS = 14
/** 실행당 재방문 상한. 머리말 "맨 뒤·실행당 1건" 참고. */
export const REVISIT_PER_RUN = 1
/** 대기열 상한 — 넘으면 가장 먼저 넣은 것부터 버린다. ponytail: 평소 수 건이라 닿지 않는다. */
export const REVISIT_WAIT_MAX = 60

type Wait = [string, number]
interface Cursor {
  q: string[]
  last: string | null
  w: Wait[]
}

/** 게시판 커서 + 재방문 대기열 `w`. 옛 커서(`w` 없음)도 그대로 읽는다. */
function dec(cursor: string | null): Cursor {
  const { q, last } = decodeBoardCursor(cursor)
  let w: Wait[] = []
  try {
    const raw: unknown = cursor ? JSON.parse(cursor)?.w : null
    if (Array.isArray(raw)) {
      w = raw.filter((e): e is Wait => Array.isArray(e) && typeof e[0] === 'string' && ID_RE.test(e[0]) && Number.isInteger(e[1]))
    }
  } catch {
    /* decodeBoardCursor 와 같이 빈 상태로 */
  }
  return { q, last, w }
}
const enc = (c: Cursor): string => JSON.stringify(c.w.length ? { q: c.q, last: c.last, w: c.w } : { q: c.q, last: c.last })
const LIST_ANCHOR_RE = /<a href="\/post\/([A-Za-z0-9]{20})" class="slick-story database__story"/g
const LD_RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parseList(body: string, prev: Cursor): ParseResult {
  const ids: string[] = []
  LIST_ANCHOR_RE.lastIndex = 0
  for (let m = LIST_ANCHOR_RE.exec(body); m; m = LIST_ANCHOR_RE.exec(body)) if (!ids.includes(m[1])) ids.push(m[1])
  const at = prev.last ? ids.indexOf(prev.last) : -1
  const fresh = at >= 0 ? ids.slice(0, at) : ids
  const q = fresh.slice(0, BOARD_QUEUE_MAX).map((id) => `/post/${id}`)
  // 링크 0개 = 마크업 변경·챌린지·CSR 전환. "새 인터뷰 없음"이 아니다(§7.1). 재방문 대기열도 그대로 둔다.
  if (ids.length === 0) return { reviews: [], nextCursor: enc({ q, last: prev.last, w: prev.w }), parseFailures: 1, pauseRun: true }
  const w: Wait[] = prev.w.map(([id, n]) => [id, n - 1])
  const room = Math.max(0, Math.min(REVISIT_PER_RUN, BOARD_QUEUE_MAX - q.length))
  const due = w.filter(([, n]) => n <= 0).slice(0, room).map(([id]) => id)
  for (const id of due) q.push(`/post/${id}#c`)
  return {
    reviews: [],
    nextCursor: enc({ q, last: ids[0], w: w.filter(([id]) => !due.includes(id)) }),
    parseFailures: 0,
    pauseRun: q.length === 0,
  }
}

/** 댓글 `title="Friday, August 28th 2026 (3:40 am)"` → `2026-08-28`. 시간대 표기가 없어 날짜만 그대로 쓴다. */
function commentDate(title: string): string | null {
  const m = /([A-Z][a-z]+) (\d{1,2})(?:st|nd|rd|th) (\d{4})/.exec(title)
  const mi = m ? MONTHS.indexOf(m[1]) : -1
  return m && mi >= 0 ? `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}

function parseStory(body: string, id: string): ParseResult {
  const fail: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }
  let art: Record<string, unknown> | null = null
  LD_RE.lastIndex = 0
  for (let m = LD_RE.exec(body); m && !art; m = LD_RE.exec(body)) {
    try {
      const j = JSON.parse(m[1])
      if (j?.['@type'] === 'Article') art = j
    } catch {
      /* 다른 JSON-LD 블록 */
    }
  }
  // 요청한 글인가(404·챌린지·다른 글이면 JSON-LD 가 없거나 @id 끝의 id 가 다르다).
  const pageId = (art?.mainEntityOfPage as { '@id'?: unknown } | undefined)?.['@id']
  if (typeof pageId !== 'string' || !pageId.endsWith(`-${id}`)) return fail
  const page = /<div class="post-page post-page--post([^"]*)"/.exec(body)
  if (!page) return fail
  // 편집 인터뷰만 받는다(남헌 결정 2026-09-30).
  if (!/\bfirestore-post--success-story-interview\b/.test(page[1])) return { reviews: [], nextCursor: null, parseFailures: 0, filtered: 1 }

  const start = body.indexOf('class="firestore-post__content')
  const end = body.indexOf('class="post-page__footer"')
  if (start < 0 || end < start) return fail
  let content = body.slice(start, end)
  const wall = content.indexOf('id="pw-cta"') // 가입 벽 안내문부터는 버린다
  if (wall >= 0) content = content.slice(0, wall).replace(/<[^>]*$/, '')
  const text = htmlStrip(content.replace(/^[^>]*>/, '').replace(/<nav[\s\S]*?<\/nav>/g, '').replace(/<\/(h\d|li|dd|dt)>/g, '\n')).trim()
  if (!text) return fail

  const p = `/post/${id}`
  const title = typeof art!.headline === 'string' ? art!.headline.trim() : ''
  const reviews: ParsedReview[] = [
    { externalId: p, text: [title, text].filter(Boolean).join('\n\n'), rating: null, seller: null, authorMasked: null, writtenAt: kstDate(art!.datePublished), storyId: p },
  ]
  let parseFailures = 0
  for (const chunk of body.split('<div class="comment comment--on-desktop">').slice(1)) {
    const c = /<div class="comment__content">([\s\S]*?)<\/div>\s*<div class="comment__footer">/.exec(chunk)
    const f = /\?commentId=([A-Za-z0-9]{20})"[^>]*title="([^"]*)"/.exec(chunk)
    if (!c || !f) {
      parseFailures++
      continue
    }
    const t = htmlStrip(c[1])
    if (t) reviews.push({ externalId: `${p}#${f[1]}`, text: t, rating: null, seller: null, authorMasked: null, writtenAt: commentDate(f[2]), storyId: p })
  }
  // 글·댓글 모두 글 주소로 간다(공개 VOC 카드의 "출처 보기").
  return { reviews: reviews.map((r) => ({ ...r, sourceUrl: `${HOST}${p}` })), nextCursor: null, parseFailures }
}

export const indiehackersAdapter: ReviewSourceAdapter = {
  key: 'indiehackers',
  displayName: 'Indie Hackers 편집 인터뷰',
  incrementalOnly: true,

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    if (!slug || !(slug in BOARDS)) return null
    const cur = decodeBoardCursor(target.cursor)
    if (cur.q.length === 0) return { url: `${HOST}${BOARDS[slug]}` }
    const m = POST_RE.exec(cur.q[0])
    return m ? { url: `${HOST}/post/${m[1]}` } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const cur = dec(ctx.cursor)
    if (cur.q.length === 0) return parseList(body, cur)
    const rest: Cursor = { q: cur.q.slice(1), last: cur.last, w: cur.w }
    const m = POST_RE.exec(cur.q[0])
    const res: ParseResult = m ? parseStory(body, m[1]) : { reviews: [], nextCursor: null, parseFailures: 1 }
    if (m?.[2]) {
      // 재방문: 본문(첫 항목)은 버리고 댓글만. 인터뷰 아님(filtered)·파싱 실패는 그대로 센다.
      if (res.reviews[0]?.externalId === `/post/${m[1]}`) res.reviews = res.reviews.slice(1)
    } else if (m && res.reviews.length > 0 && !rest.w.some(([id]) => id === m[1])) {
      rest.w = [...rest.w, [m[1], REVISIT_AFTER_RUNS] as Wait].slice(-REVISIT_WAIT_MAX)
    }
    return { ...res, nextCursor: enc(rest), pauseRun: rest.q.length === 0 }
  },
}

export const __internal = { parseList, parseStory, commentDate, dec, enc }
