#!/usr/bin/env node
// Indie Hackers 편집 인터뷰(indiehackers) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크·DB 없음.
//
// 픽스처는 2026-09-30 에 우리 UA 로 실제로 받은 페이지다(fixtures/review/indiehackers/, 스크립트·svg·이미지를 걷고
// 인터뷰이·작성자·댓글 작성자 이름을 가렸다):
//   robots.txt                                   200 · `*` 빈 Disallow(전체 허용) · GPTBot·Google-Extended 만 금지
//   stories-list.html                            /stories · database__story 915건 중 앞 30건만 남김
//   story-0B3bsTvvOG0wqf8cAx1v.html              최신 인터뷰 · 본문 전부 열림 · 댓글 0
//   story-2KasH9NLK3ehlTL9GeGO-paywalled.html    오래된 인터뷰 · 본문이 가입 벽(pw-cta)에서 끊김 · 댓글 59
//
// ⚠️ 마지막 블록은 실제 러너와 붙여 돈다(§7.1 사례 5).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { indiehackersAdapter as A, HOST, REVISIT_AFTER_RUNS, REVISIT_PER_RUN, REVISIT_WAIT_MAX, __internal as I } from '../lib/review/adapters/indiehackers.ts'
import { decodeBoardCursor, encodeBoardCursor, BOARD_QUEUE_MAX } from '../lib/review/types.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'indiehackers', n), 'utf8')
const NEW = '0B3bsTvvOG0wqf8cAx1v'
const OLD = '2KasH9NLK3ehlTL9GeGO'
const FX_NEW = `story-${NEW}.html`
const FX_OLD = `story-${OLD}-paywalled.html`

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
  id: 't1', projectId: 'p1', sourceKey: 'indiehackers', productRef: 'board:stories',
  cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over,
})
const ctx = (cursor = null) => ({ productRef: 'board:stories', cursor, lastReviewAt: null })
const sctx = (id) => ctx(encodeBoardCursor({ q: [`/post/${id}`], last: NEW }))

// ── robots ─────────────────────────────────────────────────────────
{
  const g = parseRobots(fx('robots.txt'))
  t('robots: 목록 허용', robotsVerdict(g, '/stories', PRODUCT_TOKEN).state, 'allowed')
  t('robots: 글 허용', robotsVerdict(g, `/post/${NEW}`, PRODUCT_TOKEN).state, 'allowed')
  t('robots: GPTBot 은 금지(음성 대조)', robotsVerdict(g, '/stories', 'GPTBot').state, 'disallowed')
}

// ── 등록 경로 · nextRequest ───────────────────────────────────────
t('ref: board:stories', buildProductRef('indiehackers', 'board:stories')?.productRef, 'board:stories')
t('ref: 모르는 게시판 거부(사용자 글 피드 등)', buildProductRef('indiehackers', 'board:newest')?.ok, false)
t('next: 첫 요청은 인터뷰 목록', A.nextRequest(target())?.url, `${HOST}/stories`)
t('next: 큐 머리는 id 로 조립한 글', A.nextRequest(target({ cursor: encodeBoardCursor({ q: [`/post/${NEW}`], last: null }) }))?.url, `${HOST}/post/${NEW}`)
t('next: slug 경로는 거부(조립한 것만)', A.nextRequest(target({ cursor: encodeBoardCursor({ q: [`/post/tech/x-${NEW}`], last: null }) })), null)
t('next: 오염된 큐는 요청 0', A.nextRequest(target({ cursor: encodeBoardCursor({ q: ['//evil.example/x'], last: null }) })), null)
t('next: 모르는 게시판은 요청 0', A.nextRequest(target({ productRef: 'board:x' })), null)

