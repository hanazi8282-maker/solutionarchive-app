#!/usr/bin/env node
// CMO 데일리 루프 오케스트레이터 (GitHub Actions 전용 진입점 + 로컬 재현용).
//
// 런북 정본은 `.claude/commands/cmo-daily.md` 다. 헤드리스와 터미널이 같은 문서를 쓴다.
//
// 사용:
//   node --env-file=.env.local scripts/cmo-daily.mjs [--dry] [--trigger=cron|manual|local]
//
// 종료 코드 (insight-loop.mjs 와 같은 규약 + 사전 점검 1종)
//   0 = 전 단계 정상 (blocked 는 실패가 아니다 — 아래 참조)
//   1 = 실패한 단계가 있다
//   2 = 사전 점검 확인 불가 (DB 미도달 등). 뒤 단계를 아예 돌지 않았다.
//
// ★ blocked 를 실패로 세지 않는 이유
//   CG-1 이 등급 C 초안을 막은 것은 **안전장치가 정상 작동한 것**이다. 실패로 세면
//   아침마다 가짜 경보가 뜨고 곧 아무도 안 본다. 그렇다고 ok 로 세면 §7.2 위반이라
//   막힌 초안이 조용히 묻힌다. 그래서 blocked 는 그 자체 상태로 남기고, 실행 전체는
//   `partial` 이 되며 종료 코드는 0 이다. 대신 다이제스트 최상단에 반드시 뜬다.
//
// ────────────────────────────────────────────────────────────
// 3중 화이트리스트 — 프롬프트가 아니라 로직이 지킨다
//
//   (a) 커밋 경로: `COMMIT_PREFIXES` 4개 프리픽스만. 스테이징에 그 밖의 파일이
//       하나라도 있으면 **커밋하지 않고 실패한다.** (checkStaged)
//   (b) 자식 env: runClaude 에 `env` 화이트리스트를 넘긴다. LLM 이 조종하는
//       서브프로세스에 `SUPABASE_SERVICE_ROLE_KEY` 가 넘어가지 않는다. (buildAgentEnv)
//   (c) 도구: 서브에이전트별로 `--allowedTools` 를 좁게 준다. (AGENT_TOOLS)
//
//   문서에 "이렇게 하자"고 적는 방식은 이 리포에서 여러 번 안 지켜졌다.
//   그래서 세 개 전부 코드가 강제하고, 셀프테스트가 **일부러 망가뜨려** 확인한다.
//
// ⚠️ DB 를 만지는 일은 전부 **오케스트레이터**가 한다. 서브에이전트는 못 한다.
//    (b) 때문에 자식 프로세스에는 DB 자격증명이 없다. 이건 제약이 아니라 설계다 —
//    적립·스테이징·승인 경로를 사람이 검토 가능한 한 곳(이 파일)에 모은다.
//    성과 분석도 오케스트레이터가 스크립트를 돌려 **결과 텍스트를 프롬프트에 넣어**
//    준다. 에이전트가 DB 를 직접 읽을 필요가 없다.
//
// ⛔ 발행 API 를 호출하지 않는다. `THREADS_ACCESS_TOKEN` 을 읽지도, 요구하지도 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveClaudeBinary, runClaude } from '../lib/insight/claude-cli.ts'
import { createTracker } from './agent-status.mjs'

// ────────────────────────────────────────────────────────────
// 물량 — 첫 주는 2/2. 나중에 5/5 로 올릴 때는 이 값만 바꾼다.
// ────────────────────────────────────────────────────────────
export const RESEARCH_TARGET = Number(process.env.CMO_RESEARCH_TARGET ?? 2)
export const DRAFT_TARGET = Number(process.env.CMO_DRAFT_TARGET ?? 2)

// ────────────────────────────────────────────────────────────
// (a) 커밋 화이트리스트
// ────────────────────────────────────────────────────────────
export const COMMIT_PREFIXES = ['reports/', 'drafts/cases/', 'drafts/threads/', 'ops/state/']

/**
 * 스테이징된 경로가 전부 화이트리스트 안인지 본다.
 *
 * ★ "허용 목록에 없으면 거절"이지 "금지 목록에 있으면 거절"이 아니다.
 *   금지 목록 방식이면 새로 생긴 위험한 경로가 자동으로 허용된다.
 *   `methodology/` 를 금지 목록에 넣는 대신, 애초에 4개만 허용한다.
 */
export function checkStaged(paths) {
  const offenders = (paths ?? [])
    .map((p) => String(p).trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .filter((p) => !COMMIT_PREFIXES.some((pre) => p.startsWith(pre)))
  return {
    ok: offenders.length === 0,
    offenders,
    reason: offenders.length === 0
      ? `화이트리스트 ${COMMIT_PREFIXES.length}개 프리픽스 안`
      : `화이트리스트 밖 ${offenders.length}건: ${offenders.slice(0, 10).join(', ')}`,
  }
}

// ────────────────────────────────────────────────────────────
// (b) 자식 env 화이트리스트
// ────────────────────────────────────────────────────────────
/**
 * 서브에이전트에게 넘길 환경변수. **이 목록에 없는 것은 넘어가지 않는다.**
 *
 * 특히 없는 것들(있으면 안 되는 것들):
 *   SUPABASE_SERVICE_ROLE_KEY — DB 관리자급. LLM 이 조종하는 프로세스에 주지 않는다.
 *   THREADS_ACCESS_TOKEN      — 발행 자격증명. 애초에 이 루프의 env 에 없다(§10).
 *   ANTHROPIC_API_KEY         — 유료 경로. 헤드리스는 OAuth 토큰으로 돈다.
 *   GITHUB_TOKEN              — 커밋·푸시는 오케스트레이터만 한다.
 */
export function buildAgentEnv(parentEnv = process.env) {
  return { CLAUDE_CODE_OAUTH_TOKEN: parentEnv.CLAUDE_CODE_OAUTH_TOKEN }
}

// ────────────────────────────────────────────────────────────
// (c) 서브에이전트별 도구 화이트리스트
// ────────────────────────────────────────────────────────────
//
// writer 에 Bash 가 없는 건 실수가 아니다. 발행 API 를 부를 수단 자체를 없앤다.
// researcher 의 Bash 는 case-research.mjs 한 줄로 좁힌다 — 검증은 돌려야 하는데
// 임의 명령까지 열어 줄 이유는 없다.
export const AGENT_TOOLS = {
  'sa-cmo-researcher': 'Read,Grep,Glob,WebSearch,WebFetch,Write,Bash(node scripts/case-research.mjs:*)',
  'sa-cmo-writer': 'Read,Grep,Glob,Write',
  'sa-cmo-analyst': 'Read,Grep,Glob',
}

// ────────────────────────────────────────────────────────────
// 단계 정의 — 순차. 병렬 금지.
// ────────────────────────────────────────────────────────────
//
// 병렬로 띄우지 않는 이유: 같은 slug 를 두 조사가 동시에 잡으면 각자 다른 slug 를
// 지어 내서 중복 케이스가 된다. UNIQUE 제약으로도 못 막는다.
export const STEPS = [
  ['preflight', '사전 점검'],
  ['queue', '조사 큐 선정'],
  ['research', '조사'],
  ['commit_cases', '케이스 적립'],
  ['queue_resolve', '조사 큐 정리'],
  ['angle', '앵글 선정'],
  ['draft', '초안 작성 + 게이트'],
  ['stage', '발행 대기 스테이징'],
  ['performance', '성과 분석'],
  ['digest', '다이제스트·상태·커밋'],
]

export const today = (d = new Date()) => d.toISOString().slice(0, 10)

/**
 * 실행 키. `cmo-<날짜>-<트리거>`.
 *
 * 타임스탬프를 안 쓰는 이유: 재시도마다 새 행이 생겨 UNIQUE(run_key) 의 멱등성이
 * 무의미해진다. 트리거를 넣는 이유: 같은 날 수동 실행이 크론 기록을 덮어쓰면
 * "어젯밤 크론이 무엇을 했나"가 사라진다.
 */
export const runKeyFor = (date, trigger) => `cmo-${date}-${trigger}`

// ────────────────────────────────────────────────────────────
// 이하 실행부
// ────────────────────────────────────────────────────────────
function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}

