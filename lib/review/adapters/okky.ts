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
// ⚠️ **1글=1요청이다.** 커서를 내지 않으므로 러너가 page 0 뒤에 곧바로
//    exhausted 로 닫는다(runner.ts:344). 즉 종료는 MAX_PAGES_PER_TARGET(20)
//    안전판이 아니라 구조로 성립한다 — 실측으로 고정해 뒀다
//    (scripts/review-okky-selftest.mjs "종료" 블록, CLAUDE.md §7.2 다나와 사건).

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

export const okkyAdapter: ReviewSourceAdapter = {
  key: 'okky',
  displayName: 'OKKY 게시글·댓글',

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)
    if (!p) {
      // nextRequest 가 같은 검사를 하므로 실행 경로에서는 안 온다. 그래도
      // 스코프를 모르는 채로는 받지 않는다 — 조용히 0건으로 지나가면
      // "댓글 없음"과 구분이 안 된다(§7.1).
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered: 0 }
    }

    const reviews: ParsedReview[] = []
    let parseFailures = 0
    let filtered = 0

    const ld = readJsonLd(body)
    if (!ld) {
      return { reviews, nextCursor: null, parseFailures: 1, filtered }
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
      if (served !== p) {
        return { reviews, nextCursor: null, parseFailures: 1, filtered }
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
        externalId: p,
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
      if (loc.path !== p) {
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
        externalId: `${p}#note-${loc.note}`,
        text,
        rating: null,
        seller: null,
        authorMasked: null,
        // 댓글도 KST 오프셋 ISO 다(실측 `2026-09-17T21:08:33+09:00`).
        // damoang 과 달리 전 건에 다 들어 있어 추정할 게 없다.
        writtenAt: /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : null,
        storyId: p,
      })
    }

    // ── 마커 대조 ─────────────────────────────────────────────────
    // `commentCount` 가 유일한 개수 마커다(렌더 DOM 은 비어 있다). 부족분에서
    // 삭제 허용치를 뺀 만큼만 실패로 센다 — 근거는 파일 머리의 실측 17건.
    if (ld.commentCount !== null && ld.commentCount > flat.length) {
      parseFailures += Math.max(0, ld.commentCount - flat.length - DELETED_COMMENT_TOLERANCE)
    }

    // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
    // 나중에 달린 댓글을 받으려면 사람이 DB 에서 status='active' 로 되돌려야
    // 한다(자동 재활성화는 만들지 않았다).
    return { reviews, nextCursor: null, parseFailures, filtered }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
  // 스크래핑 소스라 "정상적인 쿼터 소진" 개념이 없다.
}

export const __internal = { readJsonLd, flattenComments, splitCommentUrl, decodeEntities, REF_RE }
