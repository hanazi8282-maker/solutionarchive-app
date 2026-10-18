// 범용 Discourse 어댑터 — 공개 JSON(`/c/<slug>/<id>.json` 목록, `/t/<id>.json` 토픽). v70 L-06/D4.
//
// 소스마다 호스트·게시판 표가 다르므로 어댑터는 **팩토리**다(`makeDiscourseAdapter`). 호스트는 팩토리 인자(상수)이고 product_ref 에서 오지 않는다 — SSRF 방지(devto 와 같은 규약).
// 새 Discourse 소스 = 이 팩토리 호출 1줄 + review-collect.mjs 맵 등록 1줄 + 소스 행 마이그레이션.
//
// 실측(2026-10-14, 우리 UA, 요청 4회·간격 6초, community.n8n.io — 픽스처 fixtures/review/discourse/):
//   GET /robots.txt        → 200 · `*` 는 /admin/·/auth/·/session·/search·/badges·/my·/g·/t/*/*.rss·/c/*.rss 등만 Disallow. /latest.json·/c/…json·/t/<id>.json 은 막지 않는다.
//   GET /categories.json   → 200 · category_list.categories[]{id,slug,topic_count,read_restricted}
//   GET /c/feature-requests/5.json?order=created → 200 · topic_list.topics[30]{id,created_at,posts_count,title,…}
//   GET /t/321096.json     → 200 · post_stream.posts[]{id,post_number,created_at,cooked(HTML),hidden,deleted_at,…} 최대 20개.
// 로그인·키 없이 온다. 403/429 는 러너가 차단으로 보고 멈춘다(quotaMarkers 없음).
//
// 타깃: `board:<slug>` 만. 목록 1요청 → 새 토픽마다 `/t/<id>.json` 1요청. 증분 `last` = 토픽 id(전역 증가 숫자).
// 작성자는 저장하지 않는다(authorMasked=null) — v70 §10: 신규 소스는 식별정보를 저장하지 않는다. username·name·avatar 는 읽지도 않는다.
// ponytail: 토픽이 20게시글을 넘으면 첫 20개만 받는다(post_stream.stream 의 나머지는 /t/<id>/posts.json 이 필요). 필요해지면 두 번째 패스를 붙여라.
//
// 약관/robots 라벨은 소스 행(review_sources: robots_status·tos_status·quote_allowed·override)이 가진다. 어댑터는 판정하지 않는다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { BOARD_QUEUE_MAX, type BoardListItem, decodeBoardCursor, encodeBoardCursor, nextBoardCursor, parseBoardRef } from '../types.ts'
import { kstDate } from './velog.ts'
import { __internal as disquiet } from './disquiet.ts'

export interface DiscourseConfig {
  key: string
  displayName: string
  /** `https://community.example.com` — 슬래시 없음. 상수여야 한다. */
  host: string
  /** 게시판 slug → 목록 경로(`/c/feature-requests/5.json?order=created`). 표에 없는 slug 는 거절한다. */
  boards: Record<string, string>
}

const TOPIC_RE = /^\/t\/(\d{1,12})\.json$/

function parseList(body: string, prev: { q: string[]; last: string | null }, lastReviewAt: string | null | undefined): ParseResult {
  let j: unknown
  try {
    j = JSON.parse(body)
  } catch {
    j = null
  }
  const topics = (j as { topic_list?: { topics?: unknown } } | null)?.topic_list?.topics
  // 목록 모양이 아니다 = 에러 JSON·HTML·챌린지. "새 글 0건"이 아니다(§7.1).
  if (!Array.isArray(topics)) return { reviews: [], nextCursor: encodeBoardCursor(prev), parseFailures: 1, pauseRun: true }

  const items: BoardListItem[] = []
  let parseFailures = 0
  for (const t of topics as Array<Record<string, unknown>>) {
    const id = typeof t?.id === 'number' && Number.isSafeInteger(t.id) && t.id > 0 ? String(t.id) : null
    if (!id) {
      parseFailures++
      continue
    }
    // 고정(pinned) 글은 오래돼도 목록 앞에 온다 — 증분 `last` 와 `lastReviewAt` 이 알아서 거른다.
    items.push({ id, path: `/t/${id}.json`, writtenAt: kstDate(t.created_at) })
  }
  // 최신순 입력을 전제로 하므로 id 내림차순으로 정렬한다(고정 글이 앞에 와도 큐가 최신부터 담기게).
  items.sort((a, b) => Number(b.id) - Number(a.id))
  const next = nextBoardCursor(items, prev, lastReviewAt)
  return { reviews: [], nextCursor: encodeBoardCursor({ q: next.q.slice(0, BOARD_QUEUE_MAX), last: next.last }), parseFailures, pauseRun: next.q.length === 0 }
}

