// 벨로그(velog.io) 글 본문·댓글 + 태그 게시판 순회 어댑터.
//
// 실측 근거: docs/review-source-findings-round5-b.md
//   "벨로그 — 본문은 원문 마크다운으로 온다 (2026-09-18)"
// 이 파일의 구현 실측은 2026-09-18 에 글 3건을 직접 받아서 냈고,
// **게시판 모드·댓글 확장은 2026-09-24 에 3요청으로 다시 쟀다**(호스트당 3회 상한).
//   ① velog.io/policy/terms        — 약관 재확인 (아래 ⚠️ 약관 블록)
//   ② velog.io/tags/생산성          — 목록 페이지 구조 (App Router RSC)
//   ③ velog.io/@papapat/…micuq9o1  — 글 페이지가 아직 Apollo 인지 확인
//
// ⚠️ **한 사이트 안에 렌더 방식이 두 개다. 하나로 뭉치지 마라(2026-09-24 실측).**
//      글 페이지 `/@핸들/슬러그`  → `window.__APOLLO_STATE__` (예전 그대로)
//      목록 페이지 `/tags/<태그>` → **App Router RSC 플라이트**
//                                  (`self.__next_f.push([1,"…"])`, Apollo 블롭 없음)
//    ③ 을 그 확인에 쓴 이유가 이것이다 — ② 가 RSC 로 바뀐 것을 보고 "글 페이지도
//    같이 바뀌었겠지"로 추정했으면 기존 타깃 11개가 조용히 깨진 채로 갔다.
//    추정하지 않고 한 요청을 더 썼다(§7.1 — 부품 테스트를 통합의 근거로 쓰지 않는다).
//
// ⚠️ **채택 근거는 robots 가 아니라 약관이다. 이 구분을 지워서는 안 된다.**
//    robots.txt 는 200 이지만 57바이트에 내용이 이게 전부다:
//        # https://www.robotstxt.org/robotstxt.html
//        User-agent: *
//    `*` 그룹은 있는데 **규칙이 0개**다 → 리포 파서 판정은
//    `allowed=true (일치하는 규칙 없음)`. 그건 "금지하지 않았다"일 뿐이고
//    **초대가 아니다.** 실제 판정은 이용약관이 갈랐다:
//    `velog.io/policy/terms` 평문 4,193자(제1조~제12조 + 부칙 2018.8.25)를
//    전문 확인했고 크롤·로봇·자동화·스크래핑·마이닝·수집·복제 **전부 0건**,
//    준거법은 대한민국법이다.
//
//    **2026-09-24 재확인(요청 1회).** 같은 URL, HTTP 200, 평문 **4,193자로 동일**,
//    조 구성도 제1조~제12조 + 부칙(2018.8.25) 그대로다. 금지어 스캔도 다시 돌렸다 —
//    크롤 / 로봇 / robot / crawl / 자동 / 스크래핑 / 스크랩 / 마이닝 / 수집 / 복제 /
//    기계 / 봇 / API / 무단 **전부 0건**. 즉 게시판 순회를 새로 붙이는 이 변경에도
//    약관상 명시 금지는 없다. ⚠️ **"없음"이 "허가"는 아니다** — 위 robots 문단과
//    같은 구분이다. 그래서 목록 요청을 실행당 1회로, 간격을 5초 이상으로 묶는다.
//
// ⚠️ **본문 + 최상위 댓글을 수집한다(2026-09-24 확장). 대댓글은 수집하지 않는다.**
//    2026-09-18~23 까지 이 어댑터는 **본문 전용**이었다. 그 결정을 뒤집었으므로
//    왜 뒤집었는지를 그대로 남긴다 — "규칙이 바뀌었다"가 아니라 **마커를 잘못
//    골랐던 것**이다.
//
//      Apollo 는 댓글을 정규화해서 블롭 루트에 `Comment:<uuid>` 키로 **따로**
//      싣는다. 루트에는 `text`·`created_at`·`level`·`replies_count`·`deleted` 가
//      다 있다. 즉 **최상위 댓글은 정적으로 온다.** 대댓글(level>0)은 오지 않는다.
//
//    예전 판단의 근거는 `comments_count` 가 화해되지 않는다는 것이었다:
//      /@doondoony/mechanical-keyboards  comments_count 11 · 루트 Comment 6(전부
//                                        level 0) · replies_count 합 4 → 6+4=10 ≠ 11
//      /@velopert/veltrends-dev-review   comments_count  9 · 루트 6 · 합 3 → 9 ✔
//      /@taehyongi/velog-글-작성은-최고네요 comments_count  2 · 루트 1 · 합 1 → 2 ✔
//
//    ⇒ 그 관측은 맞다. **틀린 것은 마커 선택이다.** `comments_count` 는 대댓글과
//      삭제분까지 섞은 합계라 애초에 "이 페이지가 실어 준 수"가 아니다.
//      이 페이지가 실어 준 수는 `Post.comments` 의 **참조 배열 길이**다.
//      실측(위 1번 글): 참조 6개 → 루트에서 6개 전부 해소. **정확히 화해된다.**
//      그래서 마커를 `Post.comments.length` 로 바꾸고, 그 배열의 참조가 루트에서
//      풀리지 않은 수만 파싱 실패로 센다.
//
//    ⛔ `comments_count` 를 마커로 되돌리지 마라. 11−10=1 이 매 실행 가짜 실패로
//       찍히고, 그 1건은 우리가 못 읽은 게 아니라 **애초에 오지 않는 대댓글·삭제분**이다.
//    ⛔ 대댓글(level>0)을 세지도 마라. GraphQL POST 에만 있고 그건 러너의 GET
//       계약 밖이다(types.ts 의 ⛔). **대댓글 0건은 고장이 아니라 구조다.**
//    · `deleted: true` 인 댓글은 건너뛴다 — 참조는 풀렸으니 실패가 아니다.
//
// ⚠️ **`released_at` 은 UTC ISO(`…Z`)다. 브런치·OKKY 와 다르다.**
//    앞 10자를 그냥 쓰면 KST 날짜가 어긋난다. 실측 3건 중 2건이 실제로 어긋난다:
//      2019-06-16T15:23:43.864Z → KST 2019-06-17 (UTC 앞10자 2019-06-16 ✗)
//      2018-10-20T23:22:30.801Z → KST 2018-10-21 (UTC 앞10자 2018-10-20 ✗)
//      2022-10-23T14:40:32.306Z → KST 2022-10-23 (같음)
//    어긋나면 러너의 증분 종료(last_review_at 대조)가 하루씩 밀린다.
//    ⛔ 이 머신의 Git-Bash `date` 는 TZ 를 조용히 무시하고 UTC 로 떨어진다.
//       변환은 반드시 Node `Intl` 로 한다(scripts/notion-status-log.mjs 와 같은 꼴).
//
// ⚠️ **블롭에 `Post:` 키가 여러 개 온다. 아무 거나 집으면 남의 글이 적재된다.**
//    글 아래의 이전/다음 글(`linked_posts`)이 같은 블롭에 실린다(실측 3건 중
//    2건에서 Post 키가 3개였다). 그것들은 `body` 가 없지만, **슬러그 대조 없이
//    "body 있는 첫 Post"를 집는 습관은 위험하다** — 리다이렉트 한 번에 다른
//    글이 이 타깃의 project_id 로 들어간다(텀블벅에서 실제로 났던 사고,
//    SP-031). 그래서 `url_slug` 와 작성자 `username` 을 둘 다 대조한다.
//
// ⚠️ **공용 `parseUrlRef()` 를 쓰지 않는다.** 글 경로가 `/@핸들/슬러그` 라
//    그 함수의 FORBIDDEN(`@` — userinfo 차단)에 항상 걸린다. 공용 파일을
//    고치면 damoang·82cook·theqoo 까지 같이 뚫리므로, 브런치와 같은 방식으로
//    **더 좁은 화이트리스트**를 여기서 자체 검증한다.
//
// ⚠️ **`url:` 타깃은 1글=1요청이다.** 커서를 내지 않으므로 러너가 page 0 뒤에
//    곧바로 끝낸다. 종료는 MAX_PAGES_PER_TARGET(20) 안전판이 아니라 구조로
//    성립한다(CLAUDE.md §7.2 다나와 사건). `board:` 타깃은 그 반대로 커서를
//    계속 들고 간다 — 아래 게시판 블록.
//
// ─────────────────────────────────────────────────────────────────
// 게시판 모드 (`board:<slug>`) — 2026-09-24 추가
// ─────────────────────────────────────────────────────────────────
//
// 타깃 1개가 **목록 1페이지 → 안 읽은 글 큐 → 글마다 본문+댓글**을 돈다.
// `url:` 모드(사람이 글 하나를 등록)와 같은 파일에 있지만 경로가 완전히 갈린다.
//
// ⚠️ **규약·헬퍼는 전부 `types.ts` 의 공용 것을 쓴다.** 어댑터 로컬 사본을 두지
//    않는다 — 규약 6개와 `parseBoardRef`·`decodeBoardCursor`·`encodeBoardCursor`·
//    `nextBoardCursor`·`compareBoardId`·`BOARD_QUEUE_MAX` 가 그쪽 정본이다.
//    (초판은 이 파일에 사본을 뒀다. 공용 규약이 들어오면서 지웠다.)
//
// ⚠️ **slug 은 태그 원문이 아니라 내부 이름이다.** 공용 `parseBoardRef` 가 slug 을
//    `[A-Za-z0-9_-]` 로 묶는데(경로 탈출·파라미터 주입 차단) velog 태그는 한글이
//    흔하다(`생산성`). okky·clien 과 같은 방식으로 **표를 코드에 둔다**(`BOARDS`) —
//    목록 경로가 상수라 ref 에서 경로가 파생되지 않는다. 새 태그를 열려면 그 태그
//    목록을 **1회 실측해서 글의 성격을 세고** 표에 한 줄 더한다(추정 금지).
//
// ⚠️ **GraphQL(`/graphql`)을 쓰지 않는다.** 벨로그는 공개 GraphQL 로 목록을 내는
//    오픈소스 서비스이지만 그건 POST 이고, 러너의 유일한 네트워크 포트는
//    `fetchText(url)` = **GET** 이다(scripts/review-collect.mjs). 어댑터가 직접
//    fetch 하면 robots 판정·요청 간격·일일 상한이 전부 우회된다(types.ts 의 ⛔).
//    그래서 목록도 **HTML GET** 으로 받는다 — 2026-09-24 실측으로 `/tags/<태그>`
//    RSC 플라이트에 `data.posts[]` 가 통째로 들어 있음을 확인했다
//    (`url_slug`·`released_at`·`user.username` 전부 있다). **1페이지만 간다** —
//    다음 장은 무한 스크롤의 GraphQL POST 라 GET 계약 밖이다.
//
// ⚠️ **큐에 들어가는 경로는 원격 데이터다(공용 규약 4).** 목록 페이지가 주는
//    문자열로 URL 을 만들면 그게 곧 SSRF 경로다. 그래서 큐에 넣을 때도, 요청을
//    만들 때도 **같은 `parseRefParts()` 화이트리스트**를 통과시킨다. 통과하지
//    못한 항목은 조용히 버리지 않고 파싱 실패로 센다(§7.1).
//    ⚠️ 공용 규약은 "숫자 id 로 조립"이라고 적지만 **velog 에는 숫자 id 가 없다.**
//       href 를 쓰지 않는 것은 같다 — JSON 필드(`user.username`·`url_slug`)로
//       경로를 조립하고, `parseRefParts` 가 유일한 관문이 된다.
//
// ⚠️ **커서의 `last` 자리에 글 id 가 아니라 `released_at` 원본 ISO 를 넣는다.**
//    공용 `compareBoardId` 는 숫자면 수치로, 아니면 문자열로 비교한다. velog 의
//    글 id 는 **uuid 라 순서가 없어** 그대로 쓰면 증분이 조용히 틀린다. 같은
//    형식의 UTC ISO 는 문자열 비교가 곧 시각 비교이므로 그 자리에 시각을 넣어
//    문자열 폴백을 **의도적으로** 쓴다. 이 어댑터의 `last` 는 순서가 보장된다.
//
// ⚠️ 목록에 **연도가 있으므로** `ParseContext.lastReviewAt` 필터를 쓴다(공용
//    `nextBoardCursor` 가 `writtenAt` 으로 거른다). 보배드림 `09/23` 처럼 연도가
//    없는 목록에서 그걸 쓰면 1월에 한 해치를 건너뛴다 — 그 경고는 types.ts 에 있다.
//
// 실행당 요청 = 목록 1 + 새 글 최대 `BOARD_QUEUE_MAX`(19). 큐를 다 비우면
// `pauseRun` 으로 이번 실행만 끊고 **커서(`last`)는 남긴다** — 그래야 다음 실행이
// 목록 10건을 처음부터 다시 큐에 넣지 않는다. 타깃은 `incrementalOnly` 라 닫히지
// 않고, 닫는 것은 러너의 "연속 `MAX_CONSECUTIVE_EMPTY` 회 신규 0건" 안전장치뿐이다.

