#!/usr/bin/env node
// lib/cases/detail.ts + grade-display.ts + logo.ts 셀프테스트 — 네트워크·DB 없음. 픽스처만 쓴다.
//   node scripts/case-detail-selftest.mjs
//
// 고정하는 것 (이 중 하나가 조용히 틀려도 상세 화면은 정상으로 보인다 — 그게 이 검사의 이유다):
//   1. 무브 정렬 — observed_period_start 오름차순, **NULL 은 맨 뒤**. NULL 이 앞으로 오면
//      "시점 미확인" 무브가 이야기의 1단계로 읽힌다.
//   2. 근거 그룹 — 한 근거는 한 그룹에만. 공시 > 추정 > 1차 > 2차 판정 순서가 규칙이다.
//      2차 매체의 추산이 "2차 보도"로 세어지면 추정치가 보도로 승격된다.
//   3. displayGrade — 미기재(null)와 등급 D 를 섞지 않는다(§7.1).
//   4. 등급 체크리스트 — 점수를 만들지 않고, 근거 0건에서 "자기보고 0%" 를 통과로 접지 않는다.
//   5. 수치 타일 — 근거가 전부 추정일 때만 '추정', 근거 0건은 그것과 다른 표식.
//   6. 관련 케이스 — 승인 무브 없는 케이스를 넣지 않고, 3장을 억지로 채우지 않는다.
//   7. 로고 폴백 3단계 + 도메인 정리(짐작 금지).

import {
  sortMovesByTime, evidenceGroupOf, groupEvidence, evidenceTally, gradeChecklist,
  metricTiles, splitCases, relatedCases, pickLeadMove, clipTransferNote, detailTitle,
} from '../lib/cases/detail.ts'
import { displayGrade, displayGradeLabel, factCheckLabel } from '../lib/cases/grade-display.ts'
import { logoFor, normalizeDomain, safeImageUrl, brandInitial, duotoneHue } from '../lib/cases/logo.ts'
import { pairMoves } from '../lib/cases/compare.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 1. 무브 정렬 ─────────────────────────────────────────────────
const moves = [
  { id: 'm-null', observed_period_start: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'm-late', observed_period_start: '2024-06-01', created_at: '2026-02-01T00:00:00Z' },
  { id: 'm-early', observed_period_start: '2023-01-15', created_at: '2026-03-01T00:00:00Z' },
  { id: 'm-null2', observed_period_start: null, created_at: '2025-12-01T00:00:00Z' },
]
t('정렬 — 시점 있는 것이 먼저, 오름차순, NULL 은 맨 뒤',
  sortMovesByTime(moves).map((m) => m.id).join(','), 'm-early,m-late,m-null2,m-null')
ok('정렬은 원본 배열을 바꾸지 않는다', moves[0].id === 'm-null')

// ── 2. 근거 그룹 ─────────────────────────────────────────────────
const ev = (over) => ({ source_tier: 'tertiary', is_self_reported: false, is_estimate: false, is_regulatory_filing: false, ...over })
t('공시는 filing', evidenceGroupOf(ev({ is_regulatory_filing: true, source_tier: 'primary', is_self_reported: true })), 'filing')
t('2차 매체의 추산은 estimate (2차 보도가 아니다)', evidenceGroupOf(ev({ source_tier: 'secondary', is_estimate: true })), 'estimate')
t('창업자 인터뷰(1차+자기보고)는 self_reported', evidenceGroupOf(ev({ source_tier: 'primary', is_self_reported: true })), 'self_reported')
t('당사자 아닌 1차는 primary_independent', evidenceGroupOf(ev({ source_tier: 'primary' })), 'primary_independent')
t('3차 요약은 secondary 그룹', evidenceGroupOf(ev({ source_tier: 'tertiary' })), 'secondary')

const rows = [
  ev({ id: 'e1', is_regulatory_filing: true, source_tier: 'primary' }),
  ev({ id: 'e2', source_tier: 'primary', is_self_reported: true }),
  ev({ id: 'e3', source_tier: 'secondary', is_estimate: true }),
  ev({ id: 'e4', source_tier: 'secondary' }),
]
const groups = groupEvidence(rows)
t('그룹 4개(빈 그룹은 내지 않는다)', groups.length, 4)
t('그룹 순서는 공시 → 1차 → 자기보고 → 2차 → 추정',
  groups.map((g) => g.key).join(','), 'filing,primary_independent,self_reported,secondary,estimate'
    .split(',').filter((k) => groups.some((g) => g.key === k)).join(','))
