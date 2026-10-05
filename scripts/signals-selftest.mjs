#!/usr/bin/env node
// 공개 신호 화면(lib/signals/feed.ts) 순수 함수 셀프테스트 — 네트워크·DB 없음.
//   node scripts/signals-selftest.mjs
import { EXCERPT_MAX, MAX_PAGE, QUOTE_POLICY_COLUMN_READY, quoteOf, SAAS_BUSINESS_MODELS, countBySource, excerptOf, feedHref, parseFeedQuery, sourceChips, sourceLinkOf } from '../lib/signals/feed.ts'
import { productKindOf } from '../lib/cases/advisor.ts'
import { sourceUrlOf, withSourceUrl } from '../lib/review/types.ts'
import { checkQuote, publicQuotes, normalizeEvidenceQuotes, policyQuote, quoteCheckSummary, quoteLang, quotePolicyOf } from '../lib/analysis/evidence-quotes.ts'

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
t('모르는 소스 null', sourceLinkOf('appstore', 'x', '123') === null)
t('clien: 파서가 거절하는 url: ref 는 null', sourceLinkOf('clien', 'https://clien.net/x', 'url:/x') === null)

// 2026-10-01 출처 링크 확장 — 본문 [SRC:] 머리말(러너가 심는다) · url: 타깃 product_ref
const velogUrl = 'https://velog.io/@dev/%EA%B8%80-slug'
const tagged = withSourceUrl('제목\n\n본문', velogUrl)
t('withSourceUrl: 머리말 한 줄을 앞에 붙인다', tagged === `[SRC: ${velogUrl}]\n제목\n\n본문`)
t('withSourceUrl: https 아닌 주소는 붙이지 않는다', withSourceUrl('x', 'http://velog.io/a') === 'x' && withSourceUrl('x', null) === 'x')
t('sourceUrlOf: 머리말 역파싱', sourceUrlOf(tagged) === velogUrl && sourceUrlOf('본문만') === null)
t('velog 게시판 행: 머리말 → 글 주소', sourceLinkOf('velog', tagged, 'board:saas') === velogUrl)
t('velog url: 타깃(옛 행, 머리말 없음): product_ref → 글 주소', sourceLinkOf('velog', '본문', 'url:/@dev/%EA%B8%80-slug') === velogUrl)
t('velog 게시판 옛 행(머리말 없음)은 null — 게시판 주소로 채우지 않는다', sourceLinkOf('velog', '본문', 'board:saas') === null)
t('머리말 호스트가 소스와 다르면 링크로 만들지 않는다(글쓴이가 쓴 [SRC:] 방어)', sourceLinkOf('velog', '[SRC: https://evil.example/x]\n본문', 'board:saas') === null)
t('머리말은 발췌에서 뗀다', excerptOf(tagged) === '제목 본문')
t('inflearn 게시판: 머리말 → 질문 주소', sourceLinkOf('inflearn', withSourceUrl('q', 'https://www.inflearn.com/community/questions/1'), 'board:x') === 'https://www.inflearn.com/community/questions/1')
t('disquiet url: 타깃 → 글 주소', sourceLinkOf('disquiet', 'x', 'url:/posts/D1CXy9') === 'https://disquiet.io/posts/D1CXy9')
t('clien url: 타깃 → 글 주소', sourceLinkOf('clien', 'x', 'url:/service/board/park/12345678') === 'https://www.clien.net/service/board/park/12345678')
t('devto(게시판·주소 미기록) null', sourceLinkOf('devto', '본문', 'board:saas') === null)

// 질의 파서 — 어휘 밖 값은 버리고 사유를 남긴다
const ok = parseFeedQuery({ source: 'hackernews', signal: 'pain', impact: 'high', page: '2' })
t('정상 질의', ok.errors.length === 0 && ok.filters.source === 'hackernews' && ok.filters.signal === 'pain' && ok.filters.impact === 'high' && ok.filters.page === 2)
const bad = parseFeedQuery({ source: 'a b', signal: 'medium', impact: 'x', page: '-1' })
t('어휘 밖 값 4개 → 필터 null + 사유 4건', bad.errors.length === 4 && !bad.filters.source && !bad.filters.signal && !bad.filters.impact && bad.filters.page === 1)
t(`페이지 상한 ${MAX_PAGE}`, parseFeedQuery({ page: '999' }).filters.page === MAX_PAGE)
t('빈 질의 = 기본값, 오류 없음', parseFeedQuery({}).errors.length === 0 && parseFeedQuery({}).filters.page === 1)

