// wordpress.org 플러그인 리뷰 어댑터 — 플러그인 지원 포럼의 리뷰 RSS(bbPress).
//
// 근거: reports/2026-10-08/five-b-terms-check.md (A) · reports/2026-10-08/five-arm-sources-notes.md
//   robots(2026-10-08 실측): wordpress.org/robots.txt `*` 그룹 Disallow 는 /wp-admin/ · /search · /?s= · /plugins/search/ 뿐 →
//     `/support/plugin/<slug>/reviews/feed/` 허용(robotsVerdict). 러너가 매 실행 다시 판정한다(proceedWhenRobotsUnverified 없음 = 못 읽으면 0요청).
//   ⛔ `api.wordpress.org` 는 robots `User-agent: * / Disallow: /` 다 — 이 어댑터는 그 호스트로 요청을 만들지 않는다(HOST 상수 고정).
//   약관: wordpress.org/about/terms/ 404 — 약관 문서가 없다. 개인정보처리방침·포럼 가이드라인에 자동 접근·복제·상업 이용 문장 없음
//     → tos_status='silent'. 리뷰 글 저작권 귀속 조항이 없다(= 작성자 권리) → quote_policy='short_only'.
//
// 경로: `GET https://wordpress.org/support/plugin/<slug>/reviews/feed/` — 최신 리뷰 30건(2026-10-08 실측 1회, <item> 30개).
//   페이지가 없다(단일 피드). 그래서 증분형(incrementalOnly) — 매 실행 피드 1장을 읽고, 이미 본 리뷰는 지문이 거른다.
//   HTML 목록(`/reviews/page/N/`)으로 과거를 훑는 보조 경로는 **만들지 않았다** — 실측 픽스처가 없다(§7.1). 필요하면 별도로.
//
// item 구조(2026-10-08 실측 site-reviews 피드):
//   <guid>https://wordpress.org/support/topic/<topic-slug>/</guid>   ← 리뷰 1건 = 포럼 토픽 1개. externalId·원문 주소.
//   <title>제목 (5 stars)</title> · <pubDate>RFC 822</pubDate> · <dc:creator>사용자명</dc:creator>(저장 안 함)
//   <description><![CDATA[ <p>Replies: 1</p> <p>Rating: 5 stars</p> <p>본문…</p> ]]></description>
//
// 개인정보: dc:creator(wordpress.org 사용자명, 실명인 경우가 있다)는 싣지 않는다 — googleplay·kakao 와 같은 정책(authorMasked=null).
// 우회 없음: UA 는 러너 고정. 403·429·빈 응답·캡차 = 즉시 중단(abortOnChallenge → runner isStrictBlock).

import type { ParseContext, ParseResult, ParsedReview, ReviewRequest, ReviewSourceAdapter, TargetState } from '../types.ts'

export const HOST = 'https://wordpress.org'
/** 플러그인 slug — wordpress.org 디렉터리 slug 문법(소문자·숫자·하이픈). URL 경로에 그대로 들어가므로 이것만 받는다. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/

/** product_ref = `plugin:<slug>`. 아니면 null. */
export function parseProductRef(productRef: string): string | null {
  const m = /^plugin:(.+)$/.exec((productRef ?? '').trim())
  return m && SLUG_RE.test(m[1]) ? m[1] : null
}

export const feedUrl = (slug: string) => `${HOST}/support/plugin/${slug}/reviews/feed/`

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…' }
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml)
  return m ? m[1] : null
}
const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')

/** description HTML → 본문. "Replies: N"·"Rating: N stars" 머리 문단을 빼고 태그를 지운다. */
function bodyText(html: string): string {
  const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
  const source = paras.length ? paras : [decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()]
  return source.filter((p) => p && !/^Replies:\s*\d+$/i.test(p) && !/^Rating:\s*\d\s*stars?$/i.test(p)).join('\n')
}

/** RFC 822 → KST 날짜(YYYY-MM-DD). googleplay·kakao 와 같은 날짜 단위. 못 읽으면 null. */
export function kstDate(rfc822: string | null): string | null {
  const t = rfc822 ? Date.parse(rfc822.trim()) : NaN
  return Number.isFinite(t) ? new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10) : null
}

