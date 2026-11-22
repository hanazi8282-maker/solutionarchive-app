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
  impactFrequencyTags,
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

// ── 2b. T2 라벨 — 못 정하면 NULL, 어휘 밖도 NULL ───────────────
const lab = parseRelevanceArray('[{"id":"R1","rel":"relevant","impact":"HIGH","freq":"low","signal":"pain","wtp":true},{"id":"R2","rel":"relevant","impact":"medium","freq":null,"signal":"complaint","wtp":"yes"},{"id":"R3","rel":"relevant","wtp":"false"}]')
t('라벨 4종을 읽는다', lab[0].impact === 'high' && lab[0].frequency === 'low' && lab[0].community_signal === 'pain' && lab[0].wtp_mentioned === true)
t('어휘 밖 라벨은 null (medium→mid 짐작 금지)', lab[1].impact === null && lab[1].frequency === null && lab[1].community_signal === null)
t('wtp 는 true/false 만, yes 는 null', lab[1].wtp_mentioned === null && lab[2].wtp_mentioned === false)
t('라벨이 없으면 null (false·mid 로 접지 않는다)', lab[2].impact === null && lab[2].community_signal === null)
t('태그: 둘 다 있으면 2개', impactFrequencyTags(lab[0]).join('|') === '영향 높음|빈도 낮음')
t('태그: NULL 이면 빈 태그를 만들지 않는다', impactFrequencyTags(lab[2]).length === 0 && impactFrequencyTags(null).length === 0)
t('태그: 한쪽만 있으면 1개', impactFrequencyTags({ impact: null, frequency: 'mid' }).join() === '빈도 보통')

// ── 2c. rr-v2 정보 판정(info) — true/false 만, 어휘 밖·누락은 null (false 로 접지 않는다) ──
const inf = parseRelevanceArray('[{"id":"R1","rel":"relevant","info":true},{"id":"R2","rel":"relevant","info":"false"},{"id":"R3","rel":"relevant","info":"yes"},{"id":"R4","rel":"relevant"},{"id":"R5","rel":"irrelevant","info":1},{"id":"R6","rel":"relevant","product_informative":false}]')
t('info: true / "false" 를 읽는다', inf[0].product_informative === true && inf[1].product_informative === false)
t('info: 어휘 밖(yes·1)은 null', inf[2].product_informative === null && inf[4].product_informative === null)
t('info: 누락은 null (false 가 아니다)', inf[3].product_informative === null)
t('info: product_informative 키도 받는다', inf[5].product_informative === false)
t('info: rel 과 따로 읽는다(무관인데 info 없음 → rel 그대로)', inf[4].rel === 'irrelevant')

// ── 3. unknown 접힘 금지 ────────────────────────────────────────
const prevProvider = process.env.LLM_PROVIDER
process.env.LLM_PROVIDER = 'gemini'
const call = (text) => async () => ({ text, model: 'fake-relevance' })

const ok = await judgeRelevanceBatch(purpose, reviews, [], call('[{"id":"R1","rel":"relevant"},{"id":"R2","rel":"irrelevant"}]'))
t('응답에 있는 라벨은 그 값', ok.verdicts[0].verdict === 'relevant' && ok.verdicts[1].verdict === 'irrelevant')
t('응답에 없는 라벨은 unknown (무관이 아니다)', ok.verdicts[2].verdict === 'unknown')
t('라벨이 아니라 원래 input_id 를 돌려준다', ok.verdicts[0].input_id === reviews[0].input_id)
t('모델명을 남긴다', ok.model === 'fake-relevance')
t('응답에 라벨이 없으면 라벨 전부 null', ok.verdicts.every((v) => v.impact === null && v.frequency === null && v.community_signal === null && v.wtp_mentioned === null))
t('응답에 info 가 없으면 product_informative null', ok.verdicts.every((v) => v.product_informative === null))
const okInfo = await judgeRelevanceBatch(purpose, reviews, [], call('[{"id":"R1","rel":"relevant","info":true},{"id":"R2","rel":"irrelevant","info":false}]'))
t('info 가 판정 행까지 온다(R1 true · R2 false · 누락 R3 null)', okInfo.verdicts[0].product_informative === true && okInfo.verdicts[1].product_informative === false && okInfo.verdicts[2].product_informative === null)

