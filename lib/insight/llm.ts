// 인사이트 추출용 LLM 호출 계층 — 프로바이더 3종을 한 인터페이스 뒤에 둔다.
//
// ⚠️ 왜 프로바이더를 분리했는가:
//
//   설계안 §0.5 는 "Claude Pro 구독 헤드리스 실행으로 API 과금 없이"를
//   전제로 한다. 그 전제 중 바이너리 확보·실행까지는 Vercel 에서 실측
//   확인됐지만(docs/insight-loop-setup.md), OAuth 토큰으로 실제 추론이
//   되는지는 토큰 등록 전까지 검증할 수 없었다.
//
//   전제가 깨졌을 때 파이프라인 전체를 다시 쓰지 않으려고 seam 을 둔다.
//   claude-cli 가 안 되면 환경변수 하나로 anthropic 으로 넘어가고,
//   나머지 6단계는 한 줄도 안 고친다.
//
//   mock 은 이 레포가 이미 쓰던 관행이다(LLM_PROVIDER=mock — analyze
//   파이프라인의 검증 방식과 같다). 네트워크·과금·토큰 없이 전 단계를
//   돌릴 수 있어야 셀프테스트와 dry-run 이 의미를 가진다.
//
// 선택: INSIGHT_LLM_PROVIDER = claude-cli(기본) | anthropic | mock

import { resolveClaudeBinary, runClaude } from './claude-cli.ts'

export type InsightProvider = 'claude-cli' | 'anthropic' | 'mock'

export function activeProvider(): InsightProvider {
  const raw = (process.env.INSIGHT_LLM_PROVIDER ?? 'claude-cli').trim()
  if (raw === 'anthropic' || raw === 'mock' || raw === 'claude-cli') return raw
  // 오타를 조용히 기본값으로 흡수하면 "왜 과금이 되지"를 나중에 추적하게 된다.
  throw new Error(`INSIGHT_LLM_PROVIDER 값이 올바르지 않다: ${raw}`)
}

export interface ExtractionInput {
  rawText: string
  sourceUrl?: string | null
  userNote?: string | null
  /**
   * 이미 쓰이고 있는 pattern_key 목록. 없으면 빈 배열처럼 취급한다.
   *
   * ⚠️ 이게 없으면 파이프라인이 조용히 고장난다. patternize 는 pattern_key
   *    를 **완전 문자열 일치**로 누적하는데(loop.ts), 모델이 글 하나만 보고
   *    자유롭게 slug 를 지으면 같은 구조도 매번 다른 표현이 된다. 근거가
   *    2건에서 발급되는 가설이 영영 안 나오고, 에러는 하나도 안 난다.
   *    실측 근거: docs/review-collection-design.md §13.9 / §13.11.
   */
  knownKeys?: string[]
}

export interface ExtractionResult {
  insight_type: 'actionable' | 'reframe' | 'transferable_frame'
  extracted_insight: string
  extracted_pattern: string
  why_it_works: string
  is_generalizable: boolean
  /** 같은 패턴이 같은 key 로 수렴해야 근거가 누적된다. 코드에서 정규화한다. */
  pattern_key: string
  pattern_title: string
}

const INSIGHT_TYPES = ['actionable', 'reframe', 'transferable_frame'] as const

/**
 * pattern_key 정규화.
 *
 * LLM 에게 자유롭게 key 를 만들게 두면 같은 패턴이 매번 다른 문자열로 나와
 * evidence_count 가 1 에서 안 올라간다. 그러면 근거가 아무리 쌓여도 가이드에
 * 영영 반영되지 않는다 — 에러 없이 루프만 멈추는 형태다.
 */
