// scripts/cron-watchdog.mjs 자체 검증 — 미발화·실패·토큰 정상/만료/만료 임박.
//
//   node scripts/cron-watchdog-selftest.mjs
//
// 네트워크 없음. fetch·Notion 기록을 가짜로 바꾸되, 판정 함수만이 아니라 runWatchdog 전체
// (워크플로 파일 읽기 → API 응답 해석 → 기록 입력)를 거친다 (CLAUDE.md §7.1 부품≠통합).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { lastSlot, judgeRuns, scheduledWorkflows, runWatchdog } = await import('./cron-watchdog.mjs')
const { tokenExpiryAlert } = await import('../lib/threads/token.ts')

let passed = 0
const failures = []
function ok(name, cond, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const DAY = 86_400_000
const NOW = new Date('2026-09-15T21:53:00Z')
const iso = (ms) => new Date(ms).toISOString()

// ── 1) 예정 시각 ───────────────────────────────────────────────
ok('slot — 오늘 20:17 (96분 전, GRACE 밖)', lastSlot('17 20 * * *', NOW)?.toISOString() === '2026-09-15T20:17:00.000Z')
ok('slot — 오늘 12:07', lastSlot('7 12 * * *', NOW)?.toISOString() === '2026-09-15T12:07:00.000Z')
ok('slot — GRACE 안이면 어제', lastSlot('17 20 * * *', new Date('2026-09-15T21:00:00Z'))?.toISOString() === '2026-09-14T20:17:00.000Z')
ok('slot — 자정 넘김', lastSlot('53 21 * * *', new Date('2026-09-16T00:30:00Z'))?.toISOString() === '2026-09-15T21:53:00.000Z')
ok('slot — 주간 크론은 확인 불가(null)', lastSlot('0 19 * * 0', NOW) === null)

// ── 2) 실행 판정 ───────────────────────────────────────────────
const slot = new Date('2026-09-15T20:17:00Z')
const run = (over) => ({ created_at: '2026-09-15T20:19:00Z', status: 'completed', conclusion: 'success', html_url: 'https://gh/run/1', ...over })
ok('판정 — 성공', judgeRuns('a.yml', slot, [run()]) === null)
ok('판정 — 실행 없음 = 미발화', judgeRuns('a.yml', slot, [])?.includes('미발화'))
ok('판정 — 어제 실행만 있으면 미발화', judgeRuns('a.yml', slot, [run({ created_at: '2026-09-14T20:20:00Z' })])?.includes('미발화'))
ok('판정 — 실패', judgeRuns('a.yml', slot, [run({ conclusion: 'failure' })])?.includes('failure'))
ok('판정 — 취소도 실패', judgeRuns('a.yml', slot, [run({ conclusion: 'cancelled' })])?.includes('cancelled'))
ok('판정 — 진행 중', judgeRuns('a.yml', slot, [run({ status: 'in_progress', conclusion: null })])?.includes('안 끝났다'))
ok('판정 — 최신 실행 기준', judgeRuns('a.yml', slot, [run({ conclusion: 'failure', created_at: '2026-09-15T20:18:00Z' }), run({ created_at: '2026-09-15T20:40:00Z' })]) === null)

// ── 3) 워크플로 파일 읽기 ────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-'))
fs.writeFileSync(path.join(tmp, 'a.yml'), "on:\n  schedule:\n    - cron: '17 20 * * *'\n")
fs.writeFileSync(path.join(tmp, 'b.yml'), "on:\n  # schedule:\n  #   - cron: '0 1 * * *'\n  workflow_dispatch:\n")
fs.writeFileSync(path.join(tmp, 'cron-watchdog.yml'), "on:\n  schedule:\n    - cron: '53 21 * * *'\n")
const wf = scheduledWorkflows(tmp)
ok('파일 — 스케줄 있는 것만, 주석·자기 자신 제외', wf.length === 1 && wf[0].file === 'a.yml' && wf[0].crons[0] === '17 20 * * *', JSON.stringify(wf))
const real = scheduledWorkflows(path.join(import.meta.dirname, '..', '.github', 'workflows'))
ok('실제 리포 — daily-cmo-loop 포함', real.some((w) => w.file === 'daily-cmo-loop.yml' && w.crons.includes('17 20 * * *')))
ok('실제 리포 — nightly-review-collect 포함', real.some((w) => w.file === 'nightly-review-collect.yml'))
ok('실제 리포 — 감시 자신 제외', !real.some((w) => w.file === 'cron-watchdog.yml'))
ok('실제 리포 — 전부 감시 가능한 일일 크론', real.every((w) => w.crons.every((c) => lastSlot(c, NOW))), JSON.stringify(real))

// ── 4) 토큰 판정 (정상 / 만료 / 만료 임박) ────────────────────────
const tok = (days, over = {}) => ({ expires_at: iso(NOW.getTime() + days * DAY), user_id: 'u1', ...over })
ok('토큰 — 정상 30일', tokenExpiryAlert(tok(30), NOW.getTime()) === null)
ok('토큰 — 6.5일은 아직 정상(매시 갱신 대기)', tokenExpiryAlert(tok(6.5), NOW.getTime()) === null)
ok('토큰 — 만료 임박 3일', tokenExpiryAlert(tok(3), NOW.getTime())?.includes('만료 임박'))
ok('토큰 — 만료됨', tokenExpiryAlert(tok(-1), NOW.getTime())?.includes('만료됨'))
ok('토큰 — 행 없음 = 재인증', tokenExpiryAlert(null, NOW.getTime())?.includes('재인증'))
ok('토큰 — user_id 없음 = 재인증', tokenExpiryAlert(tok(30, { user_id: null }), NOW.getTime())?.includes('재인증'))
ok('토큰 — 날짜 깨짐 = 확인 불가', tokenExpiryAlert(tok(30, { expires_at: 'garbage' }), NOW.getTime())?.includes('확인 불가'))

// ── 5) 통합: runWatchdog ───────────────────────────────────────
const ENV = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'gh', GITHUB_RUN_ID: '9', NEXT_PUBLIC_SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k' }
const resp = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
async function scenario({ runs = [run()], ghStatus = 200, tokenRows = [tok(30)], sbStatus = 200, env = ENV, dry = false }) {
  const urls = []
  const records = []
  const r = await runWatchdog({
    now: NOW, env, dry, workflowsDir: tmp, log: () => {},
    fetchImpl: async (url) => {
      urls.push(String(url))
      if (String(url).startsWith('https://api.github.com/')) return resp({ workflow_runs: runs }, ghStatus)
      return resp(tokenRows, sbStatus)
    },
    record: async (entry) => { records.push(entry); return { ok: true, title: `${entry.date}-${entry.track}` } },
  })
  return { ...r, urls, records }
}

let s = await scenario({})
ok('통합 정상 — exit 0', s.code === 0, JSON.stringify(s.problems))
ok('통합 정상 — Notion 행 안 씀', s.records.length === 0)
ok('통합 — GitHub 조회는 schedule 이벤트·예정 시각 이후', s.urls[0].includes('/actions/workflows/a.yml/runs?event=schedule') && s.urls[0].includes(encodeURIComponent('>=2026-09-15T20:16:00.000Z')), s.urls[0])
ok('통합 — access_token 을 조회하지 않는다', s.urls.some((u) => u.includes('api_tokens')) && !s.urls.some((u) => u.includes('access_token')))

s = await scenario({ tokenRows: [tok(3)] })
ok('통합 만료 임박 — exit 1', s.code === 1)
ok('통합 만료 임박 — CTO 행·사람판단필요', s.records.length === 1 && s.records[0].track === 'CTO' && s.records[0].needsHuman === true)
ok('통합 만료 임박 — 막힌것에 올라감', s.records[0]?.blocked.includes('만료 임박'))
ok('통합 만료 임박 — 날짜는 KST', s.records[0]?.date === '2026-09-16')
ok('통합 — 비고에 run URL', s.records[0]?.note.includes('https://github.com/o/r/actions/runs/9'))

s = await scenario({ tokenRows: [tok(-2)] })
ok('통합 만료 — 막힌것에 만료됨', s.code === 1 && s.records[0]?.blocked.includes('만료됨'))

s = await scenario({ tokenRows: [] })
ok('통합 토큰 행 없음 — 재인증', s.code === 1 && s.records[0]?.blocked.includes('재인증'))

s = await scenario({ runs: [] })
ok('통합 미발화 — 막힌것에 워크플로 이름', s.code === 1 && s.records[0]?.blocked.includes('a.yml') && s.records[0]?.blocked.includes('미발화'))

s = await scenario({ runs: [run({ conclusion: 'failure' })], tokenRows: [tok(3)] })
ok('통합 두 가지 동시 — 둘 다 올라감', s.problems.length === 2 && s.records[0]?.blocked.split('\n').length === 2)

s = await scenario({ ghStatus: 500 })
ok('통합 GitHub 500 — 확인 불가도 이상', s.code === 1 && s.problems[0]?.includes('확인 불가'))

s = await scenario({ sbStatus: 504, tokenRows: { message: 'Gateway Timeout' } })
ok('통합 Supabase 504 — 확인 불가도 이상(정상으로 접지 않음)', s.code === 1 && s.problems[0]?.includes('확인 불가'))

s = await scenario({ env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' } })
ok('통합 env 없음 — 확인 불가', s.code === 1 && s.problems.some((p) => p.includes('Supabase 환경변수 없음')))

s = await scenario({ tokenRows: [tok(3)], dry: true })
ok('통합 --dry — 이상이어도 기록 안 함', s.code === 1 && s.records.length === 0)

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`FAIL ${failures.length} / PASS ${passed}`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASS ${passed}`)
