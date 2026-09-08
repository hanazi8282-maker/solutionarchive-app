#!/usr/bin/env node
// 에이전트 실행 진행 상태 기록기 — 가시화의 **쓰기 쪽**.
//
// 정본은 DB(`agent_runs` / `agent_run_steps`)다. 파일 세 표면
// ($GITHUB_STEP_SUMMARY · reports/status/DASHBOARD.md · Actions artifact)은
// 전부 이 DB 를 렌더한 결과이지 정본이 아니다.
//
// 왜 DB 인가 — 커밋 실패 자체가 가장 알고 싶은 사건이기 때문이다.
//   reports/ 파일은 커밋이 성공해야 남는다. 그런데 커밋 전 단계에서 죽은 실행이
//   바로 사람이 알아야 할 실행이다. 그 실행은 파일 표면에 한 줄도 안 남는다.
//   그래서 매 스텝을 즉시 DB 에 쓴다.
//
// ⚠️ DB 에 못 닿으면 조용히 성공하지 않는다.
//   `ops/state/<run_key>.jsonl` 로 폴백하되 **폴백했다는 사실과 이유를 기록에
//   박는다.** 렌더러(status-render.mjs)가 그걸 읽고 "DB 확인 불가 — 로컬 기준"
//   을 화면에 띄운다. 폴백을 정상으로 접으면 §7.1 위반이고, 그러면 "DB 에 아무
//   기록이 없다"가 "실행이 없었다"로 읽힌다.
//
// ⚠️ dry-run 은 DB 에 쓰지 않는다. **의도된 동작이다.**
//   dry-run 의 계약은 "DB·git 을 건드리지 않는다"이고, 상태 기록도 DB 쓰기다.
//   대신 JSONL 에는 전부 남기고 `mode='dry-run'` 으로 표시한다. 아무 데도 안
//   남기면 dry-run 이 정말 무엇을 했는지 검증할 방법이 없어진다.
//
// 사용 (CLI):
//   node scripts/agent-status.mjs run start  --run-key cmo-2026-09-08-01 --dept cmo --trigger cron [--dry-run]
//   node scripts/agent-status.mjs run step   --run-key ... --seq 1 --key preflight --label "사전 점검" --status ok [--counts '{"n":2}']
//   node scripts/agent-status.mjs run step   --run-key ... --seq 6 --key stage --label "스테이징" --status blocked --blocker "CG-1 귀속 문구 없음"
//   node scripts/agent-status.mjs run finish --run-key ... --status partial [--summary '{"drafted":2}']
//
// 라이브러리로도 쓴다 (scripts/cmo-daily.mjs 가 import 한다).
//
// 종료 코드: 0 기록됨(DB 또는 폴백) / 2 사용법 오류

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '../lib/supabase/server.ts'

export const RUN_STATUS = ['running', 'ok', 'partial', 'failed', 'blocked']
export const STEP_STATUS = ['pending', 'running', 'ok', 'skipped', 'failed', 'blocked']
export const DEPTS = ['cmo', 'cto', 'ceo-staff']
export const TRIGGERS = ['cron', 'manual', 'local']

export const STATE_DIR = path.join(process.cwd(), 'ops', 'state')

/** DB 미적용/미도달을 뜻하는 PostgREST·Postgres 코드. 이걸 "행 0건"과 섞지 않는다. */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202'])

function jsonlPath(runKey, stateDir = STATE_DIR) {
  // run_key 는 우리가 만드는 값이지만, 파일 경로로 쓰는 이상 방어한다.
  const safe = String(runKey).replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(stateDir, `${safe}.jsonl`)
}

/** 폴백 기록. 한 줄 = 한 이벤트. append-only 라 부분 실패에도 앞부분이 남는다. */
export function appendEvent(runKey, event, stateDir = STATE_DIR) {
  fs.mkdirSync(stateDir, { recursive: true })
  fs.appendFileSync(
    jsonlPath(runKey, stateDir),
    JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n',
    'utf-8',
  )
}

/** JSONL 을 읽어 이벤트 배열로. 없으면 null (빈 배열과 구분한다 — §7.1). */
export function readEvents(runKey, stateDir = STATE_DIR) {
  const p = jsonlPath(runKey, stateDir)
  if (!fs.existsSync(p)) return null
  const out = []
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const s = line.trim()
    if (!s) continue
    try { out.push(JSON.parse(s)) } catch { out.push({ kind: 'corrupt', raw: s.slice(0, 200) }) }
  }
  return out
}

