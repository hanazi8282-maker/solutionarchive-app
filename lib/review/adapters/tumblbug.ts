// 텀블벅 창작자 후기 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "VOC 소스 3종 실측 — tumblbug · naver_blog · bobaedream (2026-09-17)"
//
// ⚠️ **남헌 2026-09-17 결정을 알고 써라(SP-031).** 텀블벅 이용약관의
//    "자동화된 수단으로 서비스를 조작·이용" 금지 조항을 인지한 채로 사람이
//    수집 진행을 결정했다. 그래서 `enabled=false` 로 등록해 사람이 켜야 시작한다.
//
// ── 수집 축이 상품이 아니라 **창작자**다. 설계가 한 번 바뀐 자리다 ──
//
// 원래 설계는 "프로젝트 설명 1건 + 후원자 코멘트 N건" 이었다. 실측에서 **둘 다
// 정적 HTML 에 없었다**: MOBX_STATE 에 코멘트 스토어 자체가 없고
// `projectStore.project.story` 는 null 이다. 둘 다 robots 가 막은 `/api/` XHR
// 로만 온다. 그래서 그 설계는 폐기했다.
//
// 정적으로 오는 VOC 는 이것 하나뿐이다:
//   MOBX_STATE.projectStore.creators[i][1].review.contents[]
// 화면 라벨 그대로 **"이 창작자의 지난 프로젝트 후기"** 다. 즉 지금 보고 있는
// 프로젝트의 후기가 아니라 그 창작자가 과거에 한 프로젝트들의 후기다.
//
// ⚠️ **창작자 단위 URL 은 없다.** `/neogury` · `/user/neogury` ·
//    `/creator/neogury` 를 전부 받아 봤는데 셋 다 HTTP 200 이지만 후기 payload
//    가 없는 SPA 껍데기(36KB)였다. 그래서 productRef 는 **프로젝트 경로**다.
//
// ── ⛔ 여기서 한 번 틀렸다. 고친 내용을 먼저 읽어라 (2026-09-17 QA) ──
//
// 처음 판은 "externalId = `tbr:<id>` 는 프로젝트와 무관한 전역 고유값이라, 같은
// 창작자의 어느 페이지로 들어와도 지문이 중복을 걸러 준다"고 적어 뒀다.
// **틀렸다. 재현해서 확인했다.**
//
//   computeFingerprint 의 identity_key = sha256(`sourceKey|productRef|externalId`)
//   (lib/review/fingerprint.ts:69) — **productRef 가 키에 들어간다.**
//   `/eastereggs` 타깃과 `/clear` 타깃이 같은 후기를 내면 externalId 는 같지만
//   productRef 가 달라 identity_key 가 달라진다. store 는 identity_key UNIQUE
//   로만 중복을 판정하므로(store.ts:118) **같은 후기가 두 행으로 적재된다.**
//   실측: 4건 중 identity_key 교집합 0건 = 4건이 8행이 된다.
//
// 즉 공용 지문은 "타깃(=상품) 안에서의 고유값"을 기대하는데 창작자 축 id 는 그
// 계약을 깬다. 지문은 다른 7개 소스가 같이 쓰는 파일이라 고치지 않는다 — 대신
// **어댑터가 계약을 지키는 쪽으로** 바꿨다:
//
//   ⇒ **이 타깃 프로젝트의 후기만 받는다.** `projectPermalink` 이 productRef 의
//      slug 와 다른 후기는 `filtered` 로 세고 버린다(파싱 실패가 아니다 —
//      필드는 멀쩡히 읽혔고 이 타깃과 무관할 뿐이다. hackernews 와 같은 용법).
//
//   그러면 후기 하나는 자기 프로젝트 타깃 **한 곳에서만** 나오므로 타깃을
//   여러 개 잡아도 중복 적재가 없다. 겸사겸사 적재 오류도 하나 사라진다 —
//   전에는 `/clear` 후기가 `/eastereggs` 타깃의 project_id 로 들어갔다.
//   (재현·고정: scripts/review-tumblbug-selftest.mjs "타깃간중복" 블록)
//
// ⚠️ **그래서 한 페이지에서 받는 건수가 준다.** 실측 `/eastereggs` 는 4건 중
//    2건(나머지 2건은 `/clear` 것), `/cairn` 은 **0건**이다(4건 다 남의 것).
//    창작자 프리뷰는 어느 페이지에서나 같은 4건이므로, 그 4건을 다 받고 싶으면
//    **후기가 달린 프로젝트(storyId 에 보이던 slug)를 각각 타깃으로 등록**해라.
//    그렇게 해도 서로 겹치지 않는다. 진행 중인 프로젝트는 자기 후기가 아직
//    없어 0건이 정상이다.
//
// ⚠️ **한 번에 최대 4건이다.** 마커(`totalReviewCount`)는 66 인데 `contents` 는
//    4건만 온다 — 프리뷰 상한이다. 그래서 마커와 항목 수의 차이를 실패로 세면
//    안 된다(그랬다면 매번 실패 62건이 찍힌다). 마커가 >0 인데 0건일 때만 실패다.
//
// ── 게시판 모드 `board:discover:<category>` — ⛔ 열지 못했다 (2026-09-24 실측) ──
//
// robots 가 `Allow: /discover?category=` 로 **딱 한 경로만** 열어 둔다. 그 경로를
// 실제로 받아 봤고(200 · 59,697B), **목록을 얻을 수 없다**는 결론이다:
//
//   렌더 텍스트           690자
//   프로젝트 링크          0개 (href 는 CDN·푸터·`/notices`·`/onboarding` 뿐)
//   MOBX_STATE            projectStore.projects = **[]** (빈 배열)
//
// 즉 목록도 창작자 설명·코멘트와 같은 자리에 있다 — `/api/` XHR 이고 robots 금지다.
// 남은 정적 목록은 `Sitemap: https://www.tumblbug.com/sitemap/sitemap.xml` 하나인데
// 그건 카테고리로 갈리지 않으므로 "게시판"이 아니다(요청하지 않았다).
//
// ⚠️ **이건 "댓글/후기가 없다"가 아니다. "목록을 못 읽었다"다.** 그래서 파서가
//    빈 목록을 0건이 아니라 **파싱 실패 1건**으로 낸다(§7.1). 코드와 셀프테스트에
//    남겨 둔 이유는 텀블벅이 목록을 SSR 로 바꾸는 날 빨간불이 뜨게 하려는 것이다.
//
// ⚠️ **그래서 `board:discover:*` 타깃을 등록하지 않았다.** 등록 SQL
//    (supabase/migrations/20260930000009_board_targets_y.sql)에 근거와 함께
//    주석으로만 남겼다. 지금 켜면 매일 실패 1건을 찍는 타깃이 된다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://tumblbug.com'

