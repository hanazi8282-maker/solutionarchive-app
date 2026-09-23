#!/usr/bin/env node
// 게시판 모드(Y 몫: okky · tumblbug) 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-24 에 실제로 받은 응답이다:
//   fixtures/review/okky/robots.txt                  robots.txt 원문 (200 · 1,733B)
//   fixtures/review/okky/board-community-list.html    /community (200 · 265,203B) 에서 카드
//     4개 블록(`<time>`…제목 앵커)을 **원문 그대로** 꺼내 최소 셸에 끼운 것.
//     닉네임·아바타만 마스킹했다(`/users/0`, masked.invalid).
//   fixtures/review/okky/board-community-empty.html   위 셸에서 카드를 뺀 합성 음성 표본
//   fixtures/review/tumblbug/robots.txt               robots.txt 원문 (200 · 318B)
//   fixtures/review/tumblbug/board-discover-shell.html
//     /discover?category=technology (200 · 59,697B) 의 MOBX_STATE 중 판정에 쓰는
//     `projectStore`·`projectWarrantyStore` 를 **원문 값 그대로** 남기고 나머지(56KB)를 버린 것.
//
// ⚠️ 이 파일이 지키는 핵심 5개. 각각 과거 사고 하나에 대응한다.
//
//   1) **목록 0건은 "새 글 없음"이 아니라 파싱 실패다** (§7.1 — 파서가 컨테이너를
//      잃고도 정상 보고한 사건). okky `/community` 는 항상 20건을 준다.
//   2) **카드 안에서 `<time>` 이 제목 앵커보다 먼저 온다.** 인덱스로 zip 하면 한 칸
//      밀려 다른 글의 시각이 붙는다. 실측 순서로 고정한다.
//   3) **robots 판정은 문서가 아니라 리포 코드로 한다** (§7.1 — 읽지 못한 규칙을
//      허용으로 해석하지 마라). 실측 robots.txt 원문을 `parseRobots`·`robotsVerdict`
//      에 그대로 먹인다. 텀블벅은 **러너가 쿼리를 안 보는 구멍(SP-026)** 까지 고정한다.
//   4) **부품 테스트를 통합의 근거로 쓰지 않는다** (§7.1 5번). 실제 `runCollection`
//      을 돌려 목록→글 순회·요청 순서·타깃 상태를 확인한다.
//   5) **안전장치가 걸린 것을 정상으로 읽지 않는다** (§7.2). 게시판 타깃이
//      MAX_PAGES 상한이 아니라 **큐 소진**으로 끝나고, `incrementalOnly` 덕에
//      `exhausted` 가 아닌 `active` 로 남는 것을 러너로 확인한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { okkyAdapter, parseBoardRef as okkyBoardRef, HOST as OKKY_HOST, __internal as okkyInternal } from '../lib/review/adapters/okky.ts'
import { tumblbugAdapter, parseBoardRef as tbBoardRef, HOST as TB_HOST, __internal as tbInternal } from '../lib/review/adapters/tumblbug.ts'
import { parseRobots, robotsVerdict, robotsCrawlDelaySec, looksLikeMarkup } from '../lib/review/robots.ts'
import { runCollection, PRODUCT_TOKEN, MAX_PAGES_PER_TARGET } from '../lib/review/runner.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (...rel) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', ...rel), 'utf8')

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

const target = (over) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: over.sourceKey ?? 'okky',
  productRef: over.productRef,
  cursor: over.cursor ?? null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
})

// ════════════════════════════════════════════════════════════════════
// 1. robots — 문서가 아니라 리포 파서의 판정
// ════════════════════════════════════════════════════════════════════
{
  const raw = fx('okky', 'robots.txt')
  ok('okky robots: 마크업이 아니다(소프트 404 아님)', !looksLikeMarkup(raw))
  const g = parseRobots(raw)
  ok('okky robots: 그룹을 읽었다', g.length >= 19)
  const v = (p) => robotsVerdict(g, p, PRODUCT_TOKEN)

  // 게시판 모드가 실제로 쓰는 두 경로.
  t('okky robots: /community 허용', v('/community').state, 'allowed')
  t('okky robots: /articles/1564558 허용', v('/articles/1564558').state, 'allowed')
  // 막힌 경로는 여전히 막혀야 한다 — 규칙을 넓히지 않았다는 확인.
  t('okky robots: /api/ 금지', v('/api/v1/articles/1').state, 'disallowed')
  t('okky robots: /users/*/articles 금지', v('/users/1/articles').state, 'disallowed')
  t('okky robots: /login 금지', v('/login').state, 'disallowed')
  t('okky robots: /changes$ 금지', v('/changes').state, 'disallowed')
  // `*` 그룹에는 Crawl-delay 가 없다(bingbot 만 1초) → 간격은 DB 값이 정한다.
  t('okky robots: 우리 UA 의 Crawl-delay 선언 없음', robotsCrawlDelaySec(g, PRODUCT_TOKEN), null)
}

