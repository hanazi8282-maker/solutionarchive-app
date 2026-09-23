#!/usr/bin/env node
// 게시판 순회(`board:<slug>`) 셀프테스트 — 네트워크도 DB 도 없이 돈다.
//
// 네 가지를 고정한다:
//
//   1. **robots 를 코드가 실제로 어떻게 판정하는가.** 문서에 적힌 기대가 아니라
//      `RobotsCache.decide()` 와 `robotsVerdict()` 를 실제 URL 로 돌린 결과다.
//      2026-09-24 에 우리 UA 로 직접 받은 robots.txt 원문 3개가 픽스처다
//      (fixtures/review/*/robots.txt). **문서와 다른 곳이 있으면 여기서 드러난다.**
//
//   2. **목록 파싱.** 2026-09-24 실측 목록 1페이지에서 깎은 픽스처로,
//      공지·BEST·다른 게시판 링크가 큐에 섞이지 않는지 본다.
//
//   3. **선택자가 깨지면 "0건"이 아니라 파싱 실패로 보고하는가**(CLAUDE.md §7.1).
//      목록 컨테이너가 사라진 것과 새 글이 없는 것은 다른 사건이다.
//
//   4. **러너와 붙인 경계면.** 가짜 어댑터가 아니라 실제 어댑터 3종을
//      `runCollection` 에 넣고 돌린다(§7.1 "부품 테스트를 통합의 근거로 쓰지 마라").
//      커서 큐·증분·연속 0건 안전장치가 여기서 검증된다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clienAdapter, HOST as CLIEN_HOST } from '../lib/review/adapters/clien.ts'
import { cook82Adapter, HOST as COOK_HOST, parseBoardNo } from '../lib/review/adapters/82cook.ts'
import { bobaedreamAdapter, HOST as BOBAE_HOST } from '../lib/review/adapters/bobaedream.ts'
import {
  BOARD_QUEUE_MAX,
  compareBoardId,
  decodeBoardCursor,
  encodeBoardCursor,
  nextBoardCursor,
  parseBoardRef,
} from '../lib/review/types.ts'
import {
  runCollection,
  RobotsCache,
  MAX_PAGES_PER_TARGET,
  PRODUCT_TOKEN,
} from '../lib/review/runner.ts'
import { MAX_CONSECUTIVE_EMPTY } from '../lib/review/health.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (site, name) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', site, name), 'utf8')

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

// ════════════════════════════════════════════════════════════════════
// 0. 규약 상수·ref 파서
// ════════════════════════════════════════════════════════════════════
t('BOARD_QUEUE_MAX = MAX_PAGES_PER_TARGET - 1 (목록 1 + 글 19)', BOARD_QUEUE_MAX, MAX_PAGES_PER_TARGET - 1)

t('ref: board:use → use', parseBoardRef('board:use'), 'use')
t('ref: 대문자 접두도 허용', parseBoardRef('BOARD:use'), 'use')
t('ref: 앞뒤 공백 허용', parseBoardRef('  board:battle  '), 'battle')
t('ref: 숫자 slug(82cook bn)', parseBoardRef('board:15'), '15')
t('ref: url: 는 게시판이 아니다', parseBoardRef('url:/service/board/use'), null)
t('ref: 접두 없으면 null', parseBoardRef('use'), null)
t('ref: 슬래시 거부(경로 탈출)', parseBoardRef('board:use/../admin'), null)
t('ref: 쿼리 거부(파라미터 주입)', parseBoardRef('board:use?po=1'), null)
t('ref: 공백 거부', parseBoardRef('board:us e'), null)
t('ref: 빈 slug 거부', parseBoardRef('board:'), null)
t('ref: 한글 slug 거부', parseBoardRef('board:사용기'), null)
t('82cook: 낱말 slug 는 거부한다(bn 은 숫자다)', parseBoardNo('board:use'), null)
t('82cook: 숫자 slug 만 통과', parseBoardNo('board:31'), '31')

