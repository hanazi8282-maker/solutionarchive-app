#!/usr/bin/env node
// 디시인사이드·루리웹 어댑터 셀프테스트(v71cu S5b) — 저장한 픽스처로만 돈다. 네트워크·DB 없음.
// 픽스처(fixtures/review/{dcinside,ruliweb}/): robots 는 2026-11-19 실측 원문, 나머지는 실측 마크업 구조에 가짜 제목·본문·닉네임을 넣은 것(공개 리포 · v70 §10).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dcinsideAdapter as DC, DCINSIDE_HOST } from '../lib/review/adapters/dcinside.ts'
import { ruliwebAdapter as RL, RULIWEB_HOST } from '../lib/review/adapters/ruliweb.ts'
import { decodeBoardCursor, encodeBoardCursor } from '../lib/review/types.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (d, n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', d, n), 'utf8')
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
const target = (sourceKey, productRef, cursor = null) => ({ id: 't1', projectId: 'p1', sourceKey, productRef, cursor, lastReviewAt: null, consecutiveEmpty: 0 })
const ctx = (productRef, cursor = null) => ({ productRef, cursor, lastReviewAt: null })

// ── robots(실측 원문)
{
  const g = parseRobots(fx('dcinside', 'robots.txt'))
  t('dc robots: programming 목록 허용', robotsVerdict(g, '/board/lists/', PRODUCT_TOKEN).state, 'allowed')
  t('dc robots: 글 보기 허용', robotsVerdict(g, '/board/view/', PRODUCT_TOKEN).state, 'allowed')
  t('dc robots: 금지 갤러리 47 은 금지(음성 대조)', robotsVerdict(g, '/board/lists/?id=47', PRODUCT_TOKEN).state, 'disallowed')
  ok('dc robots: 표의 갤러리는 Disallow 목록에 없다', !/id=programming\b/.test(fx('dcinside', 'robots.txt')))
  const r = parseRobots(fx('ruliweb', 'robots.txt'))
  t('ruliweb robots: 쿼리 없는 게시판 허용', robotsVerdict(r, '/community/board/300143', PRODUCT_TOKEN).state, 'allowed')
  t('ruliweb robots: 글 읽기 허용', robotsVerdict(r, '/community/board/300143/read/1', PRODUCT_TOKEN).state, 'allowed')
  t('ruliweb robots: 분류 쿼리는 금지(음성 대조)', robotsVerdict(r, '/community/board/300143?cate=309', PRODUCT_TOKEN).state, 'disallowed')
}

// ── 공통: 챌린지·등록
for (const [A, key, ref] of [[DC, 'dcinside', 'board:programming'], [RL, 'ruliweb', 'board:humor']]) {
  t(`${key}: abortOnChallenge`, A.abortOnChallenge, true)
  t(`${key}: Cloudflare 챌린지는 챌린지`, A.isChallenge('<title>Just a moment...</title>'), true)
  t(`${key}: 빈 응답은 챌린지`, A.isChallenge(''), true)
  t(`${key}: 정상 HTML 은 챌린지 아님`, A.isChallenge(fx(key, 'list.html')), false)
  t(`${key}: 등록 경로`, buildProductRef(key, ref)?.productRef, ref)
  t(`${key}: 모르는 게시판 거부`, buildProductRef(key, 'board:nope')?.ok, false)
  t(`${key}: 모르는 게시판은 요청 0`, A.nextRequest(target(key, 'board:nope')), null)
  t(`${key}: 오염된 큐는 요청 0`, A.nextRequest(target(key, ref, encodeBoardCursor({ q: ['//evil.example/x'], last: null }))), null)
  t(`${key}: 다른 호스트·쿼리 주입 큐 거부`, A.nextRequest(target(key, ref, encodeBoardCursor({ q: ['/x?id=47'], last: null }))), null)
}