import {
  BOARD_QUEUE_MAX,
  decodeBoardCursor,
  encodeBoardCursor,
  nextBoardCursor,
  parseBoardRef,
  type BoardCursor,
  type BoardListItem,
  type ParseContext,
  type ParseResult,
  type ParsedReview,
  type ReviewSourceAdapter,
  type TargetState,
} from '../types.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://velog.io'

/**
 * 허용하는 경로는 글 하나뿐이다: `/@<핸들>/<슬러그>`.
 *
 * 슬러그에 **한글이 들어간다**(실측 `/@taehyongi/velog-글-작성은-최고네요`).
 * 사람이 브라우저에서 복사한 URL 은 `new URL().pathname` 을 거치며 퍼센트
 * 인코딩되므로(target-ref.ts 의 urlRefBuilder) 여기서는 **인코딩된 ASCII 만**
 * 받는다 — `%` 를 허용하는 대신 경로 전체를 앵커(`^`/`$`)로 묶는다.
 * 그래서 `..`·`//`·`\`·공백·쿼리·`/edit` 는 자동으로 탈락한다.
 *
 * ⚠️ **슬러그 상한이 2026-09-24 에 300 → 600 으로 올라갔다. 되돌리지 마라.**
 *    한글 1자 = 인코딩 9자라 300 은 한글 33자 남짓이다. 게시판 모드 실측에서
 *    목록 10건 중 1건이 그 상한에 걸려 탈락했다 — `노션-템플릿-공유-…-관리-템플릿`
 *    이 **인코딩 344자**다. 이건 `url:` 경로에도 이미 있던 구멍이다:
 *    사람이 그 글 URL 을 붙여넣으면 빌더가 "수집할 수 없는 주소"로 거절했고,
 *    왜 거절되는지 화면에 안 나왔다. 길이는 DoS 방어용 숫자일 뿐이고,
 *    문자 집합·앵커·세그먼트 재검사가 실제 방어선이라 올려도 넓어지지 않는다.
 *    (제목 그대로 슬러그를 만드는 velog 특성상 여유를 둔다 — 600 = 한글 66자.)
 */
