#!/usr/bin/env node
// 창문 자율 발굴 셀프테스트(남헌 v53 §5 2-A). 네트워크·DB 없음 — 가짜 fetch(실제 픽스처, 실제 어댑터 파서)와 기록용 가짜 DB.
//   소스당 5 상한 · 가드(googleplay 80·appstore 30%) · 중복 방지 · 차단 즉시 중단 · 3일 강등 대상 · 롤백 SQL 형태 ·
//   워크플로 정적 검사(새 secret 없음·concurrency·권한) · 입력→등재 SQL 경계 · zero-request 감시와 무관(실행 행 없음).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pushWithoutBotToken } from './cron-watchdog.mjs'
import { COLLECT_SLOTS } from '../lib/review/ramp.ts'
import { renderRollback, renderSql } from './window-migration-draft.mjs'
import {
  demoteRows, demotionRollbackSql, insertPayload, insertRows, logBlock, main, orderAnchors, planDemotion, planRegistration, stageGate,
} from './window-discovery.mjs'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (Object.is(actual, expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}

const AS_PAGE1 = fs.readFileSync('fixtures/appstore/page1.json', 'utf8')
const P = '11111111-1111-4111-8111-111111111111'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SOURCES = [
  { key: 'appstore', enabled: true, override: 'owner_2026-10-05', robots_status: 'disallowed', min_interval_ms: 1000 },
  { key: 'googleplay', enabled: true, override: 'owner_2026-10-06', robots_status: 'disallowed', min_interval_ms: 1000 },
]
const anchor = { id: id(1), label: '3:kr|foo', source_key: 'appstore', product_ref: 'kr:123', project_id: P, status: 'active', consecutive_empty: 0, total_collected: 50 }
const gpAnchor = { id: id(2), label: '3:foo', source_key: 'googleplay', product_ref: 'kr:ko:com.foo.app', project_id: P, status: 'active', consecutive_empty: 0, total_collected: 9 }
const state = (o = {}) => ({
  total_active: 1000,
  sources: { appstore: { active: 100, gate_headroom: 285 }, googleplay: { active: 40, gate_headroom: 40 } },
  areas: { 1: { active: 30, minimum: 8 }, 3: { active: 2, minimum: 8 } },
  ramp: { appstore: { frozen_until: null, cap_base: 100 }, googleplay: { frozen_until: null, cap_base: 50 } },
  blocked_72h: { appstore: 0, googleplay: 0 },
  running: [],
  ...o,
})
const cand = (country, npr = 7, src = 'appstore') =>
  src === 'appstore'
    ? { source_key: 'appstore', product_ref: `${country}:123`, anchor_ref: 'kr:123', label: `3:${country}|foo`, sort: 'mostRecent', draftable: true, new_per_request: npr }
    : { source_key: 'googleplay', product_ref: `${country}:en:com.foo.app`, anchor_ref: 'kr:ko:com.foo.app', label: `3:${country}-en|foo`, sort: 'newest', draftable: true, new_per_request: npr }
const SEVEN = ['us', 'gb', 'ca', 'au', 'in', 'sg', 'ie']

// ── 1. 소스당 하루 5 상한 ──
{
  const r = planRegistration(SEVEN.map((c, i) => cand(c, 10 + i)), { targets: [anchor], sources: SOURCES, state: state() })
  t('cap 5 rows', r.rows.length, 5)
  t('cap 5 skipped daily_cap', r.skipped.filter((s) => s.reason === 'daily_cap').length, 2)
  t('cap picks highest new/request first', r.rows[0].product_ref, 'ie:123')
  t('project_id from anchor', r.rows[0].project_id, P)
  const r2 = planRegistration(SEVEN.map((c) => cand(c)), { targets: [anchor], sources: SOURCES, state: state(), registeredToday: { appstore: 3 } })
  t('cap counts already registered today', r2.rows.length, 2)
}

// ── 2. 가드 ──
{
  const gp80 = state({ sources: { appstore: { active: 100 }, googleplay: { active: 80 } } })
  const r = planRegistration([cand('us', 9, 'googleplay')], { targets: [gpAnchor], sources: SOURCES, state: gp80 })
  t('googleplay 80 → 0 rows', r.rows.length, 0)
  t('googleplay 80 → gate_blocked', r.skipped[0]?.reason, 'gate_blocked')
  const gp78 = state({ sources: { appstore: { active: 100 }, googleplay: { active: 78 } } })
  t('googleplay 78 → 2 rows', planRegistration(['us', 'gb', 'ca'].map((c) => cand(c, 9, 'googleplay')), { targets: [gpAnchor], sources: SOURCES, state: gp78 }).rows.length, 2)
  const as30 = state({ total_active: 100, sources: { appstore: { active: 30 }, googleplay: { active: 10 } } })
  const a = planRegistration([cand('us')], { targets: [anchor], sources: SOURCES, state: as30 })
  t('appstore 30% → 0 rows', a.rows.length, 0)
  t('appstore 30% → gate_blocked', a.skipped[0]?.reason, 'gate_blocked')
  const as28 = state({ total_active: 100, sources: { appstore: { active: 28 }, googleplay: { active: 10 } } })
  const b = planRegistration(SEVEN.map((c) => cand(c)), { targets: [anchor], sources: SOURCES, state: as28 })
  t('appstore headroom 2 → 2 rows', b.rows.length, 2)
  t('appstore after ≤30%', (28 + b.rows.length) / (100 + b.rows.length) <= 0.3, true)
  // 소스 게이트(소유자 예외 아님·꺼짐)
  const off = [{ ...SOURCES[0], enabled: false }, SOURCES[1]]
  t('disabled source → gate_blocked', planRegistration([cand('us')], { targets: [anchor], sources: off, state: state() }).skipped[0].reason, 'gate_blocked')
}

// ── 3. 중복·앵커·같은 앱 ──
{
  const existing = { ...anchor, id: id(3), product_ref: 'us:123', status: 'exhausted' }
  const r = planRegistration([cand('us'), cand('gb'), cand('gb')], { targets: [anchor, existing], sources: SOURCES, state: state() })
  t('dup existing (any status) skipped', r.skipped.find((s) => s.key === 'appstore|us:123')?.reason, 'duplicate')
  t('dup within batch once', r.rows.filter((x) => x.product_ref === 'gb:123').length, 1)
  t('no anchor', planRegistration([cand('us')], { targets: [], sources: SOURCES, state: state() }).skipped[0].reason, 'no_anchor')
  t('other app', planRegistration([{ ...cand('us'), product_ref: 'us:999' }], { targets: [anchor], sources: SOURCES, state: state() }).skipped[0].reason, 'not_same_app')
  t('not draftable', planRegistration([{ ...cand('us'), draftable: false }], { targets: [anchor], sources: SOURCES, state: state() }).skipped[0].reason, 'not_draftable')
  t('unknown source', planRegistration([{ ...cand('us'), source_key: 'danawa' }], { targets: [anchor], sources: SOURCES, state: state() }).skipped[0].reason, 'gate_blocked')
}

// ── 4. 프로브 단계 게이트(fail-closed) ──
{
  const now = new Date('2026-10-13T00:00:00Z')
  const g = (src, st, extra = {}) => stageGate(src, { sources: SOURCES, state: st, now, ...extra }).reason
  t('stage ok', g('appstore', state()), null)
  t('frozen', g('googleplay', state({ ramp: { appstore: {}, googleplay: { frozen_until: '2026-10-20T00:00:00Z', cap_base: 50 } } })), 'frozen')
  t('cap_base missing', g('googleplay', state({ ramp: { appstore: {}, googleplay: { frozen_until: null, cap_base: null } } })), 'cap_base_missing')
  t('ramp unreadable', g('appstore', state({ ramp: null })), 'ramp_unverified')
  t('block history unreadable', g('appstore', state({ blocked_72h: null })), 'block_history_unverified')
  t('blocked recent', g('googleplay', state({ blocked_72h: { appstore: 0, googleplay: 2 } })), 'blocked_recent')
  t('collect running', g('appstore', state({ running: ['appstore'] })), 'collect_running')
  t('headroom 0', g('googleplay', state({ sources: { appstore: { active: 1, gate_headroom: 5 }, googleplay: { active: 80, gate_headroom: 0 } } })), 'gate_blocked')
  t('daily cap reached', g('appstore', state(), { registeredToday: 5 }), 'daily_cap')
}

// ── 5. 앵커 순서: 영역 결손 큰 순 → 마지막 프로브 오래된 순 ──
{
  const a1 = { ...anchor, id: id(10), label: '1:x|a', product_ref: 'kr:1' }
  const a3old = { ...anchor, id: id(11), label: '3:x|b', product_ref: 'kr:2' }
  const a3new = { ...anchor, id: id(12), label: '3:x|c', product_ref: 'kr:3' }
  const a3never = { ...anchor, id: id(13), label: '3:x|d', product_ref: 'kr:4' }
  const un = { ...anchor, id: id(14), label: 'nolabel', product_ref: 'kr:5' }
  const last = { 'appstore|kr:2': '2026-10-01T00:00:00Z', 'appstore|kr:3': '2026-10-10T00:00:00Z' }
  const o = orderAnchors([un, a1, a3new, a3old, a3never], state().areas, last).map((x) => x.product_ref)
  t('anchor order', JSON.stringify(o), JSON.stringify(['kr:4', 'kr:2', 'kr:3', 'kr:1', 'kr:5']))
}

// ── 6. 3일 강등 대상 ──
{
  const now = new Date('2026-10-16T00:00:00Z')
  const e = (n, regDays, extra = {}) => ({ id: id(n), source_key: 'appstore', status: 'adopted', registered_at: new Date(now.getTime() - regDays * 86_400_000).toISOString(), baseline_total_collected: 0, ...extra })
  const tg = (n, o) => ({ id: id(n), status: 'active', total_collected: 0, consecutive_empty: 0, last_run_at: '2026-10-15T00:00:00Z', ...o })
  const entries = [e(1, 4), e(2, 2), e(3, 4), e(4, 4), e(5, 4), e(6, 4, { status: 'demoted' })]
  const targets = [tg(1), tg(2), tg(3, { total_collected: 12 }), tg(4, { last_run_at: null }), tg(5, { status: 'exhausted' }), tg(6)]
  const d = planDemotion(entries, targets, now)
  t('demote only 0-new visited ≥3d', JSON.stringify(d.demote.map((x) => x.entry.id)), JSON.stringify([id(1)]))
  t('kept when collected', JSON.stringify(d.kept.map((x) => x.id)), JSON.stringify([id(3)]))
  t('unverified when never visited / not active', d.unverified.length, 2)
  t('younger than 3d untouched', [...d.demote, ...d.unverified].some((x) => x.entry.id === id(2)), false)
  t('already demoted untouched', [...d.demote, ...d.kept, ...d.unverified].some((x) => (x.entry ?? x).id === id(6)), false)
  const visitedBeforeReg = planDemotion([e(7, 4)], [tg(7, { last_run_at: '2026-10-01T00:00:00Z' })], now)
  t('visit before registration → unverified', visitedBeforeReg.unverified.length, 1)
}

// ── 7. 롤백 SQL 형태 ──
{
  const rb = demotionRollbackSql([{ id: id(1), prev_consecutive_empty: 2 }], 'S')
  t('demote rollback restores active', rb.includes("SET status = 'active', consecutive_empty = v.prev_ce"), true)
  t('demote rollback guarded', rb.includes("t.status = 'exhausted'"), true)
  t('demote rollback no DELETE', /\bDELETE\b/i.test(rb), false)
  t('demote rollback bad id throws', (() => { try { demotionRollbackSql([{ id: 'x', prev_consecutive_empty: 0 }], 'S'); return false } catch { return true } })(), true)
  t('demote rollback empty', demotionRollbackSql([], 'S').includes('대상 0행'), true)
}

// ── 8. 입력 → 등재 SQL 경계 ──
{
  const { rows } = planRegistration([cand('us'), cand('gb', 8, 'googleplay')], { targets: [anchor, gpAnchor], sources: SOURCES, state: state() })
  t('boundary rows', rows.length, 2)
  const sql = renderSql(rows, { name: 'N', ledgerPath: 'L', rollbackName: 'R' })
  const rb = renderRollback(rows, { name: 'N' })
  for (const r of rows) {
    t(`sql has ${r.product_ref}`, sql.includes(`('${r.source_key}', '${r.product_ref}', '${r.label}', '${r.anchor_ref}')`), true)
    t(`rollback has ${r.product_ref}`, rb.includes(`('${r.source_key}', '${r.product_ref}', '${r.label}')`), true)
    const p = insertPayload(r)
    t(`payload ${r.product_ref} same values`, [p.source_key, p.product_ref, p.label, p.project_id, p.status, p.cursor, p.last_run_at].join('|'), [r.source_key, r.product_ref, r.label, P, 'active', null, null].join('|'))
  }
  // 초안 SQL 의 INSERT 칸 == payload 칸
  const cols = /INSERT INTO public\.review_targets \(([^)]+)\)/.exec(sql)[1].split(',').map((s) => s.trim()).sort().join(',')
  t('payload columns = SQL columns', Object.keys(insertPayload(rows[0])).sort().join(','), cols)
  t('rollback no DELETE', /\bDELETE\b/i.test(rb.replace(/--[^\n]*/g, '')), false)
}