// 커서 코덱 — 읽을 수 없는 값은 "처음부터"로 떨어진다(던지지 않는다).
t('커서: null → 빈 상태', JSON.stringify(decodeBoardCursor(null)), '{"q":[],"last":null}')
t('커서: 깨진 JSON → 빈 상태', JSON.stringify(decodeBoardCursor('{oops')), '{"q":[],"last":null}')
t('커서: url: 시절 페이지 번호 → 빈 상태', JSON.stringify(decodeBoardCursor('2')), '{"q":[],"last":null}')
t('커서: 왕복', encodeBoardCursor(decodeBoardCursor('{"q":["/a"],"last":"9"}')), '{"q":["/a"],"last":"9"}')
t('커서: q 안의 비문자열은 버린다', JSON.stringify(decodeBoardCursor('{"q":["/a",3,null],"last":"9"}').q), '["/a"]')

// 숫자 id 를 문자열로 비교하면 새 글이 "이미 본 글"로 걸러진다.
ok('id 비교: 9 < 10 (수치 비교)', compareBoardId('9', '10') < 0)
ok('id 비교: 19268762 > 19268665', compareBoardId('19268762', '19268665') > 0)

{
  const items = [
    { id: '30', path: '/p/30', writtenAt: '2026-09-24' },
    { id: '20', path: '/p/20', writtenAt: '2026-09-23' },
    { id: '10', path: '/p/10', writtenAt: '2026-09-01' },
  ]
  t('큐: last 가 없으면 전부 담는다', nextBoardCursor(items, { q: [], last: null }).q.length, 3)
  t('큐: last 보다 큰 것만 담는다', JSON.stringify(nextBoardCursor(items, { q: [], last: '20' }).q), '["/p/30"]')
  t('큐: last 는 목록의 최대 id 로 전진한다', nextBoardCursor(items, { q: [], last: '20' }).last, '30')
  t(
    '큐: lastReviewAt 보다 오래된 글은 담지 않는다',
    JSON.stringify(nextBoardCursor(items, { q: [], last: null }, '2026-09-23').q),
    '["/p/30","/p/20"]',
  )
  t(
    '큐: 날짜를 못 읽은 글(null)은 거르지 않는다 — 건너뛰는 쪽이 더 나쁘다',
    nextBoardCursor([{ id: '5', path: '/p/5', writtenAt: null }], { q: [], last: null }, '2026-09-23').q.length,
    1,
  )
  const many = Array.from({ length: 40 }, (_, i) => ({ id: String(100 - i), path: `/p/${100 - i}`, writtenAt: null }))
  t('큐: 실행당 상한을 지킨다', nextBoardCursor(many, { q: [], last: null }).q.length, BOARD_QUEUE_MAX)
  t('큐: 상한에 잘려도 last 는 최대 id 다(다음 실행이 다시 담지 않게)', nextBoardCursor(many, { q: [], last: null }).last, '100')
}

// ════════════════════════════════════════════════════════════════════
// 1. robots — 문서가 아니라 **코드 판정**
// ════════════════════════════════════════════════════════════════════
//
// 2026-09-24 우리 UA(solutionarchive-review-collector)로 직접 받은 원문이다.
// 세 곳 모두 HTTP 200. clien 은 2026-09-17 에 우리 UA 에게 404 였다(SP-027) —
// **사이트 쪽이 바뀌었다.** 그 사실이 이 픽스처의 존재로 기록된다.
const ROBOTS = {
  'www.clien.net': fx('clien', 'robots.txt'),
  'www.82cook.com': fx('82cook', 'robots.txt'),
  'www.bobaedream.co.kr': fx('bobaedream', 'robots.txt'),
}

/** 러너가 실제로 쓰는 판정기. 픽스처를 robots.txt 응답으로 물려 준다. */
function robotsFor(host, proceed = []) {
  return new RobotsCache(
    {
      async fetchText(url) {
        const u = new URL(url)
        const body = ROBOTS[u.hostname]
        if (body === undefined) return { status: 404, body: '', finalUrl: url }
        return { status: 200, body, finalUrl: url }
      },
    },
    proceed,
  )
}

