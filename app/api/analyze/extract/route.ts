import { createClient } from '@/lib/supabase/server'
import { NextResponse, after } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  ASPECT_LAYERS,
  ATTRIBUTIONS,
  PAIN_TIMINGS,
  PERSONA_ROLES,
  VALUE_REALIZATION_FREQUENCIES,
  type AspectLayer,
  type Attribution,
  type PainTiming,
  type PersonaRole,
  type ValueRealizationFrequency,
} from '@/lib/analysis/types'

// 응답은 202 로 즉시 나가지만, after() 안의 추출 작업은 같은 인스턴스에서
// 계속 돌기 때문에 함수 실행시간 상한이 그대로 적용된다. 긴 입력을 감당하려면
// 여유가 필요하므로 Fluid compute 상한까지 올린다.
export const maxDuration = 300

// ── LLM 프로바이더 전환 ──────────────────────────────────────────
// LLM_PROVIDER=gemini (기본) | anthropic
// 시스템 프롬프트·기대 JSON 스키마·파싱 로직은 두 프로바이더가 완전히 공유한다.
// 프로바이더별로 다른 것은 "호출 방식과 텍스트를 꺼내는 방법" 뿐이다.
type LlmProvider = 'gemini' | 'anthropic'

const DEFAULT_PROVIDER: LlmProvider = 'gemini'

function resolveProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'anthropic') return 'anthropic'
  if (raw === 'gemini') return 'gemini'
  return DEFAULT_PROVIDER
}

const ANTHROPIC_MODEL = 'claude-opus-5'
// gemini-2.5-flash 는 신규 사용자에게 404(no longer available) 를 돌려준다.
// alias(gemini-flash-latest) 대신 버전 고정 모델을 쓴다.
const GEMINI_MODEL = 'gemini-3.6-flash'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'

const MAX_OUTPUT_TOKENS = 32000

// 컨텍스트 폭주 방지: 입력 1건당 / 전체 합계 상한
const MAX_CHARS_PER_INPUT = 8000
const MAX_CHARS_TOTAL = 120000

