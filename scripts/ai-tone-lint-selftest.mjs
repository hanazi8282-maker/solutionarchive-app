#!/usr/bin/env node
// ai-tone-lint.mjs 셀프테스트 — 네트워크·DB 없음. 모든 문장은 합성 [FIXTURE] 다(실제 카드·고객 리뷰 아님).
//   node scripts/ai-tone-lint-selftest.mjs
// 고정하는 것: 문장 분리(소수점·따옴표·괄호·줄바꿈) · 지표 10종 양성/음성 · 인용 130/131 · 설정값·스펙을 바꾸면 판정이 바뀜 · CLI 종료 코드 0/1/2.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitSentences } from '../lib/content/ko-style.ts'
import { DEFAULT_CONFIG_PATH, applySpec, contrastCount, isNounPhrase, lint, loadConfig, summary } from './ai-tone-lint.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const CFG = { ...JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8')), targets_from: 'selftest' } // 스펙 파일 유무와 무관하게 고정
const withT = (t, extra = {}) => ({ ...CFG, ...extra, targets: { ...CFG.targets, ...t } })
let n = 0
const ok = (name, fn) => { fn(); n++; console.log(`  ok ${name}`) }
const ids = (r) => r.findings.map((f) => f.id)
const has = (r, id, level) => r.findings.some((f) => f.id === id && (!level || f.level === level))

// [FIXTURE] 기준 덱 — 본문 15문장, "~다" 13(86.7%), 물음표 1(6.7%), 명사 단문 1, 가운데값 21자. 아무것도 안 걸려야 한다.
const BASE_P = [
  '[FIXTURE] 작은 가게는 재고를 매일 손으로 센다. 주문이 몰리는 날에는 숫자가 자주 틀린다. 그래서 사장은 밤마다 장부를 다시 맞춘다.',
  '이 일에 하루 두 시간이 넘게 들어간다. 도구를 바꾸면 이 시간이 줄어들까?',
  '한 가게는 바코드 스캐너 하나로 시작했다. 첫 달에 틀린 숫자가 절반으로 줄었다. 두 달째에는 장부 정리를 아예 그만뒀다. 남은 시간은 단골 손님 응대에 썼다.',
  '매출은 석 달 만에 64.8% 늘었다.',
  '비싼 시스템이 필요했던 건 아니었다. 작은 습관 하나. 숫자를 세는 방식이 가게를 바꿨다.',
  '내일 아침 재고표부터 열어 보면 된다.',
]
const card = (paras, { quote = '[FIXTURE] 배송이 빨라서 좋았어요. 다음에도 살게요.', caption = '작은 가게가 재고를 세는 법을 바꿨다.\n#재고' } = {}) => ({
  slides: [
    { no: 0, role: 'cover', heading: ['[FIXTURE] 재고를 세는 법'], paragraphs: [], media: null },
    ...paras.map((t, i) => ({ no: i + 1, role: 'case', heading: null, paragraphs: [{ text: t, bold: false }], media: null })),
    ...(quote === null ? [] : [{ no: 99, role: 'quote', heading: null, paragraphs: [{ text: quote, bold: false }], media: null }]),
  ],
  caption,
  hashtags: ['#재고', '#소상공인'],
})
const run = (paras, opt, cfg = CFG) => lint(card(paras, opt), cfg)

console.log('기준 덱')
const base = run(BASE_P)
ok('기준 덱은 실패·경고 0', () => assert.deepEqual(ids(base), []))
ok('기준 덱 통계(문장 단위로 센 값)', () => assert.deepEqual(
  [base.stats.sentences, base.stats.da_pct, base.stats.question_pct, base.stats.noun_phrases, base.stats.contrast],
  [15, 86.7, 6.7, 1, 0]))

console.log('문장 분리')
ok('소수점 64.8%·3.5배에서 안 끊는다', () => assert.equal(splitSentences('[FIXTURE] 매출은 64.8% 늘었다. 비용은 3.5배 줄었다.').length, 2))
ok('따옴표 안 마침표에서 안 끊는다', () => assert.equal(splitSentences('[FIXTURE] 사장은 "됐다. 끝났다." 하고 웃었다.').length, 1))
ok('괄호 안 마침표에서 안 끊는다', () => assert.equal(splitSentences('[FIXTURE] 매출이 늘었다(추정치. 자체 집계) 고 한다.').length, 1))
ok('줄바꿈은 경계다', () => assert.equal(splitSentences('[FIXTURE] 첫 줄이다\n둘째 줄이다').length, 2))
ok('물음표·느낌표도 경계다', () => assert.equal(splitSentences('[FIXTURE] 왜 그랬을까? 몰랐다! 이제 안다.').length, 3))

