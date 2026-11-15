#!/usr/bin/env node
// 컨설팅 모드 B/C1/C2 승인 테스트 러너(v71co) — 웹 라우트와 같은 코드(lib/consult/modes.ts)를 로컬에서 돌려 v71cm 샘플 3건을 재현한다.
//   node --env-file=.env.local scripts/consult-modes-run.mjs --owner you@x.com [--only b|c1|c2]
// 기대 판정(샘플 재현): B=순서_바꿈 · C1=끊긴 다리 4 · C2=1순위 후보에 4대보험·급여명세서. 결과 URL 은 SITE/consult/m/<id>.
import { runMode } from '../lib/consult/modes.ts'
import { db } from '../lib/consult/runs.ts'
import { activePath } from '../lib/consult/llm.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const owner = arg('owner')
if (!owner) { console.error('사용법: --owner <email> [--only b|c1|c2]'); process.exit(64) }
const only = arg('only')
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://solutionarch.vercel.app'
console.log(`LLM 경로: ${activePath()}`)

const SAMPLES = {
  b: { mode: 'b', company: '솔루션아카이브', decision: '결론서를 월 29,000원 구독으로 팔고 환불 보증을 붙인다', context: '콜드메일 33통을 보냈고 회신 0, 유료 고객 0, 신청 0. 결론서를 받은 곳 중 재방문 데이터는 없음.' },
  c1: { mode: 'c1', idea: '네일샵·미용실 노쇼를 줄이는 예약금 결제 SaaS', conditions: '개발 가능, 자본 300만원, 미용실 사장 지인 3명(좋다고 말함, 결제 약속은 없음)' },
  c2: { mode: 'c2', tech: '개발 가능(풀스택)', capital: '500만원', hours: '월 60시간', access: '소상공인(음식·미용) 사장님 접점이 있음' },
}

for (const [k, input] of Object.entries(SAMPLES)) {
  if (only && only !== k) continue
  const t0 = Date.now()
  try {
    const id = await runMode(owner, input)
    const { data } = await (await db()).from('consult_mode_results').select('output,model,cost_usd').eq('run_id', id).single()
    const o = data.output
    const headline = k === 'b' ? `판정=${o.verdict} · 고치려는 다리=${o.target_stage} · 앞 비어 있음=${o.blocked_earlier_stage}`
      : k === 'c1' ? `끊긴 다리=${o.blocked_stage} · 그다음=${o.secondary_blocked_stage}`
      : `1순위=${o.candidates[o.top_pick.index].name}`
    console.log(`[${k}] ${Math.round((Date.now() - t0) / 1000)}s · $${data.cost_usd} · ${data.model}\n  ${headline}\n  ${SITE}/consult/m/${id}`)
  } catch (e) {
    console.log(`[${k}] 실패 ${Math.round((Date.now() - t0) / 1000)}s: ${e instanceof Error ? e.message : e}`)
  }
}
