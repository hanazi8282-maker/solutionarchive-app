#!/usr/bin/env node
// 비공개 결론서 링크 `/r/{token}` 셀프테스트 — 네트워크·DB 없음. 가짜 문서만 쓴다(실제 결론서 아님).
//   node scripts/report-pages-selftest.mjs
//
// 고정하는 것: 토큰 엔트로피·형식 · 봇 UA 분류 · 10분 중복 합산 · noindex/헤더 · 저장 칸에 IP·이메일·UA 없음 ·
// 격리 렌더(sandbox iframe + 이스케이프) · 404 단일 응답 · robots.txt/sitemap.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  TOKEN_BYTES, TOKEN_RE, DUMMY_TOKEN, newToken, maskedUrl, classifyView, estimateViews, DEDUP_WINDOW_MS, viewRow,
  responseHeaders, renderReportPage, NOT_FOUND_HTML, UNAVAILABLE_HTML, FOOTER_TEXT, CSP,
} from '../lib/report-pages/core.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8')
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// ── 1. 토큰 ──────────────────────────────────────────────────────
t(`엔트로피 ≥128비트 (실제 ${TOKEN_BYTES * 8})`, TOKEN_BYTES * 8 >= 128)
const toks = Array.from({ length: 2000 }, newToken)
t('2000개 전부 형식(base64url 43자)', toks.every((x) => TOKEN_RE.test(x)))
t('2000개 전부 서로 다르다', new Set(toks).size === toks.length)
const chars = new Set(toks.join(''))
t(`문자 분포: 64종 거의 다 쓰인다 (실제 ${chars.size})`, chars.size >= 62)
t('URL-safe: + / = 없음', toks.every((x) => !/[+/=]/.test(x)))
for (const bad of ['', 'short', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + '/', 'a'.repeat(42) + '.', 'a'.repeat(42) + '%', '../' + 'a'.repeat(40)]) {
  t(`형식 오류 거부: ${JSON.stringify(bad.slice(0, 12))}…(${bad.length}자)`, !TOKEN_RE.test(bad))
}
t('자리표시 토큰은 형식이 맞다(형식 오류도 같은 쿼리를 돈다)', TOKEN_RE.test(DUMMY_TOKEN))
const m = maskedUrl('https://example.test/', toks[0])
t('마스킹 URL: 꼴은 /r/ · 전체 토큰은 안 보인다', m.startsWith('https://example.test/r/') && !m.includes(toks[0]) && m.includes('masked'))

// ── 2. 봇 UA 분류 ────────────────────────────────────────────────
const BOTS = [
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Twitterbot/1.0',
  'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
  'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.4266; Pro)',
  'Mozilla/5.0 (compatible; Barracuda Sentinel)',
  'Proofpoint URL Defense',
  'Mimecast-URL-Protect',
  'python-requests/2.31.0',
  'curl/8.4.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
  'LinkedInBot/1.0', 'Discordbot/2.0', 'TelegramBot (like TwitterBot)', 'WhatsApp/2.23.20.0',
  'facebookexternalhit/1.1;kakaotalk-scrap/1.0;', 'Go-http-client/1.1', 'Wget/1.21', 'Googlebot/2.1',
  'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)', 'Mozilla/5.0 (compatible; AhrefsBot/7.0)',
]
for (const ua of BOTS) t(`bot: ${ua.slice(0, 50)}`, classifyView(ua) === 'bot')
const HUMANS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.1',
  'Mozilla/5.0 (Linux; Android 13; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.3.4)',
  'Mozilla/5.0 (Linux; Android 12; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
]
for (const ua of HUMANS) t(`browser: ${ua.slice(-50)}`, classifyView(ua) === 'browser')
t('UA 없음 → bot', classifyView(null) === 'bot' && classifyView('  ') === 'bot')
t('HEAD → bot', classifyView(HUMANS[0], 'HEAD') === 'bot')
t('프리페치(Sec-Purpose) → bot', classifyView(HUMANS[0], 'GET', 'prefetch;prerender') === 'bot')

