#!/usr/bin/env node
// dev.to(devto) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크·DB 없음.
//
// 픽스처는 2026-09-30 에 우리 UA 로 실제로 받은 응답이다(fixtures/review/devto/, user 객체만 가렸다):
//   robots.txt               200 · `*` 는 /search?q=·/admin/ 등만 Disallow
//   list-saas.json           /api/articles?tag=saas&per_page=5 · 5건 · 댓글 0
//   list-saas-top.json       /api/articles?tag=saas&top=30&per_page=3 · 3건 · 댓글 1·2·6
//   article-4773546.json     /api/articles/4773546 · body_markdown 4,461자
//   comments-4590483.json    /api/comments?a_id=4590483 · 최상위 6건
//
// ⚠️ 마지막 블록은 실제 러너와 붙여 돈다(§7.1 사례 5).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { devtoAdapter as A, HOST } from '../lib/review/adapters/devto.ts'
import { decodeBoardCursor, encodeBoardCursor, BOARD_QUEUE_MAX } from '../lib/review/types.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'devto', n), 'utf8')

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
  id: 't1', projectId: 'p1', sourceKey: 'devto', productRef: 'board:saas',
  cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over,
})
const ctx = (cursor = null) => ({ productRef: 'board:saas', cursor, lastReviewAt: null })

// ── robots — 실측 원문을 리포 파서로 ─────────────────────────────
{
  const g = parseRobots(fx('robots.txt'))
  t('robots: /api/articles 허용', robotsVerdict(g, '/api/articles', PRODUCT_TOKEN).state, 'allowed')
  t('robots: /api/articles/<id> 허용', robotsVerdict(g, '/api/articles/4773546', PRODUCT_TOKEN).state, 'allowed')
  t('robots: /api/comments 허용', robotsVerdict(g, '/api/comments', PRODUCT_TOKEN).state, 'allowed')
  t('robots: /admin/x 금지(파서가 규칙을 읽었다는 음성 대조)', robotsVerdict(g, '/admin/x', PRODUCT_TOKEN).state, 'disallowed')
}

// ── 등록 경로 ──────────────────────────────────────────────────────
t('ref: board:saas', buildProductRef('devto', 'board:saas')?.productRef, 'board:saas')
t('ref: 모르는 태그 거부', buildProductRef('devto', 'board:javascript')?.ok, false)
t('ref: url: 형태 거부(게시판 전용)', buildProductRef('devto', 'https://dev.to/x/y')?.ok, false)