const extra = await judgeRelevanceBatch(purpose, reviews, [], call('[{"id":"R1","rel":"relevant"},{"id":"Z9","rel":"irrelevant"}]'))
t('응답에만 있는 라벨은 버린다', extra.verdicts.length === 3 && extra.verdicts[1].verdict === 'unknown')

const broken = await judgeRelevanceBatch(purpose, reviews, [], call('판정 못 하겠다'))
t('파싱 실패는 전부 unknown', broken.verdicts.every((v) => v.verdict === 'unknown'))
t('파싱 실패는 라벨도 전부 null', broken.verdicts.every((v) => v.impact === null && v.wtp_mentioned === null))
t('파싱 실패에 irrelevant 가 하나도 없다', !broken.verdicts.some((v) => v.verdict === 'irrelevant'))

const thrown = await judgeRelevanceBatch(purpose, reviews, [], async () => { throw new Error('boom') })
t('호출 실패도 전부 unknown — 던지지 않는다', thrown.verdicts.every((v) => v.verdict === 'unknown'))
t('호출 실패·파싱 실패의 info 는 null (false 로 접지 않는다)', thrown.verdicts.every((v) => v.product_informative === null) && broken.verdicts.every((v) => v.product_informative === null))

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
t('정보 열 없는 표 → product_informative 전부 null', parsed.marks.every((m) => m.product_informative === null))

// 7b. 정보 열(선택) — 머리글 이름으로 찾는다. 정보만 체크한 줄은 verdict=null(관련 불변).
const infoMd = [
  '| # | 프로젝트 | 리뷰 원문 | 관련 ☐ | 무관 ☐ | 모름 ☐ | 정보있음 ☐ | 정보없음 ☐ | 모델 판정 | 키 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  '| 1 | p | 본문 | x | ☐ | ☐ | x | ☐ | 관련 | `aaaaaaaa-0000-4000-8000-000000000001` |',
  '| 2 | p | 본문 | ☐ | ☐ | ☐ | ☐ | x | 관련 | `aaaaaaaa-0000-4000-8000-000000000002` |',
  '| 3 | p | 본문 | ☐ | x | ☐ | ☐ | ☐ | 무관 | `aaaaaaaa-0000-4000-8000-000000000003` |',
  '| 4 | p | 본문 | ☐ | ☐ | ☐ | x | x | 관련 | `aaaaaaaa-0000-4000-8000-000000000004` |',
  '| 5 | p | 본문 | ☐ | ☐ | ☐ | ☐ | ☐ | 관련 | `aaaaaaaa-0000-4000-8000-000000000005` |',
].join('\n')
const pi = parseGradingMarkdown(infoMd)
const byKey = Object.fromEntries(pi.marks.map((m) => [m.input_id.slice(-1), m]))
t('정보 열: 관련+정보있음', byKey['1']?.verdict === 'relevant' && byKey['1']?.product_informative === true)
t('정보 열: 정보만 체크 → verdict null(관련 불변)·정보없음 false', byKey['2']?.verdict === null && byKey['2']?.product_informative === false)
t('정보 열: 관련만 체크 → 정보 null', byKey['3']?.verdict === 'irrelevant' && byKey['3']?.product_informative === null)
t('정보 열: 두 칸 체크 → 충돌', pi.conflict.length === 1 && pi.conflict[0].endsWith('4'))
t('정보 열: 전부 빈 줄 → blank', pi.blank === 1 && pi.marks.length === 3)
// 관련 칸이 없는 표(정보 열만)여도 정보 칸 쌍을 관련으로 오독하지 않는다.
const onlyInfo = parseGradingMarkdown('| # | 원문 | 정보있음 ☐ | 정보없음 ☐ | 키 |\n|---|---|---|---|---|\n| 1 | t | x | ☐ | `aaaaaaaa-0000-4000-8000-000000000001` |')
t('정보 열만 있는 표: 관련으로 오독하지 않는다', onlyInfo.marks.length === 1 && onlyInfo.marks[0].verdict === null && onlyInfo.marks[0].product_informative === true)

