// 요청 0 사유 판정(lib/review/zero-request.ts) + 감시 경계면(scripts/cron-watchdog.mjs checkZeroRequests·runWatchdog) 셀프테스트.
//
//   node scripts/zero-request-selftest.mjs
//
// 네트워크·DB 없음. 판정 함수만이 아니라 "PostgREST 응답 행 → 사유 → 경보 problems → Notion 기록 입력" 을 가짜 fetch 로 끝까지 거친다(§7.1 부품≠통합).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { judgeZeroRequests, zeroRequestKeys, zeroRequestReport } = await import('../lib/review/zero-request.ts')
const { checkZeroRequests, runWatchdog, foldZeroReport } = await import('./cron-watchdog.mjs')

let passed = 0
const failures = []
const t = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a === b) passed++
  else failures.push(`${name}\n    got  ${a}\n    want ${b}`)
}

const NOW = new Date('2026-10-12T21:53:00Z')
const h = (hoursAgo) => new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString()
const src = (key, over = {}) => ({ key, enabled: true, daily_request_cap: 100, robots_status: 'allowed', override: null, ...over })
const run = (key, over = {}) => ({ source_key: key, started_at: h(3), requests: 0, targets_visited: 0, status: 'ok', dry_run: false, ...over })
const base = (over) => ({ now: NOW, sources: [], ramps: [], runs: [], activeTargets: {}, lastRun: {}, ...over })
const reasonsOf = (input) => Object.fromEntries(judgeZeroRequests(base(input)).map((v) => [v.key, v.reasons]))

// ── 1) 대상 고르기 ────────────────────────────────────────────
t('대상: 요청 >0 은 건드리지 않음 · 꺼진 소스 제외 · 실행 없는 소스는 0',
  zeroRequestKeys([src('a'), src('b'), src('off', { enabled: false }), src('c')], [run('a', { requests: 5 }), run('b')], NOW), ['b', 'c'])
t('대상: 24h 밖 요청은 세지 않는다', zeroRequestKeys([src('a')], [run('a', { requests: 9, started_at: h(25) })], NOW), ['a'])
t('대상: dry_run 요청은 세지 않는다', zeroRequestKeys([src('a')], [run('a', { requests: 9, dry_run: true })], NOW), ['a'])
t('대상: 요청 >0 이면 판정 결과에 없다', judgeZeroRequests(base({ sources: [src('a')], runs: [run('a', { requests: 1 })] })), [])

// ── 2) 사유 코드 각각 ─────────────────────────────────────────
const ok = { activeTargets: { a: 3 }, lastRun: { a: { started_at: h(3), status: 'ok', blocked_responses: 0, health_after: 'ok' } } }
t('no_active_targets', reasonsOf({ sources: [src('a')], ...ok, activeTargets: { a: 0 } }), { a: ['no_active_targets'] })
t('source_excluded: robots 금지·예외 없음', reasonsOf({ sources: [src('a', { robots_status: 'disallowed' })], ...ok }), { a: ['source_excluded'] })
t('source_excluded 아님: 소유자 예외 override', reasonsOf({ sources: [src('a', { robots_status: 'disallowed', override: 'owner_2026-10-06' })], ...ok }), { a: ['unknown'] })
t('source_excluded 아님: 약관 예외 값(robots 예외 아님)은 그대로 금지', reasonsOf({ sources: [src('a', { robots_status: 'disallowed', override: 'owner_2026-10-08' })], ...ok }), { a: ['source_excluded'] })
t('ramp_frozen', reasonsOf({ sources: [src('a')], ...ok, ramps: [{ source_key: 'a', frozen_until: h(-24), daily_request_target: 50, supply_state: null, cap_base: 100 }] }), { a: ['ramp_frozen'] })
t('ramp_frozen 아님: 동결 기한 지남', reasonsOf({ sources: [src('a')], ...ok, ramps: [{ source_key: 'a', frozen_until: h(1), daily_request_target: 50, supply_state: null, cap_base: 100 }] }), { a: ['unknown'] })
t('ramp_target_zero', reasonsOf({ sources: [src('a')], ...ok, ramps: [{ source_key: 'a', frozen_until: null, daily_request_target: 0, supply_state: 'short', cap_base: 100 }] }), { a: ['ramp_target_zero'] })
t('ramp_target_zero 아님: cap_base 없음(퍼센트 램프 미가동)', reasonsOf({ sources: [src('a')], ...ok, ramps: [{ source_key: 'a', frozen_until: null, daily_request_target: 0, supply_state: null, cap_base: null }] }), { a: ['unknown'] })
t('ramp_target_zero 아님: 램프 제외 소스(danawa)', reasonsOf({ sources: [src('danawa')], activeTargets: { danawa: 3 }, lastRun: { danawa: null }, ramps: [{ source_key: 'danawa', frozen_until: null, daily_request_target: 0, supply_state: null, cap_base: 100 }] }), { danawa: ['unknown'] })
t('cap_exhausted: 상한 0', reasonsOf({ sources: [src('a', { daily_request_cap: 0 })], ...ok }), { a: ['cap_exhausted'] })
t('blocked_recent: 마지막 실행 차단', reasonsOf({ sources: [src('a')], ...ok, lastRun: { a: { started_at: h(40), status: 'ok', blocked_responses: 1, health_after: 'broken' } } }), { a: ['blocked_recent'] })
t('blocked_recent: soft-skip(마지막 실행 broken, 차단 0)', reasonsOf({ sources: [src('a')], ...ok, lastRun: { a: { started_at: h(72), status: 'ok', blocked_responses: 0, health_after: 'broken' } } }), { a: ['blocked_recent'] })
t('사유 여럿이면 전부', reasonsOf({ sources: [src('a', { daily_request_cap: 0 })], ...ok, activeTargets: { a: 0 } }), { a: ['no_active_targets', 'cap_exhausted'] })

