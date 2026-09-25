// T2 2차 판정 export/import 순수 부품 셀프테스트 — 네트워크·DB 없음.
//   node scripts/second-opinion-selftest.mjs
import { toExportRow, validateOpinions, compare, summarize, EXPORT_TEXT_MAX } from '../lib/analysis/second-opinion.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${g}\n      want=${w}`) } }

// export 행 — 판정·라벨 없음, 원문 600자, 공백 정리
{
  const r = toExportRow({ input_id: 'a', project_id: 'p', raw_text: '  줄바꿈\n\n포함  ' + '가'.repeat(1000), pitch: '피치' })
  t('export: 키는 4개뿐(판정·라벨 없음)', Object.keys(r).sort(), ['input_id', 'project_id', 'project_pitch', 'text'])
  t('export: 600자 상한', r.text.length, EXPORT_TEXT_MAX)
  t('export: 공백 정리', r.text.startsWith('줄바꿈 포함 가'), true)
  t('export: raw_text null → 빈 문자열', toExportRow({ input_id: 'b', project_id: 'p', raw_text: null }).text, '')
}
// validate — 어휘·중복·형태
{
  const v = validateOpinions({ rows: [
    { input_id: 'x1', verdict: 'relevant', impact: 'high', frequency: null, community_signal: 'pain', wtp_mentioned: true, reason: 'r' },
    { input_id: 'x2', verdict: 'irrelevant' },
    { input_id: 'x1', verdict: 'relevant' },
    { input_id: 'x3', verdict: 'maybe' },
    { input_id: 'x4', verdict: 'relevant', impact: 'HIGH' },
    { input_id: 'x5', verdict: 'relevant', wtp_mentioned: 'yes' },
    { verdict: 'relevant' },
  ] })
  t('validate: 유효 2행', v.ok.map((o) => o.input_id), ['x1', 'x2'])
  t('validate: 라벨 생략은 null', v.ok[1].impact, null)
  t('validate: 거부 5행(중복·어휘·대문자·불리언·id없음)', v.rejected.length, 5)
  t('validate: 배열 그대로도 받음', validateOpinions([{ input_id: 'y', verdict: 'unknown' }]).ok.length, 1)
  t('validate: 엉뚱한 입력 → 거부 1', validateOpinions('nope').rejected.length, 1)
}
// compare — 일치·채우기 조건
{
  const db = new Map([
    ['a', { input_id: 'a', verdict: 'relevant', human_verdict: null, impact: null, frequency: null, community_signal: null, wtp_mentioned: null, labels_unavailable_reason: null }],
    ['b', { input_id: 'b', verdict: 'relevant', human_verdict: 'relevant', impact: 'high', frequency: null, community_signal: null, wtp_mentioned: null, labels_unavailable_reason: null }],
    ['c', { input_id: 'c', verdict: 'irrelevant', human_verdict: 'relevant', impact: null, frequency: null, community_signal: null, wtp_mentioned: null, labels_unavailable_reason: null }],
    ['d', { input_id: 'd', verdict: 'relevant', human_verdict: null, impact: null, frequency: null, community_signal: null, wtp_mentioned: null, labels_unavailable_reason: 'opinion_no_pain_signal' }],
    ['e', { input_id: 'e', verdict: 'unknown', human_verdict: null, impact: null, frequency: null, community_signal: null, wtp_mentioned: null, labels_unavailable_reason: null }],
  ])
  const ops = validateOpinions([
    { input_id: 'a', verdict: 'relevant', impact: 'mid' },
    { input_id: 'b', verdict: 'relevant', impact: 'low' },
    { input_id: 'c', verdict: 'relevant', impact: 'high' },
    { input_id: 'd', verdict: 'relevant', impact: 'high' },
    { input_id: 'e', verdict: 'relevant' },
    { input_id: 'zz', verdict: 'relevant' },
  ]).ok
  const { rows, missing } = compare(ops, db)
  const by = Object.fromEntries(rows.map((r) => [r.input_id, r]))
  t('compare: DB 에 없는 id 는 missing', missing, ['zz'])
  t('a: 라벨 전부 NULL·relevant·라벨 줌 → fillable', by.a.fillable, true)
  t('b: 라벨 있음 → fillable 아님(덮지 않음)', by.b.fillable, false)
  t('b: 사람 채점과 일치', by.b.agrees_with_human, true)
  t('c: DB irrelevant vs 세션 relevant → DB 불일치·사람 일치', [by.c.agrees_with_db, by.c.agrees_with_human], [false, true])
  t('c: 라벨 NULL 이고 relevant → fillable (verdict 는 안 바꿈)', by.c.fillable, true)
  t('d: 불가 표시 행 → fillable 아님', by.d.fillable, false)
  t('e: DB unknown → DB 비교 null, 라벨 안 줌 → fillable 아님', [by.e.agrees_with_db, by.e.fillable], [null, false])
  const s = summarize(rows)
  t('summarize: n·vs_db·vs_human·fillable', [s.n, s.vs_db, s.vs_human, s.fillable], [5, { compared: 4, agree: 3 }, { compared: 2, agree: 2 }, 2])
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('2차 판정 import 가 기존 라벨을 덮거나 어휘 밖 값을 통과시킨다.'); process.exit(1) }
console.log('2차 판정 부품 정상 — export 는 눈가림, import 는 NULL 라벨만 채운다.')
