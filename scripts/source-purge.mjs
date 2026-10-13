#!/usr/bin/env node
// 소스 단위 purge(v70 D5·§1 안전선 "소스 단위 일괄 삭제 가능") — 한 source_key 의 analysis_inputs.raw_text 를 비운다.
//
// ⚠️ 되돌릴 수 없다(원문 삭제). 그래서:
//   - 기본이 dry-run 이다. 지우려면 `--apply` + `--confirm=<source_key>`(같은 키를 한 번 더) 둘 다 필요하다.
//   - 대상은 **v70 임시 소스**(review_sources.override='owner_2026-10-14')뿐이다. 그 밖의 소스는 거부한다(§9-3: 승인된 임시 소스 purge 만 예외).
//   - raw_text 와 purged_at·purge_reason 을 같은 UPDATE 에서 쓴다(analysis_inputs_purge_trace_check). 판정·지문 행은 건드리지 않는다.
//   - 이미 purged_at 이 찍힌 행(retention·dedupe)은 원문만 비우고 사유를 덮지 않는다(lib/review/purge.ts 와 같은 규칙).
// 선행 마이그레이션: 20261014000050_source_purge_reason (purge_reason CHECK 에 'source_purge' 추가). 없으면 --apply 가 DB 에서 거부된다.
//
// 사용:
//   node scripts/source-purge.mjs --source=n8n_community                      # dry-run
//   node scripts/source-purge.mjs --source=n8n_community --apply --confirm=n8n_community
// 환경변수: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const V70_OVERRIDE = 'owner_2026-10-14'

/** 순수 함수 — 실행 가능 여부와 사유. src = review_sources 행(없으면 null). */
export function purgeGuard({ source, src, apply, confirm }) {
  if (!source || !/^[a-z0-9_]{2,40}$/.test(source)) return { ok: false, reason: '--source=<key> 가 필요하다(영소문자·숫자·_)' }
  if (!src) return { ok: false, reason: `review_sources 에 '${source}' 가 없다` }
  if (src.override !== V70_OVERRIDE) return { ok: false, reason: `'${source}' 는 v70 임시 소스(override=${V70_OVERRIDE})가 아니다 — 이 스크립트는 거부한다(사람 판단)` }
  if (src.enabled) return { ok: false, reason: `'${source}' 가 아직 켜져 있다 — 먼저 끈다(롤백 마이그레이션)` }
  if (apply && confirm !== source) return { ok: false, reason: `--apply 에는 --confirm=${source} 가 필요하다` }
  return { ok: true, reason: apply ? '실제 폐기' : 'dry-run' }
}

/** 순수 함수 — 행 하나의 UPDATE 패치. alreadyPurged 면 원문만 비운다. */
export function sourcePurgePatch(now, alreadyPurged) {
  return alreadyPurged ? { raw_text: null } : { raw_text: null, purged_at: now.toISOString(), purge_reason: 'source_purge' }
}

export async function main(argv, { sb, now = new Date(), log = console.log } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const source = opt('source')
  const apply = argv.includes('--apply')
  const confirm = opt('confirm')
  const { data: src, error: se } = await sb.from('review_sources').select('key, enabled, override').eq('key', source ?? '').maybeSingle()
  if (se) throw new Error(`review_sources 조회 실패: ${se.message}`)
  const guard = purgeGuard({ source, src, apply, confirm })
  if (!guard.ok) {
    log(`⛔ ${guard.reason}`)
    return { ok: false, reason: guard.reason, purged: 0 }
  }
  const { data: rows, error } = await sb.from('analysis_inputs').select('id, purged_at').eq('source_key', source).not('raw_text', 'is', null).limit(5000)
  if (error) throw new Error(`대상 조회 실패: ${error.message}`)
  log(`대상 ${rows.length}행 (source_key=${source}) — ${apply ? '실제 폐기' : 'dry-run, 지우지 않음'}`)
  if (!apply) return { ok: true, reason: guard.reason, purged: 0, candidates: rows.length }
  let purged = 0
  for (const r of rows) {
    const { error: ue } = await sb.from('analysis_inputs').update(sourcePurgePatch(now, r.purged_at !== null)).eq('id', r.id).not('raw_text', 'is', null)
    if (ue) throw new Error(`폐기 실패 id=${r.id}: ${ue.message} (중단 — 이미 ${purged}행 폐기)`)
    purged++
  }
  // 되읽기(§7.1) — 썼다고 믿지 않는다.
  const { count } = await sb.from('analysis_inputs').select('id', { count: 'exact', head: true }).eq('source_key', source).not('raw_text', 'is', null)
  log(`폐기 ${purged}행 · 남은 원문 ${count ?? '확인 불가'}행`)
  return { ok: true, reason: guard.reason, purged, remaining: count }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다')
    process.exit(1)
  }
  main(process.argv.slice(2), { sb: createClient(url, key) }).then((r) => process.exit(r.ok ? 0 : 1)).catch((e) => {
    console.error(`❌ source-purge: ${e.message}`)
    process.exit(1)
  })
}
