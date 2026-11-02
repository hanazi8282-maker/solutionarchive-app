// 비공개 결론서 링크 `/r/{token}` 의 순수 로직 한 벌 — 라우트(app/r/[token]/route.ts)·관리 스크립트
// (scripts/report-pages.mjs)·셀프테스트(scripts/report-pages-selftest.mjs)가 같이 쓴다.
// node:crypto 말고 import 가 없다 — 셀프테스트가 node 로 바로 불러 검사한다.
//
// 테이블: report_pages · report_views (supabase/migrations/20261103000020_report_pages.sql). 둘 다 service_role 전용.

import { randomBytes } from 'node:crypto'

/** 32바이트(256비트) 난수의 base64url = 43자. 회사·판별·버전 정보를 담지 않는다(추측 불가). */
export const TOKEN_BYTES = 32
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/** 형식 오류일 때도 DB 를 한 번 똑같이 부르기 위한 자리표시 토큰(응답 시간 차를 줄인다). 발급될 확률 2^-256. */
export const DUMMY_TOKEN = 'A'.repeat(43)

/** 로그·터미널에 찍을 때는 URL 꼴만 보이고 토큰은 앞 4자만. */
export function maskedUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/r/${token.slice(0, 4)}…(masked)`
}

// ── 열람 분류 ────────────────────────────────────────────────────
// ⚠️ "열람 추정"이다. A등급(직접 관측) 근거가 아니라 추정치다.
//   UA 는 위조·누락될 수 있고, 메일 보안 스캐너 중에는 일반 브라우저 UA 를 쓰는 것도 있다
//   (예: Microsoft Safe Links 일부). 그래서 bot 으로 못 거른 스캐너가 browser 로 남을 수 있고,
//   반대로 사람이 curl 로 열면 bot 으로 빠진다. 저장하는 것은 2분류 결과뿐이다 — UA 원문은 저장하지 않는다.
const BOT_UA = new RegExp([
  // 링크 미리보기
  'Slackbot', 'Slack-ImgProxy', 'facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot', 'Discordbot',
  'TelegramBot', 'WhatsApp', 'kakaotalk-scrap', 'Daumoa', 'Yeti', 'Iframely', 'Embedly', 'redditbot', 'Pinterest',
  'SkypeUriPreview', 'BingPreview', 'GoogleImageProxy', 'Google-PageRenderer', 'Googlebot',
  // 메일 보안 스캐너·링크 검사. ponytail: 'Outlook' 은 Outlook 앱 안 브라우저로 연 사람까지 bot 으로 뺄 수 있다
  //   (과소 집계 쪽 오차 — 추정치를 부풀리지 않는 방향이라 둔다). 실측 UA 가 쌓이면 좁힌다.
  'Microsoft Office', 'MSOffice', 'ms-office', 'Outlook', 'Microsoft-WebDAV', 'Safe ?Links', 'Barracuda', 'Proofpoint',
  'Mimecast', 'Symantec', 'Forcepoint', 'Trend ?Micro', 'Sophos', 'Cisco', 'IronPort', 'ZScaler', 'FireEye',
  // 자동화 도구
  'python-requests', 'python-urllib', 'aiohttp', 'curl', 'Wget', 'HeadlessChrome', 'PhantomJS', 'Puppeteer',
  'Playwright', 'Go-http-client', 'axios', 'node-fetch', 'undici', 'okhttp', 'Java/', 'Apache-HttpClient',
  'libwww', 'httpx', 'Scrapy',
  // 일반 표지. `\bbot\b`·`bot/` 로 좁힌다 — 그냥 `bot` 이면 휴대폰 기종 "CUBOT X30" 같은 사람 UA 가 걸린다.
  '\\bbot\\b', 'bot/', 'crawler', 'spider', 'preview', 'scanner', 'monitor',
].join('|'), 'i')

export type ViewKind = 'bot' | 'browser'

/**
 * 요청 → bot | browser. UA 없음·HEAD·프리페치도 bot 이다(사람이 본 게 아니다).
 * ⚠️ 카카오톡 인앱 브라우저 UA 에는 `KAKAOTALK` 이 들어간다 — 사람이다. 미리보기 봇은 `kakaotalk-scrap` 만.
 */
export function classifyView(ua: string | null | undefined, method = 'GET', purpose: string | null = null): ViewKind {
  if (method.toUpperCase() !== 'GET') return 'bot'
  if (purpose && /prefetch|prerender/i.test(purpose)) return 'bot'
  if (!ua || !ua.trim()) return 'bot'
  return BOT_UA.test(ua) ? 'bot' : 'browser'
}

/** 같은 토큰 10분 안의 browser 열람은 1회로 합산한다. */
export const DEDUP_WINDOW_MS = 10 * 60 * 1000

/**
 * 열람 추정 수(A등급 아님 — 추정치). bot 행은 빼고, 마지막으로 센 열람으로부터 10분이 지나야 다음 1회를 센다.
 * 입력은 한 토큰의 행들이다(여러 토큰이 섞이면 토큰별로 나눠 부른다).
 */
export function estimateViews(rows: { viewed_at: string | number | Date; kind: string }[]): number {
  const ts = rows.filter((r) => r.kind === 'browser').map((r) => new Date(r.viewed_at).getTime())
    .filter((t) => Number.isFinite(t)).sort((a, b) => a - b)
  let count = 0
  let last = -Infinity
  for (const t of ts) if (t - last >= DEDUP_WINDOW_MS) { count++; last = t }
  return count
}

/** report_views 에 쓰는 칸은 이것뿐이다(viewed_at 은 DB 기본값). IP·이메일·UA 를 넣지 않는다 — 셀프테스트가 고정. */
export function viewRow(token: string, kind: ViewKind): { token: string; kind: ViewKind } {
  return { token, kind }
}

// ── 응답 ─────────────────────────────────────────────────────────
// 격리 설계: 결론서 HTML 은 신뢰 못 하는 입력으로 본다. 껍데기 페이지가 `<iframe sandbox=… srcdoc=…>` 로 싣는다.
//  - sandbox = SANDBOX: 팝업(새 탭으로 여는 링크)만 허용. `allow-scripts`·`allow-same-origin`·`allow-forms`·
//    `allow-top-navigation` 은 없다 → 스크립트·폼·껍데기 페이지 이동 금지, 문서 출처는 불투명(opaque) → 쿠키·저장소·부모 DOM 접근 없음.
//  - srcdoc 문서는 부모의 CSP 를 물려받는다 → 외부 이미지·폰트·CSS 요청도 막힌다(열람 추적 픽셀·열람자 IP 외부 유출 방지).
//    Google Fonts 도 허용하지 않는다 — 글꼴은 시스템 대체 글꼴로 그려진다.
//  - 링크는 응답 만들 때 rewriteLinks 로 전부 새 탭(target=_blank, rel=noopener noreferrer)으로 바꾸고,
//    http(s)·mailto·tel·# 밖의 href(javascript:·data:·상대경로 등)는 지운다. 저장된 HTML 은 건드리지 않는다.
//  - 하단 고지 줄은 부모 문서에 있어 결론서 CSS 가 덮거나 숨길 수 없다.
export const SANDBOX = 'allow-popups allow-popups-to-escape-sandbox'

// ── 링크 재작성 ──────────────────────────────────────────────────
// 정규식 치환이 아니라 작은 토크나이저다: 모든 태그를 속성 단위로 읽어 끝 `>` 를 찾으므로, 다른 태그의 따옴표
// 속성 안에 든 "<a" 나 ">" 에 속지 않는다. 주석·raw text 요소(script·style·textarea·title 등) 안은 건드리지 않는다.
// ponytail: <area href> 는 다루지 않는다(결론서에 이미지맵이 없다). 스크립트가 막혀 있어 javascript: 는 어차피 안 돈다 — 이건 이중 방어다.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext'])
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|#)/
const ATTR_NAME_OK = /^[a-z][a-z0-9_.:-]*$/
const DROP_ATTRS = new Set(['target', 'rel', 'href', 'ping', 'referrerpolicy'])

type Attr = { name: string; value: string | null }

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'

/** `<` 위치에서 시작 태그를 읽는다. 태그 이름·속성·끝 위치(`>` 다음). 끝이 없으면 null. */
function readTag(html: string, start: number): { name: string; attrs: Attr[]; end: number } | null {
  let i = start + 1
  let name = ''
  while (i < html.length && !isSpace(html[i]) && html[i] !== '/' && html[i] !== '>') name += html[i++]
  const attrs: Attr[] = []
  while (i < html.length) {
    while (i < html.length && (isSpace(html[i]) || html[i] === '/')) i++
    if (i >= html.length) return null
    if (html[i] === '>') return { name: name.toLowerCase(), attrs, end: i + 1 }
    let an = html[i++] // 첫 글자는 '=' 여도 이름에 넣는다(HTML 파서와 같다)
    while (i < html.length && !isSpace(html[i]) && !'/>='.includes(html[i])) an += html[i++]
    while (i < html.length && isSpace(html[i])) i++
    let value: string | null = null
    if (html[i] === '=') {
      i++
      while (i < html.length && isSpace(html[i])) i++
      const q = html[i]
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1)
        if (close < 0) return null
        value = html.slice(i + 1, close)
        i = close + 1
      } else {
        let v = ''
        while (i < html.length && !isSpace(html[i]) && html[i] !== '>') v += html[i++]
        value = v
      }
    }
    attrs.push({ name: an.toLowerCase(), value })
  }
  return null
}

/** 브라우저가 href 를 해석하는 꼴에 가깝게: 숫자·주요 이름 문자참조 해제 → 공백·제어문자 제거 → 소문자. */
export function normalizeHref(raw: string): string {
  const named: Record<string, string> = { amp: '&', colon: ':', tab: '\t', newline: '\n', sol: '/', num: '#', lpar: '(', rpar: ')', quot: '"', apos: "'" }
  return raw
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#([0-9]+);?/g, (_, d) => String.fromCodePoint(Math.min(parseInt(d, 10), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m)
    .replace(/[\u0000- \u007f-\u009f]/g, '')
    .toLowerCase()
}

const serializeAttr = (a: Attr) => a.value === null ? a.name : `${a.name}="${a.value.replace(/"/g, '&quot;')}"`

