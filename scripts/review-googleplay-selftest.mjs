#!/usr/bin/env node
// Google Play 어댑터 + 저장 경로 셀프테스트 — 네트워크·DB 없음.
//
// ⚠️ 픽스처는 **합성본**이다. 실제 Play 응답을 받아 저장한 게 아니다(이 작업은 외부 호출 금지).
//    구조는 공개 라이브러리 google-play-scraper ElementSpecs.Review 를 따라 만들었다. 그래서 이 테스트가
//    증명하는 것은 "그 구조라면 파서·경계가 맞다"까지이고, "Play 가 지금 그 구조로 준다"는 아니다(§7.1).
//
// 세 층을 따로 본다:
//   1) 파서 단위 — 정상·0건·실패(비RPC·프레임 없음·필드 누락)를 가른다
//   2) **실제 어댑터 + 실제 러너** 경계 — 가짜는 네트워크·DB 포트뿐이다(§7.1-5: 가짜 어댑터로 통합을 주장하지 않는다)
//      robots 금지·확인 불가면 요청 0, 429 면 즉시 중단, 토큰으로 2페이지 전진, rating·lang·sourceUrl 이 appendInput 까지 간다
//   3) store.appendInput — 새 컬럼에 쓰고, 컬럼 부재(PGRST204/42703)면 옛 형태로 다시 넣는다

import { googleplayAdapter, parseProductRef, buildBody, reviewUrl, BATCH_URL, RPC_ID } from '../lib/review/adapters/googleplay.ts'
import { runCollection, USER_AGENT, isOwnerRobotsOverride } from '../lib/review/runner.ts'
import { createReviewStore, reviewMetaColumns, isMissingMetaColumn } from '../lib/review/store.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

// ── 합성 응답 ─────────────────────────────────────────────────────
const SEC = 1759640400 // 2025-10-05T05:00:00Z → KST 2025-10-05
const entry = (id, text, score = 4, version = '6.1.0', sec = SEC) =>
  [id, ['홍길동', [null, null, [null, null, 'https://x']]], score, null, text, [sec, 0], 3, null, null, null, version]
const rpc = (inner) => `)]}'\n\n${JSON.stringify([['wrb.fr', RPC_ID, inner === undefined ? null : JSON.stringify(inner), null, null, null, 'generic'], ['di', 42]])}`

const page1 = rpc([[entry('uuid-1', '알림이 늦게 와요'), entry('uuid-2', '좋아요', 5), entry('uuid-3', '로그인 오류', 1, null)], [null, 'TOKEN_P2'], null])
const page2 = rpc([[entry('uuid-4', '두 번째 페이지', 3, '6.0.0', SEC - 86400)], null, null])
const pageEmpty = rpc([null, null, null])
const loginWall = '<!doctype html><html><body>Sign in</body></html>'
const noPayload = rpc(undefined)
const broken = rpc([[entry('uuid-5', '정상'), ['uuid-6', null, 5, null, null], [null, null, 5, null, '본문만']], null, null])

const ctx = (over = {}) => ({ productRef: 'kr:ko:com.Slack', cursor: null, ...over })

// ── 1) product_ref ───────────────────────────────────────────────
t('ref: gl:hl:pkg', JSON.stringify(parseProductRef('kr:ko:com.Slack')), '{"gl":"kr","hl":"ko","pkg":"com.Slack"}')
t('ref: 패키지만이면 kr:ko', parseProductRef('com.notion.id').hl, 'ko')
t('ref: 대문자 국가·언어는 소문자로', parseProductRef('US:EN:com.a.b').gl, 'us')
t('ref: 점 없는 패키지는 거부', parseProductRef('kr:ko:slack'), null)
t('ref: URL 은 거부', parseProductRef('https://play.google.com/store/apps/details?id=com.a'), null)
t('ref: 따옴표 주입 거부', parseProductRef('kr:ko:com.a"b'), null)
t('ref: 두 조각은 거부(모호)', parseProductRef('kr:com.a.b'), null)

