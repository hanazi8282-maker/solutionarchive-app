#!/usr/bin/env node
// 영역 ⑤ 3갈래 시험 소스 셀프테스트 — wordpress_org(RSS) · shopify_apps(HTML, 약관 금지·소유자 예외).
// 실제 어댑터 + 실제 러너(runCollection). 네트워크·DB 만 가짜, 픽스처는 합성본(2026-10-08 1회 실측 구조).
//
// 고정하는 것: 픽스처 파싱(0건과 못 읽음 구분) · 작성자·상점명·국가 미저장 · 개발사 답글 제외 · robots 금지/확인 불가 → 0요청 ·
//   403·429·빈 응답·캡차 → 즉시 중단(같은 소스 남은 타깃 0요청) · 리뷰 본문의 "captcha" 낱말은 차단 아님 · 요청 간격 ·
//   Shopify q=·shpxid=·auth= URL 금지 · api.wordpress.org 미사용 · 약관 예외 owner_2026-10-08 이 robots 예외 집합에 없음 ·
//   override 가 tos_flag 를 끄고 RunResult 에 스냅샷으로 남음 · short_only/none 인용 길이·정책 · 등록 마이그·ADAPTERS·빌더·워크플로 대조.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wordpressAdapter, parseProductRef as wpRef, feedUrl, kstDate } from '../lib/review/adapters/wordpress.ts'
import { shopifyAdapter, parseProductRef as shRef, isAllowedReviewUrl, parseShopifyDate, reviewsUrl, MAX_PAGE } from '../lib/review/adapters/shopify.ts'
import { runCollection, isStrictBlock, isOwnerRobotsOverride, OWNER_ROBOTS_OVERRIDES } from '../lib/review/runner.ts'
import { buildProductRef, REF_BUILDERS } from '../lib/review/target-ref.ts'
import { computeSupply } from '../lib/review/target-supply.ts'
import { checkQuote, quotePolicyOf } from '../lib/analysis/evidence-quotes.ts'
import { softSkipDecision, HALT_ON_BLOCK_SOURCES } from '../lib/review/latest-health.ts'
import { nextPctState, PCT_CEILING } from '../lib/review/ramp.ts'
import { revisitTarget } from '../lib/review/target-supply.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const fx = (dir, name) => fs.readFile(path.join(root, 'fixtures', 'review', dir, name), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const wpFeed = await fx('wordpress', 'feed.xml')
const wpEmpty = await fx('wordpress', 'feed-empty.xml')
const shPage = await fx('shopify', 'reviews-page.html')
const shLast = await fx('shopify', 'reviews-last.html')
const shNot = await fx('shopify', 'not-reviews.html')
const shRatingOnly = await fx('shopify', 'reviews-rating-only-2026-10-09.html')

const WP_ROBOTS = 'User-agent: *\nDisallow: /wp-admin/\nDisallow: /search\nDisallow: /?s=\nDisallow: /plugins/search/\n'
const SH_ROBOTS = 'User-agent: *\nDisallow: /internal/\nDisallow: /services/\nDisallow: *q=*\nDisallow: /*?*shpxid=*\nDisallow: /*?*auth=*\n'

// ── 선언 ──
t('키: wordpress_org', wordpressAdapter.key, 'wordpress_org')
t('키: shopify_apps', shopifyAdapter.key, 'shopify_apps')
for (const a of [wordpressAdapter, shopifyAdapter]) {
  t(`${a.key}: abortOnChallenge`, a.abortOnChallenge, true)
  t(`${a.key}: robots 확인 불가 표식 없음(못 읽으면 0요청)`, a.proceedWhenRobotsUnverified, undefined)
  t(`${a.key}: quotaMarkers 없음 → 403/429 전부 차단`, a.quotaMarkers, undefined)
  t(`${a.key}: 증분형`, a.incrementalOnly, true)
}
t('wordpress: 실행당 1페이지', wordpressAdapter.maxPagesPerRun, 1)
t('shopify: 실행당 2페이지', shopifyAdapter.maxPagesPerRun, 2)

