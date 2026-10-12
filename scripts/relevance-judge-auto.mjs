#!/usr/bin/env node
// 야간 리뷰 관련성 판정(T2) — 수집한 원문 표본이 프로젝트 목적에 맞는지 LLM 이 3상태로 채점한다.
//
// 남헌 2026-09-23 확정: "AI 관련성 판정은 Gemini, 야간 배치"
// (reports/2026-09-23/data-velocity-plan.md §1 Q5 · §2 T2).
//
// 무엇을 하나
//   1. 야간 extract 후보 상태(extract-gate AUTO_EXTRACT_STATUSES — collecting·extracted·failed, 단 재추출 1회 뒤에도 failed 면 제외 — v28 #10) 프로젝트에서 T1 선별(selectInputs)을 통과한 상위 N건(기본 200)을 고른다.
//   2. 그중 **아직 판정이 없는 것**만, 프로젝트당 1회 돈다(리뷰 20건씩 묶어 호출).
//   3. 최근 사람 채점(human_verdict) 최대 10건을 few-shot 으로 프롬프트에 넣는다(그 프로젝트 우선).
//   1-1. 사전필터(v31 항목 5, lib/analysis/prefilter.ts) — T1 뒤 · T2 전. 기본 shadow = 걸렸을 후보를 select 스텝 detail 에
//        표시만 하고 판정은 그대로. enforce 는 사람이 오탈락률 측정 뒤 켠다(docs/prefilter-shadow.md).
//   4. 결과를 review_relevance_verdicts 에 UPSERT. **human_verdict 는 payload 에 없다** —
//      재판정이 사람 채점을 덮지 않는다.
//
// 지키는 것
//   · mock·파싱 실패·라벨 누락은 전부 'unknown' 이다. 절대 'irrelevant' 로 접지 않는다(§7.1).
//   · 429/503/예산이면 그 자리에서 멈추고 "남은 k건은 내일" 을 남긴다(§7.2). 실패가 아니라 확인 대상이다.
//   · 비용 상한은 lib/analysis/budget.ts 가 강제한다. 프로젝트 1건 = withLlmBudget 1지갑.
//
// 사용:
//   node scripts/relevance-judge-auto.mjs --dry   # 대상 선정만. LLM·DB 쓰기 없음
//   node --env-file=.env.local scripts/relevance-judge-auto.mjs
//
// 세션 한도 가드(남헌 v30 §5 → v32, lib/analysis/session-guard.ts): 한 실행의 claude-cli 명목 비용이 소프트 캡
//   (config/session-guard.json, 15% × $0.43/%p = $6.45)에 닿으면 **프로젝트 경계에서** 새 프로젝트를 시작하지 않는다(stop_reason='session_cap'),
//   하드 캡($12.9)에 닿으면 진행 중 프로젝트라도 다음 묶음을 시작하지 않는다(stop_reason='hard_cap').
//   한도 오류(quota)로 멈추면 재시도 슬롯 r1·r2 가 4시간(또는 CLI 리셋 시각) 뒤 그 프로젝트부터 최대 2회 다시 돈다.
//
// 전량 판정(남헌 결정 — 원문 약 67,355건 + 하루 신규 약 6,300건, lib/analysis/relevance-judge-all.ts):
//   · 원문·판정 캐시를 페이지로 전부 읽고(1,000행 상한 제거), 판정된 것을 뺀 뒤 프로젝트당 RELEVANCE_SAMPLE(워크플로 1000 · 코드 기본 200)건까지.
//   · 저장은 insert-only(ON CONFLICT DO NOTHING) — 이미 있는 판정은 절대 덮지 않는다. 호출 오류 묶음은 저장하지 않고 빈 칸으로 남겨 다음 실행이 다시 채운다.
//   · 모든 행에 model·prompt_version(= RELEVANCE_CRITERIA_VERSION). prompt_version 컬럼이 없으면(마이그 미적용) 그 필드만 빼고 저장.
//   · 캡은 config relevance_cap_until 이전이면 판정 전용 %(relevanceCaps), 지나면 기본 15%/30%.
//   · RELEVANCE_DEADLINE_MIN(기본 80분) 이 지나면 새 묶음을 시작하지 않는다(stop_reason='deadline' — job timeout 에 잘리지 않게).
//   · 끝에 자기 호출 체인을 이어 갈지 정해 GITHUB_OUTPUT relaunch·wait_min·next_hop·next_zero 를 남긴다(decideRelaunch). 부르는 것은 워크플로 relaunch job.
//
// 종료코드: 0 정상(대상 0건·한도·세션 상한 도달·재시도 쉼 포함) · 1 마지막 재시도까지 한도 · 2 설정/조회 실패 · 3 저장 실패 1건 이상

