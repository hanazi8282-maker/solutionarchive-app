#!/usr/bin/env node
// 창문 프로브·마이그 초안 셀프테스트(v52 §1-2·4). 네트워크 없음 — 가짜 fetch 에 실제 픽스처를 물린다(실제 어댑터 파서 경유).
//   경계면: 입력 타깃 → 호출 URL(어댑터 nextRequest 와 같은가) · 요청 상한 · 차단 즉시 중단 · not_in_store 와 못 읽음 구분 ·
//   중복 대조 · 대장 재제안 방지 · 초안 중복 방지·롤백 형태 · DB/서비스키 참조 없음.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appstoreAdapter } from '../lib/review/adapters/appstore.ts'
import { googleplayAdapter, BATCH_URL } from '../lib/review/adapters/googleplay.ts'
import { computeFingerprint } from '../lib/review/fingerprint.ts'
import {
  buildWindows, requestFor, probeWindows, sourceGate, loadSeen, readLedgerSkip, writeLedger, windowKey, labelFor,
} from './window-probe.mjs'
import { selectRows, renderSql, renderRollback, nextStamp } from './window-migration-draft.mjs'

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
const AS_EMPTY = fs.readFileSync('fixtures/appstore/page-empty.json', 'utf8')
const GP_PAGE1 = fs.readFileSync('fixtures/review/googleplay/page1-real.txt', 'utf8')

const config = {
  appstore: { countries: ['us', 'gb'], sorts: ['mostRecent', 'mostHelpful'] },
  googleplay: { windows: ['gb:en', 'kr:ko'] },
}
const targets = [
  { label: '3:kr|foo', source_key: 'appstore', product_ref: 'kr:123', project_id: 'p1' },
  { label: '3:us|foo', source_key: 'appstore', product_ref: 'us:123', project_id: 'p1' },
  { label: '3:foo', source_key: 'googleplay', product_ref: 'kr:ko:com.foo.app', project_id: 'p1' },
]
const gates = { appstore: { ok: true, intervalMs: 3000 }, googleplay: { ok: true, intervalMs: 5000 } }

// ── 1. 라벨·후보 창문 ──
t('label area kept', labelFor('3:kr|foo', 'gb'), '3:gb|foo')
t('label no pipe', labelFor('01-meeting-notes:granola', 'gb-en'), '01-meeting-notes:gb-en|granola')
t('label no area', labelFor('foo', 'gb'), 'gb|foo')
const wins = buildWindows(targets, config)
const keys = wins.map(windowKey).sort()
t('windows', JSON.stringify(keys), JSON.stringify([
  'appstore|gb:123|mostHelpful', 'appstore|gb:123|mostRecent', 'appstore|kr:123|mostHelpful', 'appstore|us:123|mostHelpful', 'googleplay|gb:en:com.foo.app|newest',
]))
const asGb = wins.find((w) => windowKey(w) === 'appstore|gb:123|mostRecent')
t('appstore gb label', asGb.label, '3:gb|foo')
t('appstore gb anchor', asGb.anchor_ref, 'kr:123')
t('mostHelpful not draftable', wins.find((w) => w.sort === 'mostHelpful').draftable, false)
t('googleplay label', wins.find((w) => w.source_key === 'googleplay').label, '3:gb-en|foo')

// ── 2. 경계면: 입력 타깃 → 호출 URL(어댑터 재사용) ──
const asReq = requestFor(asGb, null)
const adapterUrl = appstoreAdapter.nextRequest({ id: 'x', projectId: 'p1', sourceKey: 'appstore', productRef: 'gb:123', cursor: null, lastReviewAt: null, consecutiveEmpty: 0 }).url
t('appstore url = adapter url', asReq.url, adapterUrl)
t('appstore url literal', asReq.url, 'https://itunes.apple.com/gb/rss/customerreviews/id=123/sortBy=mostRecent/page=1/json')
t('appstore page 2', requestFor(asGb, '1').url.endsWith('/page=2/json'), true)
t('mostHelpful url', requestFor({ ...asGb, sort: 'mostHelpful' }, null).url, 'https://itunes.apple.com/gb/rss/customerreviews/id=123/sortBy=mostHelpful/page=1/json')
const gpWin = wins.find((w) => w.source_key === 'googleplay')
const gpReq = requestFor(gpWin, null)
t('googleplay url', gpReq.url, `${BATCH_URL}?hl=en&gl=gb`)
t('googleplay POST body has pkg', gpReq.init.method === 'POST' && decodeURIComponent(gpReq.init.body).includes('com.foo.app'), true)

