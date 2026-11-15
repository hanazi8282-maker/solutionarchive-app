#!/usr/bin/env node
// P1-D(v71co) 에이전트 왕복 실측 — 기존 run 에 질문 5개를 순서대로 보내고 답·도구 호출 수·비용을 찍는다.
//   node --env-file=.env.local scripts/consult-agent-roundtrip.mjs --run <run_id> --owner <email>
// 기준: 현재 chatTurn 은 한 턴에 최대 MAX_STEPS(도구 호출 포함)이고 "질문 5개 고정" 설계는 코드에 없다. 질문 5개를 1회씩 보내는 것을 1왕복으로 센다.
import { getRun, db } from '../lib/consult/runs.ts'
import { chatTurn } from '../lib/consult/agent.ts'

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : null }
const runId = arg('run')
const owner = arg('owner')
if (!runId || !owner) { console.error('사용법: --run <id> --owner <email>'); process.exit(64) }
const run = await getRun(runId, owner)
if (!run) { console.error('run 없음'); process.exit(1) }
const QS = [
  '이 진단에서 가장 먼저 해야 할 일 하나만 알려 주세요.',
  '비슷한 회사 사례가 있으면 보여 주세요.',
  '월 방문자 3,000명, 전환율 2%, 객단가 30만원이면 손실이 얼마인가요?',
  '왜 그 단계에서 끊겼다고 보시나요?',
  '이 결정을 접어야 하는 조건은 무엇인가요?',
]
for (const q of QS) {
  const t0 = Date.now()
  const a = await chatTurn(run, q)
  console.log(`Q: ${q}\nA(${Math.round((Date.now() - t0) / 1000)}s): ${a.slice(0, 300)}\n`)
}
const sb = await db()
const { data: u } = await sb.from('llm_usage').select('cost_usd').eq('run_id', runId).eq('purpose', 'chat')
const { data: m } = await sb.from('consult_messages').select('tool').eq('run_id', runId).eq('role', 'tool')
console.log(`chat 호출 ${u.length}회 · 도구 호출 ${m.length}회 · 합계 $${u.reduce((s, r) => s + Number(r.cost_usd), 0).toFixed(3)}`)