{
  const rc = robotsFor()
  const decide = async (url) => (await rc.decide(url)).state

  // ── clien ────────────────────────────────────────────────────────
  t('clien: 게시판 목록은 허용', await decide(`${CLIEN_HOST}/service/board/use`), 'allowed')
  t('clien: 글도 허용', await decide(`${CLIEN_HOST}/service/board/use/19268762`), 'allowed')
  t('clien: 중고장터는 금지', await decide(`${CLIEN_HOST}/service/board/sold/123`), 'disallowed')
  t('clien: 직접홍보도 금지', await decide(`${CLIEN_HOST}/service/board/hongbo/123`), 'disallowed')
  t('clien: 검색은 금지', await decide(`${CLIEN_HOST}/service/search/`), 'disallowed')
  t('clien: 쪽지·마이페이지도 금지', await decide(`${CLIEN_HOST}/service/mypage/`), 'disallowed')

  // 🔴 **문서와 다른 곳.** clien robots 에 `Disallow: /*?*` 가 있지만 코드 판정은
  //    쿼리가 붙은 게시판 URL 을 **막지 않는다.** 이유가 둘이고 둘 다 실재한다:
  //      (a) 러너가 판정에 `u.pathname` 만 넘긴다 — 쿼리가 아예 안 보인다(SP-026).
  //      (b) 쿼리를 넘겨도 최장 일치라 `Allow:/service/board/`(20자)가
  //          `Disallow: /*?*`(4자)를 이긴다.
  //    그래서 "목록 2페이지부터 못 간다"를 지키는 것은 robots 코드가 아니라
  //    **어댑터가 쿼리 없는 URL 만 만드는 것**이다. 아래 3번이 그걸 단정한다.
  t(
    '🔴 clien: 쿼리가 붙어도 코드는 allowed 를 낸다 — (a) 러너가 쿼리를 안 넘긴다',
    await decide(`${CLIEN_HOST}/service/board/use?po=1`),
    'allowed',
  )
  {
    const groups = parseRobots(ROBOTS['www.clien.net'])
    t(
      '🔴 clien: 쿼리를 넘겨도 allowed — (b) 최장 일치가 Allow 를 택한다',
      robotsVerdict(groups, '/service/board/use?po=1', PRODUCT_TOKEN).state,
      'allowed',
    )
    // 같은 규칙이 **허용 접두 밖**에서는 제대로 막는다. 즉 `/*?*` 자체는 파싱된다.
    t(
      'clien: 허용 접두 밖의 쿼리 URL 은 쿼리를 넘기면 막힌다',
      robotsVerdict(groups, '/service/community?x=1', PRODUCT_TOKEN).state,
      'disallowed',
    )
    t(
      'clien: 우리 UA 전용 그룹은 없다 — `*` 그룹이 적용된다',
      robotsVerdict(groups, '/service/board/use', PRODUCT_TOKEN).reason,
      'Allow: /service/board/',
    )
    // AI 학습 크롤러·SEO 봇 차단 그룹이 우리에게 적용되면 전면 금지가 된다.
    ok(
      'clien: anthropic-ai 그룹을 우리 것으로 잘못 고르지 않는다',
      robotsVerdict(groups, '/service/board/use', PRODUCT_TOKEN).state === 'allowed',
    )
  }
  ok(
    'clien: 이제 robots 를 읽으므로 표식(proceedWhenRobotsUnverified)은 무력화됐다',
    (await robotsFor('www.clien.net', ['www.clien.net']).decide(`${CLIEN_HOST}/service/board/use`)).reason ===
      'Allow: /service/board/',
  )

  // ── 82cook ───────────────────────────────────────────────────────
  t('82cook: 게시판 목록은 허용', await decide(`${COOK_HOST}/entiz/enti.php?bn=15`), 'allowed')
  t('82cook: 글도 허용', await decide(`${COOK_HOST}/entiz/read.php?num=4242494`), 'allowed')
  t('82cook: /ajax/ 는 금지', await decide(`${COOK_HOST}/ajax/x`), 'disallowed')
  t('82cook: /temp/ 는 금지', await decide(`${COOK_HOST}/temp/x`), 'disallowed')
  t('82cook: /zb41/ 는 금지', await decide(`${COOK_HOST}/zb41/x`), 'disallowed')
  // 🔴 robots 가 콕 집어 막은 글 1건. 러너 판정은 쿼리를 안 보므로 통과시킨다(SP-026).
  //    막는 것은 어댑터의 isRobotsDenied 다 — 그 음성 검사는 review-82cook-selftest.mjs 에 있다.
  t(
    '🔴 82cook: robots 가 금지한 특정 글도 코드는 allowed — 어댑터가 막는다',
    await decide(`${COOK_HOST}/entiz/read.php?bn=15&num=1166440&page=6`),
    'allowed',
  )
  t(
    '82cook: 쿼리를 넘기면 그 글은 제대로 막힌다(러너가 안 넘기는 것이 문제다)',
    robotsVerdict(parseRobots(ROBOTS['www.82cook.com']), '/entiz/read.php?bn=15&num=1166440&page=6', PRODUCT_TOKEN)
      .state,
    'disallowed',
  )

  // ── bobaedream ───────────────────────────────────────────────────
  t('bobaedream: 목록 허용(Allow: /)', await decide(`${BOBAE_HOST}/list?code=freeb`), 'allowed')
  t('bobaedream: 글 허용', await decide(`${BOBAE_HOST}/view?code=freeb&No=3438906`), 'allowed')
  t(
    'bobaedream: Amazonbot 금지 그룹을 우리 것으로 고르지 않는다',
    robotsVerdict(parseRobots(ROBOTS['www.bobaedream.co.kr']), '/list?code=freeb', PRODUCT_TOKEN).state,
    'allowed',
  )
}