// ── ref · 빌더 ──
t('wp ref', wpRef('plugin:site-reviews'), 'site-reviews')
t('wp ref: 대문자·점·슬래시 거부', [wpRef('plugin:Site'), wpRef('plugin:a.b'), wpRef('plugin:a/b'), wpRef('site-reviews')], [null, null, null, null])
t('sh ref', shRef('app:judgeme'), 'judgeme')
t('sh ref: 쿼리·슬래시 거부', [shRef('app:judgeme?q=x'), shRef('app:a/b'), shRef('judgeme')], [null, null, null])
t('빌더 wp: 맨 slug', buildProductRef('wordpress_org', 'site-reviews').productRef, 'plugin:site-reviews')
t('빌더 wp: 플러그인 페이지 URL', buildProductRef('wordpress_org', 'https://wordpress.org/plugins/site-reviews/').productRef, 'plugin:site-reviews')
t('빌더 wp: 리뷰 URL', buildProductRef('wordpress_org', 'https://wordpress.org/support/plugin/site-reviews/reviews/').productRef, 'plugin:site-reviews')
t('빌더 wp: api.wordpress.org URL 거부', buildProductRef('wordpress_org', 'https://api.wordpress.org/plugins/info/1.2/?slug=x').ok, false)
t('빌더 sh: 앱 URL', buildProductRef('shopify_apps', 'https://apps.shopify.com/judgeme/reviews').productRef, 'app:judgeme')
t('빌더 sh: app: 그대로', buildProductRef('shopify_apps', 'app:loox').productRef, 'app:loox')
t('빌더 sh: 다른 호스트 거부', buildProductRef('shopify_apps', 'https://example.com/judgeme').ok, false)

// ── 요청 URL ──
const target = (src, ref, over = {}) => ({ id: ref, projectId: 'p1', sourceKey: src, productRef: ref, cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over })
{
  const r = wordpressAdapter.nextRequest(target('wordpress_org', 'plugin:site-reviews'))
  t('wp 요청 = 리뷰 RSS', r.url, 'https://wordpress.org/support/plugin/site-reviews/reviews/feed/')
  t('wp 요청: init 없음(GET)', r.init, undefined)
  ok('wp: api.wordpress.org 를 만들지 않는다', !r.url.includes('api.wordpress.org') && feedUrl('x').startsWith('https://wordpress.org/'))
  t('wp: 잘못된 ref → null', wordpressAdapter.nextRequest(target('wordpress_org', 'plugin:../x')), null)

  const s1 = shopifyAdapter.nextRequest(target('shopify_apps', 'app:judgeme'))
  t('sh 1쪽', s1.url, 'https://apps.shopify.com/judgeme/reviews?sort_by=newest&page=1')
  t('sh 커서 3 → 4쪽', new URL(shopifyAdapter.nextRequest(target('shopify_apps', 'app:judgeme', { cursor: '3' })).url).searchParams.get('page'), '4')
  t('sh 상한 넘으면 null', shopifyAdapter.nextRequest(target('shopify_apps', 'app:judgeme', { cursor: String(MAX_PAGE) })), null)
  ok('sh 조립 URL 은 허용', isAllowedReviewUrl(reviewsUrl('judgeme', 2)))
  t('sh URL 금지: q= · shpxid= · auth= · 다른 경로 · 다른 키', [
    isAllowedReviewUrl('https://apps.shopify.com/judgeme/reviews?sort_by=newest&page=1&q=x'),
    isAllowedReviewUrl('https://apps.shopify.com/judgeme/reviews?sort_by=newest&page=1&shpxid=abc'),
    isAllowedReviewUrl('https://apps.shopify.com/judgeme/reviews?sort_by=newest&page=1&auth=1'),
    isAllowedReviewUrl('https://apps.shopify.com/search?q=reviews'),
    isAllowedReviewUrl('https://apps.shopify.com/judgeme/reviews?page=1'),
    isAllowedReviewUrl('https://evil.example/judgeme/reviews?sort_by=newest&page=1'),
  ], [false, false, false, false, false, false])
}

