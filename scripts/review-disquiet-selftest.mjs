#!/usr/bin/env node
// 디스콰이엇(disquiet) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크·DB 없음.
//
// 픽스처는 2026-09-28 에 우리 UA 로 실제로 받은 페이지에서 svg·사이드바만 걷었다
// (fixtures/review/disquiet/, 본문·댓글·카드 마크업은 원본 그대로):
//   robots.txt              200 · Allow: / + Disallow: /passwordless
//   feed-list.html          홈 피드(/) · 카드 20건 · 숫자 id 6568→6549
//   post-with-reply.html    /posts/D1CXy9 · 본문 + 댓글 1 + 대댓글 1
//   post-one-comment.html   /posts/qaC6ZB · 본문 + 댓글 1
//   post-no-comments.html   /posts/OGCwVp · 본문 + 빈 #comments_list (정상 — 실패 아님)
//   post-not-found-404.html /posts/zzzzzz · Relate "Page not found"
//
// ⚠️ 마지막 블록은 실제 러너와 붙여 돈다(§7.1 사례 5 — 가짜 어댑터로만 보면 경계면 버그를 못 잡는다).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { disquietAdapter as A, parseProductRef, HOST } from '../lib/review/adapters/disquiet.ts'
import { decodeBoardCursor, encodeBoardCursor, BOARD_QUEUE_MAX } from '../lib/review/types.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN } from '../lib/review/runner.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'disquiet', n), 'utf8')

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
  id: 't1', projectId: 'p1', sourceKey: 'disquiet', productRef: 'board:feed',
  cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over,
})

// ── robots — 실측 원문을 리포 파서로 판정 ─────────────────────────
{
  const g = parseRobots(fx('robots.txt'))
  t('robots: / (피드) 허용', robotsVerdict(g, '/', PRODUCT_TOKEN).state, 'allowed')
  t('robots: /posts/<slug> 허용', robotsVerdict(g, '/posts/D1CXy9', PRODUCT_TOKEN).state, 'allowed')
  t('robots: /passwordless 금지', robotsVerdict(g, '/passwordless', PRODUCT_TOKEN).state, 'disallowed')
}

// ── product_ref — SSRF 경계 ───────────────────────────────────────
t('ref: url:/posts/<slug>', parseProductRef('url:/posts/D1CXy9'), '/posts/D1CXy9')
t('ref: 다른 경로 거부', parseProductRef('url:/products/moments-base'), null)
t('ref: 쿼리 거부', parseProductRef('url:/posts/D1CXy9?x=1'), null)
t('ref: // 거부', parseProductRef('url://evil.example/posts/a'), null)
t('ref: .. 거부', parseProductRef('url:/posts/../passwordless'), null)
t('ref: 접두 없으면 null', parseProductRef('/posts/D1CXy9'), null)

// ── nextRequest ────────────────────────────────────────────────────
t('next: board:feed 첫 요청은 홈 피드', A.nextRequest(target())?.url, `${HOST}/`)
t('next: 모르는 게시판은 요청 0', A.nextRequest(target({ productRef: 'board:articles' })), null)
t('next: 큐가 있으면 큐 머리 글', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['/posts/D1CXy9'], last: '6568' }) }))?.url, `${HOST}/posts/D1CXy9`)
t('next: 큐에 오염된 경로가 들어 있으면 요청 0', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['//evil.example/x'], last: null }) })), null)
t('next: url: 첫 요청', A.nextRequest(target({ productRef: 'url:/posts/D1CXy9' }))?.url, `${HOST}/posts/D1CXy9`)
t('next: url: 커서가 있으면 다시 안 간다', A.nextRequest(target({ productRef: 'url:/posts/D1CXy9', cursor: 'x' })), null)

