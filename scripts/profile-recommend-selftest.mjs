#!/usr/bin/env node
// 프로필 → 케이스 추천 셀프테스트 — 네트워크·DB 없음. 픽스처만 쓴다.
//   node scripts/profile-recommend-selftest.mjs
//
// 고정하는 것 (docs/profile-recommend-analysis-design.md AC):
//   1. profileToQuery — 문제 유형 + 자유 텍스트만 채운다. **병목은 안 채운다**(하드필터 2겹 금지, Q2-A)
//   2. 프리필 규칙 — URL 에 검색 파라미터가 하나라도 있으면 프로필로 덮지 않는다(`?problem=` 포함)
//   3. 어휘 밖 문제 유형은 프리필하지 않는다 — 걸면 무조건 0건이 되고 그게 "선례 없음"으로 읽힌다
//   4. 무브 4필드가 카드까지 도달한다(transfer_note·preconditions·observed_period_start·형제 무브)
//   5. 다단계 정렬 — observed_period_start 순, NULL 은 **맨 뒤**, 같으면 created_at
//   6. MOVE_COLS 가 실제로 그 컬럼들을 SELECT 한다 — 화면 코드만 고치고 조회를 안 고치면
//      "내일 할 행동"이 영영 미기재로 보인다(그게 이 기능 전의 상태였다)

import { profileToQuery, shouldPrefill, QUERY_MAX } from '../lib/cases/search.ts'
import { matchCaseMoves } from '../lib/cases/advisor.ts'
import { sortMovesByTime } from '../lib/cases/detail.ts'
import { MOVE_COLS } from '../lib/cases/corpus-db.ts'

let pass = 0, fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 1. profileToQuery — 양성 ─────────────────────────────────────
{
  const p = profileToQuery({
    reader_problem: 'NO_FIRST_CUSTOMER',
    pitch: '1인 개발자용 구독 결제 대시보드',
    market: '국내 1인 개발자 SaaS',
    business_model: 'SAAS',
    bottleneck: 'CONVERSION',
  })
  t('양성: 문제 유형을 그대로 싣는다', p.problem, 'NO_FIRST_CUSTOMER')
  t('양성: 한 줄 소개 + 시장을 합쳐 검색어로', p.q, '1인 개발자용 구독 결제 대시보드 국내 1인 개발자 SaaS')
  t('양성: SaaS 는 software 로 정렬 가산점', p.kind, 'software')
  t('양성: 채운 것만 filled 에', p.filled.join(','), 'problem,q')
  t('★ 병목은 채우지 않는다(Q2-A) — 반환에 아예 없다', 'bottleneck' in p, false)
}

// ── 2. profileToQuery — 음성/경계 ────────────────────────────────
{
  t('프로필 없음(null): 아무것도 안 채운다', profileToQuery(null).filled.length, 0)
  t('프로필 없음(undefined): problem null', profileToQuery(undefined).problem, null)

  const empty = profileToQuery({ reader_problem: null, pitch: '', market: '   ' })
  t('빈 프로필: filled 0 — "가져왔다"고 적지 않는다', empty.filled.length, 0)
  t('빈 프로필: q 는 빈 문자열이 아니라 null', empty.q, null)
  t('사업 모델 없음: kind 는 null(기본값을 쓰라는 뜻)', empty.kind, null)

  const bad = profileToQuery({ reader_problem: 'make but no money', pitch: '수기 입력' })
  t('★ 어휘 밖 문제 유형은 프리필하지 않는다', bad.problem, null)
  t('어휘 밖이어도 검색어는 살린다', bad.q, '수기 입력')
  t('어휘 밖: problem 은 filled 에 없다', bad.filled.includes('problem'), false)

  const cased = profileToQuery({ reader_problem: ' price_too_low ' })
  t('공백·소문자 정규화는 통과시킨다', cased.problem, 'PRICE_TOO_LOW')

  const long = profileToQuery({ pitch: 'ㄱ'.repeat(300), market: 'ㄴ'.repeat(300) })
  t(`검색어 ${QUERY_MAX}자 상한`, long.q.length, QUERY_MAX)

  const onlyMarket = profileToQuery({ market: '국내 SaaS' })
  t('한 줄 소개가 없어도 시장만으로 검색어', onlyMarket.q, '국내 SaaS')
}

// ── 3. 프리필 규칙 — 파라미터가 하나라도 있으면 덮지 않는다 ───────
{
  ok('파라미터 0개면 프리필한다', shouldPrefill({}))
  t('?problem=PRICE_TOO_LOW → 덮지 않는다', shouldPrefill({ problem: 'PRICE_TOO_LOW' }), false)
  t('★ ?problem= (빈 값)도 덮지 않는다 — "전체 보기"라는 명시적 의사다', shouldPrefill({ problem: '' }), false)
  t('?q= 만 있어도 덮지 않는다', shouldPrefill({ q: '' }), false)
  t('?kind=all 도 파라미터다', shouldPrefill({ kind: 'all' }), false)
  t('?bottleneck= 도 파라미터다', shouldPrefill({ bottleneck: '' }), false)
  ok('검색과 무관한 파라미터는 프리필을 막지 않는다', shouldPrefill({ utm_source: 'kakao' }))
}