// ════════════════════════════════════════════════════════════════════
// 2. 목록 파싱 — 실측 픽스처
// ════════════════════════════════════════════════════════════════════
const listCtx = (ref, over = {}) => ({ productRef: ref, cursor: null, lastReviewAt: null, ...over })

{
  const r = clienAdapter.parse(fx('clien', 'board-list.html'), listCtx('board:use'))
  const cur = decodeBoardCursor(r.nextCursor)
  t('clien 목록: 리뷰는 내지 않는다', r.reviews.length, 0)
  t('clien 목록: 파싱 실패 0', r.parseFailures, 0)
  t('clien 목록: 일반 글 6건을 큐에 담는다(공지 제외)', cur.q.length, 6)
  t('clien 목록: 최신 글이 큐 맨 앞', cur.q[0], '/service/board/use/19268762')
  t('clien 목록: last = 최대 글 번호', cur.last, '19268762')
  ok('clien 목록: 경로에 쿼리가 없다(robots /*?* 의 의도)', cur.q.every((p) => !p.includes('?')))
  ok('clien 목록: 전부 이 게시판 경로', cur.q.every((p) => p.startsWith('/service/board/use/')))
  t('clien 목록: 새 글이 있으면 멈추지 않는다', r.pauseRun, false)

  // 증분 — last 가 최신이면 큐가 비고 그 실행은 목록 1요청으로 끝난다.
  const again = clienAdapter.parse(
    fx('clien', 'board-list.html'),
    listCtx('board:use', { cursor: encodeBoardCursor({ q: [], last: '19268762' }) }),
  )
  t('clien 목록: 이미 본 글은 다시 담지 않는다', decodeBoardCursor(again.nextCursor).q.length, 0)
  t('clien 목록: 새 글이 0건이면 pauseRun 으로 멈춘다', again.pauseRun, true)
  t('clien 목록: 새 글 0건은 파싱 실패가 아니다', again.parseFailures, 0)

  // 날짜 기반 필터 — 목록에 4자리 연도 절대시각이 있어 추정이 없다.
  const old = clienAdapter.parse(fx('clien', 'board-list.html'), listCtx('board:use', { lastReviewAt: '2026-12-31' }))
  t('clien 목록: 기준선보다 오래된 글은 담지 않는다', decodeBoardCursor(old.nextCursor).q.length, 0)

  // 🔴 선택자 깨짐 = 파싱 실패. "새 글 0건"으로 접으면 몇 주가 조용히 간다(§7.1).
  const broken = clienAdapter.parse(fx('clien', 'board-list-broken.html'), listCtx('board:use'))
  t('clien 목록: 행 앵커가 사라지면 파싱 실패로 보고한다', broken.parseFailures, 1)
  t('clien 목록: 그때도 큐는 비어 있다', decodeBoardCursor(broken.nextCursor).q.length, 0)
}

