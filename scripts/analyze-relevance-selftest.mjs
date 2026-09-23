#!/usr/bin/env node
// 리뷰 목적 적합성 판정(T2) 셀프테스트 — 픽스처만 쓴다(네트워크·DB·LLM 없음).
//   node scripts/analyze-relevance-selftest.mjs
//
// 지키는 것
//   1) 3상태다. mock·파싱 실패·라벨 누락·어휘 밖 값·호출 실패는 전부 `unknown` 이다.
//      **어느 경로로도 `irrelevant` 가 만들어지지 않는다** — 접는 순간 멀쩡한 원문이 영영 안 읽힌다(§7.1).
//   2) 사람 채점(few-shot)이 프롬프트에 실제로 들어간다. 없으면 그 블록 자체가 없다.
//   3) extract 제외 규칙: irrelevant 만 빼고 unknown 은 남기고, 판정 캐시가 비면 아무것도 안 뺀다.
//   4) 채점 표본은 관련/무관 반반, seed 가 같으면 같은 표, 키(input_id)를 잃지 않는다.
//   5) 호출부 배선 — 모듈만 맞고 extract·배치·워크플로가 안 부르면 효과가 정확히 0 이다.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  BATCH_SIZE,
  MAX_REVIEW_CHARS,
  buildRelevancePrompt,
  chunkReviews,
  describePurpose,
  dropIrrelevant,
  judgeRelevanceBatch,
  parseGradingMarkdown,
  parseRelevanceArray,
  pickGradingSample,
} from '../lib/analysis/relevance-judge.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}`) } }

const reviews = [
  { input_id: 'aaaaaaaa-0000-4000-8000-000000000001', text: '결제 페이지에서 카드가 계속 튕겨서 3주째 못 팔고 있다' },
  { input_id: 'aaaaaaaa-0000-4000-8000-000000000002', text: '오늘 점심 맛있었다' },
  { input_id: 'aaaaaaaa-0000-4000-8000-000000000003', text: '구독 해지를 어디서 하는지 못 찾겠다' },
]
const purpose = { product_elevator_pitch: '1인 창업가용 결제 대시보드' }

// ── 1. 목적 문장 ────────────────────────────────────────────────
t('reader_problem 이 있으면 코드+라벨',
  describePurpose({ reader_problem: 'NO_FIRST_CUSTOMER' }).includes('NO_FIRST_CUSTOMER')
  && describePurpose({ reader_problem: 'NO_FIRST_CUSTOMER' }).includes('첫 고객'))
t('reader_problem 이 없으면 한 줄 소개', describePurpose(purpose) === '1인 창업가용 결제 대시보드')
t('둘 다 없으면 목적 미기재를 감추지 않는다', describePurpose({}).includes('목적 미기재'))

// ── 2. 3상태 파싱 6종 ───────────────────────────────────────────
t('맨 배열', parseRelevanceArray('[{"id":"R1","rel":"relevant"}]')[0].rel === 'relevant')
t('코드블록', parseRelevanceArray('```json\n[{"id":"R1","rel":"irrelevant"}]\n```')[0].rel === 'irrelevant')
t('앞뒤 잡텍스트', parseRelevanceArray('판정이다:\n[{"id":"R1","rel":"unknown"}]\n끝.')[0].rel === 'unknown')
t('껍데기 객체', parseRelevanceArray('{"verdicts":[{"id":"R1","rel":"relevant"}]}')[0].rel === 'relevant')
t('JSON 이 아니면 null (빈 배열이 아니다)', parseRelevanceArray('모르겠다') === null)
t('어휘 밖 값은 unknown (무관이 아니다)', parseRelevanceArray('[{"id":"R1","rel":"no"}]')[0].rel === 'unknown')
t('대소문자·공백을 견딘다', parseRelevanceArray('[{"id":" r1 ","rel":" RELEVANT "}]')[0].rel === 'relevant')
t('why 가 없으면 null', parseRelevanceArray('[{"id":"R1","rel":"relevant"}]')[0].why === null)

// ── 3. unknown 접힘 금지 ────────────────────────────────────────
const prevProvider = process.env.LLM_PROVIDER
process.env.LLM_PROVIDER = 'gemini'
const call = (text) => async () => ({ text, model: 'fake-relevance' })

