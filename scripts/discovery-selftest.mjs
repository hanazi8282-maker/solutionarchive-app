#!/usr/bin/env node
// 발굴 엔진 셀프테스트 — 네트워크·DB 없이 픽스처로만 돈다.
//
// 세 덩어리다:
//   AC-1 후보 판정 로직(lib/discovery/candidate.ts)
//   AC-2 프로브 파서(lib/discovery/probe.ts) + 픽스처
//   AC-3 타깃 등록 경로(lib/review/target-ref.ts) — 소스 전부에 빌더가 있는가
//
// ⚠️ 픽스처는 실응답의 **구조만** 보존한다(2026-09-17 채집). 다나와 쪽은
//    base64 로그 페이로드를 비웠고 HN 쪽은 댓글 본문을 합성값으로 바꿨다.
//    파서가 깨지는 건 구조지 본문이 아니다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ACTIVE_KINDS,
  MIN_VOC_HITS,
  SATURATION_LIMIT,
  judge,
  nameKey,
  nextKind,
  saturated,
  screen,
} from '../lib/discovery/candidate.ts'
import {
  danawaSearchUrl,
  hnSearchUrl,
  parseDanawaSearch,
  parseHnSearch,
  probePhysical,
  probeSaas,
} from '../lib/discovery/probe.ts'
import { REF_BUILDERS, buildProductRef } from '../lib/review/target-ref.ts'
// ⚠️ import 만으로 루프가 돌면 안 된다(남의 서버를 때린다). 아래 import 가
//    조용히 통과하는 것 자체가 "직접 실행일 때만 돈다"의 검사다.
import { parseCandidates, proposalPrompt } from './discovery-run.mjs'
import { discoveryBlocks } from './notion-push-digest.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'discovery', name), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (got === want) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── AC-1 축 선택 ──────────────────────────────────────────────────
// recent 는 최근 것이 앞(created_at DESC).
t('이력이 비면 첫 축', nextKind([]), ACTIVE_KINDS[0])
t('직전이 physical 이면 saas', nextKind(['physical']), 'saas')
t('직전이 saas 면 physical', nextKind(['saas']), 'physical')
t('둘 다 있으면 더 오래된 쪽', nextKind(['saas', 'physical']), 'physical')
t('한쪽만 계속 나왔으면 안 나온 쪽', nextKind(['saas', 'saas', 'saas']), 'physical')
t('모르는 kind 는 무시한다', nextKind(['service', 'physical']), 'saas')

// 이력 시뮬레이션 — 같은 축이 연속 두 번 나오면 안 된다.
{
  const history = []
  const seq = []
  for (let i = 0; i < 8; i++) {
    const k = nextKind(history)
    seq.push(k)
    history.unshift(k)
  }
  t('8회 돌려 축이 번갈아 나온다', seq.join(','), 'physical,saas,physical,saas,physical,saas,physical,saas')
  ok('같은 축이 연속 두 번 나오지 않는다', seq.every((k, i) => i === 0 || k !== seq[i - 1]))
  ok('service 는 뽑히지 않는다', !seq.includes('service'))
}

// ── AC-1 포화 게이트 ──────────────────────────────────────────────
const known = (names = [], cats = {}) => ({
  names: new Set(names),
  acceptedByCategory: new Map(Object.entries(cats)),
})

t('SATURATION_LIMIT 은 3', SATURATION_LIMIT, 3)
t(`같은 카테고리 ${SATURATION_LIMIT}건이면 포화`, saturated('무선이어폰', known([], { 무선이어폰: 3 })), true)
t('2건이면 아직 아니다', saturated('무선이어폰', known([], { 무선이어폰: 2 })), false)
t('4건이면 포화', saturated('무선이어폰', known([], { 무선이어폰: 4 })), true)
t('카테고리 힌트가 없으면 포화 판정 안 한다', saturated(null, known([], { 무선이어폰: 9 })), false)
t('대소문자·공백만 다른 카테고리도 같게 센다', saturated(' Wireless Earbuds ', known([], { 'wireless earbuds': 3 })), true)

