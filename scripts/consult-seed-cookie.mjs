#!/usr/bin/env node
// 검증 하네스용 세션 쿠키 발급(consult-prod-e2e.mjs 와 같은 방식 — admin.generateLink → verifyOtp). 제품 코드의 로그인 우회 안전장치와 무관하다.
//   node --env-file=.env.local scripts/consult-seed-cookie.mjs --owner you@x.com --out <path.json>
// 출력 파일에 Playwright addCookies 형식 배열을 쓴다. 토큰은 화면에 찍지 않는다.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : null }
const owner = arg('owner')
const out = arg('out')
const site = arg('site') ?? 'https://solutionarch.vercel.app'
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!owner || !out || !URL_ || !ANON || !SVC) { console.error('--owner --out 과 SUPABASE env 필요'); process.exit(64) }
const admin = createClient(URL_, SVC, { auth: { persistSession: false } })
const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: owner })
if (le) throw le
const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
const { data: v, error: ve } = await anon.auth.verifyOtp({ email: owner, token: link.properties.email_otp, type: 'magiclink' })
if (ve || !v.session) throw ve ?? new Error('세션 없음')
const ref = new URL(URL_).hostname.split('.')[0]
const val = 'base64-' + Buffer.from(JSON.stringify(v.session)).toString('base64url')
const chunks = val.match(/.{1,3180}/g)
const domain = new URL(site).hostname
const cookies = (chunks.length === 1 ? [[`sb-${ref}-auth-token`, val]] : chunks.map((c, i) => [`sb-${ref}-auth-token.${i}`, c])).map(([name, value]) => ({ name, value, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))
writeFileSync(out, JSON.stringify(cookies), 'utf8')
console.log(`쿠키 ${cookies.length}개 기록: ${out}`)