// ── 9. 가짜 DB: INSERT·UPDATE 만, 중복 재확인, 강등 조건 ──
{
  const calls = []
  const existing = new Set(['appstore|gb:123'])
  const q = (table) => {
    const st = { table, op: 'select', filters: {}, payload: null }
    const api = {
      select() { return api },
      eq(k, v) { st.filters[k] = v; return api },
      limit() { calls.push({ ...st }); return Promise.resolve({ data: existing.has(`${st.filters.source_key}|${st.filters.product_ref}`) ? [{ id: 'x' }] : [], error: null }) },
      insert(p) { st.op = 'insert'; st.payload = p; return api },
      update(p) { st.op = 'update'; st.payload = p; return api },
      delete() { throw new Error('delete called') },
      single() { calls.push({ ...st }); return Promise.resolve({ data: { id: id(99), total_collected: 0 }, error: null }) },
      then(res) { calls.push({ ...st }); return Promise.resolve({ data: st.filters.id === id(1) ? [{ id: id(1) }] : [], error: null }).then(res) },
    }
    return api
  }
  const sb = { from: q }
  const rows = planRegistration([cand('us'), cand('ca')], { targets: [anchor], sources: SOURCES, state: state() }).rows
  existing.add('appstore|ca:123') // 입력 파일 뒤 다른 실행이 넣었다
  const r = await insertRows(sb, rows)
  t('insert count', r.inserted.length, 1)
  t('fresh dup skipped', r.skipped[0]?.reason, 'duplicate')
  t('insert baseline', r.inserted[0].baseline_total_collected, 0)
  t('only review_targets touched', calls.every((c) => c.table === 'review_targets'), true)
  t('insert ops are insert/select only', calls.every((c) => c.op === 'insert' || c.op === 'select'), true)
  calls.length = 0
  const { done, error } = await demoteRows(sb, [{ entry: { id: id(1) }, target: { id: id(1), total_collected: 0 } }, { entry: { id: id(2) }, target: { id: id(2), total_collected: 0 } }])
  t('demote returns changed only', JSON.stringify(done), JSON.stringify([id(1)]))
  t('demote no error', error, null)
  t('demote writes status only', calls.every((c) => c.op === 'update' && JSON.stringify(c.payload) === '{"status":"exhausted"}'), true)
  t('demote guarded by status+total', calls.every((c) => c.filters.status === 'active' && c.filters.total_collected === 0), true)
}

