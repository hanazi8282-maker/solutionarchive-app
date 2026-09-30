#!/usr/bin/env node
// 인사이트 화면(lib/insights/feed.ts) 순수 함수 셀프테스트 — 네트워크·DB 없음.
//   node scripts/insights-feed-selftest.mjs
// 게이트 양성·음성·경계 + 뮤테이션(게이트 조건 하나를 끄면 음성 검사가 실패해야 한다 — 검사가 헛돌지 않는지).
import {
  INSIGHT_GATE, PAGE_SIZE, buildInsightFeed, gateReason, insightHref, latestAssessment, loadInsightFeed, parseInsightQuery,
} from '../lib/insights/feed.ts'
import { ANALYSIS_PURPOSES, OUTPUT_TYPES, QUADRANTS, SUBSTANTIATION_VERDICTS } from '../lib/analysis/types.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

const P = (id, status = 'angled', extra = {}) => ({ id, product_elevator_pitch: `프로젝트 ${id}`, mode: 'forward', status, created_at: '2026-09-01T00:00:00Z', ...extra })
const S = (id, project_id, quadrant = 'DIFFERENTIATOR') => ({ id, project_id, name: `속성 ${id}`, quadrant })
const A = (id, over = {}) => ({
  id, project_id: 'p1', aspect_id: 's1', angle_type: 'PAS', output_type: 'COPY', headline_draft: `문구 ${id}`,
  substantiation_verdict: 'SUBSTANTIATED', substantiation_reason: '사유', substantiation_evidence: '원문 근거 문장',
  headline_original: null, gate_rewritten: false, adaptation_suggestion: null, created_at: '2026-09-20T00:00:00Z', ...over,
})
const Q = (over = {}) => ({ ...parseInsightQuery({}).query, ...over })
const base = { projects: [P('p1'), P('p2', 'claimed'), P('p3', 'done')], aspects: [S('s1', 'p1'), S('s2', 'p1', 'OVER_INVESTED'), S('s3', 'p3', 'TABLE_STAKES')], assessments: [], validated: new Set() }
const feed = (angles, q = Q(), extra = {}, gate) => buildInsightFeed(q, { ...base, angles, ...extra }, gate)
const ids = (f) => f.groups.flatMap((g) => g.items.map((i) => i.id))

// ── 게이트 음성 케이스(뮤테이션이 이걸 다시 돌린다) ─────────────
const NEG = [
  ['UNSUBSTANTIATED 제외', A('n1', { substantiation_verdict: 'UNSUBSTANTIATED' }), 'verdicts'],
  ['BASELINE_SPEC 제외', A('n2', { output_type: 'BASELINE_SPEC' }), 'outputTypes'],
  ['OVER_INVESTED 속성 제외', A('n3', { aspect_id: 's2' }), 'aspectQuadrants'],
  ["status='claimed' 프로젝트 제외", A('n4', { project_id: 'p2', aspect_id: 's1' }), 'projectStatuses'],
]
const negHolds = (angle, gate) => !ids(feed([angle], Q(), {}, gate)).includes(angle.id)

