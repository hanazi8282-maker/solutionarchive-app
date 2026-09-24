#!/usr/bin/env node
// lib/cases/library.ts 셀프테스트 — 네트워크·DB·env 없음. 픽스처만 쓴다.
//
// 고정하는 것(화면으로는 못 잡는 것들):
//   1. 질의 파싱 — sort 어휘 밖 값을 조용히 기본값으로 떨어뜨리지 않는다
//   2. 대표 무브 — 승인 무브 중 **시간순 첫 것**. 미승인 무브가 더 이르더라도 쓰지 않고,
//      시점 미기재는 맨 뒤다(상세의 `pickLeadMove` 는 등급 기준 — 둘이 다른 함수인 이유)
//   3. 정렬 3종 — recent / grade / moves. 카드는 어느 순서로든 그대로 나오므로 눈으로 못 잡는다
//   4. 종류(kind) 하드필터 — 소비재를 **숨기고**, 숨긴 건수와 되돌리는 방법을 사유에 적는다
//   5. §7.1 3상태 — ok / empty / error, 그리고 근거 수 null(못 셌다) vs 0(없다)
//
// 되돌릴 때: `productKindOf`(advisor.ts)가 SAAS 판정을 바꾸면 4번 기대값이 달라진다.

import {
  buildLibrary, parseLibraryQuery, pickFirstMove, problemCounts, sortLibrary,
  DEFAULT_SORT, LIBRARY_SORTS,
  kstWeekStart, kstDate, approvedThisWeek, pickTodayCase, buildSourceTiles,
} from '../lib/cases/library.ts'
import { emptyStateText } from '../lib/cases/search.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 픽스처 ───────────────────────────────────────────────────────
// s1 승인 SaaS(무브 2 승인 + 1 초안) · s2 승인 소비재 · s3 미승인 SaaS ·
// s4 승인 SaaS(승인일 미기재 · 등급 미기재) · s5 승인 SaaS(문제 유형 미기재 · 등급 A)
const STUDIES = [
  { id: 's1', slug: 'acme-saas', brand_name: 'Acme', bottleneck: 'CONVERSION', reader_problem: 'PRICE_TOO_LOW', business_model: 'SAAS', review_status: 'approved', reviewed_at: '2026-09-20T01:00:00Z', created_at: '2026-09-01T00:00:00Z' },
  { id: 's2', slug: 'bravo-tumbler', brand_name: 'Bravo', bottleneck: 'CONVERSION', reader_problem: 'PRICE_TOO_LOW', business_model: 'D2C', review_status: 'approved', reviewed_at: '2026-09-22T01:00:00Z', created_at: '2026-09-02T00:00:00Z' },
  { id: 's3', slug: 'cedar-draft', brand_name: 'Cedar', bottleneck: 'TRUST', reader_problem: 'NOBODY_TRUSTS_ME', business_model: 'SAAS', review_status: 'draft', reviewed_at: null, created_at: '2026-09-03T00:00:00Z' },
  { id: 's4', slug: 'delta-saas', brand_name: 'Delta', bottleneck: 'RETENTION', reader_problem: 'ONE_OFF_ONLY', business_model: 'SAAS', review_status: 'approved', reviewed_at: null, created_at: '2026-09-04T00:00:00Z' },
  { id: 's5', slug: 'echo-saas', brand_name: 'Echo', bottleneck: 'AWARENESS', reader_problem: null, business_model: 'SAAS', review_status: 'approved', reviewed_at: '2026-09-18T01:00:00Z', created_at: '2026-09-05T00:00:00Z' },
]
const MOVES = [
  // s1 — 초안 m3 가 가장 이르다(2026-01). 대표로 뽑히면 안 된다.
  { id: 'm1', case_study_id: 's1', lever: 'PRICING', claim: '사용량 상한', evidence_grade: 'C', review_status: 'approved', observed_period_start: '2026-03-01', created_at: '2026-09-01T10:00:00Z', transfer_note: '무료 플랜에 사용량 상한을 둔다' },
  { id: 'm2', case_study_id: 's1', lever: 'CONTENT', claim: '시점 미기재', evidence_grade: 'A', review_status: 'approved', observed_period_start: null, created_at: '2026-09-01T11:00:00Z' },
  { id: 'm3', case_study_id: 's1', lever: 'OFFER', claim: '초안', evidence_grade: 'A', review_status: 'draft', observed_period_start: '2026-01-01', created_at: '2026-09-01T09:00:00Z' },
  { id: 'm4', case_study_id: 's2', lever: 'PRICING', claim: '묶음 할인', evidence_grade: 'A', review_status: 'approved', observed_period_start: '2026-02-01', created_at: '2026-09-02T10:00:00Z' },
  { id: 'm5', case_study_id: 's4', lever: 'ONBOARDING', claim: '등급 미기재', evidence_grade: null, review_status: 'approved', observed_period_start: '2026-04-01', created_at: '2026-09-04T10:00:00Z' },
  { id: 'm6', case_study_id: 's5', lever: 'CHANNEL', claim: '등급 A', evidence_grade: 'A', review_status: 'approved', observed_period_start: '2026-05-01', created_at: '2026-09-05T10:00:00Z' },
]
const EVIDENCE = [
  { case_study_id: 's1' }, { case_study_id: 's1' }, { case_study_id: 's1' },
  { case_study_id: 's2' },
  { case_study_id: null }, // 케이스에 안 붙은 행 — 어느 카드에도 세어지지 않는다
]
const CORPORA = { studies: STUDIES, moves: MOVES, evidence: EVIDENCE }
const Q = (patch = {}) => parseLibraryQuery(patch).query
const slugs = (r) => r.cards.map((c) => c.study.slug).join(',')

