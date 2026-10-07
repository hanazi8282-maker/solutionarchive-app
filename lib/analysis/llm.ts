// 소구점 파이프라인 공용 LLM 호출 레이어.
// extract(Stage1~2) 와 angle(Stage4) 이 같은 프로바이더 스위치를 공유한다.
// LLM_PROVIDER=gemini (기본) | claude-cli | anthropic | mock
//   claude-cli — `claude -p` 헤드리스(구독 OAuth, CLAUDE_CODE_OAUTH_TOKEN). Agent SDK 크레딧이 빠지는 경로다
//                (남헌 2026-09-25, reports/2026-09-25/agent-sdk-credit-plan.md). anthropic(SDK+API 키)는 크레딧과 무관.
//                실행 부품은 lib/insight/claude-cli.ts 를 그대로 쓴다(바이너리 확보·spawn·타임아웃).
// 프로바이더별로 다른 것은 "호출 방식과 텍스트를 꺼내는 방법" 뿐이고,
// 프롬프트·기대 JSON 스키마·파싱은 호출부가 그대로 공유한다.
import Anthropic from '@anthropic-ai/sdk'
// ⚠️ 확장자를 붙인다 — Node 가 타입 스트리핑으로 이 파일을 직접 로드한다(scripts/analyze-extract-run.mjs).
import { MOCK_MODEL, mockResponse } from './mock.ts'
import {
  LlmBudgetExceededError,
  MAX_ATTEMPTS,
  attemptsFor,
  backoffFor,
  chargeOutput,
  reserveOrThrow,
} from './budget.ts'
import { resolveClaudeBinary, runClaude } from '../insight/claude-cli.ts'

export type LlmProvider = 'gemini' | 'claude-cli' | 'anthropic' | 'mock'

const DEFAULT_PROVIDER: LlmProvider = 'gemini'

export function resolveProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'claude-cli' || raw === 'claude_cli') return 'claude-cli'
  if (raw === 'anthropic') return 'anthropic'
  if (raw === 'gemini') return 'gemini'
  if (raw === 'mock') return 'mock'
  return DEFAULT_PROVIDER
}

/** 이 프로바이더를 쓰려면 반드시 있어야 하는 환경변수. mock 은 아무것도 필요 없다. */
export function requiredKeyFor(
  provider: LlmProvider,
): 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY' | 'CLAUDE_CODE_OAUTH_TOKEN' | null {
  if (provider === 'mock') return null
  if (provider === 'claude-cli') return 'CLAUDE_CODE_OAUTH_TOKEN'
  return provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'
}

const ANTHROPIC_MODEL = 'claude-opus-5-5'
/** claude -p 는 모델을 CLI 기본값으로 쓴다. 추적용 라벨이라 실제 모델명이 아니다 — 응답 봉투의 model 을 우선 쓴다. */
const CLAUDE_CLI_LABEL = 'claude-cli'
/** 2026-09-30 남헌 결정: claude-cli 는 Sonnet 5.5 로 고정한다(정식 식별자). 'claude-sonnet-5' 는 5.0 이라 다른 모델이다. env CLAUDE_CLI_MODEL 로만 덮어쓴다. */
export const CLAUDE_CLI_DEFAULT_MODEL = 'claude-sonnet-5-5'
/**
 * callWithRetry 의 budgetChars 에 넣으면 달러 예산(budget.ts)을 타지 않는다.
 * claude-cli 는 구독 OAuth 라 청구액이 없다(2026-09-26 정정: $250 크레딧과도 무관). 추정 단가로 세는 "$5 하루 상한"은
 * 그 경로에서 비용을 재는 것도 구독 한도를 재는 것도 아니어서, 09-28 에 정상 실행을 요청당 $0.5 에서 끊었다(PR #329).
 * 폭주는 호출 수 상한(프로젝트·표본·하루 건수)과 CLI 한도 정지(isQuotaFailure)가 막는다. 실측 명목값은 봉투의 total_cost_usd.
 */
const UNMETERED = 0

// 모델별로 무료 티어 일일 요청 한도가 따로 걸린다(gemini-3.6-flash 는 20건/일).
// 그래서 단일 모델이 아니라 우선순위 배열로 두고, 한도가 소진되면(백오프를 다 쓰고도 429)
// 자동으로 다음 모델로 넘어간다. 앞쪽일수록 품질이 좋고 한도가 빡빡하다.
// gemini-2.5-flash 처럼 더는 제공되지 않는 모델은 404 가 나므로 이것도 다음으로 넘긴다.
const DEFAULT_GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const