// 양성
t('SUBSTANTIATED + COPY + DIFFERENTIATOR + angled 통과', ids(feed([A('a1')])).includes('a1'))
t('EXPERIENTIAL 통과(인용 줄 없음)', (() => { const f = feed([A('a2', { substantiation_verdict: 'EXPERIENTIAL' })]); return ids(f).includes('a2') && f.groups[0].items[0].evidence === null })())
t('TABLE_STAKES 속성 + done 프로젝트 통과', ids(feed([A('a3', { project_id: 'p3', aspect_id: 's3' })])).includes('a3'))
t('OFFER·STRUCTURE 통과', ids(feed([A('a4', { output_type: 'OFFER' }), A('a5', { output_type: 'STRUCTURE' })])).length === 2)
// 음성
for (const [name, angle] of NEG) t(name, negHolds(angle))
t('PRODUCT_SPEC 제외', negHolds(A('n5', { output_type: 'PRODUCT_SPEC' })))
// 경계
t('verdict NULL 제외(판정 없음 ≠ 통과)', negHolds(A('b1', { substantiation_verdict: null })))
t('output_type NULL 제외', negHolds(A('b2', { output_type: null })))
t('aspect_id NULL(BASELINE 묶음) 제외', negHolds(A('b3', { aspect_id: null })))
t('없는 aspect_id 참조 제외', negHolds(A('b4', { aspect_id: 'ghost' })))
t('없는 프로젝트 참조 제외', negHolds(A('b5', { project_id: 'ghost' })))
t('빈 문구 제외', negHolds(A('b6', { headline_draft: '   ' })))
t('gateReason 첫 걸림 = verdict', gateReason(A('x', { substantiation_verdict: 'UNSUBSTANTIATED', output_type: 'PRODUCT_SPEC' }), S('s1', 'p1'), P('p1')) === 'verdict')
// gate=all
const all = feed([A('a1'), A('n1', { substantiation_verdict: 'UNSUBSTANTIATED' }), A('n2', { output_type: 'BASELINE_SPEC' })], Q({ gate: 'all' }))
t('gate=all 이면 UNSUBSTANTIATED 포함, 내부 산출물은 여전히 제외', ids(all).includes('n1') && !ids(all).includes('n2'))
const pass1 = feed([A('a1'), A('n1', { substantiation_verdict: 'UNSUBSTANTIATED' }), A('n6', { substantiation_verdict: 'UNSUBSTANTIATED', output_type: 'PRODUCT_SPEC' })])
t('숨긴 근거 없음 건수 = 판정 하나로만 걸린 것(1)', pass1.hiddenUnsubstantiated === 1)
t('gate=all 에서 숨김 0', all.hiddenUnsubstantiated === 0)
t('SUBSTANTIATED 만 인용 줄', pass1.groups[0].items[0].evidence === '원문 근거 문장')
t('인용 140자 절단', Array.from(feed([A('q', { substantiation_evidence: '가'.repeat(400) })]).groups[0].items[0].evidence).length === 140)

// ── 뮤테이션: 조건 하나를 어휘 전체로 넓히면(=끄면) 그 조건의 음성 검사가 실패해야 한다 ──
const FULL = { verdicts: SUBSTANTIATION_VERDICTS, outputTypes: OUTPUT_TYPES, aspectQuadrants: QUADRANTS, projectStatuses: ['collecting', 'claimed', 'reviewed', 'angled', 'done'] }
for (const key of Object.keys(INSIGHT_GATE)) {
  const mutated = { ...INSIGHT_GATE, [key]: FULL[key] }
  const caught = NEG.filter(([, , k]) => k === key).every(([, angle]) => !negHolds(angle, mutated))
  t(`뮤테이션 ${key} 끄기 → 음성 검사가 실패로 잡는다`, caught)
}
t('뮤테이션 대상 4개 = INSIGHT_GATE 키 4개', Object.keys(INSIGHT_GATE).length === 4 && NEG.length === 4)

// ── PMF 사분면: 최신 진단 1건 · 미진단 ─────────────────────────
const asm = [
  { target_project_id: 'p1', quadrant: 'PARK', match_status: 'matched', created_at: '2026-09-01T00:00:00Z' },
  { target_project_id: 'p1', quadrant: 'PROVEN_DEMAND', match_status: 'matched', created_at: '2026-09-10T00:00:00Z' },
]
t('latestAssessment = created_at 최신', latestAssessment(asm).quadrant === 'PROVEN_DEMAND')
t('latestAssessment 빈/NULL = null', latestAssessment([]) === null && latestAssessment(null) === null)
const grouped = feed([A('a1'), A('a3', { project_id: 'p3', aspect_id: 's3' })], Q(), { assessments: asm })
t('최신 진단 사분면으로 그룹', grouped.groups[0].quadrant === 'PROVEN_DEMAND' && grouped.groups[0].items[0].id === 'a1')
t('진단 행 없는 프로젝트 = 미진단 그룹(맨 뒤)', grouped.groups.at(-1).quadrant === 'none' && grouped.undiagnosed === 1)
const notRun = feed([A('a1')], Q(), { assessments: [{ target_project_id: 'p1', quadrant: null, match_status: 'not_run', created_at: '2026-09-11T00:00:00Z' }] })
t('최신이 not_run(quadrant NULL) = 미진단 + 확인 불가 1곳', notRun.groups[0].quadrant === 'none' && notRun.notRunProjects === 1)
t('그룹 건수 합 = 총건수', grouped.groups.reduce((n, g) => n + g.count, 0) === grouped.total)
t('사분면 필터', ids(feed([A('a1'), A('a3', { project_id: 'p3', aspect_id: 's3' })], Q({ quadrant: 'none' }), { assessments: asm })).join() === 'a3')
t('프로젝트 필터 + 칩 건수', (() => { const f = feed([A('a1'), A('a3', { project_id: 'p3', aspect_id: 's3' })], Q({ project: 'p3' })); return ids(f).join() === 'a3' && f.projects.length === 2 })())
const sorted = feed([A('e', { substantiation_verdict: 'EXPERIENTIAL', created_at: '2026-09-29T00:00:00Z' }), A('s', { created_at: '2026-09-01T00:00:00Z' })], Q({ sort: 'verdict' }))
t('판정순 = SUBSTANTIATED 먼저', ids(sorted).join() === 's,e')
t('최신순 기본', ids(feed([A('old', { created_at: '2026-09-01T00:00:00Z' }), A('new', { created_at: '2026-09-29T00:00:00Z' })])).join() === 'new,old')
const many = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => A(`m${String(i).padStart(3, '0')}`))
t(`페이지 ${PAGE_SIZE}건 + 그룹 count 는 전체`, (() => { const f = feed(many, Q({ page: 2 })); return ids(f).length === 3 && f.groups[0].count === PAGE_SIZE + 3 && f.total === PAGE_SIZE + 3 })())
t('실전 채택: 집합에 있으면 true / null 집합 = 확인 불가', feed([A('a1')], Q(), { validated: new Set(['a1']) }).groups[0].items[0].validated === true
  && feed([A('a1')], Q(), { validated: null }).groups[0].items[0].validated === null && feed([A('a1')], Q(), { validated: null }).validatedKnown === false)

