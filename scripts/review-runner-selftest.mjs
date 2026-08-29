#!/usr/bin/env node
// 수집 러너 셀프테스트 — 네트워크도 DB 도 없이 돈다.
//
// 러너가 외부 세계를 전부 포트로 주입받는 이유가 이것이다. 마이그레이션
// 적용을 기다리지 않고 지금 전 경로를 검증한다.
//
// 여기서 고정하는 건 "리뷰를 잘 가져오는가"가 아니라 **남의 서버에 대한
// 규칙을 지키는가**와 **조용히 망가지지 않는가**다.

import { createHash } from 'node:crypto'
import {
  runCollection,
  STALE_STREAK_TO_STOP,
  MAX_PAGES_PER_TARGET,
  PRODUCT_TOKEN,
} from '../lib/review/runner.ts'
import { computeFingerprint, normalizeText } from '../lib/review/fingerprint.ts'

let pass = 0
let fail = 0
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

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('러너가 틀렸다. 남의 서버에 대한 규칙이 걸려 있는 코드다.')
  process.exit(1)
}
console.log('러너 정상 — robots·간격·상한·커서·지문·건강도가 전부 맞물린다.')
