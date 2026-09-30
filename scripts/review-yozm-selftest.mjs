#!/usr/bin/env node
// 요즘IT(yozm) 매거진 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크·DB 없음.
//
// 픽스처는 2026-09-30 에 우리 UA 로 실제로 받은 페이지다(fixtures/review/yozm/, 스크립트·svg 만 걷었다):
//   robots.txt              200 · `*`: Allow /magazine/ · Disallow /api/ /media/ … · Crawl-delay: 5
//   magazine-front.html     /magazine/ · 기사 링크 18개(서버 렌더)
//   detail-3783.html        /magazine/detail/3783/ · JSON-LD NewsArticle · articleBody 7,251자
//   list-startup-csr.html   /magazine/list/startup/ · 200 인데 기사 링크 0개(CSR) — 목록으로 쓰면 안 되는 증거
//
// ⚠️ 마지막 블록은 실제 러너와 붙여 돈다(§7.1 사례 5).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { yozmAdapter as A, HOST } from '../lib/review/adapters/yozm.ts'
import { decodeBoardCursor, encodeBoardCursor } from '../lib/review/types.ts'
import { parseRobots, robotsVerdict, robotsCrawlDelaySec } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'yozm', n), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)
const target = (over = {}) => ({
  id: 't1', projectId: 'p1', sourceKey: 'yozm', productRef: 'board:magazine',
  cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over,
})
const ctx = (cursor = null) => ({ productRef: 'board:magazine', cursor, lastReviewAt: null })
const qctx = (id) => ctx(encodeBoardCursor({ q: [`/magazine/detail/${id}/`], last: '9' }))

// ── robots ─────────────────────────────────────────────────────────
{
  const g = parseRobots(fx('robots.txt'))
  t('robots: /magazine/ 허용', robotsVerdict(g, '/magazine/', PRODUCT_TOKEN).state, 'allowed')
  t('robots: 기사 허용', robotsVerdict(g, '/magazine/detail/3783/', PRODUCT_TOKEN).state, 'allowed')
  t('robots: /api/ 금지(CSR 목록의 데이터 경로)', robotsVerdict(g, '/api/magazine', PRODUCT_TOKEN).state, 'disallowed')
  t('robots: Crawl-delay 5 를 읽는다', robotsCrawlDelaySec(g, PRODUCT_TOKEN), 5)
}

