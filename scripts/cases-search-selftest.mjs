#!/usr/bin/env node
// lib/cases/search.ts 셀프테스트 — 네트워크·DB 없음. 픽스처만 쓴다.
//
// 고정하는 것:
//   1. 질의 파싱 — 어휘 밖 값을 조용히 무시하지 않는다(무시하면 "전체 결과"를 "그 유형 결과"로 읽는다)
//   2. 정렬 가산점(kind=all) — SaaS 질의에 SaaS 무브가 **먼저**, 소비재는 **뒤에**(빠지지 않는다)
//   2-b. 종류 하드필터(kind 기본 'saas') — 소비재는 숨기고, 숨긴 건수와 되돌리는 방법을 사유에 적는다
//   3. §7.1 3상태 — matched / no_match / not_run 이 응답 모양에 그대로 실리는가
//   4. 빈 상태 문구 — 숫자는 DB 에서 센 것만 쓰고 다른 말로 채우지 않는다
//
// 되돌릴 때: advisor.KIND_MISMATCH_MODE 를 'exclude' 로 바꾸면 2번 기대값이 달라진다.

import { parseSearchQuery, searchMoves, emptyStateText, QUERY_MAX } from '../lib/cases/search.ts'
import { KIND_MISMATCH_MODE } from '../lib/cases/advisor.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 픽스처 ───────────────────────────────────────────────────────
// s1 = 승인 SaaS(전환/가격), s2 = 승인 소비재(전환/가격), s3 = 미승인 SaaS.
const STUDIES = [
  { id: 's1', slug: 'acme-saas', brand_name: 'Acme', bottleneck: 'CONVERSION', reader_problem: 'PRICE_TOO_LOW', business_model: 'SAAS', review_status: 'approved' },
  { id: 's2', slug: 'bravo-tumbler', brand_name: 'Bravo', bottleneck: 'CONVERSION', reader_problem: 'PRICE_TOO_LOW', business_model: 'D2C', review_status: 'approved' },
  { id: 's3', slug: 'cedar-draft', brand_name: 'Cedar', bottleneck: 'TRUST', reader_problem: 'NOBODY_TRUSTS_ME', business_model: 'SAAS', review_status: 'draft' },
]
const MOVES = [
  { id: 'm1', case_study_id: 's1', lever: 'PRICING', claim: '무료 플랜에 사용량 상한을 두고 결제 유도', evidence_grade: 'C', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm2', case_study_id: 's2', lever: 'PRICING', claim: '묶음 할인으로 결제 전환', evidence_grade: 'A', fact_check_grade: 'A', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm3', case_study_id: 's1', lever: 'ONBOARDING', claim: '수치 없는 서술만', evidence_grade: 'D', fact_check_grade: 'D', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm4', case_study_id: 's3', lever: 'CONTENT', claim: '결제 사례 공개', evidence_grade: 'A', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved' },
]
const FAILED = [
  { case_key: 'quibi', product_category: '모바일 숏폼 스트리밍', claimed_angle: '이동 중에만 보는 결제형 숏폼', outcome: '6개월 만에 종료', evidence_source: '보도', source_tier: '공개 보도', is_estimate: false },
]
const CORPORA = { studies: STUDIES, moves: MOVES, failedAngles: FAILED }

// ── 1. 질의 파싱 ─────────────────────────────────────────────────
{
  const { query, errors } = parseSearchQuery({ bottleneck: ' conversion ', problem: 'price_too_low', q: '  결제  ' })
  t('파싱: 병목 대문자 정규화', query.bottleneck, 'CONVERSION')
  t('파싱: 문제 유형 대문자 정규화', query.problem, 'PRICE_TOO_LOW')
  t('파싱: 자유 텍스트 trim', query.q, '결제')
  t('파싱: 오류 없음', errors.length, 0)
}
{
  const { query, errors } = parseSearchQuery({ bottleneck: 'ZZZ', problem: 'NOPE' })
  t('파싱: 어휘 밖 병목은 null', query.bottleneck, null)
  t('파싱: 어휘 밖 문제 유형은 null', query.problem, null)
  t('파싱: 어휘 밖 2건을 오류로 돌린다(조용히 무시 금지)', errors.length, 2)
}
{
  const { query } = parseSearchQuery({ q: 'ㄱ'.repeat(QUERY_MAX + 50) })
  t(`파싱: 자유 텍스트 ${QUERY_MAX}자 상한`, query.q.length, QUERY_MAX)
  t('파싱: 빈 입력은 전부 null(kind 만 기본값 saas)', JSON.stringify(parseSearchQuery({}).query), JSON.stringify({ bottleneck: null, problem: null, q: null, kind: 'saas' }))
}