// ── nextRequest ────────────────────────────────────────────────────
t('next: 첫 요청은 태그 목록', A.nextRequest(target())?.url, `${HOST}/api/articles?tag=saas&per_page=30`)
t('next: 모르는 게시판은 요청 0', A.nextRequest(target({ productRef: 'board:x' })), null)
t('next: url: 타깃은 요청 0', A.nextRequest(target({ productRef: 'url:/x/y' })), null)
t('next: 큐 머리(본문)', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/api/articles/1'], last: '1' }) }))?.url, `${HOST}/api/articles/1`)
t('next: 큐 머리(댓글)', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/api/comments?a_id=1'], last: '1' }) }))?.url, `${HOST}/api/comments?a_id=1`)
t('next: 오염된 큐는 요청 0', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['//evil.example/x'], last: null }) })), null)
t('next: 다른 쿼리 붙은 댓글 경로 거부', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/api/comments?a_id=1&x=2'], last: null }) })), null)

// ── 목록 ───────────────────────────────────────────────────────────
{
  const r = A.parse(fx('list-saas.json'), ctx())
  const c = decodeBoardCursor(r.nextCursor)
  t('목록: 리뷰 0 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '0/0')
  t('목록: 댓글 0 글은 본문만 5건', c.q.join(','), '/api/articles/4773546,/api/articles/4773582,/api/articles/4773169,/api/articles/4772597,/api/articles/4772982')
  t('목록: last 는 최대 id', c.last, '4773582')
  t('목록: pauseRun 아님', r.pauseRun, false)

  const top = decodeBoardCursor(A.parse(fx('list-saas-top.json'), ctx()).nextCursor)
  t('목록: 댓글 있는 글은 본문 뒤에 댓글 경로', top.q.join(','),
    '/api/articles/4636147,/api/comments?a_id=4636147,/api/articles/4580222,/api/comments?a_id=4580222,/api/articles/4590483,/api/comments?a_id=4590483')

  const again = A.parse(fx('list-saas.json'), ctx(encodeBoardCursor({ q: [], last: '4773582' })))
  t('목록 재실행: 새 글 0 = 실패 아님 + pauseRun', `${decodeBoardCursor(again.nextCursor).q.length}/${again.parseFailures}/${again.pauseRun}`, '0/0/true')

  // 큐 상한은 요청 수 기준 — 댓글 경로까지 합쳐 19 를 넘지 않는다
  const many = JSON.stringify(Array.from({ length: 15 }, (_, i) => ({ id: 1000 + i, comments_count: 3, published_at: '2026-09-29T00:00:00Z' })))
  t(`목록: 큐 상한 ${BOARD_QUEUE_MAX}`, decodeBoardCursor(A.parse(many, ctx()).nextCursor).q.length, BOARD_QUEUE_MAX)

  t('목록: JSON 아님(HTML·챌린지) = 실패 1', A.parse('<html>Just a moment...</html>', ctx()).parseFailures, 1)
  t('목록: 에러 객체 = 실패 1', A.parse('{"error":"rate limited","status":429}', ctx()).parseFailures, 1)
  t('목록: id 없는 항목은 실패로 센다', A.parse('[{"title":"x"}]', ctx()).parseFailures, 1)
}

// ── 본문 ───────────────────────────────────────────────────────────
const qctx = (p) => ctx(encodeBoardCursor({ q: [p], last: '9' }))
{
  const r = A.parse(fx('article-4773546.json'), qctx('/api/articles/4773546'))
  t('본문: 1건 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '1/0')
  t('본문: externalId', r.reviews[0].externalId, 'article:4773546')
  ok('본문: 제목 + 마크다운', r.reviews[0].text.startsWith('Password Reset UX') && r.reviews[0].text.length > 4000)
  // 2026-09-29T18:41:44Z → KST 2026-09-30 03:41
  t('본문: 작성일 KST', r.reviews[0].writtenAt, '2026-09-30')
  t('본문: 작성자 미저장', r.reviews[0].authorMasked, null)
  t('본문: 큐가 비면 pauseRun', r.pauseRun, true)
  t('본문: 다른 글이 오면 실패 1 · 0건', JSON.stringify(((x) => [x.reviews.length, x.parseFailures])(A.parse(fx('article-4773546.json'), qctx('/api/articles/1')))), '[0,1]')
  t('본문: 404 JSON = 실패 1', A.parse('{"error":"not found","status":404}', qctx('/api/articles/4773546')).parseFailures, 1)
  const noBody = JSON.stringify({ ...JSON.parse(fx('article-4773546.json')), body_markdown: undefined })
  t('본문: body_markdown 소실 = 실패 1', A.parse(noBody, qctx('/api/articles/4773546')).parseFailures, 1)
}

// ── 댓글 ───────────────────────────────────────────────────────────
{
  const r = A.parse(fx('comments-4590483.json'), qctx('/api/comments?a_id=4590483'))
  t('댓글: 6건 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '6/0')
  t('댓글: externalId', r.reviews[0].externalId, 'article:4590483#3e8ed')
  t('댓글: storyId 는 글 id', r.reviews[0].storyId, '4590483')
  ok('댓글: 태그가 남지 않는다', r.reviews.every((x) => !/<[a-z/]/i.test(x.text)))
  ok('댓글: 작성자 미저장', r.reviews.every((x) => x.authorMasked === null))

  // 대댓글 평탄화 + 삭제된 댓글은 건너뛴다(실패 아님)
  const tree = JSON.parse(fx('comments-4590483.json'))
  tree[0].children = [{ id_code: 'aa1', created_at: '2026-09-07T00:00:00Z', body_html: '<p>reply</p>', children: [] }, { id_code: 'aa2', body_html: '<p>[deleted]</p>', children: [] }]
  const n = A.parse(JSON.stringify(tree), qctx('/api/comments?a_id=4590483'))
  t('댓글: 대댓글 포함 7건 · 삭제 댓글 제외 · 실패 0', `${n.reviews.length}/${n.parseFailures}`, '7/0')
  t('댓글: 배열 아님 = 실패 1', A.parse('{"error":"x"}', qctx('/api/comments?a_id=1')).parseFailures, 1)
  t('댓글: body_html 소실 = 실패로 센다', A.parse('[{"id_code":"x1","children":[]}]', qctx('/api/comments?a_id=1')).parseFailures, 1)
}

// ── 러너와 붙인 경계면 ─────────────────────────────────────────────
function harness(pages) {
  const log = { fetched: [], saves: [], health: null, slept: 0, cursor: null }
  let clock = Date.parse('2026-09-30T03:00:00Z')
  const seen = new Set()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms; log.slept += ms },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      const u = new URL(url)
      if (u.pathname === '/robots.txt') return { status: 200, body: fx('robots.txt'), finalUrl: url }
      const p = pages[u.pathname + u.search]
      if (p === undefined) return { status: 404, body: '{"error":"not found"}', finalUrl: url }
      return typeof p === 'number' ? { status: p, body: 'blocked', finalUrl: url } : { status: 200, body: p, finalUrl: url }
    },
    store: {
      async loadSource() { return { key: 'devto', enabled: true, minIntervalMs: 6000, dailyRequestCap: 100, requestsToday: 0 } },
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
  const h = harness({ '/api/articles/4773546': fx('article-4773546.json'), '/api/comments?a_id=4590483': fx('comments-4590483.json') })
  h.log.cursor = encodeBoardCursor({ q: ['/api/articles/4773546', '/api/comments?a_id=4590483'], last: '4773582' })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너: 요청 2건(본문 1 + 댓글 1)', r.requests, 2)
  t('러너: 신규 7건', r.stats.newReviews, 7)
  t('러너: 파싱 실패 0', r.stats.parseFailures, 0)
  t('러너: 타깃은 닫히지 않는다', h.log.saves.at(-1).status, 'active')
  t('러너: last 유지', decodeBoardCursor(h.log.saves.at(-1).cursor).last, '4773582')
  ok('러너: 요청 간격 6초', h.log.slept >= 6000 - 100)
}
{
  const h = harness({ '/api/articles?tag=saas&per_page=30': 403 })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('403: 요청 1건 뒤 중단 + 소스 끔', `${r.requests}/${r.stats.blockedResponses}/${h.log.health?.disable}`, '1/1/true')
}

console.log(`review-devto-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
