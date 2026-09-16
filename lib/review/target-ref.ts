// 수집 타깃의 product_ref 를 만드는 자리. 소스 1개 = 빌더 1개.
//
// ⚠️ **어댑터가 읽을 수 있는 형태만 만든다.** 이 파일이 내는 값은 그대로
//    review_targets.product_ref 가 되고, 러너는 그걸 어댑터의
//    parseProductRef 에 넣는다. 형식이 어긋나면 파싱이 조용히 null 을 내고
//    그 타깃은 매일 밤 요청 0건으로 끝난다(아무 에러도 안 난다).
//    그래서 빌더는 전부 **해당 어댑터의 parseProductRef 를 그대로 호출해서**
//    검증한다 — 규칙을 두 벌 두지 않는다.
//
// ⚠️ 여기 없는 소스는 등록 경로가 없는 것과 같다. 실제로 그 상태였다:
//    review_sources 에 13개 소스가 있는데 빌더는 danawa/appstore/hackernews
//    3개뿐이라, 커뮤니티 10종은 어댑터·마이그레이션을 다 만들어 두고도 타깃을
//    한 건도 등록할 수 없었다. scripts/discovery-selftest.mjs 가 이 파일의
//    키 집합과 scripts/review-collect.mjs 의 어댑터 키 집합을 대조한다.
//
// ⛔ **자유 텍스트로 검색해서 후보 중 하나를 자동으로 고르지 않는다.**
//    이 금지는 **기존 프로젝트에 상품을 갖다 붙일 때** 유효하다. 어느 상품을
//    어느 프로젝트에 붙일지는 사람이 정한다 — 자동 선택은 조용히 틀린 상품의
//    리뷰를 모아 오고, 분석 결과가 그럴듯해서 아무도 못 알아챈다.
//    (예외는 lib/discovery/probe.ts 하나다. 발굴 루프가 새로 만드는
//     프로젝트는 "프로브가 찾아낸 pcode 가 곧 그 프로젝트의 정의"라 붙일
//     대상 자체가 없다. 기존 프로젝트에는 그 경로로도 못 붙인다.)

import { parseDanawaProductUrl } from './danawa-url.ts'
import { parseProductRef as parseAppstoreRef } from './adapters/appstore.ts'
import { HOST as COOK82_HOST, parseProductRef as parseCook82Ref } from './adapters/82cook.ts'
import { HOST as BOBAE_HOST, parseProductRef as parseBobaeRef } from './adapters/bobaedream.ts'
import { HOST as BRUNCH_HOST, parseProductRef as parseBrunchRef } from './adapters/brunch.ts'
import { HOST as CLIEN_HOST, parseProductRef as parseClienRef } from './adapters/clien.ts'
import { HOST as DAMOANG_HOST, parseProductRef as parseDamoangRef } from './adapters/damoang.ts'
import { HOST as FMKOREA_HOST, parseProductRef as parseFmkoreaRef } from './adapters/fmkorea.ts'
import { HOST as NAVER_HOST, parseProductRef as parseNaverRef } from './adapters/naver-blog.ts'
import { HOST as THEQOO_HOST, parseProductRef as parseTheqooRef } from './adapters/theqoo.ts'
import { HOST as TODAYHUMOR_HOST, parseProductRef as parseTodayhumorRef } from './adapters/todayhumor.ts'
import { HOST as TUMBLBUG_HOST, parseProductRef as parseTumblbugRef } from './adapters/tumblbug.ts'

export type RefResult = { ok: true; productRef: string } | { ok: false; error: string }

/** HN 키워드 제약. 너무 짧으면 온 세상이 걸리고, 너무 길면 아무것도 안 걸린다. */
export const KEYWORD_MIN = 2
export const KEYWORD_MAX = 64

/** 다나와 상품 URL → pcode. 규칙은 lib/review/danawa-url 에 한 벌만 둔다. */
function danawaRef(raw: string): RefResult {
  const parsed = parseDanawaProductUrl(raw)
  return parsed.ok ? { ok: true, productRef: parsed.pcode } : { ok: false, error: parsed.error }
}

/** HN 키워드 검증. 통과하면 `q:<키워드>` 로 만든다. */
function hackernewsRef(raw: string): RefResult {
  const keyword = raw.trim()

  if (!keyword) {
    return { ok: false, error: '검색할 키워드를 입력해주세요. (예: notion)' }
  }
  // 줄바꿈이 섞이면 질의가 두 개인지 하나인지 알 수 없다. 붙여넣기 사고를 막는다.
  if (/[\r\n]/.test(keyword)) {
    return { ok: false, error: '키워드는 한 줄로 입력해주세요. 여러 키워드는 타깃을 따로 등록합니다.' }
  }
  if (keyword.length < KEYWORD_MIN) {
    return { ok: false, error: `키워드는 ${KEYWORD_MIN}자 이상이어야 합니다. 한 글자로는 관련 없는 댓글이 대부분 걸립니다.` }
  }
  if (keyword.length > KEYWORD_MAX) {
    return { ok: false, error: `키워드는 ${KEYWORD_MAX}자 이하여야 합니다.` }
  }

  return { ok: true, productRef: `q:${keyword}` }
}