// ── 1. 질의 파싱 ─────────────────────────────────────────────────
{
  const { query, errors } = parseLibraryQuery({})
  t('파싱: 기본값 3개', JSON.stringify(query), JSON.stringify({ problem: null, kind: 'saas', sort: DEFAULT_SORT }))
  t('파싱: 기본 질의에 오류 없음', errors.length, 0)
}
{
  const { query, errors } = parseLibraryQuery({ problem: 'price_too_low', kind: 'all', sort: ' MOVES ' })
  t('파싱: 문제 유형 대문자 정규화', query.problem, 'PRICE_TOO_LOW')
  t('파싱: kind=all 통과', query.kind, 'all')
  t('파싱: sort 소문자·trim', query.sort, 'moves')
  t('파싱: 오류 없음', errors.length, 0)
}
{
  const { query, errors } = parseLibraryQuery({ problem: 'NOPE', sort: 'oldest' })
  t('파싱: 어휘 밖 문제 유형은 null', query.problem, null)
  t('파싱: 어휘 밖 sort 는 기본값으로', query.sort, DEFAULT_SORT)
  t('파싱: 어휘 밖 2건을 오류로 돌린다(조용히 무시 금지)', errors.length, 2)
  ok('파싱: sort 오류 문구에 가능한 값이 있다', errors.some((e) => LIBRARY_SORTS.every((s) => e.includes(s))))
}

// ── 2. 대표 무브 = 승인 무브 중 시간순 첫 것 ──────────────────────
{
  const s1 = MOVES.filter((m) => m.case_study_id === 's1')
  t('대표 무브: 승인 무브 중 가장 이른 시점', pickFirstMove(s1)?.id, 'm1')
  ok('대표 무브: 더 이른 초안 무브(m3)를 쓰지 않는다', pickFirstMove(s1)?.id !== 'm3')
  ok('대표 무브: 등급이 센 무브(m2 A)를 고르는 게 아니다 — 상세의 pickLeadMove 와 다르다', pickFirstMove(s1)?.id !== 'm2')
  t('대표 무브: 시점 미기재만 있으면 그것', pickFirstMove([MOVES[1]])?.id, 'm2')
  t('대표 무브: 승인 무브 0개면 null', pickFirstMove([MOVES[2]]), null)
  t('대표 무브: 빈 배열이면 null', pickFirstMove([]), null)
}

// ── 3. 정렬 3종 ──────────────────────────────────────────────────
{
  const base = buildLibrary(Q(), CORPORA)
  t('정렬 recent: 승인일 역순 · 미기재(s4)는 맨 뒤', slugs(base), 'acme-saas,echo-saas,delta-saas')
  t('정렬 grade: A(s5) → C(s1) → 미기재(s4)', slugs(buildLibrary(Q({ sort: 'grade' }), CORPORA)), 'echo-saas,acme-saas,delta-saas')
  t('정렬 moves: 승인 무브 많은 순(s1=2), 같으면 최신 승인순', slugs(buildLibrary(Q({ sort: 'moves' }), CORPORA)), 'acme-saas,echo-saas,delta-saas')
  t('정렬: 원본 배열을 바꾸지 않는다', STUDIES[0].id, 's1')
  // 1차 키가 같을 때 순서가 흔들리면 같은 URL 이 새로고침마다 다른 화면이 된다.
  const twice = sortLibrary(base.cards, 'grade').map((c) => c.study.slug).join(',')
  t('정렬: 같은 입력이면 같은 결과', twice, slugs(buildLibrary(Q({ sort: 'grade' }), CORPORA)))
}

