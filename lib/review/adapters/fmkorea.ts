// 에펨코리아(fmkorea.com) 게시글·댓글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 round-3 — brunch · clien · fmkorea (2026-09-17)"
//
// ⚠️ **남헌 2026-09-17 결정을 알고 써라(SP-028).** robots.txt 의 첫 그룹이
//    anthropic-ai·ClaudeBot·GPTBot·PerplexityBot 등 AI 학습 크롤러를 명시적
//    으로 거부한다(`Disallow: /` + `Allow: /$`). 우리 토큰은 그 목록에 아직
//    없어 기계 판정은 allowed 지만, 사이트의 의사는 우리 용도를 덮는다.
//    그 사실을 인지한 채로 수집을 진행하기로 **사람이 결정**했다(다모앙 SP-025
//    와 같은 형태). 이 파일을 손대는 사람이 맥락을 모르고 확장하지 않도록
//    여기 적어 둔다.
//
// ⚠️ **`/best` `/best2` `/humor` 밖으로 넓히지 마라.** `*` 그룹이
//    `Disallow: /` 로 전부 막고 저 셋만 `Allow:` 로 연다(실측). `/8123456`
//    같은 XE 기본 주소는 전면 금지 대상이라 ref 단계에서 잘라낸다.
//
// ⚠️ **1글=1요청이다.** 댓글 페이지네이션을 붙이지 마라. `?cpage=N` 을 만들면
//    robots 의 쿼리 규칙(`Disallow: /*m=0&` 등)과 같은 층인데, 러너는 robots
//    판정에 쿼리를 안 넘긴다(SP-026). 안전장치가 그 위반을 못 막는다.
//
// 수집 단위는 상품이 아니라 글 1건이다. 글 본문 1건 + 댓글 N건 = 리뷰 N+1건.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

/** 호스트는 어댑터가 상수로 갖는다. product_ref 에 넣게 하면 SSRF 가 된다. */
export const HOST = 'https://www.fmkorea.com'

/** robots `*` 그룹이 여는 유일한 세 갈래. 그 밖은 `Disallow: /` 다. */
const ALLOW_PREFIXES = ['/best/', '/best2/', '/humor/']

/**
 * `url:/best/10342734564` → 그 경로. 규칙 위반이면 null.
 *
 * 공용 SSRF 규칙을 통과한 뒤, 위 세 접두 중 하나 + 숫자 글 id 여야 한다.
 * 화이트리스트라 `/index.php?...` · `/8123456` 은 자동으로 탈락한다.
 */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  if (p === null) return null
  const hit = ALLOW_PREFIXES.find((pre) => p.startsWith(pre))
  if (!hit) return null
  // 접두 뒤는 숫자 글 id 하나뿐. `/best/123/456`(댓글 퍼머링크)도 거부한다.
  return /^\d{1,20}$/.test(p.slice(hit.length)) ? p : null
}

/** 댓글 수 마커. `<a class="ui_font bubble" … title="댓글 보기/숨기기">댓글 <b>177</b> 개</a>` */
const COUNT_RE = /댓글 <b>(\d+)<\/b>/

/**
 * 댓글 앵커. `<li id="comment_10342883096" class="fdb_itm clear …">`
 *
 * ⚠️ BEST 댓글은 본목록의 같은 글이 **한 번 더** 위에 나오고, 그때만 id 끝에
 *    `_` 가 붙는다(`comment_10342859374_`). id 숫자만 뽑아 중복을 제거하지
 *    않으면 같은 댓글이 두 번 적재되고, 앵커 수가 마커를 넘어간다
 *    (실측: 마커 77 · 앵커 81 · 고유 77).
 */
const LI_OPEN = /<li id="comment_(\d+)_?" class="fdb_itm/g

/** 댓글 본문. `<div class="comment_<댓글srl>_<멤버srl> xe_content">` */
const cmtBodyOpen = (srl: string) => new RegExp(`<div class="comment_${srl}_\\d+ xe_content"`)

/** 글 본문. `<div class="document_<문서srl>_<멤버srl> xe_content">` */
const DOC_BODY_RE = /<div class="document_\d+_\d+ xe_content"/

/** 제목. `<h1 class="np_18px"><span class="np_18px_span">…</span></h1>` */
const TITLE_RE = /<h1 class="np_18px">\s*<span class="np_18px_span">([\s\S]*?)<\/span>/

/** 글 작성일. `<span class="date m_no">2026.09.16 23:17</span>` — 4자리 연도다. */
const DATE_RE = /<span class="date m_no">\s*(\d{4})\.(\d{2})\.(\d{2})/

/**
 * 댓글 페이지 번호. `window.document_cpage = 2;`
 *
 * ⚠️ **이게 "못 읽음"과 "다른 페이지에 있음"을 가르는 유일한 근거다.**
 *    에펨은 댓글이 많으면 페이저(`bd_pg`)를 붙이고 글 페이지에 **마지막
 *    페이지**를 렌더한다. 그때 마커(177) > 앵커(79)가 되는데, 그건 파서가
 *    깨진 게 아니라 나머지가 다른 페이지에 있는 것이다. 이 차액을
 *    parseFailures 로 세면 멀쩡한 파서가 매일 밤 98건씩 실패를 찍는다.
 *    반대로 페이저가 없는데 차이가 나면 그건 진짜 실패다(실측 77/77 확인).
 */