// ── 파싱: wordpress ──
const wctx = (cursor = null, lastReviewAt = null) => ({ productRef: 'plugin:example-plugin', cursor, lastReviewAt })
{
  const p = wordpressAdapter.parse(wpFeed, wctx())
  t('wp: 리뷰 2건', p.reviews.length, 2)
  t('wp: 남의 guid·빈 본문 = 실패 2', p.parseFailures, 2)
  t('wp: 단일 피드 → 커서 null', p.nextCursor, null)
  const [a, b] = p.reviews
  t('wp: externalId = 토픽 URL', a.externalId, 'https://wordpress.org/support/topic/solid-and-reliable-example/')
  t('wp: 본문(Replies·Rating 문단 제거, 엔티티 해제)', a.text, '[Solid and reliable] Works on three client sites, updates never broke anything & support answered in a day.\nI’d use it again.')
  t('wp: 별점', [a.rating, b.rating], [5, 2])
  t('wp: KST 날짜(UTC 19:34 → 다음날)', a.writtenAt, '2026-09-30')
  t('wp: sourceUrl = guid', a.sourceUrl, a.externalId)
  ok('wp: 작성자 미저장(authorMasked null · 본문에 사용자명 없음)', p.reviews.every((r) => r.authorMasked === null && !r.text.includes('example_user')))
  ok('wp: lang 추정 안 함', p.reviews.every((r) => r.lang === null))
  t('wp: 빈 피드 = 0건 · 실패 0', [wordpressAdapter.parse(wpEmpty, wctx()).reviews.length, wordpressAdapter.parse(wpEmpty, wctx()).parseFailures], [0, 0])
  t('wp: HTML(로그인·오류) = 못 읽음 1', wordpressAdapter.parse('<html><title>Log in</title></html>', wctx()).parseFailures, 1)
  t('wp: kstDate 못 읽으면 null', kstDate('어제'), null)
}

// ── 파싱: shopify ──
const sctx = (cursor = null, lastReviewAt = null) => ({ productRef: 'app:example', cursor, lastReviewAt })
{
  const p = shopifyAdapter.parse(shPage, sctx())
  t('sh: 리뷰 2건 · 본문 없는 블록 실패 1', [p.reviews.length, p.parseFailures], [2, 1])
  t('sh: rel=next → 커서 1(방금 읽은 쪽)', p.nextCursor, '1')
  const [a, b] = p.reviews
  t('sh: id', [a.externalId, b.externalId], ['9000002', '9000001'])
  t('sh: 별점', [a.rating, b.rating], [5, 1])
  t('sh: 날짜', [a.writtenAt, b.writtenAt], ['2026-09-30', '2026-08-09'])
  t('sh: 본문', a.text, 'Easy setup, photo reviews boosted conversions & support replied within hours.')
  ok('sh: 개발사 답글 제외', !b.text.includes('DEVELOPER REPLY'))
  ok('sh: 상점명·국가·사용기간 미저장', p.reviews.every((r) => r.authorMasked === null && !/Example Store|Australia|United States|using the app/.test(r.text)))
  ok('sh: sourceUrl·lang 비움(실측 안 한 주소를 만들지 않는다)', p.reviews.every((r) => r.sourceUrl === null && r.lang === null))
  t('sh: 마지막 쪽 → 커서 null', shopifyAdapter.parse(shLast, sctx('4')).nextCursor, null)
  t('sh: 리뷰 페이지 아님(200 로그인) = 못 읽음 1', shopifyAdapter.parse(shNot, sctx()).parseFailures, 1)
  t('sh: 이미 본 구간 → 커서 null', shopifyAdapter.parse(shPage, sctx(null, '2026-09-01')).nextCursor, null)
  t('sh: 날짜 해석', [parseShopifyDate('August 9, 2026'), parseShopifyDate('Edited 9 Aug')], ['2026-08-09', null])

  // 반례(v37 독립 검토 차단 1건): 블록 속성이 바뀐 10건 페이지는 0건 ok 가 아니라 못 읽음.
  const changed = shopifyAdapter.parse(shPage.replaceAll('data-merchant-review=""', 'data-merchant-review="1"'), sctx())
  t('sh 반례: 블록 속성 변경(리뷰 id·다음 쪽 흔적 있음) = 못 읽음 1', [changed.reviews.length, changed.parseFailures, changed.nextCursor], [0, 1, null])
  const onlyCount = '<html><head><title>Reviews: X | Shopify App Store</title></head><body><script type="application/ld+json">{"aggregateRating":{"reviewCount":"12"}}</script></body></html>'
  t('sh 반례: 블록 0 + 리뷰 수 ≥1 = 못 읽음 1', shopifyAdapter.parse(onlyCount, sctx()).parseFailures, 1)
  const zero = '<html><head><title>Reviews: New App | Shopify App Store</title></head><body><p>No reviews yet</p><script type="application/ld+json">{"aggregateRating":{"reviewCount":0}}</script></body></html>'
  t('sh: 리뷰 0건 정상 페이지 = 0건 · 실패 0', [shopifyAdapter.parse(zero, sctx()).reviews.length, shopifyAdapter.parse(zero, sctx()).parseFailures], [0, 0])
  t('sh: 리뷰 표지 + 챌린지 마크업 = 파서도 못 읽음', shopifyAdapter.parse(shPage.replace('</body>', '<script src="/cdn-cgi/challenge-platform/x.js"></script></body>'), sctx()).parseFailures, 1)

  // 10-09 실측 고정 샘플(loox 1쪽에서 블록 4개): 별점만 남긴 리뷰(빈 <p></p>)는 실패가 아니라 건너뜀. 05:39 15/20 · 07:38 2/10 broken 의 원인.
  const ro = shopifyAdapter.parse(shRatingOnly, sctx())
  t('sh 실측: 본문 2건 · 별점만 2건 = 실패 0 · 다음 쪽', [ro.reviews.length, ro.parseFailures, ro.nextCursor], [2, 0, '1'])
  t('sh 실측: id·별점·날짜', ro.reviews.map((r) => [r.externalId, r.rating, r.writtenAt]), [['2388901', 5, '2026-10-08'], ['2388611', 1, '2026-10-08']])
  ok('sh 실측: 상점명 미저장', ro.reviews.every((r) => r.authorMasked === null && !r.text.includes('(shop)')))
  // 반례: 쪽 전체가 빈 <p></p> 면 본문이 다른 자리로 옮겨 간 구조 변경일 수 있다 → 0건 ok 가 아니라 실패 1.
  const allEmpty = shRatingOnly.replace(/(<p class="tw-break-words">)[^<]+(<\/p>)/g, '$1$2')
  t('sh 반례: 블록 전부 빈 본문 = 0건 · 실패 1', [shopifyAdapter.parse(allEmpty, sctx()).reviews.length, shopifyAdapter.parse(allEmpty, sctx()).parseFailures], [0, 1])
}
{
  // WP 반례: 채널은 있는데 item 이 다른 모양(<item attr>·<entry>)이면 0건 ok 가 아니다.
  t('wp: <item 속성> 도 읽는다', wordpressAdapter.parse(wpFeed.replaceAll('<item>', '<item rdf:about="x">'), wctx()).reviews.length, 2)
  t('wp 반례: item 0 + <entry> 흔적 = 못 읽음 1', wordpressAdapter.parse(wpFeed.replaceAll('<item>', '<entry>').replaceAll('</item>', '</entry>'), wctx()).parseFailures, 1)
}

