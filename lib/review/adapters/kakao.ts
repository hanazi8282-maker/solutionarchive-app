// 카카오(다음) 검색 어댑터 — 블로그·카페 두 소스. 공식 REST API(남헌 승인 2026-10-06, 한국어 데이터 확보용).
//
//   GET https://dapi.kakao.com/v2/search/blog · /v2/search/cafe
//   헤더 Authorization: KakaoAK <KAKAO_REST_API_KEY>
//   파라미터 query · sort(accuracy|recency) · page(1~50) · size(1~50)
//   응답 documents[]{title, contents, url, blogname|cafename, thumbnail, datetime(ISO 8601)}
//        meta{total_count, pageable_count, is_end}
//   출처: developers.kakao.com/docs/ko/daum-search/dev-guide (2026-10-06 WebFetch 확인).
//   에러: 같은 사이트 rest-api/error-code — -401 = HTTP 401(앱 키 무효), -3·-5·-6 = HTTP 403(권한·정책),
//         **-10 = HTTP 400 "허용된 요청 회수를 초과한 경우"**(쿼터 초과가 400 으로 온다), -11 = HTTP 400(유료 한도).
//         ⚠️ 에러 응답 본문의 JSON 필드 이름은 문서에서 확인하지 못했다 — 그래서 본문을 읽어 가르지 않는다(아래 blockStatuses).
//
// 타깃: product_ref = `q:<검색어>`(예: `q:무선이어폰 후기`) — 타깃 1개 = 검색어 1개. HN `q:` 와 같은 모양이고
//   검색 결과는 계속 새 글이 붙으므로 incrementalOnly(닫지 않음, 연속 0건 안전장치가 닫는다).
// 커서: 다음에 읽을 page 번호(문자열). null = 1페이지. is_end 또는 page 50(API 상한)에서 null.
//   `sort=recency` 필수 — 러너의 증분 종료(연속 STALE)가 시간 역순을 전제한다. 기본값 accuracy 면 깨진다.
//
// ⚠️ contents 는 **검색 결과 요약 발췌이지 글 전문이 아니다**(문서: 블로그 "글 요약", 카페 "글 일부분").
//    분석은 이 발췌 위에서 돈다 — 전문을 가져오려고 url 을 따라가지 않는다(그건 각 블로그·카페 호스트 수집이라 별도 법적 점검 대상).
// ⚠️ blogname·cafename·thumbnail 은 저장하지 않는다(작성자 미저장 규약 — YouTube·PH 와 같다).
// ⚠️ 키는 헤더에만 싣는다. URL·커서·로그·에러 메시지에 키 값을 쓰지 않는다(러너는 url 만 로그에 남긴다).

import type { ParseContext, ParseResult, ParsedReview, ReviewRequest, ReviewSourceAdapter, TargetState } from '../types.ts'
import { htmlStrip } from './hackernews.ts'

export const KAKAO_API_HOST = 'https://dapi.kakao.com'
export const KAKAO_KEY_ENV = 'KAKAO_REST_API_KEY'
/** API 상한: page 1~50, size 1~50. */
export const MAX_PAGE = 50
export const PAGE_SIZE = 50

/** `q:<검색어>` → 검색어. 비었거나 줄바꿈이 섞이면 null. 형식 검증(길이)은 target-ref 빌더가 한다. */
export function parseProductRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!/^q:/i.test(raw)) return null
  const q = raw.slice(2).trim()
  return q && !/[\r\n]/.test(q) ? q : null
}

/** 커서 → 요청할 page(1부터). 못 읽으면 1. */
function pageOf(cursor: string | null): number {
  const n = Number(cursor)
  return Number.isInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** ISO 8601(오프셋 포함) → KST 날짜 YYYY-MM-DD. 못 읽으면 null. */
export function kstDate(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t + 9 * 3600_000).toISOString().slice(0, 10) : null
}

/**
 * documents 1건 → ParsedReview. url 또는 본문(title+contents)이 없으면 null(= 파싱 실패 1건).
 * url 은 http(s) 만 받는다. sourceUrl 은 https 만 채운다(analysis_inputs CHECK 가 https 만 받는다) —
 * http 글(옛 티스토리 등)은 글은 살리고 출처 링크만 비운다.
 */