const ok = await judgeRelevanceBatch(purpose, reviews, [], call('[{"id":"R1","rel":"relevant"},{"id":"R2","rel":"irrelevant"}]'))
t('응답에 있는 라벨은 그 값', ok.verdicts[0].verdict === 'relevant' && ok.verdicts[1].verdict === 'irrelevant')
t('응답에 없는 라벨은 unknown (무관이 아니다)', ok.verdicts[2].verdict === 'unknown')
t('라벨이 아니라 원래 input_id 를 돌려준다', ok.verdicts[0].input_id === reviews[0].input_id)
t('모델명을 남긴다', ok.model === 'fake-relevance')

const extra = await judgeRelevanceBatch(purpose, reviews, [], call('[{"id":"R1","rel":"relevant"},{"id":"Z9","rel":"irrelevant"}]'))
t('응답에만 있는 라벨은 버린다', extra.verdicts.length === 3 && extra.verdicts[1].verdict === 'unknown')

const broken = await judgeRelevanceBatch(purpose, reviews, [], call('판정 못 하겠다'))
t('파싱 실패는 전부 unknown', broken.verdicts.every((v) => v.verdict === 'unknown'))
t('파싱 실패에 irrelevant 가 하나도 없다', !broken.verdicts.some((v) => v.verdict === 'irrelevant'))

const thrown = await judgeRelevanceBatch(purpose, reviews, [], async () => { throw new Error('boom') })
t('호출 실패도 전부 unknown — 던지지 않는다', thrown.verdicts.every((v) => v.verdict === 'unknown'))

const { ProviderHttpError } = await import('../lib/analysis/llm.ts')
const quota = await judgeRelevanceBatch(purpose, reviews, [], async () => { throw new ProviderHttpError(429, 'rate limit') })
t('429 는 quotaExhausted 로 알린다(배치가 멈출 수 있게)', quota.quotaExhausted === true)
t('한도로 멈춰도 판정은 unknown', quota.verdicts.every((v) => v.verdict === 'unknown'))

process.env.LLM_PROVIDER = 'mock'
const mock = await judgeRelevanceBatch(purpose, reviews, [], call('[{"id":"R1","rel":"irrelevant"}]'))
t('mock 은 판정을 흉내내지 않는다 — 전부 unknown', mock.verdicts.every((v) => v.verdict === 'unknown'))
t('mock 도 무관을 만들지 않는다', !mock.verdicts.some((v) => v.verdict === 'irrelevant'))
if (prevProvider === undefined) delete process.env.LLM_PROVIDER
else process.env.LLM_PROVIDER = prevProvider

// ── 4. 프롬프트 · few-shot 주입 ─────────────────────────────────
const plain = buildRelevancePrompt(purpose, reviews)
t('라벨은 R1..Rn', plain.labels.join(',') === 'R1,R2,R3')
t('목적이 프롬프트에 들어간다', plain.user.includes('1인 창업가용 결제 대시보드'))
t('리뷰 원문이 그대로 들어간다', plain.user.includes(reviews[0].text))
t('예시가 없으면 예시 블록도 없다', !plain.user.includes('사람이 매긴 판정 예시'))
t('3상태를 지시문에 명시한다',
  /relevant/.test(plain.system) && /irrelevant/.test(plain.system) && /unknown/.test(plain.system))
t('애매하면 unknown 으로 두라고 말한다', plain.system.includes('애매하면'))

const shot = buildRelevancePrompt(purpose, reviews, [
  { text: '환불 정책이 어디 있는지 못 찾겠다', verdict: 'relevant' },
  { text: '배송 언제 오나요', verdict: 'irrelevant' },
])
t('few-shot 이 프롬프트에 주입된다', shot.user.includes('사람이 매긴 판정 예시 2건'))
t('few-shot 원문이 들어간다', shot.user.includes('환불 정책이 어디 있는지 못 찾겠다'))
t('few-shot 라벨이 관련/무관으로 붙는다', shot.user.includes('[관련]') && shot.user.includes('[무관]'))

