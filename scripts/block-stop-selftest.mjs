#!/usr/bin/env node
// block-stop.mjs 셀프테스트 — 네트워크·DB 없음(가짜 DB·가짜 Actions 이력·가짜 Notion).
//   node scripts/block-stop-selftest.mjs
// 고정하는 것(CLAUDE.md §10.1 차단 시 즉시 정지 조건 1~6): UPDATE 칸 화이트리스트 · 대상 필터(override) · 3슬롯 미만 정지 안 함 ·
//   확인 불가 정지 안 함 · 5xx(차단 0) 정지 안 함 · true 방향 코드 부재 · 롤백 SQL 이 UPDATE 전에 쓰임 · 통지만 사람판단필요=true ·
//   매일 행 "[꺼진 소스]" 칸.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALLOWED_COLS, TARGET_OVERRIDE, buildStopEntry, guardPatch, isLegacySlotRun, isTarget, judgeBlockStop, main, parseNotices, reasonText, rollbackSql,
} from './block-stop.mjs'
import { buildReviewCollectEntry, offSourcesBlock } from './review-collect-status.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
let n = 0
const ok = (name, fn) => { fn(); n++; console.log(`  ok ${name}`) }
const okAsync = async (name, fn) => { await fn(); n++; console.log(`  ok ${name}`) }

// ── 1) 화이트리스트 ─────────────────────────────────────────
const good = { enabled: false, disabled_reason: 'x', disabled_at: '2026-10-15T00:00:00Z' }
ok('화이트리스트는 enabled·disabled_reason·disabled_at 세 칸', () => assert.deepEqual([...ALLOWED_COLS], ['enabled', 'disabled_reason', 'disabled_at']))
ok('화이트리스트 고정(동결 객체)', () => assert.ok(Object.isFrozen(ALLOWED_COLS)))
ok('허용 patch 통과', () => assert.equal(guardPatch({ ...good }).enabled, false))
for (const col of ['override', 'health', 'daily_request_cap', 'display_name', 'health_detail']) {
  ok(`다른 칸(${col}) → throw`, () => assert.throws(() => guardPatch({ ...good, [col]: 'v' }), /허용 밖 칸/))
}
ok('enabled=true → throw', () => assert.throws(() => guardPatch({ ...good, enabled: true }), /false 로만/))
ok('사유 없음 → throw', () => assert.throws(() => guardPatch({ ...good, disabled_reason: ' ' }), /disabled_reason/))
ok('disabled_at 없음 → throw', () => assert.throws(() => guardPatch({ enabled: false, disabled_reason: 'x' }), /disabled_at/))

// ── 2) 대상 필터 ────────────────────────────────────────────
ok('override=owner_2026-10-14 ∧ enabled → 대상', () => assert.ok(isTarget({ override: TARGET_OVERRIDE, enabled: true })))
for (const o of ['owner_2026-10-05', 'owner_2026-10-06', 'owner_2026-10-08', null]) {
  ok(`override=${o} (앱스토어·구글플레이·indiehackers·다나와 등) → 제외`, () => assert.ok(!isTarget({ override: o, enabled: true })))
}
ok('이미 꺼진 소스 → 제외', () => assert.ok(!isTarget({ override: TARGET_OVERRIDE, enabled: false })))

