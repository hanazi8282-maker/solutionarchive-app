// 요약 마크다운 셀프테스트 — 픽스처만 쓴다(네트워크·DB 없음).
//   node scripts/summary-selftest.mjs
//
// 요약본은 화면 밖으로 나가는 유일한 산출물이다. 여기서 "확인 불가" 가 "없음" 으로 접히면
// 붙여 넣은 사람은 되돌릴 자리가 없다 — 그 경계만 집중해서 본다.

import { buildSummaryMarkdown, topAspects, DRAFT_NOTICE } from '../lib/cases/summary.ts'
import { buildRemedies } from '../lib/cases/remedy.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

const project = {
  product_elevator_pitch: '두피 진정 샴푸', market: '탈모 샴푸',
  maturity_stage: 4, maturity_notes: '스펙 비교가 리뷰의 주 언어다', m_meta_signal: true,
}
const aspects = [
  { name: '가려움', importance: 9, satisfaction: 2, opportunity_score: 16, evidence_quotes: [{ text: '두피가 계속 가렵다' }], human_confirmed: true },
  { name: '향', importance: 8, satisfaction: 8, opportunity_score: 8, evidence_quotes: [], human_confirmed: false },
  { name: '거품', importance: 7, satisfaction: 5, opportunity_score: 9, evidence_quotes: null, human_confirmed: false },
  { name: '용량', importance: 3, satisfaction: 2, opportunity_score: 4, evidence_quotes: [], human_confirmed: false },
]
const pmf = {
  demand_axis: 0.8, precedent_axis: 0.7, quadrant: 'PROVEN_DEMAND',
  match_status: 'matched', match_reason: 'TRUST 선례 3건 · 제외: 자기 0 · 미승인 1 · 등급D 0', created_at: '2026-09-20T01:00:00Z',
}

// ── 정렬 ─────────────────────────────────────────────────────
t('상위 3은 기회점수 내림차순', topAspects(aspects, 3).map((a) => a.name).join(','), '가려움,거품,향')
t('점수 없는 속성은 뒤로 (0 으로 접지 않는다)',
  topAspects([{ name: 'x', opportunity_score: null }, { name: 'y', opportunity_score: 1 }], 2).map((a) => a.name).join(','), 'y,x')

// ── 전부 갖춘 요약 ───────────────────────────────────────────
const md = buildSummaryMarkdown({ project, aspects, pmf, remedies: null, angles: [{ headline_draft: '가려움 잡는 3주' , angle_type: 'PAS' }] })
t('제목에 상품 소개', md.includes('# PMF 진단 요약 — 두피 진정 샴푸'), true)
t('성숙도 단계 이름', md.includes('4단계 · 메커니즘 정제'), true)
t('성숙도 행동 1줄', md.includes('지금 할 일:'), true)
t('메타 발화 표시', md.includes('카테고리 전체를 비교'), true)
t('두 축을 따로 적는다', md.includes('수요축 0.80 · 선례축 0.70'), true)
t('선례 근거(제외 건수 포함)', md.includes('미승인 1'), true)
t('사분면 처방', md.includes('선례 무브를 그대로 옮겨 붙이는 게 가장 싸다'), true)
t('상위 소구점 3개만', (md.match(/^\d\. /gm) ?? []).length >= 3, true)
t('판정 동사', md.includes('여기를 민다'), true)
t('인용 있으면 그대로', md.includes('"두피가 계속 가렵다"'), true)
t('인용 없으면 이유를 적는다', md.includes('인용 없음 — 재분석하면 채워진다'), true)
t('사람 확인 여부', md.includes('사람 확인: 완료'), true)
t('앵글 3', md.includes('가려움 잡는 3주'), true)
t('초안 고지 1줄', md.includes(DRAFT_NOTICE), true)
t('보장 낱말 없음', /확실히|보장합니다|반드시 성공/.test(md), false)

// ── 3상태 — 없음과 확인 불가를 가른다 ────────────────────────
const noPmf = buildSummaryMarkdown({ project, aspects, pmf: null })
t('진단 없음 = 돌리라고 말한다', noPmf.includes('진단을 아직 돌리지 않았다'), true)
const pmfFailed = buildSummaryMarkdown({ project, aspects, pmf: null, pmfLookupFailed: true })
t('진단 조회 실패 ≠ 진단 없음', pmfFailed.includes('진단 조회에 실패했다'), true)
t('진단 조회 실패면 "돌리지 않았다" 라고 말하지 않는다', pmfFailed.includes('진단을 아직 돌리지 않았다'), false)

const notRunPmf = buildSummaryMarkdown({ project, aspects, pmf: { ...pmf, match_status: 'not_run', quadrant: null } })
t('not_run 진단은 축을 확인 불가로', notRunPmf.includes('수요축 확인 불가 · 선례축 확인 불가'), true)
t('not_run 이면 사분면을 내지 않는다', notRunPmf.includes('사분면: 내지 않음'), true)

const noAspects = buildSummaryMarkdown({ project, aspects: [], pmf })
t('속성 0개 = 0개라고 말한다', noAspects.includes('추출된 속성이 0개다'), true)
const aspectsFailed = buildSummaryMarkdown({ project, aspects: null, pmf })
t('속성 조회 실패 ≠ 0개', aspectsFailed.includes('0개가 아니라 확인 불가'), true)

// ── 보완 사례 ────────────────────────────────────────────────
const remedies = buildRemedies({
  aspects: [{ id: 'a1', name: '가려움', notes: null, importance: 9, satisfaction: 2 }],
  project,
  corpora: {
    principles: [],
    studies: [{ id: 's1', slug: 'acme', brand_name: '두피랩', bottleneck: 'TRUST', review_status: 'approved' }],
    moves: [{ id: 'm1', case_study_id: 's1', lever: 'CONTENT', claim: '가려움 리뷰를 붙였다', evidence_grade: 'A', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved' }],
    failedAngles: [],
  },
})
const withRemedy = buildSummaryMarkdown({ project, aspects, pmf, remedies })
t('보완 사례 한 줄이 들어간다', withRemedy.includes('보완: 두피랩 가 CONTENT 로'), true)
t('사실확인 등급도 같이', withRemedy.includes('사실확인 B · 인사이트 A'), true)

const remedyNotRun = buildRemedies({ aspects: null, project, corpora: { principles: null, studies: null, moves: null, failedAngles: null } })
t('처방 확인 불가는 확인 불가로', buildSummaryMarkdown({ project, aspects, pmf, remedies: remedyNotRun }).includes('확인 불가 —'), true)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('요약본이 "없음" 과 "확인 불가" 를 가르고, 처방·인용 문장이 한 벌에서 나온다.')
