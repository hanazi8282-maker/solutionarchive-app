#!/usr/bin/env node
// 앵커 검증 셀프테스트 — 오프라인. 실측(2026-10-14 iTunes Search): Notion·Evernote 는 anchored, Ivory 는 판매자 4곳 ambiguous, "ask AI"·Fera 는 no_match.
import { ANCHOR_MIN_RATINGS, domainOf, nameMatches, normName, verifyAnchor } from '../lib/review/anchor.ts'
import { lookup } from './anchor-verify.mjs'

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

console.log(`anchor selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
