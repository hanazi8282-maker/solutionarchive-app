#!/usr/bin/env node
// 솔루션 자동화 파이프라인(v71eg-3): 회사 원장 → 매칭 v0.3 → 카드 v2 생성 → 이중 검증(전수) → 검수 시트 행 → 결론서 슬롯 매핑(플래그 SOLUTION_CARD_SLOTS, 기본 OFF).
//   node --env-file=.env.local scripts/solution-pipeline.mjs --company <slug|json|urls> [--dry-run] [--out 폴더] [--limit-usd 60] [--a-used 라벨링사용액]
//     --company real12 | <실제12곳 slug>   기존 원장(결론서 세션) — cc_input_early_12cos_20261121.json + reports/2026-11-25/solution-pipeline/ref-ledger-real12.json
//     --company <파일.json>               원장 JSON(Ledger 배열 또는 객체, lib/solution-card/ledger.ts 형식)
//     --company https://a,https://b       주소만 → 사실 원장 자동 생성(수집→추출). 접속이 막히면(403 등) 우회하지 않고 그 칸을 "접속 불가"로 기록.
//   --dry-run: 모델·DB 쓰기 없이 입력 해석·원장 검증·예상 비용만 출력.
// 쓰기: 파일만. DB 는 읽기만(ss_episode_tags_current·ss_story_labels_current·case_signal_labels_v06). 개인정보(이메일 등)는 모델·외부로 보내지 않는다(facts 에는 공개 화면 글만).
// 비용: B 한도(기본 $60, 하드 스톱) + A(라벨링) 사용액을 --a-used 로 받아 합계 $90 의 80%($72) 경고·100% 중단. 구독 경로라 비용은 명목.
// 모델: 추출 = Sonnet · 카드 생성 = Sonnet · 이중 판정 = Haiku(생성과 다른 모델) · 사실·숫자 검사는 코드.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { runCli, StopRun } from '../lib/story-label/cli.mjs'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'
import { matchCompany, applyPortfolioRules } from '../lib/solution-card/match-v03.ts'
import { validateCardV2, CARD_VERSION } from '../lib/solution-card/card-v2.ts'
import { SYSTEM_V2, buildUserV2 } from '../lib/solution-card/prompt-v2.ts'
import { ledgerToLabel, ledgerFromCcInput, validateLedger, normPremise } from '../lib/solution-card/ledger.ts'
import { applyCardSlots, cardToSolutionBox, lintDraft, slotsEnabled, FLAG_NAME } from '../lib/solution-card/slots.ts'

const args = process.argv.slice(2)
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
export const CLI = { company: opt('company'), dry: args.includes('--dry-run'), out: opt('out', 'reports/solution-pipeline'), bCap: Number(opt('limit-usd', '60')), aUsed: Number(opt('a-used', '0')) }
const TOTAL_CAP = 90
const CC_INPUT = process.env.CC_INPUT ?? 'C:/Users/DCU/Desktop/결론서자동화/cc-inbox/cc_input_early_12cos_20261121.json'
const REF_LEDGER = process.env.REF_LEDGER ?? 'reports/2026-11-25/solution-pipeline/ref-ledger-real12.json'
for (const k of Object.keys(process.env)) if (k === 'ANTHROPIC_API_KEY' || /^CLAUDE_CODE/.test(k) || /^CLAUDECODE/.test(k) || k === 'CLAUDE_PID') delete process.env[k]
process.env.PATH = 'C:/Users/DCU/.local/bin;' + process.env.PATH
export const M = { extract: 'claude-sonnet-5-5', gen: 'claude-sonnet-5-5', verify: 'claude-haiku-5-5', judge: 'claude-haiku-5-5' }
let OUT = CLI.out
const log = (s) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(l); try { fs.mkdirSync(OUT, { recursive: true }); fs.appendFileSync(path.join(OUT, 'pipeline.log'), l + '\n') } catch {} }

