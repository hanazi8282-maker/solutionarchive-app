#!/usr/bin/env node
// 타깃 재고 게이지 일일 블록 — "[재고 게이지 YYYY-MM-DD]" (v71au ⑩). **읽기 전용**(SELECT 만, 쓰기 경로 없음).
// 계산은 lib/review/target-supply.ts 의 computeSupply · inventoryGauge 그대로(target-revive.mjs --auto 가 같은 함수를 쓴다).
// 이 파일은 (1) 소스별 즉시/예약 재고 일수 표, (2) 14일 미만 소스의 보충 "제안" 한 단계만 얹는다. 제안은 적용하지 않는다(§10.1 — 변수·DB 는 사람/역할 세션).
//   node scripts/inventory-gauge.mjs [--out=<파일>]
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { GAUGE_WARN_DAYS, computeSupply, inventoryGauge } from '../lib/review/target-supply.ts'
import { loadSupplyInputs, openDb } from './target-supply.mjs'

const r1 = (x) => Math.round(x * 10) / 10

/** 소스별 재고 일수 = (활성 + 지금 되살릴 수 있는 예약) ÷ 하루 방문 슬롯. 순환형(증분형)은 일수가 정의되지 않아 null. */
export function stockDays(g, perDay) {
  return g.basis === 'consumed' ? r1((g.active + g.reserved_due_now) / Math.max(1, perDay)) : null
}

/**
 * 14일 미만(소비형) 또는 긴급·경고(순환형) 소스마다 보충 제안 한 단계. 순서 = 싼 것부터:
 *  - 예약이 기다리는 중이면 → 재방문 간격 한 단계(TARGET_REVIVE_CE_EXP_MAX 지수 상한 −1 또는 TARGET_REVIVE_PER_SOURCE +2)
 *  - 예약도 없으면 → 새 타깃이 필요(창문 발굴 WINDOW_MAX_REQUESTS 한 단계↑ + nightly-window-discovery dispatch, 앵커 있는 소스만)
 * 차단 신호가 있으면 어떤 상향도 제안하지 않는다.
 */
export const WINDOW_SOURCES = new Set(['appstore', 'googleplay']) // 창문 발굴(앵커 = 같은 앱 기존 타깃)이 되는 소스
export function proposals(gauges, perDayOf, blocked24, hasTargets = () => true) {
  const out = []
  const needNew = [] // 창문 발굴 대상이 아닌 소스는 한 줄로 묶는다(소스마다 같은 문장을 반복하지 않는다)
  for (const g of gauges) {
    if (!hasTargets(g.source_key)) continue // 타깃이 한 번도 없는 소스(정책 기록 행 등)는 재고 개념이 없다
    const days = stockDays(g, perDayOf[g.source_key] ?? 1)
    const low = g.basis === 'consumed' ? days < GAUGE_WARN_DAYS : g.level !== 'ok'
    if (!low) continue
    const sig = blocked24[g.source_key] ?? 0
    if (sig > 0) { out.push(`${g.source_key}: 보충 보류 — 24h 차단·쿼터 신호 ${sig}건(상향 금지)`); continue }
    if (g.reserved_waiting > 0 && g.reserved_due_now < Math.max(1, perDayOf[g.source_key] ?? 1) * GAUGE_WARN_DAYS)
      out.push(`${g.source_key}: 예약 ${g.reserved_waiting}개가 간격 대기 중(다음 자격 ${g.reserved_next_due ?? '확인 불가'}) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가`)
    else if (WINDOW_SOURCES.has(g.source_key)) out.push(`${g.source_key}: 활성 ${g.active}·예약 ${g.reserved_waiting} → 새 타깃 필요. 한 단계: WINDOW_MAX_REQUESTS +40 후 nightly-window-discovery 실행, 한도 대장 기록·24h 재평가`)
    else needNew.push(`${g.source_key}(활성 ${g.active})`)
  }
  if (needNew.length) out.push(`새 타깃 필요 ${needNew.length}곳 — ${needNew.join(', ')}: 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫`)
  return out
}

/** 순수 함수 — 블록 문자열. report = computeSupply 결과, gauge = inventoryGauge 결과, blocked24 = {source_key: 차단+쿼터 합}. */
export function gaugeBlock({ date, report, gauge, blocked24, hasTargets }) {
  const perDayOf = Object.fromEntries(report.sources.map((s) => [s.source_key, Math.max(1, s.runs_per_day * s.tpr)]))
  const lv = { ok: '정상', warn: '경고', urgent: '긴급' }
  const lines = [`[재고 게이지 ${date}]`, `- ${gauge.fuel_line}`]
  for (const g of gauge.sources) {
    const d = stockDays(g, perDayOf[g.source_key])
    lines.push(`- ${g.source_key}: ${d === null ? `순환형(활성 ${g.active})` : `재고 ${d}일(활성 ${g.active} + 즉시 예약 ${g.reserved_due_now})`} · 대기 예약 ${g.reserved_waiting}${g.reserved_next_due ? ` · 다음 자격 ${g.reserved_next_due.slice(0, 16)}Z` : ''} · ${lv[g.level]}`)
  }
  const p = proposals(gauge.sources, perDayOf, blocked24, hasTargets)
  lines.push(`- 보충 제안(적용 안 함): ${p.length ? '' : '없음(14일 미만 소스 없음)'}`)
  for (const x of p) lines.push(`  - ${x}`)
  return lines.join('\n')
}

export async function main(argv, { db, now = new Date() } = {}) {
  const sb = db ?? (await openDb())
  const inputs = await loadSupplyInputs(sb, now)
  const report = computeSupply(inputs)
  const gauge = inventoryGauge(report, inputs.targets, now)
  const since = new Date(now.getTime() - 86_400_000).toISOString()
  const { data: runs24, error } = await sb.from('review_collection_runs').select('source_key, blocked_responses, quota_responses').gte('started_at', since).eq('dry_run', false).limit(5000)
  if (error) throw new Error(`review_collection_runs 조회 실패: ${error.message}`)
  const blocked24 = {}
  for (const r of runs24) { const n = (r.blocked_responses ?? 0) + (r.quota_responses ?? 0); if (n) blocked24[r.source_key] = (blocked24[r.source_key] ?? 0) + n }
  const have = new Set(inputs.targets.map((x) => x.source_key))
  const date = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10)
  const block = gaugeBlock({ date, report, gauge, blocked24, hasTargets: (k) => have.has(k) })
  const out = argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (out) fs.writeFileSync(out, block + '\n')
  console.log(block)
  return block
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ inventory-gauge: ${e.message}`)
    process.exit(1)
  })
}
