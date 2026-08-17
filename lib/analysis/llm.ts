// 소구점 파이프라인 공용 LLM 호출 레이어.
// extract(Stage1~2) 와 angle(Stage4) 이 같은 프로바이더 스위치를 공유한다.
// LLM_PROVIDER=gemini (기본) | anthropic
// 프로바이더별로 다른 것은 "호출 방식과 텍스트를 꺼내는 방법" 뿐이고,
// 프롬프트·기대 JSON 스키마·파싱은 호출부가 그대로 공유한다.
import Anthropic from '@anthropic-ai/sdk'

export type LlmProvider = 'gemini' | 'anthropic'

const DEFAULT_PROVIDER: LlmProvider = 'gemini'

export function resolveProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'anthropic') return 'anthropic'
  if (raw === 'gemini') return 'gemini'
  return DEFAULT_PROVIDER
}

export function requiredKeyFor(provider: LlmProvider): 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY' {
  return provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'
}

const ANTHROPIC_MODEL = 'claude-opus-5'
// gemini-2.5-flash 는 신규 사용자에게 404(no longer available) 를 돌려준다.
// alias(gemini-flash-latest) 대신 버전 고정 모델을 쓴다.
// 모델별로 무료 티어 일일 요청 한도가 따로 걸린다(gemini-3.6-flash 는 20건/일).
// 한도가 소진되면 모델만 바꿔 우회할 수 있어야 하므로 환경변수로 뺀다.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash'
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

/** 프로바이더가 돌려준 HTTP 상태로 사용자 문구를 고른다. */
export function describeFailure(e: unknown): string {
  if (e instanceof ModelRefusalError) return '분석이 거부되었습니다. 입력 내용을 확인해주세요.'
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

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY as string
  const url = `${GEMINI_BASE_URL}/v1beta/models/${GEMINI_MODEL}:generateContent`

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
    throw new ProviderHttpError(res.status, `gemini ${res.status}: ${detail.slice(0, 500)}`)
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
    console.warn('[analysis/llm] gemini finishReason:', candidate.finishReason)
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
 * 프로바이더에 무관하게 "모델이 낸 원문 텍스트" 하나를 돌려준다.
 * 일시적 장애(429/5xx)는 지수 백오프로 최대 3회까지 재시도한다 —
 * 앵글 생성처럼 호출을 여러 건 병렬로 던지면 503 하나에 배치 전체가 죽기 때문.
 */
export async function callLlm(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = provider === 'gemini'
        ? await callGemini(systemPrompt, userPrompt)
        : await callAnthropic(systemPrompt, userPrompt)
      if (!text) throw new Error('empty model output')
      return text
    } catch (e) {
      lastError = e
      if (attempt === MAX_ATTEMPTS || !isRetryable(e)) break
      // 지터를 섞어 동시 호출이 같은 시점에 몰려 재시도하는 것을 막는다.
      const status = (e as ProviderHttpError).status
      const wait = backoffFor(status, attempt)
      console.warn(
        `[analysis/llm] ${status} — ${wait}ms 후 재시도 (${attempt}/${MAX_ATTEMPTS})`,
      )
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw lastError
}

/**
 * JSON 응답을 기대하는 호출. 모델이 간혹 설명문을 섞어 JSON 파싱이 깨지는데,
 * 그때 원문을 로그에 남기고 "JSON 만 출력하라"고 한 번 더 요청한다.
 * (원문을 남기지 않으면 실패 원인을 추적할 방법이 없다)
 */
export async function callLlmJson(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  label = 'llm',
): Promise<Record<string, unknown>> {
  const raw = await callLlm(provider, systemPrompt, userPrompt)
  try {
    return parseJsonObject(raw)
  } catch {
    console.warn(
      `[analysis/llm] ${label}: JSON 파싱 실패 — 원문 앞 300자: ${JSON.stringify(raw.slice(0, 300))}`,
    )
    const retryRaw = await callLlm(
      provider,
      systemPrompt,
      `${userPrompt}\n\n(직전 응답이 JSON 형식이 아니었다. 어떤 설명도 붙이지 말고 지정된 JSON 객체 하나만 출력해라.)`,
    )
    try {
      return parseJsonObject(retryRaw)
    } catch {
      throw new Error(
        `${label}: 모델 응답을 JSON 으로 해석하지 못했습니다. 원문 앞 200자: ${retryRaw.slice(0, 200)}`,
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