import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { cliSpent, requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import {
  RELEVANCE_SLOTS, capReached, chainWeeklyStopPct, relevanceCaps, relevanceRunSuffixFromEnv, spendForCap, loadGuardConfig, loadRecentRuns, relevanceRetryDecision, sessionBlock, sessionLine, usageSince, weeklyGate,
} from '../lib/analysis/session-guard.ts'
import {
  CHAIN_DEFAULT_MAX_HOPS, CHAIN_DEFAULT_ZERO_LIMIT, DEFAULT_LAST_SOURCES, chainCarryOf, decideRelaunch, parseExcludedSources, parseSourceList, saveVerdictsInsertOnly, saveWithColumnFallback,
} from '../lib/analysis/relevance-judge-all.ts'
import { RELEVANCE_CRITERIA_VERSION } from '../lib/analysis/relevance-criteria.ts'
import { BLOCKED_ALARM_STREAK, QUOTA_COOLDOWN_MS, parseQuotaResetAt } from '../lib/analysis/extract-auto.ts'
import { withLlmBudget, DAILY_BUDGET_USD, dailySpent } from '../lib/analysis/budget.ts'
// 대상 순서는 야간 extract 와 같은 규칙(compareAutoPriority: SaaS 우선 → 많은 순 → projectId)을 영역 결손 축이 감싼다 — lib/analysis/area-priority.ts planAreaOrder(v37 U1).
// 대상 상태도 야간 extract 와 한 벌(v27 옵션 A). collecting 만 보던 동안 extracted 프로젝트에 새로 들어온 수집분은
// 판정되지 않아 T2(자동 승인·extract 선별)를 못 넘었다. 2차(relevance-second-judge-auto)는 프로젝트 상태로 거르지 않고
// 1차 판정 행을 따라가므로 같은 집합을 자동으로 쓴다. 하루 상한(RELEVANCE_MAX_PROJECTS)은 그대로다.
import { AUTO_EXTRACT_STATUSES, relevanceFailedState } from '../lib/analysis/extract-gate.ts'
import {
  BATCH_SIZE,
  MAX_EXAMPLES,
  chunkReviews,
  judgeRelevanceBatch,
  DEFAULT_HIGH_RATING_SHARE,
  parseHighRatingShare,
} from '../lib/analysis/relevance-judge.ts'
import { loadPrefilterConfig } from '../lib/analysis/prefilter.ts'
// 영역 결손 축(v37 작업 7 U1) — 정본 config/areas.json. 못 읽으면 영역 축을 끄고 기존 순서(compareAutoPriority) 그대로.
import { loadAreasConfig } from '../lib/analysis/areas-config.ts'
import { areaFloorLine, loadAreaContext, planAreaOrder } from '../lib/analysis/area-priority.ts'
import { createPendingFor } from '../lib/analysis/relevance-pending.ts'
import { consumerSkipEnabled } from '../lib/analysis/consumer-material.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const dry = args.includes('--dry')

const num = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
/** 프로젝트당 이번 실행에서 판정할 최대 건수(아직 판정 없는 것 중). 코드 기본은 200(커버리지 뷰 20261009000040 의 least(inputs, 200) 와 한 벌),
 *  전량 판정 워크플로는 env 로 1000 을 넘긴다. */
const sampleSize = num(process.env.RELEVANCE_SAMPLE, 200)
/** 새 묶음을 시작하지 않는 시각(실행 시작부터 분). job timeout 에 잘리면 agent_runs 가 running 으로 남고 체인도 끊긴다. */
const deadlineMs = num(process.env.RELEVANCE_DEADLINE_MIN, 80) * 60_000
const startedAt = Date.now()
/** 판정에서 뺄 소스(fail-closed: 'none' 만 전부 허용, 그 밖 값은 기본 youtube 에 더함) · 맨 뒤로 미룰 소스(비면 kakao_cafe,kakao_blog, 'none' 이면 없음). */
const excludedSources = parseExcludedSources(process.env.RELEVANCE_EXCLUDE_SOURCES) // none 만 전부 허용, 그 밖은 기본(youtube)에 합집합
const lastSources = parseSourceList(process.env.RELEVANCE_LAST_SOURCES, DEFAULT_LAST_SOURCES)
/** 자기 호출 체인 — 이번 hop·연속 0건 수는 앞 실행이 dispatch 입력으로 넘긴다(세션·DB 없이 이어진다). */
let chainHop = Math.max(0, Math.floor(Number(process.env.RELEVANCE_CHAIN_HOP) || 0))
let chainZero = Math.max(0, Math.floor(Number(process.env.RELEVANCE_CHAIN_ZERO) || 0))
const chainMaxHops = num(process.env.RELEVANCE_CHAIN_MAX_HOPS, CHAIN_DEFAULT_MAX_HOPS)
const chainEnabled = (process.env.RELEVANCE_CHAIN ?? 'on').trim().toLowerCase() !== 'off'
/** 표본에서 4~5점 평점 입력의 비율 상한(v31 §2.3). 바꾸는 날은 env 값 + Notion 일일 상태 로그 한 줄이 근거다. */
const highRatingShareEnv = process.env.RELEVANCE_HIGH_RATING_SHARE
const parsedHighShare = parseHighRatingShare(highRatingShareEnv)
const highRatingShare = parsedHighShare ?? DEFAULT_HIGH_RATING_SHARE
/** 한 실행에서 돌 최대 프로젝트 수. 실제 멈춤은 캡·deadline 이 먼저 건다. */
const maxProjects = num(process.env.RELEVANCE_MAX_PROJECTS, 30)

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => {
  // 빨간 X(실패)도 초록(정상)도 아닌 세 번째 상태를 그대로 표시한다.
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`)
  log(`⚠️ ${m}`)
}

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (!dry && requiredKey && !process.env[requiredKey]) {
  console.error(`✗ ${requiredKey} 가 없다(provider=${provider}). 판정을 시작하지 않는다 — 시크릿을 등록하라.`)
  process.exit(2)
}

const supabase = await createClient()
if (!supabase) {
  console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  process.exit(2)
}

// ── 0. 슬롯 · 세션 한도 가드(남헌 v30 §5, lib/analysis/session-guard.ts) ──────────
// main = 정규 1회(KST 04:03 예정). r1·r2 = 한도 정지 뒤 재시도 전용 — 할 일이 없으면 기록 없이 끝나고 뒤 스텝도 건너뛴다(ran=false).
// 수동은 -m<run_id> 로 따로 센다(같은 날 정규 행을 덮지 않게, 재시도 횟수에도 안 들어간다).
const today = kstDate()
const setOutput = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`) }
let suffix
try {
  suffix = relevanceRunSuffixFromEnv() // 뒤 스텝(2차·자동 승인·ca-v1)도 같은 접미사를 쓴다
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(2)
}
const slot = process.env.GITHUB_EVENT_NAME === 'schedule' ? RELEVANCE_SLOTS[(process.env.RELEVANCE_SLOT_CRON ?? '').trim()] : process.env.GITHUB_ACTIONS ? 'm' : 'local'
const runKey = `relevance-judge-${today}${suffix}`
const MAX_RETRIES = BLOCKED_ALARM_STREAK - 1

