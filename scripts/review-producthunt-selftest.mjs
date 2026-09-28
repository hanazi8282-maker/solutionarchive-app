#!/usr/bin/env node
// Product Hunt GraphQL 어댑터 셀프테스트 — 네트워크 없이 픽스처로만 돈다.
//
// ⚠️ 픽스처는 응답의 **구조만** 보존한다(실토큰 응답 아님 — 켜기 전에 1회 실측할 것). 본문은 합성값이다.
//
// 여기서 고정하는 것:
//   · POST 본문·Bearer 헤더가 러너를 거쳐 fetchText 에 **실제로** 닿는가(부품이 아니라 경계, §7.1)
//   · 토큰이 URL 에 들어가지 않는가 · robots.txt 는 GET 으로 읽는가
//   · hasNextPage=false 면 커서 null(종료) · 2페이지 요청에 after=<endCursor> 가 실리는가
//   · 200 + errors / post=null 은 "0건 정상"이 아니라 파싱 실패다
//   · 429 rate_limit_reached 는 'quota'(소스를 끄지 않는다)
//   · authorMasked 는 항상 null · ref 빌더가 URL·post:·맨 슬러그를 받는다

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { producthuntAdapter, parseProductRef, PH_GRAPHQL_URL } from '../lib/review/adapters/producthunt.ts'
import { classifyBlockedResponse } from '../lib/review/health.ts'
import { runCollection } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'review', 'producthunt', name), 'utf8')

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

const TOKEN = 'TEST_PH_TOKEN'
process.env.PRODUCT_HUNT_API_TOKEN = TOKEN

// CLAUDE.md §7.1 예외(남헌 2026-09-29) — Actions 에서 robots 403 이어도 공식 API 호스트는 진행
t('robots 확인 불가 예외 호스트', JSON.stringify(producthuntAdapter.proceedWhenRobotsUnverified), '["api.producthunt.com"]')

const page1 = await fx('page1.json')
const page2 = await fx('page2-last.json')
const errors = await fx('graphql-errors.json')
const postNull = await fx('post-null.json')
const rate = await fx('rate-limit-429.json')

const target = (over = {}) => ({
  id: 't1', projectId: 'p1', sourceKey: 'producthunt', productRef: 'post:acme-notes',
  cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over,
})
const ctx = { productRef: 'post:acme-notes', cursor: null }

// ── ref ──
t('ref: post:<slug>', parseProductRef('post:acme-notes'), 'acme-notes')
t('ref: 대문자는 소문자로', parseProductRef('POST:Acme-Notes'), 'acme-notes')
t('ref: 접두어 없으면 거부', parseProductRef('acme-notes'), null)
t('ref: 경로 주입 거부', parseProductRef('post:../x'), null)
t('빌더: URL', buildProductRef('producthunt', 'https://www.producthunt.com/posts/acme-notes?ref=x').productRef, 'post:acme-notes')
t('빌더: post:', buildProductRef('producthunt', 'post:acme-notes').productRef, 'post:acme-notes')
t('빌더: 맨 슬러그', buildProductRef('producthunt', 'acme-notes').productRef, 'post:acme-notes')
t('빌더: 쓰레기는 거부', buildProductRef('producthunt', 'not a slug!').ok, false)

// ── nextRequest ──
{
  const r = producthuntAdapter.nextRequest(target())
  t('요청: GraphQL 엔드포인트', r.url, PH_GRAPHQL_URL)
  t('요청: POST', r.init.method, 'POST')
  t('요청: Bearer 헤더', r.init.headers.Authorization, `Bearer ${TOKEN}`)
  ok('요청: 토큰이 URL 에 없다', !r.url.includes(TOKEN))
  const b = JSON.parse(r.init.body)
  t('요청: slug 변수', b.variables.slug, 'acme-notes')
  t('요청: 첫 페이지 after=null', b.variables.after, null)
  ok('요청: 시간 역순(order: NEWEST)', /order:\s*NEWEST/.test(b.query))
  ok('요청: 토큰이 본문에 없다', !r.init.body.includes(TOKEN))
  t('요청: 커서가 after 로', JSON.parse(producthuntAdapter.nextRequest(target({ cursor: 'MjA' })).init.body).variables.after, 'MjA')
  t('요청: 잘못된 ref → null', producthuntAdapter.nextRequest(target({ productRef: 'v:abc' })), null)
  delete process.env.PRODUCT_HUNT_API_TOKEN
  t('요청: 토큰 없으면 null', producthuntAdapter.nextRequest(target()), null)
  process.env.PRODUCT_HUNT_API_TOKEN = TOKEN
}

