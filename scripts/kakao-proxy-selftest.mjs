#!/usr/bin/env node
// 카카오 중계기(Supabase Edge Function) 셀프테스트 — 네트워크 없이 경계를 고정한다.
//
// ⚠️ 이 중계기의 유일한 임무는 "바꾸지 않고 넘기는 것"이다. 그래서 이 테스트가
//    지키는 것도 하나다 — **본문을 건드리지 않았는가.** 프록시가 본문을
//    파싱·재직렬화하기 시작하면 같은 발화가 경로에 따라 다른 바이트가 되고,
//    상위의 멱등성 키가 갈린다.
//
// ⚠️ "200 을 준다"를 통과 기준으로 쓰지 않는다. 카카오는 규격을 벗어난 JSON 에
//    조용히 실패한다 — 구조를 직접 검사한다 (scripts/insight-kakao-selftest.mjs
//    와 같은 기준).

import { createHandler, skillText } from '../supabase/functions/kakao-webhook/handler.ts'

let pass = 0
const fails = []
function ok(name, cond, detail = '') {
  if (cond) pass++
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
}

const UPSTREAM = 'https://solutionarch.vercel.app/api/insight/kakao-webhook'
const SKILL_BODY = JSON.stringify({
  version: '2.0',
  template: { outputs: [{ simpleText: { text: '저장했습니다.' } }] },
})

/** 업스트림을 흉내내는 fetch. 호출 인자를 기록한다. */
function fakeFetch(impl) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    return impl(url, init)
  }
  fn.calls = calls
  return fn
}

const post = (body = '{}', headers = { 'content-type': 'application/json' }) =>
  new Request('https://x.supabase.co/functions/v1/kakao-webhook', { method: 'POST', headers, body })

const silent = () => {}

// ── 1) 스킬 응답 계약 ──────────────────────────────────────────────────
{
  const r = skillText('테스트')
  eq('계약: status 200', r.status, 200)
  eq('계약: content-type json', r.headers.get('content-type'), 'application/json')
  const j = JSON.parse(await r.clone().text())
  eq('계약: version 2.0', j.version, '2.0')
  ok('계약: outputs 1~3개', Array.isArray(j.template.outputs) && j.template.outputs.length >= 1 && j.template.outputs.length <= 3)
  ok('계약: simpleText 존재', !!j.template.outputs[0].simpleText)

  const long = JSON.parse(await skillText('가'.repeat(1500)).text())
  eq('계약: text 1000자 절단', long.template.outputs[0].simpleText.text.length, 1000)
}

// ── 2) 정상 중계 — 본문을 바꾸지 않는다 ────────────────────────────────
{
  const f = fakeFetch(async () => new Response(SKILL_BODY, { status: 200 }))
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, log: silent })
  const reqBody = JSON.stringify({ userRequest: { utterance: '원문 40자 이상…', user: { id: 'u1' } } })
  const res = await handle(post(reqBody))

  eq('중계: status 200', res.status, 200)
  eq('중계: 응답 본문이 업스트림 그대로', await res.text(), SKILL_BODY)
  eq('중계: 업스트림 URL 정확', f.calls[0].url, UPSTREAM)
  eq('중계: POST 로 보낸다', f.calls[0].init.method, 'POST')
  eq('중계: 요청 본문 바이트 보존', f.calls[0].init.body, reqBody)
  eq('중계: content-type 전달', f.calls[0].init.headers['content-type'], 'application/json')
}

// ── 3) 파싱하지 않는다 — 깨진 JSON 도 그대로 넘긴다 ────────────────────
{
  const f = fakeFetch(async () => new Response(SKILL_BODY, { status: 200 }))
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, log: silent })
  await handle(post('{ 깨진 json'))
  eq('무파싱: 깨진 본문도 그대로 전달', f.calls[0].init.body, '{ 깨진 json')
  ok('무파싱: 프록시가 자체 판정하지 않는다', f.calls.length === 1)
}

