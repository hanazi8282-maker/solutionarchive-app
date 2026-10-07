// scripts/cron-watchdog.mjs 자체 검증 — 미발화·실패·토큰 정상/만료/만료 임박.
//
//   node scripts/cron-watchdog-selftest.mjs
//
// 네트워크 없음. fetch·Notion 기록을 가짜로 바꾸되, 판정 함수만이 아니라 runWatchdog 전체
// (워크플로 파일 읽기 → API 응답 해석 → 기록 입력)를 거친다 (CLAUDE.md §7.1 부품≠통합).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { lastSlot, judgeRuns, nextSlotAfter, scheduledWorkflows, runWatchdog, workflowLandedAt, pushWithoutBotToken, GRACE_MS, GRACE_OVERRIDE_MS, graceFor } = await import('./cron-watchdog.mjs')
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
ok('GRACE — 4시간 (남헌 2026-09-18 결정)', GRACE_MS === 4 * 60 * 60 * 1000, String(GRACE_MS))
ok('slot — 오늘 12:07 (9h46m 전, GRACE 밖)', lastSlot('7 12 * * *', NOW)?.toISOString() === '2026-09-15T12:07:00.000Z')
ok('slot — 오늘 17:37 (4h16m 전, GRACE 밖)', lastSlot('37 17 * * *', NOW)?.toISOString() === '2026-09-15T17:37:00.000Z')
// 감시(21:53)와의 간격이 GRACE 보다 좁은 크론 3개는 그날이 아니라 다음 날 감시가 판정한다.
ok('slot — 20:17 은 간격 1h36m → 어제 슬롯(다음 날 판정)', lastSlot('17 20 * * *', NOW)?.toISOString() === '2026-09-14T20:17:00.000Z')
ok('slot — 18:41 은 간격 3h12m → 어제 슬롯', lastSlot('41 18 * * *', NOW)?.toISOString() === '2026-09-14T18:41:00.000Z')
ok('slot — 18:19 은 간격 3h34m → 어제 슬롯', lastSlot('19 18 * * *', NOW)?.toISOString() === '2026-09-14T18:19:00.000Z')
// 4시간 경계: 슬롯이 판정 대상이 되는 순간.
ok('slot — 지연 3h59m 시점엔 아직 그 슬롯을 안 본다', lastSlot('7 12 * * *', new Date('2026-09-15T16:06:00Z'))?.toISOString() === '2026-09-14T12:07:00.000Z')
ok('slot — 지연 4h01m 시점엔 그 슬롯을 본다', lastSlot('7 12 * * *', new Date('2026-09-15T16:08:00Z'))?.toISOString() === '2026-09-15T12:07:00.000Z')
ok('slot — 자정 넘김', lastSlot('53 21 * * *', new Date('2026-09-16T02:30:00Z'))?.toISOString() === '2026-09-15T21:53:00.000Z')
ok('slot — 주간 크론은 확인 불가(null)', lastSlot('0 19 * * 0', NOW) === null)