// ── parse ──
{
  const p = producthuntAdapter.parse(page1, ctx)
  t('1쪽: 본문 있는 댓글 2건', p.reviews.length, 2)
  t('1쪽: 빈 본문은 파싱 실패 1건', p.parseFailures, 1)
  t('1쪽: 다음 커서 = endCursor', p.nextCursor, 'MjA')
  t('1쪽: externalId', p.reviews[0].externalId, '4100001')
  t('1쪽: 날짜', p.reviews[0].writtenAt, '2026-09-20')
  ok('1쪽: HTML 제거', !p.reviews[0].text.includes('<b>') && p.reviews[0].text.includes('sync keeps failing'))
  ok('1쪽: 출처 접두', p.reviews[0].text.startsWith('[Product Hunt 댓글 · acme-notes] '))
  ok('1쪽: 작성자 미보관', p.reviews.every((r) => r.authorMasked === null))
  const q = producthuntAdapter.parse(page2, ctx)
  t('끝쪽: hasNextPage=false → 커서 null', q.nextCursor, null)
  t('끝쪽: 1건', q.reviews.length, 1)
  const e = producthuntAdapter.parse(errors, ctx)
  t('200+errors: 파싱 실패로 센다', e.parseFailures, 1)
  t('200+errors: 끝으로 본다', e.nextCursor, null)
  t('post=null: 파싱 실패로 센다', producthuntAdapter.parse(postNull, ctx).parseFailures, 1)
  t('JSON 아님: 파싱 실패', producthuntAdapter.parse('<html>', ctx).parseFailures, 1)
  t('429 rate_limit_reached → quota', classifyBlockedResponse(rate, producthuntAdapter.quotaMarkers), 'quota')
}

// ── 러너 경계: init 이 실제 fetch 포트까지 가는가 ──
{
  const calls = []
  const inputs = []
  const saves = []
  let clock = 1_000_000
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url, init) {
      calls.push({ url, init })
      clock += 10
      if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nDisallow: /auth/*\n', finalUrl: url }
      const after = JSON.parse(init.body).variables.after
      return { status: 200, body: after ? page2 : page1 }
    },
    store: {
      async loadSource() { return { key: 'producthunt', enabled: true, minIntervalMs: 2000, dailyRequestCap: 100, requestsToday: 0 } },
      async listDueTargets() { return [target()] },
      async saveTargetProgress(p) { saves.push(p) },
      async recordFingerprint() { return 'new' },
      async appendInput(i) { inputs.push(i); return `in${inputs.length}` },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }
  const res = await runCollection(producthuntAdapter, { dryRun: false, targetLimit: 5 }, ports)
  const api = calls.filter((c) => c.url === PH_GRAPHQL_URL)
  const robots = calls.filter((c) => c.url.endsWith('/robots.txt'))
  t('경계: API 요청 2회(1쪽→끝쪽)', api.length, 2)
  ok('경계: API 요청은 POST + Bearer', api.every((c) => c.init?.method === 'POST' && c.init.headers.Authorization === `Bearer ${TOKEN}`))
  t('경계: 2번째 요청 after = 1쪽 endCursor', JSON.parse(api[1].init.body).variables.after, 'MjA')
  ok('경계: robots.txt 는 init 없이(GET)', robots.length === 1 && robots[0].init === undefined)
  t('경계: 적재 3건', inputs.length, 3)
  t('경계: 마지막 저장 커서 null', saves.at(-1)?.cursor, null)
  t('경계: 요청 수', res.requests, 2)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('Product Hunt 어댑터 계약이 깨졌다.')
  process.exit(1)
}
console.log('Product Hunt 어댑터 정상 — POST·Bearer 가 러너를 거쳐 전달되고, errors/post=null 은 실패로 센다.')
