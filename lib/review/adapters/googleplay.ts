// Google Play 리뷰 어댑터 — 나라(gl)·언어(hl)별, 별점·언어·원문 주소까지.
//
// ⚠️ 약관 금지를 알고 소유자가 연 소스다(남헌 v19 B, 2026-10-05). Google Play 이용약관 3.3조가 "자동화된 수단으로
//    접근 금지 + robots.txt 준수"를 원문으로 적는다(docs/strategy-principles.md SP-020, A등급). 등록은 마이그
//    20261005000005(tos_status='forbids_automation' · override='owner_2026-10-05' · quote_policy='short_only') —
//    **파일만 있고 오케스트레이터가 실측 1회 뒤 적용한다.** 행이 없으면 러너 loadSource 가 null → 한 건도 안 돈다.
//    robots 는 소유자 예외 대상이 아니다(robots_status 를 'disallowed' 로 기록하지 않았다) — 러너가 매 실행 판정한다.
//    고객 화면 인용은 short_only(한 문장·140자·출처 비표시, lib/analysis/evidence-quotes.ts).
//
// 경로: `POST https://play.google.com/_/PlayStoreUi/data/batchexecute?hl=<hl>&gl=<gl>` (rpcid UsvDTd, 최신순).
//   상세 페이지(`/store/apps/details`)의 AF_initDataCallback 블롭에도 리뷰가 있지만(2026-09-02 실측,
//   docs/review-source-findings.md) 첫 몇 건뿐이고 다음 페이지가 없다. batchexecute 는 토큰으로 이어진다.
//   ⚠️ 이 경로의 robots 판정은 **실측하지 않았다**(외부 호출 금지 작업). 러너가 매 실행 robots 를 읽고
//      금지·확인 불가면 요청하지 않는다(fail-closed) — 어댑터는 proceedWhenRobotsUnverified 를 선언하지 않는다.
//   ⚠️ 응답 구조는 구글 내부 직렬화라 문서가 없다. 필드 위치는 공개 라이브러리 google-play-scraper 의
//      ElementSpecs.Review 를 따랐고, 픽스처(fixtures/googleplay/)도 **그 구조로 만든 합성본**이다 — 실제 응답을
//      받아 저장한 게 아니다. 켜기 전에 1회 실측해 픽스처를 실응답으로 바꿔야 한다(§7.1 "검사 방법이 주장과 같은지").
//
// 우회 없음: UA 는 러너가 우리 것으로 고정한다(scripts/review-collect.mjs). 쿠키·프록시·헤더 위장 없음.
// 403·429 는 러너가 차단으로 보고 실행을 끊는다(quotaMarkers 미선언 = 전부 차단). 빈 응답·구조 불일치는
// parseFailures 1 + nextCursor null 로 그 타깃을 끝낸다(0건 정상으로 접지 않는다).

import type { ParseContext, ParseResult, ParsedReview, ReviewRequest, ReviewSourceAdapter, TargetState } from '../types.ts'

export const BATCH_URL = 'https://play.google.com/_/PlayStoreUi/data/batchexecute'
export const RPC_ID = 'UsvDTd'
/** 한 요청 리뷰 수. 러너 페이지 상한 20 × 40 = 타깃당 실행 1회 최대 800건. */
export const PAGE_SIZE = 40
/** 정렬 2 = 최신순. 러너 증분 종료(연속 STALE)가 시간 역순을 전제한다. */
const SORT_NEWEST = 2

/**
 * `product_ref` 형식: `<gl>:<hl>:<패키지명>` (예: `kr:ko:com.Slack`, `us:en:com.notion.id`) 또는 `<패키지명>`(= kr:ko).
 * 국가·언어를 나누는 이유: Play 는 hl 로 **그 언어로 쓴 리뷰만** 준다. 같은 앱의 한국어·영어 목소리는 다른 타깃이다.
 * 패키지명은 URL·요청 본문에 그대로 들어가므로 Android 패키지 문법만 받는다(점·영숫자·_).
 */
export function parseProductRef(productRef: string): { gl: string; hl: string; pkg: string } | null {
  const parts = (productRef ?? '').trim().split(':').map((s) => s.trim())
  const [gl, hl, pkg] = parts.length === 1 ? ['kr', 'ko', parts[0]] : parts.length === 3 ? parts : []
  if (!gl || !hl || !pkg) return null
  if (!/^[a-z]{2}$/i.test(gl) || !/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(hl)) return null
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(pkg) || pkg.length > 150) return null
  return { gl: gl.toLowerCase(), hl: hl.toLowerCase(), pkg }
}

/** 커서 = Play 가 준 다음 페이지 토큰 그대로. null 이면 첫 페이지. 토큰에 따옴표·역슬래시가 있으면 쓰지 않는다(본문 주입 경계). */
const safeToken = (c: string | null) => (c && /^[A-Za-z0-9_\-=+/.]{1,2000}$/.test(c) ? c : null)

/** batchexecute f.req 본문. 내부 배열이 **문자열로 한 번 더 직렬화**되는 형태다(구글 RPC 규약). */
export function buildBody(pkg: string, token: string | null): string {
  const inner = JSON.stringify([null, null, [2, SORT_NEWEST, [PAGE_SIZE, null, token], null, []], [pkg, 7]])
  return `f.req=${encodeURIComponent(JSON.stringify([[[RPC_ID, inner, null, 'generic']]]))}`
}

