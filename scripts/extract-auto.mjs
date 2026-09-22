#!/usr/bin/env node
// 야간 자동 extract (GitHub Actions 진입점) — 신규 리뷰가 충분히 쌓인 프로젝트만 골라 추출한다.
//
// 남헌 2026-09-23 확정: "신규 리뷰 100건 이상 프로젝트만, 일 $5 상한 안에서, Gemini 429 면 다음 날로."
// 배경·근거: reports/2026-09-23/data-velocity-plan.md §1 Q1 · §6.
//
// 왜 Vercel cron 이 아니라 Actions 인가(2026-09-23 판단):
//   1. extract 1건이 함수 상한(maxDuration 300초)에 가깝다. 한 번의 cron 호출로 N건(기본 3)을
//      돌 수 없어 "1건만 트리거" 구조가 되는데, 그러면 하루 1건이다.
//   2. Vercel cron 라우트를 새로 열려면 `lib/auth/policy.ts` PUBLIC_PREFIXES 에 `/api/cron` 을
//      추가해야 한다 = 인증 경계 확장(CLAUDE.md §10.2 사람 판단 예외). 여기서는 안 건드린다.
//   3. 운영 CLI(`scripts/analyze-extract-run.mjs`)·야간 수집 워크플로와 같은 패턴을 그대로 쓴다.
//   대가: GEMINI_API_KEY 를 GitHub Secrets 에 등록하는 것이 사람 몫으로 남는다. 없으면
//   이 스크립트는 **아무것도 하지 않고 멈춘다**(조용히 도는 것보다 시끄럽게 닫힌다).
//
// 사용:
//   node scripts/extract-auto.mjs --dry      # 대상 선정만. LLM·DB 쓰기 없음
//   node scripts/extract-auto.mjs            # 실제 추출 (LLM 비용 발생)
//
// 종료코드: 0 정상(대상 0건·한도 도달 포함) · 2 설정/조회 실패 · 3 추출 실패 1건 이상
//   한도(429/예산)로 멈춘 것은 실패가 아니라 **확인 대상**이라 0 으로 끝내되
//   `::warning::` 애노테이션과 agent_runs.status='blocked' 로 남긴다(CLAUDE.md §7.2).

