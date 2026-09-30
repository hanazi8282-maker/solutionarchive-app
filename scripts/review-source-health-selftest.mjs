#!/usr/bin/env node
// 소스 고장 보고 회귀 — "고장 감지 시 enabled 는 안 바뀌고 사람판단필요 플래그만 켜진다" (남헌 2026-09-30).
// 네트워크·DB·토큰 없음. Supabase 는 쓰기 호출을 전부 기록하는 가짜 클라이언트, Notion 은 가짜 fetch.
//
//   node scripts/review-source-health-selftest.mjs
//
// 고정하는 것
//   1) 러너 + **실제 store(createReviewStore)** 로 고장을 일으켜도 review_sources 쓰기 중
//      daily_request_cap 외 컬럼(enabled 포함)이 0회다. 가짜 store 가 아니라 실제 store 를 쓰는 이유:
//      예전 자동 비활성(updateSourceHealth)을 store·러너 어느 쪽에 되살려도 여기서 잡히게(§7.1 5번 사례).
//   2) 그 판정이 Notion 보고 페이로드로 이어진다 — 사람판단필요=true · 소스 키 · 사유 · 횟수 · 마지막 에러.
//   3) 같은 날 두 번 돌려도 행은 하나(두 번째는 갱신).
//   4) 고장 0개면 Notion 호출 0회.
//   5) Notion 쓰기 실패 → 폴백 파일 + ok:false(→ review-collect 종료 코드 1).
//   6) 토큰 없음도 실패(확인 불가를 성공으로 접지 않는다).

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCollection } from '../lib/review/runner.ts'
import { createReviewStore } from '../lib/review/store.ts'
import { runSourceHealthReport, streaks, MARKER } from './review-source-health-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let pass = 0
const ok = (name, cond) => { assert.ok(cond, name); pass++ }

// ── 가짜 Supabase: 모든 쓰기(update/insert/upsert/delete)를 기록한다 ─────────────
function fakeSupabase() {
  const writes = []
  const respond = (table, op, single) => {
    const one = (row) => ({ data: single ? row : [row], error: null })
    if (op !== 'select') {
      if (table === 'analysis_inputs') return { data: { id: 'in1' }, error: null }
      return { data: null, error: null }
    }
    if (table === 'review_sources') return one({ key: 'fake', enabled: true, min_interval_ms: 0, daily_request_cap: 200 })
    if (table === 'review_targets') {
      return { data: [{ id: 't1', project_id: 'p1', source_key: 'fake', product_ref: 'p1', cursor: null, last_review_at: null, consecutive_empty: 0, total_collected: 0 }], error: null }
    }
    return { data: single ? null : [], error: null }
  }
  const from = (table) => {
    let op = 'select'
    let single = false
    const b = {
      select() { return b },
      update(patch) { op = 'update'; writes.push({ table, op, patch }); return b },
      insert(patch) { op = 'insert'; writes.push({ table, op, patch }); return b },
      upsert(patch) { op = 'upsert'; writes.push({ table, op, patch }); return b },
      delete() { op = 'delete'; writes.push({ table, op, patch: {} }); return b },
      maybeSingle() { single = true; return b },
      single() { single = true; return b },
      then(res, rej) { return Promise.resolve(respond(table, op, single)).then(res, rej) },
    }
    for (const m of ['eq', 'neq', 'gte', 'lte', 'in', 'not', 'order', 'limit', 'is']) b[m] = () => b
    return b
  }
  return { client: { from }, writes }
}

const review = (i) => ({ externalId: `x${i}`, text: `본문 ${i} 입니다`, rating: 5, seller: null, authorMasked: 'a**', writtenAt: '2026-09-01' })
const adapter = {
  key: 'fake',
  displayName: 'fake',
  nextRequest(t) { return { url: `https://example.test/r?page=${t.cursor ? Number(t.cursor) + 1 : 1}` } },
  parse(body) {
    const p = JSON.parse(body || '{}')
    return { reviews: p.reviews ?? [], nextCursor: null, parseFailures: p.parseFailures ?? 0 }
  },
}
function ports(sb, page) {
  return {
    now: () => new Date('2026-09-30T05:40:00Z'),
    async sleep() {},
    async fetchText(url) {
      if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nAllow: /\n', finalUrl: url }
      return page
    },
    store: createReviewStore(sb.client),
  }
}
const sourceWrites = (sb) => sb.writes.filter((w) => w.table === 'review_sources')
const nonCapCols = (sb) => sourceWrites(sb).flatMap((w) => Object.keys(w.patch ?? {})).filter((c) => c !== 'daily_request_cap')

