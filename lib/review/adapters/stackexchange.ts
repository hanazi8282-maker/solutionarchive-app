// Stack Exchange 질문 어댑터 — 공식 API 2.3 `/questions`(filter=withbody), **키 없음**. v71ad §5(d).
//
// 실측(2026-10-17, 우리 UA, 무키):
//   api.stackexchange.com/robots.txt → **400 JSON**(`no_method` — robots 파일이 없다) → 확인 불가. 공식 API 호스트 → 아래 표식으로만 통과.
//   /2.3/tags/<…>/info?site=… → 200 · quota_max 300 · quota_remaining 298 → **무키 한도 = IP 당 하루 300요청**.
//   태그 활동량이 매우 낮다: superuser microsoft-teams 90일 2건 · zoom 1건 · webapps google-meet 2건 · softwarerecs note-taking 0건.
//   → 이 소스의 기대 수확은 하루 1건 미만이다(보고서에 정직하게 적었다). 켜는 판단은 그 수치를 보고 한다.
//
// 차단: 스로틀 위반은 HTTP **400**(error_id 502 throttle_violation)으로 온다 → blockStatuses [400] 로 첫 응답에서 멈춘다(우회·재시도 없음).
//   403/429 도 차단(quotaMarkers 없음). 응답의 `backoff`(초) 는 어댑터가 실행 전체를 멈출 길이 없다 — 그래서 소스 행의
//   min_interval_ms 를 20000(20초)으로 둔다(보통 backoff 는 그보다 짧다). 그래도 걸리면 400 → 위 규칙대로 멈춘다(차단으로 기록).
//
// 타깃: `board:<slug>` 만. slug → (site, tag) 는 아래 표(상수). 1실행 1요청: 최신 질문 50개 중 last(질문 id) 보다 큰 것만.
// 작성자: 저장하지 않는다(owner 객체를 읽지 않는다). 본문 @멘션은 @user. 본문 라이선스 CC BY-SA — 인용 정책은 소스 행 라벨이 정한다.
// ponytail: 질문 본문만. 답변은 /questions/{ids}/answers 1요청을 붙이면 되지만 질문 자체가 드물어 지금은 값어치가 없다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseBoardRef } from '../types.ts'
import { __internal as disquiet } from './disquiet.ts'
import { maskMentions } from './github.ts'

export const HOST = 'https://api.stackexchange.com'
/** API site 이름 → 사람이 여는 웹 호스트(상수). */
export const SITE_WEB: Record<string, string> = {
  superuser: 'https://superuser.com',
  webapps: 'https://webapps.stackexchange.com',
  softwarerecs: 'https://softwarerecs.stackexchange.com',
}
/** slug → 사이트·태그. 영역 ①~⑤ 사용자 질문이 오는 곳만(stackoverflow 는 개발자 질문이라 뺐다). 실측 근거는 보고서 (d). */
export const BOARDS: Record<string, { site: string; tag: string }> = {
  'su-teams': { site: 'superuser', tag: 'microsoft-teams' }, // ①
  'su-zoom': { site: 'superuser', tag: 'zoom' }, // ①
  'wa-google-meet': { site: 'webapps', tag: 'google-meet' }, // ①
  'sr-transcription': { site: 'softwarerecs', tag: 'transcription' }, // ①
  'sr-crm': { site: 'softwarerecs', tag: 'crm' }, // ②
  'wa-mailchimp': { site: 'webapps', tag: 'mailchimp' }, // ③
  'sr-note-taking': { site: 'softwarerecs', tag: 'note-taking' }, // ⑤
}
export const PAGE_SIZE = 50

const listUrl = (b: { site: string; tag: string }) =>
  `${HOST}/2.3/questions?order=desc&sort=creation&site=${encodeURIComponent(b.site)}&tagged=${encodeURIComponent(b.tag)}&pagesize=${PAGE_SIZE}&filter=withbody`

function lastOf(c: string | null): number {
  try {
    const v = c ? (JSON.parse(c) as { last?: unknown }).last : null
    return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}

function kstFromUnix(sec: unknown): string | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null
  return new Date(sec * 1000 + 9 * 3600_000).toISOString().slice(0, 10)
}

function parseList(body: string, b: { site: string; tag: string }, cursor: string | null): ParseResult {
  let j: Record<string, unknown> | null
  try {
    j = JSON.parse(body)
  } catch {
    j = null
  }
  const items = j?.items
  if (!j || !Array.isArray(items)) return { reviews: [], nextCursor: cursor, parseFailures: 1, pauseRun: true }
  const last = lastOf(cursor)
  let top = last
  const reviews: ParsedReview[] = []
  let parseFailures = 0
  for (const q of items as Array<Record<string, unknown>>) {
    const id = typeof q?.question_id === 'number' && Number.isSafeInteger(q.question_id) ? q.question_id : null
    if (id === null || typeof q.title !== 'string' || typeof q.body !== 'string') {
      parseFailures++
      continue
    }
    top = Math.max(top, id)
    if (id <= last) continue
    const text = maskMentions([disquiet.stripHtml(q.title), disquiet.stripHtml(q.body)].filter(Boolean).join('\n\n'))
    if (!text) continue
    reviews.push({
      externalId: `q:${b.site}:${id}`,
      text,
      rating: null,
      seller: null,
      authorMasked: null,
      writtenAt: kstFromUnix(q.creation_date),
      sourceUrl: `${SITE_WEB[b.site]}/q/${id}`,
    })
  }
  return { reviews, nextCursor: JSON.stringify({ last: top || null }), parseFailures, pauseRun: true }
}

export const stackexchangeAdapter: ReviewSourceAdapter = {
  key: 'stackexchange',
  displayName: 'Stack Exchange 질문 (API 2.3, 무키)',
  incrementalOnly: true,
  // api.stackexchange.com/robots.txt = 400 JSON no_method (2026-10-17 실측) → 확인 불가. 공식 API 호스트.
  proceedWhenRobotsUnverified: ['api.stackexchange.com'],
  // 스로틀 위반은 400 으로 온다 — 첫 응답에서 멈춘다. 그 밖의 400(잘못된 파라미터)도 같이 멈추는 것은 안전한 쪽이다.
  blockStatuses: [400],
  abortOnChallenge: true,
  isChallenge: (body: string) => !body.trimStart().startsWith('{'),

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    const b = slug ? BOARDS[slug] : undefined
    return b && SITE_WEB[b.site] ? { url: listUrl(b) } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const slug = parseBoardRef(ctx.productRef)
    const b = slug ? BOARDS[slug] : undefined
    if (!b) return { reviews: [], nextCursor: null, parseFailures: 1 }
    return parseList(body, b, ctx.cursor)
  },
}

export const __internal = { parseList, listUrl }