const REF_RE = /^\/@[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9%_.~-]{1,600}$/

export interface RefParts {
  /** 요청에 쓰는 경로(인코딩된 그대로). */
  path: string
  /** `@` 를 뗀 핸들. 블롭의 `User.username` 과 대조한다. */
  username: string
  /** 퍼센트 디코딩한 슬러그. 블롭의 `Post.url_slug` 와 대조한다. */
  slug: string
}

/** `url:/@a/b` → 경로·핸들·슬러그. 규칙 위반이면 null. */
export function parseRefParts(productRef: string): RefParts | null {
  const raw = (productRef ?? '').trim()
  if (!/^url:/i.test(raw)) return null
  const p = raw.slice(4)
  if (!REF_RE.test(p)) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(p)
  } catch {
    return null // 깨진 퍼센트 시퀀스
  }
  // ⚠️ 디코딩 **후**에도 경로가 두 세그먼트여야 한다. `%2f`·`%2e%2e` 로
  //    세그먼트를 늘리거나 상위로 올라가는 걸 막는다.
  if (decoded.includes('..') || /[\s\\]/.test(decoded)) return null
  const seg = decoded.split('/')
  if (seg.length !== 3 || seg[0] !== '' || !seg[1].startsWith('@')) return null

  const username = seg[1].slice(1)
  if (!username || !seg[2]) return null
  return { path: p, username, slug: seg[2] }
}

