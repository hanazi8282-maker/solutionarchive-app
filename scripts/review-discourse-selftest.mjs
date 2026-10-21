#!/usr/bin/env node
// 범용 Discourse 어댑터(n8n_community) 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크·DB 없음.
// 픽스처(fixtures/review/discourse/): robots 는 2026-10-14 실측 원문, 나머지(categories·기능 요청 목록·토픽)는 실측 JSON 구조를 유지하고 제목·본문·작성자를 가짜로 바꾼 것이다(공개 리포 · v70 §10).
// ⚠️ 마지막 블록은 실제 러너와 붙여 돈다(§7.1 사례 5).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  n8nCommunityAdapter as A, makeDiscourseAdapter, N8N_COMMUNITY_HOST as HOST,
  makeCommunityAdapter, bubbleForumAdapter, retoolCommunityAdapter, glideCommunityAdapter, softrCommunityAdapter,
} from '../lib/review/adapters/discourse.ts'
import { decodeBoardCursor, encodeBoardCursor } from '../lib/review/types.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'discourse', n), 'utf8')
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
const target = (over = {}) => ({ id: 't1', projectId: 'p1', sourceKey: 'n8n_community', productRef: 'board:feature-requests', cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over })
const ctx = (cursor = null) => ({ productRef: 'board:feature-requests', cursor, lastReviewAt: null })

// ── robots — 실측 원문을 리포 파서로
{
  const g = parseRobots(fx('n8n-robots.txt'))
  for (const p of ['/latest.json', '/c/feature-requests/5.json', '/t/321096.json']) t(`robots: ${p} 허용`, robotsVerdict(g, p, PRODUCT_TOKEN).state, 'allowed')
  t('robots: /search 금지(음성 대조)', robotsVerdict(g, '/search', PRODUCT_TOKEN).state, 'disallowed')
  t('robots: /c/x.rss 금지 — 우리는 RSS 를 쓰지 않는다', robotsVerdict(g, '/c/feature-requests.rss', PRODUCT_TOKEN).state, 'disallowed')
}

// ── Fable #3: 200 인데 JSON 이 아니면 차단으로 즉시 중단
t('abortOnChallenge: 켜져 있다', A.abortOnChallenge, true)
t('isChallenge: HTML 은 챌린지', A.isChallenge('<html>Just a moment</html>'), true)
t('isChallenge: JSON 객체는 정상', A.isChallenge(' {"topic_list":{}}'), false)

