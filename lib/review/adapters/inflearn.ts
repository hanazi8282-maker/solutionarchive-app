// 인프런 커뮤니티 질문&답변(inflearn.com/community/questions) 어댑터.
//
// ⛔ **약관 평문을 끝내 못 읽었다(CSR 껍데기 54자). 남헌이 약관 확인 없이 강행을 결정했다(2026-09-30).**
//    ops/state/source-review-queue.md: "약관 /policy/terms-of-service 는 CSR 이라 평문 54자 — 조항을 못 읽었다".
//    즉 금지 조항이 있는지 없는지 모르는 채로 켠다. 우회(UA 위장·로그인)는 하지 않는다.
//
// 실측(2026-09-30, 우리 UA, 요청 4회 · 간격 6.5초):
//   GET /robots.txt                          → 200 · 963B · `*` 는 /community 를 막지 않는다
//                                              (`/community/*?*tag=*,` 복수 태그 조합만 Disallow · `/api` Disallow).
//   GET /community/questions                 → 200 · 서버 렌더 `<article>` 20건 · 글 링크
//                                              `https://www.inflearn.com/community/questions/<숫자 id>/<slug>`.
//   GET /community/questions/1876492         → 307 → slug 붙은 주소(같은 호스트). 러너 fetch 는 따라간다.
//   GET /community/questions/1876492/<slug>  → 200 · JSON-LD `QAPage` — 질문 name·text·datePublished +
//                                              suggestedAnswer[] (text·datePublished·url `?focusComment=<답변 id>`).
//   픽스처: fixtures/review/inflearn/ (작성자 이름은 가렸다)
//
// 타깃 형식: `board:questions` 하나. 목록 1요청 → 새 글 1요청(질문 + 답변).
//   ⚠️ 글 URL 은 목록 href(slug 포함)를 쓰지 않고 **숫자 id 로 조립**한다(types.ts 규약 4).
//      slug 없는 주소는 307 로 같은 호스트의 slug 주소로 간다 — 응답이 우리가 요청한 글인지는
//      JSON-LD 가 아니라 canonical 의 숫자 id 로 확인한다.
//   ⚠️ "인프런 AI 인턴" 자동 답변은 버린다(사람 VOC 가 아니다). filtered 로 센다.
//   ponytail: 수강 Q&A 중심이라 독자(SaaS 창업가) 겹침이 낮다(큐 기록). T2 가 거른다.
//
// 작성자는 저장하지 않는다(authorMasked=null). 실명·프로필 링크가 붙는다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { type BoardListItem, compareBoardId, decodeBoardCursor, encodeBoardCursor, nextBoardCursor, parseBoardRef } from '../types.ts'
import { kstDate } from './velog.ts'

export const HOST = 'https://www.inflearn.com'

export const BOARDS: Record<string, string> = { questions: '/community/questions' }

const POST_RE = /^\/community\/questions\/(\d{1,12})$/
const LIST_ANCHOR_RE = /href="https:\/\/www\.inflearn\.com\/community\/questions\/(\d{1,12})\/[^"]*"/g
const LD_RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
const AI_ANSWERER = /AI 인턴/

function parseList(body: string, prev: { q: string[]; last: string | null }, lastReviewAt: string | null | undefined): ParseResult {
  const seen = new Set<string>()
  const items: BoardListItem[] = []
  LIST_ANCHOR_RE.lastIndex = 0
  for (let m = LIST_ANCHOR_RE.exec(body); m; m = LIST_ANCHOR_RE.exec(body)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    // 카드의 <time> 은 앵커 뒤에 온다. 다음 앵커 전까지만 본다.
    const t = /<time datetime="([^"]+)"/.exec(body.slice(m.index, m.index + 4000).split('<article>')[0])
    items.push({ id: m[1], path: `/community/questions/${m[1]}`, writtenAt: t ? kstDate(t[1]) : null })
  }
  // 목록이 id 오름차순으로 올 수도 있으니 최신(큰 id) 먼저로 맞춘다 — nextBoardCursor 는 최신순 입력을 전제한다.
  items.sort((a, b) => compareBoardId(b.id, a.id))
  const next = nextBoardCursor(items, prev, lastReviewAt)
  return { reviews: [], nextCursor: encodeBoardCursor(next), parseFailures: items.length === 0 ? 1 : 0, pauseRun: next.q.length === 0 }
}

function parseQuestion(body: string, id: string): ParseResult {
  const fail: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }
  // 우리가 요청한 글인가. 로그인 벽·404·다른 글이면 canonical 이 없거나 id 가 다르다(§7.1 사례 2).
  const canon = /<link rel="canonical" href="https:\/\/www\.inflearn\.com\/community\/questions\/(\d+)[/"]/.exec(body)
  if (!canon || canon[1] !== id) return fail

  let q: Record<string, unknown> | null = null
  LD_RE.lastIndex = 0
  for (let m = LD_RE.exec(body); m && !q; m = LD_RE.exec(body)) {
    try {
      const j = JSON.parse(m[1])
      if (j?.['@type'] === 'QAPage' && j.mainEntity?.['@type'] === 'Question') q = j.mainEntity
    } catch {
      /* 다른 JSON-LD 블록 — 다음 것을 본다 */
    }
  }
  if (!q) return fail

  const qText = [q.name, q.text].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()).join('\n\n')
  if (typeof q.text !== 'string' || !qText) return fail

  const p = `/community/questions/${id}`
  const reviews: ParsedReview[] = [
    { externalId: p, text: qText, rating: null, seller: null, authorMasked: null, writtenAt: kstDate(q.datePublished), storyId: p },
  ]
  let parseFailures = 0
  let filtered = 0
  const answers = Array.isArray(q.suggestedAnswer) ? q.suggestedAnswer : q.suggestedAnswer ? [q.suggestedAnswer] : []
  if (q.acceptedAnswer) answers.push(q.acceptedAnswer)
  const seen = new Set<string>()
  for (const a of answers as Array<Record<string, unknown>>) {
    const aid = typeof a?.url === 'string' ? /[?&]focusComment=(\d{1,12})/.exec(a.url)?.[1] : undefined
    if (!aid || typeof a.text !== 'string') {
      parseFailures++
      continue
    }
    if (seen.has(aid)) continue // acceptedAnswer 가 suggestedAnswer 에도 있을 수 있다
    seen.add(aid)
    const who = (a.author as { name?: unknown } | undefined)?.name
    if (typeof who === 'string' && AI_ANSWERER.test(who)) {
      filtered++
      continue
    }
    const text = a.text.trim()
    if (text) reviews.push({ externalId: `${p}#${aid}`, text, rating: null, seller: null, authorMasked: null, writtenAt: kstDate(a.datePublished), storyId: p })
  }
  // 질문·답변 모두 질문 주소로 간다(공개 VOC 카드의 "출처 보기").
  return { reviews: reviews.map((r) => ({ ...r, sourceUrl: `${HOST}${p}` })), nextCursor: null, parseFailures, filtered }
}

export const inflearnAdapter: ReviewSourceAdapter = {
  key: 'inflearn',
  displayName: '인프런 커뮤니티 질문&답변',
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
    const res = m ? parseQuestion(body, m[1]) : { reviews: [], nextCursor: null, parseFailures: 1 }
    return { ...res, nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
  },
}

export const __internal = { parseList, parseQuestion }
