#!/usr/bin/env node
// 배포된 웹(프로덕션) 종단 검증(v71cj 작업 2). 세션은 서버 측에서 시드한다(남헌 세션 불필요):
//   admin.generateLink(magiclink) → verifyOtp → 쿠키(sb-<ref>-auth-token)로 실제 HTTP 호출.
//   node --env-file=.env.local scripts/consult-prod-e2e.mjs --owner you@x.com --scenario 1|2|3 [--site https://solutionarch.vercel.app]
// 단계별 소요시간·비용·성공 여부를 표로 찍는다. 결제 활성화(관리자 서버 액션)는 DB 직접 갱신으로 대신한다(T9 하네스와 같은 방식).
import { createClient } from '@supabase/supabase-js'
import { addMonth } from '../lib/consult/period.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const owner = arg('owner'), scenario = arg('scenario', '1'), SITE = arg('site', 'https://solutionarch.vercel.app')
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!owner || !URL_ || !ANON || !SVC) { console.error('--owner 와 SUPABASE env 필요'); process.exit(64) }
const SC = {
  1: { kind: 'company', name: '솔루션아카이브', url: 'https://solutionarch.vercel.app', liner: '창업자의 결정을 검증해 주고 최선의 방법까지 찾아주는 AI 컨설턴트입니다. 무료 진단 뒤 월 구독으로 결정 메모를 제공합니다.' },
  2: { kind: 'company', name: '시프티', url: 'https://shiftee.io', liner: '근태관리·급여 자동화 SaaS 입니다. 중소기업이 출퇴근 기록과 급여 계산을 한 곳에서 처리합니다.' },
  3: { kind: 'idea', name: '식당 정산 앱(예시)', url: null, liner: '소규모 식당 사장님이 매일 카드·배달앱 정산 내역을 한 화면에서 맞춰 보게 하는 구독 앱을 준비하고 있습니다.' },
}[scenario]

const admin = createClient(URL_, SVC, { auth: { persistSession: false } })
const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: owner })
if (le) throw le
const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
const { data: v, error: ve } = await anon.auth.verifyOtp({ email: owner, token: link.properties.email_otp, type: 'magiclink' })
if (ve || !v.session) throw ve ?? new Error('세션 없음')
const ref = new URL(URL_).hostname.split('.')[0]
const val = 'base64-' + Buffer.from(JSON.stringify(v.session)).toString('base64url')
const chunks = val.match(/.{1,3180}/g)
const cookie = chunks.length === 1 ? `sb-${ref}-auth-token=${val}` : chunks.map((c, i) => `sb-${ref}-auth-token.${i}=${c}`).join('; ')

const rows = []
let runId = null
const costOf = async () => (await admin.from('llm_usage').select('cost_usd').eq('run_id', runId)).data?.reduce((a, r) => a + Number(r.cost_usd), 0) ?? 0
async function step(name, fn) {
  const t0 = Date.now(); const c0 = runId ? await costOf() : 0
  let ok = false, note = ''
  try { const r = await fn(); ok = r.ok; note = r.note ?? '' } catch (e) { note = String(e.message ?? e).slice(0, 120) }
  const c1 = runId ? await costOf() : 0
  rows.push({ name, ok, sec: Math.round((Date.now() - t0) / 1000), cost: (c1 - c0).toFixed(3), note })
  console.log(`${ok ? '✅' : '❌'} ${name} ${Math.round((Date.now() - t0) / 1000)}s $${(c1 - c0).toFixed(3)} ${note}`)
  return ok
}
const post = (path, fields) => fetch(SITE + path, { method: 'POST', redirect: 'manual', headers: { cookie }, body: new URLSearchParams(fields) })
const get = (path) => fetch(SITE + path, { headers: { cookie }, redirect: 'manual' })
const loc = (r) => r.headers.get('location') ?? ''