const longOne = [{ input_id: 'x', text: 'ㄱ'.repeat(MAX_REVIEW_CHARS + 500) }]
t('리뷰 1건은 1,500자로 자른다', !buildRelevancePrompt(purpose, longOne).user.includes('ㄱ'.repeat(MAX_REVIEW_CHARS + 1)))
t('줄바꿈은 한 줄로 눕힌다', buildRelevancePrompt(purpose, [{ input_id: 'x', text: 'a\n\nb' }]).user.includes('R1. a b'))

t('배치는 20건씩 쪼갠다', chunkReviews(Array.from({ length: 45 }, (_, i) => i)).length === 3 && BATCH_SIZE === 20)
t('빈 목록은 빈 배치', chunkReviews([]).length === 0)

// ── 5. extract 제외 규칙 ────────────────────────────────────────
const inputs = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4' }]
const rows = [
  { input_id: 'i1', verdict: 'irrelevant' },
  { input_id: 'i2', verdict: 'unknown' },
  { input_id: 'i3', verdict: 'relevant' },
]
const dropped = dropIrrelevant(inputs, rows)
t('irrelevant 는 제외한다', !dropped.kept.some((i) => i.id === 'i1'))
t('unknown 은 남긴다(확인 불가를 버리지 않는다)', dropped.kept.some((i) => i.id === 'i2'))
t('판정 행이 없는 입력도 남긴다', dropped.kept.some((i) => i.id === 'i4'))
t('제외 건수를 센다', dropped.droppedIrrelevant === 1)
t('판정 캐시가 비면 아무것도 안 뺀다(첫날)', dropIrrelevant(inputs, []).droppedIrrelevant === 0)
t('조회 실패(null)도 아무것도 안 뺀다', dropIrrelevant(inputs, null).kept.length === 4)
t('사람 채점이 LLM 판정을 이긴다 — 무관→관련',
  dropIrrelevant(inputs, [{ input_id: 'i1', verdict: 'irrelevant', human_verdict: 'relevant' }]).droppedIrrelevant === 0)
t('사람 채점이 LLM 판정을 이긴다 — 관련→무관',
  dropIrrelevant(inputs, [{ input_id: 'i3', verdict: 'relevant', human_verdict: 'irrelevant' }]).droppedIrrelevant === 1)

// ── 6. 채점 표본 5종 ────────────────────────────────────────────
const pool = [
  ...Array.from({ length: 8 }, (_, i) => ({ input_id: `rel-${i}`, verdict: 'relevant', text: `관련 ${i}` })),
  ...Array.from({ length: 8 }, (_, i) => ({ input_id: `irr-${i}`, verdict: 'irrelevant', text: `무관 ${i}` })),
  ...Array.from({ length: 5 }, (_, i) => ({ input_id: `unk-${i}`, verdict: 'unknown', text: `확인불가 ${i}` })),
]
const s1 = pickGradingSample(pool, { n: 10, seed: 42 })
t('표본 10장', s1.length === 10)
t('관련 5 · 무관 5 로 섞는다',
  s1.filter((r) => r.verdict === 'relevant').length === 5 && s1.filter((r) => r.verdict === 'irrelevant').length === 5)
t('unknown 은 표본에 넣지 않는다', !s1.some((r) => r.verdict === 'unknown'))
t('seed 가 같으면 같은 표', pickGradingSample(pool, { n: 10, seed: 42 }).map((r) => r.input_id).join() === s1.map((r) => r.input_id).join())
t('seed 가 다르면 다른 표', pickGradingSample(pool, { n: 10, seed: 7 }).map((r) => r.input_id).join() !== s1.map((r) => r.input_id).join())
t('키(input_id)를 잃지 않는다', s1.every((r) => typeof r.input_id === 'string' && r.input_id.length > 0))
const thin = pickGradingSample(
  [...Array.from({ length: 9 }, (_, i) => ({ input_id: `rel-${i}`, verdict: 'relevant', text: 'x' })),
    { input_id: 'irr-0', verdict: 'irrelevant', text: 'y' }],
  { n: 10, seed: 42 },
)
t('한쪽이 모자라면 반대쪽에서 채운다', thin.length === 10)
t('모집단이 모자라면 있는 만큼만', pickGradingSample(pool.slice(0, 3), { n: 10 }).length <= 3)