export function normalizePatternKey(raw: string): string {
  const slug = (raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return slug || 'unnamed-pattern'
}

function buildPrompt(input: ExtractionInput): string {
  const note = input.userNote?.trim()
  const known = (input.knownKeys ?? []).filter(Boolean)

  // 키 재사용 지시. 목록이 비면 이 블록 자체를 넣지 않는다 — 빈 목록을
  // 보여주면 "고를 게 없다"가 아니라 "아무거나 만들라"로 읽힌다.
  const reuseBlock = known.length
    ? [
        '',
        '이미 쓰이고 있는 pattern_key 목록이다:',
        ...known.map((k) => `- ${k}`),
        '',
        '판정은 **두 축이 모두 같을 때만** 같은 패턴이다:',
        '  (1) 전개 순서 — 무엇을 먼저 던지고 어떤 순서로 뒤집는가',
        '  (2) 마무리 형태 — 열린 질문 / 단언 / 미해결 예고 / 행동 지시 중 무엇으로 닫는가',
        '',
        '둘 다 같으면 표현을 바꾸지 말고 그 key 를 문자 그대로 다시 써라.',
        '같은 구조를 다른 말로 적으면 근거가 나뉘어 아무것도 축적되지 않는다.',
        '훅 문장이 다르다는 이유만으로 새 key 를 만들지 마라.',
        '',
        '**하나라도 다르면 반드시 새 key 를 만든다.** 특히 마무리 형태가 다르면',
        '전개가 비슷해도 다른 패턴이다 — 닫는 방식이 독자 행동을 가른다.',
        '목록이 짧다는 이유로 억지로 끼워 맞추지 마라. 없으면 새로 만드는 것이',
        '정상이고, 틀리게 뭉친 근거는 없는 근거보다 나쁘다.',
        'key 이름에 마무리 형태를 드러내면 나중에 잘못 뭉친 것을 발견하기 쉽다.',
      ]
    : []

  return [
    '아래는 사용자가 "인사이트가 있다"고 판단해 저장한 Threads 글이다.',
    '이 글이 왜 좋은 글인지 구조적으로 분석하라.',
    ...reuseBlock,
    '',
    '판정 기준 3종 중 하나로 insight_type 을 정한다:',
    '- actionable: 읽고 바로 행동을 바꿀 수 있는 구체적 지침',
    '- reframe: 이미 아는 사실을 다른 각도로 보게 만드는 재정의',
    '- transferable_frame: 다른 주제에도 그대로 옮겨 쓸 수 있는 사고 틀',
    '',
    '다음 JSON 만 출력하라. 코드펜스·설명·서론 없이 JSON 객체 하나만.',
    '{',
    '  "insight_type": "actionable|reframe|transferable_frame",',
    '  "extracted_insight": "이 글의 핵심 인사이트 한 문장",',
    '  "pattern_title": "이 글이 쓴 구조적 장치의 이름 (10자 내외)",',
    '  "pattern_key": "영문 소문자 하이픈 slug (예: confession-then-data)",',
    '  "extracted_pattern": "훅 방식·전개 순서·마무리 형태를 구체적으로 기술",',
    '  "why_it_works": "왜 그 장치가 효과적인지 1~2문장",',
    '  "is_generalizable": true 또는 false',
    '}',
    '',
    'is_generalizable 은 이 패턴이 다른 소재에도 재사용 가능한 규칙일 때만 true 다.',
    '이 글 하나에만 해당하는 우연이면 false 로 하고, 그 경우 가설을 만들지 않는다.',
    '판단이 애매하면 false 로 한다 — 틀린 규칙이 가이드에 들어가는 비용이',
    '맞는 규칙을 한 번 놓치는 비용보다 훨씬 크다.',
    '',
    input.sourceUrl ? `원문 링크: ${input.sourceUrl}` : '',
    note ? `사용자가 남긴 메모(직관): ${note}` : '',
    '',
    '--- 원문 시작 ---',
    input.rawText,
    '--- 원문 끝 ---',
  ]
    .filter(Boolean)
    .join('\n')
}

/** 코드펜스·서론이 섞여 나와도 JSON 객체 하나를 건져낸다. */
export function extractJsonObject(text: string): unknown {
  const trimmed = (text ?? '').trim()
  if (!trimmed) throw new Error('LLM 응답이 비었다')

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    // 앞뒤에 설명이 붙은 경우 중괄호 블록만 잘라낸다.
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`JSON 을 찾지 못했다: ${candidate.slice(0, 200)}`)
    }
    return JSON.parse(candidate.slice(start, end + 1))
  }
}