const guardNow = new Date()
const recentRuns = await loadRecentRuns(supabase, guardNow)
if (!recentRuns) warn('가드 대상 실행 이력(agent_runs) 조회 실패 — 재시도 판정·5시간 창·주간 합산 확인 불가')
let retry = null
if (slot === 'r1' || slot === 'r2') {
  retry = recentRuns
    ? relevanceRetryDecision(recentRuns, { today, now: guardNow, cooldownMs: QUOTA_COOLDOWN_MS, maxRetries: MAX_RETRIES })
    : { run: false, reason: '실행 이력 확인 불가 — 모른 채 재시도하지 않는다', retriesDone: null, quotaPending: null, quotaProject: null }
  log(`재시도 슬롯 ${slot} ${retry.run ? '실행' : '쉼'} — ${retry.reason}`)
  // 체인 넘겨받기: 직전 판정 실행이 "이어 가라"를 남겼는데 이 슬롯이 대기열에 있어서 relaunch 가 부르지 않았다 → 이 실행이 그 hop 을 잇는다.
  const carry = !retry.run && recentRuns ? chainCarryOf(recentRuns, guardNow) : null
  if (carry) {
    chainHop = carry.hop
    chainZero = carry.zero
    log(`체인 넘겨받음 — ${carry.from} 의 hop ${carry.hop}(연속 0건 ${carry.zero})을 이 슬롯(${slot})이 잇는다`)
  } else if (!retry.run) {
    setOutput('ran', 'false')
    // r2 는 그날 마지막 재시도 자리다. 마지막 기록이 아직 한도 정지(또는 이력 확인 불가)인 채로 쉬면 묻히지 않게 경보한다
    // — exit 1 을 cron-watchdog 가 Notion 일일 상태 로그로 올린다.
    if (slot === 'r2' && retry.quotaPending !== false) {
      const m = `T2 가 한도 정지 상태로 오늘 마지막 재시도(r2)를 못 돌았다 — ${retry.reason}. 남은 판정은 내일 정규 실행. 사람이 볼 것`
      if (process.env.GITHUB_ACTIONS) console.log(`::error::${m}`)
      console.error(`✗ ${m}`)
      process.exit(1)
    }
    process.exit(0)
  }
}
setOutput('ran', 'true')
setOutput('relaunch', 'false') // 체인 기본값 — 끝까지 가서 decideRelaunch 가 true 로 바꿀 때만 다음 실행을 부른다
const guard = loadGuardConfig()
// 판정 전용 캡(until 이전) 또는 기본 캡. extract·번역·백필은 capUsdOf 그대로라 영향 없다.
const caps = relevanceCaps(guard.cfg, guardNow)
const capUsd = caps.capUsd
log(`판정 캡 — ${caps.relaxed ? `오늘 한정 완화 ${caps.capPct}%(~${new Date(caps.untilMs).toISOString()}, 사실상 무제한)` : caps.boosted ? `판정 전용 ${caps.capPct}%(~${new Date(caps.untilMs).toISOString()})` : `기본 ${caps.capPct ?? '?'}%${caps.untilMs ? `(판정 전용 만료 ${new Date(caps.untilMs).toISOString()})` : ''}`} · 소프트 $${capUsd?.toFixed(2) ?? '?'} · 하드 $${caps.hardCapUsd?.toFixed(2) ?? '?'} · 체인 hop ${chainHop}/${chainMaxHops}(연속 0건 ${chainZero}) ${chainEnabled ? '' : '· RELEVANCE_CHAIN=off'}`)
log(`소스 — 제외 ${excludedSources.join(',') || '(없음)'} · 맨 뒤 ${lastSources.join(',') || '(없음)'} · 마감 ${deadlineMs / 60_000}분`)
const window5h = recentRuns ? usageSince(recentRuns, guardNow.getTime() - 5 * 3_600_000) : null
const weekUsd = recentRuns ? usageSince(recentRuns, guardNow.getTime() - 7 * 86_400_000).usd : null
const weekly = weeklyGate(guard.cfg, weekUsd)
log(`세션 가드 — run_key=${runKey} · 이번 실행 상한 ${capUsd == null ? `확인 불가(${guard.error ?? 'session_cap_pct·usd_per_session_pct 없음'})` : `$${capUsd.toFixed(2)}(${guard.cfg.capPct}% × $${guard.cfg.usdPerPct}/%p)`} · ${weekly.reason} · 직전 5시간 다른 실행 ${window5h ? `$${window5h.usd.toFixed(2)}(${window5h.runs}건)` : '확인 불가'}`)
// 상한이 걸리는 건 구독 경로(claude-cli)뿐이다 — gemini 로 되돌리면 budget.ts 가 달러 예산을 지킨다.
const guarded = provider === 'claude-cli'

if (parsedHighShare === null && (highRatingShareEnv ?? '').trim() !== '') warn(`RELEVANCE_HIGH_RATING_SHARE=${highRatingShareEnv} 은 0~1 밖이다 — 기본 ${DEFAULT_HIGH_RATING_SHARE} 로 간다`)
log(`야간 관련성 판정 ${dry ? '(--dry: 대상 선정만)' : ''} — provider=${provider} · 표본 ${sampleSize}건/프로젝트(4~5점 상한 ${highRatingShare}${parsedHighShare === null ? ' 기본' : ' env'}) · 프로젝트 상한 ${maxProjects}건 · 일 예산 $${DAILY_BUDGET_USD}`)

// ── 1. 후보 프로젝트 ─────────────────────────────────────────────
//
// reader_problem 은 **판정 품질의 1순위 입력**이다. relevance-judge.describePurpose 가
// reader_problem → product_elevator_pitch → purpose 순으로 떨어지는데, 지금은 이 SELECT 에
// 컬럼이 없어 항상 2순위(제품 이름)로 내려간다. 그래서 모델이 "이 제품 리뷰인가?"로 읽고
// 경쟁사 후기·페인 토로를 무관으로 버린다(무관 195건 표본 10건 중 4건이 그것이다 —
// reports/2026-09-23/voc-expansion-investigation.md §5-2).
//
// ⚠️ **컬럼이 아직 없을 수 있다.** analysis_projects.reader_problem 은 별 작업의
//    마이그레이션 20260930000003 으로 들어오고, 그건 아직 적용 전이다. 적용 전 DB 에
//    이 컬럼을 SELECT 하면 PostgREST 가 42703 을 준다. 그래서 존재를 **3상태**로 다룬다
//    (CLAUDE.md §7.1: 확인 불가를 양성으로도 음성으로도 접지 않는다):
//      · 있다   → 목적 1순위로 쓴다.
//      · 없다   → 42703 확인 후 컬럼 없이 다시 조회하고, **경고를 남긴다.** 조용히 넘어가면
//                 "왜 아직 제품 이름으로 판정하나"를 아무도 모른다.
//      · 그 외 오류 → 조회 실패다. 컬럼 없음으로 접지 않고 여기서 멈춘다.
const PROJECT_COLS = 'id, status, extract_attempts, product_elevator_pitch, purpose, business_model'
const projectQuery = (cols) =>
  supabase
    .from('analysis_projects')
    // business_model 은 순서를 가른다 — SaaS 가 먼저다(compareAutoPriority, 남헌 2026-09-23).
    .select(cols)
    .in('status', AUTO_EXTRACT_STATUSES)
    .order('created_at', { ascending: true })

let readerProblemColumn = 'unknown' // 'present' | 'absent' | 'unknown'
let { data: projects, error: projectsError } = await projectQuery(`${PROJECT_COLS}, reader_problem`)

if (!projectsError) {
  readerProblemColumn = 'present'
} else if (projectsError.code === '42703') {
  readerProblemColumn = 'absent'
  warn(
    'analysis_projects.reader_problem 컬럼이 없다(42703) — 마이그레이션 20260930000003 미적용. ' +
      '목적 문장이 제품 이름(product_elevator_pitch)으로 떨어진다. 이번 판정의 무관 비율은 ' +
      '"목적을 병목으로 준 결과"가 아니다.',
  )
  ;({ data: projects, error: projectsError } = await projectQuery(PROJECT_COLS))
}