// ⚠️ 진입점 호출은 **파일 맨 아래**에 있다. 여기서 부르면 안 된다.
//    `const` 는 호이스팅되지 않아서(TDZ) 아래쪽 상수를 쓰는 순간
//    "Cannot access 'X' before initialization" 으로 죽는다. 실제로 그렇게 죽었고,
//    스텝 실패로 잡혀서 "큐 선정 실패"라는 엉뚱한 사유로 보고됐다.

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry')
  const trigArg = argv.find((a) => a.startsWith('--trigger='))
  const trigger = trigArg ? trigArg.slice('--trigger='.length) : 'local'
  const date = today()
  const repoRoot = process.cwd()
  const runKey = runKeyFor(date, trigger)

  const reportDir = path.join(repoRoot, 'reports', date)
  fs.mkdirSync(path.join(reportDir, 'research'), { recursive: true })
  fs.mkdirSync(path.join(reportDir, 'drafts'), { recursive: true })

  const log = []
  const say = (s) => { log.push(s); console.log(s) }

  say(`## CMO 데일리 루프 ${dryRun ? '(dry-run — DB·git 을 건드리지 않는다)' : ''}`)
  say(`- 실행 키: \`${runKey}\` · 트리거 ${trigger} · 목표 조사 ${RESEARCH_TARGET} / 초안 ${DRAFT_TARGET}`)
  say('')

  const gitSha = (await sh('git', ['rev-parse', 'HEAD'])).stdout.trim() || null
  const runUrl = process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null

  const tracker = await createTracker({ runKey, dept: 'cmo', trigger, dryRun, gitSha, runUrl })

  // steps: 스텝별 종료코드까지 남긴다. AC-11 이 요구하는 "종료코드 4 가 run.json 에
  // 기록된다"를 만족하려면 counts/blocked/failed 만으로는 부족하다 — 그 셋은
  // **몇 개**인지만 말하고 **무엇이 몇 번으로** 끝났는지는 버린다.
  const state = { blocked: 0, failed: 0, counts: {}, steps: [] }
  let seq = 0
  const stepIndex = new Map(STEPS.map(([k, l], i) => [k, { label: l, seq: i + 1 }]))

  /** 스텝 하나를 돌린다. 시작·종료 모두 상태 기록기에 남긴다. */
  async function runStep(key, fn) {
    const meta = stepIndex.get(key)
    seq = meta.seq
    await tracker.step({ stepKey: key, label: meta.label, status: 'running', seq })
    let res
    try {
      res = (await fn()) ?? { status: 'ok' }
    } catch (e) {
      res = { status: 'failed', detail: { error: e.message } }
    }
    const { status, counts = {}, blocker = null, detail = {} } = res
    await tracker.step({ stepKey: key, label: meta.label, status, counts, blocker, detail, seq })

    if (status === 'failed') state.failed++
    if (status === 'blocked') state.blocked++
    Object.assign(state.counts, counts)
    recordStep(state, { key, label: meta.label, status, blocker, detail })

    const mark = { ok: '✅', skipped: '⏭️', blocked: '▲', failed: '❌' }[status] ?? '·'
    const note = status === 'blocked' ? ` — ${blocker}`
      : status === 'failed' ? ` — ${detail.error ?? detail.reason ?? '사유 미기록'}`
        : status === 'skipped' ? ` — ${detail.reason ?? '할 일 없음'}` : ''
    say(`- ${mark} \`${key}\` ${meta.label}${Object.keys(counts).length ? ` (${JSON.stringify(counts)})` : ''}${note}`)
    return res
  }

  // ── S0 preflight ────────────────────────────────────────────
  let supabase = null
  const pre = await runStep('preflight', async () => {
    const { createClient } = await import('../lib/supabase/server.ts')
    supabase = await createClient()
    if (!supabase) {
      return {
        status: 'failed',
        detail: { error: 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 — 확인 불가. 진행하면 실패가 "아무 일도 없었음"으로 보인다' },
      }
    }
    // 존재 확인은 read 로 한다. dry-run 에서도 읽기는 한다 — "건드린다"는 쓰기를 말한다.
    const probe = await supabase.from('case_studies').select('id').limit(1)
    if (probe.error) {
      return { status: 'failed', detail: { error: `case_studies 조회 실패 — ${probe.error.code ?? ''} ${probe.error.message}` } }
    }
    const branch = (await sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
    return {
      status: 'ok',
      counts: { cases_reachable: 1 },
      detail: { branch, git_sha: gitSha, db_status_ok: tracker.dbOk, fallback: tracker.fallbackReason },
    }
  })

  if (pre.status === 'failed') {
    // 확인 불가 상태로 뒤 단계를 돌지 않는다. 돌면 전부 "0건 처리"로 초록불이 뜬다.
    say('')
    say('⚠️ 사전 점검 확인 불가 — 뒤 단계를 돌지 않았다. "0건 처리"가 아니라 "확인 불가"다.')
    await tracker.finish({ status: 'failed', summary: { stopped_at: 'preflight' } })
    await writeDigest({ reportDir, date, runKey, dryRun, log, state, stopped: 'preflight', repoRoot })
    await flushSummary(log)
    process.exit(2)
  }

  const agentEnv = buildAgentEnv()
  let claudeBin = null
  try { claudeBin = (await resolveClaudeBinary()).path } catch (e) {
    say(`- ⚠️ claude 바이너리 확보 실패 — ${e.message}. 에이전트 단계는 전부 failed 로 남는다.`)
  }

  // ── S1 queue ────────────────────────────────────────────────
  let claimed = []
  await runStep('queue', async () => {
    const plan = await sh('node', ['scripts/research-queue.mjs', '--plan', String(RESEARCH_TARGET), ...(dryRun ? ['--dry'] : [])])
    if (plan.code === 2) return { status: 'failed', detail: { error: `큐 계획 확인 불가 — ${tail(plan.stderr)}` } }
    if (plan.code === 1) return { status: 'blocked', blocker: `조사 계획을 세울 수 없다 — ${tail(plan.stderr)}` }
    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — 큐에 쓰지 않고 계획만 냈다' }, counts: { planned: RESEARCH_TARGET } }

    const claim = await sh('node', ['scripts/research-queue.mjs', '--claim', String(RESEARCH_TARGET),
      ...(tracker.runId ? ['--run-id', tracker.runId] : [])])
    if (claim.code === 2) return { status: 'failed', detail: { error: `큐 claim 확인 불가 — ${tail(claim.stderr)}` } }
    if (claim.code === 1) return { status: 'skipped', detail: { reason: '큐에 대기 항목이 0건이다 (음성 — 확인 불가가 아니다)' } }
    try { claimed = JSON.parse(claim.stdout.slice(claim.stdout.indexOf('['))) } catch { claimed = [] }
    return { status: 'ok', counts: { claimed: claimed.length } }
  })

  // ── S2 research ─────────────────────────────────────────────
  const beforeCases = listJson(path.join(repoRoot, 'drafts', 'cases'))
  let newSlugs = []
  await runStep('research', async () => {
    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — 조사 에이전트를 띄우지 않는다' } }
    if (!claimed.length) return { status: 'skipped', detail: { reason: '조사 대상 0건 (큐가 비었다)' } }
    if (!claudeBin) return { status: 'failed', detail: { error: 'claude 바이너리 없음' } }

    let done = 0
    const failures = []
    for (const item of claimed) { // 순차. 병렬 금지 — 중복 slug 를 만든다.
      const prompt = researchPrompt(item, date, beforeCases)
      const r = await runClaude(claudeBin, [
        '-p', prompt,
        '--output-format', 'json',
        '--allowedTools', AGENT_TOOLS['sa-cmo-researcher'],
        '--permission-mode', 'acceptEdits',
        '--max-turns', '60',
      ], { cwd: repoRoot, env: agentEnv, timeoutMs: 15 * 60_000 })

      if (r.exitCode === 0) done++
      else failures.push(`${item.brand_name}: exit ${r.exitCode}${r.timedOut ? '(timeout)' : ''} ${tail(r.stderr, 200)}`)
    }
    newSlugs = listJson(path.join(repoRoot, 'drafts', 'cases')).filter((s) => !beforeCases.includes(s))
    if (done === 0 && failures.length) return { status: 'failed', counts: { attempted: claimed.length, new_drafts: 0 }, detail: { error: failures.join(' | ') } }
    return { status: 'ok', counts: { attempted: claimed.length, agent_ok: done, new_drafts: newSlugs.length }, detail: { failures, slugs: newSlugs } }
  })

  // ── S3 commit_cases ─────────────────────────────────────────
  let casesCommitted = 0
  await runStep('commit_cases', async () => {
    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — DB 에 적립하지 않는다' } }
    if (!newSlugs.length) return { status: 'skipped', detail: { reason: '새 초안 0건' } }
    let ok = 0
    const errs = []
    for (const slug of newSlugs) {
      const v = await sh('node', ['scripts/case-research.mjs', 'validate', '--slug', slug])
      if (v.code !== 0) { errs.push(`${slug}: validate exit ${v.code}`); continue }
      const c = await sh('node', ['scripts/case-review.mjs', 'commit', '--slug', slug])
      if (c.code === 0) ok++
      else errs.push(`${slug}: commit exit ${c.code} ${tail(c.stderr, 200)}`)
    }
    casesCommitted = ok
    // 적립된 것은 전부 review_status='draft' 다. 이 스크립트는 승인 경로를 갖지 않는다.
    if (ok === 0) return { status: 'failed', counts: { committed: 0 }, detail: { error: errs.join(' | ') || '적립 0건' } }
    return { status: 'ok', counts: { committed: ok, all_draft: ok }, detail: { errors: errs } }
  })

  // ── S4 queue_resolve ────────────────────────────────────────
  // claim 만 하고 큐 행을 안 닫으면, 다음 실행마다 같은 슬롯이 claimed 인 채로
  // 쌓여 `--plan` 이 "이미 대기 중"으로 오판한다. commit_cases 직후 닫는다.
  //
  // ★ done 과 failed 를 섞지 않는다 (research_queue 스키마 주석).
  //   "적립 완료"와 "조사했는데 근거 없음"은 다음 행동이 다르다.
  await runStep('queue_resolve', async () => {
    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — 큐 상태를 갱신하지 않는다' } }
    if (!claimed.length) return { status: 'skipped', detail: { reason: '이번 실행이 claim 한 큐 항목 없음' } }

    let done = 0
    let failed = 0
    const errs = []
    for (let i = 0; i < claimed.length; i++) {
      const item = claimed[i]
      // 적립 성공 건수만큼을 앞에서부터 done 으로 본다. claim 1건 → 초안 1건이
      // 정상이라 이 매핑으로 충분하고, 부정확한 경우는 notes 에 남는다.
      const produced = i < casesCommitted
      const status = produced ? 'done' : 'failed'
      const slug = produced ? (newSlugs[i] ?? newSlugs[done] ?? '(slug 미상)') : null
      const base = item.notes ? `${item.notes} | ` : ''
      const note = produced
        ? `${base}${slug} 적립 (${runKey})`
        : `${base}${runKey}: 조사했으나 쓸 만한 근거를 못 찾았다`
      const r = await sh('node', ['scripts/research-queue.mjs',
        '--resolve', item.id, '--status', status, '--notes', note])
      if (r.code === 0) { if (produced) done++; else failed++ }
      else errs.push(`${item.id}: resolve exit ${r.code} ${tail(r.stderr, 160)}`)
    }
    if (done + failed === 0) return { status: 'failed', detail: { error: errs.join(' | ') || '큐 갱신 0건' } }
    return { status: 'ok', counts: { queue_done: done, queue_failed: failed }, detail: { errors: errs } }
  })

  // ── S5 angle ────────────────────────────────────────────────
  let angles = []
  await runStep('angle', async () => {
    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — 앵글을 고르지 않는다' } }
    const picked = await pickAngles(supabase, DRAFT_TARGET)
    if (picked.error) return { status: 'failed', detail: { error: picked.error } }
    angles = picked.moves
    if (!angles.length) {
      // 승인은 사람이 한다. 승인된 무브가 없는 건 루프의 실패가 아니다.
      return { status: 'skipped', detail: { reason: '쓸 수 있는 승인 무브가 0건 (승인은 사람이 한다 — 루프의 실패가 아니다)' } }
    }
    return { status: 'ok', counts: { angles: angles.length } }
  })

  // ── S6 draft ────────────────────────────────────────────────
  const beforeStage = listFiles(path.join(repoRoot, 'drafts', 'threads'), '.stage.json')
  let stageFiles = []
  await runStep('draft', async () => {
    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — 초안 에이전트를 띄우지 않는다' } }
    if (!angles.length) return { status: 'skipped', detail: { reason: '앵글 0건' } }
    if (!claudeBin) return { status: 'failed', detail: { error: 'claude 바이너리 없음' } }

    let done = 0
    const failures = []
    for (const m of angles) {
      const r = await runClaude(claudeBin, [
        '-p', writerPrompt(m, date),
        '--output-format', 'json',
        '--allowedTools', AGENT_TOOLS['sa-cmo-writer'],
        '--permission-mode', 'acceptEdits',
        '--max-turns', '40',
      ], { cwd: repoRoot, env: agentEnv, timeoutMs: 12 * 60_000 })
      if (r.exitCode === 0) done++
      else failures.push(`${m.slug}/${m.lever}: exit ${r.exitCode}${r.timedOut ? '(timeout)' : ''}`)
    }
    stageFiles = listFiles(path.join(repoRoot, 'drafts', 'threads'), '.stage.json').filter((f) => !beforeStage.includes(f))
    if (done === 0) return { status: 'failed', counts: { drafted: 0 }, detail: { error: failures.join(' | ') || '초안 0건' } }
    return { status: 'ok', counts: { drafted: done, manifests: stageFiles.length }, detail: { failures } }
  })

  // ── S7 stage ────────────────────────────────────────────────
  const stageManifestPath = path.join(repoRoot, 'ops', 'state', `${runKey}-stage.json`)
  await runStep('stage', async () => {
    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — DB 에 스테이징하지 않는다' } }
    if (!stageFiles.length) {
      // ★ 매니페스트를 이번 실행 기준으로 비워 둔다. 같은 날 재실행이 이전 실행의
      //   매니페스트를 물려받으면 decision-log-entries.md·"다음 주 주목 지표"가
      //   지난 실행 값을 보여준다 (2026-09-08 재실행에서 관측: DIGEST N=0 인데
      //   decision-log 엔트리 1).
      try { fs.mkdirSync(path.dirname(stageManifestPath), { recursive: true }); fs.writeFileSync(stageManifestPath, '[]\n', 'utf-8') } catch { /* 못 써도 skip 은 유지 */ }
      return { status: 'skipped', detail: { reason: '스테이징 매니페스트 0건' } }
    }

    const jobs = []
    for (const f of stageFiles) {
      try { jobs.push(JSON.parse(fs.readFileSync(path.join(repoRoot, 'drafts', 'threads', f), 'utf-8'))) }
      catch (e) { return { status: 'failed', detail: { error: `매니페스트 파싱 실패 ${f} — ${e.message}` } } }
    }
    // 입력 파일도 화이트리스트 안(ops/state/)에 만든다. 밖에 만들면 커밋 검사에 걸린다.
    const inputPath = path.join(repoRoot, 'ops', 'state', `${runKey}-stage.json`)
    fs.mkdirSync(path.dirname(inputPath), { recursive: true })
    fs.writeFileSync(inputPath, JSON.stringify(jobs, null, 2), 'utf-8')

    const r = await sh('node', ['scripts/case-draft-stage.mjs', '--input', path.relative(repoRoot, inputPath)])
    const counts = { staged: jobs.length }
    if (r.code === 0) return { status: 'ok', counts, detail: { exit: 0, published_at: 'null (발행 안 함)' } }
    if (r.code === 3) return { status: 'ok', counts, detail: { exit: 3, note: "마이그 미적용 폴백 — draft 로 눕혔다. 게이트를 안 돈 것이 아니다" } }
    if (r.code === 4) {
      return {
        status: 'blocked',
        blocker: 'CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다. posts 는 draft 로 눕혔다(본문은 남아 있다).',
        counts, detail: { exit: 4, hint: '본문에 "…가 밝힌 수치다" 형태의 귀속 문구를 넣고 다시 돌려라' },
      }
    }
    return { status: 'failed', counts, detail: { error: `case-draft-stage exit ${r.code} — ${tail(r.stderr)}` } }
  })

  // ── S8 performance ──────────────────────────────────────────
  await runStep('performance', async () => {
    // DB 를 만지는 건 오케스트레이터다. 결과 텍스트만 에이전트에 넘긴다.
    const score = await sh('node', ['scripts/score-predictions.mjs'])
    const cov = await sh('node', ['scripts/case-match.mjs', '--coverage'])
    const raw = [
      '# 성과 원자료',
      '', '## score-predictions', '```', clip(score.stdout) || '(출력 없음)', '```',
      `exit ${score.code}`,
      '', '## coverage', '```', clip(cov.stdout) || '(출력 없음)', '```',
      `exit ${cov.code}`,
    ].join('\n')
    fs.writeFileSync(path.join(reportDir, 'performance.md'), raw + '\n', 'utf-8')

    const fail = perfFailure(score.code, cov.code, date)
    if (fail) {
      state.perfNote = `성과 조회 실패 — score-predictions exit ${score.code} / coverage exit ${cov.code}`
      return { status: 'failed', detail: { ...fail, exit: score.code } }
    }
    if (dryRun || !claudeBin) {
      state.perfNote = dryRun ? 'dry-run' : 'claude 없음'
      return { status: 'ok', counts: { raw_only: 1 }, detail: { reason: dryRun ? 'dry-run — 해설 생략, 원자료만' : 'claude 없음 — 원자료만' } }
    }

    const r = await runClaude(claudeBin, [
      '-p', analystPrompt(raw, date),
      '--output-format', 'json',
      '--allowedTools', AGENT_TOOLS['sa-cmo-analyst'],
      // research/draft 스텝과 같은 권한 모드. 없으면 헤드리스 CI 에서 첫 Read 가
      // 권한 프롬프트에 걸려 즉시 exit 1 로 죽는다 (2026-09-08 첫 본실행에서 관측:
      // analyst 가 ~5초 만에 exit 1, 해설 없이 폴백). read-only 라 acceptEdits 는
      // 무해하고 세 호출의 플래그를 일치시킨다.
      '--permission-mode', 'acceptEdits',
      '--max-turns', '12',
    ], { cwd: repoRoot, env: agentEnv, timeoutMs: 8 * 60_000 })

    if (r.exitCode !== 0) {
      state.perfNote = `analyst exit ${r.exitCode}`
      return { status: 'ok', counts: { raw_only: 1 }, detail: { warning: `해설 생성 실패(exit ${r.exitCode}) — 원자료는 남았다` } }
    }
    let text = r.stdout
    try { const env = JSON.parse(r.stdout); if (typeof env.result === 'string') text = env.result } catch { /* 봉투 없음 */ }
    // ★ 저장은 오케스트레이터가 한다. analyst 에게 Write 를 주지 않는다(AGENT_TOOLS).
    //   writeDigest(S8) 는 이 파일을 **읽어서** "## 개선 방안"에 박는다.
    fs.appendFileSync(path.join(reportDir, 'performance.md'), `\n\n# 해설\n\n${text}\n`, 'utf-8')
    return { status: 'ok', counts: { commented: 1 } }
  })

  // ── S9 digest ───────────────────────────────────────────────
  await runStep('digest', async () => {
    await sh('node', ['scripts/status-render.mjs']) // exit 2 는 "DB 확인 불가"인데, 그 사실이 파일에 박힌다
    await writeDigest({ reportDir, date, runKey, dryRun, log, state, stopped: null, repoRoot })

    if (dryRun) return { status: 'skipped', detail: { reason: 'dry-run — git 을 건드리지 않는다' } }

    // (a) 화이트리스트 프리픽스만 스테이징한다.
    for (const pre of COMMIT_PREFIXES) await sh('git', ['add', '--', pre])

    const staged = (await sh('git', ['diff', '--cached', '--name-only'])).stdout
      .split('\n').map((s) => s.trim()).filter(Boolean)
    if (!staged.length) return { status: 'skipped', detail: { reason: '커밋할 변경 없음' } }

    const check = checkStaged(staged)
    if (!check.ok) {
      // 커밋하지 않는다. 스테이징도 되돌린다 — 다음 실행이 남은 스테이징을 물려받으면
      // 그때는 검사를 통과해 버릴 수 있다.
      await sh('git', ['reset'])
      return {
        status: 'failed',
        detail: { error: `커밋 화이트리스트 위반 — ${check.reason}. 커밋하지 않았고 스테이징을 되돌렸다.`, offenders: check.offenders },
      }
    }

    await sh('git', ['config', 'user.name', process.env.GIT_AUTHOR_NAME ?? 'cmo-daily-bot'])
    await sh('git', ['config', 'user.email', process.env.GIT_AUTHOR_EMAIL ?? 'noreply@anthropic.com'])
    const msg = `chore(cmo): daily loop ${date}\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
    const c = await sh('git', ['commit', '-m', msg])
    if (c.code !== 0) return { status: 'failed', detail: { error: `commit 실패 — ${tail(c.stderr)}` } }

    if (process.env.GITHUB_ACTIONS === 'true') {
      const p = await sh('git', ['push'])
      if (p.code !== 0) return { status: 'failed', counts: { committed: staged.length }, detail: { error: `push 실패 — ${tail(p.stderr)}` } }
    }
    return { status: 'ok', counts: { committed_files: staged.length } }
  })

  // ── 마무리 ──────────────────────────────────────────────────
  const runStatus = state.failed > 0 ? 'failed' : state.blocked > 0 ? 'partial' : 'ok'
  await tracker.finish({ status: runStatus, summary: { ...state.counts, blocked: state.blocked, failed: state.failed } })

  // digest 스텝 안에서 이미 한 번 렌더했지만, 그건 `digest` 자기 자신이 아직
  // `runStep` 에 의해 DB 에 기록되기 **전**이라 마지막 스텝이 항상 ◐ 로 찍혔다
  // (agent_run_steps 는 `runStep` 이 콜백을 다 돌리고 나서야 쓴다 — 콜백 안에서는
  // 아무리 늦게 불러도 자기 자신의 완료를 못 본다). `tracker.finish()` 까지 끝난
  // 지금 다시 렌더하면 10/10 · 완료시각이 정확하다. 파일이 안 바뀌면(내용 동일)
  // 커밋을 안 낸다 — 매 실행마다 빈 커밋이 쌓이면 그게 새 소음이 된다.
  if (!dryRun) {
    await sh('node', ['scripts/status-render.mjs'])
    await sh('git', ['add', '--', 'reports/status/DASHBOARD.md'])
    const redoStaged = (await sh('git', ['diff', '--cached', '--name-only'])).stdout
      .split('\n').map((s) => s.trim()).filter(Boolean)
    // 이 add 는 경로 하나만 지정해서 다른 파일이 섞일 길이 없지만, 화이트리스트
    // 검사를 생략하는 예외를 만들지 않는다 — 나중에 이 블록을 고치다 `reports/`
    // 전체를 add 하는 실수가 나도 여기서 잡힌다.
    const redoCheck = checkStaged(redoStaged)
    if (redoStaged.length && !redoCheck.ok) {
      await sh('git', ['reset'])
      say(`- ⚠️ 대시보드 재렌더 커밋 스킵 — 화이트리스트 위반(${redoCheck.reason})`)
    } else if (redoStaged.length) {
      const msg = `chore(cmo): daily loop ${date} — 최종 상태로 대시보드 재렌더\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
      const c = await sh('git', ['commit', '-m', msg])
      if (c.code !== 0) {
        say(`- ⚠️ 대시보드 재렌더 커밋 실패 — ${tail(c.stderr)} (실행 결과 자체엔 영향 없음)`)
      } else if (process.env.GITHUB_ACTIONS === 'true') {
        const p = await sh('git', ['push'])
        if (p.code !== 0) say(`- ⚠️ 대시보드 재렌더 push 실패 — ${tail(p.stderr)}`)
      }
    }

    // Notion 푸시. 이 루프 본체(S0~S8, 10스텝 계약)가 끝난 뒤 부가 동작이라
    // runStep 으로 묶지 않는다 — 여기서 실패해도 CMO 루프 자체의 성패에는
    // 영향을 주지 않는다(토큰 미설정이면 스크립트 자신이 exit 0 으로 조용히
    // 건너뛴다). 별도 크론을 새로 만들지 않고 이 자리에서 그대로 이어 부른다.
    const notion = await sh('node', ['scripts/notion-push-digest.mjs', '--date', date])
    if (notion.code !== 0) say(`- ⚠️ Notion 푸시 실패(exit ${notion.code}) — CMO 루프 결과엔 영향 없음. ${tail(notion.stderr || notion.stdout)}`)
    else if (notion.stdout.trim()) say(`- ℹ️ Notion 푸시: ${tail(notion.stdout, 200)}`)
  }

  say('')
  say(`- 결과: ${runStatus} · 막힘 ${state.blocked} · 실패 ${state.failed}`)
  if (!tracker.dbOk) say(`- ⚠️ 상태가 DB 에 없다 — ${tracker.fallbackReason}. 대시보드는 로컬 기준이다.`)
  if (dryRun) say('- **dry-run 이었다. DB·git 에 반영된 것은 없다.**')
  say('- ⛔ 발행하지 않았다. Threads API 를 호출하지 않았다 (CLAUDE.md §10).')

  await writeDigest({ reportDir, date, runKey, dryRun, log, state, stopped: null, repoRoot })
  await flushSummary(log)
  process.exit(state.failed > 0 ? 1 : 0)
}

// ────────────────────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────────────────────

/**
 * 자식 프로세스 실행. 오케스트레이터 자신의 env 를 그대로 쓴다(DB 자격증명 포함).
 *
 * ⚠️ `shell: true` 를 쓰지 않는다. 인자가 이스케이프 없이 이어 붙어 주입에 열린다
 *    (Node DEP0190). 여기서 부르는 건 `node` 와 `git` 뿐이고 둘 다 실행 파일이라
 *    셸이 필요 없다. `node` 는 이름 대신 `process.execPath` 로 넘겨 오케스트레이터와
 *    **같은 런타임**을 쓰게 한다 — PATH 의 다른 node 를 집으면 .ts 스트립 지원
 *    여부가 달라져 재현이 깨진다.
 */
function sh(cmd, args, opts = {}) {
  const exe = cmd === 'node' ? process.execPath : cmd
  // 이 리포는 package.json 에 "type" 이 없어서 .ts 를 import 할 때마다 Node 가
  // MODULE_TYPELESS_PACKAGE_JSON 경고를 stderr 로 4줄씩 뱉는다. 그게 자식의
  // 실제 오류 메시지와 섞여 보고에 그대로 실린다 — 실패 사유를 읽을 수 없게 된다.
  // 경고를 통째로 끄지 않고 이 종류만 끈다.
  const env = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON']
      .filter(Boolean).join(' '),
  }
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd: opts.cwd ?? process.cwd(), env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: `${stderr}\n[spawn error] ${e.message}` }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

