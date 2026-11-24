#!/usr/bin/env node
// 솔루션 자동화 파이프라인(v71eg B2 ③~⑧): 회사 라벨 → 매칭 v0.3 → 카드 v2 생성 → 자동 검증(전수 이중 O/X) → 결론서 슬롯 매핑 → 검수 시트.
// 쓰기: 파일만(reports/·ops/). DB 는 읽기만(ss_episode_tags_current · ss_story_labels_current · case_signal_labels_v06). 이메일 등 개인정보를 모델·외부로 보내지 않는다.
//   node --env-file=.env.local scripts/solution-pipeline.mjs --companies <companies.json> --out reports/2026-11-25/solution-pipeline [--limit-usd 60] [--a-used 0]
//   companies.json = [{ id, name, group: 'real12'|'sent7'|'new6', text: '공개 회사 소개문/스토리', url? }]
// 비용: B 한도(기본 $60, 하드 스톱). A(라벨링) 사용액은 --a-used 로 받아 합계 $90 의 80%($72) 경고·100% 중단에 같이 센다. 구독 경로라 비용은 명목.
// 모델: 회사 라벨 = Haiku · 카드 생성 = Sonnet · 이중 판정 = Haiku(생성과 다른 모델) · 사실·숫자 검사는 코드(validateCardV2).
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { runCli, StopRun } from '../lib/story-label/cli.mjs'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'
import { matchCompany, applyPortfolioRules } from '../lib/solution-card/match-v03.ts'
import { validateCardV2, numbersOf, CARD_VERSION } from '../lib/solution-card/card-v2.ts'
import { SYSTEM_V2, buildUserV2 } from '../lib/solution-card/prompt-v2.ts'

const args = process.argv.slice(2)
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const compF = opt('companies'), OUT = opt('out', 'reports/solution-pipeline'), B_CAP = Number(opt('limit-usd', '60')), A_USED = Number(opt('a-used', '0')), TOTAL_CAP = 90
if (!compF) { console.error('사용법: --companies <companies.json> [--out 폴더] [--limit-usd 60] [--a-used 라벨링사용액]'); process.exit(64) }
for (const k of Object.keys(process.env)) if (k === 'ANTHROPIC_API_KEY' || /^CLAUDE_CODE/.test(k) || /^CLAUDECODE/.test(k) || k === 'CLAUDE_PID') delete process.env[k]
process.env.PATH = 'C:/Users/DCU/.local/bin;' + process.env.PATH
fs.mkdirSync(OUT, { recursive: true })
const M = { label: 'claude-haiku-5-5', gen: 'claude-sonnet-5-5', verify: 'claude-haiku-5-5' }
const log = (s) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(l); fs.appendFileSync(path.join(OUT, 'pipeline.log'), l + '\n') }

// ── 비용 장부(하드 스톱) ──
let bUsed = 0, warned = false, stopped = null
const ledger = path.join(OUT, 'ledger.jsonl')
const spendTotal = () => A_USED + bUsed
async function call(stage, model, system, user, effort = 'low') {
  if (stopped) throw new Error('중단: ' + stopped)
  if (bUsed >= B_CAP || spendTotal() >= TOTAL_CAP) { stopped = `비용 한도(B ${bUsed.toFixed(2)}/${B_CAP}, 합계 ${spendTotal().toFixed(2)}/${TOTAL_CAP})`; throw new Error('중단: ' + stopped) }
  if (!warned && spendTotal() >= TOTAL_CAP * 0.8) { warned = true; log(`⚠ 합계 ${spendTotal().toFixed(2)} = 한도 ${TOTAL_CAP} 의 80% 도달`) }
  const r = await runCli({ system: `${UNTRUSTED_INPUT_NOTICE}\n${system}`, user, model, effort })
  bUsed += r.costUsd ?? 0
  fs.appendFileSync(ledger, JSON.stringify({ at: new Date().toISOString(), stage, model, usd: r.costUsd, bUsed: +bUsed.toFixed(4), total: +spendTotal().toFixed(4) }) + '\n')
  return r.text
}
const jparse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) throw new Error('JSON 없음'); return JSON.parse(m[0]) }