// ── 등록 경로 · nextRequest ───────────────────────────────────────
t('ref: board:magazine', buildProductRef('yozm', 'board:magazine')?.productRef, 'board:magazine')
t('ref: 모르는 게시판 거부', buildProductRef('yozm', 'board:startup')?.ok, false)
t('next: 첫 요청은 매거진 첫 화면', A.nextRequest(target())?.url, `${HOST}/magazine/`)
t('next: 큐 머리', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/magazine/detail/3968/'], last: '1' }) }))?.url, `${HOST}/magazine/detail/3968/`)
t('next: 오염된 큐는 요청 0', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/magazine/manage/1/'], last: null }) })), null)

// ── 목록 ───────────────────────────────────────────────────────────
{
  const r = A.parse(fx('magazine-front.html'), ctx())
  const c = decodeBoardCursor(r.nextCursor)
  t('목록: 리뷰 0 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '0/0')
  t('목록: 18건 전부 큐', c.q.length, 18)
  t('목록: 큐 머리는 최대 id', c.q[0], '/magazine/detail/3968/')
  t('목록: last', c.last, '3968')
  const inc = decodeBoardCursor(A.parse(fx('magazine-front.html'), ctx(encodeBoardCursor({ q: [], last: '3963' }))).nextCursor)
  t('목록 증분: last 이후 3건(큰 id 먼저)', inc.q.join(','), '/magazine/detail/3968/,/magazine/detail/3967/,/magazine/detail/3966/')
  const again = A.parse(fx('magazine-front.html'), ctx(encodeBoardCursor({ q: [], last: '3968' })))
  t('목록 재실행: 새 기사 0 = 실패 아님 + pauseRun', `${decodeBoardCursor(again.nextCursor).q.length}/${again.parseFailures}/${again.pauseRun}`, '0/0/true')
  t('목록: CSR 분류 목록(링크 0) = 실패 1', A.parse(fx('list-startup-csr.html'), ctx()).parseFailures, 1)
}

// ── 기사 ───────────────────────────────────────────────────────────
{
  const r = A.parse(fx('detail-3783.html'), qctx('3783'))
  t('기사: 1건 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '1/0')
  t('기사: externalId', r.reviews[0].externalId, '/magazine/detail/3783/')
  ok('기사: 제목 + 본문', r.reviews[0].text.startsWith('이제 AI에게 매번 설명하지 않아도 됩니다') && r.reviews[0].text.length > 7000)
  t('기사: 작성일(+09:00 원문 그대로 KST)', r.reviews[0].writtenAt, '2026-06-04')
  t('기사: 다른 기사가 오면 실패 1 · 0건', JSON.stringify(((x) => [x.reviews.length, x.parseFailures])(A.parse(fx('detail-3783.html'), qctx('378')))), '[0,1]')
  t('기사: JSON-LD 소실 = 실패 1', A.parse(fx('detail-3783.html').replace('"NewsArticle"', '"WebPage"'), qctx('3783')).parseFailures, 1)
  t('기사: articleBody 소실 = 실패 1', A.parse(fx('detail-3783.html').replace('"articleBody"', '"x"'), qctx('3783')).parseFailures, 1)
}

// ── 러너와 붙인 경계면 — Crawl-delay 5 가 DB 간격보다 크면 러너가 5초를 쓴다 ──
function harness(pages, minIntervalMs) {
  const log = { saves: [], health: null, slept: 0, cursor: null }
  let clock = Date.parse('2026-09-30T03:00:00Z')
  const seen = new Set()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms; log.slept += ms },
    async fetchText(url) {
      clock += 10
      const u = new URL(url)
      if (u.pathname === '/robots.txt') return { status: 200, body: fx('robots.txt'), finalUrl: url }
      const p = pages[u.pathname]
      if (p === undefined) return { status: 404, body: 'not found', finalUrl: url }
      return typeof p === 'number' ? { status: p, body: 'blocked', finalUrl: url } : { status: 200, body: p, finalUrl: url }
    },
    store: {
      async loadSource() { return { key: 'yozm', enabled: true, minIntervalMs, dailyRequestCap: 40, requestsToday: 0 } },
      async listDueTargets() { return [target({ cursor: log.cursor })] },
      async saveTargetProgress(p) { log.saves.push(p) },
      async recordFingerprint(fp) { if (seen.has(fp.identityKey)) return 'duplicate'; seen.add(fp.identityKey); return 'new' },
      async appendInput() { return 'in' },
      async linkFingerprint() {},
      async updateSourceHealth(_k, v) { log.health = v },
    },
  }
  return { ports, log }
}
{
  const h = harness({ '/magazine/detail/3783/': fx('detail-3783.html'), '/magazine/': fx('magazine-front.html') }, 1000)
  h.log.cursor = encodeBoardCursor({ q: ['/magazine/detail/3783/', '/magazine/detail/3783/'], last: '3968' })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너: 요청 2 · 신규 1(두 번째는 중복)', `${r.requests}/${r.stats.newReviews}`, '2/1')
  ok('러너: robots Crawl-delay 5초가 DB 간격 1초를 이긴다', h.log.slept >= 5000 - 100)
}
{
  const h = harness({ '/magazine/': 403 }, 6000)
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('403: 요청 1건 뒤 중단 + 고장 판정(review_sources 에는 안 씀)', `${r.requests}/${r.stats.blockedResponses}/${r.health?.disable}/${h.log.health}`, '1/1/true/null')
}

console.log(`review-yozm-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