if (projectsError) {
  console.error(`✗ 프로젝트 조회 실패: ${projectsError.message}`)
  process.exit(2)
}

log(
  `목적 1순위 입력(reader_problem 컬럼): ${readerProblemColumn === 'present' ? '있다 — 목적을 병목으로 준다' : '없다 — 제품 이름으로 판정한다'}`,
)
if (readerProblemColumn === 'present') {
  const filled = (projects ?? []).filter((p) => (p.reader_problem ?? '').trim()).length
  // 컬럼이 있어도 값이 비면 효과는 0 이다. "컬럼 있음"을 "목적 고쳐짐"으로 읽지 않는다(§7.1).
  if (filled === 0) warn(`reader_problem 컬럼은 있지만 값이 채워진 프로젝트가 0건이다 — 여전히 제품 이름으로 판정한다`)
  else log(`  · reader_problem 값이 있는 후보 ${filled}/${(projects ?? []).length}건`)
}

// ── 사전필터(v31 항목 5) — T1 선별 뒤 · T2 호출 전. 기본 shadow(표시만). lib/analysis/prefilter.ts · docs/prefilter-shadow.md ──
// 설정을 못 읽으면 필터를 끈다(아무것도 표시·제외 안 함) — 모르는 규칙으로 원문을 버리지 않는다(§7.1).
const prefilterLoad = loadPrefilterConfig()
const prefilterCfg = prefilterLoad.cfg
if (!prefilterCfg) warn(`사전필터 설정 확인 불가 — 필터 꺼짐(전부 통과): ${prefilterLoad.error}`)
for (const w of prefilterLoad.warnings) warn(`사전필터 설정: ${w}`)
log(`사전필터 — ${prefilterCfg ? `mode=${prefilterCfg.mode} · 소스 ${prefilterCfg.applySources === '*' ? '전부' : prefilterCfg.applySources.join(',') || '(없음)'}` : '꺼짐(설정 확인 불가)'}`)
// 대상 조회(평점 컬럼 42703 폴백) → T1 → 평점 우선 자르기 → 판정 캐시 제외 → 사전필터. 연결부는 lib/analysis/relevance-pending.ts
// (모의 supabase 로 scripts/prefilter-selftest.mjs 가 실행 검사한다). 모든 반환에 rating 이 있다(아래 대상 로그가 읽는다).
const { pendingFor, countFor, prefilterByProject, currentPrefilter } = createPendingFor({ supabase, sampleSize, highRatingShare, prefilterCfg, log, warn, excludedSources, lastSources })

/** few-shot — 사람 채점 최근 N건. 이 프로젝트 것 우선, 모자라면 다른 프로젝트에서 채운다. */
async function examplesFor(projectId) {
  const pick = async (own) => {
    let q = supabase
      .from('review_relevance_verdicts')
      .select('input_id, human_verdict, human_graded_at')
      .not('human_verdict', 'is', null)
      .in('human_verdict', ['relevant', 'irrelevant'])
      .order('human_graded_at', { ascending: false, nullsFirst: false })
      .limit(MAX_EXAMPLES)
    q = own ? q.eq('project_id', projectId) : q.neq('project_id', projectId)
    const { data, error } = await q
    if (error) {
      console.error(`⚠️ 사람 채점 조회 실패(${own ? '자기' : '타'} 프로젝트): ${error.message}`)
      return []
    }
    return data ?? []
  }

  const rows = await pick(true)
  if (rows.length < MAX_EXAMPLES) rows.push(...(await pick(false)).slice(0, MAX_EXAMPLES - rows.length))
  if (rows.length === 0) return []

  const { data: texts, error } = await supabase
    .from('analysis_inputs')
    .select('id, raw_text')
    .in('id', rows.map((r) => r.input_id))
  if (error) {
    console.error(`⚠️ 예시 원문 조회 실패: ${error.message} — few-shot 없이 판정한다`)
    return []
  }
  const byId = new Map((texts ?? []).map((t) => [t.id, t.raw_text]))
  return rows
    .map((r) => ({ text: byId.get(r.input_id) ?? '', verdict: r.human_verdict }))
    .filter((e) => e.text)
}

// v28 #10 — 재추출 1회 뒤에도 failed 면 판정에서 뺀다(relevanceFailedState). 첫 실패는 extract-auto 의 재추출을 기다리므로 남긴다.
const failedBy = { retry: 0, excluded: 0, unknown: 0 }
for (const p of projects ?? []) {
  const s = relevanceFailedState(p.status, p.extract_attempts)
  if (s !== 'n/a') failedBy[s] += 1
}
log(`failed 프로젝트: 재추출 대상(첫 실패, 판정 유지) ${failedBy.retry}건 · 재추출 후에도 failed → 제외 ${failedBy.excluded}건 · 시도 수 확인 불가 ${failedBy.unknown}건`)
if (failedBy.unknown > 0) warn(`extract_attempts 를 읽지 못한 failed 프로젝트 ${failedBy.unknown}건 — 판정에서 빠졌다(제외 판정이 아니라 확인 불가다)`)

// 후보 전부는 미판정 **수**만 센다(countFor — id·source_key 만, raw_text 안 읽음). 원문은 아래에서 이번에 돌 프로젝트만 읽는다.
const candidates = []
const seenSources = new Set()
let consumerSkipped = 0 // 소비재 태그로 대기열에서 뺀 미판정(전부 태그된 프로젝트 포함)
for (const p of projects ?? []) {
  if (!['n/a', 'retry'].includes(relevanceFailedState(p.status, p.extract_attempts))) continue
  const count = await countFor(p)
  if (count === null) {
    candidates.push({ project: p, count: null })
    continue
  }
  for (const s of count.sources) seenSources.add(s)
  consumerSkipped += count.consumer
  if (count.unjudged === 0) continue
  candidates.push({ project: p, count })
}
// RELEVANCE_EXCLUDE_SOURCES 에 원문에 없는 이름이 있으면 오타일 수 있다 — 제외는 기본값에 더해지므로 유튜브는 그대로 닫혀 있다(fail-closed).
const unknownExcluded = excludedSources.filter((s) => !seenSources.has(s) && s !== 'youtube')
if (unknownExcluded.length > 0) warn(`RELEVANCE_EXCLUDE_SOURCES 의 ${unknownExcluded.join(',')} 는 후보 원문에 없는 소스 이름이다 — 오타인지 확인(기본 제외 youtube 는 유지)`)

// 소비재 태그(남헌 v61) — 대기열에서 뺀 미판정 수. 재개 스위치 RELEVANCE_SKIP_CONSUMER=off 면 태그를 읽지 않는다(0).
log(`소비재 태그 — ${consumerSkipEnabled() ? `대기열에서 뺌(후보 프로젝트의 미판정 ${consumerSkipped}건 보류)` : 'RELEVANCE_SKIP_CONSUMER=off — 태그 무시(원래 동작)'}`)

