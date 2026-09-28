// LLM 프로바이더 스위치·예산 적용 범위 셀프테스트 — 네트워크·LLM 없음.
//   node scripts/llm-provider-selftest.mjs
import fs from 'node:fs'
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

// 하루 예산 — env 한 줄. 옛 BOOST/UNTIL(크레딧 기간 한시 상향)은 2026-09-29 에 뺐다: 있어도 무시돼야 한다.
t('env 비면 5', dailyBudgetFor({}), 5)
t('LLM_DAILY_BUDGET_USD 그대로', dailyBudgetFor({ LLM_DAILY_BUDGET_USD: '20' }), 20)
t('0·음수·문자는 기본 5', dailyBudgetFor({ LLM_DAILY_BUDGET_USD: '-1' }), 5)
t('옛 BOOST/UNTIL 은 무시', dailyBudgetFor({ LLM_DAILY_BUDGET_USD: '5', LLM_DAILY_BUDGET_BOOST_USD: '15', LLM_DAILY_BUDGET_BOOST_UNTIL: '2099-01-01' }), 5)

// 예산 적용 범위 — claude-cli(구독)는 달러 예산 밖, 청구되는 프로바이더는 안. llm.ts 소스를 정적으로 고정한다
// (실제 호출은 CLI 바이너리가 필요해 여기서 못 돌린다). 되돌아가면 09-28 처럼 정상 실행이 추정 예산에 끊긴다(PR #329).
const llmSrc = fs.readFileSync(new URL('../lib/analysis/llm.ts', import.meta.url), 'utf8')
// lastIndexOf — 같은 조건문이 requiredKeyFor 에도 한 번 더 있다(그건 키 이름 분기).
const cliBranch = llmSrc.slice(llmSrc.lastIndexOf("if (provider === 'claude-cli')"), llmSrc.lastIndexOf("if (provider === 'anthropic')"))
t('claude-cli 분기는 UNMETERED 로 부른다', /callWithRetry\([\s\S]*?UNMETERED,\s*\)/.test(cliBranch), true)
t('claude-cli 분기에 budgetChars 를 넘기지 않는다', /budgetChars/.test(cliBranch), false)
t('callWithRetry 는 metered 일 때만 예산을 적립한다', /if \(metered\) reserveOrThrow\(/.test(llmSrc) && /if \(metered\) chargeOutput\(/.test(llmSrc), true)
t('anthropic·gemini 분기는 여전히 budgetChars 를 넘긴다', (llmSrc.match(/^\s*budgetChars,\s*$/gm) ?? []).length >= 2, true)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('프로바이더 어휘·예산 기본값·예산 적용 범위(claude-cli 미터링 없음) 중 하나가 틀렸다.'); process.exit(1) }
console.log('프로바이더 스위치·예산 범위·CLI 실패 분류 정상 — claude-cli 는 OAuth 토큰·달러 예산 밖, 한도는 멈춤·timeout 은 계속.')