// ── 4. 종류(kind) 필터 · 문제 유형 필터 · 건수 ────────────────────
{
  const saas = buildLibrary(Q(), CORPORA)
  t('kind=saas(기본): 승인 SaaS 3건', saas.cards.length, 3)
  t('kind=saas: 숨긴 승인 소비재 1건', saas.hidden_consumer, 1)
  ok('kind=saas: 숨겼다는 사실과 되돌리는 방법을 사유에 적는다', saas.reason.includes('소비재 1건 숨김') && saas.reason.includes('kind=all'))
  t('kind=saas: 칩 건수 총계는 문제 유형 필터 전 기준', saas.counts.total, 3)
  t('kind=saas: PRICE_TOO_LOW 칩 1건', saas.counts.by_problem.PRICE_TOO_LOW, 1)
  t('kind=saas: 문제 유형 미기재 1건을 따로 센다', saas.counts.unlabeled, 1)

  const all = buildLibrary(Q({ kind: 'all' }), CORPORA)
  t('kind=all: 소비재 포함 4건', all.cards.length, 4)
  t('kind=all: 숨긴 것 0', all.hidden_consumer, 0)
  t('kind=all: PRICE_TOO_LOW 칩 2건', all.counts.by_problem.PRICE_TOO_LOW, 2)
  ok('kind=all: 사유에 숨김 문구가 없다', !all.reason.includes('숨김'))

  const filtered = buildLibrary(Q({ problem: 'PRICE_TOO_LOW' }), CORPORA)
  t('문제 유형 필터: SaaS 1건', slugs(filtered), 'acme-saas')
  ok('문제 유형 필터: 제외 건수를 사유에 적는다', filtered.reason.includes('문제 유형 밖 2건 제외'))
  t('문제 유형 필터: 미승인 케이스(s3)는 어디에도 안 나온다', buildLibrary(Q({ problem: 'NOBODY_TRUSTS_ME', kind: 'all' }), CORPORA).cards.length, 0)
  t('건수: 빈 목록이면 전부 0', problemCounts([]).total, 0)
}

// ── 5. 3상태 + 근거 수 ───────────────────────────────────────────
{
  const err = buildLibrary(Q(), { studies: null, moves: MOVES, evidence: EVIDENCE })
  t('3상태: 케이스 조회 실패는 error', err.status, 'error')
  t('3상태: error 는 카드 0장', err.cards.length, 0)
  t('3상태: error 면 SaaS 건수도 못 센다(null)', err.saas_case_count, null)
  t('3상태: error 면 로고 컬럼 판정도 unknown', err.logo_columns, 'unknown')
  ok('3상태: error 사유가 "0건"이 아니라고 말한다', err.reason.includes('0건이라는 뜻이 아니다'))
  t('3상태: 무브 조회 실패도 error', buildLibrary(Q(), { studies: STUDIES, moves: null, evidence: [] }).status, 'error')

  const empty = buildLibrary(Q({ problem: 'NO_CHANNEL' }), CORPORA)
  t('3상태: 조회 정상 + 0건은 empty', empty.status, 'empty')
  t('3상태: 빈 상태 문구는 DB 에서 센 숫자만 쓴다', empty.empty_state, emptyStateText(3))
  t('3상태: empty 여도 숨긴 소비재 건수는 그대로 알린다', empty.hidden_consumer, 1)
  t('3상태: 카드가 있으면 ok', buildLibrary(Q(), CORPORA).status, 'ok')

  const cards = buildLibrary(Q({ kind: 'all' }), CORPORA).cards
  const s1 = cards.find((c) => c.study.slug === 'acme-saas')
  t('근거 수: s1 은 3건', s1.evidence_count, 3)
  t('근거 수: 승인 무브 수는 초안을 빼고 센다', s1.move_count, 2)
  t('근거 수: 근거 없는 케이스는 0', cards.find((c) => c.study.slug === 'delta-saas').evidence_count, 0)
  const noEv = buildLibrary(Q(), { studies: STUDIES, moves: MOVES, evidence: null })
  t('근거 수: 조회 실패는 null — 0 이 아니다', noEv.cards[0].evidence_count, null)
  ok('근거 수: 못 셌다는 사실을 사유에 적는다', noEv.reason.includes('근거 수는 못 셌다'))

  t('로고 컬럼: 응답에 logo_url 키가 없으면 missing', buildLibrary(Q(), CORPORA).logo_columns, 'missing')
  const withLogo = STUDIES.map((s) => ({ ...s, logo_url: null }))
  t('로고 컬럼: 키가 있으면 present(값이 NULL 이어도)', buildLibrary(Q(), { ...CORPORA, studies: withLogo }).logo_columns, 'present')
}