/**
 * 실제로 시도할 Gemini 모델 순서.
 * GEMINI_MODEL 로 덮어쓸 수 있다(쉼표로 여러 개 나열하면 그게 우선순위 배열이 된다).
 * 특정 모델로만 재현해야 할 때 배열 전체를 한 개로 고정하는 용도.
 */
export function geminiModelChain(): string[] {
  const raw = process.env.GEMINI_MODEL?.trim()
  if (!raw) return [...DEFAULT_GEMINI_MODELS]
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  return list.length > 0 ? list : [...DEFAULT_GEMINI_MODELS]
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'

const MAX_OUTPUT_TOKENS = 32000

/** 모델이 요청 자체를 거부했을 때. 502가 아니라 사용자 메시지로 안내한다. */
export class ModelRefusalError extends Error {}

/** 프로바이더가 HTTP 에러를 돌려줬을 때. 402/429(사용량 한도)를 구분하기 위해 상태코드를 보존한다. */
export class ProviderHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * claude -p 프로세스 자체가 실패했을 때(exit≠0 · 봉투 is_error). 구독 사용량 한도도 여기로 오지만 **전부가 한도는 아니다.**
 * 2026-09-29 run 36511286722: 모델이 도구를 집어 `error_max_turns`(stop_reason tool_use)로 죽은 것을 한도로 읽고 24건을 멈췄다.
 * 그래서 한도는 봉투 api_error_status=429 또는 CLI_LIMIT_MARKERS 문구가 있을 때만이다(isCliLimitError). 나머지는 프로젝트 단위 실패.
 * 반환된 텍스트의 파싱·검증 실패는 이 타입이 아니다(callClaudeCli 가 돌아온 뒤에 난다) — 그건 프로젝트 단위 실패로 남는다.
 */
export class ClaudeCliError extends Error {
  timedOut: boolean
  /** 봉투 `api_error_status`(2.1.x). 429 면 문구와 무관하게 한도. 봉투가 없거나 필드가 없으면 null. */
  apiErrorStatus: number | null
  constructor(message: string, timedOut = false, apiErrorStatus: number | null = null) {
    super(message)
    this.timedOut = timedOut
    this.apiErrorStatus = apiErrorStatus
  }
}

/**
 * CLI 가 한도에 걸렸을 때 result 에 싣는 문구 표지. 실측: "Claude AI usage limit reached|<epoch>", "5-hour limit reached ∙ resets 3pm",
 * "You've hit your session limit · resets 5:50am", rate_limit(429). 문구가 바뀌면 한도가 프로젝트 단위 실패로 읽혀 배치가 계속 돌고
 * extract_attempts(상한 3)를 태운다 — 반대 방향(도구 실패를 한도로 읽어 밤새 0건)보다 그쪽이 싸다.
 */
export const CLI_LIMIT_MARKERS = /usage limit|limit reached|hit your [\w-]+ limit|session limit|rate[ _-]?limit|\b429\b|resets \d{1,2}(?::\d{2})?\s*[ap]m/i

/** CLI 실패가 한도인가. timeout 은 입력이 긴 그 프로젝트 하나의 문제(2026-09-28)라 언제나 아니다. */
export function isCliLimitError(e: ClaudeCliError): boolean {
  if (e.timedOut) return false
  return e.apiErrorStatus === 429 || CLI_LIMIT_MARKERS.test(e.message)
}

/** 우선순위 배열의 모든 Gemini 모델이 한도 소진/사용 불가였을 때. */
export class AllGeminiModelsExhaustedError extends Error {
  tried: string[]
  constructor(tried: string[]) {
    super(`오늘 사용 가능한 Gemini 모델이 모두 소진됨 (시도: ${tried.join(' → ')})`)
    this.tried = tried
  }
}

/**
 * "오늘은 다시 불러도 같다"는 실패인가 — 한도·예산 소진, 지속되는 과부하(503).
 * 야간 배치(scripts/extract-auto.mjs)가 다음 프로젝트로 넘어가지 않고 멈추는 기준이다.
 * HTTP 경로는 상태코드로, CLI 경로는 봉투 api_error_status·한도 문구 표지로 가른다(isCliLimitError). 모르는 실패는 한도가 아니다 —
 * §7.1 대로 "failed" 로 남기고 다음 프로젝트로 간다.
 */
export function isQuotaFailure(e: unknown): boolean {
  if (e instanceof LlmBudgetExceededError) return true
  if (e instanceof AllGeminiModelsExhaustedError) return true
  if (e instanceof ClaudeCliError) return isCliLimitError(e)
  return e instanceof ProviderHttpError && (e.status === 429 || e.status === 402 || e.status === 503)
}

/** 프로바이더가 돌려준 HTTP 상태로 사용자 문구를 고른다. */
export function describeFailure(e: unknown): string {
  // 예산 가드레일은 사유가 곧 사용자 안내다(얼마를 쓰고 멈췄는지).
  if (e instanceof LlmBudgetExceededError) return e.message
  if (e instanceof ModelRefusalError) return '분석이 거부되었습니다. 입력 내용을 확인해주세요.'
  // 모델을 전부 돌려본 뒤의 실패라 "다시 시도" 안내가 무의미하다. 메시지를 그대로 노출한다.
  if (e instanceof AllGeminiModelsExhaustedError) return e.message
  if (e instanceof ProviderHttpError && (e.status === 402 || e.status === 429)) {
    return `사용량 한도를 초과했습니다. (HTTP ${e.status})`
  }
  return e instanceof Error ? e.message : String(e)
}

/**
 * claude -p 한 번. 시스템 프롬프트와 사용자 프롬프트를 stdin 으로 이어 준다(`--system-prompt` 를 안 쓰는 이유:
 * 프롬프트가 길어 인자 상한에 걸릴 수 있고, insight 루프도 stdin 방식이다). `--output-format json` 봉투에서 result 를 꺼낸다.
 * 실패(exit≠0·timeout·is_error)는 ClaudeCliError 로 던진다 — ProviderHttpError 가 아니라 callWithRetry 가 재시도하지 않고 곧장 올린다
 * (사용량 한도를 4번 두드리지 않는다).
 */
async function callClaudeCli(systemPrompt: string, userPrompt: string): Promise<{ text: string; model: string; costUsd: number | null; cacheReadTokens: number | null }> {
  const bin = await resolveClaudeBinary()
  const res = await runClaude(
    bin.path,
    [
      '-p', '--output-format', 'json', '--max-turns', '1',
      // 도구 없음. `--max-turns 1` 만으로는 모델이 첫 턴에 도구를 집는 것을 못 막는다 — 그러면 답을 쓸 턴이 없어
      // is_error·error_max_turns·stop_reason=tool_use 로 죽는다(2026-09-29 run 36511286722, 입력 746건). `--tools ""` 는 2.1.0+.
      '--tools', '',
      // 모델은 항상 명시한다(기본 CLAUDE_CLI_DEFAULT_MODEL = Sonnet 5.5). CLI 기본값에 맡기면 계정·버전에 따라 바뀐다.
      '--model', process.env.CLAUDE_CLI_MODEL || CLAUDE_CLI_DEFAULT_MODEL,
    ],
    // 판정(짧은 출력)은 3분이면 넉넉하지만 6천 자 고쳐쓰기는 몇 분 걸린다 — 호출부가 env 로 늘린다(column-review.yml 900s).
    { timeoutMs: Number(process.env.LLM_CLAUDE_CLI_TIMEOUT_MS) > 0 ? Number(process.env.LLM_CLAUDE_CLI_TIMEOUT_MS) : 180_000, input: `${systemPrompt}\n\n---\n\n${userPrompt}` },
  )
  let env: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(res.stdout)
    if (parsed && typeof parsed === 'object') env = parsed as Record<string, unknown>
  } catch {
    // 봉투가 아니면 본문이 그대로 온 것이다.
  }
  tallyCli(env)
  if (res.exitCode !== 0 || env?.is_error === true) throw cliFailure(res, env)
  let text = res.stdout
  let model = CLAUDE_CLI_LABEL
  let costUsd: number | null = null
  let cacheReadTokens: number | null = null
  if (env) {
    if (typeof env.result === 'string') text = env.result
    if (typeof env.model === 'string' && env.model) model = env.model
    // 2026-10-01: `claude -p --output-format json` 봉투에는 최상위 model 이 없고 실제 모델은 modelUsage 의 키에 있다(실측 — 'claude-sonnet-5-5').
    // 이걸 안 읽으면 기록이 라벨 'claude-cli' 로만 남아 어떤 모델로 돌았는지 증명할 수 없다. 키가 여럿이면 '+' 로 잇는다.
    if (model === CLAUDE_CLI_LABEL && env.modelUsage && typeof env.modelUsage === 'object') {
      const used = Object.keys(env.modelUsage as Record<string, unknown>).filter(Boolean)
      if (used.length > 0) model = used.join('+')
    }
    // API 환산 명목값(청구액 아님). 슬롯 상한 재산정용으로 agent_run_steps.detail.cost_usd 에 남는다(설계 §3.4).
    if (typeof env.total_cost_usd === 'number' && Number.isFinite(env.total_cost_usd)) costUsd = env.total_cost_usd
    // 실측 비용·토큰. budget.ts 의 추정치와 별개다 — 보고에는 이 줄의 숫자를 쓴다(2026-09-26 정정).
    // result_chars·duration_api_ms 는 속도 진단용(2026-09-28): extract 1건 시간은 out 토큰에 비례하는데,
    // out 이 결과 글자 수에 비해 크면 사고(thinking) 토큰이 섞인 것이다. 그걸 가르는 숫자다.
    const u = (env.usage && typeof env.usage === 'object' ? env.usage : {}) as Record<string, unknown>
    if (typeof u.cache_read_input_tokens === 'number') cacheReadTokens = u.cache_read_input_tokens
    console.log(`[analysis/llm] claude-cli 실측 total_cost_usd=${String(env.total_cost_usd ?? 'n/a')} in=${String(u.input_tokens ?? '?')} out=${String(u.output_tokens ?? '?')} cache_read=${String(u.cache_read_input_tokens ?? '?')} cache_write=${String(u.cache_creation_input_tokens ?? '?')} result_chars=${typeof env.result === 'string' ? env.result.length : '?'} duration_api_ms=${String(env.duration_api_ms ?? '?')} model=${model}`)
  }
  return { text: text.trim(), model, costUsd, cacheReadTokens }
}

