#!/usr/bin/env node
// 창문 자율 발굴 — 매일 1회(남헌 v53 §5 2-A, .github/workflows/nightly-window-discovery.yml).
//
// 순서: (0) 3일 지난 등재 창문 평가·강등 → (1) 앱스토어 프로브 → (2) 구글 플레이 프로브(동결·차단·cap_base 정상일 때만)
//       → (3) 채택 창문 마이그 초안 + 롤백을 reports/<KST>/ 에 → (4) 자동 등재(review_targets INSERT) → 로그 블록·Notion.
//
// 권한 경계(CLAUDE.md §10.1 "발굴 적재" 창문 자동 등재 · "창문 강등"):
//   등재 = review_targets INSERT 만. enabled ∧ 소유자 예외 소스, 소스당 하루 DISCOVERY_TARGET_MAX(5), 같은 (source_key, product_ref) 금지,
//          앵커(같은 소스·같은 앱의 기존 타깃)가 있는 다른 국가 창문만, 30% 게이트·googleplay 80 동결(gateHeadroom) 안.
//          롤백 SQL 을 INSERT 전에 reports/ 에 쓰고 되읽는다 — 못 쓰면 INSERT 0.
//   강등 = 이 워크플로가 등재한 행(reports/window-adopted.json 의 id)만, status 하나(active→exhausted), 롤백 SQL 먼저.
//   그 밖의 UPDATE·DELETE·review_sources/ramp 쓰기 없음. review_collection_runs 에 행을 남기지 않는다(zero-request 감시와 무관).
//
//   node scripts/window-discovery.mjs --in=<inputs dir> [--max-requests=80] [--dry-run] [--reports-dir=reports] [--config=config/window-probe.json]
//   --dry-run: 프로브까지 하고(요청은 간다) DB 쓰기·Notion 0. 대장·초안 파일은 쓴다(워크플로가 커밋하지 않는다).
// 종료 코드: 0 · 1(DB/파일 실패) · 3(차단 신호로 중단 — 확인 대상, §7.2)

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseProductRef as appstoreRef } from '../lib/review/adapters/appstore.ts'
import { parseProductRef as googleplayRef } from '../lib/review/adapters/googleplay.ts'
import { areaOf, DISCOVERY_TARGET_MAX, gateHeadroom } from '../lib/review/target-supply.ts'
import { appendRejects, rejectLine } from './gate-reject-log.mjs'
import { buildWindows, kstDate, loadSeen, probeWindows, readLedgerSkip, realFetch, sourceGate, windowKey, writeLedger } from './window-probe.mjs'
import { renderRollback, renderSql } from './window-migration-draft.mjs'

export const DEFAULT_MAX_REQUESTS = 80
// 리포 변수 WINDOW_MAX_REQUESTS 로 80→120→160 단계 상향(v71ab C-3). 오타(1600 등)가 그대로 요청이 되지 않게 천장을 둔다.
export const MAX_REQUESTS_CEILING = 160
export const DEMOTE_AFTER_DAYS = 3
export const ADOPTED_LEDGER = 'window-adopted.json'
export const L4_NOTE = '확인 불가 — 타깃별 요청 수 칸 없음(review_targets), 신규 글 수(total_collected 증가)로 대체'
const DAY_MS = 86_400_000
const STAGES = ['appstore', 'googleplay']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const appOf = (sourceKey, ref) => (sourceKey === 'appstore' ? appstoreRef(ref)?.appId : sourceKey === 'googleplay' ? googleplayRef(ref)?.pkg : null) ?? null

// ── 순서 ─────────────────────────────────────────────

/** 앵커별 마지막 프로브 시각(모든 대장). `<source>|<anchor_ref>` → ISO. */
export function lastProbeByAnchor(reportsDir) {
  const out = {}
  if (!fs.existsSync(reportsDir)) return out
  for (const d of fs.readdirSync(reportsDir)) {
    const f = path.join(reportsDir, d, 'window-probe.json')
    if (!fs.existsSync(f)) continue
    for (const w of JSON.parse(fs.readFileSync(f, 'utf8')).windows ?? []) {
      const k = `${w.source_key}|${w.anchor_ref}`
      if (w.probed_at && (!out[k] || w.probed_at > out[k])) out[k] = w.probed_at
    }
  }
  return out
}