const CPAGE_RE = /window\.document_cpage\s*=\s*(\d+)/

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
 * 비탐욕 정규식으로 자르면 중첩 div 하나에 본문이 앞에서 잘리고, 잘린 본문은
 * 실패로도 안 잡혀서(텍스트가 있으니) 조용히 데이터가 상한다.
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

export const fmkoreaAdapter: ReviewSourceAdapter = {
  key: 'fmkorea',
  displayName: '에펨코리아 게시글·댓글',

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
    const dm = DOC_BODY_RE.exec(body)
    const doc = dm ? sliceDiv(body, dm.index) : null
    const tm = TITLE_RE.exec(body)
    const title = tm ? stripHtml(tm[1]) : ''
    const text = doc === null ? '' : stripHtml(doc)

    if (doc === null || (!title && !text)) {
      // 본문 컨테이너가 통째로 사라졌다. 댓글만 읽히면 "수집은 되는데 글이
      // 없는" 상태로 몇 주가 간다(CLAUDE.md §7.1 사례 1).
      parseFailures++
    } else {
      const d = DATE_RE.exec(body)
      reviews.push({
        externalId: p,
        text: [title, text].filter(Boolean).join('\n\n'),
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
        storyId: null,
      })
    }

    // ── 댓글 ──────────────────────────────────────────────────────
    const countMatch = COUNT_RE.exec(body)
    const declared = countMatch ? Number(countMatch[1]) : null

    // BEST 댓글 중복을 id 기준으로 한 번에 접는다. 먼저 나온 쪽(BEST)을 쓴다.
    const anchors: Array<{ id: string; at: number }> = []
    const seen = new Set<string>()
    LI_OPEN.lastIndex = 0
    for (;;) {
      const m = LI_OPEN.exec(body)
      if (!m) break
      if (seen.has(m[1])) continue
      seen.add(m[1])
      anchors.push({ id: m[1], at: m.index })
    }

    if (declared === null && anchors.length === 0) {
      // 마커도 항목도 없다 = 댓글 영역이 사라졌다. "댓글 0건"과 **다른 사건**이다.
      parseFailures++
    }

    for (let i = 0; i < anchors.length; i++) {
      // anchors 는 문서 순서다(정규식이 왼쪽부터 훑고, 중복은 건너뛰기만 한다).
      // BEST 항목의 덩어리는 본목록의 같은 id 항목까지 품을 수 있는데, 아래
      // cmtBodyOpen 이 그 덩어리의 **첫** 본문을 잡으므로 BEST 쪽 본문이 쓰인다.
      const chunk = body.slice(anchors[i].at, i + 1 < anchors.length ? anchors[i + 1].at : body.length)
      const bm = cmtBodyOpen(anchors[i].id).exec(chunk)
      if (!bm) {
        // 앵커는 있는데 본문 컨테이너가 없다 = 클래스 규칙이 바뀌었다.
        parseFailures++
        continue
      }
      const inner = sliceDiv(chunk, bm.index)
      if (inner === null) {
        parseFailures++
        continue
      }
      const text = stripHtml(inner)
      // 컨테이너는 멀쩡한데 알맹이가 없는 경우(짤만 단 댓글)다. 파서가 깨진 게
      // 아니므로 실패로 세지 않는다 — 저장할 텍스트가 없을 뿐이다.
      if (!text) continue

      reviews.push({
        externalId: `${p}#${anchors[i].id}`,
        text,
        rating: null,
        seller: null,
        authorMasked: null,
        // 댓글 시각 표기가 `9 분 전` 꼴의 **상대시각**이다(실측 79/79 전건).
        // 수집 시각에서 역산하면 재수집 때마다 값이 달라지므로 채우지 않는다.
        writtenAt: null,
        storyId: p,
      })
    }

    // ── 마커와 앵커가 다를 때: 페이지네이션인가, 못 읽은 것인가 ──
    //
    // 페이저가 있으면(cpage) 차액은 다른 페이지에 있는 것이라 실패가 아니다.
    // 페이저가 없는데 모자라면 그건 진짜 못 읽은 것이다(§7.1 — 0건과 못 읽음).
    const paginated = CPAGE_RE.test(body)
    if (!paginated && declared !== null && anchors.length < declared) {
      parseFailures += declared - anchors.length
    }

    // 1글=1요청. 커서를 내지 않으므로 러너가 이 타깃을 exhausted 로 닫는다.
    return { reviews, nextCursor: null, parseFailures }
  },

  // quotaMarkers 를 선언하지 않는다 = 모든 403/429 를 차단으로 본다.
}

export const __internal = { stripHtml, sliceDiv, ALLOW_PREFIXES, CPAGE_RE }
