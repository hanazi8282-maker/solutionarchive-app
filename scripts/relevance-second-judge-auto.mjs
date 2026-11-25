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
// 메모리(v71cu-4): 원문은 한 번에 올리지 않는다. 대상 id 만 먼저 고르고(영역 밖은 id 단계에서 제외), 순서를 정한 뒤
//        RAW_CHUNK(1,000)행씩 원문을 읽어 판정·저장하고 버린다. 묶음마다 rss 를 찍고 끝에 '메모리 피크 NMB' 한 줄(워크플로 요약에도).
//        시작할 때 직전 2차 실행의 상한·메모리 피크·정상 종료 여부를 한 줄로 남긴다 — 상한 단계(1,000→2,500→5,000)는 사람·역할 세션이 정한다(코드는 올리지 않는다).
//
//   node --env-file=.env.local scripts/relevance-second-judge-auto.mjs --dry   # 대상 선정만(원문은 묶음 단위로 읽어 폐기 여부만 본다). LLM·DB 쓰기 없음
// 종료코드: 0 정상(대상 0·한도 도달 포함) · 2 설정/조회 실패 · 3 저장 실패 1건 이상

import { createClient } from '../lib/supabase/server.ts'
import { callGeminiRotating, parseJsonObject } from '../lib/analysis/llm.ts'
import { dailySpent, DAILY_BUDGET_USD, judgeBudgetGate, judgeLedgerFrom, judgeUsdCaps, loadJudgeLedgerRows, setRunCapUsd } from '../lib/analysis/budget.ts'
import { capacityGuard, loadAuditWindow, parseSince } from '../lib/analysis/auto-approval.ts'
import { outOfScopeReason } from '../lib/analysis/approval-scope.ts'
import { RELEVANCE_CRITERIA_VERSION } from '../lib/analysis/relevance-criteria.ts'
import {
  SECOND_OPINION_INSTRUCTIONS, SECOND_OPINION_INSTRUCTIONS_V22, secondOpinionInstructionsV23, secondOpinionInstructionsV24, secondOpinionInstructionsV25, orderSecondTargets, recordSecondOpinion, secondAreaGroup, secondJudgeTargetReason,
  secondOpinionUserPrompt, toExportRow, validateOpinions,
} from '../lib/analysis/second-opinion.ts'
import { loadAreasConfig, scorableAreas } from '../lib/analysis/areas-config.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate } from './notion-status-log.mjs'
import { relevanceRunSuffixFromEnv } from '../lib/analysis/session-guard.ts'
import { memPeak, stepSummary } from './mem-peak.mjs'

