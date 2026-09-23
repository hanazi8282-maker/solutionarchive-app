// 보배드림 게시글·댓글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "VOC 소스 3종 실측 — tumblbug · naver_blog · bobaedream (2026-09-17)"
//
// 이 라운드에서 세 소스를 재 봤고 **보배드림만 통과했다.** 나머지 둘은
// 어댑터를 만들지 않았다(근거는 위 문서). 여기 흉내 내서 추가하기 전에
// 그 절을 먼저 읽어라.
//
// robots.txt 는 `User-agent: * / Allow: /` 로 전면 허용이다(실측 2026-09-17).
// 다모앙·82cook 과 달리 금지 경로가 없어 ROBOTS_DENY 상수가 없다.
// 금지 목록은 Amazonbot 하나뿐이고 우리 UA 와 무관하다.
//
// ⚠️ **1글=1요청이다.** 댓글 페이지네이션을 붙이지 마라.
//
// ⚠️ 그래서 **댓글 100건이 넘는 글은 일부만 수집한다.** 실측 2026-09-17:
//    댓글 155건짜리 글의 정적 HTML 에 앵커가 55개뿐이었다(나머지는
//    comment_list.php 로 따로 온다). 21·12·12·5·1건짜리 글은 전부 일치했다.
//    이 한계를 개수 마커 판정에 반영해 뒀다(아래 parse() 끝부분) — 모르고
//    damoang 식으로 차이를 실패로 세면 인기 글마다 소스가 broken 으로 꺼진다.
//
// 수집 단위는 상품이 아니라 글 1건이다. 글 본문 1건 + 댓글 N건 = 리뷰 N+1건.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://www.bobaedream.co.kr'

/**
 * 글 경로는 `/view` 하나로 한정하고 `code` · `No` 를 둘 다 요구한다.
 *
 * ⚠️ 이 가드가 없으면 `url:/mycar/mycar_list.php?...` 같은 **글이 아닌 페이지**가
 *    타깃으로 들어온다. 그런 페이지는 HTTP 200 에 bodyCont 가 없어서
 *    parseFailures 만 쌓이고, 소스 건강도가 남의 실수로 broken 이 된다.
 *    실측에서 없는 게시판(`code=strange`)이 **HTTP 200 에 121바이트**를
 *    돌려주는 것도 봤다 — 상태 코드로는 못 가른다(CLAUDE.md §7.1).
 *
 * `/view.php?...` 도 같은 문서를 주지만 받지 않는다. 두 표기를 다 받으면
 * 같은 글이 서로 다른 externalId 로 두 번 적재된다.
 */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  if (!p) return null

  const qi = p.indexOf('?')
  if (qi < 0) return null
  if (p.slice(0, qi) !== '/view') return null

  const q = new URLSearchParams(p.slice(qi + 1))
  const code = q.get('code')
  const no = q.get('No')
  if (!code || !/^[a-z0-9_]+$/i.test(code)) return null
  if (!no || !/^\d+$/.test(no)) return null

  // 파라미터 순서가 달라도 같은 글은 같은 경로가 되게 정규화한다.
  // 안 하면 `?No=1&code=freeb` 와 `?code=freeb&No=1` 이 다른 리뷰로 쌓인다.
  return `/view?code=${code}&No=${no}`
}

/** 글 본문 컨테이너. `<div class="bodyCont" itemprop="articleBody">` */
const BODY_OPEN = /<div class="bodyCont"[^>]*>/

/** 글 제목. `<strong itemprop="name" ...>제목<em class="detailTxtDeco01">[23]</em>...</strong>` */
const TITLE_OPEN = /<strong itemprop="name"[^>]*>/

/** 글 작성일. `2020.04.22&nbsp;(수) 10:53` — 시각·요일은 버린다. */
const POST_DATE_RE = /(\d{4})\.(\d{2})\.(\d{2})(?:&nbsp;|\s)*\([월화수목금토일]\)/

/**
 * 댓글 수 마커. `<span class="comm2">(23)</span>`
 *
 * ⚠️ 이 마커가 **"댓글 0건"과 "댓글 영역이 사라짐"을 가르는 유일한 근거**다.
 *    마커도 없고 항목도 없으면 후자다(CLAUDE.md §7.1).
 *    실측에서 마커 23 과 앵커 23 이 정확히 일치했다.
 */
const COUNT_RE = /<span class="comm2">\((\d[\d,]*)\)<\/span>/

/**
 * 댓글 본문 앵커. `<dd class="" id="small_cmt_1018669" style='...'>본문</dd>`
 *
 * 대댓글(`<li class="re">`)도 같은 모양이라 함께 읽는다. 마커가 대댓글까지
 * 세므로 여기서 빼면 마커와 실제 수가 어긋나 멀쩡한 글이 실패로 잡힌다.
 */