function parseTopic(body: string, id: string): ParseResult {
  const fail: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }
  let t: Record<string, unknown> | null
  try {
    t = JSON.parse(body)
  } catch {
    return fail
  }
  // 요청한 토픽이 맞는가 + 게시글 배열이 있는가. 200 에 에러 JSON 이 와도 여기서 실패다.
  const posts = (t?.post_stream as { posts?: unknown } | undefined)?.posts
  if (!t || String(t.id) !== id || !Array.isArray(posts)) return fail
  const title = typeof t.title === 'string' ? t.title.trim() : ''

  const reviews: ParsedReview[] = []
  let parseFailures = 0
  for (const p of posts as Array<Record<string, unknown>>) {
    if (typeof p?.id !== 'number' || typeof p.cooked !== 'string') {
      parseFailures++
      continue
    }
    // 숨김·삭제된 글은 본문이 비거나 안내문이다 — 파서 고장이 아니다.
    if (p.hidden === true || p.deleted_at || p.user_deleted === true) continue
    // 시스템 글(post_type 3 = 조정자 액션, 4 = 귓속말, 2 = 소형 액션)은 사용자 목소리가 아니다.
    if (typeof p.post_type === 'number' && p.post_type !== 1) continue
    // 작성자 식별정보(v70 §10): 답글의 @핸들 멘션과 인용 머리글(title div)이 본문에 핸들을 싣는다 — 지운다.
    const cooked = p.cooked
      .replace(/<a\b[^>]*class="mention[^"]*"[^>]*>[^<]*<\/a>/g, '@user')
      .replace(/<div class="title">[\s\S]*?<\/div>/g, '')
    let text = disquiet.stripHtml(cooked)
    if (!text) continue
    if (p.post_number === 1 && title) text = `${title}\n\n${text}`
    reviews.push({ externalId: `topic:${id}#${p.id}`, text, rating: null, seller: null, authorMasked: null, writtenAt: kstDate(p.created_at), storyId: id })
  }
  return { reviews, nextCursor: null, parseFailures }
}

