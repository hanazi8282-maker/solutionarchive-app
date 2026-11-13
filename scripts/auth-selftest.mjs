#!/usr/bin/env node
// 로그인 보호 셀프테스트 — lib/auth/policy.ts + 코드에서 뽑은 라우트 목록 대조. 네트워크·DB 없음.
//   node scripts/auth-selftest.mjs
//
// 목록을 손으로 적지 않고 코드에서 뽑는다(§7.1): 크론 라우트·페이지·서버 액션이 새로 생기면
// 이 검사가 자동으로 그것까지 본다. 뽑은 개수가 기대보다 적으면 "검사 대상 0건 통과"로 접히지 않게 실패한다.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  parseAllowlist, isPublicPath, resolveAuth, guardFromVerdict, denyStatus, safeNext,
  isConsultOpen, isConsultUserPath, resolveConsultUser, consultAuthBypassActive,
} from '../lib/auth/policy.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// ── 1. 허용 목록 파서 ───────────────────────────────────────────
const list = parseAllowlist(' Hanazi8282@Gmail.com , kimnh030820@postech.ac.kr ,, ')
t('파서: 공백·대소문자 정리 후 2건', list?.size === 2 && list.has('hanazi8282@gmail.com') && list.has('kimnh030820@postech.ac.kr'))
t('파서: env 없음 = null(fail-closed)', parseAllowlist(undefined) === null)
t('파서: 빈 문자열 = null', parseAllowlist('') === null)
t('파서: 쉼표·공백뿐 = null', parseAllowlist(' , ,') === null)

