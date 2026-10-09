#!/usr/bin/env node
// T2 정보 판정 소급 — review_relevance_verdicts.product_informative 가 NULL 인 행에 그 한 컬럼만 채운다.
//
// 왜 NULL 인가: product_informative 컬럼은 마이그 20260930000031(2026-09-28 적용, "채워진 행 0 · 백필 없음")로 생겼다.
//   그 전에 판정된 행은 NULL 이고, 야간 1차 판정(relevance-judge-auto.mjs)은 이미 판정 행이 있는 input_id 를 다시 안 탄다
//   (lib/analysis/relevance-pending.ts 판정 캐시 제외). 그래서 그 행들은 영영 안 채워진다. 같은 이유로 라벨도
//   relevance-labels-backfill.mjs 로 소급했다 — 이 스크립트는 그 정보 판정판이다.
//   그 밖의 NULL: 컬럼이 생긴 뒤라도 호출·파싱 실패(전부 unknown)나 모델이 info=null("원문이 잘려 판단 불가")로 답한 행.
//
// 무엇을 하나
//   · 판정 프롬프트는 야간 1차와 **한 벌**이다 — judgeRelevanceBatch(lib/analysis/relevance-judge.ts) 를 그대로 부르고,
//     입력도 같다: 프로젝트 목적(reader_problem→pitch→purpose)·business_model·사람 채점 few-shot(최대 10)·원문 앞 1,500자·20건 묶음.
//     기준 문구 = lib/analysis/relevance-criteria.ts PRODUCT_INFORMATIVE_CRITERIA(버전 RELEVANCE_CRITERIA_VERSION).
//   · **product_informative 한 컬럼만** UPDATE 한다. 조건에 "지금도 NULL" 을 다시 건다 — 그사이 누가 채웠으면 덮지 않는다.
//     verdict·reason·라벨·model·judged_at·second_*·human_* 는 payload 에 없다. 새 판정의 verdict 가 저장값과 달라도 안 바꾼다(건수만 센다).
//   · 모델이 info=null 로 답하면 쓰지 않는다(NULL → NULL). true/false 만 쓴다.
//   · 롤백 파일: UPDATE **직전**에 한 줄씩 덧붙인다(중간에 죽어도 파일이 남는다). 각 줄은
//     "그 input_id 이고 값이 이번에 쓴 값일 때만 NULL 로" — 저장 실패한 줄·나중에 사람이 바꾼 값은 건드리지 않는다.
//
// 모드
//   (기본) --dry      대상 수(소스별)·호출 수·토큰·비용·시간 추정만. LLM·DB 쓰기 없음(DB 읽기는 한다).
//   --run             실제 LLM 호출 + UPDATE. 대량 UPDATE 다 — 실행 여부는 CEO-STAFF/남헌이 정한다. 무인 루프에 걸지 않는다.
//   --replicate N     이미 채워진(true/false) 행 N건을 같은 방식으로 다시 판정해 일치율을 잰다. DB 쓰기 없음.
//                     true/false 반반(모자라면 반대쪽으로 채움) · 프롬프트 경계 사례 9건(INFORMATIVE_EXAMPLE_INPUT_IDS)은 뺀다(누설).
//   옵션: --source <source_key>(analysis_inputs.source_key, 예 youtube) · --limit N · --seed N(replicate 표본, 기본 42)
//
// 사용(실행은 CEO-STAFF):
//   node --env-file=.env.local scripts/relevance-informative-backfill.mjs --source youtube
//   LLM_PROVIDER=claude-cli CLAUDE_CLI_MODEL=claude-sonnet-5-5 node --env-file=.env.local scripts/relevance-informative-backfill.mjs --replicate 20
//   LLM_PROVIDER=claude-cli CLAUDE_CLI_MODEL=claude-sonnet-5-5 node --env-file=.env.local scripts/relevance-informative-backfill.mjs --run --source youtube --limit 100
//   ⚠️ 야간 1차와 같은 판정자로 돌려야 같은 판정이다 — nightly-relevance.yml 은 LLM_PROVIDER=claude-cli(리포 변수 RELEVANCE_LLM_PROVIDER 로 바뀔 수 있다)·
//      llm.ts CLAUDE_CLI_DEFAULT_MODEL=claude-sonnet-5-5. LLM_PROVIDER 를 안 주면 llm.ts 기본값 gemini 로 간다 — 다른 판정자다.
//   서비스키·OAuth 토큰은 환경변수로만 읽는다(lib/supabase/server.ts). 값을 출력하지 않는다.
//
// 종료코드: 0 정상(대상 0건·한도/캡 정지 포함 — 정지는 로그에 몇 건째인지 남긴다) · 2 설정/조회 실패 · 3 저장 실패 1건 이상

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BATCH_SIZE, MAX_EXAMPLES, MAX_REVIEW_CHARS, buildRelevancePrompt, chunkReviews, judgeRelevanceBatch, rng, shuffle } from '../lib/analysis/relevance-judge.ts'
import { INFORMATIVE_EXAMPLE_INPUT_IDS, RELEVANCE_CRITERIA_VERSION } from '../lib/analysis/relevance-criteria.ts'
import { USD_PER_MTOK_IN, USD_PER_MTOK_OUT, dailySpent, tokensOf, withLlmBudget } from '../lib/analysis/budget.ts'
import { cliSpent, requiredKeyFor, resolveProvider, spendForCap } from '../lib/analysis/llm.ts'
import { capUsdOf, loadGuardConfig } from '../lib/analysis/session-guard.ts'
import { createClient } from '../lib/supabase/server.ts'