export function makeDiscourseAdapter(cfg: DiscourseConfig): ReviewSourceAdapter {
  return {
    key: cfg.key,
    displayName: cfg.displayName,
    // 게시판 타깃은 큐를 비워도 닫지 않는다(devto·disquiet 와 같다).
    incrementalOnly: true,

    // v70 Fable 검수 #3: 200 인데 JSON 이 아닌 응답(챌린지·점검 화면·로그인 HTML)이나 빈 응답은 "새 글 0건"이 아니라 차단이다 — 즉시 중단(우회 없음).
    // 이 표지가 없으면 목록 파싱 실패가 degraded(비중단)로만 남아 매 실행 반복된다. Discourse 의 정상 응답은 항상 JSON 객체('{')다.
    abortOnChallenge: true,
    isChallenge: (body: string) => !body.trimStart().startsWith('{'),

    nextRequest(target: TargetState): { url: string } | null {
      const slug = parseBoardRef(target.productRef)
      if (!slug || !(slug in cfg.boards)) return null
      const cur = decodeBoardCursor(target.cursor)
      if (cur.q.length === 0) return { url: `${cfg.host}${cfg.boards[slug]}` }
      return TOPIC_RE.test(cur.q[0]) ? { url: `${cfg.host}${cur.q[0]}` } : null
    },

    parse(body: string, ctx: ParseContext): ParseResult {
      const cur = decodeBoardCursor(ctx.cursor)
      if (cur.q.length === 0) return parseList(body, cur, ctx.lastReviewAt)
      // 큐가 있으면 이 응답은 큐 머리다. 본문을 보고 추측하지 않는다(types.ts 규약 2).
      const rest = { q: cur.q.slice(1), last: cur.last }
      const m = TOPIC_RE.exec(cur.q[0])
      const res = m ? parseTopic(body, m[1]) : { reviews: [], nextCursor: null, parseFailures: 1 }
      return { ...res, nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
    },
    // quotaMarkers 없음 = 모든 403/429 를 차단으로 본다(키 없는 공개 API).
  }
}

/** n8n 커뮤니티(Discourse). 게시판: feature-requests(5)=기능 요청 · questions(12)=질문 · latest=전체 최신. 실측 카테고리 id — fixtures/review/discourse/n8n-categories.json. */
export const N8N_COMMUNITY_HOST = 'https://community.n8n.io'
export const N8N_COMMUNITY_BOARDS: Record<string, string> = {
  'help-me-build-my-workflow': '/c/help-me-build-my-workflow/36.json?order=created',
  'feature-requests': '/c/feature-requests/5.json?order=created',
  questions: '/c/questions/12.json?order=created',
  latest: '/latest.json?order=created',
}
export const n8nCommunityAdapter = makeDiscourseAdapter({
  key: 'n8n_community',
  displayName: 'n8n 커뮤니티(Discourse)',
  host: N8N_COMMUNITY_HOST,
  boards: N8N_COMMUNITY_BOARDS,
})

// ── v70 D3: 같은 구조의 SaaS·노코드 포럼 5곳(2026-10-14 실측: robots 허용 · /latest.json 200 · 카테고리 id 는 각 /categories.json) ──
// 모두 약관에 자동 접근 금지 계열 문구가 있거나(Make·Retool·Softr: Discourse 기본 "You may not automate access to the forum…", Glide: "crawls, scrapes, or spiders")
// 약관 본문을 못 읽었다(Bubble) → 소스 행 라벨(tos_status·quote_allowed=false)로 표시하고 남헌 v70 개정 2 결정(owner_2026-10-14)으로 수집한다. 판정은 어댑터가 아니라 소스 행이 가진다.
export const MAKE_COMMUNITY_HOST = 'https://community.make.com'
export const MAKE_COMMUNITY_BOARDS: Record<string, string> = {
  questions: '/c/questions/66.json?order=created',
  'beginner-questions': '/c/beginner-questions/65.json?order=created',
}
export const makeCommunityAdapter = makeDiscourseAdapter({ key: 'make_community', displayName: 'Make 커뮤니티(Discourse)', host: MAKE_COMMUNITY_HOST, boards: MAKE_COMMUNITY_BOARDS })

export const BUBBLE_FORUM_HOST = 'https://forum.bubble.io'
export const BUBBLE_FORUM_BOARDS: Record<string, string> = {
  questions: '/c/questions/12.json?order=created',
  bugs: '/c/bugs/8.json?order=created',
  idea: '/c/idea/7.json?order=created',
  help: '/c/help/5.json?order=created',
}
export const bubbleForumAdapter = makeDiscourseAdapter({ key: 'bubble_forum', displayName: 'Bubble 포럼(Discourse)', host: BUBBLE_FORUM_HOST, boards: BUBBLE_FORUM_BOARDS })

export const RETOOL_COMMUNITY_HOST = 'https://community.retool.com'
export const RETOOL_COMMUNITY_BOARDS: Record<string, string> = {
  workflows: '/c/workflows/23.json?order=created',
  mobile: '/c/mobile/22.json?order=created',
  'feature-requests': '/c/feature-requests/7.json?order=created',
  'app-building': '/c/app-building/5.json?order=created',
}
export const retoolCommunityAdapter = makeDiscourseAdapter({ key: 'retool_community', displayName: 'Retool 커뮤니티(Discourse)', host: RETOOL_COMMUNITY_HOST, boards: RETOOL_COMMUNITY_BOARDS })

export const GLIDE_COMMUNITY_HOST = 'https://community.glideapps.com'
export const GLIDE_COMMUNITY_BOARDS: Record<string, string> = {
  bugs: '/c/bugs/7.json?order=created',
  'feature-requests': '/c/feature-requests/9.json?order=created',
  'help-how-to': '/c/help-how-to/27.json?order=created',
}
export const glideCommunityAdapter = makeDiscourseAdapter({ key: 'glide_community', displayName: 'Glide 커뮤니티(Discourse)', host: GLIDE_COMMUNITY_HOST, boards: GLIDE_COMMUNITY_BOARDS })

export const SOFTR_COMMUNITY_HOST = 'https://community.softr.io'
export const SOFTR_COMMUNITY_BOARDS: Record<string, string> = {
  'bug-reports': '/c/bug-reports/2.json?order=created',
  'feature-requests': '/c/feature-requests/8.json?order=created',
  'ask-the-community': '/c/ask-the-community/6.json?order=created',
}
export const softrCommunityAdapter = makeDiscourseAdapter({ key: 'softr_community', displayName: 'Softr 커뮤니티(Discourse)', host: SOFTR_COMMUNITY_HOST, boards: SOFTR_COMMUNITY_BOARDS })

export const __internal = { parseList, parseTopic, TOPIC_RE }
