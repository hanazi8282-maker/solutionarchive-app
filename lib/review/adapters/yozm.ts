// 요즘IT(yozm.wishket.com) 매거진 기사 본문 어댑터.
//
// ⛔ **2026-09-30 오전에는 robots 가 확인 불가(Cloudflare 302)였다. 남헌이 법적 조항과 무관하게
//    기술적으로 가능하면 진행하라고 결정했다(2026-09-30).** 같은 날 오후 재실측에서 robots 가 200 으로
//    읽혀 허용 판정이 났으므로 그 결정 아래 착수한다. 약관 자동수집 조항은 이 세션에서 인용하지 못했다
//    (큐 기록에도 약관 인용이 없다 — 남헌 결정 범위: "약관·법적 조항과 무관").
//    robots 가 다시 302·403 이 되면 러너가 fail-closed 로 0요청이다 — 그게 맞다. 우회하지 않는다.
//
// 실측(2026-09-30, 우리 UA, 요청 4회 · 간격 6.5초):
//   GET /robots.txt                    → 200 · 452B · `*`: `Allow: /magazine/` · `Disallow: /api/` · `/media/` ·
//                                        `/magazine/manage/` · `/w/` · **Crawl-delay: 5** (러너가 읽어 간격에 반영한다).
//   GET /magazine/                     → 200 · 서버 렌더 · `href="/magazine/detail/<숫자 id>/"` 18개(최신 기사 포함).
//   GET /magazine/detail/3783/         → 200 · JSON-LD `NewsArticle` — headline · articleBody 7,251자 · datePublished.
//                                        **댓글 없음**(기사 본문뿐이다).
//   GET /magazine/list/startup/        → 200 이지만 **기사 링크 0개** — 목록은 CSR 로 `/api/` 에서 온다(robots 금지).
//                                        그래서 분류 목록이 아니라 `/magazine/` 첫 화면을 목록으로 쓴다.
//   픽스처: fixtures/review/yozm/
//
// 타깃 형식: `board:magazine` 하나. 목록 1요청 → 새 기사 1요청.
//   ponytail: 에디토리얼 기사라 VOC 가치가 낮다(큐 기록). 첫 화면 18개 창이라 하루 새 기사가 그보다 많으면 놓친다 —
//   그때는 sitemap(`/magazine/sitemap.xml`, robots 가 광고한다)을 목록으로 바꿔라.

import type { ParseContext, ParseResult, ReviewSourceAdapter, TargetState } from '../types.ts'
import { type BoardListItem, compareBoardId, decodeBoardCursor, encodeBoardCursor, nextBoardCursor, parseBoardRef } from '../types.ts'
import { kstDate } from './velog.ts'

export const HOST = 'https://yozm.wishket.com'

export const BOARDS: Record<string, string> = { magazine: '/magazine/' }

const POST_RE = /^\/magazine\/detail\/(\d{1,9})\/$/
const LIST_ANCHOR_RE = /href="\/magazine\/detail\/(\d{1,9})\/?"/g
const LD_RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g

function parseList(body: string, prev: { q: string[]; last: string | null }, lastReviewAt: string | null | undefined): ParseResult {
  const ids = new Set<string>()
  LIST_ANCHOR_RE.lastIndex = 0
  for (let m = LIST_ANCHOR_RE.exec(body); m; m = LIST_ANCHOR_RE.exec(body)) ids.add(m[1])
  // 첫 화면은 큐레이션이라 순서가 날짜순이 아니다. 큰 id(최신) 먼저로 맞춘다. 날짜는 목록에 없다.
  const items: BoardListItem[] = [...ids]
    .sort((a, b) => compareBoardId(b, a))
    .map((id) => ({ id, path: `/magazine/detail/${id}/`, writtenAt: null }))
  const next = nextBoardCursor(items, prev, lastReviewAt)
  // 링크 0개 = 마크업 변경·챌린지 페이지·CSR 전환. "새 기사 없음"이 아니다(§7.1).
  return { reviews: [], nextCursor: encodeBoardCursor(next), parseFailures: items.length === 0 ? 1 : 0, pauseRun: next.q.length === 0 }
}

function parseArticle(body: string, id: string): ParseResult {
  const fail: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }
  let art: Record<string, unknown> | null = null
  LD_RE.lastIndex = 0
  for (let m = LD_RE.exec(body); m && !art; m = LD_RE.exec(body)) {
    try {
      const j = JSON.parse(m[1])
      if (j?.['@type'] === 'NewsArticle') art = j
    } catch {
      /* 다른 JSON-LD 블록 */
    }
  }
  // 요청한 기사가 맞는가(리다이렉트·다른 기사·챌린지 페이지면 url 이 없거나 다르다).
  if (!art || typeof art.url !== 'string' || !new RegExp(`/magazine/detail/${id}/?$`).test(art.url)) return fail
  if (typeof art.articleBody !== 'string' || !art.articleBody.trim()) return fail
  const title = typeof art.headline === 'string' ? art.headline.trim() : ''
  const p = `/magazine/detail/${id}/`
  return {
    reviews: [
      {
        externalId: p,
        text: [title, art.articleBody.trim()].filter(Boolean).join('\n\n'),
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: kstDate(art.datePublished),
        storyId: p,
        sourceUrl: `${HOST}${p}`,
      },
    ],
    nextCursor: null,
    parseFailures: 0,
  }
}

export const yozmAdapter: ReviewSourceAdapter = {
  key: 'yozm',
  displayName: '요즘IT 매거진 기사',
  incrementalOnly: true,

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    if (!slug || !(slug in BOARDS)) return null
    const cur = decodeBoardCursor(target.cursor)
    if (cur.q.length === 0) return { url: `${HOST}${BOARDS[slug]}` }
    return POST_RE.test(cur.q[0]) ? { url: `${HOST}${cur.q[0]}` } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const cur = decodeBoardCursor(ctx.cursor)
    if (cur.q.length === 0) return parseList(body, cur, ctx.lastReviewAt)
    const rest = { q: cur.q.slice(1), last: cur.last }
    const m = POST_RE.exec(cur.q[0])
    const res = m ? parseArticle(body, m[1]) : { reviews: [], nextCursor: null, parseFailures: 1 }
    return { ...res, nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
  },
}

export const __internal = { parseList, parseArticle }