// 종류(kind) — /library 와 같은 축·같은 기본값
t('kind 기본 = saas', parseFeedQuery({}).filters.kind === 'saas')
// 2026-10-01 "소비재 포함" 필터 제거 — 옛 링크 ?kind=all 은 기본값(saas)으로 되돌리고 사유 1건(조용히 떨어지지 않는다).
const oldAll = parseFeedQuery({ kind: 'all' })
t('kind=all → 기본 saas + 사유 1건(필터 제거)', oldAll.filters.kind === 'saas' && oldAll.errors.length === 1)
t('kind=SAAS(대소문자) → saas, 사유 없음', parseFeedQuery({ kind: 'SAAS' }).filters.kind === 'saas' && parseFeedQuery({ kind: 'SAAS' }).errors.length === 0)
const badKind = parseFeedQuery({ kind: 'consumer' })
t('kind 어휘 밖 → 기본 saas + 사유 1건(조용히 떨어지지 않는다)', badKind.filters.kind === 'saas' && badKind.errors.length === 1)
t('SaaS 값 목록 = productKindOf 가 software 로 보는 값(지금 SAAS 하나)', SAAS_BUSINESS_MODELS.length === 1 && SAAS_BUSINESS_MODELS[0] === 'SAAS')
t('SUBSCRIPTION·NULL 은 소비재 쪽(productKindOf 와 같다)', !SAAS_BUSINESS_MODELS.includes('SUBSCRIPTION') && productKindOf(null) === 'physical')
t('kind=saas 는 URL 에 안 적는다', feedHref({ kind: 'saas', source: null, signal: null, impact: null, page: 1 }, {}) === '/voc')
t('kind=all 은 URL 에 남고 다른 필터와 함께 간다', feedHref({ kind: 'all', source: null, signal: null, impact: null, page: 1 }, { signal: 'pain' }) === '/voc?kind=all&signal=pain')

// 링크 — 기본값은 URL 에 안 적고, 필터를 바꾸면 페이지는 1로
const f = ok.filters
t('기본값만이면 /voc', feedHref({ kind: 'saas', source: null, signal: null, impact: null, page: 1 }, {}) === '/voc')
t('필터 변경 시 page 초기화', feedHref(f, { signal: 'demand' }) === '/voc?source=hackernews&signal=demand&impact=high')
t('페이지 이동은 필터 유지', feedHref(f, { page: 3 }) === '/voc?source=hackernews&signal=pain&impact=high&page=3')

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

// D안(2026-10-05) + 남헌 v19 A — 고객 화면 직접 인용은 소스 quote_policy 3단계(full · short_only · none)
// + v20 #5 — 한 문장 ∧ 한국어 100자·영어 200자 이내, 둘 다. 넘으면 빈 값(자르지 않는다).
t('quote: full 한 문장 + 머리말은 뗀다', quoteOf('[SRC: https://a.b/c]\n알림이 늦어요.', 'full') === '알림이 늦어요.')
t('quote: short_only 한 문장', quoteOf('알림이 늦어요.', 'short_only') === '알림이 늦어요.')
t('quote: 두 문장이면 첫 문장도 내지 않는다(v20 — 옛 "첫 문장만" 제거)', quoteOf('알림이 늦어요. 그래서 해지했어요.', 'full') === '' && quoteOf('알림이 늦어요. 그래서 해지했어요.', 'short_only') === '')
t('quote: 머리말 뒤 줄바꿈 본문은 두 문장', quoteOf('[HN: t · news.ycombinator.com/item?id=1]\n하나\n둘', 'full') === '')
t('quote: none 이면 빈 문자열', quoteOf('알림이 늦어요.', 'none') === '')
t('quote: 정책 모름(null·undefined·옛 boolean·오타) 이면 빈 문자열 — 확인 불가 ≠ 허용',
  [null, undefined, true, 'FULL', 'short'].every((v) => quoteOf('알림이 늦어요.', v) === ''))