// ── 비용 장부(하드 스톱) ──
export const cost = { b: 0, warned: false, stopped: null }
const total = () => CLI.aUsed + cost.b
export async function call(stage, model, system, user, effort = 'low') {
  if (cost.stopped) throw new Error('중단: ' + cost.stopped)
  if (cost.b >= CLI.bCap || total() >= TOTAL_CAP) { cost.stopped = `비용 한도(B ${cost.b.toFixed(2)}/${CLI.bCap}, 합계 ${total().toFixed(2)}/${TOTAL_CAP})`; throw new Error('중단: ' + cost.stopped) }
  if (!cost.warned && total() >= TOTAL_CAP * 0.8) { cost.warned = true; log(`⚠ 합계 ${total().toFixed(2)} = 한도 ${TOTAL_CAP} 의 80% 도달`) }
  const r = await runCli({ system: `${UNTRUSTED_INPUT_NOTICE}\n${system}`, user, model, effort })
  cost.b += r.costUsd ?? 0
  try { fs.mkdirSync(OUT, { recursive: true }); fs.appendFileSync(path.join(OUT, 'ledger.jsonl'), JSON.stringify({ at: new Date().toISOString(), stage, model, usd: r.costUsd, bUsed: +cost.b.toFixed(4), total: +total().toFixed(4) }) + '\n') } catch {}
  return r.text
}
export const jparse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) throw new Error('JSON 없음'); return JSON.parse(m[0]) }
const isStop = (e) => e instanceof StopRun || /중단/.test(String(e?.message))

// ── 2-5a 수집: 공개 주소에서 사실을 읽는다. 막히면(403·429·캡차) 우회하지 않고 "접속 불가" 사실로 남긴다. ──
const NL = String.fromCharCode(10)
export async function collectFacts(urls, { maxPerUrl = 22, startId = 1 } = {}) {
  const facts = []; let n = startId; const today = new Date().toISOString().slice(0, 10)
  for (const url of urls) {
    let status = 0, html = ''
    try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000); const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (solution-pipeline research; public pages only)', 'accept-language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: ctl.signal }); clearTimeout(t); status = r.status; html = r.ok ? await r.text() : '' } catch (e) { status = -1; html = '' }
    const captcha = /captcha|unusual traffic|\/sorry\/|access denied/i.test(html.slice(0, 4000))
    if (status !== 200 || captcha || html.length < 500) { facts.push({ id: `C${n++}`, text: `접속 불가: ${captcha ? '캡차·차단 화면' : status === -1 ? '연결 실패' : 'HTTP ' + status}`, url, seen_at: today, blocked: true }); continue }
    const seen = new Set(); let k = 0
    const push = (l) => { l = String(l).replace(/\s+/g, ' ').trim(); if (l.length < 12 || l.length > 400 || seen.has(l)) return false; seen.add(l); facts.push({ id: `C${n++}`, text: l, url, seen_at: today }); return ++k >= maxPerUrl }
    // 1) 메타·JSON-LD 먼저(스토어 페이지는 소개·평점·다운로드 수를 여기에 담는다)
    const meta = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:description|og:title|twitter:description)["'][^>]*content=["']([^"']+)["']/gi)].map((m) => m[1]).concat([...html.matchAll(/<title[^>]*>([^<]+)<\/title>/gi)].map((m) => m[1]))
    for (const m of meta) if (push(m.replace(/&amp;|&quot;|&#39;/g, ' '))) break
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { const walk = (o, p = '') => { if (Array.isArray(o)) o.forEach((x) => walk(x, p)); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) { if (v && typeof v === 'object') walk(v, kk); else if (['name', 'description', 'ratingValue', 'ratingCount', 'reviewCount', 'price', 'offers', 'datePublished', 'dateModified', 'softwareVersion', 'operatingSystem', 'applicationCategory', 'numDownloads'].includes(kk)) push(`${p ? p + '.' : ''}${kk}: ${v}`.padEnd(12, ' ')) } }; walk(JSON.parse(m[1])) } catch {}
    }
    // 2) 본문 줄 — 숨김 텍스트·UI 토큰·주석 찌꺼기는 사실이 아니므로 거른다
    const txt = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, NL).replace(/&nbsp;|&amp;|&#\d+;|&quot;/g, ' ')
    const junk = /^(arrow_|google_logo|menu$|close$|more_vert|expand_|keyboard_|search$)|-->|^\s*(Play|Games|Apps|Movies|Books|Kids)\s*$|로그인|Sign in|쿠키|cookie/i
    for (const l of txt.split(NL).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length > 14 && x.length < 400 && /[가-힣A-Za-z]{4,}/.test(x) && !junk.test(x))) { if (push(l)) break }
  }
  return facts
}

