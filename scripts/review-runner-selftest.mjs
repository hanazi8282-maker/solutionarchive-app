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
        return robotsStatus === 200
          ? { status: 200, body: robots }
          : { status: robotsStatus, body: '' }
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
  t('20건 전부 신규로 적재된다', inputs.length, 20)
  t('폴백 키 없음 — 다나와 seq 를 전부 읽었다', r.stats.fallbackKeys, 0)
  t('health ok', r.health.health, 'ok')
  ok('마지막 저장의 커서가 null — 타깃 종료', saves[saves.length - 1].cursor === null)
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

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('러너가 틀렸다. 남의 서버에 대한 규칙이 걸려 있는 코드다.')
  process.exit(1)
}
console.log('러너 정상 — robots·간격·상한·커서·지문·건강도가 전부 맞물린다.')