t('quote: 마침표 없는 긴 글은 자르지 않고 비운다', quoteOf('가'.repeat(500), 'full') === '')
// 20261005000003 적용 확인 전까지 false. v19 전에는 quote_allowed(000001, 적용됨)를 가리켜 true 였는데,
// 읽는 컬럼이 quote_policy(미적용)로 바뀌어 다시 false 가 맞다 — true 로 두면 /voc 조회가 42703 으로 죽는다.
t('quote: 컬럼 미적용 플래그는 기본 false(미적용 DB 에서 /voc 가 죽지 않게)', QUOTE_POLICY_COLUMN_READY === false)
t('policy: quotePolicyOf 모르는 값 → none', quotePolicyOf('x') === 'none' && quotePolicyOf(null) === 'none' && quotePolicyOf('short_only') === 'short_only')
// 길이 경계 — 한국어 100 / 영어 200, 정책(full·short_only) 무관
for (const pol of ['full', 'short_only']) {
  t(`cap(${pol}): 한국어 100자 통과`, checkQuote('가'.repeat(99) + '.', pol).ok && policyQuote('가'.repeat(99) + '.', pol) === '가'.repeat(99) + '.')
  t(`cap(${pol}): 한국어 101자 거부(too_long)`, checkQuote('가'.repeat(100) + '.', pol).reason === 'too_long' && policyQuote('가'.repeat(100) + '.', pol) === '')
  t(`cap(${pol}): 영어 200자 통과`, checkQuote('a'.repeat(199) + '.', pol).ok)
  t(`cap(${pol}): 영어 201자 거부`, checkQuote('a'.repeat(200) + '.', pol).reason === 'too_long')
}
t('cap: 공백은 한 칸으로 눕혀 센다', checkQuote(`${'가'.repeat(49)}   \t${'가'.repeat(49)}.`, 'full').quote === `${'가'.repeat(49)} ${'가'.repeat(49)}.`)
t('cap: 이모지는 코드포인트 1자', checkQuote('😀'.repeat(100), 'full').ok && !checkQuote('😀'.repeat(101), 'full').ok)
// 혼합 언어 — 한글 비중 10% 이상이면 한국어(100), 미만이면 영어(200), 글자 없으면 모름(100)
t('lang: 한국어 문장 속 영어 제품명은 ko', quoteLang('AirPods Pro 배터리가 금방 닳아요') === 'ko')
t('lang: 영어 문장 속 한글 한 낱말은 en', quoteLang(`${'word '.repeat(30)}김치`) === 'en')
t('lang: 글자 없음 → unknown', quoteLang('1234 😀') === 'unknown')
t('mixed: 한글 비중 10%+ 는 100자 상한(150자 거부)', checkQuote('a'.repeat(135) + '가'.repeat(15), 'full').reason === 'too_long')
t('mixed: 한글 비중 10% 미만은 200자 상한(151자 통과)', checkQuote('a'.repeat(150) + '가', 'full').ok)
t('unknown: 더 엄격한 100자(101 거부·100 통과)', !checkQuote('1'.repeat(101), 'full').ok && checkQuote('1'.repeat(100), 'full').ok)
// 문장 분리
t('sentence: 줄바꿈은 두 문장', checkQuote('알림이 늦어요\n해지했어요', 'full').reason === 'multi_sentence')
t('sentence: "다." 뒤 띄어쓰기 없이 한글이면 두 문장', checkQuote('좋다.그런데 비싸다', 'full').reason === 'multi_sentence')
t('sentence: 물음표·느낌표 뒤 글이 있으면 두 문장', checkQuote('왜 안 돼요? 다시 해봐도', 'full').reason === 'multi_sentence' && checkQuote('최고! 또 살게요', 'full').reason === 'multi_sentence')
t('sentence: 전각 부호(。！？) 뒤 글이면 두 문장', checkQuote('いい。また買う', 'full').reason === 'multi_sentence')
t('sentence: 소수점은 경계 아님', checkQuote('버전 6.1 에서 깨짐.', 'full').ok)
t('sentence: 끝에 붙은 부호 묶음은 한 문장', checkQuote('정말요?!', 'full').ok && checkQuote('글쎄요...', 'full').ok)
t('sentence: 약어는 알려진 한계 — 두 문장으로 보고 거부(안전한 쪽)', checkQuote('e.g. this works', 'full').reason === 'multi_sentence')
// 빈 값 · 절단 금지 · 정책
t('empty: 빈 값·공백·null → empty', ['', '   ', null, undefined].every((v) => checkQuote(v, 'full').reason === 'empty'))
t('none: 정책 none 이면 내용과 무관하게 policy_none', checkQuote('짧다.', 'none').reason === 'policy_none' && policyQuote('짧다.', 'none') === '')
{
  const samples = ['가'.repeat(300), '하나. 둘.', 'a'.repeat(500) + '.', '짧다.', 'x\ny', '왜? 응', '😀'.repeat(150)]
  const cut = samples.some((s) => { const c = checkQuote(s, 'full'); return c.ok ? c.quote !== s.replace(/\s+/g, ' ').trim() : c.quote !== '' })
  t('절단 금지: 통과면 원문 그대로, 거부면 빈 값 — 중간은 없다(말줄임 없음)', !cut && samples.every((s) => !checkQuote(s, 'full').quote.endsWith('…')))
}
t('summary: 거부 사유별 한 줄', quoteCheckSummary('t', [checkQuote('짧다.', 'full'), checkQuote('a. b.', 'full'), checkQuote('가'.repeat(200), 'full'), checkQuote('x', 'none')])
  === '[t] quote-cap checked=4 ok=1 rejected=2 (multi_sentence=1 too_long=1) policy_none=1 empty=0')
