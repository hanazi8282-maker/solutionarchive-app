// lib/threads/buckets.ts 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/threads-collect-selftest.mjs
//
// 이 레포에는 테스트 러너가 없다(package.json 참조). 수집기가 조용히 틀리는
// 지점은 전부 여기다 — 창을 잘못 잡으면 버킷이 영구히 비고, manual 보호가
// 새면 사람이 손으로 채운 값이 API 값에 덮인다. 둘 다 에러를 내지 않는다.
// 매처 셀프테스트(threads-match-selftest.mjs)와 같은 방식으로 둔다.
// Node 22+ 의 타입 스트리핑 덕에 .ts 를 그대로 import 한다(검증 환경: v24.16.0).

import {
  BUCKETS,
  COLLECT_WINDOW_DAYS,
  ageInHours,
  selectBucket,
  planCollection,
} from '../lib/threads/buckets.ts'

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}

const NOW = Date.parse('2026-08-28T12:00:00.000Z')

/** 나이(시간)를 published_at ISO 문자열로 바꾼다. */
function agoHours(h) {
  return new Date(NOW - h * 3_600_000).toISOString()
}

// ── 1) 창 판정 ────────────────────────────────────────────────
// 경계값이 핵심이다. 1.9 를 1.5 로 잘못 잡으면(뷰의 FILTER 값과 혼동하기 쉽다)
// 크론이 한 번만 밀려도 1h 버킷이 통째로 사라진다.

const b = age => selectBucket(age)?.hours ?? null

eq('0.0h — 너무 이름(인사이트 미집계)', b(0), null)
eq('0.49h — 창 직전', b(0.49), null)
eq('0.5h — 1h 창 하한(포함)', b(0.5), 1)
eq('1.0h — 1h 창 한가운데', b(1.0), 1)
eq('1.5h — :30 수집의 실제 상한', b(1.5), 1)
eq('1.9h — 1h 창 상한(포함)', b(1.9), 1)
eq('1.91h — 1h 창 직후', b(1.91), null)

eq('10h — 창 사이(무시)', b(10), null)
eq('19.9h — 24h 창 직전', b(19.9), null)
eq('20h — 24h 창 하한(포함)', b(20), 24)
eq('24h — 24h 창 한가운데', b(24), 24)
eq('30h — 24h 창 상한(포함)', b(30), 24)
eq('30.1h — 24h 창 직후', b(30.1), null)

eq('100h — 창 사이(무시)', b(100), null)
eq('155.9h — 168h 창 직전', b(155.9), null)
eq('156h — 168h 창 하한(포함)', b(156), 168)
eq('168h — 168h 창 한가운데', b(168), 168)
eq('180h — 168h 창 상한(포함)', b(180), 168)
eq('180.1h — 168h 창 직후', b(180.1), null)
eq('400h — 한참 지남', b(400), null)

// 72h 버킷이 없다는 사실 자체를 고정한다. post_performance 뷰가 보는 창은
// <=1.5 와 20~30 둘뿐이라, 뷰를 안 고치고 버킷만 늘리면 그 스냅샷은
// 저장은 되는데 분석에는 절대 나타나지 않는 유령이 된다.
eq('72h — 버킷 없음(뷰가 못 보는 구간)', b(72), null)

// 창끼리 겹치면 selectBucket 이 앞선 것만 돌려주고 나머지가 조용히 죽는다.
let overlap = false
for (let i = 0; i < BUCKETS.length; i++) {
  for (let j = i + 1; j < BUCKETS.length; j++) {
    if (BUCKETS[i].minAge <= BUCKETS[j].maxAge && BUCKETS[j].minAge <= BUCKETS[i].maxAge) overlap = true
  }
}
check('창끼리 겹치지 않는다', !overlap)

// 가장 늦은 창이 조회 기간 안에 있어야 한다. 아니면 168h 버킷이 영영 안 채워진다.
const latest = Math.max(...BUCKETS.map(x => x.maxAge))
check('가장 늦은 창이 조회 기간(14일) 안', latest <= COLLECT_WINDOW_DAYS * 24,
  `상한 ${latest}h vs 조회 ${COLLECT_WINDOW_DAYS * 24}h`)

