// lib/threads/token.ts 3상태 + lib/supabase/server.ts 504 재시도 자체 검증.
//
//   node scripts/threads-token-selftest.mjs
//
// 실제 DB 에 붙지 않는다. globalThis.fetch 를 가짜로 바꿔 진짜 supabase-js 가 받는
// 응답을 흉내 낸다 — 가짜 클라이언트가 아니라 실제 postgrest-js 의 에러 파싱을 거친다
// (CLAUDE.md §7.1 "부품 테스트를 통합의 근거로 쓰지 마라").
// 504 본문 'Gateway Timeout' 은 2026-09-12~13 Vercel 로그의 실제 메시지와 같다.
// 재시도 대기(1.5s)가 실제로 돌아 전체 수 초 걸린다.

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://selftest.invalid.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'selftest-dummy-key'

const { loadThreadsToken, ensureValidToken, tokenFailure, refreshCronResponse } = await import('../lib/threads/token.ts')
const { fetchWithGatewayRetry } = await import('../lib/supabase/server.ts')

let passed = 0
const failures = []
function eq(name, actual, expected) {
  if (Object.is(actual, expected)) { passed++; return }
  failures.push(`${name} — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}

const realFetch = globalThis.fetch
const quiet = { warn: console.warn, error: console.error, info: console.info }
const warns = []
console.warn = (...a) => warns.push(a.join(' '))
console.error = () => {}
console.info = () => {}

/** 호출마다 responses 에서 하나씩 꺼내 준다. 호출 기록을 남긴다. */
function stubFetch(responses) {
  const calls = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input instanceof Request ? input.url : input), method: init?.method ?? 'GET' })
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]
    return typeof next === 'function' ? next() : next
  }
  return calls
}
const json = (body, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const gw504 = () => new Response('Gateway Timeout', { status: 504 })
const DAY = 86_400_000
const row = (over = {}) => [{
  access_token: 'tok', user_id: 'u1',
  expires_at: new Date(Date.now() + 30 * DAY).toISOString(),
  updated_at: new Date(Date.now() - 10 * DAY).toISOString(),
  ...over,
}]

try {
  // ── 1) 3상태 ──────────────────────────────────────────────────
  let r
  stubFetch([json(row())])
  r = await loadThreadsToken()
  eq('양성 — 유효 토큰', r.status, 'ok')
  eq('양성 — userId', r.creds?.userId, 'u1')

  stubFetch([json([])])
  r = await loadThreadsToken()
  eq('음성 — 행 없음', r.status, 'needs_reauth')

  stubFetch([json(row({ user_id: null }))])
  eq('음성 — user_id 없음', (await loadThreadsToken()).status, 'needs_reauth')

  stubFetch([json(row({ expires_at: new Date(Date.now() - DAY).toISOString() }))])
  eq('음성 — 만료', (await loadThreadsToken()).status, 'needs_reauth')

  // 핵심 회귀: 09-12~13 의 오분류. 504 가 두 번 연속이면 확인 불가여야 한다.
  let calls = stubFetch([gw504, gw504])
  r = await loadThreadsToken()
  eq('확인 불가 — 504 연속', r.status, 'unavailable')
  eq('확인 불가 — reason 에 원문', r.reason?.includes('Gateway Timeout'), true)
  eq('확인 불가 — 1회만 재시도(총 2회 호출)', calls.length, 2)
  eq('확인 불가 → ensureValidToken 호환 null', await (stubFetch([gw504, gw504]), ensureValidToken()), null)

  stubFetch([json({ code: 'PGRST205', message: "Could not find the table 'public.api_tokens'" }, 404)])
  eq('확인 불가 — 테이블 없음(PGRST205)', (await loadThreadsToken()).status, 'unavailable')

  // ── 2) 재시도는 504 → 성공을 살리되 흔적을 남긴다 (§7.2) ─────────
  warns.length = 0
  calls = stubFetch([gw504, json(row())])
  r = await loadThreadsToken()
  eq('재시도 성공 — ok', r.status, 'ok')
  eq('재시도 성공 — 호출 2회', calls.length, 2)
  eq('재시도 로그 — 시도', warns.some(w => w.includes('504 on GET /rest/v1/api_tokens')), true)
  eq('재시도 로그 — 결과', warns.some(w => w.includes('retry GET /rest/v1/api_tokens → HTTP 200')), true)

  // 쓰기는 504 여도 재전송하지 않는다(반영됐을 수 있다).
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    calls = stubFetch([gw504, json({})])
    const res = await fetchWithGatewayRetry('https://selftest.invalid.supabase.co/rest/v1/posts', { method })
    eq(`쓰기 ${method} — 재시도 안 함`, calls.length, 1)
    eq(`쓰기 ${method} — 504 그대로`, res.status, 504)
  }
  // 504 가 아닌 오류(500)도 재시도하지 않는다.
  calls = stubFetch([() => new Response('boom', { status: 500 }), json({})])
  await fetchWithGatewayRetry('https://selftest.invalid.supabase.co/rest/v1/posts', { method: 'GET' })
  eq('GET 500 — 재시도 안 함', calls.length, 1)

  // ── 3) 응답 규약 ─────────────────────────────────────────────
  const reauth = tokenFailure({ status: 'needs_reauth', reason: 'x' })
  eq('규약 needs_reauth — 200', reauth.status, 200)
  eq('규약 needs_reauth — needsReauth', reauth.body.needsReauth, true)
  const down = tokenFailure({ status: 'unavailable', reason: 'api_tokens 조회 실패: Gateway Timeout' })
  eq('규약 unavailable — 503', down.status, 503)
  eq('규약 unavailable — needsReauth false', down.body.needsReauth, false)
  eq('규약 unavailable — unavailable true', down.body.unavailable, true)

  // ── 3.5) refresh-token 크론 응답: 정상 / 만료 / 만료 임박(갱신 실패·성공) ──────
  // 진단 3-1 회귀: 만료·갱신 실패가 200 으로 은폐되면 안 된다. 실제 supabase-js 와 갱신 fetch 를 거친다.
  calls = stubFetch([json(row())])
  r = await loadThreadsToken()
  let cron = refreshCronResponse(r)
  eq('크론 정상 — 200', cron.status, 200)
  eq('크론 정상 — 만료 30일이면 갱신 API 안 부름', calls.length, 1)
  eq('크론 정상 — daysLeft 약 30', Math.round(cron.body.daysLeft), 30)

  stubFetch([json(row({ expires_at: new Date(Date.now() - DAY).toISOString() }))])
  cron = refreshCronResponse(await loadThreadsToken())
  eq('크론 만료 — 200 아님(500)', cron.status, 500)
  eq('크론 만료 — needsReauth', cron.body.needsReauth, true)

  const soon = new Date(Date.now() + 3 * DAY).toISOString()
  calls = stubFetch([json(row({ expires_at: soon })), json({ error: { message: 'Session has expired', code: 190 } }, 400)])
  r = await loadThreadsToken()
  cron = refreshCronResponse(r)
  eq('크론 임박·갱신 실패 — 갱신 API 를 실제로 불렀다', calls[1]?.url.includes('refresh_access_token'), true)
  eq('크론 임박·갱신 실패 — 이번 실행은 살린다(ok)', r.status, 'ok')
  eq('크론 임박·갱신 실패 — 200 아님(502)', cron.status, 502)
  eq('크론 임박·갱신 실패 — refreshFailed', cron.body.refreshFailed, true)
  eq('크론 임박·갱신 실패 — 남은 일수 3', Math.round(cron.body.daysLeft), 3)

  calls = stubFetch([json(row({ expires_at: soon })), json({ access_token: 'new-tok', expires_in: 60 * 86400 }), json({}, 201)])
  r = await loadThreadsToken()
  cron = refreshCronResponse(r)
  eq('크론 임박·갱신 성공 — 새 토큰', r.creds?.accessToken, 'new-tok')
  eq('크론 임박·갱신 성공 — 저장(POST upsert)', calls[2]?.method, 'POST')
  eq('크론 임박·갱신 성공 — 200', cron.status, 200)
  eq('크론 임박·갱신 성공 — 새 만료 약 60일', Math.round(cron.body.daysLeft), 60)

  stubFetch([json(row({ expires_at: soon })), json({ access_token: 'new-tok', expires_in: 60 * 86400 }), json({ message: 'boom' }, 500)])
  cron = refreshCronResponse(await loadThreadsToken())
  eq('크론 임박·갱신 저장 실패 — DB 는 옛 만료라 502', cron.status, 502)

  stubFetch([gw504, gw504])
  eq('크론 확인 불가 — 503', refreshCronResponse(await loadThreadsToken()).status, 503)

  // ── 4) 환경변수 없음 = 확인 불가(재인증 아님) ──────────────────
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  eq('확인 불가 — env 없음', (await loadThreadsToken()).status, 'unavailable')
} finally {
  globalThis.fetch = realFetch
  Object.assign(console, quiet)
}

if (failures.length) {
  console.error(`FAIL ${failures.length} / PASS ${passed}`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASS ${passed}`)