console.log('1. 한다체 비율·존댓말')
const allDa = Array.from({ length: 10 }, (_, i) => `[FIXTURE] 가게 ${i + 1}호점은 재고를 손으로 센다.`)
ok('전부 "~다"(100%) → 실패', () => assert.ok(has(run([allDa.join(' ')], { caption: '' }), 'da_ratio', 'fail')))
ok('86.7% → 통과', () => assert.ok(!has(base, 'da_ratio')))
const politeR = run([...BASE_P, '[FIXTURE] 이 방법을 꼭 써 보세요.'])
ok('존댓말 혼입 → 경고 + 위치', () => assert.ok(politeR.findings.some((f) => f.id === 'polite_mix' && f.level === 'warn' && f.where.includes('문단1'))))
ok('"~가 아니다." 는 존댓말이 아니다(~니다 오분류 회귀)', () => assert.ok(!has(run([...BASE_P, '[FIXTURE] 답은 도구가 아니다.']), 'polite_mix')))
ok('"늘었다 🚀." 도 "~다" 로 센다', () => assert.equal(run(['[FIXTURE] 매출이 크게 늘었다 🚀.'], { caption: '', quote: null }).stats.da_pct, 100))
ok('quote 장의 존댓말은 말투 지표에서 제외',() => assert.ok(!has(base, 'polite_mix')))

console.log('2. 질문 비율')
ok('물음표 3/17(17.6%) → 실패', () => assert.ok(has(run([...BASE_P, '[FIXTURE] 왜 그랬을까? 무엇이 달랐을까?']), 'question', 'fail')))
ok('1/15(6.7%) → 통과', () => assert.ok(!has(base, 'question')))

console.log('3. 명사구 단문')
ok('"해고는 없다." 는 서술어가 있어 아니다', () => assert.equal(isNounPhrase('해고는 없다.', 20), false))
ok('"작은 습관 하나." 는 명사구', () => assert.equal(isNounPhrase('작은 습관 하나.', 20), true))
ok('"64.8%." 는 명사구', () => assert.equal(isNounPhrase('64.8%.', 20), true))
ok('물음표 문장은 아니다', () => assert.equal(isNounPhrase('작은 습관 하나?', 20), false))
const nouns = (k) => Array.from({ length: k }, (_, i) => `[FIXTURE] 작은 습관 ${i + 2}번.`)
ok('명사 단문 7번(기준 덱 1 + 6) → 경고', () => assert.ok(has(run([...BASE_P, nouns(6).join(' ')]), 'noun_phrase', 'warn')))
ok('6번(1 + 5) → 통과', () => assert.ok(!has(run([...BASE_P, nouns(5).join(' ')]), 'noun_phrase')))

console.log('4. "A가 아니라 B" 대비 틀')
const C = ['[FIXTURE] 문제는 가격이 아니라 시간이다.', '[FIXTURE] 필요한 건 장비가 아닌 습관이다.', '[FIXTURE] 답은 도구가 아니다. 습관이다.']
ok('세는 꼴 3종(아니라·아닌·아니다+다음 문장)', () => assert.equal(contrastCount(splitSentences(C.join(' '))), 3))
ok('"뿐만 아니라"·"아닌 것 같다"·"아니라고" 는 안 센다', () => assert.equal(contrastCount(splitSentences('[FIXTURE] 값뿐만 아니라 품질도 좋다. 그건 답이 아닌 것 같다. 그는 아니라고 했다.')), 0))
ok('3회 → 실패', () => assert.ok(has(run([...BASE_P, ...C]), 'contrast', 'fail')))
ok('2회 → 통과', () => assert.ok(!has(run([...BASE_P, ...C.slice(0, 2)]), 'contrast')))

console.log('5. 문장 길이')
ok('짧은 문장뿐(가운데값 < 19) → 실패', () => assert.ok(has(run(Array.from({ length: 6 }, (_, i) => `[FIXTURE] 짧다 ${i}.`), { caption: '' }), 'median_len', 'fail')))
const sized = (k) => { const head = '[FIXTURE] '; const tail = ' 늘었다.'; return head + '가'.repeat(k - [...head].length - [...tail].length) + tail }
ok('61자 → 긴 문장 경고', () => assert.ok(has(run([...BASE_P, sized(61)]), 'long_sentence', 'warn')))
ok('60자 → 통과', () => assert.ok(!has(run([...BASE_P, sized(60)]), 'long_sentence')))

