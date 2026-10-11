#!/usr/bin/env node
// 창문 자율 발굴 입력 추출(남헌 v53 §5 2-A) — **SELECT 만**. window-probe.mjs 가 요구하는 파일 3종 + 게이트 상태 1종을 쓴다.
//
//   node scripts/window-discovery-inputs.mjs --out-dir=<dir>
//     targets.json  [{id, label, source_key, product_ref, project_id, status, consecutive_empty, total_collected, last_run_at, created_at}]
//                   appstore·googleplay 의 review_targets 전부(상태 무관 — "이미 있음" 판정과 강등 평가가 둘 다 쓴다)
//     sources.json  [{key, enabled, override, robots_status, min_interval_ms}]  두 소스 행
//     seen.json     {identity_keys[], legacy_identity_keys[], content_hashes[]}  review_fingerprints(두 소스, 1000행 페이지)
//                   ⚠️ legacy_identity_keys 는 항상 빈 배열이다 — 옛 키는 DB 에서 같은 identity_key 칸에 저장돼 구분 칸이 없다
//                      (lib/review/fingerprint.ts legacyIdentityKey 주석). 그 값들은 identity_keys 에 이미 들어 있다.
//     state.json    게이트 재료: 활성 수·30% 여유·googleplay 동결·영역 결손·램프 동결·72h 차단·실행 중 수집
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (읽기에만 쓴다)
//
// 못 읽은 것을 빈 값으로 접지 않는다(§7.1): 테이블 조회 실패는 던지고, 램프·차단 이력처럼 게이트에만 쓰는 것은 null(= 확인 불가)로 남긴다.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { computeSupply } from '../lib/review/target-supply.ts'
import { loadSupplyInputs, openDb } from './target-supply.mjs'

export const WINDOW_SOURCES = ['appstore', 'googleplay']
const HOUR_MS = 3_600_000

/** 1000행 단위로 끝까지 읽는다. 실패는 던진다. */
export async function readAll(build, what) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(`${what} 조회 실패: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

/**
 * 게이트 상태. 신선도가 중요한 등재 직전에도 다시 부른다(window-discovery.mjs).
 * 반환 { generated_at, ramp_read, total_active, sources: {key: {active, gate_headroom}}, areas, ramp: {key:{frozen_until, cap_base}}|null,
 *        blocked_72h: {key:n}|null, running: [key]|null }
 */
export async function loadState(sb, now = new Date()) {
  const supply = computeSupply(await loadSupplyInputs(sb, now))
  const sources = {}
  for (const s of supply.sources) if (WINDOW_SOURCES.includes(s.source_key)) sources[s.source_key] = { active: s.active, gate_headroom: s.gate_headroom }

  let ramp = null
  {
    const { data, error } = await sb.from('review_source_ramp').select('source_key, frozen_until, cap_base').in('source_key', WINDOW_SOURCES)
    if (!error && Array.isArray(data)) ramp = Object.fromEntries(data.map((r) => [r.source_key, { frozen_until: r.frozen_until, cap_base: r.cap_base }]))
    else console.error(`⚠️ review_source_ramp 확인 불가 — ${error?.message ?? '배열 아님'}`)
  }

  let blocked = null
  let running = null
  {
    const since = new Date(now.getTime() - 72 * HOUR_MS).toISOString()
    const { data, error } = await sb
      .from('review_collection_runs')
      .select('source_key, blocked_responses, status, started_at, dry_run')
      .in('source_key', WINDOW_SOURCES)
      .gte('started_at', since)
      .limit(1000)
    if (!error && Array.isArray(data) && data.length < 1000) {
      blocked = Object.fromEntries(WINDOW_SOURCES.map((k) => [k, 0]))
      running = []
      const runningSince = now.getTime() - 3 * HOUR_MS // 오래된 'running' 은 죽은 실행 흔적 — 영영 막지 않게 3시간만 본다
      for (const r of data) {
        if (r.dry_run !== true) blocked[r.source_key] += Number(r.blocked_responses ?? 0)
        if (r.status === 'running' && Date.parse(r.started_at) >= runningSince && !running.includes(r.source_key)) running.push(r.source_key)
      }
    } else console.error(`⚠️ review_collection_runs 확인 불가 — ${error?.message ?? (Array.isArray(data) ? '1000행 이상(잘렸을 수 있음)' : '배열 아님')}`)
  }

  return {
    generated_at: now.toISOString(),
    ramp_read: supply.ramp_read,
    total_active: supply.totals.active,
    sources,
    areas: supply.areas,
    ramp,
    blocked_72h: blocked,
    running,
  }
}

export async function loadTargets(sb) {
  return readAll(
    () =>
      sb
        .from('review_targets')
        .select('id, label, source_key, product_ref, project_id, status, consecutive_empty, total_collected, last_run_at, created_at')
        .in('source_key', WINDOW_SOURCES)
        .order('id'),
    'review_targets',
  )
}

export async function loadInputs(sb, { now = new Date(), withSeen = true } = {}) {
  const targets = await loadTargets(sb)
  const sources = await readAll(
    () => sb.from('review_sources').select('key, enabled, override, robots_status, min_interval_ms').in('key', WINDOW_SOURCES).order('key'),
    'review_sources',
  )
  let seen = null
  if (withSeen) {
    const fps = await readAll(
      () => sb.from('review_fingerprints').select('identity_key, content_hash').in('source_key', WINDOW_SOURCES).order('id'),
      'review_fingerprints',
    )
    seen = { identity_keys: fps.map((f) => f.identity_key), legacy_identity_keys: [], content_hashes: fps.map((f) => f.content_hash) }
  }
  return { targets, sources, seen, state: await loadState(sb, now) }
}

export async function main(argv, { db } = {}) {
  const outDir = argv.find((a) => a.startsWith('--out-dir='))?.slice(10)
  if (!outDir) {
    console.error('usage: node scripts/window-discovery-inputs.mjs --out-dir=<dir>')
    process.exit(2)
  }
  const sb = db ?? (await openDb())
  const r = await loadInputs(sb)
  fs.mkdirSync(outDir, { recursive: true })
  for (const k of ['targets', 'sources', 'seen', 'state']) fs.writeFileSync(path.join(outDir, `${k}.json`), JSON.stringify(r[k]))
  console.log(
    `targets ${r.targets.length} · sources ${r.sources.length} · seen ${r.seen.identity_keys.length} · ` +
      `ramp ${r.state.ramp ? 'ok' : '확인 불가'} · 72h 차단 ${r.state.blocked_72h ? JSON.stringify(r.state.blocked_72h) : '확인 불가'} → ${outDir}`,
  )
  return r
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ window-discovery-inputs: ${e.message}`)
    process.exit(1)
  })
}
