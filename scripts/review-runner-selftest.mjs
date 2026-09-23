#!/usr/bin/env node
// 수집 러너 셀프테스트 — 네트워크도 DB 도 없이 돈다.
//
// 러너가 외부 세계를 전부 포트로 주입받는 이유가 이것이다. 마이그레이션
// 적용을 기다리지 않고 지금 전 경로를 검증한다.
//
// 여기서 고정하는 건 "리뷰를 잘 가져오는가"가 아니라 **남의 서버에 대한
// 규칙을 지키는가**와 **조용히 망가지지 않는가**다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { danawaAdapter } from '../lib/review/adapters/danawa.ts'
import { appstoreAdapter } from '../lib/review/adapters/appstore.ts'
import {
  runCollection,
  STALE_STREAK_TO_STOP,
  MAX_PAGES_PER_TARGET,
  PRODUCT_TOKEN,
} from '../lib/review/runner.ts'
import { MAX_CONSECUTIVE_EMPTY } from '../lib/review/health.ts'
import { computeFingerprint, normalizeText } from '../lib/review/fingerprint.ts'

let pass = 0
let fail = 0
const here = path.dirname(fileURLToPath(import.meta.url))

const t = (name, got, want) => {
  if (got === want) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)
const LF = String.fromCharCode(10)

// ── 지문 (순수) ───────────────────────────────────────────────────
const rv = (over = {}) => ({
  externalId: '111',
  text: '배송이 빨랐습니다',
  rating: 5,
  seller: '11번가',
  authorMasked: 'vl****',
  writtenAt: '2025-09-06',
  ...over,
})

{
  const a = computeFingerprint('danawa', 'p1', rv())
  const b = computeFingerprint('danawa', 'p1', rv({ text: '완전히 다른 본문입니다' }))
  t('본문이 달라도 identity 는 같다 — 수정에 견딘다', a.identityKey, b.identityKey)
  ok('본문이 다르면 content_hash 는 다르다', a.contentHash !== b.contentHash)
  t('seq 가 있으면 kind=seq', a.kind, 'seq')
}
{
  // 짧고 흔한 본문이 뭉개지지 않는다 — identity 에 본문이 없기 때문이다.
  const a = computeFingerprint('danawa', 'p1', rv({ externalId: '1', text: '좋아요' }))
  const b = computeFingerprint('danawa', 'p1', rv({ externalId: '2', text: '좋아요' }))
  ok('같은 본문이어도 seq 가 다르면 다른 리뷰', a.identityKey !== b.identityKey)
  t('같은 본문이면 content_hash 는 같다', a.contentHash, b.contentHash)
}
{
  const a = computeFingerprint('danawa', 'p1', rv())
  const b = computeFingerprint('danawa', 'p2', rv())
  ok('상품이 다르면 다른 리뷰 — seq 공간이 몰마다 다르다', a.identityKey !== b.identityKey)
}
{
  const f = computeFingerprint('danawa', 'p1', rv({ externalId: null }))
  t('seq 가 없으면 폴백 조합', f.kind, 'composite')
  const g = computeFingerprint('danawa', 'p1', rv({ externalId: null, text: '다른 본문' }))
  t('폴백도 본문을 넣지 않는다', f.identityKey, g.identityKey)
}
{
  const f = computeFingerprint('danawa', 'p1', {
    externalId: null,
    text: '내용은 있다',
    rating: null,
    seller: null,
    authorMasked: null,
    writtenAt: null,
  })
  t('정체성 재료가 전부 없으면 지문을 포기한다(null)', f, null)
}
t('정규화는 공백만 정리', normalizeText('  가   나\n다  '), '가 나 다')
ok('정규화가 구두점을 지우지 않는다', normalizeText('좋아요!') !== normalizeText('좋아요'))

// ── 가짜 포트 ─────────────────────────────────────────────────────
function makeHarness({
  robots = 'User-agent: *\nAllow: /\n',
  robotsStatus = 200,
  // 200 이 아닐 때의 본문. 404/403 이 HTML 을 주는 실측 상황을 재현한다.
  robotsBody = '',
  // robots.txt 를 **실제로 읽은** URL. 리다이렉트 재현용 (runner 의 FetchOutcome.finalUrl).
  robotsFinalUrl = null,
  pages = {},
  pageStatus = {},
  sourceOver = {},
  targets = null,
} = {}) {
  const log = { fetched: [], slept: [], saves: [], inputs: [], health: [] }
  const seen = new Map() // identityKey -> contentHash
  let clock = 1_000_000

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      log.slept.push(ms)
      clock += ms
    },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      if (url.endsWith('/robots.txt')) {
        if (robotsStatus === null) return { status: null, body: '', error: 'ECONNRESET' }
        return {
          status: robotsStatus,
          body: robotsStatus === 200 ? robots : robotsBody,
          finalUrl: robotsFinalUrl ?? url,
        }
      }
      const page = new URL(url).searchParams.get('page')
      if (pageStatus[page] != null) {
        const s = pageStatus[page]
        // 객체면 본문까지 지정한 것이다. 403 이 차단인지 쿼터 소진인지는
        // 본문 표지로 갈리므로, 그 경로를 테스트하려면 본문이 필요하다.
        if (typeof s === 'object') return { status: s.status, body: s.body ?? '' }
        return s === null ? { status: null, body: '', error: 'ECONNRESET' } : { status: s, body: '' }
      }
      return { status: 200, body: pages[page] ?? '' }
    },
    store: {
      async loadSource() {
        return {
          key: 'fake',
          enabled: true,
          minIntervalMs: 4000,
          dailyRequestCap: 200,
          requestsToday: 0,
          ...sourceOver,
        }
      },
      async listDueTargets() {
        return (
          targets ?? [
            {
              id: 'tgt1',
              projectId: 'proj1',
              sourceKey: 'fake',
              productRef: 'p1',
              cursor: null,
              lastReviewAt: null,
              consecutiveEmpty: 0,
            },
          ]
        )
      },
      async saveTargetProgress(p) {
        log.saves.push(p)
      },
      async recordFingerprint(fp) {
        const prev = seen.get(fp.identityKey)
        if (prev === undefined) {
          seen.set(fp.identityKey, fp.contentHash)
          return 'new'
        }
        if (prev === fp.contentHash) return 'duplicate'
        seen.set(fp.identityKey, fp.contentHash)
        return 'revised'
      },
      async appendInput(i) {
        log.inputs.push(i)
        return `in${log.inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth(k, v) {
        log.health.push(v)
      },
    },
  }
  return { ports, log, seen }
}

/** 페이지 본문을 JSON 으로 나르는 가짜 어댑터. 파싱은 관심사가 아니다. */
const fakeAdapter = {
  key: 'fake',
  displayName: 'fake',
  nextRequest(target) {
    const page = target.cursor ? Number(target.cursor) + 1 : 1
    return { url: `https://example.test/reviews?prodCode=${target.productRef}&page=${page}` }
  },
  parse(body, ctx) {
    if (!body) return { reviews: [], nextCursor: null, parseFailures: 0 }
    const parsed = JSON.parse(body)
    return {
      reviews: parsed.reviews ?? [],
      nextCursor: parsed.nextCursor ?? null,
      parseFailures: parsed.parseFailures ?? 0,
    }
  },
}

const page = (reviews, nextCursor, parseFailures = 0) =>
  JSON.stringify({ reviews, nextCursor, parseFailures })

const run = (h, over = {}) =>
  runCollection(fakeAdapter, { dryRun: false, targetLimit: 5, ...over }, h.ports)

// ── robots ────────────────────────────────────────────────────────
{
  const h = makeHarness({ robots: 'User-agent: *\nDisallow: /\n' })
  const r = await run(h)
  t('robots 금지면 robotsSkips 로 센다', r.robotsSkips, 1)
  t('robots 금지면 요청을 보내지 않는다', r.requests, 0)
  ok('robots.txt 말고는 아무것도 안 받았다', h.log.fetched.every((u) => u.endsWith('/robots.txt')))
}
{
  const h = makeHarness({ robotsStatus: 503 })
  const r = await run(h)
  t('robots.txt 를 못 읽으면 요청하지 않는다', r.requests, 0)
  ok('읽지 못한 것을 허용으로 다루지 않는다', r.perTarget[0].outcome.includes('robots'))
}
{
  // ⚠️ 네트워크 예외(status null)도 "못 읽음"이다. round-2 설계에서 걱정한
  //    www↔무www 순환 리다이렉트가 정확히 이 모양으로 들어온다 — Node fetch 가
  //    20홉 뒤 throw → status null. 실측에서 순환은 없었지만, 생기면 이 분기가
  //    소스 전체를 조용히 재운다는 사실을 여기 못박아 둔다(§7.2).
  const h = makeHarness({ robotsStatus: null })
  const r = await run(h)
  t('robots.txt 가 네트워크 예외면 요청하지 않는다', r.requests, 0)
  ok('예외를 허용으로 다루지 않는다', r.perTarget[0].outcome.includes('robots'))
}
{
  // ⚠️ 2026-09-18 **뒤집혔다.** 예전에는 여기서 "404 = 규칙 없음 = 허용"(RFC 9309
  //    §2.3.1.3)을 못박고 있었다. 그런데 실측에서 그 404 본문은 전부 **robots 를
  //    감춘 HTML** 이었다 — 킥스타터 403(Cloudflare) · www.tistory.com 404 ·
  //    theqoo/todayhumor 404 · clien 은 우리 UA 에게만 404(SP-027).
  //    "규칙이 없다"와 "규칙을 안 보여 준다"를 같은 값으로 접으면 사이트가 실제로
  //    건 규칙이 판정에 한 번도 반영되지 않는다(CLAUDE.md §7.2).
  //
  //    그래서 기본값은 **막는다.** 이미 등록된 404 소스가 조용히 0건이 되는 것을
  //    막는 장치는 어댑터의 proceedWhenRobotsUnverified 표식이다(아래 블록).
  const h = makeHarness({ robotsStatus: 404 })
  const r = await run(h)
  t('robots.txt 404 는 확인 불가다 — 요청하지 않는다', r.requests, 0)
  t('확인 불가도 robotsSkips 로 센다', r.robotsSkips, 1)
  ok('금지가 아니라 확인 불가로 적는다', r.perTarget[0].outcome.includes('robots 확인 불가'))
  ok('사유에 상태 코드가 남는다', r.perTarget[0].outcome.includes('HTTP 404'))
  ok('"금지"라고 적지 않는다', !r.perTarget[0].outcome.includes('robots 금지'))
}
{
  // robots 는 호스트당 한 번만 묻는다
  const h = makeHarness({
    pages: { 1: page([rv({ externalId: 'a' })], '1'), 2: page([], null) },
  })
  await run(h)
  t('robots.txt 는 한 번만 받는다', h.log.fetched.filter((u) => u.endsWith('/robots.txt')).length, 1)
}