// ── AC-1 이름 충돌 ────────────────────────────────────────────────
{
  const k = known([nameKey('saas', 'Notion')])
  t('같은 이름은 already_known', screen({ kind: 'saas', name: 'Notion' }, k)?.reason, 'already_known')
  t('대소문자만 달라도 already_known', screen({ kind: 'saas', name: 'NOTION' }, k)?.reason, 'already_known')
  t('앞뒤 공백만 달라도 already_known', screen({ kind: 'saas', name: '  notion ' }, k)?.reason, 'already_known')
  t('already_known 은 rejected 다', screen({ kind: 'saas', name: 'notion' }, k)?.verdict, 'rejected')
  t('kind 가 다르면 다른 이름이다', screen({ kind: 'physical', name: 'Notion' }, k), null)
  t('처음 보는 이름은 통과', screen({ kind: 'saas', name: 'Linear' }, k), null)
  t('빈 이름은 거절', screen({ kind: 'saas', name: '   ' }, k)?.reason, 'empty_name')
}
t(
  '포화 카테고리는 duplicate_category',
  screen({ kind: 'physical', name: '새이름', categoryHint: '무선이어폰' }, known([], { 무선이어폰: 3 }))?.reason,
  'duplicate_category',
)

// ── AC-1 judge: unverified 와 rejected 를 절대 섞지 않는다 ────────
t('MIN_VOC_HITS 는 30', MIN_VOC_HITS, 30)
{
  const nullHits = judge({ hits: null, ref: null, note: 'HTTP 503' })
  const zeroHits = judge({ hits: 0, ref: null, note: '0건' })
  t('hits=null → unverified', nullHits.verdict, 'unverified')
  t('hits=0 → rejected', zeroHits.verdict, 'rejected')
  ok('hits=null 과 hits=0 의 판정이 다르다', nullHits.verdict !== zeroHits.verdict)
  ok('hits=0 의 사유는 insufficient_voc', zeroHits.reason.startsWith('insufficient_voc'))
  ok('hits=null 의 사유는 probe_failed', nullHits.reason.startsWith('probe_failed'))
  ok('실패 사유 원문이 남는다', nullHits.reason.includes('HTTP 503'))
}
t('hits=29 → rejected (경계 아래)', judge({ hits: 29, ref: 'p1', note: '' }).verdict, 'rejected')
t('hits=30 → accepted (경계)', judge({ hits: 30, ref: 'p1', note: '' }).verdict, 'accepted')
t('hits=31 → accepted', judge({ hits: 31, ref: 'p1', note: '' }).verdict, 'accepted')
t('임계값을 올리면 30 도 기각된다', judge({ hits: 30, ref: 'p1', note: '' }, 50).verdict, 'rejected')
t(
  'hits 는 충분한데 ref 가 없으면 unverified — 채택하지 않는다',
  judge({ hits: 999, ref: null, note: '' }).verdict,
  'unverified',
)

// ── AC-2 다나와 검색 파서 ─────────────────────────────────────────
const dHit = await fx('danawa-search-hit.html')
const dNoMarker = await fx('danawa-search-no-review-marker.html')
const dNoResults = await fx('danawa-search-no-results.html')
const dBlocked = await fx('danawa-search-blocked.html')