{
  const raw = fx('tumblbug', 'robots.txt')
  const g = parseRobots(raw)
  const v = (p) => robotsVerdict(g, p, PRODUCT_TOKEN)

  // ⚠️ 러너가 넘기는 값은 **쿼리를 뗀 pathname** 이다(SP-026). 그래서 허용/금지가
  //    갈리는 쿼리를 공용 안전장치가 못 본다 — 이 두 줄이 그 구멍 자체다.
  t('tumblbug robots: 러너가 보는 /discover 는 "규칙 없음 = 허용"', v('/discover').state, 'allowed')
  ok('tumblbug robots: 그 사유가 "일치하는 규칙 없음"이다', /일치/.test(v('/discover').reason))

  // 쿼리를 붙여 판정하면 최장 일치로 Allow 가 이긴다 — 어댑터가 이 모양만 만든다.
  t('tumblbug robots: ?category= 는 Allow 가 이긴다', v('/discover?category=technology').state, 'allowed')
  t('tumblbug robots: 그 밖의 /discover 쿼리는 금지', v('/discover?sort=popular').state, 'disallowed')
  t('tumblbug robots: /search? 금지', v('/search?q=x').state, 'disallowed')
  t('tumblbug robots: /api/ 금지', v('/api/projects').state, 'disallowed')
  t('tumblbug robots: 프로젝트 경로는 허용', v('/eastereggs').state, 'allowed')
}

// ════════════════════════════════════════════════════════════════════
// 2. okky — 게시판 ref
// ════════════════════════════════════════════════════════════════════
t('okky ref: board:community → community', okkyBoardRef('board:community'), 'community')
t('okky ref: 대문자·공백 허용', okkyBoardRef('  BOARD:Community '), 'community')
// ⚠️ `/questions` 는 상세 JSON-LD 를 실측하지 않았다. 규칙만 넓히면 조용히 0건이 된다.
t('okky ref: 미실측 slug(questions)는 거부', okkyBoardRef('board:questions'), null)
t('okky ref: 모르는 slug 거부', okkyBoardRef('board:free'), null)
t('okky ref: 경로 탈출 거부', okkyBoardRef('board:../../etc'), null)
t('okky ref: url: 는 게시판이 아니다', okkyBoardRef('url:/articles/1564214'), null)
t('okky ref: 빈 값', okkyBoardRef(''), null)