// ── 2-5b 추출: facts → 원장(사전 v0.6, R-D·R-E, P2 기준 v2). 근거는 인용한 fact 문장이어야 하고 없으면 신호를 붙이지 않는다. ──
const SIGDICT = fs.existsSync('config/signal-dict-v06.json') ? JSON.parse(fs.readFileSync('config/signal-dict-v06.json', 'utf8')) : {}
const EXTRACT_SYSTEM = `너는 회사 한 곳의 공개 화면 사실 목록(facts)을 읽고 "사실 원장"을 만든다. <data> 의 facts 만 근거로 쓴다. 숫자·날짜·이름을 만들어 내지 않는다. 확인 못 하면 모름.
[상황 신호 사전 v0.6]
${Object.entries(SIGDICT).map(([k, v]) => `${k} ${v}`).join(NL)}
규칙: R-D 신호의 근거는 그 신호의 상황을 직접 설명하는 fact 여야 한다(다른 신호의 결과·걸림돌을 빌리지 않음). R-E 근거 fact 가 없거나 상황을 설명 못 하면 그 신호는 붙이지 않는다. "접속 불가" fact 는 근거로 쓰지 않는다.
P2 기준 v2(전제 P2 = 쓰는 사용자가 있다, 무료·유료 무관): 확정(외부인 흔적 2건 또는 날짜 있는 공개 수치) / 추정(운영자 글·광고문구 흔적만) / 미충족 / 모름(1년 넘은 흔적·날짜 못 읽음). 1년 안 흔적=최근 활동. P1=돈 낸 기존 고객이 있다, P5=가격이 공개돼 있다, P6=쓰는 사람 수가 의미 있게 보인다, P9=결과가 한 달 안에 보인다, P10=써 볼 수 있는 제품이 공개돼 있다.
단계는 E0(출시 전/직후)·E1(첫 고객을 찾는 단계)·E2(첫 매출 이후)·E3(성장) 중 공개 화면 신호로 본 "추정"이다.
출력 JSON 하나: {"name":"","field":"한 단어 분야","stage":"E1","complaint":"한줄불편: 화면에서 읽히는 이 회사의 막힌 지점을 한 문장(숫자는 facts 에 있는 것만)","evidence":"근거: C번호를 넣은 문장","chapters":[5],"signals":[{"code":"S05","fact_ids":["C8","C9"]}],"premises_not_in_dict":"","fix_first":"화면끼리 어긋난 점(있으면)","premises":{"P1":"모름","P2":"추정","P5":"확정","P6":"미충족","P9":"모름","P10":"확정"}}`
export async function extractLedger(slug, name, facts) {
  const usable = facts.filter((f) => !f.blocked)
  const base = { slug, name, field: '', stage: 'E1', customer: 'smb', complaint: '', evidence: '', chapters: [], signals: [], premises: {}, premises_not_in_dict: '', fix_first: '', facts, source: 'auto' }
  if (usable.length < 3) return { ...base, note: '사용 가능한 사실 3건 미만(접속 불가 등)' }
  let last
  for (let a = 0; a < 3; a++) {
    try {
      const j = jparse(await call('ledger-extract', M.extract, EXTRACT_SYSTEM, `<data>${NL}${JSON.stringify({ name, facts: usable.map((f) => ({ id: f.id, text: f.text })) })}${NL}</data>`))
      const byId = new Map(usable.map((f) => [f.id, f.text]))
      const signals = [], dropped = []
      for (const s of j.signals ?? []) { const ids = (s.fact_ids ?? []).filter((id) => byId.has(id)); if (/^S\d{2}$/.test(s.code ?? '') && SIGDICT[s.code] && ids.length) signals.push({ code: s.code, fact_ids: ids, evidence: ids.map((id) => byId.get(id)).join(' ') }); else dropped.push(s) }
      return { ...base, name: j.name || name, field: j.field ?? '', stage: /^E[0-3]$/.test(j.stage) ? j.stage : 'E1', complaint: String(j.complaint ?? ''), evidence: String(j.evidence ?? ''), chapters: j.chapters ?? [], signals, premises: Object.fromEntries(Object.entries(j.premises ?? {}).map(([k, v]) => [k, normPremise(v)])), premisesRaw: j.premises ?? {}, premises_not_in_dict: String(j.premises_not_in_dict ?? ''), fix_first: String(j.fix_first ?? ''), droppedSignals: dropped.length }
    } catch (e) { last = e; if (isStop(e)) throw e }
  }
  throw last
}