const CMT_OPEN = /<dd[^>]*id="(small_cmt_\d+)"[^>]*>/g

/** 댓글 작성일. 앵커 **앞쪽** `<dt>` 안에 있다. `<span class="date">20.04.22 12:14</span>` */
const CMT_DATE_RE = /<span class="date">([^<]*)<\/span>/g

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
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
 * `<div ...>` 의 짝을 세어 내용만 잘라낸다.
 *
 * 비탐욕 정규식으로 자르면 **중첩 div 가 하나만 생겨도 본문이 앞에서 잘린다.**
 * 잘린 본문은 텍스트가 있으니 실패로도 안 잡혀서 조용히 데이터가 상한다.
 * (damoang.ts 와 같은 이유로 같은 방식을 쓴다.)
 */
function sliceDiv(html: string, openIdx: number): string | null {
  const start = html.indexOf('>', openIdx)
  if (start < 0) return null

  let depth = 1
  const tag = /<\/?div\b/gi
  tag.lastIndex = start + 1
  for (;;) {
    const m = tag.exec(html)
    if (!m) return null
    depth += m[0][1] === '/' ? -1 : 1
    if (depth === 0) return html.slice(start + 1, m.index)
  }
}

/**
 * 댓글 작성일 `20.04.22 12:14` → `2020-04-22`. 시각은 버린다.
 *
 * ⚠️ 2자리 연도가 함정이다. 90 을 피벗으로 쓴다 — 보배드림은 2000년대
 *    사이트라 `'99` 는 1999, `'20` 은 2020 이 맞다. 82cook 과 같은 규칙이다.
 *    표기가 YY.MM.DD 인 것은 실측으로 확인했다: 댓글이 `20.04.22` 이고
 *    같은 글의 첨부 이미지 경로가 `/bbs/freeb/2020/04/22/` 다.
 */
