// 처방 매칭 A/B — 낱말 겹침(advise) vs 임베딩 코사인(gemini-embedding-001). 읽기 전용.
import { createClient } from '../../lib/supabase/server.ts'
import { advise } from '../../lib/cases/advisor.ts'
import fs from 'node:fs'

const GK = process.env.GEMINI_API_KEY
const JUDGE = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').split(',')[0].trim()
const EMB = 'gemini-embedding-001'
const DIM = 768
const K = 3
const N_ASPECTS = 16

const s = await createClient()
const sel = async (t, c, f) => { let q = s.from(t).select(c); if (f) q = f(q); const { data, error } = await q; if (error) throw new Error(t + ': ' + error.message); return data }

const principles = await sel('strategy_principles', 'sp_id, tags, statement, evidence_grade, evidence_grade_note, source_ref')
const studies = await sel('case_studies', 'id, slug, brand_name, bottleneck, business_model, buyer_type, price_band, outcome_status, review_status')
const moves = await sel('case_moves', 'id, case_study_id, lever, claim, evidence_grade, fact_check_grade, outcome_direction, review_status, metric_name, metric_before, metric_after, metric_unit')
const failed = await sel('failed_angles', 'case_key, product_category, claimed_angle, outcome, evidence_source, source_tier, is_estimate')
const projects = await sel('analysis_projects', 'id, market, product_elevator_pitch')
const aspectsAll = await sel('analysis_aspects', 'id, project_id, name, notes, importance, satisfaction')
const pmap = new Map(projects.map(p => [p.id, p]))
const aspects = aspectsAll.filter(a => a.importance >= 7 && a.satisfaction <= 6 && !/mock/i.test(a.name)).slice(0, N_ASPECTS)

// ── 임베딩용 문서 텍스트: 낱말 매칭이 보는 것과 같은 필드만 ─────────────
const byStudy = new Map(studies.map(x => [x.id, x]))
const docs = []
for (const m of moves) {
  const st = byStudy.get(m.case_study_id); if (!st) continue
  if (st.review_status !== 'approved' || m.review_status !== 'approved' || m.evidence_grade === 'D') continue
  docs.push({ corpus: 'A', id: m.id, label: `${st.brand_name} · ${m.lever}`, text: `${st.brand_name} ${st.bottleneck} ${st.business_model ?? ''} ${m.lever} ${m.claim}` })
}
for (const f of failed) docs.push({ corpus: 'B', id: f.case_key, label: f.case_key, text: `${f.product_category} ${f.claimed_angle}` })
for (const p of principles) docs.push({ corpus: 'C', id: p.sp_id, label: p.sp_id, text: `${(p.tags || []).join(' ')} ${p.statement}` })

