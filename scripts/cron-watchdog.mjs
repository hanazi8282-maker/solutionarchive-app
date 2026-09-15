#!/usr/bin/env node
// 크론 감시 — 크론이 "안 돌았다"와 Threads 토큰이 죽어 가는 것을 아침 브리핑(07:00 KST) 전에
// Notion "일일 상태 로그" CTO 행의 막힌것 칸에 올린다 (reports/2026-09-15-code-audit.md 3-1·3-2).
//
//   node scripts/cron-watchdog.mjs          # .github/workflows/cron-watchdog.yml 이 매일 21:53 UTC 에 부른다
//   node scripts/cron-watchdog.mjs --dry    # Notion 에 쓰지 않고 판정만 출력
//
// 왜 워크플로마다 `if: failure()` 가 아니라 밖에서 세나 — 스케줄 미발화(2026-09-01 실측)는 실행 자체가
// 없어서 그 안의 어떤 스텝도 돌지 않는다. "있어야 할 실행"을 밖에서 세야 보인다.
//
// 판정 (CLAUDE.md §7.1 — 확인 불가도 이상으로 올린다):
//   - 일일 크론(`M H * * *`)마다 가장 최근 예정 시각 이후 schedule 실행이 있고, 끝났고, success 여야 한다.
//   - api_tokens 의 threads 행이 없거나·만료됐거나·만료 임박(lib/threads/token.ts tokenExpiryAlert)이면 이상.
// 이상이 있으면 CTO 행 1개(사람판단필요=true) + exit 1(Actions 실패 메일). 없으면 행을 쓰지 않는다.
//
// ⛔ access_token 은 읽지 않는다. 만료 시각만 본다 (CLAUDE.md §10 — 무인 루프에 발행 자격증명 없음).
// ponytail: 감시 자신이 미발화하면 여전히 조용하다. 필요해지면 두 번째 스케줄(같은 날 중복 행 방지 포함)을 붙인다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { kstDate, recordStatusLog } from './notion-status-log.mjs'
import { tokenExpiryAlert } from '../lib/threads/token.ts'

// 예정 시각 뒤 이만큼은 실행이 아직 없어도 봐준다(Actions 지연). 감시 스케줄은 가장 늦은 크론(20:17)
// 보다 이 이상 뒤여야 그날 실행을 센다 — 21:53 은 96분 뒤다.
export const GRACE_MS = 90 * 60 * 1000
const SELF = 'cron-watchdog.yml'

/** 워크플로 폴더 → [{ file, crons }]. schedule 이 있는 것만(주석 처리된 cron 은 제외), 감시 자신은 뺀다. */
export function scheduledWorkflows(dir) {
  return fs.readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f) && f !== SELF)
    .map((file) => ({
      file,
      crons: [...fs.readFileSync(path.join(dir, file), 'utf-8').matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    }))
    .filter((w) => w.crons.length)
}

/** now - GRACE 이전의 가장 최근 예정 시각. 일일 크론만 이해한다 — 그 밖은 null(확인 불가). */
export function lastSlot(cron, now) {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron.trim())
  if (!m) return null
  const t = new Date(now.getTime() - GRACE_MS)
  const slot = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), Number(m[2]), Number(m[1])))
  if (slot > t) slot.setUTCDate(slot.getUTCDate() - 1)
  return slot
}

/** 예정 시각과 schedule 실행 목록(GitHub API workflow_runs) → 이상 한 줄, 정상이면 null. */
export function judgeRuns(file, slot, runs) {
  const hhmm = `${slot.toISOString().slice(0, 16).replace('T', ' ')} UTC`
  const after = runs
    .filter((r) => Date.parse(r.created_at) >= slot.getTime() - 60_000)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  if (!after.length) return `${file}: ${hhmm} 예정 실행이 없다 — 미발화 또는 ${GRACE_MS / 60000}분 넘게 지연`
  const r = after[0]
  if (r.status !== 'completed') return `${file}: ${hhmm} 실행이 아직 안 끝났다(${r.status}) ${r.html_url ?? ''}`.trim()
  if (r.conclusion !== 'success') return `${file}: ${hhmm} 실행 ${r.conclusion} ${r.html_url ?? ''}`.trim()
  return null
}