/**
 * 이 프로세스가 claude -p 에 쓴 명목 비용 누적(실패 호출 포함). 세션 한도 가드(session-guard.ts, 남헌 v30 §5)가
 * 단위마다 읽는다. 봉투에서 total_cost_usd 를 못 읽은 호출은 0 달러로 접지 않고 unknown 으로 센다(§7.1).
 */
const cliTally = { usd: 0, calls: 0, unknown: 0, maxCallUsd: 0 }
/** usd = 읽은 비용 합 · unknown = 비용을 못 읽은 호출 수(timeout SIGKILL·출력 상한 초과·봉투 없음) · maxCallUsd = 읽은 호출 1회 최대. */
export function cliSpent(): { usd: number; calls: number; unknown: number; maxCallUsd: number } {
  return { ...cliTally }
}
export function tallyCli(env: Record<string, unknown> | null): void {
  cliTally.calls += 1
  const c = env?.total_cost_usd
  if (typeof c === 'number' && Number.isFinite(c)) {
    cliTally.usd += c
    cliTally.maxCallUsd = Math.max(cliTally.maxCallUsd, c)
  } else cliTally.unknown += 1
}

/**
 * CLI 실패를 ClaudeCliError 로 만든다. 봉투가 있으면 subtype·stop_reason·num_turns·api_error_status·result 를 싣는다 —
 * 옛 방식(stdout 앞 300자)은 봉투 필드 순서상 result(한도 문구가 오는 자리)에 닿기 전에 잘렸다.
 */