/**
 * blocked 인데 blocker 가 없는 걸 **로컬에서** 막는다.
 *
 * DB CHECK 도 같은 걸 막지만, 폴백 경로(JSONL)에는 DB 가 없다. 검사를 DB 에만
 * 두면 폴백일 때 사유 없는 차단이 조용히 통과한다 — 안전장치가 한쪽 경로에만
 * 걸린 상태다. 두 경로 모두에서 같은 규칙이 서게 순수 함수로 뽑는다.
 */
export function validateStep({ status, blocker, stepKey, label, seq }) {
  const errs = []
  if (!STEP_STATUS.includes(status)) errs.push(`status 어휘 밖: ${status} (${STEP_STATUS.join('/')})`)
  if (!stepKey) errs.push('step_key 가 비었다')
  if (!label) errs.push('label 이 비었다')
  if (!Number.isInteger(seq)) errs.push(`seq 가 정수가 아니다: ${seq}`)
  if (status === 'blocked' && !String(blocker ?? '').trim()) {
    errs.push('blocked 인데 blocker 가 비었다 — 사유 없는 차단은 다음 날 아침 무시된다')
  }
  return errs
}

/**
 * 실행 추적기. DB 우선, 실패 시 JSONL 폴백.
 *
 * `dbOk === false` 이면 소비 쪽은 반드시 "DB 확인 불가"를 화면에 남겨야 한다.
 * 이 플래그를 무시하고 렌더하면 로컬 파일이 정본인 척하게 된다.
 */
export async function createTracker({
  runKey,
  dept,
  trigger = 'local',
  dryRun = false,
  gitSha = null,
  runUrl = null,
  stateDir = STATE_DIR,
  quiet = false,
} = {}) {
  if (!runKey) throw new Error('runKey 가 필요하다')
  if (!DEPTS.includes(dept)) throw new Error(`dept 어휘 밖: ${dept} (${DEPTS.join('/')})`)
  if (!TRIGGERS.includes(trigger)) throw new Error(`trigger 어휘 밖: ${trigger} (${TRIGGERS.join('/')})`)

  const say = (s) => { if (!quiet) console.log(s) }

  let supabase = null
  let runId = null
  let dbOk = false
  let fallbackReason = null

  if (dryRun) {
    // 계약: dry-run 은 DB 를 건드리지 않는다. 폴백이 아니라 **선택**이다.
    fallbackReason = 'dry-run — 설계상 DB 에 쓰지 않는다 (사고가 아니다)'
  } else {
    try {
      supabase = await createClient()
      if (!supabase) {
        fallbackReason = 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정'
      }
    } catch (e) {
      supabase = null
      fallbackReason = `Supabase 클라이언트 생성 실패 — ${e.message}`
    }
  }

  if (supabase) {
    const row = {
      run_key: runKey, dept, trigger, status: 'running',
      dry_run: dryRun, git_sha: gitSha, run_url: runUrl,
    }
    const res = await supabase.from('agent_runs')
      .upsert(row, { onConflict: 'run_key' }).select('id').single()
    if (res.error) {
      const code = res.error.code ?? ''
      fallbackReason = MISSING_TABLE_CODES.has(code)
        ? `agent_runs 테이블 없음 (${code}) — 마이그레이션 20260908000001 미적용`
        : `agent_runs 기록 실패 — ${code} ${res.error.message}`
      supabase = null
    } else {
      runId = res.data.id
      dbOk = true
    }
  }

  appendEvent(runKey, {
    kind: 'run_start', run_key: runKey, dept, trigger,
    dry_run: dryRun, git_sha: gitSha, run_url: runUrl,
    mode: dryRun ? 'dry-run' : 'live',
    db_ok: dbOk, fallback_reason: fallbackReason,
  }, stateDir)

  if (!dbOk) {
    say(`⚠️ 상태를 DB 에 못 남긴다 — ${fallbackReason}`)
    say(`   ops/state/${runKey}.jsonl 로 폴백한다. 이 실행의 상태는 "DB 확인 불가"다.`)
  }

  let seqCounter = 0

  async function step({ stepKey, label, status = 'running', counts = {}, blocker = null, detail = {}, seq = null }) {
    const useSeq = Number.isInteger(seq) ? seq : ++seqCounter
    const errs = validateStep({ status, blocker, stepKey, label, seq: useSeq })
    if (errs.length) throw new Error(`스텝 기록 거부: ${errs.join(' / ')}`)

    appendEvent(runKey, {
      kind: 'step', run_key: runKey, seq: useSeq, step_key: stepKey, label,
      status, counts, blocker, detail,
    }, stateDir)

    if (!dbOk) return { written: 'jsonl', reason: fallbackReason }

    const res = await supabase.from('agent_run_steps').upsert({
      run_id: runId, seq: useSeq, step_key: stepKey, label, status,
      counts, blocker, detail, updated_at: new Date().toISOString(),
    }, { onConflict: 'run_id,step_key' })

    if (res.error) {
      // 한 스텝 기록 실패로 실행 전체를 죽이지 않는다. 다만 조용히 넘어가지도
      // 않는다 — 이 줄이 나오면 그 뒤 상태 화면은 불완전하다.
      say(`⚠️ 스텝 기록 실패 (${stepKey}) — ${res.error.code ?? ''} ${res.error.message}`)
      return { written: 'jsonl', reason: `DB 스텝 기록 실패 — ${res.error.message}` }
    }
    return { written: 'db' }
  }

  async function finish({ status, summary = {} }) {
    if (!RUN_STATUS.includes(status)) throw new Error(`run status 어휘 밖: ${status}`)

    appendEvent(runKey, {
      kind: 'run_finish', run_key: runKey, status, summary,
    }, stateDir)

    if (!dbOk) return { written: 'jsonl', reason: fallbackReason }

    const res = await supabase.from('agent_runs')
      .update({ status, summary, finished_at: new Date().toISOString() })
      .eq('id', runId)
    if (res.error) {
      say(`⚠️ 실행 종료 기록 실패 — ${res.error.code ?? ''} ${res.error.message}`)
      return { written: 'jsonl', reason: res.error.message }
    }
    return { written: 'db' }
  }

  return {
    runKey, dept, trigger, dryRun,
    get runId() { return runId },
    get dbOk() { return dbOk },
    get fallbackReason() { return fallbackReason },
    step, finish,
  }
}

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────
function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}

