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
  /**
   * 증분 기준선(옵셔널). 러너가 **실행 시작 시점의** `TargetState.lastReviewAt` 을
   * 그대로 넘긴다 — 실행 중에 갱신된 값이 아니다(runner.ts `baselineReviewAt`).
   *
   * 게시판 순회(`board:`)에서 목록의 오래된 글을 **요청하기 전에** 걸러내려고
   * 열었다. 러너의 증분 종료(STALE_STREAK_TO_STOP)는 이미 받아 온 응답을 보고
   * 판정하므로 요청 비용을 아끼지 못한다.
   *
   * ⚠️ 이걸 쓰는 파서는 **날짜를 확실히 읽을 수 있을 때만** 걸러라. 목록에
   *    연도가 없는 사이트(보배드림 `09/23`)에서 연도를 추정해 거르면 1월에
   *    한 해치를 건너뛴다. 못 읽으면 거르지 말고 통과시킨다 — 중복 적재는
   *    지문이 막아 주지만 건너뛴 글은 아무도 되찾아 주지 않는다.
   */
  lastReviewAt?: string | null
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
  /**
   * 이 리뷰가 달린 상위 문서(스레드/게시글)의 소스 내 id(옵셔널).
   *
   * hackernews 만 채운다 — HN 은 한 스레드에 여러 댓글이 걸리고, 스레드
   * 단위 신호(score 등)를 나중에 배치로 덧붙이려면 어느 스레드인지가 필요하다
   * (scripts/review-hackernews-enrich.mjs). 다나와·appstore 는 상품 1개 =
   * 타깃 1개라 이 개념이 없다(null).
   */
  storyId?: string | null
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
  /**
   * 필드는 정상적으로 읽었지만 **질의와 무관**해서 버린 수(옵셔널).
   *
   * ⚠️ parseFailures 와 별개다. 이건 구조 문제가 아니라 소스가 관련 없는
   *    결과를 섞어 준 것이다. 여기 세면 건강도 판정의 파싱 성공률 분모
   *    (reviewsParsed + parseFailures)에 안 들어가 — 관련없음이 많다고
   *    소스가 broken 으로 꺼지지 않는다.
   *
   * 현재 두 어댑터가 쓴다. 안 쓰는 어댑터는 이 필드를 두지 않는다(undefined).
   *   hackernews — Algolia search_by_date 가 키워드 무관 최신 댓글을 섞어 준다.
   *   tumblbug   — 창작자 후기 프리뷰에 **다른 프로젝트** 후기가 섞여 온다.
   *                이 타깃 프로젝트 것만 받고 나머지를 여기 센다. 안 거르면
   *                후기가 **남의 프로젝트 타깃의 project_id 로** 적재된다.
   *                (중복 적재 쪽은 2026-09-24 지문 변경으로 막혔다 — 이제
   *                identity_key 에 productRef 가 없다. 귀속 오류는 그대로 남으므로
   *                이 필터는 유지한다.)
   */
  filtered?: number
  /**
   * **이 실행에서 이 타깃을 여기서 끝내되 커서를 버리지 않는다**(옵셔널).
   *
   * `nextCursor: null` 은 "끝났다 + 커서 폐기"라 다음 실행이 처음부터 다시 읽는다.
   * 그런데 게시판 순회는 "마지막으로 본 글 id"를 **다음 실행까지** 들고 가야
   * 같은 글을 매일 다시 받지 않는다. 커서가 유일한 영속 저장소라 둘 다 필요하다:
   *   · 이번 실행은 여기서 멈춘다        → `pauseRun: true`
   *   · 다음 실행은 이 커서에서 이어간다  → `nextCursor: <상태 JSON>`
   *
   * 러너 동작: 그 타깃의 페이지 루프를 끊고 커서를 그대로 저장한다. status 는
   * `active` 로 남는다(닫지 않는다). `nextCursor` 가 null 이면 이 플래그는 무시된다 —
   * 그때는 "끝"이 우선이고 `incrementalOnly` 가 닫을지 말지를 가른다.
   *
   * ⚠️ 이걸로 무한 루프를 만들지 마라. `pauseRun` 없이 매 실행 목록만 다시 읽는
   *    커서를 내면 페이지 상한 20 에 걸릴 때까지 같은 목록을 훑는다.
   */
  pauseRun?: boolean
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

  /**
   * **robots 확인 불가를 사람이 인지하고 진행을 승인한 호스트 목록**(hostname,
   * 스킴·포트 없음). 여기 없는 호스트는 robots 를 확인하지 못하면 요청하지 않는다.
   *
   * ⚠️ 이 필드가 왜 있나. 러너는 2026-09-18 부터 robots 확인 불가를 fail-closed
   *    로 다룬다(`runner.ts` 의 `RobotsCache`). 그런데 **robots.txt 가 실측 404
   *    인 상태로 이미 등록된 소스들이 있다** — 그것들을 조용히 0건으로 만드는
   *    것도 사고다(_principles.md §2: 안전장치가 걸린 것을 정상으로 읽지 않는다).
   *    그래서 "확인 불가지만 근거를 남기고 진행한다"를 **호스트 단위 명시 표식**
   *    으로만 통과시킨다. 표식 없는 신규 호스트는 막힌다 — 기본값이 안전한 쪽이다.
   *
   * 지킬 것:
   *   - 여기 적는 호스트마다 **언제 무엇을 실측했는지** 어댑터 주석에 남긴다.
   *     근거 없는 등재는 fail-closed 를 되돌리는 것과 같다.
   *   - 이건 **확인 불가만** 통과시킨다. `disallowed`(규칙이 막는다)는 어떤
   *     경우에도 뚫지 않는다.
   *   - 5xx·네트워크 오류·타임아웃은 이 표식으로도 통과하지 못한다. "서버가
   *     404 로 확정 응답했다"와 "서버가 흔들려 답을 못 받았다"는 다른 사건이다.
   *   - robots.txt 가 나중에 생기면 그때는 규칙이 파싱되므로 이 표식은 자동으로
   *     무력화된다(확인 불가가 아니게 된다). 지워 두지 않아도 위험하지 않지만,
   *     생긴 것을 확인했으면 지운다.
   */
  proceedWhenRobotsUnverified?: string[]

  /**
   * 이 소스가 돌기 위해 반드시 있어야 하는 환경변수 이름들(공식 API 키 등).
   *
   * 실행기(scripts/review-collect.mjs)가 **러너를 부르기 전에** 검사하고, 없으면 그 소스만
   * 실패로 표시하고 건너뛴다. 키 없이 돌려서 401/403 을 받으면 그건 "차단"으로 기록되고
   * 소스가 꺼진다 — 원인이 우리 쪽 설정인데 상대가 막은 것으로 남는다(§7.1).
   */
  requiredEnv?: string[]

  /**
   * **이 소스의 타깃은 "끝"이 없다 — API 페이지 상한에 닿아도 닫지 않는다.**
   *
   * hackernews 처럼 `product_ref` 가 질의(`q:...`)인 소스는 대상이 고정된 문서가
   * 아니라 **계속 새 글이 달리는 검색 결과**다. 그런데 Algolia 의 페이지 상한
   * (1000/50 = 20페이지)이 러너의 페이지 상한과 같아 첫 실행에 끝까지 읽고
   * `nextCursor=null` 이 나온다 → 그날로 `exhausted` 로 닫히고, 되살리는 코드가
   * 없어 그 질의는 영영 다시 안 돈다.
   *
   * 이 플래그가 켜진 소스는 커서가 null 이어도 `active` 로 둔다. 다음 실행은
   * 커서 null = page 0 부터 시간 역순으로 읽다가 `last_review_at` 이전 댓글이
   * 연속 `STALE_STREAK_TO_STOP` 건이면 멈춘다(기존 증분 종료 그대로).
   * 즉 "매일 새 댓글만".
   *
   * ⚠️ 문서 1개가 대상인 소스(다나와 pcode·앱 id)에는 켜지 마라. 그건 진짜로 끝이 있고,
   *    닫지 않으면 같은 글을 매일 다시 긁는다.
   *
   * ⚠️ **커뮤니티 `url:` 11개는 2026-09-23 부터 예외로 켜져 있다**(남헌 Q3(a)).
   *    이 주석은 원래 그것도 금지했다. 뒤집은 이유와 대가를 그대로 적어 둔다 —
   *    "규칙이 바뀌었다"가 아니라 "대가를 알고 골랐다"다:
   *      · 뒤집은 이유: 타깃 113개 중 85개가 `exhausted` 였고 그중 80개는 성과가 없어서가
   *        아니라 "끝까지 읽어서" 닫혔다. `listDueTargets` 는 `active` 만 보고, 되살리는
   *        코드가 리포에 없다 → 그 질의는 영영 다시 안 돈다.
   *      · 대가: 게시글 1개 = 1요청이라 실행마다 타깃 수만큼 다시 읽는다. 게시글은 커서가
   *        첫 페이지에 null 이 되므로 20페이지를 훑지는 않는다.
   *      · 그 구멍은 2026-09-24 에 막았다: 새 댓글이 영원히 안 달리는 글도 닫히지
   *        않는다던 문제다. 러너가 **연속 `MAX_CONSECUTIVE_EMPTY` 회 신규 0건이면
   *        `exhausted` 로 닫는다**(health.ts 와 같은 상수 · runner.ts 의 `emptyClose`).
   *        차단(403/429)·dry-run 은 세지 않는다 — 그건 "신규 0건"이 아니다.
   *        되살리는 것은 여전히 사람 몫이다(`listDueTargets` 는 active 만 본다).
   *      · **본문 전용 소스(brunch·velog)는 다시 읽어도 새 건이 0 이다.** 되돌릴 첫 후보다.
   */
  incrementalOnly?: boolean

  /**
   * **이 소스의 `externalId` 는 타깃(상품) 안에서만 유일하다 — 사이트 전역이 아니다.**
   *
   * 기본값 `false`(= 사이트 전역 유일)에서 지문의 `identity_key` 는
   * `sha256(sourceKey|externalId)` 다. 그래야 같은 글이 `url:` 타깃과 `board:`
   * 타깃 두 경로로 들어와도 한 행이다(2026-09-24 이전에는 productRef 가 키에
   * 들어가 두 행이 됐다 — fingerprint.ts 헤더).
   *
   * 이 플래그를 켜면 productRef 를 키에 남긴다(= 옛 키 그대로).
   *
   * ⚠️ 켜고 끄는 기준은 **실측**이다. 어댑터가 내는 externalId 가 정규화된 경로나
   *    플랫폼 전역 id 면 끈 채로 둔다. 의미를 모르는 불투명한 번호(다나와 리뷰 seq
   *    — 몰마다 id 공간이 다른 것으로 관측됨)면 켠다. 판단을 미루고 끈 채로 두면
   *    **서로 다른 리뷰 둘이 한 리뷰로 뭉개진다**(중복 적재보다 나쁘다).
   *
   * ⚠️ 새 어댑터는 `scripts/review-fingerprint-selftest.mjs` 의 감사 표에 한 줄을
   *    추가해야 그 셀프테스트가 통과한다. 판단을 강제하려고 그렇게 만들었다 —
   *    표에 없으면 "확인하지 않았다"이고, 그건 통과가 아니다(§7.1).
   */
  productScopedExternalId?: boolean
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
  /**
   * 2026-09-24 이전 공식으로 계산한 키(`sha256(sourceKey|productRef|externalId)`).
   * 옛 키로 이미 저장된 행을 찾는 데만 쓴다. 새 키와 같으면 null 이다.
   *
   * ponytail: 백필이 끝나면 제거 — 다만 옛 키는 externalId 를 DB 에 남기지 않아
   * SQL 로 되계산할 수 없다(마이그레이션 20260930000012 헤더). 지금은 폴백이
   * 유일한 이행 경로다.
   */
  legacyIdentityKey: string | null
  contentHash: string
  /**
   * 정규화된 본문 길이. 교차 타깃 content_hash 방어(2차)를 적용할지 가르는 값이다 —
   * 짧고 흔한 본문은 서로 다른 글이 같은 해시가 되므로 적용하지 않는다
   * (fingerprint.ts `CROSS_TARGET_MIN_TEXT_LEN`).
   */
  textLength: number
  kind: FingerprintKind
  productRef: string | null
  writtenAt: string | null
}

