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
//    가 없는 SPA 껍데기(36KB)였다. 그래서 productRef 는 **프로젝트 경로**로
//    두되, 식별은 창작자 축으로 한다:
//      externalId = `tbr:<projectWarrantyReviewId>`  ← 프로젝트와 무관한 전역 고유값
//      storyId    = `/<review.projectPermalink>`     ← 그 후기가 실제로 달린 프로젝트
//    같은 창작자의 어느 프로젝트 페이지로 들어와도 같은 후기는 같은 externalId
//    가 되어 지문 단계에서 중복으로 걸러진다.
//
// ⚠️ **한 번에 최대 4건이다.** 마커(`totalReviewCount`)는 66 인데 `contents` 는
//    4건만 온다 — 프리뷰 상한이다. 그래서 마커와 항목 수의 차이를 실패로 세면
//    안 된다(그랬다면 매번 실패 62건이 찍힌다). 마커가 >0 인데 0건일 때만 실패다.
//
// ⚠️ **신규성이 낮다.** 같은 창작자의 프로젝트 페이지를 여러 개 타깃으로 잡으면
//    같은 4건이 반복 수집된다. 지문이 중복을 걸러 주지만 요청은 그대로 나간다.
//    타깃을 고를 때 창작자가 겹치지 않게 사람이 신경 써라.

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

    const state = readState(body)
    if (!state) {
      // hydration JSON 이 통째로 없다. SPA 껍데기를 받은 것이다 —
      // HTTP 200 이어도 내용이 0 인 경우다(CLAUDE.md §7.1).
      return { reviews, nextCursor: null, parseFailures: 1 }
    }

    const creators = readCreatorReviews(state)
    if (creators === null || creators.length === 0) {
      // creators 자체가 없다 = 구조 변경.
      return { reviews, nextCursor: null, parseFailures: 1 }
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
        if (!text) {
          // 컨테이너는 멀쩡한데 알맹이가 없다(사진만 올린 후기).
          // 파서가 깨진 게 아니므로 실패로 세지 않는다.
          continue
        }

        // ⚠️ externalId 에 프로젝트 경로를 넣지 않는다. 같은 후기가 같은
        //    창작자의 다른 프로젝트 페이지에서도 나오기 때문이다 — 넣으면
        //    같은 글이 매번 새 리뷰로 적재된다.
        const externalId = `tbr:${id}`
        if (seen.has(externalId)) continue
        seen.add(externalId)

        const permalink = typeof item.projectPermalink === 'string' ? item.projectPermalink : null

        reviews.push({
          externalId,
          text,
          rating: null,
          seller: null,
          authorMasked: null,
          writtenAt: isoDate(item.createdAt),
          // 지금 받은 페이지가 아니라 **그 후기가 달린 원래 프로젝트**다.
          // 둘은 다를 수 있다(실측: /eastereggs 페이지에 clear 프로젝트 후기).
          storyId: permalink ? `/${permalink}` : null,
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
    return { reviews, nextCursor: null, parseFailures }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { sliceJson, readState, readCreatorReviews, isoDate }