function rewriteA(attrs: Attr[]): string {
  const href = attrs.find((a) => a.name === 'href') // 같은 속성이 둘이면 브라우저도 첫 번째를 쓴다
  const keep = attrs.filter((a) => ATTR_NAME_OK.test(a.name) && !DROP_ATTRS.has(a.name) && !a.name.startsWith('on'))
  if (href?.value != null && SAFE_HREF.test(normalizeHref(href.value))) keep.unshift(href)
  return '<a' + keep.map((a) => ' ' + serializeAttr(a)).join('') + ' target="_blank" rel="noopener noreferrer">'
}

/** 결론서 HTML 의 모든 `<a>` 를 새 탭 링크로 바꾸고 위험한 href 를 지운다. 입력 문자열은 바꾸지 않는다(새 문자열 반환). */
export function rewriteLinks(html: string): string {
  let out = ''
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) { out += html.slice(i); break }
    out += html.slice(i, lt)
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4)
      const end = close < 0 ? html.length : close + 3
      out += html.slice(lt, end); i = end; continue
    }
    const next = html[lt + 1] ?? ''
    if (!/[a-zA-Z]/.test(next)) {
      // 끝 태그·<!doctype>·<?…>·맨 '<' — 손대지 않는다.
      const close = /[/!?]/.test(next) ? html.indexOf('>', lt) : -1
      const end = close < 0 ? lt + 1 : close + 1
      out += html.slice(lt, end); i = end; continue
    }
    const tag = readTag(html, lt)
    if (!tag) { out += html.slice(lt); break } // 닫히지 않은 태그 — 브라우저도 버린다
    out += tag.name === 'a' ? rewriteA(tag.attrs) : html.slice(lt, tag.end)
    i = tag.end
    if (RAW_TEXT.has(tag.name)) {
      const closeRe = new RegExp(`</${tag.name}[\\s/>]`, 'i')
      const m = closeRe.exec(html.slice(i))
      const end = m ? i + m.index : html.length
      out += html.slice(i, end); i = end
    }
  }
  return out
}

