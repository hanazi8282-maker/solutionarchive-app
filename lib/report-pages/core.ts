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
// 격리 설계: 결론서 HTML 은 신뢰 못 하는 입력으로 본다. 껍데기 페이지가 `<iframe sandbox="" srcdoc=…>` 로 싣는다.
//  - sandbox="" (허용 0개): 스크립트·폼·팝업·top 이동 금지, 문서 출처는 불투명(opaque) → 쿠키·저장소·부모 DOM 접근 없음.
//  - srcdoc 문서는 부모의 CSP 를 물려받는다 → 외부 이미지·폰트·CSS 요청도 막힌다(열람 추적 픽셀·IP 누출 방지).
//  - 하단 고지 줄은 부모 문서에 있어 결론서 CSS 가 덮거나 숨길 수 없다.
// ponytail: 외부 리소스 0 — 결론서는 인라인 CSS·data: 이미지로만 그려야 한다. 링크 클릭도 안 열린다(allow-popups 없음).
//   링크가 필요해지면 sandbox 에 'allow-popups allow-popups-to-escape-sandbox' 만 더한다(스크립트는 계속 금지).
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
    + `<iframe sandbox="" referrerpolicy="no-referrer" title="결론서" srcdoc="${escapeAttr(reportHtml)}"></iframe>`
    + `<footer>${FOOTER_TEXT}</footer></body></html>`
}

/** 없음·회수·형식 오류 공통. 어느 경우인지 응답에 드러내지 않는다. */
export const NOT_FOUND_HTML = '<!doctype html><html lang="ko"><head>' + HEAD + '<title>404</title></head>'
  + '<body><p>페이지를 찾을 수 없습니다.</p></body></html>'

export const UNAVAILABLE_HTML = '<!doctype html><html lang="ko"><head>' + HEAD + '<title>503</title></head>'
  + '<body><p>잠시 후 다시 열어 주세요.</p></body></html>'
