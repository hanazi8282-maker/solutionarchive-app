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
t(`크론 인증 라우트 추출 ≥7건 (실제 ${cronRoutes.length})`, cronRoutes.length >= 7)
t(`vercel.json 크론 추출 ≥4건 (실제 ${vercelCrons.length})`, vercelCrons.length >= 4)
for (const p of [...cronRoutes, ...vercelCrons]) t(`공개(크론): ${p}`, isPublicPath(p))
for (const p of ['/api/threads/match-posts', '/api/insight/kakao-webhook', '/login', '/auth/login', '/auth/callback', '/auth/logout',
  '/onboarding/quiz', '/api/onboarding/quiz', '/api/onboarding/quiz/share']) t(`공개: ${p}`, isPublicPath(p))

// 2b. 페이지는 /login·/onboarding 말고 전부 보호(새 화면은 기본 잠김)
const pages = files.filter((f) => /(^|\/)page\.tsx$/.test(f)).map(routeOf)
t(`페이지 추출 ≥8건 (실제 ${pages.length})`, pages.length >= 8)
for (const p of pages) {
  const shouldBePublic = p === '/login' || p.startsWith('/onboarding')
  t(`${shouldBePublic ? '공개' : '보호'}(페이지): ${p}`, isPublicPath(p) === shouldBePublic)
}
for (const p of ['/', '/dashboard', '/agents', '/cases', '/analyze', '/analyze/new', '/analyze/x/review',
  '/api/analyze/extract', '/api/deploy-status', '/api/threads/callback', '/api/threads/callback/',
  '/loginx', '/authz', '/api/threadsx', '/onboardingx']) t(`보호: ${p}`, !isPublicPath(p))

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
const guarded = []
for (const f of actionFiles) {
  const src = readFileSync(`${ROOT}/app/${f}`, 'utf8')
  const chunks = src.split(/export async function (\w+)/).slice(1)
  for (let i = 0; i < chunks.length; i += 2) {
    const [name, body] = [chunks[i], chunks[i + 1]]
    // 부르기만 하고 결과를 버리면 가드가 아니다 — 바로 다음 줄에서 거절을 돌려줘야 한다.
    const g = body.search(/const (\w+) = await requireAllowedUser\(\)\s*\n\s*if \(!\1\.ok\) return /)
    const db = body.search(/createClient\(|\.from\(/)
    t(`가드 선행(호출+거절 반환): app/${f} ${name}`, g >= 0 && (db < 0 || g < db))
    guarded.push(name)
  }
}
for (const name of ['createPost', 'createSnapshot', 'linkDraft', 'decideMove', 'decideCase']) t(`서버 액션 검사 대상에 포함: ${name}`, guarded.includes(name))

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 허용 목록 파서 · 공개/보호 경로(크론 ${cronRoutes.length}·페이지 ${pages.length}) · 세션 3상태 판정 · 서버 액션 가드 ${guarded.length}개`)
process.exitCode = fail ? 1 : 0