let unknownCount = candidates.filter((c) => c.count === null).length

// 영역 결손 축(v37 작업 7 U1): 결손 영역 → 충족 영역 → 영역 외 → hold, 같은 칸 안은 아래 기존 규칙.
// 설정·판정 수 중 하나라도 확인 불가면 축을 끈다 — 모르는 결손으로 순서를 바꾸지 않는다(§7.1).
const areasLoad = loadAreasConfig()
for (const w of areasLoad.warnings) warn(`영역 설정: ${w}`)
if (!areasLoad.cfg) warn(`영역 설정 확인 불가 — 영역 축 끔(기존 순서): ${areasLoad.error}`)
// 같은 칸 안 기존 규칙: SaaS 우선 → 미판정 많은 순 → projectId(extract 와 같은 헬퍼). 조회·정렬 예외도 축 끔 + 기존 순서(planAreaOrder).
// newInputs = 이번 실행에 탈 수 있는 양(min(미판정, 상한)) — 예전 pending.reviews.length 와 같은 의미.
const autoKey = (c) => ({ projectId: c.project.id, newInputs: Math.min(c.count.unjudged, sampleSize), businessModel: c.project.business_model, c })
const areaPlan = await planAreaOrder({
  cfg: areasLoad.cfg,
  load: () => loadAreaContext(supabase, warn),
  cands: candidates.filter((c) => c.count !== null).map(autoKey),
  warn,
})
const areaAxis = areaPlan.axis
const areaCtx = areaPlan.ctx
if (areaAxis === 'on') {
  log(`영역 판정/최소량(${areasLoad.cfg.floorSource === 'env' ? 'env RELEVANCE_AREA_FLOOR' : 'config/areas.json'}): ${areaFloorLine(areaCtx.judged, areasLoad.cfg)} · 영역 열 ${areaCtx.column === 'present' ? '있음(NULL 은 라벨 폴백)' : '없음 → 라벨 폴백'}`)
} else warn(`영역 축 꺼짐 — ${areaPlan.reason}. 기존 순서(SaaS 우선 → 미판정 많은 순)`)
const ready = areaPlan.ordered.map((k) => k.c)
// 재시도 슬롯(v32 #4): 한도로 멈춘 **그 프로젝트**를 맨 앞으로. 판정은 묶음마다 저장돼 이미 판정된 리뷰는 다시 안 탄다(pendingFor).
if (retry?.quotaProject) {
  const i = ready.findIndex((c) => c.project.id === retry.quotaProject)
  if (i > 0) ready.unshift(...ready.splice(i, 1))
}
// 원문(raw_text)은 순서대로 이번에 돌 프로젝트(최대 maxProjects)만 읽는다 — pendingFor(라운드로빈·평점 자르기·사전필터).
const targets = []
let examined = 0
for (const c of ready) {
  if (targets.length >= maxProjects) break
  examined += 1
  const pending = await pendingFor(c.project)
  if (pending === null) { unknownCount += 1; continue }
  if (pending.reviews.length === 0) continue // 머리말뿐인 입력 등 — 수 세기(근사)엔 잡혔지만 판정할 본문이 없다
  targets.push({ ...c, pending })
}
const remaining = ready.length - examined
// 전체 남은 미판정(이번 실행 상한과 무관, countFor 근사). 수를 못 센 프로젝트가 있으면 하한이다.
const unjudgedBefore = ready.reduce((s, c) => s + c.count.unjudged, 0)
const excludedTotal = ready.reduce((s, c) => s + c.count.excluded, 0)
log(`미판정 전체 ${unjudgedBefore}건(프로젝트 ${ready.length}개${unknownCount > 0 ? ` · 원문 못 읽은 프로젝트 ${unknownCount}개 제외 — 하한` : ''}) · 제외 소스로 뺀 ${excludedTotal}건`)

log(
  `후보(${AUTO_EXTRACT_STATUSES.join('·')}) ${(projects ?? []).length}건 → 판정 대상 프로젝트 ${ready.length}건` +
    (remaining > 0 ? ` 중 ${targets.length}건 실행 (상한 ${maxProjects}건 도달, 남은 ${remaining}건은 다음 실행)` : ' 전부 실행') +
    (areaAxis === 'on' ? ' (순서: 공급 충분한 결손 영역 → 공급 부족 결손 영역 → 충족 영역 → 영역 외 → 보류, 결손 칸은 미판정 큰 순)' : ' (순서: SaaS 우선 → 미판정 많은 순 — 영역 축 꺼짐)'),
)
const areaTag = (id) => {
  if (areaAxis !== 'on') return ''
  const a = areaCtx.byProject.get(id)
  return ` 영역 ${a?.code ?? 'unassigned'}(${a?.via ?? 'none'})`
}
for (const t of targets) {
  log(`  ·${areaTag(t.project.id)} ${t.project.id} [${t.project.business_model ?? '미기재'}] 미판정 ${t.pending.reviews.length}건 / 표본 ${t.pending.total}건(평점 저 ${t.pending.rating.low} · 고 ${t.pending.rating.high}/상한 ${t.pending.rating.high_cap} · 없음 ${t.pending.rating.none}) —${t.project.product_elevator_pitch ?? '(소개 없음)'}`)
}
if (unknownCount > 0) warn(`원문·판정 캐시를 읽지 못한 프로젝트 ${unknownCount}건 — 대상 판정에서 빠졌다(판정할 게 없다는 뜻이 아니다)`)

if (dry) {
  log('--dry: 여기서 끝낸다. LLM 호출·DB 쓰기 없음.')
  process.exit(0)
}

// ── 2. 실행 상태 기록 (기존 헬퍼 재사용) ─────────────────────────
const tracker = await createTracker({
  runKey,
  dept: 'cto',
  trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'cron' : process.env.GITHUB_ACTIONS ? 'manual' : 'local',
  dryRun: false,
  gitSha: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
})