/** App Store 는 어댑터의 검증기를 그대로 쓴다 — 규칙을 두 벌 두지 않는다. */
function appstoreRef(raw: string): RefResult {
  const parsed = parseAppstoreRef(raw)
  if (!parsed) {
    return {
      ok: false,
      error: '앱 ID 형식이 아닙니다. `<국가코드>:<앱ID>` 또는 `<앱ID>` 로 입력해주세요. (예: kr:1459969523)',
    }
  }
  // 어댑터가 읽는 것과 똑같은 형태로 정규화해서 저장한다.
  return { ok: true, productRef: `${parsed.country}:${parsed.appId}` }
}

/**
 * 커뮤니티 소스 공통 빌더 — `url:<경로>` 형식.
 *
 * 사람이 브라우저에서 복사한 전체 URL 을 받아 준다. 단 **호스트가 그 소스의
 * 것일 때만** 경로를 떼어 낸다. 아무 URL 이나 받아 경로만 쓰면, 어댑터가
 * 자기 호스트에 그 경로를 붙여 엉뚱한 글을 긁는다.
 * (`url:` 로 시작하는 값을 그대로 넣는 것도 허용 — 사람이 DB 값을 옮겨 적는 경우.)
 *
 * 최종 검증은 어댑터의 parseProductRef 가 한다. 여기서 통과한 값은 러너가
 * 반드시 읽을 수 있다.
 */
function urlRefBuilder(
  host: string,
  parse: (ref: string) => string | null,
  example: string,
): (raw: string) => RefResult {
  return (raw: string) => {
    const trimmed = (raw ?? '').trim()
    if (!trimmed) {
      return { ok: false, error: `글 주소를 입력해주세요. (예: ${host}${example})` }
    }

    let ref: string
    if (/^url:/i.test(trimmed)) {
      ref = trimmed
    } else {
      let url: URL
      try {
        url = new URL(trimmed)
      } catch {
        return { ok: false, error: `글 주소(URL)를 그대로 붙여넣어 주세요. (예: ${host}${example})` }
      }
      if (url.origin !== host) {
        return {
          ok: false,
          error: `이 소스의 주소가 아닙니다: ${url.origin}. ${host} 의 글 주소여야 합니다.`,
        }
      }
      ref = `url:${url.pathname}${url.search}`
    }

    const parsed = parse(ref)
    if (parsed === null) {
      return {
        ok: false,
        error: `이 소스가 수집할 수 있는 글 주소가 아닙니다. (예: ${host}${example})`,
      }
    }
    // ⚠️ parse 가 돌려준 **정규화된 경로**를 쓴다. 입력 원문을 쓰면 파라미터
    //    순서만 다른 같은 글이 서로 다른 타깃으로 두 번 쌓인다.
    return { ok: true, productRef: `url:${parsed}` }
  }
}

/**
 * 소스 키 → 빌더. **키는 review_sources.key 와 철자까지 같아야 한다.**
 * (`scripts/review-collect.mjs` 의 ADAPTERS 와 같은 집합이어야 한다.)
 */
export const REF_BUILDERS: Record<string, (raw: string) => RefResult> = {
  danawa: danawaRef,
  appstore: appstoreRef,
  hackernews: hackernewsRef,
  '82cook': urlRefBuilder(COOK82_HOST, parseCook82Ref, '/entiz/read.php?num=1234567'),
  bobaedream: urlRefBuilder(BOBAE_HOST, parseBobaeRef, '/view?code=freeb&No=1234567'),
  brunch: urlRefBuilder(BRUNCH_HOST, parseBrunchRef, '/@handle/123'),
  clien: urlRefBuilder(CLIEN_HOST, parseClienRef, '/service/board/park/12345678'),
  damoang: urlRefBuilder(DAMOANG_HOST, parseDamoangRef, '/free/1234567'),
  // ⚠️ fmkorea 는 robots 가 `/best/` `/best2/` `/humor/` 세 갈래만 연다. 그 밖은
  //    어댑터가 거절한다 — 여기서 예시를 그 셋 중 하나로 든다.
  fmkorea: urlRefBuilder(FMKOREA_HOST, parseFmkoreaRef, '/best/1234567890'),
  naver_blog_post: urlRefBuilder(NAVER_HOST, parseNaverRef, '/PostView.naver?blogId=abc&logNo=123'),
  theqoo: urlRefBuilder(THEQOO_HOST, parseTheqooRef, '/square/1234567'),
  todayhumor: urlRefBuilder(TODAYHUMOR_HOST, parseTodayhumorRef, '/board/view.php?table=bestofbest&no=123'),
  tumblbug: urlRefBuilder(TUMBLBUG_HOST, parseTumblbugRef, '/project-slug'),
}

export function buildProductRef(sourceKey: string, raw: string): RefResult | null {
  const build = REF_BUILDERS[sourceKey]
  return build ? build(raw) : null
}
