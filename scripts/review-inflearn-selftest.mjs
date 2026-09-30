#!/usr/bin/env node
// 인프런(inflearn) 커뮤니티 질문&답변 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크·DB 없음.
//
// 픽스처는 2026-09-30 에 우리 UA 로 실제로 받은 페이지다(fixtures/review/inflearn/, 스크립트·svg 를 걷고 작성자 이름을 가렸다):
//   robots.txt              200 · `*` 는 /community 를 막지 않는다(복수 태그 쿼리만 Disallow)
//   questions-list.html     /community/questions · <article> 20건 · 숫자 id 1876214~1876624
//   question-1876492.html   /community/questions/1876492/<slug> · JSON-LD QAPage · 답변 1(AI 인턴)
//
// ⚠️ 마지막 블록은 실제 러너와 붙여 돈다(§7.1 사례 5).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflearnAdapter as A, HOST } from '../lib/review/adapters/inflearn.ts'
import { decodeBoardCursor, encodeBoardCursor, BOARD_QUEUE_MAX } from '../lib/review/types.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'inflearn', n), 'utf8')

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
  id: 't1', projectId: 'p1', sourceKey: 'inflearn', productRef: 'board:questions',
  cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over,
})
const ctx = (cursor = null) => ({ productRef: 'board:questions', cursor, lastReviewAt: null })
const qctx = (id) => ctx(encodeBoardCursor({ q: [`/community/questions/${id}`], last: '9' }))

// ── robots ─────────────────────────────────────────────────────────
{
  const g = parseRobots(fx('robots.txt'))
  t('robots: 목록 허용', robotsVerdict(g, '/community/questions', PRODUCT_TOKEN).state, 'allowed')
  t('robots: 글 허용', robotsVerdict(g, '/community/questions/1876492', PRODUCT_TOKEN).state, 'allowed')
  t('robots: /api 금지(음성 대조)', robotsVerdict(g, '/api/x', PRODUCT_TOKEN).state, 'disallowed')
}

// ── 등록 경로 · nextRequest ───────────────────────────────────────
t('ref: board:questions', buildProductRef('inflearn', 'board:questions')?.productRef, 'board:questions')
t('ref: 모르는 게시판 거부', buildProductRef('inflearn', 'board:chats')?.ok, false)
t('next: 첫 요청은 목록', A.nextRequest(target())?.url, `${HOST}/community/questions`)
t('next: 큐 머리는 숫자 id 로 조립한 글', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/community/questions/1876492'], last: '1' }) }))?.url, `${HOST}/community/questions/1876492`)
t('next: slug 붙은 경로는 거부(조립한 것만)', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/community/questions/1/x'], last: null }) })), null)
t('next: 오염된 큐는 요청 0', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['//evil.example/x'], last: null }) })), null)
t('next: 모르는 게시판은 요청 0', A.nextRequest(target({ productRef: 'board:x' })), null)