t('한 근거는 한 그룹에만', groups.reduce((n, g) => n + g.rows.length, 0), rows.length)
t('빈 입력은 그룹 0개', groupEvidence([]).length, 0)
t('null 입력도 0개(터지지 않는다)', groupEvidence(null).length, 0)
ok('tally 는 건수를 그대로 적는다', evidenceTally(rows).includes('법정 공시 1'))
t('근거 0건이면 tally 는 빈 문자열(문장은 화면이 만든다)', evidenceTally([]), '')

// ── 3. displayGrade ──────────────────────────────────────────────
t('displayGrade — 저장된 인사이트 등급을 그대로', displayGrade({ evidence_grade: 'B' }), 'B')
t('displayGrade — 공백은 미기재(null)', displayGrade({ evidence_grade: '  ' }), null)
t('displayGrade — 컬럼 누락(undefined)은 null', displayGrade({}), null)
t('displayGrade — 행 자체가 없으면 null', displayGrade(null), null)
t('displayGrade — D 는 D 다(미기재로 접지 않는다)', displayGrade({ evidence_grade: 'D' }), 'D')
t('라벨 — 미기재를 D 로 쓰지 않는다', displayGradeLabel({}), '미기재')
t('라벨 — 등급 D 는 D', displayGradeLabel({ evidence_grade: 'D' }), 'D')
t('사실확인 — null 은 미기재', factCheckLabel({ fact_check_grade: null }), '미기재')
t('사실확인 — 값은 그대로', factCheckLabel({ fact_check_grade: 'C' }), 'C')

// ── 4. 등급 체크리스트 ───────────────────────────────────────────
const full = gradeChecklist(
  { transfer_note: '가격표에서 최저가 요금제를 지우고 연간 결제만 남겨 봐라', preconditions: '요금제가 3개 이상이어야 한다' },
  [ev({ source_tier: 'primary', is_regulatory_filing: true }), ev({ source_tier: 'secondary' })],
)
t('체크리스트 항목 수는 5개 고정', full.length, 5)
ok('전부 통과할 수 있다', full.every((i) => i.pass))
ok('숫자 점수 필드가 없다(점수를 만들지 않는다)', full.every((i) => !('score' in i) && !('points' in i)))

const empty = gradeChecklist({ transfer_note: null, preconditions: null }, [])
t('행동 미기재는 미달', empty.find((i) => i.key === 'transfer_note').pass, false)
t('근거 0건은 미달', empty.find((i) => i.key === 'evidence_count').pass, false)
t('근거 0건에서 자기보고 비율은 통과가 아니다(확인 불가)', empty.find((i) => i.key === 'self_reported_ratio').pass, false)
ok('근거 0건 비율 사유에 "확인 불가" 가 적힌다', empty.find((i) => i.key === 'self_reported_ratio').detail.includes('확인 불가'))
t('공시 없음은 required=false (미달이 결함이 아니다)', empty.find((i) => i.key === 'filing').required, false)
t('짧은 행동(15자 미만)은 미달', gradeChecklist({ transfer_note: '값을 올려라' }, []).find((i) => i.key === 'transfer_note').pass, false)
const selfOnly = gradeChecklist({ transfer_note: '열다섯 자가 넘는 구체적인 행동 문장이다' },
  [ev({ source_tier: 'primary', is_self_reported: true })])
t('자기보고만이면 미달', selfOnly.find((i) => i.key === 'self_reported_ratio').pass, false)

// ── 5. 수치 타일 ─────────────────────────────────────────────────
const tileMoves = [
  { id: 'a', metric_name: '전환율', metric_before: 1.2, metric_after: 3.4, metric_unit: '%' },
  { id: 'b', metric_name: 'MRR', metric_before: null, metric_after: 12000, metric_unit: 'USD' },
  { id: 'c', metric_name: null, metric_after: 5, metric_unit: '%' },      // 이름 없음 → 타일 아님
  { id: 'd', metric_name: '재구매율', metric_after: null, metric_unit: '%' }, // 수치 없음 → 타일 아님
]
const byMove = new Map([
  ['a', [{ is_estimate: true }, { is_estimate: true }]],
  ['b', [{ is_estimate: true }, { is_estimate: false }]],
])
const tiles = metricTiles(tileMoves, byMove)
t('이름·단위·수치가 다 있는 무브만 타일', tiles.map((x) => x.move_id).join(','), 'a,b')
t('근거가 전부 추정이면 estimate_only', tiles[0].estimate_only, true)
t('실측이 하나라도 있으면 estimate_only 아니다', tiles[1].estimate_only, false)
t('before 없으면 null (0 으로 채우지 않는다)', tiles[1].before, null)
const noEv = metricTiles([tileMoves[0]], new Map())
t('근거 0건은 no_evidence (추정과 다른 표식)', `${noEv[0].estimate_only}/${noEv[0].no_evidence}`, 'false/true')

