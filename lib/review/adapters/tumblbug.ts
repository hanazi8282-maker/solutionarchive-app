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

export const tumblbugAdapter: ReviewSourceAdapter = {
  key: 'tumblbug',
  displayName: '텀블벅 창작자 후기',

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1문서=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const reviews: ParsedReview[] = []
    let parseFailures = 0
    let filtered = 0

    // 이 타깃이 가리키는 프로젝트. 정체성이 여기에 묶인다(헤더 참조).
    const scope = parseProductRef(ctx.productRef)
    if (!scope) {
      // nextRequest 가 같은 검사를 하므로 실행 경로에서는 안 온다. 그래도
      // 스코프를 모르는 채로 받지는 않는다 — 그러면 다시 타깃 간 중복이 된다.
      // 조용히 0건으로 지나가면 "후기 없음"과 구분이 안 되므로 실패로 센다(§7.1).
      return { reviews, nextCursor: null, parseFailures: 1, filtered }
    }
    const scopeSlug = scope.slice(1)

    const state = readState(body)
    if (!state) {
      // hydration JSON 이 통째로 없다. SPA 껍데기를 받은 것이다 —
      // HTTP 200 이어도 내용이 0 인 경우다(CLAUDE.md §7.1).
      return { reviews, nextCursor: null, parseFailures: 1, filtered }
    }

    const creators = readCreatorReviews(state)
    if (creators === null || creators.length === 0) {
      // creators 자체가 없다 = 구조 변경.
      return { reviews, nextCursor: null, parseFailures: 1, filtered }
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
    return { reviews, nextCursor: null, parseFailures, filtered }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { sliceJson, readState, readCreatorReviews, isoDate }