// ── 2. 경로 매처 ─────────────────────────────────────────────────
const files = readdirSync(`${ROOT}/app`, { recursive: true }).map((f) => String(f).replaceAll('\\', '/'))
const routeOf = (f) => '/' + f.replace(/(^|\/)(page\.tsx|route\.tsx?)$/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/')

// 2a. requireCronAuth 를 쓰는 라우트 + vercel.json 크론은 전부 공개(로그인에 막히면 크론이 죽는다)
const cronRoutes = files
  .filter((f) => /^api\/.*\/route\.tsx?$/.test(f) && readFileSync(`${ROOT}/app/${f}`, 'utf8').includes('requireCronAuth('))
  .map(routeOf)
const vercelCrons = JSON.parse(readFileSync(`${ROOT}/vercel.json`, 'utf8')).crons.map((c) => c.path)
// 2026-09-20: publish · sync-conversions 삭제(존재하지 않는 테이블) → 7 → 5. 남은 5: callback 제외 refresh-token·match-posts·collect-metrics·collect-replies + insight/capture.
t(`크론 인증 라우트 추출 ≥5건 (실제 ${cronRoutes.length})`, cronRoutes.length >= 5)
t(`vercel.json 크론 추출 ≥4건 (실제 ${vercelCrons.length})`, vercelCrons.length >= 4)
for (const p of [...cronRoutes, ...vercelCrons]) t(`공개(크론): ${p}`, isPublicPath(p))
for (const p of ['/api/threads/match-posts', '/api/insight/kakao-webhook', '/login', '/auth/login', '/auth/callback', '/auth/logout',
  '/onboarding/quiz', '/api/onboarding/quiz', '/api/onboarding/quiz/share']) t(`공개: ${p}`, isPublicPath(p))

// 2026-09-25 VOC 화면(옛 /signals, 2026-10-01 개명) — PUBLIC_EXACT 정확일치로만 연다(접두사 아님).
const SIGNAL_PAGES = ['/voc', '/voc/community', '/voc/card']
// 2b. 페이지는 /login·/onboarding 말고 전부 보호(새 화면은 기본 잠김)
const pages = files.filter((f) => /(^|\/)page\.tsx$/.test(f)).map(routeOf)
t(`페이지 추출 ≥8건 (실제 ${pages.length})`, pages.length >= 8)
for (const p of pages) {
  // 2026-09-23: 랜딩 `/` 와 승인 칼럼 읽기 `/columns/read` 추가(둘 다 남헌 명시 승인).
  const shouldBePublic = p === '/' || p === '/login' || p.startsWith('/onboarding')
    || p.startsWith('/columns/read') || p.startsWith('/library') || p.startsWith('/r/') // v71ci R11 결론서 공개 출구
    || SIGNAL_PAGES.includes(p) // 2026-09-25 남헌 위임 B항 — 정확일치 공개(아래 2d)
    || p === '/cases/report' // 2026-09-25 남헌 결정 2 — 체험판 정확일치 공개(아래 2e)
  t(`${shouldBePublic ? '공개' : '보호'}(페이지): ${p}`, isPublicPath(p) === shouldBePublic)
}
// 2026-09-23 공개 라이브러리 — `/library` 접두사는 열되 검수 `/cases/*` 는 닫혀 있어야 한다(남헌 확정).
t('공개(라이브러리 그리드): /library', isPublicPath('/library'))
t('공개(라이브러리 상세): /library/convertkit-concierge-migration-conversion', isPublicPath('/library/convertkit-concierge-migration-conversion'))
t('공개(라이브러리 OG): /library/x/opengraph-image', isPublicPath('/library/x/opengraph-image'))
// 방법론 공개 페이지. 정책을 넓히지 않았다는 것을 여기서 확인한다 — 접두사만으로 공개다.
t('공개(방법론): /library/methodology', isPublicPath('/library/methodology'))
// ⚠️ `/library/saved`(내 저장함)도 접두사 때문에 **proxy 는 통과시킨다.** 그건 버그가 아니라
//    이 목록의 뜻이다 — 그래서 `app/library/saved/page.tsx` 가 스스로 판정해 /login 으로 보낸다.
//    이 줄은 그 사실을 고정한다: 여기가 false 로 바뀌면 페이지의 자체 가드가 중복이 되는 게 아니라,
//    정책이 바뀐 것이므로 그 변경을 사람이 봐야 한다(인증 경계 = §10.2 사람 판단).
t('공개(접두사): /library/saved — 페이지가 스스로 막는다', isPublicPath('/library/saved'))
// 2026-09-25 남헌 승인 — 폐업 케이스 카드 썸네일(public/case-art/<slug>.jpg)만 공개. 이미지 파일 하나의 꼴로만 연다.
for (const p of ['/case-art/homejoy-discount-conversion-collapse.jpg', '/case-art/zume-pizza-mobile-oven-production-collapse.jpg', '/case-art/x-1.png', '/case-art/a.webp']) {
  t(`공개(케이스 아트 이미지): ${p}`, isPublicPath(p))
}
for (const p of ['/case-art', '/case-art/', '/case-art/credits.json', '/case-art/a.svg', '/case-art/a.jpg/', '/case-art/sub/a.jpg', '/case-artx/a.jpg', '/CASE-ART/a.jpg', '/case-art/../dashboard']) {
  t(`보호(케이스 아트 공개가 파일 하나 꼴 밖으로 번지지 않는다): ${p}`, !isPublicPath(p))
}
for (const p of ['/libraryx', '/cases/convertkit-concierge-migration-conversion', '/cases/search', '/cases/grade']) {
  t(`보호(라이브러리 공개가 검수 화면까지 번지지 않는다): ${p}`, !isPublicPath(p))
}
for (const p of ['/dashboard', '/agents', '/cases', '/analyze', '/analyze/new', '/analyze/x/review',
  '/api/analyze/extract', '/api/deploy-status', '/api/threads/callback', '/api/threads/callback/',
  '/loginx', '/authz', '/api/threadsx', '/onboardingx']) t(`보호: ${p}`, !isPublicPath(p))

// 2c. 랜딩 공개가 번지지 않는가 — 이 검사가 이 리포에서 가장 비싼 실수를 막는다.
// `/` 를 PUBLIC_PREFIXES 에 넣으면 "이 아래 전부 공개"가 되어 앱 전체가 익명에게 열린다.
t('공개(랜딩): /', isPublicPath('/'))
t('공개(랜딩 OG 이미지): /opengraph-image', isPublicPath('/opengraph-image'))

// 2026-09-23 기능 5 — `/columns/read` 접두사는 열되 **검수 화면 `/columns` 는 닫혀 있어야 한다.**
// 접두사 하나가 형제 경로까지 여는지를 보는 자리다(랜딩 `/` 와 같은 종류의 실수).
t('공개(칼럼 읽기 목록): /columns/read', isPublicPath('/columns/read'))
t('공개(칼럼 본문): /columns/read/convertkit', isPublicPath('/columns/read/convertkit'))
t('공개(칼럼 OG): /columns/read/x/opengraph-image', isPublicPath('/columns/read/x/opengraph-image'))
for (const p of ['/columns', '/columns/decide', '/columns/readx']) {
  t(`보호(칼럼 공개가 검수 화면까지 번지지 않는다): ${p}`, !isPublicPath(p))
}
for (const p of ['/x', '/settings/profile', '/columns', '/discovery', '/api/profile', '/api/analyze/advisor',
  '/api/cron', '/opengraph-image/x', '/opengraph-imagex', '//evil.com']) {
  t(`보호(랜딩 공개가 번지지 않는다): ${p}`, !isPublicPath(p))
}
// 위 음성들은 지금의 under() 구현(`${p}/` 로 이어 붙여 비교) 덕에 `/` 가 접두사 목록에 있어도
// 통과한다. 그래서 목록 자체를 본다 — 목록의 뜻은 "이 아래 전부 공개"이고 `/` 아래는 앱 전체다.
const prefixBlock = readFileSync(`${ROOT}/lib/auth/policy.ts`, 'utf8').match(/const PUBLIC_PREFIXES = \[([\s\S]*?)\n\]/)?.[1] ?? ''
t('PUBLIC_PREFIXES 블록 추출(못 뽑았으면 아래 검사는 무의미하다)', prefixBlock.includes("'/login'"))
t("PUBLIC_PREFIXES 에 '/' 단독 항목이 없다 — 랜딩은 정확일치 분기로만 연다", !/(^|[\s[])'\/'\s*,/.test(prefixBlock))

// 2d. VOC 화면(남헌 2026-09-25 위임 B항) — 정확일치라 이웃·하위 경로는 닫혀 있어야 한다.
for (const p of SIGNAL_PAGES) t(`공개(VOC): ${p}`, isPublicPath(p))
for (const p of ['/vocx', '/voc/', '/voc/x', '/voc/community/x', '/voc/card/x', '/api/voc', '/api/signals',
  // 2026-10-01 신호→VOC 개명: 옛 경로는 next.config 301 이 proxy 앞에서 처리한다 — 정책상 더는 공개가 아니다.
  '/signals', '/signals/community', '/signals/card']) {
  t(`보호(VOC 공개가 이웃 경로로 번지지 않는다): ${p}`, !isPublicPath(p))
}
t('PUBLIC_PREFIXES 에 /voc 가 없다 — 정확일치로만 연다', !prefixBlock.includes("'/voc"))
// 유사 케이스 검색 API — 검수 화면 /cases/search 의 짝. 로그인 전용이다(CEO-STAFF 09-25 확인: 목록에 없었다).
t('보호: /api/cases/search', !isPublicPath('/api/cases/search'))

// 2e. 아이디어 매칭 리포트 체험판(남헌 2026-09-25 결정 2) — 정확일치. 이웃·하위·검수 형제는 닫혀 있어야 한다.
t('공개(체험판): /cases/report', isPublicPath('/cases/report'))
for (const p of ['/cases/reportx', '/cases/report/x', '/cases', '/cases/search']) {
  t(`보호(체험판 공개가 이웃 경로로 번지지 않는다): ${p}`, !isPublicPath(p))
}
t('PUBLIC_PREFIXES 에 /cases 가 없다 — 정확일치로만 연다', !prefixBlock.includes("'/cases"))

// ── 3. 세션 판정 + 서버 액션 가드 ───────────────────────────────
const ALLOW = 'hanazi8282@gmail.com, kimnh030820@postech.ac.kr'
const ok = (email) => async () => ({ data: { user: { email } }, error: null })
const err = (name, status, message = 'x') => async () => ({ data: { user: null }, error: { name, status, message } })

let called = false
const unset = await resolveAuth('', async () => { called = true; return { data: { user: { email: 'hanazi8282@gmail.com' } }, error: null } })
t('허용 목록 비면 로그인돼 있어도 잠금 + Supabase 호출 안 함', unset.kind === 'allowlist_unset' && !called)

const cases = [
  ['허용 이메일(대소문자 무시) → 통과', await resolveAuth(ALLOW, ok('HANAZI8282@gmail.com')), 'allowed'],
  ['세션 없음(AuthSessionMissingError 400) → anonymous', await resolveAuth(ALLOW, err('AuthSessionMissingError', 400)), 'anonymous'],
  ['무효 토큰 401 → anonymous', await resolveAuth(ALLOW, err('AuthApiError', 401)), 'anonymous'],
  ['user null → anonymous', await resolveAuth(ALLOW, async () => ({ data: { user: null }, error: null })), 'anonymous'],
  ['허용 목록 밖 → forbidden', await resolveAuth(ALLOW, ok('someone@gmail.com')), 'forbidden'],
  ['이메일 없는 사용자 → forbidden', await resolveAuth(ALLOW, ok(undefined)), 'forbidden'],
  ['네트워크 실패(Retryable, 0) → unavailable', await resolveAuth(ALLOW, err('AuthRetryableFetchError', 0, 'fetch failed')), 'unavailable'],
  ['Supabase 503 → unavailable', await resolveAuth(ALLOW, err('AuthRetryableFetchError', 503)), 'unavailable'],
  ['429 → unavailable', await resolveAuth(ALLOW, err('AuthApiError', 429)), 'unavailable'],
  ['상태 없는 오류(AuthUnknownError) → unavailable', await resolveAuth(ALLOW, err('AuthUnknownError', undefined)), 'unavailable'],
  ['getUser 가 throw → unavailable', await resolveAuth(ALLOW, async () => { throw new Error('boom') }), 'unavailable'],
  ['공개 env 없음(클라이언트 null) → unavailable', await resolveAuth(ALLOW, null), 'unavailable'],
]
for (const [name, v, kind] of cases) t(`판정: ${name} (실제 ${v.kind})`, v.kind === kind)

for (const [name, v] of cases) {
  const g = guardFromVerdict(v)
  if (v.kind === 'allowed') t(`가드 통과+이메일: ${name}`, g.ok === true && g.email === 'hanazi8282@gmail.com')
  else t(`가드 거절+저장 안 함 문구: ${name}`, g.ok === false && g.message.includes('저장하지 않았습니다'))
}
const outage = guardFromVerdict(cases[6][1])
t('장애 문구는 "확인 불가"이지 "로그인 필요"가 아니다', !outage.ok && outage.message.includes('인증 확인 불가') && !outage.message.includes('로그인이 필요'))
t('HTTP: anonymous 401 · forbidden 403 · unset 503 · unavailable 503',
  denyStatus(cases[1][1]) === 401 && denyStatus(cases[4][1]) === 403 && denyStatus(unset) === 503 && denyStatus(cases[6][1]) === 503)

t('next: 외부 URL 버림', safeNext('https://evil.com') === '/dashboard' && safeNext('//evil.com') === '/dashboard' && safeNext('/\\evil.com') === '/dashboard')
t('next: 내부 경로 유지', safeNext('/cases?x=1') === '/cases?x=1' && safeNext(null) === '/dashboard')

// ── 4. 'use server' 파일의 모든 export 가 DB 접근 전에 가드를 부르는가 ─────
const actionFiles = files.filter((f) => /\.tsx?$/.test(f) && /^['"]use server['"]/m.test(readFileSync(`${ROOT}/app/${f}`, 'utf8')))

// ⚠️ **가드 예외 목록.** 여기 이름을 더하는 것은 인증 경계를 넓히는 변경이다 —
//    CLAUDE.md §10.2 사람 판단 예외이고, 승인 없이 더하면 안 된다.
//    지금 1건: `submitCaseFeedback` — **남헌 2026-09-23 명시 승인: 익명 피드백 허용, 하루 1회 제한.**
//    (`/library/<slug>` 의 👍/👎 를 로그인 없이 받는다. 근거는 그 파일 헤더 주석에도 적혀 있다.)
//    예외를 **좁게** 고정한다: 목록 길이 1 · 그 액션이 가드 대신 하루 1회 제한을 실제로 세는가 ·
//    파일이 승인 근거를 적고 있는가. 가드도 없고 제한도 없으면 그냥 열린 쓰기 경로다.
const GUARD_EXEMPT = new Map([
  ['submitCaseFeedback', { file: 'library/[slug]/actions.ts', approval: '남헌 2026-09-23 명시 승인' }],
])
const guarded = []
const exempted = []
for (const f of actionFiles) {
  const src = readFileSync(`${ROOT}/app/${f}`, 'utf8')
  const chunks = src.split(/export async function (\w+)/).slice(1)
  for (let i = 0; i < chunks.length; i += 2) {
    const [name, body] = [chunks[i], chunks[i + 1]]
    const exempt = GUARD_EXEMPT.get(name)
    if (exempt) {
      t(`가드 예외는 승인된 파일에서만: app/${f} ${name}`, f === exempt.file)
      t(`가드 예외 파일에 승인 근거가 적혀 있다: ${name}`, src.includes(exempt.approval) && src.includes('하루 1회 제한'))
      // 음성: 가드를 뺀 대신 제한을 세야 한다. 이 줄이 빠지면 익명 무제한 쓰기가 된다.
      t(`가드 예외 액션은 하루 1회 제한을 센다: ${name}`, /withinDailyLimit\(/.test(body))
      t(`가드 예외 액션도 확인 불가면 저장하지 않는다: ${name}`, /'unknown'/.test(body))
      exempted.push(name)
      continue
    }
    // 부르기만 하고 결과를 버리면 가드가 아니다 — 바로 다음 줄에서 거절을 돌려줘야 한다.
    const g = body.search(/const (\w+) = await requireAllowedUser\(\)\s*\n\s*if \(!\1\.ok\) return /)
    const db = body.search(/createClient\(|\.from\(/)
    t(`가드 선행(호출+거절 반환): app/${f} ${name}`, g >= 0 && (db < 0 || g < db))
    guarded.push(name)
  }
}
// toggleSave: `/library` 접두사가 공개라 이 액션만은 proxy 가 안 막아 준다 — 가드가 유일한 방어선이다.
// (같은 폴더의 submitCaseFeedback 이 예외라고 해서 그 옆 액션까지 풀리지 않는다 — 이 줄이 그걸 고정한다.)
for (const name of ['createPost', 'createSnapshot', 'linkDraft', 'decideMove', 'decideCase', 'toggleSave']) t(`서버 액션 검사 대상에 포함: ${name}`, guarded.includes(name))
// 음성: 예외가 딱 1건인가. 늘어나면 사람이 봐야 한다(인증 경계 변경).
t(`가드 예외는 1건뿐 (실제 ${exempted.length}: ${exempted.join(', ') || '없음'})`, exempted.length === 1 && exempted[0] === 'submitCaseFeedback')
t('예외 액션이 가드 목록에 중복 계상되지 않는다', !guarded.includes('submitCaseFeedback'))

// ── 5. API 라우트 핸들러 가드 (2026-10-01 I4) ────────────────────
// requireAllowedUser 를 쓰는 route.ts 는 **모든** export 핸들러(GET·POST…)가 첫 DB 접근 전에 가드+거절 반환을 한다.
// 한 핸들러만 가드하고 옆 핸들러를 빠뜨리면 proxy 가 유일한 방어선이 된다. 앵글 검증 API 는 반드시 이 검사 대상이다.
const guardRe = /const (\w+) = await requireAllowedUser\(\)\s*\n\s*if \(!\1\.ok\) return /
const guardFirst = (body) => {
  const g = body.search(guardRe)
  const db = body.search(/createClient\(|\.from\(|deps\(\)|runProbe\(/)
  return g >= 0 && (db < 0 || g < db)
}
const guardedRoutes = []
for (const f of files.filter((x) => /^api\/.*\/route\.tsx?$/.test(x))) {
  const src = readFileSync(`${ROOT}/app/${f}`, 'utf8')
  if (!src.includes('requireAllowedUser(')) continue
  const chunks = src.split(/export async function (GET|POST|PUT|PATCH|DELETE)\b/).slice(1)
  for (let i = 0; i < chunks.length; i += 2) {
    const [method, body] = [chunks[i], chunks[i + 1]]
    t(`가드 선행(API): app/${f} ${method}`, guardFirst(body))
    guardedRoutes.push(`${routeOf(f)} ${method}`)
  }
}
for (const h of ['/api/cases/report/angles GET', '/api/cases/report/angles POST']) t(`API 가드 검사 대상에 포함: ${h}`, guardedRoutes.includes(h))
t('보호: /api/cases/report/angles (proxy 기본 잠김, 공개 목록에 없다)', !isPublicPath('/api/cases/report/angles'))
// 음성: 가드 없는 핸들러를 넣으면 위 정규식이 잡는지(거짓 초록불 방지).
t('음성: 가드 없는 핸들러는 실패', !guardFirst('(req) {\n  const d = await deps()\n  return d\n}'))
t('음성: DB 접근 뒤에 가드하면 실패', !guardFirst('(req) {\n  const d = await deps()\n  const auth = await requireAllowedUser()\n  if (!auth.ok) return x\n}'))
t('음성: 가드를 부르고 결과를 버리면 실패', !guardFirst('(req) {\n  await requireAllowedUser()\n  const d = await deps()\n}'))
t('양성: 가드 → 거절 반환 → DB', guardFirst('(req) {\n  const auth = await requireAllowedUser()\n  if (!auth.ok) return x\n  const d = await deps()\n}'))

// v71ci R0 — 컨설팅 외부 사용자 영역. 열림 / 로그인만 / 허용 목록(관리자) 세 갈래가 섞이지 않아야 한다.
for (const p of ['/consult', '/consult/login', '/consult/auth/otp']) t(`consult 열림: ${p}`, isConsultOpen(p) && !isConsultUserPath(p))
for (const p of ['/consult/new', '/consult/run/abc', '/api/consult/diagnose', '/consult/loginx']) t(`consult 로그인만: ${p}`, !isConsultOpen(p) && isConsultUserPath(p))
for (const p of ['/consult/admin', '/consult/admin/payments']) t(`consult 관리자(허용 목록): ${p}`, !isConsultOpen(p) && !isConsultUserPath(p) && !isPublicPath(p))
t('consult 안내 화면 /consult/denied 는 로그인 없이 열린다', isConsultOpen('/consult/denied') && !isConsultUserPath('/consult/denied'))
const proxySrc = readFileSync(`${ROOT}/proxy.ts`, 'utf8')
t('proxy: /consult/admin 거절은 내부 /login 이 아니라 /consult/denied 로 간다', proxySrc.includes("'/consult/denied'") && proxySrc.includes("pathname === '/consult/admin'"))
for (const p of ['/consultx', '/dashboard', '/api/threads/callback']) t(`consult 아님(기존 판정 유지): ${p}`, !isConsultOpen(p) && !isConsultUserPath(p))
t('consult 열림이 내부 공개 경로로 새지 않는다: /consult 는 isPublicPath 거짓', !isPublicPath('/consult') && !isPublicPath('/consult/new'))
{
  const ok = (email) => async () => ({ data: { user: { email } }, error: null })
  t('consult 사용자: 이메일 있으면 ok(허용 목록 무관)', (await resolveConsultUser(ok('Someone@Example.com'))).email === 'someone@example.com')
  t('consult 사용자: 세션 없음 = anonymous', (await resolveConsultUser(async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400, message: 'x' } }))).kind === 'anonymous')
  t('consult 사용자: 이메일 없는 계정 = anonymous', (await resolveConsultUser(ok(''))).kind === 'anonymous')
  t('consult 사용자: 5xx = unavailable(접지 않는다)', (await resolveConsultUser(async () => ({ data: { user: null }, error: { name: 'AuthApiError', status: 503, message: 'x' } }))).kind === 'unavailable')
  t('consult 사용자: 클라이언트 없음 = unavailable', (await resolveConsultUser(null)).kind === 'unavailable')
}

// ── 2026-11-13 로그인 우회(지시서 §1) — 환경변수 미설정 시 절대 동작 안 함을 확인한다 ──
{
  const noUser = async () => { throw new Error('bypass 가 활성화됐어야 getUser 를 안 부른다') }
  const now = new Date('2026-11-13T05:00:00Z')
  const until90 = new Date('2026-11-13T06:30:00Z').toISOString() // +90분 정확히
  const until91 = new Date('2026-11-13T06:31:00Z').toISOString() // +91분(상한 초과)
  const untilPast = new Date('2026-11-13T04:00:00Z').toISOString() // 과거(만료)

  t('우회: 둘 다 올바르면 활성', consultAuthBypassActive('1', until90, now))
  t('우회: CONSULT_AUTH_DISABLED 미설정 = 비활성', !consultAuthBypassActive(undefined, until90, now))
  t('우회: CONSULT_AUTH_DISABLED 가 "1" 아닌 값 = 비활성', !consultAuthBypassActive('true', until90, now))
  t('우회: CONSULT_AUTH_DISABLED_UNTIL 미설정 = 비활성', !consultAuthBypassActive('1', undefined, now))
  t('우회: 만료 시각이 파싱 안 되면 비활성', !consultAuthBypassActive('1', 'not-a-date', now))
  t('우회: 만료 시각이 과거면 비활성(자동 복구)', !consultAuthBypassActive('1', untilPast, now))
  t('우회: 90분 경계는 활성', consultAuthBypassActive('1', until90, now))
  t('우회: 90분을 넘으면 비활성(최대 길이 상한)', !consultAuthBypassActive('1', until91, now))

  t(
    'resolveConsultUser: bypass 인자 자체를 안 넘기면 항상 비활성(기존 호출부 호환·기본 안전)',
    (await resolveConsultUser(noUser)).kind === 'unavailable',
  )
  const r = await resolveConsultUser(noUser, { disabledRaw: '1', untilRaw: until90 })
  t('resolveConsultUser: 우회 활성 시 getUser 를 부르지 않고 test_ 고정 사용자로 처리', r.kind === 'ok' && r.email.startsWith('test_'))
  const r2 = await resolveConsultUser(null, { disabledRaw: '0', untilRaw: until90 })
  t('resolveConsultUser: CONSULT_AUTH_DISABLED != "1" 이면 평소 판정(클라이언트 없음 = unavailable)', r2.kind === 'unavailable')
}
t('공개(결론서 출구): /r/<token>', isPublicPath('/r/0123456789abcdef0123456789abcdef'))
for (const p of ['/rx', '/report', '/r']) t(`결론서 출구 아님: ${p} 는 접두사 경계 밖(/r 단독은 열려도 무해하나 /rx·/report 는 닫힘)`, p === '/r' ? true : !isPublicPath(p))
// proxy 배선 — 정책 함수만 맞아서는 부족하다(2026-11-11 프로덕션에서 /consult 가 내부 로그인으로 튕긴 사고). proxy.ts 가 열린 경로를 실제로 통과시키는지 소스로 확인한다.
{
  const px = readFileSync(`${ROOT}/proxy.ts`, 'utf8')
  const early = px.indexOf('if (isPublicPath(pathname) || isConsultOpen(pathname)) return withConsultNoIndex(NextResponse.next(), pathname)')
  t('proxy: 열린 컨설팅 경로를 Supabase 호출 전에 통과', early >= 0 && early < px.indexOf('createServerClient('))
  t('proxy: 컨설팅 사용자 경로는 resolveConsultUser 로 판정', px.includes('isConsultUserPath(pathname)') && px.includes('resolveConsultUser('))
  // 2026-11-13: 우회 창에서도 proxy.ts 가 env 를 직접(process.env.X) 읽어 넘긴다 — Edge 런타임 인라인 치환 호환.
  t('proxy: CONSULT_AUTH_DISABLED/_UNTIL 을 resolveConsultUser 에 명시적으로 전달', px.includes('disabledRaw: process.env.CONSULT_AUTH_DISABLED') && px.includes('untilRaw: process.env.CONSULT_AUTH_DISABLED_UNTIL'))
  t('proxy: /consult/admin 은 resolveConsultUser 를 타지 않는다(우회 미닿음, isConsultUserPath 가 이미 제외)', !isConsultUserPath('/consult/admin'))
}

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 허용 목록 파서 · 공개/보호 경로(크론 ${cronRoutes.length}·페이지 ${pages.length}) · 세션 3상태 판정 · 서버 액션 가드 ${guarded.length}개 + 승인된 예외 ${exempted.length}개 · API 핸들러 가드 ${guardedRoutes.length}개`)
process.exitCode = fail ? 1 : 0