// ── 사례 풀(읽기 전용) ──
export async function loadPool(sb) {
  const rd = async (table, cols) => { const out = []; for (let f = 0; ; f += 1000) { const { data, error } = await sb.from(table).select(cols).order('id').range(f, f + 999); if (error) throw new Error(`${table}: ${error.message}`); out.push(...data); if (data.length < 1000) break } return out }
  const eps = await rd('ss_episode_tags_current', 'id, slug, chapter, adversity_ko, action_ko, result_ko, result_class, result_grain, evidence_strength, quote_orig, condition_ko')
  const labels = {}; for (const r of await rd('ss_story_labels_current', 'id, slug, domain, customer, stage')) labels[r.slug] = r
  const sig = {}; try { for (const r of await rd('case_signal_labels_v06', 'id, story_slug, episode_id, signal_code')) (sig[r.episode_id] ??= []).push(r.signal_code) } catch (e) { log('case_signal_labels_v06 읽기 실패 → 낱말 규칙으로 대체: ' + e.message) }
  return eps.map((e) => ({ id: e.id, slug: e.slug, chapter: e.chapter, domain: labels[e.slug]?.domain ?? null, customer: labels[e.slug]?.customer ?? null, stage: labels[e.slug]?.stage ?? null, adversity_ko: e.adversity_ko ?? '', action_ko: e.action_ko ?? '', result_ko: e.result_ko ?? '', result_class: e.result_class, result_grain: e.result_grain, evidence_strength: e.evidence_strength, quote_orig: e.quote_orig, signals: sig[e.id] ?? [], condition_ko: e.condition_ko ?? '' }))
}

// ── 카드 생성(+형식·숫자 검사 재시도 ≤2) ──
export async function makeCard(led, problem, cand) {
  const c = cand.case, facts = { problem: c.adversity_ko, action: c.action_ko, result: c.result_ko, conditions: c.condition_ko ?? '' }
  const user = buildUserV2({ company: { name: led.name, description: [led.complaint, led.evidence, led.fix_first].filter(Boolean).join(' ').slice(0, 1500) }, problem_ko: problem, facts, case_fact_id: c.id, premises: Object.entries(led.premises ?? {}).map(([k, v]) => `${k}:${v}`), evidence: c.quote_orig ? [{ quote: c.quote_orig }] : [] })
  let errs = [], lastBad = null
  for (let a = 0; a < 3; a++) {
    try {
      const j = jparse(await call('card-gen', M.gen, SYSTEM_V2, user + (errs.length ? `${NL}${NL}[이전 시도의 오류 — 고쳐서 다시]${NL}${errs.join(NL)}` : '')))
      j.version = CARD_VERSION; j.internal = { ...(j.internal ?? {}), evidence: j.internal?.evidence ?? [], case_fact_ids: [c.id] }
      const v = validateCardV2(j, facts)
      if (v.ok) return { card: j, facts, tries: a + 1 }
      errs = v.errors; lastBad = j
    } catch (e) { if (isStop(e)) throw e; errs = [String(e.message).slice(0, 120)] }
  }
  return { card: null, facts, tries: 3, errors: errs, lastBad }
}

