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
//    곧바로 닫는다. 종료는 MAX_PAGES_PER_TARGET(20) 안전판이 아니라 구조로
//    성립한다(CLAUDE.md §7.2 다나와 사건).
//
// ─────────────────────────────────────────────────────────────────
// 게시판 모드 (`board:tag:<태그>`) — 2026-09-24 추가
// ─────────────────────────────────────────────────────────────────
//
// 타깃 1개가 **목록 1페이지 → 안 읽은 글 큐 → 글마다 본문+댓글**을 돈다.
// `url:` 모드(사람이 글 하나를 등록)와 같은 파일에 있지만 경로가 완전히 갈린다.
//
// ⚠️ **GraphQL(`/graphql`)을 쓰지 않는다.** 벨로그는 공개 GraphQL 로 목록을 내는
//    오픈소스 서비스이지만 그건 POST 이고, 러너의 유일한 네트워크 포트는
//    `fetchText(url)` = **GET** 이다(scripts/review-collect.mjs). 어댑터가 직접
//    fetch 하면 robots 판정·요청 간격·일일 상한이 전부 우회된다(types.ts 의 ⛔).
//    그래서 목록도 **HTML GET** 으로 받는다 — 2026-09-24 실측으로 `/tags/<태그>`
//    RSC 플라이트에 `data.posts[]` 가 통째로 들어 있음을 확인했다
//    (`id`·`title`·`url_slug`·`released_at`·`user.username` 전부 있다).
//
// ⚠️ **큐에 들어가는 경로는 원격 데이터다. 그대로 요청하지 않는다.**
//    목록 페이지가 주는 문자열로 URL 을 만들면 그게 곧 SSRF 경로다. 그래서
//    큐에 넣기 전에도, 요청을 만들 때도 **같은 `parseRefParts()` 화이트리스트**를
//    통과시킨다. 통과하지 못한 항목은 조용히 버리지 않고 파싱 실패로 센다(§7.1).
//
// 커서 규약(JSON 1줄) — `{"q":["<글 경로>",…],"last":"<가장 최근 released_at ISO>"}`
//   · `q`    = 아직 안 읽은 글 경로 큐. 목록 순서(최신순) 그대로다.
//   · `last` = 지금까지 목록에서 본 **가장 최근 released_at 원본 ISO**.
//              "마지막 글 id"를 쓰지 않는 이유: velog 의 글 id 는 uuid 라 순서가
//              없다. 같은 형식의 UTC ISO 는 문자열 비교가 곧 시각 비교다.
//   · 페이지 0 = 목록, 1~19 = 글. 러너의 MAX_PAGES_PER_TARGET(20)에 그대로 맞는다
//     — 실행당 목록 1 + 글 최대 19.
//
// ⛔ **러너 변경 2건이 필요하다(에이전트 X 소유). 그게 없으면 이 모드는 못 돈다.**
//    1. `nextRequest(target, page)` · `ParseContext.page` — 지금 러너는 페이지
//       번호를 어댑터에 넘기지 않는다. 그래서 "실행 시작(목록을 받아야 한다)"과
//       "큐를 다 비웠다(이번 실행 끝)"를 **커서만으로는 구분할 수 없다.**
//       (둘 다 `q` 가 비어 있다.)
//    2. `runner.ts` 의 `if (!req)` 분기가 `status = 'exhausted'` 를 literal 로
//       박는다. `cursor === null` 분기는 `endStatus` 를 쓰는데 이 분기는 안 쓴다.
//       게시판 타깃은 커서를 계속 들고 있으므로 **항상 이 분기로 끝난다** →
//       `incrementalOnly` 가 무력화돼 첫 실행에서 닫히고 다시 안 돈다.
//       `status = endStatus` 로 바꿔야 한다.
//    ⇒ 그때까지 이 파일은 `page` 가 없으면 **커서 null = 목록** 폴백으로 돈다.
//      그 폴백은 "한 번 돌고 닫힌다"로 안전하게 끝난다 — 목록을 20번 다시 받는
//      폭주는 어떤 경우에도 만들지 않는다. 그래서 타깃 등록 SQL 은 **미적용**이다
//      (supabase/migrations/20260930000010_board_targets_z.sql).

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'

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

// ── 게시판 ref ────────────────────────────────────────────────────

export interface BoardRef {
  /** 퍼센트 인코딩된 태그 토큰. 저장·요청에 쓰는 형태다. */
  token: string
  /** 디코딩한 태그(사람이 읽는 값). */
  tag: string
  /** 목록 요청 경로. */
  path: string
}