// ── 목록 ───────────────────────────────────────────────────────────
const listCtx = (cursor = null) => ({ productRef: 'board:feed', cursor, lastReviewAt: null })
{
  const r = A.parse(fx('feed-list.html'), listCtx())
  const c = decodeBoardCursor(r.nextCursor)
  t('목록: 리뷰는 내지 않는다', r.reviews.length, 0)
  t('목록: 파싱 실패 0', r.parseFailures, 0)
  t(`목록: 큐는 BOARD_QUEUE_MAX(${BOARD_QUEUE_MAX})개`, c.q.length, BOARD_QUEUE_MAX)
  t('목록: 큐 머리는 최신 글', c.q[0], '/posts/OGCwVp')
  t('목록: last 는 숫자 최대 id', c.last, '6568')
  ok('목록: 큐는 전부 /posts/<slug> 형태', c.q.every((p) => parseProductRef(`url:${p}`) === p))
  t('목록: 큐가 차면 pauseRun 아님', r.pauseRun, false)

  // 다음 실행 — 같은 목록, last=6568 → 새 글 0 = 정상(실패 아님), 이번 실행 종료
  const again = A.parse(fx('feed-list.html'), listCtx(encodeBoardCursor({ q: [], last: '6568' })))
  t('목록 재실행: 새 글 0 → 큐 비어 있음', decodeBoardCursor(again.nextCursor).q.length, 0)
  t('목록 재실행: 새 글 0 은 실패가 아니다', again.parseFailures, 0)
  t('목록 재실행: pauseRun', again.pauseRun, true)
  t('목록 재실행: last 유지', decodeBoardCursor(again.nextCursor).last, '6568')

  // 증분 — last=6565 면 그보다 새 글 3건만
  const inc = A.parse(fx('feed-list.html'), listCtx(encodeBoardCursor({ q: [], last: '6565' })))
  t('목록 증분: last 이후 3건', decodeBoardCursor(inc.nextCursor).q.join(','), '/posts/OGCwVp,/posts/ZLCK5q,/posts/qaC6e3')

  // 카드 마크업 소실 = 실패(§7.1). 로그인 벽·챌린지 페이지도 여기로 온다.
  const broken = A.parse(fx('feed-list.html').replaceAll('<article id="disquiet_post_', '<article id="x_'), listCtx())
  t('목록: 카드가 사라지면 파싱 실패 1', broken.parseFailures, 1)
  const wall = A.parse(fx('post-not-found-404.html'), listCtx())
  t('목록: 엉뚱한 페이지(404 본문)도 파싱 실패 1', wall.parseFailures, 1)
}

