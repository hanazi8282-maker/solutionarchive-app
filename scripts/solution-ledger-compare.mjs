#!/usr/bin/env node
// 2-5c 원장 자동 생성 정답 비교(v71eg-3): 실제 12곳의 주소(= cc_input 의 facts 가 가리키는 공개 주소)만으로 원장을 처음부터 자동 생성하고
// 결론서 세션이 만든 기존 원장과 비교한다. 이 시험이 끝나기 전에는 자동 생성 원장을 카드 생성에 쓰지 않는다(이 스크립트는 카드를 만들지 않는다).
//   node --env-file=.env.local scripts/solution-ledger-compare.mjs [--out reports/2026-11-25/solution-pipeline/ledger-compare] [--only slug] [--limit-usd 60] [--a-used N]
// 지표: (1) 기존 원장이 인용한 핵심 사실이 자동 facts 에 포함된 비율 (2) 상황신호 재현율·정밀도·완전일치 (3) 전제판정 칸별 일치율 (4) 한줄불편이 같은 불편인지 모델 O/X.
process.env.SOLUTION_PIPELINE_NO_MAIN = '1'
import fs from 'node:fs'
import path from 'node:path'
const P = await import('./solution-pipeline.mjs')
const { factCoverage, signalAgreement, premiseAgreement, ledgerFromCcInput } = await import('../lib/solution-card/ledger.ts')
const args = process.argv.slice(2)
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const OUT = opt('out', 'reports/2026-11-25/solution-pipeline/ledger-compare'), only = opt('only')
fs.mkdirSync(OUT, { recursive: true })
const cc = JSON.parse(fs.readFileSync(process.env.CC_INPUT ?? 'C:/Users/DCU/Desktop/결론서자동화/cc-inbox/cc_input_early_12cos_20261121.json', 'utf8')).companies
const ref = JSON.parse(fs.readFileSync(process.env.REF_LEDGER ?? 'reports/2026-11-25/solution-pipeline/ref-ledger-real12.json', 'utf8')).companies
const JUDGE = `두 문장이 "같은 회사의 같은 불편"을 가리키는지만 판정한다. 표현이 달라도 막힌 지점(예: 쓰는 사람이 안 보임 / 가격 안내가 화면마다 다름 / 무료만 쓰고 결제 없음)이 같으면 O. 다른 지점이면 X. 출력 JSON 하나: {"same":"O|X","why":"한 줄"}`
const rows = []
for (const c of cc) {
  if (only && c.slug !== only) continue
  const r = ref[c.slug]; if (!r) continue
  const row = { slug: c.slug, name: c.name }
  try {
    const refLed = ledgerFromCcInput(c, r)
    const urls = [...new Set(c.facts.map((f) => f.url).filter(Boolean))]
    const facts = await P.collectFacts(urls)
    row.urls = urls.length; row.blocked = facts.filter((f) => f.blocked).length; row.autoFacts = facts.filter((f) => !f.blocked).length
    const led = await P.extractLedger(c.slug, c.name, facts)
    fs.writeFileSync(path.join(OUT, `auto-ledger-${c.slug}.json`), JSON.stringify(led, null, 1))
    const cited = [...new Set(String(r.evidence).match(/C\d+/g) ?? [])]
    row.m1 = factCoverage(refLed.facts, cited, facts)
    // v3: 의미 일치 — 기준 사실마다 자동 수집 facts 에 같은 뜻(같은 숫자·같은 내용)이 있는지 모델이 판정(숫자 토큰 일치는 보수적이라 함께 보고)
    try {
      const refCited = cited.map((id) => refLed.facts.find((x) => x.id === id)).filter(Boolean)
      const SEM = '기준 사실 목록과 자동 수집 사실 목록을 비교한다. 기준 사실마다, 자동 수집 사실 안에 같은 내용(같은 숫자·같은 사실)이 있으면 covered 에 그 id 를 넣는다. 표현이 달라도 뜻과 숫자가 같으면 포함. 출력 JSON 하나: {"covered":["C8"]}'
      const payload = JSON.stringify({ ref: refCited.map((x) => ({ id: x.id, text: x.text })), auto: facts.filter((x) => !x.blocked).slice(0, 80).map((x) => x.text) })
      const j = P.jparse(await P.call('compare-semantic', P.M.judge, SEM, '<data>' + payload + '</data>'))
      const cov = (j.covered ?? []).filter((id) => cited.includes(id)); row.m1s = { total: refCited.length, covered: cov.length }
    } catch (e) { row.m1s = { total: 0, covered: 0, error: String(e.message).slice(0, 60) } }
    row.m2 = signalAgreement(r.signals, led.signals.map((s) => s.code)); row.refSignals = r.signals; row.autoSignals = led.signals.map((s) => s.code)
    row.m3 = premiseAgreement(refLed.premises, led.premises)
    row.autoComplaint = led.complaint; row.refComplaint = r.complaint
    try { const j = P.jparse(await P.call('compare-judge', P.M.judge, JUDGE, `<data>\n${JSON.stringify({ a: r.complaint, b: led.complaint })}\n</data>`)); row.m4 = { same: j.same === 'O' ? 'O' : 'X', why: String(j.why ?? '').slice(0, 160) } } catch (e) { row.m4 = { same: 'X', why: '판정 실패: ' + String(e.message).slice(0, 60) } }
  } catch (e) { row.error = String(e.message).slice(0, 160) }
  rows.push(row); console.log(`[${new Date().toISOString().slice(11, 19)}] ${c.slug} ${row.error ? '오류 ' + row.error : `facts ${row.m1.covered}/${row.m1.total} · 신호 ${JSON.stringify(row.autoSignals)} vs ${JSON.stringify(row.refSignals)} · 전제 ${(row.m3.rate * 100).toFixed(0)}% · 불편 ${row.m4.same}`} · B ${P.cost.b.toFixed(3)}`)
}
const ok = rows.filter((x) => !x.error)
const sum = (f) => ok.reduce((s, x) => s + f(x), 0)
const summary = {
  companies: rows.length, errors: rows.filter((x) => x.error).length,
  m1_fact_coverage_pct: ok.length && sum((x) => x.m1.total) ? +(100 * sum((x) => x.m1.covered) / sum((x) => x.m1.total)).toFixed(1) : null,
  m1s_fact_semantic_pct: ok.length && sum((x) => x.m1s?.total ?? 0) ? +(100 * sum((x) => x.m1s?.covered ?? 0) / sum((x) => x.m1s?.total ?? 0)).toFixed(1) : null,
  m2_signal_recall_pct: ok.filter((x) => x.m2.recall !== null).length ? +(100 * ok.filter((x) => x.m2.recall !== null).reduce((s, x) => s + x.m2.recall, 0) / ok.filter((x) => x.m2.recall !== null).length).toFixed(1) : null,
  m2_signal_exact_pct: ok.length ? +(100 * ok.filter((x) => x.m2.exact).length / ok.length).toFixed(1) : null,
  m3_premise_agreement_pct: ok.length ? +(100 * sum((x) => x.m3.rate) / ok.length).toFixed(1) : null,
  m4_same_complaint_pct: ok.length ? +(100 * ok.filter((x) => x.m4.same === 'O').length / ok.length).toFixed(1) : null,
  blocked_companies: rows.filter((x) => x.blocked > 0).map((x) => `${x.slug}(${x.blocked}곳)`), bUsed: +P.cost.b.toFixed(3),
}
fs.writeFileSync(path.join(OUT, 'compare.json'), JSON.stringify({ summary, rows }, null, 1))
console.log(JSON.stringify(summary))
