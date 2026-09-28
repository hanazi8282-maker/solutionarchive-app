#!/usr/bin/env node
// lib/relevance-feedback/translate.ts 셀프테스트 — 네트워크·DB·env 없음.
//
// 고정하는 것(채점 독립성 — 이 화면은 모델 판정을 숨기고 사람이 독립 채점한다):
//   1. 세 프롬프트가 제한 문구(PROMPT_RESTRICTIONS)를 전부 싣는다 — 요약·생략·평가·판단 금지, 지어내기 금지
//   2. 사후검사가 평가 표지를 잡는다(배경: 관련·유용·정보가·추천·보인다… / 번역: 머리말·역주·해설·리뷰 논평) — 걸리면 failed, 본문 없음
//   3. 스레드 맥락은 저장된 것만 읽는다: HN 제목 있음 · PH·YouTube 는 식별자만(제목 null) · 그 밖은 null
//   4. 캐시 판단: 행 있음+같은 버전이면 안 부른다 · 버전 다르면 다시 · failed 는 --retry-failed 일 때만 · 같은 스레드 제목은 재사용
//   5. 한국어 원문은 부르지 않고 skipped
//   6. 정적: translate.ts·카드에 판정 계열이 없다(verdict 를 프롬프트·props 로 넘기지 않는다)

import fs from 'node:fs'
import {
  BACKGROUND_SYSTEM, PROMPT_RESTRICTIONS, TITLE_SYSTEM, TRANSLATE_PROMPT_VERSION, TRANSLATION_SYSTEM,
  buildBackgroundPrompt, buildTranslationPrompt, checkBackground, checkTitle, checkTranslation,
  generateBackground, generateTranslation, needsTranslation, needsWork, parseSourceContext, reuseThreadTitle, stripOutput,
} from '../lib/relevance-feedback/translate.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${w}\n   실제 ${g}`) }
}

// 1) 프롬프트 제한 문구
for (const [k, sys] of [['translation', TRANSLATION_SYSTEM], ['title', TITLE_SYSTEM], ['background', BACKGROUND_SYSTEM]]) {
  for (const phrase of PROMPT_RESTRICTIONS[k]) t(`프롬프트 ${k} 에 "${phrase}"`, sys.includes(phrase), true)
}
t('번역 프롬프트에 판단 금지', /어떤 판단도 적지 않는다/.test(TRANSLATION_SYSTEM), true)
t('배경 프롬프트에 형식 예시', BACKGROUND_SYSTEM.includes('Lemon Squeezy'), true)
t('user 프롬프트는 원문만', buildTranslationPrompt('hello'), '## 원문\nhello')
t('배경 user 프롬프트는 소개+URL 만', buildBackgroundPrompt({ pitch: 'X does Y', competitorUrl: 'https://x.io' }), '## 제품 소개\nX does Y\n## 제품 URL\nhttps://x.io')