export const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

/** 200·404·503 모두 같은 헤더. 검색엔진 미노출·리퍼러 차단·캐시 금지. */
export function responseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }
}

export const FOOTER_TEXT = "솔루션아카이브 김남헌 · hanazi8282@gmail.com · 수신을 원치 않으시면 '수신거부'라고 회신해 주세요."

const HEAD = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer">'

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderReportPage(reportHtml: string): string {
  return '<!doctype html><html lang="ko"><head>' + HEAD + '<title>결론서</title><style>'
    + 'html,body{margin:0;height:100%}body{display:flex;flex-direction:column;font-family:system-ui,sans-serif}'
    + 'iframe{flex:1;border:0;width:100%}'
    + 'footer{flex:none;padding:10px 16px max(10px,env(safe-area-inset-bottom));font-size:13px;overflow-wrap:anywhere;line-height:1.5;color:#444;background:#f6f6f6;border-top:1px solid #ddd;text-align:center}'
    + '</style></head><body>'
    + `<iframe sandbox="${SANDBOX}" referrerpolicy="no-referrer" title="결론서" srcdoc="${escapeAttr(rewriteLinks(reportHtml))}"></iframe>`
    + `<footer>${FOOTER_TEXT}</footer></body></html>`
}

/** 없음·회수·형식 오류 공통. 어느 경우인지 응답에 드러내지 않는다. */
export const NOT_FOUND_HTML = '<!doctype html><html lang="ko"><head>' + HEAD + '<title>404</title></head>'
  + '<body><p>페이지를 찾을 수 없습니다.</p></body></html>'

export const UNAVAILABLE_HTML = '<!doctype html><html lang="ko"><head>' + HEAD + '<title>503</title></head>'
  + '<body><p>잠시 후 다시 열어 주세요.</p></body></html>'