// ── 이중 판정: 생성과 다른 모델이 "이 회사 상황에 맞는가"를 O/X 로(+제목·근거·단계 정합) ──
const VERIFY_SYSTEM = `너는 카드 검수자다. <data> 의 회사 원장과 카드를 보고 두 가지만 판정한다.
fit: 이 카드가 이 회사의 지금 상황에 맞는가(O/X). 같은 처지(고객·단계·문제)에서 해낸 사례가 맞게 이어지면 O.
coherent: 해결 방향·사례·단계·왜 통하는가가 서로 모순 없이 이어지는가(O/X), 사례에 없는 사실을 사례가 한 것처럼 쓰지 않았는가.
출력 JSON 하나: {"fit":"O|X","coherent":"O|X","why":"한 줄"}`
export async function verify(led, card) {
  try { const j = jparse(await call('verify', M.verify, VERIFY_SYSTEM, `<data>${NL}${JSON.stringify({ company: { name: led.name, complaint: led.complaint, evidence: led.evidence, fix_first: led.fix_first }, card })}${NL}</data>`)); return { fit: j.fit === 'O' ? 'O' : 'X', coherent: j.coherent === 'O' ? 'O' : 'X', why: String(j.why ?? '').slice(0, 200) } }
  catch (e) { if (isStop(e)) throw e; return { fit: 'X', coherent: 'X', why: '판정 실패: ' + String(e.message).slice(0, 80) } }
}

// ── 입력 해석(2-1·2-2) ──
export async function resolveLedgers(spec) {
  const out = []
  const real = () => JSON.parse(fs.readFileSync(CC_INPUT, 'utf8')).companies
  const ref = () => JSON.parse(fs.readFileSync(REF_LEDGER, 'utf8')).companies
  if (/^https?:\/\//.test(spec)) {
    const urls = spec.split(',').map((s) => s.trim()).filter(Boolean)
    const u0 = new URL(urls[0]), store = /apps\.apple\.com|play\.google\.com/.test(u0.hostname)
    const host = store ? (u0.searchParams.get('id') ?? u0.pathname.split('/').filter(Boolean).pop() ?? 'app') : u0.hostname.replace(/^www\./, '').split('.')[0]
    out.push({ slug: `auto-${host}`.replace(/[^\w-]/g, '-'), name: host, urls })
    return out
  }
  if (/\.json$/i.test(spec)) { const j = JSON.parse(fs.readFileSync(spec, 'utf8')); for (const l of Array.isArray(j) ? j : j.companies ? Object.values(j.companies) : [j]) out.push({ ledger: { source: 'json', customer: 'smb', field: '', stage: 'E1', complaint: '', evidence: '', chapters: [], signals: [], premises: {}, premises_not_in_dict: '', fix_first: '', ...l } }); return out }
  const all = real(), refs = ref(), pick = spec === 'real12' || spec === 'all12' ? all : all.filter((c) => c.slug === spec)
  if (!pick.length) throw new Error(`알 수 없는 --company: ${spec} (real12 · 실제 12곳 slug · .json · 주소)`)
  for (const c of pick) out.push({ ledger: ledgerFromCcInput(c, refs[c.slug]) })
  return out
}

