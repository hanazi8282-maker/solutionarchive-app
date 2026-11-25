#!/usr/bin/env node
// 사례 풀 로컬 사본(v71ek 1) 셀프테스트 — 가짜 DB. 모델·네트워크 없음.   node scripts/solution-pool-cache-selftest.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.SOLUTION_PIPELINE_NO_MAIN = '1'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-'))
process.argv.push('--out', dir)
const { loadPool } = await import('./solution-pipeline.mjs')

const eps = Array.from({ length: 2345 }, (_, i) => ({ id: `e${String(i).padStart(5, '0')}`, slug: `s${i % 7}`, chapter: 1, adversity_ko: '어려움' + i, action_ko: '행동', result_ko: '결과', result_class: 'positive', result_grain: 'qual', evidence_strength: 'B', quote_orig: 'q', condition_ko: null, created_at: '2026-11-01T00:00:00Z' }))
const labels = Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, slug: `s${i}`, domain: 'd', customer: 'smb', stage: 'growing', created_at: '2026-11-01T00:00:00Z' }))
const db = { ss_episode_tags_current: eps, ss_story_labels_current: labels, case_signal_labels_v06: [] }
// 실제 표의 시각 컬럼(마이그 20261118000005 · 20261125000001). 없는 컬럼을 부르면 실제 API 처럼 오류를 낸다.
const TIME_COL = { ss_episode_tags_current: 'created_at', ss_story_labels_current: 'created_at', case_signal_labels_v06: 'labeled_at' }
const stats = { rows: 0, bytes: 0, sigError: false }
const sb = { from(table) {
  let cols = '', counted = false, bad = false
  const done = (rows, extra = {}) => { const data = rows.map((r) => Object.fromEntries(cols.split(',').map((c) => [c.trim(), r[c.trim()] ?? null]))); stats.rows += data.length; stats.bytes += JSON.stringify(data).length; return Promise.resolve({ data, error: null, ...extra }) }
  const q = {
    select(c, o) { cols = c; counted = o?.count === 'exact'; return q },
    order(col, o) { bad = /_at$/.test(col) && col !== TIME_COL[table]; q.sorted = [...db[table]].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (o?.ascending === false ? -1 : 1)); return q },
    limit(n) { if (bad || (stats.sigError && table === 'case_signal_labels_v06')) return Promise.resolve({ data: null, count: null, error: { message: 'x' } }); return done(q.sorted.slice(0, n), counted ? { count: db[table].length } : {}) },
    range(a, b) { if (stats.sigError && table === 'case_signal_labels_v06') return Promise.resolve({ data: null, error: { message: 'x' } }); return done(q.sorted.slice(a, b + 1)) },
  }
  return q
} }
const cacheFile = path.join(dir, 'pool.json')
const run = async (o = {}) => { stats.rows = 0; stats.bytes = 0; const pool = await loadPool(sb, { cacheFile, refresh: false, ...o }); return { pool, rows: stats.rows, bytes: stats.bytes } }
let pass = 0, fail = 0
const t = async (n, f) => { try { await f(); pass++ } catch (e) { fail++; console.error('✗', n, '\n  ', e.message.split('\n')[0]) } }
let first
await t('첫 실행은 전부 읽고 사본을 만든다', async () => { first = await run(); assert.equal(first.pool.length, 2345); assert.ok(first.rows >= 2345 + 7); assert.ok(fs.existsSync(cacheFile)) })
await t('두 번째 실행은 확인 조회만(행 2개) 하고 같은 결과', async () => { const r = await run(); assert.deepEqual(r.pool, first.pool); assert.equal(r.rows, 2); assert.ok(r.bytes < 200, String(r.bytes)); console.log(`  전송(가짜 DB): 첫 ${first.bytes}B → 다음 ${r.bytes}B`) })
await t('행이 늘면 다시 읽는다', async () => { eps.push({ ...eps[0], id: 'e99999', created_at: '2026-11-02T00:00:00Z' }); const r = await run(); assert.equal(r.pool.length, 2346); assert.ok(r.rows > 2000) })
await t('--refresh-pool 은 사본을 무시한다', async () => { const r = await run({ refresh: true }); assert.ok(r.rows > 2000) })
await t('24시간이 지나면 다시 읽는다', async () => { const r = await run({ now: Date.now() + 25 * 3600 * 1000 }); assert.ok(r.rows > 2000) })
await t('깨진 사본은 다시 읽는다', async () => { fs.writeFileSync(cacheFile, '{'); const r = await run(); assert.equal(r.pool.length, 2346); assert.ok(r.rows > 2000) })
await t('확인 조회가 실패하면 사본을 쓰지도 만들지도 않는다', async () => { fs.rmSync(cacheFile); stats.sigError = true; const r = await run(); assert.equal(r.pool.length, 2346); assert.ok(!fs.existsSync(cacheFile)); stats.sigError = false })
fs.rmSync(dir, { recursive: true, force: true })
console.log(`solution-pool-cache selftest: ${pass} pass · ${fail} fail`); process.exit(fail ? 1 : 0)
