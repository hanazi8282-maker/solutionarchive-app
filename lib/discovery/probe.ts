// 발굴 프로브 — 후보 이름이 실제로 VOC 를 가졌는지 **남의 서버에 물어본다.**
//
// 이게 이 엔진의 핵심이다. LLM 은 이름만 내고, 채택 여부는 여기서 센 숫자가
// 정한다. LLM 이 "이거 리뷰 많아요" 라고 한 말은 근거로 쓰지 않는다.
//
// ⚠️ 파싱 실패와 0건을 가른다(CLAUDE.md §7.1).
//    - HTTP 200 인데 결과 컨테이너가 없다  → 실패(hits=null). 상태 코드만으로
//      성공을 판정하지 않는다. 다나와가 구조를 바꾸거나 차단 페이지를 200 으로
//      주는 날, 이걸 0건으로 접으면 "후보 전부 기각"으로 조용히 끝난다.
//    - 컨테이너는 있는데 상품이 0개        → 0건(hits=0). 진짜로 없는 것이다.
//    - 상품은 있는데 리뷰수 마커가 하나도 없음 → 실패(hits=null). 0 이 아니다.
//
// ⚠️ 네트워크를 포트로 주입받는다(lib/review/runner.ts 와 같은 방식).
//    파서는 순수 함수라 픽스처로 회귀를 확인한다.
//
// 대상 두 곳:
//   - saas     : hn.algolia.com (robots 없음, 공개 API, 상업이용 제한 없음)
//   - physical : search.danawa.com/dsearch.php (Disallow 밖, Crawl-delay: 10)
//     ⚠️ Crawl-delay 는 **호출하는 쪽**이 지킨다. probeDanawa 는 잠들지 않는다.
//        scripts/discovery-run.mjs 가 DANAWA_CRAWL_DELAY_MS 간격을 넣는다.

import type { FetchOutcome } from '../review/runner.ts'
import type { ProbeResult } from './candidate.ts'

export type FetchText = (url: string) => Promise<FetchOutcome>

export const HN_SEARCH = 'https://hn.algolia.com/api/v1/search_by_date'
export const DANAWA_SEARCH = 'https://search.danawa.com/dsearch.php'

/** 다나와 robots 의 Crawl-delay(2026-09-17 재실측: 10초). */
export const DANAWA_CRAWL_DELAY_MS = 10_000

/** 검색결과 컨테이너. 이게 없으면 "0건"이 아니라 "못 읽었다"다. */
const LIST_CONTAINER = 'id="productListArea"'

/** 상품 항목 경계. `<li id="productItem97405013" class="prod_item" …>` */
const ITEM_RE = /<li\s[^>]*id="productItem(\d+)"/g

/**
 * 상품리뷰 수. 항목 안에서만 찾는다.
 *   <span class="dt_behind">상품리뷰</span> … <span class="text__number">999+</span>
 *
 * ⚠️ 바로 아래 `의견`(mt_comment) 카운트와 **다른 수다.** 의견은 한 자릿수인
 *    경우가 흔해서(실측: 리뷰 999+ / 의견 77) 그걸 리뷰수로 읽으면 멀쩡한
 *    상품이 전부 insufficient_voc 로 기각된다. 앵커를 `상품리뷰` 라벨에 건다.
 */
const REVIEW_COUNT_RE = /dt_behind">상품리뷰<\/span>[\s\S]{0,600}?text__number">\s*([\d,]+)(\+?)\s*</

/**
 * 상품명. `<p class="prod_name"><a …>APPLE 에어팟 프로3</a>`
 *
 * 판정에는 안 쓴다. **사람이 나중에 "이거 엉뚱한 상품인데" 를 알아볼 수 있게**
 * probe_note 에 남기려고 읽는다(discovery_candidates.human_review).
 */
//
// ⚠️ 앵커 안쪽에 `<span>` 이 들어가는 레이아웃이 있다. `([^<]+)` 로 잡으면
//    그 항목에서 정규식이 **더 뒤의 스펙 링크까지 흘러가** 엉뚱한 단어를
//    상품명으로 집는다(실측: "유선"). 태그를 포함해 잘라낸 뒤 벗긴다.
const PROD_NAME_RE = /<p class="prod_name">\s*<a[^>]*>([\s\S]{0,300}?)<\/a>/

export interface DanawaSearchItem {
  pcode: string
  /** 리뷰수. null = 그 항목에 마커가 없다(0 이 아니다). */
  reviews: number | null
  /** `999+` 처럼 상한이 걸린 표기였나. 그러면 reviews 는 하한선이다. */
  capped: boolean
  /** 사람 확인용 상품명. 못 읽어도 판정에는 영향이 없다. */
  name: string | null
}

export type DanawaSearchParse =
  | { ok: true; items: DanawaSearchItem[] }
  | { ok: false; error: string }