// ── Stage1(VOC 마이닝) + Stage2(시장 성숙도 진단) 지시문 ──────────
const SYSTEM_PROMPT = `너는 이커머스 소구점 발굴 파이프라인의 Stage1(VOC 마이닝)+Stage2(시장 성숙도 진단)를
수행한다. 입력은 리뷰/광고 원문 여러 개다.

Stage1 — 각 텍스트에서 반복되는 속성(aspect)을 추출해라. 각 aspect마다:
- aspect_layer: PRODUCT(제품 물성) / PROCESS(구매·사용 프로세스) / OUTCOME(사용 결과·정체성) 중 하나
- importance(0~10): 이 속성이 얼마나 자주·강하게 언급되는가
- satisfaction(0~10): 현재 얼마나 충족되고 있는가 (불만이 많으면 낮게)
- attribution: PRODUCT_FAULT(제품 탓) / USER_FAULT(사용자 탓으로 서술됨) / ENVIRONMENT 중 하나.
  해당 속성이 불만·페인이 아니라 단순 만족·칭찬(만족도가 중요도보다 높거나 비슷한 경우)이면
  attribution은 반드시 null로 남겨라. PRODUCT_FAULT/USER_FAULT/ENVIRONMENT는 실제로
  부정적 경험을 서술하는 속성에만 붙인다.
- pain_timing: PRE_PURCHASE(구매 전에도 알 수 있음) / POST_PURCHASE(구매 후에만 알게 됨)
- persona_role: 이 텍스트를 쓴 사람이 BUYER/USER/PAYER/INFLUENCER 중 누구인지
  (아기·반려동물 등 대리소비면 proxy_consumption=true)
- is_segmentation_axis: 같은 속성에 대해 극찬과 혐오가 동시에 존재하면 true
- value_realization_frequency: 이 카테고리의 핵심 편익이 자주 실현되는지(HIGH),
  가끔인지(MEDIUM), 드물게(보험처럼 사고 나야만, LOW)인지

"많이 언급되는 것"과 "중요한 것"을 구분해라 — 다들 만족하는 속성(예: 기본 품질)은
importance는 높아도 satisfaction도 높게 나오는 게 정상이다. 실제 페인/불만이
뚜렷한 속성일수록 satisfaction을 낮게 매겨라.

안전성·부작용·금기·주의사항과 관련된 언급(예: 특정 상황에서 신중해야 한다,
초기 부작용, 기저질환 관련 경고 등)이 원문에 있으면, 다른 속성 점수가 낮게
나오더라도 반드시 별도 속성으로 추출해라 — 이건 나중에 법적·안전 검토에 쓰이는
중요한 신호라 빈도가 낮아도 누락하면 안 된다.

Stage2 — 전체 텍스트를 보고:
- maturity_stage(1~5): 1=시장창출(직접편익 위주, 주장 겹침 거의 없음),
  2=주장확장, 3=고유 메커니즘 등장, 4=메커니즘 정제(주장 겹침 높음),
  5=정체성·재창출(스펙 경쟁 소진, 부작용·유지보수 이야기 위주)
- m_meta_signal: "요즘은 다 비슷하다", "환승했다", "~보다 낫다" 같이
  카테고리 전체를 비교하는 소비자 발화가 있으면 true

반드시 JSON만 출력해라. 형식:
{ "maturity_stage": 1-5, "maturity_notes": "판단 근거 한 줄",
  "m_meta_signal": true/false,
  "aspects": [{ "name": "...", "aspect_layer": "...", "importance": 0-10,
    "satisfaction": 0-10, "attribution": "...", "pain_timing": "...",
    "persona_role": "...", "proxy_consumption": true/false,
    "is_segmentation_axis": true/false, "value_realization_frequency": "...",
    "notes": "이 속성 판단 근거 한 줄" }] }`

// ── 파싱 헬퍼 ────────────────────────────────────────────────────
/** 코드블록/앞뒤 잡텍스트를 방어하며 JSON 객체를 추출한다. */
function parseJsonObject(raw: string): Record<string, unknown> {
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

/** 허용된 enum 값이면 그대로, 아니면 null (DB CHECK 위반 방지) */
function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

/** 0~10 범위 숫자로 정규화. 숫자가 아니면 null */
function pickScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(10, Math.max(0, n))
}

function pickBool(value: unknown): boolean {
  return value === true
}

function pickText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t ? t : null
}

// ── 프로바이더별 호출 ────────────────────────────────────────────
// 두 함수 모두 "모델이 낸 원문 텍스트" 하나만 돌려준다. 이후 파싱은 공유한다.

/** 모델이 요청 자체를 거부했을 때. 502가 아니라 사용자 메시지로 안내한다. */
class ModelRefusalError extends Error {}

/** 프로바이더가 HTTP 에러를 돌려줬을 때. 402/429(사용량 한도)를 구분하기 위해 상태코드를 보존한다. */
class ProviderHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
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
    // SDK 에러의 status 를 보존해 402/429(사용량 한도)를 구분할 수 있게 한다.
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
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        // JSON 모드 — Anthropic 쪽과 동일한 스키마를 그대로 받는다.
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
    // MAX_TOKENS 등 — JSON 이 잘렸을 수 있으므로 파싱 실패 원인 추적용으로 남긴다.
    console.warn('[analyze/extract] gemini finishReason:', candidate.finishReason)
  }

  // thought 파트(사고 과정)는 본문이 아니므로 제외한다.
  return (candidate?.content?.parts ?? [])
    .filter(p => p?.thought !== true && typeof p?.text === 'string')
    .map(p => p.text as string)
    .join('')
    .trim()
}

// ── 잡 상태 전이 규칙 ────────────────────────────────────────────
// processing 이 이 시간보다 오래 방치되면 죽은 잡으로 보고 재시도를 허용한다.
// (Vercel 함수가 중간에 죽으면 status 가 processing 에 영구히 갇히기 때문)
const STALE_AFTER_MS = 10 * 60 * 1000

