#!/usr/bin/env node
// 야간 T2 2차 판정 — 1차(relevance-judge-auto)가 판정한 행에 독립 2차 판정(second_verdict)을 단다. rr-v2 자동 승인
// (relevance-auto-approve.mjs isFullAgreement)의 입력이다. 이 스크립트가 없으면 2차는 세션이 손으로만 달았고 자동 승인은 0건이었다.
//
// 대상: verdict 있음 ∧ second_verdict 없음 ∧ human_verdict 없음 ∧ judged_at ≥ AUTO_APPROVAL_SINCE(없으면 오늘 KST 0시)
//       ∧ 1차 model 이 Gemini 계열이 아님(2차가 Gemini 라 같은 계열이면 독립 판정이 아니다) ∧ 원문 미폐기.
//       상한 RELEVANCE_SECOND_MAX(기본 200건), 순서는 extract·1차와 같은 compareAutoPriority(SaaS 우선).
// 판정: SECOND_OPINION_INSTRUCTIONS(현재 criteria_version) + Gemini 무료 API. provider 는 **gemini 고정** — LLM_PROVIDER 를 읽지 않는다.
//       503 순환·4바퀴 백오프는 평가 하네스와 같은 헬퍼(llm.ts callGeminiRotating).
// 기록: recordSecondOpinion(import --record-second 와 같은 UPDATE) — second_* 4컬럼만, WHERE second_verdict IS NULL ∧ human_verdict IS NULL.
// 3상태: 호출 실패·파싱 실패·어휘 거부 행은 **기록하지 않는다**(unknown 으로 접지 않음) — 다음 실행이 다시 고른다.
//        예산·402/403·모든 모델 429 는 즉시 멈추고 agent_runs blocked. 모델이 스스로 낸 'unknown' 은 판정이라 기록한다.
//
//   node --env-file=.env.local scripts/relevance-second-judge-auto.mjs --dry   # 대상 선정만. LLM·DB 쓰기 없음
// 종료코드: 0 정상(대상 0·한도 도달 포함) · 2 설정/조회 실패 · 3 저장 실패 1건 이상

import { createClient } from '../lib/supabase/server.ts'
import { callGeminiRotating, parseJsonObject } from '../lib/analysis/llm.ts'
import { dailySpent, DAILY_BUDGET_USD } from '../lib/analysis/budget.ts'
import { parseSince } from '../lib/analysis/auto-approval.ts'
import { chunkReviews } from '../lib/analysis/relevance-judge.ts'
import { RELEVANCE_CRITERIA_VERSION } from '../lib/analysis/relevance-criteria.ts'
import {
  SECOND_OPINION_INSTRUCTIONS, orderSecondTargets, recordSecondOpinion, secondJudgeTargetReason,
  secondOpinionUserPrompt, toExportRow, validateOpinions,
} from '../lib/analysis/second-opinion.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate } from './notion-status-log.mjs'
import { relevanceRunSuffixFromEnv } from '../lib/analysis/session-guard.ts'