// ── 목록 ───────────────────────────────────────────────────────────
{
  const r = A.parse(fx('questions-list.html'), ctx())
  const c = decodeBoardCursor(r.nextCursor)
  t('목록: 리뷰 0 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '0/0')
  t(`목록: 큐 ${BOARD_QUEUE_MAX}개(20건 중 상한)`, c.q.length, BOARD_QUEUE_MAX)
  t('목록: 큐 머리는 최대 id', c.q[0], '/community/questions/1876624')
  t('목록: last 는 최대 id', c.last, '1876624')
  ok('목록: 큐는 전부 조립 경로', c.q.every((p) => /^\/community\/questions\/\d+$/.test(p)))
  const inc = decodeBoardCursor(A.parse(fx('questions-list.html'), ctx(encodeBoardCursor({ q: [], last: '1876574' }))).nextCursor)
  t('목록 증분: last 이후 2건', inc.q.join(','), '/community/questions/1876624,/community/questions/1876618')
  const again = A.parse(fx('questions-list.html'), ctx(encodeBoardCursor({ q: [], last: '1876624' })))
  t('목록 재실행: 새 글 0 = 실패 아님 + pauseRun', `${decodeBoardCursor(again.nextCursor).q.length}/${again.parseFailures}/${again.pauseRun}`, '0/0/true')
  t('목록: 링크 0개(마크업 변경·챌린지) = 실패 1', A.parse('<html><body>Just a moment...</body></html>', ctx()).parseFailures, 1)
  // lastReviewAt 이후만 — 목록 <time> 을 읽는다(1876214 는 09-29 KST 이전 글이 아니므로 모두 통과해야 한다)
  const old = decodeBoardCursor(A.parse(fx('questions-list.html'), { productRef: 'board:questions', cursor: null, lastReviewAt: '2026-09-30' }).nextCursor)
  ok('목록: 날짜 기준선보다 오래된 글은 거른다', old.q.length < BOARD_QUEUE_MAX)
}

// ── 글 ─────────────────────────────────────────────────────────────
{
  const r = A.parse(fx('question-1876492.html'), qctx('1876492'))
  t('글: 질문 1건 · AI 답변 제외 · 실패 0', `${r.reviews.length}/${r.parseFailures}/${r.filtered}`, '1/0/1')
  t('글: externalId', r.reviews[0].externalId, '/community/questions/1876492')
  ok('글: 제목 + 본문', r.reviews[0].text.startsWith('claude는 프로젝트 안에서') && r.reviews[0].text.includes('권한을 취소해야'))
  // 2026-09-29T13:53:52Z → KST 2026-09-29 22:53
  t('글: 작성일 KST', r.reviews[0].writtenAt, '2026-09-29')
  t('글: 작성자 미저장', r.reviews[0].authorMasked, null)
  t('글: 큐가 비면 pauseRun', r.pauseRun, true)

  // 사람 답변은 받는다 — AI 답변 자리에 사람 이름을 넣어 본다
  const human = fx('question-1876492.html').replace('"name":"인프런 AI 인턴"', '"name":"수강생"')
  const h = A.parse(human, qctx('1876492'))
  t('글: 사람 답변 포함 2건', `${h.reviews.length}/${h.filtered}`, '2/0')
  t('글: 답변 externalId 는 focusComment', h.reviews[1].externalId, '/community/questions/1876492#618446')

  t('다른 글 응답(canonical id 불일치) = 실패 1 · 0건', JSON.stringify(((x) => [x.reviews.length, x.parseFailures])(A.parse(fx('question-1876492.html'), qctx('1876214')))), '[0,1]')
  t('canonical 없음(로그인 벽 형태) = 실패 1', A.parse(fx('question-1876492.html').replace(/<link rel="canonical"[^>]*>/, ''), qctx('1876492')).parseFailures, 1)
  t('JSON-LD 소실 = 실패 1', A.parse(fx('question-1876492.html').replace('"QAPage"', '"WebPage"'), qctx('1876492')).parseFailures, 1)
  t('답변 url 소실 = 실패로 센다', A.parse(fx('question-1876492.html').replace(/"url":"[^"]*focusComment=\d+"/, '"url":"x"'), qctx('1876492')).parseFailures, 1)
}

// ── 러너와 붙인 경계면 ─────────────────────────────────────────────
function harness(pages) {
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
      // 실서버는 slug 없는 주소를 307 로 slug 주소로 보낸다 — finalUrl 이 같은 호스트의 다른 경로다.
      return typeof p === 'number' ? { status: p, body: 'blocked', finalUrl: url } : { status: 200, body: p, finalUrl: `${url}/slug` }
    },
    store: {
      async loadSource() { return { key: 'inflearn', enabled: true, minIntervalMs: 6000, dailyRequestCap: 60, requestsToday: 0 } },
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
  const h = harness({ '/community/questions/1876492': fx('question-1876492.html') })
  h.log.cursor = encodeBoardCursor({ q: ['/community/questions/1876492'], last: '1876624' })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너: 요청 1 · 신규 1 · 실패 0', `${r.requests}/${r.stats.newReviews}/${r.stats.parseFailures}`, '1/1/0')
  t('러너: 타깃은 닫히지 않는다', h.log.saves.at(-1).status, 'active')
}
{
  const h = harness({ '/community/questions': 403 })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('403: 요청 1건 뒤 중단 + 소스 끔', `${r.requests}/${r.stats.blockedResponses}/${h.log.health?.disable}`, '1/1/true')
}

console.log(`review-inflearn-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
