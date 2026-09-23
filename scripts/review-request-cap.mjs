#!/usr/bin/env node
// review_sources.daily_request_cap 자동 계산·반영.
//
// 사용:
//   node scripts/review-request-cap.mjs --dry              # 판정만 (DB 안 바꾼다)
//   node scripts/review-request-cap.mjs                    # apply 건만 반영
//   node scripts/review-request-cap.mjs --source clien     # 한 소스만
//   node scripts/review-request-cap.mjs --source=clien     # 같은 뜻
//
// 계산은 전부 `lib/review/request-cap.ts` 의 순수함수다. 이 파일은 DB 에서 숫자를
// 긁어 넣고, 판정 표를 찍고, `apply` 건만 UPDATE 하고 로그를 남긴다.
//
// ⚠️ **CLAUDE.md §10.1 의 예외를 집행하는 자리다.** 무인 루프는 `review_sources` 를
//    UPDATE 하지 않는 것이 원칙이고, 남헌 2026-09-24 지시로 `daily_request_cap`
//    한 컬럼에만 예외를 뒀다. 이 파일이 지키는 세 조건:
//      1) 컬럼 1개 — update() 페이로드에 daily_request_cap 만 들어간다.
//      2) 상한 2배 이내 — `apply` 판정만 반영한다(request-cap.ts). 반영 직전에 한 번 더 단정한다.
//      3) 감사 로그 필수 — `review_source_cap_log` 가 없으면 **한 건도 반영하지 않는다.**
//         로그 없는 변경을 만들지 않는 것이 이 예외의 조건이다.
//    `hold` 는 DB 를 건드리지 않고 `ops/state/request-cap/YYYY-MM-DD.md` + 로그 행으로 남긴다.
//
// ⚠️ 상한을 **내리지 않는다**(request-cap.ts planSourceCap 주석). 올리는 쪽만 자동이다.
//
// ⛔ 트리거는 `nightly-review-collect.yml` 의 pre-step 이다 — 그 잡의 permissions 는
//    `contents: read` 라 여기서 쓴 `ops/state/` 파일은 **커밋되지 않고 사라진다.**
//    그 경로에서 hold 의 실질적 기록은 (a) Actions 로그의 판정 표와 (b) 로그 테이블의
//    `new_cap IS NULL` 행이다. 파일은 사람이 로컬에서 돌릴 때 남는다.
//    ponytail: 커밋하려면 권한을 넓혀야 하는데 그 잡을 read 로 좁혀 둔 것이 의도된
//    경계다(워크플로 머리말). hold 를 파일로 꼭 쌓아야 하면 별도 잡으로 뗀다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '../lib/supabase/server.ts'
import {
  classifyTargetRef,
  countCronSchedules,
  formatPlanTable,
  planCaps,
} from '../lib/review/request-cap.ts'
import { kstDate } from './notion-status-log.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..')

/** 하루 실행 횟수의 출처. 이 파일 하나만 본다 — 수집을 도는 워크플로가 이것뿐이다. */
const WORKFLOW = path.join(repo, '.github', 'workflows', 'nightly-review-collect.yml')

/** 없는 테이블. PostgREST 와 Postgres 가 각각 다른 코드를 준다(lib/agents/status.ts 와 같은 집합). */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202'])

/** PostgREST 한 번에 오는 최대 행. 이보다 많으면 쪼개 읽는다(아래 fetchAllTargets). */
const PAGE = 1000

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const sourceFilter = (() => {
  const eq = args.find((a) => a.startsWith('--source='))
  if (eq) return eq.slice('--source='.length).trim() || null
  const i = args.indexOf('--source')
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].trim() : null
})()

