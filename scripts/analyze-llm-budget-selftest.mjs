#!/usr/bin/env node
// LLM 재시도 예산·비용 가드레일 셀프테스트 (진단 1-3). 네트워크·LLM 없음.
//
// 고정하는 것:
//   1. 429 재시도 예산이 함수 상한(maxDuration 300초)을 넘지 않는다.
//   2. 요청당/하루 비용 상한이 **실제로 호출을 막는다**(로그만 남기지 않는다).

import {
  attemptsFor,
  worstCaseWaitMs,
  withLlmBudget,
  reserveOrThrow,
  chargeOutput,
  resetDaily,
  dailySpent,
  requestSpent,
  usdFor,
  tokensOf,
  LlmBudgetExceededError,
  REQUEST_BUDGET_USD,
  DAILY_BUDGET_USD,
} from '../lib/analysis/budget.ts'

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) pass++
  else {
    fail++
    console.log(`❌ ${name}`)
  }
}
const throws = (fn) => {
  try {
    fn()
    return false
  } catch (e) {
    return e instanceof LlmBudgetExceededError
  }
}

// ── 1) 재시도 예산 ───────────────────────────────────────────────
const fs = await import('node:fs')
const llmSrc = fs.readFileSync('lib/analysis/llm.ts', 'utf-8')

// 상한은 코드에서 읽는다 — 상수를 여기 베껴 두면 route 가 바뀌어도 테스트는 초록이다(§7.1).
const MAX_DURATION_MS =
  Number(/export const maxDuration = (\d+)/.exec(fs.readFileSync('app/api/analyze/angle/route.ts', 'utf-8'))[1]) * 1000
const MODELS = (/const DEFAULT_GEMINI_MODELS = \[([\s\S]*?)\]/.exec(llmSrc)[1].match(/'/g).length) / 2

ok('429 는 모델당 2회까지만', attemptsFor(429) === 2)
ok('5xx 는 기존대로 4회', attemptsFor(503) === 4)
{
  const worst = worstCaseWaitMs(429, MODELS)
  ok(`429 최악 대기(${(worst / 1000).toFixed(0)}초)가 함수 상한 300초보다 작다`, worst < MAX_DURATION_MS)
  // 옛 설정(모델당 4회)이면 20+40+80=140초 × 5 = 700초로 상한을 넘었다.
  ok('옛 설정(4회)이었다면 상한을 넘었다 — 회귀 확인용', 20_000 * (1 + 2 + 4) * MODELS > MAX_DURATION_MS)
  const worst5xx = worstCaseWaitMs(503, MODELS)
  ok(`5xx 최악 대기(${(worst5xx / 1000).toFixed(1)}초)도 상한 안`, worst5xx < MAX_DURATION_MS)
}

// ── 2) 비용 환산 ─────────────────────────────────────────────────
ok('토큰 환산은 보수적(2자=1토큰)', tokensOf(1000) === 500)
ok('입력만 있는 비용은 0 보다 크다', usdFor(20_000, 0) > 0)
ok('출력 단가가 입력보다 비싸다', usdFor(0, 1000) > usdFor(2000, 0))

// ── 3) 요청당 상한 ───────────────────────────────────────────────
await withLlmBudget(async () => {
  resetDaily()
  reserveOrThrow('t1', 20_000)
  ok('요청 컨텍스트 안에서 누적된다', requestSpent().spentUsd > 0)
  ok('호출 수도 센다', requestSpent().calls === 1)
  chargeOutput(4000)

  // 상한을 넘길 만큼 큰 입력 한 방
  const huge = Math.ceil((REQUEST_BUDGET_USD * 1_000_000 * 2) / 0.5) * 4
  ok('요청 상한을 넘기면 던진다', throws(() => reserveOrThrow('t2', huge)))
  ok('막힌 뒤에도 누적은 유지(조용히 리셋되지 않는다)', requestSpent().spentUsd > 0)
})
ok('컨텍스트 밖이면 요청 누적이 없다', requestSpent() === null)

// ── 4) 하루 상한 ─────────────────────────────────────────────────
{
  resetDaily()
  const before = dailySpent().spentUsd
  ok('리셋 직후 0', before === 0)
  // 컨텍스트 밖에서도 하루 상한은 적용된다.
  reserveOrThrow('t3', 10_000)
  ok('컨텍스트 밖 호출도 하루 누적에 쌓인다', dailySpent().spentUsd > 0)

  const huge = Math.ceil((DAILY_BUDGET_USD * 1_000_000 * 2) / 0.5) * 4
  ok('하루 상한을 넘기면 던진다', throws(() => reserveOrThrow('t4', huge)))
  const msg = (() => {
    try {
      reserveOrThrow('t5', huge)
    } catch (e) {
      return e.message
    }
  })()
  ok('메시지에 상한값이 들어 있다', msg.includes(String(DAILY_BUDGET_USD)))
  ok('메시지에 조정 방법(env)이 들어 있다', msg.includes('LLM_DAILY_BUDGET_USD'))
  resetDaily()
}

// ── 5) 진입점이 예산 컨텍스트로 감싸져 있는가 ────────────────────
{
  const angle = fs.readFileSync('app/api/analyze/angle/route.ts', 'utf-8')
  const extract = fs.readFileSync('app/api/analyze/extract/route.ts', 'utf-8')
  ok('앵글 배치가 withLlmBudget 안에서 돈다', /withLlmBudget\(\s*\(\)\s*=>\s*\n?\s*mapWithLimit/.test(angle))
  ok('추출 백그라운드 작업이 withLlmBudget 안에서 돈다', /after\(\(\) => withLlmBudget\(/.test(extract))
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
console.log(
  `- 429 최악 대기 ${(worstCaseWaitMs(429, MODELS) / 1000).toFixed(0)}초 / 상한 300초 · 요청 예산 $${REQUEST_BUDGET_USD} · 하루 예산 $${DAILY_BUDGET_USD}`,
)
if (fail) {
  console.log('재시도 예산 또는 비용 가드레일이 뚫렸다. 쿼터만 태우고 산출물 0 이 된다(진단 1-3).')
  process.exitCode = 1
} else {
  console.log('LLM 예산 정상 — 429 재시도 상한·요청/하루 비용 상한·진입점 래핑 확인.')
}
