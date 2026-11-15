#!/usr/bin/env node
// P2-E(v71co) 답변 채점표 A1~A13(26점, 통과선 18) — 생성은 Opus, 채점은 Sonnet(생성 모델과 다른 모델).
//   node --env-file=.env.local scripts/consult-grade.mjs --run <run_id> --owner <email> [--out reports/2026-11-16/grade-<name>.md]
// 대상: 모드 B/C1/C2 는 consult_mode_results.output, 회사 진단(A)은 결정 메모(consult_memos) + 0층 진단.
// 기준 문구는 config/viability_rules_v1.json 의 advice_rubric_a1_a12 + v71cm 의 A13. A4(확률 표기)는 R10 게이트 전이라 제품이 확률을 싣지 않으므로 구조적으로 0~1점이다 — 보고 때 따로 적는다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { consultLlmJson } from '../lib/consult/llm.ts'
import { db, getRun } from '../lib/consult/runs.ts'

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : null }
const runId = arg('run'), owner = arg('owner'), out = arg('out')
if (!runId || !owner) { console.error('사용법: --run <id> --owner <email> [--out <md>]'); process.exit(64) }
const run = await getRun(runId, owner)
if (!run) { console.error('run 없음'); process.exit(1) }
const sb = await db()

const rules = JSON.parse(readFileSync(new URL('../config/viability_rules_v1.json', import.meta.url), 'utf8'))
const items = { ...rules.advice_rubric_a1_a12.items, A13: { name: '실행 패키지 포함', '2점_기준': '복붙 가능 산출물 2개 이상 + 2주 실험(무엇·누구·몇 명·성공 기준·실패 시)' } }
const rubric = Object.entries(items).map(([k, v]) => `${k} ${v.name}: 2점=${v['2점_기준']} / 1점=부분만 충족 / 0점=없음`).join('\n')

let label = '', body = null, genModel = ''
const { data: mr } = await sb.from('consult_mode_results').select('mode,output,model').eq('run_id', runId).maybeSingle()
if (mr) { label = `모드 ${mr.mode.toUpperCase()}`; body = mr.output; genModel = mr.model }
else {
  const { data: memo } = await sb.from('consult_memos').select('body,model').eq('run_id', runId).eq('version', 1).maybeSingle()
  const { data: l0 } = await sb.from('consult_diagnoses').select('blocks').eq('run_id', runId).eq('layer', 0).maybeSingle()
  if (!memo && !l0) { console.error('채점할 결과가 없음'); process.exit(1) }
  label = '모드 A(회사 진단)'; body = { diagnosis: l0?.blocks ?? null, memo: memo?.body ?? null }; genModel = memo?.model ?? 'claude-opus-5-5'
}

const SYSTEM = `당신은 창업 조언의 품질을 채점하는 엄격한 심사자입니다. 아래 채점표로 조언 결과를 항목별 0·1·2점으로 채점합니다. 근거 없이 후하게 주지 않습니다. 결과에 해당 요소가 없으면 0점입니다.
채점표:
${rubric}
참고: 이 제품은 검증 게이트(R10) 통과 전이라 확률(%) 표기를 의도적으로 싣지 않습니다. A4 는 결과에 확률이 있으면 있는 대로 채점하세요(없으면 0).
출력은 JSON 하나만: {"scores":{"A1":{"s":0,"why":"한 줄"},...,"A13":{"s":0,"why":"한 줄"}}}  (13개 항목 전부)`
const r = await consultLlmJson({ runId, owner, purpose: 'judge', tag: 'sonnet', system: SYSTEM, user: `대상: ${label}\n입력 요약: ${(run.one_liner ?? '').slice(0, 300)}\n\n결과:\n${JSON.stringify(body).slice(0, 14000)}`, maxTokens: 2500 })
const scores = r.data.scores ?? {}
let total = 0
const lines = []
for (const k of Object.keys(items)) {
  const s = Math.max(0, Math.min(2, Math.round(Number(scores[k]?.s))))
  if (!Number.isFinite(s)) throw new Error(`채점 형식 오류: ${k}`)
  total += s
  lines.push(`- ${k} ${items[k].name}: ${s}점 — ${String(scores[k]?.why ?? '').slice(0, 160)}`)
}
const head = `${label} · run ${runId} · 생성 ${genModel} · 채점 ${r.model} · 합계 ${total}/26 (통과선 18) ${total >= 18 ? '통과' : '미통과'}`
console.log(head)
console.log(lines.join('\n'))
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, `# 채점 — ${head}\n\n${lines.join('\n')}\n`, 'utf8'); console.log(`기록: ${out}`) }