// ── 2) 나이 계산 ──────────────────────────────────────────────
eq('published_at null → null', ageInHours(null, NOW), null)
eq('published_at 빈 문자열 → null', ageInHours('', NOW), null)
eq('파싱 불가 문자열 → null', ageInHours('어제쯤', NOW), null)
eq('24시간 전 → 24', ageInHours(agoHours(24), NOW), 24)
check('미래 발행 시각 → 음수(창에 안 듦)', b(ageInHours(agoHours(-3), NOW)) === null)

// ── 3) 수집 계획 ──────────────────────────────────────────────
// planCollection 은 upsert 를 대신하는 분기다. 여기가 새면 manual 값이 덮인다.

const p1 = 'post-1', p2 = 'post-2', p3 = 'post-3'
const post = (id, age, external = `media-${id}`) => ({
  id, external_id: external, published_at: age === null ? null : agoHours(age),
})
// 근접 판정용 captured_at 을 만든다.
//   postAge   = 지금 이 글의 나이
//   storedAge = 그 스냅샷을 찍을 당시의 글 나이
// captured_at - published_at 이 storedAge 가 되도록 역산한다. 이 역산을 틀리면
// (부호를 뒤집으면) 판정이 반대로 돌아가는데 테스트는 그대로 통과해버린다.
const capturedWhen = (postAge, storedAge) => agoHours(postAge - storedAge)

// storedAge 를 생략하면 captured_at 없음 = 비교 근거 없음 = 갱신 허용(예전 동작).
const snap = (id, postId, hours, source, storedAge, postAge) => ({
  id, post_id: postId, hours_since_publish: hours, source,
  captured_at: storedAge === undefined ? undefined : capturedWhen(postAge, storedAge),
})

// 3-1) 기존 스냅샷이 없으면 insert
{
  const plan = planCollection([post(p1, 1.0)], [], NOW)
  eq('신규 — 액션 1건', plan.actions.length, 1)
  eq('신규 — kind=insert', plan.actions[0].kind, 'insert')
  eq('신규 — 버킷 1', plan.actions[0].bucket, 1)
  eq('신규 — mediaId 전달', plan.actions[0].mediaId, 'media-post-1')
  eq('신규 — 보류 없음', plan.skipped.length, 0)
}

// 3-2) source='api' 가 이미 있으면 update (그 행의 id 를 겨냥한다)
{
  const plan = planCollection([post(p1, 24)], [snap('snap-a', p1, 24, 'api')], NOW)
  eq('기존 api — kind=update', plan.actions[0].kind, 'update')
  eq('기존 api — snapshotId 로 겨냥', plan.actions[0].snapshotId, 'snap-a')
  eq('기존 api — 보류 없음', plan.skipped.length, 0)
}

// 3-3) 🔴 source='manual' 이면 절대 건드리지 않고 skipped 에 남긴다
{
  const plan = planCollection([post(p1, 24)], [snap('snap-m', p1, 24, 'manual')], NOW)
  eq('manual — 액션 없음', plan.actions.length, 0)
  eq('manual — 보류 1건', plan.skipped.length, 1)
  eq('manual — 사유', plan.skipped[0].reason, 'manual')
  eq('manual — 버킷 노출', plan.skipped[0].bucket, 24)
  eq('manual — postId 노출', plan.skipped[0].postId, p1)
}

// 3-4) 버킷이 다르면 서로 간섭하지 않는다.
//      1h 를 manual 로 채워둔 글도 24h 는 API 가 정상 수집해야 한다.
{
  const plan = planCollection([post(p1, 24)], [snap('snap-m', p1, 1, 'manual')], NOW)
  eq('다른 버킷 manual — insert 진행', plan.actions[0].kind, 'insert')
  eq('다른 버킷 manual — 보류 없음', plan.skipped.length, 0)
}

// 3-5) 다른 글의 스냅샷을 자기 것으로 오인하지 않는다(키가 post_id+bucket).
{
  const plan = planCollection([post(p1, 24)], [snap('snap-x', p2, 24, 'api')], NOW)
  eq('타 글 스냅샷 — insert 진행', plan.actions[0].kind, 'insert')
}

