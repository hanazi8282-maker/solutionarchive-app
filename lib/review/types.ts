// 리뷰 수집 계층의 타입 계약.
//
// 설계 전문: docs/review-collection-design.md
//
// ⚠️ 이 파일의 핵심은 **수집기와 파서를 가르는 것**이다.
//
//    쓸 만한 소스가 다나와 하나뿐이라(docs/review-source-findings.md),
//    그 하나가 HTML 구조를 바꾸면 수집이 통째로 멈춘다. 그때 갈아끼워야 할
//    범위를 최소로 만들어 두는 게 이 분리의 목적이다.
//
//    parse() 는 **순수 함수**다. 네트워크를 모르고, 입력이 문자열뿐이라
//    저장한 픽스처로 테스트할 수 있다. 구조가 바뀌면 파서 파일 하나와 그
//    픽스처만 새로 쓰고, robots·간격·커서·건강도는 건드리지 않는다.

/** 수집 대상 1건의 현재 상태. 러너가 DB(review_targets)에서 읽어 넘긴다. */
export interface TargetState {
  id: string
  projectId: string
  sourceKey: string
  /** 소스 안에서 상품을 가리키는 값. 다나와는 pcode. */
  productRef: string
  /**
   * 다음에 이어갈 위치. 소스마다 형태가 다르므로 문자열이다
   * (다나와는 페이지 번호, 토큰형 커서를 쓰는 소스도 있다).
   * null 이면 아직 한 번도 안 돈 타깃이다.
   */
  cursor: string | null
  /**
   * 증분 기준. 이보다 오래된 리뷰를 연속 STALE_STREAK_TO_STOP 개 만나면
   * 그 실행에서 이 타깃을 종료한다. "페이지 끝"이 아니라 이 조건을 쓰는
   * 이유는 정렬이 흔들리면 페이지 경계가 밀려 일부를 건너뛰기 때문이다.
   */
  lastReviewAt: string | null
  consecutiveEmpty: number
}

/** 파서에 넘기는 맥락. 파서는 이것 말고는 바깥을 모른다. */
export interface ParseContext {
  productRef: string
  /** 이 응답을 받은 커서. 파서가 다음 커서를 계산할 때 쓴다. */
  cursor: string | null
}

export interface ParsedReview {
  /**
   * 소스가 부여한 리뷰 고유값. 지문의 1순위다.
   *
   * 다나와는 노출한다(2026-08-29 실측):
   *   id="danawa-prodBlog-companyReview-button-side-252495223"
   *
   * null 이면 폴백 조합으로 지문을 만든다. 그 경우 같은 사람이 같은 날
   * 같은 판매처에서 같은 상품에 두 번 쓰면 두 번째를 잃는다.
   */
  externalId: string | null
  text: string
  /** 0~5 로 정규화한다. 다나와 원본은 100점 척도다. */
  rating: number | null
  /**
   * 판매처. 다나와가 여러 몰의 리뷰를 집약해 오고, 그게 쿠팡·11번가를
   * 직접 못 가는 것을 메우는 유일한 통로다. 몰별 비교 축이 여기서 나온다.
   */
  seller: string | null
  /** 마스킹된 작성자('vl****'). externalId 가 없을 때 지문 재료가 된다. */
  authorMasked: string | null
  /** ISO date (YYYY-MM-DD). 원본은 '2025.09.06.' 형식이라 시각이 없다. */
  writtenAt: string | null
}

export interface ParseResult {
  reviews: ParsedReview[]
  /** null 이면 이 타깃은 여기서 끝이다. */
  nextCursor: string | null
  /**
   * 리뷰 항목은 보이는데 필드를 못 읽은 수.
   *
   * ⚠️ reviews.length 와 합쳐 세면 안 된다. "0건 파싱"과
   *    "10건 보이는데 0건 파싱"은 완전히 다른 사건인데, 합치면 둘이
   *    똑같이 보인다. 후자가 구조 변경 신호이고 건강도 판정의 입력이다.
   */
  parseFailures: number
}

export interface ReviewSourceAdapter {
  key: string
  displayName: string

  /**
   * 다음에 가져올 URL. null 이면 이 타깃은 끝이다.
   *
   * ⛔ 이 메서드는 URL 을 계산만 한다. **네트워크를 호출하지 않는다.**
   *    robots 판정·요청 간격·일일 상한·커서 전진은 전부 공용 러너가 맡는다.
   *    어댑터가 직접 fetch 하면 소스를 추가할 때마다 그 규칙들이 복사되고,
   *    한 곳에서 빠뜨리는 순간 상대 서버를 규칙 없이 때리게 된다.
   */
  nextRequest(target: TargetState): { url: string } | null

  /** 순수 함수. 네트워크 없음. 입력은 문자열과 맥락뿐이다. */
  parse(body: string, ctx: ParseContext): ParseResult

  /**
   * 403/429 응답 본문에 이 문자열들 중 하나가 보이면 **쿼터 소진**으로 본다.
   * 소문자 부분일치로 비교한다.
   *
   * ⚠️ 이 필드가 없거나 비면 모든 403/429 는 **차단**으로 판정한다.
   *    안전한 쪽 기본값이다 — 차단을 쿼터로 오인하면 차단당한 소스를
   *    계속 두드리게 되고, 두드릴수록 영구 차단에 가까워진다.
   *    반대 방향(쿼터를 차단으로 오인)은 소스가 하루 꺼질 뿐이다.
   *
   * 스크래핑 소스(다나와)는 쿼터 개념이 없으므로 두지 않는다. 공식 API
   * 소스(YouTube Data API 등)만 선언한다 — 거기서는 정상적인 일일 한도
   * 소진이 403 으로 오기 때문이다.
   */
  quotaMarkers?: string[]
}

/**
 * 지문 재료.
 *
 * identity_key 는 "같은 리뷰인가" 판별용이라 **본문을 넣지 않는다.**
 * content_hash 는 "내용이 바뀌었는가" 감지용이고 제약이 아니라 관측값이다.
 * 자세한 근거는 설계 §4.5.
 *
 * 실제 계산은 4단계(러너)에서 구현한다.
 */
export type FingerprintKind = 'seq' | 'composite'

export interface Fingerprint {
  sourceKey: string
  identityKey: string
  contentHash: string
  kind: FingerprintKind
  productRef: string | null
  writtenAt: string | null
}