// ── ③ 회사 라벨러: 신호·전제는 공개 글에서만, 근거 문장은 입력에 글자 그대로 있어야 한다(R-D·R-E), P2 기준 v2 ──
const SIG = fs.existsSync('config/signal-dict-v06.json') ? JSON.parse(fs.readFileSync('config/signal-dict-v06.json', 'utf8')) : null
const LABEL_SYSTEM = `너는 회사 한 곳의 공개 소개 글을 읽고 "지금 이 회사의 상황 신호(S-code)"와 "전제(P)"를 뽑는다. <data> 안의 글만 근거로 쓴다.
${SIG ? '[신호 사전]\n' + Object.entries(SIG).map(([k, v]) => `${k} ${v}`).join('\n') : '신호 코드는 S01~S39 형식이다(아는 코드만 쓰고, 정의에 맞지 않으면 쓰지 않는다).'}
규칙: R-D 근거 문장은 그 신호의 상황을 직접 설명해야 한다(다른 신호의 결과·걸림돌을 빌리지 않는다). R-E 근거가 비었거나 상황을 설명 못 하면 그 신호는 붙이지 않는다. 근거는 입력에 글자 그대로 있는 문장 일부여야 한다.
S01/S23: "수요가 있는지 알 수 없다"는 S23, S01은 무엇을 누구에게 팔지 한 문장으로 못 말할 때만. S33은 채널·퍼널이 많아 생긴 부작용이 글에 직접 있을 때만.
P2(쓰는 사용자가 있다) 값: 확정(외부인 흔적 2건 또는 날짜 있는 공개 수치) / 추정(운영자 글·광고문구 흔적만) / 미충족 / 모름(1년 넘은 흔적·날짜 못 읽음). 1년 안 흔적=최근 활동. 단계는 "추정"으로 적는다.
출력은 JSON 하나: {"domain":"제품군 한 단어","customer":"고객층 한 단어","stage":"초기|첫 매출|성장","signals":[{"code":"S05","evidence":"입력 그대로"}],"premises":{"P1":"확정|추정|미충족|모름","P2":"…","P10":"…"}}`
const P_MAP = { 확정: 'met', 추정: 'met', 미충족: 'unmet', 모름: 'unknown' }
async function labelCompany(c) {
  const f = path.join(OUT, `label-${c.id}.json`)
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  let lastErr
  for (let a = 0; a < 3; a++) {
    try {
      const j = jparse(await call('company-label', M.label, LABEL_SYSTEM, `<data>\n${JSON.stringify({ name: c.name, text: c.text })}\n</data>`))
      const norm = (s) => String(s ?? '').replace(/\s+/g, '')
      const kept = [], dropped = []
      for (const s of j.signals ?? []) (s?.evidence && /^S\d{2}$/.test(s.code ?? '') && norm(c.text).includes(norm(s.evidence)) ? kept : dropped).push(s)
      const label = { name: c.name, domain: j.domain ?? '', customer: j.customer ?? '', stage: j.stage ?? '초기', signals: kept, premises: Object.fromEntries(Object.entries(j.premises ?? {}).map(([k, v]) => [k, P_MAP[v] ?? 'unknown'])), premisesRaw: j.premises ?? {}, droppedNoEvidence: dropped }
      fs.writeFileSync(f, JSON.stringify(label, null, 1)); return label
    } catch (e) { lastErr = e; if (e instanceof StopRun) throw e }
  }
  throw lastErr
}