// 3-6) numeric 이 문자열로 와도 같은 버킷으로 인식한다.
//      PostgREST 는 numeric 을 number 로도 string 으로도 준다. 문자열을 놓치면
//      기존 행을 못 찾아 insert 를 때리고 UNIQUE 위반이 난다.
{
  const plan = planCollection([post(p1, 24)], [snap('snap-s', p1, '24', 'api')], NOW)
  eq('numeric 문자열 — update 로 인식', plan.actions[0].kind, 'update')
  eq('numeric 문자열 — snapshotId', plan.actions[0].snapshotId, 'snap-s')
}
{
  const plan = planCollection([post(p1, 24)], [snap('snap-s', p1, '24.0', 'manual')], NOW)
  eq('numeric 문자열 manual — 보류', plan.skipped[0]?.reason, 'manual')
}

// 3-7) 창 밖 글은 액션도 보류도 아니고 숫자로만 센다(응답 소음 방지).
{
  const plan = planCollection([post(p1, 10), post(p2, 100), post(p3, 1.0)], [], NOW)
  eq('창 밖 — 액션 1건', plan.actions.length, 1)
  eq('창 밖 — 카운트 2', plan.outOfWindow, 2)
  eq('창 밖 — 보류 목록 비어 있음', plan.skipped.length, 0)
}

// 3-8) external_id 없는 글(대시보드 수기 기록)은 인사이트를 부를 수 없다.
//      단, 창에 들었을 때만 알린다 — 아니면 14일 내내 매시간 목록에 쌓인다.
{
  const plan = planCollection([post(p1, 24, null)], [], NOW)
  eq('media_id 없음 — 액션 없음', plan.actions.length, 0)
  eq('media_id 없음 — 사유', plan.skipped[0].reason, 'no_media_id')
}
{
  const plan = planCollection([post(p1, 10, null)], [], NOW)
  eq('media_id 없고 창 밖 — 조용히 무시', plan.skipped.length, 0)
  eq('media_id 없고 창 밖 — outOfWindow 로만 집계', plan.outOfWindow, 1)
}

// 3-9) published_at 없는 행. 제약상 status='published' 면 나올 수 없지만,
//      나온다면 조용히 버리지 말고 드러내야 한다(제약이 깨졌다는 신호다).
{
  const plan = planCollection([post(p1, null)], [], NOW)
  eq('published_at 없음 — 액션 없음', plan.actions.length, 0)
  eq('published_at 없음 — 사유', plan.skipped[0].reason, 'no_published_at')
}

// ── 3-A) 명목값 근접 판정 ─────────────────────────────────────
// 창이 저장값보다 넓어서 같은 글이 같은 버킷에 여러 번 들어온다. 조건 없이
// 갱신하면 창 상한(30h/180h) 값이 24h/168h 라벨로 남는다. 여기가 새면
// spread_multiple 이 조용히 부풀려진다 — 에러는 나지 않는다.

// 3-A-1) 명목값(24)을 향해 다가가는 중 → 갱신
{
  const plan = planCollection([post('p', 23)], [snap('s', 'p', 24, 'api', 20, 23)], NOW)
  eq('근접 20h→23h — 갱신', plan.actions[0]?.kind, 'update')
  eq('근접 20h→23h — 보류 없음', plan.skipped.length, 0)
}

// 3-A-2) 명목값을 이미 지나쳐 멀어지는 중 → 갱신 안 함 (핵심 케이스)
{
  const plan = planCollection([post('p', 27)], [snap('s', 'p', 24, 'api', 24, 27)], NOW)
  eq('근접 24h→27h — 액션 없음', plan.actions.length, 0)
  eq('근접 24h→27h — 사유 not_closer', plan.skipped[0]?.reason, 'not_closer')
  eq('근접 24h→27h — 버킷 노출', plan.skipped[0]?.bucket, 24)
}

// 3-A-3) 지나쳤어도 아직 더 가까우면 갱신 (25 는 23 보다 24 에 가깝다)
{
  const plan = planCollection([post('p', 24.5)], [snap('s', 'p', 24, 'api', 23, 24.5)], NOW)
  eq('근접 23h→24.5h — 갱신(아직 더 가깝다)', plan.actions[0]?.kind, 'update')
}

// 3-A-4) 같은 거리면 갱신하지 않는다. 재실행이 API 를 또 태우면 안 된다.
{
  const plan = planCollection([post('p', 26)], [snap('s', 'p', 24, 'api', 22, 26)], NOW)
  eq('근접 22h↔26h 동거리 — 갱신 안 함', plan.actions.length, 0)
  eq('근접 22h↔26h 동거리 — not_closer', plan.skipped[0]?.reason, 'not_closer')
}