function toReview(doc: Record<string, unknown>): ParsedReview | null {
  const url = str(doc['url'])?.trim() ?? null
  if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return null
  const title = htmlStrip(str(doc['title']) ?? '')
  const contents = htmlStrip(str(doc['contents']) ?? '')
  const text = [title, contents].filter(Boolean).join('\n')
  if (!text) return null
  return {
    externalId: url,
    text,
    rating: null,
    seller: null,
    authorMasked: null,
    writtenAt: kstDate(str(doc['datetime'])),
    sourceUrl: /^https:\/\//i.test(url) ? url : null,
    // 남헌 지시(2026-10-06): 한국어 검색 서비스라 'ko' 로 둔다. 본문 판별은 하지 않는다.
    lang: 'ko',
  }
}

function makeAdapter(kind: 'blog' | 'cafe', displayName: string): ReviewSourceAdapter {
  return {
    key: `kakao_${kind}`,
    displayName,
    incrementalOnly: true,
    requiredEnv: [KAKAO_KEY_ENV],
    // 401(-401 키 무효)·400(-10 쿼터 초과·-11 한도 초과·파라미터 오류)도 차단으로 보고 실행을 끊는다.
    // 403·429 는 러너가 원래 차단으로 본다(quotaMarkers 를 두지 않으므로 전부 '차단', 안전한 쪽).
    // 400 을 쿼터/파라미터로 가르지 않는 이유: 에러 본문 형식을 문서로 확인하지 못했다 — 어느 쪽이든 더 두드리지 않는다.
    blockStatuses: [400, 401],
    // dapi.kakao.com/robots.txt 는 실측하지 않았다(서브에이전트 외부 호출 금지). 공식 키 인증 API 라
    // 키·쿼터·약관이 이 호스트의 규율이다(review_sources.robots_status='not_applicable'). 404/403/HTML 만 통과,
    // 5xx·타임아웃은 이 표식으로도 통과하지 않는다. robots 가 규칙을 내면 그 규칙이 우선한다(types.ts).
    proceedWhenRobotsUnverified: ['dapi.kakao.com'],

    nextRequest(target: TargetState): ReviewRequest | null {
      // §7.1: 키 없이 보내면 401 이 "차단"으로 남는다 — 원인은 우리 설정이다. 요청을 만들지 않고 던진다(실행 실패).
      // 메시지에는 env 이름만 쓴다. 값은 쓰지 않는다.
      const key = process.env[KAKAO_KEY_ENV]
      if (!key) throw new Error(`${KAKAO_KEY_ENV} 미설정 — kakao_${kind} 실행을 시작하지 않는다`)
      const q = parseProductRef(target.productRef)
      if (!q) return null
      const page = pageOf(target.cursor)
      return {
        url:
          `${KAKAO_API_HOST}/v2/search/${kind}` +
          `?query=${encodeURIComponent(q)}&sort=recency&page=${page}&size=${PAGE_SIZE}`,
        init: { method: 'GET', headers: { Authorization: `KakaoAK ${key}`, Accept: 'application/json' } },
      }
    },

    parse(body: string, ctx: ParseContext): ParseResult {
      let doc: Record<string, unknown> | null
      try {
        doc = obj(JSON.parse(body))
      } catch {
        return { reviews: [], nextCursor: null, parseFailures: 1 }
      }
      const docs = doc?.['documents']
      const meta = obj(doc?.['meta'])
      // documents 배열이나 meta 가 없으면 구조가 바뀐 것이다 — 0건 정상으로 접지 않는다(§7.1).
      if (!Array.isArray(docs) || !meta) return { reviews: [], nextCursor: null, parseFailures: 1 }

      const reviews: ParsedReview[] = []
      let parseFailures = 0
      for (const d of docs) {
        const o = obj(d)
        const r = o ? toReview(o) : null
        if (r) reviews.push(r)
        else parseFailures++
      }

      // 빈 documents 는 검색 결과 0건 — 정상 종료(구조는 멀쩡하다).
      // is_end 가 boolean 이 아니면 끝으로 본다(같은 페이지를 반복하지 않게) — 대신 documents 가 있으면 1페이지만 읽고 멈춘다.
      const page = pageOf(ctx.cursor)
      const end = docs.length === 0 || meta['is_end'] !== false || page >= MAX_PAGE
      return { reviews, nextCursor: end ? null : String(page + 1), parseFailures }
    },
  }
}

export const kakaoBlogAdapter = makeAdapter('blog', '카카오(다음) 블로그 검색')
export const kakaoCafeAdapter = makeAdapter('cafe', '카카오(다음) 카페 검색')

/** 셀프테스트 전용. */
export const __internal = { toReview, pageOf }
