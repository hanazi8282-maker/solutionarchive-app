#!/usr/bin/env node
// 야간 리뷰 관련성 판정(T2) — 수집한 원문 표본이 프로젝트 목적에 맞는지 LLM 이 3상태로 채점한다.
//
// 남헌 2026-09-23 확정: "AI 관련성 판정은 Gemini, 야간 배치"
// (reports/2026-09-23/data-velocity-plan.md §1 Q5 · §2 T2).
//
// 무엇을 하나
//   1. status='collecting' 프로젝트에서 T1 선별(selectInputs)을 통과한 상위 N건(기본 200)을 고른다.
//   2. 그중 **아직 판정이 없는 것**만, 프로젝트당 1회 돈다(리뷰 20건씩 묶어 호출).
//   3. 최근 사람 채점(human_verdict) 최대 10건을 few-shot 으로 프롬프트에 넣는다(그 프로젝트 우선).
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
// 종료코드: 0 정상(대상 0건·한도 도달 포함) · 2 설정/조회 실패 · 3 저장 실패 1건 이상

import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { withLlmBudget, DAILY_BUDGET_USD, dailySpent } from '../lib/analysis/budget.ts'
import { selectInputs } from '../lib/analysis/extract-select.ts'
// 대상 순서는 야간 extract 와 같은 규칙을 쓴다(SaaS 우선 → 많은 순 → projectId).
import { compareAutoPriority } from '../lib/analysis/extract-auto.ts'
import {
  BATCH_SIZE,
  MAX_EXAMPLES,
  MAX_REVIEW_CHARS,
  chunkReviews,
  judgeRelevanceBatch,
} from '../lib/analysis/relevance-judge.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const dry = args.includes('--dry')

const num = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
/** 프로젝트당 판정할 표본 크기(T1 통과분 상위). */
const sampleSize = num(process.env.RELEVANCE_SAMPLE, 200)
/** 하루에 돌 최대 프로젝트 수. */
const maxProjects = num(process.env.RELEVANCE_MAX_PROJECTS, 5)

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

log(`야간 관련성 판정 ${dry ? '(--dry: 대상 선정만)' : ''} — provider=${provider} · 표본 ${sampleSize}건/프로젝트 · 프로젝트 상한 ${maxProjects}건 · 일 예산 $${DAILY_BUDGET_USD}`)

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
const PROJECT_COLS = 'id, product_elevator_pitch, purpose, business_model'
const projectQuery = (cols) =>
  supabase
    .from('analysis_projects')
    // business_model 은 순서를 가른다 — SaaS 가 먼저다(compareAutoPriority, 남헌 2026-09-23).
    .select(cols)
    .eq('status', 'collecting')
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

/** 이 프로젝트에서 판정할 리뷰 목록. 실패는 null 로 올려 "0건" 과 가른다(§7.1). */
async function pendingFor(project) {
  const { data: inputs, error } = await supabase
    .from('analysis_inputs')
    .select('id, raw_text, created_at, collected_at')
    .eq('project_id', project.id)
    .is('purged_at', null)
  if (error) {
    console.error(`⚠️ 원문 조회 실패 project=${project.id}: ${error.message}`)
    return null
  }
  if (!inputs || inputs.length === 0) return { total: 0, reviews: [] }

  // T1 과 같은 선별기를 쓴다 — 판정 표본과 extract 가 보는 집합이 갈라지면 판정이 헛돈다.
  const selected = selectInputs(inputs).selected.slice(0, sampleSize)

  const { data: judged, error: judgedError } = await supabase
    .from('review_relevance_verdicts')
    .select('input_id')
    .eq('project_id', project.id)
  if (judgedError) {
    // 판정 캐시를 못 읽었는데 그대로 돌리면 이미 판정한 것을 다시 태운다. 건너뛴다.
    console.error(`⚠️ 판정 캐시 조회 실패 project=${project.id}: ${judgedError.message}`)
    return null
  }
  const done = new Set((judged ?? []).map((r) => r.input_id))

  return {
    total: selected.length,
    reviews: selected
      .filter((s) => !done.has(s.input.id))
      .map((s) => ({ input_id: s.input.id, text: s.text.slice(0, MAX_REVIEW_CHARS) })),
  }
}

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

const candidates = []
for (const p of projects ?? []) {
  const pending = await pendingFor(p)
  if (pending === null) {
    candidates.push({ project: p, pending: null })
    continue
  }
  if (pending.reviews.length === 0) continue
  candidates.push({ project: p, pending })
}

const unknownCount = candidates.filter((c) => c.pending === null).length
// SaaS 우선 → 미판정 많은 순 → projectId. extract 와 같은 헬퍼를 쓴다.
const ready = candidates
  .filter((c) => c.pending !== null)
  .sort((a, b) =>
    compareAutoPriority(
      { projectId: a.project.id, newInputs: a.pending.reviews.length, businessModel: a.project.business_model },
      { projectId: b.project.id, newInputs: b.pending.reviews.length, businessModel: b.project.business_model },
    ),
  )
const targets = ready.slice(0, maxProjects)
const remaining = ready.length - targets.length

