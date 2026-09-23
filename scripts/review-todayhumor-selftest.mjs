#!/usr/bin/env node
// 오늘의유머(todayhumor) 어댑터 셀프테스트 — 저장한 픽스처로만 돈다. 네트워크 없음.
//
// 픽스처는 2026-09-16 에 실제로 받은 두 글에서 깎은 것이다
// (파싱 대상 영역은 마크업 원본 그대로, 광고·스크립트만 줄였다):
//   post-with-body.html    bestofbest_483825 — 제목 + 본문 + 원글작성시간
//   post-image-only.html   humordata_2060038 — 사진만, 원글작성시간 칸이 빔 (정상)
//   post-missing-body.html viewContent 컨테이너가 없음 (구조 변경 = 실패)
//   post-empty.html        제목도 본문도 없음 (구조 변경 = 실패)
//
// 댓글 픽스처는 2026-09-17 에 받은 실제 API 응답 원본이다(가공하지 않았다):
//   memo-list.json        parent_table=sisa&parent_id=1271155 — 7건(사용자 5 + 시스템 2)
//   memo-alias-empty.json parent_table=bestofbest&parent_id=483825 — **별칭을 그대로
//                         넣었을 때 실제로 오는 응답**. 200 에 빈 배열이다.
//
// ⚠️ 이 소스는 **1글=2요청**이다(본문 HTML → 댓글 JSON, 커서로 이어붙인다).
//    제일 중요한 검사는 "별칭 함정"이다 — URL 의 table/no 로 댓글을 부르면
//    에러 없이 0건이 온다. 그 조용한 실패를 개수 마커 대조가 잡는지 본다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { todayhumorAdapter, parseProductRef, HOST } from '../lib/review/adapters/todayhumor.ts'
import { runCollection } from '../lib/review/runner.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (n) => fs.readFileSync(path.join(here, '..', 'fixtures', 'review', 'todayhumor', n), 'utf8')

/** 본문 응답이 낸 커서. 2차(댓글) 요청을 만드는 유일한 입력이다. */
const MEMO_CURSOR = 'memo:sisa:1271155:5'

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

const PATH = '/board/view.php?table=bestofbest&no=483825'
const REF = `url:${PATH}`

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'todayhumor',
  productRef: REF,
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (over = {}) => ({ productRef: REF, cursor: null, ...over })

// ── product_ref 파싱 — 여기가 SSRF 경계다 ─────────────────────────
t('ref: 쿼리형 경로를 그대로 읽는다', parseProductRef(REF), PATH)
ok('ref: & 가 든 쿼리가 통과한다 (82cook 선례)', parseProductRef(REF).includes('&'))
t('ref: 앞뒤 공백 허용', parseProductRef(`  ${REF}  `), PATH)
t('ref: URL: 대문자 접두도 허용', parseProductRef(`URL:${PATH}`), PATH)
t('ref: url: 접두가 없으면 null', parseProductRef(PATH), null)
t('ref: 경로가 / 로 시작하지 않으면 null', parseProductRef('url:board/view.php?no=1'), null)
t('ref: .. 가 있으면 null', parseProductRef('url:/board/../admin'), null)
t('ref: // 로 시작하면 null (스킴 상대 URL 차단)', parseProductRef('url://evil.example/x'), null)
t('ref: 경로 중간의 // 도 null', parseProductRef('url:/board//evil'), null)
t('ref: @ 가 있으면 null (userinfo 차단)', parseProductRef('url:/board@evil.example'), null)
t('ref: 호스트를 통째로 넣으면 null', parseProductRef('url:https://evil.example/board/view.php'), null)
t('ref: 공백이 섞이면 null', parseProductRef('url:/board/view.php?no=1 2'), null)
t('ref: 역슬래시는 null', parseProductRef('url:/board\\evil'), null)
t('ref: 빈 값은 null', parseProductRef(''), null)
t('ref: url: 뒤가 비면 null', parseProductRef('url:'), null)

