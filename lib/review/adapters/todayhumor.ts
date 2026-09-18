// 오늘의유머(todayhumor) 게시글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 round-2 — theqoo · todayhumor (2026-09-16)"
//
// ⚠️ **호스트를 www 로 고정한 건 취향이 아니다.**
//    `https://todayhumor.co.kr/...` 은 **`http://www.todayhumor.co.kr/...` 로
//    리다이렉트한다 — https 가 http 로 내려간다**(실측 2026-09-16).
//    러너의 fetchText 는 `redirect: 'follow'` 라 그 다운그레이드를 조용히
//    따라가고, 그때부터 우리 요청은 평문이다. www 오리진은 https 에서 그대로
//    종단한다(robots.txt 404, 글 페이지 200, 리다이렉트 0회).
//    설계 단계에서 걱정한 www↔무www **순환 리다이렉트는 없었다** — 있었다면
//    fetchText 가 throw → status null → 러너가 그 오리진을 'unreadable' 로
//    캐시 → 전 요청 스킵이고, 로그에는 robotsSkips 만 남았을 것이다(§7.2).
//
// ⚠️ **1글=2요청이다**(2026-09-17 변경). 본문 HTML → 댓글 JSON.
//    댓글은 정적 HTML 에 없다(`<div id='memoContainerDiv'></div>` 가 빈 채로
//    오고 AJAX 가 채운다). 그 AJAX 를 그대로 부른다:
//      GET /board/ajax_memo_list.php?parent_table=&parent_id=&last_memo_no=0&get_all_memo=Y
//    쿠키·인증이 전혀 필요 없다(콜드 상태로 200, 실측 2026-09-17).
//    두 번째 요청은 러너의 커서로 표현한다 — 어댑터는 여전히 fetch 를 모른다.
//
// 🔴 **베스트/베오베 글의 URL 값은 가짜 별칭이다.**
//    `table=bestofbest&no=483825` 인 글의 실제 댓글은 `parent_table="sisa"` ·
//    `parent_id="1271155"` 에 달려 있다. URL 값을 그대로 댓글 API 에 넣으면
//    **에러 없이** `{"is_more_memo":"true","memos":[]}` 가 온다(실측). 조용한
//    0건이라 로그로는 "댓글 없는 글"과 구분되지 않는다. 그래서 본문 페이지의
//    인라인 스크립트(`var parent_table = "sisa";`)에서 원본 값을 읽어 커서에
//    싣고, 개수 마커(`<div>댓글 : 5개</div>`)와 대조해 못 읽은 만큼을
//    parseFailures 로 센다 — 이 대조가 그 함정의 유일한 탐지기다(§7.1).
//
// ⚠️ robots.txt 가 **없다**(2026-09-16 실측: 양 오리진 모두 HTTP 404).
//    못 볼 규칙이 없으니 SP-026(러너가 쿼리를 떼고 판정하는 구멍)도 지금은
//    무해하다. 하지만 이 소스의 글 주소는 **쿼리형**이라, 나중에 robots 가
//    생기고 거기에 쿼리 규칙이 들어가면 **우리 안전장치가 그 규칙을 못 본다.**
//    그때는 러너부터 고쳐라. 댓글 API 도 쿼리형이라 같은 구멍 위에 있다.
//
// ⚠️ 이용약관 페이지를 찾지 못했다. 푸터에 링크가 없고
//    `/member/agreement.php` · `/member/join_agreement.php` 는 404,
//    `/member/privacy.php`(200, 평문 3,123자)에는 크롤링·봇·AI 조항이 0건이다.
//    **이건 "허용"이 아니라 "확인 불가"다**(CLAUDE.md §7.1). 그래서 이 소스는
//    enabled=false 로 등록하고, 켜는 판단은 사람이 한다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://www.todayhumor.co.kr'

/** `url:/board/view.php?table=bestofbest&no=483825` → 그 경로. 규칙 위반이면 null. */
export function parseProductRef(productRef: string): string | null {
  return parseUrlRef(productRef)
}

/** 본문 컨테이너. 닫는 자리를 사이트가 주석으로 표시해 준다 — div 를 셀 필요가 없다. */
const CONTENT_OPEN = '<div class="viewContent">'
const CONTENT_CLOSE = '</div><!--viewContent-->'

/** 제목. og:title 이 유일하게 평문이다(`<title>` 은 `오늘의유머 - ` 접두가 붙는다). */
const OG_TITLE_RE = /<meta property="og:title" content="([^"]*)"/

/**
 * 작성일. 4자리 연도라 82cook 의 2자리 피벗(parseShortDate)이 필요 없다.
 *
 * 베스트 보드(bestofbest)는 두 시각을 준다:
 *   `베오베  등록시간 : 2026/09/16 23:15:47`  ← 베스트로 올라온 시각
 *   `원글작성시간 : 2026/09/15 10:28:42`      ← 글이 쓰인 시각
 * 우리가 원하는 건 뒤쪽이다. 일반 보드에는 원글작성시간 칸이 비어 있어
 * (`<div></div>`) 그때만 등록시간으로 내려간다.
 */
