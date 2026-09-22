// Stage1(VOC 마이닝) + Stage2(시장 성숙도 진단) 추출 본체 — 라우트와 CLI 가 같은 한 벌을 쓴다.
//
// ★ 2026-09-20: `app/api/analyze/extract/route.ts` 안에 있던 것을 그대로 옮겼다(동작 불변).
//   옮긴 이유: 로그인 벽(Google 허용목록 fail-closed) 뒤에 있는 라우트를 사람이 세션 없이
//   부를 방법이 없어서, 운영자가 "이 프로젝트 추출 돌려" 를 할 자리가 없었다.
//   `scripts/analyze-extract-run.mjs` 가 이 파일을 import 해 같은 잠금·같은 프롬프트로 돈다.
//   프롬프트·정규화·저장 규칙은 여기 한 곳만 고친다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(CLI). `@/` 별칭·파라미터 프로퍼티·enum 을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  callLlmWithModel,
  describeFailure,
  isQuotaFailure,
  parseJsonObject,
  type LlmProvider,
} from './llm.ts'
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
} from './types.ts'
import { REANALYZABLE, canStart } from './extract-gate.ts'
import { MAX_CHARS_PER_INPUT, MAX_CHARS_TOTAL, selectInputs } from './extract-select.ts'
import { judgeProjectRemedies } from '../cases/remedy-db.ts'
import { normalizeEvidenceQuotes } from './evidence-quotes.ts'

// 컨텍스트 폭주 방지 상한과 입력 선별(T1)은 lib/analysis/extract-select.ts 한 벌이다.
export { MAX_CHARS_PER_INPUT, MAX_CHARS_TOTAL }

// ── Stage1(VOC 마이닝) + Stage2(시장 성숙도 진단) 지시문 ──────────
export const SYSTEM_PROMPT = `너는 이커머스 소구점 발굴 파이프라인의 Stage1(VOC 마이닝)+Stage2(시장 성숙도 진단)를
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
- evidence_quotes: 이 속성을 그렇게 판단하게 만든 **입력 원문의 문장 1~3개**.
  ★ 입력 원문에 있는 문장만, 한 글자도 바꾸지 말고 그대로 옮겨라. 요약·다듬기·합치기 금지.
  원문에 마땅한 문장이 없으면 지어내지 말고 빈 배열 [] 로 둬라.

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
    "evidence_quotes": ["원문 그대로 1~3문장"],
    "notes": "이 속성 판단 근거 한 줄" }] }`

// ── 파싱 헬퍼 ────────────────────────────────────────────────────
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

// 잡 상태 전이 규칙(canStart / REANALYZABLE)은 lib/analysis/extract-gate.ts 한 벌이다.
// 검수 화면의 "분석 시작" 버튼이 같은 판정을 써야 버튼과 서버가 갈라지지 않는다.

// ── 잡 시작(잠금) ─────────────────────────────────────────────────
//
// 라우트 POST 의 1~4단계. HTTP 상태는 여기서 정하지 않고 `httpStatus` 로 돌려준다 —
// CLI 는 그 숫자를 종료코드 사유로만 쓴다.

export type ClaimResult =
  | {
      ok: true
      isReanalysis: boolean
      startedAt: string | null
      attempts: number | null
      inputCount: number
    }
  | { ok: false; httpStatus: 400 | 404 | 409 | 500; error: string; projectStatus?: string | null }

export async function claimExtraction(
  supabase: SupabaseClient,
  projectId: string,
  force: boolean,
): Promise<ClaimResult> {
  // 1. 현재 상태 조회
  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, status, extract_started_at, extract_attempts')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    console.error('[analyze/extract] project fetch error:', projectError?.message)
    return { ok: false, httpStatus: 404, error: '프로젝트를 찾을 수 없습니다.' }
  }

  // 2. 시작 가능 상태인지 판정 (stale processing 은 재시도 허용, force 면 재분석 허용)
  const verdict = canStart(project.status, project.extract_started_at, force)
  if (!verdict.ok) {
    return { ok: false, httpStatus: 409, error: verdict.reason, projectStatus: project.status }
  }
  const isReanalysis = force && REANALYZABLE.includes(project.status)

  // 3. 원문이 있는지 먼저 확인 — 없으면 잡을 만들지 않는다
  const { count, error: countError } = await supabase
    .from('analysis_inputs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (countError) {
    console.error('[analyze/extract] inputs count error:', countError.message)
    return { ok: false, httpStatus: 500, error: '수집 원문 조회 실패' }
  }
  if (!count || count === 0) {
    return { ok: false, httpStatus: 400, error: '수집 원문이 1개 이상 필요합니다.' }
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
    return { ok: false, httpStatus: 500, error: '분석 시작에 실패했습니다.' }
  }
  if (!locked || locked.length === 0) {
    return { ok: false, httpStatus: 409, error: '이미 분석이 진행 중입니다.' }
  }

  return {
    ok: true,
    isReanalysis,
    startedAt: locked[0].extract_started_at ?? null,
    attempts: locked[0].extract_attempts ?? null,
    inputCount: count,
  }
}