// ── 질의 파서 ─────────────────────────────────────────────
const bad = parseInsightQuery({ quadrant: 'X', gate: 'maybe', project: 'nope', sort: 'x', page: '-1' })
t('어휘 밖 5개 → 기본값 + 사유 5건', bad.errors.length === 5 && bad.query.quadrant === null && bad.query.gate === 'pass' && bad.query.project === null && bad.query.sort === 'recent' && bad.query.page === 1)
t('빈 질의 = 기본값', parseInsightQuery({}).errors.length === 0)
t('기본값은 URL 에 안 적는다', insightHref(Q(), {}) === '/insights' && insightHref(Q(), { gate: 'all', quadrant: 'none' }) === '/insights?quadrant=none&gate=all')
t('ANALYSIS_PURPOSES 로드 확인(타입 스트리핑 경로)', ANALYSIS_PURPOSES.length > 0)

// ── 조회: 핵심 테이블 하나라도 실패 → error(0건으로 접지 않는다) ─────
const fakeSb = (fail = {}) => ({
  from(table) {
    const rows = { analysis_angles: [A('a1')], analysis_projects: base.projects, analysis_aspects: base.aspects, pmf_assessments: [], validated_angles_corpus: [] }[table]
    const res = fail[table] ? { data: null, error: { code: fail[table], message: 'boom' }, count: null } : { data: rows, error: null, count: rows.length }
    const q = { select: () => q, range: () => q, then: (ok, ko) => Promise.resolve(res).then(ok, ko) }
    return q
  },
})
const q0 = Q()
const quiet = console.error; const warn = console.warn; console.error = () => {}; console.warn = () => {}
const okRes = await loadInsightFeed(fakeSb(), q0)
const failRes = await Promise.all(['analysis_angles', 'analysis_projects', 'analysis_aspects', 'pmf_assessments'].map((tb) => loadInsightFeed(fakeSb({ [tb]: '500' }), q0)))
const valFail = await loadInsightFeed(fakeSb({ validated_angles_corpus: 'PGRST205' }), q0)
console.error = quiet; console.warn = warn
t('정상 조회 → ok + 1건', okRes.status === 'ok' && okRes.total === 1)
t('핵심 4테이블 각각 실패 → error', failRes.every((r) => r.status === 'error'))
t('pmf_assessments 실패 → error(미진단으로 접지 않는다)', failRes[3].status === 'error' && /PMF/.test(failRes[3].reason))
t('validated 만 실패 → ok + 칩 확인 불가', valFail.status === 'ok' && valFail.validatedKnown === false)
const truncSb = { from: (tb) => { const q = fakeSb().from(tb); if (tb !== 'analysis_angles') return q; const r = { select: () => r, range: () => r, then: (ok) => Promise.resolve({ data: [A('a1')], error: null, count: 5 }).then(ok) }; return r } }
console.error = () => {}
t('앵글이 잘려 오면(받은 1 < count 5) error', (await loadInsightFeed(truncSb, q0)).status === 'error')
console.error = quiet

console.log(`\ninsights-feed-selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