// ── 4) content-type 은 항상 json 으로 못박는다 ─────────────────────────
// 헤더를 안 붙인 요청에는 fetch 규격이 자동으로 text/plain 을 단다. 그걸
// 그대로 중계하면 상위에 잘못된 형식을 알리는 셈이라, 값을 세워서 보낸다.
{
  const f = fakeFetch(async () => new Response(SKILL_BODY, { status: 200 }))
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, log: silent })

  const bare = new Request('https://x/y', { method: 'POST', body: '{}' })
  ok('헤더: (전제) 헤더 없는 요청엔 text/plain 이 자동으로 붙는다',
    String(bare.headers.get('content-type')).includes('text/plain'),
    String(bare.headers.get('content-type')))

  await handle(bare)
  eq('헤더: text/plain 이 와도 json 으로 보낸다', f.calls[0].init.headers['content-type'], 'application/json')

  await handle(post('{}', { 'content-type': 'application/json; charset=utf-8' }))
  eq('헤더: json 변형이 와도 값을 세운다', f.calls[1].init.headers['content-type'], 'application/json')
}

// ── 5) 업스트림 비-2xx — 감싸서 사유를 화면에 올린다 ───────────────────
{
  const f = fakeFetch(async () => new Response('<html>500</html>', { status: 500 }))
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, log: silent })
  const res = await handle(post())
  eq('오류: 카카오에는 200 을 준다', res.status, 200)
  const j = JSON.parse(await res.text())
  eq('오류: 스킬 포맷 유지', j.version, '2.0')
  ok('오류: 사유에 HTTP 500 이 보인다', j.template.outputs[0].simpleText.text.includes('500'))
  ok('오류: HTML 을 그대로 흘리지 않는다', !j.template.outputs[0].simpleText.text.includes('<html>'))
}

// ── 6) 연결 실패 — 삼키지 않는다 ───────────────────────────────────────
{
  const f = fakeFetch(async () => { throw new Error('ECONNREFUSED') })
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, log: silent })
  const res = await handle(post())
  eq('연결실패: 카카오에는 200', res.status, 200)
  const j = JSON.parse(await res.text())
  ok('연결실패: 사유가 본문에 실린다', j.template.outputs[0].simpleText.text.includes('ECONNREFUSED'))
}

// ── 7) 예산 초과 — 우리가 먼저 끊는다 ──────────────────────────────────
{
  const f = fakeFetch((url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')))
  }))
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, budgetMs: 120, log: silent })
  const started = Date.now()
  const res = await handle(post())
  const elapsed = Date.now() - started

  eq('타임아웃: 카카오에는 200', res.status, 200)
  const j = JSON.parse(await res.text())
  ok('타임아웃: 예산 초과 사유가 보인다', j.template.outputs[0].simpleText.text.includes('예산 초과'))
  ok('타임아웃: 예산 안에 반환한다', elapsed < 1000, `${elapsed}ms`)
}

// ── 8) 비-POST — 상위와 같은 405 ───────────────────────────────────────
{
  const f = fakeFetch(async () => new Response(SKILL_BODY, { status: 200 }))
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, log: silent })
  const res = await handle(new Request('https://x/y', { method: 'GET' }))
  eq('비-POST: 405', res.status, 405)
  eq('비-POST: 업스트림을 부르지 않는다', f.calls.length, 0)
}

// ── 9) 업스트림이 어떤 2xx 본문을 주든 판정하지 않는다 ─────────────────
{
  const odd = JSON.stringify({ version: '2.0', template: { outputs: [{ simpleText: { text: '등록되지 않은 발신자입니다.' } }] } })
  const f = fakeFetch(async () => new Response(odd, { status: 200 }))
  const handle = createHandler({ upstreamUrl: UPSTREAM, fetchImpl: f, log: silent })
  const res = await handle(post())
  eq('무판정: 거부 응답도 그대로 중계', await res.text(), odd)
}

// ── 결과 ───────────────────────────────────────────────────────────────
console.log('')
if (fails.length) {
  console.log(`❌ 실패 ${fails.length}건 / 통과 ${pass}건`)
  for (const f of fails) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log(`통과 ${pass}건`)
  console.log('중계 무변형·무파싱·오류 감싸기·예산 초과·405 경계 정상.')
}