// ── 디시 목록·글
{
  t('dc next: 첫 요청', DC.nextRequest(target('dcinside', 'board:programming'))?.url, `${DCINSIDE_HOST}/board/lists/?id=programming`)
  const r = DC.parse(fx('dcinside', 'list.html'), ctx('board:programming'))
  const c = decodeBoardCursor(r.nextCursor)
  t('dc 목록: 공지·설문 제외, 글 3건 큐(최신 먼저)', c.q.join(','), '/board/view/?id=programming&no=2900003,/board/view/?id=programming&no=2900002,/board/view/?id=programming&no=2900001')
  t('dc 목록: last = 최대 id', c.last, '2900003')
  t('dc 목록: 실패 0 · pauseRun 아님', `${r.parseFailures}/${r.pauseRun}`, '0/false')
  const again = DC.parse(fx('dcinside', 'list.html'), ctx('board:programming', encodeBoardCursor({ q: [], last: c.last })))
  t('dc 재실행: 새 글 0 = 실패 아님 + pauseRun', `${again.parseFailures}/${again.pauseRun}`, '0/true')
  t('dc 목록: 글 행 0개 = 실패 1', DC.parse('<html>blocked</html>', ctx('board:programming')).parseFailures, 1)
  t('dc next: 큐 머리', DC.nextRequest(target('dcinside', 'board:programming', r.nextCursor))?.url, `${DCINSIDE_HOST}${c.q[0]}`)

  const q = encodeBoardCursor({ q: [c.q[0]], last: '1' })
  const p = DC.parse(fx('dcinside', 'post.html'), ctx('board:programming', q))
  t('dc 글: 1건 · 실패 0', `${p.reviews.length}/${p.parseFailures}`, '1/0')
  ok('dc 글: 제목+본문', p.reviews[0].text.startsWith('샘플 제목: 결제 모듈 추천 좀\n\n구독 결제를') && p.reviews[0].text.includes('정기결제 실패'))
  t('dc 글: 작성일', p.reviews[0].writtenAt, '2026-11-19')
  t('dc 글: 작성자 미저장', p.reviews[0].authorMasked === null && p.reviews[0].seller === null, true)
  ok('dc 글: 닉네임·이메일이 결과에 없다(@user·[email] 치환)', !JSON.stringify(p.reviews).includes('가짜닉') && !JSON.stringify(p.reviews).includes('fake@') && p.reviews[0].text.includes('@user'))
  t('dc 글: 큐가 비면 pauseRun', p.pauseRun, true)
  const del = DC.parse(fx('dcinside', 'post-deleted.html'), ctx('board:programming', q))
  t('dc 지워진 글: 실패 아님 · missing', `${del.parseFailures}/${del.missing?.length}`, '0/1')
  t('dc 본문 컨테이너 없음 = 실패 1', DC.parse('<html><body>x</body></html>', ctx('board:programming', q)).parseFailures, 1)
}

// ── 루리웹 목록·글
{
  t('ruliweb next: 첫 요청(쿼리 없음)', RL.nextRequest(target('ruliweb', 'board:humor'))?.url, `${RULIWEB_HOST}/community/board/300143`)
  const r = RL.parse(fx('ruliweb', 'list.html'), ctx('board:humor'))
  const c = decodeBoardCursor(r.nextCursor)
  t('ruliweb 목록: 공지·타 게시판 베스트 제외, 글 3건', c.q.join(','), '/community/board/300143/read/500003,/community/board/300143/read/500002,/community/board/300143/read/500001')
  t('ruliweb 목록: last', c.last, '500003')
  t('ruliweb 목록: 실패 0', r.parseFailures, 0)
  t('ruliweb 목록: 글 행 0개 = 실패 1', RL.parse('<html>blocked</html>', ctx('board:humor')).parseFailures, 1)
  t('ruliweb next: 큐 머리', RL.nextRequest(target('ruliweb', 'board:humor', r.nextCursor))?.url, `${RULIWEB_HOST}${c.q[0]}`)
  const p = RL.parse(fx('ruliweb', 'post.html'), ctx('board:humor', encodeBoardCursor({ q: [c.q[0]], last: '1' })))
  t('ruliweb 글: 1건 · 실패 0', `${p.reviews.length}/${p.parseFailures}`, '1/0')
  ok('ruliweb 글: 제목+본문', p.reviews[0].text.startsWith('샘플 제목: 앱 구독료 너무 비싸다\n\n월 구독료가') && p.reviews[0].text.includes('해지 절차'))
  t('ruliweb 글: 작성일', p.reviews[0].writtenAt, '2026-11-19')
  ok('ruliweb 글: 닉네임이 결과에 없다 · 멘션은 @user', !JSON.stringify(p.reviews).includes('가짜닉') && p.reviews[0].text.includes('@user'))
  t('ruliweb 본문 컨테이너 없음 = 실패 1', RL.parse('<html>x</html>', ctx('board:humor', encodeBoardCursor({ q: [c.q[0]], last: '1' }))).parseFailures, 1)
}