// ════════════════════════════════════════════════════════════════════
// 게시판 순회 모드 — `product_ref = 'board:<게시판 slug>'`
// ════════════════════════════════════════════════════════════════════
//
// 왜 있나. 커뮤니티 타깃이 전부 `url:`(게시글 1개 = 타깃 1개)이라 **새 글이
// 안 잡힌다.** 사람이 글 주소를 하나씩 등록해야 했고 그게 VOC 수집의 병목이었다
// (reports/2026-09-23/voc-expansion-investigation.md §3). 타깃 하나가 게시판을
// 순회하면 새 글이 저절로 들어온다.
//
// 규약 (어댑터가 이걸 지킨다 — 새로 붙이는 어댑터도 같게 해라):
//
//   1. `nextRequest` 는 커서 상태로 **두 종류 URL 을 번갈아** 낸다.
//        큐가 비어 있다 → 목록 페이지(1페이지만)
//        큐가 있다      → 큐 맨 앞 글의 URL(댓글 포함 페이지)
//      러너는 어느 쪽인지 모른다. "한 타깃이 여러 URL 종류를 낸다"를 그냥 허용한다.
//
//   2. `parse` 는 `ctx.cursor` 로 **자기가 무엇을 요청했는지** 안다. 본문을 보고
//      추측하지 않는다 — 목록 HTML 과 글 HTML 을 냄새로 가르면 한쪽이 바뀔 때
//      조용히 오판한다(§7.1).
//
//   3. 목록 응답에서는 리뷰를 내지 않는다(`reviews: []`). 목록에는 제목만 있고
//      본문·댓글이 없다. 대신 새 글 경로를 큐에 담아 커서로 돌려준다.
//
//   4. **글 URL 은 목록의 href 를 그대로 쓰지 않는다.** 추출한 **숫자 id** 로
//      어댑터가 다시 조립한다. HTML 은 남의 서버가 준 문자열이라, href 를 믿으면
//      `//evil.example/...` 한 줄로 우리 수집기가 임의 주소를 때리는 장치가 된다
//      (url-ref.ts 와 같은 SSRF 경계).
//
//   5. 목록에서 **행 앵커를 하나도 못 찾으면 `parseFailures`** 다. "새 글 0건"과
//      "선택자가 깨졌다"는 다른 사건이다(§7.1 사례 1). 행은 찾았는데 전부
//      걸러진 것은 실패가 아니다.
//
//   6. 실행당 요청은 러너의 `MAX_PAGES_PER_TARGET`(20) = 목록 1 + 글 최대 19 다.
//      `BOARD_QUEUE_MAX` 가 그 19 다.