// ── 캡차 판정(어댑터 isChallenge → runner isStrictBlock) ──
{
  const S = (a, body, status = 200) => isStrictBlock({ status, body }, a.isChallenge)
  t('wp: 정상 RSS 는 차단 아님', S(wordpressAdapter, wpFeed), false)
  t('wp: 본문에 captcha 낱말이 있어도 RSS 면 차단 아님', S(wordpressAdapter, wpFeed.replace('Works on three', 'The captcha works on three')), false)
  t('wp: RSS 가 아닌 200(HTML 확인 화면) = 차단', S(wordpressAdapter, '<html><body>Checking your browser</body></html>'), true)
  t('wp: 빈 200 = 차단', S(wordpressAdapter, '   '), true)
  t('sh: 정상 페이지(본문에 captcha 낱말) 차단 아님', S(shopifyAdapter, shPage.replace('Easy setup', 'The captcha widget, easy setup')), false)
  t('sh: 캡차 화면 = 차단', S(shopifyAdapter, '<html><title>Just a moment</title><div class="g-recaptcha"></div></html>'), true)
  t('sh: 표지 없는 로그인 200 = 차단(모양이 다르면 멈춘다)', S(shopifyAdapter, shNot), true)
  t('sh: Access denied 200 = 차단', S(shopifyAdapter, '<html><title>Access denied</title></html>'), true)
  t('sh: 리뷰 표지 + 챌린지 마크업 = 차단', S(shopifyAdapter, shPage.replace('</body>', '<div class="g-recaptcha"></div></body>')), true)
  t('기본 표지는 그대로(어댑터 판정 없으면 captcha 부분일치)', isStrictBlock({ status: 200, body: 'captcha' }), true)
}

