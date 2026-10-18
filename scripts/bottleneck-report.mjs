#!/usr/bin/env node
// 병목 일일 기록 — "[병목 YYYY-MM-DD]" 블록 한 개를 낸다(v71am §2-2, L-37). **읽기 전용**(SELECT 만).
// 계산은 lib/review/target-supply.ts(computeSupply) 를 그대로 쓴다. 이 파일은 그 결과 + 최근 24시간 수집 실행을 한 줄씩 적는 것뿐이다.
//   node scripts/bottleneck-report.mjs [--json] [--out=<파일>]    # 기본: 블록을 stdout 으로. --out 이면 파일에도 쓴다
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
// 못 읽은 값은 0 으로 접지 않고 '확인 불가'로 찍는다(CLAUDE.md §7.1).

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { computeSupply } from '../lib/review/target-supply.ts'
import { loadSupplyInputs, openDb } from './target-supply.mjs'

const NEAR = 0.9 // 목표의 90% 부터 '근접'
const UNK = '확인 불가'

const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)

/**
 * 순수 함수. report = computeSupply 결과, runs24 = 최근 24시간 실제 실행 행, dailyTarget = {source_key: daily_request_target|null},
 * registered24 = 최근 24시간 새 타깃 수(null = 못 읽음).
 */
export function bottleneckBlock({ date, report, runs24, dailyTarget, registered24 }) {
  const by = (k) => runs24.filter((r) => r.source_key === k)
  const lines = [`[병목 ${date}]`]

  const app = report.sources.find((s) => s.source_key === 'appstore')
  const ar = by('appstore')
  lines.push(
    app
      ? `- 앱스토어 N/T/여유: 활성 ${app.active} / 필요 ${app.N ?? UNK} / 30% 여유 ${app.gate_headroom} · 24h 방문 ${sum(ar, 'targets_visited')} 요청 ${sum(ar, 'requests')} 신규 ${sum(ar, 'new_reviews')} (exhausted ${app.inactive.exhausted}는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)`
      : `- 앱스토어 N/T/여유: ${UNK}`,
  )

  // 30% 게이트가 막은 자리 = 결손(gap) 중 여유(gate_headroom)를 넘는 몫. 소스별로 센다.
  const blocked = report.sources
    .filter((s) => s.gap != null && s.gap > s.gate_headroom)
    .map((s) => ({ k: s.source_key, n: s.gap - s.gate_headroom }))
  lines.push(`- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): ${blocked.reduce((a, b) => a + b.n, 0)}${blocked.length ? ` (${blocked.map((b) => `${b.k} ${b.n}`).join(' · ')})` : ''}`)

  lines.push(`- 등록 속도(24h 새 타깃): ${registered24 ?? UNK}`)

  const hits = []
  for (const k of [...new Set(runs24.map((r) => r.source_key))].sort()) {
    const req = sum(by(k), 'requests')
    const t = dailyTarget[k]
    if (!t || !req) continue
    const ratio = req / t
    if (ratio >= NEAR) hits.push(`${k} ${req}/${t}${ratio >= 1 ? ' 도달' : ' 근접'}`)
  }
  lines.push(`- 요청 예산 사용률(목표 90%↑): ${hits.length ? hits.join(' · ') : '없음'}`)

  const gp = report.googleplay
  const gps = report.sources.find((s) => s.source_key === 'googleplay')
  lines.push(`- 구글 플레이: 활성 ${gps ? gps.active : UNK} / 동결선 ${gp.frozen_at} · 확대 ${gp.expand_ready ? '가능' : '보류'}`)

  lines.push(`- 차단·쿼터 신호(24h): 차단 ${sum(runs24, 'blocked_responses')} · 쿼터 ${sum(runs24, 'quota_responses')}`)
  lines.push(`- 판정 대기 며칠치(L-42): ${UNK} — 이 스크립트 범위 밖(판정 표 별도)`)
  return lines.join('\n')
}

export async function main(argv, { db, now = new Date() } = {}) {
  const sb = db ?? (await openDb())
  const inputs = await loadSupplyInputs(sb, now)
  const report = computeSupply(inputs)
  const since = new Date(now.getTime() - 86_400_000).toISOString()
  const q = async (build, what) => {
    const { data, error } = await build()
    if (error) throw new Error(`${what} 조회 실패: ${error.message}`)
    return data
  }
  const runs24 = await q(
    () => sb.from('review_collection_runs').select('source_key, requests, targets_visited, new_reviews, blocked_responses, quota_responses').gte('started_at', since).eq('dry_run', false).limit(5000),
    'review_collection_runs',
  )
  const ramps = await q(() => sb.from('review_source_ramp').select('source_key, daily_request_target'), 'review_source_ramp')
  const dailyTarget = Object.fromEntries(ramps.map((r) => [r.source_key, r.daily_request_target]))
  let registered24 = null
  const { count, error } = await sb.from('review_targets').select('id', { count: 'exact', head: true }).gte('created_at', since)
  if (!error && count != null) registered24 = count
  const date = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10) // KST
  const block = bottleneckBlock({ date, report, runs24, dailyTarget, registered24 })
  const out = argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (out) fs.writeFileSync(out, block + '\n')
  console.log(block)
  return block
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ bottleneck-report: ${e.message}`)
    process.exit(1)
  })
}