// ── 랜딩 부가 집계(경쟁사 기능 9·10a) ────────────────────────────
// 6. 이번 주 = KST 월요일 00:00. UTC 로 계산하면 월요일 00:00~08:59 KST 승인분이 지난주로 샌다.
t('주 시작: 수요일 → 월요일 KST 자정', kstWeekStart(new Date('2026-09-23T12:00:00Z')).toISOString(), '2026-09-20T15:00:00.000Z')
t('주 시작: 월 00:30 KST(=일 15:30 UTC) 는 이번 주', kstWeekStart(new Date('2026-09-20T15:30:00Z')).toISOString(), '2026-09-20T15:00:00.000Z')
t('주 시작: 일 23:59 KST 는 지난주', kstWeekStart(new Date('2026-09-20T14:59:00Z')).toISOString(), '2026-09-13T15:00:00.000Z')
t('KST 날짜: UTC 15:00 은 다음 날', kstDate(new Date('2026-09-23T15:00:00Z')), '2026-09-24')
{
  const r = buildLibrary(Q(), CORPORA)
  // 이번 주 = 09-21 00:00 KST 이후. s1(09-20)·s5(09-18) 는 지난주, s4 는 승인일 미기재 → 0.
  t('이번 주 승인: 지난주·미기재는 안 센다', approvedThisWeek(r, new Date('2026-09-23T03:00:00Z')), 0)
  t('이번 주 승인: 지난주 기준이면 s1·s5 를 센다', approvedThisWeek(r, new Date('2026-09-16T03:00:00Z')), 2)
  t('이번 주 승인: 조회 실패는 null(0 아님)', approvedThisWeek(buildLibrary(Q(), { studies: null, moves: [], evidence: [] }), new Date()), null)
  t('이번 주 승인: 결과 없음은 null', approvedThisWeek(null, new Date()), null)

  // 7. 오늘의 케이스 — 같은 날 같은 카드, 무브 0 카드는 안 고른다, 후보를 뒤집어도 같다.
  const day = new Date('2026-09-24T01:00:00Z')
  const a = pickTodayCase(r.cards, day)
  ok('오늘의 케이스: 후보가 있으면 고른다', a)
  t('오늘의 케이스: 같은 KST 날짜면 같은 카드', pickTodayCase(r.cards, new Date('2026-09-24T14:59:00Z'))?.study.slug, a?.study.slug)
  t('오늘의 케이스: 배열 순서와 무관', pickTodayCase([...r.cards].reverse(), day)?.study.slug, a?.study.slug)
  ok('오늘의 케이스: 무브 0 카드는 후보가 아니다', a && a.move_count > 0)
  t('오늘의 케이스: 후보 0 이면 null', pickTodayCase([], day), null)
  const days = new Set(Array.from({ length: 30 }, (_, i) => pickTodayCase(r.cards, new Date(Date.UTC(2026, 8, 1 + i)))?.study.slug))
  ok('오늘의 케이스: 30일 동안 한 카드에 고정되지 않는다', days.size > 1)
}
// 8. 소스 타일 — 못 셌다(null)는 남기고, 0건만 뺀다. 레지스트리 실패는 tiles=null.
{
  const src = [{ key: 'hn', display_name: 'Hacker News' }, { key: 'okky', display_name: 'OKKY' }, { key: 'velog', display_name: null }, { key: 'danawa', display_name: '다나와' }]
  const got = buildSourceTiles(src, new Map([['hn', 4022], ['okky', 0], ['velog', null], ['danawa', 12]]))
  t('소스 타일: 0건은 빼고 센다', got.hidden_zero, 1)
  t('소스 타일: 건수 내림차순 · 못 센 것은 맨 뒤 · 이름 없으면 key', got.tiles?.map((x) => `${x.name}=${x.count}`).join(','), 'Hacker News=4022,다나와=12,velog=null')
  t('소스 타일: 카운트 누락 소스는 null(0 아님)', buildSourceTiles([{ key: 'x', display_name: 'X' }], new Map()).tiles?.[0]?.count, null)
  t('소스 타일: 레지스트리 실패는 tiles=null', buildSourceTiles(null, new Map()).tiles, null)
}
// 9. 소스 타일 count 조건 — 누적(중복 정리분만 제외). purged_at IS NULL 로 되돌아가면 30일 보관분이 된다.
{
  const lib = (await import('node:fs')).readFileSync(new URL('../lib/cases/library.ts', import.meta.url), 'utf8')
  const body = lib.slice(lib.indexOf('export async function loadSourceTiles'))
  ok('소스 타일: dedupe 만 제외(purge_reason IS DISTINCT FROM dedupe)', body.includes(".or('purge_reason.is.null,purge_reason.neq.dedupe')"))
  ok('소스 타일: purged_at IS NULL 로 세지 않는다(30일 보관분 아님)', !/.is('purged_at', null)/.test(body))
}

console.log(`\n${fail === 0 ? '✅' : '❌'} library-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
