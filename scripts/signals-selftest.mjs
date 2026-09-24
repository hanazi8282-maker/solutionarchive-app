#!/usr/bin/env node
// 공개 신호 화면(lib/signals/feed.ts) 순수 함수 셀프테스트 — 네트워크·DB 없음.
//   node scripts/signals-selftest.mjs
import { EXCERPT_MAX, MAX_PAGE, SAAS_BUSINESS_MODELS, countBySource, excerptOf, feedHref, parseFeedQuery, sourceChips, sourceLinkOf } from '../lib/signals/feed.ts'
import { productKindOf } from '../lib/cases/advisor.ts'

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

// 종류(kind) — /library 와 같은 축·같은 기본값
t('kind 기본 = saas', parseFeedQuery({}).filters.kind === 'saas')
t('kind=all 인식', parseFeedQuery({ kind: 'all' }).filters.kind === 'all' && parseFeedQuery({ kind: 'all' }).errors.length === 0)
t('kind 대소문자 무시', parseFeedQuery({ kind: 'ALL' }).filters.kind === 'all')
const badKind = parseFeedQuery({ kind: 'consumer' })
t('kind 어휘 밖 → 기본 saas + 사유 1건(조용히 떨어지지 않는다)', badKind.filters.kind === 'saas' && badKind.errors.length === 1)
t('SaaS 값 목록 = productKindOf 가 software 로 보는 값(지금 SAAS 하나)', SAAS_BUSINESS_MODELS.length === 1 && SAAS_BUSINESS_MODELS[0] === 'SAAS')
t('SUBSCRIPTION·NULL 은 소비재 쪽(productKindOf 와 같다)', !SAAS_BUSINESS_MODELS.includes('SUBSCRIPTION') && productKindOf(null) === 'physical')
t('kind=saas 는 URL 에 안 적는다', feedHref({ kind: 'saas', source: null, signal: null, impact: null, page: 1 }, {}) === '/signals')
t('kind=all 은 URL 에 남고 다른 필터와 함께 간다', feedHref({ kind: 'all', source: null, signal: null, impact: null, page: 1 }, { signal: 'pain' }) === '/signals?kind=all&signal=pain')

// 링크 — 기본값은 URL 에 안 적고, 필터를 바꾸면 페이지는 1로
const f = ok.filters
t('기본값만이면 /signals', feedHref({ kind: 'saas', source: null, signal: null, impact: null, page: 1 }, {}) === '/signals')
t('필터 변경 시 page 초기화', feedHref(f, { signal: 'demand' }) === '/signals?source=hackernews&signal=demand&impact=high')
t('페이지 이동은 필터 유지', feedHref(f, { page: 3 }) === '/signals?source=hackernews&signal=pain&impact=high&page=3')

// 소스 칩 건수 — 다 받았을 때만 세고, 1건 이상만 낸다. 못 셌으면 전부·숫자 없이(§7.1)
const rows = [{ source_key: 'hackernews' }, { source_key: 'hackernews' }, { source_key: 'youtube' }, { source_key: null }]
const cnt = countBySource(rows, 4)
t('소스별 건수를 센다(source_key null 은 빼고)', cnt && cnt.hackernews === 2 && cnt.youtube === 1 && Object.keys(cnt).length === 2)
t('잘렸으면(받은 행 < 전체) null — 일부만 센 값을 내지 않는다', countBySource(rows, 5) === null)
t('전체 건수를 모르면 null', countBySource(rows, null) === null)
t('행을 못 받았으면 null', countBySource(null, 0) === null)
t('0건 전체는 빈 객체(= 셌고 없다)', JSON.stringify(countBySource([], 0)) === '{}')
const srcs = [{ key: 'danawa', name: '다나와' }, { key: 'hackernews', name: 'HN' }, { key: 'youtube', name: 'YouTube' }]
const chips = sourceChips(srcs, { hackernews: 2, youtube: 1 }, null)
t('0건 소스는 숨기고 건수를 붙인다', chips.length === 2 && chips[0].key === 'hackernews' && chips[0].count === 2 && chips[1].count === 1)
t('고른 소스는 0건이어도 남긴다(해제 손잡이)', sourceChips(srcs, { hackernews: 2 }, 'danawa').some((c) => c.key === 'danawa' && c.count === 0))
const unk = sourceChips(srcs, null, null)
t('못 셌으면 전부 내고 count 없음(0 과 섞지 않는다)', unk.length === 3 && unk.every((c) => c.count === undefined))

if (fail) { console.log(`실패 ${fail}건 / 통과 ${pass}건`); process.exit(1) }
console.log(`통과 ${pass}건 — 발췌 상한 · 출처 링크 3소스 · 질의 파서 · 종류(kind) · 링크 · 소스 칩 건수`)