// 1) 차단(403) 고장 · 파싱 고장 둘 다 — review_sources 쓰기 0
const blockedSb = fakeSupabase()
const blocked = await runCollection(adapter, { dryRun: false, targetLimit: 5 }, ports(blockedSb, { status: 403, body: 'Forbidden' }))
ok('1a 차단 응답이면 broken 판정', blocked.health?.health === 'broken')
ok(`1a 차단 고장인데 review_sources 에 daily_request_cap 외 컬럼 쓰기 0회 (실제: ${JSON.stringify(nonCapCols(blockedSb))})`, nonCapCols(blockedSb).length === 0)
ok('1a enabled 쓰기 없음', !sourceWrites(blockedSb).some((w) => 'enabled' in (w.patch ?? {})))

const parseSb = fakeSupabase()
const parseBroken = await runCollection(adapter, { dryRun: false, targetLimit: 5 },
  ports(parseSb, { status: 200, body: JSON.stringify({ reviews: [review(1), review(2)], parseFailures: 18 }) }))
ok('1b 파싱 2/20 이면 broken 판정', parseBroken.health?.health === 'broken')
ok(`1b 파싱 고장인데 review_sources 에 daily_request_cap 외 컬럼 쓰기 0회 (실제: ${JSON.stringify(nonCapCols(parseSb))})`, nonCapCols(parseSb).length === 0)
ok('1b 다른 테이블 쓰기는 그대로 돈다(가짜 클라이언트가 실제로 기록하고 있다)', parseSb.writes.some((w) => w.table === 'review_targets'))

// 러너 결과 → review-collect.mjs 의 sourceResults 모양
const asResult = (key, r) => ({ key, health: r.health, perTarget: r.perTarget, stats: r.stats })

// ── 가짜 Notion (일일 상태 로그 DB, 메모리) ──────────────────────────────
const DB = 'f57ae10b-4cc0-433b-9db6-20785216aebe'
function fakeNotion({ createStatus = 200 } = {}) {
  const pages = []
  const calls = []
  const txt = (p, k) => (p.properties[k]?.rich_text ?? []).map((t) => t.text?.content ?? t.plain_text).join('')
  const view = (p) => ({
    id: p.id, url: `https://notion.so/${p.id}`, parent: { database_id: DB.replace(/-/g, '') },
    properties: Object.fromEntries(Object.entries(p.properties).map(([k, v]) => {
      const type = Object.keys(v)[0]
      const val = type === 'title' || type === 'rich_text' ? v[type].map((t) => ({ plain_text: t.text?.content ?? t.plain_text })) : v[type]
      return [k, { type, [type]: val }]
    })),
  })
  const fn = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ method: init.method, url, body })
    const res = (status, data) => ({ ok: status < 300, status, json: async () => data })
    if (init.method === 'POST' && url.endsWith('/query')) {
      const f = body.filter
      const hits = pages.filter((p) => f.and
        ? f.and.every((c) => c.date ? p.properties.날짜.date.start === c.date.equals
          : c.select ? p.properties.트랙.select.name === c.select.equals
            : txt(p, c.property).includes(c.rich_text.contains))
        : p.properties.제목.title[0].text.content.startsWith(f.title.starts_with))
      return res(200, { results: hits.map(view), has_more: false })
    }
    if (init.method === 'POST') {
      if (createStatus !== 200) return res(createStatus, { code: 'x', message: 'fake create fail' })
      const p = { id: `page-${pages.length + 1}`, properties: body.properties }
      pages.push(p)
      return res(200, { id: p.id, url: `https://notion.so/${p.id}` })
    }
    const id = url.split('/pages/')[1]
    const p = pages.find((x) => x.id === id)
    if (!p) return res(404, { code: 'object_not_found', message: 'nope' })
    if (init.method === 'PATCH') { Object.assign(p.properties, body.properties); return res(200, {}) }
    return res(200, view(p))
  }
  fn.pages = pages
  fn.calls = calls
  fn.txt = txt
  return fn
}

const realFetch = globalThis.fetch
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-health-'))
const today = '2026-09-30'
// 사흘째 고장: KST 9/28·9/29·9/30 에 broken 실행(17:37Z 는 KST 다음 날 02:37), 그 전은 ok
const runsOf = {
  fake: [
    { started_at: '2026-09-30T05:37:00Z', health_after: 'broken' },
    { started_at: '2026-09-29T17:37:00Z', health_after: 'broken' },
    { started_at: '2026-09-29T05:37:00Z', health_after: 'broken' },
    { started_at: '2026-09-28T17:37:00Z', health_after: 'broken' },
    { started_at: '2026-09-28T05:37:00Z', health_after: 'broken' },
    { started_at: '2026-09-27T17:37:00Z', health_after: 'ok' },
  ],
}
const base = { date: today, runUrl: 'https://github.com/x/y/actions/runs/1', token: 't', dbId: DB, loadRuns: async () => runsOf }