/** 앵커 순서: 영역 ①~⑤ 결손(minimum − active) 큰 순 → 마지막 프로브 오래된 순(안 본 것 먼저) → id. 영역 없는 라벨은 뒤. */
export function orderAnchors(targets, areas, lastProbe) {
  const deficit = (t) => {
    const a = areas?.[areaOf(t.label)]
    return a ? a.minimum - a.active : -Infinity
  }
  return [...targets].sort(
    (a, b) =>
      deficit(b) - deficit(a) ||
      String(lastProbe[`${a.source_key}|${a.product_ref}`] ?? '').localeCompare(String(lastProbe[`${b.source_key}|${b.product_ref}`] ?? '')) ||
      String(a.id).localeCompare(String(b.id)),
  )
}

// ── 게이트 ─────────────────────────────────────────────

/** 오늘 이 소스를 프로브해도 되나. 못 읽은 것은 막는다(fail-closed). 반환 { ok, reason }. */
export function stageGate(sourceKey, { sources, state, now, registeredToday = 0 }) {
  const g = sourceGate(sources, sourceKey, 0)
  if (!g.ok) return { ok: false, reason: 'gate_blocked', detail: g.reason }
  if (!state?.ramp) return { ok: false, reason: 'ramp_unverified', detail: 'review_source_ramp 확인 불가' }
  const ramp = state.ramp[sourceKey]
  if (ramp?.frozen_until && Date.parse(ramp.frozen_until) > now.getTime()) return { ok: false, reason: 'frozen', detail: `frozen_until ${ramp.frozen_until}` }
  if (sourceKey === 'googleplay' && !(typeof ramp?.cap_base === 'number' && ramp.cap_base > 0)) return { ok: false, reason: 'cap_base_missing', detail: `cap_base ${ramp?.cap_base ?? 'null'}` }
  if (!state.blocked_72h || !state.running) return { ok: false, reason: 'block_history_unverified', detail: 'review_collection_runs 확인 불가' }
  if ((state.blocked_72h[sourceKey] ?? 0) > 0) return { ok: false, reason: 'blocked_recent', detail: `72h 차단 응답 ${state.blocked_72h[sourceKey]}` }
  if (state.running.includes(sourceKey)) return { ok: false, reason: 'collect_running', detail: '수집 실행 중' }
  const s = state.sources?.[sourceKey]
  if (!s) return { ok: false, reason: 'gate_blocked', detail: '공급 행 없음' }
  if (s.gate_headroom <= 0) return { ok: false, reason: 'gate_blocked', detail: `게이트 여유 0(active ${s.active})` }
  if (registeredToday >= DISCOVERY_TARGET_MAX) return { ok: false, reason: 'daily_cap', detail: `오늘 등재 ${registeredToday}/${DISCOVERY_TARGET_MAX}` }
  return { ok: true, reason: null, intervalMs: g.intervalMs }
}

// ── 등재 계획(순수) ─────────────────────────────────────

/**
 * 후보(채택 창문) → 넣을 행. 하나라도 어기면 그 후보는 빠지고 사유가 남는다.
 * 소스별 상한 = min(5 − 오늘 이미 등재, gateHeadroom(30% 게이트 ∧ googleplay 80)). 순서 = 요청당 새 글 큰 순.
 */