// ── nextRequest ───────────────────────────────────────────────────
t('URL: 호스트 상수 + 경로', todayhumorAdapter.nextRequest(target()).url, `${HOST}${PATH}`)
t('URL: 호스트가 www.todayhumor.co.kr 과 정확히 일치', new URL(todayhumorAdapter.nextRequest(target()).url).host, 'www.todayhumor.co.kr')
// ⚠️ 이 두 줄이 이 어댑터에서 제일 중요한 검사다.
//    무www 오리진은 **https → http 로 내려가는** 리다이렉트를 준다(실측).
//    러너는 redirect:'follow' 라 그걸 조용히 따라가고, 그때부터 평문이다.
ok('URL: www 오리진을 쓴다 (무www 는 http 로 다운그레이드된다)', todayhumorAdapter.nextRequest(target()).url.startsWith('https://www.'))
ok('URL: http 로 시작하지 않는다', !/^http:\/\//.test(todayhumorAdapter.nextRequest(target()).url))
t('URL: 잘못된 ref 면 요청하지 않는다', todayhumorAdapter.nextRequest(target({ productRef: 'url://evil.example/x' })), null)
t('URL: 호스트가 든 ref 로 남의 서버를 때리지 않는다', todayhumorAdapter.nextRequest(target({ productRef: 'url:https://evil.example/a' })), null)
t('URL: 알 수 없는 커서면 요청하지 않는다', todayhumorAdapter.nextRequest(target({ cursor: '1' })), null)

// ── 2차 요청(댓글 API) ────────────────────────────────────────────
{
  const u = todayhumorAdapter.nextRequest(target({ cursor: MEMO_CURSOR })).url
  const q = new URL(u).searchParams
  t('댓글URL: 경로는 ajax_memo_list.php', new URL(u).pathname, '/board/ajax_memo_list.php')
  t('댓글URL: 호스트는 여전히 www 상수', new URL(u).host, 'www.todayhumor.co.kr')
  // 🔴 이 두 줄이 별칭 함정의 방지선이다. URL 의 table=bestofbest / no=483825 가
  //    아니라 본문에서 읽은 원본(sisa / 1271155)이 들어가야 한다.
  t('댓글URL: parent_table 은 원본(별칭 아님)', q.get('parent_table'), 'sisa')
  t('댓글URL: parent_id 는 원본(별칭 아님)', q.get('parent_id'), '1271155')
  ok('댓글URL: 별칭 table 이 들어가지 않는다', !u.includes('bestofbest'))
  t('댓글URL: 한 번에 전부 받는다', q.get('get_all_memo'), 'Y')

  // 커서는 DB 를 거쳐 돌아온다 = 신뢰 경계. 형식이 조금이라도 어긋나면 안 간다.
  for (const bad of [
    'memo:sisa:1271155', // 개수 없음
    'memo:sisa:abc:5', // id 가 숫자가 아님
    'memo:si sa:1:5', // 공백
    'memo:sisa:1:5&x=1', // 쿼리 주입
    'memo:../../etc:1:5', // 경로 탈출
    'memo:sisa:1:5\n', // 개행
  ]) {
    t(`댓글URL: 오염된 커서(${JSON.stringify(bad)})면 요청하지 않는다`, todayhumorAdapter.nextRequest(target({ cursor: bad })), null)
  }
}

// ── 정상 글 ───────────────────────────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-with-body.html'), ctx())

  t('정상: 본문 1건', r.reviews.length, 1)
  t('정상: 파싱 실패 0', r.parseFailures, 0)
  t('정상: 댓글 커서를 낸다 — 1글=2요청', r.nextCursor, MEMO_CURSOR)
  t('정상: filtered 를 쓰지 않는다', r.filtered, undefined)

  const [post] = r.reviews
  t('본문: externalId 는 글 경로', post.externalId, PATH)
  t('본문: storyId 는 null', post.storyId, null)
  // ⚠️ 등록시간(2026-09-16, 베오베로 올라온 날)이 아니라 원글작성시간이다.
  //    여기가 틀리면 전부 "오늘 쓴 글"로 적재된다.
  t('본문: 원글작성시간을 쓴다 (등록시간이 아니다)', post.writtenAt, '2026-09-10')
  ok('본문: writtenAt 이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(post.writtenAt))
  ok('본문: 제목이 들어 있다', post.text.includes('조국 원장 페북글입니다'))
  ok('본문: 본문 텍스트가 들어 있다', post.text.includes('계속 혁신당이 쇄빙선 역할로'))
  ok('본문: &nbsp; 가 공백으로 풀린다', !post.text.includes('&nbsp;'))
  // writerInfoContents 가 본문 바로 위에 있다. 슬라이스 시작점이 밀리면
  // 작성자 닉네임·IP·조회수가 리뷰 텍스트로 들어간다.
  ok('본문: 작성자 정보를 삼키지 않는다', !post.text.includes('아리나케이져'))
  ok('본문: IP 를 삼키지 않는다', !post.text.includes('125.185'))
  ok('본문: 게시물ID 줄을 삼키지 않는다', !post.text.includes('게시물ID'))

  t('전건: rating 은 항상 null', post.rating, null)
  t('전건: seller 는 항상 null', post.seller, null)
  t('전건: authorMasked 는 항상 null', post.authorMasked, null)
}

// ── 댓글은 여전히 정적 HTML 에 없다 (그래서 2차 요청이 필요하다) ──
{
  const html = fx('post-with-body.html')
  ok('본문HTML: 개수 마커가 있다 (`댓글 : N개`)', /<div>댓글 : \d+개<\/div>/.test(html))
  ok('본문HTML: memoContainerDiv 는 비어 있다', /<div id='memoContainerDiv'><\/div>/.test(html))
  const r = todayhumorAdapter.parse(html, ctx())
  t('본문HTML: 1차 응답에서는 댓글이 0건이다', r.reviews.length, 1)
  t('본문HTML: 그걸 실패로 세지 않는다 (2차에서 받는다)', r.parseFailures, 0)
}

// ── 2차 응답: 댓글 JSON ───────────────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('memo-list.json'), ctx({ cursor: MEMO_CURSOR }))

  // 응답 7건 = 사용자 5 + 시스템 2. 시스템 항목은 게시판 이동 기록이다.
  t('댓글: 사용자 댓글 5건', r.reviews.length, 5)
  t('댓글: 파싱 실패 0', r.parseFailures, 0)
  t('댓글: 커서를 더 내지 않는다 (get_all_memo=Y)', r.nextCursor, null)

  const texts = r.reviews.map((x) => x.text)
  ok('댓글: 시스템 메시지를 버린다 (MOVE_HUMORBEST)', !texts.some((x) => x.includes('MOVE_HUMORBEST')))
  ok('댓글: 시스템 메시지를 버린다 (MOVE_BESTOFBEST)', !texts.some((x) => x.includes('MOVE_BESTOFBEST')))

  const [first] = r.reviews
  t('댓글: externalId 는 글경로#댓글id', first.externalId, `${PATH}#102602895`)
  t('댓글: storyId 는 글 경로', first.storyId, PATH)
  t('댓글: writtenAt 은 date 의 날짜부', first.writtenAt, '2026-09-11')
  ok('댓글: writtenAt 이 YYYY-MM-DD', r.reviews.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.writtenAt)))
  ok('댓글: &nbsp; 가 공백으로 풀린다', !texts.some((x) => x.includes('&nbsp;')))
  ok('댓글: <br/> 태그가 남지 않는다', !texts.some((x) => x.includes('<br')))
  ok('댓글: 본문이 실제로 들어 있다', first.text.includes('앞으로 나아가고 있다니'))
  ok('댓글: 전건 rating/seller/authorMasked 는 null', r.reviews.every((x) => x.rating === null && x.seller === null && x.authorMasked === null))
  // ip 는 사이트가 마스킹해서 주지만 담지 않는다(기존 원칙).
  ok('댓글: IP 를 텍스트에 담지 않는다', !texts.some((x) => /\d+\.\d+\.\*\*\*/.test(x)))
  ok('댓글: externalId 가 전부 다르다', new Set(r.reviews.map((x) => x.externalId)).size === 5)
}