// ── 러너 경계 ──
function harness({ adapter, robots, api, targets, source = {} }) {
  const calls = []
  const inputs = []
  let clock = 1_000_000
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url, init) {
      calls.push({ url, init, at: clock })
      clock += 10
      if (url.endsWith('/robots.txt')) return { ...robots, finalUrl: url }
      return api(new URL(url), calls.filter((c) => !c.url.endsWith('/robots.txt')).length)
    },
    store: {
      async loadSource(key) {
        return { key, enabled: true, minIntervalMs: adapter.key === 'shopify_apps' ? 8000 : 5000, dailyRequestCap: 40, requestsToday: 0, ...source }
      },
      async listDueTargets() { return targets },
      async saveTargetProgress() {},
      async recordFingerprint() { return 'new' },
      async appendInput(i) { inputs.push(i); return `in${inputs.length}` },
      async linkFingerprint() {},
    },
  }
  return { ports, calls, inputs, api: () => calls.filter((c) => !c.url.endsWith('/robots.txt')) }
}
const WP_T = [target('wordpress_org', 'plugin:site-reviews'), target('wordpress_org', 'plugin:wp-customer-reviews')]
const SH_T = [target('shopify_apps', 'app:judgeme'), target('shopify_apps', 'app:loox')]
const run = (h, adapter) => runCollection(adapter, { dryRun: false, targetLimit: 10 }, h.ports)

{
  const h = harness({ adapter: wordpressAdapter, robots: { status: 200, body: WP_ROBOTS }, api: () => ({ status: 200, body: wpFeed }), targets: WP_T })
  const r = await run(h, wordpressAdapter)
  t('경계 wp: 타깃 2 × 1요청', r.requests, 2)
  ok('경계 wp: 요청 간격 ≥ 5초', h.api()[1].at - h.api()[0].at >= 5000)
  t('경계 wp: 적재 4건(타깃당 2)', h.inputs.length, 4)
  ok('경계 wp: [SRC:] 머리말 = wordpress.org 토픽', h.inputs.every((i) => i.text.startsWith('[SRC: https://wordpress.org/support/topic/')))
  ok('경계 wp: 적재 본문에 사용자명 없음', h.inputs.every((i) => !i.text.includes('example_user')))
  ok('경계 wp: robots 는 wordpress.org 만', h.calls.filter((c) => c.url.endsWith('/robots.txt')).every((c) => c.url === 'https://wordpress.org/robots.txt'))
}
{
  const h = harness({ adapter: shopifyAdapter, robots: { status: 200, body: SH_ROBOTS }, api: (u) => ({ status: 200, body: u.searchParams.get('page') === '1' ? shPage : shLast }), targets: SH_T })
  const r = await run(h, shopifyAdapter)
  t('경계 sh: 타깃 2 × 2쪽', r.requests, 4)
  ok('경계 sh: 요청 간격 ≥ 8초', h.api().slice(1).every((c, i) => c.at - h.api()[i].at >= 8000))
  ok('경계 sh: 모든 요청이 허용 URL', h.api().every((c) => isAllowedReviewUrl(c.url)))
  t('경계 sh: 적재 6건', h.inputs.length, 6)
  ok('경계 sh: 머리말 없음(sourceUrl null)', h.inputs.every((i) => !i.text.startsWith('[SRC:')))
}
// robots 금지·확인 불가 → 0요청
for (const [adapter, T, robots, why] of [
  [wordpressAdapter, WP_T, { status: 200, body: 'User-agent: *\nDisallow: /support/\n' }, '금지'],
  [wordpressAdapter, WP_T, { status: 404, body: 'not found' }, '확인 불가 404'],
  [wordpressAdapter, WP_T, { status: 503, body: '' }, '확인 불가 503'],
  [shopifyAdapter, SH_T, { status: 200, body: 'User-agent: *\nDisallow: /judgeme/\nDisallow: /loox/\n' }, '금지'],
  [shopifyAdapter, SH_T, { status: 403, body: '<html>forbidden</html>' }, '확인 불가 403'],
]) {
  const h = harness({ adapter, robots, api: () => ({ status: 200, body: '' }), targets: T })
  const r = await run(h, adapter)
  t(`robots ${why}: ${adapter.key} 요청 0`, [r.requests, h.api().length], [0, 0])
}
// 403·429·빈 응답·캡차 → 첫 응답에서 실행 중단(남은 타깃 0요청)
for (const [adapter, T, robots, resp, why] of [
  [wordpressAdapter, WP_T, { status: 200, body: WP_ROBOTS }, { status: 403, body: 'Forbidden' }, '403'],
  [wordpressAdapter, WP_T, { status: 200, body: WP_ROBOTS }, { status: 429, body: 'Too Many' }, '429'],
  [wordpressAdapter, WP_T, { status: 200, body: WP_ROBOTS }, { status: 200, body: '' }, '빈 200'],
  [wordpressAdapter, WP_T, { status: 200, body: WP_ROBOTS }, { status: 200, body: '<html>verify you are human</html>' }, 'HTML 확인 화면'],
  [shopifyAdapter, SH_T, { status: 200, body: SH_ROBOTS }, { status: 403, body: 'Forbidden' }, '403'],
  [shopifyAdapter, SH_T, { status: 200, body: SH_ROBOTS }, { status: 429, body: 'Too Many' }, '429'],
  [shopifyAdapter, SH_T, { status: 200, body: SH_ROBOTS }, { status: 200, body: '' }, '빈 200'],
  [shopifyAdapter, SH_T, { status: 200, body: SH_ROBOTS }, { status: 200, body: '<title>Just a moment</title> cf-chl captcha' }, '캡차'],
  [shopifyAdapter, SH_T, { status: 200, body: SH_ROBOTS }, { status: 200, body: shNot }, '로그인 벽 200'],
]) {
  const h = harness({ adapter, robots, api: () => resp, targets: T })
  const r = await run(h, adapter)
  t(`중단 ${why}: ${adapter.key} 요청 1 · 차단 1 · 적재 0`, [r.requests, r.stats.blockedResponses, h.inputs.length], [1, 1, 0])
  ok(`중단 ${why}: ${adapter.key} 두 번째 타깃은 손대지 않음`, r.perTarget.length <= 2 && r.targetsVisited === 1)
}

