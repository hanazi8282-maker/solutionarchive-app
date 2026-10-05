#!/usr/bin/env node
// 카카오(다음) 검색 어댑터 셀프테스트 — 실제 어댑터 + 실제 러너(runCollection). 네트워크·DB 만 가짜, 고정 픽스처.
//
// ⚠️ 픽스처는 공식 문서(developers.kakao.com/docs/ko/daum-search/dev-guide)의 필드 이름으로 만든 **합성본**이다.
//    실응답으로 대조한 적 없다 — 켜기 전에 1회 실측할 것. 키는 가짜 문자열이다(실키를 여기 쓰지 않는다).
//
// 고정하는 것: 정상 파싱 · 빈 documents · 필드 누락 · is_end 종료 · page 상한 50 · 키 없음 → 실행 실패 ·
//   400·401·403·429 → 즉시 중단(같은 소스 남은 타깃 0요청) · HTML 태그 제거 · https 아닌 URL 거름 ·
//   헤더가 러너를 거쳐 fetch 포트까지 닿는가(부품이 아니라 경계, §7.1) · 키가 URL·결과 문구에 안 남는가.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { kakaoBlogAdapter, kakaoCafeAdapter, parseProductRef, kstDate, MAX_PAGE } from '../lib/review/adapters/kakao.ts'
import { runCollection } from '../lib/review/runner.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'review', 'kakao', name), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const KEY = 'TEST_KAKAO_KEY_NOT_REAL'
process.env.KAKAO_REST_API_KEY = KEY

const page1 = await fx('blog-page1.json')
const last = await fx('cafe-last.json')
const empty = await fx('empty.json')
const noMeta = await fx('no-meta.json')

const target = (over = {}) => ({
  id: 't1', projectId: 'p1', sourceKey: 'kakao_blog', productRef: 'q:무선이어폰 후기',
  cursor: null, lastReviewAt: null, consecutiveEmpty: 0, ...over,
})
const ctx = (cursor = null) => ({ productRef: 'q:무선이어폰 후기', cursor })

// ── 선언 ──
t('키: kakao_blog', kakaoBlogAdapter.key, 'kakao_blog')
t('키: kakao_cafe', kakaoCafeAdapter.key, 'kakao_cafe')
t('requiredEnv', kakaoBlogAdapter.requiredEnv, ['KAKAO_REST_API_KEY'])
t('증분형(검색어는 끝이 없다)', kakaoBlogAdapter.incrementalOnly, true)
t('차단 상태 400·401', kakaoBlogAdapter.blockStatuses, [400, 401])
t('quotaMarkers 없음 → 403/429 는 전부 차단', kakaoBlogAdapter.quotaMarkers, undefined)

// ── ref ──
t('ref: q:<검색어>', parseProductRef('q:무선이어폰 후기'), '무선이어폰 후기')
t('ref: 접두어 없으면 거부', parseProductRef('무선이어폰'), null)
t('ref: 빈 검색어 거부', parseProductRef('q:  '), null)
t('빌더: 검색어 → q:', buildProductRef('kakao_blog', '무선이어폰 후기').productRef, 'q:무선이어폰 후기')
t('빌더: 카페도 같다', buildProductRef('kakao_cafe', '무선이어폰 후기').productRef, 'q:무선이어폰 후기')
t('빌더: 한 글자 거부', buildProductRef('kakao_blog', '폰').ok, false)
ok('빌더 값을 어댑터가 읽는다', parseProductRef(buildProductRef('kakao_blog', '무선이어폰 후기').productRef) === '무선이어폰 후기')

// ── nextRequest ──
{
  const r = kakaoBlogAdapter.nextRequest(target())
  const u = new URL(r.url)
  t('요청: 블로그 엔드포인트', u.origin + u.pathname, 'https://dapi.kakao.com/v2/search/blog')
  t('요청: 카페 엔드포인트', new URL(kakaoCafeAdapter.nextRequest(target()).url).pathname, '/v2/search/cafe')
  t('요청: query', u.searchParams.get('query'), '무선이어폰 후기')
  t('요청: sort=recency(증분 종료 전제)', u.searchParams.get('sort'), 'recency')
  t('요청: 첫 page=1', u.searchParams.get('page'), '1')
  t('요청: size=50', u.searchParams.get('size'), '50')
  t('요청: GET', r.init.method, 'GET')
  t('요청: KakaoAK 헤더', r.init.headers.Authorization, `KakaoAK ${KEY}`)
  ok('요청: 키가 URL 에 없다', !r.url.includes(KEY))
  t('요청: 커서 7 → page=7', new URL(kakaoBlogAdapter.nextRequest(target({ cursor: '7' })).url).searchParams.get('page'), '7')
  t('요청: 범위 밖 커서는 1', new URL(kakaoBlogAdapter.nextRequest(target({ cursor: '51' })).url).searchParams.get('page'), '1')
  t('요청: 잘못된 ref → null', kakaoBlogAdapter.nextRequest(target({ productRef: 'v:abc' })), null)
}

