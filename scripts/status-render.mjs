#!/usr/bin/env node
// 에이전트 실행 상태 렌더러 — 가시화의 **읽기 쪽**.
//
// 정본 DB(agent_runs/agent_run_steps) 또는 폴백 JSONL(ops/state/*.jsonl)을 읽어
// 두 표면에 같은 내용을 찍는다:
//   1) reports/status/DASHBOARD.md   (커밋되어 남는 표면)
//   2) $GITHUB_STEP_SUMMARY          (Actions 잡 요약. 90일 뒤 사라진다)
//
// ⚠️ DB 를 못 읽었을 때 "실행 없음"으로 찍지 않는다.
//    "DB 확인 불가 — 로컬 기준" 을 맨 위에 박는다. 이 구분이 없으면
//    "어젯밤 아무 일도 없었다"와 "어젯밤 상태를 못 읽는다"가 같은 화면이 된다.
//
// ⚠️ 5분 넘게 갱신이 없는 running 은 stale 로 표시한다.
//    running 인 채 멈춘 실행은 "돌고 있다"가 아니라 "죽었을 수 있다"이다.
//    시간 정보 없이 running 만 찍으면 죽은 루프가 영원히 진행 중으로 보인다.
//
// 넓은 표를 쓰지 않는다. 부서당 한 줄 + 스텝 진행 기호다.
//
// 사용:
//   node --env-file=.env.local scripts/status-render.mjs [--run-key <key>] [--limit 5] [--stdout]
//
// 종료 코드: 0 렌더됨(DB) / 2 DB 확인 불가 — 폴백으로 렌더는 했다

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STATE_DIR } from './agent-status.mjs'

export const STALE_MS = 5 * 60 * 1000

// ● 완료 / ◐ 진행중 / ○ 대기·건너뜀 / ✕ 실패 / ▲ 막힘(안전장치 작동)
export const MARKS = {
  ok: '●', running: '◐', pending: '○', skipped: '○', failed: '✕', blocked: '▲',
}

const RUN_ICON = { ok: '✅', partial: '🟡', running: '⏳', failed: '❌', blocked: '⛔' }

const hhmm = (iso) => (iso ? String(iso).slice(11, 16) : '--:--')

/**
 * 한 실행을 한 줄로. 넓은 표 대신 이것 하나가 부서의 상태다.
 *
 * 순수 함수다 — 셀프테스트가 stale 판정과 blocked 표기를 시계 없이 고정한다.
 */
