// OKKY(okky.kr) 게시글·댓글 어댑터.
//
// 실측 근거: docs/review-source-findings-round5-b.md
//   "OKKY — 본문+댓글 전문이 JSON-LD 로 온다 (2026-09-18)"
// 이 파일의 구현 실측은 2026-09-18 에 글 15건을 직접 받아서 냈다(아래 ⚠️ 참조).
//
// ⚠️ robots.txt(200 · 1,733B · 그룹 19개) 실측 판정 — 리포 파서로 확인했다:
//      ALLOW /articles/1564214       (일치하는 규칙 없음)
//      DENY  /api/v1/...             (Disallow: /api/)
//      DENY  /users/1/articles       (Disallow: /users/*/articles)
//    ⛔ **목록을 API 로 받지 마라.** `/api/` 가 금지다. 글 URL 은
//       `https://okky.kr/sitemap.xml`(경로형, robots 허용)에서 얻는다 —
//       목록 페이지(`/articles` `/todays-best`)는 CSR 이라 링크가 안 나온다.
//    곁다리: OKKY 는 MJ12bot·Bytespider 등 16개 봇을 `Disallow: /` 로 막는
//    한편 GPTBot·ClaudeBot·Claude-User 는 Googlebot 과 같은 그룹에 넣어 일반
//    규칙만 적용한다. AI 크롤러를 배제하지 않는다는 의사 표시다. 우리 제품
//    토큰은 어느 명시 그룹에도 없어 `*` 그룹을 받는다.
//
// ⚠️ 약관(`okky.kr/legal/terms`, 평문 6,964자)에 크롤·로봇·스크래핑·마이닝·AI
//    조항이 **0건**이다. 자동화 조항 1건은 업로드 방향이고, 저작권 라이선스
//    조항은 오히려 "외부 사이트에서의 검색, 수집 및 링크 허용"을 적어 뒀다.
//    damoang(SP-025)·fmkorea(SP-028)처럼 "리스크를 인지하고 켠" 소스가 아니다.
//
// ⚠️ **경로는 `/articles/<번호>` 만 받는다.** robots 는 `/questions/<번호>` 도
//    열어 두지만 **그 경로를 실측하지 않았다.** 열고 싶으면 먼저 질문 글의
//    JSON-LD 를 떠서 @type 과 댓글(=답변) 구조가 같은지 확인해라 — 규칙만
//    넓히고 파서를 안 보면 조용히 0건이 된다.
//
// ── 댓글은 JSON-LD 의 `comment[]` 하나뿐이다. 렌더 DOM 에는 없다 ──
//
// ⚠️ 글 페이지의 댓글 `<ul>` 은 정적 HTML 에서 **항상 비어 있다**(실측:
//    댓글 6건인 1564214 에서도 `<ul></ul>`). 하이드레이션 뒤에 채워진다.
//    즉 `comment[]` 가 유일한 통로이고, 렌더 DOM 을 대조 마커로 쓸 수 없다.
//
// ⚠️ **`comment[]` 는 중첩이다. 평탄화하지 않으면 마커와 어긋난다.**
//    대댓글이 부모 Comment 의 `comment` 아래로 들어가고, 부모는 자기
//    `commentCount` 를 따로 갖는다. 글의 `commentCount` 는 **대댓글까지 합친
//    총합**이다. 실측 1564214: commentCount 6 = 최상위 2 + 대댓글 4.
//    최상위만 세면 6 vs 2 로 어긋나 "파싱 실패 4건"이라는 가짜 실패가 난다
//    (CLAUDE.md §7.1 의 에펨 사건과 같은 형태 — 그래서 재귀로 센다).
//
// ⚠️ **마커 부족분 1건까지는 실패로 세지 않는다. 실측 근거가 있다.**
//    2026-09-18 에 글 15건(사이트맵 최신 14건 + 조사가 쓴 1483234)을 받아
//    재귀 평탄화로 대조했다:
//      DiscussionForumPosting 있음  : 14건
//      commentCount == 평탄화 건수  : 13건 (0·1·3·4·6건짜리 전부 정확히 일치)
//      어긋난 글                    : 1건 — 1564218 (commentCount 1, 항목 0)
//      @type 이 Article 인 글       : 1건 — 1564206 (스폰서 글. 아래 readJsonLd 참조)
//    1564218 은 댓글 섹션이 멀쩡히 렌더되는데 `<ul>` 이 비어 있고 HTML 어디에도
//    note id 가 없다 = **삭제/블라인드된 댓글이 카운터에만 남은 상태**다.
//    이건 파서 고장이 아니므로 실패로 세면 안 된다. 그래서 관측된 정상
//    부족분의 상한(1건)만 눈감고 그 이상을 실패로 센다.
//
//    ponytail: 한 글에서 댓글이 2건 이상 삭제되면 그만큼 가짜 실패가 찍힌다.
//      건강도는 비율 판정(8/10, 표본 10 이상 — lib/review/health.ts)이라 그
//      정도로는 broken 까지 안 간다. 오탐이 실제로 쌓이면 상한을 올리지 말고
//      review_sources 에 소스별 허용치 컬럼을 두고 사람이 정하게 해라.
//
// ⚠️ **`url:` 모드는 1글=1요청이다.** 커서를 내지 않으므로 러너가 page 0 뒤에
//    곧바로 exhausted 로 닫는다(runner.ts:344). 즉 종료는 MAX_PAGES_PER_TARGET(20)
//    안전판이 아니라 구조로 성립한다 — 실측으로 고정해 뒀다
//    (scripts/review-okky-selftest.mjs "종료" 블록, CLAUDE.md §7.2 다나와 사건).
//
// ── 약관 재확인 (2026-09-24) ─────────────────────────────────────────
//
// 출처 URL: **https://okky.kr/legal/terms** (200 · 평문 6,968자). 위 ⚠️ 의 문구를
// 그 URL 에서 다시 떠서 대조했다 — `크롤`·`로봇`·`스크래`·`마이닝` 여전히 0건,
// 저작권 라이선스 조항의 *"… 외부 사이트에서의 검색, 수집 및 링크 허용을 위해서만
// 제한적으로 행사할 것입니다."* 1건 그대로다. 자동화 조항 1건도 업로드 방향 그대로.
//
// ── 게시판 모드 `board:<slug>` (2026-09-24 신설) ─────────────────────
//
// `url:` 모드는 사람이 글 주소를 하나씩 등록해야 해서 그게 병목이었다. 게시판
// 모드는 타깃 1개가 **목록 → 새 글 → 댓글**까지 스스로 순회한다.
//
// ⚠️ **`docs/review-source-findings-round5-b.md` 의 "목록 페이지는 CSR 이라 글 URL 을
//    긁지 못한다 — 사이트맵을 쓴다" 는 틀렸다(2026-09-24 실측).** 그 조사가 받아 본
//    `/articles` 는 **HTTP 404** 다(경로가 없다. 91KB 짜리 404 페이지가 온다).
//    실제 목록 경로는 404 페이지의 내비게이션에 있다: `/community` · `/questions` ·
//    `/events` · `/jobs`. `/community` 는 200 · 265,203B 이고 **정적 HTML 에
//    글 20건이 전부 들어 있다**:
//      <time dateTime="2026-09-24T00:59:11" …>약 8시간</time> … <a … href="/articles/1564558?topic=community">제목</a>
//    앵커 20개 · `<time>` 20개 · 1:1. 그래서 사이트맵을 쓰지 않는다.
//
// ⚠️ **카드 안에서 `<time>` 이 제목 앵커보다 먼저 온다.** 인덱스로 zip 하면 한 칸
//    밀려 다른 글의 시각이 붙는다(실측: 앵커0 뒤의 첫 `<time>` 은 앵커1 것이다).
//    그래서 "앵커 직전의 가장 가까운 `<time>`" 으로 짝지운다.
//
// ⚠️ 목록 slug 는 `community` 하나만 연다. `/questions` 는 목록이 SSR 인지,
//    상세(`/questions/<번호>`)의 JSON-LD 가 `/articles` 와 같은 구조인지 **실측하지
//    않았다**(이 세션의 호스트당 요청 예산을 다 썼다). 규칙만 넓히고 파서를 안 보면
//    조용히 0건이 된다 — 위 `url:` 모드 주석과 같은 이유로 막아 둔다.
//
// ⚠️ **robots 는 `/community` 를 막지 않는다**(2026-09-24 robots.txt 200 · 1,733B,
//    `fixtures/review/okky/robots.txt` 에 원문 저장). `*` 그룹이 막는 건
//    `/auth/ /new/ /settings/ /login /logout /recruits/*/new /api/ /changes$
//    /*/changes$ /users/*/{questions,articles,scraped,activity}` 다. 문서가 아니라
//    **리포 파서로** 판정한 결과를 scripts/review-board-y-selftest.mjs 가 고정한다.
//    Crawl-delay 는 `*` 그룹에 없다(bingbot 만 1초) → 간격은 DB 의 min_interval_ms
//    가 정한다. 등록 SQL 이 3,000ms 로 올린다.
//
// ⚠️ **같은 글을 `url:` 타깃과 `board:` 타깃이 동시에 덮으면 두 행이 된다.**
//    identity_key 가 `sourceKey|productRef|externalId` 라서 productRef 가 다르면
//    다른 리뷰로 적재된다(fingerprint.ts, SP-031 과 같은 형태). 게시판 모드로 넘어간
//    보드의 `url:` 타깃은 사람이 정리해야 한다 — 코드가 막지 못한다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://okky.kr'

