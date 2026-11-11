#!/usr/bin/env node
// T14 — v4 골든 샘플(creazy·gazet) 대조(v71cj 작업 4). 입력(URL·한 줄 설명)은 research_store 공개 출처에서 복원했다.
//   node --env-file=.env.local scripts/consult-t14.mjs [--owner you@x.com]
// 같은 입력으로 R3(0층 진단)을 돌려 research_store kind=diagnosis(ids 55·56)와 비교한다: 유형(leak/gap↔untapped), 카테고리 위치, 손실 범위 부호·자릿수, 헤드라인 유사도.
// v4 원문은 DB 에서만 읽고 출력에는 헤드라인 비교 수치만 남긴다(공개 리포 규칙).
import { createRun, db } from '../lib/consult/runs.ts'
import { collectAndStore, diagnoseLayer0 } from '../lib/consult/pipeline.ts'
import { capExceeded } from '../lib/consult/usage.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const owner = arg('owner') ?? (process.env.AUTH_ALLOWED_EMAILS ?? '').split(',')[0]?.trim()
const CASES = [
  { subject: 'creazy', name: '크리에이지', url: 'https://creazy.app', liner: '스마트스토어·쿠팡 셀러가 AI로 상세페이지를 만드는 구독형 서비스입니다. 크레딧을 사서 쓰고 구독 요금제가 있습니다.', diagId: 55 },
  { subject: 'gazet', name: '가제트', url: 'https://gazet.ai', liner: 'AI가 블로그 글을 써서 네이버에 자동으로 발행해 주는 서비스입니다. 무료 코인으로 시작하고 멤버십을 판매합니다.', diagId: 56 },
]
const tok = (s) => new Set((s.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((w) => w.slice(0, 3)))
const jac = (a, b) => { const A = tok(a), B = tok(b); let i = 0; for (const x of A) if (B.has(x)) i++; return A.size + B.size - i ? i / (A.size + B.size - i) : 0 }
if (await capExceeded()) { console.error('비용 상한 도달'); process.exit(4) }
const sb = await db()
for (const c of CASES) {
  const { data: v4 } = await sb.from('research_store').select('body').eq('id', c.diagId).single()
  const run = await createRun(owner, { kind: 'company', name: c.name, url: c.url, oneLiner: c.liner, scenario: 't14' })
  await collectAndStore(run)
  const t0 = Date.now()
  await diagnoseLayer0(run)
  const { data: d } = await sb.from('consult_diagnoses').select('blocks,cost_usd').eq('run_id', run.id).eq('layer', 0).single()
  const ch = d.blocks
  const v4type = v4.body.type // untapped = 아직 비어 있는 길
  const typeOk = v4type === 'untapped' ? ch.leak_or_gap.kind === 'gap' : ch.leak_or_gap.kind === 'leak'
  const sim = jac(ch.headline + ' ' + ch.leak_or_gap.title, v4.body.headline + ' ' + v4.body.decision)
  const lossOk = ch.loss.low_man > 0 && ch.loss.high_man >= ch.loss.low_man
  console.log(`\n[${c.subject}] run=${run.id} ${Math.round((Date.now() - t0) / 1000)}s $${d.cost_usd}`)
  console.log(`  유형 일치(v4=${v4type} ↔ 자동=${ch.leak_or_gap.kind}): ${typeOk ? '일치' : '불일치'}`)
  console.log(`  카테고리 위치: ${ch.position.category} / ${ch.position.where}`)
  console.log(`  손실 범위 ${ch.loss.low_man}~${ch.loss.high_man}만원 (부호·순서 ${lossOk ? '정상' : '이상'})`)
  console.log(`  헤드라인 유사도(토큰 자카드) ${sim.toFixed(2)}`)
  console.log(`  자동 헤드라인: ${ch.headline}`)
  console.log(`  v4 헤드라인:   ${v4.body.headline}`)
}