// ── 🔴 별칭 함정: 빈 배열을 "댓글 없음"으로 접지 않는다 ───────────
{
  // 실제 응답이다 — 별칭(bestofbest/483825)을 넣으면 200 에 memos:[] 가 온다.
  const body = fx('memo-alias-empty.json')
  ok('별칭: 응답 자체는 정상처럼 보인다 (에러 필드가 없다)', !body.includes('error'))

  const r = todayhumorAdapter.parse(body, ctx({ cursor: MEMO_CURSOR }))
  t('별칭: 리뷰 0건', r.reviews.length, 0)
  // 이 한 줄이 §7.1 그 자체다. 5개라던 댓글이 0건이면 "없음"이 아니라 "못 읽음"이다.
  t('별칭: 선언된 5건을 전부 실패로 센다', r.parseFailures, 5)
}

// ── 댓글 응답이 깨진 경우 ─────────────────────────────────────────
for (const [name, body] of [
  ['JSON 이 아님', '<html>점검 중</html>'],
  ['빈 문자열', ''],
  ['memos 키가 없음', '{"is_more_memo":"false"}'],
  ['memos 가 배열이 아님', '{"memos":{}}'],
]) {
  let threw = false
  let r = null
  try {
    r = todayhumorAdapter.parse(body, ctx({ cursor: MEMO_CURSOR }))
  } catch {
    threw = true
  }
  t(`댓글깨짐(${name}): throw 하지 않는다`, threw, false)
  ok(`댓글깨짐(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
  ok(`댓글깨짐(${name}): 리뷰 0건`, r && r.reviews.length === 0)
}

// ── 개수 마커/부모키 소실 — 확인 불가는 실패다 ────────────────────
{
  const html = fx('post-with-body.html')

  const noMarker = todayhumorAdapter.parse(html.replace('<div>댓글 : 5개</div>', ''), ctx())
  ok('마커소실: 실패로 센다 (0건으로 접지 않는다)', noMarker.parseFailures >= 1)
  t('마커소실: 댓글 요청을 만들지 않는다', noMarker.nextCursor, null)
  t('마커소실: 본문은 그대로 살아 있다', noMarker.reviews.length, 1)

  const noParent = todayhumorAdapter.parse(html.replace('var parent_table = "sisa";', ''), ctx())
  ok('부모키소실: 실패로 센다', noParent.parseFailures >= 1)
  // ⚠️ 여기서 URL 의 table/no 로 대신 가면 조용히 0건이 온다. 차라리 안 간다.
  t('부모키소실: 별칭으로 대신 가지 않는다', noParent.nextCursor, null)
}

// ── 사진만 있는 글 — 실패가 아니다 ────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-image-only.html'), ctx())
  t('사진만: 1건 남는다 (제목)', r.reviews.length, 1)
  t('사진만: 실패로 세지 않는다', r.parseFailures, 0)
  // `댓글 : 0개` — 진짜 0건이다. 확인된 0 이므로 2차 요청을 만들지 않는다.
  t('사진만: 댓글 0건이면 2차 요청을 하지 않는다', r.nextCursor, null)
  ok('사진만: 제목이 텍스트가 된다', r.reviews[0].text.includes('치매로 비참하게'))
  // 일반 보드는 원글작성시간 칸이 비어 있다(`<div></div>`). 그때만 등록시간으로 내려간다.
  t('사진만: 원글작성시간이 없으면 등록시간으로 내려간다', r.reviews[0].writtenAt, '2026-09-16')
}

// ── 본문 컨테이너 소실 — 실패다 ───────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-missing-body.html'), ctx())
  ok('본문소실: parseFailures > 0', r.parseFailures > 0)
  t('본문소실: 제목이 있어도 리뷰를 만들지 않는다', r.reviews.length, 0)
  ok('본문소실: 사진만 있는 글과 다른 값이다', r.parseFailures !== 0)
}

// ── 제목도 본문도 없음 — 실패다 ───────────────────────────────────
{
  const r = todayhumorAdapter.parse(fx('post-empty.html'), ctx())
  ok('전부빔: parseFailures > 0', r.parseFailures > 0)
  t('전부빔: 리뷰 0건', r.reviews.length, 0)
}

// ── 닫는 주석이 사라져도 옆 영역을 통째로 삼키지 않는지 ───────────
{
  // `</div><!--viewContent-->` 가 사라지면 슬라이스가 문서 끝까지 간다.
  // 그러면 본문 뒤의 출처·스크랩 영역이 리뷰 텍스트로 섞이는데, **어댑터는
  // 그 상태를 감지하지 못한다**(텍스트가 나오니 실패로도 안 잡힌다).
  // 알려진 한계다 — 감시는 사람이 보는 길이 이상 탐지에 맡긴다.
  // ponytail: 닫는 주석 하나에 의존. 깨지면 div 세기(damoang sliceDiv)로 올려라.
  const r = todayhumorAdapter.parse(fx('post-with-body.html').replace('</div><!--viewContent-->', '</div>'), ctx())
  t('닫는주석 소실: 그래도 throw 하지 않는다', r.reviews.length, 1)
  ok('닫는주석 소실: 본문 자체는 살아 있다', r.reviews[0].text.includes('계속 혁신당이 쇄빙선 역할로'))
}

// ── 쓰레기 입력 ───────────────────────────────────────────────────
for (const [name, body] of [
  ['빈 문자열', ''],
  ['HTML 이 아님', 'not html at all'],
  ['빈 태그뿐', '<html><body></body></html>'],
  ['제목만 있고 본문 없음', '<meta property="og:title" content="x"/>'],
]) {
  let threw = false
  let r = null
  try {
    r = todayhumorAdapter.parse(body, ctx())
  } catch {
    threw = true
  }
  t(`쓰레기(${name}): throw 하지 않는다`, threw, false)
  ok(`쓰레기(${name}): parseFailures >= 1`, r && r.parseFailures >= 1)
  ok(`쓰레기(${name}): 리뷰 0건`, r && r.reviews.length === 0)
}

// ══ 러너 통합 — 커서 왕복이 실제로 도는지 ══════════════════════════
//
// 위 단위 테스트는 커서를 **손으로** 넘겨 준다. 러너가 그 커서를 저장하고
// 다음 nextRequest 에 다시 넣어 주지 않으면 댓글은 영영 안 온다 — 그런데
// 그때도 본문 1건은 정상 수집되므로 로그는 초록불이다(§7.1 사례 5, §7.2).
{
  const fetched = []
  const inputs = []
  const seen = new Map()
  let clock = 1_000_000

  const result = await runCollection(
    todayhumorAdapter,
    { dryRun: false, targetLimit: 1 },
    {
      now: () => new Date(clock),
      async sleep(ms) {
        clock += ms
      },
      async fetchText(url) {
        fetched.push(url)
        clock += 10
        // 실측: 양 오리진 모두 robots.txt 가 404 다 = 규칙 없음 = 허용.
        if (url.endsWith('/robots.txt')) return { status: 404, body: 'Not Found' }
        if (url.includes('ajax_memo_list.php')) {
          // 별칭으로 왔으면 사이트가 주는 그대로 빈 배열을 돌려준다.
          const q = new URL(url).searchParams
          const alias = q.get('parent_table') !== 'sisa' || q.get('parent_id') !== '1271155'
          return { status: 200, body: fx(alias ? 'memo-alias-empty.json' : 'memo-list.json') }
        }
        return { status: 200, body: fx('post-with-body.html') }
      },
      store: {
        async loadSource() {
          return { key: 'todayhumor', enabled: true, minIntervalMs: 2000, dailyRequestCap: 200, requestsToday: 0 }
        },
        async listDueTargets() {
          return [target()]
        },
        async saveTargetProgress() {},
        async recordFingerprint(fp) {
          const prev = seen.get(fp.identityKey)
          if (prev === undefined) {
            seen.set(fp.identityKey, fp.contentHash)
            return 'new'
          }
          return prev === fp.contentHash ? 'duplicate' : 'revised'
        },
        async appendInput(i) {
          inputs.push(i)
          return `in${inputs.length}`
        },
        async linkFingerprint() {},
        async updateSourceHealth() {},
      },
    },
  )

  // ?? '' — 2차가 아예 안 나가면 여기서 throw 해서 나머지 검사가 묻힌다.
  const pages = fetched.filter((u) => !u.endsWith('/robots.txt')).map((u) => String(u))
  const at = (i) => pages[i] ?? ''
  t('통합: 요청 2건 — 본문 → 댓글', pages.length, 2)
  ok('통합: 1차는 글 페이지', at(0).includes('/board/view.php'))
  ok('통합: 2차는 댓글 API', at(1).includes('/board/ajax_memo_list.php'))
  ok('통합: 2차가 원본 부모키를 쓴다', at(1).includes('parent_table=sisa&parent_id=1271155'))
  t('통합: 적재 6건 = 본문 1 + 댓글 5', inputs.length, 6)
  t('통합: 파싱 실패 0', result.stats.parseFailures, 0)
  t('통합: 신규 6건', result.stats.newReviews, 6)
  ok('통합: 댓글 본문이 실제로 적재됐다', inputs.some((i) => i.text.includes('앞으로 나아가고 있다니')))
  ok('통합: 시스템 메시지는 적재되지 않았다', !inputs.some((i) => i.text.includes('MOVE_BESTOFBEST')))
  ok('통합: 타깃이 닫혔다', result.perTarget[0].outcome.includes('끝까지 읽음'))
  // 안전장치(페이지 상한 20)에 걸려 끝난 게 아니어야 한다(§7.2).
  // ⚠️ '상한' 부분일치로 보지 않는다 — incrementalOnly 종료 문구에도 'API 상한' 이 들어간다.
  //    러너가 안전장치로 끊었을 때만 쓰는 문구는 '페이지 상한 20 도달' 이다.
  ok('통합: 페이지 상한에 걸리지 않았다', !result.perTarget[0].outcome.includes('페이지 상한'))
  // 남헌 2026-09-23 Q3(a): 게시글에 댓글이 더 달리므로 닫지 않는다.
  ok('통합: 타깃이 active 로 남는다(incrementalOnly)', result.perTarget[0].outcome.includes('닫지 않는다'))
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('오늘의유머 파서가 틀렸다.')
  process.exit(1)
}
console.log('오늘의유머 파서 정상 — 본문+댓글 2요청이고, 별칭 함정의 빈 배열을 실패로 센다.')