export function cliFailure(res: { exitCode: number | null; timedOut: boolean; stdout: string; stderr: string }, env: Record<string, unknown> | null): ClaudeCliError {
  const head = `claude -p 실패 (exit ${res.exitCode ?? 'null'}${res.timedOut ? ', timeout' : ''})`
  if (!env) return new ClaudeCliError(`${head}: ${res.stderr.slice(0, 300)} ${res.stdout.slice(0, 300)}`.trim(), res.timedOut)
  const status = typeof env.api_error_status === 'number' ? env.api_error_status : null
  const detail = `subtype=${String(env.subtype ?? '?')} stop_reason=${String(env.stop_reason ?? '?')} num_turns=${String(env.num_turns ?? '?')}` +
    ` api_error_status=${String(status)} result=${String(env.result ?? '').slice(0, 300)} ${res.stderr.slice(0, 200)}`
  return new ClaudeCliError(`${head}: ${detail.trim()}`, res.timedOut, status)
}

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  // 기본 프로바이더가 gemini 이므로, ANTHROPIC_API_KEY 가 없는 환경에서
  // 모듈 로드만으로 SDK 생성자가 터지지 않도록 지연 생성한다.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let message
  try {
    message = await anthropic.messages
      .stream({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: 'medium' },
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
      .finalMessage()
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (typeof status === 'number') {
      throw new ProviderHttpError(status, `anthropic ${status}: ${e instanceof Error ? e.message : String(e)}`)
    }
    throw e
  }

  if (message.stop_reason === 'refusal') throw new ModelRefusalError('anthropic refused')

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
}