/**
 * 관측된 정상 부족분의 상한. 위 ⚠️ 의 1564218 이 근거다.
 * 이 값을 올리는 것은 "탐지를 끄는 것"이므로 실측 없이 건드리지 마라.
 */
export const DELETED_COMMENT_TOLERANCE = 1

/** 글 경로. 쿼리 없는 경로형이라 SP-026(러너가 쿼리를 안 본다)과 무관하다. */
const REF_RE = /^\/articles\/\d{1,10}$/

/** `url:/articles/1564214` → `/articles/1564214`. 규칙 위반이면 null. */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  return p !== null && REF_RE.test(p) ? p : null
}

/**
 * 게시판 모드가 아는 목록. slug → 목록 경로 + 그 목록 앵커의 `topic` 값.
 *
 * `topic` 을 대조하는 이유: 한 페이지에 다른 목록의 글(사이드바 인기글 등)이
 * 섞여 와도 이 보드 것만 큐에 넣는다. 실측 `/community` 는 20개 전부
 * `?topic=community` 였다.
 */
const BOARDS: Record<string, { list: string; topic: string }> = {
  community: { list: '/community', topic: 'community' },
}

/**
 * 한 실행에 읽을 글 수 상한. 목록 1 + 글 19 = 러너의 MAX_PAGES_PER_TARGET(20).
 *
 * 상한을 어댑터가 들고 있는 이유: 커서가 DB 의 text 한 칸이라 목록이 갑자기
 * 100건을 주면 커서가 그만큼 커진다. 한 실행 몫으로 잘라 두면 커서 크기가
 * 구조적으로 묶인다.
 */
