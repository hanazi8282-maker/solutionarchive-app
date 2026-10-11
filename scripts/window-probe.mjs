#!/usr/bin/env node
// 같은 소스 안 새 창문 프로브(남헌 v48 §2-A·§4 / v52 §1-2·4) — 읽기 전용, DB 접근 없음.
//
// 앱스토어·구글 플레이 타깃의 같은 앱을 **다른 국가 스토어·정렬**로 소량 요청해 요청당 새 글 수를 잰다.
// 채택된 창문만 scripts/window-migration-draft.mjs 가 마이그 초안으로 만든다(적용은 오케스트레이터).
//
// 입력(전부 오케스트레이터가 DB 에서 뽑아 파일로 넘긴다 — 이 스크립트는 서비스키·DB 를 모른다):
//   --targets=<path>  [{label, source_key:'appstore'|'googleplay', product_ref, project_id}]  기존 타깃 전부(창문의 앵커이자 "이미 있음" 판정)
//   --sources=<path>  [{key, enabled, override, robots_status, min_interval_ms}]  review_sources 두 행. 없으면 실행 거부.
//                     enabled ∧ 소유자 예외(runner.ts isOwnerRobotsOverride) 인 소스만 요청한다(CLAUDE.md §7.1).
//   --seen=<path>     (선택) 지문 JSON — 문자열 배열 또는 {identity_keys:[], content_hashes:[], ...} (배열 값 전부 합집합).
//                     review_fingerprints.identity_key / legacy / content_hash. 없으면 새 글 수를 추정하지 않는다(확인 불가).
//   --max-requests=60 --config=config/window-probe.json --reports-dir=reports --dry-run(요청 없이 후보만)
//
// 규칙: 창문당 요청 ≤2(1페이지, --seen 이 있고 1페이지가 문턱 미달이면 2페이지) · 전체 요청 ≤ --max-requests ·
//   403/429·빈 응답·캡차(runner.ts isStrictBlock) 1건이면 즉시 전체 중단 · 소스별 요청 사이 min_interval_ms 이상 대기 ·
//   UA 는 러너 것 그대로(우회·위장 없음).
// 판정: adopted(요청당 새 글 ≥ 문턱 ∧ 파싱>0 ∧ 파싱 실패 0) · rejected · not_in_store(표지 확인된 응답에 0건) ·
//   unverified(중복 미확인·HTTP 오류·파싱 실패) · blocked. 대장 reports/<KST 날짜>/window-probe.json.
//   다음 실행은 모든 대장의 blocked 외 판정 창문을 건너뛴다(재제안 방지).
//
// 확장 지점(이번 범위 밖): 같은 회사의 다른 앱 ID, 한·영 이름 변형 → buildWindows 에 후보 생성기를 더한다.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { appstoreAdapter, feedUrl, parseProductRef as appstoreRef } from '../lib/review/adapters/appstore.ts'
import { googleplayAdapter, parseProductRef as googleplayRef } from '../lib/review/adapters/googleplay.ts'
import { USER_AGENT, isStrictBlock, isOwnerRobotsOverride } from '../lib/review/runner.ts'
import { computeFingerprint, CROSS_TARGET_MIN_TEXT_LEN } from '../lib/review/fingerprint.ts'
import { detectReviewLang } from '../lib/review/lang.ts'

export const ADAPTERS = { appstore: appstoreAdapter, googleplay: googleplayAdapter }
export const windowKey = (w) => `${w.source_key}|${w.product_ref}|${w.sort}`
export const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10)

/** `<영역>:<국가 접두>|<제품>` — 영역 = 앵커 라벨 첫 ':' 앞, 제품 = '|' 뒤(없으면 첫 ':' 뒤). 영역이 없으면 `<접두>|<제품>`. */
export function labelFor(anchorLabel, prefix) {
  const raw = String(anchorLabel ?? '').trim()
  const i = raw.indexOf(':')
  const rest = i >= 0 ? raw.slice(i + 1) : raw
  const name = rest.includes('|') ? rest.slice(rest.lastIndexOf('|') + 1) : rest
  return i >= 0 ? `${raw.slice(0, i)}:${prefix}|${name}` : `${prefix}|${name}`
}