// ── 2. 정렬 가산점 ───────────────────────────────────────────────
// 가산점은 **kind=all 일 때만** 관찰된다 — 기본(kind=saas)에서는 소비재가 하드필터로 빠지므로
// "뒤에 있다"를 확인할 대상 자체가 없다. 두 동작을 한 질의에서 같이 보려 하면 기대값이 거짓말이 된다.
{
  const bonus = KIND_MISMATCH_MODE === 'bonus'
  const r = searchMoves(parseSearchQuery({ q: '결제', kind: 'all' }).query, CORPORA)
  const ids = r.moves.cards.map((c) => c.case_move_id)
  t('가산점: SaaS 질의 1위는 SaaS 무브(등급이 낮아도)', ids[0], 'm1')
  ok('가산점: 소비재 무브는 빠지지 않고 뒤로 간다', bonus ? ids.includes('m2') : !ids.includes('m2'))
  ok('제외: 등급 D 무브(m3)는 안 나온다', !ids.includes('m3'))
  ok('제외: 미승인 케이스 무브(m4)는 안 나온다', !ids.includes('m4'))
  const phys = searchMoves(parseSearchQuery({ q: '결제', kind: 'all' }).query, CORPORA, { kind: 'physical' })
  t('가산점: 실물 질의 1위는 소비재 무브', phys.moves.cards[0].case_move_id, 'm2')
}

// ── 2-b. 종류 하드필터 (남헌 2026-09-23: SaaS 기본, 소비재는 필터 켰을 때만) ────────
{
  t('종류: 기본은 saas', parseSearchQuery({}).query.kind, 'saas')
  t('종류: kind=all 통과', parseSearchQuery({ kind: 'ALL' }).query.kind, 'all')
  const bad = parseSearchQuery({ kind: 'physical' })
  t('종류: 어휘 밖 kind 는 오류 1건 — 라우트가 이걸 400 으로 낸다', bad.errors.length, 1)
  ok('종류: 어휘 밖 kind 사유에 가능한 값이 적힌다', bad.errors[0].includes('saas') && bad.errors[0].includes('all'))

  const def = searchMoves(parseSearchQuery({ q: '결제' }).query, CORPORA)
  const defIds = def.moves.cards.map((c) => c.case_move_id)
  ok('종류: 기본 검색에서 소비재 무브(m2)가 숨는다', !defIds.includes('m2'))
  ok('종류: 기본 검색에도 SaaS 무브(m1)는 나온다', defIds.includes('m1'))
  ok('종류: 숨긴 건수와 되돌리는 방법을 사유에 밝힌다', def.reason.includes('소비재 1건 숨김(kind=all 로 보기)'))

  const all = searchMoves(parseSearchQuery({ q: '결제', kind: 'all' }).query, CORPORA)
  ok('종류: kind=all 이면 소비재 무브가 나온다', all.moves.cards.some((c) => c.case_move_id === 'm2'))
  ok('종류: kind=all 사유에는 숨김 문구가 없다', !all.reason.includes('숨김'))

  // business_model 미기재(null)는 physical 이다(advisor.productKindOf) — 기본 검색에서 숨는다.
  const withNull = {
    ...CORPORA,
    studies: [...STUDIES, { id: 's4', slug: 'delta-null', brand_name: 'Delta', bottleneck: 'CONVERSION', reader_problem: 'PRICE_TOO_LOW', business_model: null, review_status: 'approved' }],
    moves: [...MOVES, { id: 'm5', case_study_id: 's4', lever: 'PRICING', claim: '결제 페이지 단순화', evidence_grade: 'A', fact_check_grade: 'A', outcome_direction: 'positive', review_status: 'approved' }],
  }
  ok('종류: business_model 미기재(null)도 기본 검색에서 숨는다', !searchMoves(parseSearchQuery({ q: '결제' }).query, withNull).moves.cards.some((c) => c.case_move_id === 'm5'))
  ok('종류: kind=all 이면 미기재 케이스도 나온다', searchMoves(parseSearchQuery({ q: '결제', kind: 'all' }).query, withNull).moves.cards.some((c) => c.case_move_id === 'm5'))

  // 둘러보기(조건 0개)에도 같은 필터가 걸린다 — 첫 화면이 가장 많이 읽히는 자리다.
  const br = searchMoves(parseSearchQuery({}).query, CORPORA)
  ok('종류: 둘러보기도 browse + 소비재 숨김', br.browse === true && !br.moves.cards.some((c) => c.case_move_id === 'm2'))
  ok('종류: 둘러보기 사유에도 숨김 문구', br.reason.includes('소비재 1건 숨김(kind=all 로 보기)'))
  ok('종류: 둘러보기 kind=all 이면 소비재도 나온다', searchMoves(parseSearchQuery({ kind: 'all' }).query, CORPORA).moves.cards.some((c) => c.case_move_id === 'm2'))

  // 숨김 건수는 **승인된 소비재만** 센다 — 미승인은 kind 와 무관하게 어차피 안 나간다.
  const draftConsumer = {
    ...CORPORA,
    studies: [...STUDIES, { id: 's5', slug: 'echo-draft-d2c', brand_name: 'Echo', bottleneck: 'CONVERSION', reader_problem: 'PRICE_TOO_LOW', business_model: 'D2C', review_status: 'draft' }],
  }
  ok('종류: 미승인 소비재는 숨김 건수에 안 센다', searchMoves(parseSearchQuery({ q: '결제' }).query, draftConsumer).reason.includes('소비재 1건 숨김'))
}