export const BOARD_QUEUE_MAX = 19

/**
 * `board:community` → `community`. 모르는 slug·형식 위반이면 null.
 *
 * ⚠️ **X 의 러너 PR(범용 게시판 큐 규약)이 머지되면 이 로컬 함수를 공용
 *    `parseBoardRef` 로 교체한다.** 규약이 두 벌이면 한쪽만 고쳐지는 사고가 난다.
 *    지금 그 파일이 아직 없어서 어댑터 안에 둔다.
 */
export function parseBoardRef(productRef: string): string | null {
  const m = /^board:([a-z0-9-]{1,32})$/i.exec((productRef ?? '').trim())
  if (!m) return null
  const slug = m[1].toLowerCase()
  return Object.prototype.hasOwnProperty.call(BOARDS, slug) ? slug : null
}

/** 게시판 커서: 안 읽은 글 큐 + 마지막(가장 새) 글 id. */
export interface BoardCursor {
  queue: string[]
  lastId: string | null
}

/**
 * 커서 디코드. **큐가 비면 null 을 돌려준다** — 호출부에서 "목록부터"와 같은 뜻이다.
 *
 * 읽을 수 없는 값(사람이 DB 를 손으로 고친 경우 등)도 null 이다. 그러면 목록
 * 패스로 되돌아가 스스로 복구한다. 여기서 실패로 세면 타깃이 영구히 멈춘다.
 */
