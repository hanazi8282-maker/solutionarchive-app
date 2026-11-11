#!/usr/bin/env node
// 컨설팅 승인 테스트 시나리오 러너(v71ci) — 웹 라우트와 같은 파이프라인(lib/consult/pipeline.ts)을 로컬에서 끝까지 돌린다.
//   node --env-file=.env.local scripts/consult-scenario.mjs --owner you@x.com --kind company --url https://solutionarch.vercel.app --name 솔루션아카이브 --liner "..." [--scenario 1]
// 시나리오: ① solutionarch.vercel.app(얇은 회사) ② 시프티 ③ 남헌의 새 아이디어(--kind idea, url 없음).
// LLM 경로는 lib/consult/llm.ts 가 정한다(ANTHROPIC_API_KEY → claude-cli → mock). 결과는 DB(consult_*)에 남고 run id 를 찍는다.
import { createRun, db } from '../lib/consult/runs.ts'
import { collectAndStore, diagnoseLayer0, unlockLayer1 } from '../lib/consult/pipeline.ts'
import { activePath } from '../lib/consult/llm.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const owner = arg('owner')
const liner = arg('liner')
if (!owner || !liner) { console.error('사용법: --owner <email> --liner <한 줄 설명> [--kind company|idea] [--url ..] [--name ..] [--scenario 1]'); process.exit(64) }
const kind = arg('kind', 'company') === 'idea' ? 'idea' : 'company'
console.log(`LLM 경로: ${activePath()}`)
const run = await createRun(owner, { kind, name: arg('name'), url: arg('url'), oneLiner: liner, scenario: arg('scenario') })
console.log(`run ${run.id} 생성`)
await collectAndStore(run)
const { data: col } = await (await db()).from('consult_collected').select('thin,facts').eq('run_id', run.id).single()
console.log(`수집: 페이지 ${col.facts.pages.length}곳 · thin=${col.thin} · notes=${JSON.stringify(col.facts.notes)}`)
const t0 = Date.now()
await diagnoseLayer0(run)
const { data: dg } = await (await db()).from('consult_diagnoses').select('blocks,model,cost_usd').eq('run_id', run.id).eq('layer', 0).single()
console.log(`진단 완료 ${Math.round((Date.now() - t0) / 1000)}s · model=${dg.model} · $${dg.cost_usd}`)
console.log(JSON.stringify(dg.blocks, null, 2))

// 선택: 1층 해금(--nums 월대상자,전환율%,객단가만원) — 웹 해금 폼과 같은 함수.
const nums = arg('nums')
if (nums) {
  const [audience, rate_pct, value_man] = nums.split(',')
  const { parseUserNumbers } = await import('../lib/consult/report/ch1-l1-validate.ts')
  const t1 = Date.now()
  await unlockLayer1(run, parseUserNumbers({ audience, rate_pct, value_man }))
  const { data: d1 } = await (await db()).from('consult_diagnoses').select('blocks,cost_usd').eq('run_id', run.id).eq('layer', 1).single()
  console.log(`1층 완료 ${Math.round((Date.now() - t1) / 1000)}s · $${d1.cost_usd}`)
  console.log(JSON.stringify(d1.blocks, null, 2))
}