// ── 목록 파싱 ───────────────────────────────────────────────────────
{
  const html = fx('okky', 'board-community-list.html')
  const list = okkyInternal.parseBoardList(html, 'community')

  t('okky 목록: 4건을 읽었다', list.queue.length, 4)
  // 실측 순서 = 최신 우선. 큐 머리가 가장 새 글이어야 다음 실행이 새것부터 읽는다.
  t('okky 목록: 큐 머리', list.queue[0], '/articles/1564558')
  t('okky 목록: 큐 꼬리', list.queue[3], '/articles/1564554')
  t('okky 목록: lastId 는 최대 id', list.lastId, '1564558')
  t('okky 목록: 정상은 실패 0', list.parseFailures, 0)
  // 핵심 2) **(경로, 시각) 쌍 자체**를 본다. 건수만 세면 한 칸 밀린 파서도 통과한다.
  //   실측 문서의 배치는 time0 anchor0 time1 anchor1 … 로 엄격히 교대한다(앵커 20개 ·
  //   `<time>` 20개, 앵커 사이마다 정확히 1개). 그래서 "앵커 직전의 시각"이 유일한
  //   올바른 읽기다. "앵커 **뒤**의 첫 시각"으로 읽는 파서는 아래에서 전부 깨진다.
  t('okky 목록: 4건 전부 시각이 붙었다', list.timed, 4)
  t(
    'okky 목록: (경로, 시각) 쌍이 실측과 같다',
    list.items.map((i) => `${i.path}=${i.at}`).join('\n'),
    [
      '/articles/1564558=2026-09-24T00:59:11',
      '/articles/1564557=2026-09-24T00:04:42',
      '/articles/1564556=2026-09-23T23:50:19',
      '/articles/1564554=2026-09-23T22:21:56',
    ].join('\n'),
  )

  // 시각만 사라진 경우 = 카드 구조 변경. 0건이 아니라 실패다.
  const noTime = html.replace(/<time[^>]*>/g, '<span>')
  const l2 = okkyInternal.parseBoardList(noTime, 'community')
  t('okky 목록: 시각 마커 전멸은 실패 1', l2.parseFailures, 1)
  t('okky 목록: 그래도 글은 큐에 담는다', l2.queue.length, 4)

  // 다른 목록의 글(topic 불일치)은 큐에 넣지 않는다.
  const foreign = html.replace(/\?topic=community/g, '?topic=knowledge')
  t('okky 목록: 남의 topic 은 큐에서 제외', okkyInternal.parseBoardList(foreign, 'community').queue.length, 0)
  t('okky 목록: 그 결과 0건이면 실패 1', okkyInternal.parseBoardList(foreign, 'community').parseFailures, 1)

  // 핵심 1) 컨테이너가 사라진 경우.
  const empty = fx('okky', 'board-community-empty.html')
  const l3 = okkyInternal.parseBoardList(empty, 'community')
  t('okky 목록: 컨테이너 없음 = 실패 1', l3.parseFailures, 1)
  t('okky 목록: 컨테이너 없음 = 큐 0', l3.queue.length, 0)

  // 목록 상한. 커서가 DB text 한 칸이라 구조적으로 묶여 있어야 한다.
  const many = Array.from({ length: 40 }, (_, i) => `<time dateTime="2026-09-24T00:00:00"></time><a href="/articles/${1600000 + i}?topic=community">t</a>`).join('')
  t('okky 목록: 한 실행 몫(19)으로 자른다', okkyInternal.parseBoardList(many, 'community').queue.length, 19)
}