/**
 * 실행 1회에 큐에 담을 글 수 상한.
 *
 * ⚠️ `MAX_PAGES_PER_TARGET - 1` 이다(목록 1페이지를 빼고 남는 몫). 러너를
 *    import 하면 순환이 되므로 숫자를 여기 두고, 두 값이 어긋나지 않는지는
 *    scripts/review-board-selftest.mjs 가 양쪽을 import 해 단정한다.
 */
export const BOARD_QUEUE_MAX = 19

/**
 * `board:<slug>` → slug. 규칙을 어기면 null(러너는 그 타깃을 조용히 넘긴다).
 *
 * slug 는 URL 에 그대로 박히므로 **영숫자·`_`·`-` 만** 받는다. 82cook 은 숫자
 * 게시판 번호(`board:15`)를, 클리앙·보배드림은 낱말 slug(`board:use`·`board:battle`)를
 * 쓴다. 점·슬래시·쿼리·공백을 하나라도 허용하면 경로 탈출과 파라미터 주입이 열린다.
 */
export function parseBoardRef(productRef: string): string | null {
  const raw = (productRef ?? '').trim()
  if (!/^board:/i.test(raw)) return null

  const slug = raw.slice(6)
  return /^[A-Za-z0-9_-]{1,40}$/.test(slug) ? slug : null
}