// ── 4. 무브 4필드가 카드까지 도달한다 ────────────────────────────
// s1 = 승인 SaaS(무브 3개: 2개 승인 + 1개 draft), s2 = 승인 SaaS(무브 1개).
const STUDIES = [
  { id: 's1', slug: 'acme', brand_name: 'Acme', bottleneck: 'CONVERSION', reader_problem: 'NO_FIRST_CUSTOMER', business_model: 'SAAS', review_status: 'approved' },
  { id: 's2', slug: 'bravo', brand_name: 'Bravo', bottleneck: 'CONVERSION', reader_problem: 'NO_FIRST_CUSTOMER', business_model: 'SAAS', review_status: 'approved' },
]
const MOVES = [
  {
    id: 'm1', case_study_id: 's1', lever: 'PRICING', claim: '무료 상한을 두고 결제 유도',
    evidence_grade: 'B', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved',
    transfer_note: '내일 무료 플랜에 사용량 상한 한 줄을 붙인다',
    preconditions: '사용량을 재는 계측이 이미 있어야 한다',
    observed_period_start: '2019-04-01', created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'm2', case_study_id: 's1', lever: 'ONBOARDING', claim: '첫 5분 안내',
    evidence_grade: 'C', fact_check_grade: 'C', outcome_direction: 'positive', review_status: 'approved',
    transfer_note: null, preconditions: null,
    observed_period_start: null, created_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'm3', case_study_id: 's1', lever: 'CONTENT', claim: '아직 검수 안 된 무브',
    evidence_grade: 'A', fact_check_grade: 'A', outcome_direction: 'positive', review_status: 'draft',
    transfer_note: '초안', preconditions: null, observed_period_start: '2018-01-01', created_at: '2026-01-03T00:00:00Z',
  },
  {
    id: 'm4', case_study_id: 's2', lever: 'PRICING', claim: '단일 요금제로 결제 유도',
    evidence_grade: 'A', fact_check_grade: 'A', outcome_direction: 'positive', review_status: 'approved',
    transfer_note: '내일 요금제를 하나로 줄인다', preconditions: '', observed_period_start: null,
    created_at: '2026-01-04T00:00:00Z',
  },
]
{
  const r = matchCaseMoves(['결제'], STUDIES, MOVES, 'software', { limit: 20 })
  t('매칭 상태', r.status, 'matched')
  const m1 = r.cards.find((c) => c.case_move_id === 'm1')
  const m4 = r.cards.find((c) => c.case_move_id === 'm4')
  ok('m1 카드가 나온다', m1)
  ok('m4 카드가 나온다', m4)
  t('내일 할 행동이 원문 그대로 실린다', m1.transfer_note, '내일 무료 플랜에 사용량 상한 한 줄을 붙인다')
  t('전제도 실린다', m1.preconditions, '사용량을 재는 계측이 이미 있어야 한다')
  t('관측 시점도 실린다', m1.observed_period_start, '2019-04-01')
  t('빈 문자열 전제는 그대로 — 화면이 미기재로 말한다', m4.preconditions, '')
  t('케이스 열쇠가 실린다(형제 묶기용)', m1.case_study_id, 's1')

  // 형제 무브 = 그 케이스의 **승인** 무브 전부(자기 포함). draft 는 셀러 화면에 나가지 않는다.
  t('s1 형제 무브 2개(자기 포함)', m1.siblings.length, 2)
  t('★ 미승인 무브는 형제에 안 들어간다', m1.siblings.some((s) => s.id === 'm3'), false)
  t('무브가 하나뿐인 케이스는 형제 1개 — 화면이 접힘을 안 그린다', m4.siblings.length, 1)
}

// ── 5. 다단계 정렬 — NULL 은 맨 뒤, 같으면 created_at ────────────
{
  const sorted = sortMovesByTime([
    { id: 'b', observed_period_start: null, created_at: '2026-01-02T00:00:00Z' },
    { id: 'a', observed_period_start: '2019-04-01', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c', observed_period_start: null, created_at: '2026-01-01T00:00:00Z' },
  ])
  t('시점 있는 것이 먼저', sorted[0].id, 'a')
  t('★ 시점 미확인은 맨 뒤 — 모르는 것을 1단계로 배치하지 않는다', sorted.map((m) => m.id).join(','), 'a,c,b')
}

// ── 6. 조회가 실제로 그 컬럼을 가져오는가 ────────────────────────
for (const col of ['transfer_note', 'preconditions', 'transferability', 'observed_period_start', 'created_at']) {
  ok(`MOVE_COLS 에 ${col} 이 있다`, MOVE_COLS.split(',').map((c) => c.trim()).includes(col))
}

console.log(`\n통과 ${pass}건${fail ? ` / 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('프로필 추천 정상 — 프리필 규칙(파라미터 우선) · 어휘 밖 거절 · 이식 4필드 도달 · 시간순(NULL 뒤).')
