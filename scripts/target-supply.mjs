#!/usr/bin/env node
// 타깃 공급 신호 — 소스별 필요 타깃 수 N·결손 gap·처방을 JSON 으로 낸다. **읽기 전용**(SELECT 만, 쓰기 경로 없음).
//
// 계산은 lib/review/target-supply.ts(순수 함수). 이 파일은 DB 포트와 출력만.
// 남헌 v32 §5 D1 A안: DB 에 쓰지 않는다 — JSON(파일)·Actions job summary 만. Notion 절은 이 PR 범위 밖(새 시크릿 배선이 필요, PR 본문 결정거리).
//
// 소비자: nightly-discovery.yml 의 discovery-run.mjs --supply=<파일>(D6 발굴 건수), 사람(job summary),
//         scripts/target-revive.mjs(같은 계산으로 되살리기 상한), 3일 1회 발굴 에이전트(세션이 이 JSON 을 입력 파일로 넘긴다).
//
// 사용법:
//   node scripts/target-supply.mjs                    # 소스당 한 줄
//   node scripts/target-supply.mjs --json             # 전체 JSON 을 stdout
//   node scripts/target-supply.mjs --out=supply.json  # 파일로
//   --summary  $GITHUB_STEP_SUMMARY 에 마크다운 절을 덧붙인다
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (읽기에만 쓴다)

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { computeSupply, supplyLine } from '../lib/review/target-supply.ts'

const DAY_MS = 86_400_000

/** 1000행 단위로 끝까지 읽는다. 실패는 던진다(못 읽은 것을 0행으로 접지 않는다, §7.1). */
async function readAll(build, what) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(`${what} 조회 실패: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

/** 공급 계산 입력을 DB 에서 읽는다. target-revive.mjs 도 이걸 쓴다. */
export async function loadSupplyInputs(sb, now = new Date()) {
  const sources = await readAll(
    () => sb.from('review_sources').select('key, enabled, daily_request_cap, robots_status, tos_status, override').order('key'),
    'review_sources',
  )
  // ramp: 퍼센트·계획 칸이 없으면(마이그 미적용) 옛 칸만, 테이블도 없으면 null(= unavailable, 폴백은 표기된다).
  let ramps = null
  for (const cols of ['source_key, targets_per_run, cap_base, pct_step, schedule_plan', 'source_key, targets_per_run, cap_base, pct_step', 'source_key, targets_per_run']) {
    const { data, error } = await sb.from('review_source_ramp').select(cols)
    if (!error) {
      ramps = data
      break
    }
  }
  const targets = await readAll(
    () => sb.from('review_targets').select('id, source_key, status, product_ref, label, consecutive_empty').order('id'),
    'review_targets',
  )
  const since = new Date(now.getTime() - 14 * DAY_MS).toISOString()
  const runs = await readAll(
    () =>
      sb
        .from('review_collection_runs')
        .select('source_key, requests, targets_visited, new_reviews, blocked_responses, status, dry_run')
        .gte('started_at', since)
        .order('started_at'),
    'review_collection_runs',
  )
  return { now, sources, ramps, targets, runs }
}

export async function openDb() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  return sb
}

export function summaryMarkdown(report) {
  const lines = [
    '## 타깃 공급 (target-supply)',
    '',
    `- 생성 ${report.generated_at} · 활성 ${report.totals.active} · 비활성 ${report.totals.inactive} · ramp ${report.ramp_read}`,
    `- googleplay: ${report.googleplay.reason}`,
    `- 영역 활성(최소 ${report.areas['1'].minimum}): ` +
      ['1', '2', '3', '4', '5'].map((a) => `${a}=${report.areas[a].active}(${report.areas[a].state})`).join(' · '),
    `- 14일 신규 비중: ${Object.entries(report.share_new_reviews_14d).map(([k, v]) => `${k} ${v}%`).join(' · ') || '없음'}`,
    '',
    ...report.sources.map((s) => `- ${supplyLine(s)}`),
    '',
  ]
  return lines.join('\n')
}

export async function main(argv, { db } = {}) {
  const sb = db ?? (await openDb())
  const report = computeSupply(await loadSupplyInputs(sb))
  const out = argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2))
  if (argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(report))
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else for (const s of report.sources) console.log(supplyLine(s))
  return report
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ target-supply: ${e.message}`)
    process.exit(1)
  })
}