function decodeBoardCursor(raw: string | null): BoardCursor | null {
  if (!raw) return null
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    return null
  }
  if (!doc || typeof doc !== 'object') return null
  const d = doc as Record<string, unknown>
  const queue = Array.isArray(d.queue) ? d.queue.filter((x): x is string => typeof x === 'string' && REF_RE.test(x)) : []
  if (queue.length === 0) return null
  return { queue, lastId: typeof d.lastId === 'string' ? d.lastId : null }
}

function encodeBoardCursor(c: BoardCursor): string {
  return JSON.stringify({ v: 1, queue: c.queue, lastId: c.lastId })
}

/**
 * 목록 HTML → 글 경로 큐.
 *
 * ⚠️ 항목이 0건이면 **파싱 실패 1건**이다. "오늘 새 글이 없다"가 아니라 목록
 *    컨테이너가 사라진 것이다 — 이 둘을 같은 글자로 찍으면 소스가 조용히 멈춘다
 *    (CLAUDE.md §7.1). okky `/community` 는 항상 20건을 준다.
 */
function parseBoardList(body: string, slug: string): { queue: string[]; lastId: string | null; parseFailures: number; timed: number; items: Array<{ path: string; at: string | null }> } {
  const topic = BOARDS[slug].topic
  // 하나의 정규식으로 `<time>` 과 글 앵커를 **문서 순서대로** 훑는다. 그래야
  // "앵커 직전의 가장 가까운 시각"을 한 번의 스캔으로 짝지을 수 있다.
  const re = /<time\s+dateTime="([^"]+)"|<a\b[^>]*?href="\/articles\/(\d{1,10})\?topic=([a-z]+)"/gi
  const seen = new Set<string>()
  const queue: string[] = []
  let pendingTime: string | null = null
  let timed = 0
  const items: Array<{ path: string; at: string | null }> = []
  let best: number | null = null

  for (;;) {
    const m = re.exec(body)
    if (!m) break
    if (m[1] !== undefined) {
      pendingTime = m[1]
      continue
    }
    const at = pendingTime
    pendingTime = null
    if (m[3].toLowerCase() !== topic) continue // 다른 목록의 글. 큐에 넣지 않는다.
    const id = m[2]
    if (seen.has(id)) continue
    seen.add(id)
    if (at !== null) timed++
    const n = Number(id)
    if (best === null || n > best) best = n
    const itemPath = `/articles/${id}`
    items.push({ path: itemPath, at })
    queue.push(itemPath)
  }

  // 항목은 있는데 시각 마커가 **전부** 없다 = 카드 구조가 바뀐 것이다.
  // (한두 건 빠지는 것은 공지·고정글일 수 있으므로 전멸만 실패로 센다.)
  const parseFailures = queue.length === 0 ? 1 : timed === 0 ? 1 : 0

  // items 는 검사용이다 — 짝짓기가 한 칸 밀렸는지 보려면 (경로, 시각) 쌍 자체를
  // 봐야 한다. 큐만 보면 잘못 짝지어도 똑같이 통과한다(§7.1: 검사 방법이 주장과 같아야).
  return { queue: queue.slice(0, BOARD_QUEUE_MAX), lastId: best === null ? null : String(best), parseFailures, timed, items }
}

/**
 * `&amp;` 류를 푼다. **`&amp;` 를 맨 마지막에** 푸는 순서가 중요하다 —
 * 먼저 풀면 `&amp;lt;` 가 `&lt;` 를 거쳐 `<` 가 된다(hackernews.ts 와 같은 이유).
 *
 * 실측: `text` 에는 태그가 없고 엔티티만 온다(`&quot;` 26개 · `&amp;` 다수).
 */
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

interface OkkyComment {
  text: unknown
  url: unknown
  datePublished: unknown
  comment?: unknown
}

interface OkkyPost {
  headline: string
  text: string
  datePublished: string
  url: string
  commentCount: number | null
  comment: OkkyComment[]
}