// 2) 사후검사
const src = 'I use ConvertKit for the newsletter. Its pricing is far more reasonable than MailChimp and the like.'
t('번역 통과', checkTranslation(src, '뉴스레터에는 ConvertKit 을 쓴다. 가격이 MailChimp 같은 곳보다 훨씬 합리적이다.'), { ok: true })
t('번역: 원문의 "추천" 은 막지 않는다', checkTranslation('Go get convertkit, I recommend it.', 'convertkit 을 써라, 추천한다.'), { ok: true })
t('번역: 머리말', checkTranslation(src, '번역: 뉴스레터에는 ConvertKit 을 쓴다. 가격이 MailChimp 보다 합리적이다.').ok, false)
t('번역: 역주', checkTranslation(src, '뉴스레터에는 ConvertKit(역주: 이메일 도구)을 쓴다. 가격이 MailChimp 보다 합리적이다.').ok, false)
t('번역: 리뷰 논평', checkTranslation(src, '뉴스레터에는 ConvertKit 을 쓴다. 가격이 합리적이다.\n이 리뷰는 가격 비교를 담고 있다.').ok, false)
t('번역: 평가 문구', checkTranslation(src, '뉴스레터에는 ConvertKit 을 쓴다. 가격이 합리적이다. 관련성이 있어 보인다.').ok, false)
t('번역: 요약 표지', checkTranslation(src, '요약하면 ConvertKit 이 MailChimp 보다 싸다는 말이다.').ok, false)
t('번역: 코드블록', checkTranslation(src, '```\n뉴스레터에는 ConvertKit 을 쓴다.\n```').ok, false)
t('번역: 한국어 아님', checkTranslation(src, src).ok, false)
t('번역: 너무 짧음(요약)', checkTranslation(src, 'CK 씀.').ok, false)
t('번역: 너무 김(덧붙임)', checkTranslation('ok', '이건 좋다는 말이고 여기에 긴 설명을 덧붙였다 덧붙였다 덧붙였다.').ok, false)
t('번역: 빈 출력', checkTranslation(src, '  ').ok, false)
t('제목 통과', checkTitle('Ask HN: What email tool do you use?', 'Ask HN: 어떤 이메일 도구를 쓰나요?'), { ok: true })
t('제목: 두 줄', checkTitle('Ask HN: x', '한 줄\n두 줄').ok, false)
t('배경 통과', checkBackground('Lemon Squeezy: SaaS·디지털 상품 판매자용 결제 대행 서비스. 세금·사기방지·환불을 대신 처리하고 수수료를 뗀다.'), { ok: true })
for (const w of ['관련', '유용', '정보가', '추천', '보인다']) {
  const r = checkBackground(`Lemon Squeezy: 결제 대행 서비스. 이 제품은 ${w} 어쩌고.`)
  t(`배경: "${w}" 거부`, r.ok === false && r.reason.includes(w), true)
}
t('배경: 형용사', checkBackground('Cal.com: 훌륭한 일정 예약 도구다.').ok, false)
t('배경: 감탄', checkBackground('Cal.com: 일정 예약 도구다!').ok, false)
t('배경: 마크다운', checkBackground('**Cal.com**: 일정 예약 도구다.').ok, false)
t('배경: 길이 초과', checkBackground('Cal.com: 일정 예약 도구다. ' + '링크로 회의를 잡는다. '.repeat(30)).ok, false)
t('배경: 영어만', checkBackground('Cal.com: scheduling tool.').ok, false)
t('stripOutput 코드펜스·따옴표', stripOutput('```text\n"뉴스레터"\n```'), '뉴스레터')

// 3) 스레드 맥락 — 저장된 것만
t('HN 제목·id·본문', parseSourceContext('hackernews', '[HN: Ask HN: What do you use? · https://news.ycombinator.com/item?id=123] I use CK.'),
  { threadKey: '123', threadTitle: 'Ask HN: What do you use?', threadRef: 'https://news.ycombinator.com/item?id=123', body: 'I use CK.' })
t('HN 옛 형식(URL 없음)', parseSourceContext('hackernews', '[HN: Old title] body'), { threadKey: 'Old title', threadTitle: 'Old title', threadRef: 'Old title', body: 'body' })
t('HN 머리표 없음', parseSourceContext('hackernews', 'plain body').threadKey, null)
t('PH 슬러그만·제목 null', parseSourceContext('producthunt', '[Product Hunt 댓글 · cal-com] Congrats!'), { threadKey: 'cal-com', threadTitle: null, threadRef: 'producthunt.com/posts/cal-com', body: 'Congrats!' })
t('YouTube videoId 만·제목 null', parseSourceContext('youtube', '[YouTube 댓글 · dQw4w9WgXcQ] hi'), { threadKey: 'dQw4w9WgXcQ', threadTitle: null, threadRef: 'youtube.com/watch?v=dQw4w9WgXcQ', body: 'hi' })
t('다나와: 스레드 개념 없음', parseSourceContext('danawa', '배송 빨라요'), { threadKey: null, threadTitle: null, threadRef: null, body: '배송 빨라요' })
t('source_key null', parseSourceContext(null, '[HN: x] y').threadKey, null)

