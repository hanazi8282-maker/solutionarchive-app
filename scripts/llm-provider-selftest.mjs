// LLM 프로바이더 스위치·예산 적용 범위 셀프테스트 — 네트워크·LLM 없음.
//   node scripts/llm-provider-selftest.mjs
import fs from 'node:fs'
import { resolveProvider, requiredKeyFor, isQuotaFailure, ClaudeCliError, cliFailure } from '../lib/analysis/llm.ts'
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
// 2026-09-29 run 36511286722 — 모델이 도구를 집어 error_max_turns 로 죽은 것. 한도가 아니다: 그 프로젝트만 failed, 다음으로.
const TOOL_USE_FAIL = 'claude -p 실패 (exit 1): {"is_error":true,"duration_api_ms":121008,"num_turns":2,"stop_reason":"tool_use","session_id":"x","total_cost_usd":0.4576,"usage":{"output_tokens":11219}}'
t('도구 호출 실패(stop_reason tool_use) → 계속', isQuotaFailure(new ClaudeCliError(TOOL_USE_FAIL)), false)
t('봉투 error_max_turns → 계속', isQuotaFailure(cliFailure({ exitCode: 1, timedOut: false, stdout: '{"is_error":true,"subtype":"error_max_turns","stop_reason":"tool_use","num_turns":2}', stderr: '' }, { is_error: true, subtype: 'error_max_turns', stop_reason: 'tool_use', num_turns: 2 })), false)
t('세션 한도 문구 → 멈춤', isQuotaFailure(new ClaudeCliError("claude 가 오류를 보고했다: You've hit your session limit · resets 5:50am")), true)
t('rate_limit 429 문구 → 멈춤', isQuotaFailure(new ClaudeCliError('claude -p 실패 (exit 1): API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}')), true)
t('봉투 api_error_status=429 → 문구 없어도 멈춤', isQuotaFailure(cliFailure({ exitCode: 1, timedOut: false, stdout: '', stderr: '' }, { is_error: true, api_error_status: 429, result: '' })), true)
t('한도 문구라도 timeout 이면 계속', isQuotaFailure(new ClaudeCliError('claude -p 실패 (exit null, timeout): usage limit', true)), false)
// 실패 메시지가 result(한도 문구 자리)를 싣는다 — 옛 stdout 앞 300자는 봉투 필드 순서상 result 에 닿기 전에 잘렸다.
t('cliFailure 가 봉투 result·subtype 을 메시지에 싣는다', /subtype=error_max_turns stop_reason=tool_use num_turns=2 api_error_status=null result=5-hour limit reached/.test(cliFailure({ exitCode: 1, timedOut: false, stdout: 'x'.repeat(400), stderr: '' }, { subtype: 'error_max_turns', stop_reason: 'tool_use', num_turns: 2, result: '5-hour limit reached' }).message), true)
// 도구 없음 — 프로필·extract·판정은 전부 이 한 호출을 탄다. `--max-turns 1` 만으로는 첫 턴 도구 호출을 못 막는다.
t("callClaudeCli 가 --tools '' 로 도구를 끈다", /'--max-turns', '1',[\s\S]{0,400}'--tools', '',/.test(fs.readFileSync(new URL('../lib/analysis/llm.ts', import.meta.url), 'utf8')), true)
t('insight 경로도 도구를 끈다', /'--max-turns',\s*'1',[\s\S]{0,300}'--tools',\s*'',/.test(fs.readFileSync(new URL('../lib/insight/llm.ts', import.meta.url), 'utf8')), true)

// Sonnet 5.5 고정(2026-09-30) — 'claude-sonnet-5' 는 5.0 이라 다른 모델이다(실호출로 확인). 스레드·칼럼·인사이트 소넷 호출은 정식 식별자만 쓴다.
for (const f of ['../lib/insight/llm.ts', '../scripts/column-feedback.mjs']) {
  const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8')
  t(`${f} 에 5.0 식별자 없음`, /claude-sonnet-5(?!-5)/.test(src), false)
  t(`${f} 가 claude-sonnet-5-5 를 쓴다`, src.includes('claude-sonnet-5-5'), true)
}
t('칼럼 검수는 CLAUDE_CLI_MODEL 을 Sonnet 5.5 로 기본 고정', /CLAUDE_CLI_MODEL ||= 'claude-sonnet-5-5'/.test(fs.readFileSync(new URL('../scripts/column-review-claude.mjs', import.meta.url), 'utf8')), true)

// 별칭 sonnet 도 쓰지 않는다(2026-09-30) — 별칭은 움직이는 값이라 고정이 아니다. 워크플로 env·에이전트 model·스크립트 기본값은 정식 식별자만.
for (const f of ['../.github/workflows/nightly-extract.yml', '../.github/workflows/competitor-profile-backfill.yml', '../.github/workflows/relevance-translate.yml']) {
  const line = (fs.readFileSync(new URL(f, import.meta.url), 'utf8').match(/CLAUDE_CLI_MODEL:.*/) ?? [''])[0]
  t(`${f} CLAUDE_CLI_MODEL 은 정식 식별자`, /claude-sonnet-5-5/.test(line) && !/'sonnet'|:s*sonnet/.test(line), true)
}
for (const a of ['qa-verifier', 'sa-cmo-analyst', 'sa-cto-data']) {
  t(`.claude/agents/${a}.md model 은 정식 식별자`, /^model: claude-sonnet-5-5s*$/m.test(fs.readFileSync(new URL(`../.claude/agents/${a}.md`, import.meta.url), 'utf8')), true)
}

// Opus 도 5.5 로 고정(2026-09-30) — 'claude-opus-5' 는 5.0 이라 다른 모델이다(실호출로 확인). 에이전트 model 은 별칭이 아니라 정식 식별자만.
t('analysis/llm.ts ANTHROPIC_MODEL 은 claude-opus-5-5', /ANTHROPIC_MODEL = 'claude-opus-5-5'/.test(fs.readFileSync(new URL('../lib/analysis/llm.ts', import.meta.url), 'utf8')), true)
for (const a of fs.readdirSync(new URL('../.claude/agents/', import.meta.url))) {
  const m = fs.readFileSync(new URL(`../.claude/agents/${a}`, import.meta.url), 'utf8').match(/^model:s*(S+)/m)?.[1]
  t(`.claude/agents/${a} model 은 별칭이 아니다`, m == null || !['opus', 'sonnet', 'haiku'].includes(m), true)
}

// claude-cli 는 항상 Sonnet 5.5 를 명시한다(2026-09-30) — CLI 기본값에 맡기지 않는다. 5.0 식별자·별칭은 기본값이 될 수 없다.
const llmSrcPin = fs.readFileSync(new URL('../lib/analysis/llm.ts', import.meta.url), 'utf8')
t("CLAUDE_CLI_DEFAULT_MODEL 은 claude-sonnet-5-5", /export const CLAUDE_CLI_DEFAULT_MODEL = 'claude-sonnet-5-5'/.test(llmSrcPin), true)
t('callClaudeCli 는 --model 을 항상 넘긴다(env 없으면 기본값)', /'--model', process.env.CLAUDE_CLI_MODEL || CLAUDE_CLI_DEFAULT_MODEL/.test(llmSrcPin), true)
t('cmo-daily 의 claude -p 세 호출은 모두 --model claude-sonnet-5-5', (fs.readFileSync(new URL('./cmo-daily.mjs', import.meta.url), 'utf8').match(/'--model', 'claude-sonnet-5-5'/g) ?? []).length, 3)

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