// ── 사례 풀(읽기 전용) ──
async function loadPool(sb) {
  const rd = async (table, cols, filter) => { const out = []; for (let f = 0; ; f += 1000) { let q = sb.from(table).select(cols).order('id').range(f, f + 999); if (filter) q = filter(q); const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`); out.push(...data); if (data.length < 1000) break } return out }
  const eps = await rd('ss_episode_tags_current', 'id, slug, chapter, adversity_ko, action_ko, result_ko, result_class, result_grain, evidence_strength, quote_orig, condition_ko')
  const labels = {}; for (const r of await rd('ss_story_labels_current', 'id, slug, domain, customer, stage')) labels[r.slug] = r
  const sig = {}; try { for (const r of await rd('case_signal_labels_v06', 'id, story_slug, episode_id, signal_code')) (sig[r.episode_id] ??= []).push(r.signal_code) } catch (e) { log('case_signal_labels_v06 읽기 실패 → 낱말 규칙으로 대체: ' + e.message) }
  return eps.map((e) => ({ id: e.id, slug: e.slug, chapter: e.chapter, domain: labels[e.slug]?.domain ?? null, customer: labels[e.slug]?.customer ?? null, stage: labels[e.slug]?.stage ?? null, adversity_ko: e.adversity_ko ?? '', action_ko: e.action_ko ?? '', result_ko: e.result_ko ?? '', result_class: e.result_class, result_grain: e.result_grain, evidence_strength: e.evidence_strength, quote_orig: e.quote_orig, signals: sig[e.id] ?? [], condition_ko: e.condition_ko ?? '' }))
}

// ── ⑤ 카드 생성(+형식·숫자 검사 재시도 ≤2) ──
async function makeCard(co, problem, cand) {
  const c = cand.case, facts = { problem: c.adversity_ko, action: c.action_ko, result: c.result_ko, conditions: c.condition_ko ?? '' }
  const user = buildUserV2({ company: { name: co.name, description: co.text.slice(0, 1500) }, problem_ko: problem, facts, case_fact_id: c.id, premises: Object.entries(co.premisesRaw ?? {}).map(([k, v]) => `${k}:${v}`), evidence: c.quote_orig ? [{ quote: c.quote_orig }] : [] })
  let errs = [], lastBad = null
  for (let a = 0; a < 3; a++) {
    try {
      const j = jparse(await call('card-gen', M.gen, SYSTEM_V2, user + (errs.length ? `\n\n[이전 시도의 오류 — 고쳐서 다시]\n${errs.join('\n')}` : '')))
      j.version = CARD_VERSION; j.internal = { ...(j.internal ?? {}), evidence: j.internal?.evidence ?? [], case_fact_ids: [c.id] }
      const v = validateCardV2(j, facts)
      if (v.ok) return { card: j, facts, tries: a + 1 }
      errs = v.errors; lastBad = j
    } catch (e) { if (e instanceof StopRun || /중단/.test(e.message)) throw e; errs = [String(e.message).slice(0, 120)] }
  }
  return { card: null, facts, tries: 3, errors: errs, lastBad }
}

// ── ⑤-d 이중 판정: 생성과 다른 모델이 "이 회사 상황에 맞는가"를 O/X 로(+제목·근거·단계 정합) ──
const VERIFY_SYSTEM = `너는 카드 검수자다. <data> 의 회사 소개와 카드를 보고 두 가지만 판정한다.
fit: 이 카드가 이 회사의 지금 상황에 맞는가(O/X). 같은 처지(고객·단계·문제)에서 해낸 사례가 맞게 이어지면 O.
coherent: 해결 방향·사례·단계·왜 통하는가가 서로 모순 없이 이어지는가(O/X), 사례에 없는 사실을 사례가 한 것처럼 쓰지 않았는가.
출력 JSON 하나: {"fit":"O|X","coherent":"O|X","why":"한 줄"}`
async function verify(co, card) {
  try { const j = jparse(await call('verify', M.verify, VERIFY_SYSTEM, `<data>\n${JSON.stringify({ company: { name: co.name, text: co.text.slice(0, 1500) }, card })}\n</data>`)); return { fit: j.fit === 'O' ? 'O' : 'X', coherent: j.coherent === 'O' ? 'O' : 'X', why: String(j.why ?? '').slice(0, 200) } }
  catch (e) { if (e instanceof StopRun || /중단/.test(e.message)) throw e; return { fit: 'X', coherent: 'X', why: '판정 실패: ' + String(e.message).slice(0, 80) } }
}

// ── ⑥ 결론서 슬롯 매핑(플래그 OFF 기본) ──
export function toConclusionSlots(card) {
  if (!card) return null
  const c = card.cautions?.[0]
  return { title: card.direction, why: [card.situation?.text, card.why].filter(Boolean).join(' '), evidence_case: `${card.case.who} — ${card.case.did} → ${card.case.result}`, steps: (card.steps ?? []).map((s) => `${s.title}: ${s.how}`), adapted: card.fit, closing_line: card.after, caution: c ? `${c.closed_place} — ${c.cause}. ${c.reaches_us}. ${c.avoid}` : null }
}

// 공개 홈페이지 글(소개문) 가져오기 — 공개 URL 만. 태그·스크립트를 걷어 내고 반복 줄을 줄여 6,000자까지.
async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (solution-pipeline research; public pages only)' }, redirect: 'follow' })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const html = await r.text()
  const NL = String.fromCharCode(10)
  const txt = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, NL).replace(/&nbsp;|&amp;|&#\d+;/g, ' ')
  const seen = new Set(), out = []
  for (const l of txt.split(NL).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length > 25)) if (!seen.has(l)) { seen.add(l); out.push(l) }
  return out.join(NL).slice(0, 6000)
}

async function main() {
  const companies = JSON.parse(fs.readFileSync(compF, 'utf8'))
  const sb = await createClient(); if (!sb) throw new Error('DB 연결 실패')
  const pool = await loadPool(sb); log(`사례 풀 ${pool.length}행 · 신호 라벨 있는 행 ${pool.filter((x) => x.signals.length).length}`)
  const results = [], firstThree = []
  for (const co of companies) {
    const r = { id: co.id, name: co.name, group: co.group, status: 'ok', cards: [], note: '' }
    try {
      if (!co.text && co.url) { try { co.text = await fetchText(co.url) } catch (e) { co.text = ''; r.note = '가져오기 실패: ' + e.message } }
      if (!co.text || co.text.length < 80) { r.status = '카드 없음'; r.note = (r.note ? r.note + ' · ' : '') + '입력(회사 소개문) 없음/너무 짧음'; results.push(r); continue }
      const lab = await labelCompany(co); r.label = { domain: lab.domain, customer: lab.customer, stage: lab.stage, signals: lab.signals.map((s) => s.code), premises: lab.premisesRaw, droppedNoEvidence: lab.droppedNoEvidence?.length ?? 0 }
      if (!lab.signals.length) { r.status = '카드 없음'; r.note = '근거 있는 신호가 없음(R-E)'; results.push(r); continue }
      const m = matchCompany(lab, pool); r.match = { precedents: m.precedents, blank: m.blank, why: m.why }
      if (m.blank) { r.status = '카드 없음'; r.note = m.why; results.push(r); continue }
      const problem = lab.signals.map((s) => s.evidence).join(' / ')
      const cands = [...m.try, ...m.caution]
      for (const cand of cands) {
        const g = await makeCard({ ...co, premisesRaw: lab.premisesRaw }, problem, cand)
        if (!g.card) { r.cards.push({ cand, card: null, gen: g, note: '생성 실패/검증 불통과: ' + (g.errors ?? []).join('; ') }); continue }
        const v = await verify(co, g.card)
        r.cards.push({ cand, card: g.card, gen: { tries: g.tries }, verify: v, auto: v.fit === 'O' && v.coherent === 'O' ? '자동통과후보' : '검수필요', slots: toConclusionSlots(g.card) })
      }
      if (!r.cards.some((x) => x.card)) { r.status = '카드 없음'; r.note = '생성된 카드가 검증을 통과하지 못함' }
    } catch (e) { r.status = /중단/.test(e.message) || e instanceof StopRun ? '중단' : '실패'; r.note = String(e.message).slice(0, 160); if (r.status === '중단') { results.push(r); break } }
    results.push(r)
    if (firstThree.length < 3 && r.cards.length) { firstThree.push(r.id); if (firstThree.length === 3) log(`첫 3곳 실측: B 사용 ${bUsed.toFixed(3)} → 회사당 ${(bUsed / 3).toFixed(3)} · 전체 ${companies.length}곳 예상 ${(bUsed / 3 * companies.length).toFixed(2)} (한도 ${B_CAP})`) }
  }
  // 12곳 규칙(같은 카드 ≤2회 등) — 카드가 있는 곳만
  const pf = applyPortfolioRules(results.filter((r) => r.cards.some((x) => x.card)).map((r) => ({ company: r.id, cards: r.cards.filter((x) => x.card).map((x) => x.cand) })))
  fs.writeFileSync(path.join(OUT, 'portfolio-dropped.json'), JSON.stringify(pf.map((p) => ({ company: p.company, dropped: p.dropped })).filter((p) => p.dropped.length), null, 1))
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ model: M, bUsed, aUsed: A_USED, results }, null, 1))
  // ⑧ 검수용 시트 — 갈린 카드 맨 위
  const rows = results.flatMap((r) => r.cards.filter((x) => x.card).map((x) => ({ r, x })))
  rows.sort((a, b) => (a.x.auto === '검수필요' ? 0 : 1) - (b.x.auto === '검수필요' ? 0 : 1))
  const md = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
  const L = ['# 솔루션 카드 검수 시트 (O/X 만 누르면 됨)', '', `카드 ${rows.length}장 · 자동통과후보 ${rows.filter((z) => z.x.auto === '자동통과후보').length} · 검수필요 ${rows.filter((z) => z.x.auto === '검수필요').length} (갈린 카드가 맨 위) · 카드 없는 곳 ${results.filter((r) => r.status !== 'ok').length}`, '', '| # | 회사 | 카드 제목(②) | ①상황 | ③사례 | ④단계 | ⑤⑥⑦ | 자동 판정 | 갈린 이유 | 남헌 O/X |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
  rows.forEach(({ r, x }, i) => { const c = x.card; L.push(`| ${i + 1} | ${md(r.name)} | ${md(c.direction)} | ${md(c.situation?.text)} | ${md(`${c.case.who}: ${c.case.did} → ${c.case.result}`)} | ${md((c.steps ?? []).map((s) => s.title).join(' → '))} | ${md(`왜: ${c.why} / 맞게: ${c.fit} / 후: ${c.after}`)} | ${x.auto} (fit ${x.verify.fit}, 정합 ${x.verify.coherent}) | ${x.auto === '검수필요' ? md(x.verify.why) : ''} | ☐O ☐X |`) })
  L.push('', '## 카드 없음', ...results.filter((r) => r.status !== 'ok').map((r) => `- ${r.name} (${r.group}) — ${r.status}: ${r.note}`))
  fs.writeFileSync(path.join(OUT, 'review-sheet.md'), L.join('\n') + '\n')
  log(`끝 — 회사 ${results.length} · 카드 ${rows.length} · B 사용 ${bUsed.toFixed(3)}/${B_CAP} · 합계 ${spendTotal().toFixed(2)}/${TOTAL_CAP} · stop=${stopped}`)
}
if (!process.env.SOLUTION_PIPELINE_NO_MAIN) await main()