// ── 등록 경로·nextRequest
t('ref: board:feature-requests', buildProductRef('n8n_community', 'board:feature-requests')?.productRef, 'board:feature-requests')
t('ref: 모르는 게시판 거부', buildProductRef('n8n_community', 'board:nope')?.ok, false)
t('ref: url: 형태 거부', buildProductRef('n8n_community', 'https://community.n8n.io/t/1')?.ok, false)
t('next: 첫 요청은 기능 요청 목록', A.nextRequest(target())?.url, `${HOST}/c/feature-requests/5.json?order=created`)
t('next: questions', A.nextRequest(target({ productRef: 'board:questions' }))?.url, `${HOST}/c/questions/12.json?order=created`)
t('next: 모르는 게시판은 요청 0', A.nextRequest(target({ productRef: 'board:x' })), null)
t('next: 큐 머리(토픽)', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/t/5.json'], last: '5' }) }))?.url, `${HOST}/t/5.json`)
t('next: 오염된 큐는 요청 0', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['//evil.example/x'], last: null }) })), null)
t('next: 쿼리 붙은 토픽 경로 거부', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/t/5.json?api_key=x'], last: null }) })), null)
{
  const other = makeDiscourseAdapter({ key: 'other', displayName: 'o', host: 'https://forum.example.com', boards: { a: '/latest.json' } })
  t('팩토리: 호스트는 인자(상수)', other.nextRequest(target({ productRef: 'board:a' }))?.url, 'https://forum.example.com/latest.json')
}

// ── v70 D3: 같은 구조의 포럼 5곳 — 첫 요청 URL · 등록 경로 · 키 · 호스트
for (const [ad, key, ref, url] of [
  [makeCommunityAdapter, 'make_community', 'board:questions', 'https://community.make.com/c/questions/66.json?order=created'],
  [makeCommunityAdapter, 'make_community', 'board:beginner-questions', 'https://community.make.com/c/beginner-questions/65.json?order=created'],
  [bubbleForumAdapter, 'bubble_forum', 'board:idea', 'https://forum.bubble.io/c/idea/7.json?order=created'],
  [bubbleForumAdapter, 'bubble_forum', 'board:help', 'https://forum.bubble.io/c/help/5.json?order=created'],
  [retoolCommunityAdapter, 'retool_community', 'board:feature-requests', 'https://community.retool.com/c/feature-requests/7.json?order=created'],
  [retoolCommunityAdapter, 'retool_community', 'board:app-building', 'https://community.retool.com/c/app-building/5.json?order=created'],
  [glideCommunityAdapter, 'glide_community', 'board:feature-requests', 'https://community.glideapps.com/c/feature-requests/9.json?order=created'],
  [glideCommunityAdapter, 'glide_community', 'board:help-how-to', 'https://community.glideapps.com/c/help-how-to/27.json?order=created'],
  [softrCommunityAdapter, 'softr_community', 'board:feature-requests', 'https://community.softr.io/c/feature-requests/8.json?order=created'],
  [softrCommunityAdapter, 'softr_community', 'board:ask-the-community', 'https://community.softr.io/c/ask-the-community/6.json?order=created'],
]) {
  t(`${key} ${ref}: 첫 요청`, ad.nextRequest(target({ sourceKey: key, productRef: ref }))?.url, url)
  t(`${key} ${ref}: 등록 경로`, buildProductRef(key, ref)?.productRef, ref)
  t(`${key}: 어댑터 key`, ad.key, key)
  t(`${key}: 다른 포럼의 게시판은 거부`, ad.nextRequest(target({ sourceKey: key, productRef: 'board:nope' })), null)
}

// ── 목록
{
  const r = A.parse(fx('n8n-featurereq-list.json'), ctx())
  const c = decodeBoardCursor(r.nextCursor)
  const idOf = (p) => Number(/\d+/.exec(p)[0])
  t('목록: 리뷰 0 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '0/0')
  t('목록: 큐 상한 19', c.q.length, 19)
  ok('목록: 큐는 id 내림차순(최신 먼저)', c.q.every((p, i) => i === 0 || idOf(p) < idOf(c.q[i - 1])))
  ok('목록: last 는 최대 id', Number(c.last) >= idOf(c.q[0]))
  t('목록: pauseRun 아님', r.pauseRun, false)
  const again = A.parse(fx('n8n-featurereq-list.json'), ctx(encodeBoardCursor({ q: [], last: c.last })))
  t('목록 재실행: 새 글 0 = 실패 아님 + pauseRun', `${decodeBoardCursor(again.nextCursor).q.length}/${again.parseFailures}/${again.pauseRun}`, '0/0/true')
  t('목록: HTML(챌린지) = 실패 1', A.parse('<html>Just a moment</html>', ctx()).parseFailures, 1)
  t('목록: topic_list 없는 JSON = 실패 1', A.parse('{"errors":["rate limited"]}', ctx()).parseFailures, 1)
  t('목록: id 없는 항목은 실패로 센다', A.parse('{"topic_list":{"topics":[{"title":"x"}]}}', ctx()).parseFailures, 1)
}

// ── 토픽
const qctx = (p) => ctx(encodeBoardCursor({ q: [p], last: '9' }))
{
  const r = A.parse(fx('n8n-topic.json'), qctx('/t/321096.json'))
  t('토픽: 7게시글 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '7/0')
  ok('토픽: 첫 글은 제목 + 본문', r.reviews[0].text.startsWith('Sample topic about OAuth') && r.reviews[0].text.length > 100)
  ok('토픽: externalId topic:<id>#<postId>', /^topic:321096#\d+$/.test(r.reviews[0].externalId))
  t('토픽: 작성자 미저장(v70 §10)', r.reviews.every((x) => x.authorMasked === null && x.seller === null), true)
  ok('토픽: 결과에 작성자 핸들(opuser)이 없다 — 멘션은 @user 로', !JSON.stringify(r.reviews).includes('opuser') && r.reviews[1].text.includes('@user'))
  t('토픽: 큐가 비면 pauseRun', r.pauseRun, true)
  t('토픽: 다른 토픽이 오면 실패 1 · 0건', JSON.stringify(((x) => [x.reviews.length, x.parseFailures])(A.parse(fx('n8n-topic.json'), qctx('/t/1.json')))), '[0,1]')
  t('토픽: 에러 JSON = 실패 1', A.parse('{"error":"not found"}', qctx('/t/321096.json')).parseFailures, 1)
  const t0 = JSON.parse(fx('n8n-topic.json'))
  t0.post_stream.posts[1].hidden = true
  t0.post_stream.posts[2].post_type = 3
  t0.post_stream.posts[3].deleted_at = '2026-10-14T00:00:00Z'
  const skipped = A.parse(JSON.stringify(t0), qctx('/t/321096.json'))
  t('토픽: 숨김·조정자 액션·삭제 글은 건너뛴다(실패 아님)', `${skipped.reviews.length}/${skipped.parseFailures}`, '4/0')
}

// ── 러너와 붙인 경계면
function harness(pages, status = {}) {
  const log = { fetched: [], saves: [], health: null, slept: 0, cursor: null }
  let clock = Date.parse('2026-10-14T03:00:00Z')
  const seen = new Set()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms; log.slept += ms },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      const u = new URL(url)
      if (u.pathname === '/robots.txt') return { status: 200, body: fx('n8n-robots.txt'), finalUrl: url }
      const p = pages[u.pathname + u.search]
      if (p === undefined) return { status: 404, body: '{"error":"not found"}', finalUrl: url }
      return typeof p === 'number' ? { status: p, body: 'blocked', finalUrl: url } : { status: 200, body: p, finalUrl: url }
    },
    store: {
      async loadSource() { return { key: 'n8n_community', enabled: true, minIntervalMs: 6000, dailyRequestCap: 100, requestsToday: 0, ...status } },
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
  const h = harness({ '/t/321096.json': fx('n8n-topic.json') })
  h.log.cursor = encodeBoardCursor({ q: ['/t/321096.json'], last: '321100' })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너: 요청 1건', r.requests, 1)
  t('러너: 신규 7건', r.stats.newReviews, 7)
  t('러너: 파싱 실패 0', r.stats.parseFailures, 0)
  t('러너: 타깃은 닫히지 않는다(incrementalOnly)', h.log.saves.at(-1).status, 'active')
  t('러너: last 유지', decodeBoardCursor(h.log.saves.at(-1).cursor).last, '321100')
}
{
  const h = harness({ '/c/feature-requests/5.json?order=created': 403 })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('403: 요청 1건 뒤 중단(우회 없음) + 고장 판정', `${r.requests}/${r.stats.blockedResponses}/${r.health?.disable}`, '1/1/true')
}
{
  const h = harness({ '/c/feature-requests/5.json?order=created': '<html><title>Just a moment...</title></html>' })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('200 HTML(챌린지): 요청 1건 뒤 차단으로 중단', `${r.requests}/${r.stats.blockedResponses}`, '1/1')
}
{
  const h = harness({ '/c/feature-requests/5.json?order=created': '' })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('200 빈 응답: 차단으로 중단', `${r.requests}/${r.stats.blockedResponses}`, '1/1')
}
{
  // 상한 1 = 목록 1요청만. 예전에는 큐 첫 토픽의 404(가짜 서버에 없는 경로)가 타깃을 failed 로 닫아 큐가 19 로 남았다 —
  // v71ba 부터 게시판 큐 404 는 그 글만 빼고 다음으로 가므로(runner defaultBoardSkipNotFound) 목록만 받게 묶어 같은 것을 본다.
  const h = harness({ '/c/feature-requests/5.json?order=created': fx('n8n-featurereq-list.json') }, { dailyRequestCap: 1 })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너: 목록 요청 · 큐 19건 적재', `${r.requests >= 1}/${decodeBoardCursor(h.log.saves.at(-1).cursor).q.length}`, 'true/19')
}

console.log(`review-discourse-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