// ── 10. 통합(dry-run): 실제 픽스처·실제 파서, 차단 즉시 중단 ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'window-discovery-'))
const inDir = path.join(tmp, 'in')
fs.mkdirSync(inDir)
fs.writeFileSync(path.join(inDir, 'targets.json'), JSON.stringify([anchor, gpAnchor]))
fs.writeFileSync(path.join(inDir, 'sources.json'), JSON.stringify(SOURCES))
fs.writeFileSync(path.join(inDir, 'seen.json'), JSON.stringify({ identity_keys: [], legacy_identity_keys: [], content_hashes: [] }))
fs.writeFileSync(path.join(inDir, 'state.json'), JSON.stringify(state()))
const cfgFile = path.join(tmp, 'cfg.json')
fs.writeFileSync(cfgFile, JSON.stringify({ adopt_min_new_per_request: 5, min_interval_ms_floor: 0, appstore: { countries: ['us', 'gb'], sorts: ['mostRecent', 'mostHelpful'] }, googleplay: { windows: ['us:en'] } }))
const quiet = () => {}
const noRecord = async () => { throw new Error('dry-run 인데 Notion 호출') }
{
  const calls = []
  const r = await main([`--in=${inDir}`, `--reports-dir=${path.join(tmp, 'r1')}`, `--config=${cfgFile}`, '--dry-run'], {
    fetchText: async (u) => { calls.push(u); return { status: 200, body: AS_PAGE1 } },
    sleep: async () => {}, now: new Date('2026-10-13T00:00:00Z'), log: quiet, record: noRecord,
  })
  t('dry: mostHelpful not probed', calls.some((u) => u.includes('mostHelpful')), false)
  t('dry: appstore adopted 2', r.adopted >= 2, true)
  t('dry: register 0 dry_run', r.reasons.register, 'dry_run')
  t('dry: no DB (registered 0)', r.registered, 0)
  t('dry: code 0', r.code, 0)
  t('dry: log block written', fs.readFileSync(path.join(tmp, 'r1', '2026-10-13', 'discovery-log-block.md'), 'utf8').includes('[자율 발굴 2026-10-13]'), true)
  t('dry: adopted ledger not written', fs.existsSync(path.join(tmp, 'r1', 'window-adopted.json')), false)
}
{
  const calls = []
  const r = await main([`--in=${inDir}`, `--reports-dir=${path.join(tmp, 'r2')}`, `--config=${cfgFile}`, '--dry-run'], {
    fetchText: async (u) => { calls.push(u); return { status: 429, body: '' } },
    sleep: async () => {}, now: new Date('2026-10-13T00:00:00Z'), log: quiet, record: noRecord,
  })
  t('block: one request then stop', calls.length, 1)
  t('block: googleplay stage skipped', r.reasons.googleplay, 'blocked')
  t('block: code 3', r.code, 3)
  t('block: register 0', r.registered, 0)
  t('block: log says 차단 1', logBlock({ ...r, alerts: [], files: [] }).includes('차단 1'), true)
}
{
  // 요청 상한: 80 대신 1
  const r = await main([`--in=${inDir}`, `--reports-dir=${path.join(tmp, 'r3')}`, `--config=${cfgFile}`, '--dry-run', '--max-requests=1'], {
    fetchText: async () => ({ status: 200, body: AS_PAGE1 }), sleep: async () => {}, now: new Date('2026-10-13T00:00:00Z'), log: quiet, record: noRecord,
  })
  t('quota: requests ≤ max', r.requests, 1)
  t('quota: reason', r.reasons.appstore, 'quota')
}
{
  // 요청 상한 천장(v71ab C-3): 160 은 통과, 161 은 던진다(리포 변수 오타 방지)
  let err = null
  try { await main([`--in=${inDir}`, `--reports-dir=${path.join(tmp, 'r3c')}`, `--config=${cfgFile}`, '--dry-run', '--max-requests=161'], { fetchText: async () => ({ status: 200, body: AS_PAGE1 }), sleep: async () => {}, now: new Date('2026-10-13T00:00:00Z'), log: quiet, record: noRecord }) } catch (e) { err = e }
  t('ceiling: 161 rejected', /1~160/.test(String(err?.message)), true)
  const r = await main([`--in=${inDir}`, `--reports-dir=${path.join(tmp, 'r3d')}`, `--config=${cfgFile}`, '--dry-run', '--max-requests=160'], { fetchText: async () => ({ status: 200, body: AS_PAGE1 }), sleep: async () => {}, now: new Date('2026-10-13T00:00:00Z'), log: quiet, record: noRecord })
  t('ceiling: 160 accepted', r.max_requests ?? 160, 160)
}
// ── 10b. 통합(실행): 롤백 파일이 INSERT 전에 있다 · 대장 기록 · 3일 뒤 강등 · Notion 못 쓰면 notion_unavailable ──
{
  const rDir = path.join(tmp, 'r4')
  const ops = []
  let n = 100
  const fakeDb = {
    from(table) {
      const st = { table, op: 'select', f: {} }
      const api = {
        select() { return api },
        eq(k, v) { st.f[k] = v; return api },
        limit() { ops.push({ ...st }); return Promise.resolve({ data: [], error: null }) },
        insert(p) {
          const dayDir = path.join(rDir, '2026-10-13')
          ops.push({ ...st, op: 'insert', rollbackFirst: fs.existsSync(dayDir) && fs.readdirSync(dayDir).some((f) => f.startsWith('window-discovery-rollback-')), p })
          return { select: () => ({ single: () => Promise.resolve({ data: { id: id(++n), total_collected: 0 }, error: null }) }) }
        },
        update(p) { st.op = 'update'; st.p = p; return api },
        then(res) { ops.push({ ...st }); return Promise.resolve({ data: [{ id: st.f.id }], error: null }).then(res) },
      }
      return api
    },
  }
  const fresh = async () => ({ targets: [anchor, gpAnchor], sources: SOURCES, state: state() })
  const notionDown = async () => ({ ok: false, stage: 'env', error: '토큰 없음', pendingPath: 'ops/state/status-log-pending/x.md' })
  const r = await main([`--in=${inDir}`, `--reports-dir=${rDir}`, `--config=${cfgFile}`], {
    db: fakeDb, loadFresh: fresh, record: notionDown,
    fetchText: async (u) => ({ status: 200, body: u.includes('itunes') ? AS_PAGE1 : '<html></html>' }),
    sleep: async () => {}, now: new Date('2026-10-13T00:00:00Z'), log: quiet,
  })
  const ins = ops.filter((o) => o.op === 'insert')
  t('run: registered 2', r.registered, 2)
  t('run: rollback written before every INSERT', ins.length === 2 && ins.every((o) => o.rollbackFirst), true)
  t('run: insert status active', ins.every((o) => o.p.status === 'active' && o.p.project_id === P), true)
  t('run: notion_unavailable reported', r.notion.startsWith('notion_unavailable'), true)
  const led = JSON.parse(fs.readFileSync(path.join(rDir, 'window-adopted.json'), 'utf8'))
  t('run: ledger ids', led.entries.filter((e) => e.status === 'adopted' && e.id).length, 2)
  t('run: draft sql in reports', fs.readdirSync(path.join(rDir, '2026-10-13')).some((f) => /_window_targets_20261013\.sql$/.test(f)), true)

  // 4일 뒤: 하나는 신규 0(강등), 하나는 수집됨(유지)
  const [e1, e2] = led.entries
  const in2 = path.join(tmp, 'in2')
  fs.cpSync(inDir, in2, { recursive: true })
  const visited = '2026-10-15T00:00:00Z'
  fs.writeFileSync(path.join(in2, 'targets.json'), JSON.stringify([
    anchor, gpAnchor,
    { ...anchor, id: e1.id, product_ref: e1.product_ref, label: e1.label, total_collected: 0, consecutive_empty: 1, last_run_at: visited },
    { ...anchor, id: e2.id, product_ref: e2.product_ref, label: e2.label, total_collected: 40, last_run_at: visited },
  ]))
  ops.length = 0
  const r2 = await main([`--in=${in2}`, `--reports-dir=${rDir}`, `--config=${cfgFile}`], {
    db: fakeDb, loadFresh: fresh, record: async () => ({ ok: true, title: 't' }),
    fetchText: async () => { throw new Error('요청하면 안 된다(창문 전부 대장에 있음)') },
    sleep: async () => {}, now: new Date('2026-10-17T00:00:00Z'), log: quiet,
  })
  t('demote run: demoted 1', r2.demoted, 1)
  t('demote run: update status only', ops.filter((o) => o.op === 'update').map((o) => JSON.stringify(o.p)).join(), '{"status":"exhausted"}')
  t('demote run: rollback file', fs.readdirSync(path.join(rDir, '2026-10-17')).some((f) => f.startsWith('window-demote-rollback-')), true)
  t('demote run: no requests', r2.requests, 0)
  const led2 = JSON.parse(fs.readFileSync(path.join(rDir, 'window-adopted.json'), 'utf8'))
  t('demote run: ledger demoted reason', led2.entries.find((e) => e.id === e1.id).reason, 'demoted')
  t('demote run: ledger kept', led2.entries.find((e) => e.id === e2.id).status, 'kept')
  t('demote run: l4 note', led2.entries.find((e) => e.id === e1.id).l4.startsWith('확인 불가'), true)
}
t('log: waste detected', logBlock({ date: 'd', candidates: 3, adopted: 0, registered: 0, demoted: 0, requests: 4, max_requests: 80, blocked: false, new_total: 0, reasons: { appstore: 'no_adopted' }, alerts: [], files: [] }).includes('낭비 탐지 1'), true)