// ── parse ──
{
  const p = kakaoBlogAdapter.parse(page1, ctx())
  t('정상: 리뷰 2건(https 1 + http 1)', p.reviews.length, 2)
  t('필드 누락·빈 본문·이상한 스킴 = 파싱 실패 3건', p.parseFailures, 3)
  t('is_end=false → 다음 커서 2', p.nextCursor, '2')
  const [a, b] = p.reviews
  t('externalId = url', a.externalId, 'https://blog.example-kakao.test/alpha/101')
  t('HTML 태그·엔티티 제거', a.text, '무선이어폰 3개월 사용 "후기"\n노이즈캔슬링은 좋은데 배터리가 6시간이면 바닥나요. 케이스 힌지도 & 헐거워짐')
  t('writtenAt = KST 날짜', a.writtenAt, '2026-10-05')
  t('sourceUrl = https url', a.sourceUrl, 'https://blog.example-kakao.test/alpha/101')
  t('http url 은 sourceUrl 에서 거른다', b.sourceUrl, null)
  ok('lang=ko · rating=null · 작성자 미저장', p.reviews.every((r) => r.lang === 'ko' && r.rating === null && r.authorMasked === null && r.seller === null))
  ok('blogname 을 본문에 싣지 않는다', !p.reviews.some((r) => r.text.includes('알파의 리뷰 블로그') || r.text.includes('베타')))

  const q = kakaoCafeAdapter.parse(last, ctx('3'))
  t('is_end=true → 커서 null', q.nextCursor, null)
  t('카페 1건', q.reviews.length, 1)
  t('카페 자정 직후 KST 날짜(UTC 면 전날)', q.reviews[0].writtenAt, '2026-10-01')
  t('page 상한: 50쪽에서 is_end=false 여도 끝', kakaoBlogAdapter.parse(page1, ctx(String(MAX_PAGE))).nextCursor, null)
  t('상한 상수 50', MAX_PAGE, 50)

  const e = kakaoBlogAdapter.parse(empty, ctx())
  t('빈 documents: 0건 · 실패 0 · 끝', [e.reviews.length, e.parseFailures, e.nextCursor], [0, 0, null])
  t('meta 없음: 파싱 실패 1', kakaoBlogAdapter.parse(noMeta, ctx()).parseFailures, 1)
  t('JSON 아님: 파싱 실패 1', kakaoBlogAdapter.parse('<html>', ctx()).parseFailures, 1)
  t('documents 가 배열 아님: 파싱 실패 1', kakaoBlogAdapter.parse('{"documents":{},"meta":{}}', ctx()).parseFailures, 1)
  t('kstDate: UTC 16시 = KST 다음날', kstDate('2026-09-30T16:00:00Z'), '2026-10-01')
  t('kstDate: 못 읽으면 null', kstDate('어제'), null)
}

// ── 러너 경계 ──
function harness({ api, robots = { status: 404, body: 'not found' }, targets = [target()] }) {
  const calls = []
  const inputs = []
  const saves = []
  let clock = 1_000_000
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url, init) {
      calls.push({ url, init, at: clock })
      clock += 10
      if (url.endsWith('/robots.txt')) return { ...robots, finalUrl: url }
      return api(new URL(url), calls.filter((c) => !c.url.endsWith('/robots.txt')).length)
    },
    store: {
      async loadSource(key) { return { key, enabled: true, minIntervalMs: 1000, dailyRequestCap: 200, requestsToday: 0 } },
      async listDueTargets() { return targets },
      async saveTargetProgress(p) { saves.push(p) },
      async recordFingerprint() { return 'new' },
      async appendInput(i) { inputs.push(i); return `in${inputs.length}` },
      async linkFingerprint() {},
    },
  }
  return { ports, calls, inputs, saves, apiCalls: () => calls.filter((c) => !c.url.endsWith('/robots.txt')) }
}