// ── 추정 근거(코드·문서) ─────────────────────────────────────────
/** claude-cli(Sonnet 5.5) T2 실측 명목비 — run 37576816430 "T2 50건 $0.20"(config/session-guard.json _source · docs/session-limit-guard.md:73). 구독 경로라 청구액이 아니라 세션 한도 소모의 환산값이다. */
export const MEASURED_CLI_USD_PER_ITEM = 0.2 / 50
/** 1%p 세션 한도 ≈ $0.43(config/session-guard.json usd_per_session_pct). */
export const USD_PER_SESSION_PCT = 0.43
/** 출력 토큰/건 — 근거 없음(추정). 출력 한 줄 {"id","rel","info","why","impact","freq","signal","wtp"} ≈ 60~80토큰. 보수적으로 80. */
export const OUT_TOKENS_PER_ITEM = 80
/** few-shot 예시가 호출마다 더하는 글자 상한 = MAX_EXAMPLES × EXAMPLE_CHARS(relevance-judge.ts, 300자 — export 안 됨). */
export const EXAMPLE_CHARS_PER_CALL = MAX_EXAMPLES * 300
/** 호출 1회 시간 — 근거 없음(추정 60초). 상한은 llm.ts claude-cli 기본 timeout 180초. --replicate 실행이 실측값을 찍는다. */
export const ASSUMED_SEC_PER_CALL = 60
export const UPPER_SEC_PER_CALL = 180

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 롤백 한 줄. 값이 이번에 쓴 값일 때만 NULL 로 — 나중에 바뀐 값·저장 실패한 줄은 0행 갱신. */
export function rollbackLine(inputId, value) {
  if (!UUID.test(inputId)) throw new Error(`input_id 형식 아님: ${inputId}`)
  if (typeof value !== 'boolean') throw new Error(`true/false 만 롤백 줄을 만든다: ${value}`)
  return `update public.review_relevance_verdicts set product_informative = null where input_id = '${inputId}' and product_informative = ${value};`
}

/** 재현 표본 — true/false 반반, 모자라면 반대쪽에서 채운다. seed 가 같으면 같은 표본. */
export function pickReplicate(rows, n, seed = 42) {
  const random = rng(seed)
  const t = shuffle(rows.filter((r) => r.product_informative === true), random)
  const f = shuffle(rows.filter((r) => r.product_informative === false), random)
  const takeT = Math.min(Math.floor(n / 2), t.length)
  const takeF = Math.min(n - takeT, f.length)
  const picked = [...t.slice(0, takeT), ...f.slice(0, takeF)]
  if (picked.length < n) picked.push(...t.slice(takeT, takeT + n - picked.length))
  return picked
}

