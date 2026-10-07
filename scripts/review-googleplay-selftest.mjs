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
import fs from 'node:fs'
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

// ── 1b) 실응답 축약본(2026-10-07, kr:ko:com.Slack 2페이지) — v27 토큰 경로 ─────────
// 작성자·본문은 비식별 치환, 배열 구조·id·날짜·버전·토큰은 실응답 그대로(fixtures/review/googleplay/page{1,2}-real.txt).
const real1 = fs.readFileSync(new URL('../fixtures/review/googleplay/page1-real.txt', import.meta.url), 'utf8')
const real2 = fs.readFileSync(new URL('../fixtures/review/googleplay/page2-real.txt', import.meta.url), 'utf8')
const realInner = (b) => JSON.parse(JSON.parse(b.slice(b.indexOf('\n'))).find((f) => f[0] === 'wrb.fr')[2])
{
  const r = googleplayAdapter.parse(real1, ctx())
  t('실응답 p1: 3건', r.reviews.length, 3)
  t('실응답 p1: 실패 0', r.parseFailures, 0)
  t('실응답 p1: 다음 커서 = inner[1][1] 토큰(v27 수정 전엔 null)', r.nextCursor, realInner(real1)[1][1])
  t('실응답 p1: 커서가 비어 있지 않다', typeof r.nextCursor === 'string' && r.nextCursor.length > 20, true)
  t('실응답 p1: id', r.reviews[0].externalId, '627fdda8-19f1-43df-92c9-bad40aed2426')
  t('실응답 p1: 별점', r.reviews[0].rating, 1)
  t('실응답 p1: 버전 머리말', r.reviews[0].text.startsWith('(v26.09.41.0) '), true)
  t('실응답 p1: 날짜(KST)', r.reviews[0].writtenAt, '2026-09-28')
  t('실응답 형태: inner 는 두 칸', realInner(real1).length, 2)
  t('옛 경로 at(inner,-2,-1) 은 실응답에서 문자열이 아니다(회귀 근거)', typeof realInner(real1)[0].at(-1), 'object')
  const r2 = googleplayAdapter.parse(real2, ctx({ cursor: r.nextCursor }))
  t('실응답 p2: 3건 · 다른 리뷰', r2.reviews.length === 3 && r2.reviews[0].externalId !== r.reviews[0].externalId, true)
  t('실응답 p2: 다음 토큰도 읽힌다', typeof r2.nextCursor === 'string' && r2.nextCursor !== r.nextCursor, true)
}
{
  // 끝 vs 못 읽음(§7.1)
  const list = [entry('u1', '하나')]
  t('토큰 칸 null = 끝(실패 0)', googleplayAdapter.parse(rpc([list, null]), ctx()).parseFailures, 0)
  t('토큰 칸 [null] = 끝(실패 0)', googleplayAdapter.parse(rpc([list, [null]]), ctx()).parseFailures, 0)
  t('토큰 칸 없음 = 끝(실패 0)', googleplayAdapter.parse(rpc([list]), ctx()).parseFailures, 0)
  const bad = googleplayAdapter.parse(rpc([list, [null, 123]]), ctx())
  t('토큰 자리에 숫자 = 못 읽음(실패 1)', bad.parseFailures, 1)
  t('토큰 자리에 숫자 = 다음 커서 없음', bad.nextCursor, null)
  t('쓸 수 없는 토큰(따옴표) = 못 읽음(실패 1)', googleplayAdapter.parse(rpc([list, [null, 'a"b']]), ctx()).parseFailures, 1)
  // 이미 본 구간: 기준일(2025-10-06)보다 오래된 리뷰(2025-10-05)가 있으면 더 내려가지 않는다
  t('이미 본 구간 도달 = 다음 커서 없음', googleplayAdapter.parse(page1, ctx({ lastReviewAt: '2025-10-06' })).nextCursor, null)
  t('기준일보다 새 것뿐 = 계속', googleplayAdapter.parse(page1, ctx({ lastReviewAt: '2025-10-01' })).nextCursor, 'TOKEN_P2')
}
t('어댑터: incrementalOnly(v27)', googleplayAdapter.incrementalOnly, true)
t('어댑터: maxPagesPerRun 2(v27)', googleplayAdapter.maxPagesPerRun, 2)

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
  t('경계: 끝까지 읽어도 닫지 않는다(incrementalOnly, v27)', h.log.saves.at(-1).status, 'active')
}
{
  // v27: 토큰이 계속 이어져도 실행 1회 2페이지에서 멈추고, 증분형이라 커서를 버린다(다음 실행은 최신부터).
  const page2more = rpc([[entry('uuid-7', '두 번째', 3, null, SEC - 86400)], [null, 'TOKEN_P3'], null])
  const h = harness({ byToken: { first: page1, TOKEN_P2: page2more, TOKEN_P3: page2 } })
  const r = await run(h)
  t('상한: 요청 2회에서 멈춘다(TOKEN_P3 요청 안 함)', h.log.inits.length, 2)
  t('상한: 마지막 저장 커서 null(최신부터 다시)', h.log.saves.at(-1).cursor, null)
  t('상한: 마지막 저장 active', h.log.saves.at(-1).status, 'active')
  t('상한: 걸린 사실이 결과 문구에 남는다(§7.2)', r.perTarget[0].outcome.includes('페이지 상한 2'), true)
}
{
  // 실응답 축약본 2페이지를 실제 러너로 — 커서가 p1 토큰 → p2 로 실제 전진하는지
  const tok1 = realInner(real1)[1][1]
  const h = harness({})
  const inits = []
  h.ports.fetchText = async (url, init) => {
    if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nAllow: /\n', finalUrl: url }
    inits.push(init)
    return { status: 200, body: decodeURIComponent(init.body).includes(tok1) ? real2 : real1 }
  }
  const r = await run(h)
  t('실응답 경계: 2요청', inits.length, 2)
  t('실응답 경계: 두 번째 요청 본문에 p1 토큰', decodeURIComponent(inits[1].body).includes(tok1), true)
  t('실응답 경계: 신규 6건', r.stats.newReviews, 6)
  t('실응답 경계: 파싱 실패 0', r.stats.parseFailures, 0)
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

// ── 4) 방문 순서(남헌 v40 §3-②) — 실제 store.listDueTargets + 실제 순수함수. 가짜는 supabase 뿐 ──
// 가짜 supabase: 쿼리 체인을 기록하고, 끝에서 resolve(calls) 로 응답을 만든다.
function chainSupa(resolve) {
  const queries = []
  return {
    queries,
    from(table) {
      const calls = [['from', table]]
      queries.push(calls)
      const q = new Proxy({}, {
        get(_, k) {
          if (k === 'then') return (ok, ko) => Promise.resolve().then(() => resolve(calls)).then(ok, ko)
          return (...a) => { calls.push([k, ...a]); return q }
        },
      })
      return q
    },
  }
}
const arg = (calls, k, i = 0) => calls.filter((c) => c[0] === k).map((c) => c[1 + i])
// 미방문 3종 + 방문 2개. DB 기본 순서(last_run_at NULLS FIRST, created_at)대로 늘어놓는다.
const gpRow = (id, pid, lastRun, total = 0) => ({ id, project_id: pid, source_key: 'googleplay', product_ref: `kr:ko:com.${id}.app`, cursor: null, last_review_at: null, consecutive_empty: 0, total_collected: total, last_run_at: lastRun })
const GP_ROWS = [
  gpRow('none', 'pNone', null), // 앱스토어 타깃 없음
  gpRow('active', 'pActive', null), // 앱스토어 활성
  gpRow('exh', 'pExh', null), // 앱스토어 exhausted
  gpRow('vBig', 'pExh2', '2026-10-01T00:00:00Z', 40), // 방문 ∧ 앱스토어 exhausted(30건) → 합계 70
  gpRow('vSmall', 'pExh3', '2026-10-02T00:00:00Z', 5), // 방문 ∧ 앱스토어 exhausted(10건) → 합계 15
]
const AS_ROWS = [
  { project_id: 'pActive', status: 'active', total_collected: 10 },
  { project_id: 'pExh', status: 'exhausted', total_collected: 50 },
  { project_id: 'pExh2', status: 'exhausted', total_collected: 30 },
  { project_id: 'pExh3', status: 'exhausted', total_collected: 10 },
]
const gpSupa = (asResp = { data: AS_ROWS, error: null }, gpRows = GP_ROWS) =>
  chainSupa((calls) => (arg(calls, 'eq', 1)[0] === 'appstore' ? (typeof asResp === 'function' ? asResp() : asResp) : { data: gpRows, error: null }))
const ids = (ts) => ts.map((x) => x.id).join(',')
{
  const sb = gpSupa()
  const got = await createReviewStore(sb).listDueTargets('googleplay', 10)
  t('순서: 미방문 exhausted → 미방문 나머지(기존 순서) → 방문(기존 순서)', ids(got), 'exh,none,active,vBig,vSmall')
  t('조회: 정확히 2번(N+1 없음)', sb.queries.length, 2)
  t('조회: 앱스토어는 프로젝트 in 한 번', JSON.stringify(arg(sb.queries[1], 'in', 1)[0]), JSON.stringify(['pNone', 'pActive', 'pExh', 'pExh2', 'pExh3']))
  t('조회: googleplay 는 last_run_at NULLS FIRST, created_at 순', JSON.stringify(arg(sb.queries[0], 'order')), '["last_run_at","created_at"]')
  t('limit 은 정렬 뒤 자른다', ids(await createReviewStore(gpSupa()).listDueTargets('googleplay', 2)), 'exh,none')
  t('반환 모양은 TargetState 그대로', JSON.stringify(Object.keys(got[0]).sort()), JSON.stringify(['consecutiveEmpty', 'cursor', 'id', 'lastReviewAt', 'productRef', 'projectId', 'sourceKey']))
}
{
  // 기본(GP_PRIORITY_REPEAT=false): 방문 이력 있는 타깃은 기존 순서 그대로
  const { orderGooglePlayTargets, summarizeAppStore, GP_PRIORITY_REPEAT } = await import('../lib/review/runner.ts')
  t('확장 상수 기본값 false(사양대로, 남헌 승인 전)', GP_PRIORITY_REPEAT, false)
  const rows = GP_ROWS.map((r) => ({ id: r.id, projectId: r.project_id, lastRunAt: r.last_run_at, totalCollected: r.total_collected }))
  const as = summarizeAppStore(AS_ROWS)
  t('기본: 방문 타깃 순서 불변', ids(orderGooglePlayTargets(rows, as).filter((r) => r.lastRunAt)), 'vBig,vSmall')
  // 확장 true: 방문 중 exhausted ∧ 앱스토어<100 을 앞으로, 합계 수집 적은 순(vSmall 15 < vBig 70). 미방문이 여전히 먼저.
  t('확장 true: 수집 적은 순', ids(orderGooglePlayTargets(rows, as, true)), 'exh,none,active,vSmall,vBig')
  const asBig = summarizeAppStore([...AS_ROWS.filter((r) => r.project_id !== 'pExh3'), { project_id: 'pExh3', status: 'exhausted', total_collected: 100 }])
  t('확장 true: 앱스토어 100건 이상이면 우선 아님', ids(orderGooglePlayTargets(rows, asBig, true)), 'exh,none,active,vBig,vSmall')
  const asMixed = summarizeAppStore([...AS_ROWS, { project_id: 'pExh', status: 'active', total_collected: 0 }])
  t('앱스토어 타깃 중 하나라도 active 면 exhausted 아님', ids(orderGooglePlayTargets(rows, asMixed)), 'none,active,exh,vBig,vSmall')
  t('조회 실패(null)면 입력 순서 그대로', ids(orderGooglePlayTargets(rows, null, true)), 'none,active,exh,vBig,vSmall')
}
for (const [label, asResp] of [
  ['오류 응답', { data: null, error: { message: 'boom' } }],
  ['예외', () => { throw new Error('network down') }],
]) {
  const warns = []
  const origWarn = console.warn
  console.warn = (m) => warns.push(String(m))
  const got = await createReviewStore(gpSupa(asResp)).listDueTargets('googleplay', 10)
  console.warn = origWarn
  t(`조회 실패(${label}): 기존 순서로 돈다`, ids(got), 'none,active,exh,vBig,vSmall')
  t(`조회 실패(${label}): ⚠️ 한 줄`, warns.length === 1 && warns[0].startsWith('⚠️'), true)
}
{
  // 다른 소스 불변: v40 이전 쿼리 체인과 바이트 단위로 같다(쿼리 1번, 정렬 1단, DB limit).
  const before = (key, n) => JSON.stringify([
    ['from', 'review_targets'],
    ['select', 'id, project_id, source_key, product_ref, cursor, last_review_at, consecutive_empty, total_collected'],
    ['eq', 'source_key', key], ['eq', 'status', 'active'],
    ['order', 'last_run_at', { ascending: true, nullsFirst: true }],
    ['limit', n],
  ])
  for (const key of ['appstore', 'danawa', 'hackernews', 'kakao', 'youtube']) {
    const rows = [gpRow('b', 'p2', null), gpRow('a', 'p1', '2026-10-01T00:00:00Z')].map((r) => ({ ...r, source_key: key }))
    const sb = chainSupa(() => ({ data: rows, error: null }))
    const got = await createReviewStore(sb).listDueTargets(key, 7)
    t(`다른 소스 불변(${key}): 쿼리 체인`, JSON.stringify(sb.queries[0]), before(key, 7))
    t(`다른 소스 불변(${key}): 쿼리 1번`, sb.queries.length, 1)
    t(`다른 소스 불변(${key}): DB 순서 그대로`, ids(got), 'b,a')
  }
}
{
  // 러너 통합: 실제 store(가짜 supabase 10타깃) → 실제 러너 → 실제 어댑터. targetLimit 3 이면 우선 대상 3개가 먼저 선택된다.
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => gpRow(`n${i}`, `pn${i}`, null)), // 앱스토어 없음
    ...Array.from({ length: 3 }, (_, i) => gpRow(`x${i}`, `px${i}`, null)), // 앱스토어 exhausted — DB 순서상 뒤쪽
    gpRow('v0', 'pv0', '2026-10-01T00:00:00Z'),
  ]
  const as = [0, 1, 2].map((i) => ({ project_id: `px${i}`, status: 'exhausted', total_collected: 20 }))
  const real = createReviewStore(gpSupa({ data: as, error: null }, rows))
  const h = harness({ byToken: { first: pageEmpty } })
  h.ports.store.listDueTargets = (k, n) => real.listDueTargets(k, n)
  const r = await runCollection(googleplayAdapter, { dryRun: false, targetLimit: 3 }, h.ports)
  t('러너 통합: 방문 3개', r.targetsVisited, 3)
  t('러너 통합: 앱스토어 exhausted 대상이 먼저 선택', [...new Set(h.log.saves.map((s) => s.targetId))].join(','), 'x0,x1,x2')
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log('ℹ️ 리뷰·토큰 위치는 2026-10-07 실응답 축약본으로 확인. 마지막 페이지 모양은 실측 전(null·[null] 둘 다 끝으로 받음).')