/**
 * robots.txt 가 막은 접두(실측 2026-09-17):
 *   Disallow: /api/  /auth/  /sessions/  /oauth/  /discover?  /search?
 *
 * ⚠️ 러너의 robots 판정은 쿼리를 떼고 본다(runner.ts:153, SP-026). `/discover?`
 *    `/search?` 는 그래서 공용 안전장치로 안 막힌다 — 어댑터가 직접 막는다.
 */
const ROBOTS_DENY = ['/api/', '/auth/', '/sessions/', '/oauth/', '/discover', '/search']

/**
 * `url:/eastereggs` → `/eastereggs`. 규칙 위반·robots 금지면 null.
 *
 * 프로젝트 경로는 **한 세그먼트**다(`/project/<slug>` 가 아니다 — sitemap 실측).
 * 탭 경로(`/<slug>/story`, `/<slug>/community/backer`)도 받지 않는다: 후기
 * payload 는 어느 탭에서나 같으므로 여러 표기를 받으면 같은 창작자를 여러 번
 * 긁게 될 뿐이다.
 */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  if (!p) return null
  if (p.includes('?')) return null
  if (ROBOTS_DENY.some((bad) => p === bad || p.startsWith(bad))) return null
  // `/<slug>` 한 세그먼트만. slug 는 영숫자·`_`·`-` 다(sitemap 실측).
  if (!/^\/[A-Za-z0-9_-]+$/.test(p)) return null
  return p
}

/** hydration JSON 의 시작 지점. `window.MOBX_STATE = {…}` */
const STATE_MARK = 'window.MOBX_STATE = '

/**
 * `{` 부터 짝이 맞는 `}` 까지 잘라낸다.
 *
 * 비탐욕 정규식으로 자르면 첫 `}` 에서 끊겨 **항상** 파싱에 실패한다.
 * 문자열 안의 중괄호·이스케이프를 건너뛰어야 해서 직접 센다.
 */