export function planRegistration(cands, { targets, sources, state, registeredToday = {} }) {
  const exists = new Set(targets.map((t) => `${t.source_key}|${t.product_ref}`))
  const rows = []
  const skipped = []
  const used = {}
  const totalActive = state?.total_active ?? 0
  const sorted = [...cands].sort((a, b) => (b.new_per_request ?? 0) - (a.new_per_request ?? 0) || windowKey(a).localeCompare(windowKey(b)))
  for (const c of sorted) {
    const k = `${c.source_key}|${c.product_ref}`
    const skip = (reason) => skipped.push({ key: k, reason })
    if (!STAGES.includes(c.source_key)) { skip('gate_blocked'); continue }
    if (c.draftable !== true) { skip('not_draftable'); continue }
    if (!sourceGate(sources, c.source_key, 0).ok) { skip('gate_blocked'); continue }
    if (exists.has(k)) { skip('duplicate'); continue }
    const anchors = targets.filter((t) => t.source_key === c.source_key && t.product_ref === c.anchor_ref)
    if (anchors.length !== 1) { skip(anchors.length ? 'anchor_ambiguous' : 'no_anchor'); continue }
    const app = appOf(c.source_key, c.product_ref)
    if (!app || app !== appOf(c.source_key, c.anchor_ref)) { skip('not_same_app'); continue }
    if (typeof c.label !== 'string' || !/^[^\\\r\n]{1,200}$/.test(c.label)) { skip('bad_label'); continue }
    const s = state?.sources?.[c.source_key]
    const headroom = s ? gateHeadroom(c.source_key, s.active, totalActive) : 0
    const n = used[c.source_key] ?? 0
    if (n >= headroom) { skipped.push({ key: k, reason: 'gate_blocked', gate: { source: c.source_key, active: s?.active ?? null, total_active: totalActive, headroom, new_per_request: c.new_per_request ?? null } }); continue }
    if (n + (registeredToday[c.source_key] ?? 0) >= DISCOVERY_TARGET_MAX) { skip('daily_cap'); continue }
    used[c.source_key] = n + 1
    exists.add(k)
    rows.push({
      source_key: c.source_key, product_ref: c.product_ref, label: c.label, anchor_ref: c.anchor_ref,
      project_id: anchors[0].project_id, new_per_request: c.new_per_request ?? null, window_key: windowKey(c),
    })
  }
  return { rows, skipped }
}

/** INSERT 한 행 — 초안 SQL(renderSql) 과 같은 칸·같은 값. */
export const insertPayload = (r) => ({ project_id: r.project_id, source_key: r.source_key, product_ref: r.product_ref, label: r.label, status: 'active', cursor: null, last_run_at: null })

// ── 강등(순수) ─────────────────────────────────────────

/**
 * 등재 후 3일 지난 'adopted' 항목 평가. 신규 0(total_collected 가 등재 때 기준값 그대로)이면 강등 대상.
 * 등재 뒤 방문이 없으면(last_run_at 없음·등재 전) 평가 불가 — 강등하지 않는다(§7.1).
 * 반환 { demote: [{entry, target}], kept: [entry], unverified: [{entry, why}] }
 */
export function planDemotion(entries, targets, now) {
  const byId = new Map(targets.map((t) => [t.id, t]))
  const out = { demote: [], kept: [], unverified: [] }
  for (const e of entries) {
    if (e.status !== 'adopted' || !e.id) continue
    if (now.getTime() - Date.parse(e.registered_at) < DEMOTE_AFTER_DAYS * DAY_MS) continue
    const t = byId.get(e.id)
    if (!t) { out.unverified.push({ entry: e, why: '행 없음(삭제·조회 밖)' }); continue }
    if (t.status !== 'active') { out.unverified.push({ entry: e, why: `이미 ${t.status}` }); continue }
    if (!t.last_run_at || Date.parse(t.last_run_at) <= Date.parse(e.registered_at)) { out.unverified.push({ entry: e, why: '등재 뒤 방문 없음' }); continue }
    if (Number(t.total_collected ?? 0) - Number(e.baseline_total_collected ?? 0) === 0) out.demote.push({ entry: e, target: t })
    else out.kept.push(e)
  }
  return out
}

