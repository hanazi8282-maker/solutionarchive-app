// 벨로그(velog.io) 글 본문 어댑터.
//
// 실측 근거: docs/review-source-findings-round5-b.md
//   "벨로그 — 본문은 원문 마크다운으로 온다 (2026-09-18)"
// 이 파일의 구현 실측은 2026-09-18 에 글 3건을 직접 받아서 냈다.
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
// ⚠️ **본문 전용이다. 댓글을 수집하지 않는다.** 다만 조사 단계의 서술
//    ("댓글 실물이 GraphQL POST 에만 있다")은 **절반만 맞다.** 실측으로 정정:
//
//      Apollo 는 댓글을 정규화해서 블롭 루트에 `Comment:<uuid>` 키로 **따로**
//      싣는다. `Post.comments` 는 참조 id 만이라 거기만 보면 안 보이지만,
//      루트에는 `text`·`created_at`·`level`·`replies_count`·`deleted` 가 다 있다.
//      즉 **최상위 댓글은 정적으로 온다.** 대댓글(level>0)은 오지 않는다.
//
//    그런데도 본문 전용으로 남긴 이유는 **개수 마커가 화해되지 않아서**다:
//      /@doondoony/mechanical-keyboards  comments_count 11 · 루트 Comment 6(전부
//                                        level 0) · replies_count 합 4 → 6+4=10 ≠ 11
//      /@velopert/veltrends-dev-review   comments_count  9 · 루트 6 · 합 3 → 9 ✔
//      /@taehyongi/velog-글-작성은-최고네요 comments_count  2 · 루트 1 · 합 1 → 2 ✔
//    세 건 중 한 건이 어긋난다. 어느 쪽으로 세도 "못 읽은 수"를 신뢰할 수
//    없으므로, 댓글을 받으면 매 실행 가짜 실패나 조용한 누락 중 하나가 된다.
//    theqoo·brunch 와 같은 자리다 — **댓글 0건은 고장이 아니라 결정이다.**
//    붙이려면 level>0 을 어디서 받을지부터 정하고(GraphQL POST 는 러너의
//    GET 계약 밖이다 — types.ts 의 ⛔ 와 theqoo.ts 헤더 참조) 마커를 다시 재라.
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
// ⚠️ **1글=1요청이다.** 커서를 내지 않으므로 러너가 page 0 뒤에 곧바로
//    exhausted 로 닫는다(runner.ts:344). 종료는 MAX_PAGES_PER_TARGET(20)
//    안전판이 아니라 구조로 성립한다(CLAUDE.md §7.2 다나와 사건).

import type { ParseContext, ParseResult, ReviewSourceAdapter, TargetState } from '../types.ts'

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
 */
const REF_RE = /^\/@[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9%_.~-]{1,300}$/

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

/** 하이드레이션 블롭의 시작 지점. `window.__APOLLO_STATE__={…}` (등호 주변 공백 없음 — 실측) */
const STATE_MARK = 'window.__APOLLO_STATE__'