// ── 회사 한 곳 끝까지 ──
export async function runCompany(item, pool) {
  const r = { id: '', name: '', status: 'ok', note: '', cards: [], steps: {} }
  try {
    let led = item.ledger
    if (!led) { // 주소만 → 원장 자동 생성
      const facts = await collectFacts(item.urls); r.steps.collect = `${facts.filter((f) => !f.blocked).length}건 · 접속 불가 ${facts.filter((f) => f.blocked).length}곳`
      led = await extractLedger(item.slug, item.name, facts); r.steps.extract = `신호 ${led.signals.length}개`
      fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `ledger-${led.slug}.json`), JSON.stringify(led, null, 1))
    }
    r.id = led.slug; r.name = led.name; r.ledger = { source: led.source, complaint: led.complaint, signals: led.signals.map((s) => s.code), premises: led.premises }
    const errs = validateLedger(led); if (errs.length) { r.status = '카드 없음'; r.note = '원장 검증 실패: ' + errs.slice(0, 3).join('; '); return r }
    if (!led.signals.length) { r.status = '카드 없음'; r.note = '근거 있는 상황 신호가 없음(R-E)'; return r }
    const lab = ledgerToLabel(led)
    const m = matchCompany(lab, pool); r.match = { precedents: m.precedents, blank: m.blank, why: m.why }
    if (m.blank) { r.status = '카드 없음'; r.note = m.why; return r }
    const problem = led.complaint || lab.signals.map((s) => s.evidence).join(' / ')
    for (const cand of [...m.try, ...m.caution]) {
      const g = await makeCard(led, problem, cand)
      if (!g.card) { r.cards.push({ cand, card: null, note: '생성 실패/검증 불통과: ' + (g.errors ?? []).join('; '), lastBad: g.lastBad }); continue }
      const v = await verify(led, g.card)
      r.cards.push({ cand, card: g.card, tries: g.tries, verify: v, auto: v.fit === 'O' && v.coherent === 'O' ? '자동통과후보' : '검수필요', box: cardToSolutionBox(g.card) })
    }
    if (!r.cards.some((x) => x.card)) { r.status = '카드 없음'; r.note = '생성된 카드가 검증을 통과하지 못함' }
  } catch (e) { r.status = isStop(e) ? '중단' : '실패'; r.note = String(e.message).slice(0, 160) }
  return r
}