const dry = process.argv.includes('--dry')
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => { if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`); log(`⚠️ ${m}`) }
const die = (m) => { console.error(`✗ ${m}`); process.exit(2) }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }

const MAX = num(process.env.RELEVANCE_SECOND_MAX, 200)
const BATCH = 20
// 시간 상한 — 같은 잡(90분)의 1차가 길어져도 뒤의 자동 승인 스텝이 잘리지 않게. 걸리면 남은 건은 내일(§7.2: 몇 묶음째인지 남긴다).
const DEADLINE_MS = num(process.env.RELEVANCE_SECOND_DEADLINE_MIN, 20) * 60_000
const startedAt = Date.now()
const since = parseSince(process.env.AUTO_APPROVAL_SINCE) ?? parseSince(kstDate())
if (!dry && !process.env.GEMINI_API_KEY) die('GEMINI_API_KEY 가 없다 — 2차 판정을 시작하지 않는다(2차는 gemini 고정).')

const sb = await createClient()
if (!sb) die('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

log(`야간 2차 판정${dry ? ' (--dry: 대상 선정만)' : ''} — provider=gemini(고정) · 기준 ${RELEVANCE_CRITERIA_VERSION} · since ${since.toISOString()}${process.env.AUTO_APPROVAL_SINCE ? '' : '(AUTO_APPROVAL_SINCE 없음 → 오늘 KST)'} · 상한 ${MAX}건`)

// ── 1. 후보 — DB 에서 조건으로 거르고, JS 에서 같은 조건 + 독립성을 한 번 더 ─────
const cand = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('review_relevance_verdicts')
    .select('input_id, project_id, verdict, model, judged_at, human_verdict, second_verdict')
    .not('verdict', 'is', null).is('second_verdict', null).is('human_verdict', null)
    .gte('judged_at', since.toISOString())
    .order('input_id').range(from, from + 999)
  if (error && (error.code === '42703' || error.code === 'PGRST204')) die(`2차 판정 컬럼이 없다(${error.code}) — 마이그 20260930000027 미적용`)
  if (error) die(`판정 행 조회 실패: ${error.code ?? ''} ${error.message}`)
  cand.push(...data)
  if (data.length < 1000) break
}
const reasons = {}
const eligible = cand.filter((r) => { const k = secondJudgeTargetReason(r, since); reasons[k] = (reasons[k] ?? 0) + 1; return k === 'target' })
if (reasons['gemini-first']) log(`  · 1차가 Gemini 계열이라 제외(독립성) ${reasons['gemini-first']}건`)
if (reasons['no-model']) warn(`1차 model 이 비어 제외 ${reasons['no-model']}건 — 계열을 모르면 독립성을 말할 수 없다`)

// 프로젝트(순서·pitch)
const pids = [...new Set(eligible.map((r) => r.project_id))]
const projects = new Map()
for (let i = 0; i < pids.length; i += 100) {
  const { data, error } = await sb.from('analysis_projects').select('id, product_elevator_pitch, business_model').in('id', pids.slice(i, i + 100))
  if (error) die(`프로젝트 조회 실패: ${error.message}`)
  for (const p of data) projects.set(p.id, p)
}
const noProject = eligible.filter((r) => !projects.has(r.project_id)).length
if (noProject) warn(`프로젝트를 못 읽은 행 ${noProject}건 — 이번 대상에서 빠졌다(판정할 게 없다는 뜻이 아니다)`)

// 원문 — 폐기(purged_at·빈 원문)는 제외, 못 읽은 행은 따로 센다(§7.1).
const raw = new Map()
const ids = eligible.filter((r) => projects.has(r.project_id)).map((r) => r.input_id)
for (let i = 0; i < ids.length; i += 100) {
  const { data, error } = await sb.from('analysis_inputs').select('id, raw_text, purged_at').in('id', ids.slice(i, i + 100))
  if (error) die(`원문 조회 실패(${i + 1}~): ${error.message}`)
  for (const x of data) raw.set(x.id, x)
}
const unread = ids.filter((x) => !raw.has(x)).length
if (unread) warn(`원문 행을 못 읽은 판정 ${unread}건 — 대상에서 빠졌다`)
const live = eligible.filter((r) => { const x = raw.get(r.input_id); return x && !x.purged_at && (x.raw_text ?? '').trim() })
const purged = ids.length - unread - live.length

const { picked, remaining } = orderSecondTargets(live, (pid) => projects.get(pid)?.business_model, MAX)
log(`후보 ${cand.length} → 대상 ${live.length}건(원문 폐기 ${purged}) → 이번 ${picked.length}건${remaining ? ` (상한 ${MAX} 도달, 남은 ${remaining}건은 내일)` : ''} · 순서 SaaS 우선`)
for (const pid of [...new Set(picked.map((r) => r.project_id))]) {
  const p = projects.get(pid)
  log(`  · ${pid} [${p.business_model ?? '미기재'}] ${picked.filter((r) => r.project_id === pid).length}건 — ${p.product_elevator_pitch ?? '(소개 없음)'}`)
}
if (dry) { log('--dry: 여기서 끝낸다. LLM 호출·DB 쓰기 없음.'); process.exit(0) }

// ── 2. 판정 · 기록 ─────────────────────────────────────────────
const tracker = await createTracker({
  // 재시도(-r1/-r2)·수동(-m<run_id>) 실행이 같은 날 정규 행을 덮지 않게 판정 스텝과 같은 접미사(v30 §5).
  runKey: `relevance-second-${kstDate()}${relevanceRunSuffixFromEnv()}`,
  dept: 'cto',
  trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'cron' : process.env.GITHUB_ACTIONS ? 'manual' : 'local',
  gitSha: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
})
await tracker.step({ stepKey: 'select', label: '2차 대상 선정', status: 'ok', seq: 1, counts: { candidates: cand.length, targets: live.length, picked: picked.length, remaining, gemini_first: reasons['gemini-first'] ?? 0, purged } })

const c = { recorded: 0, skipped: 0, saveFailed: 0, callFailed: 0, parseFailed: 0, invalid: 0, relevant: 0, informative: 0 }
let infoAbsent = false
let blocker = null
const exhausted = new Set()
const batches = chunkReviews(picked, BATCH)
let done = 0
let timeCapped = false
for (const batch of batches) {
  if (Date.now() - startedAt > DEADLINE_MS) { timeCapped = true; warn(`시간 상한 ${DEADLINE_MS / 60_000}분 도달 — ${done}/${batches.length}번째 묶음에서 멈춤, 남은 건은 내일`); break }
  const rows = batch.map((r) => { const p = projects.get(r.project_id); return toExportRow({ input_id: r.input_id, project_id: r.project_id, raw_text: raw.get(r.input_id).raw_text, pitch: p.product_elevator_pitch, business_model: p.business_model }) })
  const res = await callGeminiRotating(SECOND_OPINION_INSTRUCTIONS, secondOpinionUserPrompt(rows), 'relevance-second', { exhausted })
  if (!res.ok) {
    if (res.stop) { blocker = res.reason; break }
    c.callFailed += batch.length
    warn(`2차 ${batch.length}건 호출 실패 — 기록 안 함(내일 다시). ${res.reason} · 최근 ${res.failures.slice(-3).join(' | ')}`)
    done++
    continue
  }
  let obj
  try { obj = parseJsonObject(res.text) } catch { c.parseFailed += batch.length; warn(`2차 ${batch.length}건 JSON 파싱 실패 model=${res.model} — 기록 안 함`); done++; continue }
  const { ok } = validateOpinions(obj)
  const asked = new Set(batch.map((r) => r.input_id))
  const valid = ok.filter((o) => asked.has(o.input_id))
  c.invalid += batch.length - valid.length
  const judgedAt = new Date().toISOString()
  for (const o of valid) {
    const r = await recordSecondOpinion(sb, o, { model: res.model, judgedAt, withInfo: !infoAbsent, requireUngraded: true })
    if (r.infoColumnAbsent && !infoAbsent) { infoAbsent = true; warn('second_product_informative 컬럼 없음(마이그 000031 미적용) — 정보 판정 없이 기록한다. rr-v2 자동 승인 대상은 0건이 된다.') }
    if (r.result === 'failed') { c.saveFailed++; console.error(`✗ ${o.input_id} 2차 기록 실패: ${r.error?.code ?? ''} ${r.error?.message ?? ''}`); continue }
    if (r.result === 'skipped') { c.skipped++; continue }
    c.recorded++
    if (o.verdict === 'relevant') c.relevant++
    if (o.verdict === 'relevant' && o.product_informative === true) c.informative++
  }
  done++
  log(`2차 ${done}/${batches.length} model=${res.model} 유효 ${valid.length}/${batch.length}`)
}

const left = picked.length - c.recorded - c.skipped - c.saveFailed
const spent = dailySpent()
const status = blocker ? 'blocked' : c.saveFailed > 0 ? 'partial' : 'ok'
if (blocker) warn(`한도로 멈췄다(${done}/${batches.length}번째 묶음) — 사유: ${blocker}. 남은 ${left}건은 내일.`)
await tracker.step({ stepKey: 'judge', label: '2차 판정·기록', status, seq: 2, blocker, counts: c, detail: { batches: batches.length, done, time_capped: timeCapped, exhausted: [...exhausted], info_column: infoAbsent ? 'absent' : 'present' } })
await tracker.finish({ status, summary: { ...c, picked: picked.length, left, remaining, blocker, time_capped: timeCapped, est_usd: Number(spent.spentUsd.toFixed(4)), llm_calls: spent.calls } })

log(`끝 — 기록 ${c.recorded}(관련 ${c.relevant} · 관련∧정보 ${c.informative}) · 그사이 채워져 건너뜀 ${c.skipped} · 호출 실패 ${c.callFailed} · 파싱 실패 ${c.parseFailed} · 어휘 거부/누락 ${c.invalid} · 저장 실패 ${c.saveFailed} · 남은 ${left + remaining}건 내일 · 추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD}) · 상태 ${status}`)
if (!tracker.dbOk) warn('실행 상태를 agent_runs 에 남기지 못했다 — ops/state 폴백. 이 실행의 기록은 "DB 확인 불가"다')
process.exit(c.saveFailed > 0 ? 3 : 0)