{
  const r = cook82Adapter.parse(fx('82cook', 'board-list.html'), listCtx('board:15'))
  const cur = decodeBoardCursor(r.nextCursor)
  t('82cook 목록: 리뷰는 내지 않는다', r.reviews.length, 0)
  t('82cook 목록: 파싱 실패 0', r.parseFailures, 0)
  t('82cook 목록: 일반 글 6건(공지 4건 제외)', cur.q.length, 6)
  t('82cook 목록: 최신 글이 큐 맨 앞', cur.q[0], '/entiz/read.php?num=4242494')
  t('82cook 목록: last = 최대 글 번호', cur.last, '4242494')
  ok(
    '82cook 목록: 경로가 기존 url: 타깃과 같은 형태다(같은 글이 두 번 쌓이지 않게)',
    cur.q.every((p) => /^\/entiz\/read\.php\?num=\d+$/.test(p)),
  )
  ok('82cook 목록: 공지 글번호는 큐에 없다', !cur.q.includes('/entiz/read.php?num=4060855'))

  const again = cook82Adapter.parse(
    fx('82cook', 'board-list.html'),
    listCtx('board:15', { cursor: encodeBoardCursor({ q: [], last: '4242494' }) }),
  )
  t('82cook 목록: 이미 본 글은 다시 담지 않는다', decodeBoardCursor(again.nextCursor).q.length, 0)
  t('82cook 목록: 새 글 0건이면 pauseRun', again.pauseRun, true)

  const broken = cook82Adapter.parse(fx('82cook', 'board-list-broken.html'), listCtx('board:15'))
  t('82cook 목록: 링크 형태가 바뀌면 파싱 실패', broken.parseFailures, 1)
}

{
  const r = bobaedreamAdapter.parse(fx('bobaedream', 'board-list.html'), listCtx('board:freeb'))
  const cur = decodeBoardCursor(r.nextCursor)
  t('bobaedream 목록: 리뷰는 내지 않는다', r.reviews.length, 0)
  t('bobaedream 목록: 파싱 실패 0', r.parseFailures, 0)
  t('bobaedream 목록: 일반 글 6건(BEST 제외)', cur.q.length, 6)
  ok('bobaedream 목록: BEST 의 옛 글은 큐에 없다', !cur.q.includes('/view?code=freeb&No=3438126'))
  ok(
    'bobaedream 목록: 경로가 parseProductRef 정규화형이다',
    cur.q.every((p) => /^\/view\?code=freeb&No=\d+$/.test(p)),
  )
  t('bobaedream 목록: last = 최대 글 번호', cur.last, '3438941')

  // 다른 게시판 ref 로 같은 목록을 읽히면 한 건도 담지 않는다(엉뚱한 글 수집 방지).
  const other = bobaedreamAdapter.parse(fx('bobaedream', 'board-list.html'), listCtx('board:battle'))
  t('bobaedream 목록: 다른 게시판 ref 면 큐가 빈다', decodeBoardCursor(other.nextCursor).q.length, 0)

  const again = bobaedreamAdapter.parse(
    fx('bobaedream', 'board-list.html'),
    listCtx('board:freeb', { cursor: encodeBoardCursor({ q: [], last: '3438941' }) }),
  )
  t('bobaedream 목록: 이미 본 글은 다시 담지 않는다', decodeBoardCursor(again.nextCursor).q.length, 0)

  const broken = bobaedreamAdapter.parse(fx('bobaedream', 'board-list-broken.html'), listCtx('board:freeb'))
  t('bobaedream 목록: 행 마커가 사라지면 파싱 실패', broken.parseFailures, 1)
}

// ════════════════════════════════════════════════════════════════════
// 3. 러너와 붙인 경계면 — 실제 어댑터로 전 경로
// ════════════════════════════════════════════════════════════════════
function harness({ adapter, listUrl, listBody, postBody, targets }) {
  const log = { fetched: [], saves: [], inputs: [] }
  const seen = new Map()
  let clock = Date.parse('2026-09-24T03:00:00Z')

  const ports = {
    now: () => new Date(clock),
    async sleep(ms) {
      clock += ms
    },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      const u = new URL(url)
      if (u.pathname === '/robots.txt') {
        return { status: 200, body: ROBOTS[u.hostname] ?? '', finalUrl: url }
      }
      if (url === listUrl) return { status: 200, body: listBody, finalUrl: url }
      return { status: 200, body: postBody, finalUrl: url }
    },
    store: {
      async loadSource() {
        return { key: adapter.key, enabled: true, minIntervalMs: 0, dailyRequestCap: 200, requestsToday: 0 }
      },
      async listDueTargets() {
        return targets
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
        return prev === fp.contentHash ? 'duplicate' : 'revised'
      },
      async appendInput(i) {
        log.inputs.push(i)
        return `in${log.inputs.length}`
      },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }
  return { ports, log, seen }
}

const target = (over = {}) => ({
  id: 'tgt1',
  projectId: 'proj1',
  sourceKey: 'clien',
  productRef: 'board:use',
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})