/** 다나와 검색 결과 HTML → 상품 목록. 순수 함수. */
export function parseDanawaSearch(html: string): DanawaSearchParse {
  if (!html.includes(LIST_CONTAINER)) {
    return { ok: false, error: '검색결과 컨테이너(productListArea)가 없다 — 구조 변경이거나 차단 페이지다' }
  }

  const bounds: Array<{ pcode: string; at: number }> = []
  ITEM_RE.lastIndex = 0
  for (;;) {
    const m = ITEM_RE.exec(html)
    if (!m) break
    bounds.push({ pcode: m[1], at: m.index })
  }

  const items: DanawaSearchItem[] = bounds.map((b, i) => {
    // 항목 경계로 먼저 자른다. 문서 전체에 대고 찾으면 앞 상품의 리뷰수가
    // 뒤 상품에 붙는다(danawa.ts 와 같은 이유).
    const block = html.slice(b.at, i + 1 < bounds.length ? bounds[i + 1].at : html.length)
    const m = REVIEW_COUNT_RE.exec(block)
    const n = PROD_NAME_RE.exec(block)
    return {
      pcode: b.pcode,
      reviews: m ? Number(m[1].replace(/,/g, '')) : null,
      capped: m ? m[2] === '+' : false,
      name: n ? n[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || null : null,
    }
  })

  return { ok: true, items }
}

/** HN 검색 응답(JSON) → nbHits. null = 못 읽었다. */
export function parseHnSearch(body: string): { ok: true; nbHits: number } | { ok: false; error: string } {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return { ok: false, error: 'JSON 이 아니다 — 차단 페이지이거나 API 가 바뀌었다' }
  }
  const n = (json as { nbHits?: unknown } | null)?.nbHits
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return { ok: false, error: 'nbHits 필드가 없다 — 응답 형식이 바뀌었다' }
  }
  return { ok: true, nbHits: n }
}

/**
 * HN 검색 URL.
 *
 * ⚠️ 이름을 **따옴표로 감싸고 advancedSyntax 를 켠다.** 안 그러면 Algolia 가
 *    단어를 OR 로 붙여서 두 단어 이름이 수만 건으로 걸린다(실측:
 *    `linear app` 17,622 건 vs `"linear app"` 20 건). 그 상태의 최소 건수
 *    게이트는 **아무것도 거르지 못한다** — 게이트가 항상 통과하면 없는 것과 같다.
 */
export function hnSearchUrl(name: string): string {
  const q = new URLSearchParams({
    query: `"${name.replace(/"/g, ' ').trim()}"`,
    tags: 'comment',
    advancedSyntax: 'true',
    hitsPerPage: '1',
  })
  return `${HN_SEARCH}?${q}`
}

export function danawaSearchUrl(name: string): string {
  return `${DANAWA_SEARCH}?${new URLSearchParams({ query: name.trim() })}`
}

/** 요청 결과를 본문으로. 200 이 아니면 이유를 담아 null. */
function bodyOf(res: FetchOutcome): { ok: true; body: string } | { ok: false; error: string } {
  if (res.status === null) return { ok: false, error: `요청 실패: ${res.error}` }
  if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, body: res.body }
}

/** saas 후보 — HN 댓글 수. product_ref 는 `q:<이름>` 이고 질의 자체가 대상이다. */
export async function probeSaas(name: string, fetchText: FetchText): Promise<ProbeResult> {
  const res = await fetchText(hnSearchUrl(name))
  const body = bodyOf(res)
  if (!body.ok) return { hits: null, ref: null, note: body.error }

  const parsed = parseHnSearch(body.body)
  if (!parsed.ok) return { hits: null, ref: null, note: parsed.error }

  return {
    hits: parsed.nbHits,
    // 0건이어도 ref 는 만들 수 있지만, judge 가 어차피 기각한다.
    ref: `q:${name.trim()}`,
    note: `hn comments nbHits=${parsed.nbHits} (phrase)`,
  }
}

/** physical 후보 — 다나와 검색에서 리뷰가 가장 많은 상품의 pcode 와 리뷰수. */
export async function probePhysical(name: string, fetchText: FetchText): Promise<ProbeResult> {
  const res = await fetchText(danawaSearchUrl(name))
  const body = bodyOf(res)
  if (!body.ok) return { hits: null, ref: null, note: body.error }

  const parsed = parseDanawaSearch(body.body)
  if (!parsed.ok) return { hits: null, ref: null, note: parsed.error }

  if (parsed.items.length === 0) {
    // 컨테이너는 읽었고 상품이 0개다. 이건 진짜 0건이다.
    return { hits: 0, ref: null, note: '다나와 검색결과 0건' }
  }

  const withCount = parsed.items.filter((i) => i.reviews !== null)
  if (withCount.length === 0) {
    // 상품은 보이는데 리뷰수 마커가 하나도 없다 = 마크업이 바뀌었다.
    return { hits: null, ref: null, note: `상품 ${parsed.items.length}건인데 리뷰수 마커가 하나도 없다` }
  }

  const top = withCount.reduce((a, b) => ((b.reviews ?? 0) > (a.reviews ?? 0) ? b : a))
  return {
    hits: top.reviews,
    ref: top.pcode,
    note:
      `danawa pcode=${top.pcode} "${top.name ?? '상품명 못읽음'}" ` +
      `reviews=${top.reviews}${top.capped ? '+(하한)' : ''} / 검색결과 ${parsed.items.length}건`,
  }
}
