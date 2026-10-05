#!/usr/bin/env node
// 옛 인용(source_key 없음) 입력 대조 백필 — 규칙·되돌리기 설명은 lib/analysis/quote-backfill.ts, 절차는
// reports/2026-10-06/quote-backfill-runbook.md.
//
//   node --env-file=.env.local scripts/quote-backfill.mjs                     # = --measure: 읽기만. 한 줄 요약 + JSON
//   node --env-file=.env.local scripts/quote-backfill.mjs --apply             # 드라이런: 같은 요약 + 바뀔 행 예시 3건. 쓰기 없음
//   node --env-file=.env.local scripts/quote-backfill.mjs --apply --run       # 실제 UPDATE(행 단위). 원값은 .tmp-quote-backfill-<시각>.jsonl
//   node --env-file=.env.local scripts/quote-backfill.mjs --rollback [--run]  # 표식(backfill='qb-v1') 항목에서 더한 키를 뗀다. 기본 드라이런
//   옵션: --batch N(기본 200, 이 행 수마다 진행 로그·휴식) --pause MS(기본 500)
// 종료코드: 0 정상 · 2 설정/조회 실패 · 3 쓰기 중 오류(이미 쓴 행은 --rollback 으로 되돌린다) · 64 인자 오류
//
// ⚠️ 서비스키가 필요하다 — 서브에이전트에 넘기지 않는다(CLAUDE.md §10.1). 오케스트레이터가 직접 돌린다.

import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { planBackfill, planRollback, summaryLine, writeChanges } from '../lib/analysis/quote-backfill.ts'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d }
const mode = has('--rollback') ? 'rollback' : has('--apply') ? 'apply' : 'measure'
const run = has('--run')
const batch = num('--batch', 200), pauseMs = num('--pause', 500)
if (!Number.isInteger(batch) || batch < 1 || !Number.isInteger(pauseMs) || pauseMs < 0) { console.error('--batch ≥1, --pause ≥0 정수'); process.exit(64) }
if (run && mode === 'measure') { console.error('--run 은 --apply 또는 --rollback 과 함께'); process.exit(64) }
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

let changes
try {
  if (mode === 'rollback') {
    changes = await planRollback(sb)
    log(`rollback 대상 속성 ${changes.length}건`)
  } else {
    const plan = await planBackfill(sb)
    changes = plan.changes
    log(summaryLine(plan.summary))
    console.log(JSON.stringify(plan.summary))
  }
} catch (e) { console.error(`✗ ${e instanceof Error ? e.message : String(e)}`); process.exit(2) }

if (mode === 'measure') process.exit(0)
if (!run) {
  for (const c of changes.slice(0, 3)) console.log(JSON.stringify({ id: c.id, before: c.before, after: c.after }))
  log(`드라이런 — 쓰기 없음. --run 을 붙이면 ${changes.length}행 UPDATE(${batch}행마다 ${pauseMs}ms 휴식).`)
  process.exit(0)
}

// 원값 백업 — UPDATE 전에 한 줄씩. 리뷰 원문 조각이라 공개 리포에 올리지 않는다(.tmp-* 는 .gitignore).
const backupPath = `.tmp-quote-backfill-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
const r = await writeChanges(sb, changes, {
  batch, pauseMs, log,
  backup: (c) => fs.appendFileSync(backupPath, JSON.stringify({ id: c.id, before: c.before }) + '\n'),
})
log(`${mode} 끝 — updated=${r.updated} gone=${r.gone}(그 사이 재추출로 사라진 행) / ${changes.length} · 원값 ${backupPath}`)
if (r.error) { console.error(`✗ 쓰기 오류로 중단: ${r.error}`); process.exit(3) }