// ── 8. 호출부 배선 ──────────────────────────────────────────────
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8')
const run = read('lib/analysis/extract-run.ts')
// pendingFor 는 v31 항목 5 에서 lib/analysis/relevance-pending.ts 로 떼어 냈다 — 두 파일을 한 호출부로 읽는다.
const auto = read('scripts/relevance-judge-auto.mjs') + '\n' + read('lib/analysis/relevance-pending.ts')
t('배치가 pendingFor 를 relevance-pending 에서 만든다', auto.includes('createPendingFor({'))
const wf = read('.github/workflows/nightly-relevance.yml')
const mig = read('supabase/migrations/20260929000002_review_relevance_verdicts.sql')
const labelMig = read('supabase/migrations/20260930000014_review_verdict_labels.sql')
const sampleScript = read('scripts/relevance-grading-sample.mjs')
t('라벨 마이그: nullable ADD COLUMN + 허용값 CHECK', labelMig.includes('ADD COLUMN IF NOT EXISTS impact') && labelMig.includes("impact IN ('high','mid','low')") && labelMig.includes("community_signal IN ('pain','demand','objection')") && !/NOT NULL|UPDATE public|DROP /.test(labelMig.split('-- 확인 쿼리')[0].replace(/^--.*$/gm, '')))
t('라벨 마이그: 미적용 표기·예외 5개 해당 없음', labelMig.includes('**미적용**') && labelMig.includes('해당 없음'))
// 컬럼 없음 폴백은 lib/analysis/relevance-judge-all.ts saveWithColumnFallback 으로 옮겼다(실행 검사는 relevance-judge-all-selftest §8).
const judgeAll = read('lib/analysis/relevance-judge-all.ts')
t('배치가 라벨을 저장하고, 컬럼 없으면 라벨만 버린다', auto.includes('LABEL_KEYS') && auto.includes('saveWithColumnFallback(') && judgeAll.includes("'PGRST204'") && judgeAll.includes('라벨 미기록(마이그 미적용)'))
t('채점표가 라벨 컬럼 이름을 부르지 않고(*) 태그를 붙인다', sampleScript.includes(".select('*')") && sampleScript.includes('impactFrequencyTags('))

t('배치가 product_informative 를 저장하고, 컬럼 없으면 그 필드만 뺀다', auto.includes('product_informative: v.product_informative') && judgeAll.includes("cols.info = 'absent'") && judgeAll.includes('정보 판정 미기록(마이그 미적용)'))
const gradeImport = read('scripts/relevance-grading-import.mjs')
t('채점 import: 정보 열 → human_product_informative, 관련 칸 비면 human_verdict·human_graded_at 불변',
  gradeImport.includes('human_product_informative: m.product_informative') && gradeImport.includes('m.verdict !== null ? { human_verdict: m.verdict, human_graded_at: now }'))
t('채점표: 정보 열·재확인 모드', sampleScript.includes('정보있음 ☐ | 정보없음 ☐') && sampleScript.includes("opt('recheck')") && sampleScript.includes('RR39_NARROW_IRRELEVANT_INPUT_IDS'))
const infoMig = read('supabase/migrations/20260930000031_relevance_product_informative.sql')
t('정보 마이그: nullable boolean 3개 ADD COLUMN IF NOT EXISTS, 백필·CHECK·NOT NULL 없음',
  ['product_informative', 'second_product_informative', 'human_product_informative'].every((c) => infoMig.includes(`ADD COLUMN IF NOT EXISTS ${c} boolean`))
  && !/NOT NULL|UPDATE public|DROP |CHECK/.test(infoMig.split('-- 확인 쿼리')[0].replace(/^--.*$/gm, '')) && infoMig.includes('**미적용**'))
t('정보 마이그 롤백 파일', read('supabase/migrations/20260930000031_relevance_product_informative_rollback.sql').includes('DROP COLUMN IF EXISTS human_product_informative'))

