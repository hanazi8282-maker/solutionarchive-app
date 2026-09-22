#!/usr/bin/env node
// 채점표 → review_relevance_verdicts.human_verdict (T3 되먹임).
//
//   node --env-file=.env.local scripts/relevance-grading-import.mjs reports/2026-09-23/relevance-grading-sample.md --dry
//   node --env-file=.env.local scripts/relevance-grading-import.mjs reports/2026-09-23/relevance-grading-sample.md
//
// 채점표는 scripts/relevance-grading-sample.mjs 가 만든 마크다운이다. 키 열의 input_id 만 신뢰한다.
//
// 지키는 것
//   · 둘 다 비어 있는 줄은 **건너뛴다**. 빈칸은 "판정 불가" 이지 무관이 아니다(§7.1).
//   · 둘 다 체크된 줄은 사람 실수다 — 적용하지 않고 목록으로 보고한다.
//   · 사람 채점만 쓴다(human_verdict·human_graded_at). LLM 판정(verdict)·model·reason 은 건드리지 않는다.
//   · 판정 행이 없는 input_id 는 만들지 않는다 — 채점표가 다른 DB 에서 온 것이라는 뜻이다.
//
// 종료코드: 0 성공 · 2 환경·조회·저장 실패 · 64 사용법 오류

import { readFileSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { parseGradingMarkdown } from '../lib/analysis/relevance-judge.ts'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const path = args.find((a) => !a.startsWith('--'))
if (!path) { console.error('사용법: scripts/relevance-grading-import.mjs <채점표.md> [--dry]'); process.exit(64) }

let md
try { md = readFileSync(path, 'utf8') } catch (e) { console.error(`✗ 파일을 읽지 못했다: ${e.message}`); process.exit(64) }

const { marks, blank, conflict } = parseGradingMarkdown(md)
console.log(`채점표 ${path} — 채점 ${marks.length}건 · 빈칸(판정 불가) ${blank}건 · 양쪽 체크(무시) ${conflict.length}건`)
for (const k of conflict) console.log(`  ⚠️ 양쪽 체크라 건너뛴다: ${k}`)

if (marks.length === 0) { console.log('적용할 채점이 없다. 끝.'); process.exit(0) }

const counts = marks.reduce((acc, m) => ({ ...acc, [m.verdict]: (acc[m.verdict] ?? 0) + 1 }), {})
console.log(`  관련 ${counts.relevant ?? 0}건 · 무관 ${counts.irrelevant ?? 0}건`)

if (dry) {
  for (const m of marks) console.log(`  ${m.input_id} → ${m.verdict}`)
  console.log('--dry: DB 를 쓰지 않았다.')
  process.exit(0)
}

const supabase = await createClient()
if (!supabase) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

// 있는 행만 갱신한다. UPSERT 를 쓰면 verdict·model NOT NULL 때문에 가짜 LLM 판정을 지어내야 한다.
const { data: existing, error: existingError } = await supabase
  .from('review_relevance_verdicts')
  .select('input_id')
  .in('input_id', marks.map((m) => m.input_id))
if (existingError) { console.error(`✗ 판정 행 조회 실패: ${existingError.code ?? ''} ${existingError.message}`); process.exit(2) }
const known = new Set((existing ?? []).map((r) => r.input_id))

const missing = marks.filter((m) => !known.has(m.input_id))
for (const m of missing) console.log(`  ⚠️ 판정 행이 없어 건너뛴다(다른 DB 의 표인가): ${m.input_id}`)

const now = new Date().toISOString()
let applied = 0
let failed = 0
for (const m of marks.filter((x) => known.has(x.input_id))) {
  const { error } = await supabase
    .from('review_relevance_verdicts')
    .update({ human_verdict: m.verdict, human_graded_at: now })
    .eq('input_id', m.input_id)
  if (error) { failed += 1; console.error(`✗ ${m.input_id} 저장 실패: ${error.code ?? ''} ${error.message}`) }
  else applied += 1
}

console.log(`적용 ${applied}건 · 실패 ${failed}건 · 행 없음 ${missing.length}건 · 빈칸 ${blank}건`)
console.log('다음 야간 판정부터 이 채점이 few-shot 으로 들어간다.')
process.exit(failed > 0 ? 2 : 0)