export function demotionRollbackSql(rows, stamp) {
  for (const r of rows) {
    if (!UUID.test(r.id)) throw new Error(`id 형식 아님: ${r.id}`)
    if (!Number.isInteger(r.prev_consecutive_empty)) throw new Error(`consecutive_empty 형식 아님: ${r.prev_consecutive_empty}`)
  }
  if (rows.length === 0) return `-- window-discovery 강등 롤백 ${stamp} — 대상 0행.\n`
  return [
    `-- window-discovery 강등 롤백 ${stamp} — ${rows.length}행. scripts/window-discovery.mjs 가 UPDATE 전에 썼다.`,
    '-- 강등(active→exhausted)만 되돌린다. 그새 다시 active 가 된 행은 건드리지 않는다.',
    'BEGIN;',
    'UPDATE public.review_targets t',
    "   SET status = 'active', consecutive_empty = v.prev_ce",
    '  FROM (VALUES',
    rows.map((r) => `  ('${r.id}'::uuid, ${r.prev_consecutive_empty})`).join(',\n'),
    '  ) AS v(id, prev_ce)',
    " WHERE t.id = v.id AND t.status = 'exhausted';",
    'COMMIT;',
    '',
  ].join('\n')
}

// ── 로그 블록(순수) ────────────────────────────────────

export function logBlock(r) {
  const waste = r.requests > 0 && r.new_total === 0 ? 1 : 0
  const reasons = Object.entries(r.reasons).map(([k, v]) => `${k}=${v}`).join(' · ') || '없음'
  return [
    `[자율 발굴 ${r.date}]${r.dry ? ' (dry-run · DB 쓰기 0)' : ''}`,
    `후보 ${r.candidates} · 채택 ${r.adopted} · 등재 ${r.registered} · 강등 ${r.demoted} · 요청 ${r.requests}/${r.max_requests} · 차단 ${r.blocked ? 1 : 0} · 낭비 탐지 ${waste}${waste ? '(요청 대비 신규 0)' : ''}`,
    `사유: ${reasons}`,
    ...(r.alerts.length ? [`경보: ${r.alerts.join(' / ')}`] : []),
    ...(r.files.length ? [`파일: ${r.files.join(', ')}`] : []),
  ].join('\n')
}

// ── 파일·DB ──────────────────────────────────────────

function writeVerified(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
  if (fs.readFileSync(file, 'utf8') !== body) throw new Error(`파일 되읽기 불일치: ${file}`)
}

export function readAdopted(reportsDir) {
  const f = path.join(reportsDir, ADOPTED_LEDGER)
  if (!fs.existsSync(f)) return { _comment: '창문 자율 발굴 등재 대장(scripts/window-discovery.mjs). status adopted|demoted|pending. 새 DDL 없음.', entries: [] }
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}

/**
 * 등재 — 행마다 직전에 중복을 다시 본다(입력 파일 이후 바뀐 것). INSERT 만 부른다.
 * 오류는 던지지 않고 첫 오류에서 멈춰 돌려준다 — 이미 넣은 행을 대장에 남겨야 강등·롤백이 그 행을 안다.
 */
export async function insertRows(sb, rows) {
  const inserted = []
  const skipped = []
  for (const r of rows) {
    const { data: dup, error: dupErr } = await sb.from('review_targets').select('id').eq('source_key', r.source_key).eq('product_ref', r.product_ref).limit(1)
    if (dupErr) return { inserted, skipped, error: `중복 확인 실패(${r.window_key}): ${dupErr.message}` }
    if (dup.length) { skipped.push({ key: `${r.source_key}|${r.product_ref}`, reason: 'duplicate' }); continue }
    const { data, error } = await sb.from('review_targets').insert(insertPayload(r)).select('id, total_collected').single()
    if (error) return { inserted, skipped, error: `INSERT 실패(${r.window_key}): ${error.message}` }
    inserted.push({ ...r, id: data.id, baseline_total_collected: Number(data.total_collected ?? 0) })
  }
  return { inserted, skipped, error: null }
}