// 3-A-5) 창 상한까지 매시간 들어와도 수렴 후에는 더 안 부른다.
//        20h 에 처음 잡힌 글을 21,22,…,30h 로 훑는다.
{
  const calls = []
  let stored = null   // 저장된 시점의 나이
  for (let age = 20; age <= 30; age++) {
    const existing = stored === null ? [] : [snap('s', 'p', 24, 'api', stored, age)]
    const plan = planCollection([post('p', age)], existing, NOW)
    if (plan.actions.length) { calls.push(age); stored = age }
  }
  eq('창 전체 순회 — 호출 시점', calls.join(','), '20,21,22,23,24')
  eq('창 전체 순회 — 최종 저장 나이', stored, 24)
  check('창 전체 순회 — 조건 없는 갱신(11회)보다 적다', calls.length < 11, `${calls.length}회`)
}

// 3-A-6) 168h 도 같은 원리. 156h 부터 들어와 168h 에서 멈춘다.
{
  const calls = []
  let stored = null
  for (let age = 156; age <= 180; age++) {
    const existing = stored === null ? [] : [snap('s', 'p', 168, 'api', stored, age)]
    const plan = planCollection([post('p', age)], existing, NOW)
    if (plan.actions.length) { calls.push(age); stored = age }
  }
  eq('168h 창 — 최종 저장 나이', stored, 168)
  eq('168h 창 — 창 상한(180h) 값이 남지 않는다', calls.at(-1), 168)
  check('168h 창 — 조건 없는 갱신(25회)보다 적다', calls.length < 25, `${calls.length}회`)
}

// 3-A-7) 1h 버킷. 0.5h 에 잡히면 1.0h 까지만 갱신하고 1.5h 는 건드리지 않는다.
{
  const plan = planCollection([post('p', 1.5)], [snap('s', 'p', 1, 'api', 1.0, 1.5)], NOW)
  eq('1h 창 — 1.0h 저장 후 1.5h 는 갱신 안 함', plan.skipped[0]?.reason, 'not_closer')
}
{
  const plan = planCollection([post('p', 0.9)], [snap('s', 'p', 1, 'api', 0.5, 0.9)], NOW)
  eq('1h 창 — 0.5h→0.9h 갱신', plan.actions[0]?.kind, 'update')
}

// 3-A-8) captured_at 이 없으면(사전 조회에서 컬럼 누락 등) 갱신 허용으로 되돌린다.
//        낡은 값을 영구 붙박이로 만드는 것보다 낫다.
{
  const plan = planCollection([post('p', 29)], [snap('s', 'p', 24, 'api')], NOW)
  eq('captured_at 없음 — 갱신 허용', plan.actions[0]?.kind, 'update')
}
{
  const plan = planCollection([post('p', 29)], [{ id: 's', post_id: 'p', hours_since_publish: 24, source: 'api', captured_at: '언젠가' }], NOW)
  eq('captured_at 파싱 불가 — 갱신 허용', plan.actions[0]?.kind, 'update')
}

// 3-A-9) manual 보호가 근접 판정보다 먼저다. 더 가까운 값이 와도 덮지 않는다.
{
  const plan = planCollection([post('p', 24)], [snap('s', 'p', 24, 'manual', 20, 24)], NOW)
  eq('manual 우선 — 더 가까워도 보류', plan.skipped[0]?.reason, 'manual')
}

// 3-10) 실전 혼합 — 한 실행에 네 갈래가 동시에 나온다.
{
  const targets = [
    post('new-1h', 1.2),                 // 신규 1h
    post('upd-24h', 26),                 // 기존 api 갱신
    post('man-24h', 22),                 // manual 보호
    post('old', 300),                    // 창 밖
    post('week', 170),                   // 신규 168h
    post('nomedia', 24, null),           // media_id 없음
  ]
  const existing = [
    snap('s-upd', 'upd-24h', 24, 'api'),
    snap('s-man', 'man-24h', 24, 'manual'),
  ]
  const plan = planCollection(targets, existing, NOW)

  const kinds = plan.actions.map(a => `${a.postId}:${a.kind}:${a.bucket}`).sort()
  eq('혼합 — 액션 3건', plan.actions.length, 3)
  eq('혼합 — 액션 내역', kinds.join(' | '),
    'new-1h:insert:1 | upd-24h:update:24 | week:insert:168')
  eq('혼합 — 창 밖 1건', plan.outOfWindow, 1)
  eq('혼합 — 보류 2건', plan.skipped.length, 2)
  eq('혼합 — 보류 사유', plan.skipped.map(s => s.reason).sort().join(','), 'manual,no_media_id')

  // 저장값이 실제 나이가 아니라 정규화 값이어야 한다. 26h 를 그대로 넣으면
  // (post_id, hours_since_publish) UNIQUE 가 무력화되고 뷰의 FILTER 도 어긋난다.
  const upd = plan.actions.find(a => a.postId === 'upd-24h')
  eq('혼합 — 저장은 정규화 값 24', upd.bucket, 24)
  check('혼합 — 실제 나이는 따로 보존', Math.abs(upd.age - 26) < 0.001, `age=${upd.age}`)
}