log(
  `collecting ${(projects ?? []).length}건 → 판정 대상 프로젝트 ${ready.length}건` +
    (remaining > 0 ? ` 중 ${targets.length}건 실행 (상한 ${maxProjects}건 도달, 남은 ${remaining}건은 다음 실행)` : ' 전부 실행') +
    ' (순서: SaaS 우선 → 미판정 많은 순)',
)
for (const t of targets) {
  log(`  · ${t.project.id} [${t.project.business_model ?? '미기재'}] 미판정 ${t.pending.reviews.length}건 / 표본 ${t.pending.total}건 — ${t.project.product_elevator_pitch ?? '(소개 없음)'}`)
}
if (unknownCount > 0) warn(`원문·판정 캐시를 읽지 못한 프로젝트 ${unknownCount}건 — 대상 판정에서 빠졌다(판정할 게 없다는 뜻이 아니다)`)

if (dry) {
  log('--dry: 여기서 끝낸다. LLM 호출·DB 쓰기 없음.')
  process.exit(0)
}

// ── 2. 실행 상태 기록 (기존 헬퍼 재사용) ─────────────────────────
const tracker = await createTracker({
  runKey: `relevance-judge-${kstDate()}`,
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
  counts: { projects: (projects ?? []).length, targets: targets.length, remaining, unknown: unknownCount },
  detail: { sample: sampleSize, max_projects: maxProjects, batch: BATCH_SIZE },
})

// ── 3. 프로젝트별 판정 ───────────────────────────────────────────
let judgedTotal = 0
let saveFailed = 0
// T2 라벨 컬럼(20260930000014) 존재 3상태 — 'unknown' 은 첫 저장 전, 'absent' 면 라벨 없이 저장한다.
let labelColumns = 'unknown'
let labeledTotal = 0
const LABEL_KEYS = ['impact', 'frequency', 'community_signal', 'wtp_mentioned']
let blocker = null
let seq = 1

for (const { project, pending } of targets) {
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
      const out = await judgeRelevanceBatch(project, batch, examples)
      model = out.model
      if (out.quotaExhausted) {
        stopped = out.error ?? '한도/예산 소진'
        break
      }
      for (const v of out.verdicts) counts[v.verdict] += 1

      const rows = out.verdicts.map((v) => ({
        input_id: v.input_id,
        project_id: project.id,
        verdict: v.verdict,
        model: out.model,
        judged_at: new Date().toISOString(),
        reason: v.reason,
        ...(labelColumns === 'absent' ? {} : Object.fromEntries(LABEL_KEYS.map((k) => [k, v[k]]))),
      }))
      // human_verdict·human_graded_at 은 payload 에 없다 — 재판정이 사람 채점을 덮지 않는다.
      const save = (payload) => supabase.from('review_relevance_verdicts').upsert(payload, { onConflict: 'input_id' })
      let { error } = await save(rows)
      // 라벨 컬럼이 없으면(PGRST204 스키마 캐시에 없음 · 42703) 판정은 그대로 저장하고 라벨만 버린다.
      // 조용히 넘기지 않는다 — "라벨 0건"이 "모델이 라벨을 못 달았다"로 읽히면 안 된다(§7.1).
      if (error && labelColumns !== 'absent' && (error.code === 'PGRST204' || error.code === '42703')) {
        labelColumns = 'absent'
        warn(`라벨 미기록(마이그 미적용) — review_relevance_verdicts 에 라벨 컬럼이 없다(${error.code}). 20260930000014 적용 전까지 verdict·reason 만 저장한다.`)
        ;({ error } = await save(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !LABEL_KEYS.includes(k))))))
      }
      if (error) {
        saveFailed += 1
        console.error(`✗ ${project.id} 판정 저장 실패(${doneBatches + 1}번째 묶음): ${error.code ?? ''} ${error.message}`)
        stopped = `저장 실패: ${error.message}`
        break
      }
      judgedTotal += rows.length
      if (labelColumns !== 'absent') {
        labelColumns = 'present'
        labeledTotal += out.verdicts.filter((v) => LABEL_KEYS.some((k) => v[k] !== null)).length
      }
      doneBatches += 1
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
await tracker.finish({
  status,
  summary: {
    projects: targets.length, judged: judgedTotal, remaining, blocker,
    label_columns: labelColumns, labeled: labelColumns === 'present' ? labeledTotal : null,
    est_usd: Number(spent.spentUsd.toFixed(4)), llm_calls: spent.calls,
  },
})

log(`끝 — 판정 ${judgedTotal}건 · 라벨 ${labelColumns === 'present' ? `${labeledTotal}건` : labelColumns === 'absent' ? '미기록(마이그 미적용)' : '확인 불가(저장 0회)'} · 남은 프로젝트 ${remaining}건 · 이번 실행 추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD}) · 상태 ${status}`)
if (!tracker.dbOk) warn('실행 상태를 agent_runs 에 남기지 못했다 — ops/state 폴백. 이 실행의 기록은 "DB 확인 불가"다')

process.exit(saveFailed > 0 ? 3 : 0)