/** 강등 — 조건을 다시 건다(그새 바뀐 행은 안 건드린다). status 한 칸만. 첫 오류에서 멈추고 그때까지 바뀐 id 를 돌려준다. */
export async function demoteRows(sb, items) {
  const done = []
  for (const { entry, target } of items) {
    const { data, error } = await sb
      .from('review_targets')
      .update({ status: 'exhausted' })
      .eq('id', target.id)
      .eq('status', 'active')
      .eq('total_collected', target.total_collected)
      .select('id')
    if (error) return { done, error: `강등 UPDATE 실패(${target.id}): ${error.message}` }
    if (data.length) done.push(entry.id)
  }
  return { done, error: null }
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

export async function main(argv, { db = null, fetchText = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = new Date(), log = console.log, record = null, loadFresh = null } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const dry = argv.includes('--dry-run')
  const inDir = opt('in')
  if (!inDir) throw new Error('--in=<window-discovery-inputs 출력 폴더> 필요')
  const reportsDir = opt('reports-dir') ?? 'reports'
  const maxRequests = Number(opt('max-requests') ?? DEFAULT_MAX_REQUESTS)
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > MAX_REQUESTS_CEILING) throw new Error(`--max-requests 는 1~${MAX_REQUESTS_CEILING} 정수여야 한다: ${opt('max-requests')}`)
  const config = readJson(opt('config') ?? 'config/window-probe.json')
  const date = kstDate(now.getTime())
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
  const dayDir = path.join(reportsDir, date)

  const targets = readJson(path.join(inDir, 'targets.json'))
  const sources = readJson(path.join(inDir, 'sources.json'))
  const seen = loadSeen(readJson(path.join(inDir, 'seen.json')))
  const state = readJson(path.join(inDir, 'state.json'))
  const ledger = readAdopted(reportsDir)
  const reasons = {}
  const alerts = []
  let dbError = null
  const files = []
  const writeFile = (f, body) => { writeVerified(f, body); files.push(f.replace(/\\/g, '/')) }
  const sb = dry ? null : db ?? (await (await import('./target-supply.mjs')).openDb())

  // (0) 강등 평가 — 3일 지난 등재 행
  const dem = planDemotion(ledger.entries, targets, now)
  let demoted = 0
  for (const u of dem.unverified) log(`강등 평가 확인 불가: ${u.entry.id} — ${u.why}`)
  for (const e of dem.kept) Object.assign(e, { evaluated_at: now.toISOString(), status: 'kept' })
  if (dem.demote.length) {
    const rb = dem.demote.map(({ target }) => ({ id: target.id, prev_consecutive_empty: target.consecutive_empty }))
    if (dry) log(`dry-run: 강등 대상 ${dem.demote.length}건 — 쓰지 않는다`)
    else {
      writeFile(path.join(dayDir, `window-demote-rollback-${stamp}.sql`), demotionRollbackSql(rb, stamp))
      const d = await demoteRows(sb, dem.demote)
      if (d.error) { dbError = d.error; alerts.push(d.error) }
      const ok = new Set(d.done)
      for (const { entry } of dem.demote) {
        if (!ok.has(entry.id)) continue
        Object.assign(entry, { status: 'demoted', demoted_at: now.toISOString(), reason: 'demoted', l4: L4_NOTE })
        demoted++
      }
    }
  }

  // (1)(2) 프로브 — 앱스토어 먼저, 구글 플레이는 별 단계
  const registeredToday = {}
  for (const e of ledger.entries) if (e.id && kstDate(Date.parse(e.registered_at)) === date) registeredToday[e.source_key] = (registeredToday[e.source_key] ?? 0) + 1
  const skip = readLedgerSkip(reportsDir)
  const ordered = orderAnchors(targets, state.areas, lastProbeByAnchor(reportsDir))
  const all = buildWindows(ordered, config, skip).filter((w) => w.draftable)
  const probed = []
  let requests = 0
  let blocked = false
  for (const src of STAGES) {
    const wins = all.filter((w) => w.source_key === src)
    if (blocked) { reasons[src] = 'blocked'; continue }
    if (wins.length === 0) { reasons[src] = 'no_new_candidates'; continue }
    const g = stageGate(src, { sources, state, now, registeredToday: registeredToday[src] ?? 0 })
    if (!g.ok) { reasons[src] = g.reason; log(`${src} 건너뜀: ${g.reason} — ${g.detail}`); continue }
    const budget = maxRequests - requests
    if (budget <= 0) { reasons[src] = 'quota'; continue }
    const res = await probeWindows(wins, {
      fetchText: fetchText ?? realFetch,
      sleep, gates: { [src]: { ok: true, intervalMs: Math.max(g.intervalMs, config.min_interval_ms_floor ?? 0) } },
      seen, maxRequests: budget, threshold: config.adopt_min_new_per_request ?? 5,
    })
    requests += res.requests
    probed.push(...res.windows)
    const f = writeLedger(reportsDir, date, res, { at: now.toISOString(), stage: src, max_requests: budget, seen: seen.size, by: 'window-discovery' })
    if (!files.includes(f.replace(/\\/g, '/'))) files.push(f.replace(/\\/g, '/'))
    if (res.aborted?.startsWith('blocked')) { blocked = true; reasons[src] = 'blocked'; alerts.push(`${src} 차단 신호(${res.aborted}) — 전체 중단`) }
    else if (res.aborted === 'max_requests') reasons[src] = 'quota'
    else if (!res.windows.some((w) => w.verdict === 'adopted')) reasons[src] = 'no_adopted'
  }

  // (3) 채택 창문 + 이전에 게이트로 밀린 pending → 등재 계획, 초안·롤백을 reports/ 에
  const adoptedToday = probed.filter((w) => w.verdict === 'adopted' && w.draftable)
  const pending = ledger.entries.filter((e) => e.status === 'pending')
  const cands = [...adoptedToday, ...pending.map((e) => ({ ...e, draftable: true }))]
  const plan = planRegistration(cands, { targets, sources, state, registeredToday })
  // v71ap: 30% 게이트가 막은 후보를 한 줄씩 남긴다(기록만 — 게이트 로직 불변). 집계 = scripts/gate-reject-log.mjs
  if (!dry) appendRejects(dayDir, plan.skipped.filter((s) => s.gate).map((s) => rejectLine({ source: s.gate.source, candidate: s.key, reason: s.reason, active: s.gate.active, totalActive: s.gate.total_active, headroom: s.gate.headroom, newPerRequest: s.gate.new_per_request, capRoom: null })))
  let registered = 0
  if (plan.rows.length === 0) reasons.register = cands.length === 0 ? 'no_new_candidates' : [...new Set(plan.skipped.map((s) => s.reason))].join('+')
  else if (blocked) reasons.register = 'blocked'
  else if (dry) reasons.register = 'dry_run'
  else {
    const ymd = date.replace(/-/g, '')
    const name = `${stamp}_window_targets_${ymd}`
    const rollbackName = `window-discovery-rollback-${stamp}.sql`
    writeFile(path.join(dayDir, `${name}.sql`), renderSql(plan.rows, { name, ledgerPath: `${reportsDir}/${date}/window-probe.json`, rollbackName }))
    writeFile(path.join(dayDir, rollbackName), renderRollback(plan.rows, { name }))
    // (4) 등재 직전 신선한 상태로 다시 계획 — 입력 파일 뒤 바뀐 게이트·실행 중 수집을 본다
    const loadInputs = loadFresh ?? (await import('./window-discovery-inputs.mjs')).loadInputs
    const fresh = await loadInputs(sb, { now, withSeen: false })
    const fresh2 = planRegistration(plan.rows.map((r) => ({ ...r, draftable: true })), { targets: fresh.targets, sources: fresh.sources, state: fresh.state, registeredToday })
    const freshRunning = fresh.state.running
    if (!freshRunning) reasons.register = 'block_history_unverified'
    else if (plan.rows.some((r) => freshRunning.includes(r.source_key))) reasons.register = 'collect_running'
    else {
      const res = await insertRows(sb, fresh2.rows)
      registered = res.inserted.length
      if (res.error) { dbError = res.error; alerts.push(res.error) }
      for (const r of res.inserted) {
        ledger.entries.push({
          id: r.id, source_key: r.source_key, product_ref: r.product_ref, label: r.label, anchor_ref: r.anchor_ref, project_id: r.project_id,
          registered_at: now.toISOString(), baseline_total_collected: r.baseline_total_collected, new_per_request: r.new_per_request,
          status: 'adopted', rollback: `${reportsDir}/${date}/${rollbackName}`,
        })
      }
      if (registered === 0) reasons.register = [...new Set([...fresh2.skipped, ...res.skipped].map((s) => s.reason))].join('+') || 'gate_blocked'
      // 사후 확인 — 게이트를 넘었으면 경보만(자동 수정은 UPDATE 라 이 경로 밖). 못 읽으면 확인 불가로 남긴다.
      try {
        const after = await loadInputs(sb, { now: new Date(), withSeen: false })
        const gp = after.state.sources.googleplay?.active ?? 0
        const as = after.state.sources.appstore?.active ?? 0
        if (res.inserted.some((r) => r.source_key === 'googleplay') && gp > 80) alerts.push(`googleplay 활성 ${gp} > 80 (사후)`)
        if (res.inserted.some((r) => r.source_key === 'appstore') && as > 0.3 * after.state.total_active) alerts.push(`appstore 활성 ${as}/${after.state.total_active} > 30% (사후)`)
      } catch (e) {
        alerts.push(`사후 가드 확인 불가: ${e.message}`)
      }
    }
  }
  // 등재 못 한 오늘 채택분(게이트·상한·차단·수집 중)은 pending 으로 남겨 다음 날 다시 계획한다 — 프로브 대장 skip 에 걸려 영영 사라지지 않게.
  // 형식 문제(duplicate·no_anchor·not_same_app 등)로 빠진 것은 다시 봐도 같으니 남기지 않는다.
  const regKeys = new Set(ledger.entries.filter((e) => e.id).map((e) => `${e.source_key}|${e.product_ref}`))
  const permanent = new Set(plan.skipped.filter((s) => !['gate_blocked', 'daily_cap'].includes(s.reason)).map((s) => s.key))
  for (const w of adoptedToday) {
    const k = `${w.source_key}|${w.product_ref}`
    if (regKeys.has(k) || permanent.has(k) || pending.some((p) => `${p.source_key}|${p.product_ref}` === k)) continue
    const why = plan.skipped.find((s) => s.key === k)?.reason ?? reasons.register ?? 'not_registered'
    ledger.entries.push({ source_key: w.source_key, product_ref: w.product_ref, label: w.label, anchor_ref: w.anchor_ref, sort: w.sort, new_per_request: w.new_per_request, status: 'pending', reason: why, pending_since: now.toISOString() })
  }
  for (const p of pending) if (regKeys.has(`${p.source_key}|${p.product_ref}`)) p.status = 'promoted'
  if (!dry) writeFile(path.join(reportsDir, ADOPTED_LEDGER), JSON.stringify(ledger, null, 2) + '\n')

  // 로그 블록
  const summary = {
    date, dry, candidates: all.length, adopted: adoptedToday.length, registered, demoted, requests, max_requests: maxRequests, blocked,
    new_total: probed.reduce((n, w) => n + (w.new_count ?? 0), 0), reasons, alerts, files,
  }
  const block = logBlock(summary)
  log(block)
  fs.mkdirSync(dayDir, { recursive: true })
  fs.appendFileSync(path.join(dayDir, 'discovery-log-block.md'), `\n\`\`\`\n${block}\n\`\`\`\n`)
  let notion = 'skipped(dry_run)'
  if (!dry) {
    const rec = record ?? (await import('./notion-status-log.mjs')).upsertStatusLog
    const w = await rec(
      { date, track: 'CTO', done: block, blocked: alerts.join('\n'), next: blocked ? '차단 신호 소스 확인(램프·수집 로그) 뒤 다음 실행' : '', needsHuman: false, note: 'window-discovery' },
      { marker: 'window-discovery', pendingDir: 'ops/state/status-log-pending' },
    )
    notion = w.ok ? `ok ${w.title}` : `notion_unavailable(${w.stage}: ${w.error})${w.pendingPath ? ` · 폴백 ${w.pendingPath}` : ''}`
  }
  log(`Notion: ${notion}`)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 창문 자율 발굴\n\n\`\`\`\n${block}\n\`\`\`\n\n- Notion: ${notion}\n`)
  return { ...summary, notion, plan, code: dbError ? 1 : blocked ? 3 : 0 }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2))
    .then((r) => process.exit(r.code))
    .catch((e) => {
      console.error(`❌ window-discovery: ${e.message}`)
      process.exit(1)
    })
}