const fail = (msg) => {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

// ── 1) 하루 실행 횟수 — 못 읽으면 여기서 멈춘다(§7.1) ──────────────
let runsPerDay = null
try {
  runsPerDay = countCronSchedules(fs.readFileSync(WORKFLOW, 'utf8'))
} catch (e) {
  fail(`워크플로 파일을 읽지 못했다(${WORKFLOW}): ${e.message}. 하루 실행 횟수를 확인할 수 없어 계산하지 않는다.`)
}
if (runsPerDay === null) {
  fail(
    `${path.relative(repo, WORKFLOW)} 의 schedule cron 개수를 확인할 수 없다. ` +
      `하루 실행 횟수를 모르면 수요를 계산할 수 없다 — "확인 불가" 로 멈춘다(CLAUDE.md §7.1). ` +
      `스케줄을 의도적으로 뺀 것이라면 이 스크립트도 의미가 없다.`,
  )
}
console.log(`하루 실행 횟수 ${runsPerDay}회 (${path.relative(repo, WORKFLOW)} 의 cron 개수)`)

// ── 2) DB 집계 ────────────────────────────────────────────────
const supabase = await createClient()
if (!supabase) {
  fail('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다. DB 집계를 할 수 없다.')
}

const { data: sourceRows, error: srcErr } = await supabase
  .from('review_sources')
  .select('key, enabled, daily_request_cap')
  .order('key')
if (srcErr) fail(`소스 조회 실패: ${srcErr.message}`)

// 꺼진 소스는 요청을 한 건도 안 쓴다(runner.ts: enabled=false 면 즉시 skip). 수요가 0 인
// 것과 "계산 대상이 아닌 것"을 섞지 않으려고 아예 제외하고, 몇 개를 뺐는지 적는다.
const enabled = sourceRows.filter((s) => s.enabled)
const targetKeys = sourceFilter ? enabled.filter((s) => s.key === sourceFilter) : enabled
if (sourceFilter && targetKeys.length === 0) {
  fail(
    `소스 '${sourceFilter}' 를 찾지 못했다(또는 꺼져 있다). ` +
      `활성 소스: ${enabled.map((s) => s.key).join(', ') || '없음'}`,
  )
}
console.log(
  `소스 ${sourceRows.length}개 중 활성 ${enabled.length}개` +
    (sourceFilter ? ` · --source=${sourceFilter} 로 1개만 본다` : ''),
)

/**
 * active 타깃 전부. **쪼개 읽는다** — PostgREST 기본 상한(1000)에 걸려 잘리면
 * 수요를 과소평가하고, 그 결과는 "상한이 모자라 조용히 잘림" 이다(§7.1).
 */
async function fetchAllTargets(keys) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('review_targets')
      .select('source_key, product_ref')
      .eq('status', 'active')
      .order('id')
      .range(from, from + PAGE - 1)
    if (keys) q = q.in('source_key', keys)
    const { data, error } = await q
    if (error) fail(`타깃 조회 실패: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

const keys = targetKeys.map((s) => s.key)
const targets = await fetchAllTargets(sourceFilter ? keys : null)

const counts = new Map(keys.map((k) => [k, { post: 0, board: 0 }]))
for (const t of targets) {
  const c = counts.get(t.source_key)
  if (!c) continue // 꺼진 소스이거나 --source 밖이다
  if (classifyTargetRef(t.product_ref) === 'board') c.board++
  else c.post++
}

const plans = planCaps(
  targetKeys.map((s) => ({
    sourceKey: s.key,
    postTargets: counts.get(s.key).post,
    boardTargets: counts.get(s.key).board,
    currentCap: s.daily_request_cap,
  })),
  runsPerDay,
)

console.log(`\n${formatPlanTable(plans)}\n`)

const applies = plans.filter((p) => p.verdict === 'apply')
const holds = plans.filter((p) => p.verdict === 'hold')
console.log(`판정: 반영 ${applies.length}건 · 보류 ${holds.length}건 · 유지 ${plans.length - applies.length - holds.length}건`)
for (const p of [...applies, ...holds]) console.log(`  · ${p.sourceKey}: ${p.reason}`)

// ── 3) 보류 건은 파일로 (사유·권장값) ──────────────────────────
if (holds.length > 0 && !dryRun) {
  const dir = path.join(repo, 'ops', 'state', 'request-cap')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${kstDate()}.md`)
  const body = [
    `# 요청 상한 보류 — ${kstDate()} (KST)`,
    '',
    `하루 실행 ${runsPerDay}회 기준. 권장값이 현재 상한의 2배를 넘어 **자동 반영 범위 밖**이다.`,
    '사람이 판단한다 — 상한을 올릴지, 타깃을 줄일지, 그 소스를 잠시 끌지.',
    '',
    '| 소스 | 글 타깃 | 게시판 타깃 | 수요 | 권장 | 현재 | 사유 |',
    '|---|---|---|---|---|---|---|',
    ...holds.map(
      (p) =>
        `| ${p.sourceKey} | ${p.postTargets} | ${p.boardTargets} | ${p.need} | ${p.recommended} | ${p.currentCap} | ${p.reason} |`,
    ),
    '',
  ].join('\n')
  fs.writeFileSync(file, body, 'utf8')
  console.log(`\n보류 ${holds.length}건 → ${path.relative(repo, file)}`)
} else if (holds.length > 0) {
  console.log('\n(--dry 라 보류 파일을 쓰지 않았다)')
}