// ── 3) unknown → 경보, 확인 불가는 사유가 아니다 ──────────────────
t('unknown: 사유 없음', reasonsOf({ sources: [src('a')], ...ok }), { a: ['unknown'] })
t('unknown: 활성 타깃·마지막 실행·램프 전부 확인 불가여도 사유로 접지 않는다', reasonsOf({ sources: [src('a')], ramps: null }), { a: ['unknown'] })
{
  const v = judgeZeroRequests(base({ sources: [src('a')], ramps: null }))
  t('확인 불가 표기', v[0].notes, ['활성 타깃 확인 불가', '램프 확인 불가', '마지막 실행 확인 불가'])
  const r = zeroRequestReport(v)
  t('unknown → 경보 1·요약 0', [r.alerts.length, r.lines.length], [1, 0])
  t('경보 문구', r.alerts[0].includes('사유 코드 없음(unknown)') && r.alerts[0].includes('a'), true)
}

// ── 4) status=ok ∧ 타깃 0 ∧ 요청 0 은 정상으로 안 읽힌다 ─────────────
{
  const v = judgeZeroRequests(base({ sources: [src('a')], runs: [run('a'), run('a', { started_at: h(9) })], activeTargets: { a: 0 }, lastRun: { a: { started_at: h(3), status: 'ok', blocked_responses: 0, health_after: 'ok' } } }))
  t('ok 실행 2회(타깃·요청 0) — 요청 0 대상이 되고 사유가 달린다', [v[0].reasons, v[0].runs, v[0].idleOk], [['no_active_targets'], 2, 2])
  const r = zeroRequestReport(v)
  t('사유 있는 0 → 경보 아님, 요약 한 줄', [r.alerts.length, r.lines.length], [0, 1])
  t('요약 줄에 사유 코드·정상 아님 표기', r.lines[0].includes('no_active_targets') && r.lines[0].includes('정상 아님'), true)
  const u = judgeZeroRequests(base({ sources: [src('a')], runs: [run('a')], ...ok }))
  t('ok 실행(타깃 0·요청 0)인데 활성 타깃 있음 — unknown 경보', [u[0].reasons, zeroRequestReport(u).alerts.length], [['unknown'], 1])
}


// ── 4b) 경보 문구 3안·합치기 규칙(v71p) — 글만 바뀌고 경보/요약 분류는 그대로 ─────────────
{
  const idle = (key) => run(key, { targets_visited: 0 })
  const v = judgeZeroRequests(base({
    sources: [src('z1'), src('z2'), src('q'), src('u')],
    runs: [idle('q'), run('q', { started_at: h(9) }), idle('u')],
    activeTargets: { z1: 0, z2: 0, q: 2, u: 2 },
    lastRun: { z1: null, z2: null, q: null, u: null },
  }))
  const r = foldZeroReport(v, { z1: 0, z2: 0, q: 2, u: 2 })
  t('R2·R4: 활성 0 둘은 한 줄로', [r.lines.length, r.lines[0].includes('2곳') && r.lines[0].includes('z1, z2')], [1, true])
  t('문구 3: ok 2회 이상 → 조용한 정상 경보', r.alerts.some((a) => a.startsWith('조용한 정상') && a.includes('q ')), true)
  t('문구 3: ok 1회뿐이면 기존 unknown 문구', r.alerts.some((a) => a.includes('사유 코드 없음(unknown)') && a.includes('u:')), true)
  t('경보 수는 그대로(unknown 2)', r.alerts.length, 2)
  t('활성 0 + 다른 사유는 합치지 않는다', foldZeroReport(judgeZeroRequests(base({ sources: [src('a', { daily_request_cap: 0 })], runs: [], activeTargets: { a: 0 }, lastRun: { a: null } })), { a: 0 }).lines[0].includes('cap_exhausted'), true)
}