// ── 2) 실행 판정 ───────────────────────────────────────────────
const slot = new Date('2026-09-15T20:17:00Z')
const run = (over) => ({ created_at: '2026-09-15T20:19:00Z', status: 'completed', conclusion: 'success', html_url: 'https://gh/run/1', ...over })
ok('판정 — 성공', judgeRuns('a.yml', slot, [run()]) === null)
ok('판정 — 실행 없음 = 미발화', judgeRuns('a.yml', slot, [])?.missing === true)
ok('판정 — 어제 실행만 있으면 미발화', judgeRuns('a.yml', slot, [run({ created_at: '2026-09-14T20:20:00Z' })])?.line.includes('미발화'))
ok('판정 — 실패', judgeRuns('a.yml', slot, [run({ conclusion: 'failure' })])?.line.includes('failure'))
ok('판정 — 실패는 미발화가 아니다(도입일을 묻지 않는다)', judgeRuns('a.yml', slot, [run({ conclusion: 'failure' })])?.missing === false)
ok('판정 — 취소도 실패', judgeRuns('a.yml', slot, [run({ conclusion: 'cancelled' })])?.line.includes('cancelled'))
ok('판정 — 진행 중', judgeRuns('a.yml', slot, [run({ status: 'in_progress', conclusion: null })])?.line.includes('안 끝났다'))
ok('판정 — 최신 실행 기준', judgeRuns('a.yml', slot, [run({ conclusion: 'failure', created_at: '2026-09-15T20:18:00Z' }), run({ created_at: '2026-09-15T20:40:00Z' })]) === null)
// GRACE 완화의 함정: 어제 슬롯을 판정할 때 오늘 실행이 어제 자리를 메우면 미발화가 영영 초록불이 된다.
ok('판정 — 지연 3h59m 실행은 그 슬롯을 채운다', judgeRuns('a.yml', slot, [run({ created_at: '2026-09-16T00:16:00Z' })]) === null)
ok('판정 — 23h59m 뒤 실행도 아직 그 슬롯', judgeRuns('a.yml', slot, [run({ created_at: '2026-09-16T20:16:00Z' })]) === null)
ok('판정 — 24h 지난 실행은 다음 슬롯 것 = 이 슬롯은 미발화', judgeRuns('a.yml', slot, [run({ created_at: '2026-09-16T20:18:00Z' })])?.missing === true)
// 다중 슬롯 파일(nightly-extract s1 18:33 · s2 03:33 · s3 09:33): 창 상한 = 같은 파일의 다음 슬롯(설계 §4.3 · §6-5).
{
  const ex = ['33 18 * * *', '33 3 * * *', '33 9 * * *']
  const s2 = new Date('2026-09-15T03:33:00Z')
  ok('다음 슬롯 — s2 다음은 같은 날 s3', iso(nextSlotAfter(ex, s2)) === '2026-09-15T09:33:00.000Z')
  ok('다음 슬롯 — s1 다음은 다음 날 s2', iso(nextSlotAfter(ex, new Date('2026-09-14T18:33:00Z'))) === '2026-09-15T03:33:00.000Z')
  ok('다음 슬롯 — 크론 하나면 +24h(기존과 같다)', iso(nextSlotAfter(['17 20 * * *'], slot)) === iso(slot.getTime() + DAY))
  const s3run = run({ created_at: '2026-09-15T10:40:00Z' })
  ok('다중 슬롯 — s2 미발화를 s3 실행이 메우지 않는다', judgeRuns('nightly-extract.yml', s2, [s3run], nextSlotAfter(ex, s2))?.missing === true)
  ok('다중 슬롯 — s2 지연 실행(2h)은 s2 를 채운다', judgeRuns('nightly-extract.yml', s2, [run({ created_at: '2026-09-15T05:40:00Z' })], nextSlotAfter(ex, s2)) === null)
}