await tracker.step({
  stepKey: 'select',
  label: '대상 선정',
  status: 'ok',
  counts: {
    projects: (projects ?? []).length, targets: targets.length, remaining, unknown: unknownCount,
    failed_retry: failedBy.retry, failed_excluded: failedBy.excluded, failed_unknown: failedBy.unknown,
  },
  detail: {
    sample: sampleSize, high_rating_share: highRatingShare,
    rating_mix: Object.fromEntries(targets.map((t) => [t.project.id, t.pending.rating])),
    // 영역 결손 축(v37 U1): off = 설정·판정 수 확인 불가로 기존 순서. area_judged 는 이번 실행 전 판정 수.
    area_axis: areaAxis, area_axis_reason: areaPlan.reason, area_floor: areasLoad.cfg?.floor ?? null, area_judged: areaCtx?.judged ?? null, area_column: areaCtx?.column ?? null,
    area_of: areaAxis === 'on' ? Object.fromEntries(targets.map((t) => [t.project.id, areaCtx.byProject.get(t.project.id) ?? null])) : null,
    max_projects: maxProjects, batch: BATCH_SIZE, slot, retry: retry ? { reason: retry.reason, retries_done: retry.retriesDone } : null,
    // 사전필터 입력 단위 기록(v31 항목 5): 이번에 도는 프로젝트만. null = 설정 확인 불가·실행 중 예외로 꺼짐.
    prefilter: prefilterCfg
      ? { mode: prefilterCfg.mode, disabled_by_error: currentPrefilter() === null, by_project: Object.fromEntries(targets.filter((t) => prefilterByProject[t.project.id]).map((t) => [t.project.id, prefilterByProject[t.project.id]])) }
      : null,
  },
})

// 상한을 모르면(설정 깨짐) 돌지 않는다(§7.1). 주간 스위치도 여기서 멈춘다. 둘 다 stop_reason ≠ quota 라 재시도 슬롯이 다시 깨우지 않는다.
if (guarded && (capUsd == null || weekly.stop)) {
  const stopReason = capUsd == null ? 'guard_config' : 'weekly_stop'
  const why = capUsd == null ? `세션 상한 설정 확인 불가 — ${guard.error ?? 'config/session-guard.json 의 session_cap_pct·usd_per_session_pct 가 없다'}` : weekly.reason
  warn(`${why} — 판정 0건으로 멈춘다(대상 ${targets.length}건은 다음 실행)`)
  await tracker.step({ stepKey: 'guard', label: '세션 한도 가드', status: 'blocked', blocker: why, detail: { stop_reason: stopReason, weekly_pct: weekly.pct, cap_usd: capUsd } })
  await tracker.finish({ status: 'blocked', summary: { projects: 0, judged: 0, remaining: ready.length, blocker: why, stop_reason: stopReason, slot } })
  process.exit(capUsd == null ? 2 : 0)
}

// ── 3. 프로젝트별 판정 ───────────────────────────────────────────
let judgedTotal = 0
let saveFailed = 0
// T2 라벨 컬럼(20260930000014) 존재 3상태 — 'unknown' 은 첫 저장 전, 'absent' 면 라벨 없이 저장한다.
let labelColumns = 'unknown'
let labeledTotal = 0
const LABEL_KEYS = ['impact', 'frequency', 'community_signal', 'wtp_mentioned']
// rr-v2 정보 판정 컬럼(20260930000031) 존재 3상태 — 같은 방식. 'absent' 면 product_informative 만 빼고 저장한다.
let infoColumn = 'unknown'
let informativeTotal = 0
let blocker = null
let seq = 1
// 세션 가드: 'quota'(구독 한도 오류) | 'session_cap'(소프트 캡 — 새 프로젝트 시작 안 함) | 'hard_cap'(하드 캡 — 다음 묶음 안 함)
//   | 'cost_unknown' | 'save_failed' | null
let stopReason = null
let quotaResetAt = null
let quotaProjectId = null
let batchesDone = 0
const batchesPlanned = targets.reduce((s, t) => s + chunkReviews(t.pending.reviews, BATCH_SIZE).length, 0)
const hardCapUsd = caps.hardCapUsd
let projectsStarted = 0
// prompt_version 컬럼(20261014000020) 존재 3상태 — 'absent' 면 그 필드만 빼고 저장한다(model 은 원래 NOT NULL 로 늘 기록).
let promptVersionColumn = 'unknown'
// 체인 오류율 — 호출 오류로 저장하지 않은 건수(빈 칸으로 남아 다음 실행이 다시 채운다) + 저장 실패 건수. 분모는 시도 건수.
let attemptedTotal = 0
let errorTotal = 0
let deadlineHit = false

