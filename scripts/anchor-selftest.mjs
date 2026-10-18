#!/usr/bin/env node
// 앵커 검증 셀프테스트 — 오프라인. 실측(2026-10-14 iTunes Search): Notion·Evernote 는 anchored, Ivory 는 판매자 4곳 ambiguous, "ask AI"·Fera 는 no_match.
import { ANCHOR_MIN_RATINGS, descriptionHasDomain, domainOf, nameMatches, normName, verifyAnchor } from '../lib/review/anchor.ts'
import { lookup as rawLookup, makeGuard, SEARCH_DAILY_CAP, SEARCH_MIN_INTERVAL_MS, SEARCH_RUN_MAX } from './anchor-verify.mjs'
const memGuard = (o = {}) => makeGuard({ logFile: null, intervalMs: 0, ...o })
const lookup = (n, c, f, o = {}) => rawLookup(n, c, f, { guard: memGuard(), ...o })

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const app = (trackName, o = {}) => ({ trackId: 1, trackName, sellerName: 'Acme Inc', sellerUrl: 'https://www.acme.com/x', userRatingCount: 500, ...o })

t('norm: 대소문자·기호 무시', normName('Notion: Notes, Tasks'), 'notionnotestasks')
t('이름: 첫 토막 일치(콜론)', nameMatches('Notion', 'Notion: Notes, Tasks, AI'), true)
t('이름: 첫 토막 일치(하이픈)', nameMatches('Evernote', 'Evernote - Notes Organizer'), true)
t('이름: 허용 꼬리말(App)', nameMatches('Fera', 'Fera App'), true)
t('이름: 허용 꼬리말 둘(AI App)', nameMatches('Acme', 'Acme AI App'), true)
t('이름: 다른 꼬리는 다른 제품', nameMatches('Ivory', 'Ivory Photo Editor'), false)
t('이름: 부분 문자열은 일치 아님', nameMatches('Note', 'Notion: Notes'), false)
t('이름: 3자 미만 거부', nameMatches('AI', 'AI'), false)
t('domain', domainOf('https://www.notion.so/x'), 'notion.so')
t('domain: 이상한 값은 null', domainOf('not a url'), null)

{
  const v = verifyAnchor('Notion', [app('Notion: Notes, Tasks, AI', { trackId: 7, sellerName: 'Notion Labs', sellerUrl: 'https://www.notion.so' })])
  t('anchored', v.state === 'anchored' && v.appId === 7 && v.domain === 'notion.so', true)
}
t('no_match: 이름이 다른 앱뿐', verifyAnchor('Fera', [app('Camera Pro')]).state, 'no_match')
t('no_match: 평가 수 부족', verifyAnchor('Fera', [app('Fera', { userRatingCount: ANCHOR_MIN_RATINGS - 1 })]).state, 'no_match')
t('anchored: 평가 수 하한 경계', verifyAnchor('Fera', [app('Fera', { userRatingCount: ANCHOR_MIN_RATINGS })]).state, 'anchored')
t('ambiguous: 판매자가 다른 동명 앱', verifyAnchor('Ivory', [app('Ivory', { trackId: 1, sellerName: 'A' }), app('Ivory', { trackId: 2, sellerName: 'B' })]).state, 'ambiguous')
t('anchored: 같은 판매자의 iPhone/iPad 앱은 한 제품', verifyAnchor('Acme', [app('Acme', { trackId: 1 }), app('Acme HD', { trackId: 2, userRatingCount: 10 })]).state, 'anchored')
t('anchored: 평가 수 많은 쪽을 고른다', verifyAnchor('Acme', [app('Acme', { trackId: 1, userRatingCount: 80 }), app('Acme App', { trackId: 2, userRatingCount: 900 })]).appId, 2)
t('도메인: 일치하면 anchored', verifyAnchor('Acme', [app('Acme')], { expectedDomain: 'https://acme.com/pricing' }).state, 'anchored')
t('도메인: 서브도메인 허용', verifyAnchor('Acme', [app('Acme', { sellerUrl: 'https://app.acme.com' })], { expectedDomain: 'acme.com' }).state, 'anchored')
t('도메인: 다르면 동명 앱으로 보고 no_match', verifyAnchor('Acme', [app('Acme', { sellerUrl: 'https://other.io' })], { expectedDomain: 'acme.com' }).state, 'no_match')
t('도메인: 판매자 URL 이 없으면 no_match(확인 못 하면 통과 아님)', verifyAnchor('Acme', [app('Acme', { sellerUrl: undefined })], { expectedDomain: 'acme.com' }).state, 'no_match')
t('도메인 미지정이면 기존 동작', verifyAnchor('Acme', [app('Acme', { sellerUrl: 'https://other.io' })]).state, 'anchored')
t('lookup_failed: 배열 아님', verifyAnchor('X Y Z', undefined).state, 'lookup_failed')
t('no_match 와 lookup_failed 는 다르다(빈 배열 = 조회는 됐다)', verifyAnchor('Notion', []).state, 'no_match')
{
  const ok = await lookup('Notion', 'us', async () => ({ status: 200, json: async () => ({ results: [app('Notion: Notes', { trackId: 9 })] }) }))
  t('lookup: 정상 응답 → anchored', ok.state, 'anchored')
  const bad = await lookup('Notion', 'us', async () => ({ status: 503, json: async () => ({}) }))
  t('lookup: HTTP 503 → lookup_failed(no_match 아님)', bad.state, 'lookup_failed')
  const boom = await lookup('Notion', 'us', async () => { throw new Error('ECONNRESET') })
  t('lookup: 네트워크 오류 → lookup_failed', boom.state, 'lookup_failed')
  const junk = await lookup('Notion', 'us', async () => ({ status: 200, json: async () => ({ error: 'x' }) }))
  t('lookup: results 없는 JSON → lookup_failed', junk.state, 'lookup_failed')
}

