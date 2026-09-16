// 브런치(brunch.co.kr) 글 본문 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 round-3 — brunch · clien · fmkorea (2026-09-17)"
//
// ⚠️ **댓글을 수집하지 않는다. 블록을 추가하지 마라.**
//    브런치 댓글은 `/api/` 뒤에 있고 robots 가 `Disallow: /api/` 로 막는다
//    (`*` 그룹 포함, 2026-09-17 실측). 즉 "댓글 0건"은 여기서 실패가 아니라
//    **설계된 결과**다. damoang 파서를 복붙하면 "댓글 마커 없음 = 영역 소실"
//    블록이 따라와서 전 건이 parseFailures 1 이 된다. 붙이고 싶으면
//    robots.txt 부터 다시 읽어라.
//
// ⚠️ **공용 `parseUrlRef()` 를 쓰지 않는다.** 그 함수는 `@` 를 무조건 거부하고
//    (url-ref.ts 의 FORBIDDEN — userinfo 차단), 브런치 글 경로는 `/@핸들/번호`
//    라 항상 null 이 된다. 공용 파일을 고치면 damoang·82cook·theqoo 까지 같이
//    뚫리므로, 여기서 **더 좁은 화이트리스트**로 자체 검증한다.
//
// ⚠️ **1글=1요청이다.** robots 의 `*` 그룹에 `Crawl-delay: 5` 가 있다(실측).
//    robots.ts 는 Crawl-delay 를 파싱하지 않으므로, 그 지연을 지키는 유일한
//    장치가 DB 의 `review_sources.min_interval_ms = 5000` 이다. 낮추지 마라.

import type { ParseContext, ParseResult, ReviewSourceAdapter, TargetState } from '../types.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://brunch.co.kr'

/**
 * 허용하는 경로는 글 하나뿐이다: `/@<핸들>/<번호>`.
 *
 * 핸들은 영숫자·`_`·`-`, 번호는 1~10자리. 앵커(`^`/`$`)로 경로 **전체**를
 * 묶으므로 `..`·`//`·`\`·공백·쿼리·`@@`·`/write` 는 전부 자동으로 탈락한다.
 * 화이트리스트라 새 문자를 허용하려면 이 정규식을 고쳐야만 한다 —
 * 블랙리스트처럼 조용히 새지 않는다.
 */
const REF_RE = /^\/@[A-Za-z0-9_-]+\/\d{1,10}$/

/** `url:/@brunch/431` → `/@brunch/431`. 규칙 위반이면 null. */
export function parseProductRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!/^url:/i.test(raw)) return null
  const p = raw.slice(4)
  return REF_RE.test(p) ? p : null
}

/** JSON-LD 에서 뽑아 쓰는 필드. 없으면 빈 문자열로 내린다. */
interface BrunchPost {
  headline: string
  articleBody: string
  datePublished: string
}

/**
 * 글 본문·작성일은 JSON-LD(schema.org BlogPosting)에서 읽는다.
 *
 * 페이지에 ld+json 블록이 2개 있고(Organization + BlogPosting) 순서가 바뀔 수
 * 있으므로 전부 훑는다. 문자열 슬라이싱이 아니라 JSON.parse 로 읽는다 —
 * 본문에 `}` 가 들어 있어도 안 깨진다.
 */
function readJsonLd(body: string): BrunchPost | null {
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
      if (n['@type'] !== 'BlogPosting') continue
      return {
        headline: typeof n.headline === 'string' ? n.headline : '',
        articleBody: typeof n.articleBody === 'string' ? n.articleBody : '',
        datePublished: typeof n.datePublished === 'string' ? n.datePublished : '',
      }
    }
  }
}

export const brunchAdapter: ReviewSourceAdapter = {
  key: 'brunch',
  displayName: '브런치 글 본문',

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)

    const ld = readJsonLd(body)
    if (!ld || (!ld.headline && !ld.articleBody)) {
      // BlogPosting 이 통째로 사라졌다(또는 필드가 비었다). 화면 텍스트로
      // 대충 때워서 "정상 수집"을 만들지 않는다(CLAUDE.md §7.1 사례 1).
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    // ponytail: articleBody 는 5,000자에서 잘린다(실측 — 긴 글이 정확히
    //   5001자 + 말미 `…`). 4,000자급 글은 온전히 온다. 전문이 필요해지면
    //   하이드레이션 블롭(`wrap_body` 아래 주입되는 초기상태)을 파싱해야
    //   하는데 훨씬 잘 깨진다. 그때 픽스처를 새로 떠라.
    return {
      reviews: [
        {
          externalId: p,
          text: [ld.headline, ld.articleBody].filter(Boolean).join('\n\n'),
          rating: null,
          seller: null,
          authorMasked: null,
          // datePublished 는 **KST 오프셋이 붙은 ISO** 다
          // (`2026-09-07T01:00:24+09:00` — 실측). epoch ms 가 아니므로
          // 앞 10자가 곧 KST 날짜다. 다른 형식이 오면 추정하지 않고 null.
          writtenAt: /^\d{4}-\d{2}-\d{2}/.test(ld.datePublished) ? ld.datePublished.slice(0, 10) : null,
          storyId: null,
        },
      ],
      // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
      nextCursor: null,
      parseFailures: 0,
    }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { readJsonLd, REF_RE }