// ── 목록 ───────────────────────────────────────────────────────────
{
  const r = A.parse(fx('stories-list.html'), ctx())
  const c = decodeBoardCursor(r.nextCursor)
  t('목록: 리뷰 0 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '0/0')
  t(`목록: 첫 실행 큐 ${BOARD_QUEUE_MAX}개(30건 중 상한)`, c.q.length, BOARD_QUEUE_MAX)
  t('목록: 큐 머리는 맨 위(최신) 인터뷰', c.q[0], `/post/${NEW}`)
  t('목록: last 는 맨 위 id', c.last, NEW)
  ok('목록: 헤더의 비-스토리 /post 링크는 줍지 않는다', !c.q.includes('/post/UtGA9vbFs8JXdWquLSd2'))
  ok('목록: 큐는 전부 조립 경로', c.q.every((p) => /^\/post\/[A-Za-z0-9]{20}$/.test(p)))
  // 증분 — 지난번 맨 위가 3번째라면 그 위 2개만 새 글이다(id 는 무작위라 크기 비교가 아니다).
  const third = c.q[2].slice(6)
  const inc = decodeBoardCursor(A.parse(fx('stories-list.html'), ctx(encodeBoardCursor({ q: [], last: third }))).nextCursor)
  t('목록 증분: last 위쪽 2건', inc.q.join(','), c.q.slice(0, 2).join(','))
  t('목록 증분: last 는 새 맨 위', inc.last, NEW)
  const again = A.parse(fx('stories-list.html'), ctx(encodeBoardCursor({ q: [], last: NEW })))
  t('목록 재실행: 새 글 0 = 실패 아님 + pauseRun', `${decodeBoardCursor(again.nextCursor).q.length}/${again.parseFailures}/${again.pauseRun}`, '0/0/true')
  const gone = decodeBoardCursor(A.parse(fx('stories-list.html'), ctx(encodeBoardCursor({ q: [], last: 'ZZZZZZZZZZZZZZZZZZZZ' }))).nextCursor)
  t('목록: last 가 사라졌으면 맨 위부터 상한까지', gone.q.length, BOARD_QUEUE_MAX)
  const blank = A.parse('<html><body>Just a moment...</body></html>', ctx(encodeBoardCursor({ q: [], last: NEW })))
  t('목록: 링크 0개(마크업 변경·챌린지) = 실패 1 · last 유지', `${blank.parseFailures}/${decodeBoardCursor(blank.nextCursor).last}`, `1/${NEW}`)
}

// ── 인터뷰 ────────────────────────────────────────────────────────
{
  const r = A.parse(fx(FX_NEW), sctx(NEW))
  t('최신: 본문 1건 · 댓글 0 · 실패 0', `${r.reviews.length}/${r.parseFailures}`, '1/0')
  t('최신: externalId', r.reviews[0].externalId, `/post/${NEW}`)
  t('최신: sourceUrl = 글 주소(공개 VOC 출처 보기)', r.reviews[0].sourceUrl, `https://www.indiehackers.com/post/${NEW}`)
  ok('최신: 제목으로 시작', r.reviews[0].text.startsWith('Hitting $60k MRR by building an SDK instead of an app'))
  ok('최신: 본문 끝까지(What\'s next 절)', r.reviews[0].text.includes('control surface for AI output'))
  ok('최신: 목차(nav)는 뺀다', !r.reviews[0].text.includes('Contents'))
  ok('최신: 본문 밖(뉴스레터·푸터)은 안 섞인다', !/Support This Post|Leave a Comment/.test(r.reviews[0].text))
  // 2026-09-29T14:52:39Z → KST 2026-09-29 23:52
  t('최신: 게시일 KST', r.reviews[0].writtenAt, '2026-09-29')
  t('최신: 작성자 미저장', r.reviews[0].authorMasked, null)
  t('최신: 큐가 비면 pauseRun', r.pauseRun, true)

  const o = A.parse(fx(FX_OLD), sctx(OLD))
  t('가입 벽 글: 본문 1 + 댓글 59 · 실패 0', `${o.reviews.length}/${o.parseFailures}`, '60/0')
  ok('가입 벽 글: 가입 안내문은 버린다', !/subscribe|Create a Free Account/.test(o.reviews[0].text))
  ok('가입 벽 글: 공개된 앞부분은 받는다', o.reviews[0].text.length > 1000)
  const c1 = o.reviews[1]
  t('댓글: externalId 는 commentId', c1.externalId, `/post/${OLD}#bZgCsL2W2Yc1xKrOkAMQ`)
  t('댓글: 날짜(title 원문 날짜)', c1.writtenAt, '2026-08-28')
  ok('댓글: 본문', c1.text.startsWith('Hi — $13k/mo with directories'))
  t('댓글: storyId 는 인터뷰', c1.storyId, `/post/${OLD}`)
  t('댓글 날짜 파서: 2nd', I.commentDate('Monday, March 2nd 2026 (1:00 pm)'), '2026-03-02')
  t('댓글 날짜 파서: 모르는 형식', I.commentDate('a month ago'), null)

  t('다른 글 응답(@id 불일치) = 실패 1 · 0건', JSON.stringify(((x) => [x.reviews.length, x.parseFailures])(A.parse(fx(FX_NEW), sctx(OLD)))), '[0,1]')
  t('JSON-LD 소실(404·챌린지 형태) = 실패 1', A.parse(fx(FX_NEW).replace('"Article"', '"WebPage"'), sctx(NEW)).parseFailures, 1)
  t('본문 컨테이너 소실 = 실패 1', A.parse(fx(FX_NEW).replace('firestore-post__content', 'x'), sctx(NEW)).parseFailures, 1)
  const notInterview = A.parse(fx(FX_NEW).replace('firestore-post--success-story-interview', ''), sctx(NEW))
  t('편집 인터뷰 표식 없음 = 0건 · filtered 1 · 실패 아님', `${notInterview.reviews.length}/${notInterview.filtered}/${notInterview.parseFailures}`, '0/1/0')
  t('댓글 id 소실 = 실패로 센다', A.parse(fx(FX_OLD).replace(/\?commentId=bZgCsL2W2Yc1xKrOkAMQ/, ''), sctx(OLD)).parseFailures, 1)
}

// ── 러너와 붙인 경계면 ─────────────────────────────────────────────
function harness(pages) {
  const log = { saves: [], health: null, cursor: null, urls: [] }
  let clock = Date.parse('2026-09-30T03:00:00Z')
  const seen = new Set()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url) {
      clock += 10
      log.urls.push(url)
      const u = new URL(url)
      if (u.pathname === '/robots.txt') return { status: 200, body: fx('robots.txt'), finalUrl: url }
      const p = pages[u.pathname]
      if (p === undefined) return { status: 404, body: 'not found', finalUrl: url }
      // 실서버는 /post/<id> 를 301 로 /post/tech/<slug>-<id>(같은 호스트)로 보낸다.
      return typeof p === 'number' ? { status: p, body: 'blocked', finalUrl: url } : { status: 200, body: p, finalUrl: url.replace('/post/', '/post/tech/slug-') }
    },
    store: {
      async loadSource() { return { key: 'indiehackers', enabled: true, minIntervalMs: 6000, dailyRequestCap: 40, requestsToday: log.requestsToday ?? 0 } },
      async listDueTargets() { return [target({ cursor: log.cursor, lastReviewAt: log.lastReviewAt ?? null })] },
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
  const h = harness({ [`/post/${OLD}`]: fx(FX_OLD) })
  h.log.cursor = encodeBoardCursor({ q: [`/post/${OLD}`], last: NEW })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너: 요청 1 · 신규 60 · 실패 0', `${r.requests}/${r.stats.newReviews}/${r.stats.parseFailures}`, '1/60/0')
  t('러너: 타깃은 닫히지 않는다', h.log.saves.at(-1).status, 'active')
  ok('러너: 사용자 글 경로를 요청하지 않는다', h.log.urls.every((u) => /\/(robots\.txt|stories|post\/[A-Za-z0-9]{20})$/.test(new URL(u).pathname)))
}
{
  const h = harness({ '/stories': 403 })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('403: 요청 1건 뒤 중단 + 고장 판정(review_sources 에는 안 씀)', `${r.requests}/${r.stats.blockedResponses}/${r.health?.disable}/${h.log.health}`, '1/1/true/null')
}

// ── 댓글 재방문(남헌 결정 2026-09-30) ──────────────────────────────
const W = (c) => I.dec(c).w
const cur = (o) => I.enc({ q: [], last: NEW, w: [], ...o })
const [IA, IB, IC] = ['AAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBB', 'CCCCCCCCCCCCCCCCCCCC']
t('재방문 상수: 14실행(하루 2회 ≈ 7일) · 실행당 1', `${REVISIT_AFTER_RUNS}/${REVISIT_PER_RUN}`, '14/1')
{
  // 처음 읽기 → 대기열 등록
  t('첫 읽기: 대기열에 [id, 14]', JSON.stringify(W(A.parse(fx(FX_NEW), sctx(NEW)).nextCursor)), JSON.stringify([[NEW, REVISIT_AFTER_RUNS]]))
  const again = A.parse(fx(FX_NEW), ctx(cur({ q: [`/post/${NEW}`], w: [[NEW, 3]] })))
  t('첫 읽기: 이미 대기 중이면 다시 넣지 않는다', JSON.stringify(W(again.nextCursor)), JSON.stringify([[NEW, 3]]))
  const nf = A.parse(fx(FX_NEW).replace('firestore-post--success-story-interview', ''), sctx(NEW))
  t('첫 읽기: 편집 인터뷰가 아니면 등록하지 않는다', W(nf.nextCursor).length, 0)
  t('첫 읽기: 파싱 실패면 등록하지 않는다', W(A.parse('<html></html>', sctx(NEW)).nextCursor).length, 0)
  t('옛 커서(w 없음)도 읽는다', JSON.stringify(I.dec(encodeBoardCursor({ q: ['/post/x'], last: NEW }))), JSON.stringify({ q: ['/post/x'], last: NEW, w: [] }))
  t('w 가 비면 커서 모양은 예전 그대로', I.enc({ q: [], last: NEW, w: [] }), encodeBoardCursor({ q: [], last: NEW }))
  t('오염된 w 항목은 버린다', JSON.stringify(W(JSON.stringify({ q: [], last: null, w: [['../x', 1], [IA, 'x'], [IA, 2]] }))), JSON.stringify([[IA, 2]]))
  const many = A.parse(fx(FX_NEW), ctx(cur({ q: [`/post/${NEW}`], w: Array.from({ length: REVISIT_WAIT_MAX }, (_, i) => [`${'D'.repeat(18)}${String(i).padStart(2, '0')}`, 5]) })))
  t(`대기열 상한 ${REVISIT_WAIT_MAX}: 넘치면 가장 먼저 넣은 것부터 버린다`, `${W(many.nextCursor).length}/${W(many.nextCursor).at(-1)[0]}/${W(many.nextCursor)[0][0]}`, `${REVISIT_WAIT_MAX}/${NEW}/${'D'.repeat(18)}01`)
}
{
  // 목록 → 대상 선택
  const r = A.parse(fx('stories-list.html'), ctx(cur({ w: [[IA, 2], [IB, 1], [IC, 1]] })))
  const c = I.dec(r.nextCursor)
  t('목록: 기한 된 것 중 먼저 넣은 1건만 큐 맨 뒤에(#c)', c.q.join(','), `/post/${IB}#c`)
  t('목록: 나머지는 1씩 줄고 꺼낸 것은 빠진다', JSON.stringify(c.w), JSON.stringify([[IA, 1], [IC, 0]]))
  t('목록: 새 글 0 이어도 재방문이 있으면 이어 간다', r.pauseRun, false)
  const full = I.dec(A.parse(fx('stories-list.html'), ctx(I.enc({ q: [], last: null, w: [[IA, 1]] }))).nextCursor)
  t('목록: 새 글이 큐를 채우면(19) 재방문은 다음 실행으로', `${full.q.length}/${full.q.some((p) => p.endsWith('#c'))}/${JSON.stringify(full.w)}`, `${BOARD_QUEUE_MAX}/false/${JSON.stringify([[IA, 0]])}`)
  const inc = I.dec(A.parse(fx('stories-list.html'), ctx(cur({ last: decodeBoardCursor(A.parse(fx('stories-list.html'), ctx()).nextCursor).q[2].slice(6), w: [[IA, 1]] }))).nextCursor)
  t('목록: 새 글 2건 뒤에 재방문', inc.q.map((p) => p.endsWith('#c')).join(','), 'false,false,true')
  const blank = A.parse('<html>Just a moment...</html>', ctx(cur({ w: [[IA, 1]] })))
  t('목록 실패(링크 0): 대기열은 줄지도 꺼내지도 않는다', `${blank.parseFailures}/${JSON.stringify(W(blank.nextCursor))}/${I.dec(blank.nextCursor).q.length}`, `1/${JSON.stringify([[IA, 1]])}/0`)
  // 14번째 목록 실행에서 처음 나온다
  let cursor = A.parse(fx(FX_NEW), sctx(NEW)).nextCursor
  let firstAt = 0
  for (let run = 1; run <= 20 && !firstAt; run++) {
    const q = I.dec(A.parse(fx('stories-list.html'), ctx(cursor)).nextCursor)
    if (q.q.includes(`/post/${NEW}#c`)) firstAt = run
    cursor = I.enc({ ...q, q: [] })
  }
  t('주기: 처음 읽은 뒤 14번째 실행에서 재방문', firstAt, REVISIT_AFTER_RUNS)
  t('주기: 재방문은 한 번뿐(대기열에서 빠짐)', W(cursor).length, 0)
}
{
  // 재방문 요청·파싱
  t('next: 재방문도 같은 조립 URL(#c 는 안 보낸다)', A.nextRequest(target({ cursor: cur({ q: [`/post/${OLD}#c`] }) }))?.url, `${HOST}/post/${OLD}`)
  t('next: 재방문 표식이 다르면 요청 0', A.nextRequest(target({ cursor: cur({ q: [`/post/${OLD}#x`] }) })), null)
  const o = A.parse(fx(FX_OLD), ctx(cur({ q: [`/post/${OLD}#c`], w: [[IA, 3]] })))
  t('재방문(가입 벽 글): 본문 없이 댓글 59만 · 실패 0', `${o.reviews.length}/${o.parseFailures}`, '59/0')
  ok('재방문: 전부 댓글 id', o.reviews.every((r) => r.externalId.startsWith(`/post/${OLD}#`)))
  t('재방문: 다시 대기열에 넣지 않는다(다른 항목은 그대로)', JSON.stringify(W(o.nextCursor)), JSON.stringify([[IA, 3]]))
  t('재방문: 큐가 비면 pauseRun', o.pauseRun, true)
  const n = A.parse(fx(FX_NEW), ctx(cur({ q: [`/post/${NEW}#c`] })))
  t('재방문(댓글 0): 0건 · 실패 0', `${n.reviews.length}/${n.parseFailures}`, '0/0')
  t('재방문: 다른 글 응답이면 실패 1', A.parse(fx(FX_NEW), ctx(cur({ q: [`/post/${OLD}#c`] }))).parseFailures, 1)
}
{
  // 러너와 붙여서 — 첫 읽기 → 재방문: 댓글만 · 중복 미적재
  const h = harness({ [`/post/${OLD}`]: fx(FX_OLD) })
  h.log.cursor = encodeBoardCursor({ q: [`/post/${OLD}`], last: NEW })
  await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너 첫 읽기: 커서에 재방문 대기 등록', JSON.stringify(W(h.log.saves.at(-1).cursor)), JSON.stringify([[OLD, REVISIT_AFTER_RUNS]]))
  h.log.saves = []
  h.log.urls = []
  h.log.cursor = cur({ q: [`/post/${OLD}#c`] })
  h.log.lastReviewAt = '2026-09-29' // 재방문 댓글은 기준선보다 오래됐다 → 러너 증분 종료가 걸려도 남는 큐가 없어야 한다
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너 재방문: 요청 1 · 파싱 59(본문 제외) · 신규 0(이미 받은 댓글) · 실패 0', `${r.requests}/${r.stats.reviewsParsed}/${r.stats.newReviews}/${r.stats.parseFailures}`, '1/59/0/0')
  t('러너 재방문: 큐 소진 · 대기열 비움', h.log.saves.at(-1).cursor, cur({}))
  ok('러너 재방문: 요청 URL 에 #c 없음 · 조립 경로만', h.log.urls.every((u) => !u.includes('#') && /\/(robots\.txt|post\/[A-Za-z0-9]{20})$/.test(new URL(u).pathname)))
}
{
  const h = harness({ [`/post/${OLD}`]: fx(FX_OLD) })
  h.log.cursor = cur({ q: [`/post/${OLD}#c`] })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('러너 재방문(처음 보는 댓글): 신규 59 = 댓글만 새로 넣는다', `${r.requests}/${r.stats.newReviews}`, '1/59')
}
{
  // 일일 상한: 남은 1요청이면 새 글 1건만 읽고 재방문은 커서에 남긴다
  const h = harness({ [`/post/${NEW}`]: fx(FX_NEW), [`/post/${OLD}`]: fx(FX_OLD) })
  h.log.requestsToday = 39
  h.log.cursor = cur({ q: [`/post/${NEW}`, `/post/${OLD}#c`] })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('상한: 남은 1요청만 쓴다', r.requests, 1)
  t('상한: 재방문은 커서 큐에 남는다', I.dec(h.log.saves.at(-1).cursor).q.join(','), `/post/${OLD}#c`)
  const h2 = harness({})
  h2.log.requestsToday = 40
  h2.log.cursor = cur({ q: [`/post/${OLD}#c`] })
  t('상한: 다 썼으면 요청 0', (await runCollection(A, { dryRun: false, targetLimit: 5 }, h2.ports)).requests, 0)
}
{
  // 봇 방어 응답: 재방문 중 403 → 멈추고 사유·수치를 남긴다. 재방문은 소비하지 않는다(우회·재시도 없음).
  const h = harness({ [`/post/${OLD}`]: 403 })
  h.log.cursor = cur({ q: [`/post/${OLD}#c`] })
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, h.ports)
  t('재방문 403: 요청 1 · 차단 1 · 중단', `${r.requests}/${r.stats.blockedResponses}/${r.health?.disable}`, '1/1/true')
  ok('재방문 403: 결과에 사유가 남는다', /차단 응답 403/.test(r.perTarget[0]?.outcome ?? ''))
  t('재방문 403: 커서는 그대로(재방문 유지)', h.log.saves.at(-1).cursor, cur({ q: [`/post/${OLD}#c`] }))
}

console.log(`review-indiehackers-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