const post = async (url, body) => { for (let i = 0; i < 6; i++) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (r.ok) return j; if (r.status === 429) { const m = /retry in ([0-9.]+)s/i.exec(JSON.stringify(j)); const w = m ? Math.ceil(Number(m[1])) + 2 : 65; console.log('  429 → ' + w + 's 대기'); await new Promise(res => setTimeout(res, w * 1000)); continue } throw new Error(url.split('?')[0] + ' ' + r.status + ' ' + JSON.stringify(j).slice(0, 200)) } throw new Error('429 반복') }
const CACHE = (process.env.OUT || 'x') + '.embcache.json'
let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch {}
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache))
const embedBatch = async (texts, taskType) => {
  const out = new Array(texts.length)
  const todo = []
  texts.forEach((t, i) => { const k = taskType + '|' + t; if (cache[k]) out[i] = cache[k]; else todo.push(i) })
  for (let i = 0; i < todo.length; i += 20) {
    const idx = todo.slice(i, i + 20); const chunk = idx.map(x => texts[x])
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${EMB}:batchEmbedContents?key=${GK}`,
      { requests: chunk.map(t => ({ model: `models/${EMB}`, content: { parts: [{ text: t }] }, taskType, outputDimensionality: DIM })) })
    j.embeddings.forEach((e, k) => { out[idx[k]] = e.values; cache[taskType + '|' + chunk[k]] = e.values }); saveCache()
  }
  return out
}
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] } return d / Math.sqrt(na * nb) }
const approxTokens = (t) => Math.ceil(t.length / 2) // 한글 대략 2자=1토큰 가정(보수적)

const t0 = performance.now()
const docVecs = await embedBatch(docs.map(d => d.text), 'RETRIEVAL_DOCUMENT')
const corpusEmbedMs = performance.now() - t0
const corpusTokens = docs.reduce((n, d) => n + approxTokens(d.text), 0)

const rows = []
let judgeTokens = 0
for (const a of aspects) {
  const p = pmap.get(a.project_id) || {}
  const freeText = [p.market, p.product_elevator_pitch].filter(Boolean).join(' ') || null
  // A. 낱말 겹침
  const ta = performance.now()
  const r = advise({ category: a.name, angleDescription: a.notes ?? null, freeText }, { principles, studies, moves, failedAngles: failed })
  const msA = performance.now() - ta
  const topA = { A: r.corpus_a.cards.slice(0, K).map(c => c.case_move_id), B: r.corpus_b.cards.slice(0, K).map(c => c.case_key), C: r.corpus_c.cards.slice(0, K).map(c => c.sp_id) }
  // B. 임베딩
  const qtext = `${a.name} ${a.notes ?? ''} ${freeText ?? ''}`
  const tb = performance.now()
  const [qv] = await embedBatch([qtext], 'RETRIEVAL_QUERY')
  const scored = docs.map((d, i) => ({ ...d, score: cos(qv, docVecs[i]) }))
  const topB = {}, topBScore = {}
  for (const c of ['A', 'B', 'C']) { const l = scored.filter(d => d.corpus === c).sort((x, y) => y.score - x.score).slice(0, K); topB[c] = l.map(d => d.id); topBScore[c] = l.map(d => d.score.toFixed(3)) }
  const msB = performance.now() - tb
  // 판정: 두 방법 후보 합집합을 섞어 블라인드로 0/1/2
  const cand = [...new Set([...Object.values(topA).flat(), ...Object.values(topB).flat()])].map(id => docs.find(d => d.id === id)).filter(Boolean)
  cand.sort(() => Math.random() - 0.5)
  const prompt = `당신은 이커머스 셀러 컨설턴트다. 아래 "페인 속성"을 가진 셀러에게 각 후보 근거가 얼마나 관련 있는지 0(무관)/1(부분 관련)/2(직접 관련)로 채점하라. JSON 배열만 출력: [{"id":"...","score":0|1|2}].\n\n페인 속성: ${a.name}\n메모: ${a.notes ?? '(없음)'}\n시장/제품: ${freeText ?? '(없음)'}\n\n후보:\n${cand.map(c => `- id=${c.id} [${c.corpus === 'A' ? '선례 무브' : c.corpus === 'B' ? '실패 사례' : '원칙'}] ${c.text.slice(0, 220)}`).join('\n')}`
  judgeTokens += approxTokens(prompt)
  const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${JUDGE}:generateContent?key=${GK}`, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
  let scores = {}
  try { for (const x of JSON.parse(j.candidates[0].content.parts[0].text)) scores[x.id] = Number(x.score) } catch { }
  const rel = (ids) => ids.length ? ids.reduce((n, id) => n + (scores[id] ?? 0), 0) / ids.length : null
  rows.push({ aspect: a.name, project: (p.market || '').slice(0, 14), msA: Math.round(msA), msB: Math.round(msB), topA, topB, topBScore, relA: { A: rel(topA.A), B: rel(topA.B), C: rel(topA.C) }, relB: { A: rel(topB.A), B: rel(topB.B), C: rel(topB.C) }, nA: topA.A.length + topA.B.length + topA.C.length, nB: 9, scores })
  console.log(`${a.name.slice(0, 22).padEnd(22)} | A ${msA.toFixed(0)}ms n=${rows.at(-1).nA} rel ${JSON.stringify(rows.at(-1).relA)} | B ${msB.toFixed(0)}ms rel ${JSON.stringify(rows.at(-1).relB)}`)
}

const avg = (xs) => { const v = xs.filter(x => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : null }
const summary = {
  aspects: rows.length, docs: docs.length, byCorpus: { A: docs.filter(d => d.corpus === 'A').length, B: docs.filter(d => d.corpus === 'B').length, C: docs.filter(d => d.corpus === 'C').length },
  corpusEmbedMs: Math.round(corpusEmbedMs), corpusTokens, judgeTokens,
  latency: { A_ms: avg(rows.map(r => r.msA)), B_ms: avg(rows.map(r => r.msB)) },
  coverage: { A_cards_per_aspect: avg(rows.map(r => r.nA)), A_empty_aspects: rows.filter(r => r.nA === 0).length },
  relevance: {
    A: { A: avg(rows.map(r => r.relA.A)), B: avg(rows.map(r => r.relA.B)), C: avg(rows.map(r => r.relA.C)) },
    B: { A: avg(rows.map(r => r.relB.A)), B: avg(rows.map(r => r.relB.B)), C: avg(rows.map(r => r.relB.C)) },
  },
  // 임베딩 top-3 중 판정 0(무관) 비율 — 임계 없이 항상 3개를 내는 대가
  B_zero_share: avg(rows.map(r => { const ids = Object.values(r.topB).flat(); return ids.filter(id => (r.scores[id] ?? 0) === 0).length / ids.length })),
  A_zero_share: avg(rows.map(r => { const ids = Object.values(r.topA).flat(); return ids.length ? ids.filter(id => (r.scores[id] ?? 0) === 0).length / ids.length : null })),
}
console.log('\nSUMMARY', JSON.stringify(summary, null, 1))
fs.writeFileSync(process.env.OUT || 'remedy-ab-result.json', JSON.stringify({ summary, rows, judge: JUDGE, emb: EMB, dim: DIM }, null, 1))
