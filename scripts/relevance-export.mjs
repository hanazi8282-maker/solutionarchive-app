#!/usr/bin/env node
// T2 2차 판정 export — 공개 대상 행을 클라우드 세션이 읽을 파일로 뽑는다. 판정·라벨은 싣지 않는다(눈가림).
//
//   node --env-file=.env.local scripts/relevance-export.mjs [--out ops/state/relevance-export-<날짜>.json] [--limit N] [--all]
//
// 기본 대상: 공개 대상(사람 채점 relevant 또는 사람 채점 없음+LLM relevant) + 원문 미폐기. --all 이면 판정 무관 전부(irrelevant 포함 — 2차 판정이 1차를 뒤집을 여지를 남긴다).
// 서비스키가 있는 환경(로컬 .env.local / Actions)에서 돈다. DB 쓰기 없음. 결과 파일은 ops/state/ 라 무인 루프 커밋 화이트리스트 안이다.
// 종료코드: 0 정상 · 2 조회 실패

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { toExportRow, EXPORT_TEXT_MAX } from '../lib/analysis/second-opinion.ts'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
const all = args.includes('--all')
const limit = Number(opt('limit') ?? Infinity)
const date = kstDate()
const outPath = opt('out') ?? path.join('ops', 'state', `relevance-export-${date}.json`)

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }

const rows = []
for (let from = 0; ; from += 1000) {
  let q = sb.from('review_relevance_verdicts')
    .select('input_id, project_id, analysis_inputs!inner(raw_text, purged_at), analysis_projects(product_elevator_pitch)')
    .is('analysis_inputs.purged_at', null)
    .order('input_id').range(from, from + 999)
  if (!all) q = q.or('human_verdict.eq.relevant,and(human_verdict.is.null,verdict.eq.relevant)')
  const { data, error } = await q
  if (error) { console.error(`✗ 조회 실패: ${error.code ?? ''} ${error.message}`); process.exit(2) }
  rows.push(...data)
  if (data.length < 1000) break
}
const out = rows.slice(0, limit).map((r) => toExportRow({ input_id: r.input_id, project_id: r.project_id, raw_text: r.analysis_inputs?.raw_text ?? null, pitch: r.analysis_projects?.product_elevator_pitch ?? null }))
  .filter((r) => r.text.length > 0)
const doc = {
  exported_at: new Date().toISOString(), scope: all ? 'all' : 'public', text_max: EXPORT_TEXT_MAX, count: out.length,
  instructions: '각 행을 독립적으로 판정: verdict(relevant|irrelevant|unknown) · impact/frequency(high|mid|low|null) · community_signal(pain|demand|objection|null) · wtp_mentioned(true|false|null) · reason(한 줄). 결과는 같은 input_id 로 {rows:[...]} 형태의 relevance-second-opinion-<날짜>.json. 기존 판정은 이 파일에 없다 — 보지 말고 판정하라.',
  rows: out,
}
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n')
console.log(`✅ ${outPath} — ${out.length}행 (범위 ${doc.scope}, 원문 ${EXPORT_TEXT_MAX}자, 판정·라벨 미포함)`)