function parseShortDate(s: string): string | null {
  const m = /^\s*(\d{2})\.(\d{1,2})\.(\d{1,2})\b/.exec(s ?? '')
  if (!m) return null

  const yy = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null

  const year = yy >= 90 ? 1900 + yy : 2000 + yy
  return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const bobaedreamAdapter: ReviewSourceAdapter = {
  key: 'bobaedream',
  displayName: '보배드림 게시글·댓글',

  // 남헌 2026-09-23 Q3(a): 이 소스의 타깃은 페이지 상한에 닿아도 닫지 않는다.
  //
  // ⚠️ **types.ts 의 incrementalOnly 주석이 "커뮤니티 url: 에는 켜지 마라"고 적어 둔
  //    바로 그 자리다.** 그 경고는 유효하고, 남헌이 그걸 알고 뒤집었다. 전제가 바뀐 게 아니다 —
  //    대가(같은 글을 매일 1요청씩 다시 읽는다)를 받아들인 것이다. 근거:
  //    커뮤니티 타깃 85개 중 80개가 "성과 없어서"가 아니라 "끝까지 읽어서" 닫혔고,
  //    되살리는 코드가 리포에 없어 그 질의는 영영 다시 안 돌았다
  //    (reports/2026-09-23/voc-expansion-investigation.md §3).
  //
  // 게시글에 댓글이 계속 달린다 — 대상이 고정된 문서가 아니라 자라는 스레드다.
  //
  // 비용: 1글 = 1요청이므로 실행당 타깃 수만큼이다(커서가 첫 페이지에 null 이 되어
  // 20페이지를 훑지 않는다). 새 글이 안 달리면 consecutive_empty 만 늘고 닫히지 않는다 —
  // 그 상한은 아직 없다. 늘어나면 재활성화 조건(empty<3)을 러너에 넣어야 한다.
  incrementalOnly: true,

  nextRequest(target: TargetState): { url: string } | null {
    const p = parseProductRef(target.productRef)
    if (!p) return null
    // 커서가 있다 = 이미 한 번 받았다. 1글=1요청이라 다시 가지 않는다.
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)
    const reviews: ParsedReview[] = []
    let parseFailures = 0

    // ── 글 본문 ───────────────────────────────────────────────────
    const bm = BODY_OPEN.exec(body)
    const inner = bm ? sliceDiv(body, bm.index) : null
    if (inner === null) {
      // 본문 컨테이너가 통째로 사라졌다. 없는 게시판이 HTTP 200 + 121바이트로
      // 오는 경우가 여기 걸린다 — 댓글만 읽히면 "수집은 되는데 글이 없는"
      // 상태로 몇 주가 간다(CLAUDE.md §7.1 사례 1).
      parseFailures++
    } else {
      const tm = TITLE_OPEN.exec(body)
      const titleRaw = tm ? body.slice(tm.index + tm[0].length, body.indexOf('</strong>', tm.index)) : ''
      // 제목 뒤 `<em class="detailTxtDeco01">[23]</em>` 은 댓글 수다. 제목이 아니다.
      const title = stripHtml(titleRaw.replace(/<em class="detailTxtDeco01">\[\d+\]<\/em>/, ''))
      const text = [title, stripHtml(inner)].filter(Boolean).join('\n\n')
      const d = POST_DATE_RE.exec(body)

      if (!text) {
        // 컨테이너는 있는데 알맹이가 없다 — 구조가 바뀐 쪽에 가깝다.
        parseFailures++
      } else {
        reviews.push({
          externalId: p,
          text,
          rating: null,
          seller: null,
          authorMasked: null,
          writtenAt: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
          storyId: null,
        })
      }
    }

    // ── 댓글 ──────────────────────────────────────────────────────
    const cm = COUNT_RE.exec(body)
    const declared = cm ? Number(cm[1].replace(/,/g, '')) : null

    const anchors: Array<{ id: string; at: number; end: number }> = []
    CMT_OPEN.lastIndex = 0
    for (;;) {
      const m = CMT_OPEN.exec(body)
      if (!m) break
      anchors.push({ id: m[1], at: m.index, end: m.index + m[0].length })
    }

    if (declared === null && anchors.length === 0) {
      // 마커도 항목도 없다 = 댓글 영역이 사라졌다. "댓글 0건"과 **다른 사건**이다.
      parseFailures++
    }

    for (let i = 0; i < anchors.length; i++) {
      const close = body.indexOf('</dd>', anchors[i].end)
      if (close < 0) {
        // 앵커는 열렸는데 닫히지 않았다 = 마크업이 바뀌었다.
        parseFailures++
        continue
      }

      // 작성일은 앵커 **앞**의 <dt> 안에 있다. 이전 앵커 뒤부터 이번 앵커
      // 앞까지에서 마지막 것을 고른다 — 앞 댓글의 날짜를 주워 오지 않는다.
      const from = i === 0 ? 0 : anchors[i - 1].end
      CMT_DATE_RE.lastIndex = 0
      let dateRaw: string | null = null
      for (;;) {
        const dm = CMT_DATE_RE.exec(body.slice(from, anchors[i].at))
        if (!dm) break
        dateRaw = dm[1]
      }

      const text = stripHtml(body.slice(anchors[i].end, close))
      // 컨테이너는 멀쩡한데 알맹이가 없는 경우(이미지만 단 댓글)다.
      // 파서가 깨진 게 아니므로 실패로 세지 않는다 — 저장할 텍스트가 없을 뿐이다.
      if (!text) continue

      reviews.push({
        externalId: `${p}#${anchors[i].id}`,
        text,
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: parseShortDate(dateRaw ?? ''),
        storyId: p,
      })
    }

    // 마커가 >0 인데 **한 건도** 못 읽었다 = 앵커 규칙이 바뀐 것이다.
    //
    // ⚠️ damoang·82cook 은 여기서 `declared - anchors.length` 만큼 실패로 셌다.
    //    보배드림에서는 그러면 안 된다 — 댓글이 100건을 넘는 글은 **한 요청에
    //    전부 오지 않는다.** 실측(2026-09-17):
    //      marker 155 → 앵커 55 (나머지는 comment_list.php 로 따로 온다)
    //      marker 21·12·12·5·1 → 앵커 21·12·12·5·1 (전부 일치)
    //    차이를 실패로 세면 댓글 많은 글마다 실패 100건이 찍혀 소스가 broken 으로
    //    꺼진다. 그건 구조가 깨진 게 아니라 사이트가 나눠 주는 것이다.
    //    반대로 아예 0건이면 그건 진짜 고장이다 — 거기만 잡는다.
    if (declared !== null && declared > 0 && anchors.length === 0) {
      parseFailures++
    }

    // ponytail: 댓글 100건 초과 글은 일부만 수집한다(위 실측). 전량이 필요하면
    //   /board_renew/bulletin/comment_list.php 를 붙여야 하는데, 그건 1글=1요청을
    //   깨는 일이고 러너의 robots 판정이 쿼리를 안 본다는 구멍(SP-026)과 맞물린다.
    //   먼저 SP-026 을 고치고 나서 손대라. 지금은 "덜 받는다"를 아는 채로 둔다.

    // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
    // 나중에 달린 댓글을 다시 받으려면 사람이 DB 에서 status='active' 로
    // 되돌려야 한다(자동 재활성화는 만들지 않았다).
    return { reviews, nextCursor: null, parseFailures }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
  // 공식 API 가 아니라 커뮤니티 사이트라 "정상적인 쿼터 소진" 개념이 없다.
}

export const __internal = { stripHtml, sliceDiv, parseShortDate }