/**
 * 자식 프로세스 출력의 꼬리. **개행을 접는다** — 보고는 항목당 한 줄이 규약인데
 * stderr 를 그대로 넣으면 불릿 하나가 여러 줄로 터져 표처럼 보인다.
 */
const tail = (s, n = 500) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim().slice(-n)

/** 원자료 블록용. 여기서는 개행을 살린다 — 코드블록 안에 넣는 용도라 형태가 정보다. */
const clip = (s, n = 4000) => String(s ?? '').trim().slice(-n)

function listJson(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
}
function listFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).sort()
}

/** 승인된 무브 중 아직 콘텐츠로 안 쓴 것을 고른다. 조회 실패는 error 로 올린다(0건과 구분). */
async function pickAngles(supabase, n) {
  const mv = await supabase.from('case_moves')
    .select('id,lever,claim,evidence_grade,outcome_direction,review_status,case_study_id,case_studies(slug,brand_name,bottleneck,review_status)')
    .eq('review_status', 'approved')
  if (mv.error) return { error: `case_moves 조회 실패 — ${mv.error.code ?? ''} ${mv.error.message}`, moves: [] }

  const used = await supabase.from('content_items').select('source_case')
  if (used.error) return { error: `content_items 조회 실패 — ${used.error.code ?? ''} ${used.error.message}`, moves: [] }
  const usedSlugs = new Set((used.data ?? []).map((r) => r.source_case).filter(Boolean))

  const rank = { A: 3, B: 2, C: 1, D: 0 }
  const moves = (mv.data ?? [])
    .filter((m) => m.case_studies?.review_status === 'approved')
    .filter((m) => (rank[m.evidence_grade] ?? 0) > 0)
    .filter((m) => !usedSlugs.has(m.case_studies?.slug))
    .map((m) => ({
      id: m.id, lever: m.lever, claim: m.claim, grade: m.evidence_grade,
      direction: m.outcome_direction, slug: m.case_studies?.slug,
      brand: m.case_studies?.brand_name, bottleneck: m.case_studies?.bottleneck,
    }))
    .sort((a, b) => (rank[b.grade] ?? 0) - (rank[a.grade] ?? 0) || String(a.slug).localeCompare(String(b.slug)))
    .slice(0, n)
  return { moves }
}