/**
 * JSON-LD 에서 `DiscussionForumPosting` 을 찾는다. 없으면 null.
 *
 * 블록이 2개 온다(DiscussionForumPosting + BreadcrumbList)고 순서가 바뀔 수
 * 있으므로 전부 훑는다. 문자열 슬라이싱이 아니라 JSON.parse 로 읽는다 —
 * 본문에 `}` 가 들어 있어도 안 깨진다.
 *
 * ⚠️ 이게 null 인 것이 "글이 없다"는 뜻은 아니다. 실측 1564206 은 HTTP 200 ·
 *    113KB 인데 `@type` 이 `Article` 인 스폰서 글이라 여기서 null 이 난다.
 *    그 경우도 파싱 실패로 센다 — 우리가 원한 글을 못 읽은 건 사실이다.
 */
function readJsonLd(body: string): OkkyPost | null {
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
      if (!node || typeof node !== 'object') continue
      const n = node as Record<string, unknown>
      if (n['@type'] !== 'DiscussionForumPosting') continue
      return {
        headline: typeof n.headline === 'string' ? n.headline : '',
        text: typeof n.text === 'string' ? n.text : '',
        datePublished: typeof n.datePublished === 'string' ? n.datePublished : '',
        url: typeof n.url === 'string' ? n.url : '',
        commentCount: typeof n.commentCount === 'number' ? n.commentCount : null,
        comment: toComments(n.comment),
      }
    }
  }
}

function toComments(raw: unknown): OkkyComment[] {
  if (Array.isArray(raw)) return raw.filter((c) => c && typeof c === 'object') as OkkyComment[]
  if (raw && typeof raw === 'object') return [raw as OkkyComment]
  return []
}

/**
 * 중첩 댓글을 깊이 우선으로 평탄화한다.
 *
 * ⚠️ 여기가 마커 대조의 분모다. 최상위만 세면 대댓글이 전부 "못 읽은 것"이 된다.
 */
function flattenComments(nodes: OkkyComment[], out: OkkyComment[] = []): OkkyComment[] {
  for (const c of nodes) {
    out.push(c)
    flattenComments(toComments(c.comment), out)
  }
  return out
}

/** `https://okky.kr/articles/1564214#note-2086327` → `{ path, note }`. */
function splitCommentUrl(raw: unknown): { path: string; note: string } | null {
  if (typeof raw !== 'string') return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const m = /^#note-(\d+)$/.exec(u.hash)
  return m ? { path: u.pathname, note: m[1] } : null
}

/**
 * 글 1개의 본문+댓글을 읽는다. `url:` 모드와 `board:` 모드가 **같은 이 함수**를 쓴다.
 *
 * `postPath` 가 스코프다 — 응답이 다른 글이면 받지 않는다. url: 모드는 productRef
 * 에서, board: 모드는 커서 큐의 머리에서 오고, 둘 다 nextRequest 가 그 경로로
 * 요청한 뒤라 일치해야 정상이다.
 */