// ── 3. 3상태 ─────────────────────────────────────────────────────
{
  const r = searchMoves(parseSearchQuery({ q: '결제' }).query, CORPORA)
  t('3상태: 짝 있음 → matched', r.status, 'matched')
  t('3상태: 실패 앵글도 matched', r.failed_angles.status, 'matched')
  ok('응답 모양: moves/failed_angles 에 status·reason·cards', ['status', 'reason', 'cards'].every((k) => k in r.moves && k in r.failed_angles))
}
{
  const r = searchMoves(parseSearchQuery({ q: '존재하지않는낱말zzz' }).query, CORPORA)
  t('3상태: 조회 정상·0건 → no_match', r.status, 'no_match')
  ok('no_match 사유에 "조회는 정상"', r.moves.reason.includes('조회는 정상'))
}
{
  const r = searchMoves(parseSearchQuery({}).query, CORPORA)
  // 2026-09-23 남헌 보고로 바꾼 자리: 조건 없는 첫 진입은 빈 화면이 아니라 둘러보기다.
  t('조건 없음 → 둘러보기(matched)', r.status, 'matched')
  ok('browse 플래그가 켜진다', r.browse === true)
  ok('사유가 "조건 없이 전체 상위"', r.reason.startsWith('조건 없이 전체 상위'))
  ok('둘러보기도 승인 무브를 낸다', r.moves.cards.length > 0)
  ok('실패 앵글은 자유 텍스트가 없으면 여전히 not_run', r.failed_angles.status === 'not_run')
}
{
  const r = searchMoves(parseSearchQuery({ q: '결제' }).query, { studies: null, moves: null, failedAngles: null })
  t('3상태: 조회 실패(null) → not_run', r.moves.status, 'not_run')
  t('3상태: 실패 앵글 조회 실패도 not_run', r.failed_angles.status, 'not_run')
  t('조회 실패면 SaaS 케이스 수는 null(0 아님)', r.saas_case_count, null)
}
{
  // 칩만 고르고 자유 텍스트가 없는 경로 — 하드필터만으로 후보가 선다.
  const r = searchMoves(parseSearchQuery({ problem: 'PRICE_TOO_LOW' }).query, CORPORA)
  t('칩만: 하드필터만으로 matched', r.moves.status, 'matched')
  t('칩만: 실패 앵글은 찾지 않음(not_run)', r.failed_angles.status, 'not_run')
  ok('칩만: 실패 앵글 사유가 "찾지 않았다"', r.failed_angles.reason.includes('찾지 않았다'))
  const b = searchMoves(parseSearchQuery({ bottleneck: 'TRUST' }).query, CORPORA)
  t('칩만: 승인 케이스가 없는 병목 → no_match', b.moves.status, 'no_match')
}

// ── 4. 빈 상태 문구 ──────────────────────────────────────────────
{
  t('빈 상태: 승인 SaaS 케이스 수를 센다', searchMoves(parseSearchQuery({ q: 'zzz없음' }).query, CORPORA).saas_case_count, 1)
  t('빈 상태 문구', emptyStateText(1), '이 유형의 SaaS 사례가 아직 1건 — 축적 중')
  ok('빈 상태: 못 셌을 때는 "확인 불가"라고 쓴다', emptyStateText(null).includes('확인 불가') && !emptyStateText(null).includes('0건 — 축적'))
}

console.log(fail === 0 ? `\n통과 ${pass}건\n케이스 검색 정상 — 질의 파싱 · 종류 하드필터(saas 기본)·가산점 · 3상태 · 빈 상태 문구.` : `\n통과 ${pass}건, 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
