// LLM 프로바이더 스위치·한시 예산 셀프테스트 — 네트워크·LLM 없음.
//   node scripts/llm-provider-selftest.mjs
import { resolveProvider, requiredKeyFor, isQuotaFailure, ClaudeCliError } from '../lib/analysis/llm.ts'
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

// claude-cli 실패 분류 — 한도는 배치를 멈추고(남은 프로젝트의 extract_attempts 를 안 태운다), timeout 은 그 프로젝트만 실패.
t('CLI 사용량 한도(exit 1) → 멈춤', isQuotaFailure(new ClaudeCliError('claude -p 실패 (exit 1): Claude AI usage limit reached')), true)
t('CLI 봉투 is_error → 멈춤', isQuotaFailure(new ClaudeCliError('claude 가 오류를 보고했다: 5-hour limit reached')), true)
t('CLI timeout → 계속(프로젝트 단위)', isQuotaFailure(new ClaudeCliError('claude -p 실패 (exit null, timeout): ', true)), false)
t('파싱 실패(일반 Error) → 계속', isQuotaFailure(new Error('JSON 파싱 실패')), false)

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
console.log('프로바이더 스위치·한시 예산·CLI 실패 분류 정상 — claude-cli 는 OAuth 토큰, 한도는 멈춤·timeout 은 계속, 11/5 뒤 자동 $5.')