// ── 약관 예외(owner_2026-10-08)는 robots 예외가 아니다 ──
{
  ok('robots 예외 집합에 owner_2026-10-08 없음', !OWNER_ROBOTS_OVERRIDES.has('owner_2026-10-08'))
  t('isOwnerRobotsOverride(owner_2026-10-08, disallowed) = false', isOwnerRobotsOverride('owner_2026-10-08', 'disallowed'), false)
  // robots 가 금지로 바뀌면 이 소스는 멈춰야 한다(예외가 robots 를 뚫지 않는다). store 와 같은 판정으로 SourceConfig 를 만든다.
  const h = harness({
    adapter: shopifyAdapter, robots: { status: 200, body: 'User-agent: *\nDisallow: /\n' }, api: () => ({ status: 200, body: shPage }), targets: SH_T,
    source: { robotsOwnerOverride: isOwnerRobotsOverride('owner_2026-10-08', 'disallowed'), overrideValue: 'owner_2026-10-08' },
  })
  const r = await run(h, shopifyAdapter)
  t('sh: robots 금지면 약관 예외가 있어도 요청 0', [r.requests, r.robotsOwnerOverride], [0, 0])
  t('sh: 실행 결과에 override 스냅샷', r.overrideValue, 'owner_2026-10-08')

  const now = new Date('2026-10-08T12:00:00Z')
  const rep = computeSupply({
    now, ramps: [], targets: [], runs: [],
    sources: [
      { key: 'shopify_apps', enabled: true, daily_request_cap: 30, robots_status: 'allowed', tos_status: 'prohibited', override: 'owner_2026-10-08' },
      { key: 'wordpress_org', enabled: true, daily_request_cap: 40, robots_status: 'allowed', tos_status: 'silent', override: null },
      { key: 'x_no_override', enabled: true, daily_request_cap: 10, robots_status: 'allowed', tos_status: 'prohibited', override: null },
    ],
  })
  const S = (k) => rep.sources.find((s) => s.source_key === k)
  t('target-supply: 약관 예외 기록 → tos_flag 꺼짐 · silent 도 꺼짐 · 기록 없는 금지는 켜짐', [S('shopify_apps').tos_flag, S('wordpress_org').tos_flag, S('x_no_override').tos_flag], [false, false, true])
  const capScript = await fs.readFile(path.join(here, 'review-request-cap.mjs'), 'utf8')
  ok('request-cap: override 있는 소스는 자동 상향 대상 밖(override != null)', capScript.includes('ownerOverride: overrideReadable ? s.override != null : null'))
}

