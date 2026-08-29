// 다나와 판매처 리뷰 어댑터.
//
// 실측 근거: docs/review-source-findings.md — 12개 소스 중 유일하게
// robots 가 허용하고 리뷰 원문까지 오는 곳이다.
//
// ⚠️ 여기서 쓰는 엔드포인트는 **공개 API 가 아니라 페이지 내부 AJAX** 다.
//    언제든 예고 없이 바뀐다. 그래서 이 파일이 깨지는 걸 전제로 설계했다:
//
//      - parse() 는 순수 함수다. 네트워크를 모른다. 저장한 픽스처
//        (fixtures/review/danawa/*.html)로 네트워크 없이 회귀를 확인한다.
//      - 항목은 보이는데 필드를 못 읽으면 조용히 버리지 않고 parseFailures
//        로 센다. 그게 lib/review/health.ts 의 broken 판정 입력이다.
//      - 구조가 바뀌면 이 파일과 픽스처만 갈아끼운다. robots·간격·커서·
//        건강도는 lib/review/runner.ts 에 있고 건드리지 않는다.
//
// ⚠️ 정규식으로 파싱한다. HTML 파서를 새로 넣지 않는 이유는 의존성 하나가
//    Vercel 번들과 Actions 양쪽에 얹히는 것에 비해 얻는 게 적어서다. 대신
//    "정규식이 조용히 빗나가는" 실패를 막으려고, 항목 경계를 먼저 자르고
//    각 항목 안에서만 필드를 찾는다. 문서 전체에 대고 찾으면 앞 항목의 값이
//    뒤 항목에 붙는다.

import type {
  ParseContext,
  ParseResult,
  ParsedReview,
  ReviewSourceAdapter,
  TargetState,
} from '../types.ts'

const REVIEW_AJAX = 'https://prod.danawa.com/info/dpg/ajax/companyProductReview.ajax.php'

/** 리뷰 항목의 경계. 이 클래스가 사라지면 파싱이 통째로 0건이 된다. */
const ITEM_MARK = 'danawa-prodBlog-companyReview-clazz-more'

/**
 * 리뷰 고유번호. 실측 확인:
 *   id="danawa-prodBlog-companyReview-button-side-252495223"
 * 같은 값이 button-block-... 에도 나오므로 둘 다 받는다.
 */
const SEQ_RE = /companyReview-button-(?:side|block)-(\d+)/

/** 100점 척도. `<span class="star_mask" style="width:100%">100점</span>` */
const SCORE_RE = /class="star_mask"[^>]*>\s*(\d+)\s*점/

/**
 * 판매처. `<span class="mall">` 안에 로고 img[alt] 와 숨김 span 이 함께 있다.
 * 로고가 없는 몰은 img 가 없을 수 있어 둘 다 시도한다.
 */
const MALL_IMG_RE = /<span class="mall">[\s\S]{0,400}?<img[^>]*\salt="([^"]+)"/
const MALL_SPAN_RE = /<span class="mall">[\s\S]{0,400}?<span[^>]*style="display:none;"[^>]*>([^<]+)</

/** `<span class="date">2025.09.06.</span>` — 시각이 없다. */
const DATE_RE = /<span class="date">\s*(\d{4})\.(\d{2})\.(\d{2})\.?\s*<\/span>/

/** `<span class="name">vl****</span>` */
const NAME_RE = /<span class="name">\s*([^<]*?)\s*<\/span>/

/** 제목과 본문. 제목은 없을 수 있다. */
const TITLE_RE = /<p class="tit">\s*([\s\S]*?)\s*<\/p>/
const BODY_RE = /<div class="atc">\s*([\s\S]*?)\s*<\/div>/

/** 태그를 걷어내고 공백을 정리한다. 지문 계산 전 정규화와는 별개다. */
function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 항목 경계로 자른다.
 *
 * ITEM_MARK 가 나오는 위치들을 찾아 그 사이를 한 항목으로 본다. 마지막
 * 항목은 목록 끝(`</ul>`)까지, 그것도 없으면 문서 끝까지다.
 *
 * 왜 이렇게 하는가: 문서 전체에 정규식을 걸면 앞 항목의 판매처가 뒤 항목에
 * 붙어도 아무도 모른다. 값이 "있긴 있어서" 실패로도 안 잡힌다. 경계를 먼저
 * 자르면 못 찾은 필드가 정직하게 null 이 된다.
 */
function splitItems(body: string): string[] {
  const marks: number[] = []
  let from = 0
  for (;;) {
    const i = body.indexOf(ITEM_MARK, from)
    if (i < 0) break
    marks.push(i)
    from = i + ITEM_MARK.length
  }
  if (marks.length === 0) return []

  const endOfList = body.indexOf('</ul>', marks[marks.length - 1])
  const tail = endOfList >= 0 ? endOfList : body.length

  return marks.map((start, idx) => body.slice(start, idx + 1 < marks.length ? marks[idx + 1] : tail))
}

/** 100점 척도를 0~5 로 옮긴다. 소수 첫째 자리까지만 남긴다. */
function toFiveScale(hundred: number): number {
  return Math.round((hundred / 20) * 10) / 10
}