// ── 가짜 fetch ──
const fake = (responder) => {
  const calls = []
  return { calls, fetchText: async (url, init) => { calls.push(url); return responder(url, init, calls.length) } }
}
const sleeps = []
const sleep = async (ms) => { sleeps.push(ms) }
const ok = (body) => ({ status: 200, body })

// ── 3. 요청 상한 ──
{
  const many = ['gb', 'ca', 'au', 'in', 'sg'].map((c) => ({ ...asGb, product_ref: `${c}:123`, label: `3:${c}|foo` }))
  const f = fake(() => ok(AS_PAGE1))
  const r = await probeWindows(many, { fetchText: f.fetchText, sleep, gates, maxRequests: 3 })
  t('cap requests', r.requests, 3)
  t('cap fetch calls', f.calls.length, 3)
  t('cap aborted', r.aborted, 'max_requests')
  t('cap recorded', r.windows.length, 3)
  t('no seen → unverified', r.windows[0].verdict, 'unverified')
  t('no seen → new null', r.windows[0].new_count, null)
  t('no seen → 1 request', r.windows[0].requests, 1)
  t('langs counted', Object.values(r.windows[0].langs).reduce((a, b) => a + b, 0), 35)
}

// ── 4. 차단 즉시 전체 중단 ──
for (const [name, blocked] of [['429', { status: 429, body: '' }], ['403', { status: 403, body: 'x' }], ['200 empty', ok('')], ['captcha', ok('<html>unusual traffic recaptcha</html>')]]) {
  const many = ['gb', 'ca', 'au'].map((c) => ({ ...asGb, product_ref: `${c}:123` }))
  const f = fake((u, i, n) => (n === 2 ? blocked : ok(AS_PAGE1)))
  const r = await probeWindows(many, { fetchText: f.fetchText, sleep, gates, maxRequests: 60 })
  t(`block ${name}: calls`, f.calls.length, 2)
  t(`block ${name}: aborted`, r.aborted?.startsWith('blocked:'), true)
  t(`block ${name}: verdict`, r.windows.at(-1).verdict, 'blocked')
}

// ── 5. not_in_store vs 못 읽음 ──
{
  const r = await probeWindows([asGb], { fetchText: fake(() => ok(AS_EMPTY)).fetchText, sleep, gates })
  t('empty feed → not_in_store', r.windows[0].verdict, 'not_in_store')
  const h = await probeWindows([asGb], { fetchText: fake(() => ok('<html><body>sign in</body></html>')).fetchText, sleep, gates })
  t('html 200 → unverified', h.windows[0].verdict, 'unverified')
  t('html 200 → parse failure counted', h.windows[0].parse_failures, 1)
  const e = await probeWindows([asGb], { fetchText: fake(() => ({ status: 500, body: 'x' })).fetchText, sleep, gates })
  t('500 → unverified', e.windows[0].verdict, 'unverified')
  t('500 → not aborted', e.aborted, null)
  const n = await probeWindows([asGb], { fetchText: fake(() => ({ status: null, body: '', error: 'timeout' })).fetchText, sleep, gates })
  t('network → unverified', n.windows[0].verdict, 'unverified')
}