try {
  // 2) 페이로드
  let f = fakeNotion()
  globalThis.fetch = f
  const r1 = await runSourceHealthReport({ ...base, sourceResults: [asResult('fake', blocked)], now: new Date('2026-09-30T05:40:00Z'), pendingDir: tmp })
  ok(`2 보고 성공 (${JSON.stringify(r1.record)})`, r1.ok)
  ok('2 행 1개 생성', f.pages.length === 1)
  const row = f.pages[0].properties
  const blockedTxt = f.txt(f.pages[0], '막힌것')
  ok('2 사람판단필요=true', row.사람판단필요.checkbox === true)
  ok('2 트랙 CTO · 제목 YYYY-MM-DD-CTO', row.트랙.select.name === 'CTO' && row.제목.title[0].text.content === `${today}-CTO`)
  ok('2 소스 키', blockedTxt.includes('fake:'))
  ok('2 사유(health.detail)', blockedTxt.includes(blocked.health.detail))
  ok('2 연속 실행 횟수·N일째', blockedTxt.includes('연속 broken 실행 5회') && blockedTxt.includes('3일째'))
  ok('2 차단 건수', blockedTxt.includes('차단 응답 1건'))
  ok('2 마지막 에러', /마지막 에러: 차단 응답 403/.test(blockedTxt))
  ok('2 enabled 그대로라고 적는다', blockedTxt.includes('enabled 그대로'))
  ok('2 비고에 멱등 표지', f.txt(f.pages[0], '비고').includes(MARKER))
  ok('2 알림완료를 쓰지 않는다', !('알림완료' in row))

  // 3) 같은 날 두 번째 실행 — 행은 하나, 새 내용이 앞에 붙는다
  const r2 = await runSourceHealthReport({ ...base, sourceResults: [asResult('fake', parseBroken)], now: new Date('2026-09-30T17:40:00Z'), pendingDir: tmp })
  ok(`3 두 번째 보고 성공 (${JSON.stringify(r2.record)})`, r2.ok && r2.record.updated === true)
  ok('3 같은 날 두 번 돌려도 행은 1개', f.pages.length === 1)
  const both = f.txt(f.pages[0], '막힌것')
  ok('3 두 실행 내용이 다 남는다(새 것이 앞)', both.indexOf('02:40 KST') < both.indexOf('14:40 KST') && both.includes('파싱 성공 2/20'))
  ok('3 사람판단필요 유지', f.pages[0].properties.사람판단필요.checkbox === true)
  ok('3 폴백 파일 없음(성공 경로)', fs.readdirSync(tmp).length === 0)

  // 3b) 다른 날이면 새 행
  await runSourceHealthReport({ ...base, date: '2026-10-01', sourceResults: [asResult('fake', blocked)], now: new Date('2026-09-30T20:00:00Z'), pendingDir: tmp })
  ok('3b 다음 날은 새 행', f.pages.length === 2)

  // 3c) 실행 기록을 못 읽으면 "확인 불가" — 지어내지 않는다
  f = fakeNotion()
  globalThis.fetch = f
  await runSourceHealthReport({ ...base, loadRuns: async () => { throw new Error('db down') }, sourceResults: [asResult('fake', blocked)], pendingDir: tmp })
  ok('3c N일째 확인 불가', f.txt(f.pages[0], '막힌것').includes('N일째 확인 불가'))

  // 4) 고장 0개 → Notion 0회
  f = fakeNotion()
  globalThis.fetch = f
  const okSb = fakeSupabase()
  const healthy = await runCollection(adapter, { dryRun: false, targetLimit: 5 }, ports(okSb, { status: 200, body: JSON.stringify({ reviews: [review(1)] }) }))
  const r4 = await runSourceHealthReport({ ...base, sourceResults: [asResult('fake', healthy), { key: 'skipped', health: null }], pendingDir: tmp })
  ok('4 정상 소스', healthy.health.health === 'ok')
  ok('4 고장 0개면 Notion 호출 0회', r4.ok && f.calls.length === 0)

  // 5) Notion 쓰기 실패 → 폴백 파일 + ok:false
  globalThis.fetch = fakeNotion({ createStatus: 500 })
  const r5 = await runSourceHealthReport({ ...base, sourceResults: [asResult('fake', blocked)], pendingDir: tmp })
  ok('5 쓰기 실패는 ok:false', r5.ok === false)
  ok(`5 폴백 파일이 남는다 (${r5.record.pendingPath})`, r5.record.pendingPath && fs.existsSync(r5.record.pendingPath))
  const md = fs.readFileSync(r5.record.pendingPath, 'utf-8')
  ok('5 폴백 파일에 사람판단필요·소스·사유', md.includes('사람판단필요: true') && md.includes('fake:') && md.includes(blocked.health.detail))

  // 5b) 같은 날 행 조회가 실패해도 새로 만들지 않고 실패로 남긴다
  const qf = fakeNotion()
  globalThis.fetch = async (url, init) => (url.endsWith('/query') ? { ok: false, status: 502, json: async () => ({ code: 'x', message: 'bad gateway' }) } : qf(url, init))
  const r5b = await runSourceHealthReport({ ...base, sourceResults: [asResult('fake', blocked)], pendingDir: tmp })
  ok('5b 조회 실패 → ok:false · 행 생성 0 · 폴백 파일', r5b.ok === false && qf.pages.length === 0 && fs.existsSync(r5b.record.pendingPath))

  // 6) 토큰 없음 → 실패(호출 0회) + 폴백 파일
  globalThis.fetch = () => { throw new Error('토큰 없으면 호출하면 안 된다') }
  const r6 = await runSourceHealthReport({ ...base, token: '', sourceResults: [asResult('fake', blocked)], pendingDir: tmp })
  ok('6 토큰 없음은 실패', r6.ok === false && r6.record.stage === 'env')
  ok('6 토큰 없음도 폴백 파일', fs.existsSync(r6.record.pendingPath))
} finally {
  globalThis.fetch = realFetch
  fs.rmSync(tmp, { recursive: true, force: true })
}