const ORIGIN_DATE_RE = /원글작성시간\s*:\s*(\d{4})\/(\d{2})\/(\d{2})/
const POSTED_DATE_RE = /등록시간\s*:\s*(\d{4})\/(\d{2})\/(\d{2})/

/** 댓글 개수 마커. 정적 HTML 에 있는 유일한 댓글 정보다. */
const COMMENT_COUNT_RE = /<div>댓글\s*:\s*(\d+)개<\/div>/

/**
 * 댓글 API 가 쓰는 **원본** 부모 키. 인라인 스크립트에 있다:
 *   `var parent_table = "sisa";` / `var parent_id = "1271155";`
 *
 * ⚠️ 문자 클래스가 곧 살균이다. 이 값은 그대로 URL 쿼리가 되므로 따옴표 안을
 *    통째로 믿지 않는다(본문 HTML = 신뢰 경계 밖). 실측값은 영숫자와 숫자다.
 */
const PARENT_TABLE_RE = /var\s+parent_table\s*=\s*"([A-Za-z0-9_]{1,32})"/
const PARENT_ID_RE = /var\s+parent_id\s*=\s*"(\d{1,20})"/

/** 댓글 AJAX 경로. `get_all_memo=Y` 면 한 번에 전부 온다(실측 7건, is_more=false). */
const MEMO_PATH = '/board/ajax_memo_list.php'

/**
 * 2차 요청(댓글) 커서. `memo:<parent_table>:<parent_id>:<선언된 댓글 수>`
 *
 * 선언 수를 같이 실어 나르는 이유: 댓글 응답만 보고는 "댓글 0건"과 "별칭을
 * 잘못 넣어 빈 배열"을 구분할 수 없다. 그 판단 재료가 본문 페이지에만 있다.
 */
const MEMO_CURSOR_RE = /^memo:([A-Za-z0-9_]{1,32}):(\d{1,20}):(\d{1,6})$/

/** 댓글 작성일. `"date":"2026-09-11 10:58:43"` — 4자리 연도의 절대시각이다. */
const MEMO_DATE_RE = /^(\d{4}-\d{2}-\d{2}) /

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 2차 응답(댓글 JSON) 파싱. `declared` 는 본문 페이지가 말한 댓글 수다.
 *
 * 걸러내는 것:
 *   is_system  게시판이 단 이동 기록(`"memo":"MOVE_BESTOFBEST/483825"`). 사용자
 *              의견이 아니다. 개수 마커에도 안 들어간다(실측: 총 7 = 사용자 5 + 시스템 2).
 *   is_del     삭제된 댓글. 남은 건 안내 문구뿐이다.
 * 둘 다 사이트가 준 그대로의 상태이지 파싱 실패가 아니다 — 실패로 세지 않는다.
 *
 * ip 필드는 사이트가 마스킹해서 주지만(`119.65.***.168`) authorMasked 에 쓰지
 * 않는다. 이 계층의 기존 원칙대로 작성자 정보는 담지 않는다.
 */
function parseMemos(body: string, path: string | null, declared: number): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    // 200 인데 JSON 이 아니다(점검 페이지·차단 안내 등). 상태 코드로 성공을
    // 판정하지 않는다는 규약이 여기서 실제로 값을 만든다(§7.1 사례 2).
    return { reviews: [], nextCursor: null, parseFailures: 1 }
  }

  const memos = (data as { memos?: unknown }).memos
  if (!Array.isArray(memos)) {
    return { reviews: [], nextCursor: null, parseFailures: 1 }
  }

  const reviews: ParsedReview[] = []
  let parseFailures = 0
  let seen = 0

  for (const raw of memos) {
    const m = raw as Record<string, unknown>
    if (m.is_system === true) continue
    if (m.is_del === true) continue
    seen++

    const no = typeof m.no === 'string' || typeof m.no === 'number' ? String(m.no) : null
    const text = typeof m.memo === 'string' ? stripHtml(m.memo) : ''
    if (!no || !text) {
      // 항목은 있는데 id 나 본문을 못 읽었다 = 응답 구조가 바뀐 것이다.
      parseFailures++
      continue
    }
    const d = typeof m.date === 'string' ? MEMO_DATE_RE.exec(m.date) : null

    reviews.push({
      externalId: path ? `${path}#${no}` : null,
      text,
      rating: null,
      seller: null,
      authorMasked: null,
      writtenAt: d ? d[1] : null,
      storyId: path,
    })
  }

  // 🔴 별칭 함정의 탐지기. 본문이 "댓글 5개"라고 했는데 5건이 안 왔으면 그
  //    차이가 곧 못 읽은 수다. 별칭을 잘못 넣으면 여기서 declared 전부가
  //    실패로 잡힌다 — 에러도 빈 배열도 조용히 넘어가지 못한다.
  //    (삭제 댓글이 마커에 포함되는지는 실측 표본에 삭제 건이 없어 확인하지
  //     못했다. 오경보가 반복되면 그때 seen 에 is_del 을 다시 넣어라.)
  if (seen < declared) parseFailures += declared - seen

  // 댓글은 get_all_memo=Y 로 한 번에 받는다. 여기서 끝이다.
  return { reviews, nextCursor: null, parseFailures }
}

