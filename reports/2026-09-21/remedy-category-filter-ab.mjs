// 카테고리 선행 필터 전/후 — 오늘 A/B 와 같은 14속성, 낱말 겹침만. 판정은 이전 실행의 점수를 재사용하고 새 후보만 판정한다.
import { createClient } from '../../lib/supabase/server.ts'
import { advise } from '../../lib/cases/advisor.ts'
import fs from 'node:fs'

const GK = process.env.GEMINI_API_KEY
const JUDGE = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').split(',')[0].trim()
const K = 3
const prev = JSON.parse(fs.readFileSync(process.env.PREV, 'utf8'))
const prevAspects = prev.rows.map((r) => r.aspect)

const s = await createClient()
const sel = async (t, c) => { const { data, error } = await s.from(t).select(c); if (error) throw new Error(t + ': ' + error.message); return data }
const principles = await sel('strategy_principles', 'sp_id, tags, statement, evidence_grade, evidence_grade_note, source_ref')
const studies = await sel('case_studies', 'id, slug, brand_name, bottleneck, business_model, buyer_type, price_band, outcome_status, review_status')
const moves = await sel('case_moves', 'id, case_study_id, lever, claim, evidence_grade, fact_check_grade, outcome_direction, review_status, metric_name, metric_before, metric_after, metric_unit')
const failed = await sel('failed_angles', 'case_key, product_category, claimed_angle, outcome, evidence_source, source_tier, is_estimate')
const projects = await sel('analysis_projects', 'id, market, product_elevator_pitch, business_model')
const aspectsAll = await sel('analysis_aspects', 'id, project_id, name, notes, importance, satisfaction')
const pmap = new Map(projects.map((p) => [p.id, p]))
// 같은 표본: 이전 실행과 같은 필터 + 같은 이름 순서(중복 이름은 순서대로 짝짓는다)
const aspects = aspectsAll.filter((a) => a.importance >= 7 && a.satisfaction <= 6 && !/mock/i.test(a.name)).slice(0, 16)
const byStudy = new Map(studies.map((x) => [x.id, x]))
const docText = (id) => {
  const m = moves.find((x) => x.id === id); if (m) { const st = byStudy.get(m.case_study_id); return { corpus: 'A', text: `${st?.brand_name} ${st?.bottleneck} ${st?.business_model ?? ''} ${m.lever} ${m.claim}` } }
  const f = failed.find((x) => x.case_key === id); if (f) return { corpus: 'B', text: `${f.product_category} ${f.claimed_angle}` }
  const p = principles.find((x) => x.sp_id === id); if (p) return { corpus: 'C', text: `${(p.tags || []).join(' ')} ${p.statement}` }
  return null
}
const post = async (url, body) => { for (let i = 0; i < 6; i++) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (r.ok) return j; if (r.status === 429) { const m = /retry in ([0-9.]+)s/i.exec(JSON.stringify(j)); const w = m ? Math.ceil(Number(m[1])) + 2 : 65; console.log('  429 → ' + w + 's'); await new Promise((res) => setTimeout(res, w * 1000)); continue } throw new Error(r.status + ' ' + JSON.stringify(j).slice(0, 200)) } throw new Error('429 반복') }

const top = (r) => ({ A: r.corpus_a.cards.slice(0, K).map((c) => c.case_move_id), B: r.corpus_b.cards.slice(0, K).map((c) => c.case_key), C: r.corpus_c.cards.slice(0, K).map((c) => c.sp_id) })
const rows = []
for (const a of aspects) {
  const p = pmap.get(a.project_id) || {}
  const freeText = [p.market, p.product_elevator_pitch].filter(Boolean).join(' ') || null
  const corpora = { principles, studies, moves, failedAngles: failed }
  const before = top(advise({ category: a.name, angleDescription: a.notes ?? null, freeText }, corpora))
  const afterR = advise({ category: a.name, angleDescription: a.notes ?? null, freeText, businessModel: p.business_model ?? null }, corpora)
  const after = top(afterR)
  // 판정 점수: 이전 실행 재사용 → 없는 후보만 새로 판정
  const prevRow = prev.rows.find((r) => r.aspect === a.name && !r._used); if (prevRow) prevRow._used = true
  const scores = { ...(prevRow?.scores || {}) }
  const need = [...new Set([...Object.values(before).flat(), ...Object.values(after).flat()])].filter((id) => scores[id] === undefined)
  if (need.length) {
    const cand = need.map((id) => ({ id, ...docText(id) })).filter((c) => c.text)
    const prompt = `당신은 이커머스 셀러 컨설턴트다. 아래 "페인 속성"을 가진 셀러에게 각 후보 근거가 얼마나 관련 있는지 0(무관)/1(부분 관련)/2(직접 관련)로 채점하라. JSON 배열만 출력: [{"id":"...","score":0|1|2}].\n\n페인 속성: ${a.name}\n메모: ${a.notes ?? '(없음)'}\n시장/제품: ${freeText ?? '(없음)'}\n\n후보:\n${cand.map((c) => `- id=${c.id} [${c.corpus === 'A' ? '선례 무브' : c.corpus === 'B' ? '실패 사례' : '원칙'}] ${c.text.slice(0, 220)}`).join('\n')}`
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE}:generateContent?key=${GK}`, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
    try { for (const x of JSON.parse(j.candidates[0].content.parts[0].text)) scores[x.id] = Number(x.score) } catch {}
  }
  const stat = (t) => { const ids = Object.values(t).flat(); return { n: ids.length, nA: t.A.length, zero: ids.length ? ids.filter((id) => (scores[id] ?? 0) === 0).length / ids.length : null, rel: ids.length ? ids.reduce((n, id) => n + (scores[id] ?? 0), 0) / ids.length : null, relA: t.A.length ? t.A.reduce((n, id) => n + (scores[id] ?? 0), 0) / t.A.length : null } }
  rows.push({ aspect: a.name, bm: p.business_model ?? null, before: stat(before), after: stat(after), kindExcluded: /제품 종류 다름 (\d+)건/.exec(afterR.corpus_a.reason)?.[1] ?? null, beforeA: before.A, afterA: after.A, reused: prevRow ? 'prev' : 'new' })
  const r = rows.at(-1); console.log(`${a.name.slice(0, 20).padEnd(20)} | before n=${r.before.n} A=${r.before.nA} zero=${r.before.zero?.toFixed(2)} relA=${r.before.relA?.toFixed(2)} | after n=${r.after.n} A=${r.after.nA} zero=${r.after.zero?.toFixed(2)} relA=${r.after.relA?.toFixed(2)} (${r.reused})`)
}
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const agg = (k) => ({ cards_per_aspect: avg(rows.map((r) => r[k].n)), A_cards_per_aspect: avg(rows.map((r) => r[k].nA)), empty_aspects: rows.filter((r) => r[k].n === 0).length, zero_share: avg(rows.map((r) => r[k].zero)), rel: avg(rows.map((r) => r[k].rel)), relA: avg(rows.map((r) => r[k].relA)) })
const allZero = (k) => { let z = 0, n = 0; for (const r of rows) { n += r[k].n; z += Math.round((r[k].zero ?? 0) * r[k].n) } return { zero: z, n, share: n ? z / n : null } }
const summary = { aspects: rows.length, before: { ...agg('before'), pooled: allZero('before') }, after: { ...agg('after'), pooled: allZero('after') }, judge: JUDGE }
console.log('\nSUMMARY', JSON.stringify(summary, null, 1))
fs.writeFileSync(process.env.OUT, JSON.stringify({ summary, rows }, null, 1))