/** 지금 추출을 새로 시작할 수 있는 상태인지 판정한다. */
function canStart(status: string, startedAt: string | null): { ok: true } | { ok: false; reason: string } {
  if (status === 'collecting' || status === 'failed') return { ok: true }
  if (status === 'processing') {
    const t = startedAt ? Date.parse(startedAt) : NaN
    if (Number.isFinite(t) && Date.now() - t > STALE_AFTER_MS) return { ok: true } // stale 복구
    return { ok: false, reason: '이미 분석이 진행 중입니다.' }
  }
  return { ok: false, reason: '이미 분석이 끝난 프로젝트입니다.' }
}

/** 프로바이더가 돌려준 HTTP 상태로 사용자 문구를 고른다. */
function describeFailure(e: unknown): string {
  if (e instanceof ModelRefusalError) return '분석이 거부되었습니다. 입력 내용을 확인해주세요.'
  if (e instanceof ProviderHttpError && (e.status === 402 || e.status === 429)) {
    return `사용량 한도를 초과했습니다. (HTTP ${e.status})`
  }
  return e instanceof Error ? e.message : String(e)
}

// ── 백그라운드 추출 본체 ─────────────────────────────────────────
// after() 안에서 응답 전송 후에 실행된다. 여기서 던지는 예외는 사용자에게
// 전달되지 않으므로, 모든 실패를 status='failed' + extract_error 로 남긴다.
async function runExtraction(projectId: string, provider: LlmProvider) {
  const supabase = await createClient()
  if (!supabase) {
    console.error('[analyze/extract] background: DB 연결 실패')
    return
  }

  const startedAt = Date.now()

  const fail = async (message: string) => {
    console.error(`[analyze/extract] project=${projectId} failed: ${message}`)
    await supabase
      .from('analysis_projects')
      .update({
        status: 'failed',
        extract_error: message.slice(0, 1000),
        extract_finished_at: new Date().toISOString(),
      })
      .eq('id', projectId)
  }

  // 1. 프롬프트 재료 조회
  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, competitor_url, product_elevator_pitch, purpose, seller_own_guess')
    .eq('id', projectId)
    .single()

  if (projectError || !project) return fail('프로젝트를 찾을 수 없습니다.')

  const { data: inputs, error: inputsError } = await supabase
    .from('analysis_inputs')
    .select('source_type, raw_text, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (inputsError) return fail(`수집 원문 조회 실패: ${inputsError.message}`)
  if (!inputs || inputs.length === 0) return fail('수집 원문이 1개 이상 필요합니다.')

  // 2. 사용자 프롬프트 구성 (총량 상한을 넘기면 뒤쪽 입력은 자른다)
  const parts: string[] = []
  let used = 0
  let truncatedInputs = 0
  for (let i = 0; i < inputs.length; i++) {
    const text = String(inputs[i].raw_text ?? '').slice(0, MAX_CHARS_PER_INPUT)
    if (used + text.length > MAX_CHARS_TOTAL) {
      truncatedInputs = inputs.length - i
      break
    }
    used += text.length
    parts.push(`### 입력 ${i + 1} (source_type: ${inputs[i].source_type})\n${text}`)
  }

  const userPrompt = [
    `## 분석 대상`,
    `- 경쟁사 상품 URL: ${project.competitor_url}`,
    `- 내 상품 한 줄 소개: ${project.product_elevator_pitch}`,
    `- 분석 목적(purpose): ${project.purpose}`,
    project.seller_own_guess
      ? `- 판매자 본인이 생각하는 소구점(가설, 편향 주의): ${project.seller_own_guess}`
      : `- 판매자 본인 가설: (없음)`,
    '',
    `## 수집 원문 ${parts.length}건`,
    ...parts,
    '',
    '위 원문들을 바탕으로 Stage1과 Stage2를 수행하고, 지정된 JSON 형식 하나만 출력해라.',
  ].join('\n')

  // 3. 모델 호출 (프로바이더별로 분기, 이후 처리는 동일)
  let rawText = ''
  try {
    rawText =
      provider === 'gemini'
        ? await callGemini(SYSTEM_PROMPT, userPrompt)
        : await callAnthropic(SYSTEM_PROMPT, userPrompt)
    if (!rawText) throw new Error('empty model output')
    console.log(
      `[analyze/extract] project=${projectId} provider=${provider} took ${Date.now() - startedAt}ms`,
    )
  } catch (e) {
    return fail(describeFailure(e))
  }

  // 4. JSON 파싱
  let parsed: Record<string, unknown>
  try {
    parsed = parseJsonObject(rawText)
  } catch (e) {
    return fail(`분석 결과를 해석하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
  }

  const rawStage = Number(parsed.maturity_stage)
  const maturityStage =
    Number.isFinite(rawStage) && rawStage >= 1 && rawStage <= 5 ? Math.round(rawStage) : null

  const rawAspects = Array.isArray(parsed.aspects) ? parsed.aspects : []

  // 5. aspects 정규화
  // opportunity_score 는 DB generated 컬럼이므로 절대 payload 에 넣지 않는다.
  const aspectRows = rawAspects
    .map(item => {
      const a = (item ?? {}) as Record<string, unknown>
      const name = pickText(a.name)
      if (!name) return null
      return {
        project_id: projectId,
        name,
        aspect_layer: pickEnum<AspectLayer>(a.aspect_layer, ASPECT_LAYERS),
        importance: pickScore(a.importance),
        satisfaction: pickScore(a.satisfaction),
        attribution: pickEnum<Attribution>(a.attribution, ATTRIBUTIONS),
        pain_timing: pickEnum<PainTiming>(a.pain_timing, PAIN_TIMINGS),
        persona_role: pickEnum<PersonaRole>(a.persona_role, PERSONA_ROLES),
        proxy_consumption: pickBool(a.proxy_consumption),
        is_segmentation_axis: pickBool(a.is_segmentation_axis),
        value_realization_frequency: pickEnum<ValueRealizationFrequency>(
          a.value_realization_frequency,
          VALUE_REALIZATION_FREQUENCIES,
        ),
        human_confirmed: false, // 사람 검수 전
        notes: pickText(a.notes),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // 6. 기존 aspects 제거 후 새로 저장 (재시도 시 중복 누적 방지)
  //    analysis_angles.aspect_id 는 ON DELETE 절이 없어 angle 이 달린 aspect 는
  //    삭제가 막힌다(23503). 그 경우 사용자가 원인을 알 수 있게 명시한다.
  const { error: deleteError } = await supabase
    .from('analysis_aspects')
    .delete()
    .eq('project_id', projectId)

  if (deleteError) {
    return fail(
      deleteError.code === '23503'
        ? '이미 소구 앵글이 생성된 속성이 있어 재분석할 수 없습니다. 앵글을 먼저 삭제해주세요.'
        : `기존 속성 삭제에 실패했습니다: ${deleteError.message}`,
    )
  }

  if (aspectRows.length > 0) {
    const { error: aspectError } = await supabase.from('analysis_aspects').insert(aspectRows)
    if (aspectError) return fail(`속성 저장에 실패했습니다: ${aspectError.message}`)
  }

  // 7. Stage2 결과 + 완료 상태 기록
  const { error: updateError } = await supabase
    .from('analysis_projects')
    .update({
      maturity_stage: maturityStage,
      maturity_notes: pickText(parsed.maturity_notes),
      m_meta_signal: pickBool(parsed.m_meta_signal),
      status: 'extracted',
      extract_error: null,
      extract_finished_at: new Date().toISOString(),
    })
    .eq('id', projectId)

  if (updateError) return fail(`프로젝트 갱신에 실패했습니다: ${updateError.message}`)

  console.log(
    `[analyze/extract] project=${projectId} extracted aspects=${aspectRows.length} inputs=${parts.length}` +
      (truncatedInputs > 0 ? ` skipped=${truncatedInputs}` : ''),
  )
}

// ── POST: 잡 시작만 하고 즉시 반환 ───────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const provider = resolveProvider()
  const requiredKey = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'
  if (!process.env[requiredKey]) {
    console.error(`[analyze/extract] ${requiredKey} is not set (provider=${provider})`)
    return NextResponse.json({ error: '분석 엔진이 설정되지 않았습니다.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  // 1. 현재 상태 조회
  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, status, extract_started_at, extract_attempts')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    console.error('[analyze/extract] project fetch error:', projectError?.message)
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 2. 시작 가능 상태인지 판정 (stale processing 은 재시도 허용)
  const verdict = canStart(project.status, project.extract_started_at)
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason, status: project.status }, { status: 409 })
  }

  // 3. 원문이 있는지 먼저 확인 — 없으면 잡을 만들지 않는다
  const { count, error: countError } = await supabase
    .from('analysis_inputs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (countError) {
    console.error('[analyze/extract] inputs count error:', countError.message)
    return NextResponse.json({ error: '수집 원문 조회 실패' }, { status: 500 })
  }
  if (!count || count === 0) {
    return NextResponse.json({ error: '수집 원문이 1개 이상 필요합니다.' }, { status: 400 })
  }

  // 4. 조건부 UPDATE 로 락 획득.
  //    .eq('status', 조회 시점 상태) 가 낙관적 락이다 — 그 사이 다른 요청이
  //    상태를 바꿨다면 0행이 돌아오고, 여기서 409 로 끊는다.
  const { data: locked, error: lockError } = await supabase
    .from('analysis_projects')
    .update({
      status: 'processing',
      extract_started_at: new Date().toISOString(),
      extract_finished_at: null,
      extract_error: null,
      extract_attempts: (project.extract_attempts ?? 0) + 1,
    })
    .eq('id', projectId)
    .eq('status', project.status)
    .select('id, status, extract_started_at, extract_attempts')

  if (lockError) {
    console.error('[analyze/extract] lock update error:', lockError.message)
    return NextResponse.json({ error: '분석 시작에 실패했습니다.' }, { status: 500 })
  }
  if (!locked || locked.length === 0) {
    return NextResponse.json({ error: '이미 분석이 진행 중입니다.' }, { status: 409 })
  }

  // 5. 응답을 먼저 보내고, 실제 추출은 그 뒤에 이어서 실행한다.
  after(() => runExtraction(projectId, provider))

  return NextResponse.json(
    {
      status: 'processing',
      project_id: projectId,
      provider,
      started_at: locked[0].extract_started_at,
      attempts: locked[0].extract_attempts,
    },
    { status: 202 },
  )
}

// ── GET: 폴링용 상태 조회 ────────────────────────────────────────
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const { data: project, error } = await supabase
    .from('analysis_projects')
    .select('id, status, maturity_stage, extract_started_at, extract_finished_at, extract_error, extract_attempts')
    .eq('id', projectId)
    .single()

  if (error || !project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (project.status === 'processing') {
    const t = project.extract_started_at ? Date.parse(project.extract_started_at) : NaN
    return NextResponse.json({
      status: 'processing',
      started_at: project.extract_started_at,
      elapsed_ms: Number.isFinite(t) ? Date.now() - t : null,
      attempts: project.extract_attempts,
    })
  }

  if (project.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      error: project.extract_error ?? '알 수 없는 오류로 실패했습니다.',
      attempts: project.extract_attempts,
    })
  }

  // extracted 이후 단계(reviewed 등)도 완료로 본다.
  const { count } = await supabase
    .from('analysis_aspects')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  return NextResponse.json({
    status: project.status,
    aspects_count: count ?? 0,
    maturity_stage: project.maturity_stage,
    finished_at: project.extract_finished_at,
  })
}