export const reviewUrl = (pkg: string, hl: string, gl: string, id: string) =>
  `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=${hl}&gl=${gl}&reviewId=${encodeURIComponent(id)}`

const at = (v: unknown, ...path: number[]): unknown => {
  let cur = v
  for (const i of path) {
    if (!Array.isArray(cur)) return undefined
    cur = cur[i < 0 ? cur.length + i : i]
  }
  return cur
}

/** 유닉스 초 → KST 날짜(YYYY-MM-DD). 다른 어댑터와 같은 날짜 단위다. */
const kstDate = (sec: unknown) =>
  typeof sec === 'number' && Number.isFinite(sec) && sec > 0
    ? new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10)
    : null

/** 리뷰 1건. 필수는 리뷰 id 와 본문 — 하나라도 없으면 실패로 센다(§7.1 사례 1). */
function toReview(e: unknown, ref: { gl: string; hl: string; pkg: string }): ParsedReview | null {
  const id = at(e, 0)
  const text = at(e, 4)
  if (typeof id !== 'string' || !id || typeof text !== 'string' || !text.trim()) return null
  const score = at(e, 2)
  const version = at(e, 10)
  return {
    externalId: id,
    text: [typeof version === 'string' && version ? `(v${version})` : null, text.trim()].filter(Boolean).join(' '),
    rating: typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5 ? score : null,
    seller: null,
    // 작성자는 싣지 않는다 — Play 는 실명 표시가 흔하다(개인정보 비중, docs/review-collection-design.md §1.2).
    authorMasked: null,
    writtenAt: kstDate(at(e, 5, 0)),
    sourceUrl: reviewUrl(ref.pkg, ref.hl, ref.gl, id),
    lang: ref.hl,
  }
}

const FAIL: ParseResult = { reviews: [], nextCursor: null, parseFailures: 1 }

export const googleplayAdapter: ReviewSourceAdapter = {
  key: 'googleplay',
  displayName: 'Google Play 리뷰',

  /**
   * false — 리뷰 id 는 UUID 형식(옛 `gp:AOqp…`)으로 Play 전역 유일을 의도한 값이다. 같은 리뷰가 국가 타깃 둘
   * (kr:ko · us:ko)에 걸릴 수 있어 productRef 를 키에 넣으면 두 번 적재된다. ⚠️ 전역 유일은 형식으로 본 판단이고
   * 실측하지 않았다 — 켜기 전 실측 항목에 넣는다.
   */
  productScopedExternalId: false,

  /** 약관이 자동 접근을 금지하는 소스 — 2xx 빈 응답·캡차·`/sorry/` 도 차단으로 보고 즉시 멈춘다(우회 없음, 러너 isStrictBlock). */
  abortOnChallenge: true,

  nextRequest(target: TargetState): ReviewRequest | null {
    const ref = parseProductRef(target.productRef)
    if (!ref) return null
    // 커서가 있는데 쓸 수 없는 모양이면 처음부터 다시 읽지 않고 멈춘다(같은 페이지 반복 방지).
    if (target.cursor && !safeToken(target.cursor)) return null
    return {
      url: `${BATCH_URL}?hl=${ref.hl}&gl=${ref.gl}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: buildBody(ref.pkg, safeToken(target.cursor)),
      },
    }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const ref = parseProductRef(ctx.productRef)
    if (!ref) return FAIL

    // 응답 = `)]}'` 접두 + JSON 봉투. 접두가 없으면 RPC 응답이 아니다(로그인 벽·HTML 오류 화면 등).
    const m = /^\)\]\}'\s*\n([\s\S]+)$/.exec(body ?? '')
    if (!m) return FAIL
    let envelope: unknown
    try {
      envelope = JSON.parse(m[1])
    } catch {
      return FAIL
    }
    const frame = Array.isArray(envelope)
      ? envelope.find((f) => Array.isArray(f) && f[0] === 'wrb.fr' && f[1] === RPC_ID)
      : undefined
    // 봉투는 왔는데 우리 RPC 프레임·페이로드가 없다 = 요청이 거부됐다(잘못된 패키지·구조 변경). 0건이 아니다.
    if (!frame || typeof frame[2] !== 'string') return FAIL
    let inner: unknown
    try {
      inner = JSON.parse(frame[2])
    } catch {
      return FAIL
    }
    if (!Array.isArray(inner)) return FAIL

    const list = inner[0]
    // 리뷰가 하나도 없는 앱·마지막 다음 페이지: 페이로드는 정상인데 목록이 null/[] 다. 이건 0건 정상.
    if (list === null || (Array.isArray(list) && list.length === 0)) {
      return { reviews: [], nextCursor: null, parseFailures: 0 }
    }
    if (!Array.isArray(list)) return FAIL

    const reviews: ParsedReview[] = []
    let parseFailures = 0
    for (const e of list) {
      const r = toReview(e, ref)
      if (r) reviews.push(r)
      else parseFailures++
    }

    // 다음 토큰은 페이로드 끝에서 두 번째 칸의 마지막 값(라이브러리 규약). 없거나 이상하면 끝.
    const token = at(inner, -2, -1)
    const nextCursor = typeof token === 'string' ? safeToken(token) : null
    // 같은 토큰을 다시 받으면 제자리 반복이다(다나와 커서 버그 §7.2) — 끝으로 본다.
    return { reviews, nextCursor: nextCursor === ctx.cursor ? null : nextCursor, parseFailures }
  },
}