/** 저장값 vs 새 판정. rate = 새 판정이 true/false 로 나온 것 중 일치 비율, rateAll = 전체(null 은 불일치로 센다). */
export function agreement(pairs) {
  const s = { n: pairs.length, same: 0, tf: 0, ft: 0, toNull: 0 }
  for (const p of pairs) {
    if (p.fresh === null) s.toNull++
    else if (p.fresh === p.stored) s.same++
    else if (p.stored === true) s.tf++
    else s.ft++
  }
  const answered = s.n - s.toNull
  return { ...s, rate: answered > 0 ? s.same / answered : null, rateAll: s.n > 0 ? s.same / s.n : null }
}

/** 비용·시간 추정. batches = [{ chars: 프롬프트(system+user) 글자 수, items: 건수 }]. */
export function estimate(batches) {
  const items = batches.reduce((n, b) => n + b.items, 0)
  const calls = batches.length
  const inTok = batches.reduce((n, b) => n + tokensOf(b.chars + EXAMPLE_CHARS_PER_CALL), 0)
  const outTok = items * OUT_TOKENS_PER_ITEM
  const cliUsd = items * MEASURED_CLI_USD_PER_ITEM
  return {
    items, calls, inTok, outTok,
    inTokPerItem: items ? inTok / items : 0,
    cliUsd, cliSessionPct: cliUsd / USD_PER_SESSION_PCT,
    geminiUsd: (inTok * USD_PER_MTOK_IN + outTok * USD_PER_MTOK_OUT) / 1_000_000,
    minTypical: (calls * ASSUMED_SEC_PER_CALL) / 60,
    minUpper: (calls * UPPER_SEC_PER_CALL) / 60,
  }
}