// ── 7. 채점표 되읽기 ────────────────────────────────────────────
const sampleMd = [
  '| # | 프로젝트 | 리뷰 원문 | 관련 ☐ | 무관 ☐ | 모델 판정 | 키 |',
  '|---|---|---|---|---|---|---|',
  '| 1 | p | 본문 | x | ☐ | 관련 | `aaaaaaaa-0000-4000-8000-000000000001` |',
  '| 2 | p | 본문 | ☐ | x | 무관 | `aaaaaaaa-0000-4000-8000-000000000002` |',
  '| 3 | p | 본문 | ☐ | ☐ | 관련 | `aaaaaaaa-0000-4000-8000-000000000003` |',
  '| 4 | p | 본문 | x | x | 무관 | `aaaaaaaa-0000-4000-8000-000000000004` |',
].join('\n')
const parsed = parseGradingMarkdown(sampleMd)
t('체크한 줄만 채점으로 읽는다', parsed.marks.length === 2)
t('관련/무관을 가른다', parsed.marks[0].verdict === 'relevant' && parsed.marks[1].verdict === 'irrelevant')
t('빈칸은 판정 불가로 건너뛴다(무관이 아니다)', parsed.blank === 1)
t('양쪽 체크는 사람 실수로 보고한다', parsed.conflict.length === 1)
t('머리글·구분선은 읽지 않는다', parsed.marks.every((m) => m.input_id.startsWith('aaaaaaaa')))

// ── 8. 호출부 배선 ──────────────────────────────────────────────
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8')
const run = read('lib/analysis/extract-run.ts')
const auto = read('scripts/relevance-judge-auto.mjs')
const wf = read('.github/workflows/nightly-relevance.yml')
const mig = read('supabase/migrations/20260929000002_review_relevance_verdicts.sql')

t('extract 가 dropIrrelevant 를 쓴다', run.includes('dropIrrelevant(') && run.includes("from './relevance-judge.ts'"))
t('extract 가 입력 id 를 조회한다(제외 키)', run.includes("select('id, source_type, raw_text"))
t('extract 가 조회 실패를 null 로 넘긴다(제외 없음)', run.includes('relevanceError ? null :'))
t('extract 가 droppedIrrelevant 를 로그·반환에 남긴다',
  run.includes('irrelevant=${droppedIrrelevant}') && /droppedIrrelevant,?\s/.test(run) && /return \{[\s\S]{0,200}droppedInputs,/.test(run))
t('배치가 T1 선별을 재사용한다', auto.includes('selectInputs('))
t('배치가 판정 있는 입력을 건너뛴다', auto.includes('done.has(s.input.id)'))
t('배치가 사람 채점을 덮지 않는다', auto.includes('human_verdict·human_graded_at 은 payload 에 없다') && !auto.includes('human_verdict: '))
t('배치가 few-shot 을 주입한다', auto.includes('examplesFor('))
t('배치가 한도면 멈춘다', auto.includes('quotaExhausted') && auto.includes('남은') && auto.includes('내일'))
t('배치가 예산 지갑 안에서 돈다', auto.includes('withLlmBudget('))
t('배치가 실행 기록을 남긴다(createTracker 재사용)', auto.includes('createTracker(') && auto.includes("dept: 'cto'"))
t('워크플로가 KST 04:03 에 돈다', wf.includes("cron: '3 19 * * *'") && wf.includes('scripts/relevance-judge-auto.mjs'))
t('워크플로 기본값이 dry_run', wf.includes('dry_run') && wf.includes('default: true') && wf.includes("'--dry'"))
t('워크플로가 GEMINI_API_KEY 를 받는다', wf.includes('secrets.GEMINI_API_KEY'))
t('마이그레이션이 3값 CHECK 를 건다',
  mig.includes("verdict IN ('relevant','irrelevant','unknown')") && mig.includes('human_verdict IN'))
t('마이그레이션이 RLS 를 켜고 정책을 만들지 않는다',
  mig.includes('ENABLE ROW LEVEL SECURITY') && mig.includes('FORCE  ROW LEVEL SECURITY') && !mig.includes('CREATE POLICY'))
t('마이그레이션에 미적용 표기와 확인 쿼리가 있다',
  mig.includes('**미적용**') && mig.includes('── 양성') && mig.includes('── 음성'))

console.log(`\n${fail === 0 ? '✅' : '❌'} 리뷰 관련성 판정 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