console.log('6. 금지 표현·AI 말투')
const bannedR = run([...BASE_P, '[FIXTURE] 결국 가게를 바꾼 건 숫자였다.'])
ok('"결국" 적중 + 위치', () => assert.ok(bannedR.findings.some((f) => f.id === 'banned' && f.msg.includes('결국') && f.where)))
ok('기준 덱은 적중 0', () => assert.ok(!has(base, 'banned')))
const sumP = (k) => Array.from({ length: k }, (_, i) => `[FIXTURE] ${i + 1}호점은 장부를 버렸다. 즉 시간이 남았다.`)
ok('정리 문장으로 맺은 문단 3곳 → 경고', () => assert.ok(has(run([...BASE_P, ...sumP(3)]), 'summary_repeat')))
ok('2곳 → 통과', () => assert.ok(!has(run([...BASE_P, ...sumP(2)]), 'summary_repeat')))
const rago = (k) => Array.from({ length: k }, (_, i) => `[FIXTURE] ${i + 1}번 사장은 "편하다"라고 썼다.`).join(' ')
ok('"~라고 썼다" 3연속 → 경고', () => assert.ok(has(run([...BASE_P, rago(3)]), 'rago_run')))
ok('2연속 → 통과', () => assert.ok(!has(run([...BASE_P, rago(2)]), 'rago_run')))
ok('이모지 1개 → 경고', () => assert.ok(has(run([...BASE_P, '[FIXTURE] 매출이 크게 늘었다 🚀.']), 'emoji')))
ok('em dash 3개 → 경고 / 2개 → 통과', () => {
  assert.ok(has(run([...BASE_P, '[FIXTURE] 숫자 — 시간 — 손님 — 모두 바뀌었다.']), 'emdash'))
  assert.ok(!has(run([...BASE_P, '[FIXTURE] 숫자 — 시간 — 모두 바뀌었다.']), 'emdash'))
})
ok('"A, B, C" 나열 3번 → 경고', () => assert.ok(has(run([...BASE_P, '[FIXTURE] 쌀, 콩, 팥을 샀다. 펜, 종이, 자를 샀다. 컵, 접시, 숟가락을 샀다.']), 'triad')))

console.log('7. 문단 리듬')
const rh = ['[FIXTURE] 1호점은 빨랐다. 손님이 늘었다.', '[FIXTURE] 2호점은 느렸다. 손님이 줄었다.', '[FIXTURE] 3호점은 멈췄다. 손님이 떠났다.']
ok('같은 리듬 3문단 연속 → 경고', () => assert.ok(has(run([...BASE_P, ...rh]), 'rhythm')))
ok('2문단 연속 → 통과', () => assert.ok(!has(run([...BASE_P, ...rh.slice(0, 2)]), 'rhythm')))

console.log('8. 메타 줄 누출')
for (const leak of ['판단 이유: 표본이 적다.', '독자: 1인 창업가', '근거 세기 강', '[예시 데이터] 매출 3배', 'TODO 숫자 확인', '이 수치는 확인되지 않는다.', '출처 확인 불가.', '[근거: 중] 늘었다.']) {
  ok(`"${leak}" → 실패`, () => { const r = run([...BASE_P, `[FIXTURE] ${leak}`]); assert.ok(has(r, 'meta_leak', 'fail')); assert.equal(r.ok, false) })
}
ok('quote 장 안의 메타도 실패', () => assert.ok(has(run(BASE_P, { quote: '[FIXTURE] 좋았어요. TODO' }), 'meta_leak', 'fail')))

console.log('9. 인용')
const q = (k) => '가'.repeat(k - 1) + '.'
ok('130자 → 통과', () => assert.ok(!has(run(BASE_P, { quote: q(130) }), 'quote_len')))
ok('131자 → 실패', () => { const r = run(BASE_P, { quote: q(131) }); assert.ok(has(r, 'quote_len', 'fail')); assert.equal(r.ok, false) })
ok('출처 표시(구글 플레이·님·@·날짜) → 경고', () => {
  for (const src of ['구글 플레이 리뷰', '민지님 후기', '@abc_1', '2026.10.15 작성']) assert.ok(has(run(BASE_P, { quote: `[FIXTURE] 좋았어요. ${src}` }), 'quote_source', 'warn'), src)
})
ok('이메일·전화번호 → 실패', () => {
  assert.ok(has(run(BASE_P, { quote: '[FIXTURE] 문의 test@example.com' }), 'pii', 'fail'))
  assert.ok(has(run(BASE_P, { quote: '[FIXTURE] 연락 010-1234-5678' }), 'pii', 'fail'))
})
ok('출처·개인정보 없는 인용 → 둘 다 없음', () => assert.ok(!has(base, 'quote_source') && !has(base, 'pii')))