/** 하위 호환용 — 다른 어댑터들과 같은 이름으로 경로만 준다(target-ref 가 쓴다). */
export function parseProductRef(productRef: string): string | null {
  return parseRefParts(productRef)?.path ?? null
}

// ── 게시판 순회: 태그 표 ──────────────────────────────────────────
//
// ⚠️ **slug 검증은 공용 `parseBoardRef`(types.ts) 한 벌만 쓴다.** 어댑터 로컬
//    사본을 두지 않는다 — 두 벌이 갈리면 저장은 되고 파싱은 안 되는 타깃이
//    조용히 생긴다(target-ref.ts 머리말).
//
// ⚠️ **slug 은 태그 원문이 아니라 내부 이름이다.** 공용 규약이 slug 을
//    `[A-Za-z0-9_-]` 로 묶는데(경로 탈출·파라미터 주입 차단) velog 태그는 한글이
//    흔하다(`생산성`). 그래서 okky·clien 과 같은 방식으로 **표를 코드에 둔다** —
//    목록 경로가 상수라 ref 에서 경로가 파생되지 않는다(SSRF 경계가 구조로 닫힌다).
export const BOARDS: Record<string, { list: string; tag: string }> = {
  // 2026-09-24 실측(`GET /tags/생산성`): 목록 1페이지 = 글 10건, 그중 8건이
  // SaaS·AI 도구 사용 후기였다. 등록 SQL 의 근거와 같은 측정이다.
  productivity: { list: '/tags/%EC%83%9D%EC%82%B0%EC%84%B1', tag: '생산성' },
}

/** 이 어댑터가 순회할 수 있는 게시판인가. 표에 없는 slug 은 받지 않는다. */
export function boardList(productRef: string): string | null {
  const slug = parseBoardRef(productRef)
  return slug && slug in BOARDS ? BOARDS[slug].list : null
}

/** UTC ISO 판별. 같은 형식끼리는 문자열 비교가 곧 시각 비교다. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

/** 하이드레이션 블롭의 시작 지점. `window.__APOLLO_STATE__={…}` (등호 주변 공백 없음 — 실측) */
const STATE_MARK = 'window.__APOLLO_STATE__'

/**
 * `{`(또는 `[`) 부터 짝이 맞는 닫는 괄호까지 잘라낸다.
 *
 * 비탐욕 정규식으로 자르면 첫 `}` 에서 끊겨 **항상** 파싱에 실패한다.
 * 문자열 안의 괄호·이스케이프를 건너뛰어야 해서 직접 센다.
 *
 * ⚠️ 2026-09-24 에 `[` 도 세도록 넓혔다. 게시판 목록의 `"posts":[…]` 를 같은
 *    방식으로 잘라야 하는데, `{` 만 세면 배열 안의 객체 개수만큼 깊이가 0 으로
 *    떨어져 **첫 글 하나만 읽고 끝난다.** 중괄호·대괄호를 같은 깊이로 센다.
 *
 * ⚠️ tumblbug.ts 에 비슷한 함수가 있다. 공용으로 빼지 않은 것은 의도다 —
 *    이 트랙은 "한 사이트가 구조를 바꾸면 파서 파일 하나와 픽스처만 갈아끼운다"
 *    를 위해 어댑터를 서로 독립으로 둔다(types.ts 머리말). 9개 어댑터가
 *    decodeEntities 를 각자 들고 있는 것도 같은 이유다.
 */