/** 리뷰 1건. 필수 = 토픽 주소(guid)와 본문. 하나라도 없으면 null(파싱 실패로 센다 — §7.1 사례 1). */
function toReview(item: string): ParsedReview | null {
  const guid = decodeEntities(cdata(tag(item, 'guid') ?? '')).trim()
  if (!/^https:\/\/wordpress\.org\/support\/topic\/[a-z0-9%_-]+\/?$/i.test(guid)) return null
  const desc = cdata(tag(item, 'description') ?? '')
  const body = bodyText(desc)
  const rawTitle = decodeEntities(cdata(tag(item, 'title') ?? '')).replace(/\s+/g, ' ').trim()
  const star = /\((\d) stars?\)\s*$/i.exec(rawTitle) ?? /Rating:\s*(\d)\s*stars?/i.exec(desc)
  const title = rawTitle.replace(/\s*\(\d stars?\)\s*$/i, '').trim()
  if (!body) return null
  const rating = star ? Number(star[1]) : null
  return {
    externalId: guid,
    text: [title ? `[${title}]` : null, body].filter(Boolean).join(' '),
    rating: rating !== null && rating >= 1 && rating <= 5 ? rating : null,
    seller: null,
    authorMasked: null,
    writtenAt: kstDate(tag(item, 'pubDate')),
    sourceUrl: guid,
    // 피드 <language> 는 포럼 설정이지 리뷰 언어가 아니다 — 추정하지 않는다(types.ts ParsedReview.lang).
    lang: null,
  }
}

const FAIL: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }

export const wordpressAdapter: ReviewSourceAdapter = {
  key: 'wordpress_org',
  displayName: 'WordPress.org 플러그인 리뷰',

  /** false — externalId 가 토픽 URL 그 자체(wordpress.org 전역 유일). */
  productScopedExternalId: false,
  /** 403·429·2xx 빈 응답·캡차 = 차단으로 즉시 중단(우회 없음). */
  abortOnChallenge: true,
  /**
   * 캡차 판정 = **RSS 가 아닌 2xx 본문**(사람 확인·로그인·오류 HTML 이 피드 자리에 왔다). 러너 기본 표지("captcha" 부분일치)를 쓰면
   * 리뷰 플러그인 후기에 흔한 "captcha" 낱말 하나로 정상 피드가 차단 처리된다(types.ts isChallenge).
   */
  isChallenge: (body: string) => !/<rss[\s>]/i.test(body ?? ''),
  /** 단일 피드라 끝이 없다 — 매 실행 최신 30건만. 닫는 것은 러너의 연속 0건 안전장치(MAX_CONSECUTIVE_EMPTY). */
  incrementalOnly: true,
  /** 피드 1장 = 타깃당 실행 1요청. */
  maxPagesPerRun: 1,

  nextRequest(target: TargetState): ReviewRequest | null {
    const slug = parseProductRef(target.productRef)
    return slug ? { url: feedUrl(slug) } : null
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    if (!parseProductRef(ctx.productRef)) return FAIL
    const xml = body ?? ''
    // RSS 가 아니면(HTML 오류·로그인 화면) 0건이 아니라 못 읽음이다.
    if (!/<rss[\s>]/i.test(xml) || !/<channel>/i.test(xml)) return FAIL
    const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1])
    // item 은 0개인데 항목 흔적(<item·<entry·<guid)이 있으면 구조가 바뀐 것 — 0건 정상이 아니라 못 읽음(§7.1 사례 1).
    if (items.length === 0 && /<(item|entry|guid)\b/i.test(xml)) return FAIL
    const reviews: ParsedReview[] = []
    let parseFailures = 0
    for (const it of items) {
      const r = toReview(it)
      if (r) reviews.push(r)
      else parseFailures++
    }
    // 리뷰가 없는 플러그인: 채널은 정상인데 item 0개 = 0건 정상.
    return { reviews, nextCursor: null, parseFailures }
  },
}