for (const { project, pending } of targets) {
  // 소프트 캡(v32): 프로젝트 **경계에서만** 본다 — 닿았으면 새 프로젝트를 시작하지 않는다. 진행 중 프로젝트는 묶음을 끝까지 돈다.
  // 비용 못 읽은 호출은 spendForCap 이 추정해 더한다. 추정 근거가 없으면 null — 새 시작을 막는다(§7.1).
  if (guarded) {
    const spentNow = spendForCap(cliSpent(), guard.cfg.unitCostFallbackUsd)
    if (spentNow == null || capReached(spentNow, capUsd)) {
      stopReason = spentNow == null ? 'cost_unknown' : 'session_cap'
      blocker = spentNow == null
        ? `세션 사용액 확인 불가 — 비용을 못 읽은 호출 ${cliSpent().unknown}건(timeout·출력 상한·봉투 없음), 추정 근거·폴백(unit_cost_fallback_usd) 없음 · 프로젝트 ${targets.length}건 중 ${projectsStarted}건 · 묶음 ${batchesDone}/${batchesPlanned}개 뒤 새 시작 중지`
        : `소프트 캡 도달 — 프로젝트 ${targets.length}건 중 ${projectsStarted}건 · 묶음 ${batchesDone}/${batchesPlanned}개 뒤 새 시작 중지 · 사용 $${spentNow.toFixed(3)} / 소프트 캡 $${capUsd.toFixed(2)}`
      warn(`${blocker}. 남은 판정은 다음 실행(정상 종료가 아니다 — §7.2 확인 대상).`)
      await tracker.step({ stepKey: 'session-cap', label: '세션 소프트 캡', status: 'blocked', seq: seq + 1, blocker, detail: { projects_started: projectsStarted, of: targets.length, batches_done: batchesDone, batches_planned: batchesPlanned, spent_usd: spentNow == null ? null : Number(spentNow.toFixed(4)), cap_usd: capUsd, hard_cap_usd: hardCapUsd } })
      break
    }
  }
  // 마감(RELEVANCE_DEADLINE_MIN): job timeout 에 잘리기 전에 새 프로젝트를 시작하지 않는다. 체인의 정상 경계라 blocker 가 아니다.
  if (Date.now() - startedAt >= deadlineMs) {
    deadlineHit = true
    stopReason = 'deadline'
    log(`마감 ${deadlineMs / 60_000}분 도달 — 프로젝트 ${targets.length}건 중 ${projectsStarted}건 · 묶음 ${batchesDone}/${batchesPlanned}개 뒤 새 시작 중지(남은 판정은 다음 실행)`)
    break
  }
  projectsStarted += 1
  seq += 1
  const examples = await examplesFor(project.id)
  const batches = chunkReviews(pending.reviews, BATCH_SIZE)
  const counts = { relevant: 0, irrelevant: 0, unknown: 0 }
  let doneBatches = 0
  let stopped = null
  let model = '(미실행)'

  // 지갑은 프로젝트 1건 단위다 — 요청당 상한(기본 $0.5)을 프로젝트 전체가 아니라 한 프로젝트가 쓴다.
  await withLlmBudget(async () => {
    for (const batch of batches) {
      // 하드 캡(v32 30%): 진행 중 프로젝트라도 다음 묶음(= claude -p 1회)을 시작하지 않는다. 묶음마다 저장되므로 끊어도 저장이 갈리지 않는다.
      // llm.ts 하드 캡(setCliHardCap)은 여기 안 건다 — judgeRelevanceBatch 가 호출 오류를 '확인불가' 판정으로 저장하기 때문이다.
      const before = spendForCap(cliSpent(), guard.cfg.unitCostFallbackUsd)
      if (guarded && hardCapUsd != null && before != null && before >= hardCapUsd) {
        stopReason = 'hard_cap'
        stopped = `하드 캡 도달 — 묶음 ${batchesPlanned}개 중 ${batchesDone}개 처리 뒤 즉시 정지 · 사용 $${before.toFixed(3)} / 하드 캡 $${hardCapUsd.toFixed(2)}`
        break
      }
      if (Date.now() - startedAt >= deadlineMs) { deadlineHit = true; stopReason = 'deadline'; break }
      const out = await judgeRelevanceBatch(project, batch, examples)
      model = out.model
      if (out.quotaExhausted) {
        stopped = out.error ?? '한도/예산 소진'
        stopReason = 'quota'
        quotaProjectId = project.id // 재시도 슬롯이 이 프로젝트부터 다시 돈다
        quotaResetAt = parseQuotaResetAt(stopped, new Date())
        break
      }
      attemptedTotal += batch.length
      // 호출 오류(파싱 실패·CLI 실패)는 저장하지 않는다 — 'unknown' 으로 박으면 insert-only 라 다시는 안 채워진다. 빈 칸으로 남겨 다음 실행이 다시 판정한다.
      // (mock·라벨 누락 같은 "판정은 돌았는데 모름"은 오류가 아니라 그대로 unknown 저장.)
      if (out.error) {
        errorTotal += batch.length
        warn(`${project.id} 묶음 호출 오류 — ${batch.length}건 저장 안 함(다음 실행이 다시 판정): ${out.error}`)
        continue
      }
      for (const v of out.verdicts) counts[v.verdict] += 1

      const rows = out.verdicts.map((v) => ({
        input_id: v.input_id,
        project_id: project.id,
        verdict: v.verdict,
        model: out.model,
        ...(promptVersionColumn === 'absent' ? {} : { prompt_version: RELEVANCE_CRITERIA_VERSION }),
        judged_at: new Date().toISOString(),
        reason: v.reason,
        ...(infoColumn === 'absent' ? {} : { product_informative: v.product_informative }),
        ...(labelColumns === 'absent' ? {} : Object.fromEntries(LABEL_KEYS.map((k) => [k, v[k]]))),
      }))
      // human_verdict·human_graded_at 은 payload 에 없다(human_product_informative 도) — 재판정이 사람 채점을 덮지 않는다.
      // insert-only(ON CONFLICT DO NOTHING) — 이미 있는 판정(1차·2차·사람·자동 승인)은 절대 덮지 않는다. 돌려받은 행 = 실제로 새로 들어간 행.
      // 컬럼이 없으면(PGRST204 스키마 캐시에 없음 · 42703) 판정은 그대로 저장하고 **그 필드만** 버린다(saveWithColumnFallback — 순서 무관).
      // 조용히 넘기지 않는다 — "정보 판정 0건"·"라벨 0건"이 "모델이 못 달았다"로 읽히면 안 된다(§7.1).
      const cols = { promptVersion: promptVersionColumn, info: infoColumn, labels: labelColumns }
      const { data: insertedRows, error } = await saveWithColumnFallback((payload) => saveVerdictsInsertOnly(supabase, payload), rows, cols, LABEL_KEYS, warn)
      ;({ promptVersion: promptVersionColumn, info: infoColumn, labels: labelColumns } = cols)
      if (error) {
        errorTotal += rows.length
        saveFailed += 1
        console.error(`✗ ${project.id} 판정 저장 실패(${doneBatches + 1}번째 묶음): ${error.code ?? ''} ${error.message}`)
        stopped = `저장 실패: ${error.message}`
        stopReason = 'save_failed'
        break
      }
      // 실제로 들어간 행만 센다. 이미 판정이 있던 행은 DB 가 건너뛴다(덮지 않음) — 0 이 아니면 거르기(pendingFor)와 DB 가 어긋난 것.
      const inserted = Array.isArray(insertedRows) ? insertedRows.length : rows.length
      if (inserted < rows.length) warn(`${project.id} 이미 판정 있는 ${rows.length - inserted}건은 건너뜀(덮어쓰기 안 함)`)
      if (promptVersionColumn === 'unknown') promptVersionColumn = 'present'
      judgedTotal += inserted
      if (infoColumn !== 'absent') {
        infoColumn = 'present'
        informativeTotal += out.verdicts.filter((v) => v.product_informative !== null).length
      }
      if (labelColumns !== 'absent') {
        labelColumns = 'present'
        labeledTotal += out.verdicts.filter((v) => LABEL_KEYS.some((k) => v[k] !== null)).length
      }
      doneBatches += 1
      batchesDone += 1 // 저장 성공 뒤에만 센다 — 저장 실패 묶음을 "처리"로 세지 않는다
    }
  })

  const left = pending.reviews.length - doneBatches * BATCH_SIZE
  if (stopped) {
    blocker = blocker ?? stopped
    warn(`${project.id} 에서 멈췄다(${doneBatches}/${batches.length}번째 묶음, 남은 ${Math.max(0, left)}건은 내일). 사유: ${stopped}`)
    await tracker.step({
      stepKey: `relevance-${project.id}`, label: `판정 ${project.id}`, status: 'blocked', seq,
      blocker: stopped, counts, detail: { batches: batches.length, done: doneBatches, examples: examples.length },
    })
    // 한도라면 다음 프로젝트도 같은 결과다. 여기서 이번 실행을 끝낸다.
    break
  }

  log(`✓ ${project.id} — 관련 ${counts.relevant} · 무관 ${counts.irrelevant} · 확인불가 ${counts.unknown} (${batches.length}회 호출 · 예시 ${examples.length}건 · model=${model})`)
  await tracker.step({
    stepKey: `relevance-${project.id}`, label: `판정 ${project.id}`, status: 'ok', seq,
    counts, detail: { batches: batches.length, examples: examples.length, model },
  })
}