// ── 1) nextRequest ───────────────────────────────────────────────
{
  const r = googleplayAdapter.nextRequest({ productRef: 'us:en:com.Slack', cursor: null })
  t('URL: 호스트·경로 고정 + hl·gl', r.url, `${BATCH_URL}?hl=en&gl=us`)
  t('POST', r.init.method, 'POST')
  t('헤더에 UA 를 싣지 않는다(러너가 우리 UA 로 고정)', Object.keys(r.init.headers).some((k) => k.toLowerCase() === 'user-agent'), false)
  t('본문: 첫 페이지는 토큰 null', decodeURIComponent(r.init.body).includes('[40,null,null]'), true)
  t('본문: 패키지', decodeURIComponent(r.init.body).includes('\\"com.Slack\\"'), true)
  const r2 = googleplayAdapter.nextRequest({ productRef: 'us:en:com.Slack', cursor: 'TOKEN_P2' })
  t('본문: 커서 = 토큰', decodeURIComponent(r2.init.body).includes('\\"TOKEN_P2\\"'), true)
  t('이상한 커서(따옴표)면 요청하지 않는다', googleplayAdapter.nextRequest({ productRef: 'kr:ko:com.a.b', cursor: 'x"]' }), null)
  t('잘못된 ref 면 요청하지 않는다', googleplayAdapter.nextRequest({ productRef: 'bad', cursor: null }), null)
  t('buildBody 는 f.req= 로 시작', buildBody('com.a.b', null).startsWith('f.req='), true)
}

// ── 1) parse ─────────────────────────────────────────────────────
{
  const r = googleplayAdapter.parse(page1, ctx())
  t('정상: 3건', r.reviews.length, 3)
  t('정상: 실패 0', r.parseFailures, 0)
  t('정상: 다음 커서 = 토큰', r.nextCursor, 'TOKEN_P2')
  const a = r.reviews[0]
  t('id', a.externalId, 'uuid-1')
  t('본문에 버전', a.text, '(v6.1.0) 알림이 늦게 와요')
  t('버전 없으면 본문만', r.reviews[2].text, '로그인 오류')
  t('별점', a.rating, 4)
  t('언어 = 요청 hl', a.lang, 'ko')
  t('날짜 KST', a.writtenAt, '2025-10-05')
  t('원문 주소', a.sourceUrl, reviewUrl('com.Slack', 'ko', 'kr', 'uuid-1'))
  t('원문 주소는 play.google.com https', a.sourceUrl.startsWith('https://play.google.com/store/apps/details?id=com.Slack&hl=ko&gl=kr&reviewId='), true)
  t('작성자 싣지 않음', a.authorMasked, null)
}
t('마지막 페이지: 토큰 없음 → 끝', googleplayAdapter.parse(page2, ctx({ cursor: 'TOKEN_P2' })).nextCursor, null)
t('같은 토큰 재수신은 끝(제자리 반복 방지)', googleplayAdapter.parse(page1, ctx({ cursor: 'TOKEN_P2' })).nextCursor, null)
{
  const r = googleplayAdapter.parse(pageEmpty, ctx())
  t('0건 정상: 리뷰 0', r.reviews.length, 0)
  t('0건 정상: 실패 0(0건 ≠ 고장)', r.parseFailures, 0)
}
t('로그인 벽 HTML(200 이어도) = 실패', googleplayAdapter.parse(loginWall, ctx()).parseFailures, 1)
t('빈 본문 = 실패', googleplayAdapter.parse('', ctx()).parseFailures, 1)
t('RPC 페이로드 null = 실패(요청 거부)', googleplayAdapter.parse(noPayload, ctx()).parseFailures, 1)
t('다른 RPC 프레임만 = 실패', googleplayAdapter.parse(`)]}'\n\n[["wrb.fr","OTHER","[]"]]`, ctx()).parseFailures, 1)
{
  const r = googleplayAdapter.parse(broken, ctx())
  t('필드 누락: 정상 1건', r.reviews.length, 1)
  t('필드 누락: 본문 없음·id 없음 = 실패 2', r.parseFailures, 2)
}

