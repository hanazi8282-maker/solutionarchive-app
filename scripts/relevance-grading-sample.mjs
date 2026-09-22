#!/usr/bin/env node
// 리뷰 관련성 판정 수기 채점 표본(T3) — 남헌이 손으로 채점할 표를 뽑는다.
//
//   node --env-file=.env.local scripts/relevance-grading-sample.mjs
//   node --env-file=.env.local scripts/relevance-grading-sample.mjs --n 10 --seed 42 --dry
//
// 왜 있나: 게이트를 넣으면 "무관 비율" 의 측정자와 필터가 같은 모델이 된다. 그 숫자로 정밀도를
// 주장할 수 없다(remedy-grading-sample.mjs 와 같은 이유). 그래서 모델이 관련/무관으로 판정한 것에서
// 반반 섞어 뽑고, 사람이 채점한 결과를 relevance-grading-import.mjs 로 되돌려 넣는다.
//
// ★ 이 스크립트는 아무것도 채점하지 않는다. 체크박스는 전부 비어 있다. LLM 을 부르지 않는다.
//   unknown 판정은 표본에 넣지 않는다 — 채점해도 모델 정밀도를 재지 못한다.
//
// 종료코드: 0 성공(모집단 0건 포함) · 2 환경·조회 실패 · 64 사용법 오류

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { pickGradingSample } from '../lib/analysis/relevance-judge.ts'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

const n = Number(opt('n') ?? 10)
if (!Number.isFinite(n) || n <= 0) { console.error('사용법: [--n 10] [--seed 42] [--out <경로.md>] [--dry]'); process.exit(64) }
const seed = Number(opt('seed') ?? 42)

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const outPath = opt('out') ?? `reports/${today}/relevance-grading-sample.md`

const supabase = await createClient()
if (!supabase) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

// 모집단 = 아직 사람이 채점하지 않은 관련/무관 판정.
const { data: verdicts, error } = await supabase
  .from('review_relevance_verdicts')
  .select('input_id, project_id, verdict, reason')
  .in('verdict', ['relevant', 'irrelevant'])
  .is('human_verdict', null)
if (error) { console.error(`✗ 판정 조회 실패: ${error.code ?? ''} ${error.message}`); process.exit(2) }

if (!verdicts || verdicts.length === 0) {
  console.log('모집단 0건 — 아직 채점할 판정이 없다(실패가 아니다). 먼저 scripts/relevance-judge-auto.mjs 를 돌려라.')
  process.exit(0)
}

const { data: inputs, error: inputsError } = await supabase
  .from('analysis_inputs')
  .select('id, raw_text')
  .in('id', verdicts.map((v) => v.input_id))
if (inputsError) { console.error(`✗ 원문 조회 실패: ${inputsError.message}`); process.exit(2) }
const textById = new Map((inputs ?? []).map((i) => [i.id, i.raw_text ?? '']))

const { data: projects } = await supabase.from('analysis_projects').select('id, product_elevator_pitch')
const projectById = new Map((projects ?? []).map((p) => [p.id, p.product_elevator_pitch ?? '(소개 없음)']))

// 원문이 폐기된 행(raw_text null)은 채점할 게 없다.
const pool = verdicts
  .filter((v) => (textById.get(v.input_id) ?? '').trim().length > 0)
  .map((v) => ({
    input_id: v.input_id,
    verdict: v.verdict,
    reason: v.reason,
    project: projectById.get(v.project_id) ?? '(프로젝트 미상)',
    text: textById.get(v.input_id),
  }))

const sample = pickGradingSample(pool, { n, seed })
if (sample.length === 0) { console.log('모집단은 있으나 원문이 남은 것이 0건이다 — 채점할 것이 없다(실패가 아니다).'); process.exit(0) }

const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*[\r\n]+\s*/g, ' ').trim()
const cut = (s, n2) => (String(s ?? '').length > n2 ? `${String(s).slice(0, n2)}…` : String(s ?? ''))

const lines = [
  `# 리뷰 목적 적합성 수기 채점 표본 — ${today}`,
  '',
  `모집단 ${pool.length}건(관련/무관 판정 중 사람 채점 전) 에서 ${sample.length}장. seed=${seed}.`,
  `내역: 모델이 관련이라 한 것 ${sample.filter((r) => r.verdict === 'relevant').length}장 · 무관이라 한 것 ${sample.filter((r) => r.verdict === 'irrelevant').length}장 (표에는 섞여 있다).`,
  '',
  '**채점하는 법**: 이 리뷰가 그 프로젝트의 분석 재료로 쓸 만하면 `관련`, 다른 주제이거나 내용이 없으면 `무관` 에 `x` 를 넣는다.',
  '판단이 서지 않으면 **둘 다 비워 둔다** — 빈 줄은 "판정 불가" 이지 "무관" 이 아니다(CLAUDE.md §7.1).',
  '모델 판정 열은 **채점 뒤에 보라**. 먼저 보면 그 답에 끌린다.',
  '',
  '마지막 열 `키` 는 채점을 `review_relevance_verdicts.human_verdict` 로 되돌려 넣기 위한 것이다. 건드리지 않는다.',
  `되돌려 넣기: \`node --env-file=.env.local scripts/relevance-grading-import.mjs ${outPath} --dry\` 로 먼저 본다.`,
  '',
  '| # | 프로젝트 | 리뷰 원문 | 관련 ☐ | 무관 ☐ | 모델 판정 | 키 |',
  '|---|---|---|---|---|---|---|',
  ...sample.map((r, i) =>
    `| ${i + 1} | ${md(cut(r.project, 30))} | ${md(cut(r.text, 400))} | ☐ | ☐ | ${r.verdict === 'relevant' ? '관련' : '무관'}${r.reason ? ` (${md(cut(r.reason, 60))})` : ''} | \`${r.input_id}\` |`,
  ),
  '',
]

const body = lines.join('\n')
if (dry) {
  console.log(body)
  console.log(`\n--dry: 파일을 쓰지 않았다. 쓸 자리는 ${outPath}`)
  process.exit(0)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, body, 'utf8')
console.log(`모집단 ${pool.length}건 → 표본 ${sample.length}장 (seed=${seed})`)
console.log(`  ${outPath}`)
console.log('체크박스는 전부 비어 있다 — 채점은 사람이 한다.')