// ── 러너와 붙인 경계면
function harness(A, key, robotsFx, pages, status = {}) {
  const log = { fetched: [], saves: [], health: null, cursor: null }
  let clock = Date.parse('2026-11-19T03:00:00Z')
  const seen = new Set()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      const u = new URL(url)
      if (u.pathname === '/robots.txt') return { status: 200, body: robotsFx, finalUrl: url }
      const p = pages[u.pathname + u.search]
      if (p === undefined) return { status: 404, body: 'nf', finalUrl: url }
      return typeof p === 'number' ? { status: p, body: 'blocked', finalUrl: url } : { status: 200, body: p, finalUrl: url }
    },
    store: {
      async loadSource() { return { key, enabled: true, minIntervalMs: 8000, dailyRequestCap: 40, requestsToday: 0, ...status } },
      async listDueTargets() { return [target(key, key === 'dcinside' ? 'board:programming' : 'board:humor', log.cursor)] },
      async saveTargetProgress(p) { log.saves.push(p) },
      async recordFingerprint(fp) { if (seen.has(fp.identityKey)) return 'duplicate'; seen.add(fp.identityKey); return 'new' },
      async appendInput() { return 'in' },
      async linkFingerprint() {},
      async updateSourceHealth(_k, v) { log.health = v },
    },
  }
  return { ports, log }
}
const DCL = '/board/lists/?id=programming'
const DCP = '/board/view/?id=programming&no=2900003'
const RLL = '/community/board/300143'
const RLP = '/community/board/300143/read/500003'
{
  // 소유자 예외: robots 가 금지인 소스(루리웹은 쿼리 규칙만 있어 허용) — override 로 disallowed 행을 통과하는지는 runner-selftest 가 본다.
  const h = harness(DC, 'dcinside', fx('dcinside', 'robots.txt'), { [DCP]: fx('dcinside', 'post.html') })
  h.log.cursor = encodeBoardCursor({ q: [DCP], last: '2900003' })
  const r = await runCollection(DC, { dryRun: false, targetLimit: 5 }, h.ports)
  t('dc 러너: 요청 1건 · 신규 1건 · 실패 0', `${r.requests}/${r.stats.newReviews}/${r.stats.parseFailures}`, '1/1/0')
  t('dc 러너: 타깃은 닫히지 않는다', h.log.saves.at(-1).status, 'active')
}
{
  const h = harness(RL, 'ruliweb', fx('ruliweb', 'robots.txt'), { [RLP]: fx('ruliweb', 'post.html') })
  h.log.cursor = encodeBoardCursor({ q: [RLP], last: '500003' })
  const r = await runCollection(RL, { dryRun: false, targetLimit: 5 }, h.ports)
  t('ruliweb 러너: 요청 1건 · 신규 1건 · 실패 0', `${r.requests}/${r.stats.newReviews}/${r.stats.parseFailures}`, '1/1/0')
}
for (const [A, key, rb, list] of [[DC, 'dcinside', 'dcinside', DCL], [RL, 'ruliweb', 'ruliweb', RLL]]) {
  let h = harness(A, key, fx(rb, 'robots.txt'), { [list]: 403 })
  let r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t(`${key} 403: 요청 1건 뒤 중단(우회 없음)`, `${r.requests}/${r.stats.blockedResponses}`, '1/1')
  h = harness(A, key, fx(rb, 'robots.txt'), { [list]: '<html><title>Just a moment...</title></html>' })
  r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t(`${key} 챌린지 200: 요청 1건 뒤 차단으로 중단`, `${r.requests}/${r.stats.blockedResponses}`, '1/1')
  h = harness(A, key, fx(rb, 'robots.txt'), { [list]: fx(rb, 'list.html') }, { dailyRequestCap: 1 })
  r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t(`${key} 러너: 목록 → 큐 3건 적재`, decodeBoardCursor(h.log.saves.at(-1).cursor).q.length, 3)
}

console.log(`review-robots4-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