/**
 * 스텝 하나의 결과를 `state.steps` 에 누적한다.
 *
 * ★ `blocked`/`failed` 카운터는 **몇 개**인지만 말한다. AC-11 이 요구하는 것은
 *   "종료코드 4 가 run.json 에 기록된다" — 즉 **무엇이 몇 번으로** 끝났는지다.
 *   CG-1 차단(exit 4)과 마이그 미적용 폴백(exit 3)은 둘 다 "실패 아님"이라
 *   카운터로는 구분이 안 된다. 여기서 코드를 그대로 보존한다(정보 손실 없음).
 */
export function recordStep(state, { key, label, status, blocker = null, detail = {} }) {
  if (!Array.isArray(state.steps)) state.steps = []
  const entry = {
    key,
    label: label ?? null,
    status,
    exit: Number.isInteger(detail?.exit) ? detail.exit : null,
    blocker: blocker ?? null,
  }
  state.steps.push(entry)
  return entry
}

/**
 * S7 성과 조회의 실패 판정. **종료코드 규약이 스크립트마다 다르다.**
 *
 *   score-predictions.mjs      0 정상 / 1 파싱 에러 / 2 채점 불가 → **0 만 정상**
 *   case-match.mjs --coverage  0 매칭 가능 / 1 음성(0개) / 2 확인 불가 → 1 은 정상 분기
 *
 * 옛 조건은 `score.code === 2` 만 봤다. 그래서 exit 1("예측을 썼는데 못 읽었다")이
 * 조건을 안 타고 흘러 `status:'ok'` 로 찍혔다 — 확인 실패를 양성으로 접는 §7.1
 * 위반이다. coverage 의 1 은 반대다. "선례가 0개"라는 **음성**이라 실패가 아니다.
 */