// ── 2) 실제 어댑터 + 실제 러너 ─────────────────────────────────────
function harness({ robots = 'User-agent: *\nAllow: /\n', robotsStatus = 200, byToken = {}, status = {}, loadSource } = {}) {
  const log = { fetched: [], inits: [], inputs: [], saves: [] }
  let clock = 1_000_000
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url, init) {
      log.fetched.push(url)
      if (url.endsWith('/robots.txt')) return robotsStatus === null ? { status: null, body: '', error: 'ECONNRESET' } : { status: robotsStatus, body: robots, finalUrl: url }
      log.inits.push(init)
      const tok = /TOKEN_[A-Z0-9]+/.exec(decodeURIComponent(init?.body ?? ''))?.[0] ?? 'first'
      if (status[tok]) return { status: status[tok], body: '' }
      return { status: 200, body: byToken[tok] ?? '' }
    },
    store: {
      loadSource: loadSource ?? (async () => ({ key: 'googleplay', enabled: true, minIntervalMs: 4000, dailyRequestCap: 200, requestsToday: 0 })),
      async listDueTargets() { return [{ id: 'g1', projectId: 'p1', sourceKey: 'googleplay', productRef: 'kr:ko:com.Slack', cursor: null, lastReviewAt: null, consecutiveEmpty: 0 }] },
      async saveTargetProgress(p) { log.saves.push(p) },
      async recordFingerprint() { return 'new' },
      async appendInput(i) { log.inputs.push(i); return `in${log.inputs.length}` },
      async linkFingerprint() {},
    },
  }
  return { ports, log }
}
const run = (h) => runCollection(googleplayAdapter, { dryRun: false, targetLimit: 5 }, h.ports)