await step('로그인(시드 세션)으로 /consult/new', async () => { const r = await get('/consult/new'); return { ok: r.status === 200, note: String(r.status) } })
await step('입력 접수+수집(POST /api/consult/runs)', async () => {
  const f = { kind: SC.kind, one_liner: SC.liner }; if (SC.name) f.name = SC.name; if (SC.url) f.url = SC.url
  const r = await post('/api/consult/runs', f); const m = loc(r).match(/\/consult\/run\/([0-9a-f-]{36})/)
  if (m) runId = m[1]; return { ok: Boolean(m), note: loc(r) }
})
if (!runId) { console.log('run 을 못 만들어 중단'); process.exit(1) }
console.log(`run ${runId}`)
await admin.from('consult_runs').update({ scenario: `prod-${scenario}` }).eq('id', runId)
await step('0층 진단', async () => { const r = await post(`/api/consult/runs/${runId}/diagnose`, {}); const { data } = await admin.from('consult_diagnoses').select('layer').eq('run_id', runId).eq('layer', 0); return { ok: (data ?? []).length === 1, note: `${r.status} ${loc(r)}` } })
await step('1층 해금(숫자 3개)', async () => { const r = await post(`/api/consult/runs/${runId}/unlock`, { audience: '1500', rate_pct: '2', value_man: '12' }); const { data } = await admin.from('consult_diagnoses').select('layer').eq('run_id', runId).eq('layer', 1); return { ok: (data ?? []).length === 1, note: `${r.status} ${loc(r)}` } })
await step('결제 요청(계좌이체 안내)', async () => { const r = await post('/api/consult/pay', { action: 'request', depositor: '검증입금', run: runId }); return { ok: /requested=1/.test(loc(r)), note: loc(r) } })
let payId = null
await step('관리자 활성화(DB 갱신)', async () => {
  const { data: req } = await admin.from('consult_payment_requests').select('id').eq('owner_email', owner).eq('status', 'requested').order('requested_at', { ascending: false }).limit(1).single()
  payId = req.id; const now = new Date()
  const { error } = await admin.from('consult_payment_requests').update({ status: 'active', activated_at: now.toISOString(), activated_by: 'prod-e2e', ends_at: addMonth(now).toISOString() }).eq('id', payId).eq('status', 'requested')
  return { ok: !error, note: error?.message }
})
await step('결정 메모', async () => { const r = await post(`/api/consult/runs/${runId}/memo`, {}); const { data } = await admin.from('consult_memos').select('id').eq('run_id', runId); return { ok: (data ?? []).length > 0, note: `${r.status} ${loc(r)}` } })
await step('에이전트 질의', async () => { const r = await post(`/api/consult/runs/${runId}/chat`, { message: '구독 모델로 성공한 비슷한 사례를 찾아서 알려 주세요.' }); const { data } = await admin.from('consult_messages').select('role').eq('run_id', runId).eq('role', 'assistant'); return { ok: (data ?? []).length > 0, note: `${r.status}` } })
await step('측정카드', async () => { const r = await post(`/api/consult/runs/${runId}/measure`, SC.kind === 'idea' ? {} : { target: '3.5', due: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) }); const { data } = await admin.from('consult_measure_cards').select('mode').eq('run_id', runId); return { ok: (data ?? []).length > 0, note: `${data?.[0]?.mode ?? '-'} ${r.status} ${loc(r)}` } })
await step('종료(ended)', async () => { const { error } = await admin.from('consult_payment_requests').update({ status: 'ended', ends_at: new Date().toISOString() }).eq('id', payId).eq('status', 'active'); return { ok: !error, note: error?.message } })

console.log(`\nrun URL: ${SITE}/consult/run/${runId}`)
console.log(`합계 $${(await costOf()).toFixed(3)} · 실패 ${rows.filter((r) => !r.ok).length}/${rows.length}`)
process.exitCode = rows.some((r) => !r.ok) ? 1 : 0