// ── 6. 갈린 짝 + 관련 케이스 ─────────────────────────────────────
const S = (over) => ({ id: over.id, slug: over.id, brand_name: over.id.toUpperCase(), bottleneck: 'CONVERSION',
  reader_problem: 'PRICE_TOO_LOW', business_model: 'SAAS', review_status: 'approved', ...over })
const M = (over) => ({ id: over.id, case_study_id: over.case_study_id, lever: 'PRICING', claim: `${over.id} 주장`,
  evidence_grade: 'B', outcome_direction: 'positive', review_status: 'approved', created_at: '2026-01-01T00:00:00Z', ...over })

const studies = [
  S({ id: 'ours' }),
  S({ id: 'other', brand_name: 'OTHER' }),
  S({ id: 'nomove' }),                                        // 승인 무브 0개
  S({ id: 'draftcase', review_status: 'draft' }),             // 미승인 케이스
  S({ id: 'samebottleneck', reader_problem: 'NO_CHANNEL' }),  // 문제 유형은 다르고 병목은 같다
  S({ id: 'samekind', reader_problem: 'SOLO_CEILING', bottleneck: 'TRUST' }), // 둘 다 다르고 종류(SaaS)만 같다
  S({ id: 'consumer', reader_problem: 'NO_FIRST_CUSTOMER', bottleneck: 'SUPPLY', business_model: 'D2C' }), // 소비재 — 어느 축도 안 맞는다
]
const allMoves = [
  M({ id: 'mo', case_study_id: 'ours' }),
  M({ id: 'mx', case_study_id: 'other', outcome_direction: 'negative' }),
  M({ id: 'md', case_study_id: 'draftcase' }),
  M({ id: 'ms', case_study_id: 'samebottleneck' }),
  M({ id: 'mk', case_study_id: 'samekind' }),
  M({ id: 'mc', case_study_id: 'consumer' }),
  M({ id: 'mdraft', case_study_id: 'nomove', review_status: 'draft' }),
]
const pairs = pairMoves(studies, allMoves)
const splits = splitCases(studies[0], [allMoves[0]], pairs.pairs)
t('갈린 짝 1묶음', splits.length, 1)
t('반대 방향·다른 케이스만 담긴다', splits[0].others.map((o) => o.study.id).join(','), 'other')
t('같은 케이스 안의 반대 방향은 짝이 아니다',
  splitCases(S({ id: 'solo' }), [M({ id: 'p', case_study_id: 'solo' }), M({ id: 'n', case_study_id: 'solo', outcome_direction: 'negative' })],
    pairMoves([S({ id: 'solo' })], [M({ id: 'p', case_study_id: 'solo' }), M({ id: 'n', case_study_id: 'solo', outcome_direction: 'negative' })]).pairs).length, 0)

const related = relatedCases(studies[0], studies, allMoves)
t('관련 3장', related.length, 3)
t('축 순서 — 문제 유형 → 병목 → 종류', related.map((r) => r.reason).join(' / '), '같은 문제 유형 / 같은 병목 / 같은 종류')
ok('어느 축도 안 맞는 소비재는 안 들어간다', related.every((r) => r.study.id !== 'consumer'))
ok('자기 자신은 안 들어간다', related.every((r) => r.study.id !== 'ours'))
ok('미승인 케이스는 안 들어간다', related.every((r) => r.study.id !== 'draftcase'))
ok('승인 무브 0개인 케이스는 안 들어간다', related.every((r) => r.study.id !== 'nomove'))
t('3장을 억지로 채우지 않는다 (풀이 1개면 1장)',
  relatedCases(studies[0], [studies[0], studies[1]], allMoves).length, 1)