{
  const h = harness({ byToken: { first: page1, TOKEN_P2: page2 } })
  const r = await run(h)
  t('경계: 2페이지 전진(토큰)', h.log.inits.length, 2)
  t('경계: 신규 4건', r.stats.newReviews, 4)
  t('경계: robots 먼저 읽는다', h.log.fetched[0], 'https://play.google.com/robots.txt')
  t('경계: rating 이 appendInput 까지', h.log.inputs[0].rating, 4)
  t('경계: lang 이 appendInput 까지', h.log.inputs[0].lang, 'ko')
  t('경계: sourceUrl 이 appendInput 까지', h.log.inputs[0].sourceUrl, reviewUrl('com.Slack', 'ko', 'kr', 'uuid-1'))
  t('경계: 본문 머리말도 그대로([SRC:])', h.log.inputs[0].text.startsWith('[SRC: https://play.google.com/'), true)
  t('경계: 끝까지 읽으면 exhausted', h.log.saves.at(-1).status, 'exhausted')
}
{
  const h = harness({ robots: 'User-agent: *\nDisallow: /_/\n', byToken: { first: page1 } })
  const r = await run(h)
  t('robots 금지: 요청 0', h.log.inits.length, 0)
  t('robots 금지: robotsSkips 1', r.robotsSkips, 1)
}
// 소유자 예외(남헌 2026-10-06) — DB 행 → **실제 store.loadSource** → 실제 러너 → 실제 어댑터. 가짜는 supabase·네트워크뿐.
// robots 는 실측 그대로(`User-agent: *` 에 `Disallow: /_`, batchexecute 가 /_/PlayStoreUi/… 라 금지).
const PLAY_ROBOTS = 'User-agent: *\nDisallow: /_\n'
function sourceRowSupa(row) {
  return {
    from(table) {
      if (table === 'review_sources') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }
      return { select: () => ({ eq: () => ({ gte: async () => ({ data: [], error: null }) }) }) }
    },
  }
}
const ownerRun = async (override, robotsStatus = 'disallowed', robots = PLAY_ROBOTS, robotsHttp = 200) => {
  const row = { key: 'googleplay', enabled: true, min_interval_ms: 8000, daily_request_cap: 40, override, robots_status: robotsStatus }
  const store = createReviewStore(sourceRowSupa(row))
  const h = harness({ robots, robotsStatus: robotsHttp, byToken: { first: page1, TOKEN_P2: page2 }, loadSource: (k) => store.loadSource(k) })
  return { h, r: await run(h) }
}
{
  const { h, r } = await ownerRun('owner_2026-10-06')
  t('소유자 예외 10-06: robots /_ 금지를 통과해 요청한다', h.log.inits.length, 2)
  t('소유자 예외 10-06: 사용 건수 = 요청 수', r.robotsOwnerOverride, 2)
  t('소유자 예외 10-06: robotsSkips 0', r.robotsSkips, 0)
  t('소유자 예외 10-06: 적재 4건', r.stats.newReviews, 4)
}
{
  const { h, r } = await ownerRun('owner_2026-10-07')
  t('잘못된 override 값: 요청 0', h.log.inits.length, 0)
  t('잘못된 override 값: robots 금지로 센다', r.robotsSkips, 1)
}
{
  const { h } = await ownerRun('owner_2026-10-06', 'unverified')
  t('override 맞아도 행이 unverified 면 요청 0', h.log.inits.length, 0)
}
{
  const { h } = await ownerRun('owner_2026-10-06', 'disallowed', PLAY_ROBOTS, 404)
  t('소유자 예외여도 robots 확인 불가(404)는 요청 0', h.log.inits.length, 0)
}
{
  const { h } = await ownerRun('owner_2026-10-06', 'disallowed', PLAY_ROBOTS, 503)
  t('소유자 예외여도 robots 5xx 는 요청 0', h.log.inits.length, 0)
}
{
  const h = harness({ robotsStatus: null, byToken: { first: page1 } })
  await run(h)
  t('robots 못 읽음(네트워크): 요청 0 — 우회 표식 없음', h.log.inits.length, 0)
}
{
  const h = harness({ robotsStatus: 404, byToken: { first: page1 } })
  await run(h)
  t('robots 404(확인 불가): 요청 0 — proceedWhenRobotsUnverified 미선언', h.log.inits.length, 0)
}
{
  const h = harness({ byToken: { first: page1 }, status: { TOKEN_P2: 429 } })
  const r = await run(h)
  t('429: 두 번째 요청에서 멈춘다', h.log.inits.length, 2)
  t('429: 차단으로 센다', r.stats.blockedResponses, 1)
  t('429: 첫 페이지 3건은 적재됨', r.stats.newReviews, 3)
}
{
  const h = harness({ status: { first: 403 } })
  const r = await run(h)
  t('403: 첫 요청에서 멈춘다', h.log.inits.length, 1)
  t('403: 적재 0', r.stats.newReviews, 0)
}
{
  // 2026-10-05 v19 B: 빈 응답은 "파싱 실패 후 그 타깃만 끝"이 아니라 **차단 → 실행 즉시 중단·실패 기록**이다(abortOnChallenge).
  // 예전 기대(parseFailures 1)보다 강하다 — 차단은 review-collect.mjs 가 실패로 세고, 같은 소스의 다른 타깃도 멈춘다.
  const h = harness({ byToken: { first: '' } })
  const r = await run(h)
  t('빈 응답: 차단으로 센다(0건 정상 아님)', r.stats.blockedResponses, 1)
  t('빈 응답: 더 요청하지 않는다', h.log.inits.length, 1)
  t('빈 응답: 적재 0', r.stats.newReviews, 0)
}
{
  const h = harness({ byToken: { first: '<html><div class="g-recaptcha"></div>Our systems have detected unusual traffic</html>' } })
  const r = await run(h)
  t('캡차: 차단으로 센다', r.stats.blockedResponses, 1)
  t('캡차: 더 요청하지 않는다', h.log.inits.length, 1)
}
t('어댑터: abortOnChallenge 선언', googleplayAdapter.abortOnChallenge, true)
t('어댑터: robots 우회 표식 없음', googleplayAdapter.proceedWhenRobotsUnverified, undefined)
{
  // 등록 대조 — 마이그 000005 의 key·ADAPTERS 맵 키·정책 값(우회 없음 · short_only · forbids_automation)
  const fsm = await import('node:fs/promises')
  const sql = await fsm.readFile(new URL('../supabase/migrations/20261005000005_review_sources_googleplay.sql', import.meta.url), 'utf8')
  const collect = await fsm.readFile(new URL('./review-collect.mjs', import.meta.url), 'utf8')
  t('등록(000005): ADAPTERS 에 googleplay', /^\s*googleplay: googleplayAdapter,/m.test(collect), true)
  t('등록(000005): key googleplay', sql.includes("'googleplay'"), true)
  const insert = sql.slice(sql.indexOf('INSERT INTO'), sql.indexOf('ON CONFLICT (key) DO NOTHING;'))
  t('등록(000005): short_only · forbids_automation · disallowed · owner_2026-10-06', ["'short_only'", "'forbids_automation'", "'disallowed'", "'owner_2026-10-06'"].every((s) => insert.includes(s)), true)
  t('등록(000005): 옛 값(owner_2026-10-05 · unverified) 없음', ["'owner_2026-10-05'", "'unverified'"].some((s) => insert.includes(s)), false)
  t('등록(000005): 행 값이 러너 소유자 예외를 연다', isOwnerRobotsOverride('owner_2026-10-06', 'disallowed'), true)
  t('등록(000005): 보수적 시드 8000 · 40', /'ok',\s*8000,\s*40,/.test(insert), true)
  t('등록(000005): ON CONFLICT DO NOTHING', /ON CONFLICT \(key\) DO NOTHING/.test(sql), true)
}
t('UA 는 우리 것(위장 없음)', USER_AGENT.startsWith('solutionarchive-review-collector/'), true)