const spent = dailySpent()
const status = blocker ? 'blocked' : saveFailed > 0 ? 'partial' : 'ok'
const cli = cliSpent()
const session = sessionBlock({ job: 't2', cfg: guard.cfg, caps, spentUsd: cli.usd, spentForCapUsd: spendForCap(cli, guard.cfg.unitCostFallbackUsd), calls: cli.calls, costUnknownCalls: cli.unknown, window5h, weekUsd, capped: stopReason === 'session_cap' || stopReason === 'hard_cap' })
log(sessionLine(session))

// ── 4. 자기 호출 체인(전량 판정) — 다음 실행을 부를지. 부르는 것은 워크플로 relaunch job(GITHUB_OUTPUT relaunch=true 일 때만) ──
// 남은 미판정: 원문을 못 읽은 프로젝트가 있으면 이번에 본 쪽이 0 이어도 "다 채웠다"고 하지 않는다(확인 불가 → 멈춤, §7.1).
const unjudgedAfter = Math.max(0, unjudgedBefore - judgedTotal)
const chain = decideRelaunch({
  dry: false, enabled: chainEnabled, now: new Date(), untilMs: guard.cfg.relevanceCapUntilMs, stopReason,
  attempted: attemptedTotal, errors: errorTotal, judged: judgedTotal,
  remaining: unjudgedAfter === 0 && unknownCount > 0 ? null : unjudgedAfter,
  hop: chainHop, maxHops: chainMaxHops, zeroStreak: chainZero, zeroLimit: CHAIN_DEFAULT_ZERO_LIMIT,
  weeklyPct: session.week_usd_lower_bound == null || guard.cfg.usdPerWeeklyPct == null ? null : Number((session.week_usd_lower_bound / guard.cfg.usdPerWeeklyPct).toFixed(2)),
  weeklyStopPct: chainWeeklyStopPct(guard.cfg, new Date()),
  window5hPct: session.window5h_pct, window5hStopPct: guard.cfg.relevanceChainWindow5hStopPct,
  // 오늘 한정 완화(남헌 v61) — relax_until 이 지나면 decideRelaunch 가 원래 동작(주간·5시간 창 확인 불가 정지·90분 휴식·hop 24)으로 돌아간다.
  relaxUntilMs: guard.cfg.relevanceRelaxUntilMs,
})
log(`체인 ${chain.relaunch ? '이어감' : '멈춤'} — ${chain.reason} · 미판정 ${unjudgedBefore} → ${unjudgedAfter} · 시도 ${attemptedTotal} · 오류 ${errorTotal}${deadlineHit ? ' · 마감 도달' : ''}`)
if (!chain.relaunch && unjudgedAfter > 0 && !/드라이런|RELEVANCE_CHAIN=off|만료|relevance_cap_until 없음/.test(chain.reason)) warn(`체인이 미판정 ${unjudgedAfter}건을 남기고 멈췄다 — ${chain.reason}. 다음 크론(KST 04:03)이 다시 시작한다`)
setOutput('relaunch', chain.relaunch ? 'true' : 'false')
setOutput('wait_min', String(chain.waitMin))
setOutput('next_hop', String(chain.nextHop))
setOutput('next_zero', String(chain.nextZeroStreak))

await tracker.finish({
  status,
  summary: {
    projects: targets.length, judged: judgedTotal, remaining, blocker,
    unjudged_before: unjudgedBefore, unjudged_after: unjudgedAfter, excluded_sources: excludedSources, excluded_inputs: excludedTotal,
    attempted: attemptedTotal, errors: errorTotal, prompt_version: RELEVANCE_CRITERIA_VERSION, prompt_version_column: promptVersionColumn,
    caps: { boosted: caps.boosted, relaxed: caps.relaxed, cap_usd: capUsd, hard_cap_usd: caps.hardCapUsd, until: caps.untilMs ? new Date(caps.untilMs).toISOString() : null },
    chain: { hop: chainHop, relaunch: chain.relaunch, reason: chain.reason, next_hop: chain.nextHop, next_zero_streak: chain.nextZeroStreak, wait_min: chain.waitMin },
    // 상한·한도로 멈췄으면 몇 개째였는지(§7.2). quota_reset_at 은 재시도 슬롯(r1·r2)이 읽는다.
    stop_reason: stopReason, quota_reset_at: quotaResetAt, quota_project: quotaProjectId, batches_done: batchesDone, batches_planned: batchesPlanned, slot, session,
    label_columns: labelColumns, labeled: labelColumns === 'present' ? labeledTotal : null,
    info_column: infoColumn, informative_answered: infoColumn === 'present' ? informativeTotal : null,
    est_usd: Number(spent.spentUsd.toFixed(4)), llm_calls: spent.calls,
  },
})

log(`끝 — 판정 ${judgedTotal}건 · 라벨 ${labelColumns === 'present' ? `${labeledTotal}건` : labelColumns === 'absent' ? '미기록(마이그 미적용)' : '확인 불가(저장 0회)'} · 정보 판정 ${infoColumn === 'present' ? `${informativeTotal}건` : infoColumn === 'absent' ? '미기록(마이그 000031 미적용)' : '확인 불가(저장 0회)'} · 남은 프로젝트 ${remaining}건 · 이번 실행 추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD}) · 상태 ${status}`)
if (!tracker.dbOk) warn('실행 상태를 agent_runs 에 남기지 못했다 — ops/state 폴백. 이 실행의 기록은 "DB 확인 불가"다')

// v30 §5: 마지막 재시도까지 한도면 exit 1 — cron-watchdog 가 그 슬롯 실패를 Notion 일일 상태 로그로 올린다(기존 경로, 새 시크릿 없음).
// r2 는 그날 마지막 재시도 자리라, 앞 재시도가 "아직 이르다"로 쉬었어도 여기서 한도면 경보한다.
const retriesExhausted = stopReason === 'quota' && retry != null && ((retry.retriesDone ?? 0) + 1 >= MAX_RETRIES || slot === 'r2')
if (retriesExhausted) {
  const m = `T2 가 한도 정지 뒤 오늘 마지막 재시도(${slot}, ${(retry.retriesDone ?? 0) + 1}/${MAX_RETRIES})도 한도로 멈췄다 — 묶음 ${batchesDone}/${batchesPlanned}개. 남은 판정은 내일 정규 실행. 사람이 볼 것`
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${m}`)
  console.error(`✗ ${m}`)
}
process.exit(saveFailed > 0 ? 3 : retriesExhausted ? 1 : 0)