console.log('10. 흔한 오타')
ok('"되요"·"몇일"·"설레임" → 경고', () => { const r = run([...BASE_P, '[FIXTURE] 몇일 지나니 설레임이 생겼다. 이제 되요.']); assert.equal(r.findings.filter((f) => f.id === 'typo').length, 3) })
ok('"안되" → 경고 / "안된다" 아닌 "안 된다" 는 통과', () => {
  assert.ok(has(run([...BASE_P, '[FIXTURE] 그렇게 하면 안되는 이유가 있다.']), 'typo'))
  assert.ok(!has(run([...BASE_P, '[FIXTURE] 그렇게 하면 안 되는 이유가 있다.']), 'typo'))
})
ok('quote 장의 오타는 고객 원문이라 안 본다', () => assert.ok(!has(run(BASE_P, { quote: '[FIXTURE] 배송이 빨라서 좋아 되요' }), 'typo')))

console.log('설정값·스펙을 바꾸면 판정이 바뀐다')
ok('contrast_max 3 → 3회 통과', () => assert.ok(!has(run([...BASE_P, ...C], undefined, withT({ contrast_max: 3 })), 'contrast')))
ok('quote_max_chars 131 → 131자 통과', () => assert.ok(!has(run(BASE_P, { quote: q(131) }, withT({ quote_max_chars: 131 })), 'quote_len')))
ok('banned 심각도 fail → ok=false', () => assert.equal(run([...BASE_P, '[FIXTURE] 결국 숫자였다.'], undefined, { ...CFG, severity: { ...CFG.severity, banned: 'fail' } }).ok, false))
ok('question_pct [0,5] → 6.7% 실패', () => assert.ok(has(run(BASE_P, undefined, withT({ question_pct: [0, 5] })), 'question', 'fail')))
ok('banned 목록에 새 표현 추가 → 적중', () => assert.ok(has(run(BASE_P, undefined, { ...CFG, banned: [{ re: '장부', label: '장부' }] }), 'banned')))
const spec = { defaults: { voice: { ending_distribution_pct: { '~다': [80, 93] }, question_pct: { range: [0, 7] }, sentence_len_chars: { median_range: [19, 28], max: 60 }, emoji: false } }, override: { voice: { question_pct: { range: [0, 5] } } } }
ok('스펙 voice 반영(override 우선) → 질문 목표 0~5', () => { const c = applySpec(CFG, spec, 'fixture'); assert.deepEqual(c.targets.question_pct, [0, 5]); assert.ok(has(lint(card(BASE_P), c), 'question', 'fail')) })
ok('스펙 override 없으면 defaults(0~7) → 6.7% 통과', () => assert.ok(!has(lint(card(BASE_P), applySpec(CFG, { ...spec, override: { voice: null } })), 'question')))

console.log('평문·요약·CLI')
ok('평문(빈 줄=문단)도 같은 판정', () => assert.deepEqual(ids(lint(BASE_P.join('\n\n'), CFG)), []))
ok('빈 입력 → 실패(판정 불가를 통과로 접지 않는다)', () => assert.ok(has(lint('', CFG), 'no_sentences', 'fail')))
ok('사람용 요약은 항목당 한 줄', () => { const s = summary(run([...BASE_P, ...C])); assert.ok(s.split('\n').some((l) => l.startsWith('- [실패]') && l.includes('아니라'))) })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tone-'))
const cli = (args) => spawnSync(process.execPath, [path.join(here, 'ai-tone-lint.mjs'), ...args], { encoding: 'utf8' })
fs.writeFileSync(path.join(tmp, 'good.json'), JSON.stringify(card(BASE_P)))
fs.writeFileSync(path.join(tmp, 'bad.json'), JSON.stringify(card([...BASE_P, ...C])))
fs.writeFileSync(path.join(tmp, 'spec.json'), JSON.stringify(spec))
ok('CLI 통과 → exit 0', () => assert.equal(cli([path.join(tmp, 'good.json')]).status, 0))
ok('CLI 실패 → exit 1, --json 은 파싱되는 보고서', () => { const r = cli([path.join(tmp, 'bad.json'), '--json']); assert.equal(r.status, 1); assert.equal(JSON.parse(r.stdout).stats.contrast, 3) })
ok('CLI 없는 파일 → exit 2', () => assert.equal(cli([path.join(tmp, 'none.json')]).status, 2))
ok('CLI --spec 반영 → 질문 0~5 로 실패', () => { const r = cli([path.join(tmp, 'good.json'), '--spec', path.join(tmp, 'spec.json'), '--json']); assert.equal(r.status, 1); assert.match(JSON.parse(r.stdout).targets_from, /^스펙/) })
ok('loadConfig 기본 경로가 읽힌다', () => assert.ok(loadConfig().targets.contrast_max === 2))
fs.rmSync(tmp, { recursive: true, force: true })

console.log(`\nai-tone-lint selftest: ${n}개 통과`)