// ── 실행 ────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)
  const intOf = (k) => { const n = Number(argOf(k)); return Number.isInteger(n) && n > 0 ? n : null }
  const replicateN = args.includes('--replicate') ? intOf('--replicate') : null
  if (args.includes('--replicate') && !replicateN) { console.error('✗ --replicate 뒤에 양의 정수(예: 20)'); process.exit(2) }
  const run = args.includes('--run')
  if (run && replicateN) { console.error('✗ --run 과 --replicate 는 같이 못 쓴다'); process.exit(2) }
  const mode = replicateN ? 'replicate' : run ? 'run' : 'dry'
  const source = argOf('--source') ?? null
  if (args.includes('--source') && !source) { console.error('✗ --source 뒤에 source_key(예: youtube)'); process.exit(2) }
  const limit = intOf('--limit') ?? Infinity
  const seed = intOf('--seed') ?? 42
  const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

  const provider = resolveProvider()
  if (mode !== 'dry') {
    const key = requiredKeyFor(provider)
    if (key && !process.env[key]) { console.error(`✗ ${key} 가 없다(provider=${provider}). 시작하지 않는다.`); process.exit(2) }
    // mock 은 info 를 전부 null 로 준다 — 쓰는 행 0·일치율 0 을 결과로 보고하지 않는다.
    if (provider === 'mock') { console.error('✗ provider=mock — 판정을 만들 수 없다. 실제 프로바이더로 실행하라.'); process.exit(2) }
  }
  if (provider !== 'claude-cli') log(`⚠️ provider=${provider} — 야간 1차 판정자(claude-cli · claude-sonnet-5-5)와 다르다. 같은 판정을 원하면 LLM_PROVIDER=claude-cli`)

  const supabase = await createClient()
  if (!supabase) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 확인'); process.exit(2) }

  log(`정보 판정 소급 — 모드 ${mode}${source ? ` · 소스 ${source}` : ''} · provider=${provider} · 기준 ${RELEVANCE_CRITERIA_VERSION}`)

  // ── 1. 대상 (페이지로 끝까지 — PostgREST 기본 1000행 상한에 잘리지 않게) ──
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('review_relevance_verdicts')
      .select('input_id, project_id, verdict, product_informative, analysis_inputs!inner(raw_text, purged_at, source_key)')
      .order('input_id')
      .range(from, from + 999)
    q = mode === 'replicate' ? q.not('product_informative', 'is', null) : q.is('product_informative', null)
    if (source) q = q.eq('analysis_inputs.source_key', source)
    const { data, error } = await q
    if (error) {
      // 42703 = 컬럼 없음(000031 미적용). 그 밖도 조회 실패다 — 0건으로 접지 않는다.
      console.error(`✗ 대상 조회 실패: ${error.code ?? ''} ${error.message}`)
      process.exit(2)
    }
    rows.push(...data)
    if (data.length < 1000) break
  }
  const purged = rows.filter((r) => r.analysis_inputs.purged_at || !r.analysis_inputs.raw_text)
  let eligible = rows.filter((r) => !purged.includes(r))
  if (mode === 'replicate') {
    const leak = new Set(INFORMATIVE_EXAMPLE_INPUT_IDS)
    eligible = pickReplicate(eligible.filter((r) => !leak.has(r.input_id)), replicateN, seed)
  } else eligible = eligible.slice(0, limit)

  const bySource = {}
  for (const r of rows) bySource[r.analysis_inputs.source_key ?? '(없음)'] = (bySource[r.analysis_inputs.source_key ?? '(없음)'] ?? 0) + 1
  log(`${mode === 'replicate' ? '채워진(true/false)' : 'NULL'} 행 ${rows.length}건 — 소스별 ${Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '(없음)'}`)
  log(`원문 폐기로 제외 ${purged.length}건 → 이번 대상 ${eligible.length}건${Number.isFinite(limit) && mode !== 'replicate' ? ` (--limit ${limit})` : ''}`)
  if (eligible.length === 0) { log('대상 0건 — 끝.'); process.exit(0) }

  // ── 2. 프로젝트 목적 (야간 1차와 같은 입력 — reader_problem 없으면 42703 폴백) ──
  const ids = [...new Set(eligible.map((r) => r.project_id))]
  const cols = 'id, product_elevator_pitch, purpose, business_model'
  let { data: projects, error: pErr } = await supabase.from('analysis_projects').select(`${cols}, reader_problem`).in('id', ids)
  if (pErr?.code === '42703') {
    log('⚠️ analysis_projects.reader_problem 컬럼 없음(42703) — 목적은 제품 소개로 내려간다(야간 1차와 같은 폴백)')
    ;({ data: projects, error: pErr } = await supabase.from('analysis_projects').select(cols).in('id', ids))
  }
  if (pErr) { console.error(`✗ 프로젝트 조회 실패: ${pErr.message}`); process.exit(2) }
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]))

  const byProject = new Map()
  for (const r of eligible) {
    if (!byProject.has(r.project_id)) byProject.set(r.project_id, [])
    byProject.get(r.project_id).push({ input_id: r.input_id, text: r.analysis_inputs.raw_text.slice(0, MAX_REVIEW_CHARS), stored: r.product_informative, verdict: r.verdict, source: r.analysis_inputs.source_key })
  }
  const plan = []
  for (const [pid, rs] of byProject) for (const b of chunkReviews(rs, BATCH_SIZE)) plan.push({ pid, batch: b })

  const est = estimate(plan.map(({ pid, batch }) => {
    const { system, user } = buildRelevancePrompt(projectById.get(pid) ?? null, batch)
    return { chars: system.length + user.length, items: batch.length }
  }))
  log(`추정 — 호출 ${est.calls}회(${BATCH_SIZE}건씩, 프로젝트 ${byProject.size}개) · 입력 ≈${Math.round(est.inTokPerItem)}토큰/건(글자÷2, few-shot 상한 포함) · 출력 ≈${OUT_TOKENS_PER_ITEM}토큰/건(추정)`)
  log(`  비용(claude-cli 실측 명목 $${MEASURED_CLI_USD_PER_ITEM.toFixed(4)}/건, run 37576816430): 총 $${est.cliUsd.toFixed(2)} ≈ 세션 한도 ${est.cliSessionPct.toFixed(1)}%p — 구독 경로라 청구 아님`)
  log(`  비용(gemini 폴백, budget.ts 보수 단가 in $${USD_PER_MTOK_IN}/M · out $${USD_PER_MTOK_OUT}/M): 총 $${est.geminiUsd.toFixed(2)}`)
  log(`  시간(순차): 보통 ≈${est.minTypical.toFixed(0)}분(호출당 ${ASSUMED_SEC_PER_CALL}초 추정) · 상한 ≈${est.minUpper.toFixed(0)}분(timeout ${UPPER_SEC_PER_CALL}초)`)
  if (mode === 'dry') { log('--dry: 여기서 끝낸다. LLM 호출·DB 쓰기 없음. 실행은 --run, 재현 검증은 --replicate N.'); process.exit(0) }

  // ── 3. few-shot — relevance-judge-auto.mjs examplesFor 와 같은 규칙(이 프로젝트 사람 채점 우선, 모자라면 타 프로젝트) ──
  async function examplesFor(projectId) {
    const pick = async (own) => {
      let q = supabase.from('review_relevance_verdicts').select('input_id, human_verdict, human_graded_at')
        .in('human_verdict', ['relevant', 'irrelevant']).order('human_graded_at', { ascending: false, nullsFirst: false }).limit(MAX_EXAMPLES)
      q = own ? q.eq('project_id', projectId) : q.neq('project_id', projectId)
      const { data, error } = await q
      if (error) { log(`⚠️ 사람 채점 조회 실패(${own ? '자기' : '타'} 프로젝트): ${error.message}`); return [] }
      return data ?? []
    }
    const ex = await pick(true)
    if (ex.length < MAX_EXAMPLES) ex.push(...(await pick(false)).slice(0, MAX_EXAMPLES - ex.length))
    if (ex.length === 0) return []
    const { data: texts, error } = await supabase.from('analysis_inputs').select('id, raw_text').in('id', ex.map((r) => r.input_id))
    if (error) { log(`⚠️ 예시 원문 조회 실패: ${error.message} — few-shot 없이 판정한다`); return [] }
    const byId = new Map((texts ?? []).map((t) => [t.id, t.raw_text]))
    return ex.map((r) => ({ text: byId.get(r.input_id) ?? '', verdict: r.human_verdict })).filter((e) => e.text)
  }

  // ── 4. 판정 ─────────────────────────────────────────────────────
  const guard = loadGuardConfig()
  const capUsd = provider === 'claude-cli' ? capUsdOf(guard.cfg) : null
  if (provider === 'claude-cli' && capUsd == null) { console.error(`✗ 세션 상한 설정 확인 불가(${guard.error ?? 'config/session-guard.json'}) — 시작하지 않는다`); process.exit(2) }
  let rollbackPath = null
  const appendRollback = (line) => {
    if (!rollbackPath) {
      rollbackPath = path.join('ops', 'state', 'informative-backfill', `rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`)
      fs.mkdirSync(path.dirname(rollbackPath), { recursive: true })
      fs.writeFileSync(rollbackPath, [
        `-- relevance-informative-backfill 롤백 — ${new Date().toISOString()}${source ? ` · source=${source}` : ''}`,
        '-- 줄마다 "값이 이번에 쓴 값일 때만 NULL 로". UPDATE 직전에 적으므로 저장 실패한 줄도 있을 수 있다(그 줄은 0행 갱신).',
        '-- 적용: begin; \\i 이 파일; (갱신 행 수 확인) commit;',
        '',
      ].join('\n'))
    }
    fs.appendFileSync(rollbackPath, `${line}\n`)
  }

  const t0 = Date.now()
  const c = { calls: 0, done: 0, written: 0, modelNull: 0, callFailed: 0, raced: 0, saveFailed: 0, verdictMismatch: 0 }
  const pairs = []
  let blocker = null
  const exampleCache = new Map()

  for (const { pid, batch } of plan) {
    if (capUsd != null) {
      const spent = spendForCap(cliSpent(), guard.cfg.unitCostFallbackUsd)
      if (spent == null || spent >= capUsd) { blocker = spent == null ? '세션 사용액 확인 불가(비용 못 읽은 호출, 폴백 없음)' : `세션 소프트 캡 도달 $${spent.toFixed(3)} ≥ $${capUsd.toFixed(2)}`; break }
    }
    if (!exampleCache.has(pid)) exampleCache.set(pid, await examplesFor(pid))
    c.calls++
    const out = await withLlmBudget(() => judgeRelevanceBatch(projectById.get(pid) ?? null, batch, exampleCache.get(pid)))
    if (out.quotaExhausted) { blocker = out.error ?? '한도/예산 소진'; break }
    if (out.error) {
      log(`⚠️ ${pid} 묶음 실패(${out.error}) — ${batch.length}건 건너뜀(NULL 그대로)`)
      c.callFailed += batch.length
      c.done += batch.length
      continue
    }
    for (const v of out.verdicts) {
      c.done++
      const b = batch.find((x) => x.input_id === v.input_id)
      if (v.verdict !== 'unknown' && b.verdict && v.verdict !== b.verdict) c.verdictMismatch++
      if (mode === 'replicate') { pairs.push({ input_id: v.input_id, source: b.source, stored: b.stored, fresh: v.product_informative, reason: v.reason }); continue }
      if (v.product_informative === null) { c.modelNull++; continue }
      appendRollback(rollbackLine(v.input_id, v.product_informative))
      const { data, error } = await supabase.from('review_relevance_verdicts')
        .update({ product_informative: v.product_informative })
        .eq('input_id', v.input_id).is('product_informative', null)
        .select('input_id')
      if (error) { c.saveFailed++; console.error(`✗ ${v.input_id} 저장 실패: ${error.code ?? ''} ${error.message}`); continue }
      if ((data ?? []).length === 0) c.raced++ // 그사이 누가 채웠다 — 덮지 않았다(실패 아님)
      else c.written++
    }
  }

  const sec = (Date.now() - t0) / 1000
  const cli = cliSpent()
  const calls = c.calls || 1
  if (blocker) log(`⚠️ 멈췄다 — ${c.done}/${eligible.length}건 처리 뒤. 사유: ${blocker}. 남은 ${eligible.length - c.done}건은 같은 명령으로 이어서(NULL 행만 다시 고른다).`)
  log(`실측 — ${sec.toFixed(0)}초(호출당 ≈${(sec / calls).toFixed(0)}초) · claude-cli 명목 $${cli.usd.toFixed(3)}(비용 못 읽은 호출 ${cli.unknown}) · 건당 $${c.done ? (cli.usd / c.done).toFixed(4) : '-'} · gemini 추정 $${dailySpent().spentUsd.toFixed(3)}`)
  log(`저장 verdict 와 새 판정 불일치 ${c.verdictMismatch}건(verdict 는 안 바꾼다 — 판정 안정성 신호)`)

  if (mode === 'replicate') {
    const a = agreement(pairs)
    const pct = (x) => (x == null ? '-' : `${(x * 100).toFixed(1)}%`)
    log(`재현 ${a.n}건(seed ${seed}) — 일치 ${a.same} · 일치율 ${pct(a.rate)}(새 판정 null 제외) / ${pct(a.rateAll)}(null 을 불일치로) · true→false ${a.tf} · false→true ${a.ft} · →null ${a.toNull} · 호출 실패 ${c.callFailed}`)
    const srcs = [...new Set(pairs.map((p) => p.source))]
    for (const s of srcs) { const x = agreement(pairs.filter((p) => p.source === s)); log(`  · ${s}: ${x.same}/${x.n} (${pct(x.rate)})`) }
    for (const p of pairs.filter((x) => x.fresh !== x.stored)) log(`  ≠ ${p.input_id} [${p.source}] 저장 ${p.stored} → 새 ${p.fresh} — ${p.reason ?? ''}`)
    if (c.callFailed > 0 || a.n < replicateN) log(`⚠️ 비교된 건 ${a.n}/${replicateN} — 모자란 만큼은 확인 불가다(일치로 세지 않았다)`)
    process.exit(0)
  }

  log(`끝 — 기록 ${c.written}건 · 모델이 info=null(그대로 NULL) ${c.modelNull}건 · 호출 실패 ${c.callFailed}건 · 이미 채워져 건너뜀 ${c.raced}건 · 저장 실패 ${c.saveFailed}건`)
  log(rollbackPath ? `롤백 파일: ${rollbackPath}` : '롤백 파일 없음(쓴 행 0)')
  process.exit(c.saveFailed > 0 ? 3 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