// Gemini generateContent 응답 중 우리가 실제로 쓰는 부분만 좁게 타이핑한다.
type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
}

async function callGemini(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY as string
  const url = `${GEMINI_BASE_URL}/v1beta/models/${model}:generateContent`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ProviderHttpError(res.status, `gemini(${model}) ${res.status}: ${detail.slice(0, 500)}`)
  }

  const json = (await res.json()) as GeminiResponse

  if (json.promptFeedback?.blockReason) {
    throw new ModelRefusalError(`gemini blocked: ${json.promptFeedback.blockReason}`)
  }

  const candidate = json.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new ModelRefusalError(`gemini finishReason: ${candidate.finishReason}`)
  }
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    console.warn(`[analysis/llm] gemini(${model}) finishReason:`, candidate.finishReason)
  }

  // thought 파트(사고 과정)는 본문이 아니므로 제외한다.
  return (candidate?.content?.parts ?? [])
    .filter(p => p?.thought !== true && typeof p?.text === 'string')
    .map(p => p.text as string)
    .join('')
    .trim()
}

// 일시적 장애로 보는 상태코드. 429(rate limit) 와 5xx 는 재시도할 가치가 있다.
// 402(크레딧 소진)·400(잘못된 요청)은 재시도해도 같은 결과라 제외한다.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function isRetryable(e: unknown): boolean {
  return e instanceof ProviderHttpError && RETRYABLE_STATUS.has(e.status)
}

/**
 * 모델 하나에 대해 재시도까지 포함한 1회 호출.
 * 일시적 장애(429/5xx)는 지수 백오프로 최대 4회까지 재시도한다 —
 * 앵글 생성처럼 호출을 여러 건 병렬로 던지면 503 하나에 배치 전체가 죽기 때문.
 * budgetChars 가 UNMETERED(0)면 달러 예산을 적립하지도 막지도 않는다(청구 없는 프로바이더).
 */
async function callWithRetry(
  label: string,
  model: string,
  run: () => Promise<string>,
  budgetChars = UNMETERED,
): Promise<string> {
  const metered = budgetChars > UNMETERED
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // 예산은 시도마다 적립한다 — 실패한 호출의 입력 토큰도 과금되기 때문.
      // 넘으면 여기서 던지고, 예산 초과는 재시도 대상이 아니다(아래 isRetryable=false).
      if (metered) reserveOrThrow(`${label}/${model}`, budgetChars)
      const text = await run()
      if (!text) throw new Error('empty model output')
      if (metered) chargeOutput(text.length)
      return text
    } catch (e) {
      lastError = e
      if (!isRetryable(e)) break
      // 상태코드별로 허용 시도 횟수가 다르다 — 429 는 2회(진단 1-3).
      const status = (e as ProviderHttpError).status
      const max = attemptsFor(status)
      if (attempt >= max) break
      // 지터를 섞어 동시 호출이 같은 시점에 몰려 재시도하는 것을 막는다.
      const wait = backoffFor(status, attempt) + Math.floor(Math.random() * 500)
      console.warn(
        `[analysis/llm] ${label} model=${model} ${status} — ${wait}ms 후 재시도 (${attempt}/${max})`,
      )
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw lastError
}

/**
 * 이 실패를 "이 모델은 오늘 못 쓴다"로 보고 다음 모델로 넘어갈지 판단한다.
 *  - 429: 백오프를 다 쓰고도 429 면 분당 한도가 아니라 일일 한도로 본다.
 *  - 404: 해당 키로는 제공되지 않는 모델. 배열에 미래/프리뷰 모델을 넣어두면 나는 실패라
 *         여기서 멈추면 배열을 두는 의미가 없다.
 * 그 밖의 실패(400·402·거부·5xx 지속)는 모델을 바꿔도 같은 결과이므로 즉시 던진다.
 */