export const todayhumorAdapter: ReviewSourceAdapter = {
  key: 'todayhumor',
  displayName: '오늘의유머 게시글·댓글',

  // robots 확인 불가여도 진행하는 호스트 (types.ts 의 필드 주석이 규칙 정본).
  //
  // ⚠️ **양 오리진 실측 404** 다(2026-09-16). `www.todayhumor.co.kr` 은 Apache
  //    기본 404 HTML("The requested URL /robots.txt was not found"), apex 도 404 다.
  //    apex 는 `http://www.` 로 리다이렉트하므로 www 를 정본 호스트로 쓴다.
  //    둘 다 적는 이유: apex 로 요청이 새면 그쪽도 확인 불가가 되고, 표식이
  //    없으면 막힌다.
  //
  // ⚠️ robots.txt 가 생기면 이 줄을 지우기 전에 **쿼리 대상 규칙**을 먼저 봐야
  //    한다. 이 소스의 글 주소는 쿼리형(`/board/view.php?table=..&no=..`)인데
  //    러너는 아직 판정에 쿼리를 넘기지 않는다(SP-026, 이번 PR 범위 밖).
  proceedWhenRobotsUnverified: ['www.todayhumor.co.kr', 'todayhumor.co.kr'],

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서 없음 = 1차(본문 HTML).
    if (!target.cursor) return { url: `${HOST}${p}` }

    // 커서 있음 = 2차(댓글 JSON). 형식이 안 맞으면 요청하지 않는다 —
    // 커서는 DB 를 거쳐 들어오므로 여기도 신뢰 경계다.
    const m = MEMO_CURSOR_RE.exec(target.cursor)
    if (!m) return null
    return {
      url: `${HOST}${MEMO_PATH}?parent_table=${m[1]}&parent_id=${m[2]}&last_memo_no=0&get_all_memo=Y`,
    }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)

    const memoCursor = ctx.cursor ? MEMO_CURSOR_RE.exec(ctx.cursor) : null
    if (memoCursor) return parseMemos(body, p, Number(memoCursor[3]))

    const open = body.indexOf(CONTENT_OPEN)
    if (open < 0) {
      // 본문 컨테이너 소실. 제목만 읽고 "정상"으로 넘기지 않는다(§7.1 사례 1).
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }
    const from = open + CONTENT_OPEN.length
    const close = body.indexOf(CONTENT_CLOSE, from)
    const text = stripHtml(body.slice(from, close < 0 ? body.length : close))

    const tm = OG_TITLE_RE.exec(body)
    const title = tm ? stripHtml(tm[1]) : ''

    // 이 사이트는 사진만 올리는 글이 흔하다(실측). 그건 제목만 남기고 통과시킨다.
    // 제목까지 없으면 그건 구조가 바뀐 것이다.
    if (!title && !text) {
      return { reviews: [], nextCursor: null, parseFailures: 1 }
    }

    const d = ORIGIN_DATE_RE.exec(body) ?? POSTED_DATE_RE.exec(body)

    // ── 댓글 요청을 만들 수 있는가 ────────────────────────────────
    const cm = COMMENT_COUNT_RE.exec(body)
    const declared = cm ? Number(cm[1]) : null
    const pt = PARENT_TABLE_RE.exec(body)
    const pi = PARENT_ID_RE.exec(body)

    let parseFailures = 0
    let nextCursor: string | null = null
    if (declared === null) {
      // 개수 마커가 사라졌다 = 댓글이 몇 개인지 **확인 불가**다. 0건으로 접지
      // 않는다(§7.1). 이 글의 댓글은 이번 실행에서 못 읽는다.
      parseFailures++
    } else if (declared > 0) {
      if (pt && pi) nextCursor = `memo:${pt[1]}:${pi[1]}:${declared}`
      // 댓글이 있다는데 부모 키를 못 읽었다 = 스크립트 구조가 바뀌었다.
      // URL 의 table/no 로 대신 가지 마라 — 별칭이면 조용히 빈 배열이 온다.
      else parseFailures++
    }

    return {
      reviews: [
        {
          externalId: p,
          text: [title, text].filter(Boolean).join('\n\n'),
          rating: null,
          seller: null,
          authorMasked: null,
          writtenAt: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
          storyId: null,
        },
      ],
      // 커서가 null 이면(댓글 0건이거나 못 만들었다) 러너가 exhausted 로 닫는다.
      nextCursor,
      parseFailures,
    }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { stripHtml, parseMemos, MEMO_PATH }