{
  const r = parseDanawaSearch(dHit)
  ok('검색결과를 읽는다', r.ok)
  t('항목 4개', r.items.length, 4)
  ok('전부 pcode 가 숫자', r.items.every((i) => /^\d+$/.test(i.pcode)))
  ok('pcode 가 전부 유일하다 — 경계가 새지 않았다', new Set(r.items.map((i) => i.pcode)).size, 4)

  // ⚠️ 첫 상품은 리뷰 999+ / 의견 77 이다. 의견을 읽으면 77 이 나온다.
  t('리뷰수를 읽는다(의견 77 이 아니다)', r.items[0].reviews, 999)
  ok('999+ 는 상한 표기로 기록된다', r.items[0].capped)
  t('두 번째 상품의 리뷰수', r.items[1].reviews, 762)
  ok('두 번째는 상한 표기가 아니다', !r.items[1].capped)
  t('세 번째 상품의 리뷰수', r.items[2].reviews, 39)
  t('리뷰 마커가 없는 항목은 null (0 이 아니다)', r.items[3].reviews, null)
  ok('의견 수(77·17·7·2)를 리뷰수로 읽지 않았다', !r.items.some((i) => [77, 17, 7, 2].includes(i.reviews)))

  // 상품명은 판정이 아니라 **사람 확인용**이다. 있으면 엉뚱한 상품을 알아챌 수 있다.
  t('첫 상품의 이름을 읽는다', r.items[0].name, 'APPLE 에어팟 프로3 MFHP4KH/A')
  ok('항목마다 이름이 다르다 — 경계가 새지 않았다', new Set(r.items.map((i) => i.name)).size === 4)
}
{
  const r = parseDanawaSearch(dNoResults)
  ok('컨테이너만 있고 상품이 없으면 파싱 성공', r.ok)
  t('항목 0개', r.items.length, 0)
}
{
  const r = parseDanawaSearch(dBlocked)
  t('HTTP 200 이어도 컨테이너가 없으면 실패다', r.ok, false)
  ok('실패 사유에 컨테이너 이름이 남는다', r.error.includes('productListArea'))
}
{
  // 마커 문자열만 바꿔 본다 — 구조 변경에 조용히 넘어가지 않는지.
  const changed = dHit.replace(/dt_behind">상품리뷰</g, 'dt_behind">상품후기<')
  const r = parseDanawaSearch(changed)
  ok('라벨이 바뀌면 리뷰수를 못 읽는다', r.items.every((i) => i.reviews === null))
}

// ── AC-2 HN 검색 파서 ─────────────────────────────────────────────
const hHit = await fx('hn-search-hit.json')
const hZero = await fx('hn-search-zero.json')
const hBroken = await fx('hn-search-broken.json')
const hNoField = await fx('hn-search-no-nbhits.json')

t('nbHits 를 읽는다', parseHnSearch(hHit).nbHits, 20)
t('0건도 정상 파싱이다', parseHnSearch(hZero).nbHits, 0)
t('JSON 이 아니면 실패', parseHnSearch(hBroken).ok, false)
t('nbHits 필드가 없으면 실패', parseHnSearch(hNoField).ok, false)
t('빈 문자열도 실패', parseHnSearch('').ok, false)

// ── AC-2 프로브(가짜 fetch 포트) ──────────────────────────────────
const fakeFetch = (outcome) => async () => outcome
const okRes = (body) => ({ status: 200, body })

{
  const p = await probePhysical('무선이어폰', fakeFetch(okRes(dHit)))
  t('리뷰 최다 상품의 리뷰수를 hits 로 쓴다', p.hits, 999)
  ok('그 상품의 pcode 를 ref 로 쓴다', /^\d+$/.test(p.ref))
  t('채택 판정', judge(p).verdict, 'accepted')
}
{
  const p = await probePhysical('없는상품', fakeFetch(okRes(dNoResults)))
  t('검색결과 0건은 hits=0', p.hits, 0)
  t('0건은 rejected', judge(p).verdict, 'rejected')
}
{
  const p = await probePhysical('마커소실', fakeFetch(okRes(dNoMarker)))
  t('상품은 있는데 리뷰 마커가 없으면 hits=null', p.hits, null)
  t('그건 unverified 다 — 0건으로 접지 않는다', judge(p).verdict, 'unverified')
}
{
  const p = await probePhysical('차단', fakeFetch(okRes(dBlocked)))
  t('HTTP 200 + 컨테이너 없음 → hits=null', p.hits, null)
  t('→ unverified', judge(p).verdict, 'unverified')
}
{
  const p = await probePhysical('오류', fakeFetch({ status: 503, body: '' }))
  t('5xx → hits=null', p.hits, null)
  ok('상태코드가 사유에 남는다', p.note.includes('503'))
}
{
  const p = await probePhysical('끊김', fakeFetch({ status: null, body: '', error: 'ECONNRESET' }))
  t('네트워크 오류 → hits=null', p.hits, null)
  ok('오류 원문이 사유에 남는다', p.note.includes('ECONNRESET'))
}
{
  const p = await probeSaas('linear app', fakeFetch(okRes(hHit)))
  t('HN hits 를 읽는다', p.hits, 20)
  t('ref 는 `q:<이름>`', p.ref, 'q:linear app')
  t('20건은 최소선(30) 미달이라 기각', judge(p).verdict, 'rejected')
}
{
  const p = await probeSaas('없는이름', fakeFetch(okRes(hZero)))
  t('HN 0건은 hits=0', p.hits, 0)
  t('0건은 rejected (unverified 아님)', judge(p).verdict, 'rejected')
}
{
  const p = await probeSaas('깨진응답', fakeFetch(okRes(hBroken)))
  t('HTTP 200 + JSON 아님 → hits=null', p.hits, null)
  t('→ unverified', judge(p).verdict, 'unverified')
}

// ── AC-2 질의 URL ─────────────────────────────────────────────────
{
  const u = hnSearchUrl('linear app')
  ok('HN 질의는 따옴표로 감싼 구절이다', u.includes('query=%22linear+app%22'))
  ok('advancedSyntax 를 켠다 — 안 켜면 따옴표가 무시돼 게이트가 무력화된다', u.includes('advancedSyntax=true'))
  ok('댓글만 센다', u.includes('tags=comment'))
  ok('따옴표가 섞인 이름도 질의를 깨뜨리지 않는다', !hnSearchUrl('a"b').includes('%22a%22b%22'))
  ok('다나와 질의는 dsearch.php', danawaSearchUrl('무선 이어폰').startsWith('https://search.danawa.com/dsearch.php?query='))
}

// ── AC-2/3 경계면: 프로브가 만든 ref 가 타깃 등록을 통과하는가 ────
// ⚠️ 부품이 각각 통과해도 붙이면 안 될 수 있다(CLAUDE.md §7.1). 프로브 산출물을
//    그대로 빌더에 넣어 본다. 다나와 프로브는 pcode 를 주는데 빌더는 **URL** 을
//    받으므로, 발굴 루프가 pcode → URL 로 되돌려야 한다는 것도 여기서 드러난다.
{
  const p = await probePhysical('무선이어폰', fakeFetch(okRes(dHit)))
  const built = buildProductRef('danawa', `https://prod.danawa.com/info/?pcode=${p.ref}`)
  t('프로브 pcode → 다나와 타깃 ref', built.ok && built.productRef, p.ref)

  const s = await probeSaas('linear app', fakeFetch(okRes(hHit)))
  const builtHn = buildProductRef('hackernews', s.ref.slice(2))
  t('프로브 키워드 → HN 타깃 ref', builtHn.ok && builtHn.productRef, s.ref)
}

// ── AC-3 소스 전부에 빌더가 있는가 ────────────────────────────────
// ⚠️ 어댑터 목록(실제 수집 경로)과 대조한다. 어댑터는 있는데 빌더가 없으면
//    그 소스는 **타깃을 한 건도 등록할 수 없다** — 코드만 있고 수집은 0건이다.
//    실제로 그 상태였다(빌더 3개 / 어댑터 13개).
{
  const collectSrc = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  const block = collectSrc.slice(collectSrc.indexOf('const ADAPTERS = {'), collectSrc.indexOf('const args ='))
  const adapterKeys = [...block.matchAll(/^\s*'?([a-z0-9_]+)'?:\s*\w+Adapter,/gm)].map((m) => m[1])

  ok('어댑터 키를 실제로 읽었다', adapterKeys.length >= 13)
  const builderKeys = Object.keys(REF_BUILDERS)
  const missing = adapterKeys.filter((k) => !builderKeys.includes(k))
  const extra = builderKeys.filter((k) => !adapterKeys.includes(k))
  t(`빌더 없는 소스: ${missing.join(', ') || '없음'}`, missing.length, 0)
  t(`어댑터 없는 빌더: ${extra.join(', ') || '없음'}`, extra.length, 0)
  t('빌더 수 = 어댑터 수', builderKeys.length, adapterKeys.length)
}

// ── AC-3 빌더 동작(리팩터 전후 동일해야 하는 3종) ─────────────────
t('다나와 URL → pcode', buildProductRef('danawa', 'https://prod.danawa.com/info/?pcode=252495223').productRef, '252495223')
t('다나와: pcode 없는 URL 은 거절', buildProductRef('danawa', 'https://search.danawa.com/dsearch.php?query=x').ok, false)
t('다나와: URL 이 아니면 거절', buildProductRef('danawa', '252495223').ok, false)
t('appstore: 국가코드 기본값 kr', buildProductRef('appstore', '1459969523').productRef, 'kr:1459969523')
t('appstore: 국가코드 정규화', buildProductRef('appstore', 'US:1459969523').productRef, 'us:1459969523')
t('appstore: 숫자가 아니면 거절', buildProductRef('appstore', 'kr:abc').ok, false)
t('hackernews: q: 접두를 붙인다', buildProductRef('hackernews', 'notion').productRef, 'q:notion')
t('hackernews: 1자는 거절', buildProductRef('hackernews', 'n').ok, false)
t('hackernews: 줄바꿈은 거절', buildProductRef('hackernews', 'a\nb').ok, false)
t('hackernews: 65자는 거절', buildProductRef('hackernews', 'x'.repeat(65)).ok, false)
t('모르는 소스는 null 을 돌려준다(라우트가 400 으로 답한다)', buildProductRef('bandcamp', 'x'), null)

// ── AC-3 커뮤니티 빌더 ────────────────────────────────────────────
t(
  'clien: 전체 URL → url:<경로>',
  buildProductRef('clien', 'https://www.clien.net/service/board/park/19153045').productRef,
  'url:/service/board/park/19153045',
)
t(
  'clien: url: 형태를 그대로 넣어도 된다',
  buildProductRef('clien', 'url:/service/board/park/19153045').productRef,
  'url:/service/board/park/19153045',
)
t('clien: 다른 사이트 URL 은 거절', buildProductRef('clien', 'https://evil.example/service/board/park/1').ok, false)
t('clien: 게시판 밖 경로는 거절', buildProductRef('clien', 'https://www.clien.net/service/mypage').ok, false)
t('clien: 빈 입력은 거절', buildProductRef('clien', '   ').ok, false)
t(
  'damoang: 경로를 읽는다',
  buildProductRef('damoang', 'https://damoang.net/free/3334512').productRef,
  'url:/free/3334512',
)
t(
  'bobaedream: 파라미터 순서를 정규화한다',
  buildProductRef('bobaedream', 'https://www.bobaedream.co.kr/view?No=1234567&code=freeb').productRef,
  'url:/view?code=freeb&No=1234567',
)
t(
  'naver_blog_post: 군더더기 파라미터를 떼고 정규화한다',
  buildProductRef('naver_blog_post', 'https://blog.naver.com/PostView.naver?blogId=abc&logNo=223&redirect=Dlog').productRef,
  'url:/PostView.naver?blogId=abc&logNo=223',
)
t(
  '82cook: 쿼리형 주소를 받는다',
  buildProductRef('82cook', 'https://www.82cook.com/entiz/read.php?bn=15&num=3800000').ok,
  true,
)
t(
  'brunch: @핸들 경로를 받는다',
  buildProductRef('brunch', 'https://brunch.co.kr/@handle/123').productRef,
  'url:/@handle/123',
)
t('tumblbug: 프로젝트 슬러그', buildProductRef('tumblbug', 'https://tumblbug.com/my-project').productRef, 'url:/my-project')
t('theqoo: 경로를 읽는다', buildProductRef('theqoo', 'https://theqoo.net/square/3612345').productRef, 'url:/square/3612345')
t(
  'fmkorea: robots 가 여는 세 갈래만 받는다',
  buildProductRef('fmkorea', 'https://www.fmkorea.com/best/8412345678').productRef,
  'url:/best/8412345678',
)
t('fmkorea: 그 밖의 경로는 거절(robots Disallow: /)', buildProductRef('fmkorea', 'https://www.fmkorea.com/8412345678').ok, false)
t(
  'todayhumor: 쿼리형 주소',
  buildProductRef('todayhumor', 'https://www.todayhumor.co.kr/board/view.php?table=bestofbest&no=999').ok,
  true,
)
// 경로 탈출·SSRF 경계는 url-ref.ts 가 막는다. 빌더를 지나쳐 가지 않는지 확인한다.
t('상위 경로 탈출은 거절', buildProductRef('damoang', 'url:/free/../../etc/passwd').ok, false)
t('스킴상대 URL 은 거절', buildProductRef('damoang', 'url://evil.example/free/1').ok, false)
t('userinfo 는 거절', buildProductRef('damoang', 'url:/free/1@evil.example').ok, false)

// ── 후보 제안 응답 파싱 ───────────────────────────────────────────
// LLM 이 순수 JSON 만 낼 거라고 믿지 않는다. 펜스·설명이 붙어도 건져 내고,
// 못 건지면 **조용히 빈 배열이 아니라 실패**로 만든다.
{
  const clean = '[{"name":"Linear","category_hint":"이슈 트래커","homepage_url":"https://linear.app","why":"불만 많음"}]'
  t('순수 JSON 을 읽는다', parseCandidates(clean).items[0].name, 'Linear')
  t('스네이크케이스를 카멜로 옮긴다', parseCandidates(clean).items[0].categoryHint, '이슈 트래커')

  const fenced = '알겠습니다.\n```json\n' + clean + '\n```\n이상입니다.'
  t('코드펜스와 앞뒤 설명이 붙어도 읽는다', parseCandidates(fenced).items[0].name, 'Linear')

  t('배열이 없으면 실패', parseCandidates('죄송합니다 못 하겠습니다').ok, false)
  t('빈 응답도 실패', parseCandidates('').ok, false)
  t('깨진 JSON 은 실패 — 빈 배열로 접지 않는다', parseCandidates('[{"name":').ok, false)
  t('이름 없는 항목은 버린다', parseCandidates('[{"why":"x"},{"name":"A","why":"y"}]').items.length, 1)
  t('why 가 없으면 표시를 남긴다', parseCandidates('[{"name":"A"}]').items[0].why, '(이유 미기재)')
  t('빈 배열은 성공이되 0건이다', parseCandidates('[]').items.length, 0)
}

// ── 후보 제안 프롬프트 ────────────────────────────────────────────
{
  const k = known([nameKey('saas', 'Notion')], { crm: 2 })
  const p = proposalPrompt('saas', 2, k)
  ok('축에 맞는 소스를 말한다', p.includes('Hacker News'))
  ok('아는 이름을 프롬프트에 싣는다', p.includes('notion'))
  ok('채택된 카테고리를 싣는다', p.includes('crm(2)'))
  ok('건수를 싣는다', p.includes('2개'))
  ok('LLM 이 리뷰 수를 지어내지 않게 못박는다', p.includes('추측해서 쓰지 마라'))
  ok('physical 은 다나와를 말한다', proposalPrompt('physical', 2, k).includes('다나와'))
  ok('아는 게 없으면 그 줄이 빠진다', !proposalPrompt('saas', 2, known()).includes('겹치지 마라'))
}

// ── 다이제스트 섹션 ──────────────────────────────────────────────
{
  const row = (verdict, name, extra = {}) => ({
    kind: 'saas', name, category_hint: null, why: 'x',
    probe_hits: null, probe_ref: null, verdict, verdict_reason: `${verdict} 사유`, ...extra,
  })
  const text = (blocks) => JSON.stringify(blocks)

  t('후보가 없으면 섹션 자체가 없다', discoveryBlocks([]), null)
  t('기각만 있는 날은 섹션을 안 만든다', discoveryBlocks([row('rejected', 'A'), row('rejected', 'B')]), null)

  const acc = discoveryBlocks([row('accepted', 'Linear', { probe_hits: 99, probe_ref: 'q:Linear' })])
  ok('채택이 있으면 섹션이 생긴다', acc && acc.length > 0)
  ok('채택 건수를 제목에 쓴다', text(acc).includes('발굴 채택 1건'))
  ok('실측 hits 를 싣는다', text(acc).includes('hits 99'))

  // ⚠️ 채택 0건이어도 확인불가가 있으면 올린다. 이게 프로브가 깨진 날의 유일한 신호다.
  const unv = discoveryBlocks([row('unverified', 'Broken'), row('rejected', 'Small')])
  ok('확인불가는 채택 0건이어도 올린다', unv && unv.length > 0)
  ok('확인불가를 눈에 띄게 적는다', text(unv).includes('확인 불가 1건'))
  ok('hits 가 null 이면 "확인불가" 로 적는다(0 이 아니다)', text(unv).includes('hits 확인불가'))
  ok('기각은 이름만 한 줄로 묶는다', text(unv).includes('기각 1건'))
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('발굴 엔진이 틀렸다. 이 상태로 돌리면 엉뚱한 프로젝트가 자동 적재된다.')
  process.exit(1)
}
console.log('발굴 엔진 정상 — unverified 와 rejected 를 가르고, 소스 전부에 등록 경로가 있다.')