// ── 3) 판정 ────────────────────────────────────────────────
const KEY = 'n8n_community' // HALT_ON_BLOCK_SOURCES 에 있는 v70 소스
const blockedRun = { source_key: KEY, started_at: '2026-10-14T05:40:00Z', finished_at: '2026-10-14T05:41:00Z', status: 'failed', dry_run: false, health_after: 'broken', reviews_parsed: 0, parse_failures: 0, blocked_responses: 1 }
const slot = (id, created, conclusion = 'success', event = 'schedule') => ({ id, html_url: `https://github.com/x/actions/runs/${id}`, event, conclusion, created_at: created, run_started_at: created, updated_at: created.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) + 1).padStart(2, '0')}`) })
const s1 = slot(1, '2026-10-14T18:10:00Z'); const s2 = slot(2, '2026-10-15T06:20:00Z'); const s3 = slot(3, '2026-10-15T18:05:00Z')
const extra = slot(9, '2026-10-15T09:40:00Z') // 추가 슬롯(09:29) — 기존 슬롯 아님
const other = (t) => ({ source_key: 'hackernews', started_at: t })
const others = ['2026-10-14T18:20:00Z', '2026-10-15T06:30:00Z', '2026-10-15T18:15:00Z', '2026-10-15T09:50:00Z'].map(other)
const NOW = Date.parse('2026-10-16T00:00:00Z')
const J = (o) => judgeBlockStop({ key: KEY, runs: [blockedRun], actionsRuns: [s1, s2, s3], otherRows: others, now: NOW, ...o })

ok('차단 1회 + 기존 슬롯 3개 soft-skip → stop', () => { const v = J({}); assert.equal(v.state, 'stop'); assert.equal(v.slots.length, 3) })
ok('2슬롯 → hold(정지 안 함)', () => assert.equal(J({ actionsRuns: [s1, s2] }).state, 'hold'))
ok('추가 슬롯은 세지 않는다', () => assert.equal(J({ actionsRuns: [s1, s2, extra] }).state, 'hold'))
ok('수동 실행(workflow_dispatch)은 세지 않는다', () => assert.equal(J({ actionsRuns: [s1, s2, { ...s3, event: 'workflow_dispatch' }] }).state, 'hold'))
ok('취소된 슬롯은 세지 않는다', () => assert.equal(J({ actionsRuns: [s1, s2, { ...s3, conclusion: 'cancelled' }] }).state, 'hold'))
ok('그 슬롯에 다른 소스 실행 행이 없으면(루프 미도달) 세지 않는다', () => assert.equal(J({ otherRows: others.slice(0, 2) }).state, 'hold'))
ok('차단 실행 이전 슬롯은 세지 않는다', () => assert.equal(J({ actionsRuns: [slot(0, '2026-10-13T17:50:00Z'), s1, s2] }).state, 'hold'))
ok('차단 뒤 새 실행 행이 생겼으면(재개) hold', () => assert.equal(J({ runs: [blockedRun, { ...blockedRun, started_at: '2026-10-15T06:00:00Z', blocked_responses: 0, health_after: 'ok' }] }).state, 'hold'))
ok('5xx·타임아웃(blocked_responses=0) → hold', () => assert.equal(J({ runs: [{ ...blockedRun, blocked_responses: 0 }] }).state, 'hold'))
ok('HALT 대상이 아닌 소스(soft-skip 안 걸림) → hold', () => assert.equal(J({ key: 'wordpress_org', runs: [{ ...blockedRun, source_key: 'wordpress_org' }] }).state, 'hold'))
ok('확인 불가: 실행 기록 못 읽음 → unknown(정지 안 함)', () => assert.equal(J({ runs: null }).state, 'unknown'))
ok('확인 불가: 차단 수치 null → unknown', () => assert.equal(J({ runs: [{ ...blockedRun, blocked_responses: null }] }).state, 'unknown'))
ok('확인 불가: Actions 이력 못 읽음 → unknown', () => assert.equal(J({ actionsRuns: null }).state, 'unknown'))
ok('확인 불가: 다른 소스 행 못 읽음 → unknown', () => assert.equal(J({ otherRows: null }).state, 'unknown'))
ok('기존 슬롯 창: 05:37~09:29 · 17:37~20:47 UTC', () => {
  assert.ok(isLegacySlotRun('2026-10-15T05:37:00Z') && isLegacySlotRun('2026-10-15T09:28:59Z') && isLegacySlotRun('2026-10-15T20:46:00Z'))
  assert.ok(!isLegacySlotRun('2026-10-15T09:29:00Z') && !isLegacySlotRun('2026-10-15T01:43:00Z') && !isLegacySlotRun('2026-10-15T20:47:00Z') && !isLegacySlotRun('x'))
})

// ── 4) --notice ────────────────────────────────────────────
ok('--notice key=url 파싱', () => assert.equal(parseNotices(['--notice', 'make_community=https://notion.so/abc']).get('make_community'), 'https://notion.so/abc'))
ok('--notice 형식 오류 → throw', () => assert.throws(() => parseNotices(['--notice', 'make_community=ftp://x']), /형식/))
ok('사람판단필요: 단순 차단 false · 통지 true', () => {
  const st = (kind) => ({ key: 'k', kind, patch: { disabled_reason: 'r' } })
  assert.equal(buildStopEntry({ date: '2026-10-15', stops: [st('block')], rollbackPath: 'p', runUrl: null }).needsHuman, false)
  assert.equal(buildStopEntry({ date: '2026-10-15', stops: [st('block'), st('notice')], rollbackPath: 'p', runUrl: null }).needsHuman, true)
})
ok('disabled_reason 에 사유·근거 URL·실행 URL', () => {
  const r = reasonText({ kind: 'block', detail: 'd', urls: ['https://a'], runUrl: 'https://run' })
  assert.match(r, /차단 정지 — d · 근거 https:\/\/a · 실행 https:\/\/run/)
})

// ── 5) 한 방향 — 켜는 코드가 없다 ────────────────────────────
ok('block-stop.mjs 에 enabled=true·override·health 쓰기 코드 없음', () => {
  const src = fs.readFileSync(path.join(here, 'block-stop.mjs'), 'utf8')
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n')
  assert.ok(!/enabled\s*:\s*true/.test(code), 'enabled: true patch')
  assert.ok(!/\b(override|health)\s*:\s*['"`\w]/.test(code.replace(/override === TARGET_OVERRIDE|s\?\.override/g, '')), 'override/health patch')
  assert.equal((code.match(/\.update\(/g) ?? []).length, 1, 'UPDATE 는 한 곳')
  assert.ok(/\.update\(guardPatch\(/.test(code), 'UPDATE 는 guardPatch 를 지난다')
  assert.ok(!/\.(insert|upsert|delete)\(/.test(code), 'INSERT/UPSERT/DELETE 없음')
})

// ── 6) 롤백 SQL ────────────────────────────────────────────
ok('롤백 SQL — 이전 값 복원 · 따옴표 이스케이프 · 끈 그대로일 때만', () => {
  const sql = rollbackSql([{ key: 'make_community', patch: { disabled_reason: "it's" }, prev: { disabled_reason: null, disabled_at: null } }], 'S')
  assert.match(sql, /UPDATE public\.review_sources SET enabled = true, disabled_reason = NULL, disabled_at = NULL WHERE key = 'make_community' AND enabled = false AND disabled_reason = 'it''s';/)
  assert.match(sql, /^-- block-stop 롤백 S/)
})

// ── 7) main — 가짜 DB 로 드라이런·적용 ─────────────────────────
function fakeDb({ sources, runsByKey, otherRows, failUpdate = false }) {
  const calls = { updates: [], order: [] }
  const q = (table) => {
    const st = { table, filters: {}, neq: {}, op: 'select', patch: null }
    const api = {
      select() { return api }, order() { return api }, gte() { return api },
      eq(c, v) { st.filters[c] = v; return api }, neq(c, v) { st.neq[c] = v; return api },
      update(p) { st.op = 'update'; st.patch = p; return api },
      limit() { return api },
      then(res, rej) {
        let out
        if (table === 'review_sources' && st.op === 'update') {
          calls.order.push('update'); calls.updates.push({ ...st })
          const row = sources.find((s) => s.key === st.filters.key && s.enabled === st.filters.enabled && s.override === st.filters.override)
          if (failUpdate) out = { data: null, error: { message: 'boom' } }
          else if (row) { Object.assign(row, st.patch); out = { data: [{ key: row.key, enabled: row.enabled }], error: null } } else out = { data: [], error: null }
        } else if (table === 'review_sources') out = { data: sources.filter((s) => s.override === st.filters.override && (st.filters.enabled === undefined || s.enabled === st.filters.enabled)).map((s) => ({ ...s })), error: null }
        else if (st.neq.source_key) out = { data: otherRows, error: null }
        else out = { data: runsByKey[st.filters.source_key] ?? [], error: null }
        return Promise.resolve(out).then(res, rej)
      },
    }
    return api
  }
  return { from: q, calls }
}
const mkSources = () => [
  { key: KEY, enabled: true, override: TARGET_OVERRIDE, disabled_reason: null, disabled_at: null },
  { key: 'make_community', enabled: true, override: TARGET_OVERRIDE, disabled_reason: null, disabled_at: null },
  { key: 'googleplay', enabled: true, override: 'owner_2026-10-06', disabled_reason: null, disabled_at: null },
]
const runsByKey = { [KEY]: [blockedRun], make_community: [{ ...blockedRun, source_key: 'make_community', blocked_responses: 0, health_after: 'ok' }], googleplay: [{ ...blockedRun, source_key: 'googleplay' }] }
const quiet = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn() } finally { console.log = l } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'block-stop-'))
const now = new Date('2026-10-16T00:00:00Z')