// v71aj 설명 URL 보조 근거(opt-in)
t('설명 도메인: URL 호스트 일치', descriptionHasDomain('Learn more at https://www.zendesk.com/sell.', 'zendesk.com'), true)
t('설명 도메인: 하위 도메인 허용', descriptionHasDomain('see https://support.zendesk.com/x', 'zendesk.com'), true)
t('설명 도메인: 글자만 같은 다른 호스트는 아님', descriptionHasDomain('https://notzendesk.com', 'zendesk.com'), false)
t('설명 도메인: URL 아닌 언급은 아님', descriptionHasDomain('works with zendesk.com', 'zendesk.com'), false)
{
  const z = app('Zendesk Sell', { sellerUrl: 'https://getbase.com', description: 'Docs: https://www.zendesk.com/sell/' })
  t('설명 도메인: 끄면 기존대로 no_match', verifyAnchor('Zendesk Sell', [z], { expectedDomain: 'zendesk.com' }).state, 'no_match')
  const v = verifyAnchor('Zendesk Sell', [z], { expectedDomain: 'zendesk.com', descriptionDomain: true })
  t('설명 도메인: 켜면 anchored + domainVia=description', v.state === 'anchored' && v.domainVia === 'description', true)
  t('설명 도메인: 설명에 없으면 켜도 no_match', verifyAnchor('Zendesk Sell', [{ ...z, description: 'no link' }], { expectedDomain: 'zendesk.com', descriptionDomain: true }).state, 'no_match')
  t('판매자 도메인 일치는 domainVia=seller', verifyAnchor('Acme', [app('Acme')], { expectedDomain: 'acme.com' }).domainVia, 'seller')
}

// v71aj 정책 A 강제: 상한·간격·UA·중단·로그
t('D-44: 하루 상한 ≤ 300(ITUNES_SEARCH_DAILY_MAX 기본)', SEARCH_DAILY_CAP > 0 && SEARCH_DAILY_CAP <= 300, true)
t('D-44: 간격 ≥ 6초(분당 ≤10)', SEARCH_MIN_INTERVAL_MS >= 6000, true)
t('D-44: 한 실행 상한 60', SEARCH_RUN_MAX, 60)
{
  const g = memGuard({ runMax: 2, cap: 99 })
  const ok = async () => ({ status: 200, json: async () => ({ results: [app('Notion: Notes', { trackId: 9 })] }) })
  await rawLookup('a', 'us', ok, { guard: g }); await rawLookup('b', 'us', ok, { guard: g })
  const over = await rawLookup('c', 'us', ok, { guard: g })
  t('D-44: 한 실행 상한 도달 → lookup_failed+stop', over.state === 'lookup_failed' && over.stop === true, true)
}
{
  const ok200 = async () => ({ status: 200, json: async () => ({ results: [app('Notion: Notes', { trackId: 9 })] }) })
  let ua = null
  const g0 = memGuard()
  await rawLookup('Notion', 'us', async (_u, init) => { ua = init.headers['user-agent']; return ok200() }, { guard: g0 })
  t('정책 A: UA 는 우리 서비스 식별 UA', /^solutionarchive-review-collector\/.+github\.com/.test(ua ?? ''), true)
  t('정책 A: 호출마다 로그 1줄', g0.used(), 1)

  const g = memGuard({ cap: 2 })
  let calls = 0
  const counted = async () => { calls++; return ok200() }
  await rawLookup('Notion', 'us', counted, { guard: g })
  await rawLookup('Notion', 'us', counted, { guard: g })
  const over = await rawLookup('Notion', 'us', counted, { guard: g })
  t('정책 A: 상한 도달 → 호출 0·lookup_failed+stop', calls === 2 && over.state === 'lookup_failed' && over.stop === true, true)

  for (const [label, res] of [
    ['403', { status: 403, json: async () => ({}) }],
    ['429', { status: 429, json: async () => ({}) }],
    ['빈 본문', { status: 200, text: async () => '' }],
    ['캡차 HTML', { status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>captcha</html>' }],
    ['results 0건', { status: 200, json: async () => ({ resultCount: 0, results: [] }) }],
  ]) {
    const gs = memGuard()
    let n = 0
    const f = async () => { n++; return res }
    const a = await rawLookup('Notion', 'us', f, { guard: gs })
    const b = await rawLookup('Notion', 'us', f, { guard: gs })
    t(`정책 A: ${label} 1건 → 즉시 중단, 다음 호출 0`, a.stop === true && b.stop === true && n === 1, true)
  }

  const waits = []
  let clock = 0
  const gi = makeGuard({ logFile: null, intervalMs: 3000, now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms } })
  await rawLookup('Notion', 'us', ok200, { guard: gi })
  clock += 1000
  await rawLookup('Notion', 'us', ok200, { guard: gi })
  t('정책 A: 두 번째 호출 전 남은 간격만큼 기다린다', waits.join(','), '2000')
}

console.log(`anchor selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