import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { withLlmBudget, DAILY_BUDGET_USD, dailySpent } from '../lib/analysis/budget.ts'
import { claimExtraction, runExtraction } from '../lib/analysis/extract-run.ts'
import {
  autoMaxProjects,
  autoMinNew,
  describePick,
  pickAutoTargets,
} from '../lib/analysis/extract-auto.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const minNew = autoMinNew()
const max = autoMaxProjects()

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => {
  // GitHub 이 제공하는 세 번째 상태. 빨간 X(실패)도 초록(정상)도 아닌 것을 그대로 표시한다.
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`)
  log(`⚠️ ${m}`)
}

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (!dry && requiredKey && !process.env[requiredKey]) {
  console.error(`✗ ${requiredKey} 가 없다(provider=${provider}). 추출을 시작하지 않는다 — 시크릿을 등록하라.`)
  process.exit(2)
}

const supabase = await createClient()
if (!supabase) {
  console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  process.exit(2)
}

log(`야간 자동 extract ${dry ? '(--dry: 대상 선정만)' : ''} — provider=${provider} · 신규 기준 ${minNew}건 · 실행 상한 ${max}건 · 일 예산 $${DAILY_BUDGET_USD}`)

// ── 1. 후보 = status='collecting' ────────────────────────────────
// failed 는 자동으로 다시 돌리지 않는다. 같은 원인으로 매일 밤 재시도하면 쿼터만 태운다.
const { data: projects, error: projectsError } = await supabase
  .from('analysis_projects')
  // business_model 은 대상 **순서**를 가른다 — SaaS 가 먼저다(pickAutoTargets, 남헌 2026-09-23).
  .select('id, extract_finished_at, extract_attempts, product_elevator_pitch, business_model')
  .eq('status', 'collecting')

if (projectsError) {
  console.error(`✗ 프로젝트 조회 실패: ${projectsError.message}`)
  process.exit(2)
}

// ── 2. 프로젝트별 "마지막 추출 이후 신규 입력" 수 ────────────────
const candidates = []
for (const p of projects ?? []) {
  let q = supabase
    .from('analysis_inputs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', p.id)
    .is('purged_at', null)
  // 한 번도 안 돌린 프로젝트(extract_finished_at null)는 전체가 신규다.
  if (p.extract_finished_at) q = q.gt('created_at', p.extract_finished_at)
  const { count, error } = await q
  if (error) {
    // 조회 실패를 "신규 0건" 으로 접지 않는다(§7.1). null 로 넘겨 따로 센다.
    console.error(`⚠️ 신규 입력 수 확인 불가 project=${p.id}: ${error.message}`)
    candidates.push({ projectId: p.id, newInputs: null, label: p.product_elevator_pitch, businessModel: p.business_model })
    continue
  }
  candidates.push({ projectId: p.id, newInputs: count ?? 0, label: p.product_elevator_pitch, businessModel: p.business_model })
}

const pick = pickAutoTargets(candidates, { minNew, max })
log(`후보 collecting ${candidates.length}건 → ${describePick(pick, minNew, max)} (순서: SaaS 우선 → 신규 많은 순)`)
for (const t of pick.targets) log(`  · ${t.projectId} [${t.businessModel ?? '미기재'}] 신규 ${t.newInputs}건 — ${t.label ?? '(소개 없음)'}`)
if (pick.unknown > 0) warn(`신규 입력 수를 세지 못한 프로젝트 ${pick.unknown}건 — 대상 판정에서 빠졌다(0건이라는 뜻이 아니다)`)

if (dry) {
  log('--dry: 여기서 끝낸다. 잠금·LLM 호출·DB 쓰기 없음.')
  process.exit(0)
}

// ── 3. 실행 상태 기록 (기존 헬퍼 재사용: agent_runs / agent_run_steps) ──
const tracker = await createTracker({
  runKey: `extract-auto-${kstDate()}`,
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
  counts: { candidates: candidates.length, eligible: pick.eligible, targets: pick.targets.length, remaining: pick.remaining, unknown: pick.unknown },
  detail: { min_new: minNew, max_projects: max },
})

// ── 4. 순차 추출. 한도에 걸리면 그 자리에서 멈춘다(다음 날로) ────
let done = 0
let failed = 0
let blocker = null
let seq = 1

for (const target of pick.targets) {
  seq += 1
  const claim = await claimExtraction(supabase, target.projectId, false)
  if (!claim.ok) {
    // 다른 실행이 잡았거나 상태가 바뀐 것. 실패로 세지 않는다.
    log(`- ${target.projectId} 건너뜀(${claim.httpStatus}): ${claim.error}`)
    await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'skipped', seq, detail: { reason: claim.error, http: claim.httpStatus } })
    continue
  }

  const t0 = Date.now()
  const out = await withLlmBudget(() => runExtraction(supabase, target.projectId, provider))
  const secs = Math.round((Date.now() - t0) / 1000)

  if (out.ok) {
    done += 1
    log(`✓ ${target.projectId} ${secs}s — 속성 ${out.aspects}개 · 입력 ${out.inputs}건 · 선별 밖 ${out.droppedInputs}건 · 목적 무관 제외 ${out.droppedIrrelevant}건 · model=${out.model}`)
    await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'ok', seq, counts: { aspects: out.aspects, inputs: out.inputs, dropped: out.droppedInputs, irrelevant: out.droppedIrrelevant }, detail: { model: out.model, seconds: secs } })
    continue
  }

  if (out.quotaExhausted) {
    blocker = `LLM 한도/예산 소진 — ${out.error}`
    warn(`${target.projectId} 에서 한도에 걸려 이번 실행을 멈춘다. 남은 대상 ${pick.targets.length - seq + 1}건은 내일 돈다. (${out.error})`)
    await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'blocked', seq, blocker, detail: { seconds: secs } })
    break
  }

  failed += 1
  console.error(`✗ ${target.projectId} ${secs}s 추출 실패: ${out.error} — analysis_projects.status=failed 로 기록됨`)
  await tracker.step({ stepKey: `extract-${target.projectId}`, label: `추출 ${target.projectId}`, status: 'failed', seq, detail: { error: out.error, seconds: secs } })
}

const spent = dailySpent()
const status = blocker ? 'blocked' : failed > 0 ? (done > 0 ? 'partial' : 'failed') : 'ok'
await tracker.finish({
  status,
  summary: { targets: pick.targets.length, done, failed, remaining: pick.remaining, blocker, est_usd: Number(spent.spentUsd.toFixed(4)), llm_calls: spent.calls },
})

log(`끝 — 추출 ${done}건 · 실패 ${failed}건 · 남은 대상 ${pick.remaining}건 · 이번 실행 추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD}) · 상태 ${status}`)
if (!tracker.dbOk) warn('실행 상태를 agent_runs 에 남기지 못했다 — ops/state 폴백. 이 실행의 기록은 "DB 확인 불가"다')

process.exit(failed > 0 ? 3 : 0)