function parsePost(body: string, postPath: string): { reviews: ParsedReview[]; parseFailures: number; filtered: number } {
  const reviews: ParsedReview[] = []
  let parseFailures = 0
  let filtered = 0

  const ld = readJsonLd(body)
  if (!ld) {
    return { reviews, parseFailures: 1, filtered }
  }

  // ── 우리가 요청한 글이 맞는지 ──────────────────────────────────
  // 리다이렉트나 canonical 변경으로 다른 글이 오면, 그 글 내용이 이 타깃의
  // project_id 로 적재된다(텀블벅에서 실제로 났던 사고 — SP-031).
  if (ld.url) {
    let served: string | null = null
    try {
      served = new URL(ld.url).pathname
    } catch {
      served = null
    }
    if (served !== postPath) {
      return { reviews, parseFailures: 1, filtered }
    }
  }

  // ── 글 본문 ───────────────────────────────────────────────────
  const postText = [ld.headline, decodeEntities(ld.text)].filter(Boolean).join('\n\n').trim()
  if (!postText) {
    // DiscussionForumPosting 은 있는데 제목·본문이 둘 다 비었다 = 필드명이
    // 바뀐 것이다. 댓글만 읽히면 "수집은 되는데 글이 없는" 상태로 몇 주 간다.
    parseFailures++
  } else {
    reviews.push({
      externalId: postPath,
      text: postText,
      rating: null,
      seller: null,
      authorMasked: null,
      // datePublished 는 **KST 오프셋이 붙은 ISO** 다(실측
      // `2026-09-17T20:42:12+09:00` · `2023-12-30T15:56:12+09:00`).
      // 앞 10자가 곧 KST 날짜다. 벨로그(UTC `Z`)와 다르다 — 헷갈리지 마라.
      writtenAt: /^\d{4}-\d{2}-\d{2}/.test(ld.datePublished) ? ld.datePublished.slice(0, 10) : null,
      storyId: null,
    })
  }

  // ── 댓글 ──────────────────────────────────────────────────────
  const flat = flattenComments(ld.comment)

  for (const c of flat) {
    const loc = splitCommentUrl(c.url)
    if (!loc) {
      // url 이 없거나 `#note-<숫자>` 가 아니다 = 정체성을 만들 수 없다.
      // 본문 해시를 정체성으로 쓰면 수정된 댓글이 매번 새 행이 된다
      // (fingerprint.ts 의 ⚠️). 그래서 버리고 실패로 센다.
      parseFailures++
      continue
    }
    if (loc.path !== postPath) {
      // **이 글의 댓글이 아니다.** 필드는 멀쩡히 읽혔고 이 타깃과 무관할
      // 뿐이라 실패가 아니라 filtered 다(hackernews·tumblbug 와 같은 용법).
      // 안 거르면 같은 댓글이 타깃마다 새 행으로 적재된다 — identity_key 에
      // productRef 가 들어가기 때문이다(fingerprint.ts:69, SP-031).
      filtered++
      continue
    }
    const text = decodeEntities(typeof c.text === 'string' ? c.text : '').trim()
    // 컨테이너는 멀쩡한데 알맹이가 없는 경우다. 파서가 깨진 게 아니므로
    // 실패로 세지 않는다 — 저장할 텍스트가 없을 뿐이다(damoang 과 같다).
    if (!text) continue

    const at = typeof c.datePublished === 'string' ? c.datePublished : ''
    reviews.push({
      externalId: `${postPath}#note-${loc.note}`,
      text,
      rating: null,
      seller: null,
      authorMasked: null,
      // 댓글도 KST 오프셋 ISO 다(실측 `2026-09-17T21:08:33+09:00`).
      // damoang 과 달리 전 건에 다 들어 있어 추정할 게 없다.
      writtenAt: /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : null,
      storyId: postPath,
    })
  }

  // ── 마커 대조 ─────────────────────────────────────────────────
  // `commentCount` 가 유일한 개수 마커다(렌더 DOM 은 비어 있다). 부족분에서
  // 삭제 허용치를 뺀 만큼만 실패로 센다 — 근거는 파일 머리의 실측 17건.
  if (ld.commentCount !== null && ld.commentCount > flat.length) {
    parseFailures += Math.max(0, ld.commentCount - flat.length - DELETED_COMMENT_TOLERANCE)
  }

  return { reviews, parseFailures, filtered }
}