// ── 글 ─────────────────────────────────────────────────────────────
const postCtx = (slug) => ({ productRef: `url:/posts/${slug}`, cursor: null, lastReviewAt: null })
{
  const r = A.parse(fx('post-with-reply.html'), postCtx('D1CXy9'))
  t('글+대댓글: 3건(본문 1 + 댓글 1 + 대댓글 1)', r.reviews.length, 3)
  t('글+대댓글: 실패 0', r.parseFailures, 0)
  t('글+대댓글: 본문 externalId', r.reviews[0].externalId, '/posts/D1CXy9')
  t('글+대댓글: 댓글 externalId', r.reviews[1].externalId, '/posts/D1CXy9#64333')
  t('글+대댓글: 대댓글 externalId', r.reviews[2].externalId, '/posts/D1CXy9#64348')
  ok('글+대댓글: 댓글 본문이 제 것(부모 본문에 대댓글이 섞이지 않는다)', !r.reviews[1].text.includes('감사드립니다'))
  // 2026-09-26T07:49:48Z → KST 2026-09-26 16:49 · 2026-09-27T04:35:30Z → KST 2026-09-27
  t('글: 작성일 KST', r.reviews[0].writtenAt, '2026-09-26')
  t('대댓글: 작성일 KST', r.reviews[2].writtenAt, '2026-09-27')
  ok('작성자 미저장: authorMasked 전부 null', r.reviews.every((x) => x.authorMasked === null))
  ok('작성자 미저장: 이름이 본문에 섞이지 않는다', r.reviews.every((x) => !x.text.includes('개발자입니다')))
  ok('본문: 태그가 남지 않는다', !r.reviews[0].text.includes('<'))
}
{
  const r = A.parse(fx('post-one-comment.html'), postCtx('qaC6ZB'))
  t('글+댓글1: 2건 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '2/0')
  const z = A.parse(fx('post-no-comments.html'), postCtx('OGCwVp'))
  t('댓글 0건(빈 컨테이너): 본문 1건 · 실패 0', `${z.reviews.length}/${z.parseFailures}`, '1/0')
}
{
  t('404 페이지: 실패 1 · 0건', JSON.stringify(((r) => [r.reviews.length, r.parseFailures])(A.parse(fx('post-not-found-404.html'), postCtx('zzzzzz')))), '[0,1]')
  // 다른 글이 왔다(리다이렉트·canonical 변경) — 이 타깃 project 로 적재하면 안 된다
  t('다른 글 응답: 실패 1 · 0건', A.parse(fx('post-with-reply.html'), postCtx('qaC6ZB')).reviews.length, 0)
  // 200 인데 로그인 벽 — canonical 이 없다
  const wall = fx('post-with-reply.html').replace(/<link rel="canonical"[^>]*>/, '')
  t('canonical 없음(로그인 벽 형태): 실패 1', A.parse(wall, postCtx('D1CXy9')).parseFailures, 1)
  const noList = fx('post-with-reply.html').replace('id="comments_list"', 'id="x"')
  t('댓글 영역 소실: 본문만 + 실패 1', JSON.stringify(((r) => [r.reviews.length, r.parseFailures])(A.parse(noList, postCtx('D1CXy9')))), '[1,1]')
  const noBody = fx('post-with-reply.html').replace('disquiet-prose', 'x-prose')
  t('본문 컨테이너 소실: 실패 1', A.parse(noBody, postCtx('D1CXy9')).parseFailures, 1)
  const noText = fx('post-with-reply.html').replaceAll('whitespace-pre-wrap', 'x')
  t('댓글 본문 선택자 소실: 실패 2', A.parse(noText, postCtx('D1CXy9')).parseFailures, 2)
}

// ── 러너와 붙인 경계면 ─────────────────────────────────────────────
function harness({ pages, cap = 50 }) {
  const log = { fetched: [], saves: [], inputs: [], health: null, slept: 0 }
  let clock = Date.parse('2026-09-28T03:00:00Z')
  const seen = new Map()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms; log.slept += ms },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      const u = new URL(url)
      if (u.pathname === '/robots.txt') return { status: 200, body: fx('robots.txt'), finalUrl: url }
      const p = pages[u.pathname]
      if (p === undefined) return { status: 404, body: fx('post-not-found-404.html'), finalUrl: url }
      return typeof p === 'number' ? { status: p, body: 'blocked', finalUrl: url } : { status: 200, body: p, finalUrl: url }
    },
    store: {
      async loadSource() { return { key: 'disquiet', enabled: true, minIntervalMs: 5000, dailyRequestCap: cap, requestsToday: 0 } },
      async listDueTargets() { return [target({ cursor: log.cursor ?? null })] },
      async saveTargetProgress(p) { log.saves.push(p) },
      async recordFingerprint(fp) {
        if (seen.has(fp.identityKey)) return 'duplicate'
        seen.set(fp.identityKey, fp.contentHash)
        return 'new'
      },
      async appendInput(i) { log.inputs.push(i); return `in${log.inputs.length}` },
      async linkFingerprint() {},
      async updateSourceHealth(_k, v) { log.health = v },
    },
  }
  return { ports, log }
}
{
  // 큐에 실측 글 3개가 든 상태 → 글 3요청, 6건 적재, 큐가 비면 이번 실행 종료(active 유지)
  const h = harness({
    pages: {
      '/posts/D1CXy9': fx('post-with-reply.html'),
      '/posts/qaC6ZB': fx('post-one-comment.html'),
      '/posts/OGCwVp': fx('post-no-comments.html'),
    },
  })
  h.log.cursor = encodeBoardCursor({ q: ['/posts/D1CXy9', '/posts/qaC6ZB', '/posts/OGCwVp'], last: '6568' })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너: 요청 3건(글 3)', r.requests, 3)
  t('러너: 신규 6건', r.stats.newReviews, 6)
  t('러너: 파싱 실패 0', r.stats.parseFailures, 0)
  t('러너: health ok', r.health.health, 'ok')
  t('러너: 타깃은 닫히지 않는다', h.log.saves.at(-1).status, 'active')
  t('러너: last 는 다음 실행으로 넘어간다', decodeBoardCursor(h.log.saves.at(-1).cursor).last, '6568')
  // 글 3요청 = 간격 2번. min_interval_ms 5000 을 러너가 지켰는지 가짜 시계로 잰다.
  ok('러너: 요청 간격 5초를 지킨다', h.log.slept >= 2 * 5000 - 100)
}
{
  // 목록 403 — 한 번 받고 멈추고, 소스를 끈다(러너 공용 가드가 이 어댑터에도 걸리는가)
  const h = harness({ pages: { '/': 403 } })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('403: 요청 1건 뒤 중단', r.requests, 1)
  t('403: 차단으로 센다', r.stats.blockedResponses, 1)
  t('403: 고장 판정 — review_sources 에는 안 쓴다(§10.1)', `${r.health?.disable}/${h.log.health}`, 'true/null')
  const h2 = harness({ pages: { '/': 429 } })
  const r2 = await runCollection(A, { dryRun: false, targetLimit: 5 }, h2.ports)
  t('429: 요청 1건 뒤 중단 + 고장 판정', `${r2.requests}/${r2.health?.disable}/${h2.log.health}`, '1/true/null')
}
{
  // 일일 상한 — cap 2 면 목록 1 + 글 1 만
  const h = harness({ pages: { '/': fx('feed-list.html'), '/posts/OGCwVp': fx('post-no-comments.html') }, cap: 2 })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('상한: cap 2 면 요청 2건에서 멈춘다', r.requests, 2)
}

console.log(`${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