// ── 차단 응답 ─────────────────────────────────────────────────────
for (const code of [403, 429]) {
  const h = makeHarness({ pageStatus: { 1: code } })
  const r = await run(h)
  t(`${code} 는 blockedResponses 로 센다`, r.stats.blockedResponses, 1)
  t(`${code} 면 health 가 broken`, r.health.health, 'broken')
  t(`${code} 면 소스를 끈다`, r.health.disable, true)
  t(`${code} 를 받고 재시도하지 않는다`, r.requests, 1)
}
{
  // 차단은 남은 타깃까지 통째로 멈춘다
  const h = makeHarness({
    pageStatus: { 1: 403 },
    targets: [1, 2, 3].map((i) => ({
      id: `t${i}`,
      projectId: 'p',
      sourceKey: 'fake',
      productRef: `p${i}`,
      cursor: null,
      lastReviewAt: null,
      consecutiveEmpty: 0,
    })),
  })
  const r = await run(h)
  t('차단되면 남은 타깃을 건드리지 않는다', r.targetsVisited, 1)
}

// ── 쿼터 소진 vs 차단 (러너 ↔ 분류기 경계면) ──────────────────────
//
// health.ts 의 분류기 단위 테스트와 별개로, **러너가 실제로 그 분류를 쓰는지**
// 를 본다. 부품이 각각 통과해도 붙이면 안 될 수 있다(CLAUDE.md §7.1).
const quotaAdapter = { ...fakeAdapter, key: 'quota-fake', quotaMarkers: ['quotaexceeded'] }
const runQuota = (h, over = {}) =>
  runCollection(quotaAdapter, { dryRun: false, targetLimit: 5, ...over }, h.ports)

{
  const h = makeHarness({ pageStatus: { 1: { status: 403, body: '{"error":{"reason":"quotaExceeded"}}' } } })
  const r = await runQuota(h)
  t('쿼터 표지가 있으면 quotaExhaustedResponses 로 센다', r.stats.quotaExhaustedResponses, 1)
  t('쿼터 소진은 blockedResponses 로 세지 않는다', r.stats.blockedResponses, 0)
  t('쿼터 소진이면 health 가 broken 이 아니다', r.health.health, 'ok')
  t('쿼터 소진이면 소스를 끄지 않는다', r.health.disable, false)
  t('쿼터 소진이어도 더 두드리지 않는다', r.requests, 1)
}
{
  // 같은 403 인데 표지가 없으면 차단이다 — 안전한 쪽 기본값
  const h = makeHarness({ pageStatus: { 1: { status: 403, body: 'Forbidden' } } })
  const r = await runQuota(h)
  t('표지 없는 403 은 차단으로 센다', r.stats.blockedResponses, 1)
  t('표지 없는 403 은 소스를 끈다', r.health.disable, true)
}
{
  // 쿼터 표지를 선언하지 않은 어댑터(다나와 같은 스크래핑 소스)는 기존 동작 그대로
  const h = makeHarness({ pageStatus: { 1: { status: 403, body: '{"error":{"reason":"quotaExceeded"}}' } } })
  const r = await run(h)
  t('표지 미선언 어댑터는 쿼터 본문이어도 차단으로 센다', r.stats.blockedResponses, 1)
  t('표지 미선언 어댑터는 쿼터로 세지 않는다', r.stats.quotaExhaustedResponses, 0)
}

// ── 요청 간격 ─────────────────────────────────────────────────────
{
  const h = makeHarness({
    pages: {
      1: page([rv({ externalId: 'a' })], '1'),
      2: page([rv({ externalId: 'b' })], '2'),
      3: page([], null),
    },
  })
  await run(h)
  ok('연속 요청 사이에 잔다', h.log.slept.length > 0)
  ok('간격이 설정값 이상이다', h.log.slept.every((ms) => ms >= 0 && ms <= 4000))
}

// ── 일일 상한 ─────────────────────────────────────────────────────
{
  const h = makeHarness({
    sourceOver: { dailyRequestCap: 2, requestsToday: 0 },
    pages: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [String(i + 1), page([rv({ externalId: `x${i}` })], String(i + 1))]),
    ),
  })
  const r = await run(h)
  t('일일 상한을 넘지 않는다', r.requests, 2)
}
{
  const h = makeHarness({ sourceOver: { dailyRequestCap: 5, requestsToday: 5 } })
  const r = await run(h)
  t('오늘 이미 다 썼으면 요청하지 않는다', r.requests, 0)
}

// ── 비활성 소스 ───────────────────────────────────────────────────
{
  const h = makeHarness({ sourceOver: { enabled: false } })
  const r = await run(h)
  t('비활성 소스는 건너뛴다', r.skipped, true)
  t('비활성 소스는 요청 0', r.requests, 0)
  t('비활성 소스는 robots 도 안 받는다', h.log.fetched.length, 0)
}

// ── 커서: 페이지마다 즉시 저장 ────────────────────────────────────
{
  const h = makeHarness({
    pages: {
      1: page([rv({ externalId: 'a' })], '1'),
      2: page([rv({ externalId: 'b' })], '2'),
      3: page([], null),
    },
  })
  await run(h)
  const cursors = h.log.saves.map((s) => s.cursor)
  ok('페이지마다 커서를 저장한다', h.log.saves.length >= 3)
  ok('마지막 저장은 커서 null — 끝났다', cursors[cursors.length - 1] === null)
}
{
  // 중간에 실패해도 그때까지의 커서가 남는다
  const h = makeHarness({
    pages: { 1: page([rv({ externalId: 'a' })], '1') },
    pageStatus: { 2: 500 },
  })
  await run(h)
  ok('실패 전 커서가 저장돼 있다', h.log.saves.some((s) => s.cursor === '1'))
  ok('타깃이 failed 로 남는다', h.log.saves.some((s) => s.status === 'failed'))
}

// ── 중복 / 수정 ───────────────────────────────────────────────────
{
  const same = rv({ externalId: 'dup' })
  const h = makeHarness({ pages: { 1: page([same, same], null) } })
  const r = await run(h)
  t('같은 리뷰가 두 번 오면 하나만 적재', h.log.inputs.length, 1)
  t('신규는 1건으로 센다', r.stats.newReviews, 1)
}
{
  const h = makeHarness({
    pages: {
      1: page([rv({ externalId: 'r1', text: '원래 본문' })], '1'),
      2: page([rv({ externalId: 'r1', text: '고친 본문' })], null),
    },
  })
  await run(h)
  t('수정된 리뷰를 재적재하지 않는다', h.log.inputs.length, 1)
  t('적재된 건 처음 본문이다', h.log.inputs[0].text, '원래 본문')
}

// ── 증분 종료 ─────────────────────────────────────────────────────
{
  const stale = (i) => rv({ externalId: `s${i}`, writtenAt: '2020-01-01' })
  const h = makeHarness({
    targets: [
      {
        id: 'tgt1',
        projectId: 'proj1',
        sourceKey: 'fake',
        productRef: 'p1',
        cursor: null,
        lastReviewAt: '2025-01-01',
        consecutiveEmpty: 0,
      },
    ],
    pages: {
      1: page(Array.from({ length: STALE_STREAK_TO_STOP }, (_, i) => stale(i)), '1'),
      2: page([rv({ externalId: 'never' })], '2'),
    },
  })
  const r = await run(h)
  ok('이미 본 구간에 닿으면 멈춘다', r.perTarget[0].outcome.includes('이미 본 구간'))
  t('멈춘 뒤 다음 페이지를 받지 않는다', r.pagesFetched, 1)
}
{
  // 한두 개가 순서에서 튀어도 조기 종료하지 않는다
  const stale = (i) => rv({ externalId: `s${i}`, writtenAt: '2020-01-01' })
  const fresh = rv({ externalId: 'fresh', writtenAt: '2026-01-01' })
  const h = makeHarness({
    targets: [
      {
        id: 'tgt1',
        projectId: 'proj1',
        sourceKey: 'fake',
        productRef: 'p1',
        cursor: null,
        lastReviewAt: '2025-01-01',
        consecutiveEmpty: 0,
      },
    ],
    pages: {
      1: page([stale(1), stale(2), fresh, stale(3), stale(4)], '1'),
      2: page([], null),
    },
  })
  const r = await run(h)
  t('연속이 끊기면 계속 읽는다', r.pagesFetched, 2)
  t('신규는 정상 적재', r.stats.newReviews, 5)
}

// ── incrementalOnly — 커서가 끝나도 닫지 않는다 (Q6) ──────────────
//
// 질의가 대상인 소스(hackernews)는 "마지막 페이지"가 끝이 아니다. 닫아 버리면
// 되살리는 코드가 없어 그 질의는 영영 다시 안 돈다. 여기서는 같은 페이지 구성에
// 플래그만 켜고 꺼서 **분기가 플래그에만 반응하는지**를 본다.
{
  const pages = { 1: page([rv({ externalId: 'a' })], null) }
  const incAdapter = { ...fakeAdapter, incrementalOnly: true }

  const h1 = makeHarness({ pages })
  const r1 = await runCollection(fakeAdapter, { dryRun: false, targetLimit: 5 }, h1.ports)
  t('플래그 없으면 커서 끝 = exhausted', h1.log.saves[h1.log.saves.length - 1].status, 'exhausted')
  ok('플래그 없으면 로그는 "끝까지 읽음"', r1.perTarget[0].outcome.includes('끝까지 읽음'))

  const h2 = makeHarness({ pages })
  const r2 = await runCollection(incAdapter, { dryRun: false, targetLimit: 5 }, h2.ports)
  t('플래그 켜면 커서가 끝나도 active', h2.log.saves[h2.log.saves.length - 1].status, 'active')
  ok(
    '플래그 켜면 로그가 종료 사유와 페이지 수를 남긴다(§7.2)',
    r2.perTarget[0].outcome.includes('증분형이라 닫지 않는다') && /\d+페이지째/.test(r2.perTarget[0].outcome),
  )
  ok('커서는 여전히 null — 다음 실행은 처음부터 읽는다', h2.log.saves[h2.log.saves.length - 1].cursor === null)
  t('플래그는 신규 적재 수를 바꾸지 않는다', r2.stats.newReviews, r1.stats.newReviews)
}