const dry = process.argv.includes('--dry')
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => { if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`); log(`⚠️ ${m}`) }
const die = (m) => { console.error(`✗ ${m}`); process.exit(2) }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }
const mem = memPeak('2차 판정')

let MAX = num(process.env.RELEVANCE_SECOND_MAX, 200)
const BATCH = 20
/** 원문을 한 번에 읽는 행 수(v71cu-4). 판정·저장이 끝나면 버린다. */
const RAW_CHUNK = 1000
// 시간 상한 — 같은 잡(90분)의 1차가 길어져도 뒤의 자동 승인 스텝이 잘리지 않게. 걸리면 남은 건은 내일(§7.2: 몇 묶음째인지 남긴다).
let DEADLINE_MS = num(process.env.RELEVANCE_SECOND_DEADLINE_MIN, 20) * 60_000
const startedAt = Date.now()
const since = parseSince(process.env.AUTO_APPROVAL_SINCE) ?? parseSince(kstDate())
if (!dry && !process.env.GEMINI_API_KEY) die('GEMINI_API_KEY 가 없다 — 2차 판정을 시작하지 않는다(2차는 gemini 고정).')

const sb = await createClient()
if (!sb) die('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

// v71cu-4: 직전 2차 실행 — 상한 단계를 올릴지 사람·역할 세션이 보는 근거. 이 실행의 agent_runs 행은 아직 없다(tracker 는 아래).
// status=running 으로 남은 행 = tracker.finish 전에 죽은 실행(11-19 러너 끊김이 이 모양). 조회 실패는 '확인 불가'로 적고 진행한다(판정과 무관).
{
  const { data, error } = await sb.from('agent_runs').select('run_key, status, started_at, summary').like('run_key', 'relevance-second-%').order('started_at', { ascending: false }).limit(1)
  const p = data?.[0]
  const line = error ? `이전 2차 실행 — 확인 불가(${error.message})`
    : !p ? '이전 2차 실행 — 기록 없음'
    : `이전 2차 실행 — ${p.run_key} · 시작 ${p.started_at} · 상태 ${p.status}${p.status === 'running' ? '(끝나지 않음 = 비정상 종료 의심)' : ' (정상 종료)'} · 상한 ${p.summary?.max ?? '기록 없음'} · 고름 ${p.summary?.picked ?? '?'} · 메모리 피크 ${p.summary?.mem_peak_mb != null ? `${p.summary.mem_peak_mb}MB` : '기록 없음'} · 이번 상한 ${MAX}`
  log(line)
  stepSummary(line)
}

// v71bb ⑥ 용량 상향 롤백 가드: 자동 승인 감사 정밀도 < 90%(또는 확인 불가)면 상향(v71k·v71ak: 8000건·150분)을 코드 기본(200건·20분)으로 되돌린다.
// 리포 변수는 바꾸지 않는다 — 실행마다 다시 보고 정밀도가 회복되면 자연히 풀린다. 끄기 = RELEVANCE_CAPACITY_GUARD=off.
if ((process.env.RELEVANCE_CAPACITY_GUARD ?? '').trim().toLowerCase() !== 'off') {
  const g = capacityGuard({ enabled: process.env.AUTO_APPROVAL_ENABLED, since: process.env.AUTO_APPROVAL_SINCE, now: new Date(), audits: await loadAuditWindow(sb) })
  if (g.clamp && (MAX > 200 || DEADLINE_MS > 20 * 60_000)) { warn(`용량 상향 롤백 가드 — ${g.reason} · 상한 ${MAX}→${Math.min(MAX, 200)}건 · 마감 ${DEADLINE_MS / 60_000}→${Math.min(DEADLINE_MS / 60_000, 20)}분`); MAX = Math.min(MAX, 200); DEADLINE_MS = Math.min(DEADLINE_MS, 20 * 60_000) }
  else log(`용량 가드 — ${g.reason}`)
}

// 2차 판정 기준(남헌 v67): 1차와 같은 RELEVANCE_CRITERIA 변수 — 기본 v22, v21|old 면 옛 지시문.
const secondMode = (process.env.RELEVANCE_CRITERIA ?? 'v22').trim().toLowerCase()
const secondV22 = !['old', 'v21'].includes(secondMode)
if (!['old', 'v21', 'v22', 'v23', 'v24', 'v25'].includes(secondMode)) warn(`RELEVANCE_CRITERIA='${process.env.RELEVANCE_CRITERIA}' 는 old|v21|v22|v23|v24|v25 가 아니다 — v22 로 처리한다`)
// v23(v71bi): 활성 영역 이름을 config/areas.json 에서 읽는다. 못 읽으면 시작하지 않는다(§7.1).
const secondInstructions = secondMode === 'v23' || secondMode === 'v24' || secondMode === 'v25'
  ? (() => { const { cfg, error } = loadAreasConfig(); if (!cfg) die(`${secondMode} 기준인데 config/areas.json 을 못 읽었다: ${error}`); const names = scorableAreas(cfg).map((a) => a.name); return secondMode === 'v25' ? secondOpinionInstructionsV25(names) : secondMode === 'v24' ? secondOpinionInstructionsV24(names) : secondOpinionInstructionsV23(names) })()
  : secondV22 ? SECOND_OPINION_INSTRUCTIONS_V22 : SECOND_OPINION_INSTRUCTIONS
log(`야간 2차 판정${dry ? ' (--dry: 대상 선정만)' : ''} — provider=gemini(고정) · 기준 ${RELEVANCE_CRITERIA_VERSION} · since ${since.toISOString()}${process.env.AUTO_APPROVAL_SINCE ? '' : '(AUTO_APPROVAL_SINCE 없음 → 오늘 KST)'} · 상한 ${MAX}건`)

// ── 1. 후보 — DB 에서 조건으로 거르고, JS 에서 같은 조건 + 독립성을 한 번 더 (원문 없이 id·메타만) ─────
const cand = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('review_relevance_verdicts')
    // human_verdict·second_verdict 는 받지 않는다(v71ek egress) — 아래 is(null) 조건이 늘 null 임을 보장하고, JS 재확인은 없는 키를 null 로 본다.
    .select('input_id, project_id, verdict, model, judged_at, product_informative')
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
  const { data, error } = await sb.from('analysis_projects').select('id, product_elevator_pitch, business_model, area_code').in('id', pids.slice(i, i + 100))
  if (error) die(`프로젝트 조회 실패: ${error.message}`)
  for (const p of data) projects.set(p.id, p)
}
const withProject = eligible.filter((r) => projects.has(r.project_id))
if (eligible.length - withProject.length) warn(`프로젝트를 못 읽은 행 ${eligible.length - withProject.length}건 — 이번 대상에서 빠졌다(판정할 게 없다는 뜻이 아니다)`)

// v70 L-22: 승인될 수 있는 행(1차 relevant ∧ 정보있음)을 먼저. product_informative 컬럼이 없으면(42703 은 위에서 이미 처리) 전부 undefined → 모두 '나머지'라 기존과 같은 순서가 된다.
const OTHER_SHARE = Math.min(1, Math.max(0, Number(process.env.RELEVANCE_SECOND_OTHER_SHARE ?? 0.15)))
// v71k 3-1: 영역 그룹 순서(영역 안·정보있음 → 영역 안 나머지 → design·hold → 영역 밖·코드 없음). RELEVANCE_SECOND_ORDER=legacy 면 v70 L-22 순서(승인 가능 우선 + 나머지 15%)로 되돌린다.
const legacyOrder = String(process.env.RELEVANCE_SECOND_ORDER ?? '').trim().toLowerCase() === 'legacy'
// v71p 3 → 남헌 A안(PR #539): 영역 밖(out-* 접두어) 행만 2차 대기열에서 뺀다 — 자동 승인·감사 표본이 이 행을 제외하므로(L-20b) 소비처가 없다.
// 판정식 = lib/analysis/approval-scope.ts outOfScopeReason(#529)의 'out-area' 와 같다(OUT_AREA_PREFIX 'out-' 재사용). 차이는 입력을 trim·소문자로 맞추는 것뿐이라
// 정본 소문자 코드에선 결과가 같고, ' OUT-x' 같은 표기 흔들림까지 잡는 쪽으로만 넓다. NULL·빈 값·모르는 코드는 빼지 않는다 — rr-v2 자동 승인은 그 행을
// 제외하지 않고 2차 판정을 쓰기 때문이다(정렬에선 여전히 그룹 3 = 맨 뒤). 삭제·skipped 마킹이 아니라 필터라 RELEVANCE_SECOND_SKIP_OUT_OF_AREA=off(또는 false·0)면
// 즉시 원복된다. RELEVANCE_SECOND_ORDER=legacy 는 순서만 되돌리고 이 제외는 그대로 둔다. 1차 판정은 건드리지 않는다.
// v71cu-4: 이 제외는 원문을 읽기 **전**(id 단계)에 한다 — 예전엔 영역 밖 약 4만 행의 원문까지 읽은 뒤 버렸다.
const skipOutOfArea = !['off', 'false', '0'].includes(String(process.env.RELEVANCE_SECOND_SKIP_OUT_OF_AREA ?? '').trim().toLowerCase())
let queue = skipOutOfArea ? withProject.filter((r) => outOfScopeReason(String(projects.get(r.project_id)?.area_code ?? '').trim().toLowerCase(), false) !== 'out-area') : withProject
if (skipOutOfArea) log(`영역 밖(out-*) ${withProject.length - queue.length}건은 2차 대기에서 제외(원문 읽기 전, RELEVANCE_SECOND_SKIP_OUT_OF_AREA=off 로 원복) — 대기 ${queue.length}건`)
// v71bj §3: 주제 라벨(review_topic_labels)이 활성 영역·이유 있음(reason/weak)인데 out-* 프로젝트에 있어 위에서 빠진 글을 하루 RELEVANCE_SECOND_TOPIC_DAILY 건까지 앞에 세운다.
// 우선순위 ⑧→⑨→⑤→③→②→①→④. 기본 0 = 끔(되돌리기 = 변수 삭제). 라벨 조회가 실패하면 이 경로만 건너뛴다(§7.1 — 모르는 채 넣지 않는다). 이 글은 영역 밖 프로젝트라 자동 승인(rr-v2) 범위가 아니다(L-20b).
// v71cu-4: 원문 확인(폐기·빈 원문) 전에 고른다 — 폐기된 글은 아래 원문 묶음 단계에서 빠지므로 이 경로 실건수는 상한보다 적을 수 있다.
const TOPIC_DAILY = num(process.env.RELEVANCE_SECOND_TOPIC_DAILY, 0)
const TOPIC_PV = 'topic-v1-2026-10-26'
const TOPIC_ORDER = ['work', 'design', '5', '3', '2', '1', '4']
const topicRank = new Map()
if (TOPIC_DAILY > 0 && skipOutOfArea) {
  const queued = new Set(queue.map((r) => r.input_id))
  const outRows = withProject.filter((r) => !queued.has(r.input_id))
  const found = []; let labelErr = null
  for (let i = 0; i < outRows.length && !labelErr; i += 100) {
    const { data, error } = await sb.from('review_topic_labels').select('input_id, area_guess').eq('prompt_version', TOPIC_PV).in('area_guess', TOPIC_ORDER).in('reason_quality', ['reason', 'weak']).in('input_id', outRows.slice(i, i + 100).map((r) => r.input_id))
    if (error) labelErr = error.message; else found.push(...data)
  }
  if (labelErr) warn(`주제 라벨 조회 실패 — 이번 실행은 라벨 경로를 건너뛴다: ${labelErr}`)
  else {
    const area = new Map(found.map((x) => [x.input_id, x.area_guess]))
    const rows = outRows.filter((r) => area.has(r.input_id)).sort((a, b) => TOPIC_ORDER.indexOf(area.get(a.input_id)) - TOPIC_ORDER.indexOf(area.get(b.input_id))).slice(0, TOPIC_DAILY)
    for (const r of rows) topicRank.set(r.input_id, TOPIC_ORDER.indexOf(area.get(r.input_id)))
    queue = [...queue, ...rows]
    const per = {}; for (const r of rows) per[area.get(r.input_id)] = (per[area.get(r.input_id)] ?? 0) + 1
    log(`주제 라벨 경로 — 대기 후보 ${found.length}건 중 이번 ${rows.length}건(상한 ${TOPIC_DAILY}) 영역별 ${JSON.stringify(per)}`)
  }
}
// 대기 전체의 순서(상한 없이) — 원문 묶음은 이 순서대로 읽고, 살아 있는 원문이 MAX 건 모이면 멈춘다.
const { picked: ordered } = orderSecondTargets(queue, (pid) => projects.get(pid)?.business_model, queue.length, legacyOrder
  ? { approvable: (r) => r.verdict === 'relevant' && r.product_informative === true, otherShare: Number.isFinite(OTHER_SHARE) ? OTHER_SHARE : 0.15 }
  : { groupOf: (r) => (topicRank.has(r.input_id) ? topicRank.get(r.input_id) - 10 : secondAreaGroup(projects.get(r.project_id)?.area_code, r.product_informative)) })
// 효과 측정(v71k): 영역 그룹 구성. 0 영역 안·정보있음 / 1 영역 안 나머지 / 2 design·hold / 3 영역 밖·코드 없음
const groupCount = (xs) => xs.reduce((m, r) => { const g = secondAreaGroup(projects.get(r.project_id)?.area_code, r.product_informative); m[g] = (m[g] ?? 0) + 1; return m }, { 0: 0, 1: 0, 2: 0, 3: 0 })
const waitingGroups = groupCount(withProject)
cand.length = 0 // 후보 원본은 더 쓰지 않는다(아래 로그는 candTotal)
const candTotal = Object.values(reasons).reduce((a, b) => a + b, 0)
log(`후보 ${candTotal} → 대상 ${queue.length}건(원문 확인 전) · 이번 상한 ${MAX}건 · 원문은 ${RAW_CHUNK}행씩 읽고 버림 · 순서 SaaS 우선 · rss ${mem.sample()}MB`)

// ── 2. 원문 묶음 → 판정 · 기록 ─────────────────────────────────────
// 재시도(-r1/-r2)·수동(-m<run_id>) 실행이 같은 날 정규 행을 덮지 않게 판정 스텝과 같은 접미사(v30 §5).
const runKey = `relevance-second-${kstDate()}${relevanceRunSuffixFromEnv()}`
let gate = null
let tracker = null
if (!dry) {
  // 과금 상한(v71cu-3 §2a): 2차는 gemini 고정 = 과금 경로. 원장에서 오늘·이번 달 남은 몫을 이 프로세스 상한으로 건다.
  // 넘으면 reserveOrThrow → callGeminiRotating stop → 아래 blocker. 원장을 못 읽으면 판정 0건으로 멈춘다(§7.1).
  const nowGate = new Date()
  const ledgerRows = await loadJudgeLedgerRows(sb, nowGate, runKey)
  gate = judgeBudgetGate({ metered: true, caps: judgeUsdCaps(), ledger: ledgerRows ? judgeLedgerFrom(ledgerRows, nowGate, DAILY_BUDGET_USD) : null })
  log(gate.line)
  setRunCapUsd(gate.capUsd)
  tracker = await createTracker({
    runKey,
    dept: 'cto',
    trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'cron' : process.env.GITHUB_ACTIONS ? 'manual' : 'local',
    gitSha: process.env.GITHUB_SHA ?? null,
    runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  })
  await tracker.step({ stepKey: 'select', label: '2차 대상 선정', status: 'ok', seq: 1, counts: { candidates: candTotal, targets: queue.length, skipped_out_of_area: withProject.length - queue.length, max: MAX, gemini_first: reasons['gemini-first'] ?? 0 } })
}

const c = { recorded: 0, skipped: 0, saveFailed: 0, callFailed: 0, parseFailed: 0, invalid: 0, relevant: 0, informative: 0 }
let infoAbsent = false
let blocker = gate?.stop ? gate.line : null
const exhausted = new Set()
const picked = [] // 고른 행(메타만 — 원문은 묶음이 끝나면 버린다)
let purged = 0
let unread = 0
let scanned = 0 // ordered 에서 원문을 확인한 행 수
let done = 0 // 판정 묶음(20건) 수
let chunks = 0
let timeCapped = false
chunkLoop: for (let off = 0; off < ordered.length && picked.length < MAX && !blocker; off += RAW_CHUNK) {
  const chunk = ordered.slice(off, off + RAW_CHUNK)
  // 원문 — 폐기(purged_at·빈 원문)는 제외, 못 읽은 행은 따로 센다(§7.1).
  const raw = new Map()
  for (let i = 0; i < chunk.length; i += 100) {
    const { data, error } = await sb.from('analysis_inputs').select('id, raw_text, purged_at').in('id', chunk.slice(i, i + 100).map((r) => r.input_id))
    if (error) { if (dry) die(`원문 조회 실패(${off + i + 1}~): ${error.message}`); blocker = `원문 조회 실패(${off + i + 1}~): ${error.message}`; break chunkLoop }
    for (const x of data) raw.set(x.id, x)
  }
  chunks++
  const take = []
  for (const r of chunk) {
    if (picked.length + take.length >= MAX) break
    scanned++
    const x = raw.get(r.input_id)
    if (!x) { unread++; continue }
    if (x.purged_at || !(x.raw_text ?? '').trim()) { purged++; continue }
    take.push(r)
  }
  picked.push(...take)
  for (let b = 0; !dry && !blocker && b < take.length; b += BATCH) {
    if (Date.now() - startedAt > DEADLINE_MS) { timeCapped = true; warn(`시간 상한 ${DEADLINE_MS / 60_000}분 도달 — 판정 ${done}번째 묶음에서 멈춤, 남은 건은 내일`); break chunkLoop }
    const batch = take.slice(b, b + BATCH)
    const rows = batch.map((r) => { const p = projects.get(r.project_id); return toExportRow({ input_id: r.input_id, project_id: r.project_id, raw_text: raw.get(r.input_id).raw_text, pitch: p.product_elevator_pitch, business_model: p.business_model }) })
    const res = await callGeminiRotating(secondInstructions, secondOpinionUserPrompt(rows), 'relevance-second', { exhausted })
    if (!res.ok) {
      if (res.stop) { blocker = res.reason; break chunkLoop }
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
    log(`2차 ${done}번째 묶음 model=${res.model} 유효 ${valid.length}/${batch.length}`)
  }
  log(`원문 묶음 ${chunks}: ${chunk.length}행 확인 · 이번 묶음 고름 ${take.length} · 누적 ${picked.length}/${MAX} · 기록 ${c.recorded} · rss ${mem.sample()}MB`)
}
const remaining = ordered.length - scanned // 원문을 아직 안 본 행(폐기분이 섞여 있을 수 있다)

log(`대상 ${queue.length}건 중 ${scanned}건 원문 확인(폐기 ${purged} · 못 읽음 ${unread}) → 이번 ${picked.length}건${remaining ? ` (${picked.length >= MAX ? `상한 ${MAX} 도달` : '중간에 멈춤'}, 원문 안 본 ${remaining}건은 내일)` : ''}`)
if (unread) warn(`원문 행을 못 읽은 판정 ${unread}건 — 대상에서 빠졌다`)
log(`영역 그룹(0 영역 안·정보있음 / 1 영역 안 나머지 / 2 design·hold / 3 영역 밖·코드 없음) — 이번 ${JSON.stringify(groupCount(picked))} · 대기 전체 ${JSON.stringify(waitingGroups)}${legacyOrder ? ' (legacy 순서 사용 중)' : ''}`)
for (const pid of [...new Set(picked.map((r) => r.project_id))]) {
  const p = projects.get(pid)
  log(`  · ${pid} [${p.business_model ?? '미기재'}] ${picked.filter((r) => r.project_id === pid).length}건 — ${p.product_elevator_pitch ?? '(소개 없음)'}`)
}
if (dry) { log('--dry: 여기서 끝낸다. LLM 호출·DB 쓰기 없음.'); process.exit(0) }

const left = picked.length - c.recorded - c.skipped - c.saveFailed
const spent = dailySpent()
const status = blocker ? 'blocked' : c.saveFailed > 0 ? 'partial' : 'ok'
if (blocker) warn(`한도로 멈췄다(판정 ${done}번째 묶음 · 원문 ${chunks}번째 묶음) — 사유: ${blocker}. 남은 ${left}건은 내일.`)
const memPeakMb = mem.peakMb()
await tracker.step({ stepKey: 'judge', label: '2차 판정·기록', status, seq: 2, blocker, counts: c, detail: { batches: done, raw_chunks: chunks, scanned, purged, unread, time_capped: timeCapped, exhausted: [...exhausted], info_column: infoAbsent ? 'absent' : 'present', mem_peak_mb: memPeakMb } })
await tracker.finish({ status, summary: { ...c, max: MAX, picked: picked.length, left, remaining, blocker, time_capped: timeCapped, mem_peak_mb: memPeakMb, raw_chunk: RAW_CHUNK, est_usd: Number(spent.spentUsd.toFixed(4)), llm_calls: spent.calls, billing: { metered: true, cap_usd: gate.capUsd, line: gate.line } } })

log(`끝 — 기록 ${c.recorded}(관련 ${c.relevant} · 관련∧정보 ${c.informative}) · 그사이 채워져 건너뜀 ${c.skipped} · 호출 실패 ${c.callFailed} · 파싱 실패 ${c.parseFailed} · 어휘 거부/누락 ${c.invalid} · 저장 실패 ${c.saveFailed} · 남은 ${left + remaining}건 내일 · 추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD}) · 상태 ${status}`)
stepSummary(`2차 판정 — 상한 ${MAX} · 고름 ${picked.length} · 기록 ${c.recorded} · 상태 ${status}${blocker ? ` · 멈춤 사유 ${blocker}` : ''}`)
if (!tracker.dbOk) warn('실행 상태를 agent_runs 에 남기지 못했다 — ops/state 폴백. 이 실행의 기록은 "DB 확인 불가"다')
process.exit(c.saveFailed > 0 ? 3 : 0)