await okAsync('드라이런(기본): 쓰기 0 · 대상은 n8n_community 하나', async () => {
  const db = fakeDb({ sources: mkSources(), runsByKey, otherRows: others })
  const r = await quiet(() => main([], { db, now, fetchRuns: async () => [s1, s2, s3], record: async () => assert.fail('Notion 호출됨'), outDir: tmp }))
  assert.deepEqual(r.stops.map((s) => s.key), [KEY])
  assert.equal(db.calls.updates.length, 0)
  assert.equal(r.out, null)
})
await okAsync('--apply: 롤백 파일이 UPDATE 전에 존재 · UPDATE 칸 3개 · Notion 사람판단필요=false', async () => {
  const db = fakeDb({ sources: mkSources(), runsByKey, otherRows: others })
  let fileAtUpdate = null; let entry = null
  const origFrom = db.from
  db.from = (t) => { const a = origFrom(t); const u = a.update; a.update = (p) => { fileAtUpdate = fs.readdirSync(path.join(tmp, '2026-10-16')).some((f) => f.startsWith('block-stop-rollback-')); return u(p) }; return a }
  const r = await quiet(() => main(['--apply'], { db, now, fetchRuns: async () => [s1, s2, s3], record: async (e) => { entry = e; return { ok: true, title: 't' } }, outDir: tmp }))
  assert.equal(fileAtUpdate, true)
  assert.deepEqual(Object.keys(db.calls.updates[0].patch).sort(), ['disabled_at', 'disabled_reason', 'enabled'])
  assert.equal(db.calls.updates[0].filters.override, TARGET_OVERRIDE)
  assert.equal(r.applied.length, 1)
  assert.match(fs.readFileSync(r.out, 'utf8'), /SET enabled = true, .* WHERE key = 'n8n_community' AND enabled = false/)
  assert.equal(entry.needsHuman, false)
  assert.match(entry.blocked, /꺼진 소스 n8n_community: \[block-stop\] 차단 정지/)
})
await okAsync('--apply: 슬롯 2개뿐이면 UPDATE 0', async () => {
  const db = fakeDb({ sources: mkSources(), runsByKey, otherRows: others })
  const r = await quiet(() => main(['--apply'], { db, now, fetchRuns: async () => [s1, s2], record: async () => assert.fail('Notion 호출됨'), outDir: tmp }))
  assert.equal(r.stops.length, 0); assert.equal(db.calls.updates.length, 0)
})
await okAsync('--apply: Actions 이력 못 읽음 → UPDATE 0', async () => {
  const db = fakeDb({ sources: mkSources(), runsByKey, otherRows: others })
  const r = await quiet(() => main(['--apply'], { db, now, fetchRuns: async () => null, record: async () => assert.fail('Notion 호출됨'), outDir: tmp }))
  assert.equal(r.stops.length, 0); assert.equal(db.calls.updates.length, 0)
})
await okAsync('--notice: 대상 소스는 차단 없이도 정지 · 사람판단필요=true · googleplay 통지는 무시', async () => {
  const db = fakeDb({ sources: mkSources(), runsByKey, otherRows: others })
  let entry = null
  const r = await quiet(() => main(['--apply', '--notice', 'make_community=https://www.notion.so/x', '--notice', 'googleplay=https://www.notion.so/y'], { db, now, fetchRuns: async () => [], record: async (e) => { entry = e; return { ok: true, title: 't' } }, outDir: tmp }))
  assert.deepEqual(r.applied.map((s) => s.key), ['make_community'])
  assert.equal(entry.needsHuman, true)
  assert.match(db.calls.updates[0].patch.disabled_reason, /중지 요청·경고·법적 통지.*https:\/\/www\.notion\.so\/x/)
})
await okAsync('review_sources 못 읽음 → throw(정지 안 함)', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'x' } }) }) }) }
  await assert.rejects(() => quiet(() => main(['--apply'], { db, now, fetchRuns: async () => [], outDir: tmp })), /확인 불가/)
})