/**
 * 게시판 커서에 담는 것. `review_targets.cursor` 는 text 라 JSON 문자열로 넣는다.
 *
 * 왜 이 둘인가:
 *   · `q`    — 아직 안 읽은 글 경로 큐. 실행이 중간에 잘려도(타임아웃·일일 상한)
 *              다음 실행이 목록부터 다시 읽지 않고 남은 글을 이어서 읽는다.
 *   · `last` — 마지막으로 본 글 id. 다음 실행이 목록에서 **이보다 큰 id 만** 큐에
 *              담는다. 이게 증분의 본체다. 날짜는 사이트마다 연도가 없거나
 *              형식이 흔들려서 단독으로는 믿을 수 없다.
 */
export interface BoardCursor {
  q: string[]
  last: string | null
}

/**
 * 커서 문자열 → `BoardCursor`. **읽을 수 없으면 빈 상태**(처음부터)로 본다.
 *
 * ⚠️ 던지지 않는다. 사람이 대시보드에서 커서를 손으로 지우거나, `url:` 시절
 *    커서(페이지 번호 문자열)가 남아 있을 수 있다. 그때 빈 상태로 떨어지면
 *    목록 1페이지를 다시 읽을 뿐이고 중복 적재는 지문이 막는다. 던지면
 *    그 소스 실행 전체가 죽는다.
 */