{
  // 1회차 — 목록 1요청 + 글 6요청. 그 글의 본문·댓글이 적재된다.
  const h = harness({
    adapter: clienAdapter,
    listUrl: `${CLIEN_HOST}/service/board/use`,
    listBody: fx('clien', 'board-list.html'),
    postBody: fx('clien', 'post-with-comments.html'),
    targets: [target()],
  })
  const r = await runCollection(clienAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  const posts = h.log.fetched.filter((u) => !u.endsWith('/robots.txt') && u !== `${CLIEN_HOST}/service/board/use`)

  t('러너: 목록 1 + 글 6 = 7페이지', r.pagesFetched, 7)
  t('러너: 목록을 먼저 받는다', h.log.fetched[1], `${CLIEN_HOST}/service/board/use`)
  t('러너: 그다음 큐 순서대로 글을 받는다', posts[0], `${CLIEN_HOST}/service/board/use/19268762`)
  t('러너: 큐에 있던 6건을 다 받는다', posts.length, 6)
  ok('러너: 요청 URL 에 쿼리가 붙지 않는다', h.log.fetched.every((u) => !u.includes('?')))
  ok('러너: 새 리뷰가 적재된다', r.stats.newReviews > 0)
  ok('러너: 목록 때문에 파싱 실패가 생기지 않는다', r.stats.parseFailures === 0)

  const last = h.log.saves[h.log.saves.length - 1]
  t('러너: 마지막 커서는 큐가 빈 상태 + last', last.cursor, '{"q":[],"last":"19268762"}')
  t('러너: 타깃은 열려 있다', last.status, 'active')
  t('러너: 신규가 있으니 연속 0건 카운터는 0', last.consecutiveEmpty, 0)
  ok('러너: 이번 실행 몫을 다 읽었다고 적는다', r.perTarget[0].outcome.includes('커서 유지'))
  ok('러너: 페이지 상한에 걸린 것으로 적지 않는다', !r.perTarget[0].outcome.includes('페이지 상한'))
}

{
  // 2회차 — 커서의 last 가 최신이라 목록만 1요청. **글은 다시 받지 않는다.**
  const h = harness({
    adapter: clienAdapter,
    listUrl: `${CLIEN_HOST}/service/board/use`,
    listBody: fx('clien', 'board-list.html'),
    postBody: fx('clien', 'post-with-comments.html'),
    targets: [target({ cursor: '{"q":[],"last":"19268762"}' })],
  })
  const r = await runCollection(clienAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  t('증분: 새 글이 없으면 목록 1요청으로 끝난다', r.pagesFetched, 1)
  t('증분: 신규 0건', r.stats.newReviews, 0)
  t('증분: 연속 0건 카운터가 1 올라간다', h.log.saves[h.log.saves.length - 1].consecutiveEmpty, 1)
  t('증분: 아직 닫지 않는다', h.log.saves[h.log.saves.length - 1].status, 'active')
}

{
  // 안전장치 — 조용한 게시판은 연속 N회 0건에서 닫힌다. 게시판 타깃도 같은 규칙이다.
  const h = harness({
    adapter: clienAdapter,
    listUrl: `${CLIEN_HOST}/service/board/use`,
    listBody: fx('clien', 'board-list.html'),
    postBody: fx('clien', 'post-with-comments.html'),
    targets: [target({ cursor: '{"q":[],"last":"19268762"}', consecutiveEmpty: MAX_CONSECUTIVE_EMPTY - 1 })],
  })
  const r = await runCollection(clienAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  t(`안전장치: 연속 ${MAX_CONSECUTIVE_EMPTY}회 0건이면 닫는다`, h.log.saves[h.log.saves.length - 1].status, 'exhausted')
  ok(
    '안전장치: 닫은 근거 수치가 로그에 남는다(§7.2)',
    r.perTarget[0].outcome.includes(
      `연속 ${MAX_CONSECUTIVE_EMPTY}회 0건 → 닫음(${MAX_CONSECUTIVE_EMPTY}/${MAX_CONSECUTIVE_EMPTY})`,
    ),
  )
  ok('안전장치: 커서는 남는다 — 사람이 되살리면 이어 읽는다', h.log.saves[h.log.saves.length - 1].cursor !== null)
}

{
  // 큐가 중간에 잘려도(일일 상한) 다음 실행이 목록부터 다시 읽지 않는다.
  const h = harness({
    adapter: clienAdapter,
    listUrl: `${CLIEN_HOST}/service/board/use`,
    listBody: fx('clien', 'board-list.html'),
    postBody: fx('clien', 'post-with-comments.html'),
    targets: [target({ cursor: '{"q":["/service/board/use/19268374","/service/board/use/19268358"],"last":"19268762"}' })],
  })
  const r = await runCollection(clienAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  t('재개: 남은 큐 2건만 받는다(목록은 안 받는다)', r.pagesFetched, 2)
  t('재개: 큐 순서를 지킨다', h.log.fetched[1], `${CLIEN_HOST}/service/board/use/19268374`)
  t('재개: 다 읽으면 커서는 빈 큐로 남는다', h.log.saves[h.log.saves.length - 1].cursor, '{"q":[],"last":"19268762"}')
}

{
  // 다른 두 사이트도 같은 경계면을 통과한다 — 목록 1 + 글 6.
  const cook = harness({
    adapter: cook82Adapter,
    listUrl: `${COOK_HOST}/entiz/enti.php?bn=15`,
    listBody: fx('82cook', 'board-list.html'),
    postBody: fx('82cook', 'post-with-comments.html'),
    targets: [target({ sourceKey: '82cook', productRef: 'board:15' })],
  })
  const rc = await runCollection(cook82Adapter, { dryRun: false, targetLimit: 5 }, cook.ports)
  t('82cook 러너: 목록 1 + 글 6', rc.pagesFetched, 7)
  ok('82cook 러너: 새 리뷰가 적재된다', rc.stats.newReviews > 0)
  t('82cook 러너: 커서 유지', cook.log.saves[cook.log.saves.length - 1].cursor, '{"q":[],"last":"4242494"}')

  const bob = harness({
    adapter: bobaedreamAdapter,
    listUrl: `${BOBAE_HOST}/list?code=freeb`,
    listBody: fx('bobaedream', 'board-list.html'),
    postBody: fx('bobaedream', 'post-with-comments.html'),
    targets: [target({ sourceKey: 'bobaedream', productRef: 'board:freeb' })],
  })
  const rb = await runCollection(bobaedreamAdapter, { dryRun: false, targetLimit: 5 }, bob.ports)
  t('bobaedream 러너: 목록 1 + 글 6', rb.pagesFetched, 7)
  ok('bobaedream 러너: 새 리뷰가 적재된다', rb.stats.newReviews > 0)
  t('bobaedream 러너: 커서 유지', bob.log.saves[bob.log.saves.length - 1].cursor, '{"q":[],"last":"3438941"}')
}

{
  // 🔴 잘못된 ref 로는 아무 요청도 나가지 않는다(SSRF 경계).
  const h = harness({
    adapter: clienAdapter,
    listUrl: 'https://never.test/',
    listBody: '',
    postBody: '',
    targets: [target({ productRef: 'board:../admin' })],
  })
  const r = await runCollection(clienAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  t('불량 ref: 요청 0건', r.requests, 0)
  ok('불량 ref: robots.txt 조차 안 받는다', h.log.fetched.length === 0)
}

// ── url: 모드가 그대로인지 ─────────────────────────────────────────
// 게시판 모드를 붙이면서 기존 타깃 형식이 깨지지 않았는지 본다.
for (const [name, adapter, ref] of [
  ['clien', clienAdapter, 'url:/service/board/park/19264755'],
  ['82cook', cook82Adapter, 'url:/entiz/read.php?num=4239440'],
  ['bobaedream', bobaedreamAdapter, 'url:/view?code=freeb&No=2000000'],
]) {
  const req = adapter.nextRequest(target({ productRef: ref, cursor: null }))
  ok(`${name}: url: 모드 첫 요청은 그 글이다`, req !== null && req.url.includes(ref.slice(4).split('?')[0]))
  t(`${name}: url: 모드는 커서가 있으면 다시 안 간다`, adapter.nextRequest(target({ productRef: ref, cursor: '1' })), null)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('게시판 순회가 틀렸다. 남의 서버에 대한 규칙과 증분이 걸려 있는 코드다.')
  process.exit(1)
}
console.log('게시판 순회 정상 — robots 판정·목록 파싱·커서 큐·증분·안전장치가 맞물린다.')