// ── 6. 중복 대조(지문은 probe 와 같은 함수로) ──
{
  const reviews = appstoreAdapter.parse(AS_PAGE1, { productRef: 'gb:123', cursor: null }).reviews
  const fps = reviews.map((r) => computeFingerprint('appstore', 'gb:123', r, true).identityKey)
  const seen30 = loadSeen({ identity_keys: fps.slice(0, 30), content_hashes: [] })
  const a = await probeWindows([asGb], { fetchText: fake(() => ok(AS_PAGE1)).fetchText, sleep, gates, seen: seen30, threshold: 5 })
  t('seen 30/35 → new 5', a.windows[0].new_count, 5)
  t('seen 30/35 → adopted', a.windows[0].verdict, 'adopted')
  t('adopted with 1 request', a.windows[0].requests, 1)
  const f = fake((u) => ok(u.includes('page=1') ? AS_PAGE1 : AS_EMPTY))
  const b = await probeWindows([asGb], { fetchText: f.fetchText, sleep, gates, seen: loadSeen(fps), threshold: 5 })
  t('all seen → page 2 tried', b.windows[0].requests, 2)
  t('all seen → rejected', b.windows[0].verdict, 'rejected')
  t('all seen → per request 0', b.windows[0].new_per_request, 0)
  // 같은 앱 정렬 창문: 정렬만 다를 뿐 지문 키는 같아야 한다(product_ref 에 정렬을 넣지 않음).
  const hs = await probeWindows([{ ...asGb, sort: 'mostHelpful' }], { fetchText: fake(() => ok(AS_PAGE1)).fetchText, sleep, gates, seen: loadSeen(fps), threshold: 5 })
  t('mostHelpful seen matches', hs.windows[0].seen_count, 35)
  // 구글 플레이 실응답 픽스처
  const g = await probeWindows([gpWin], { fetchText: fake(() => ok(GP_PAGE1)).fetchText, sleep, gates })
  t('googleplay parsed', g.windows[0].parsed, 3)
  t('googleplay unverified w/o seen', g.windows[0].verdict, 'unverified')
}

// ── 7. 예의 간격 ──
{
  sleeps.length = 0
  const two = [asGb, { ...asGb, product_ref: 'ca:123' }, gpWin]
  await probeWindows(two, { fetchText: fake((u) => ok(u.startsWith(BATCH_URL) ? GP_PAGE1 : AS_PAGE1)).fetchText, sleep, gates })
  t('sleep only between same-source requests', JSON.stringify(sleeps), JSON.stringify([3000]))
}

// ── 8. 소스 게이트(fail-closed) ──
t('gate missing', sourceGate([], 'appstore', 0).ok, false)
t('gate disabled', sourceGate([{ key: 'appstore', enabled: false, override: 'owner_2026-10-05', robots_status: 'disallowed', min_interval_ms: 1000 }], 'appstore', 0).ok, false)
t('gate bad override', sourceGate([{ key: 'appstore', enabled: true, override: 'owner_2099', robots_status: 'disallowed', min_interval_ms: 1000 }], 'appstore', 0).ok, false)
t('gate unverified robots', sourceGate([{ key: 'appstore', enabled: true, override: 'owner_2026-10-05', robots_status: 'unverified', min_interval_ms: 1000 }], 'appstore', 0).ok, false)
t('gate ok interval floor', sourceGate([{ key: 'appstore', enabled: true, override: 'owner_2026-10-05', robots_status: 'disallowed', min_interval_ms: 1000 }], 'appstore', 3000).intervalMs, 3000)
{
  const r = await probeWindows([asGb], { fetchText: fake(() => ok(AS_PAGE1)).fetchText, sleep, gates: { appstore: { ok: false } } })
  t('closed gate → 0 requests', r.requests, 0)
}

// ── 9. 대장 재제안 방지 ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'window-probe-'))
{
  const result = {
    requests: 3, aborted: 'blocked:429',
    windows: [
      { key: 'appstore|gb:123|mostRecent', verdict: 'rejected' },
      { key: 'appstore|us:123|mostHelpful', verdict: 'not_in_store' },
      { key: 'googleplay|gb:en:com.foo.app|newest', verdict: 'blocked' },
    ],
  }
  const f = writeLedger(tmp, '2026-10-12', result, { at: 'x' })
  writeLedger(tmp, '2026-10-12', { requests: 1, aborted: null, windows: [{ key: 'appstore|gb:123|mostHelpful', verdict: 'unverified' }] }, { at: 'y' })
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'))
  t('ledger merged', doc.windows.length, 4)
  t('ledger runs', doc.runs.length, 2)
  const skip = readLedgerSkip(tmp)
  t('skip excludes blocked', skip.has('googleplay|gb:en:com.foo.app|newest'), false)
  const again = buildWindows(targets, config, skip).map(windowKey)
  t('re-run skips ledgered, keeps blocked', JSON.stringify(again), JSON.stringify(['appstore|kr:123|mostHelpful', 'googleplay|gb:en:com.foo.app|newest']))
}