export function renderRunLine(run, now = Date.now()) {
  const steps = [...(run.steps ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const bar = steps.map((s) => MARKS[s.status] ?? '?').join('')

  const lastTouch = steps.reduce((acc, s) => {
    const t = Date.parse(s.updated_at ?? s.started_at ?? '') || 0
    return Math.max(acc, t)
  }, Date.parse(run.finished_at ?? run.started_at ?? '') || 0)

  const stale = run.status === 'running' && lastTouch > 0 && now - lastTouch > STALE_MS
  const staleMark = stale ? ` ⚠️ stale(${Math.floor((now - lastTouch) / 60000)}분 미갱신)` : ''

  const icon = RUN_ICON[run.status] ?? '·'
  const dry = run.dry_run ? ' · dry-run' : ''
  const okN = steps.filter((s) => s.status === 'ok').length

  return `- ${icon} **${run.dept}** \`${bar}\` ${okN}/${steps.length} · ${hhmm(run.started_at)}~${run.finished_at ? hhmm(run.finished_at) : '진행중'}${dry}${staleMark} · \`${run.run_key}\``
}

/**
 * 막힌·실패한 스텝, 그리고 **ok 인데 일부가 죽은** 스텝을 사유와 함께.
 * 아무 문제 없는 스텝은 한 줄도 찍지 않는다.
 *
 * ★ 세 번째 분기(부분 실패)를 2026-09-11 에 추가했다. 그날 cmo 루프의
 *   `commit_cases` 는 2건 중 1건(hoka)이 validate exit 1 로 죽었는데 나머지
 *   1건이 통과해 스텝 status 가 `ok` 였다. 이 함수가 ok 를 아예 안 보니
 *   DASHBOARD 는 그 실행을 10/10 완료로만 표시했고, 실패 사실은 DB 를 직접
 *   열기 전까지 어디에도 없었다.
 *
 *   판정(ok/failed)은 스텝이 정한다. 여기서 뒤집지 않는다 — **보이게만** 한다.
 *   규약: `counts.partial_failed`(건수) + `detail.errors`(사유 배열).
 */
export function renderProblems(runs) {
  const out = []
  for (const run of runs) {
    for (const s of run.steps ?? []) {
      if (s.status === 'blocked') {
        out.push(`- ▲ \`${run.dept}/${s.step_key}\` 막힘 — ${s.blocker ?? '⚠️ 사유 미기록(이건 그 자체로 버그다)'}`)
      } else if (s.status === 'failed') {
        const why = s.detail?.error ?? s.detail?.reason ?? '사유 미기록'
        out.push(`- ✕ \`${run.dept}/${s.step_key}\` 실패 — ${why}`)
      } else if (Number(s.counts?.partial_failed) > 0) {
        const errs = Array.isArray(s.detail?.errors) ? s.detail.errors.filter(Boolean) : []
        const why = errs.join(' | ') || s.detail?.error || '사유 미기록'
        out.push(`- ◍ \`${run.dept}/${s.step_key}\` 부분 실패 ${s.counts.partial_failed}건 (스텝 판정은 ${s.status}) — ${why}`)
      }
    }
  }
  return out
}

/**
 * 대시보드 전문.
 *
 * `source` 가 'db' 가 아니면 맨 위에 확인 불가 배너를 박는다. 이 배너를 조건부로
 * 숨기지 마라 — 숨기는 순간 로컬 파일이 정본인 척하게 된다.
 */
export function renderDashboard(runs, { now = Date.now(), source = 'db', reason = null } = {}) {
  const L = []
  L.push('# 에이전트 실행 상태')
  L.push('')
  L.push(`_갱신 ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC · 기호 ● 완료 ◐ 진행 ○ 대기·건너뜀 ✕ 실패 ▲ 막힘 ◍ 부분 실패(스텝은 ok)_`)
  L.push('')

  if (source !== 'db') {
    L.push('> ⚠️ **DB 확인 불가 — 로컬 기준(ops/state/*.jsonl)으로 렌더했다.**')
    L.push(`> 사유: ${reason ?? '미기록'}`)
    L.push('> 아래 내용은 정본이 아니다. DB 에 실제로 무엇이 남았는지는 확인되지 않았다.')
    L.push('')
  }

  if (!runs || runs.length === 0) {
    L.push(source === 'db'
      ? '- 최근 실행 없음 (조회는 정상이다 — "확인 불가"가 아니라 "0건"이다)'
      : '- 로컬 상태 파일이 없다. **실행이 없었다는 뜻이 아니다** — DB 를 못 읽었을 뿐이다.')
    L.push('')
    return L.join('\n')
  }

  L.push('## 부서')
  L.push('')
  for (const r of runs) L.push(renderRunLine(r, now))
  L.push('')

  const problems = renderProblems(runs)
  if (problems.length) {
    L.push('## 막힘·실패·부분 실패')
    L.push('')
    L.push(...problems)
    L.push('')
    L.push('_▲ 막힘은 안전장치가 작동한 것이다. 실패도 성공도 아니다 — 사유를 보고 사람이 판단한다._')
    L.push('_◍ 부분 실패는 스텝 판정이 ok 인데 일부 대상이 죽은 것이다. 초록불이라고 넘기지 마라 (§7.2)._')
    L.push('')
  }

  const dryOnly = runs.every((r) => r.dry_run)
  if (dryOnly) {
    L.push('**전부 dry-run 이다. DB·git 에 반영된 것은 없다.**')
    L.push('')
  }

  return L.join('\n')
}

// ────────────────────────────────────────────────────────────
// 데이터 로딩
// ────────────────────────────────────────────────────────────

/** JSONL 이벤트를 run 형태로 접는다. 마지막 이벤트가 이긴다(append-only 재생). */
export function foldEvents(events) {
  const run = { steps: [] }
  const byKey = new Map()
  for (const e of events) {
    if (e.kind === 'run_start') {
      Object.assign(run, {
        run_key: e.run_key, dept: e.dept, trigger: e.trigger, dry_run: e.dry_run,
        status: 'running', started_at: e.ts, db_ok: e.db_ok, fallback_reason: e.fallback_reason,
      })
    } else if (e.kind === 'step') {
      const prev = byKey.get(e.step_key)
      const row = {
        seq: e.seq, step_key: e.step_key, label: e.label, status: e.status,
        counts: e.counts, blocker: e.blocker, detail: e.detail,
        started_at: prev?.started_at ?? e.ts, updated_at: e.ts,
      }
      byKey.set(e.step_key, row)
    } else if (e.kind === 'run_finish') {
      run.status = e.status
      run.finished_at = e.ts
      run.summary = e.summary
    }
  }
  run.steps = [...byKey.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  return run
}

function loadFromJsonl(stateDir, limit) {
  if (!fs.existsSync(stateDir)) return []
  const files = fs.readdirSync(stateDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, m: fs.statSync(path.join(stateDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, limit)

  const runs = []
  for (const { f } of files) {
    const events = []
    for (const line of fs.readFileSync(path.join(stateDir, f), 'utf-8').split('\n')) {
      const s = line.trim()
      if (!s) continue
      try { events.push(JSON.parse(s)) } catch { /* 깨진 줄은 건너뛴다 */ }
    }
    if (events.length) runs.push(foldEvents(events))
  }
  return runs
}

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
  const limit = Number(opt('limit', '5'))
  const stateDir = opt('state-dir', STATE_DIR)
  const outPath = opt('out', path.join(process.cwd(), 'reports', 'status', 'DASHBOARD.md'))

  let runs = null
  let source = 'db'
  let reason = null

  try {
    const { createClient } = await import('../lib/supabase/server.ts')
    const supabase = await createClient()
    if (!supabase) {
      reason = 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정'
    } else {
      const runKey = opt('run-key')
      let q = supabase.from('agent_runs')
        .select('id,run_key,dept,trigger,status,dry_run,started_at,finished_at,summary')
        .order('started_at', { ascending: false })
        .limit(limit)
      if (runKey) q = q.eq('run_key', runKey)
      const runRes = await q
      if (runRes.error) {
        reason = `agent_runs 조회 실패 — ${runRes.error.code ?? ''} ${runRes.error.message}`
      } else {
        const ids = (runRes.data ?? []).map((r) => r.id)
        let steps = []
        if (ids.length) {
          const stepRes = await supabase.from('agent_run_steps')
            .select('run_id,seq,step_key,label,status,counts,blocker,detail,started_at,updated_at')
            .in('run_id', ids)
          if (stepRes.error) {
            reason = `agent_run_steps 조회 실패 — ${stepRes.error.code ?? ''} ${stepRes.error.message}`
          } else {
            steps = stepRes.data ?? []
          }
        }
        if (!reason) {
          runs = (runRes.data ?? []).map((r) => ({ ...r, steps: steps.filter((s) => s.run_id === r.id) }))
        }
      }
    }
  } catch (e) {
    reason = `Supabase 접근 실패 — ${e.message}`
  }

  if (runs === null) {
    source = 'jsonl'
    runs = loadFromJsonl(stateDir, limit)
  }

  const md = renderDashboard(runs, { source, reason })

  if (argv.includes('--stdout')) {
    console.log(md)
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, md + '\n', 'utf-8')
    console.log(`✅ ${path.relative(process.cwd(), outPath)} 갱신 (${runs.length}건, source=${source})`)
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n', 'utf-8')
  }

  if (source !== 'db') {
    console.error(`⚠️ 확인 불가: DB 를 못 읽어 로컬 기준으로 렌더했다 — ${reason}`)
    process.exit(2)
  }
  process.exit(0)
}