// ── 차단 뒤 멈춤(soft-skip, review_sources 쓰기 없음) · 램프 상한 · 공급 분류 ──
{
  const NOW = Date.parse('2026-10-10T00:00:00Z')
  const row = (blocked, at = '2026-10-09T05:37:00Z') => ({ source_key: 'k', started_at: at, dry_run: false, status: 'ok', health_after: blocked > 0 ? 'broken' : 'ok', reviews_parsed: 10, parse_failures: 0, blocked_responses: blocked })
  ok('멈춤 대상 = shopify_apps 만', HALT_ON_BLOCK_SOURCES.has('shopify_apps') && !HALT_ON_BLOCK_SOURCES.has('wordpress_org') && !HALT_ON_BLOCK_SOURCES.has('googleplay'))
  t('멈춤: 최근 실행 차단 → skip', softSkipDecision([row(1)], null, NOW, 'shopify_apps').state, 'skip')
  t('멈춤: 30일 지나도 재시도 없음', softSkipDecision([row(2, '2026-09-01T00:00:00Z')], null, NOW, 'shopify_apps').state, 'skip')
  t('멈춤: 사람이 직접 돌려 정상이 최신이면 재개', softSkipDecision([row(0, '2026-10-09T09:00:00Z'), row(1)], null, NOW, 'shopify_apps').state, 'run')
  t('멈춤: 차단 수치 없음 = 확인 불가(지금처럼 실행)', softSkipDecision([{ ...row(0), blocked_responses: null }], null, NOW, 'shopify_apps').state, 'unknown')
  t('멈춤: 다른 소스는 차단 1회로 멈추지 않는다', softSkipDecision([row(1)], null, NOW, 'wordpress_org').state, 'run')
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  ok('멈춤: 스케줄 실행만 soft-skip(--source 직접 지정은 건너뛰지 않음)', collect.includes('if (!explicitSources && !dryRun) {') && collect.includes('loadSoftSkip(supabase, sourceKey)'))

  t('램프: shopify 자동 상승 상한 50', PCT_CEILING.shopify_apps, 50)
  t('램프: shopify 정상 2일 연속이어도 50 유지', nextPctState({ pctStep: 50, consecutiveOkDays: 1 }, 'ok', PCT_CEILING.shopify_apps).pctStep, 50)
  t('램프: wordpress 는 현행(50→60)', nextPctState({ pctStep: 50, consecutiveOkDays: 1 }, 'ok', PCT_CEILING.wordpress_org).pctStep, 60)
  t('램프: 상한이 차단 하강을 막지 않는다(연속 0)', nextPctState({ pctStep: 50, consecutiveOkDays: 1 }, 'blocked', 50).consecutiveOkDays, 0)
  const ramp = await fs.readFile(path.join(root, 'lib', 'review', 'ramp.ts'), 'utf8')
  ok('램프: 집행(stepPctRamps)이 상한을 넘긴다', ramp.includes('nextPctState(p, j.verdict, PCT_CEILING[r.sourceKey])'))

  t('공급: 두 소스 앱스토어형 v', [revisitTarget('wordpress_org').basis, revisitTarget('shopify_apps').basis], ['design_v32:app(1/7)', 'design_v32:app(1/7)'])
}

// ── 인용 정책: wordpress short_only(130/240자) · shopify none ──
{
  const raw = wordpressAdapter.parse(wpFeed, wctx()).reviews[0].text
  const long = 'This plugin ' + 'really '.repeat(40) + 'works.'
  t('short_only: 짧은 원문 발췌 통과', checkQuote('updates never broke anything', quotePolicyOf('short_only'), raw).ok, true)
  t('short_only: 240자 넘는 영어 = too_long', checkQuote(long, quotePolicyOf('short_only'), long).reason, 'too_long')
  t('none: 어떤 발췌도 거부', checkQuote('updates never broke anything', quotePolicyOf('none'), raw).reason, 'policy_none')
}