// ── incrementalOnly 의 종료 조건 — 연속 N회 0건이면 닫는다 ─────────
//
// 이게 없던 동안 `incrementalOnly` 타깃은 **아무도 닫지 않았다.** 새 댓글이
// 영원히 안 달리는 글도, 글이 지워진 글도 매 실행 요청을 먹었다. 문턱은
// 건강도와 같은 상수(health.ts MAX_CONSECUTIVE_EMPTY)를 쓴다 — 여기서
// 그 상수를 직접 import 해 두 곳이 갈라지지 않게 고정한다.
{
  const incAdapter = { ...fakeAdapter, incrementalOnly: true }
  // 신규 0건을 만드는 가장 정직한 방법: 리뷰가 아예 없는 페이지 1개.
  const emptyPages = { 1: page([], null) }
  const tgt = (over = {}) => [
    {
      id: 'tgt1',
      projectId: 'proj1',
      sourceKey: 'fake',
      productRef: 'p1',
      cursor: null,
      lastReviewAt: null,
      consecutiveEmpty: 0,
      ...over,
    },
  ]

  // 양성 — N-1 회까지 쌓인 타깃이 이번 실행에서 N 회째가 되면 닫힌다.
  {
    const h = makeHarness({ pages: emptyPages, targets: tgt({ consecutiveEmpty: MAX_CONSECUTIVE_EMPTY - 1 }) })
    const r = await runCollection(incAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
    const last = h.log.saves[h.log.saves.length - 1]
    t(`연속 ${MAX_CONSECUTIVE_EMPTY}회째 0건이면 exhausted 로 닫는다`, last.status, 'exhausted')
    t('닫을 때 카운터도 그 값으로 저장한다', last.consecutiveEmpty, MAX_CONSECUTIVE_EMPTY)
    ok(
      '로그에 "연속 N회 0건 → 닫음(N/N)" 수치가 남는다(§7.2)',
      r.perTarget[0].outcome.includes(
        `연속 ${MAX_CONSECUTIVE_EMPTY}회 0건 → 닫음(${MAX_CONSECUTIVE_EMPTY}/${MAX_CONSECUTIVE_EMPTY})`,
      ),
    )
  }

  // 음성 ① — N-1 회째에서는 닫지 않는다.
  {
    const h = makeHarness({ pages: emptyPages, targets: tgt({ consecutiveEmpty: MAX_CONSECUTIVE_EMPTY - 2 }) })
    const r = await runCollection(incAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
    const last = h.log.saves[h.log.saves.length - 1]
    t(`연속 ${MAX_CONSECUTIVE_EMPTY - 1}회면 아직 active`, last.status, 'active')
    t('카운터는 1 올라간다', last.consecutiveEmpty, MAX_CONSECUTIVE_EMPTY - 1)
    ok('닫았다고 적지 않는다', !r.perTarget[0].outcome.includes('닫음'))
  }

  // 음성 ② — 1건이라도 신규가 들어오면 카운터가 0 으로 리셋된다.
  {
    const h = makeHarness({
      pages: { 1: page([rv({ externalId: 'fresh' })], null) },
      targets: tgt({ consecutiveEmpty: MAX_CONSECUTIVE_EMPTY - 1 }),
    })
    const r = await runCollection(incAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
    const last = h.log.saves[h.log.saves.length - 1]
    t('신규 1건이면 카운터 리셋', last.consecutiveEmpty, 0)
    t('신규가 있으면 닫지 않는다', last.status, 'active')
    ok('닫았다고 적지 않는다', !r.perTarget[0].outcome.includes('닫음'))
  }

  // 음성 ③ — dry-run 은 구조적으로 신규 0건이다. 세면 멀쩡한 타깃이 닫힌다.
  {
    const h = makeHarness({ pages: emptyPages, targets: tgt({ consecutiveEmpty: MAX_CONSECUTIVE_EMPTY - 1 }) })
    const r = await runCollection(incAdapter, { dryRun: true, targetLimit: 5 }, h.ports)
    ok('dry-run 은 타깃을 닫지 않는다', !r.perTarget[0].outcome.includes('닫음'))
  }

  // 음성 ④ — 차단(403)은 "신규 0건"이 아니다. 차단으로 닫으면 원인이 지워진다.
  {
    const h = makeHarness({
      pageStatus: { 1: 403 },
      targets: tgt({ consecutiveEmpty: MAX_CONSECUTIVE_EMPTY - 1 }),
    })
    const r = await runCollection(incAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
    const last = h.log.saves[h.log.saves.length - 1]
    t('차단된 타깃은 닫지 않는다', last.status, 'active')
    ok('로그에는 차단이 남는다', r.perTarget[0].outcome.includes('차단 응답 403'))
  }

  // 음성 ⑤ — 플래그가 꺼진 소스는 이 경로를 타지 않는다(그건 원래 exhausted 로 닫힌다).
  {
    const h = makeHarness({ pages: emptyPages, targets: tgt({ consecutiveEmpty: 99 }) })
    const r = await runCollection(fakeAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
    ok('플래그 꺼진 소스는 "닫음" 문구를 쓰지 않는다', !r.perTarget[0].outcome.includes('닫음'))
    ok('대신 원래대로 "끝까지 읽음"', r.perTarget[0].outcome.includes('끝까지 읽음'))
  }
}

// ── nextRequest 가 null 일 때 — 증분형은 닫지 않는다 ────────────────
//
// 2026-09-24 까지 이 분기는 `incrementalOnly` 를 보지 않고 무조건 exhausted 였다.
// 그래서 게시판 순회 어댑터가 **커서 큐를 nextRequest 에서 비울 수 없었다** —
// 큐를 다 읽고 null 을 내면 그 타깃이 영구히 닫혔다(되살리는 코드가 없다).
// 이제 닫는 것은 연속 0건 안전장치 한 곳이다.
{
  const noReq = { key: 'fake', displayName: 'fake', nextRequest: () => null, parse: () => ({ reviews: [], nextCursor: null, parseFailures: 0 }) }
  const tgt = (over = {}) => [
    { id: 'tgt1', projectId: 'proj1', sourceKey: 'fake', productRef: 'board:x', cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over },
  ]

  {
    const h = makeHarness({ targets: tgt() })
    const r = await runCollection({ ...noReq, incrementalOnly: true }, { dryRun: false, targetLimit: 5 }, h.ports)
    t('요청 없음 + 증분형 = active 로 남는다', h.log.saves[h.log.saves.length - 1].status, 'active')
    t('요청 없음이면 네트워크를 쓰지 않는다', r.requests, 0)
    ok('닫지 않았다는 사실을 로그에 적는다', r.perTarget[0].outcome.includes('증분형이라 닫지 않는다'))
  }
  {
    const h = makeHarness({ targets: tgt() })
    await runCollection(noReq, { dryRun: false, targetLimit: 5 }, h.ports)
    t('요청 없음 + 문서형 = 예전대로 닫는다', h.log.saves[h.log.saves.length - 1].status, 'exhausted')
  }
  {
    // 잘못된 ref 로 영원히 살아 있지는 않는다 — 연속 0건 안전장치가 받는다.
    const h = makeHarness({ targets: tgt({ consecutiveEmpty: MAX_CONSECUTIVE_EMPTY - 1 }) })
    const r = await runCollection({ ...noReq, incrementalOnly: true }, { dryRun: false, targetLimit: 5 }, h.ports)
    t('요청 없음이 연속되면 안전장치가 닫는다', h.log.saves[h.log.saves.length - 1].status, 'exhausted')
    ok('닫은 수치가 남는다', r.perTarget[0].outcome.includes('→ 닫음('))
  }
}

// ── pauseRun · ctx.lastReviewAt — 게시판 순회용 범용 규약 ──────────
//
// 게시판 순회 타깃은 "이번 실행 몫은 끝났지만 커서는 살려 둬야" 한다.
// nextCursor=null 로는 그걸 표현할 수 없다(끝 + 커서 폐기). 어댑터에
// 무관한 규약이라 러너에서 가짜 어댑터로 고정한다 — 실제 어댑터 3종은
// review-board-selftest.mjs 가 경계면까지 본다(§7.1 "부품 테스트를
// 통합의 근거로 쓰지 마라").
{
  const seenCtx = []
  const boardish = {
    key: 'fake',
    displayName: 'fake',
    incrementalOnly: true,
    nextRequest(target) {
      return { url: `https://example.test/reviews?prodCode=${target.productRef}&page=${target.cursor ? 2 : 1}` }
    },
    parse(body, ctx) {
      seenCtx.push(ctx)
      return JSON.parse(body)
    },
  }
  const tgt = (over = {}) => [
    {
      id: 'tgt1',
      projectId: 'proj1',
      sourceKey: 'fake',
      productRef: 'board:use',
      cursor: null,
      lastReviewAt: '2026-09-01',
      consecutiveEmpty: 0,
      ...over,
    },
  ]
  const KEPT = '{"q":[],"last":"9"}'

  {
    const pages = {
      1: JSON.stringify({ reviews: [rv({ externalId: 'a' })], nextCursor: KEPT, parseFailures: 0, pauseRun: true }),
      2: JSON.stringify({ reviews: [rv({ externalId: 'b' })], nextCursor: null, parseFailures: 0 }),
    }
    const h = makeHarness({ pages, targets: tgt() })
    const r = await runCollection(boardish, { dryRun: false, targetLimit: 5 }, h.ports)
    const last = h.log.saves[h.log.saves.length - 1]
    t('pauseRun 이면 그 실행에서 더 요청하지 않는다', r.pagesFetched, 1)
    t('pauseRun 은 커서를 버리지 않는다', last.cursor, KEPT)
    t('pauseRun 은 타깃을 닫지 않는다', last.status, 'active')
    ok('로그에 커서를 유지했다는 사실이 남는다', r.perTarget[0].outcome.includes('커서 유지'))
    t('파서는 실행 시작 시점의 증분 기준선을 받는다', seenCtx[0].lastReviewAt, '2026-09-01')
    t('파서는 자기가 요청한 커서를 그대로 받는다', seenCtx[0].cursor, null)
  }
  {
    // nextCursor=null 과 겹치면 "끝"이 이긴다. 커서를 살릴 자리가 없으니 당연하고,
    // 그때 닫을지 말지는 incrementalOnly 가 가른다(여기서는 켜져 있어 active).
    const pages = {
      1: JSON.stringify({ reviews: [], nextCursor: null, parseFailures: 0, pauseRun: true }),
    }
    const h = makeHarness({ pages, targets: tgt() })
    const r = await runCollection(boardish, { dryRun: false, targetLimit: 5 }, h.ports)
    ok('nextCursor=null 이면 pauseRun 은 무시된다', r.perTarget[0].outcome.includes('끝까지 읽음'))
    ok('"커서 유지" 라고 적지 않는다', !r.perTarget[0].outcome.includes('커서 유지'))
  }
  {
    // 커서가 살아 있으면 다음 실행은 목록부터가 아니라 그 커서에서 이어간다.
    const pages = { 2: JSON.stringify({ reviews: [], nextCursor: null, parseFailures: 0 }) }
    const h = makeHarness({ pages, targets: tgt({ cursor: KEPT }) })
    await runCollection(boardish, { dryRun: false, targetLimit: 5 }, h.ports)
    ok('다음 실행은 저장된 커서를 그대로 받는다', h.log.fetched.some((u) => u.includes('page=2')))
  }
}

// ── dry-run ───────────────────────────────────────────────────────
{
  const h = makeHarness({ pages: { 1: page([rv({ externalId: 'a' })], null) } })
  const r = await run(h, { dryRun: true })
  t('dry-run 은 적재하지 않는다', h.log.inputs.length, 0)
  t('dry-run 은 커서를 저장하지 않는다', h.log.saves.length, 0)
  t('dry-run 은 건강도를 쓰지 않는다', h.log.health.length, 0)
  ok('dry-run 도 요청은 보낸다 — 판정이 목적이다', r.requests > 0)
  t('dry-run 도 파싱 수는 센다', r.stats.reviewsParsed, 1)
}

// ── 폭주 방지 ─────────────────────────────────────────────────────
{
  const pages = Object.fromEntries(
    Array.from({ length: 60 }, (_, i) => [
      String(i + 1),
      page([rv({ externalId: `x${i}` })], String(i + 1)),
    ]),
  )
  const h = makeHarness({ pages })
  const r = await run(h)
  t('타깃당 페이지 상한을 지킨다', r.pagesFetched, MAX_PAGES_PER_TARGET)
}

// ── 건강도 연결 ───────────────────────────────────────────────────
{
  const h = makeHarness({
    pages: { 1: page([rv({ externalId: 'a' })], null, 0) },
  })
  const r = await run(h)
  t('정상 실행은 health ok', r.health.health, 'ok')
  t('health 를 저장한다', h.log.health.length, 1)
}
{
  const many = Array.from({ length: 3 }, (_, i) => rv({ externalId: `a${i}` }))
  const h = makeHarness({ pages: { 1: page(many, null, 20) } })
  const r = await run(h)
  t('파싱 실패가 많으면 broken', r.health.health, 'broken')
  t('broken 이면 소스를 끈다', r.health.disable, true)
}
{
  // 지문을 못 만든 리뷰는 러너가 실패로 센다 — 어댑터가 놓쳐도 잡는다
  const nameless = {
    externalId: null,
    text: '본문만 있다',
    rating: null,
    seller: null,
    authorMasked: null,
    writtenAt: null,
  }
  const h = makeHarness({ pages: { 1: page([nameless], null, 0) } })
  const r = await run(h)
  t('지문 불가는 파싱 실패로 센다', r.stats.parseFailures, 1)
  t('적재하지 않는다', h.log.inputs.length, 0)
}
{
  // 폴백 키는 세되 health 는 흔들지 않는다
  const fallbacks = Array.from({ length: 4 }, (_, i) =>
    rv({ externalId: null, authorMasked: `u${i}****` }),
  )
  const h = makeHarness({ pages: { 1: page(fallbacks, null) } })
  const r = await run(h)
  t('폴백 키를 센다', r.stats.fallbackKeys, 4)
  t('폴백만으로는 health 가 안 떨어진다', r.health.health, 'ok')
  ok('대신 경고를 남긴다', r.health.warnings.length > 0)
}

// ── UA 는 위장하지 않는다 ─────────────────────────────────────────
ok('제품 토큰이 브라우저를 사칭하지 않는다', !/mozilla|chrome|safari/i.test(PRODUCT_TOKEN))

// ── 러너 × 실제 다나와 어댑터 (통합) ──────────────────────────────
//
// ⚠️ 위 테스트는 전부 가짜 어댑터를 쓴다. 그래서 러너의 규칙은 검증되지만
//    **다나와 어댑터와 러너가 실제로 맞물리는지는 검증되지 않는다.**
//    nextRequest 가 만드는 URL 을 러너가 그대로 쓰는지, parse 가 돌려주는
//    nextCursor 를 러너가 제대로 이어받는지가 그 틈이다.
//
//    픽스처가 있으니 네트워크 없이 그 틈을 메울 수 있다. 안 하면
//    "각 부품은 통과했는데 붙이면 안 되는" 상태를 실행에서 처음 안다.
{
  const fixture = async (name) =>
    fs.readFile(path.join(here, '..', 'fixtures', 'review', 'danawa', name), 'utf8')

  const many = await fixture('many.html')
  const page2 = await fixture('page2.html')
  const empty = await fixture('empty.html')

  const seenUrls = []
  const inputs = []
  const saves = []
  const seenFp = new Map()
  let clock = 2_000_000

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      seenUrls.push(url)
      clock += 10
      if (url.endsWith('/robots.txt')) {
        return { status: 200, body: 'User-agent: *\nAllow: /\n' }
      }
      const page = new URL(url).searchParams.get('page')
      if (page === '1') return { status: 200, body: many }
      if (page === '2') return { status: 200, body: page2 }
      return { status: 200, body: empty }
    },
    store: {
      async loadSource() {
        return {
          key: 'danawa',
          enabled: true,
          minIntervalMs: 4000,
          dailyRequestCap: 200,
          requestsToday: 0,
        }
      },
      async listDueTargets() {
        return [
          {
            id: 'tgt1',
            projectId: 'proj1',
            sourceKey: 'danawa',
            productRef: '93387356',
            cursor: null,
            lastReviewAt: null,
            consecutiveEmpty: 0,
          },
        ]
      },
      async saveTargetProgress(p) {
        saves.push(p)
      },
      async recordFingerprint(fp) {
        if (seenFp.has(fp.identityKey)) {
          return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
        }
        seenFp.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) {
        inputs.push(i)
        return `in${inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }

  const r = await runCollection(danawaAdapter, { dryRun: false, targetLimit: 1 }, ports)

  ok(
    '어댑터가 만든 URL 을 러너가 그대로 쓴다',
    seenUrls.some((u) => u.includes('companyProductReview.ajax.php') && u.includes('prodCode=93387356')),
  )
  ok('page=1 부터 시작한다', seenUrls.some((u) => u.endsWith('page=1')))
  ok('커서를 받아 page=2 로 넘어간다', seenUrls.some((u) => u.endsWith('page=2')))
  t('빈 페이지에서 멈춘다', r.pagesFetched, 3)
  t('실제 픽스처에서 20건을 파싱한다', r.stats.reviewsParsed, 20)
  t('파싱 실패 0', r.stats.parseFailures, 0)
  // 회귀 감시: 관련도 필터는 hackernews 전용이다. danawa 는 ParseResult.filtered 를
  // 내지 않으므로 relevanceFiltered 는 항상 0 이어야 한다(러너가 ?? 0 로 받는다).
  t('danawa: relevanceFiltered 0 (필터는 hackernews 전용)', r.stats.relevanceFiltered, 0)
  t('20건 전부 신규로 적재된다', inputs.length, 20)
  t('폴백 키 없음 — 다나와 seq 를 전부 읽었다', r.stats.fallbackKeys, 0)
  t('health ok', r.health.health, 'ok')
  ok('마지막 저장의 커서가 null — 타깃 종료', saves[saves.length - 1].cursor === null)
  // 음성 케이스: incrementalOnly 는 hackernews 전용이다. 상품 1개 = 타깃 1개인
  // 다나와는 끝이 진짜 끝이라 닫혀야 한다. 안 닫히면 같은 글을 매일 다시 긁는다.
  t('danawa: 끝까지 읽으면 exhausted 로 닫힌다', saves[saves.length - 1].status, 'exhausted')
  t('danawa: incrementalOnly 를 선언하지 않는다', danawaAdapter.incrementalOnly, undefined)
  ok('본문이 실제로 들어간다', inputs.every((i) => i.text.length > 0))
  ok('프로젝트 id 가 실려 간다', inputs.every((i) => i.projectId === 'proj1'))
}

// ── 러너 × 실제 App Store 어댑터 (통합) ───────────────────────────
//
// 다나와와 같은 이유로 붙여 본다. 소스가 늘어날 때마다 이 경계면을 따로
// 테스트하지 않으면, "각 부품은 통과했는데 붙이면 안 되는" 상태를 실행에서
// 처음 알게 된다.
//
// App Store 만의 경계가 하나 더 있다 — **애플의 페이지 상한 10**. 러너의
// MAX_PAGES_PER_TARGET(20)보다 낮아서, 어댑터가 먼저 멈추지 않으면 11페이지에서
// HTTP 400 을 받고 러너가 그 타깃을 failed 로 찍는다. 정상적인 경계가 고장으로
// 기록되는 형태다(§7.2).
{
  const p1 = await fs.readFile(path.join(here, '..', 'fixtures', 'appstore', 'page1.json'), 'utf8')
  const pEmpty = await fs.readFile(path.join(here, '..', 'fixtures', 'appstore', 'page-empty.json'), 'utf8')

  const seenUrls = []
  const inputs = []
  const saves = []
  const seenFp = new Map()
  let clock = 3_000_000

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      seenUrls.push(url)
      clock += 10
      if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nAllow: /\n' }
      const page = Number(url.match(/page=(\d+)/)[1])
      // 애플은 11페이지부터 400 을 준다. 어댑터가 거기 도달하면 이게 터진다.
      if (page > 10) return { status: 400, body: '' }
      return { status: 200, body: page === 1 ? p1 : pEmpty }
    },
    store: {
      async loadSource() {
        return { key: 'appstore', enabled: true, minIntervalMs: 1000, dailyRequestCap: 200, requestsToday: 0 }
      },
      async listDueTargets() {
        return [
          {
            id: 'tgt-app',
            projectId: 'proj-app',
            sourceKey: 'appstore',
            productRef: 'kr:1459969523',
            cursor: null,
            lastReviewAt: null,
            consecutiveEmpty: 0,
          },
        ]
      },
      async saveTargetProgress(p) {
        saves.push(p)
      },
      async recordFingerprint(fp) {
        if (seenFp.has(fp.identityKey)) {
          return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
        }
        seenFp.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) {
        inputs.push(i)
        return `in${inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }

  const r = await runCollection(appstoreAdapter, { dryRun: false, targetLimit: 1 }, ports)

  ok('어댑터가 만든 RSS URL 을 러너가 그대로 쓴다', seenUrls.some((u) => u.includes('/rss/customerreviews/id=1459969523')))
  ok('국가가 URL 에 반영된다', seenUrls.some((u) => u.includes('/kr/rss/')))
  ok('page=1 부터 시작한다', seenUrls.some((u) => u.includes('/page=1/')))
  ok('커서를 받아 page=2 로 넘어간다', seenUrls.some((u) => u.includes('/page=2/')))
  t('빈 페이지에서 멈춘다', r.pagesFetched, 2)
  t('실제 픽스처에서 35건을 파싱한다', r.stats.reviewsParsed, 35)
  t('파싱 실패 0', r.stats.parseFailures, 0)
  // 회귀 감시: appstore 도 filtered 를 안 내므로 relevanceFiltered 0.
  t('appstore: relevanceFiltered 0 (필터는 hackernews 전용)', r.stats.relevanceFiltered, 0)
  t('35건 전부 신규로 적재된다', inputs.length, 35)
  t('폴백 키 없음 — 애플 리뷰 id 를 전부 읽었다', r.stats.fallbackKeys, 0)
  t('차단으로 세지 않는다', r.stats.blockedResponses, 0)
  t('health ok', r.health.health, 'ok')
  ok('마지막 저장의 커서가 null — 타깃 종료', saves[saves.length - 1].cursor === null)
  ok('본문이 실제로 들어간다', inputs.every((i) => i.text.length > 0))
  ok('제목·버전이 본문에 붙어 있다', inputs.some((i) => i.text.includes('(v') && i.text.startsWith('[')))

  // ⚠️ 가장 중요한 경계 — 400 을 한 번도 받지 않았어야 한다.
  //    받았다면 어댑터가 애플 상한을 넘어선 것이고, 러너가 그 타깃을
  //    failed 로 찍는다.
  ok('애플 페이지 상한을 넘지 않는다(400 요청 0건)', !seenUrls.some((u) => Number((u.match(/page=(\d+)/) || [0, 0])[1]) > 10))
}

// ── 커뮤니티 어댑터 × 러너 경계면 (실제 어댑터 + 실제 픽스처) ─────
//
// ⚠️ 부품 테스트를 통합의 근거로 쓰지 않는다(CLAUDE.md §7.1 사례 5).
//    파서 셀프테스트가 통과해도 러너와 붙이면 커서·URL·robots 에서 깨질 수
//    있다. 다나와 커서 버그가 정확히 그렇게 숨어 있었다.
//
// 확인할 것은 네 가지다:
//   (1) 어댑터가 만든 URL 을 러너가 그대로 쓰는가(호스트가 안 바뀌는가)
//   (2) 글 1건에서 본문+댓글이 N+1 건으로 적재되는가
//   (3) 커서가 null 이라 타깃이 exhausted 로 닫히는가 — 같은 글을 또 안 긁는가
//   (4) 요청 수가 그 소스의 계약과 같은가 (todayhumor 만 2요청이다)
//
// ⚠️ todayhumor 는 **1글=2요청**이다(본문 HTML → 댓글 JSON). 2차 요청에 본문
//    픽스처를 그대로 주면 JSON 파싱이 실패한다 — 실제로 이 루프가 그렇게 깨져서
//    댓글 수집 변경을 잡아냈다. 응답을 URL 로 갈라 주는 게 FOLLOWUP 이다.
const FOLLOWUP = {
  todayhumor: { match: 'ajax_memo_list.php', fixture: 'todayhumor/memo-list.json', requests: 2 },
}

// round-2 의 theqoo·todayhumor 는 **robots.txt 가 404 다**(실측). 200 으로
// 흉내내면 진짜 실행 경로(runner.ts 의 4xx → 규칙 없음 분기)를 한 번도 안 밟는다.
// 그래서 robotsStatus 를 항목마다 준다.
for (const [name, mod, pick, ref, robots, robotsStatus, fixture, expectCount] of [
  [
    'damoang',
    await import('../lib/review/adapters/damoang.ts'),
    (m) => m.damoangAdapter,
    'url:/free/7341567',
    'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /*?page=\n',
    200,
    'damoang/post-with-comments.html',
    5,
  ],
  [
    '82cook',
    await import('../lib/review/adapters/82cook.ts'),
    (m) => m.cook82Adapter,
    'url:/entiz/read.php?num=4239440',
    'User-agent: *\nDisallow: /ajax/\nDisallow: /entiz/read.php?bn=15&num=1166440&page=6\n',
    200,
    '82cook/post-with-comments.html',
    5,
  ],
  [
    // 댓글이 AJAX 라 본문 1건만 나온다. 이게 정상이다(설계된 축소).
    'theqoo',
    await import('../lib/review/adapters/theqoo.ts'),
    (m) => m.theqooAdapter,
    'url:/square/4347529638',
    '<!DOCTYPE html><html><head><title></title></head></html>', // 실측: 404 + HTML
    404,
    'theqoo/post-with-body.html',
    1,
  ],
  [
    'todayhumor',
    await import('../lib/review/adapters/todayhumor.ts'),
    (m) => m.todayhumorAdapter,
    'url:/board/view.php?table=bestofbest&no=483825',
    '<html><head><title>404 Not Found</title></head></html>', // 실측: 404 + HTML
    404,
    'todayhumor/post-with-body.html',
    // 본문 1 + 댓글 5. 이 소스만 2요청이다(FOLLOWUP 참조).
    6,
  ],
  [
    // round-3. 댓글이 robots 금지(/api/)라 본문 1건만 나온다 — 설계된 축소.
    // robots 200 이고 `*` 그룹에 Crawl-delay: 5 가 있다(파싱은 안 되지만 원문 유지).
    'brunch',
    await import('../lib/review/adapters/brunch.ts'),
    (m) => m.brunchAdapter,
    'url:/@brunch/431',
    'User-agent: *\nDisallow: /write\nDisallow: /search\nDisallow: /api/\nDisallow: /*?timestamp=*\nCrawl-delay: 5\n',
    200,
    'brunch/post.html',
    1,
  ],
  [
    // ⚠️ 클리앙 robots 는 우리 UA 에게 **404** 다(SP-027). 규칙은 존재하지만
    //    브라우저 UA 로만 200 이다. 러너가 4xx 를 "규칙 없음 = 허용"으로 읽는
    //    그 경로를 실제로 밟게 하려고 404 를 그대로 준다. 200 으로 흉내내면
    //    이 소스의 진짜 위험(규칙을 못 본 채 통과)을 한 번도 안 지나간다.
    'clien',
    await import('../lib/review/adapters/clien.ts'),
    (m) => m.clienAdapter,
    'url:/service/board/park/19264755',
    '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>404 Not Found</title>\n</head></html>',
    404,
    'clien/post-with-comments.html',
    4,
  ],
  [
    'fmkorea',
    await import('../lib/review/adapters/fmkorea.ts'),
    (m) => m.fmkoreaAdapter,
    'url:/best/10342734564',
    'User-agent: *\nDisallow: /\nAllow: /$\nAllow: /best\nAllow: /best2\nAllow: /humor\nDisallow: /*listStyle=\nDisallow: /_loader\n',
    200,
    'fmkorea/post-with-comments.html',
    4,
  ],
]) {
  const adapter = pick(mod)
  const fxRead = (rel) => fs.readFile(path.join(here, '..', 'fixtures', 'review', ...rel.split('/')), 'utf8')
  const html = await fxRead(fixture)
  const follow = FOLLOWUP[name] ?? null
  const followBody = follow ? await fxRead(follow.fixture) : null

  const seenUrls = []
  const inputs = []
  const saves = []
  const seenFp = new Map()
  let clock = 5_000_000

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      seenUrls.push(url)
      clock += 10
      if (url.endsWith('/robots.txt')) return { status: robotsStatus, body: robots }
      if (follow && url.includes(follow.match)) return { status: 200, body: followBody }
      return { status: 200, body: html }
    },
    store: {
      async loadSource() {
        return { key: name, enabled: true, minIntervalMs: 3000, dailyRequestCap: 100, requestsToday: 0 }
      },
      async listDueTargets() {
        return [
          {
            id: `tgt-${name}`,
            projectId: 'proj-c',
            sourceKey: name,
            productRef: ref,
            cursor: null,
            lastReviewAt: null,
            consecutiveEmpty: 0,
          },
        ]
      },
      async saveTargetProgress(p) {
        saves.push(p)
      },
      async recordFingerprint(fp) {
        if (seenFp.has(fp.identityKey)) {
          return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
        }
        seenFp.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) {
        inputs.push(i)
        return `in${inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }

  const r = await runCollection(adapter, { dryRun: false, targetLimit: 1 }, ports)

  const pageUrls = seenUrls.filter((u) => !u.endsWith('/robots.txt'))
  const expectRequests = follow ? follow.requests : 1
  t(`${name}: 글 1건당 요청 ${expectRequests}건`, pageUrls.length, expectRequests)
  if (follow) {
    // 2차가 1차와 같은 URL 이면 같은 걸 두 번 긁는 것이다 — 요청 수만 세면 안 보인다.
    ok(`${name}: 2차 요청이 1차와 다른 경로다`, new URL(pageUrls[1]).pathname !== new URL(pageUrls[0]).pathname)
    ok(`${name}: 2차도 어댑터 상수 호스트다`, new URL(pageUrls[1]).host === new URL(mod.HOST).host)
  }
  t(`${name}: 어댑터가 만든 URL 을 러너가 그대로 쓴다`, pageUrls[0], `${mod.HOST}${ref.slice(4)}`)
  t(`${name}: 호스트가 어댑터 상수와 일치`, new URL(pageUrls[0]).host, new URL(mod.HOST).host)
  t(`${name}: 적재 건수 ${expectCount}건 (본문+댓글)`, inputs.length, expectCount)
  // round-2 두 소스는 robots.txt 가 404 다. "못 읽음(=금지)"과 "없음(=허용)"이
  // 갈리는 분기라, 실제로 요청이 나갔다는 것 자체가 그 분기의 증거다.
  t(`${name}: robots.txt 를 한 번 받는다`, seenUrls.filter((u) => u.endsWith('/robots.txt')).length, 1)
  t(`${name}: 파싱 실패 0`, r.stats.parseFailures, 0)
  t(`${name}: robots 로 건너뛴 요청 0`, r.robotsSkips, 0)
  t(`${name}: 차단 응답 0`, r.stats.blockedResponses, 0)
  t(`${name}: health ok`, r.health.health, 'ok')
  // externalId 를 전건 확보했다 = 폴백 지문(composite)으로 샌 게 없다.
  t(`${name}: 폴백 지문 0 — externalId 를 전부 읽었다`, r.stats.fallbackKeys, 0)
  ok(`${name}: 본문이 실제로 들어간다`, inputs.every((i) => i.text.length > 0))
  // 1글=1요청이므로 커서가 없어야 한다.
  ok(`${name}: 마지막 저장의 커서가 null`, saves[saves.length - 1].cursor === null)
  // 커서가 끝난 뒤의 status 는 incrementalOnly 가 가른다. 켜져 있으면 active 로 남아
  // 다음 실행이 새 댓글을 받고(남헌 2026-09-23 Q3(a) — 커뮤니티 11곳), 꺼져 있으면 닫힌다
  // (naver_blog_post 처럼 대상이 고정된 문서). 어느 소스가 어느 쪽인지는 파일 끝
  // "incrementalOnly 지도" 블록이 목록으로 고정한다 — 여기서 한 소스만 몰래 바뀌지 않게.
  t(
    `${name}: 커서 종료 후 status`,
    saves[saves.length - 1].status,
    adapter.incrementalOnly ? 'active' : 'exhausted',
  )
  // ⚠️ robots 가 /*?page= 를 막는데 러너는 쿼리를 떼고 판정한다(SP-026).
  //    그러니 애초에 page 쿼리를 만들지 않아야 한다.
  ok(`${name}: page 쿼리를 만들지 않는다`, !pageUrls.some((u) => /[?&]page=/.test(u)))

  // enabled=false 로 등록하는 게 이번 마이그레이션의 핵심이다. 그 상태에서
  // 정말 요청이 0건인지 본다 — "꺼 뒀다"는 말만 믿지 않는다.
  {
    const urls = []
    const off = {
      ...ports,
      async fetchText(u) {
        urls.push(u)
        return { status: 200, body: '' }
      },
      store: { ...ports.store, async loadSource() {
        return { key: name, enabled: false, minIntervalMs: 3000, dailyRequestCap: 100, requestsToday: 0 }
      } },
    }
    const r2 = await runCollection(adapter, { dryRun: false, targetLimit: 1 }, off)
    t(`${name}: enabled=false 면 요청 0건`, r2.requests, 0)
    t(`${name}: enabled=false 면 robots.txt 도 안 받는다`, urls.length, 0)
    ok(`${name}: 비활성 사유가 보고에 남는다`, JSON.stringify(r2).includes('비활성'))
  }
}

// ── VOC 라운드3 어댑터 × 러너 경계면 (실제 어댑터 + 실제 픽스처) ──
//
// 위 damoang·82cook 루프와 같은 목적이고 같은 검사를 한다. 합치지 않고
// 따로 둔 이유는 병합 충돌뿐이다 — 위 블록은 손대지 않는다.
//
// 라운드3 은 3소스 전부 들어왔다. tumblbug 과 naver_blog_post 는 AC-0 에서
// 한 번 "제외" 로 보고됐다가 **남헌이 리스크를 인지하고 진행을 결정**해
// 들어온 것이다(SP-030 · SP-031). 셋 다 `enabled=false` 로 등록한다.
//
// 세 소스 다 1문서=1요청이라 확인할 것은 같다:
//   (1) 어댑터가 만든 URL 을 러너가 그대로 쓰는가(호스트가 안 바뀌는가)
//   (2) 기대한 건수가 적재되는가
//   (3) 커서가 null 이라 타깃이 exhausted 로 닫히는가

for (const [name, mod, exportName, ref, robots, fixture, expectCount] of [
  [
    'bobaedream',
    await import('../lib/review/adapters/bobaedream.ts'),
    'bobaedreamAdapter',
    'url:/view?code=freeb&No=2000000',
    'User-agent: *\nAllow: /\n\nUser-agent: Amazonbot\nDisallow: /\n',
    'bobaedream/post-with-comments.html',
    5,
  ],
  [
    'tumblbug',
    await import('../lib/review/adapters/tumblbug.ts'),
    'tumblbugAdapter',
    'url:/eastereggs',
    'User-agent: *\nDisallow: /api/\nDisallow: /auth/\nDisallow: /sessions/\nDisallow: /oauth/\nAllow: /discover?category=\nDisallow: /discover?\nDisallow: /search?\n',
    'tumblbug/project-with-reviews.html',
    // 4건 중 이 타깃(/eastereggs) 프로젝트의 후기는 2건이다. 나머지 2건은
    // 같은 창작자의 /clear 것이라 filtered 로 빠진다 — 그래야 /clear 타깃과
    // 중복 적재가 안 된다(아래 "타깃간중복" 블록이 그걸 러너로 확인한다).
    2,
  ],
  [
    'naver_blog_post',
    await import('../lib/review/adapters/naver-blog.ts'),
    'naverBlogAdapter',
    'url:/PostView.naver?blogId=naverofficial&logNo=224367462657',
    'User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /PostList.naver\nDisallow: /PostPrint.naver\nDisallow: /prologue/\n',
    'naver-blog/postview.html',
    1,
  ],
]) {
  const adapter = mod[exportName]
  const html = await fs.readFile(path.join(here, '..', 'fixtures', 'review', ...fixture.split('/')), 'utf8')

  const seenUrls = []
  const inputs = []
  const saves = []
  const seenFp = new Map()
  let clock = 5_000_000

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      seenUrls.push(url)
      clock += 10
      if (url.endsWith('/robots.txt')) return { status: 200, body: robots }
      return { status: 200, body: html }
    },
    store: {
      async loadSource() {
        return { key: name, enabled: true, minIntervalMs: 3000, dailyRequestCap: 100, requestsToday: 0 }
      },
      async listDueTargets() {
        return [
          {
            id: `tgt-${name}`,
            projectId: 'proj-r3',
            sourceKey: name,
            productRef: ref,
            cursor: null,
            lastReviewAt: null,
            consecutiveEmpty: 0,
          },
        ]
      },
      async saveTargetProgress(p) {
        saves.push(p)
      },
      async recordFingerprint(fp) {
        if (seenFp.has(fp.identityKey)) {
          return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
        }
        seenFp.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) {
        inputs.push(i)
        return `in${inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }

  const r = await runCollection(adapter, { dryRun: false, targetLimit: 1 }, ports)

  const pageUrls = seenUrls.filter((u) => !u.endsWith('/robots.txt'))
  t(`${name}: 글 1건당 요청 1건`, pageUrls.length, 1)
  t(`${name}: 어댑터가 만든 URL 을 러너가 그대로 쓴다`, pageUrls[0], `${mod.HOST}${ref.slice(4)}`)
  t(`${name}: 호스트가 어댑터 상수와 일치`, new URL(pageUrls[0]).host, new URL(mod.HOST).host)
  t(`${name}: 기대한 건수가 적재된다`, inputs.length, expectCount)
  t(`${name}: 파싱 실패 0`, r.stats.parseFailures, 0)
  t(`${name}: robots 로 건너뛴 요청 0`, r.robotsSkips, 0)
  t(`${name}: 차단 응답 0`, r.stats.blockedResponses, 0)
  t(`${name}: health ok`, r.health.health, 'ok')
  // externalId 를 전건 확보했다 = 폴백 지문(composite)으로 샌 게 없다.
  t(`${name}: 폴백 지문 0 — externalId 를 전부 읽었다`, r.stats.fallbackKeys, 0)
  ok(`${name}: 본문이 실제로 들어간다`, inputs.every((i) => i.text.length > 0))
  // 1문서=1요청이므로 커서가 없어야 한다.
  ok(`${name}: 마지막 저장의 커서가 null`, saves[saves.length - 1].cursor === null)
  // 커서가 끝난 뒤의 status 는 incrementalOnly 가 가른다. 켜져 있으면 active 로 남아
  // 다음 실행이 새 댓글을 받고(남헌 2026-09-23 Q3(a) — 커뮤니티 11곳), 꺼져 있으면 닫힌다
  // (naver_blog_post 처럼 대상이 고정된 문서). 어느 소스가 어느 쪽인지는 파일 끝
  // "incrementalOnly 지도" 블록이 목록으로 고정한다 — 여기서 한 소스만 몰래 바뀌지 않게.
  t(
    `${name}: 커서 종료 후 status`,
    saves[saves.length - 1].status,
    adapter.incrementalOnly ? 'active' : 'exhausted',
  )
  // 러너는 robots 판정에 쿼리를 안 넘긴다(SP-026). 지금 세 소스 다 page 쿼리를
  // 안 만들지만, 만드는 순간 안전장치가 위반을 못 막는다 — 애초에 안 만든다.
  ok(`${name}: page 쿼리를 만들지 않는다`, !pageUrls.some((u) => /[?&]page=/.test(u)))
  // 문서를 가리키는 쿼리는 그대로 살아 있어야 한다. page 금지와 헷갈리지 마라.
  t(`${name}: 요청 URL 이 ref 경로와 정확히 같다`, new URL(pageUrls[0]).pathname + new URL(pageUrls[0]).search, ref.slice(4))
  // 네이버는 다른 호스트(cbox)를 절대 때리지 않아야 한다 — 댓글 미수집이 설계다.
  ok(`${name}: apis.naver.com 을 때리지 않는다`, !seenUrls.some((u) => u.includes('apis.naver.com')))

  // enabled=false 로 등록하는 게 이번 마이그레이션의 핵심이다. 그 상태에서
  // 정말 요청이 0건인지 본다 — "꺼 뒀다"는 말만 믿지 않는다.
  {
    const urls = []
    const off = {
      ...ports,
      async fetchText(u) {
        urls.push(u)
        return { status: 200, body: '' }
      },
      store: { ...ports.store, async loadSource() {
        return { key: name, enabled: false, minIntervalMs: 3000, dailyRequestCap: 100, requestsToday: 0 }
      } },
    }
    const r2 = await runCollection(adapter, { dryRun: false, targetLimit: 1 }, off)
    t(`${name}: enabled=false 면 요청 0건`, r2.requests, 0)
    t(`${name}: enabled=false 면 robots.txt 도 안 받는다`, urls.length, 0)
    ok(`${name}: 비활성 사유가 보고에 남는다`, JSON.stringify(r2).includes('비활성'))
  }
}

// ── 타깃간중복 — 같은 창작자를 두 프로젝트로 타깃팅해도 중복 적재가 없다 ──
//
// ⚠️ 어댑터 셀프테스트에도 같은 재현이 있지만 여기에 또 둔다. 부품 테스트를
//    통합의 근거로 쓰지 말라는 규약 때문이다(CLAUDE.md §7.1 사례 5) — 실제로
//    QA 가 잡은 버그가 "어댑터는 맞는데 러너·지문과 붙이면 틀린" 형태였다.
//
//    고치기 전에는 여기서 4건이 8행으로 들어갔다. identity_key 가
//    sha256(`sourceKey|productRef|externalId`) 라(fingerprint.ts:69) 같은 후기도
//    타깃이 다르면 다른 키가 됐기 때문이다.
{
  const { tumblbugAdapter } = await import('../lib/review/adapters/tumblbug.ts')
  const html = await fs.readFile(
    path.join(here, '..', 'fixtures', 'review', 'tumblbug', 'project-with-reviews.html'),
    'utf8',
  )
  const robots = 'User-agent: *\nDisallow: /api/\n'

  const inputs = []
  const seenFp = new Map()
  let clock = 6_000_000

  // 창작자 프리뷰는 어느 프로젝트 페이지에서나 같은 4건이라 본문이 같다
  // (실측: /eastereggs 와 /cairn 이 같은 4건을 냈다 — findings §1).
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      clock += 10
      return { status: 200, body: url.endsWith('/robots.txt') ? robots : html }
    },
    store: {
      async loadSource() {
        return { key: 'tumblbug', enabled: true, minIntervalMs: 3000, dailyRequestCap: 100, requestsToday: 0 }
      },
      async listDueTargets() {
        return ['url:/eastereggs', 'url:/clear'].map((productRef, i) => ({
          id: `tgt-${i}`,
          projectId: `proj-${i}`,
          sourceKey: 'tumblbug',
          productRef,
          cursor: null,
          lastReviewAt: null,
          consecutiveEmpty: 0,
        }))
      },
      async saveTargetProgress() {},
      async recordFingerprint(fp) {
        // store.ts L115-168 과 같은 판정: identity_key UNIQUE 로만 가른다.
        if (seenFp.has(fp.identityKey)) {
          return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
        }
        seenFp.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) {
        inputs.push(i)
        return `in${inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }

  const r = await runCollection(tumblbugAdapter, { dryRun: false, targetLimit: 2 }, ports)

  t('타깃간중복: 두 타깃 합계 4건 적재 (8건이면 중복이다)', inputs.length, 4)
  t('타깃간중복: 지문도 4개', seenFp.size, 4)
  t('타깃간중복: 본문 중복 0건', new Set(inputs.map((i) => i.text)).size, 4)
  t('타깃간중복: 각 타깃이 2건씩 (project_id 귀속)', new Set(inputs.map((i) => i.projectId)).size, 2)
  t('타깃간중복: 파싱 실패 0', r.stats.parseFailures, 0)
  // 남의 프로젝트 후기를 버린 수는 실패가 아니라 relevanceFiltered 로 센다.
  t('타깃간중복: filtered 4건 (타깃당 2건)', r.stats.relevanceFiltered, 4)
  t('타깃간중복: health ok — filtered 는 건강도를 떨어뜨리지 않는다', r.health.health, 'ok')

  // 다음 날 같은 두 타깃을 다시 돌리면 전부 duplicate 여야 한다.
  const before = inputs.length
  await runCollection(tumblbugAdapter, { dryRun: false, targetLimit: 2 }, ports)
  t('타깃간중복: 재실행에서 새로 적재된 것 0건', inputs.length - before, 0)
}

// ── ADAPTERS 맵 키가 마이그레이션의 review_sources.key 와 같은가 ──
//
// 철자가 하나만 달라도 loadSource 가 행을 못 찾아 그 소스가 **조용히 안 돈다.**
// 로그에는 아무 일도 안 일어난 것처럼 보인다 — 그래서 여기서 대조한다.
for (const [file, keys] of [
  ['20260917000001_review_sources_community.sql', ['damoang', '82cook']],
  ['20260918000001_review_sources_community_round2.sql', ['theqoo', 'todayhumor']],
  ['20260919000001_review_sources_brunch_clien_fmkorea.sql', ['brunch', 'clien', 'fmkorea']],
  ['20260926000001_review_sources_youtube.sql', ['youtube']],
]) {
  const sql = await fs.readFile(path.join(here, '..', 'supabase', 'migrations', file), 'utf8')
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  const mapBlock = collect.slice(collect.indexOf('const ADAPTERS ='), collect.indexOf('}', collect.indexOf('const ADAPTERS =')))

  // ⚠️ mapBlock.includes(key) 로 쓰면 안 된다. 부분일치라 '82cooks' 같은 오타를
  //    통과시킨다(실제로 변이 테스트에서 그렇게 새는 걸 확인했다). 키를 뽑아
  //    **정확히** 대조한다 — 검사 방법이 주장과 같아야 한다(CLAUDE.md §7.1).
  const mapKeys = new Set([...mapBlock.matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]))
  const sqlKeys = new Set([...sql.matchAll(/^\s*'([\w-]+)',$/gm)].map((m) => m[1]))

  for (const key of keys) {
    ok(`등록: 마이그레이션 review_sources.key 에 '${key}' 가 있다`, sqlKeys.has(key))
    ok(`등록: ADAPTERS 맵 키가 '${key}' 와 철자까지 같다`, mapKeys.has(key))
  }
  t(`등록(${file}): enabled=false 로만 들어간다`, (sql.match(/^\s*false,$/gm) || []).length, keys.length)
  ok(`등록(${file}): DDL 이 없다 (INSERT + COMMENT 만)`, !/\b(create|alter|drop)\s+table\b/i.test(sql))
  ok(`등록(${file}): ON CONFLICT DO NOTHING 이 있다`, /ON CONFLICT \(key\) DO NOTHING/i.test(sql))
}

// ── 워크플로 선택지에 소스가 다 올라가 있는가 ─────────────────────
//
// ⚠️ 어댑터를 만들고 ADAPTERS 에 꽂아도 **워크플로 options 에 없으면 스케줄로는
//    한 번도 안 돈다.** round-1 에서 appstore 가 그랬고(review-collect.mjs 주석
//    참조), damoang·82cook 도 options 에서 빠진 채 머지됐다. 코드만 있고 수집은
//    0건인 상태는 로그에도 안 남는다 — 그래서 여기서 대조한다.
{
  const wf = await fs.readFile(path.join(here, '..', '.github', 'workflows', 'nightly-review-collect.yml'), 'utf8')
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  const mapBlock = collect.slice(collect.indexOf('const ADAPTERS ='), collect.indexOf('}', collect.indexOf('const ADAPTERS =')))
  const mapKeys = [...mapBlock.matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1])
  const optBlock = wf.slice(wf.indexOf('options:'), wf.indexOf('jobs:'))
  const options = new Set([...optBlock.matchAll(/^\s*-\s*([\w-]+)\s*$/gm)].map((m) => m[1]))

  for (const key of mapKeys) {
    ok(`워크플로: 수동 실행 선택지에 '${key}' 가 있다`, options.has(key))
  }
  ok("워크플로: 'all' 선택지가 있다", options.has('all'))
}

// ── 같은 대조, VOC 라운드3 마이그레이션 ───────────────────────────
//
// 위 블록과 검사 내용은 같다. 파일이 다르므로 블록을 나란히 둔다
// (위 블록은 손대지 않는다 — 다른 세션이 같은 파일을 만질 수 있다).
{
  const sql = await fs.readFile(
    path.join(here, '..', 'supabase', 'migrations', '20260918000001_review_sources_voc_round3.sql'),
    'utf8',
  )
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  const mapBlock = collect.slice(collect.indexOf('const ADAPTERS ='), collect.indexOf('}', collect.indexOf('const ADAPTERS =')))
  const mapKeys = new Set([...mapBlock.matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]))
  const sqlKeys = new Set([...sql.matchAll(/^\s*'([\w-]+)',$/gm)].map((m) => m[1]))

  for (const key of ['bobaedream', 'tumblbug', 'naver_blog_post']) {
    ok(`등록(r3): 마이그레이션 review_sources.key 에 '${key}' 가 있다`, sqlKeys.has(key))
    ok(`등록(r3): ADAPTERS 맵 키가 '${key}' 와 철자까지 같다`, mapKeys.has(key))
  }
  t('등록(r3): 3행 전부 enabled=false 로만 들어간다', (sql.match(/^\s*false,$/gm) || []).length, 3)
  ok('등록(r3): DDL 이 없다 (INSERT + COMMENT 만)', !/\b(create|alter|drop)\s+table\b/i.test(sql))
  ok('등록(r3): ON CONFLICT DO NOTHING 이 있다', /ON CONFLICT \(key\) DO NOTHING/i.test(sql))
  // 어댑터 키 오타 방지 — `naver_blog`(뒤 `_post` 누락)는 흔한 실수다.
  ok("등록(r3): 'naver_blog' 오타 키가 없다", !sqlKeys.has('naver_blog') && !mapKeys.has('naver_blog'))

  // ⚠️ tumblbug·naver_blog_post 는 **리스크를 인지하고 켠 소스**다(SP-030·SP-031).
  //    그 사실이 마이그레이션 본문에서 사라지면, 나중에 이 행을 켜는 사람이
  //    근거를 모른 채 켜게 된다. 그래서 문구 자체를 고정한다.
  ok('승인근거(r3): SP-030(네이버 약관) 참조가 남아 있다', /SP-030/.test(sql))
  ok('승인근거(r3): SP-031(텀블벅 약관) 참조가 남아 있다', /SP-031/.test(sql))
  ok('승인근거(r3): 네이버 약관 금지 사실이 적혀 있다', /자동화|약관/.test(sql))
  ok(
    '승인근거(r3): naver_blog_post 의 disabled_reason 에 리스크가 적혀 있다',
    /naver_blog_post[\s\S]{0,600}?법적 리스크/.test(sql),
  )

  // 롤백이 가역인지 — 행을 지우는 DELETE 가 **주석 밖에** 있으면 안 된다.
  // 자식 행이 남은 상태에서 지우면 FK 로 실패하거나 데이터를 잃는다.
  const rb = await fs.readFile(
    path.join(here, '..', 'supabase', 'migrations', '20260918000001_review_sources_voc_round3_rollback.sql'),
    'utf8',
  )
  const live = rb.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  ok('롤백(r3): 되돌리는 문장이 있다', /update\s+public\.review_sources/i.test(live))
  ok('롤백(r3): DELETE 를 바로 실행하지 않는다', !/^\s*delete\s+from/im.test(live))
  ok('롤백(r3): 자식 행 건수 확인 SQL 이 주석으로 있다', /review_fingerprints/.test(rb) && /analysis_inputs/.test(rb))
}

// ── 같은 대조, round-5 채택분(okky · velog) ───────────────────────
//
// 위 블록들과 검사 내용은 같다. 파일이 다르므로 블록을 나란히 둔다
// (위 블록들은 손대지 않는다 — 다른 세션이 같은 파일을 만질 수 있다).
{
  const sql = await fs.readFile(
    path.join(here, '..', 'supabase', 'migrations', '20260922000001_review_sources_okky_velog.sql'),
    'utf8',
  )
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  const mapBlock = collect.slice(collect.indexOf('const ADAPTERS ='), collect.indexOf('}', collect.indexOf('const ADAPTERS =')))
  const mapKeys = new Set([...mapBlock.matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]))
  const sqlKeys = new Set([...sql.matchAll(/^\s*'([\w-]+)',$/gm)].map((m) => m[1]))

  for (const key of ['okky', 'velog']) {
    ok(`등록(r5): 마이그레이션 review_sources.key 에 '${key}' 가 있다`, sqlKeys.has(key))
    ok(`등록(r5): ADAPTERS 맵 키가 '${key}' 와 철자까지 같다`, mapKeys.has(key))
  }
  t('등록(r5): 2행 전부 enabled=false 로만 들어간다', (sql.match(/^\s*false,$/gm) || []).length, 2)
  ok('등록(r5): DDL 이 없다 (INSERT + COMMENT 만)', !/\b(create|alter|drop)\s+table\b/i.test(sql))
  ok('등록(r5): ON CONFLICT DO NOTHING 이 있다', /ON CONFLICT \(key\) DO NOTHING/i.test(sql))

  // ⚠️ 두 소스의 **근거 성질이 다르다**는 사실이 본문에서 사라지면, 나중에
  //    이 행을 켜는 사람이 "robots 가 허용했으니 됐다"로 읽는다. 벨로그
  //    robots 는 규칙이 0개일 뿐이고 채택 근거는 약관이다. 문구를 고정한다.
  ok('근거(r5): 벨로그가 robots 가 아니라 약관 근거임이 적혀 있다', /초대가 아니다/.test(sql) && /약관/.test(sql))
  ok('근거(r5): 벨로그 본문 전용 사유(대댓글·마커 불화해)가 적혀 있다', /velog[\s\S]{0,1200}?본문 전용/.test(sql))
  ok('근거(r5): OKKY 의 /api/ 금지 사실이 적혀 있다', /okky[\s\S]{0,1200}?\/api\/ 금지/.test(sql))
  ok('근거(r5): OKKY 의 /users\\/\\*\\/articles 금지 사실이 적혀 있다', /users\/\*\/articles 금지/.test(sql))
  // Actions 러너에서 재지 않았다는 한계. 이게 사라지면 "로컬에서 됐다"가
  // "Actions 에서 된다"의 근거로 쓰인다(CLAUDE.md §7.1).
  ok('근거(r5): Actions 러너 미측정이라는 한계가 적혀 있다', /(Actions 러너|Azure egress)[\s\S]{0,80}?미측정/.test(sql))

  const rb = await fs.readFile(
    path.join(here, '..', 'supabase', 'migrations', '20260922000001_review_sources_okky_velog_rollback.sql'),
    'utf8',
  )
  const live = rb.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  ok('롤백(r5): 되돌리는 문장이 있다', /update\s+public\.review_sources/i.test(live))
  ok('롤백(r5): DELETE 를 바로 실행하지 않는다', !/^\s*delete\s+from/im.test(live))
  ok('롤백(r5): 자식 행 건수 확인 SQL 이 주석으로 있다', /review_fingerprints/.test(rb) && /analysis_inputs/.test(rb))
}

// ── robots 확인 불가 3상태 + 소스별 통과 표식 (2026-09-18) ────────
//
// 여기서 고정하는 것: **막아야 할 것을 조용히 통과시키지 않는다.**
// 구멍 3곳이 실측에서 드러났다(2026-09-18 VOC 소스 조사 20곳).
//   ① robots.txt 자리에 HTML 이 오면 "규칙 0개 = 전체 허용"이 됐다
//   ② robots 캐시가 요청한 origin 기준이라 리다이렉트된 남의 규칙을 이식했다
//   ③ 우리 UA 에 적용되는 그룹이 없으면 자동 허용이었다

/** 표식이 달린 어댑터. example.test 는 robots 확인 불가여도 진행한다. */
const markedAdapter = { ...fakeAdapter, proceedWhenRobotsUnverified: ['example.test'] }
const runMarked = (h, over = {}) =>
  runCollection(markedAdapter, { dryRun: false, targetLimit: 5, ...over }, h.ports)

{
  // ③ 우리 UA 에 적용되는 그룹이 없다 (goodchoice.kr 실측 형태 — 200 인데 `*` 그룹이 없다)
  const h = makeHarness({ robots: 'User-agent: Googlebot' + LF + 'Disallow: /admin/' + LF })
  const r = await run(h)
  t('적용 그룹이 없으면 요청하지 않는다', r.requests, 0)
  ok('사유가 "그룹이 없다"다', r.perTarget[0].outcome.includes('적용되는 User-agent 그룹이 없다'))
}
{
  // ③ 사촌 — `*` 그룹은 있고 규칙이 0개 (velog 57B 실측 형태). 이건 **허용이다.**
  //    여기가 unverified 로 바뀌면 velog 가 통째로 안 돈다.
  const h = makeHarness({
    robots: '# https://www.robotstxt.org/robotstxt.html' + LF + 'User-agent: *' + LF,
    pages: { 1: page([], null) },
  })
  const r = await run(h)
  ok('`*` 그룹이 있고 규칙 0개면 요청한다 (velog 회귀 방지)', r.requests > 0)
  t('robotsSkips 0', r.robotsSkips, 0)
}
{
  // ① 200 인데 본문이 HTML — 소프트 404. 상태 코드만 보면 못 잡는다.
  const h = makeHarness({ robots: '<!DOCTYPE html>' + LF + '<html><head></head></html>' + LF })
  const r = await run(h)
  t('200 에 HTML 이 오면 요청하지 않는다', r.requests, 0)
  ok('사유에 HTML 이라고 적는다', r.perTarget[0].outcome.includes('HTML'))
}
{
  // ① 403 + Cloudflare 챌린지 HTML (킥스타터 실측 형태)
  const h = makeHarness({
    robotsStatus: 403,
    robotsBody:
      'Just a moment...' + LF + '<html><head><title>Attention Required</title></head></html>',
  })
  const r = await run(h)
  t('403 은 확인 불가다', r.requests, 0)
  ok('사유에 403 이 남는다', r.perTarget[0].outcome.includes('HTTP 403'))
}
{
  // ② robots.txt 가 다른 호스트로 리다이렉트됐다 (SOOP .co.kr → .com 실측 형태).
  //    읽은 건 other.test 의 규칙이다. example.test 의 규칙으로 쓰면 안 된다.
  const h = makeHarness({
    robots: 'User-agent: *' + LF + 'Allow: /' + LF,
    robotsFinalUrl: 'https://other.test/robots.txt',
  })
  const r = await run(h)
  t('리다이렉트된 robots 를 요청 호스트 규칙으로 쓰지 않는다', r.requests, 0)
  ok('사유에 리다이렉트 사실이 남는다', r.perTarget[0].outcome.includes('리다이렉트'))
  ok('사유에 읽은 호스트가 남는다', r.perTarget[0].outcome.includes('other.test'))
}
{
  // ② 최종 origin 이 요청 origin 과 같으면(http→https 정도) 문제가 아니다.
  const h = makeHarness({
    robots: 'User-agent: *' + LF + 'Allow: /' + LF,
    robotsFinalUrl: 'https://example.test/robots.txt',
    pages: { 1: page([], null) },
  })
  const r = await run(h)
  ok('최종 origin 이 같으면 정상 통과', r.requests > 0)
}
{
  // finalUrl 을 안 주는 포트(픽스처)는 "리다이렉트 없음"으로 본다. 이게 아니면
  // 기존 셀프테스트 전량이 fail-closed 로 막혀 버린다.
  const h = makeHarness({
    robots: 'User-agent: *' + LF + 'Allow: /' + LF,
    robotsFinalUrl: null,
    pages: { 1: page([], null) },
  })
  const r = await run(h)
  ok('finalUrl 이 없으면 리다이렉트 없음으로 본다', r.requests > 0)
}

// ── 소스별 통과 표식 — 기존 404 소스의 회귀를 막는 유일한 장치 ────
{
  const h = makeHarness({ robotsStatus: 404, pages: { 1: page([], null) } })
  const r = await runMarked(h)
  ok('표식이 있으면 404 여도 진행한다 (hackernews·theqoo·todayhumor·clien)', r.requests > 0)
  t('표식으로 통과하면 robotsSkips 0', r.robotsSkips, 0)
}
{
  const h = makeHarness({
    robots: '<!DOCTYPE html>' + LF + '<html></html>',
    pages: { 1: page([], null) },
  })
  const r = await runMarked(h)
  ok('표식이 있으면 HTML 응답도 진행한다', r.requests > 0)
}
{
  const h = makeHarness({
    robots: 'User-agent: Googlebot' + LF + 'Disallow: /admin/' + LF,
    pages: { 1: page([], null) },
  })
  const r = await runMarked(h)
  ok('표식이 있으면 적용 그룹 없음도 진행한다', r.requests > 0)
}
{
  // ⛔ 표식은 **확인 불가만** 뚫는다. 규칙이 막는 건 못 뚫는다.
  const h = makeHarness({ robots: 'User-agent: *' + LF + 'Disallow: /' + LF })
  const r = await runMarked(h)
  t('표식이 있어도 Disallow 는 못 뚫는다', r.requests, 0)
  ok('금지로 적는다', r.perTarget[0].outcome.includes('robots 금지'))
}
{
  // ⛔ 표식은 5xx 를 뚫지 못한다. 404 는 서버의 확정 응답이지만 5xx 는 "규칙이
  //    있는지조차 모른다"다. 이 구분이 사라지면 서버가 흔들린 틈에 금지 경로를 긁는다.
  const h = makeHarness({ robotsStatus: 503 })
  const r = await runMarked(h)
  t('표식이 있어도 503 은 못 뚫는다', r.requests, 0)
  ok('사유에 서버 오류라고 적는다', r.perTarget[0].outcome.includes('서버 오류'))
}
{
  const h = makeHarness({ robotsStatus: null })
  const r = await runMarked(h)
  t('표식이 있어도 네트워크 오류는 못 뚫는다', r.requests, 0)
}
{
  // 표식은 호스트 단위다. 다른 호스트에는 적용되지 않는다.
  const other = { ...fakeAdapter, proceedWhenRobotsUnverified: ['somewhere-else.test'] }
  const h = makeHarness({ robotsStatus: 404 })
  const r = await runCollection(other, { dryRun: false, targetLimit: 5 }, h.ports)
  t('다른 호스트 표식은 이 호스트를 통과시키지 않는다', r.requests, 0)
}

// ── Crawl-delay — DB 값과 **큰 쪽**을 쓴다 ────────────────────────
//
// ⚠️ 2026-09-18 까지 파서가 이 줄을 아예 안 읽었다. 유일한 방어선이
//    review_sources.min_interval_ms 의 **사람이 손으로 넣은 값**이었고,
//    brunch 는 사람이 5000 을 넣어서 지켜졌다. 다음 소스에서 그 손질을
//    빠뜨리면 그대로 robots 위반이 된다.
{
  const h = makeHarness({
    robots: 'User-agent: *' + LF + 'Allow: /' + LF + 'Crawl-delay: 10' + LF,
    sourceOver: { minIntervalMs: 4000 },
    pages: { 1: page([rv({ externalId: 'a' })], '1'), 2: page([], null) },
  })
  await run(h)
  ok(
    'robots 가 DB 값보다 크면 robots 를 쓴다',
    h.log.slept.some((ms) => ms > 4000 && ms <= 10000),
  )
  ok('4000 짜리 대기가 남지 않는다', !h.log.slept.includes(4000))
}
{
  const h = makeHarness({
    robots: 'User-agent: *' + LF + 'Allow: /' + LF + 'Crawl-delay: 1' + LF,
    sourceOver: { minIntervalMs: 4000 },
    pages: { 1: page([rv({ externalId: 'a' })], '1'), 2: page([], null) },
  })
  await run(h)
  ok(
    'DB 값이 더 크면 DB 값을 쓴다 (완화하지 않는다)',
    h.log.slept.length > 0 && h.log.slept.every((ms) => ms > 1000),
  )
}
{
  const h = makeHarness({
    robots: 'User-agent: *' + LF + 'Allow: /' + LF,
    sourceOver: { minIntervalMs: 4000 },
    pages: { 1: page([rv({ externalId: 'a' })], '1'), 2: page([], null) },
  })
  await run(h)
  ok(
    'Crawl-delay 선언이 없으면 DB 값 그대로',
    h.log.slept.length > 0 && h.log.slept.every((ms) => ms <= 4000),
  )
}

// ── 실제 네트워크 포트가 finalUrl 을 채우는가 (경계면 검사) ────────
//
// ⚠️ robots 캐시의 리다이렉트 방어는 포트가 finalUrl 을 넣어 줘야 작동한다.
//    부품 테스트는 가짜 포트를 쓰니 이 배선이 빠져도 전부 통과한다(§7.1 의
//    "부품 테스트를 통합의 근거로 쓰지 마라"). 그래서 실제 포트의 원문을 본다.
{
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  ok('review-collect 의 fetchText 가 finalUrl 을 채운다', /finalUrl:\s*res\.url/.test(collect))
  ok('review-collect 가 리다이렉트를 따라간다', /redirect:\s*'follow'/.test(collect))
}

// ── incrementalOnly 지도 — 어느 소스가 닫히고 어느 소스가 안 닫히나 ───
//
// 이 플래그 하나가 "타깃이 영영 다시 안 돈다"와 "같은 글을 매일 다시 긁는다"를 가른다.
// 어댑터를 새로 붙일 때 아무 생각 없이 복붙되기 가장 쉬운 줄이라 목록을 여기 고정한다.
// 남헌 2026-09-23 Q3(a): 커뮤니티 11곳 + hackernews 가 켜짐, 문서 대상 소스는 꺼짐.
{
  const mods = await Promise.all(
    [
      '82cook', 'bobaedream', 'brunch', 'clien', 'damoang', 'fmkorea', 'hackernews',
      'okky', 'theqoo', 'todayhumor', 'tumblbug', 'velog',
      'danawa', 'appstore', 'youtube', 'naver-blog',
    ].map((f) => import('../lib/review/adapters/' + f + '.ts')),
  )
  const adapters = mods.flatMap((m) => Object.values(m).filter((v) => v && typeof v === 'object' && 'key' in v && 'nextRequest' in v))
  const byKey = new Map(adapters.map((a) => [a.key, a]))

  const ON = ['82cook', 'bobaedream', 'brunch', 'clien', 'damoang', 'fmkorea', 'hackernews', 'okky', 'theqoo', 'todayhumor', 'tumblbug', 'velog']
  // 대상이 고정된 문서(상품 pcode·앱 id·영상 id·블로그 글)라 진짜로 끝이 있다. 켜면 매일 다시 긁는다.
  const OFF = ['danawa', 'appstore', 'youtube', 'naver_blog_post']

  for (const k of ON) t(`incrementalOnly 켜짐: ${k}`, byKey.get(k)?.incrementalOnly, true)
  for (const k of OFF) ok(`incrementalOnly 꺼짐: ${k}`, byKey.has(k) && !byKey.get(k).incrementalOnly)
  t('켜진 소스가 정확히 12개다(커뮤니티 11 + hackernews)', adapters.filter((a) => a.incrementalOnly).length, 12)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('러너가 틀렸다. 남의 서버에 대한 규칙이 걸려 있는 코드다.')
  process.exit(1)
}
console.log('러너 정상 — robots·간격·상한·커서·지문·건강도가 전부 맞물린다.')