{
  const h = harness({ api: (u) => ({ status: 200, body: u.searchParams.get('page') === '1' ? page1 : last }) })
  const res = await runCollection(kakaoBlogAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  const api = h.apiCalls()
  t('경계: API 2회(1쪽 → is_end)', api.length, 2)
  t('경계: 2번째 요청 page=2', new URL(api[1].url).searchParams.get('page'), '2')
  ok('경계: 헤더가 fetch 포트까지 간다', api.every((c) => c.init?.method === 'GET' && c.init.headers.Authorization === `KakaoAK ${KEY}`))
  ok('경계: robots.txt 는 init 없이', h.calls.filter((c) => c.url.endsWith('/robots.txt')).every((c) => c.init === undefined))
  ok('경계: 요청 간격 ≥ 300ms', api[1].at - api[0].at >= 300)
  t('경계: 적재 3건', h.inputs.length, 3)
  ok('경계: https 글만 [SRC:] 머리말', h.inputs[0].text.startsWith('[SRC: https://blog.example-kakao.test/alpha/101]') && !h.inputs[1].text.startsWith('[SRC:'))
  t('경계: lang·sourceUrl 이 적재까지 간다', [h.inputs[0].lang, h.inputs[1].sourceUrl], ['ko', null])
  t('경계: 끝 커서 null', h.saves.at(-1)?.cursor, null)
  t('경계: 증분형이라 active 유지', h.saves.at(-1)?.status, 'active')
  t('경계: robots 404 는 표식으로만 통과(센다)', res.robotsBypassed, 2)
  ok('경계: 키가 결과 문구에 없다', !JSON.stringify(res).includes(KEY))
}

for (const status of [400, 401, 403, 429]) {
  const h = harness({
    api: () => ({ status, body: '{"error":"x"}' }),
    targets: [target(), target({ id: 't2', productRef: 'q:블루투스 이어폰' })],
  })
  const res = await runCollection(kakaoCafeAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  t(`${status}: 요청 1회에서 멈춘다(두 번째 타깃 0요청)`, h.apiCalls().length, 1)
  t(`${status}: 차단으로 센다`, [res.stats.blockedResponses, res.stats.quotaExhaustedResponses], [1, 0])
  ok(`${status}: 결과 문구에 '차단'`, res.perTarget[0]?.outcome.includes('차단'))
  ok(`${status}: 키가 결과 문구에 없다`, !JSON.stringify(res).includes(KEY))
}

{
  // robots 5xx 는 표식으로도 못 지나간다(요청 0).
  const h = harness({ api: () => ({ status: 200, body: page1 }), robots: { status: 503, body: '' } })
  await runCollection(kakaoBlogAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  t('robots 503: 요청 0', h.apiCalls().length, 0)
}

{
  // 키 없음 → 실행이 실패로 끝난다(조용한 0건 금지). 메시지에 env 이름은 있고, 요청은 0회.
  delete process.env.KAKAO_REST_API_KEY
  const h = harness({ api: () => ({ status: 200, body: page1 }) })
  let err = null
  try {
    await runCollection(kakaoBlogAdapter, { dryRun: false, targetLimit: 5 }, h.ports)
  } catch (e) {
    err = e
  }
  ok('키 없음: runCollection 이 던진다', err instanceof Error)
  ok('키 없음: 메시지에 env 이름', err?.message.includes('KAKAO_REST_API_KEY'))
  t('키 없음: 네트워크 0회(robots 포함)', h.calls.length, 0)
  process.env.KAKAO_REST_API_KEY = KEY
}

{
  // 실행기 배선·마이그레이션 시드(보수적 간격·비활성).
  const collect = await fs.readFile(path.join(here, 'review-collect.mjs'), 'utf8')
  ok('review-collect: kakao_blog·kakao_cafe 등록', /kakao_blog:\s*kakaoBlogAdapter/.test(collect) && /kakao_cafe:\s*kakaoCafeAdapter/.test(collect))
  const sql = await fs.readFile(path.join(here, '..', 'supabase', 'migrations', '20261006000003_review_sources_kakao.sql'), 'utf8')
  const rows = [...sql.matchAll(/'ok', (\d+), (\d+),\s*\r?\n\s*'not_applicable', 'unverified', 'short_only', true,/g)]
  t('마이그: 2행 · not_applicable · unverified · short_only', rows.length, 2)
  ok('마이그: min_interval_ms ≥ 300', rows.every((m) => Number(m[1]) >= 300))
  t('마이그: enabled=false 2행', (sql.match(/^\s*false,\r?$/gm) || []).length, 2)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('카카오 검색 어댑터 계약이 깨졌다.')
  process.exit(1)
}
console.log('카카오 검색 어댑터 정상 — 헤더 인증 GET 이 러너를 거쳐 전달되고, 400·401·403·429 는 첫 응답에서 멈춘다.')