/**
 * 후보 창문. 같은 (source_key, product_ref) 타깃이 이미 있으면 그 기본 정렬 창문은 만들지 않는다.
 * 앱스토어 mostHelpful 은 기존 국가에도 만든다(최신순 500건 상한 너머를 보는 창문) — 측정 전용, 초안 제외(draftable=false).
 */
export function buildWindows(targets, config, skip = new Set()) {
  const existing = new Set(targets.map((t) => `${t.source_key}|${t.product_ref}`))
  const out = new Map()
  const add = (w) => {
    const k = windowKey(w)
    if (!skip.has(k) && !out.has(k)) out.set(k, w)
  }
  for (const t of targets) {
    const base = { anchor_ref: t.product_ref, anchor_label: t.label ?? null, project_id: t.project_id }
    if (t.source_key === 'appstore') {
      const r = appstoreRef(t.product_ref)
      if (!r) continue
      // 앵커 자기 국가도 넣는다 — 최신순은 이미 있어 빠지고 mostHelpful 만 남는다.
      for (const country of new Set([...(config.appstore?.countries ?? []), r.country])) {
        const product_ref = `${country}:${r.appId}`
        for (const sort of config.appstore?.sorts ?? []) {
          if (sort === 'mostRecent' && existing.has(`appstore|${product_ref}`)) continue
          add({ ...base, source_key: 'appstore', product_ref, sort, app: r.appId, label: labelFor(t.label, country), draftable: sort === 'mostRecent' })
        }
      }
    } else if (t.source_key === 'googleplay') {
      const r = googleplayRef(t.product_ref)
      if (!r) continue
      for (const win of config.googleplay?.windows ?? []) {
        const [gl, hl] = win.split(':')
        const product_ref = `${gl}:${hl}:${r.pkg}`
        if (existing.has(`googleplay|${product_ref}`) || !googleplayRef(product_ref)) continue
        // 어댑터 정렬은 최신순 고정 — 'newest' 하나만 의미가 있다.
        add({ ...base, source_key: 'googleplay', product_ref, sort: 'newest', app: r.pkg, label: labelFor(t.label, `${gl}-${hl}`), draftable: true })
      }
    }
  }
  return [...out.values()]
}

/** 요청 = 어댑터 nextRequest 그대로. 앱스토어 mostHelpful 만 같은 어댑터의 feedUrl 로 정렬을 바꾼다. */
export function requestFor(w, cursor) {
  const target = { id: 'probe', projectId: w.project_id, sourceKey: w.source_key, productRef: w.product_ref, cursor, lastReviewAt: null, consecutiveEmpty: 0 }
  if (w.source_key === 'appstore' && w.sort === 'mostHelpful') {
    const r = appstoreRef(w.product_ref)
    return r ? { url: feedUrl(r.country, r.appId, cursor ? Number(cursor) + 1 : 1, 'mostHelpful') } : null
  }
  return ADAPTERS[w.source_key]?.nextRequest(target) ?? null
}

/** 지문 JSON → Set. 문자열 배열 또는 배열 값을 가진 객체. */
export function loadSeen(json) {
  const vals = Array.isArray(json) ? json : Object.values(json ?? {}).flat()
  return new Set(vals.filter((v) => typeof v === 'string' && v))
}

/** 소스 행 → 요청 허용 여부와 간격. 못 읽었거나 예외가 아니면 막는다(fail-closed). */
export function sourceGate(rows, key, floorMs) {
  const s = (rows ?? []).find((r) => r?.key === key)
  if (!s) return { ok: false, reason: 'review_sources 행 없음(--sources)' }
  if (s.enabled !== true) return { ok: false, reason: 'enabled=false' }
  if (!isOwnerRobotsOverride(s.override, s.robots_status)) return { ok: false, reason: `소유자 예외 아님(override=${s.override}, robots=${s.robots_status})` }
  if (!Number.isFinite(s.min_interval_ms)) return { ok: false, reason: 'min_interval_ms 없음' }
  return { ok: true, intervalMs: Math.max(s.min_interval_ms, floorMs ?? 0) }
}

/**
 * 프로브 본체. 네트워크는 주입된 fetchText 만 쓴다(셀프테스트는 가짜).
 * 반환 { windows: [기록], requests, aborted: null | 'blocked:<status>' | 'max_requests' }
 */
