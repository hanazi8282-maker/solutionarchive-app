// PMF 진단 입력(패싯) 검증기 셀프테스트 — 어휘 대조 + PATCH 의미. 네트워크·DB 없음.
//   node scripts/analyze-projects-facets-selftest.mjs
//
// 이 파일이 막는 회귀 둘:
//   1. 화면의 선택지가 DB CHECK 어휘와 갈라지는 것 — 갈라지면 저장이 23514 로 죽고,
//      그 실패는 사람이 폼을 다 채운 뒤에야 보인다.
//   2. 어휘 밖 값을 조용히 null 로 접는 것 — 사람이 고른 값이 사라진 줄 모른 채
//      진단이 엉뚱한 선례를 물어 온다(§7.1).

import { FACET_FIELDS, FACET_KEYS, MARKET_MAX, parseFacets } from '../lib/analysis/facets.ts'
import {
  BOTTLENECK, BUSINESS_MODEL, BUYER_TYPE, PRICE_BAND, PURCHASE_FREQUENCY, READER_PROBLEMS,
} from '../lib/cases/draft.ts'

let pass = 0, fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}

// ── 1. 어휘 대조 (정본 = lib/cases/draft.ts = 마이그레이션 CHECK) ──────
const VOCAB = {
  reader_problem: READER_PROBLEMS,
  bottleneck: BOTTLENECK,
  business_model: BUSINESS_MODEL,
  buyer_type: BUYER_TYPE,
  price_band: PRICE_BAND,
  purchase_frequency: PURCHASE_FREQUENCY,
}
t('패싯 6개', FACET_KEYS.length, 6)
t('필드 정의도 6개', FACET_FIELDS.length, 6)
t('문제 유형이 맨 앞(하드필터라 먼저 묻는다)', FACET_KEYS[0], 'reader_problem')
for (const f of FACET_FIELDS) {
  t(`${f.key}: 선택지 = 어휘(순서까지)`, f.options.map((o) => o.value).join(','), VOCAB[f.key].join(','))
  // reader_problem 만 예외다: 라벨 자체가 완성된 문장이고 어휘 정본이 config/reader-problems.json 이라,
  // 그 파일이 통째로 갈아끼워졌을 때 설명이 없다고 CI 가 죽으면 어휘 교체가 막힌다.
  t(`${f.key}: 모든 선택지에 한 줄 설명`, f.options.every((o) => o.label && (o.hint || f.key === 'reader_problem')), true)
  t(`${f.key}: 라벨이 영어 코드 그대로가 아니다`, f.options.every((o) => o.label !== o.value), true)
}

// ── 2. PATCH 의미 — 없는 키는 건드리지 않는다 ─────────────────────────
const empty = parseFacets({})
t('빈 본문: ok', empty.ok, true)
t('빈 본문: 바꿀 키 0개', empty.keys.length, 0)
t('빈 본문: values 도 비었다', JSON.stringify(empty.values), '{}')
t('null 본문도 통과(키 0개)', parseFacets(null).keys.length, 0)

const untouched = parseFacets({ bottleneck: 'TRUST' })
t('안 보낸 키는 values 에 없다', 'price_band' in untouched.values, false)
t('보낸 키만 들어간다', untouched.values.bottleneck, 'TRUST')

// ── 3. 지우기 = null (0 이나 빈 문자열로 남기지 않는다) ────────────────
for (const [name, body] of [['null', { buyer_type: null }], ['빈 문자열', { buyer_type: '' }], ['공백만', { buyer_type: '  ' }]]) {
  const r = parseFacets(body)
  t(`${name} → null 로 지운다`, r.ok && r.values.buyer_type, null)
  t(`${name} → 바꿀 키로 센다`, r.keys.includes('buyer_type'), true)
}

// ── 4. 어휘 밖 값은 400 + 필드 이름 ───────────────────────────────────
// reader_problem 음성 — 어휘 밖(소문자 원문 그대로)을 조용히 null 로 접지 않는다.
// DB CHECK 은 형식(^[A-Z][A-Z_]*$)만 보므로 어휘를 막는 자리는 여기뿐이다(마이그 20260930000003).
const badProblem = parseFacets({ reader_problem: 'make but no money' })
t('문제 유형 어휘 밖: ok=false', badProblem.ok, false)
t('문제 유형 어휘 밖: 어느 필드인지 말한다', badProblem.field, 'reader_problem')
t('문제 유형 어휘 밖: 허용 목록을 알려준다', badProblem.error.includes('NO_FIRST_CUSTOMER'), true)
t('문제 유형 형식만 맞는 값도 거절', parseFacets({ reader_problem: 'NOT_A_REAL_CODE' }).ok, false)
t('문제 유형 정상 값은 통과', parseFacets({ reader_problem: 'NO_FIRST_CUSTOMER' }).values.reader_problem, 'NO_FIRST_CUSTOMER')
t('문제 유형 빈 값은 지우기(null)', parseFacets({ reader_problem: '' }).values.reader_problem, null)

const bad = parseFacets({ bottleneck: 'GROWTH' })
t('어휘 밖: ok=false', bad.ok, false)
t('어휘 밖: 어느 필드인지 말한다', bad.field, 'bottleneck')
t('어휘 밖: 메시지에 필드명', bad.error.includes('bottleneck'), true)
t('어휘 밖: 메시지에 들어온 값', bad.error.includes('GROWTH'), true)
t('어휘 밖: 허용 어휘를 알려준다', bad.error.includes('AWARENESS'), true)
t('어휘 밖 값을 null 로 접지 않는다', 'values' in bad, false)

t('소문자는 어휘가 아니다(대소문자 보정 안 함)', parseFacets({ buyer_type: 'b2c' }).ok, false)
t('앞뒤 공백은 다듬어 통과', parseFacets({ buyer_type: ' B2C ' }).values?.buyer_type, 'B2C')
t('숫자는 문자열이 아니다', parseFacets({ price_band: 3 }).field, 'price_band')

// 어휘 전체가 실제로 통과하는지 — 라벨 표만 고치고 어휘를 못 늘린 경우를 잡는다.
for (const [key, vocab] of Object.entries(VOCAB)) {
  for (const v of vocab) t(`${key}=${v} 통과`, parseFacets({ [key]: v }).values?.[key], v)
}

// ── 5. market 은 자유 텍스트 ──────────────────────────────────────────
t('market 통과', parseFacets({ market: ' 국내 유산균 건기식 ' }).values.market, '국내 유산균 건기식')
t('market 빈 문자열 → null', parseFacets({ market: '' }).values.market, null)
t('market null → null', parseFacets({ market: null }).values.market, null)
t(`market ${MARKET_MAX}자 초과는 거절(자르지 않는다)`, parseFacets({ market: 'ㄱ'.repeat(MARKET_MAX + 1) }).field, 'market')
t(`market ${MARKET_MAX}자는 통과`, parseFacets({ market: 'ㄱ'.repeat(MARKET_MAX) }).ok, true)
t('market 숫자는 거절', parseFacets({ market: 7 }).field, 'market')

// ── 6. 패싯 아닌 필드는 무시한다(status·mode 를 이 경로로 못 바꾼다) ──
const mixed = parseFacets({ status: 'done', mode: 'reverse', project_id: 'x', buyer_type: 'B2B' })
t('패싯 밖 키는 통과 대상이 아니다', JSON.stringify(mixed.values), '{"buyer_type":"B2B"}')

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 어휘 대조 5종 · PATCH 의미 · 지우기 · 어휘 밖 거절 · market 상한`)
process.exitCode = fail ? 1 : 0