// ── 어댑터 계약(목록 패스 → 글 패스) ────────────────────────────────
{
  const html = fx('okky', 'board-community-list.html')
  const REF = 'board:community'

  t('okky 요청: 커서 없으면 목록', okkyAdapter.nextRequest(target({ productRef: REF })).url, `${OKKY_HOST}/community`)

  const listed = okkyAdapter.parse(html, { productRef: REF, cursor: null })
  t('okky 목록 패스: 리뷰 0건', listed.reviews.length, 0)
  t('okky 목록 패스: 실패 0', listed.parseFailures, 0)
  ok('okky 목록 패스: 커서를 낸다', typeof listed.nextCursor === 'string')
  const cur = JSON.parse(listed.nextCursor)
  t('okky 커서: 버전', cur.v, 1)
  t('okky 커서: lastId', cur.lastId, '1564558')
  t('okky 커서: 큐 4건', cur.queue.length, 4)

  // 같은 커서를 다시 주면 러너는 큐 머리를 요청한다.
  t(
    'okky 요청: 커서가 있으면 큐 머리',
    okkyAdapter.nextRequest(target({ productRef: REF, cursor: listed.nextCursor })).url,
    `${OKKY_HOST}/articles/1564558`,
  )

  // 손상된 커서는 목록부터 다시 — 타깃이 영구히 멈추지 않는다.
  t('okky 요청: 깨진 커서는 목록으로 복구', okkyAdapter.nextRequest(target({ productRef: REF, cursor: '{not json' })).url, `${OKKY_HOST}/community`)
  t('okky 요청: 빈 큐도 목록으로 복구', okkyAdapter.nextRequest(target({ productRef: REF, cursor: '{"v":1,"queue":[],"lastId":"1"}' })).url, `${OKKY_HOST}/community`)
  t(
    'okky 요청: 큐에 든 이상한 경로는 버린다',
    okkyAdapter.nextRequest(target({ productRef: REF, cursor: '{"v":1,"queue":["/etc/passwd"],"lastId":null}' })).url,
    `${OKKY_HOST}/community`,
  )

  // 글 패스 — `url:` 모드와 **완전히 같은 결과**여야 한다(파서를 한 벌만 쓴다).
  const article = fx('okky', 'article-with-comments.html')
  const viaUrl = okkyAdapter.parse(article, { productRef: 'url:/articles/1564214', cursor: null })
  const boardCursor = JSON.stringify({ v: 1, queue: ['/articles/1564214', '/articles/1564213'], lastId: '1564214' })
  const viaBoard = okkyAdapter.parse(article, { productRef: REF, cursor: boardCursor })
  ok('okky 글 패스: 리뷰를 읽었다', viaBoard.reviews.length > 0)
  t('okky 글 패스: url: 모드와 건수 동일', viaBoard.reviews.length, viaUrl.reviews.length)
  t(
    'okky 글 패스: url: 모드와 externalId 동일',
    viaBoard.reviews.map((r) => r.externalId).join('|'),
    viaUrl.reviews.map((r) => r.externalId).join('|'),
  )
  t('okky 글 패스: 실패 수 동일', viaBoard.parseFailures, viaUrl.parseFailures)
  t('okky 글 패스: 남은 큐를 커서로 낸다', JSON.parse(viaBoard.nextCursor).queue.join(','), '/articles/1564213')

  // 큐 마지막 글 → 커서 null. (러너는 incrementalOnly 라 active 로 남긴다 — 아래 통합)
  const lastOne = okkyAdapter.parse(article, {
    productRef: REF,
    cursor: JSON.stringify({ v: 1, queue: ['/articles/1564214'], lastId: '1564214' }),
  })
  t('okky 글 패스: 큐 소진이면 커서 null', lastOne.nextCursor, null)

  // 큐 머리와 다른 글이 오면 받지 않는다(리다이렉트·canonical 사고 — SP-031).
  const wrongScope = okkyAdapter.parse(article, {
    productRef: REF,
    cursor: JSON.stringify({ v: 1, queue: ['/articles/9999999'], lastId: '9999999' }),
  })
  t('okky 글 패스: 다른 글이 오면 0건', wrongScope.reviews.length, 0)
  t('okky 글 패스: 그건 실패 1이다', wrongScope.parseFailures, 1)
}

// ════════════════════════════════════════════════════════════════════
// 3. tumblbug — 카테고리 목록은 CSR 이라 **못 읽는다**(0건이 아니다)
// ════════════════════════════════════════════════════════════════════
t('tumblbug ref: board:discover:technology', tbBoardRef('board:discover:technology'), 'technology')
t('tumblbug ref: 대문자 허용', tbBoardRef('BOARD:DISCOVER:Technology'), 'technology')
t('tumblbug ref: 카테고리 없으면 null', tbBoardRef('board:discover:'), null)
t('tumblbug ref: 쿼리 스머글링 거부', tbBoardRef('board:discover:tech&sort=popular'), null)
t('tumblbug ref: 경로 문자 거부', tbBoardRef('board:discover:a/b'), null)
t('tumblbug ref: url: 는 게시판이 아니다', tbBoardRef('url:/eastereggs'), null)