/**
 * `board:tag:<퍼센트 인코딩된 태그>` → 목록 경로.
 *
 * ⚠️ **이 함수는 어댑터 로컬이다. 에이전트 X 의 공용 `parseBoardRef` 가 머지되면
 *    그걸로 교체한다**(그때 `board:` 문법·검증은 한 벌만 남긴다). 지금 공용으로
 *    빼지 않는 이유는 X 가 아직 그 규약을 안 넣었고, 두 벌이 갈리면 저장은 되고
 *    파싱은 안 되는 타깃이 조용히 생기기 때문이다(target-ref.ts 머리말).
 *
 * 태그는 한글이 흔하다(`생산성`). `url:` 슬러그와 같은 이유로 **인코딩된 ASCII
 * 만** 받고, 경로를 앵커로 묶어 `/`·`..`·공백·쿼리를 전부 탈락시킨다.
 */
export function parseBoardRef(productRef: string): BoardRef | null {
  const raw = (productRef ?? '').trim()
  const m = /^board:tag:([A-Za-z0-9%_.~-]{1,120})$/i.exec(raw)
  if (!m) return null
  const token = m[1]

  let tag: string
  try {
    tag = decodeURIComponent(token)
  } catch {
    return null // 깨진 퍼센트 시퀀스
  }
  // 디코딩 후에도 세그먼트를 늘리거나 상위로 올라가지 못한다(%2f·%2e%2e 차단).
  if (!tag || tag.includes('/') || tag.includes('..') || /[\s\\?#]/.test(tag)) return null

  return { token, tag, path: `/tags/${token}` }
}

/** 게시판 커서. `q` = 안 읽은 글 경로 큐, `last` = 본 것 중 가장 최근 released_at. */
export interface BoardCursor {
  q: string[]
  last: string | null
}

const EMPTY_CURSOR: BoardCursor = { q: [], last: null }

/** UTC ISO 판별. 같은 형식끼리는 문자열 비교가 곧 시각 비교다. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

/**
 * 커서 문자열 → 큐. **깨진 커서를 빈 커서로 조용히 바꾸지 않는다** —
 * 그러면 `last` 가 리셋돼 목록 전체를 매일 다시 큐에 넣는다. 읽을 수 있는
 * 부분만 쓰고, 읽지 못했으면 빈 커서를 돌려주되 호출부가 그걸 "첫 실행"과
 * 같게 다룬다(그 경우 지문 대조가 중복 적재를 막는다).
 */
export function readBoardCursor(cursor: string | null): BoardCursor {
  if (!cursor) return EMPTY_CURSOR
  let doc: unknown
  try {
    doc = JSON.parse(cursor)
  } catch {
    return EMPTY_CURSOR
  }
  if (!doc || typeof doc !== 'object') return EMPTY_CURSOR
  const n = doc as Record<string, unknown>
  const q = Array.isArray(n.q) ? n.q.filter((x): x is string => typeof x === 'string') : []
  const last = typeof n.last === 'string' && ISO_RE.test(n.last) ? n.last : null
  return { q, last }
}

function writeBoardCursor(c: BoardCursor): string {
  return JSON.stringify({ q: c.q, last: c.last })
}

/**
 * 이번 요청이 **목록 페이지**인가.
 *
 * ⚠️ `page` 가 있으면 그것만 본다(0 = 목록). 없으면 커서 null 로 폴백한다 —
 *    지금 러너가 페이지 번호를 안 넘겨서다(파일 머리 ⛔ 1번). 폴백은 "한 번
 *    돌고 끝"으로 안전하게 수렴한다: 큐가 비면 요청을 만들지 않으므로
 *    목록을 20번 다시 받는 폭주가 구조적으로 불가능하다.
 */
function isListPage(cursor: string | null, page: number | undefined): boolean {
  return typeof page === 'number' ? page === 0 : cursor === null
}

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

export interface BoardListItem {
  /** 인코딩된 글 경로(`/@핸들/슬러그`). 화이트리스트를 통과한 것만 담긴다. */
  path: string
  /** 원본 released_at(UTC ISO). 커서의 `last` 와 비교하는 값이다. */
  releasedAt: string
}

/**
 * 목록 페이지 → 글 항목들. `null` 이면 **컨테이너가 없다**(구조 변경).
 *
 * ⚠️ `null`(못 읽음)과 `{items:[]}`(글이 0건인 태그)를 가른다. 합치면 태그가
 *    비어 있는 것과 목록 구조가 바뀐 것이 똑같이 보인다(§7.1).
 *
 * `unreadable` = 항목은 보이는데 경로·날짜를 못 만든 수. 조용히 버리지 않는다.
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

    // ⛔ 여기가 SSRF 경계다. 목록이 준 문자열로 URL 을 만들기 전에 **글 ref 와
    //    똑같은 화이트리스트**를 통과시킨다. `encodeURIComponent` 로 슬러그를
    //    인코딩하되(`/`·`?`·공백이 들어와도 인코딩돼 탈락한다), 최종 판정은
    //    parseRefParts 가 한다 — 규칙을 두 벌 두지 않는다.
    const path = `/@${username}/${encodeURIComponent(slug)}`
    if (!parseRefParts(`url:${path}`)) {
      unreadable++
      continue
    }
    items.push({ path, releasedAt })
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
  // 비용: `url:` 타깃은 1글 = 1요청. `board:` 타깃은 실행당 목록 1 + 글 최대 19
  // (러너의 MAX_PAGES_PER_TARGET 20). 새 글이 안 달리면 consecutive_empty 만 늘고
  // 닫히지 않는다 — 그 상한은 아직 없다(에이전트 X 의 "연속 N회 0건 자동 닫힘" 몫).
  incrementalOnly: true,

  // ⚠️ `page` 는 **아직 러너가 넘기지 않는다**(파일 머리 ⛔ 1번 — X 소유).
  //    optional 이라 기존 호출(`nextRequest(target)`)과 타입이 호환된다.
  nextRequest(target: TargetState, page?: number): { url: string } | null {
    const board = parseBoardRef(target.productRef)
    if (board) {
      if (isListPage(target.cursor, page)) return { url: `${HOST}${board.path}` }
      const next = readBoardCursor(target.cursor).q[0]
      if (!next) return null // 큐를 다 비웠다 = 이번 실행 끝
      // ⛔ 큐 값도 원격 데이터다. 넣을 때 검증했지만 여기서 한 번 더 본다 —
      //    커서는 DB 를 거쳐 오므로 중간에 손댈 수 있는 값이다.
      return parseRefParts(`url:${next}`) ? { url: `${HOST}${next}` } : null
    }

    const parts = parseRefParts(target.productRef)
    if (!parts) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${parts.path}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    // ⚠️ `page` 캐스트는 X 가 ParseContext 에 그 필드를 넣으면 지운다(파일 머리 ⛔ 1번).
    const page = (ctx as ParseContext & { page?: number }).page

    const board = parseBoardRef(ctx.productRef)
    if (board) return parseBoardPage(body, ctx.cursor, page)

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

/** 게시판 모드의 한 페이지. 목록이면 큐를 채우고, 글이면 큐에서 하나 빼면서 읽는다. */
function parseBoardPage(body: string, cursor: string | null, page: number | undefined): ParseResult {
  const cur = readBoardCursor(cursor)

  if (isListPage(cursor, page)) {
    const got = readBoardList(body)
    if (!got) {
      // 목록 컨테이너가 없다 = 구조가 바뀌었다. **큐와 `last` 를 지우지 않는다** —
      // 지우면 다음 실행이 목록 전체를 처음부터 다시 큐에 넣는다.
      return { reviews: [], nextCursor: writeBoardCursor(cur), parseFailures: 1, filtered: 0 }
    }

    // 이미 본 글은 큐에 넣지 않는다. `last` 는 우리가 쓴 값이라 원본 ISO 끼리
    // 정확히 비교된다(날짜 단위로 뭉개면 같은 날 글을 매 실행 다시 받는다).
    const fresh = got.items.filter((x) => !cur.last || x.releasedAt > cur.last)
    const seen = new Set(cur.q)
    const q = [...fresh.map((x) => x.path).filter((p) => !seen.has(p)), ...cur.q]

    // 목록에서 본 가장 최근 시각. **걸러진 글도 포함해서** 올린다 — 안 그러면
    // 큐에 안 들어간 글 때문에 `last` 가 영원히 제자리다.
    let last = cur.last
    for (const x of got.items) if (!last || x.releasedAt > last) last = x.releasedAt

    // 목록 페이지는 리뷰를 내지 않는다. 항목을 읽지 못한 수만 실패로 센다.
    return { reviews: [], nextCursor: writeBoardCursor({ q, last }), parseFailures: got.unreadable, filtered: 0 }
  }

  // 글 페이지 — 큐의 맨 앞이 방금 요청한 글이다.
  const path = cur.q[0]
  const rest = writeBoardCursor({ q: cur.q.slice(1), last: cur.last })
  const parts = path ? parseRefParts(`url:${path}`) : null
  if (!parts) {
    // 큐가 비었는데 글 본문이 왔다(= 러너와 어긋났다). 스코프를 모르는 채로
    // 적재하지 않는다 — 남의 글이 이 타깃의 project_id 로 들어간다(SP-031).
    return { reviews: [], nextCursor: rest, parseFailures: 1, filtered: 0 }
  }

  return { ...parsePostPage(body, parts), nextCursor: rest }
}

export const __internal = { sliceJson, readState, readPosts, readFlight, REF_RE }
