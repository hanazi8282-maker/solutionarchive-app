#!/usr/bin/env node
// 자율 발굴 C-1 ①③ + 보고 블록 셀프테스트. 네트워크·DB 없음 — 가짜 fetch(실제 82cook 픽스처·실제 어댑터 파서)와 읽기 전용 가짜 DB.
//   게시판: slug 추출 · 게이트(약관 금지·공급 제외) · 소스당 하루 5 · 어댑터 미지원=제안만 · 디렉터리 robots 확인 불가면 요청 0 ·
//           0건과 파싱 실패 구분 · 403 즉시 중단 · 요청 간격 ≥3000 · 3일 강등(창문과 같은 규칙) · 초안/롤백 형태
//   이상 반응: 3일 창 · 급증 · 급락 · 표본 부족 · 수집분 0 = 확인 불가
//   오케스트레이터: 드라이런 = 파일·Notion 0 · --write 경계 · 경보 있을 때만 Notion 한 줄(사람판단필요 false) · 쓰기 경로 0(정적)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cook82Adapter } from '../lib/review/adapters/82cook.ts'
import { detect, evaluate, notionLine, watchList, SURGE_MIN } from './adoption-anomaly.mjs'
import {
  boardDemotion, boardGate, discoverBoards, extractSlugs, judgeList, pickCandidates, renderBoardRollback, renderBoardSql, renderDemoteSql, writeOutputs,
} from './board-discovery.mjs'
import { main, reportBlock } from './discovery-c1.mjs'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (Object.is(actual, expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}
const LIST = fs.readFileSync('fixtures/review/82cook/board-list.html', 'utf8')
const BROKEN = fs.readFileSync('fixtures/review/82cook/board-list-broken.html', 'utf8')
const ROBOTS82 = fs.readFileSync('fixtures/review/82cook/robots.txt', 'utf8')
const NOW = new Date('2026-10-12T03:00:00Z')
const DAY = 86_400_000
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PAT = 'enti\\.php\\?bn=(\\d{1,4})'
const DIR = ['15', '31', '7', '2', '3', '4', '8', '9', '10'].map((n) => `<a href="/entiz/enti.php?bn=${n}">x</a>`).join('') + '<a href="enti.php?bn=15&page=2">2</a>'

// ── ① 순수 ─────────────────────────────────
t('slugs: order + dedupe', extractSlugs(DIR, PAT).join(), '15,31,7,2,3,4,8,9,10')
t('slugs: none', extractSlugs('<p>no</p>', PAT).length, 0)
const SRC = { key: '82cook', enabled: true, tos_status: null, robots_status: 'allowed', min_interval_ms: 1000 }
t('gate: ok (tos null)', boardGate(SRC), null)
t('gate: no row', boardGate(undefined), 'review_sources 행 없음')
t('gate: disabled', boardGate({ ...SRC, enabled: false }), 'enabled 아님')
t('gate: prohibited', /약관 금지/.test(boardGate({ ...SRC, tos_status: 'prohibited' })), true)
t('gate: forbids_automation', /약관 금지/.test(boardGate({ ...SRC, tos_status: 'forbids_automation' })), true)
t('gate: supply excluded (danawa)', boardGate({ ...SRC, key: 'danawa' }), '공급 제외 소스')

const pk = pickCandidates(['15', '31', 'abc', '7', '2', '3', '4', '8'], {
  sourceKey: '82cook', adapter: cook82Adapter, existingRefs: new Set(['board:15']), ledgerKeys: new Set(['82cook|board:7']), exclude: ['2'],
})
t('pick: existing skipped', pk.skipped.existing, 1)
t('pick: ledger skipped', pk.skipped.seen_before, 1)
t('pick: excluded', pk.skipped.excluded, 1)
t('pick: adapter_unsupported → suggest', pk.suggest.map((s) => s.slug).join(), 'abc')
t('pick: cap 5 total', pk.probe.length + pk.suggest.length, 5)
t('pick: probe url from adapter', pk.probe[0].url, 'https://www.82cook.com/entiz/enti.php?bn=31')
const pk2 = pickCandidates(['1', '2', '3', '4', '5', '6', '7'], { sourceKey: '82cook', adapter: cook82Adapter, existingRefs: new Set(), ledgerKeys: new Set() })
const pk3 = pickCandidates(['1', '2', '3'], { sourceKey: '82cook', adapter: cook82Adapter, existingRefs: new Set(), ledgerKeys: new Set(), include: ['2'] })
t('pick: include filters', `${pk3.probe.map((p) => p.slug)}/${pk3.skipped.not_included}`, '2/2')
t('pick: 7 slugs → 5 + daily_cap 2', `${pk2.probe.length}/${pk2.skipped.daily_cap}`, '5/2')

t('judge: fixture adopted', judgeList({ status: 200, body: LIST }, cook82Adapter, 'board:31').verdict, 'adopted')
t('judge: fixture posts 6', judgeList({ status: 200, body: LIST }, cook82Adapter, 'board:31').posts, 6)
t('judge: broken = unverified (not empty)', judgeList({ status: 200, body: BROKEN }, cook82Adapter, 'board:31').verdict, 'unverified')
t('judge: 500 = unverified', judgeList({ status: 500, body: 'x' }, cook82Adapter, 'board:31').verdict, 'unverified')

// discoverBoards — 가짜 fetch
const mkFetch = (over = {}) => {
  const asked = []
  const f = async (url) => {
    asked.push(url)
    const u = new URL(url)
    if (over[url]) return over[url]
    if (u.pathname === '/robots.txt') return u.hostname === 'www.82cook.com' ? { status: 200, body: ROBOTS82, finalUrl: url } : { status: 404, body: 'nf', finalUrl: url }
    if (url === 'https://www.82cook.com/entiz/enti.php?bn=15') return { status: 200, body: DIR, finalUrl: url }
    if (u.pathname === '/entiz/enti.php') return { status: 200, body: LIST, finalUrl: url }
    return { status: 404, body: '', finalUrl: url }
  }
  return { f, asked }
}
const CFG = {
  boards: {
    '82cook': { directory: 'https://www.82cook.com/entiz/enti.php?bn=15', slug_pattern: PAT, exclude: ['9'] },
    clien: { directory: 'https://www.clien.net/service/', slug_pattern: '/service/board/([a-z]+)' },
  },
}
const SOURCES = [SRC, { key: 'clien', enabled: true, tos_status: null, robots_status: 'unverified', min_interval_ms: 1000 }]
const TARGETS = ['board:31', 'board:15'].map((ref, i) => ({ id: id(i + 1), source_key: '82cook', product_ref: ref, status: 'active', total_collected: 50, consecutive_empty: 0, created_at: '2026-09-30T00:00:00Z' }))
const sleeps = []
const sleep = async (ms) => { sleeps.push(ms) }
let ff = mkFetch()
const r = await discoverBoards({ cfg: CFG, sources: SOURCES, targets: TARGETS, ledger: { entries: [] }, fetchText: ff.f, sleep })
t('discover: adopted 5 (cap)', r.adopted.length, 5)
t('discover: existing 31 not adopted', r.adopted.some((a) => a.product_ref === 'board:31'), false)
t('discover: clien robots unverified → no clien request', ff.asked.filter((u) => u.includes('clien')).every((u) => u.endsWith('/robots.txt')), true)
t('discover: clien status', r.sources.clien.status, '디렉터리 robots unverified')
t('discover: robots fetched once per URL', ff.asked.filter((u) => u === 'https://www.82cook.com/robots.txt').length, 1)
t('discover: requests = robots 2 + dir 1 + lists 5', r.requests, 8)
t('discover: interval ≥ 3000', sleeps.every((s) => s >= 3000), true)
t('discover: label', r.adopted[0].label, '82cook 7 게시판 순회(자율 발굴)')
ff = mkFetch({ 'https://www.82cook.com/entiz/enti.php?bn=2': { status: 403, body: 'no' } })
const rb = await discoverBoards({ cfg: CFG, sources: SOURCES, targets: TARGETS, ledger: { entries: [] }, fetchText: ff.f, sleep })
t('discover: 403 aborts', rb.aborted, 'blocked:403')
t('discover: no request after block', ff.asked.includes('https://www.82cook.com/entiz/enti.php?bn=3'), false)
ff = mkFetch({ 'https://www.82cook.com/entiz/enti.php?bn=15': { status: 200, body: '<p>nothing</p>' } })
const r0 = await discoverBoards({ cfg: CFG, sources: SOURCES, targets: TARGETS, ledger: { entries: [] }, fetchText: ff.f, sleep })
t('discover: slug 0 = 확인 불가, not success', /확인 불가/.test(r0.sources['82cook'].status), true)
const rg = await discoverBoards({ cfg: CFG, sources: [{ ...SRC, tos_status: 'prohibited' }], targets: [], ledger: { entries: [] }, fetchText: mkFetch().f, sleep })
t('discover: tos prohibited → 0 requests', rg.requests, 0)

// 강등(창문 planDemotion 재사용)
const ledgerD = { entries: [
  { source_key: '82cook', product_ref: 'board:7', status: 'proposed' },
  { source_key: '82cook', product_ref: 'board:2', status: 'proposed' },
  { source_key: '82cook', product_ref: 'board:3', status: 'proposed' },
  { source_key: '82cook', product_ref: 'board:4', status: 'proposed' },
] }
const old = new Date(NOW.getTime() - 4 * DAY).toISOString()
const tD = [
  { id: id(7), source_key: '82cook', product_ref: 'board:7', status: 'active', total_collected: 0, consecutive_empty: 2, created_at: old, last_run_at: NOW.toISOString() },
  { id: id(2), source_key: '82cook', product_ref: 'board:2', status: 'active', total_collected: 4, consecutive_empty: 0, created_at: old, last_run_at: NOW.toISOString() },
  { id: id(3), source_key: '82cook', product_ref: 'board:3', status: 'active', total_collected: 0, consecutive_empty: 0, created_at: old, last_run_at: null },
  { id: id(4), source_key: '82cook', product_ref: 'board:4', status: 'active', total_collected: 0, consecutive_empty: 0, created_at: new Date(NOW.getTime() - DAY).toISOString(), last_run_at: NOW.toISOString() },
]
const dm = boardDemotion(ledgerD, tD, NOW)
t('demote: 3일 뒤 신규 0 → 대상', dm.demote.map((d) => d.target.product_ref).join(), 'board:7')
t('demote: 수집 있음 → 유지', dm.kept.length, 1)
t('demote: 방문 없음 → 확인 불가', dm.unverified.length, 1)
t('demote: ledger id filled', ledgerD.entries[0].id, id(7))
t('demote sql: status only + guards', /SET status = 'exhausted'\s+WHERE id IN \('[^']+'::uuid\) AND status = 'active' AND total_collected = 0/.test(renderDemoteSql(dm.demote, 'n')), true)

// 초안
const rows = [{ source_key: '82cook', product_ref: 'board:7', label: "82cook 7 '게시판'", posts: 6 }]
const sql = renderBoardSql(rows, 'board-targets-x')
t('sql: not exists guard', sql.includes('WHERE NOT EXISTS'), true)
t('sql: quote escaped', sql.includes("'82cook 7 ''게시판'''"), true)
t('sql: no delete/update', /\b(DELETE|UPDATE|DROP|ALTER)\b/.test(sql.split('\n').filter((l) => !l.startsWith('--')).join('\n')), false)
// 디렉터리 자신(bn=15)을 목록으로 읽으면 행 앵커가 없어 실패 — 0건으로 접지 않는다
t('judge: directory html as list = unverified', judgeList({ status: 200, body: DIR }, cook82Adapter, 'board:15').verdict, 'unverified')
t('rollback: delete pairs', renderBoardRollback(rows, 'board-targets-x').includes("DELETE FROM public.review_targets\n WHERE (source_key, product_ref) IN (('82cook', 'board:7'))"), true)
let threw = false
try { renderBoardSql([{ ...rows[0], product_ref: "board:x'; DROP TABLE y;--" }], 'n') } catch { threw = true }
t('sql: bad ref throws', threw, true)

// ── ③ 이상 반응 ─────────────────────────────
const iso = (days) => new Date(NOW.getTime() - days * DAY).toISOString()
const d = (days) => iso(days).slice(0, 10)
const wl = watchList({
  windowLedger: { entries: [
    { status: 'adopted', source_key: 'appstore', product_ref: 'us:1', label: 'A', registered_at: iso(1) },
    { status: 'adopted', source_key: 'appstore', product_ref: 'us:2', label: 'B', registered_at: iso(5) },
    { status: 'demoted', source_key: 'appstore', product_ref: 'us:3', registered_at: iso(1) },
    { status: 'pending', source_key: 'appstore', product_ref: 'us:4' },
  ] },
  boardLedger: { entries: [{ status: 'proposed', source_key: '82cook', product_ref: 'board:7', registered_at: iso(2) }, { status: 'proposed', source_key: '82cook', product_ref: 'board:8' }] },
}, NOW)
t('watch: 3일 이내·adopted/proposed 만', wl.map((w) => w.product_ref).join(), 'us:1,board:7')
const rowsOf = (spec) => spec.flatMap(([days, n, rating = null]) => Array.from({ length: n }, () => ({ written_at: d(days), rating })))
t('detect: surge', detect(rowsOf([[0, 8, 4], [1, 6, 4], [5, 7, 4]]), NOW).state, 'alert')
t('detect: surge min', detect(rowsOf([[0, SURGE_MIN - 1]]), NOW).state, 'ok')
t('detect: steady not surge', detect(rowsOf([[0, 6], [1, 6], ...Array.from({ length: 14 }, (_, i) => [i + 2, 5])]), NOW).state, 'ok')
const drop = detect(rowsOf([[1, 5, 1], [10, 10, 4.5]]), NOW)
t('detect: rating drop', drop.alerts.some((a) => a.startsWith('별점 급락')), true)
t('detect: small sample → note, no alert', detect(rowsOf([[1, 3, 1], [10, 10, 5]]), NOW).notes[0], '별점 표본 부족(최근 3·이전 10)')
t('detect: empty = unverified', detect([], NOW).state, 'unverified')
const ev = evaluate(wl, new Map([['appstore|us:1', rowsOf([[0, 12, 2], [1, 3, 2]])]]), NOW)
t('evaluate: unread target = unverified', ev.find((e) => e.product_ref === 'board:7').state, 'unverified')
t('notion line: alert only', /^이상 반응\(채택 3일 이내\): A — 리뷰 급증/.test(notionLine(ev)), true)
t('notion line: none → null', notionLine([{ state: 'ok' }]), null)

// ── 보고 블록 · 오케스트레이터 ─────────────────
const blk = reportBlock({ date: '2026-10-12', dry: true, lines: ['a', 'b'] })
t('block: header', blk.split('\n')[0], '[자율 발굴 2026-10-12] C-1 (드라이런 — 파일·Notion 0)')
t('block: candidate ledger note', /후보 대장 구조 변경 없음/.test(blk), true)

// 읽기 전용 가짜 DB — select/in/eq/gte/order/limit/range 만. insert/update 가 불리면 TypeError 로 죽는다.
const fakeDb = (tables) => ({
  from(tbl) {
    let rows = [...(tables[tbl] ?? [])]
    const q = {
      select: () => q,
      in: (c, vs) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
      eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), q),
      gte: (c, v) => ((rows = rows.filter((r) => r[c] >= v)), q),
      order: () => q,
      limit: () => q,
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    }
    return q
  },
})
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dc1-'))
fs.writeFileSync(path.join(tmp, 'window-adopted.json'), JSON.stringify({ entries: [{ status: 'adopted', source_key: 'appstore', product_ref: 'us:1', label: 'A', registered_at: iso(1) }] }))
const db = fakeDb({
  review_sources: [{ ...SRC, key: '82cook' }],
  review_targets: TARGETS,
  review_fingerprints: rowsOf([[0, 12], [1, 3]]).map((r, i) => ({ ...r, source_key: 'appstore', product_ref: 'us:1', analysis_input_id: `in${i}` })),
  analysis_inputs: Array.from({ length: 15 }, (_, i) => ({ id: `in${i}`, rating: 2 })),
})
const cfg = { ...JSON.parse(fs.readFileSync('config/discovery-c1.json', 'utf8')), boards: { '82cook': CFG.boards['82cook'] } }
{
  const recs = []
  const dry = await main(['--from-db', `--reports-dir=${tmp}`], { db, cfg, fetchText: mkFetch().f, sleep, now: NOW, log: () => {}, record: async (...a) => (recs.push(a), { ok: true, title: 'x' }) })
  t('main dry: no files', fs.existsSync(path.join(tmp, '2026-10-12')), false)
  t('main dry: no notion', recs.length, 0)
  t('main dry: adopted 5', dry.boards.adopted.length, 5)
  t('main dry: anomaly alert seen', dry.anomalies.filter((a) => a.state === 'alert').length, 1)
  t('main dry: block lines', dry.block.split('\n').length, 5 + 1)
  const wr = await main(['--from-db', '--write', `--reports-dir=${tmp}`], { db, cfg, fetchText: mkFetch().f, sleep, now: NOW, log: () => {}, record: async (...a) => (recs.push(a), { ok: true, title: 'x' }) })
  t('main write: sql + rollback', fs.readdirSync(path.join(tmp, '2026-10-12')).filter((f) => f.startsWith('board-targets-')).length, 2)
  t('main write: ledger proposed 5', JSON.parse(fs.readFileSync(path.join(tmp, 'board-discovery.json'), 'utf8')).entries.filter((e) => e.status === 'proposed').length, 5)
  t('main write: notion once, needsHuman false', recs.length === 1 && recs[0][0].needsHuman === false && recs[0][1].marker === 'adoption-anomaly', true)
  t('main write: block appended', fs.readFileSync(path.join(tmp, '2026-10-12', 'discovery-log-block.md'), 'utf8').includes('[자율 발굴 2026-10-12] C-1'), true)
  t('main write: proposals md', fs.existsSync(path.join(tmp, '2026-10-12', 'store-search-proposals.md')), true)
  t('main write: code 0', wr.code, 0)
  const again = await main(['--from-db', `--reports-dir=${tmp}`], { db, cfg, fetchText: mkFetch().f, sleep, now: NOW, log: () => {} })
  t('main: ledger blocks re-proposal', again.boards.adopted.some((a) => ['board:7', 'board:2', 'board:3', 'board:4', 'board:8'].includes(a.product_ref)), false)
  const off = await main([`--reports-dir=${tmp}`, '--no-network'], { cfg, now: NOW, log: () => {} })
  t('main offline: no db → anomaly unverified', off.anomalies.every((a) => a.state === 'unverified'), true)
}
// writeOutputs 단독: 롤백을 초안보다 먼저 쓴다
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dc1w-'))
const wf = writeOutputs({ result: { adopted: rows, suggested: [{ source_key: 'okky', product_ref: 'board:questions', reason: 'adapter_unsupported' }, { source_key: 'x', product_ref: 'board:y', reason: 'robots unverified' }] }, demote: { demote: [] }, ledger: { entries: [] }, reportsDir: tmp2, date: '2026-10-12', stamp: 's', now: NOW })
t('write: rollback first', path.basename(wf[0]), 'board-targets-s-rollback.sql')
t('write: only adapter_unsupported suggestions kept', JSON.parse(fs.readFileSync(path.join(tmp2, 'board-discovery.json'), 'utf8')).entries.filter((e) => e.status === 'suggested').length, 1)

// 정적: 쓰기 경로 0
for (const f of ['scripts/board-discovery.mjs', 'scripts/adoption-anomaly.mjs', 'scripts/discovery-c1.mjs']) {
  const src = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  t(`static ${f}: no insert/update/upsert/delete call`, /\.(insert|update|upsert|delete)\(/.test(src), false)
  t(`static ${f}: tables read-only whitelist`, [...src.matchAll(/from\('([a-z_]+)'\)/g)].every((m) => ['review_sources', 'review_targets', 'review_fingerprints', 'analysis_inputs'].includes(m[1])), true)
}

fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(tmp2, { recursive: true, force: true })
console.log(`discovery-c1 selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