{
  const REF = 'board:discover:technology'
  // robots 가 연 **정확히 그 모양**만 만든다. 다른 쿼리가 새면 이 단정이 깨진다.
  t(
    'tumblbug 요청: /discover?category=<slug> 딱 이 URL',
    tumblbugAdapter.nextRequest(target({ sourceKey: 'tumblbug', productRef: REF })).url,
    `${TB_HOST}/discover?category=technology`,
  )

  const shell = fx('tumblbug', 'board-discover-shell.html')
  const listed = tumblbugAdapter.parse(shell, { productRef: REF, cursor: null })
  t('tumblbug 목록: 프로젝트 0건', listed.reviews.length, 0)
  // ⛔ 핵심 — 0건 정상이 아니라 **실패**로 보고해야 한다(§7.1).
  t('tumblbug 목록: CSR 껍데기는 실패 1', listed.parseFailures, 1)
  t('tumblbug 목록: 큐를 못 만들었으니 커서 null', listed.nextCursor, null)
  // 실측값 자체를 고정한다 — 텀블벅이 SSR 로 바꾸면 이 줄이 먼저 깨진다.
  t('tumblbug 목록: 실측 projectStore.projects 는 빈 배열', JSON.stringify(tbInternal.readState(shell).projectStore.projects), '[]')

  // hydration 이 통째로 없는 것과 "있는데 빈 배열"은 다른 사건이다 — 둘 다 실패지만 구분해 둔다.
  t('tumblbug 목록: state 자체가 없어도 실패 1', tbInternal.parseDiscoverList('<html></html>').parseFailures, 1)
  // projects 키가 사라진 경우.
  t('tumblbug 목록: projects 키 소실도 실패 1', tbInternal.parseDiscoverList('<script>window.MOBX_STATE = {"projectStore":{}};</script>').parseFailures, 1)
  // 목록이 실제로 오면(=사이트가 SSR 로 바뀌면) 큐가 채워진다.
  const ssr = '<script>window.MOBX_STATE = {"projectStore":{"projects":[{"permalink":"alpha"},{"permalink":"beta"}]}};</script>'
  t('tumblbug 목록: 프로젝트가 오면 큐 2건', tbInternal.parseDiscoverList(ssr).queue.join(','), '/alpha,/beta')
  t('tumblbug 목록: 그때는 실패 0', tbInternal.parseDiscoverList(ssr).parseFailures, 0)

  // 프로젝트 패스는 `url:` 모드와 같은 파서를 쓴다(큐가 채워지는 날을 위해 고정).
  const project = fx('tumblbug', 'project-with-reviews.html')
  const viaUrl = tumblbugAdapter.parse(project, { productRef: 'url:/eastereggs', cursor: null })
  const viaBoard = tumblbugAdapter.parse(project, {
    productRef: REF,
    cursor: JSON.stringify({ v: 1, queue: ['/eastereggs'], lastId: 'eastereggs' }),
  })
  ok('tumblbug 프로젝트 패스: 후기를 읽었다', viaBoard.reviews.length > 0)
  t('tumblbug 프로젝트 패스: url: 모드와 건수 동일', viaBoard.reviews.length, viaUrl.reviews.length)
  t('tumblbug 프로젝트 패스: filtered 동일', viaBoard.filtered, viaUrl.filtered)
  t('tumblbug 프로젝트 패스: 큐 소진이면 커서 null', viaBoard.nextCursor, null)
}

// ════════════════════════════════════════════════════════════════════
// 4. 통합 — 실제 러너로 목록→글 순회 (부품 테스트를 통합의 근거로 쓰지 않는다)
// ════════════════════════════════════════════════════════════════════
async function runBoard({ sourceKey, adapter, ref, robots, bodyFor }) {
  const seenUrls = []
  const inputs = []
  const saves = []
  const seenFp = new Map()
  let clock = 5_000_000

  const result = await runCollection(
    adapter,
    { dryRun: false, targetLimit: 5 },
    {
      now: () => new Date(clock),
      async sleep(ms) {
        clock += ms
      },
      async fetchText(url) {
        seenUrls.push(url)
        clock += 10
        if (url.endsWith('/robots.txt')) return { status: 200, body: robots }
        const body = bodyFor(url)
        return body === null ? { status: 404, body: '' } : { status: 200, body }
      },
      store: {
        async loadSource() {
          return { key: sourceKey, enabled: true, minIntervalMs: 3000, dailyRequestCap: 100, requestsToday: 0 }
        },
        async listDueTargets() {
          return [target({ sourceKey, productRef: ref })]
        },
        async saveTargetProgress(p) {
          saves.push(p)
        },
        async recordFingerprint(fp) {
          if (seenFp.has(fp.identityKey)) return seenFp.get(fp.identityKey) === fp.contentHash ? 'duplicate' : 'revised'
          seenFp.set(fp.identityKey, fp.contentHash)
          return 'new'
        },
        async appendInput(input) {
          inputs.push(input)
          return `in-${inputs.length}`
        },
        async linkFingerprint() {},
        async updateSourceHealth() {},
      },
    },
  )
  return { result, seenUrls, inputs, saves }
}