// ── 4) fetchInsights — mock fetch 로 파싱·쿼터·에러 경로 검증 ──
// 실제 Threads API 는 부르지 않는다. 여기서 확인하려는 것은 응답 해석이지
// 네트워크가 아니다.

const { fetchInsights, readUsage } = await import('../lib/threads/insights.ts')

const realFetch = globalThis.fetch
function mockFetch({ ok = true, body, headers = {} }) {
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status: ok ? 200 : 400,
    headers,
  })
}

try {
  // 4-1) Meta 응답(values[0].value) 파싱
  mockFetch({
    body: { data: [
      { name: 'views',   values: [{ value: 1234 }] },
      { name: 'likes',   values: [{ value: 56 }] },
      { name: 'replies', values: [{ value: 7 }] },
    ] },
  })
  const m = await fetchInsights('media-1', 'tok')
  eq('insights — views 파싱', m.views, 1234)
  eq('insights — likes 파싱', m.likes, 56)
  eq('insights — replies 파싱', m.replies, 7)
  eq('insights — 누락 지표는 0', m.reposts, 0)
  eq('insights — 누락 지표는 0(shares)', m.shares, 0)

  // 4-2) total_value 형태도 받는다(지표에 따라 구조가 다르다)
  mockFetch({ body: { data: [{ name: 'views', total_value: { value: 99 } }] } })
  eq('insights — total_value 파싱', (await fetchInsights('m', 't')).views, 99)

  // 4-3) 쿼터 헤더를 콜백으로 올린다 — 추정 말고 실측
  mockFetch({
    body: { data: [] },
    headers: {
      'x-app-usage': '{"call_count":3,"total_time":1,"total_cputime":1}',
      'x-business-use-case-usage': '{"123":[{"call_count":3}]}',
    },
  })
  let seen = null
  await fetchInsights('m', 't', u => { seen = u })
  check('insights — x-app-usage 관측', seen?.app?.includes('call_count'), JSON.stringify(seen))
  check('insights — x-business-use-case-usage 관측', seen?.businessUseCase?.includes('123'), JSON.stringify(seen))

  // 4-4) 헤더가 없으면 콜백을 부르지 않는다(빈 usage 로 로그를 더럽히지 않는다)
  mockFetch({ body: { data: [] } })
  let called = false
  await fetchInsights('m', 't', () => { called = true })
  eq('insights — 헤더 없으면 콜백 없음', called, false)

  // 4-5) 실패 응답은 throw. 라우트가 이 글만 failed 로 넘기고 나머지를 계속한다.
  //      실패 응답에서도 쿼터는 읽어야 한다 — 한도 초과야말로 봐야 할 순간이다.
  mockFetch({
    ok: false,
    body: { error: { message: 'rate limited', code: 4 } },
    headers: { 'x-app-usage': '{"call_count":100}' },
  })
  let usageOnError = null
  let threw = false
  try {
    await fetchInsights('m', 't', u => { usageOnError = u })
  } catch (e) {
    threw = true
    check('insights — 에러 본문을 메시지에 포함', String(e).includes('rate limited'), String(e))
  }
  check('insights — 실패 시 throw', threw)
  check('insights — 실패 응답에서도 쿼터 관측', usageOnError?.app?.includes('100'), JSON.stringify(usageOnError))

  // 4-6) readUsage 단독
  eq('readUsage — 헤더 없으면 null', readUsage(new Response('{}')), null)
} finally {
  globalThis.fetch = realFetch
}

// ── 결과 ──────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n❌ ${failures.length}건 실패 (통과 ${passed})\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✅ ${passed}건 통과`)