// ── 10. 마이그 초안 ──
{
  const base = { source_key: 'appstore', product_ref: 'gb:123', anchor_ref: 'kr:123', label: '3:gb|foo', new_per_request: 7, draftable: true }
  const ledger = {
    windows: [
      { ...base, key: 'a', verdict: 'adopted' },
      { ...base, key: 'a2', verdict: 'adopted' }, // 같은 (source_key, product_ref) 중복
      { ...base, key: 'h', verdict: 'adopted', sort: 'mostHelpful', draftable: false },
      { ...base, key: 'r', product_ref: 'ca:123', verdict: 'rejected' },
      { key: 'g', source_key: 'googleplay', product_ref: 'gb:en:com.foo.app', anchor_ref: 'kr:ko:com.foo.app', label: "3:gb-en|o'foo", new_per_request: 9, verdict: 'adopted', draftable: true },
    ],
  }
  const rows = selectRows(ledger)
  t('draft rows', rows.length, 2)
  const sql = renderSql(rows, { name: '20261012000010_window_targets_20261012', ledgerPath: 'reports/2026-10-12/window-probe.json', rollbackName: 'rb.sql' })
  t('sql unapplied header', sql.includes('미적용'), true)
  t('sql NOT EXISTS', sql.includes('WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = n.source_key AND t.product_ref = n.product_ref)'), true)
  t('sql no DELETE', /\bDELETE\b/i.test(sql.replace(/--[^\n]*/g, '')), false)
  t('sql no uuid literal', /[0-9a-f]{8}-[0-9a-f]{4}-/.test(sql), false)
  t('sql quote escaped', sql.includes("'3:gb-en|o''foo'"), true)
  t('sql values not swallowed by comments', (sql.match(/^ {2}\('(appstore|googleplay)'/gm) ?? []).length, 2)
  t('sql frozen guard', sql.includes('동결선 80'), true)
  const rb = renderRollback(rows, { name: 'x' })
  t('rollback failed only', rb.includes("SET status = 'failed'"), true)
  t('rollback no DELETE', /\bDELETE\b/i.test(rb.replace(/--[^\n]*/g, '')), false)
  t('rollback exact triple match', rb.includes('t.label = r.label'), true)
  t('rollback no LIKE', /\bLIKE\b/.test(rb.replace(/--[^\n]*/g, '')), false)
  t('stamp next', nextStamp(['20261012000070_x.sql', '20261012000010_y.sql', '20261011000090_z.sql'], '20261012'), '20261012000080')
  t('stamp first', nextStamp([], '20261012'), '20261012000010')
  let threw = false
  try {
    selectRows({ windows: [{ ...base, verdict: 'adopted', product_ref: 'gb:abc' }] })
  } catch {
    threw = true
  }
  t('bad ref throws', threw, true)
}

// ── 11. 정적: DB·서비스키 없음, 어댑터 재사용(새 파서 없음) ──
for (const f of ['scripts/window-probe.mjs', 'scripts/window-migration-draft.mjs']) {
  const src = fs.readFileSync(f, 'utf8')
  t(`${f} no service key`, /SERVICE_ROLE|createClient|supabase-js/.test(src), false)
  t(`${f} no JSON.parse of review bodies`, /JSON\.parse\(res\.body|feed\.entry/.test(src), false)
}
t('googleplay adapter reused', googleplayAdapter.key, 'googleplay')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`window-probe selftest: ${pass} pass / ${fail} fail`)
if (fail) process.exit(1)