// streaks 경계
ok('streaks: 못 읽으면 null', streaks(null, today) === null)
ok('streaks: 최신이 ok 면 0회·0일', JSON.stringify(streaks([{ started_at: '2026-09-30T05:00:00Z', health_after: 'ok' }], today)) === '{"runs":0,"days":0,"capped":false}')
ok('streaks: KST 날짜로 센다(UTC 9/29 16:00 = KST 9/30)', streaks([{ started_at: '2026-09-29T16:00:00Z', health_after: 'broken' }], today).days === 1)

// 5·(d) 배선 — review-collect 가 보고 실패를 종료 코드로 올리고, 워크플로가 폴백 파일을 main 에 올린다
const collect = fs.readFileSync(path.join(here, 'review-collect.mjs'), 'utf-8')
ok('배선: review-collect 가 runSourceHealthReport 를 부른다', /runSourceHealthReport\(\{/.test(collect))
ok('배선: 보고 실패 → failures → 종료 코드 1', /failures\.push\('source-health-report'\)/.test(collect) && /process\.exit\(failures\.length > 0 \? 1 : 0\)/.test(collect))
ok('배선: 폴백 폴더를 넘긴다', /pendingDir: PENDING_DIR/.test(collect))
const wf = fs.readFileSync(path.join(here, '..', '.github', 'workflows', 'nightly-review-collect.yml'), 'utf-8')
ok('워크플로: 수집 잡 permissions 는 contents: read 그대로', /^permissions:\s*\n\s+contents: read\s*$/m.test(wf))
ok('워크플로: 폴백 파일 push 잡은 봇 토큰 블록을 쓴다', /push-pending:[\s\S]*create-github-app-token[\s\S]*git push/.test(wf))
ok('워크플로: concurrency 유지', /concurrency:\s*\n\s+group: review-collect/.test(wf))

// ── 7) 건강도 읽는 자리 — review_collection_runs.health_after(소스별 최근 비-dry-run 실행) ──────
//    #373 뒤 review_sources.health* 는 안 갱신된다. /agents · insight-loop · /api/analyze/targets 가 여기서 읽는다.
{
  const { latestHealthBySource, loadLatestHealth, sourceAlertLines } = await import('../lib/review/latest-health.ts')
  const run = (key, started_at, health_after, over = {}) => ({ source_key: key, started_at, finished_at: started_at, status: 'ok', dry_run: false, health_after, ...over })
  const runs = [
    run('a', '2026-09-29T05:00:00Z', 'ok'),
    run('a', '2026-09-30T05:00:00Z', 'broken'),                           // 최신 = broken
    run('b', '2026-09-30T05:00:00Z', 'ok'),
    run('b', '2026-09-30T06:00:00Z', 'broken', { dry_run: true }),         // dry-run 은 무시
    run('d', '2026-09-30T05:00:00Z', null, { status: 'failed' }),          // 판정 없음
  ]
  const [a, b, c, d] = latestHealthBySource(['a', 'b', 'c', 'd'], runs)
  ok('7 양성: 최근 실행 broken → broken', a.health === 'broken' && a.at === '2026-09-30T05:00:00Z')
  ok('7 음성: 최근 실행 ok → ok (더 늦은 dry-run broken 은 무시)', b.health === 'ok')
  ok('7 기록 없음 → 확인 불가', c.health === 'unknown' && c.reason === '실행 기록 없음')
  ok('7 최근 실행에 판정 없음 → 확인 불가(ok 로 접지 않는다)', d.health === 'unknown' && /실행 실패/.test(d.reason))
  ok('7 조회 실패 → 전부 확인 불가', latestHealthBySource(['a'], null, 'boom')[0].health === 'unknown')

  const lines = sourceAlertLines(
    [{ key: 'a', enabled: true }, { key: 'b', enabled: true }, { key: 'c', enabled: true }, { key: 'x', enabled: false }],
    [a, b, c, { key: 'x', health: 'unknown', at: null, reason: '실행 기록 없음' }],
  )
  ok('7 경보: broken 소스는 경보 줄', lines.some((l) => l.startsWith('🚨') && l.includes('a = broken')))
  ok('7 경보: ok 소스는 줄 없음', !lines.some((l) => l.includes(' b = ')))
  ok('7 경보: 켜진 소스의 확인 불가는 경보(ok 로 접지 않는다)', lines.some((l) => l.includes('c = 확인 불가') && l.includes('실행 기록 없음')))
  ok('7 경보: 꺼진 소스의 확인 불가는 올리지 않는다(판정이 안 생기는 게 정상)', !lines.some((l) => l.includes(' x = ')))
  ok('7 경보: 빈 칸·undefined·null 이 안 새어 나온다', lines.every((l) => !/undefined|null/.test(l)))

  // 로더 — dry_run=false 로 거르고, 소스별 최근 1건, 에러는 그 소스만 확인 불가
  const calls = []
  const fakeSb = {
    from(table) {
      const q = { table, eqs: {}, order: null }
      calls.push(q)
      const api = {
        select() { return api },
        eq(c, v) { q.eqs[c] = v; return api },
        order(c, o) { q.order = [c, o.ascending]; return api },
        async limit() {
          if (q.eqs.source_key === 'err') return { data: null, error: { message: 'PGRST205' } }
          return { data: runs.filter((r) => r.source_key === q.eqs.source_key && r.dry_run === q.eqs.dry_run).sort((x, y) => y.started_at.localeCompare(x.started_at)).slice(0, 1), error: null }
        },
      }
      return api
    },
  }
  const loaded = await loadLatestHealth(fakeSb, ['a', 'b', 'err'])
  ok('7 로더: review_collection_runs 를 dry_run=false·최신순으로 읽는다', calls.every((q) => q.table === 'review_collection_runs' && q.eqs.dry_run === false && q.order?.[0] === 'started_at' && q.order[1] === false))
  ok('7 로더: a=broken · b=ok · 조회 실패=확인 불가', loaded.map((h) => h.health).join(',') === 'broken,ok,unknown' && /PGRST205/.test(loaded[2].reason))

  // 배선 — 사용자에게 보이는 두 자리가 옛 컬럼을 읽지 않고 이 로더를 쓴다
  const agents = fs.readFileSync(path.join(here, '..', 'app', 'agents', 'page.tsx'), 'utf-8')
  const loop = fs.readFileSync(path.join(here, 'insight-loop.mjs'), 'utf-8')
  const targets = fs.readFileSync(path.join(here, '..', 'app', 'api', 'analyze', 'targets', 'route.ts'), 'utf-8')
  for (const [name, txt] of [['/agents', agents], ['insight-loop', loop], ['/api/analyze/targets', targets]]) {
    ok(`7 배선: ${name} 가 loadLatestHealth 를 쓴다`, /loadLatestHealth\(/.test(txt))
  }
  ok('7 배선: /agents 는 review_sources 에서 health 를 읽지 않는다', !/from\('review_sources'\)\.select\('[^']*health/.test(agents))
  ok('7 배선: insight-loop 는 review_sources.health* 를 읽지 않는다', !/health_detail|health_checked_at|neq\('health'/.test(loop))
}

console.log(`review-source-health-selftest: ${pass} passed`)
