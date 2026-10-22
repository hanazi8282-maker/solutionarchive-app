#!/usr/bin/env node
// 판정 정체 감시(v71bb ⑮) — 미판정이 남았는데 처리가 멈췄는지 본다. 판정은 lib/analysis/session-guard.ts relevanceStallDecision 한 벌.
//   node scripts/relevance-stall-watch.mjs [--gh-file=<gh run list JSON>] [--act]
//   · 기본(대장 모드): 판정 한 줄만 stdout(bottleneck-watch 가 한도 대장에 붙인다). DB·변수 쓰기 없음.
//   · --act(collect-gap-watchdog): GITHUB_OUTPUT 에 rerun=true|false·reason, alert 면 Notion 일일 상태 로그 CTO 행에 한 줄(표식 [판정 정체], 하루 한 행).
//     재실행(gh workflow run) 자체는 워크플로가 한다 — 이 스크립트는 정하기만 한다.
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (읽기만) · NOTION_API_TOKEN(--act 의 alert 때만)
// 종료코드: 0 판정함(정상·정체 포함) · 1 실행 이력 조회 실패(확인 불가 — §7.1, 정상으로 접지 않는다)
import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { QUOTA_COOLDOWN_MS } from '../lib/analysis/extract-auto.ts'
import { loadRecentRuns, relevanceStallDecision, stallLine } from '../lib/analysis/session-guard.ts'
import { kstDate, upsertStatusLog } from './notion-status-log.mjs'

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const act = process.argv.includes('--act')
const now = new Date()

let gh = null
const ghFile = arg('gh-file')
if (ghFile) {
  try { const j = JSON.parse(fs.readFileSync(ghFile, 'utf8')); gh = Array.isArray(j) ? j : null } catch { gh = null }
}
const sb = await createClient()
const rows = sb ? await loadRecentRuns(sb, now) : null
const s = relevanceStallDecision(rows, gh, { now, cooldownMs: QUOTA_COOLDOWN_MS })
console.log(stallLine(s) + (gh ? '' : ' (실행 이력 gh 미조회 — 연속 실패 갈래는 감시자 몫)'))

if (act) {
  const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${String(v).replace(/[\r\n]+/g, ' ')}\n`) }
  out('rerun', s.rerun ? 'true' : 'false')
  out('kind', s.kind)
  out('reason', s.reason)
  if (s.alert) {
    // 사람판단필요=false — 실패·정체는 "막힘 사실"이라 §11 기준 밖이다(막힌것·다음할일에만).
    const w = await upsertStatusLog({
      date: kstDate(now), track: 'CTO',
      // DRY(GAP_WATCHDOG_DRY≠false)면 워크플로가 실제로 걸지 않는다 — "걸었다"고 적지 않는다.
      done: !s.rerun ? '' : process.env.DRY === 'false' ? `판정 정체 감시가 판정을 1회 다시 걸었다(${s.kind})` : `[DRY] 판정 정체 — 재실행 대상(${s.kind}), 실제로 걸지는 않음`,
      blocked: `[${now.toISOString().slice(11, 16)}Z] ${s.reason}`,
      next: s.rerun ? '재실행 결과(판정 건수)를 다음 병목 점검에서 확인' : '정지 사유 확인 — 자동 재실행 대상이 아니다',
      needsHuman: false,
    }, { marker: '[판정 정체]' })
    console.log(w.ok ? `Notion 기록: ${w.title}` : `::warning::Notion 기록 실패 — ${w.stage}: ${w.error}`)
  }
}
process.exit(rows ? 0 : 1)