function sliceJson(s: string, from: number): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(from, i + 1)
    }
  }
  return null
}

function readState(body: string): Record<string, unknown> | null {
  const i = body.indexOf(STATE_MARK)
  if (i < 0) return null
  const start = body.indexOf('{', i + STATE_MARK.length)
  if (start < 0) return null
  const raw = sliceJson(body, start)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

/** `2026-02-26T16:12:58` → `2026-02-26`. 절대 시각이라 추정할 게 없다. */
function isoDate(s: unknown): string | null {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

interface CreatorReview {
  totalReviewCount: number | null
  contents: Array<Record<string, unknown>>
}

/** `projectStore.creators` 는 `[[key, creator], …]` 꼴이다(Map 직렬화). */
function readCreatorReviews(state: Record<string, unknown> | null): CreatorReview[] | null {
  const store = state?.projectStore as Record<string, unknown> | undefined
  const creators = store?.creators
  if (!Array.isArray(creators)) return null

  const out: CreatorReview[] = []
  for (const entry of creators) {
    // [key, creator] 쌍. 형태가 다르면 그 항목만 건너뛴다.
    const creator = Array.isArray(entry) ? entry[1] : entry
    if (!creator || typeof creator !== 'object') continue
    const review = (creator as Record<string, unknown>).review
    if (!review || typeof review !== 'object') {
      // 창작자는 있는데 review 키가 없다 = 구조가 바뀐 것이다.
      out.push({ totalReviewCount: null, contents: [] })
      continue
    }
    const r = review as Record<string, unknown>
    out.push({
      totalReviewCount: typeof r.totalReviewCount === 'number' ? r.totalReviewCount : null,
      contents: Array.isArray(r.contents) ? (r.contents as Array<Record<string, unknown>>) : [],
    })
  }
  return out
}

/**
 * robots 가 **유일하게 연** 목록 경로. 쿼리까지가 규칙의 일부다.
 *
 * 실측 robots.txt(2026-09-24 · 200 · 318B, 원문은 `fixtures/review/tumblbug/robots.txt`):
 *   Allow:    /discover?category=
 *   Disallow: /discover?
 *   Disallow: /search?
 *
 * ⚠️ **러너의 robots 판정으로는 이 규칙을 못 지킨다.** 판정이 `u.pathname` 만 보므로
 *    (runner.ts, SP-026) `/discover?category=x`(허용) 과 `/discover?sort=popular`(금지)가
 *    둘 다 "일치하는 규칙 없음 = allowed" 로 나온다. 그래서 **어댑터가 쿼리를
 *    직접 고정한다** — `?category=<slug>` 외의 어떤 쿼리도 만들지 않는다.
 *    scripts/review-board-y-selftest.mjs 가 이 두 사실(코드 판정이 쿼리를 못 본다 /
 *    쿼리를 붙여 판정하면 Allow 가 이긴다)을 실측 robots 원문으로 고정한다.
 */
const DISCOVER_PATH = '/discover'

/**
 * 한 실행에 읽을 프로젝트 수 상한. 목록 1 + 프로젝트 19 = 러너의 MAX_PAGES_PER_TARGET(20).
 * okky.ts 가 같은 값을 갖는다 — X 의 러너 PR 이 공용 상수를 내면 그걸로 바꾼다.
 */
const BOARD_QUEUE_MAX = 19

/** 카테고리 slug. 소문자·숫자·`-` 만. 쿼리 스머글링(`a&b=`)이 낄 자리를 없앤다. */
const CATEGORY_RE = /^[a-z0-9-]{1,32}$/

/**
 * `board:discover:technology` → `technology`. 형식 위반이면 null.
 *
 * ⚠️ **X 의 러너 PR(범용 게시판 큐 규약)이 머지되면 공용 `parseBoardRef` 로 교체한다.**
 *    지금 그 파일이 없어서 어댑터 로컬에 둔다. okky.ts 에도 같은 이름의 로컬 함수가
 *    있다 — 규약이 두 벌인 상태이므로 한쪽만 고치지 마라.
 */
export function parseBoardRef(productRef: string): string | null {
  const m = /^board:discover:(.+)$/i.exec((productRef ?? '').trim())
  if (!m) return null
  const cat = m[1].trim().toLowerCase()
  return CATEGORY_RE.test(cat) ? cat : null
}

/** 게시판 커서: 안 읽은 프로젝트 큐 + 마지막 프로젝트 permalink. */
interface BoardCursor {
  queue: string[]
  lastId: string | null
}

/** 큐가 비거나 못 읽는 값이면 null = "목록부터". okky.ts 와 같은 규약이다. */
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
  const queue = Array.isArray(d.queue)
    ? d.queue.filter((x): x is string => typeof x === 'string' && /^\/[A-Za-z0-9_-]+$/.test(x))
    : []
  if (queue.length === 0) return null
  return { queue, lastId: typeof d.lastId === 'string' ? d.lastId : null }
}

function encodeBoardCursor(c: BoardCursor): string {
  return JSON.stringify({ v: 1, queue: c.queue, lastId: c.lastId })
}

/**
 * 카테고리 목록 → 프로젝트 경로 큐.
 *
 * ⛔ **2026-09-24 실측: 이 경로로는 목록을 얻을 수 없다.** `/discover?category=technology`
 *    는 200 · 59,697B 인데 **렌더 텍스트가 690자**고, hydration 에
 *    `projectStore.projects` 가 **빈 배열**로 온다(`"projects":[]`). 프로젝트 링크가
 *    HTML 에 **0개**다(href 는 전부 CDN·푸터·`/notices`·`/onboarding`). 목록은
 *    `/api/` XHR 로만 오고 그건 robots 가 막은 경로다.
 *
 *    그래서 이 파서는 **빈 목록을 0건이 아니라 파싱 실패 1건으로 보고한다**(§7.1).
 *    "이 카테고리에 프로젝트가 없다"와 "목록이 CSR 이라 우리에게 안 온다"는 다른
 *    사건이고, 후자는 우리가 못 읽은 것이다. 이 판정을 코드로 박아 둔 이유는,
 *    텀블벅이 나중에 목록을 SSR 로 바꾸면 셀프테스트가 **빨간불로** 알려 주게
 *    하려는 것이다(그때 큐가 채워지고 아래 프로젝트 패스가 살아난다).
 *
 * ⚠️ 그래서 이 소스의 `board:discover:*` 타깃은 **등록하지 않았다.** 등록하면 매일
 *    실패 1건을 찍으며 도는 타깃이 된다. 근거는 등록 SQL
 *    (supabase/migrations/20260930000009_board_targets_y.sql)의 주석에 같이 남겼다.
 */
function parseDiscoverList(body: string): { queue: string[]; lastId: string | null; parseFailures: number } {
  const state = readState(body)
  if (!state) {
    // hydration JSON 자체가 없다 = 우리가 아는 페이지가 아니다.
    return { queue: [], lastId: null, parseFailures: 1 }
  }
  const store = state.projectStore as Record<string, unknown> | undefined
  const projects = Array.isArray(store?.projects) ? (store.projects as unknown[]) : null
  if (projects === null) {
    // `projects` 키가 사라졌다 = 구조 변경. 빈 배열(위 ⛔)과 구분해 둔다.
    return { queue: [], lastId: null, parseFailures: 1 }
  }

  const queue: string[] = []
  for (const raw of projects) {
    if (!raw || typeof raw !== 'object') continue
    const permalink = (raw as Record<string, unknown>).permalink
    if (typeof permalink !== 'string' || !/^[A-Za-z0-9_-]+$/.test(permalink)) continue
    const path = `/${permalink}`
    if (!queue.includes(path)) queue.push(path)
  }

  return {
    queue: queue.slice(0, BOARD_QUEUE_MAX),
    lastId: queue.length > 0 ? queue[0].slice(1) : null,
    // 0건 = 위 ⛔ 의 CSR 껍데기다. 실패로 센다.
    parseFailures: queue.length === 0 ? 1 : 0,
  }
}

/**
 * 프로젝트 1개의 창작자 후기를 읽는다. `url:` 모드와 `board:` 모드가 같은 이 함수를 쓴다.
 *
 * `scopeSlug` 가 정체성의 스코프다 — 다른 프로젝트 후기는 filtered 로 버린다(헤더 SP-031).
 */
function parseProjectReviews(body: string, scopeSlug: string): { reviews: ParsedReview[]; parseFailures: number; filtered: number } {
  const reviews: ParsedReview[] = []
  let parseFailures = 0
  let filtered = 0

  const state = readState(body)
  if (!state) {
    // hydration JSON 이 통째로 없다. SPA 껍데기를 받은 것이다 —
    // HTTP 200 이어도 내용이 0 인 경우다(CLAUDE.md §7.1).
    return { reviews, parseFailures: 1, filtered }
  }

  const creators = readCreatorReviews(state)
  if (creators === null || creators.length === 0) {
    // creators 자체가 없다 = 구조 변경.
    return { reviews, parseFailures: 1, filtered }
  }

  const seen = new Set<string>()
  for (const c of creators) {
    if (c.totalReviewCount === null) {
      // review 키 소실. "후기 0건"과 **다른 사건**이다.
      parseFailures++
      continue
    }

    for (const item of c.contents) {
      const id = item.projectWarrantyReviewId
      const text = typeof item.body === 'string' ? item.body.trim() : ''
      if (typeof id !== 'number' && typeof id !== 'string') {
        // 고유 id 가 없다. composite 폴백을 만들지 않고 실패로 센다 —
        // 폴백으로 지문을 만들면 같은 후기가 새 리뷰로 계속 쌓인다.
        parseFailures++
        continue
      }
      const permalink = typeof item.projectPermalink === 'string' ? item.projectPermalink : null
      if (!permalink) {
        // 소속 프로젝트를 모르면 이 후기를 어느 타깃에 묶을지 정할 수 없다.
        // 그 상태로 받으면 정체성이 productRef 에 따라 갈려 중복이 된다.
        // 고유 id 소실과 같은 급의 구조 변경이라 실패로 센다.
        parseFailures++
        continue
      }
      if (permalink !== scopeSlug) {
        // 이 창작자의 **다른 프로젝트** 후기다. 그 프로젝트를 타깃으로 잡으면
        // 거기서 받는다 — 여기서 받으면 타깃 간 중복 적재가 된다(헤더 참조).
        filtered++
        continue
      }

      if (!text) {
        // 컨테이너는 멀쩡한데 알맹이가 없다(사진만 올린 후기).
        // 파서가 깨진 게 아니므로 실패로 세지 않는다.
        continue
      }

      // 프로젝트 경로를 안 섞는다. 스코프가 이미 프로젝트 단위라 경로를
      // 또 넣으면 지문에 같은 정보가 두 번 들어갈 뿐이다.
      const externalId = `tbr:${id}`
      if (seen.has(externalId)) continue
      seen.add(externalId)

      reviews.push({
        externalId,
        text,
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: isoDate(item.createdAt),
        // storyId 를 두지 않는다. 스코프 필터 때문에 항상 productRef 와
        // 같은 값이라 아무것도 알려 주지 않는다.
      })
    }

    // 마커가 >0 인데 한 건도 못 읽었다 = 구조가 바뀐 것이다.
    //
    // ⚠️ `totalReviewCount - contents.length` 를 실패로 세면 안 된다.
    //    프리뷰가 4건 상한이라 정상일 때도 66 vs 4 로 어긋난다.
    if (c.totalReviewCount > 0 && c.contents.length === 0) parseFailures++
  }

  // ponytail: 창작자당 최대 4건만 받는다(프리뷰 상한). 전량이 필요하면
  //   후기 목록 XHR 을 붙여야 하는데 그건 robots 가 막은 `/api/` 다.
  //   막힌 길이라 상한을 아는 채로 둔다.
  //
  // filtered 는 "남의 프로젝트 후기라 버렸다" 는 뜻이다. parseFailures 와
  // 분리해야 건강도 분모에 안 들어간다 — 안 그러면 정상 동작하는 타깃이
  // broken 으로 꺼진다(types.ts ParseResult.filtered).
  return { reviews, parseFailures, filtered }
}

export const tumblbugAdapter: ReviewSourceAdapter = {
  key: 'tumblbug',
  displayName: '텀블벅 창작자 후기',

  // 남헌 2026-09-23 Q3(a): 이 소스의 타깃은 페이지 상한에 닿아도 닫지 않는다.
  //
  // ⚠️ **types.ts 의 incrementalOnly 주석이 "커뮤니티 url: 에는 켜지 마라"고 적어 둔
  //    바로 그 자리다.** 그 경고는 유효하고, 남헌이 그걸 알고 뒤집었다. 전제가 바뀐 게 아니다 —
  //    대가(같은 글을 매일 1요청씩 다시 읽는다)를 받아들인 것이다. 근거:
  //    커뮤니티 타깃 85개 중 80개가 "성과 없어서"가 아니라 "끝까지 읽어서" 닫혔고,
  //    되살리는 코드가 리포에 없어 그 질의는 영영 다시 안 돌았다
  //    (reports/2026-09-23/voc-expansion-investigation.md §3).
  //
  // 창작자의 "지난 프로젝트 후기" 목록은 창작자가 프로젝트를 더 하면 늘어난다 — 끝이 정해져 있지 않다.
  //
  // 비용: 1글 = 1요청이므로 실행당 타깃 수만큼이다(커서가 첫 페이지에 null 이 되어
  // 20페이지를 훑지 않는다). 새 글이 안 달리면 consecutive_empty 만 늘고 닫히지 않는다 —
  // 그 상한은 아직 없다. 늘어나면 재활성화 조건(empty<3)을 러너에 넣어야 한다.
  incrementalOnly: true,

  // ⚠️ **게시판 모드에 필요한 러너 변경(이 PR 은 X 소유 파일을 고치지 않았다)**
  //    okky.ts 의 같은 주석과 동일하다: `nextRequest` 가 null 을 내면 러너가
  //    `incrementalOnly` 와 무관하게 타깃을 exhausted 로 닫으므로, 게시판 모드는
  //    **큐를 비울 때 nextCursor=null 로** 끝낸다. 그 대가로 `lastId` 가 실행마다
  //    초기화된다(값만 기록하고 건너뛰기에는 아직 쓰지 않는다).
  nextRequest(target: TargetState): { url: string } | null {
    const category = parseBoardRef(target.productRef)
    if (category) {
      const c = decodeBoardCursor(target.cursor)
      // 쿼리를 문자열로 조립한다. `category` 는 CATEGORY_RE 를 통과한 값뿐이므로
      // robots 가 허용한 `?category=<slug>` 외의 모양이 나올 수 없다.
      if (!c) return { url: `${HOST}${DISCOVER_PATH}?category=${category}` }
      return { url: `${HOST}${c.queue[0]}` }
    }

    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1문서=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const category = parseBoardRef(ctx.productRef)
    if (category) {
      // nextRequest 와 **같은 커서로 같은 판단**을 한다(러너가 요청에 쓴 커서를
      // 그대로 넘긴다) — 그래서 "무엇을 받았는지"가 어긋날 수 없다.
      const c = decodeBoardCursor(ctx.cursor)
      if (!c) {
        const list = parseDiscoverList(body)
        return {
          reviews: [],
          nextCursor: list.queue.length > 0 ? encodeBoardCursor({ queue: list.queue, lastId: list.lastId }) : null,
          parseFailures: list.parseFailures,
          filtered: 0,
        }
      }
      const got = parseProjectReviews(body, c.queue[0].slice(1))
      const rest = c.queue.slice(1)
      return {
        reviews: got.reviews,
        nextCursor: rest.length > 0 ? encodeBoardCursor({ queue: rest, lastId: c.lastId }) : null,
        parseFailures: got.parseFailures,
        filtered: got.filtered,
      }
    }

    // 이 타깃이 가리키는 프로젝트. 정체성이 여기에 묶인다(헤더 참조).
    const scope = parseProductRef(ctx.productRef)
    if (!scope) {
      // nextRequest 가 같은 검사를 하므로 실행 경로에서는 안 온다. 그래도
      // 스코프를 모르는 채로 받지는 않는다 — 그러면 다시 타깃 간 중복이 된다.
      // 조용히 0건으로 지나가면 "후기 없음"과 구분이 안 되므로 실패로 센다(§7.1).
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered: 0 }
    }
    const got = parseProjectReviews(body, scope.slice(1))
    return { reviews: got.reviews, nextCursor: null, parseFailures: got.parseFailures, filtered: got.filtered }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { sliceJson, readState, readCreatorReviews, isoDate, parseDiscoverList, decodeBoardCursor, encodeBoardCursor, DISCOVER_PATH }
