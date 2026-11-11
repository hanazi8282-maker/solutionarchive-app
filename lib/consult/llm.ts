// 컨설팅 LLM 호출 한 곳 — 모델 태그(opus 본문·메모 / sonnet 조사·대화·검수 / haiku 추출·라벨)와 llm_usage 기록을 여기서 강제한다.
// 경로(우회 사유 로그): ① ANTHROPIC_API_KEY 있으면 Anthropic SDK 직접 ② 없으면 기존 claude-cli(구독 OAuth, 같은 회사 모델) ③ 둘 다 없거나 CONSULT_LLM=mock 이면 mock.
//   2026-11-11 실측: Vercel 환경에 ANTHROPIC_API_KEY 없음 → ②로 동작. 키를 넣으면 코드 수정 없이 ①로 바뀐다.
import Anthropic from '@anthropic-ai/sdk'
import { callLlmWithModel, parseJsonObject, type LlmProvider } from '@/lib/analysis/llm.ts'
import { recordUsage, type ModelTag, type Purpose } from './usage'

const MODEL: Record<Exclude<ModelTag, 'mock'>, string> = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
}

export type ConsultLlmOpts = {
  runId?: string | null
  owner?: string | null
  purpose: Purpose
  tag: Exclude<ModelTag, 'mock'>
  system: string
  user: string
  maxTokens?: number
  /** 테스트용 강제 mock 응답(있으면 호출 없이 이 텍스트를 돌려주고 mock 으로 기록). */
  mockText?: string
}

export function activePath(): 'anthropic' | 'claude-cli' | 'mock' {
  if ((process.env.CONSULT_LLM ?? '').toLowerCase() === 'mock') return 'mock'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return 'claude-cli'
  return 'mock'
}

const approxTokens = (s: string) => Math.ceil(s.length / 3)

export async function consultLlm(o: ConsultLlmOpts): Promise<{ text: string; model: string; costUsd: number; path: string }> {
  const path = o.mockText !== undefined ? 'mock' : activePath()
  let text = ''
  let model = 'mock'
  let inTok = approxTokens(o.system + o.user)
  let outTok = 0
  let override: number | null = null
  let tag: ModelTag = o.tag

  if (path === 'anthropic') {
    model = MODEL[o.tag]
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages
      .stream({ model, max_tokens: o.maxTokens ?? 4000, system: o.system, messages: [{ role: 'user', content: o.user }] })
      .finalMessage()
    if (msg.stop_reason === 'refusal') throw new Error('모델이 응답을 거절했습니다')
    text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
    inTok = msg.usage.input_tokens
    outTok = msg.usage.output_tokens
  } else if (path === 'claude-cli') {
    const r = await callLlmWithModel('claude-cli' satisfies LlmProvider, o.system, o.user, `consult:${o.purpose}`)
    text = r.text
    model = r.model
    outTok = approxTokens(text)
    override = r.costUsd ?? null
    tag = 'sonnet' // CLI 는 기본 Sonnet 5.5 로 고정(lib/analysis/llm.ts CLAUDE_CLI_DEFAULT_MODEL) — 요청 태그와 다를 수 있다
  } else {
    text = o.mockText ?? '{}'
    outTok = approxTokens(text)
    tag = 'mock'
  }

  const cost = await recordUsage({
    runId: o.runId, ownerEmail: o.owner, purpose: o.purpose, model, tag,
    inputTokens: inTok, outputTokens: outTok, costOverride: override,
    meta: { path, requested_tag: o.tag },
  })
  return { text, model, costUsd: cost, path }
}

/** JSON 객체 응답 — 코드펜스·앞뒤 설명을 걷어 파싱한다. 파싱 실패는 던진다(빈 객체로 접지 않는다). */
export async function consultLlmJson(o: ConsultLlmOpts): Promise<{ data: Record<string, unknown>; model: string; costUsd: number; path: string }> {
  const r = await consultLlm(o)
  return { data: parseJsonObject(r.text), model: r.model, costUsd: r.costUsd, path: r.path }
}