// ── 3. 10분 중복 합산 ────────────────────────────────────────────
const T0 = Date.parse('2026-11-03T00:00:00Z')
const at = (min, kind = 'browser') => ({ viewed_at: new Date(T0 + min * 60_000).toISOString(), kind })
t('창 = 10분', DEDUP_WINDOW_MS === 600_000)
t('0건 → 0', estimateViews([]) === 0)
t('같은 10분 안 3회 → 1', estimateViews([at(0), at(3), at(9.9)]) === 1)
t('정확히 10분 뒤 → 2', estimateViews([at(0), at(10)]) === 2)
t('3분 간격 연속 9회(0~24분) → 앵커 기준 3회(0·12·24)', estimateViews([0, 3, 6, 9, 12, 15, 18, 21, 24].map((x) => at(x))) === 3)
t('정렬 안 된 입력도 같다', estimateViews([at(30), at(0), at(5)]) === 2)
t('bot 행은 세지 않는다', estimateViews([at(0, 'bot'), at(20, 'bot'), at(40, 'bot')]) === 0)
t('bot 이 browser 사이에 끼어도 창을 늘리지 않는다', estimateViews([at(0), at(8, 'bot'), at(11)]) === 2)
t('깨진 시각은 버린다', estimateViews([{ viewed_at: 'x', kind: 'browser' }, at(0)]) === 1)

// ── 4. 헤더·noindex·격리 렌더 ────────────────────────────────────
const h = responseHeaders()
t('X-Robots-Tag: noindex, nofollow', h['X-Robots-Tag'] === 'noindex, nofollow')
t('Referrer-Policy: no-referrer', h['Referrer-Policy'] === 'no-referrer')
t('Cache-Control: private, no-store', h['Cache-Control'] === 'private, no-store')
t('CSP 헤더 = 스크립트 없음(default-src none, script-src 미허용)', h['Content-Security-Policy'] === CSP && CSP.includes("default-src 'none'") && !/script-src/.test(CSP))
t('CSP: 외부 이미지 차단(img-src data: 만)', /img-src data:(;|$)/.test(CSP))
t('CSP: 다른 사이트가 이 페이지를 프레임에 못 싣는다', CSP.includes("frame-ancestors 'none'") && h['X-Frame-Options'] === 'DENY')

const FAKE = '<!doctype html><html><body><h1>가짜 결론서 (셀프테스트)</h1><p>"따옴표" & 앰퍼샌드</p>'
  + '"><script>alert(1)</script><img src=x onerror=alert(2)><a href="https://example.test">x</a></body></html>'