t('extract 가 dropIrrelevant 를 쓴다', run.includes('dropIrrelevant(') && run.includes("from './relevance-judge.ts'"))
// 2026-10-05: 입력 조회에 source_key 가 끼었다(인용에 소스 키를 붙여 고객 화면 인용 정책을 거는 데 쓴다 — evidence-quotes.ts publicQuotes).
// 이 검사의 대상(id 를 첫 열로 조회)은 그대로고, source_key·raw_text 도 같이 확인한다.
t('extract 가 입력 id 를 조회한다(제외 키)', run.includes("select('id, source_type, source_key, raw_text"))
t('extract 가 조회 실패를 null 로 넘긴다(제외 없음)', run.includes('relevanceError ? null :'))
t('extract 가 droppedIrrelevant 를 로그·반환에 남긴다',
  run.includes('irrelevant=${droppedIrrelevant}') && /droppedIrrelevant,?\s/.test(run) && /return \{[\s\S]{0,200}droppedInputs,/.test(run))
t('배치가 T1 선별을 재사용한다', auto.includes('selectInputs('))
// v27 옵션 A — 판정 대상 상태 = 야간 extract 후보 상태(한 벌). 리터럴 'collecting' 로 되돌리면 실패한다.
{
  const gate = await import('../lib/analysis/extract-gate.ts')
  t('대상 상태: extract-gate AUTO_EXTRACT_STATUSES 를 import 한다', /import \{ AUTO_EXTRACT_STATUSES, relevanceFailedState \} from '\.\.\/lib\/analysis\/extract-gate\.ts'/.test(auto))
  // v28 #10 — 재추출 1회 뒤에도 failed 면 제외. 첫 실패는 재추출 대기라 판정 유지. 시도 수 못 읽으면 확인 불가(제외 0건과 다르다).
  const fs = gate.relevanceFailedState
  t('failed 제외: failed 가 아니면 n/a', fs('collecting', 0) === 'n/a' && fs('extracted', 5) === 'n/a')
  t('failed 제외: 첫 실패(attempts=1)는 재추출 대상 — 판정 유지', fs('failed', 1) === 'retry' && fs('failed', 0) === 'retry')
  t('failed 제외: 재추출 뒤에도 failed(attempts≥2)면 제외', fs('failed', 2) === 'excluded' && fs('failed', 3) === 'excluded')
  t('failed 제외: attempts 를 못 읽으면 unknown(제외로 접지 않는다)', fs('failed', null) === 'unknown' && fs('failed', undefined) === 'unknown' && fs('failed', '2') === 'unknown')
  t('failed 제외: 배치가 extract_attempts 를 조회하고 n/a·retry 만 판정한다',
    auto.includes('extract_attempts') && auto.includes("['n/a', 'retry'].includes(relevanceFailedState(p.status, p.extract_attempts))"))
  t('failed 제외: 재추출 대상·제외·확인 불가 수를 로그에 남긴다', auto.includes('재추출 대상(첫 실패, 판정 유지) ${failedBy.retry}건') && auto.includes('확인 불가 ${failedBy.unknown}건'))
  t("대상 상태: .in('status', AUTO_EXTRACT_STATUSES) 로 조회한다", auto.includes(".in('status', AUTO_EXTRACT_STATUSES)"))
  t("대상 상태: 리터럴 .eq('status', 'collecting') 가 없다", !auto.includes(".eq('status', 'collecting')"))
  t('대상 상태: collecting·extracted 를 포함한다', gate.AUTO_EXTRACT_STATUSES.includes('collecting') && gate.AUTO_EXTRACT_STATUSES.includes('extracted'))
  // 전량 판정(남헌 결정)에서 5 → 30. 실제 멈춤은 캡·마감(RELEVANCE_DEADLINE_MIN)이 먼저 건다.
  t('대상 상태: 실행당 프로젝트 상한(RELEVANCE_MAX_PROJECTS 기본 30)', auto.includes('num(process.env.RELEVANCE_MAX_PROJECTS, 30)'))
  const second = read('scripts/relevance-second-judge-auto.mjs')
  t('2차는 프로젝트 상태로 거르지 않는다(1차 판정 행을 따라간다 = 같은 집합)', !/analysis_projects[\s\S]{0,200}\.(eq|in)\('status'/.test(second))
}
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

// ── v2.3 (v71bi) — 활성 영역은 config 에서 채우고, 영역 문구가 낡은 채로 남지 않는다 ──
{
  const { relevanceCriteriaV23, RELEVANCE_CRITERIA_V22, RELEVANCE_V23_VERSION } = await import('../lib/analysis/relevance-criteria.ts')
  const areas = ['① 회의록·통화 요약', '⑧ 업무관리', '⑨ 디자인']
  const v23 = relevanceCriteriaV23(areas)
  t('v23: 버전 표기', v23.includes(RELEVANCE_V23_VERSION) && v23.includes('판정 기준 v2.3'))
  t('v23: 활성 영역 이름이 질문 문장에 들어간다', v23.includes('활성 영역: ① 회의록·통화 요약 / ⑧ 업무관리 / ⑨ 디자인'))
  t('v23: v2.2 의 영역 ①~⑤ 고정 문구가 남지 않는다', !v23.includes('영역 ①~⑤') && !v23.includes('⑤리뷰 관리'))
  t('v23: 규칙 (16) 이 (15) 뒤에 있다', v23.indexOf('(16)') > v23.indexOf('(15)') && v23.includes('노트·지식관리 앱이면 ⑤'))
  t('v23: 소비재 규칙 (5) 은 v2.2 와 같다', v23.includes('(5) 실물 소비재는 지금은 irrelevant.') && RELEVANCE_CRITERIA_V22.includes('(5) 실물 소비재는 지금은 irrelevant.'))
  let threw = false; try { relevanceCriteriaV23([]) } catch { threw = true }
  t('v23: 활성 영역이 비면 던진다(§7.1)', threw)
  const p23 = buildRelevancePrompt(purpose, reviews, [], { criteria: 'v23', areas })
  t('v23: 프롬프트 system 에 v2.3 기준이 실린다', p23.system.includes('판정 기준 v2.3') && !p23.system.includes('판정 기준 v2.2 로'))
  let threw2 = false; try { buildRelevancePrompt(purpose, reviews, [], { criteria: 'v23' }) } catch { threw2 = true }
  t('v23: areas 없이 부르면 던진다', threw2)
  const { relevanceCriteriaV24, RELEVANCE_V24_VERSION } = await import('../lib/analysis/relevance-criteria.ts')
  const a24 = ['① 회의록·통화 요약', '③ 마케팅 콘텐츠·광고 소재', '⑧ 업무관리']
  const v24 = relevanceCriteriaV24(a24)
  t('v24: 버전 표기', v24.includes(RELEVANCE_V24_VERSION) && v24.includes('판정 기준 v2.4') && !v24.includes('판정 기준 v2.3'))
  t('v24: ①·③ 이름이 v2.2 범위로 넓어지고 ⑧ 은 그대로', v24.includes('① 회의·통화 기록 일반') && v24.includes('③ 마케팅 도구 전반') && v24.includes('⑧ 업무관리') && !v24.includes('① 회의록·통화 요약 /'))
  t('v24: 규칙 (16)·(17) 이 있다', v24.includes('(16)') && v24.indexOf('(17)') > v24.indexOf('(16)'))
  let threw24 = false; try { relevanceCriteriaV24(['⑧ 업무관리']) } catch { threw24 = true }
  t('v24: ①·③ 이 활성 영역에 없으면 던진다(§7.1)', threw24)
  const p24 = buildRelevancePrompt(purpose, reviews, [], { criteria: 'v24', areas: a24 })
  t('v24: 프롬프트 system 에 v2.4 기준이 실린다', p24.system.includes('판정 기준 v2.4') && !p24.system.includes('판정 기준 v2.2 로'))
  const { secondOpinionInstructionsV24 } = await import('../lib/analysis/second-opinion.ts')
  t('v24: 2차 지시문에 v2.4 기준이 실린다', secondOpinionInstructionsV24(a24).includes('판정 기준 v2.4'))
  const { readFileSync } = await import('node:fs')
  const secSrc = readFileSync(new URL('./relevance-second-judge-auto.mjs', import.meta.url), 'utf8')
  t('v24: 야간 2차 스크립트가 v24 를 V24 지시문으로 잇는다(조용히 v22 로 가지 않는다)', secSrc.includes("secondMode === 'v24' ? secondOpinionInstructionsV24(names)"))
  t('v22 프롬프트는 그대로다', buildRelevancePrompt(purpose, reviews, [], { criteria: 'v22' }).system.includes('영역 ①~⑤'))
}

// ── v2.5 (v71db, 남헌 2026-11-22) — 추가 전용. v2.4 이하는 바이트 그대로(해시 고정), v2.5 = v2.4 + (18)~(20) ──
{
  const { createHash } = await import('node:crypto')
  const { readFileSync } = await import('node:fs')
  const C = await import('../lib/analysis/relevance-criteria.ts')
  const S = await import('../lib/analysis/second-opinion.ts')
  const h = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16)
  const a = ['① 회의록·통화 요약', '③ 마케팅 콘텐츠·광고 소재', '⑧ 업무관리']
  const P = { product_elevator_pitch: 'p', business_model: 'saas' }, R = [{ input_id: 'x', text: 't' }]
  // (a) 값은 v25 추가 전 main(e9815558)에서 잰 것. 하나라도 바뀌면 운영 v24·t2d 프롬프트가 바뀐 것이다.
  const frozen = {
    t2d: h(C.RELEVANCE_CRITERIA), info: h(C.PRODUCT_INFORMATIVE_CRITERIA), ver: C.RELEVANCE_CRITERIA_VERSION,
    v21: h(C.RELEVANCE_CRITERIA_V21), v22: h(C.RELEVANCE_CRITERIA_V22), v23: h(C.relevanceCriteriaV23(a)), v24: h(C.relevanceCriteriaV24(a)),
    sys24: h(buildRelevancePrompt(P, R, [], { criteria: 'v24', areas: a }).system), sec24: h(S.secondOpinionInstructionsV24(a)),
  }
  const frozenOk = JSON.stringify(frozen) === JSON.stringify({
    t2d: '03e8b059cd199d7f', info: 'c8d44049eb77d351', ver: 't2d-2026-09-28', v21: '4891de61b3afef7d', v22: 'a543abb21bc52814',
    v23: '198e8bec6b80b6d9', v24: '0b14c02f2ddfb851', sys24: 'c0600c2717900365', sec24: 'f2bd5d96769ab518',
  })
  if (!frozenOk) console.log(`  실측 해시: ${JSON.stringify(frozen)}`)
  t('v25(a): v24 이하·t2d 상수·프롬프트가 변경 전과 바이트 동일(해시)', frozenOk)
  const v24 = C.relevanceCriteriaV24(a), v25 = C.relevanceCriteriaV25(a)
  t('v25: 버전 태그', C.RELEVANCE_V25_VERSION === 'v25-2026-11-22' && v25.includes(`## 판정 기준 v2.5 (기준 버전 ${C.RELEVANCE_V25_VERSION})`))
  // (b) 머리글 두 군데만 v2.5 로 바뀌고 나머지는 v2.4 본문 그대로 + 덧붙인 블록.
  const back = v25.replace(`기준 버전 ${C.RELEVANCE_V25_VERSION}`, `기준 버전 ${C.RELEVANCE_V24_VERSION}`).replace('## 판정 기준 v2.5', '## 판정 기준 v2.4')
  t('v25(b): 머리글만 되돌리면 v2.4 본문이 접두이고 뒤는 v2.5 블록뿐', back.startsWith(v24) && back === v24 + C.RELEVANCE_V25_BLOCK)
  t('v25(b): (18)~(20) 이 (17) 뒤에 순서대로', [v25.indexOf('(17)'), v25.indexOf('(18) 버그 리포트'), v25.indexOf('(19) 창업자 자사 설명'), v25.indexOf('(20) 추상적 칭찬')].every((x, i, xs) => x > 0 && (i === 0 || x > xs[i - 1])))
  t('v25(b): 우선순위 한 줄이 블록 앞에 있다', v25.indexOf('(18)~(20)이 (9)·(14)보다 우선한다') > v25.indexOf('[v2.5 추가 — 남헌 2026-11-22]') && v25.indexOf('(18)~(20)이 (9)·(14)보다 우선한다') < v25.indexOf('(18) 버그'))
  t('v25(b): 규칙 (1)~(17)·영역 확장은 v2.4 그대로', v25.includes('① 회의·통화 기록 일반') && v25.includes('(17) ①은') && v25.includes('(16) 제품이 노트'))
  // (c) 시스템 프롬프트·2차 지시문
  const p25 = buildRelevancePrompt(P, R, [], { criteria: 'v25', areas: a })
  t('v25(c): 1차 system 에 v2.5, v2.4·v2.2 머리 문구가 남지 않는다', p25.system.includes('아래 판정 기준 v2.5 로') && p25.system.includes('(20) 추상적 칭찬') && !p25.system.includes('판정 기준 v2.4') && !p25.system.includes('기준 버전 ' + C.RELEVANCE_V24_VERSION) && !p25.system.includes('아래 판정 기준 v2.2 로'))
  t('v25(c): 1차 system = v2.4 system 의 기준 자리만 v2.5 로 바꾼 것', p25.system === buildRelevancePrompt(P, R, [], { criteria: 'v24', areas: a }).system.replace(v24, v25).replace('아래 판정 기준 v2.4 로', '아래 판정 기준 v2.5 로'))
  const s25 = S.secondOpinionInstructionsV25(a)
  t('v25(c): 2차 지시문에 v2.5 와 (18)~(20), v2.4 머리글 없음', s25.includes('판정 기준 v2.5') && s25.includes('(18) 버그 리포트') && s25.includes('(20) 추상적 칭찬') && !s25.includes('판정 기준 v2.4') && s25 === S.secondOpinionInstructionsV24(a).replace(v24, v25))
  // (d) 배선 — RELEVANCE_CRITERIA=v25 가 1차·2차 모두 v25 로 가고 prompt_version 이 v25 태그. v24 분기 문구는 그대로.
  const auto = readFileSync(new URL('./relevance-judge-auto.mjs', import.meta.url), 'utf8')
  const sec = readFileSync(new URL('./relevance-second-judge-auto.mjs', import.meta.url), 'utf8')
  t('v25(d): 1차가 v25 를 받아들이고 영역을 읽는다', auto.includes("v === 'v24' || v === 'v25' ? v : 'v22'") && auto.includes("criteriaMode === 'v24' || criteriaMode === 'v25' ? (() =>") && auto.includes("'v24', 'v25'].includes"))
  t('v25(d): 1차 prompt_version = v25-2026-11-22, v24 이하 분기는 그대로', auto.includes("criteriaMode === 'v25' ? RELEVANCE_V25_VERSION : criteriaMode === 'v24' ? RELEVANCE_V24_VERSION : criteriaMode === 'v23' ? RELEVANCE_V23_VERSION : criteriaMode === 'v22' ? RELEVANCE_V22_VERSION : criteriaMode === 'v21' ? RELEVANCE_V21_VERSION : RELEVANCE_CRITERIA_VERSION") && auto.includes('{ criteria: criteriaMode, areas: v23Areas }'))
  t('v25(d): 2차가 v25 를 V25 지시문으로 잇는다(조용히 v22 로 가지 않는다)', sec.includes("secondMode === 'v25' ? secondOpinionInstructionsV25(names) : secondMode === 'v24' ? secondOpinionInstructionsV24(names)") && sec.includes("secondMode === 'v24' || secondMode === 'v25'") && sec.includes("'v24', 'v25'].includes(secondMode)"))
  // (d') 1차 판정이 실제로 v25 system 을 들고 호출되는지(가짜 호출)
  const seen = []
  const fakeCall = async (system, user) => { seen.push(system); return { model: 'fake', text: JSON.stringify(user.match(/^R\d+\./gm).map((l) => ({ id: l.slice(0, -1), rel: 'relevant', info: false, why: 'x' }))) } }
  const prevProvider = process.env.LLM_PROVIDER; process.env.LLM_PROVIDER = 'gemini'
  try {
    const o = await judgeRelevanceBatch(P, R, [], fakeCall, { criteria: 'v25', areas: a })
    t('v25(d): judgeRelevanceBatch(criteria=v25) 가 v2.5 system 으로 부른다', seen[0] === p25.system && o.verdicts[0]?.verdict === 'relevant' && o.verdicts[0]?.product_informative === false)
  } finally { if (prevProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prevProvider }
  // (e) 치환 실패는 던진다
  let e1 = false; try { C.relevanceCriteriaV25(['⑧ 업무관리']) } catch { e1 = true }
  t('v25(e): ①·③ 없으면 던진다(v24 와 같음)', e1)
  const origReplace = String.prototype.replace
  let e2 = false
  String.prototype.replace = function (p, r) { return typeof p === 'string' && p.startsWith('기준 버전 v24') ? String(this) : origReplace.call(this, p, r) }
  try { C.relevanceCriteriaV25(a) } catch (e) { e2 = /v2\.5 판정 기준: 버전 치환 실패/.test(e.message) } finally { String.prototype.replace = origReplace }
  t('v25(e): 버전 치환이 조용히 안 먹으면 던진다(§7.1)', e2)
  let e3 = false
  String.prototype.replace = function (p, r) { return p === '아래 판정 기준 v2.2 로' && r === '아래 판정 기준 v2.5 로' ? String(this) : origReplace.call(this, p, r) }
  try { buildRelevancePrompt(P, R, [], { criteria: 'v25', areas: a }) } catch (e) { e3 = /v2\.5 시스템 프롬프트 치환 실패/.test(e.message) } finally { String.prototype.replace = origReplace }
  t('v25(e): 1차 system 치환 실패도 던진다', e3)
  let e4 = false; try { buildRelevancePrompt(P, R, [], { criteria: 'v25' }) } catch { e4 = true }
  t('v25(e): areas 없이 부르면 던진다', e4)
  console.log(`  · v2.5 블록 ${C.RELEVANCE_V25_BLOCK.length}자 (v2.4 기준 ${v24.length}자 → v2.5 ${v25.length}자, +${v25.length - v24.length})`)

  // ── scripts/v25-compare.mjs — DB 없음, 기본 --dry(호출 0회), 가짜 호출로 --run 경로 ──
  const V = await import('./v25-compare.mjs')
  const good = [
    { key: 'k1', text: 'Mailchimp 보다 싸다', project: { pitch: 'p1', business_model: 'saas' }, gold: { verdict: 'relevant', informative: true } },
    { key: 'k2', text: '5 estrellas', project: { pitch: 'p1', business_model: 'saas' }, gold: { verdict: 'irrelevant', informative: false } },
    { key: 'k3', text: 'crash trace', project: { pitch: 'p2' }, source_key: 'github', gold: { verdict: 'irrelevant', informative: false } },
  ]
  t('compare: 올바른 입력은 통과', V.validateRows(good).errors.length === 0)
  t('compare: 키 중복·gold 누락·빈 입력은 전부 거부', V.validateRows([good[0], good[0]]).errors.length === 1 && V.validateRows([{ ...good[0], gold: { verdict: 'unknown', informative: 1 } }]).errors.length === 2 && V.validateRows([]).errors.length === 1 && V.validateRows({}).rows.length === 0)
  t('compare: 프로젝트별로 묶는다', V.planBatches(good).length === 2 && V.planBatches(good)[0].reviews.length === 2)
  const st = V.promptStats(good, a)
  t('compare: --dry 통계는 기준별 버전·system 길이', st.v24.prompt_version === C.RELEVANCE_V24_VERSION && st.v25.prompt_version === C.RELEVANCE_V25_VERSION && st.v25.system_chars - st.v24.system_chars === v25.length - v24.length)
  const calls = []
  const fake = async (system, user) => {
    calls.push(system)
    const v25on = system.includes('판정 기준 v2.5')
    const ids = user.match(/^R\d+\./gm).map((l) => l.slice(0, -1))
    if (!v25on && user.includes('crash')) throw new Error('boom')
    return { model: 'fake', text: JSON.stringify(ids.map((id) => ({ id, rel: v25on ? 'irrelevant' : 'relevant', info: !v25on, why: 'x' }))) }
  }
  process.env.LLM_PROVIDER = 'gemini'
  let res
  try { res = await V.runCompare(good, a, { call: fake }) } finally { if (prevProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prevProvider }
  t('compare: v24·v25 각 묶음 수만큼 호출, 기준이 맞게 실린다', calls.length === 4 && calls.filter((s) => s.includes('판정 기준 v2.5')).length === 2 && calls.filter((s) => s.includes('아래 판정 기준 v2.4 로')).length === 2)
  t('compare: 행별 {key, v24:{rel,info}, v25:{rel,info}}', res.rows[0].key === 'k1' && res.rows[0].v24.rel === 'relevant' && res.rows[0].v24.info === true && res.rows[0].v25.rel === 'irrelevant' && res.rows[0].v25.info === false)
  t('compare: 호출 오류는 rel=null 로 남기고 집계 분모에서 뺀다(unknown 으로 접지 않는다)', res.rows[2].v24.rel === null && res.summary.v24.errors === 1 && res.summary.v24.judged === 2 && res.summary.v25.both_correct === 2)
  const csrc = readFileSync(new URL('./v25-compare.mjs', import.meta.url), 'utf8')
  t('compare: DB·서비스 키를 안 쓰고, few-shot 없이(빈 배열), --run 이 있어야만 부른다', !/supabase|SERVICE_ROLE/i.test(csrc.replace(/^\/\/.*$/gm, '')) && csrc.includes('judgeRelevanceBatch(b.purpose, b.reviews, [], call, { criteria: c, areas })') && csrc.includes("if (!run) {"))
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 리뷰 관련성 판정 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