function sliceJson(s: string, from: number): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return s.slice(from, i + 1)
    }
  }
  return null
}

/**
 * App Router 의 RSC 플라이트 조각들을 이어 붙인다.
 *
 * 목록 페이지는 `self.__next_f.push([1,"<JS 문자열 리터럴>"])` 를 여러 번 부르고,
 * **JSON 이 그 리터럴 경계에서 잘려 있다.** 조각 하나만 보면 `"posts":[` 가
 * 중간에서 끊긴 채로 나온다. 그래서 전부 이어 붙인 뒤에 파싱한다.
 *
 * 각 조각은 JS 문자열 리터럴이므로 `JSON.parse` 로 언이스케이프한다
 * (`\"` · `\n` · `>` 가 실제로 들어 있다 — 직접 치환하지 않는다).
 */
function readFlight(body: string): string {
  let out = ''
  for (const m of body.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      out += JSON.parse(m[1]) as string
    } catch {
      // 조각 하나가 깨져도 나머지를 버리지 않는다. 진짜로 못 읽었으면
      // 아래 readBoardList 가 `"posts":[` 를 못 찾아 실패로 보고한다.
    }
  }
  return out
}

/**
 * 목록 페이지 → 공용 `BoardListItem[]`. `null` 이면 **컨테이너가 없다**(구조 변경).
 *
 * ⚠️ `null`(못 읽음)과 `{items:[]}`(글이 0건인 태그)를 가른다. 합치면 태그가
 *    비어 있는 것과 목록 구조가 바뀐 것이 똑같이 보인다(§7.1).
 *
 * `unreadable` = 항목은 보이는데 경로·날짜를 못 만든 수. 조용히 버리지 않는다.
 *
 * ⚠️ **`id` 에 `released_at` 원본 ISO 를 넣는다.** 공용 규약은 "마지막으로 본 글
 *    id"를 쓰고 `compareBoardId` 가 숫자면 수치로, 아니면 문자열로 비교한다.
 *    velog 의 글 id 는 **uuid 라 순서가 없어** 그대로 쓰면 증분이 틀린다.
 *    같은 형식의 UTC ISO 는 문자열 비교가 곧 시각 비교이므로, 그 자리에 시각을
 *    넣어 문자열 폴백을 **의도적으로** 쓴다(`compareBoardId` 주석의 "문자 id
 *    게시판"에 해당하지만, 이쪽은 순서가 보장된다).
 *
 * ⚠️ `writtenAt` 은 KST 날짜로 채운다. velog 목록에는 **연도가 있으므로**
 *    `ParseContext.lastReviewAt` 필터를 써도 안전하다(보배드림 `09/23` 같은
 *    연도 없는 목록에 그 필터를 쓰면 1월에 한 해치를 건너뛴다 — types.ts 경고).
 */