/** 전 검사. 네트워크·기록은 주입받는다(셀프테스트가 가짜로 바꾼다). 반환 { problems, code, record? } */
export async function runWatchdog({
  now = new Date(), env = process.env, fetchImpl = fetch, record = recordStatusLog,
  workflowsDir, dry = false, log = console.log,
}) {
  const problems = []
  const repo = env.GITHUB_REPOSITORY

  for (const { file, crons } of scheduledWorkflows(workflowsDir)) {
    for (const cron of crons) {
      const slot = lastSlot(cron, now)
      if (!slot) { problems.push(`${file}: 일일 크론이 아닌 '${cron}' — 감시 확인 불가`); continue }
      if (!repo || !env.GITHUB_TOKEN) { problems.push(`${file}: 실행 이력 확인 불가 — GITHUB_REPOSITORY/GITHUB_TOKEN 없음`); continue }
      const since = new Date(slot.getTime() - 60_000).toISOString()
      const url = `https://api.github.com/repos/${repo}/actions/workflows/${file}/runs?event=schedule&per_page=20&created=${encodeURIComponent(`>=${since}`)}`
      try {
        const res = await fetchImpl(url, { headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' } })
        const body = await res.json().catch(() => null)
        if (!res.ok || !Array.isArray(body?.workflow_runs)) { problems.push(`${file}: 실행 이력 조회 실패(HTTP ${res.status}) — 확인 불가`); continue }
        const line = judgeRuns(file, slot, body.workflow_runs)
        if (line) problems.push(line)
      } catch (e) {
        problems.push(`${file}: 실행 이력 조회 실패(${e.message}) — 확인 불가`)
      }
    }
  }

  const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!sbUrl || !sbKey) problems.push('Threads 토큰: 확인 불가 — Supabase 환경변수 없음')
  else {
    try {
      const res = await fetchImpl(`${sbUrl}/rest/v1/api_tokens?provider=eq.threads&select=expires_at,user_id`, {
        headers: { apikey: sbKey, authorization: `Bearer ${sbKey}` },
      })
      const rows = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(rows)) problems.push(`Threads 토큰: api_tokens 조회 실패(HTTP ${res.status}) — 확인 불가`)
      else {
        const alert = tokenExpiryAlert(rows[0] ?? null, now.getTime())
        if (alert) problems.push(alert)
      }
    } catch (e) {
      problems.push(`Threads 토큰: api_tokens 조회 실패(${e.message}) — 확인 불가`)
    }
  }

  if (!problems.length) { log('✅ 크론 감시 — 이상 없음 (상태 로그 행을 쓰지 않는다)'); return { problems, code: 0 } }
  for (const p of problems) log(`❌ ${p}`)
  if (dry) return { problems, code: 1 }

  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : '로컬 실행(run URL 없음)'
  const w = await record({
    date: kstDate(now),
    track: 'CTO',
    done: `크론 감시 — 이상 ${problems.length}건 발견`,
    blocked: problems.join('\n'),
    next: '미발화·실패 크론은 Actions 탭에서 원인 확인 후 필요하면 수동 실행 · Threads 토큰 만료/임박이면 재인증',
    needsHuman: true,
    note: `cron-watchdog · ${runUrl}`,
  })
  log(w.ok ? `✅ Notion 기록·재확인: ${w.title}` : `❌ Notion 기록 실패 — ${w.stage}: ${w.error}`)
  return { problems, code: 1, record: w }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const r = await runWatchdog({ workflowsDir: path.join(process.cwd(), '.github', 'workflows'), dry: process.argv.includes('--dry') })
  process.exit(r.code)
}
