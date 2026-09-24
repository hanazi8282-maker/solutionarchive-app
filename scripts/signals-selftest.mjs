#!/usr/bin/env node
// 공개 신호 화면(lib/signals/feed.ts) 순수 함수 셀프테스트 — 네트워크·DB 없음.
//   node scripts/signals-selftest.mjs
import { EXCERPT_MAX, MAX_PAGE, excerptOf, feedHref, parseFeedQuery, sourceLinkOf } from '../lib/signals/feed.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// 발췌 — 원문 재게시 방지 상한 + 수집기 머리말 제거
const hn = '[HN: Stripe Sigma · news.ycombinator.com/item?id=14463385] > We have\n\nwritten   queries'
t('HN 머리말을 뗀다', excerptOf(hn) === '> We have written queries')
const long = '가'.repeat(500)
t(`긴 본문은 ${EXCERPT_MAX}자(말줄임 포함)로 자른다`, Array.from(excerptOf(long)).length === EXCERPT_MAX && excerptOf(long).endsWith('…'))
t('상한 이하는 그대로', excerptOf('짧은 글') === '짧은 글')
t('이모지를 반으로 자르지 않는다', !/[\uD800-\uDBFF]…$/.test(excerptOf('😀'.repeat(300))))
t('null 본문 = 빈 문자열', excerptOf(null) === '')

// 출처 링크 — 만들 수 없으면 null(지어내지 않는다)
t('HN: 머리말 스레드 URL', sourceLinkOf('hackernews', hn, 'saas') === 'https://news.ycombinator.com/item?id=14463385')
t('HN: 머리말 없으면 null', sourceLinkOf('hackernews', '본문만', 'saas') === null)
t('YouTube: v:ID → 영상', sourceLinkOf('youtube', 'x', 'v:nv1pkAEMaAY') === 'https://www.youtube.com/watch?v=nv1pkAEMaAY')
t('YouTube: 형식 밖 null', sourceLinkOf('youtube', 'x', 'nv1pkAEMaAY') === null)
t('다나와: pcode → 상품', sourceLinkOf('danawa', 'x', '18753650') === 'https://prod.danawa.com/info/?pcode=18753650')
t('다나와: 숫자 아님 null', sourceLinkOf('danawa', 'x', 'url:/x') === null)
t('모르는 소스 null', sourceLinkOf('clien', 'https://clien.net/x', 'url:/x') === null)

// 질의 파서 — 어휘 밖 값은 버리고 사유를 남긴다
const ok = parseFeedQuery({ source: 'hackernews', signal: 'pain', impact: 'high', page: '2' })
t('정상 질의', ok.errors.length === 0 && ok.filters.source === 'hackernews' && ok.filters.signal === 'pain' && ok.filters.impact === 'high' && ok.filters.page === 2)
const bad = parseFeedQuery({ source: 'a b', signal: 'medium', impact: 'x', page: '-1' })
t('어휘 밖 값 4개 → 필터 null + 사유 4건', bad.errors.length === 4 && !bad.filters.source && !bad.filters.signal && !bad.filters.impact && bad.filters.page === 1)
t(`페이지 상한 ${MAX_PAGE}`, parseFeedQuery({ page: '999' }).filters.page === MAX_PAGE)
t('빈 질의 = 기본값, 오류 없음', parseFeedQuery({}).errors.length === 0 && parseFeedQuery({}).filters.page === 1)

// 링크 — 기본값은 URL 에 안 적고, 필터를 바꾸면 페이지는 1로
const f = ok.filters
t('기본값만이면 /signals', feedHref({ source: null, signal: null, impact: null, page: 1 }, {}) === '/signals')
t('필터 변경 시 page 초기화', feedHref(f, { signal: 'demand' }) === '/signals?source=hackernews&signal=demand&impact=high')
t('페이지 이동은 필터 유지', feedHref(f, { page: 3 }) === '/signals?source=hackernews&signal=pain&impact=high&page=3')

if (fail) { console.log(`실패 ${fail}건 / 통과 ${pass}건`); process.exit(1) }
console.log(`통과 ${pass}건 — 발췌 상한 · 출처 링크 3소스 · 질의 파서 · 링크`)