/**
 * `{` 부터 짝이 맞는 `}` 까지 잘라낸다.
 *
 * 비탐욕 정규식으로 자르면 첫 `}` 에서 끊겨 **항상** 파싱에 실패한다.
 * 문자열 안의 중괄호·이스케이프를 건너뛰어야 해서 직접 센다.
 *
 * ⚠️ tumblbug.ts 에 같은 함수가 있다. 공용으로 빼지 않은 것은 의도다 —
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
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(from, i + 1)
    }
  }
  return null
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

    out.push({
      key,
      slug: typeof n.url_slug === 'string' ? n.url_slug : '',
      username,
      title: typeof n.title === 'string' ? n.title : '',
      body: typeof n.body === 'string' ? n.body : '',
      releasedAt: n.released_at,
    })
  }
  return out
}

export const velogAdapter: ReviewSourceAdapter = {
  key: 'velog',
  displayName: '벨로그 글 본문',

  // 남헌 2026-09-23 Q3(a): 이 소스의 타깃은 페이지 상한에 닿아도 닫지 않는다.
  //
  // ⚠️ **types.ts 의 incrementalOnly 주석이 "커뮤니티 url: 에는 켜지 마라"고 적어 둔
  //    바로 그 자리다.** 그 경고는 유효하고, 남헌이 그걸 알고 뒤집었다. 전제가 바뀐 게 아니다 —
  //    대가(같은 글을 매일 1요청씩 다시 읽는다)를 받아들인 것이다. 근거:
  //    커뮤니티 타깃 85개 중 80개가 "성과 없어서"가 아니라 "끝까지 읽어서" 닫혔고,
  //    되살리는 코드가 리포에 없어 그 질의는 영영 다시 안 돌았다
  //    (reports/2026-09-23/voc-expansion-investigation.md §3).
  //
  // ⚠️ 이 어댑터도 **본문 전용**이다(댓글 개수 마커가 화해되지 않아 뺐다, 위 주석). 다시 읽어도 새 건이 0 이다.
  //    brunch 와 같은 이유로 11개 일괄 지정에 포함됐다 — 되돌리려면 여기만 지운다.
  //
  // 비용: 1글 = 1요청이므로 실행당 타깃 수만큼이다(커서가 첫 페이지에 null 이 되어
  // 20페이지를 훑지 않는다). 새 글이 안 달리면 consecutive_empty 만 늘고 닫히지 않는다 —
  // 그 상한은 아직 없다. 늘어나면 재활성화 조건(empty<3)을 러너에 넣어야 한다.
  incrementalOnly: true,

  nextRequest(target: TargetState): { url: string } | null {
    const parts = parseRefParts(target.productRef)
    if (!parts) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${parts.path}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const parts = parseRefParts(ctx.productRef)
    if (!parts) {
      // nextRequest 가 같은 검사를 하므로 실행 경로에서는 안 온다. 그래도
      // 스코프를 모르는 채로 받지는 않는다 — 그러면 남의 글을 이 타깃의
      // project_id 로 적재한다. 조용한 0건은 만들지 않는다(§7.1).
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered: 0 }
    }

    const state = readState(body)
    if (!state) {
      // 블롭이 통째로 없다(SPA 껍데기·마커 이름 변경). 렌더 텍스트로 대충
      // 때워서 "정상 수집"을 만들지 않는다(CLAUDE.md §7.1 사례 1).
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered: 0 }
    }

    const posts = readPosts(state)
    const mine = posts.filter((x) => x.slug === parts.slug && (x.username === null || x.username === parts.username))
    // 본문을 가진 남의 글. 필드는 멀쩡히 읽혔고 이 타깃과 무관할 뿐이라
    // 실패가 아니라 filtered 다(tumblbug 과 같은 용법).
    const filtered = posts.length - mine.length

    if (mine.length === 0) {
      // 이 URL 을 직접 요청했는데 그 글이 블롭에 없다 = 구조가 바뀌었거나
      // 다른 글이 왔다. 0건으로 조용히 지나가면 "빈 글"과 구분이 안 된다.
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered }
    }

    const post = mine[0]
    // ponytail: body 는 **렌더 결과가 아니라 원문 마크다운**이라 브런치의
    //   5,000자 절단 같은 천장이 없다(실측 최대 17,836자, 말미 절단 없음).
    //   마크다운 기호를 벗기지 않는다 — 분석 파이프라인이 텍스트를 그대로
    //   받고, 벗기다가 코드블록 안의 VOC 를 같이 날리는 게 더 비싸다.
    const text = [post.title, post.body].filter(Boolean).join('\n\n').trim()
    if (!text) {
      // Post 는 찾았는데 제목·본문이 둘 다 비었다 = 필드명이 바뀐 것이다.
      return { reviews: [], nextCursor: null, parseFailures: 1, filtered }
    }

    return {
      reviews: [
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
      ],
      // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
      nextCursor: null,
      parseFailures: 0,
      filtered,
    }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { sliceJson, readState, readPosts, REF_RE }