/** 필드 누락·타입 오류를 여기서 잡는다. 통과한 값만 DB 로 간다. */
export function validateExtraction(raw: unknown): ExtractionResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('추출 결과가 객체가 아니다')
  }
  const o = raw as Record<string, unknown>

  const insightType = String(o.insight_type ?? '').trim()
  if (!(INSIGHT_TYPES as readonly string[]).includes(insightType)) {
    throw new Error(`insight_type 이 올바르지 않다: ${insightType}`)
  }

  const str = (key: string, max: number): string => {
    const v = o[key]
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${key} 누락`)
    return v.trim().slice(0, max)
  }

  // is_generalizable 은 문자열 "false" 로 오는 경우가 잦다. 명시적으로 다룬다 —
  // Boolean("false") 는 true 라서 조용히 반대로 저장된다.
  const rawGen = o.is_generalizable
  const isGeneralizable =
    typeof rawGen === 'boolean'
      ? rawGen
      : typeof rawGen === 'string'
        ? rawGen.trim().toLowerCase() === 'true'
        : false

  const title = str('pattern_title', 80)

  return {
    insight_type: insightType as ExtractionResult['insight_type'],
    extracted_insight: str('extracted_insight', 500),
    extracted_pattern: str('extracted_pattern', 1000),
    why_it_works: str('why_it_works', 500),
    is_generalizable: isGeneralizable,
    pattern_title: title,
    pattern_key: normalizePatternKey(
      typeof o.pattern_key === 'string' && o.pattern_key.trim() ? o.pattern_key : title,
    ),
  }
}

/** mock — 네트워크·과금 없이 전 단계를 돌리기 위한 결정적 응답. */
function mockExtraction(input: ExtractionInput): ExtractionResult {
  const text = input.rawText ?? ''
  // 입력에 따라 결과가 갈리게 해서 셀프테스트가 분기를 실제로 밟게 한다.
  const generalizable = text.length >= 40
  return {
    insight_type: text.includes('?') ? 'reframe' : 'actionable',
    extracted_insight: `mock: ${text.slice(0, 60)}`,
    extracted_pattern: 'mock 패턴 — 고백형 훅 뒤에 수치를 붙이고 열린 질문으로 닫는다',
    why_it_works: 'mock 근거',
    is_generalizable: generalizable,
    pattern_title: 'mock 패턴',
    pattern_key: normalizePatternKey('mock-pattern'),
  }
}

async function claudeCliExtraction(input: ExtractionInput): Promise<ExtractionResult> {
  const bin = await resolveClaudeBinary()
  const res = await runClaude(
    bin.path,
    [
      '-p',
      buildPrompt(input),
      '--output-format',
      'json',
      // 도구를 쓸 일이 없다. 상한을 1 로 둬야 사용량이 예측 가능하다.
      '--max-turns',
      '1',
    ],
    { timeoutMs: 120_000 },
  )

  if (res.exitCode !== 0) {
    throw new Error(
      `claude -p 실패 (exit ${res.exitCode}${res.timedOut ? ', timeout' : ''}): ` +
        res.stderr.slice(0, 500),
    )
  }

  // --output-format json 은 봉투를 씌운다. 봉투의 result 안에 본문이 있다.
  let payload = res.stdout
  try {
    const envelope = JSON.parse(res.stdout) as Record<string, unknown>
    if (typeof envelope.result === 'string') payload = envelope.result
    if (envelope.is_error === true) {
      throw new Error(`claude 가 오류를 보고했다: ${String(envelope.result ?? '').slice(0, 300)}`)
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('claude 가 오류를')) throw e
    // 봉투 파싱 실패는 치명적이지 않다 — 본문이 그대로 온 경우다.
  }

  return validateExtraction(extractJsonObject(payload))
}

async function anthropicExtraction(input: ExtractionInput): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('INSIGHT_LLM_PROVIDER=anthropic 인데 ANTHROPIC_API_KEY 가 없다')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const msg = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  })

  const text = msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n')

  return validateExtraction(extractJsonObject(text))
}

/** 저장 글 1건을 분석한다. 실패는 던진다 — 호출부가 행 단위로 격리한다. */
export async function extractInsight(input: ExtractionInput): Promise<ExtractionResult> {
  if (!input.rawText || !input.rawText.trim()) {
    throw new Error('원문(raw_text)이 비어 분석할 수 없다')
  }

  switch (activeProvider()) {
    case 'mock':
      return mockExtraction(input)
    case 'anthropic':
      return anthropicExtraction(input)
    case 'claude-cli':
    default:
      return claudeCliExtraction(input)
  }
}