// ── 검수 시트(2-6): 갈린 카드 맨 위 · O/X 열 + "바로 쓰겠다 / 읽고 끝 / 틀렸다" 3단 열 ──
export function reviewSheet(results) {
  const rows = results.flatMap((r) => r.cards.filter((x) => x.card).map((x) => ({ r, x })))
  rows.sort((a, b) => (a.x.auto === '검수필요' ? 0 : 1) - (b.x.auto === '검수필요' ? 0 : 1))
  const md = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
  const L = ['# 솔루션 카드 검수 시트', '', `카드 ${rows.length}장 · 자동통과후보 ${rows.filter((z) => z.x.auto === '자동통과후보').length} · 검수필요 ${rows.filter((z) => z.x.auto === '검수필요').length}(갈린 카드가 맨 위) · 카드 없는 곳 ${results.filter((r) => !r.cards.some((x) => x.card)).length}`, '', '| # | 회사 | 카드 제목(②) | 7칸 요약 | 자동 판정 | 갈린 이유 | O/X | 바로 쓰겠다 / 읽고 끝 / 틀렸다 |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
  rows.forEach(({ r, x }, i) => { const c = x.card; L.push(`| ${i + 1} | ${md(r.name)} | ${md(c.direction)} | ${md(`①${c.situation?.text} ③${c.case.who}: ${c.case.did} → ${c.case.result} ④${(c.steps ?? []).map((s) => s.title).join(' → ')} ⑤${c.why} ⑥${c.fit} ⑦${c.after}`)} | ${x.auto} (fit ${x.verify.fit}, 정합 ${x.verify.coherent}) | ${x.auto === '검수필요' ? md(x.verify.why) : ''} | ☐O ☐X | ☐바로 쓰겠다 ☐읽고 끝 ☐틀렸다 |`) })
  L.push('', '## 카드 없음', ...results.filter((r) => !r.cards.some((x) => x.card)).map((r) => `- ${r.name || r.id} — ${r.status}: ${r.note}`))
  return L.join('\n') + '\n'
}

// ── 결론서 초안(임시 환경) OFF/ON 렌더 + 대체 검사(2-3·2-4) ──
export function conclusionDrafts(results) {
  return results.filter((r) => r.id).map((r) => {
    const cards = r.cards.filter((x) => x.card).map((x) => x.card)
    const off = { company: r.name, chapter2: { solution_box: null, extras: [] }, chapter3_cases: [] }
    const on = applyCardSlots(off, cards, true)   // ON 시험은 enabled=true 로 직접 호출(환경 플래그는 켜지 않는다)
    const gate = applyCardSlots(off, cards)       // 실제 플래그 값 그대로(기본 OFF → 원본)
    return { id: r.id, name: r.name, flagNow: slotsEnabled(), off: off.chapter2, on: on.draft.chapter2, onReason: on.reason, trimmed: on.trimmed, gateAppliedNow: gate.applied, lintOn: lintDraft(on.draft), lintOff: lintDraft(off) }
  })
}

async function main() {
  if (!CLI.company) { console.error(`사용법: --company <real12|slug|파일.json|주소[,주소]> [--dry-run] [--out 폴더] [--limit-usd 60] [--a-used N]   (플래그 ${FLAG_NAME} 기본 OFF)`); process.exit(64) }
  const items = await resolveLedgers(CLI.company)
  if (CLI.dry) {
    const rows = items.map((it) => it.ledger ? { id: it.ledger.slug, name: it.ledger.name, source: it.ledger.source, facts: it.ledger.facts?.length ?? 0, signals: (it.ledger.signals ?? []).length, ledgerErrors: validateLedger(it.ledger) } : { id: it.slug, name: it.name, source: 'auto(주소)', urls: it.urls.length })
    console.log(JSON.stringify({ dryRun: true, companies: rows, 예상비용USD: +(items.length * 0.3).toFixed(2), 플래그: { [FLAG_NAME]: slotsEnabled() ? 'ON' : 'OFF' }, 모델호출: 0, DB쓰기: 0 }, null, 1)); return
  }
  const sb = await createClient(); if (!sb) throw new Error('DB 연결 실패')
  const pool = await loadPool(sb); log(`사례 풀 ${pool.length}행 · 신호 라벨 있는 행 ${pool.filter((x) => x.signals.length).length} · 회사 ${items.length}곳`)
  const results = []
  for (const it of items) { const r = await runCompany(it, pool); results.push(r); log(`${r.id || it.slug} ${r.status} 카드 ${r.cards.filter((x) => x.card).length}${r.note ? ' — ' + r.note : ''} · B ${cost.b.toFixed(3)}`); if (r.status === '중단') break }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ model: M, bUsed: cost.b, aUsed: CLI.aUsed, flag: slotsEnabled(), results }, null, 1))
  fs.writeFileSync(path.join(OUT, 'review-sheet.md'), reviewSheet(results))
  fs.writeFileSync(path.join(OUT, 'conclusion-drafts.json'), JSON.stringify(conclusionDrafts(results), null, 1))
  const pf = applyPortfolioRules(results.filter((r) => r.cards.some((x) => x.card)).map((r) => ({ company: r.id, cards: r.cards.filter((x) => x.card).map((x) => x.cand) })))
  fs.writeFileSync(path.join(OUT, 'portfolio-dropped.json'), JSON.stringify(pf.map((p) => ({ company: p.company, dropped: p.dropped })).filter((p) => p.dropped.length), null, 1))
  log(`끝 — 회사 ${results.length} · 카드 ${results.reduce((s, r) => s + r.cards.filter((x) => x.card).length, 0)} · B 사용 ${cost.b.toFixed(3)}/${CLI.bCap} · 합계 ${total().toFixed(2)}/${TOTAL_CAP} · stop=${cost.stopped}`)
}
if (!process.env.SOLUTION_PIPELINE_NO_MAIN) await main()
