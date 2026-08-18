// 소구점 파이프라인 공용 LLM 호출 레이어.
// extract(Stage1~2) 와 angle(Stage4) 이 같은 프로바이더 스위치를 공유한다.
// LLM_PROVIDER=gemini (기본) | anthropic | mock
// 프로바이더별로 다른 것은 "호출 방식과 텍스트를 꺼내는 방법" 뿐이고,
// 프롬프트·기대 JSON 스키마·파싱은 호출부가 그대로 공유한다.
import Anthropic from '@anthropic-ai/sdk'
import { MOCK_MODEL, mockResponse } from './mock'

export type LlmProvider = 'gemini' | 'anthropic' | 'mock'

const DEFAULT_PROVIDER: LlmProvider = 'gemini'

export function resolveProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'anthropic') return 'anthropic'
  if (raw === 'gemini') return 'gemini'
  if (raw === 'mock') return 'mock'
  return DEFAULT_PROVIDER
}

/** 이 프로바이더를 쓰려면 반드시 있어야 하는 환경변수. mock 은 아무것도 필요 없다. */
export function requiredKeyFor(
  provider: LlmProvider,
): 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY' | null {
  if (provider === 'mock') return null
  return provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'
}

const ANTHROPIC_MODEL = 'claude-opus-5'

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

/** 우선순위 배열의 모든 Gemini 모델이 한도 소진/사용 불가였을 때. */
export class AllGeminiModelsExhaustedError extends Error {
  tried: string[]
  constructor(tried: string[]) {
    super(`오늘 사용 가능한 Gemini 모델이 모두 소진됨 (시도: ${tried.join(' → ')})`)
    this.tried = tried
  }
}

/** 프로바이더가 돌려준 HTTP 상태로 사용자 문구를 고른다. */
export function describeFailure(e: unknown): string {
  if (e instanceof ModelRefusalError) return '분석이 거부되었습니다. 입력 내용을 확인해주세요.'
  // 모델을 전부 돌려본 뒤의 실패라 "다시 시도" 안내가 무의미하다. 메시지를 그대로 노출한다.
  if (e instanceof AllGeminiModelsExhaustedError) return e.message
  if (e instanceof ProviderHttpError && (e.status === 402 || e.status === 429)) {
    return `사용량 한도를 초과했습니다. (HTTP ${e.status})`
  }
  return e instanceof Error ? e.message : String(e)
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
const MAX_ATTEMPTS = 4
// 5xx(일시 과부하)는 금방 풀리지만, 429 는 분당 요청 한도라 1분 창이 지나야 한다.
// 같은 짧은 백오프로 재시도하면 3번 다 429 로 날리고 끝난다.
const BASE_BACKOFF_MS = 1500
const RATE_LIMIT_BACKOFF_MS = 20_000

function isRetryable(e: unknown): boolean {
  return e instanceof ProviderHttpError && RETRYABLE_STATUS.has(e.status)
}

function backoffFor(status: number, attempt: number): number {
  const base = status === 429 ? RATE_LIMIT_BACKOFF_MS : BASE_BACKOFF_MS
  return base * 2 ** (attempt - 1) + Math.floor(Math.random() * 500)
}

/**
 * 모델 하나에 대해 재시도까지 포함한 1회 호출.
 * 일시적 장애(429/5xx)는 지수 백오프로 최대 4회까지 재시도한다 —
 * 앵글 생성처럼 호출을 여러 건 병렬로 던지면 503 하나에 배치 전체가 죽기 때문.
 */
async function callWithRetry(
  label: string,
  model: string,
  run: () => Promise<string>,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = await run()
      if (!text) throw new Error('empty model output')
      return text
    } catch (e) {
      lastError = e
      if (attempt === MAX_ATTEMPTS || !isRetryable(e)) break
      // 지터를 섞어 동시 호출이 같은 시점에 몰려 재시도하는 것을 막는다.
      const status = (e as ProviderHttpError).status
      const wait = backoffFor(status, attempt)
      console.warn(
        `[analysis/llm] ${label} model=${model} ${status} — ${wait}ms 후 재시도 (${attempt}/${MAX_ATTEMPTS})`,
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
export type LlmCall = { text: string; model: string }

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

  if (provider === 'anthropic') {
    const text = await callWithRetry(label, ANTHROPIC_MODEL, () =>
      callAnthropic(systemPrompt, userPrompt),
    )
    console.log(`[analysis/llm] ${label} provider=anthropic model=${ANTHROPIC_MODEL}`)
    return { text, model: ANTHROPIC_MODEL }
  }

  const chain = geminiModelChain()
  const tried: string[] = []
  for (const model of chain) {
    tried.push(model)
    try {
      const text = await callWithRetry(label, model, () => callGemini(model, systemPrompt, userPrompt))
      console.log(`[analysis/llm] ${label} provider=gemini model=${model}`)
      return { text, model }
    } catch (e) {
      if (!shouldFallOverToNextModel(e)) throw e
      const status = (e as ProviderHttpError).status
      console.warn(
        `[analysis/llm] ${label} model=${model} ${status} — 이 모델은 사용 불가로 보고 다음 모델로 전환`,
      )
    }
  }
  throw new AllGeminiModelsExhaustedError(tried)
}

/** 모델명이 필요 없는 호출부를 위한 얇은 래퍼. */
export async function callLlm(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  label = 'llm',
): Promise<string> {
  return (await callLlmWithModel(provider, systemPrompt, userPrompt, label)).text
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
): Promise<{ data: Record<string, unknown>; model: string }> {
  const first = await callLlmWithModel(provider, systemPrompt, userPrompt, label)
  try {
    return { data: parseJsonObject(first.text), model: first.model }
  } catch {
    console.warn(
      `[analysis/llm] ${label}: JSON 파싱 실패 — 원문 앞 300자: ${JSON.stringify(first.text.slice(0, 300))}`,
    )
    const retry = await callLlmWithModel(
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

/** 모델명이 필요 없는 호출부를 위한 얇은 래퍼. */
export async function callLlmJson(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  label = 'llm',
): Promise<Record<string, unknown>> {
  return (await callLlmJsonWithModel(provider, systemPrompt, userPrompt, label)).data
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