// ── 8) 매일 행 "[꺼진 소스]" 칸 ─────────────────────────────
ok('[꺼진 소스] 없음 / 확인 불가 / 한 줄씩(소스 / 시각 / 사유 / 며칠째)', () => {
  assert.equal(offSourcesBlock([], '2026-10-15'), '[꺼진 소스] 없음')
  assert.match(offSourcesBlock(null, '2026-10-15'), /확인 불가/)
  const b = offSourcesBlock([{ key: 'make_community', disabled_at: '2026-10-13T16:00:00Z', disabled_reason: '[block-stop] 차단 정지' }], '2026-10-15')
  assert.equal(b, '[꺼진 소스]\n- make_community / 2026-10-14 01:00 KST / [block-stop] 차단 정지 / 2일째')
})
ok('buildReviewCollectEntry: offSources 주면 비고에 칸 · 안 주면 기존 그대로', () => {
  assert.match(buildReviewCollectEntry({ date: '2026-10-15', offSources: [] }).note, /\n\[꺼진 소스\] 없음$/)
  assert.ok(!buildReviewCollectEntry({ date: '2026-10-15' }).note.includes('[꺼진 소스]'))
  assert.equal(buildReviewCollectEntry({ date: '2026-10-15', offSources: [] }).needsHuman, false)
})

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`✅ block-stop-selftest: ${n}건 통과`)