function shouldFallOverToNextModel(e: unknown): boolean {
  return e instanceof ProviderHttpError && (e.status === 429 || e.status === 404)
}

/** 호출 결과 + 실제로 응답을 만든 모델명. "이 결과가 어느 모델이었는지" 추적용. */
export type LlmCall = {
  text: string
  model: string
  /** claude-cli 봉투의 total_cost_usd(API 환산 명목값). 다른 프로바이더·못 읽음은 없거나 null. */
  costUsd?: number | null
  /** claude-cli 봉투 usage.cache_read_input_tokens. 프롬프트 캐시가 실제로 걸렸는지 보는 숫자. */
  cacheReadTokens?: number | null
}

/**
 * 프로바이더에 무관하게 "모델이 낸 원문 텍스트"와 그 텍스트를 만든 모델명을 돌려준다.
 * gemini 는 우선순위 배열을 앞에서부터 시도하며, 한도 소진(429)·미제공(404)이면
 * 다음 모델로 넘어간다. 전부 소진되면 AllGeminiModelsExhaustedError.
 */
export async function callLlmWithModel(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  label = 'llm',
): Promise<LlmCall> {
  if (provider === 'mock') {
    // 지연 없이 즉시 반환한다. 실제 호출을 흉내낼 이유가 없다.
    console.log(`[analysis/llm] ${label} provider=mock model=${MOCK_MODEL} (API 호출 없음)`)
    return { text: mockResponse(label, userPrompt), model: MOCK_MODEL }
  }

  const budgetChars = systemPrompt.length + userPrompt.length

  if (provider === 'claude-cli') {
    let model = CLAUDE_CLI_LABEL
    let costUsd: number | null = null
    let cacheReadTokens: number | null = null
    const text = await callWithRetry(
      label,
      CLAUDE_CLI_LABEL,
      async () => { const r = await callClaudeCli(systemPrompt, userPrompt); model = r.model; costUsd = r.costUsd; cacheReadTokens = r.cacheReadTokens; return r.text },
      UNMETERED,
    )
    console.log(`[analysis/llm] ${label} provider=claude-cli model=${model}`)
    return { text, model, costUsd, cacheReadTokens }
  }
  if (provider === 'anthropic') {
    const text = await callWithRetry(
      label,
      ANTHROPIC_MODEL,
      () => callAnthropic(systemPrompt, userPrompt),
      budgetChars,
    )
    console.log(`[analysis/llm] ${label} provider=anthropic model=${ANTHROPIC_MODEL}`)
    return { text, model: ANTHROPIC_MODEL }
  }

  const chain = geminiModelChain()
  const tried: string[] = []
  for (const model of chain) {
    tried.push(model)
    try {
      const text = await callWithRetry(
        label,
        model,
        () => callGemini(model, systemPrompt, userPrompt),
        budgetChars,
      )
      console.log(`[analysis/llm] ${label} provider=gemini model=${model}`)
      return { text, model }
    } catch (e) {
      // 예산 초과는 모델을 바꿔도 같다. 체인을 끝까지 돌지 않고 즉시 중단한다.
      if (e instanceof LlmBudgetExceededError) throw e
      if (!shouldFallOverToNextModel(e)) throw e
      const status = (e as ProviderHttpError).status
      console.warn(
        `[analysis/llm] ${label} model=${model} ${status} — 이 모델은 사용 불가로 보고 다음 모델로 전환`,
      )
    }
  }
  throw new AllGeminiModelsExhaustedError(tried)
}

export type RotateResult =
  | { ok: true; text: string; model: string; failures: string[] }
  /** stop=true: 오늘은 다시 불러도 같다(예산·402/403·모든 모델 429/404) — 호출부는 멈춘다. false: 이 요청만 실패(내일 다시). */
  | { ok: false; stop: boolean; reason: string; failures: string[] }

/**
 * Gemini 모델 순환 호출 — callLlmWithModel('gemini') 체인은 503(과부하)에서 다음 모델로 넘어가지 않고 던진다.
 * 그래서 모델을 하나씩 돌리고(각 모델은 callWithRetry 로 자체 백오프), 한 바퀴가 다 실패하면 쉬었다가(baseWaitMs×바퀴) 다시 돈다.
 * 429·404 인 모델은 exhausted 에 넣어 이후 바퀴·호출에서 건너뛴다(여러 호출이 같은 Set 을 넘기면 실행 전체에서 공유).
 * 쓰는 곳: scripts/relevance-second-judge-auto.mjs(야간 2차) · scripts/t2-approval-eval.mjs(평가 하네스).
 * call·sleep 은 셀프테스트용 주입점이다.
 */