export function readBoardList(body: string): { items: BoardListItem[]; unreadable: number } | null {
  const flight = readFlight(body)
  const at = flight.indexOf('"posts":[')
  if (at < 0) return null

  const from = flight.indexOf('[', at)
  const raw = from < 0 ? null : sliceJson(flight, from)
  if (!raw) return null

  let list: unknown
  try {
    list = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null

  const items: BoardListItem[] = []
  let unreadable = 0
  for (const node of list) {
    if (!node || typeof node !== 'object') {
      unreadable++
      continue
    }
    const n = node as Record<string, unknown>
    const slug = typeof n.url_slug === 'string' ? n.url_slug : ''
    const user = n.user as Record<string, unknown> | undefined
    const username = user && typeof user.username === 'string' ? user.username : ''
    const releasedAt = typeof n.released_at === 'string' && ISO_RE.test(n.released_at) ? n.released_at : ''
    if (!slug || !username || !releasedAt) {
      unreadable++
      continue
    }

    // ⛔ 여기가 SSRF 경계다(공용 규약 4). href 를 쓰지 않는다 — JSON 필드
    //    (`user.username`·`url_slug`)로 경로를 **조립**하고, 만든 경로를 **글 ref 와
    //    똑같은 화이트리스트**에 통과시킨다. `encodeURIComponent` 가 `/`·`?`·공백을
    //    인코딩하므로 그런 값이 섞여 오면 최종 판정에서 탈락한다.
    //    (velog 는 숫자 id 가 없어 "숫자 id 로 조립"을 못 한다. 대신 경로 후보를
    //     만든 뒤 parseRefParts 가 유일한 관문이 된다 — 규칙을 두 벌 두지 않는다.)
    const path = `/@${username}/${encodeURIComponent(slug)}`
    if (!parseRefParts(`url:${path}`)) {
      unreadable++
      continue
    }
    items.push({ id: releasedAt, path, writtenAt: kstDate(releasedAt) })
  }
  return { items, unreadable }
}

function readState(body: string): Record<string, unknown> | null {
  const i = body.indexOf(STATE_MARK)
  if (i < 0) return null
  const start = body.indexOf('{', i + STATE_MARK.length)
  if (start < 0) return null
  const raw = sliceJson(body, start)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * UTC ISO → KST 날짜(`YYYY-MM-DD`).
 *
 * ⚠️ `iso.slice(0, 10)` 을 쓰면 안 된다. 실측 3건 중 2건이 하루 어긋난다
 *    (파일 머리 참조). 형식을 추정하지 않고 Intl 로 실제 변환한다.
 */
export function kstDate(iso: unknown): string | null {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(iso)) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // 로케일 표기 차이에 기대지 않는다 — 부품을 직접 꺼내 조립한다.
  const part = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${part.year}-${part.month}-${part.day}`
}

interface VelogPost {
  key: string
  slug: string
  username: string | null
  title: string
  body: string
  releasedAt: unknown
  /**
   * `Post.comments` 의 정규화 참조 키들(`Comment:<uuid>`).
   *
   * ⚠️ **이 배열 길이가 댓글 개수 마커다.** `comments_count` 가 아니다
   *    (파일 머리 ⚠️ 댓글 블록 — 그쪽은 대댓글·삭제분까지 합친 값이라 화해되지 않는다).
   */
  commentRefs: string[]
}

/** 블롭에서 **본문을 가진** Post 항목을 전부 꺼낸다(보통 1건). */
function readPosts(state: Record<string, unknown>): VelogPost[] {
  const out: VelogPost[] = []
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith('Post:')) continue
    if (!value || typeof value !== 'object') continue
    const n = value as Record<string, unknown>
    // `body` 키가 아예 없는 Post 는 linked_posts(이전/다음 글)다 — 후보가 아니다.
    if (!('body' in n)) continue

    // 작성자는 `{ type:'id', id:'User:<uuid>' }` 참조로 온다. 정규화 캐시에서 되짚는다.
    let username: string | null = null
    const ref = n.user as Record<string, unknown> | undefined
    if (ref && typeof ref.id === 'string') {
      const user = state[ref.id] as Record<string, unknown> | undefined
      if (user && typeof user.username === 'string') username = user.username
    }

    const commentRefs = Array.isArray(n.comments)
      ? n.comments
          .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>).id : null))
          .filter((id): id is string => typeof id === 'string' && id.startsWith('Comment:'))
      : []

    out.push({
      key,
      slug: typeof n.url_slug === 'string' ? n.url_slug : '',
      username,
      title: typeof n.title === 'string' ? n.title : '',
      body: typeof n.body === 'string' ? n.body : '',
      releasedAt: n.released_at,
      commentRefs,
    })
  }
  return out
}

export interface VelogComment {
  /** 블롭 키에서 `Comment:` 를 뗀 uuid. */
  id: string
  text: string
  createdAt: unknown
}

/**
 * 글의 최상위 댓글. 마커는 `post.commentRefs.length` 다.
 *
 * `unresolved` = 참조는 있는데 루트에서 풀리지 않은 수 = **보이는데 못 읽은 수**.
 * 이게 0 이 아니면 Apollo 가 댓글을 다른 키로 싣기 시작한 것이다(구조 변경).
 *
 * ⚠️ `deleted: true` 는 건너뛰되 실패로 세지 않는다. 참조가 풀렸으니 우리가
 *    못 읽은 게 아니다 — 저장할 본문이 없을 뿐이다.
 */
export function readComments(
  state: Record<string, unknown>,
  post: VelogPost,
): { comments: VelogComment[]; unresolved: number } {
  const comments: VelogComment[] = []
  let unresolved = 0

  for (const ref of post.commentRefs) {
    const node = state[ref]
    if (!node || typeof node !== 'object') {
      unresolved++
      continue
    }
    const n = node as Record<string, unknown>
    if (n.deleted === true) continue
    const text = typeof n.text === 'string' ? n.text.trim() : ''
    if (!text) {
      // 참조는 풀렸는데 본문 필드가 없다 = 필드명이 바뀐 것이다. 조용히 넘기면
      // "댓글 0건"으로 몇 주가 간다(§7.1 사례 1).
      unresolved++
      continue
    }
    comments.push({ id: ref.slice('Comment:'.length), text, createdAt: n.created_at })
  }

  return { comments, unresolved }
}

/**
 * 글 페이지 1장 → 본문 1건 + 최상위 댓글 N건.
 *
 * `url:` 모드와 게시판 모드가 **이 함수 하나**를 공유한다. 두 벌로 두면 한쪽만
 * 고치는 순간 같은 글이 모드에 따라 다르게 적재된다.
 */
function parsePostPage(body: string, parts: RefParts): Omit<ParseResult, 'nextCursor'> {
  const state = readState(body)
  if (!state) {
    // 블롭이 통째로 없다(SPA 껍데기·마커 이름 변경). 렌더 텍스트로 대충
    // 때워서 "정상 수집"을 만들지 않는다(CLAUDE.md §7.1 사례 1).
    return { reviews: [], parseFailures: 1, filtered: 0 }
  }

  const posts = readPosts(state)
  const mine = posts.filter((x) => x.slug === parts.slug && (x.username === null || x.username === parts.username))
  // 본문을 가진 남의 글. 필드는 멀쩡히 읽혔고 이 타깃과 무관할 뿐이라
  // 실패가 아니라 filtered 다(tumblbug 과 같은 용법).
  const filtered = posts.length - mine.length

  if (mine.length === 0) {
    // 이 URL 을 직접 요청했는데 그 글이 블롭에 없다 = 구조가 바뀌었거나
    // 다른 글이 왔다. 0건으로 조용히 지나가면 "빈 글"과 구분이 안 된다.
    return { reviews: [], parseFailures: 1, filtered }
  }

  const post = mine[0]
  // ponytail: body 는 **렌더 결과가 아니라 원문 마크다운**이라 브런치의
  //   5,000자 절단 같은 천장이 없다(실측 최대 17,836자, 말미 절단 없음).
  //   마크다운 기호를 벗기지 않는다 — 분석 파이프라인이 텍스트를 그대로
  //   받고, 벗기다가 코드블록 안의 VOC 를 같이 날리는 게 더 비싸다.
  const text = [post.title, post.body].filter(Boolean).join('\n\n').trim()
  if (!text) {
    // Post 는 찾았는데 제목·본문이 둘 다 비었다 = 필드명이 바뀐 것이다.
    return { reviews: [], parseFailures: 1, filtered }
  }

  const reviews: ParsedReview[] = [
    {
      externalId: parts.path,
      text,
      rating: null,
      seller: null,
      authorMasked: null,
      // ⚠️ UTC → KST 변환. 앞 10자를 쓰면 하루 어긋난다(파일 머리 실측).
      writtenAt: kstDate(post.releasedAt),
      storyId: null,
    },
  ]

  // ── 최상위 댓글 (2026-09-24 확장) ────────────────────────────────
  const { comments, unresolved } = readComments(state, post)
  for (const c of comments) {
    reviews.push({
      // 지문 1순위. 댓글 uuid 가 있으니 폴백 조합을 쓰지 않는다.
      externalId: `${parts.path}#${c.id}`,
      text: c.text,
      rating: null,
      seller: null,
      authorMasked: null,
      writtenAt: kstDate(c.createdAt),
      // 이 댓글이 달린 글. HN 과 같은 용법 — 나중에 글 단위 신호를 붙일 때 쓴다.
      storyId: parts.path,
    })
  }

  return { reviews, parseFailures: unresolved, filtered }
}