// nightly-extract 유예 10시간 + 순서 짝짓기 (2026-10-01·02 실측: 4~7시간 늦게 떠서 성공).
ok('유예 — nightly-extract·nightly-relevance 만 10시간', graceFor('nightly-extract.yml') === 10 * 3600_000 && graceFor('nightly-relevance.yml') === 10 * 3600_000 && graceFor('daily-cmo-loop.yml') === GRACE_MS && Object.keys(GRACE_OVERRIDE_MS).length === 2, JSON.stringify(GRACE_OVERRIDE_MS))
ok('유예 — 문구에 파일별 시간', judgeRuns('nightly-extract.yml', slot, [], undefined, { grace: graceFor('nightly-extract.yml') })?.line.includes('10시간 넘게 지연'))
{
  const ex = "on:\n  schedule:\n    - cron: '33 18 * * *'\n    - cron: '33 3 * * *'\n    - cron: '33 9 * * *'\n"
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-ex-'))
  fs.writeFileSync(path.join(dir, 'nightly-extract.yml'), ex)
  const NOW_EX = new Date('2026-10-02T21:53:00Z')
  const G = graceFor('nightly-extract.yml')
  ok('유예 10h — 21:53 감시는 어제 18:33 · 오늘 03:33 · 오늘 09:33 을 본다',
    ['33 18 * * *', '33 3 * * *', '33 9 * * *'].map((c) => iso(lastSlot(c, NOW_EX, G))).join() === '2026-10-01T18:33:00.000Z,2026-10-02T03:33:00.000Z,2026-10-02T09:33:00.000Z')
  const r = (id, at) => ({ id, created_at: at, status: 'completed', conclusion: 'success', html_url: `https://gh/run/${id}` })
  // 10-01 22:51 (s1 +4h18m) · 10-02 10:00 (s2 +6h27m — 다음 슬롯 09:33 을 넘었다) · 10-02 15:56 (s3 +6h23m)
  const real = [r(1, '2026-10-01T22:51:13Z'), r(2, '2026-10-02T10:00:56Z'), r(3, '2026-10-02T15:56:22Z')]
  const run = (runs) => runWatchdog({
    now: NOW_EX, env: { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'gh', NEXT_PUBLIC_SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k' },
    workflowsDir: dir, dry: true, log: () => {}, git: (a) => (a.includes('--is-shallow-repository') ? 'false' : '2026-01-01T00:00:00+00:00'),
    fetchImpl: async (url) => new Response(JSON.stringify(String(url).includes('api.github.com')
      ? { workflow_runs: runs.filter((x) => x.created_at >= decodeURIComponent(String(url).split('created=')[1]).slice(2)) }
      : [{ expires_at: iso(NOW_EX.getTime() + 30 * DAY), user_id: 'u1' }]), { status: 200 }),
  })
  let e = await run(real)
  ok('extract 실측 지연(4~7h) — 경보 없음', e.code === 0, JSON.stringify(e.problems))
  e = await run([real[0], real[2]])
  ok('extract s2 미발화 — s3 실행이 메우지 못하고 정확히 1건', e.problems.length === 1 && e.problems[0].includes('미발화 또는 10시간'), JSON.stringify(e.problems))
  e = await run([real[0], r(4, '2026-10-02T09:40:00Z')])
  ok('extract s2 미발화 + s3 정시 — 건수 모자람은 반드시 1건으로 뜬다', e.problems.length === 1, JSON.stringify(e.problems))
  e = await run([real[0], r(2, '2026-10-02T13:34:00Z'), real[2]])
  ok('extract s2 10h 넘게 지연 — 경보', e.problems.some((p) => p.includes('2026-10-02 03:33')), JSON.stringify(e.problems))
  fs.rmSync(dir, { recursive: true, force: true })
}
// nightly-relevance — v30 §5 재시도 크론(r1 02:03Z · r2 06:03Z). 정규 19:03Z 실측 지연 2.7~4.7h, r1 이 4시간 넘게 늦어도 오경보 없이.
{
  const rel = "on:\n  schedule:\n    - cron: '3 19 * * *'\n    - cron: '3 2 * * *'\n    - cron: '3 6 * * *'\n"
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-rel-'))
  fs.writeFileSync(path.join(dir, 'nightly-relevance.yml'), rel)
  const NOW_R = new Date('2026-10-08T21:53:00Z')
  const r = (id, at) => ({ id, created_at: at, status: 'completed', conclusion: 'success', html_url: `https://gh/run/${id}` })
  const run = (runs) => runWatchdog({
    now: NOW_R, env: { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'gh', NEXT_PUBLIC_SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'k' },
    workflowsDir: dir, dry: true, log: () => {}, git: (a) => (a.includes('--is-shallow-repository') ? 'false' : '2026-01-01T00:00:00+00:00'),
    fetchImpl: async (url) => new Response(JSON.stringify(String(url).includes('api.github.com')
      ? { workflow_runs: runs.filter((x) => x.created_at >= decodeURIComponent(String(url).split('created=')[1]).slice(2)) }
      : [{ expires_at: iso(NOW_R.getTime() + 30 * DAY), user_id: 'u1' }]), { status: 200 }),
  })
  // 정규 +4h43m · r1 +5h(r2 예정 06:03 을 넘었다) · r2 +3h
  const lag = [r(1, '2026-10-07T23:46:00Z'), r(2, '2026-10-08T07:03:00Z'), r(3, '2026-10-08T09:03:00Z')]
  let e = await run(lag)
  ok('relevance r1 이 4시간 넘게 지연(r2 예정 뒤) — 경보 없음', e.code === 0, JSON.stringify(e.problems))
  e = await run([lag[0], lag[2]])
  ok('relevance r1 미발화 — r2 실행이 메우지 못하고 정확히 1건', e.problems.length === 1, JSON.stringify(e.problems))
  e = await run([lag[0], lag[1], { ...lag[2], conclusion: 'failure' }])
  ok('relevance r2 exit 1(한도 미해소 경보) — 실패로 뜬다(→ Notion)', e.problems.length === 1 && e.problems[0].includes('failure'), JSON.stringify(e.problems))
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── 3) 워크플로 파일 읽기 ────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-'))
// 12:17 = 감시(21:53)보다 9h36m 앞 → GRACE 밖이라 그날 슬롯을 그날 판정한다.
fs.writeFileSync(path.join(tmp, 'a.yml'), "on:\n  schedule:\n    - cron: '17 12 * * *'\n")
fs.writeFileSync(path.join(tmp, 'b.yml'), "on:\n  # schedule:\n  #   - cron: '0 1 * * *'\n  workflow_dispatch:\n")
fs.writeFileSync(path.join(tmp, 'cron-watchdog.yml'), "on:\n  schedule:\n    - cron: '53 21 * * *'\n")
const wf = scheduledWorkflows(tmp)
ok('파일 — 스케줄 있는 것만, 주석·자기 자신 제외', wf.length === 1 && wf[0].file === 'a.yml' && wf[0].crons[0] === '17 12 * * *', JSON.stringify(wf))
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
// a.yml(12:17 슬롯)에 정상 붙는 실행. 도입 시각 기본값은 아주 예전 = "그 슬롯에 main 에 있었다".
const runA = (over) => ({ created_at: '2026-09-15T12:19:00Z', status: 'completed', conclusion: 'success', html_url: 'https://gh/run/1', ...over })
const OLD = '2026-01-01T00:00:00+00:00'
const fakeVcs = (added = OLD, { shallow = false, throws = null } = {}) => {
  const calls = []
  const fn = (args) => {
    calls.push(args.join(' '))
    if (throws) throw new Error(throws)
    if (args.includes('--is-shallow-repository')) return shallow ? 'true' : 'false'
    return added
  }
  fn.calls = calls
  return fn
}
async function scenario({ runs = [runA()], ghStatus = 200, tokenRows = [tok(30)], sbStatus = 200, env = ENV, dry = false, dir = tmp, vcs = fakeVcs() }) {
  const urls = []
  const records = []
  const logs = []
  const r = await runWatchdog({
    now: NOW, env, dry, workflowsDir: dir, log: (m) => logs.push(String(m)), git: vcs,
    fetchImpl: async (url) => {
      urls.push(String(url))
      if (String(url).startsWith('https://api.github.com/')) return resp({ workflow_runs: runs }, ghStatus)
      return resp(tokenRows, sbStatus)
    },
    record: async (entry) => { records.push(entry); return { ok: true, title: `${entry.date}-${entry.track}` } },
  })
  return { ...r, urls, records, logs, vcs }
}

let s = await scenario({})
ok('통합 정상 — exit 0', s.code === 0, JSON.stringify(s.problems))
ok('통합 정상 — Notion 행 안 씀', s.records.length === 0)
ok('통합 — GitHub 조회는 schedule 이벤트·예정 시각 이후', s.urls[0].includes('/actions/workflows/a.yml/runs?event=schedule') && s.urls[0].includes(encodeURIComponent('>=2026-09-15T12:16:00.000Z')), s.urls[0])
ok('통합 — access_token 을 조회하지 않는다', s.urls.some((u) => u.includes('api_tokens')) && !s.urls.some((u) => u.includes('access_token')))
ok('통합 정상 — 실행이 있으면 도입 시각을 캐지 않는다', s.vcs.calls.length === 0, JSON.stringify(s.vcs.calls))
ok('통합 — 판정 슬롯을 로그에 남긴다', s.logs.some((l) => l.includes('판정 슬롯 2026-09-15 12:17 UTC')), JSON.stringify(s.logs))

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
ok('통합 미발화만 — 사람판단필요 false(v17: 막힘 사실)', s.records[0]?.needsHuman === false)

s = await scenario({ runs: [runA({ conclusion: 'failure' })], tokenRows: [tok(3)] })
ok('통합 두 가지 동시 — 둘 다 올라감', s.problems.length === 2 && s.records[0]?.blocked.split('\n').length === 2)

s = await scenario({ ghStatus: 500 })
ok('통합 GitHub 500 — 확인 불가도 이상', s.code === 1 && s.problems[0]?.includes('확인 불가'))

s = await scenario({ sbStatus: 504, tokenRows: { message: 'Gateway Timeout' } })
ok('통합 Supabase 504 — 확인 불가도 이상(정상으로 접지 않음)', s.code === 1 && s.problems[0]?.includes('확인 불가'))

s = await scenario({ env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' } })
ok('통합 env 없음 — 확인 불가', s.code === 1 && s.problems.some((p) => p.includes('Supabase 환경변수 없음')))

s = await scenario({ tokenRows: [tok(3)], dry: true })
ok('통합 --dry — 이상이어도 기록 안 함', s.code === 1 && s.records.length === 0)

// ── 6) 도입 시각 — 그 슬롯에 워크플로가 main 에 있었나 ──────────────
// 2026-09-16 오탐 실물: nightly-discovery.yml 이 18:38:37Z 에 머지됐는데 감시는 17:13Z 슬롯을
// 미발화로 올렸다. 그 시각엔 발화할 워크플로 자체가 기본 브랜치에 없었다.
const A_SLOT = '2026-09-15T12:17:00.000Z' // tmp/a.yml 의 판정 슬롯

ok('도입 — 얕은 클론은 확인 불가(해당 없음으로 접지 않는다)', workflowLandedAt('a.yml', { git: fakeVcs(OLD, { shallow: true }) }).unknown?.includes('얕은 클론'))
ok('도입 — 조회가 죽으면 확인 불가', workflowLandedAt('a.yml', { git: fakeVcs(OLD, { throws: 'no such file' }) }).unknown?.includes('조회 실패'))
ok('도입 — 날짜가 깨지면 확인 불가', workflowLandedAt('a.yml', { git: fakeVcs('nonsense') }).unknown?.includes('못 읽었다'))
ok('도입 — 히스토리에 없으면 at=null', workflowLandedAt('a.yml', { git: fakeVcs('') }).at === null)
ok('도입 — 머지 시각을 읽는다(first-parent)', workflowLandedAt('a.yml', { git: fakeVcs('2026-09-16T18:38:37+00:00') }).at?.toISOString() === '2026-09-16T18:38:37.000Z')
{
  const v = fakeVcs()
  workflowLandedAt('nightly-discovery.yml', { git: v })
  ok('도입 — 조회는 first-parent·추가 커밋·해당 워크플로 경로', v.calls[1]?.includes('--first-parent') && v.calls[1]?.includes('--diff-filter=A') && v.calls[1]?.includes('.github/workflows/nightly-discovery.yml'), JSON.stringify(v.calls))
}

s = await scenario({ runs: [], vcs: fakeVcs('2026-09-15T12:18:00+00:00') })
ok('통합 미발화 + 도입이 슬롯보다 늦음 — 해당 없음(exit 0·기록 없음)', s.code === 0 && s.records.length === 0, JSON.stringify(s.problems))
ok('통합 — 건너뛴 이유를 로그에 남긴다', s.logs.some((l) => l.includes('해당 없음')), JSON.stringify(s.logs))

s = await scenario({ runs: [], vcs: fakeVcs('2026-09-15T12:17:00+00:00') })
ok('통합 미발화 + 도입이 슬롯과 같은 시각 — 경보(경계는 경보 쪽)', s.code === 1 && s.problems[0]?.includes('미발화'), JSON.stringify(s.problems))

s = await scenario({ runs: [], vcs: fakeVcs('2026-09-15T12:16:00+00:00') })
ok('통합 미발화 + 도입이 슬롯보다 1분 이름 — 경보', s.code === 1 && s.problems[0]?.includes('미발화'))

s = await scenario({ runs: [], vcs: fakeVcs(OLD, { shallow: true }) })
ok('통합 미발화 + 얕은 클론 — 확인 불가로 경보', s.code === 1 && s.problems[0]?.includes('확인 불가') && s.problems[0]?.includes('판단 못 함'), JSON.stringify(s.problems))

s = await scenario({ runs: [], vcs: fakeVcs('') })
ok('통합 미발화 + 파일이 히스토리에 없음 — 해당 없음', s.code === 0 && s.records.length === 0, JSON.stringify(s.problems))

// 이월 슬롯(간격 < GRACE)의 통합. 오늘 실행이 어제 슬롯 자리를 메우면 안 된다.
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog2-'))
fs.writeFileSync(path.join(tmp2, 'late.yml'), "on:\n  schedule:\n    - cron: '17 20 * * *'\n")
ok('이월 — 판정 슬롯은 어제 20:17', lastSlot('17 20 * * *', NOW)?.toISOString() === '2026-09-14T20:17:00.000Z')
s = await scenario({ dir: tmp2, runs: [runA({ created_at: '2026-09-14T20:19:00Z' })] })
ok('이월 정상 — 어제 실행이 있으면 exit 0', s.code === 0, JSON.stringify(s.problems))
s = await scenario({ dir: tmp2, runs: [runA({ created_at: '2026-09-15T20:19:00Z' })] })
ok('이월 미발화 — 오늘 실행이 어제 자리를 메우지 않는다', s.code === 1 && s.problems[0]?.includes('2026-09-14 20:17'), JSON.stringify(s.problems))
fs.rmSync(tmp2, { recursive: true, force: true })

// 실물 리포 — 측정한 값과 맞나. 얕은 클론(build-check 의 checkout fetch-depth 기본값 1)에서는
// 확인 불가가 정답이다. 둘 중 하나여야 하고, 그 밖이면 실패.
{
  const real = workflowLandedAt('nightly-discovery.yml')
  const hit = real.at?.toISOString() === '2026-09-16T18:38:37.000Z'
  if (!hit && real.unknown) console.log(`  · 실물 도입 시각 확인 불가(예상됨): ${real.unknown}`)
  ok('실물 — nightly-discovery.yml 은 2026-09-16T18:38:37Z 머지(또는 확인 불가)', hit || Boolean(real.unknown), JSON.stringify(real))
}

// ── 7) git push 워크플로의 전용 앱 토큰 스텝 누락 (2026-09-25·26 GH013 실측) ─────────────
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-push-'))
  fs.writeFileSync(path.join(tmp2, 'c.yml'), 'jobs:\n  j:\n    steps:\n      - uses: actions/checkout@v4\n      - run: |\n          git commit -m x\n          git push\n')
  fs.writeFileSync(path.join(tmp2, 'd.yml'), 'jobs:\n  j:\n    steps:\n      - uses: actions/create-github-app-token@v2\n      - uses: actions/checkout@v4\n      - run: git push\n')
  fs.writeFileSync(path.join(tmp2, 'e.yml'), 'jobs:\n  j:\n    steps:\n      # 주석에서만 git push 를 말한다\n      - run: echo hi\n')
  const missing = pushWithoutBotToken(tmp2)
  ok('봇 토큰 — push 하는데 스텝 없는 파일만', missing.length === 1 && missing[0] === 'c.yml', JSON.stringify(missing))
  const s7 = await scenario({ dir: tmp2 })
  ok('통합 봇 토큰 누락 — exit 1 · 파일명·복사 안내', s7.code === 1 && s7.problems.some((p) => p.startsWith('c.yml:') && p.includes('create-github-app-token')), JSON.stringify(s7.problems))
  fs.rmSync(tmp2, { recursive: true, force: true })
  const realMissing = pushWithoutBotToken(path.join(import.meta.dirname, '..', '.github', 'workflows'))
  ok('실제 리포 — push 워크플로 전부 봇 토큰 스텝 있음', realMissing.length === 0, JSON.stringify(realMissing))
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`FAIL ${failures.length} / PASS ${passed}`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASS ${passed}`)