export async function probeWindows(windows, { fetchText, sleep, gates, seen = null, maxRequests = 60, threshold = 5, now = () => new Date().toISOString() }) {
  const out = { windows: [], requests: 0, aborted: null }
  const usedSource = new Set()
  for (const w of windows) {
    const gate = gates[w.source_key]
    if (!gate?.ok) continue // 막힌 소스 창문은 기록하지 않는다(다음 실행이 다시 본다)
    if (out.requests >= maxRequests) {
      out.aborted = 'max_requests'
      break
    }
    const adapter = ADAPTERS[w.source_key]
    const rec = {
      key: windowKey(w), ...w, requests: 0, parsed: 0, parse_failures: 0,
      seen_count: seen ? 0 : null, new_count: seen ? 0 : null, new_per_request: null, langs: {},
      verdict: null, reason: null, probed_at: now(),
    }
    const ids = new Set()
    let cursor = null
    for (let page = 1; page <= 2; page++) {
      const req = requestFor(w, cursor)
      if (!req) {
        if (page === 1) {
          rec.verdict = 'unverified'
          rec.reason = '요청을 만들 수 없음(product_ref)'
        }
        break
      }
      if (usedSource.has(w.source_key)) await sleep(gate.intervalMs)
      usedSource.add(w.source_key)
      const res = await fetchText(req.url, req.init)
      out.requests++
      rec.requests++
      if (res.status === 403 || res.status === 429 || isStrictBlock(res, adapter.isChallenge?.bind(adapter))) {
        rec.verdict = 'blocked'
        rec.reason = `차단 신호(status ${res.status}${res.status && res.status < 300 ? ', 빈 응답·캡차·/sorry/' : ''}) — 전체 중단`
        out.aborted = `blocked:${res.status}`
        break
      }
      if (res.status === null || res.status < 200 || res.status >= 300) {
        rec.verdict = 'unverified'
        rec.reason = res.status === null ? `네트워크 오류: ${res.error}` : `HTTP ${res.status}`
        break
      }
      const parsed = adapter.parse(res.body, { productRef: w.product_ref, cursor })
      rec.parse_failures += parsed.parseFailures
      for (const r of parsed.reviews) {
        const fp = computeFingerprint(w.source_key, w.product_ref, r, adapter.productScopedExternalId === true)
        const id = fp?.identityKey ?? `nofp:${r.text}`
        if (ids.has(id)) continue
        ids.add(id)
        rec.parsed++
        const lang = r.lang ?? detectReviewLang(r.text)
        rec.langs[lang] = (rec.langs[lang] ?? 0) + 1
        if (!seen) continue
        const hit = fp && (seen.has(fp.identityKey) || (fp.legacyIdentityKey && seen.has(fp.legacyIdentityKey)) ||
          (fp.textLength >= CROSS_TARGET_MIN_TEXT_LEN && seen.has(fp.contentHash)))
        if (hit) rec.seen_count++
        else rec.new_count++
      }
      if (page === 1 && parsed.reviews.length === 0) {
        // 파서가 표지(앱스토어 feed 객체 · 플레이 )]}' 봉투 + wrb.fr 프레임)를 확인한 뒤의 0건만 "없음"이다. 표지 없으면 parseFailures.
        if (parsed.parseFailures > 0) {
          rec.verdict = 'unverified'
          rec.reason = `파싱 실패 ${parsed.parseFailures} — 표지 없음(구조 변경·벽)`
        } else {
          rec.verdict = 'not_in_store'
          rec.reason = '응답 표지 확인 · 리뷰 0건(스토어에 없음 또는 그 국가 리뷰 없음)'
        }
        break
      }
      const enough = seen && rec.new_count / rec.requests >= threshold
      if (!seen || enough || !parsed.nextCursor || out.requests >= maxRequests) break
      cursor = parsed.nextCursor
    }
    if (!rec.verdict) {
      if (rec.new_count !== null) rec.new_per_request = Math.round((rec.new_count / rec.requests) * 10) / 10
      if (rec.parse_failures > 0) {
        rec.verdict = 'unverified'
        rec.reason = `파싱 실패 ${rec.parse_failures}건 섞임 — 채택 보류`
      } else if (!seen) {
        rec.verdict = 'unverified'
        rec.reason = '중복 미확인(--seen 없음) — 새 글 수 추정 안 함'
      } else if (rec.new_per_request >= threshold) {
        rec.verdict = 'adopted'
        rec.reason = `요청당 새 글 ${rec.new_per_request} ≥ ${threshold}`
        if (!w.draftable) rec.reason += ' · 정렬 창문이라 마이그 초안 제외(어댑터 수집은 최신순 고정)'
      } else {
        rec.verdict = 'rejected'
        rec.reason = `요청당 새 글 ${rec.new_per_request} < ${threshold}`
      }
    }
    out.windows.push(rec)
    if (out.aborted) break
  }
  return out
}