export const okkyAdapter: ReviewSourceAdapter = {
  key: 'okky',
  displayName: 'OKKY 게시글·댓글',

  // 남헌 2026-09-23 Q3(a): 이 소스의 타깃은 페이지 상한에 닿아도 닫지 않는다.
  //
  // ⚠️ **types.ts 의 incrementalOnly 주석이 "커뮤니티 url: 에는 켜지 마라"고 적어 둔
  //    바로 그 자리다.** 그 경고는 유효하고, 남헌이 그걸 알고 뒤집었다. 전제가 바뀐 게 아니다 —
  //    대가(같은 글을 매일 1요청씩 다시 읽는다)를 받아들인 것이다. 근거:
  //    커뮤니티 타깃 85개 중 80개가 "성과 없어서"가 아니라 "끝까지 읽어서" 닫혔고,
  //    되살리는 코드가 리포에 없어 그 질의는 영영 다시 안 돌았다
  //    (reports/2026-09-23/voc-expansion-investigation.md §3).
  //
  // 게시글에 댓글이 계속 달린다 — 대상이 고정된 문서가 아니라 자라는 스레드다.
  //
  // 비용: 1글 = 1요청이므로 실행당 타깃 수만큼이다(커서가 첫 페이지에 null 이 되어
  // 20페이지를 훑지 않는다). 새 글이 안 달리면 consecutive_empty 만 늘고 닫히지 않는다 —
  // 그 상한은 아직 없다. 늘어나면 재활성화 조건(empty<3)을 러너에 넣어야 한다.
  incrementalOnly: true,

  // ⚠️ **게시판 모드에 필요한 러너 변경(이 PR 에서 고치지 않았다 — X 소유 파일)**
  //
  //   1) `nextRequest` 가 null 을 내면 러너는 `status='exhausted'` 로 닫는다
  //      (runner.ts 의 `outcome='다음 요청 없음'` 분기). `incrementalOnly` 를 보지
  //      않는다. 그래서 게시판 모드는 **큐를 다 비울 때 nextCursor=null 로 끝낸다** —
  //      그 경로는 endStatus(=active)를 타서 타깃이 살아남는다. nextRequest 로 끝내면
  //      첫 실행 뒤 영구히 닫힌다.
  //   2) 그 대가로 **`lastId` 가 실행마다 초기화된다.** 커서가 null 이 되면서 사라진다.
  //      즉 매 실행이 목록 첫 페이지를 다시 읽고 그 20건을 다시 받는다(지문이 중복
  //      적재는 막지만 요청은 쓴다). `url:` 커뮤니티 타깃이 같은 글을 매일 다시 읽는
  //      것과 같은 대가다(types.ts incrementalOnly).
  //      ponytail: 상한은 "보드당 매 실행 20요청". X 의 러너가 커서를 보존하면
  //        `lastId` 로 이미 읽은 글을 건너뛰게 연결해라. 지금 그 분기를 미리 써 두면
  //        **절대 실행되지 않는 코드**가 되므로 값만 기록하고 쓰지 않는다.
  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    if (slug) {
      const c = decodeBoardCursor(target.cursor)
      // 커서가 없거나 못 읽는 값이다 = 목록부터. 손상된 커서로 멈추지 않고 복구한다.
      if (!c) return { url: `${HOST}${BOARDS[slug].list}` }
      return { url: `${HOST}${c.queue[0]}` }
    }

    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const slug = parseBoardRef(ctx.productRef)
    if (slug) {
      // ⚠️ nextRequest 와 **같은 커서로 같은 판단**을 해야 한다. 러너는 요청에
      //    쓴 커서를 그대로 ctx.cursor 로 넘기므로(runner.ts), 두 함수가 커서만
      //    보고 결정하면 "무엇을 받았는지"가 어긋날 수 없다.
      const c = decodeBoardCursor(ctx.cursor)
      if (!c) {
        const list = parseBoardList(body, slug)
        return {
          reviews: [],
          // 큐가 비면 null — 러너가 endStatus(active)로 끝낸다. 위 ⚠️ 1) 참조.
          nextCursor: list.queue.length > 0 ? encodeBoardCursor({ queue: list.queue, lastId: list.lastId }) : null,
          parseFailures: list.parseFailures,
          filtered: 0,
        }
      }
      const post = parsePost(body, c.queue[0])
      const rest = c.queue.slice(1)
      return {
        reviews: post.reviews,
        nextCursor: rest.length > 0 ? encodeBoardCursor({ queue: rest, lastId: c.lastId }) : null,
        parseFailures: post.parseFailures,
        filtered: post.filtered,
      }
    }

    const p = parseProductRef(ctx.productRef)
    if (!p) {
      // nextRequest 가 같은 검사를 하므로 실행 경로에서는 안 온다. 그래도
      // 스코프를 모르는 채로는 받지 않는다 — 조용히 0건으로 지나가면
      // "댓글 없음"과 구분이 안 된다(§7.1).
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered: 0 }
    }

    // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
    // 나중에 달린 댓글을 받으려면 사람이 DB 에서 status='active' 로 되돌려야
    // 한다(자동 재활성화는 만들지 않았다).
    const post = parsePost(body, p)
    return { reviews: post.reviews, nextCursor: null, parseFailures: post.parseFailures, filtered: post.filtered }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
  // 스크래핑 소스라 "정상적인 쿼터 소진" 개념이 없다.
}

export const __internal = { readJsonLd, flattenComments, splitCommentUrl, decodeEntities, REF_RE, parseBoardList, decodeBoardCursor, encodeBoardCursor, BOARDS }