// 4) 캐시 판단
const okRow = { status: 'ok', prompt_version: TRANSLATE_PROMPT_VERSION }
t('행 없음 → 만든다', needsWork(null), true)
t('같은 버전 ok → 안 부른다', needsWork(okRow), false)
t('같은 버전 skipped → 안 부른다', needsWork({ status: 'skipped', prompt_version: TRANSLATE_PROMPT_VERSION }), false)
t('버전 다름 → 다시', needsWork({ status: 'ok', prompt_version: 'tr-v0' }), true)
t('failed 기본 → 안 부른다', needsWork({ status: 'failed', prompt_version: TRANSLATE_PROMPT_VERSION }), false)
t('failed + retry → 다시', needsWork({ status: 'failed', prompt_version: TRANSLATE_PROMPT_VERSION }, { retryFailed: true }), true)
const titleRows = [
  { source_key: 'hackernews', thread_key: '123', thread_title: 'T', thread_title_ko: '제목', status: 'ok', prompt_version: TRANSLATE_PROMPT_VERSION },
  { source_key: 'hackernews', thread_key: '999', thread_title: 'T', thread_title_ko: '옛 제목', status: 'ok', prompt_version: 'tr-v0' },
]
t('스레드 제목 재사용', reuseThreadTitle(titleRows, 'hackernews', '123'), '제목')
t('스레드 제목: 옛 버전은 안 씀', reuseThreadTitle(titleRows, 'hackernews', '999'), null)
t('스레드 제목: 다른 소스', reuseThreadTitle(titleRows, 'producthunt', '123'), null)

// 5) 생성 — 가짜 호출. 호출 횟수로 "안 부른다"를 확인한다.
const calls = []
const fake = (answers) => async (system, user, label) => { calls.push({ label, user }); return { text: answers[label] ?? '', model: 'fake' } }
t('한국어 원문 → skipped·호출 0', (await generateTranslation(fake({}), { input_id: 'a', project_id: 'p', source_key: 'danawa', raw_text: '배송 빨라요 포장도 좋아요' })).status, 'skipped')
t('  호출 0회', calls.length, 0)
t('영어 판단', needsTranslation('I love it 정말'), true)
t('기호만', needsTranslation('12345 !!!'), false)

calls.length = 0
const good = fake({ 'relevance-translate/title': 'Ask HN: 무엇을 쓰나요?', 'relevance-translate/text': 'CK 를 뉴스레터에 쓴다. 가격이 MailChimp 보다 합리적이다.' })
const r1 = await generateTranslation(good, { input_id: 'b', project_id: 'p', source_key: 'hackernews', raw_text: '[HN: Ask HN: What do you use? · https://news.ycombinator.com/item?id=123] I use CK for the newsletter. Pricing is more reasonable than MailChimp.' })
t('HN 번역 ok', [r1.status, r1.thread_key, r1.thread_title_ko, r1.text_ko, r1.prompt_version], ['ok', '123', 'Ask HN: 무엇을 쓰나요?', 'CK 를 뉴스레터에 쓴다. 가격이 MailChimp 보다 합리적이다.', TRANSLATE_PROMPT_VERSION])
t('  제목+본문 2회 호출', calls.map((c) => c.label), ['relevance-translate/title', 'relevance-translate/text'])
t('  프롬프트에 머리표(제목·URL)가 섞이지 않는다', calls[1].user.includes('[HN:'), false)
calls.length = 0
const r2 = await generateTranslation(good, { input_id: 'c', project_id: 'p', source_key: 'hackernews', raw_text: '[HN: Ask HN: What do you use? · https://news.ycombinator.com/item?id=123] Same here, CK pricing beats MailChimp for our list size.' }, { threadTitleKo: '재사용 제목' })
t('제목 재사용 시 본문만 1회 호출', calls.map((c) => c.label), ['relevance-translate/text'])
t('  재사용 제목 그대로', r2.thread_title_ko, '재사용 제목')