export const velogAdapter: ReviewSourceAdapter = {
  key: 'velog',
  displayName: '벨로그 글 본문·댓글',

  // 남헌 2026-09-23 Q3(a): 이 소스의 타깃은 페이지 상한에 닿아도 닫지 않는다.
  //
  // ⚠️ **types.ts 의 incrementalOnly 주석이 "커뮤니티 url: 에는 켜지 마라"고 적어 둔
  //    바로 그 자리다.** 그 경고는 유효하고, 남헌이 그걸 알고 뒤집었다. 전제가 바뀐 게 아니다 —
  //    대가(같은 글을 매일 1요청씩 다시 읽는다)를 받아들인 것이다. 근거:
  //    커뮤니티 타깃 85개 중 80개가 "성과 없어서"가 아니라 "끝까지 읽어서" 닫혔고,
  //    되살리는 코드가 리포에 없어 그 질의는 영영 다시 안 돌았다
  //    (reports/2026-09-23/voc-expansion-investigation.md §3).
  //
  // ⚠️ 2026-09-24 부터 이 어댑터는 **본문 + 최상위 댓글**을 받는다(파일 머리 댓글 블록).
  //    그래서 같은 글을 다시 읽는 것이 무의미하지 않다 — 새 댓글이 달리면 받는다.
  //    `board:` 타깃은 새 글까지 받으므로 더더욱 닫아서는 안 된다.
  //
  // 비용: `url:` 타깃은 1글 = 1요청. `board:` 타깃은 실행당 목록 1 + 새 글 최대
  // `BOARD_QUEUE_MAX`(19). 새 글이 없으면 목록 1요청으로 끝난다(`pauseRun`).
  // 닫는 것은 러너의 **연속 `MAX_CONSECUTIVE_EMPTY` 회 신규 0건** 안전장치뿐이고,
  // 되살리는 것은 사람 몫이다(`listDueTargets` 는 active 만 본다).
  incrementalOnly: true,

  nextRequest(target: TargetState): { url: string } | null {
    // ── board: 모드 — 목록 1페이지 ↔ 큐에 든 글 1개를 번갈아 낸다(공용 규약 1) ──
    const list = boardList(target.productRef)
    if (list) {
      const cur = decodeBoardCursor(target.cursor)
      // ⚠️ **목록은 1페이지만 간다.** velog 목록은 무한 스크롤이고 다음 장은
      //    GraphQL POST 다 — 러너의 GET 계약 밖이다(파일 머리 ⚠️).
      if (cur.q.length === 0) return { url: `${HOST}${list}` }
      const p = boardPostPath(cur.q[0])
      return p ? { url: `${HOST}${p}` } : null
    }

    const parts = parseRefParts(target.productRef)
    if (!parts) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${parts.path}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    if (boardList(ctx.productRef)) {
      const cur = decodeBoardCursor(ctx.cursor)
      // 큐가 있으면 이 응답은 **큐 맨 앞 글**이다. 본문을 보고 추측하지 않는다(공용 규약 2).
      if (cur.q.length > 0) {
        const rest: BoardCursor = { q: cur.q.slice(1), last: cur.last }
        const parts = parseQueuedRef(cur.q[0])
        const res = parts
          ? parsePostPage(body, parts)
          : // 큐 값이 화이트리스트를 통과하지 못한다 = 커서가 손상됐다. 스코프를
            // 모르는 채로 적재하지 않는다 — 남의 글이 이 타깃의 project_id 로 들어간다(SP-031).
            { reviews: [], parseFailures: 1, filtered: 0 }
        return { ...res, nextCursor: encodeBoardCursor(rest), pauseRun: rest.q.length === 0 }
      }
      return parseBoardListPage(body, cur, ctx.lastReviewAt)
    }

    const parts = parseRefParts(ctx.productRef)
    if (!parts) {
      // nextRequest 가 같은 검사를 하므로 실행 경로에서는 안 온다. 그래도
      // 스코프를 모르는 채로 받지는 않는다 — 그러면 남의 글을 이 타깃의
      // project_id 로 적재한다. 조용한 0건은 만들지 않는다(§7.1).
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered: 0 }
    }

    // 1글=1요청. 커서를 내지 않으므로 러너가 여기서 이 타깃을 끝낸다.
    return { ...parsePostPage(body, parts), nextCursor: null }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

/**
 * 큐에 든 경로를 **다시 검증**한다. 큐는 남의 서버가 준 목록에서 나왔고,
 * 그 뒤 DB(`review_targets.cursor`)를 거쳐 돌아온다 — 사람이 손댈 수 있는 값이다.
 * 담을 때 검증했어도 쓸 때 한 번 더 본다(공용 규약 4 · url-ref.ts 와 같은 이유).
 */
function parseQueuedRef(queued: string): RefParts | null {
  return parseRefParts(`url:${queued}`)
}

function boardPostPath(queued: string): string | null {
  return parseQueuedRef(queued)?.path ?? null
}

/**
 * 목록 1페이지 → 커서(새 글 큐). 리뷰는 내지 않는다(공용 규약 3).
 *
 * ⚠️ 항목이 0개인 것과 **컨테이너가 없는 것**을 가른다(공용 규약 5 · §7.1 사례 1).
 *    RSC 플라이트에서 `"posts":[` 를 못 찾으면 velog 가 목록 렌더를 바꾼 것이고,
 *    배열은 있는데 항목이 0개면 그 태그에 글이 없는 것이다 — 다른 사건이다.
 *    ⚠️ 그런데 **`생산성` 태그가 글 0건이 되는 일은 사실상 없다**(실측 10건).
 *       그래서 0개도 실패로 센다 — 후자를 정상으로 열어 두면 셀렉터가 아니라
 *       "플라이트 조각 경계"가 바뀐 날 조용히 0건이 된다.
 */
function parseBoardListPage(
  body: string,
  prev: BoardCursor,
  lastReviewAt: string | null | undefined,
): ParseResult {
  const got = readBoardList(body)
  if (!got) {
    // 커서를 **버리지 않는다.** `last` 를 지우면 다음 실행이 목록 전체를 다시
    // 큐에 넣는다. 이번 실행만 여기서 끝낸다(pauseRun).
    return { reviews: [], nextCursor: encodeBoardCursor(prev), parseFailures: 1, pauseRun: true, filtered: 0 }
  }

  const next = nextBoardCursor(got.items, prev, lastReviewAt)
  return {
    reviews: [],
    nextCursor: encodeBoardCursor(next),
    parseFailures: got.items.length === 0 ? got.unreadable + 1 : got.unreadable,
    // 새 글이 0건이면 이번 실행은 여기서 끝이다. `last` 는 커서에 남는다.
    pauseRun: next.q.length === 0,
    filtered: 0,
  }
}

export const __internal = { sliceJson, readState, readPosts, readFlight, REF_RE }