{
  const listHtml = fx('okky', 'board-community-list.html')
  const article = fx('okky', 'article-with-comments.html')
  // 픽스처 하나로 4개 글을 흉내낸다 — 글 id 를 **전부** 바꿔야 JSON-LD 의 url 과
  // 댓글 url 이 서로 맞는다(안 맞으면 스코프 검사가 먼저 걸려 0건이 된다).
  const articleFor = (id) => article.replaceAll('1564214', id)
  const ids = ['1564558', '1564557', '1564556', '1564554']

  const { result, seenUrls, inputs, saves } = await runBoard({
    sourceKey: 'okky',
    adapter: okkyAdapter,
    ref: 'board:community',
    robots: fx('okky', 'robots.txt'),
    bodyFor(url) {
      if (url === `${OKKY_HOST}/community`) return listHtml
      const m = /\/articles\/(\d+)$/.exec(url)
      return m && ids.includes(m[1]) ? articleFor(m[1]) : null
    },
  })

  t('okky 통합: 건너뛰지 않았다', result.skipped, false)
  t('okky 통합: robots 차단 0', result.robotsSkips, 0)
  // 요청 순서: robots → 목록 → 글 4개. 목록이 1회뿐인 것이 게시판 모드의 계약이다.
  t(
    'okky 통합: 요청 순서',
    seenUrls.join('\n'),
    [
      `${OKKY_HOST}/robots.txt`,
      `${OKKY_HOST}/community`,
      ...ids.map((id) => `${OKKY_HOST}/articles/${id}`),
    ].join('\n'),
  )
  t('okky 통합: 페이지 수 = 목록1 + 글4', result.pagesFetched, 5)
  ok('okky 통합: 페이지 상한(20)에 기대지 않는다', result.pagesFetched < MAX_PAGES_PER_TARGET)

  // 적재 건수 = 글마다 (본문 1 + 댓글 n). 픽스처 1건의 실제 파싱 결과로 곱해 확인한다.
  const perPost = okkyAdapter.parse(article, { productRef: 'url:/articles/1564214', cursor: null }).reviews.length
  t('okky 통합: 한 글당 파싱 건수(픽스처 실측)', perPost, 7)
  t('okky 통합: 적재 건수 = 4글 × 7', inputs.length, 4 * perPost)
  t('okky 통합: 파싱 실패 0', result.stats.parseFailures, 0)

  // §7.2 — 큐 소진으로 끝났고, incrementalOnly 라 타깃은 살아 있다.
  const last = saves[saves.length - 1]
  t('okky 통합: 마지막 커서 null(큐 소진)', last.cursor, null)
  t('okky 통합: 타깃은 active 로 남는다', last.status, 'active')
  t('okky 통합: 수집이 있었으니 consecutive_empty 0', last.consecutiveEmpty, 0)
  ok('okky 통합: 종료 사유에 상한이 아니라 "끝까지 읽음"이 찍힌다', /끝까지 읽음/.test(result.perTarget[0].outcome))
}

{
  const shell = fx('tumblbug', 'board-discover-shell.html')
  const { result, seenUrls, inputs, saves } = await runBoard({
    sourceKey: 'tumblbug',
    adapter: tumblbugAdapter,
    ref: 'board:discover:technology',
    robots: fx('tumblbug', 'robots.txt'),
    bodyFor: (url) => (url === `${TB_HOST}/discover?category=technology` ? shell : null),
  })

  t('tumblbug 통합: 건너뛰지 않았다', result.skipped, false)
  t('tumblbug 통합: robots 차단 0', result.robotsSkips, 0)
  t(
    'tumblbug 통합: 허용된 쿼리로만 요청한다',
    seenUrls.join('\n'),
    [`${TB_HOST}/robots.txt`, `${TB_HOST}/discover?category=technology`].join('\n'),
  )
  t('tumblbug 통합: 적재 0건', inputs.length, 0)
  // ⛔ 0건인데 **실패가 찍혀야** 한다. 이게 "목록이 CSR 이라 못 읽었다"의 신호다.
  t('tumblbug 통합: 파싱 실패 1', result.stats.parseFailures, 1)
  const last = saves[saves.length - 1]
  t('tumblbug 통합: 타깃은 active 로 남는다', last.status, 'active')
  t('tumblbug 통합: 0건이라 consecutive_empty 1', last.consecutiveEmpty, 1)
}

console.log(`\n통과 ${pass}건`)
if (fail > 0) {
  console.log(`실패 ${fail}건`)
  process.exit(1)
}
console.log('게시판 모드(Y) 정상 — okky 는 목록→글 순회가 돌고, tumblbug 목록은 "0건"이 아니라 "못 읽음"으로 보고된다.')
