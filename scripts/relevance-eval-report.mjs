#!/usr/bin/env node
// T2 관련성 판정 평가 리포트 — 사람 채점(human_verdict) 대비 LLM 판정(verdict) 일치율을 모델별로 낸다.
//
//   node --env-file=.env.local scripts/relevance-eval-report.mjs            # 마크다운을 stdout 으로
//   node --env-file=.env.local scripts/relevance-eval-report.mjs --out reports/2026-09-25/relevance-eval.md
//
// 왜: 프로바이더를 gemini → claude-cli 로 바꾸면(2026-09-25 결정 a) "어느 쪽이 사람과 더 맞나"를 숫자로 봐야 한다.
//     측정자와 필터가 같은 모델이면 정밀도를 주장할 수 없으므로(relevance-grading-sample.mjs), 기준은 항상 사람 채점이다.
//     nightly-relevance.yml 이 매일 실행해 GITHUB_STEP_SUMMARY 에 남긴다(증량 싱크 8번). 읽기 전용, LLM 호출 0.
//
// 세는 것(모델별): n · 일치 · relevant 기준 정밀도/재현율 · 불일치 목록. 사람 채점이 없으면 "표본 없음"으로 끝낸다(0% 가 아니다, §7.1).
// 종료코드: 0 정상(표본 0 포함) · 2 조회 실패

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '../lib/supabase/server.ts'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outPath = outIdx >= 0 ? args[outIdx + 1] : null

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('review_relevance_verdicts')
    .select('input_id, project_id, model, verdict, human_verdict, human_graded_at, judged_at')
    .not('human_verdict', 'is', null)
    .order('input_id')
    .range(from, from + 999)
  if (error) { console.error(`✗ 조회 실패: ${error.code ?? ''} ${error.message}`); process.exit(2) }
  rows.push(...data)
  if (data.length < 1000) break
}

export function summarize(rows) {
  const byModel = new Map()
  for (const r of rows) {
    const m = r.model ?? '(모델 미기재)'
    if (!byModel.has(m)) byModel.set(m, { n: 0, agree: 0, tp: 0, fp: 0, fn: 0, unknown: 0, disagreements: [] })
    const s = byModel.get(m)
    s.n++
    if (r.verdict === 'unknown') { s.unknown++; continue }
    if (r.verdict === r.human_verdict) s.agree++
    else s.disagreements.push(r)
    if (r.verdict === 'relevant' && r.human_verdict === 'relevant') s.tp++
    if (r.verdict === 'relevant' && r.human_verdict !== 'relevant') s.fp++
    if (r.verdict !== 'relevant' && r.human_verdict === 'relevant') s.fn++
  }
  return byModel
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—')
const byModel = summarize(rows)
const L = []
L.push(`## T2 관련성 판정 — 사람 채점 대비 일치율 (${new Date().toISOString().slice(0, 10)} UTC)`)
L.push('')
if (rows.length === 0) {
  L.push('- 사람 채점 표본 없음 — 일치율을 낼 수 없다(0% 아님). `relevance-grading-sample.mjs` → 채점 → `relevance-grading-import.mjs`.')
} else {
  L.push(`- 사람 채점 표본 ${rows.length}행 · 모델 ${byModel.size}종`)
  for (const [m, s] of [...byModel.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const judged = s.n - s.unknown
    L.push(`- **${m}**: n ${s.n} · 일치 ${s.agree}/${judged} (${pct(s.agree, judged)}) · relevant 정밀도 ${pct(s.tp, s.tp + s.fp)} · 재현율 ${pct(s.tp, s.tp + s.fn)}${s.unknown ? ` · unknown ${s.unknown}` : ''}`)
    for (const d of s.disagreements.slice(0, 10)) {
      L.push(`  - 불일치 ${d.input_id.slice(0, 8)} · LLM=${d.verdict} · 사람=${d.human_verdict}`)
    }
  }
  L.push('')
  L.push('표본이 30행 미만이면 모델 간 비교는 참고만. 판단 근거는 사람 채점을 더 쌓은 뒤(`relevance-grading-sample.mjs --n 20`).')
}
const md = L.join('\n') + '\n'
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, md)
  console.log(`✅ ${outPath} (${rows.length}행)`)
} else {
  process.stdout.write(md)
}
