#!/usr/bin/env node
// T14 — v4 골든 샘플(creazy·gazet) 대조(v71cj 작업 4). 입력(URL·한 줄 설명)은 research_store 공개 출처에서 복원했다.
//   node --env-file=.env.local scripts/consult-t14.mjs [--owner you@x.com]
// 같은 입력으로 R3(0층 진단)을 돌려 항목별로 본다: 판정(untapped=gap, 시프티·solutionarch 회귀=leak), 카테고리 위치, 손실 범위 부호. 토큰 자카드 유사도는 쓰지 않는다.
// v4 원문은 DB 에서만 읽고 출력에는 헤드라인 비교 수치만 남긴다(공개 리포 규칙).
import { createRun, db } from '../lib/consult/runs.ts'
import { collectAndStore, diagnoseLayer0 } from '../lib/consult/pipeline.ts'
import { capExceeded } from '../lib/consult/usage.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const owner = arg('owner') ?? (process.env.AUTH_ALLOWED_EMAILS ?? '').split(',')[0]?.trim()
const CASES = [
  { subject: 'creazy', name: '크리에이지', url: 'https://creazy.app', liner: '스마트스토어·쿠팡 셀러가 AI로 상세페이지를 만드는 구독형 서비스입니다. 크레딧을 사서 쓰고 구독 요금제가 있습니다.', diagId: 55, expect: 'gap', pos: /상세s*페이지/ },
  { subject: 'gazet', name: '가제트', url: 'https://gazet.ai', liner: 'AI가 블로그 글을 써서 네이버에 자동으로 발행해 주는 서비스입니다. 무료 코인으로 시작하고 멤버십을 판매합니다.', diagId: 56, expect: 'gap', pos: /블로그/ },
  // 회귀: 누수로 유지돼야 하는 두 곳(v71ck 4). v4 행 없음.
  { subject: 'shiftee', name: '시프티', url: 'https://shiftee.io', liner: '근태관리·급여 자동화 SaaS 입니다. 중소기업이 출퇴근 기록과 급여 계산을 한 곳에서 처리합니다.', diagId: null, expect: 'leak', pos: /근태|급여|HR/ },
  { subject: 'solutionarch', name: '솔루션아카이브', url: 'https://solutionarch.vercel.app', liner: '창업자의 결정을 검증해 주고 최선의 방법까지 찾아주는 AI 컨설턴트입니다. 무료 진단 뒤 월 구독으로 결정 메모를 제공합니다.', diagId: null, expect: 'leak', pos: /컨설|진단|창업/ },
]
if (await capExceeded()) { console.error('비용 상한 도달'); process.exit(4) }
const sb = await db()
let total = 0, ok = 0
for (const c of CASES) {
  const v4 = c.diagId ? (await sb.from('research_store').select('body').eq('id', c.diagId).single()).data : null
  const run = await createRun(owner, { kind: 'company', name: c.name, url: c.url, oneLiner: c.liner, scenario: 't14' })
  await collectAndStore(run)
  const t0 = Date.now()
  await diagnoseLayer0(run)
  const { data: d } = await sb.from('consult_diagnoses').select('blocks,cost_usd').eq('run_id', run.id).eq('layer', 0).single()
  const ch = d.blocks
  const lossOk = ch.loss.low_man > 0 && ch.loss.high_man >= ch.loss.low_man
  const judgeOk = ch.leak_or_gap.kind === c.expect
  const posOk = c.pos.test(ch.position.category + ' ' + ch.position.where)
  console.log(`
[${c.subject}] run=${run.id} ${Math.round((Date.now() - t0) / 1000)}s ${d.cost_usd}`)
  console.log(`  판정 일치(기대 ${c.expect} ↔ 자동 ${ch.leak_or_gap.kind}): ${judgeOk ? '일치' : '불일치'}`)
  console.log(`  위치 일치(${ch.position.category}): ${posOk ? '일치' : '불일치'}`)
  console.log(`  손실 범위 ${ch.loss.low_man}~${ch.loss.high_man}만원 부호: ${lossOk ? '정상' : '이상'}`)
  console.log(`  자동 헤드라인: ${ch.headline}`)
  if (v4) console.log(`  v4 헤드라인:   ${v4.body.headline}`)
  total += 3; ok += Number(judgeOk) + Number(posOk) + Number(lossOk)
}
console.log(`
항목별 일치 ${ok}/${total} (판정·위치·부호)`)
process.exitCode = ok === total ? 0 : 1