// ── 11. 정적 검사: 워크플로·스크립트 ──
{
  const yml = fs.readFileSync('.github/workflows/nightly-window-discovery.yml', 'utf8')
  const code = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  const secretsOf = (s) => new Set([...s.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))
  const known = secretsOf(fs.readFileSync('.github/workflows/nightly-review-collect.yml', 'utf8'))
  const mine = [...secretsOf(code)]
  t('workflow: no new secret', mine.filter((s) => !known.has(s)).join(','), '')
  t('workflow: concurrency group', /\nconcurrency:\n\s+group: review-collect\n\s+cancel-in-progress: false/.test(code), true)
  t('workflow: permissions contents read only', /\npermissions:\n\s+contents: read\n\n/.test(code), true)
  t('workflow: no write permission', /:\s*write\b/.test(code), false)
  t('workflow: bot token for push', pushWithoutBotToken('.github/workflows').includes('nightly-window-discovery.yml'), false)
  const cron = /cron:\s*'([^']+)'/.exec(code)[1]
  t('workflow: not a collect slot', COLLECT_SLOTS.includes(cron), false)
  t('workflow: dry_run input', /dry_run:\n\s+description/.test(code), true)
  t('workflow: selftest step', code.includes('node scripts/window-discovery-selftest.mjs'), true)
  const src = fs.readFileSync('scripts/window-discovery.mjs', 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  t('script: no delete', /\.delete\(/.test(src), false)
  t('script: no review_collection_runs write', /from\('review_collection_runs'\)/.test(src), false)
  t('script: no review_sources/ramp write', /from\('review_source/.test(src), false)
  t('script: only review_targets tables', [...src.matchAll(/from\('([a-z_]+)'\)/g)].every((m) => m[1] === 'review_targets'), true)
  t('script: update only status', [...src.matchAll(/\.update\(([^)]*)\)/g)].map((m) => m[1]).join('|'), "{ status: 'exhausted' }")
  const inputs = fs.readFileSync('scripts/window-discovery-inputs.mjs', 'utf8')
  t('inputs: SELECT only', /\.(insert|update|upsert|delete)\(/.test(inputs), false)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`window-discovery selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