const page = renderReportPage(FAKE)
t('meta robots noindex', page.includes('<meta name="robots" content="noindex, nofollow, noarchive">'))
t('meta referrer no-referrer', page.includes('<meta name="referrer" content="no-referrer">'))
t('sandbox iframe(허용 0개)', /<iframe sandbox="" referrerpolicy="no-referrer"[^>]* srcdoc="/.test(page))
t('결론서 HTML 이 껍데기에 날것으로 안 섞인다(<script>·onerror 태그 없음)', !page.includes('<script') && !page.includes('<img'))
t('srcdoc 탈출 불가: 따옴표가 &quot; 로', !page.includes('"><script') && page.includes('&quot;&gt;&lt;script&gt;'))
const footerAt = page.indexOf(`<footer>${FOOTER_TEXT}</footer>`)
t('하단 고지 줄은 iframe 밖(부모 문서)에 코드로 들어간다', footerAt > page.indexOf('</iframe>'))
t('고지 문구 고정', FOOTER_TEXT === "솔루션아카이브 김남헌 · hanazi8282@gmail.com · 수신을 원치 않으시면 '수신거부'라고 회신해 주세요.")
for (const [n, b] of [['404', NOT_FOUND_HTML], ['503', UNAVAILABLE_HTML]]) {
  t(`${n} 본문도 noindex`, b.includes('noindex'))
}

// ── 5. 라우트: 열거 방지·단일 404·헤더 한 곳 ─────────────────────
const route = read('app/r/[token]/route.ts')
t('라우트 응답은 전부 send()(같은 헤더)를 거친다', !/new Response\((?!body|null)/.test(route) && /headers: responseHeaders\(\)/.test(route))
t('404 경로는 한 줄: 형식 오류 · 없음 · 회수 공통', (route.match(/NOT_FOUND_HTML, 404/g) ?? []).length === 1 && /if \(!valid \|\| !data\) return send\(NOT_FOUND_HTML, 404\)/.test(route))
t('형식 오류도 자리표시 토큰으로 같은 쿼리를 돈다', /valid \? raw : DUMMY_TOKEN/.test(route))
t('회수 행은 쿼리에서 빠진다(revoked_at IS NULL)', route.includes(".is('revoked_at', null)"))
t('열람 기록은 응답 뒤(after)', /after\(async/.test(route))
t('로그에 토큰을 찍지 않는다', !/console\.\w+\([^)]*token/.test(route))
t('라우트가 결론서를 신뢰 렌더하지 않는다(dangerouslySetInnerHTML 없음)', !route.includes('dangerouslySetInnerHTML'))

// ── 6. 저장 칸: IP·이메일·UA 없음 ────────────────────────────────
t('viewRow 칸 = token, kind 뿐', JSON.stringify(Object.keys(viewRow(toks[0], 'browser')).sort()) === '["kind","token"]')
t('라우트 INSERT 는 viewRow 만', /insert\(viewRow\(token, kind\)\)/.test(route) && (route.match(/\.insert\(/g) ?? []).length === 1)
const mig = read('supabase/migrations/20261103000020_report_pages.sql')
const viewsDdl = mig.match(/CREATE TABLE IF NOT EXISTS public\.report_views \(([\s\S]*?)\n\);/)?.[1] ?? ''
t('마이그에서 report_views DDL 추출', viewsDdl.includes('kind'))
const cols = viewsDdl.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => c && !c.startsWith('--'))
t(`report_views 칸 = id, token, viewed_at, kind (실제 ${cols.join(',')})`, JSON.stringify(cols) === '["id","token","viewed_at","kind"]')
t('DDL 에 ip/email/user_agent/ua 칸 없음', !/\b(ip|ip_addr|ip_address|email|user_agent|ua|referer|referrer)\b\s+(text|inet|varchar)/i.test(viewsDdl))
t('kind CHECK 2분류', /CHECK \(kind IN \('bot', 'browser'\)\)/.test(viewsDdl))
t('두 표 RLS 켬 · 정책 0 · anon 회수', /report_pages ENABLE ROW LEVEL SECURITY/.test(mig) && /report_views ENABLE ROW LEVEL SECURITY/.test(mig)
  && !/CREATE POLICY/i.test(mig) && /REVOKE ALL ON public\.report_pages FROM anon, authenticated/.test(mig))
t('토큰 CHECK 가 코드 TOKEN_RE 와 같다', mig.includes("CHECK (token ~ '^[A-Za-z0-9_-]{43}$')") && TOKEN_RE.source === '^[A-Za-z0-9_-]{43}$')
t('롤백 파일 존재', existsSync(`${ROOT}/supabase/migrations/20261103000020_report_pages_rollback.sql`))
const script = read('scripts/report-pages.mjs')
t('관리 스크립트가 키를 출력하지 않는다', !/console\.\w+\([^)]*\bkey\b/.test(script) && !/die\([^)]*\$\{key/.test(script))
t('관리 스크립트 기본 출력은 마스킹', script.includes('maskedUrl(BASE_URL, token)') && /if \(has\('reveal'\)\)/.test(script))
t('주석·문서에 "A등급 아닌 추정치" 명기', /A등급/.test(read('lib/report-pages/core.ts')) && /A등급/.test(read('ops/report-pages.md')) && /A등급/.test(mig))

// ── 7. robots.txt · sitemap ──────────────────────────────────────
t('robots.txt: Disallow /r/', /^Disallow: \/r\/$/m.test(read('public/robots.txt')))
const appFiles = readdirSync(`${ROOT}/app`, { recursive: true }).map(String)
const sitemaps = [...appFiles.filter((f) => /(^|[\\/])sitemap\.(ts|js|xml)$/.test(f)).map((f) => `app/${f}`),
  ...readdirSync(`${ROOT}/public`).filter((f) => /^sitemap.*\.xml$/.test(f)).map((f) => `public/${f}`)]
t(`sitemap 에 /r/ 없음 (sitemap ${sitemaps.length}개)`, sitemaps.every((f) => !read(f).includes('/r/')))

console.log(`${fail ? '✗' : '통과'} ${pass}건${fail ? ` · 실패 ${fail}건` : ''} — 토큰 · 봇 분류 · 10분 합산 · 헤더/noindex · 격리 렌더 · 저장 칸 · robots`)
process.exit(fail ? 1 : 0)
