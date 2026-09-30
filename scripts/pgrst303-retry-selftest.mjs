// lib/supabase/server.ts PGRST303("JWT issued at future") 재시도 자체 검증.
//
//   node scripts/pgrst303-retry-selftest.mjs
//
// 실제 DB·키·JWT 를 쓰지 않는다. 127.0.0.1 에 모의 PostgREST 를 띄우고, 진짜 createClient()
// (supabase-js + postgrest-js) → 진짜 loadFeed()(lib/signals/feed.ts) 를 그대로 태운다(§7.1 경계면 테스트).
//
// 모의 서버 모형 = Supabase 새 키(sb_secret_) 경로: 게이트웨이가 요청마다 단명 JWT 를 자기 시계로 서명하고
// (iat = 게이트웨이 시각), PostgREST 가 자기 시계로 iat 를 검사한다. 게이트웨이 시계가 앞서면 PGRST303.
// 토큰은 가짜(서명 없는 base64 JSON)이고 앱이 보낸 Authorization 값은 존재만 본다.

import http from 'node:http'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1' // 포트는 아래에서 바꾼다
process.env.SUPABASE_SERVICE_ROLE_KEY = 'selftest-dummy-key'
const DUMMY_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let passed = 0
const failures = []
function eq(name, actual, expected) {
  if (Object.is(actual, expected)) { passed++; return }
  failures.push(`${name} — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}

// ── 모의 PostgREST ────────────────────────────────────────────────────────
// plan(i) → i 번째 요청(0부터)에 대해 'skew'(게이트웨이 시계 +60s → PGRST303) | 'expired' | 'bad' | 'ok'
let plan = () => 'ok'
let hits = []
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function mintInternalJwt(gatewaySkewSec) {
  const iat = Math.floor(Date.now() / 1000) + gatewaySkewSec
  return `${b64({ alg: 'none' })}.${b64({ role: 'service_role', iat, exp: iat + 60 })}.`
}
const server = http.createServer((req, res) => {
  const i = hits.length
  hits.push({ method: req.method, t: Date.now(), path: new URL(req.url, 'http://x').pathname })
  if (!req.headers.authorization) { res.writeHead(401).end(); return }
  const mode = plan(i)
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body))
  }
  if (mode === 'bad') return send(401, { code: 'PGRST301', details: null, hint: null, message: 'No suitable key or wrong key type' })
  if (mode === 'expired') return send(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' })
  // PostgREST 쪽 검사: 게이트웨이가 방금 찍은 iat 를 자기 시계(허용 오차 30s)로 본다.
  const token = mintInternalJwt(mode === 'skew' ? 60 : 0)
  const { iat } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  if (iat > Math.floor(Date.now() / 1000) + 30) {
    return send(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT issued at future' },
      { 'www-authenticate': 'Bearer error="invalid_token", error_description="JWT issued at future"' })
  }
  send(200, [], { 'content-range': '*/0' })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`

const { createClient } = await import('../lib/supabase/server.ts')
const { loadFeed } = await import('../lib/signals/feed.ts')
const F = { kind: 'all', source: null, signal: null, impact: null, page: 1 }

const warns = []
const quiet = { warn: console.warn, error: console.error }
console.warn = (...a) => warns.push(a.join(' '))
console.error = (...a) => warns.push(a.join(' '))

function reset(p) { plan = p; hits = []; warns.length = 0 }

// 1) 요청마다 첫 1회만 PGRST303 → 재시도 1회로 성공, 화면은 'ok'
{
  // loadFeed(kind=all) 는 GET 3개를 병렬로 부른다. 앞 3개 요청 = 각 질의의 첫 시도 → skew.
  reset((i) => (i < 3 ? 'skew' : 'ok'))
  const t0 = Date.now()
  const r = await createClient().then((sb) => loadFeed(sb, F))
  const ms = Date.now() - t0
  eq('1 status ok', r.status, 'ok')
  eq('1 요청 수 = 3 + 재시도 3', hits.length, 6)
  eq('1 warn 3줄(질의마다 1줄)', warns.filter((w) => w.includes('PGRST303')).length, 3)
  eq('1 warn 에 횟수', warns.every((w) => !w.includes('PGRST303') || w.includes('retried 1x → HTTP 200')), true)
  eq('1 재시도 간격 ≥250ms', ms >= 250, true)
  eq('1 상한 안(< 1.5s)', ms < 1500, true)
}

// 2) 계속 PGRST303 → 최대 2회 재시도 뒤 기존 '확인 불가'(status error) 경로, 반환 모양 불변
{
  reset(() => 'skew')
  const t0 = Date.now()
  const r = await createClient().then((sb) => loadFeed(sb, F))
  const ms = Date.now() - t0
  eq('2 status error', r.status, 'error')
  eq('2 reason 에 코드·메시지', r.reason, '조회 실패: PGRST303 JWT issued at future')
  eq('2 반환 키 모양 불변', Object.keys(r).sort().join(','), 'reason,status')
  eq('2 요청 수 = 3 × (1+2)', hits.length, 9)
  eq('2 warn 에 retried 2x → HTTP 401', warns.filter((w) => w.includes('retried 2x → HTTP 401')).length, 3)
  eq('2 최악 지연 < 1.5s', ms < 1500, true)
  // 간격 실측: 같은 경로의 연속 시도 간 간격
  const main = hits.filter((h) => h.path === '/rest/v1/review_sources')
  eq('2 review_sources 3회 시도', main.length, 3)
  eq('2 간격 ≥ 240ms', main.length === 3 && main[1].t - main[0].t >= 240 && main[2].t - main[1].t >= 240, true)
}

// 3) PGRST301(키 불량) 은 재시도 0
{
  reset(() => 'bad')
  const r = await createClient().then((sb) => loadFeed(sb, F))
  eq('3 status error', r.status, 'error')
  eq('3 요청 수 = 3(재시도 0)', hits.length, 3)
  eq('3 재시도 warn 0', warns.filter((w) => w.includes('retried')).length, 0)
}

// 4) 같은 PGRST303 이라도 "JWT expired" 는 재시도 0
{
  reset(() => 'expired')
  const r = await createClient().then((sb) => loadFeed(sb, F))
  eq('4 status error', r.status, 'error')
  eq('4 요청 수 = 3', hits.length, 3)
}

// 5) 쓰기(POST)·HEAD 는 재시도하지 않는다
{
  reset(() => 'skew')
  const sb = await createClient()
  const w = await sb.from('posts').insert({ x: 1 })
  eq('5 POST PGRST303 그대로', w.error?.code, 'PGRST303')
  eq('5 POST 1회', hits.length, 1)
  reset(() => 'skew')
  await sb.from('posts').select('id', { count: 'exact', head: true })
  eq('5 HEAD 1회', hits.length, 1)
}

// 6) 로그에 키·JWT·질의 문자열 0회
{
  reset(() => 'skew')
  await createClient().then((sb) => loadFeed(sb, F))
  const all = warns.join('\n')
  eq('6 키 없음', all.includes(DUMMY_KEY), false)
  eq('6 JWT 없음(eyJ)', /eyJ/.test(all), false)
  eq('6 Bearer 없음', /Bearer/i.test(all), false)
  eq('6 질의 문자열 없음(?select=)', /[?&](select|or|order)=/.test(all.split('\n').filter((l) => l.includes('retried')).join('\n')), false)
}

// 7) 정상은 재시도·warn 0
{
  reset(() => 'ok')
  const r = await createClient().then((sb) => loadFeed(sb, F))
  eq('7 ok', r.status, 'ok')
  eq('7 요청 3', hits.length, 3)
  eq('7 warn 0', warns.length, 0)
}

console.warn = quiet.warn
console.error = quiet.error
server.close()

if (failures.length) {
  console.error(`FAIL ${failures.length} / ${passed + failures.length}`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`pgrst303-retry-selftest: ${passed} passed`)