const tainted = fake({ 'relevance-translate/text': '요약하면 CK 가 싸다는 말이다. 관련성이 있어 보인다.' })
const r3 = await generateTranslation(tainted, { input_id: 'd', project_id: 'p', source_key: 'producthunt', raw_text: '[Product Hunt 댓글 · cal-com] I use CK for the newsletter because pricing beats MailChimp by a mile for small lists.' })
t('오염 출력 → failed·본문 없음', [r3.status, r3.text_ko, r3.fail_reason?.startsWith('사후검사')], ['failed', null, true])
const throwing = async () => { throw new Error('429 rate') }
const r4 = await generateTranslation(throwing, { input_id: 'e', project_id: 'p', source_key: 'youtube', raw_text: '[YouTube 댓글 · abc] Support took a week to reply, switched to ChartMogul.' })
t('호출 실패 → failed', [r4.status, r4.text_ko, r4.fail_reason?.startsWith('호출 실패')], ['failed', null, true])

const bgOk = await generateBackground(fake({ 'relevance-translate/background': 'Lemon Squeezy: 디지털 상품 결제 대행 서비스. 세금·환불을 대신 처리한다.' }), { id: 'p', product_elevator_pitch: 'LS is a merchant of record.' })
t('배경 ok', [bgOk.status, bgOk.background], ['ok', 'Lemon Squeezy: 디지털 상품 결제 대행 서비스. 세금·환불을 대신 처리한다.'])
const bgBad = await generateBackground(fake({ 'relevance-translate/background': 'Lemon Squeezy: 인디 개발자에게 인기 있는 결제 대행 서비스. 이 제품 리뷰는 관련이 높다.' }), { id: 'p', product_elevator_pitch: 'LS is a merchant of record.' })
t('배경 오염 → failed·본문 없음', [bgBad.status, bgBad.background], ['failed', null])
t('배경: 소개 없음 → skipped·호출 없음', (await generateBackground(throwing, { id: 'p', product_elevator_pitch: '  ' })).status, 'skipped')

// 6) 정적 — 판정 계열이 번역 모듈·카드 props 에 없다
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const modSrc = stripComments(fs.readFileSync(new URL('../lib/relevance-feedback/translate.ts', import.meta.url), 'utf8'))
t('translate.ts 에 verdict 없음', /verdict/i.test(modSrc), false)
t('translate.ts 에 second_/human_/informative 없음', /second_|human_|informative/.test(modSrc), false)
const cardSrc = fs.readFileSync(new URL('../app/relevance/grade/relevance-card.tsx', import.meta.url), 'utf8')
const ctxType = /export type CardContext = \{([\s\S]*?)\n\}/.exec(cardSrc)?.[1] ?? ''
t('CardContext 타입에 판정 계열 없음', ctxType.length > 0 && !/verdict|stratum|informative|model/i.test(ctxType.replace(/\/\*\*[\s\S]*?\*\//g, '')), true)
const pageSrc = fs.readFileSync(new URL('../app/relevance/grade/page.tsx', import.meta.url), 'utf8')
const ctxFn = /const contextOf = [\s\S]*?\n  \}/.exec(pageSrc)?.[0] ?? ''
t('page contextOf 가 판정 값을 싣지 않는다', ctxFn.length > 0 && !/\.verdict|second_verdict|product_informative|human_/.test(ctxFn), true)
t('page 가 캐시에서 본문 컬럼만 고른다', /select\('input_id, text_ko, thread_title, thread_title_ko, thread_key, status'\)/.test(fs.readFileSync(new URL('../lib/relevance-feedback/db.ts', import.meta.url), 'utf8')), true)
const scriptSrc = fs.readFileSync(new URL('./relevance-translate.mjs', import.meta.url), 'utf8')
t('배치가 원문 테이블에서 4개 컬럼만 고른다', scriptSrc.includes(`select('id, project_id, source_key, raw_text')`), true)
t('배치의 기본 provider 는 claude-cli(Gemini 쿼터 안 씀)', scriptSrc.includes(`process.env.LLM_PROVIDER ??= 'claude-cli'`), true)

console.log(`relevance-translate-selftest: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
