import { decideProvisional, renderReviewSql } from '../lib/review/provisional-review.ts'
let pass = 0, fail = 0
const t = (n, a, e) => { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : (fail++, console.log(`❌ ${n} — 기대 ${JSON.stringify(e)} / 실제 ${JSON.stringify(a)}`)) }
const P = (id, judged, relevant) => ({ id, name: id, judged, relevant })
const r = decideProvisional([P('a', 40, 24), P('b', 40, 10), P('c', 5, 5), P('d', 20, 10)])
t('승격 ≥50%', r.decisions.map((d) => d.action), ['promote', 'discard', 'wait', 'promote'])
t('판정 부족은 대기(폐기로 접지 않음)', r.decisions[2].ratio, null)
const s = decideProvisional([P('a', 40, 24)], { promoted: 10, discarded: 10 })
t('최근 폐기 비율 초과 → 정지·대기', [s.stopped, s.decisions[0].action], [true, 'wait'])
t('표본 부족이면 정지 안 함', decideProvisional([P('a', 40, 24)], { promoted: 1, discarded: 5 }).stopped, false)
const sql = renderReviewSql(r.decisions)
t('SQL: 승격은 prov-v1 행만', /area_rule_ver = 'prov-v1' AND id IN \('a', 'd'\)/.test(sql.apply), true)
t('SQL: 폐기는 status 만 바꾼다(DELETE 없음)', /DELETE/i.test(sql.apply + sql.rollback), false)
t('SQL: 롤백이 짝으로 있다', /prov-v1:promoted' AND id IN/.test(sql.rollback) && /status = 'active'/.test(sql.rollback), true)
console.log(`provisional-review selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