t('대표 무브 — 등급이 센 것', pickLeadMove([M({ id: 'c', case_study_id: 'x', evidence_grade: 'C' }), M({ id: 'a', case_study_id: 'x', evidence_grade: 'A' })]).id, 'a')
t('대표 무브 — 승인된 것이 없으면 null', pickLeadMove([M({ id: 'd', case_study_id: 'x', review_status: 'draft' })]), null)

// ── 7. 카드 문구 ─────────────────────────────────────────────────
t('transfer_note 60자 자르기 + 말줄임', clipTransferNote('가'.repeat(80)).length, 61)
t('짧으면 그대로', clipTransferNote('짧은 행동'), '짧은 행동')
t('미기재는 null (빈 문자열로 만들지 않는다)', clipTransferNote(null), null)
t('제목 — 브랜드 + 요약 첫 문장', detailTitle({ brand_name: 'Acme', summary: '무료 사용자가 결제를 안 했다. 그래서 요금제를 바꿨다.' }),
  'Acme — 무료 사용자가 결제를 안 했다.')
t('제목 — 요약 없으면 브랜드만(지어내지 않는다)', detailTitle({ brand_name: 'Acme', summary: null }), 'Acme')

// ── 8. 로고 폴백 ─────────────────────────────────────────────────
t('logo_url 이 있으면 그것', logoFor({ brand_name: 'Acme', logo_url: 'https://cdn.x/a.png', brand_domain: 'acme.com' }).kind, 'url')
const fav = logoFor({ brand_name: 'Acme', brand_domain: 'https://www.Acme.com/pricing?x=1' }, null, '')
t('logo_url 없고 도메인 있으면 파비콘', fav.kind, 'favicon')
t('도메인 정리 — 스킴·www·경로·쿼리 제거', fav.domain, 'acme.com')
ok('파비콘 주소에 키가 필요 없다', fav.src.startsWith('https://www.google.com/s2/favicons?domain=acme.com'))
t('클라이언트 ID 없으면 Google 파비콘', fav.provider, 'google')
const bf = logoFor({ brand_name: 'Acme', brand_domain: 'acme.com' }, null, 'cid123')
t('클라이언트 ID 있으면 Brandfetch', bf.provider, 'brandfetch')
t('Brandfetch 주소 — 문서 경로 순서(identifier/w/h/fallback) + ?c=', bf.src, 'https://cdn.brandfetch.io/domain/acme.com/w/128/h/128/fallback/404?c=cid123')
ok('Brandfetch 404 면 Google 파비콘으로 갈아탈 주소가 붙는다', bf.fallbackSrc?.startsWith('https://www.google.com/s2/favicons?domain=acme.com'))
t('logo_url 은 Brandfetch 보다 우선', logoFor({ brand_name: 'Acme', logo_url: 'https://cdn.x/a.png', brand_domain: 'acme.com' }, null, 'cid123').kind, 'url')
t('둘 다 없으면 이니셜', logoFor({ brand_name: '무명상회' }).kind, 'initial')
t('이니셜은 첫 글자', brandInitial('무명상회'), '무')
t('브랜드명 없으면 ? (빈 칸을 그리지 않는다)', brandInitial(''), '?')
t('도메인 꼴이 아니면 null (짐작하지 않는다)', normalizeDomain('acme'), null)
t('빈 도메인은 null', normalizeDomain('  '), null)
t('javascript: 는 이미지 주소가 아니다', safeImageUrl('javascript:alert(1)'), null)
t('프로토콜 상대(//) 도 아니다', safeImageUrl('//evil.com/a.png'), null)
t('사이트 내부 경로는 통과', safeImageUrl('/fonts/a.png'), '/fonts/a.png')
t('병목이 같으면 색도 같다', duotoneHue('TRUST', 'A'), duotoneHue('TRUST', 'B'))
ok('병목 미기재는 브랜드명 해시로 갈린다', duotoneHue(null, 'A') !== duotoneHue(null, 'BBBB'))

console.log(fail
  ? `실패 ${fail}건 / 통과 ${pass}건`
  : `통과 ${pass}건 — 무브 정렬(NULL 뒤) · 근거 그룹 배타 · displayGrade 미기재/D 구분 · 체크리스트(점수 없음) · 수치 타일 · 갈린 짝 · 관련 3장 · 로고 폴백 3단계`)
process.exitCode = fail ? 1 : 0