export function decodeBoardCursor(cursor: string | null): BoardCursor {
  if (!cursor) return { q: [], last: null }
  try {
    const raw: unknown = JSON.parse(cursor)
    if (!raw || typeof raw !== 'object') return { q: [], last: null }
    const o = raw as { q?: unknown; last?: unknown }
    const q = Array.isArray(o.q) ? o.q.filter((v): v is string => typeof v === 'string') : []
    const last = typeof o.last === 'string' && o.last.length > 0 ? o.last : null
    return { q, last }
  } catch {
    return { q: [], last: null }
  }
}

/** `BoardCursor` → 커서 문자열. 키 순서를 고정한다(같은 상태가 같은 문자열이어야 diff 가 읽힌다). */
export function encodeBoardCursor(c: BoardCursor): string {
  return JSON.stringify({ q: c.q, last: c.last })
}

/**
 * 목록에서 뽑은 글 1건. 어댑터가 자기 마크업에서 이 모양으로 깎아 낸다.
 *
 * `path` 는 숫자 id 로 **조립한** 경로다(위 규약 4). `writtenAt` 은 확실할 때만
 * 채운다 — 추정하지 않는다(ParseContext.lastReviewAt 주석).
 */
export interface BoardListItem {
  id: string
  path: string
  writtenAt: string | null
}

/**
 * 목록 항목 → 다음 커서. 게시판 어댑터들이 공유한다.
 *
 * 규칙:
 *   · `last` 보다 크지 않은 id 는 버린다(이미 본 글 — 증분).
 *   · `lastReviewAt` 보다 오래된 글은 버린다(날짜를 읽은 경우만).
 *   · 최신순 입력을 전제로 앞에서 `BOARD_QUEUE_MAX` 개만 담는다.
 *   · 새 `last` 는 **이번에 본 목록의 최대 id** 다. 큐에 담은 것만이 아니다 —
 *     상한에 잘려 못 담은 글을 다음 실행이 다시 큐에 넣지 않게 하려면 그게 맞다.
 *     덜 받는 쪽이 같은 글을 영원히 다시 받는 쪽보다 낫다.
 */
export function nextBoardCursor(
  items: BoardListItem[],
  prev: BoardCursor,
  lastReviewAt?: string | null,
): BoardCursor {
  const newer = (id: string) => (prev.last === null ? true : compareBoardId(id, prev.last) > 0)
  const fresh = (at: string | null) => !(at && lastReviewAt && at < lastReviewAt)

  const q = items.filter((it) => newer(it.id) && fresh(it.writtenAt)).slice(0, BOARD_QUEUE_MAX)

  let last = prev.last
  for (const it of items) if (last === null || compareBoardId(it.id, last) > 0) last = it.id

  return { q: q.map((it) => it.path), last }
}

/**
 * 글 id 비교. 둘 다 숫자면 수치로, 아니면 문자열로 비교한다.
 *
 * ⚠️ 숫자 id 를 문자열로 비교하면 `'9' > '10'` 이 되어 새 글이 "이미 본 글"로
 *    걸러진다. 지금 세 사이트는 전부 숫자 id 다. 문자 id 게시판이 오면 문자열
 *    비교로 폴백한다(그쪽은 순서 보장이 없으니 중복 지문이 받는다).
 */
export function compareBoardId(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return a.length === b.length ? (a < b ? -1 : a > b ? 1 : 0) : a.length - b.length
  }
  return a < b ? -1 : a > b ? 1 : 0
}