// ── 등록 대조: 마이그 · ADAPTERS · 빌더 · 워크플로 ──
{
  const sql = await fs.readFile(path.join(root, 'supabase', 'migrations', '20261008000040_five_arm_sources.sql'), 'utf8')
  const rb = await fs.readFile(path.join(root, 'supabase', 'migrations', '20261008000040_five_arm_sources_rollback.sql'), 'utf8')
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  const wf = await fs.readFile(path.join(root, '.github', 'workflows', 'nightly-review-collect.yml'), 'utf8')
  const mapBlock = collect.slice(collect.indexOf('const ADAPTERS ='), collect.indexOf('}', collect.indexOf('const ADAPTERS =')))
  const mapKeys = new Set([...mapBlock.matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]))
  const sqlKeys = new Set([...sql.matchAll(/^\s*'([\w-]+)',$/gm)].map((m) => m[1]))
  const code = sql.replace(/^\s*--.*$/gm, '')
  for (const k of ['wordpress_org', 'shopify_apps']) {
    ok(`등록: 마이그 key '${k}'`, sqlKeys.has(k))
    ok(`등록: ADAPTERS '${k}'`, mapKeys.has(k))
    ok(`등록: REF_BUILDERS '${k}'`, k in REF_BUILDERS)
    ok(`등록: 워크플로 선택지 '${k}'`, new RegExp(`^\\s*- ${k}$`, 'm').test(wf))
  }
  ok('마이그: shopify 행 = allowed · prohibited · owner_2026-10-08 · none · quote_allowed false',
    /'allowed', 'prohibited', 'owner_2026-10-08', 'none', false, true/.test(code))
  ok('마이그: wordpress 행 = allowed · silent · override NULL · short_only', /'allowed', 'silent', NULL, 'short_only', true, true/.test(code))
  ok('마이그: shopify 간격 ≥5초 · 상한 30', /'ok', 8000, 30,/.test(code))
  ok('마이그: 램프 50% 출발 2행(40→20 · 30→15)', /'wordpress_org', 0, 10, '[^']+', 50, 40, 20/.test(code) && /'shopify_apps',\s+0, 10, '[^']+', 50, 30, 15/.test(code))
  const refs = [...code.matchAll(/\('(wordpress_org|shopify_apps)',\s*'((?:plugin|app):[^']+)',\s*'([^']+)'/g)]
  t('마이그: 타깃 19개(wp 9 · shopify 10)', [refs.length, refs.filter((m) => m[1] === 'wordpress_org').length], [19, 9])
  ok('마이그: 타깃 ref 를 어댑터가 읽는다', refs.every((m) => (m[1] === 'wordpress_org' ? wpRef(m[2]) : shRef(m[2])) !== null))
  ok('마이그: 라벨 5:wp|<slug>·5:shopify|<slug> (영역 ^([1-5]): 호환)', refs.every((m) => /^5:(wp|shopify)\|[a-z0-9-]+$/.test(m[3]) && /^([1-5]):/.test(m[3])))
  ok('마이그: 라벨 slug = ref slug', refs.every((m) => m[3].split('|')[1] === m[2].split(':')[1]))
  ok('마이그: api.wordpress.org·q=·shpxid= 없음', !/api\.wordpress\.org|shpxid=|[?&]q=/.test(code))
  ok('마이그: DELETE·DROP·UPDATE 없음(본 파일 — 임시 표의 ON COMMIT DROP 제외)', !/\b(DELETE|DROP|UPDATE)\b/i.test(code.replace(/ON COMMIT DROP/g, '')))
  ok('마이그: 멱등(ON CONFLICT·NOT EXISTS)', /ON CONFLICT \(key\) DO NOTHING/.test(code) && /ON CONFLICT \(source_key\) DO NOTHING/.test(code) && (code.match(/NOT EXISTS/g) || []).length >= 2)
  ok('마이그: 하단 확인 쿼리(양성·음성)', /양성:/.test(sql) && /음성\(롤백되는 형태/.test(sql))
  ok('롤백: 행 삭제 없이 비활성화 + override 회수', /SET enabled = false/.test(rb) && /override = CASE WHEN key = 'shopify_apps' THEN NULL/.test(rb))
  ok('롤백: DELETE 없음(램프는 cap_base NULL·동결)', !/\bDELETE\b/i.test(rb.replace(/^\s*--.*$/gm, '')) && /SET cap_base = NULL/.test(rb))
}

console.log(fail ? `review-five-arm-selftest: 실패 ${fail}건 / 통과 ${pass}건` : `review-five-arm-selftest: 통과 ${pass}건`)
process.exit(fail ? 1 : 0)