/** 모든 대장(reports/*\/window-probe.json)에서 다시 보지 않을 창문 키. blocked 는 창문 탓이 아니라 다시 본다. */
export function readLedgerSkip(reportsDir) {
  const skip = new Set()
  if (!fs.existsSync(reportsDir)) return skip
  for (const d of fs.readdirSync(reportsDir)) {
    const f = path.join(reportsDir, d, 'window-probe.json')
    if (!fs.existsSync(f)) continue
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'))
    for (const w of doc.windows ?? []) if (w.verdict && w.verdict !== 'blocked') skip.add(w.key)
  }
  return skip
}

/** 오늘 대장에 합친다(같은 키는 새 기록이 이긴다). 쓴 경로를 돌려준다. */
export function writeLedger(reportsDir, date, result, meta) {
  const f = path.join(reportsDir, date, 'window-probe.json')
  const doc = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { windows: [], runs: [] }
  const byKey = new Map((doc.windows ?? []).map((w) => [w.key, w]))
  for (const w of result.windows) byKey.set(w.key, w)
  doc.windows = [...byKey.values()]
  doc.runs = [...(doc.runs ?? []), { ...meta, requests: result.requests, aborted: result.aborted, probed: result.windows.length }]
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n')
  return f
}

export async function realFetch(url, init) {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { Accept: '*/*', ...(init?.headers ?? {}), 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    return { status: r.status, body: await r.text(), finalUrl: r.url }
  } catch (e) {
    return { status: null, body: '', error: String(e?.message ?? e) }
  }
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a)
    return m ? [m[1], m[2] ?? true] : [a, true]
  }))
  if (!args.targets) {
    console.error('usage: node scripts/window-probe.mjs --targets=<json> --sources=<json> [--seen=<json>] [--max-requests=60] [--dry-run]')
    process.exit(2)
  }
  const config = readJson(args.config ?? 'config/window-probe.json')
  const reportsDir = args['reports-dir'] ?? 'reports'
  const targets = readJson(args.targets)
  const windows = buildWindows(targets, config, readLedgerSkip(reportsDir))
  console.log(`candidate windows: ${windows.length} (targets ${targets.length})`)
  if (args['dry-run']) {
    for (const w of windows) console.log(`  ${windowKey(w)}  label=${w.label}  ← ${w.anchor_ref}`)
    return
  }
  if (!args.sources) {
    console.error('--sources 없음 — 소유자 예외·간격을 확인할 수 없어 요청하지 않는다(§7.1 fail-closed)')
    process.exit(2)
  }
  const rows = readJson(args.sources)
  const gates = Object.fromEntries(Object.keys(ADAPTERS).map((k) => [k, sourceGate(rows, k, config.min_interval_ms_floor)]))
  for (const [k, g] of Object.entries(gates)) if (!g.ok) console.log(`source ${k} skipped: ${g.reason}`)
  const seen = args.seen ? loadSeen(readJson(args.seen)) : null
  const maxRequests = Number(args['max-requests'] ?? 60)
  const result = await probeWindows(windows, {
    fetchText: realFetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    gates, seen, maxRequests, threshold: config.adopt_min_new_per_request ?? 5,
  })
  const file = writeLedger(reportsDir, kstDate(), result, { at: new Date().toISOString(), max_requests: maxRequests, seen: seen ? seen.size : null })
  for (const w of result.windows) {
    console.log(`${w.verdict.padEnd(12)} ${w.key}  req=${w.requests} parsed=${w.parsed} new=${w.new_count ?? '?'} /req=${w.new_per_request ?? '?'} langs=${JSON.stringify(w.langs)}  ${w.reason}`)
  }
  console.log(`requests ${result.requests}/${maxRequests} · aborted=${result.aborted ?? 'no'} · ledger ${file}`)
  if (result.aborted?.startsWith('blocked')) process.exit(3)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