if (dryRun) {
  console.log('\n--dry: DB 를 바꾸지 않았다. 위 표는 판정일 뿐이다.')
  process.exit(0)
}

if (applies.length === 0 && holds.length === 0) {
  console.log('\n반영할 것이 없다(전부 유지).')
  process.exit(0)
}

// ── 4) 감사 로그 테이블 확인 — 없으면 한 건도 반영하지 않는다 ─────
//
// ⚠️ 존재 확인은 **GET + 에러 코드**로 한다. PostgREST `head:true` 는 없는 테이블에도
//    204 를 준다 — 그걸 믿으면 "있다"로 접힌다(§7.1, 과거 사고 3번).
const probe = await supabase.from('review_source_cap_log').select('id').limit(1)
if (probe.error) {
  if (MISSING_TABLE_CODES.has(probe.error.code)) {
    console.log(
      '\n⚠️ 로그 테이블 미적용이라 반영 안 함 — supabase/migrations/20260930000011_review_source_cap_log.sql 을 적용해야 한다.\n' +
        '   (감사 로그 없는 상한 변경은 이 예외의 조건 밖이다. 위 판정 표는 그대로 유효하다.)',
    )
    process.exit(0)
  }
  fail(`로그 테이블 조회 실패: ${probe.error.message} (code=${probe.error.code ?? '없음'})`)
}

const appliedBy = process.env.GITHUB_ACTIONS
  ? `workflow:${process.env.GITHUB_WORKFLOW ?? '?'}`
  : 'local'

const logRow = async (p, newCap, reason) => {
  const { error } = await supabase.from('review_source_cap_log').insert({
    source_key: p.sourceKey,
    previous_cap: p.currentCap,
    new_cap: newCap,
    need: p.need,
    recommended: p.recommended,
    reason,
    applied_by: appliedBy,
  })
  if (error) throw new Error(`감사 로그 기록 실패(${p.sourceKey}): ${error.message}`)
}

// 보류도 로그에 남긴다 — `new_cap IS NULL` = "판정했고 반영하지 않았다".
// 성공만 남기면 "왜 안 올랐나" 를 나중에 알 자리가 없다.
for (const p of holds) {
  try {
    await logRow(p, null, `보류(자동 반영 범위 밖) — ${p.reason}`)
  } catch (e) {
    console.error(`⚠️ ${e.message}`)
  }
}

let done = 0
for (const p of applies) {
  // 방어 단정. 판정 로직이 바뀌어도 2배 초과가 UPDATE 로 새지 않게 여기서 한 번 더 막는다.
  if (p.recommended > p.currentCap * 2 || p.recommended <= p.currentCap) {
    console.error(`⚠️ ${p.sourceKey}: 반영 범위를 벗어난 판정이라 건너뛴다(권장 ${p.recommended}, 현재 ${p.currentCap}).`)
    continue
  }

  // 로그를 **먼저** 쓴다. 반대로 하면 로그 실패 시 기록 없는 변경이 남는다.
  try {
    await logRow(p, p.recommended, p.reason)
  } catch (e) {
    console.error(`❌ ${e.message} → ${p.sourceKey} 는 반영하지 않는다(로그 없는 변경 금지).`)
    continue
  }

  const { data, error } = await supabase
    .from('review_sources')
    .update({ daily_request_cap: p.recommended }) // ⚠️ 이 컬럼 하나만. 예외의 범위다.
    .eq('key', p.sourceKey)
    .select('key, daily_request_cap')

  // 도구가 준 success 를 믿지 않는다 — 돌아온 값이 기대값인지 본다(§7.1).
  const got = data?.[0]?.daily_request_cap
  if (error || got !== p.recommended) {
    const why = error ? error.message : `반영 후 값이 ${String(got)} 다(기대 ${p.recommended})`
    console.error(`❌ ${p.sourceKey} 반영 실패: ${why}`)
    try {
      await logRow(p, null, `반영 실패 — ${why}`)
    } catch (e) {
      console.error(`⚠️ ${e.message}`)
    }
    continue
  }
  console.log(`✅ ${p.sourceKey}: ${p.currentCap} → ${p.recommended}`)
  done++
}

console.log(`\n반영 ${done}/${applies.length}건 · 보류 ${holds.length}건(DB 미변경) · 실행 주체 ${appliedBy}`)
if (done < applies.length) process.exit(1)