// ── 5) 경계면: PostgREST 행 → checkZeroRequests → runWatchdog → Notion 기록 입력 ─────────
const SB = 'https://sb.test'
function fakeDb(tables, { fail = [] } = {}) {
  const urls = []
  const fn = async (url) => {
    const u = String(url)
    urls.push(u)
    const resp = (body, status = 200) => new Response(JSON.stringify(body), { status })
    if (u.includes('api_tokens')) return resp([{ expires_at: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(), user_id: 'u1' }])
    const name = u.slice(`${SB}/rest/v1/`.length).split('?')[0]
    if (fail.includes(name)) return resp({ message: 'boom' }, 500)
    const q = new URLSearchParams(u.split('?')[1])
    let rows = tables[name] ?? []
    if (name === 'review_targets') rows = rows.filter((r) => `eq.${r.source_key}` === q.get('source_key') && r.status === 'active').slice(0, 1)
    if (name === 'review_collection_runs' && q.get('source_key')) rows = rows.filter((r) => `eq.${r.source_key}` === q.get('source_key')).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 1)
    else if (name === 'review_collection_runs') rows = rows.filter((r) => r.started_at >= q.get('started_at').slice(4) && r.dry_run === false)
    return resp(rows)
  }
  fn.urls = urls
  return fn
}
const TABLES = {
  review_sources: [src('busy'), src('drained'), src('ghost'), src('off', { enabled: false })],
  review_collection_runs: [
    { ...run('busy', { requests: 40, targets_visited: 4 }), blocked_responses: 0, health_after: 'ok' },
    { ...run('drained'), blocked_responses: 0, health_after: 'ok' },
    { ...run('ghost', { started_at: h(30), requests: 12 }), blocked_responses: 0, health_after: 'ok' },
  ],
  review_targets: [{ source_key: 'busy', status: 'active' }, { source_key: 'drained', status: 'exhausted' }, { source_key: 'ghost', status: 'active' }],
  review_source_ramp: [],
}
{
  const db = fakeDb(TABLES)
  const z = await checkZeroRequests({ sbUrl: SB, sbKey: 'k', fetchImpl: db, now: NOW })
  t('경계: ghost(활성 타깃 있음·24h 실행 없음) 만 경보', z.problems.map((p) => p.split(':')[0]), ['요청 0(24h) enabled 소스 ghost'])
  t('경계: drained 는 요약 한 줄(no_active_targets)', z.lines.length === 1 && z.lines[0].includes('drained') && z.lines[0].includes('활성 타깃 0'), true)
  t('경계: 요청 >0 소스(busy)는 타깃·마지막 실행을 조회하지 않는다', db.urls.some((u) => u.includes('source_key=eq.busy')), false)
  t('경계: 실행은 dry_run=false·24h 창으로 읽는다', db.urls.some((u) => u.includes('review_collection_runs') && u.includes('dry_run=eq.false') && u.includes(`started_at=gte.${encodeURIComponent(h(24))}`)), true)

  const failed = await checkZeroRequests({ sbUrl: SB, sbKey: 'k', fetchImpl: fakeDb(TABLES, { fail: ['review_collection_runs'] }), now: NOW })
  t('경계: 실행 조회 실패 = 확인 불가 경보(정상으로 접지 않음)', [failed.problems.length, failed.problems[0]?.includes('확인 불가')], [1, true])
  const noRamp = await checkZeroRequests({ sbUrl: SB, sbKey: 'k', fetchImpl: fakeDb(TABLES, { fail: ['review_source_ramp'] }), now: NOW })
  t('경계: 램프 조회 실패는 표기만(ghost 경보에 램프 확인 불가)', noRamp.problems[0]?.includes('램프 확인 불가'), true)
  const many = await checkZeroRequests({ sbUrl: SB, sbKey: 'k', fetchImpl: fakeDb({ ...TABLES, review_collection_runs: Array.from({ length: 1000 }, () => run('busy', { requests: 1 })) }), now: NOW })
  t('경계: 실행 1000행(잘렸을 수 있음) = 확인 불가', many.problems[0]?.includes('확인 불가'), true)

  // runWatchdog 전체 — 스케줄 워크플로 없는 폴더라 크론 판정은 빈다. 경보 → CTO 행 막힌것, 요약 줄 → 로그.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-req-'))
  const records = []
  const logs = []
  const w = await runWatchdog({
    now: NOW, env: { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'gh', NEXT_PUBLIC_SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'k' },
    workflowsDir: dir, log: (m) => logs.push(String(m)), fetchImpl: fakeDb(TABLES),
    record: async (e) => { records.push(e); return { ok: true, title: 't' } },
  })
  t('통합: unknown → exit 1 · CTO 행 1개 · 막힌것에 ghost · 사람판단필요 false',
    [w.code, records.length, records[0]?.track, records[0]?.blocked.includes('ghost'), records[0]?.needsHuman], [1, 1, 'CTO', true, false])
  t('통합: 사유 있는 drained 는 막힌것에 없고 로그에만', [records[0]?.blocked.includes('drained'), logs.some((l) => l.includes('drained') && l.includes('활성 타깃 0'))], [false, true])

  const quiet = await runWatchdog({
    now: NOW, env: { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'gh', NEXT_PUBLIC_SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'k' },
    workflowsDir: dir, log: () => {}, fetchImpl: fakeDb({ ...TABLES, review_sources: TABLES.review_sources.filter((s) => s.key !== 'ghost') }),
    record: async (e) => { records.push(e); return { ok: true, title: 't' } },
  })
  t('통합: 사유 있는 0 만 있으면 exit 0 · Notion 행 없음(정상 규약 유지)', [quiet.code, records.length], [0, 1])
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── 일감 없음 skip(v71ba P0-3) — 판정 + review-collect.mjs 실제 프로세스(가짜 PostgREST) ─────────
{
  const { idleSkipReason } = await import('../lib/review/zero-request.ts')
  t('idle: 꺼진 소스 → skip', idleSkipReason(false, null) !== null, true)
  t('idle: 켜짐·활성 0 → skip', idleSkipReason(true, 0) !== null, true)
  t('idle: 켜짐·활성 ≥1 → 돈다', idleSkipReason(true, 1), null)
  t('idle: 켜짐·활성 확인 불가(null) → 돈다(§7.1)', idleSkipReason(true, null), null)
  t('idle: enabled 확인 불가(undefined)·활성 0 → 돈다(러너가 판정)', idleSkipReason(undefined, 0), null)

  const http = await import('node:http')
  const { spawn } = await import('node:child_process')
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
  const run = async (args) => {
    const seen = []
    const server = http.createServer((req, res) => {
      seen.push(`${req.method} ${req.url}`)
      const u = new URL(req.url, 'http://x')
      res.setHeader('content-type', 'application/json')
      if (u.pathname.endsWith('/review_sources') && (u.searchParams.get('select') ?? '') === 'key,enabled')
        return res.end(JSON.stringify([{ key: 'okky', enabled: true }, { key: 'velog', enabled: true }, { key: 'inflearn', enabled: false }]))
      if (u.pathname.endsWith('/review_targets') && u.searchParams.get('source_key') === 'eq.velog' && u.searchParams.get('status') === 'eq.active')
        return res.end(JSON.stringify([{ id: 't1' }]))
      res.end('[]')
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'review-collect.mjs'), ...args, '--dry'], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'selftest' },
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    await new Promise((r) => child.on('close', r))
    server.close()
    return { out, seen }
  }
  const all = await run(['--source=all'])
  t('실행(all): okky 활성 0 → 일감 없음 skip', /### `okky`\s*\n- ⏭️ 일감 없음/.test(all.out), true)
  t('실행(all): inflearn 꺼짐 → 실행 행 없이 skip', /### `inflearn`\s*\n- ⏭️ 소스 꺼짐/.test(all.out), true)
  t('실행(all): velog 활성 1 → skip 안 함', /### `velog`\s*\n- ⏭️ (일감 없음|소스 꺼짐)/.test(all.out), false)
  t('실행(all): 쓰기 요청 0(dry)', all.seen.filter((s) => !s.startsWith('GET') && !s.startsWith('HEAD')), [])
  const named = await run(['--source=okky'])
  t('실행(이름 지정): okky 는 skip 하지 않는다', [/⏭️ 일감 없음/.test(named.out), named.seen.some((s) => /review_targets\?select=id&source_key=eq\.okky&status=eq\.active&limit=1/.test(s))], [false, false])
}

if (failures.length) {
  console.error(`FAIL ${failures.length} / PASS ${passed}`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASS ${passed}`)