export function perfFailure(scoreCode, covCode, date) {
  if (scoreCode !== 0 || covCode === 2) {
    return {
      error: `성과 조회 실패 — score-predictions exit ${scoreCode} / coverage exit ${covCode}. `
        + `원자료는 reports/${date}/performance.md`,
    }
  }
  return null
}

/**
 * `reports/<날짜>/performance.md` 를 판다. **못 읽은 것과 갭이 없는 것을 가른다.**
 *
 * 반환 `coverage === null` 은 "커버리지 갭이 없다"가 아니라 "커버리지를 못 읽었다"다.
 * 다이제스트는 그 둘을 다른 문장으로 찍는다 (§7.1).
 */
export function parsePerformance(md) {
  if (md == null) {
    return { coverage: null, coverageReason: 'reports/<날짜>/performance.md 가 없다 — S7 이 안 돌았거나 파일을 못 썼다', commentary: null }
  }
  const src = String(md)

  // ── 해설(analyst 텍스트). S7 이 append 한 것을 여기서 읽어 온다.
  let commentary = null
  const hi = src.search(/^# 해설[ \t]*$/m)
  if (hi >= 0) commentary = src.slice(hi).replace(/^# 해설[ \t]*\r?\n/, '').trim() || null

  // ── coverage 블록 (case-match.mjs --coverage 출력)
  const cov = /^## coverage[ \t]*\r?\n```\r?\n([\s\S]*?)\r?\n```/m.exec(src)
  if (!cov) return { coverage: null, coverageReason: 'performance.md 에 `## coverage` 코드블록이 없다', commentary }

  const rows = []
  for (const line of cov[1].split(/\r?\n/)) {
    const m = /^\s*(✅|△|❌)\s+([A-Z_]+)\s+케이스\s+(\d+)곳\s*·\s*무브\s+(\d+)건(?:\s*—\s*(.*?))?\s*$/.exec(line)
    if (m) rows.push({ mark: m[1], bottleneck: m[2], cases: Number(m[3]), moves: Number(m[4]), brands: (m[5] ?? '').trim() })
  }
  if (!rows.length) {
    return {
      coverage: null,
      coverageReason: 'coverage 블록에서 병목 줄을 한 줄도 못 읽었다 — 조회가 실패했거나 출력 형식이 바뀌었다',
      commentary,
    }
  }
  const p = /매칭 가능 병목\s+(\d+)\s*\/\s*(\d+)/.exec(cov[1])
  return {
    coverage: {
      rows,
      gaps: rows.filter((r) => r.cases < 2), // 매칭 성립 조건이 "서로 다른 케이스 2곳"이다
      pairable: p ? Number(p[1]) : null,
      total: p ? Number(p[2]) : rows.length,
    },
    coverageReason: null,
    commentary,
  }
}

/** performance.md 의 score-predictions 블록에서 **보류** 판정이 난 지표 이름을 뽑는다. */
export function heldMetrics(md) {
  const m = /^## score-predictions[ \t]*\r?\n```\r?\n([\s\S]*?)\r?\n```/m.exec(String(md ?? ''))
  if (!m) return []
  const out = []
  for (const line of m[1].split(/\r?\n/)) {
    const r = /^\s*([a-z][a-z0-9_]*)\s+(?:up|down|within)\s+.*→\s*보류/.exec(line)
    if (r) out.push(r[1])
  }
  return [...new Set(out)]
}

/** 이번 실행에 스테이징한 초안들의 예측 지표. 매니페스트 → 판정 문서 순으로 따라간다. */
/** 이번 실행이 스테이징한 job 목록. `${runKey}-stage.json` 정본. */
export function stagedJobs(repoRoot, runKey) {
  const manifest = path.join(repoRoot, 'ops', 'state', `${runKey}-stage.json`)
  if (!fs.existsSync(manifest)) return []
  try {
    const jobs = JSON.parse(fs.readFileSync(manifest, 'utf-8'))
    return Array.isArray(jobs) ? jobs : []
  } catch { return [] }
}

/**
 * `reports/<날짜>/decision-log-entries.md` 본문.
 *
 * ★ 엔트리 수가 DIGEST 최상단 "붙여넣기 대기: N건"(= state.counts.staged)과
 *   같아야 한다 (AC-13). 둘의 정본이 같은 stage 매니페스트라 자동으로 맞는다 —
 *   staged 카운트도 이 매니페스트에서 나오기 때문이다. 하드코딩하지 않는다.
 */
export function buildDecisionLogEntries({ date, runKey, jobs = [] }) {
  const L = []
  L.push(`# 붙여넣기 대기 판정 로그 — ${date}`)
  L.push('')
  L.push(`_실행 \`${runKey}\` 이 스테이징한 초안 ${jobs.length}건. DIGEST 최상단 "붙여넣기 대기: N건" 과 수가 같아야 한다._`)
  L.push('')
  if (!jobs.length) {
    L.push('_이번 실행이 스테이징한 초안 없음._')
    return L.join('\n') + '\n'
  }
  const ymd = String(date ?? '').replace(/-/g, '')
  for (const j of jobs) {
    // gate_note 에는 전례 인용으로 다른 날짜의 LOG 코드가 섞여 있을 수 있다
    // (예: "Casper LOG-20260907-05 전례"). 이 실행의 판정 코드는 (1) 오늘 날짜의
    // 것, 없으면 (2) 맨 뒤의 것(관례상 gate_note 끝에 append 된다)이다.
    const all = String(j.gate_note ?? '').match(/LOG-\d{8}-\d+/g) ?? []
    const logCode = all.find((c) => c.startsWith(`LOG-${ymd}-`)) ?? all[all.length - 1] ?? null
    L.push(`## ${j.content_code ?? '(코드 미상)'} — ${j.case_slug ?? '(케이스 미상)'}`)
    L.push('')
    L.push(`- 무브: \`${j.move_id ?? '(미상)'}\``)
    L.push(`- 판정 로그: ${logCode ? `\`${logCode}\`` : '(gate_note 에서 LOG 코드를 못 읽음)'}`)
    L.push(`- 판정 전문: \`${j.decision_doc ?? '(경로 미상)'}\``)
    if (j.gate_note) L.push(`- 게이트: ${j.gate_note}`)
    L.push('- posts.status: pending_review (붙여넣기 대기) — 발행은 사람이 앱에서 (§10)')
    L.push('')
  }
  return L.join('\n') + '\n'
}

export function stagedMetrics(repoRoot, runKey) {
  const manifest = path.join(repoRoot, 'ops', 'state', `${runKey}-stage.json`)
  if (!fs.existsSync(manifest)) return []
  let jobs
  try { jobs = JSON.parse(fs.readFileSync(manifest, 'utf-8')) } catch { return [] }
  const out = []
  for (const j of Array.isArray(jobs) ? jobs : []) {
    const doc = j?.decision_doc
    if (typeof doc !== 'string' || !doc) continue
    const abs = path.join(repoRoot, doc)
    let src
    try { src = fs.readFileSync(abs, 'utf-8') } catch { continue }
    for (const m of src.matchAll(/^\s*-\s*metric\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      out.push({ slug: j.case_slug ?? path.basename(doc), metric: m[1] })
    }
  }
  return out
}

/** 스코어보드 행. **state.counts 를 그대로 쓴다** — 여기서 추정하면 AC-5/AC-9 의 SQL 실측과 어긋난다. */
export function scoreboardRows(state = {}) {
  const c = state.counts ?? {}
  return [
    ['조사(new_drafts)', Number(c.new_drafts ?? 0), '건'],
    ['적립(committed)', Number(c.committed ?? 0), '건'],
    ['초안(drafted)', Number(c.drafted ?? 0), '건'],
    ['스테이징(staged)', Number(c.staged ?? 0), '건'],
    ['막힘(blocked)', Number(state.blocked ?? 0), '단계'],
    ['실패(failed)', Number(state.failed ?? 0), '단계'],
  ]
}

const STOP_NOTE = '사전 점검에서 멈춤 — 산출물 없음'
const DRY_NOTE = 'dry-run — 반영 없음'

/**
 * 다이제스트 본문. **5개 헤딩은 무조건 전부 나온다.**
 *
 * 헤딩을 조건부로 빼지 않는 이유: 사람은 "없는 섹션"을 "해당 없음"으로 읽는다.
 * preflight 중단이든 dry-run 이든 헤딩은 남기고 **본문에 왜 비었는지**를 적는다.
 * 내용은 전부 결정론적이다 — 해설(개선 방안)만 analyst 텍스트를 그대로 옮긴다.
 */
export function buildDigest({
  date, runKey, dryRun = false, log = [], state = {}, stopped = null,
  perf = { coverage: null, coverageReason: '성과 원자료를 읽지 않았다', commentary: null },
  held = [], staged = [],
}) {
  const counts = state.counts ?? {}
  const waiting = counts.staged ?? 0
  const blocked = state.blocked ?? 0
  const failed = state.failed ?? 0
  const L = []

  L.push(`# CMO 데일리 다이제스트 ${date}`)
  L.push('')
  L.push(`**붙여넣기 대기: ${waiting}건**`)
  L.push('')

  // ── 1) TL;DR ────────────────────────────────────────────────
  L.push('## TL;DR')
  L.push('')
  L.push(`1. ${stopped ? `사전 점검에서 멈췄다(${stopped}). 오늘 산출물은 없다.` : `조사 ${counts.new_drafts ?? 0}건 · 적립 ${counts.committed ?? 0}건 · 초안 ${counts.drafted ?? 0}건.`}`)
  L.push(`2. ${blocked > 0 ? `막힌 단계 ${blocked}개 — 아래 "병목 진단"을 먼저 봐라. 안전장치가 작동한 것이지 사고가 아니다.` : '막힌 단계 없음.'}`)
  L.push(`3. ${failed > 0 ? `실패한 단계 ${failed}개 — 사람이 봐야 한다.` : (waiting > 0 ? `발행 대기 ${waiting}건. 앱에서 확인하고 직접 발행한다.` : '오늘 발행 대기 없음.')}`)
  if (dryRun) L.push(`4. ${DRY_NOTE}. DB·git 에 쓰지 않았다.`)
  L.push('')

  // ── 2) 스코어보드 ───────────────────────────────────────────
  L.push('## 스코어보드')
  L.push('')
  if (stopped) L.push(`- ${STOP_NOTE}`)
  for (const [label, n, unit] of scoreboardRows(state)) L.push(`- ${label}: ${n}${unit}`)
  if (dryRun) L.push(`- ${DRY_NOTE} (숫자는 실제 반영이 아니라 건너뛴 결과다).`)
  L.push('')

  // ── 3) 병목 진단 ────────────────────────────────────────────
  L.push('## 병목 진단')
  L.push('')
  if (stopped) {
    L.push(`- ${STOP_NOTE}`)
  } else {
    if (perf?.coverage) {
      const gaps = perf.coverage.gaps ?? []
      if (gaps.length) {
        for (const r of gaps) {
          L.push(`- ${r.mark} ${r.bottleneck} — 케이스 ${r.cases}곳 · 무브 ${r.moves}건${r.brands ? ` (${r.brands})` : ''}. 매칭에는 서로 다른 케이스 2곳이 필요하다.`)
        }
      } else {
        L.push('- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.')
      }
      if (perf.coverage.pairable !== null && perf.coverage.pairable !== undefined) {
        L.push(`- 매칭 가능 병목 ${perf.coverage.pairable} / ${perf.coverage.total}`)
      }
    } else {
      // ★ "갭 없음"으로 접지 않는다 (§7.1). 못 읽은 것은 못 읽었다고 쓴다.
      L.push(`_성과 원자료를 읽지 못했다 (${perf?.coverageReason ?? '사유 미기록'}). "갭 없음" 아님._`)
    }
    const stuck = log.filter((l) => /^- (▲|❌)/.test(l))
    if (stuck.length) L.push(...stuck)
    else if (blocked === 0 && failed === 0) L.push('- 막히거나 실패한 단계 없음.')
    if (dryRun) L.push(`- ${DRY_NOTE}.`)
  }
  L.push('')

  // ── 4) 개선 방안 ────────────────────────────────────────────
  L.push('## 개선 방안')
  L.push('')
  if (stopped) {
    L.push(`- ${STOP_NOTE}`)
  } else if (perf?.commentary) {
    L.push(perf.commentary)
  } else {
    L.push(`_이번 실행은 해설을 생성하지 못했다 — ${state.perfNote ?? '사유 미기록'}. 원자료: reports/${date}/performance.md_`)
  }
  L.push('')

  // ── 5) 다음 주 주목 지표 ────────────────────────────────────
  L.push('## 다음 주 주목 지표')
  L.push('')
  if (stopped) {
    L.push(`- ${STOP_NOTE}`)
  } else if (staged.length) {
    for (const s of staged) L.push(`- \`${s.metric}\` — ${s.slug} (이번에 스테이징한 초안의 예측)`)
  } else if (held.length) {
    for (const m of held) L.push(`- \`${m}\` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.`)
  } else {
    L.push('_이번 주 신규 예측 없음_')
  }
  if (!stopped && dryRun) L.push(`- ${DRY_NOTE}.`)
  L.push('')

  // ── 부록: 실행 기록 ─────────────────────────────────────────
  L.push('## 실행 기록')
  L.push('')
  L.push(...log.filter((l) => l.startsWith('- ')))
  L.push('')
  L.push(`_실행 키 \`${runKey}\`${dryRun ? ' · dry-run(반영 없음)' : ''} · 상세 상태는 reports/status/DASHBOARD.md_`)
  L.push('')
  L.push('⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).')
  return L.join('\n') + '\n'
}

export async function writeDigest({ reportDir, date, runKey, dryRun, log = [], state = {}, stopped = null, repoRoot = process.cwd() }) {
  // 원자료는 스크립트가 읽는다. analyst 에게 Write 를 주지 않는 이유가 이것이다 —
  // 해설을 어디에 어떻게 박을지는 코드가 정한다 (AGENT_TOOLS['sa-cmo-analyst']).
  let perfRaw = null
  try { perfRaw = fs.readFileSync(path.join(reportDir, 'performance.md'), 'utf-8') } catch { perfRaw = null }

  const md = buildDigest({
    date, runKey, dryRun, log, state, stopped,
    perf: parsePerformance(perfRaw),
    held: heldMetrics(perfRaw),
    staged: stagedMetrics(repoRoot, runKey),
  })

  fs.mkdirSync(reportDir, { recursive: true })
  fs.writeFileSync(path.join(reportDir, 'DIGEST.md'), md, 'utf-8')
  fs.writeFileSync(path.join(reportDir, 'run.json'), JSON.stringify({ runKey, date, dryRun, state }, null, 2), 'utf-8')

  // AC-13: "붙여넣기 대기: N건" 의 대조 파일. 엔트리 수 == N (같은 stage 매니페스트가 정본).
  fs.writeFileSync(
    path.join(reportDir, 'decision-log-entries.md'),
    buildDecisionLogEntries({ date, runKey, jobs: stagedJobs(repoRoot, runKey) }),
    'utf-8',
  )
}

async function flushSummary(log) {
  if (!process.env.GITHUB_STEP_SUMMARY) return
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, log.join('\n') + '\n', 'utf-8')
}

// ────────────────────────────────────────────────────────────
// 프롬프트 — 역할 본문은 에이전트 파일에만 있다. 여기서 복사하지 않는다.
// ────────────────────────────────────────────────────────────
function researchPrompt(item, date, existingSlugs) {
  return [
    '`.claude/agents/sa-cmo-researcher.md` 를 Read 하고, 그 문서가 규정하는 역할로 아래 작업을 수행하라.',
    '(그 파일이 지시하는 `ops/roles/_principles.md` 도 반드시 먼저 Read 한다.)',
    '',
    `오늘 날짜: ${date}`,
    `조사 대상: ${item.brand_name}`,
    `시장: ${item.market ?? '미지정'}`,
    `목표 병목: ${item.target_bottleneck ?? '미지정'}`,
    `큐 사유: ${item.reason}`,
    `큐 메모: ${item.notes ?? '없음'}`,
    '',
    item.reason === 'failure_quota'
      ? '★ 이건 실패 사례 할당분이다. 실패·피벗·철수한 사업을 조사하라. 성공 사례로 바꾸지 마라.'
      : '',
    `대상이 "미정"이면 WebSearch 로 직접 정하라. 다음 slug 는 이미 적립돼 있으니 피하라: ${existingSlugs.join(', ') || '(없음)'}`,
    '',
    '끝내기 전에 반드시 `node scripts/case-research.mjs validate --slug <slug>` 를 직접 실행해 exit 0 을 확인하라.',
    `조사 노트는 reports/${date}/research/<slug>.md 에 남겨라.`,
    '',
    'DB 에 쓰지 마라(자격증명이 이 프로세스에 없다). 적립은 오케스트레이터가 한다.',
  ].filter(Boolean).join('\n')
}

// export 인 이유: 초안 스텝은 `--dry` 에서 통째로 건너뛴다(에이전트를 안 띄운다).
// 그래서 프롬프트가 맞는지 확인하려면 루프 밖에서 같은 프롬프트를 꺼내 쓸 수밖에 없다.
// 사본을 만들면 두 벌이 갈라진다 — 여기를 정본으로 두고 가져다 쓴다.
export function writerPrompt(m, date) {
  return [
    '`.claude/agents/sa-cmo-writer.md` 를 Read 하고, 그 문서가 규정하는 역할로 아래 작업을 수행하라.',
    '(그 파일이 지시하는 `ops/roles/_principles.md` 도 반드시 먼저 Read 한다.)',
    '',
    `오늘 날짜: ${date}`,
    `대상 무브: case_moves ${m.id}`,
    `케이스: ${m.brand} (${m.slug}) · 병목 ${m.bottleneck} · 레버 ${m.lever}`,
    `등급: ${m.grade} · 방향: ${m.direction}`,
    `주장: ${m.claim}`,
    `근거 상세는 drafts/cases/${m.slug}.json 을 Read 해서 확인하라.`,
    '',
    m.grade === 'C'
      ? '★ 등급 C 다. 본문에 출처 귀속 문구가 없으면 CG-1 이 막는다. 반드시 넣어라.'
      : '',
    '',
    `산출물 4개 (전부 drafts/threads/ 아래, 파일명 접두 ${date}-${m.slug}):`,
    `  1) ${date}-${m.slug}.body.txt      본문 (500자 이하)`,
    `  2) ${date}-${m.slug}.selfreply.txt 자기답글`,
    `  3) ${date}-${m.slug}.md            게이트 Ⅰ~Ⅴ 판정 전문 + 지문 + 예측 6필드`,
    `  4) ${date}-${m.slug}.stage.json    스테이징 매니페스트. 아래 키를 정확히 채운다:`,
    JSON.stringify({
      case_slug: m.slug,
      move_id: m.id,
      content_code: `CS-${date.replace(/-/g, '')}-01`,
      body_path: `drafts/threads/${date}-${m.slug}.body.txt`,
      reply_path: `drafts/threads/${date}-${m.slug}.selfreply.txt`,
      decision_doc: `drafts/threads/${date}-${m.slug}.md`,
      title: '<15자 내외 제목>',
      twist_line: '<한 줄 반전>',
      hook_type: '<훅 유형>',
      closing_type: '<마무리 유형>',
      topic_tag: 'case-study',
      gate_note: '<게이트 판정 요약>',
    }, null, 2),
    '',
    '⛔ 발행하지 마라. Threads API 를 호출하지 마라. 이 프로세스에는 발행 자격증명이 없다.',
  ].filter(Boolean).join('\n')
}

function analystPrompt(raw, date) {
  return [
    '`.claude/agents/sa-cmo-analyst.md` 를 Read 하고, 그 문서가 규정하는 역할로 아래 원자료를 해설하라.',
    '(그 파일이 지시하는 `ops/roles/_principles.md` 도 반드시 먼저 Read 한다.)',
    '',
    `오늘 날짜: ${date}`,
    '',
    '아래는 오케스트레이터가 이미 실행해 얻은 결과다. 너는 DB 에 접근할 수 없다(자격증명 없음).',
    '이 텍스트만 근거로 해설하라. 없는 수치를 만들지 마라.',
    '',
    raw,
    '',
    '출력: 마크다운. 넓은 표 금지, 항목당 한 줄.',
    '유효 / 무효 / 보류(표본 부족) 를 반드시 분리해서 세라. 보류를 실패로도 성공으로도 세지 마라.',
    '다음 앵글 후보 3개까지, 각각 왜 지금인지 한 줄.',
  ].join('\n')
}

// ────────────────────────────────────────────────────────────
// 진입점 — 파일 맨 아래. 위 상수·함수가 전부 초기화된 뒤에 돈다.
// ────────────────────────────────────────────────────────────
if (isMain()) await main()
