// LLM 프로바이더 스위치·한시 예산 셀프테스트 — 네트워크·LLM 없음.
//   node scripts/llm-provider-selftest.mjs
import { resolveProvider, requiredKeyFor } from '../lib/analysis/llm.ts'
import { dailyBudgetFor } from '../lib/analysis/budget.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${g} want=${w}`) } }

// 프로바이더 어휘
const withEnv = (v, fn) => { const prev = process.env.LLM_PROVIDER; if (v == null) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = v; try { return fn() } finally { if (prev == null) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev } }
t('미설정 → gemini', withEnv(undefined, resolveProvider), 'gemini')
t('claude-cli', withEnv('claude-cli', resolveProvider), 'claude-cli')
t('claude_cli 도 받는다', withEnv('CLAUDE_CLI', resolveProvider), 'claude-cli')
t('anthropic', withEnv('anthropic', resolveProvider), 'anthropic')
t('모르는 값 → gemini(기본)', withEnv('opus', resolveProvider), 'gemini')
t('claude-cli 필수 키 = CLAUDE_CODE_OAUTH_TOKEN', requiredKeyFor('claude-cli'), 'CLAUDE_CODE_OAUTH_TOKEN')
t('anthropic 필수 키 = ANTHROPIC_API_KEY (크레딧 경로 아님)', requiredKeyFor('anthropic'), 'ANTHROPIC_API_KEY')
t('mock 은 키 없음', requiredKeyFor('mock'), null)

// 한시 예산 — 날짜 경계
const env = { LLM_DAILY_BUDGET_USD: '5', LLM_DAILY_BUDGET_BOOST_USD: '15', LLM_DAILY_BUDGET_BOOST_UNTIL: '2026-11-05' }
t('기간 안(9/25) → 15', dailyBudgetFor(env, new Date('2026-09-25T00:00:00Z')), 15)
t('마지막 날(11/5 23:59 UTC) → 15', dailyBudgetFor(env, new Date('2026-11-05T23:59:59Z')), 15)
t('다음 날(11/6 00:00 UTC) → 5 자동 복귀', dailyBudgetFor(env, new Date('2026-11-06T00:00:00Z')), 5)
t('BOOST 없음 → 기본', dailyBudgetFor({ LLM_DAILY_BUDGET_USD: '5' }, new Date('2026-09-25T00:00:00Z')), 5)
t('UNTIL 형식 틀림 → 기본', dailyBudgetFor({ ...env, LLM_DAILY_BUDGET_BOOST_UNTIL: '11/05' }, new Date('2026-09-25T00:00:00Z')), 5)
t('기본이 더 크면 기본 유지', dailyBudgetFor({ ...env, LLM_DAILY_BUDGET_USD: '20' }, new Date('2026-09-25T00:00:00Z')), 20)
t('env 비면 5', dailyBudgetFor({}, new Date()), 5)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('프로바이더 어휘나 한시 예산 날짜 경계가 틀렸다.'); process.exit(1) }
console.log('프로바이더 스위치·한시 예산 정상 — claude-cli 는 OAuth 토큰, 11/5 뒤 자동 $5.')
