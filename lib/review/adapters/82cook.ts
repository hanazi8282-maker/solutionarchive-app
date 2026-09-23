// 82cook 게시글·댓글 어댑터.
//
// 실측 근거: docs/review-source-findings.md
//   "커뮤니티 소스 실측 — damoang · 82cook (2026-09-16)"
//
// export 이름이 `cook82Adapter` 인 것은 식별자가 숫자로 시작할 수 없어서다.
// DB 의 review_sources.key 는 `82cook` 그대로다.
//
// ⚠️ 설계 단계의 EUC-KR 우려는 **실측에서 기각됐다.** 응답이 UTF-8 이라
//    scripts/review-collect.mjs 의 fetchText(res.text())를 고칠 필요가 없다.
//
// ⚠️ **1글=1요청이다.** 댓글은 전부 정적 HTML 로 한 번에 온다(실측 72건).
//    `/ajax/` 는 robots 가 막는데, 다행히 댓글이 거기 의존하지 않는다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseUrlRef } from './url-ref.ts'

export const HOST = 'https://www.82cook.com'

/**
 * robots.txt 가 콕 집어 금지한 URL(실측 2026-09-16):
 *   Disallow: /entiz/read.php?bn=15&num=1166440&page=6
 *
 * ⚠️ **러너의 robots 판정이 이걸 못 본다.** runner.ts:153 이
 *    `robotsVerdict(cached, u.pathname, ...)` 로 쿼리를 떼고 넘기기 때문에
 *    이 규칙은 어떤 경로와도 매칭되지 않는다(SP-026). 공용 안전장치가
 *    못 막으니 어댑터가 직접 막는다 — 러너가 고쳐지면 이 상수는 지워도 된다.
 */
const ROBOTS_DENY = { path: '/entiz/read.php', params: { bn: '15', num: '1166440', page: '6' } }

/** 파라미터 순서만 바꾼 같은 글도 잡아낸다. 문자열 비교로는 못 잡는다. */
function isRobotsDenied(p: string): boolean {
  const qi = p.indexOf('?')
  if (qi < 0) return false
  if (p.slice(0, qi) !== ROBOTS_DENY.path) return false

  const q = new URLSearchParams(p.slice(qi + 1))
  return Object.entries(ROBOTS_DENY.params).every(([k, v]) => q.get(k) === v)
}

/** `url:/entiz/read.php?num=4239440` → 그 경로. 규칙 위반·robots 금지면 null. */
export function parseProductRef(productRef: string): string | null {
  const p = parseUrlRef(productRef)
  if (!p) return null
  if (isRobotsDenied(p)) return null
  return p
}

/** 글 본문 컨테이너. `<div id="articleBody">` */
const ARTICLE_OPEN = /<div id="articleBody"[^>]*>/

/** 글 작성일. `작성일 : 2026-09-15 19:31:57` — 시각은 버린다. */
const POST_DATE_RE = /작성일\s*:\s*(\d{4})-(\d{2})-(\d{2})/

/**
 * 댓글 수 마커. `<strong class="total_reple">72</strong>`
 * "0건"과 "영역 소실"을 가르는 근거다.
 */
const TOTAL_RE = /<strong class="total_reple">\s*(\d+)\s*<\/strong>/

/**
 * 댓글 앵커. `<li data-rn="41169700" class="rp">`
 *
 * 삭제 표시 댓글은 `class="rp delReple"` 인데 본문은 그대로 실려 온다.
 * 마커(total_reple)가 그것까지 세므로 여기서도 함께 읽는다 — 안 그러면
 * 마커와 실제 수가 어긋나 멀쩡한 글이 파싱 실패로 잡힌다.
 */
const LI_OPEN = /<li data-rn="(\d+)" class="rp[^"]*">/g

/** 작성일·IP 가 든 영역. 본문은 이 div 가 **닫힌 뒤**부터다. */
const FUNC_OPEN = '<div class="repleFunc">'

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 댓글 작성일 `'26.9.15 8:00 PM` → `2026-09-15`. 시각은 버린다.
 *
 * ⚠️ 2자리 연도가 함정이다. 그냥 붙이면 `'26` 이 26년·1926년·2126년 중
 *    아무거나 될 수 있다. 90 을 피벗으로 쓴다 — 82cook 은 2000년대 사이트라
 *    `'99` 는 1999 가 맞고 `'26` 은 2026 이 맞다.
 */
function parseShortDate(s: string): string | null {
  const m = /^\s*'(\d{2})\.(\d{1,2})\.(\d{1,2})\b/.exec(s ?? '')
  if (!m) return null

  const yy = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null

  const year = yy >= 90 ? 1900 + yy : 2000 + yy
  return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const cook82Adapter: ReviewSourceAdapter = {
  key: '82cook',
  displayName: '82cook 게시글·댓글',

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
    if (target.cursor) return null
    return { url: `${HOST}${p}` }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const p = parseProductRef(ctx.productRef)
    const reviews: ParsedReview[] = []
    let parseFailures = 0

    // ── 글 본문 ───────────────────────────────────────────────────
    const am = ARTICLE_OPEN.exec(body)
    if (!am) {
      parseFailures++
    } else {
      // 본문 뒤에 광고 <script> 가 붙는다. 그 앞까지가 본문이다.
      const from = am.index + am[0].length
      const end = body.indexOf('</div>', from)
      const text = stripHtml(body.slice(from, end < 0 ? body.length : end))
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
    const tm = TOTAL_RE.exec(body)
    const declared = tm ? Number(tm[1]) : null

    const anchors: Array<{ id: string; at: number }> = []
    LI_OPEN.lastIndex = 0
    for (;;) {
      const m = LI_OPEN.exec(body)
      if (!m) break
      anchors.push({ id: m[1], at: m.index })
    }

    if (declared === null && anchors.length === 0) {
      // 마커도 항목도 없다 = 댓글 영역 소실. "댓글 0건"과 다른 사건이다.
      parseFailures++
    }

    for (let i = 0; i < anchors.length; i++) {
      const chunk = body.slice(anchors[i].at, i + 1 < anchors.length ? anchors[i + 1].at : body.length)

      const fi = chunk.indexOf(FUNC_OPEN)
      if (fi < 0) {
        parseFailures++
        continue
      }
      const fEnd = chunk.indexOf('</div>', fi)
      if (fEnd < 0) {
        parseFailures++
        continue
      }

      // 작성일은 repleFunc 안 첫 <em>. 뒤의 <em class="ip"> 는 IP 다.
      const em = /<em>([^<]*)<\/em>/.exec(chunk.slice(fi, fEnd))

      // 본문은 repleFunc 가 닫힌 다음부터 항목 끝까지.
      // ⚠️ 이 경계 덕분에 작성자 IP 가 본문에 섞이지 않는다.
      const text = stripHtml(chunk.slice(fEnd + 6).replace(/<\/li>[\s\S]*$/, ''))
      if (!text) continue

      reviews.push({
        externalId: `${p}#${anchors[i].id}`,
        text,
        rating: null,
        seller: null,
        authorMasked: null,
        writtenAt: em ? parseShortDate(em[1]) : null,
        storyId: p,
      })
    }

    if (declared !== null && anchors.length < declared) {
      parseFailures += declared - anchors.length
    }

    return { reviews, nextCursor: null, parseFailures }
  },
}

export const __internal = { stripHtml, parseShortDate, isRobotsDenied }