// ── 추출 본체 ─────────────────────────────────────────────────────
// 라우트에서는 after() 안에서 응답 전송 후에 실행된다. 여기서 던지는 예외는 사용자에게
// 전달되지 않으므로, 모든 실패를 status='failed' + extract_error 로 남긴다.
// 돌려주는 값은 CLI 가 종료코드·로그에 쓴다(라우트는 무시한다).

export type ExtractionOutcome =
  | { ok: true; aspects: number; inputs: number; droppedInputs: number; model: string }
  // quotaExhausted = 오늘 다시 불러도 같은 결과(한도·예산 소진). 배치 호출부는 여기서 멈춘다.
  | { ok: false; error: string; quotaExhausted: boolean }

export async function runExtraction(
  supabase: SupabaseClient,
  projectId: string,
  provider: LlmProvider,
): Promise<ExtractionOutcome> {
  const startedAt = Date.now()

  const fail = async (message: string, quotaExhausted = false): Promise<ExtractionOutcome> => {
    console.error(`[analyze/extract] project=${projectId} failed: ${message}`)
    await supabase
      .from('analysis_projects')
      .update({
        status: 'failed',
        extract_error: message.slice(0, 1000),
        extract_finished_at: new Date().toISOString(),
      })
      .eq('id', projectId)
    return { ok: false, error: message, quotaExhausted }
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
    .select('source_type, raw_text, created_at, collected_at')
    .eq('project_id', projectId)
    // 폐기된 원문(raw_text=null)은 선별에도 인용 대조에도 쓸 게 없다.
    .is('purged_at', null)
    .order('created_at', { ascending: true })

  if (inputsError) return fail(`수집 원문 조회 실패: ${inputsError.message}`)
  if (!inputs || inputs.length === 0) return fail('수집 원문이 1개 이상 필요합니다.')

  // 2. 사용자 프롬프트 구성 — 총량 상한 안에서 **점수 상위**를 담는다(T1, extract-select.ts).
  //    오래된 순으로 채우면 수천 건 중 가장 오래된 무관 댓글만 읽고 끝난다.
  const selection = selectInputs(inputs, {
    maxCharsTotal: MAX_CHARS_TOTAL,
    maxCharsPerInput: MAX_CHARS_PER_INPUT,
  })
  const parts = selection.selected.map(
    (s, i) => `### 입력 ${i + 1} (source_type: ${s.input.source_type})\n${s.text}`,
  )
  const droppedInputs = selection.droppedInputs

  const userPrompt = [
    `## 분석 대상`,
    // competitor_url 은 선택이다(2026-09-23). null 을 그대로 끼우면 프롬프트에
    // 문자열 "null" 이 들어가 모델이 그걸 대상으로 읽는다.
    `- 경쟁사 상품 URL: ${project.competitor_url ?? '(없음 — 경쟁사 없이 수집 원문만으로 분석한다)'}`,
    `- 내 상품 한 줄 소개: ${project.product_elevator_pitch}`,
    `- 분석 목적(purpose): ${project.purpose}`,
    project.seller_own_guess
      ? `- 판매자 본인이 생각하는 소구점(가설, 편향 주의): ${project.seller_own_guess}`
      : `- 판매자 본인 가설: (없음)`,
    '',
    `## 수집 원문 ${parts.length}건 (수집 ${inputs.length}건 중 관련도 상위)`,
    ...parts,
    '',
    '위 원문들을 바탕으로 Stage1과 Stage2를 수행하고, 지정된 JSON 형식 하나만 출력해라.',
  ].join('\n')

  // 3. 모델 호출 (프로바이더 분기·재시도·모델 폴백은 llm.ts 가 처리한다)
  let rawText = ''
  let model = ''
  try {
    // 이 결과를 어느 모델이 만들었는지 남긴다. 폴백으로 모델이 바뀌면
    // 같은 입력에도 결과가 달라지는데, 이 로그가 없으면 사후에 가릴 방법이 없다.
    const call = await callLlmWithModel(provider, SYSTEM_PROMPT, userPrompt, 'extract')
    rawText = call.text
    model = call.model
    console.log(
      `[analyze/extract] project=${projectId} provider=${provider} model=${call.model} took ${Date.now() - startedAt}ms`,
    )
  } catch (e) {
    // 한도·예산 소진이면 오늘 다시 불러도 같다 — 야간 배치가 다음 프로젝트로 넘어가지 않게 알린다.
    return fail(describeFailure(e), isQuotaFailure(e))
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

      // 정규화는 한 번만 하고 실제 컬럼과 llm_* 에 같은 값을 넣는다.
      // pickEnum/pickScore 를 두 번 부르면 나중에 한쪽 인자만 바뀌었을 때
      // 원본과 실제값이 조용히 어긋난다 — 그 순간 diff 는 거짓말을 시작한다.
      const aspectLayer = pickEnum<AspectLayer>(a.aspect_layer, ASPECT_LAYERS)
      const importance = pickScore(a.importance)
      const satisfaction = pickScore(a.satisfaction)
      const attribution = pickEnum<Attribution>(a.attribution, ATTRIBUTIONS)
      const painTiming = pickEnum<PainTiming>(a.pain_timing, PAIN_TIMINGS)
      const personaRole = pickEnum<PersonaRole>(a.persona_role, PERSONA_ROLES)
      const proxyConsumption = pickBool(a.proxy_consumption)
      const isSegmentationAxis = pickBool(a.is_segmentation_axis)

      return {
        project_id: projectId,
        name,
        aspect_layer: aspectLayer,
        importance,
        satisfaction,
        attribution,
        pain_timing: painTiming,
        persona_role: personaRole,
        proxy_consumption: proxyConsumption,
        is_segmentation_axis: isSegmentationAxis,
        value_realization_frequency: pickEnum<ValueRealizationFrequency>(
          a.value_realization_frequency,
          VALUE_REALIZATION_FREQUENCIES,
        ),
        human_confirmed: false, // 사람 검수 전
        notes: pickText(a.notes),

        // 원문 인용 — 저장 전에 **입력 원문에 실제로 있는지** 확인하고 통과한 것만 넣는다.
        // 대조 대상은 (프롬프트에 실린 잘린 본문이 아니라) 수집 원문 전체다 — 상한에 걸려 잘린
        // 뒤쪽에서 인용했더라도 그건 지어낸 게 아니다. lib/analysis/evidence-quotes.ts
        evidence_quotes: normalizeEvidenceQuotes(a.evidence_quotes, inputs),

        // ── LLM 원본 스냅샷 ──────────────────────────────────────
        // 검수 PUT 은 이 컬럼들을 payload 에 넣지 않으므로, 사람이 위쪽 실제
        // 컬럼을 고쳐도 여기 값은 추출 당시 그대로 남는다. 이 쌍이 교정 diff 다.
        llm_aspect_layer: aspectLayer,
        llm_importance: importance,
        llm_satisfaction: satisfaction,
        llm_attribution: attribution,
        llm_pain_timing: painTiming,
        llm_persona_role: personaRole,
        llm_proxy_consumption: proxyConsumption,
        llm_is_segmentation_axis: isSegmentationAxis,
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

  // 8. 처방 카드 관련성 판정을 미리 돌려 캐시한다(lib/cases/remedy-db.ts).
  //    결과 화면이 LLM 을 기다리지 않게 하려는 것이고, **실패해도 추출은 성공이다** —
  //    판정이 없으면 카드가 "미검증" 으로 나갈 뿐 사라지지 않는다(§7.1). 여기서 던지면
  //    멀쩡히 끝난 추출이 failed 로 뒤집힌다.
  try {
    const judged = await judgeProjectRemedies(supabase, projectId)
    console.log(
      `[analyze/extract] project=${projectId} remedy-judge ${judged.status} 속성=${judged.aspects.length} 적립=${judged.upserted}` +
        (judged.reason ? ` (${judged.reason})` : ''),
    )
  } catch (e) {
    console.error('[analyze/extract] remedy-judge failed (추출은 정상):', e instanceof Error ? e.message : String(e))
  }

  // dropped 는 "읽지 않은 원문 수"다. 0 과 구분해 남겨야 "속성 0개"가 추출 실패인지
  // 선별이 다 버린 결과인지 사후에 가릴 수 있다(§7.1).
  console.log(
    `[analyze/extract] project=${projectId} extracted aspects=${aspectRows.length} inputs=${parts.length}/${inputs.length}` +
      ` dropped=${droppedInputs} chars=${selection.usedChars}`,
  )
  return { ok: true, aspects: aspectRows.length, inputs: parts.length, droppedInputs, model }
}