t('summary: 0건이면 null(찍지 않는다)', quoteCheckSummary('t', []) === null)
{
  const q = normalizeEvidenceQuotes(['알림이 늦게 와서 불편합니다 정말로'], [{ source_type: 'review', source_key: 'googleplay', raw_text: '알림이 늦게 와서 불편합니다 정말로 그래요' }])
  t('evidence: 저장 시 source_key 를 단다', q.length === 1 && q[0].source_key === 'googleplay')
  const legacy = normalizeEvidenceQuotes(['알림이 늦게 와서 불편합니다'], [{ source_type: 'review', raw_text: '알림이 늦게 와서 불편합니다' }])
  t('evidence: source_key 없는 입력이면 키를 만들지 않는다(옛 모양 유지)', legacy.length === 1 && !('source_key' in legacy[0]))
  const pol = new Map([['googleplay', 'short_only'], ['danawa', 'full'], ['appstore', 'none'], ['x', 'weird']])
  const mixed = [
    ...q,
    { text: 'a. b.', source_type: 'review', source_key: 'danawa' },
    { text: '배송이 빨라요.', source_type: 'review', source_key: 'danawa' },
    { text: 'x.', source_type: 'review', source_key: 'appstore' },
    { text: 'y.', source_type: 'review', source_key: 'x' },
    { text: 'z.', source_type: 'review', source_key: 'nomap' },
  ]
  const pub = publicQuotes(mixed, pol)
  t('publicQuotes: none·모르는 값·맵에 없는 소스·두 문장은 뺀다', pub.length === 2)
  t('publicQuotes: short_only 는 소스 키를 떼고 낸다(출처 비표시)', !('source_key' in pub[0]) && pub[0].text === '알림이 늦게 와서 불편합니다 정말로')
  t('publicQuotes: full 한 문장은 키 유지', pub[1].text === '배송이 빨라요.' && pub[1].source_key === 'danawa')
  t('publicQuotes: 옛 인용(source_key 없음)은 내지 않는다', publicQuotes(legacy, pol).length === 0)
  t('publicQuotes: 정책 맵을 못 읽었으면(null) 0건', publicQuotes(q, null).length === 0)
}

if (fail) { console.log(`실패 ${fail}건 / 통과 ${pass}건`); process.exit(1) }
console.log(`통과 ${pass}건 — 발췌 상한 · 출처 링크(HN·YouTube·다나와·[SRC:] 머리말·url: 타깃) · 질의 파서 · 종류(kind) · 링크 · 소스 칩 건수 · 고객 인용 상한(v20)`)