function parseItem(chunk: string): { review: ParsedReview | null; failed: boolean } {
  const seq = SEQ_RE.exec(chunk)?.[1] ?? null

  const title = TITLE_RE.exec(chunk)?.[1] ?? ''
  const bodyMatch = BODY_RE.exec(chunk)
  const bodyRaw = bodyMatch?.[1] ?? ''
  const text = stripHtml([title, bodyRaw].filter(Boolean).join('\n')).trim()

  // ⚠️ 본문 컨테이너(<div class="atc">)의 **부재**를 구조 변경 신호로 쓴다.
  //
  //    픽스처 23개 항목 전부에 이 컨테이너가 있었다(many 10 / few 3 / page2 10,
  //    빈 것 0개). 그래서 컨테이너가 통째로 없으면 클래스명이 바뀐 것이다.
  //
  //    이 판정이 없으면 조용한 실패가 하나 생긴다. 다나와가 본문 클래스만
  //    바꾸면 제목(<p class="tit">)은 그대로 읽혀서 "제목만 남은 리뷰"가
  //    정상처럼 수집되고, seq·판매처·날짜가 멀쩡하니 parseFailures 도 0 이다.
  //    수집량은 그대로인데 본문이 사라진 채로 몇 주가 간다. 셀프테스트가
  //    실제로 이 구멍을 잡아냈다.
  const missingBodyContainer = bodyMatch === null

  // 컨테이너는 있는데 내용이 비었으면 원래 내용이 없는 리뷰다(별점만 남긴
  // 경우). 이 파이프라인이 쓰는 건 텍스트라 저장하지 않지만, 파서가 깨진
  // 것도 아니므로 실패로 세지 않는다. 둘을 가르는 게 컨테이너의 존재다.
  if (!text) return { review: null, failed: missingBodyContainer }

  const scoreRaw = SCORE_RE.exec(chunk)?.[1]
  const rating = scoreRaw ? toFiveScale(Number(scoreRaw)) : null

  const seller = MALL_IMG_RE.exec(chunk)?.[1] ?? MALL_SPAN_RE.exec(chunk)?.[1] ?? null

  const d = DATE_RE.exec(chunk)
  const writtenAt = d ? `${d[1]}-${d[2]}-${d[3]}` : null

  const nameRaw = NAME_RE.exec(chunk)?.[1] ?? ''
  const authorMasked = nameRaw || null

  // 셋 다 못 읽었으면 구조가 바뀐 것이다. 조용히 넘기면 "수집은 되는데
  // 판매처가 전부 null" 같은 상태로 몇 주가 간다.
  const missingIdentity = !seq && !seller && !writtenAt

  // 실패로 표시해도 리뷰는 버리지 않는다. 제목만이라도 남기고 시끄럽게
  // 보고하는 편이, 조용히 버려서 "신규 0건"으로 보이는 것보다 낫다.
  // 실패율이 20% 를 넘으면 health 가 broken 이 되어 소스가 멈춘다.
  const failed = missingBodyContainer || missingIdentity

  return {
    review: {
      externalId: seq,
      text,
      rating,
      seller: seller?.trim() || null,
      authorMasked,
      writtenAt,
    },
    failed,
  }
}

export const danawaAdapter: ReviewSourceAdapter = {
  key: 'danawa',
  displayName: '다나와 판매처 리뷰',

  nextRequest(target: TargetState) {
    const page = target.cursor ? Number(target.cursor) + 1 : 1
    if (!Number.isFinite(page) || page < 1) return null
    return { url: `${REVIEW_AJAX}?prodCode=${encodeURIComponent(target.productRef)}&page=${page}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const chunks = splitItems(body)

    // 항목이 0개면 이 타깃은 끝이다. 실측에서 page=2 가 정확히 이 형태로
    // 돌아왔다(HTTP 200, 항목 0개). 404 나 빈 응답이 아니라 정상 200 이므로
    // 상태 코드로는 끝을 알 수 없다.
    if (chunks.length === 0) {
      return { reviews: [], nextCursor: null, parseFailures: 0 }
    }

    const reviews: ParsedReview[] = []
    let parseFailures = 0

    for (const chunk of chunks) {
      const { review, failed } = parseItem(chunk)
      if (failed) parseFailures++
      if (review) reviews.push(review)
    }

    // ⚠️ 커서는 **방금 가져온 페이지 번호**다. ctx.cursor 를 그대로 돌려주면
    //    안 된다 — nextRequest 가 cursor+1 을 요청하므로, 커서가 제자리에
    //    머물면 같은 페이지를 영원히 다시 받는다.
    //
    //    nextRequest 와 계산이 대칭이어야 한다:
    //      요청한 페이지 = cursor 가 없으면 1, 있으면 cursor + 1
    //    통합 테스트가 이 비대칭을 잡았다(부품별 테스트는 둘 다 통과했다).
    const fetchedPage = ctx.cursor ? Number(ctx.cursor) + 1 : 1
    const nextCursor = String(Number.isFinite(fetchedPage) ? fetchedPage : 1)

    return { reviews, nextCursor, parseFailures }
  },
}

// 테스트에서만 쓰는 내부 함수. 러너는 어댑터 인터페이스만 본다.
export const __internal = { splitItems, parseItem, stripHtml, toFiveScale }