// ── 3) store.appendInput 폴백 ─────────────────────────────────────
t('meta: 반올림(다나와 4.5)', reviewMetaColumns({ rating: 4.5 }).rating, 5)
t('meta: 범위 밖 별점은 NULL', reviewMetaColumns({ rating: 7 }).rating, null)
t('meta: http 주소는 NULL(CHECK 와 같은 경계)', reviewMetaColumns({ sourceUrl: 'http://a.b' }).source_url, null)
t('meta: lang 소문자', reviewMetaColumns({ lang: 'KO' }).lang, 'ko')
t('meta: 이상한 lang 은 NULL', reviewMetaColumns({ lang: 'ko; drop' }).lang, null)
t('부재 판정: PGRST204 + 우리 컬럼', isMissingMetaColumn({ code: 'PGRST204', message: "Could not find the 'rating' column of 'analysis_inputs' in the schema cache" }), true)
t('부재 판정: 42703 + 우리 컬럼', isMissingMetaColumn({ code: '42703', message: 'column "source_url" of relation "analysis_inputs" does not exist' }), true)
t('부재 판정: 다른 컬럼 부재는 삼키지 않는다', isMissingMetaColumn({ code: 'PGRST204', message: "Could not find the 'source_key' column" }), false)
t('부재 판정: 다른 오류는 아님', isMissingMetaColumn({ code: '23505', message: "'rating'" }), false)

function fakeSupa(missing) {
  const rows = []
  return {
    rows,
    from() {
      return {
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  if (missing && 'rating' in row) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'lang' column of 'analysis_inputs' in the schema cache" } }
                  rows.push(row)
                  return { data: { id: `id${rows.length}` }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}
const input = { projectId: 'p', sourceKey: 'googleplay', text: 'x', collectedAt: '2026-10-05T00:00:00Z', rating: 3, lang: 'ko', sourceUrl: 'https://play.google.com/a' }
{
  const sb = fakeSupa(false)
  const id = await createReviewStore(sb).appendInput(input)
  t('적용 환경: 새 컬럼에 쓴다', JSON.stringify([sb.rows[0].rating, sb.rows[0].lang, sb.rows[0].source_url]), '[3,"ko","https://play.google.com/a"]')
  t('적용 환경: id 반환', id, 'id1')
}
{
  const sb = fakeSupa(true)
  const store = createReviewStore(sb)
  const origWarn = console.warn
  console.warn = () => {}
  const id = await store.appendInput(input)
  await store.appendInput(input)
  console.warn = origWarn
  t('미적용 환경: 옛 형태로 들어간다', 'rating' in sb.rows[0], false)
  t('미적용 환경: id 반환(수집이 멈추지 않는다)', id, 'id1')
  t('미적용 환경: 두 번째 행도 들어간다', sb.rows.length, 2)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log('⚠️ 합성 픽스처 기준 통과 — 실제 Play 응답 구조는 실측 전이다(robots 는 2026-10-06 실측 `Disallow: /_` 을 하네스에 반영).')