if (isMain()) {
  const argv = process.argv.slice(2)
  const opt = (n, d = null) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
  }
  const flag = (n) => argv.includes(`--${n}`)
  const jsonOpt = (n) => {
    const raw = opt(n)
    if (!raw) return {}
    try { return JSON.parse(raw) } catch { console.error(`✗ --${n} 가 JSON 이 아니다`); process.exit(2) }
  }

  const [group, action] = argv
  if (group !== 'run' || !['start', 'step', 'finish'].includes(action)) {
    console.error('사용: agent-status.mjs run start|step|finish --run-key <key> ...')
    process.exit(2)
  }

  const runKey = opt('run-key')
  if (!runKey) { console.error('✗ --run-key 가 필요하다'); process.exit(2) }

  const dryRun = flag('dry-run')
  const stateDir = opt('state-dir', STATE_DIR)

  if (action === 'start') {
    const t = await createTracker({
      runKey, dept: opt('dept', 'cmo'), trigger: opt('trigger', 'local'),
      dryRun, gitSha: opt('git-sha'), runUrl: opt('run-url'), stateDir,
    })
    console.log(`▶ ${runKey} 시작 (${t.dbOk ? 'DB 기록' : 'JSONL 폴백'})`)
    process.exit(0)
  }

  // step / finish 는 이미 시작된 실행에 붙는다. 같은 run_key 로 tracker 를 다시
  // 만들면 upsert 라 행이 늘지 않는다 (UNIQUE(run_key)).
  const t = await createTracker({
    runKey, dept: opt('dept', 'cmo'), trigger: opt('trigger', 'local'),
    dryRun, stateDir, quiet: true,
  })

  if (action === 'step') {
    const seqRaw = opt('seq')
    try {
      const r = await t.step({
        stepKey: opt('key'), label: opt('label'), status: opt('status', 'running'),
        counts: jsonOpt('counts'), blocker: opt('blocker'), detail: jsonOpt('detail'),
        seq: seqRaw === null ? null : Number(seqRaw),
      })
      console.log(`· ${opt('key')} = ${opt('status', 'running')} (${r.written})`)
      process.exit(0)
    } catch (e) {
      console.error(`✗ ${e.message}`)
      process.exit(2)
    }
  }

  const r = await t.finish({ status: opt('status', 'ok'), summary: jsonOpt('summary') })
  console.log(`■ ${runKey} 종료 = ${opt('status', 'ok')} (${r.written})`)
  process.exit(0)
}