export async function callGeminiRotating(
  systemPrompt: string,
  userPrompt: string,
  label: string,
  opts: {
    models?: readonly string[]
    rounds?: number
    baseWaitMs?: number
    exhausted?: Set<string>
    call?: (model: string) => Promise<string>
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<RotateResult> {
  const models = opts.models ?? geminiModelChain()
  const rounds = opts.rounds ?? 4
  const baseWaitMs = opts.baseWaitMs ?? 30_000
  const exhausted = opts.exhausted ?? new Set<string>()
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const budgetChars = systemPrompt.length + userPrompt.length
  const call = opts.call ?? ((m: string) => callWithRetry(label, m, () => callGemini(m, systemPrompt, userPrompt), budgetChars))
  const failures: string[] = []

  for (let round = 0; round < rounds; round++) {
    for (const m of models) {
      if (exhausted.has(m)) continue
      try {
        const text = await call(m)
        console.log(`[analysis/llm] ${label} provider=gemini model=${m} (순환 ${round + 1}바퀴)`)
        return { ok: true, text, model: m, failures }
      } catch (e) {
        const status = e instanceof ProviderHttpError ? e.status : null
        failures.push(`${m}: ${status ?? ''} ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}`)
        if (e instanceof LlmBudgetExceededError || status === 402 || status === 403) {
          return { ok: false, stop: true, reason: describeFailure(e), failures }
        }
        if (status === 429 || status === 404) exhausted.add(m)
      }
    }
    if (models.every(m => exhausted.has(m))) {
      return { ok: false, stop: true, reason: new AllGeminiModelsExhaustedError([...models]).message, failures }
    }
    if (round < rounds - 1) await sleep(baseWaitMs * (round + 1))
  }
  return { ok: false, stop: false, reason: `모든 모델·${rounds}바퀴 실패`, failures }
}

/**
 * JSON 응답을 기대하는 호출. 모델이 간혹 설명문을 섞어 JSON 파싱이 깨지는데,
 * 그때 원문을 로그에 남기고 "JSON 만 출력하라"고 한 번 더 요청한다.
 * (원문을 남기지 않으면 실패 원인을 추적할 방법이 없다)
 * 재요청이 다른 모델로 넘어갈 수도 있으므로, 최종적으로 성공한 호출의 모델명을 돌려준다.
 */
export async function callLlmJsonWithModel(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  label = 'llm',
  /**
   * 원 호출 주입점. 기본은 callLlmWithModel. 리포트 앵글 검증(lib/cases/idea-angles-run.ts)이 JSON 재요청까지
   * 포함한 **실제 호출 수·모델·명목 비용**을 세려고 감싸 넘기고, 셀프테스트는 가짜 CLI 를 넘긴다.
   */
  raw: typeof callLlmWithModel = callLlmWithModel,
): Promise<{ data: Record<string, unknown>; model: string }> {
  const first = await raw(provider, systemPrompt, userPrompt, label)
  try {
    return { data: parseJsonObject(first.text), model: first.model }
  } catch {
    console.warn(
      `[analysis/llm] ${label}: JSON 파싱 실패 — 원문 앞 300자: ${JSON.stringify(first.text.slice(0, 300))}`,
    )
    const retry = await raw(
      provider,
      systemPrompt,
      `${userPrompt}\n\n(직전 응답이 JSON 형식이 아니었다. 어떤 설명도 붙이지 말고 지정된 JSON 객체 하나만 출력해라.)`,
      label,
    )
    try {
      return { data: parseJsonObject(retry.text), model: retry.model }
    } catch {
      throw new Error(
        `${label}: 모델 응답을 JSON 으로 해석하지 못했습니다. 원문 앞 200자: ${retry.text.slice(0, 200)}`,
      )
    }
  }
}

/** 코드블록/앞뒤 잡텍스트를 방어하며 JSON 객체를 추출한다. */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    return JSON.parse(stripped) as Record<string, unknown>
  } catch {
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('JSON object not found in model output')
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>
  }
}
